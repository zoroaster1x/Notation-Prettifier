/*
 * Notation Prettifier, an Obsidian plugin that renders rough math notation as
 * LaTeX in the editor and reading view and can bake the LaTeX into the note.
 *
 * Copyright (C) 2026 Zoroaster1x
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later
 * version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program. If not, see <https://www.gnu.org/licenses/>.
 */

// The conversion engine. It is pure JavaScript: no DOM, no Obsidian, so the
// tests can read documents outside the app and pin the exact output.
//
// A document is split into protected regions (frontmatter, code, math, links)
// and free text. Free text is tokenized. A run of math-looking tokens becomes
// a formula span only when it earns it:
//
//   - it holds a relation (a = b, a -> b, a >= b with operands on both sides)
//   - or a prime or script on a symbol-like base (L', F_0, n^(i), x^2)
//
// Ordinary words never start a span and never qualify one. Once a relation is
// inside the span, a word welded to a neighbouring math token extends it
// (dxF in (1-dxF), DS in +5.00DS), which is what the real notes need and what
// keeps file names and prose out. Rules then turn the span into LaTeX and the
// caller either renders it or writes $...$ around it.

import { UNIT_WORDS, escapeRegExp } from "./rules.js";

const SPACE = /[ \t]+/y;
const NEWLINE = /\n/y;
const LATEX_GROUP = /\\[A-Za-z]+\{[^{}]*\}(?:\{[^{}]*\})?/y;
const COMMAND = /\\[A-Za-z]+/y;
const SCRIPT = /[\^_]\{[^{}]{0,80}\}/y;
const SUPERSCRIPT = /[\u00b2\u00b3\u00b9\u2070\u2074-\u2079\u2080-\u2089]/y;
const VULGAR = /[\u00bd\u00bc\u00be\u2153\u2154\u215b\u215c\u215d\u215e]/y;
const NUMBER = /(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?(?:[eE][-+]?\d+)?|\.\d+)/y;
const WORD = /[A-Za-z]+/y;
const GREEK_CHAR = /[\u00b5\u03bc\u0370-\u03ff\u1f00-\u1fff]/y;
const OP2 = /(?:<=>|<->|->|<-|=>|<=|>=|!=|~=|\+-|-+|\/\/)/y;
const OP1 = /[=+\-<>±×·⋅→←↔⇒⇐⇔≤≥≠≈÷°%^_\u2212\u2013\u2014\u2261\u2264\u2265\u2260\u00b1\u2213\/]/y;
const APOS = /['\u2019\u2032]/y;
const OPEN = /[([{]/y;
const CLOSE = /[)\]}]/y;
const COMMA = /,/y;
const SENTENCE = /[.;:!?]/y;
const WIKILINK = /!?\[\[[^\]\n]*\]\]/y;
const MDLINK = /\[[^\]\n]*\]\([^)\n]*\)/y;
const FOOTREF = /\[\^[^\]\n]*\]/y;
const URL = /https?:\/\/[^\s)]+/y;
const ANY = /[\s\S]/y;

const UNIT_SET = new Set(UNIT_WORDS);
const OPERAND_TYPES = new Set(["letter", "number", "command", "mathword", "script", "unit"]);

// A relation that qualifies a span on its own.
const QUALIFY_OPS = new Set([
  "=", "\u2192", "\u2190", "\u2194", "\u21d2", "\u21d0", "\u21d4",
  "->", "<-", "<->", "=>", "<=>",
]);
// A comparison qualifies when the span holds an operand on both sides.
const COMPARE_OPS = new Set([
  "<", ">", "\u2264", "\u2265", "\u2260", "\u2248", "\u2261", "\u00b1",
  "\u2213", "<=", ">=", "!=", "+-", "-+", "=<",
]);
const SCRIPT_OPS = new Set(["^", "_"]);
const START_OPS = new Set([
  "=", "<", ">", "\u2264", "\u2265", "\u2260", "\u2248", "\u00b1", "\u00d7",
  "\u00b7", "\u22c5", "\u2192", "\u2190", "\u2194", "\u21d2", "\u21d0",
  "\u21d4", "\u00f7", "+", "-",
]);
const TRAILING_KEEP = new Set(["\u00b0", "%"]);

function tryMatch(regex, text, index, to) {
  regex.lastIndex = index;
  const match = regex.exec(text);
  if (!match || match.index !== index) return null;
  const end = index + match[0].length;
  if (end > to) return null;
  return { value: match[0], to: end };
}

function token(type, value, from, to) {
  return { type, value, from, to };
}

export function splitLines(text) {
  const lines = [];
  let i = 0;
  while (i <= text.length) {
    const nl = text.indexOf("\n", i);
    const to = nl === -1 ? text.length : nl;
    lines.push({ from: i, to });
    if (nl === -1) break;
    i = nl + 1;
  }
  return lines;
}

export function mergeRanges(ranges) {
  const sorted = ranges.slice().sort((a, b) => a.from - b.from || a.to - b.to);
  const out = [];
  for (const range of sorted) {
    const last = out[out.length - 1];
    if (last && range.from <= last.to) {
      if (range.to > last.to) last.to = range.to;
    } else {
      out.push({ from: range.from, to: range.to });
    }
  }
  return out;
}

function firstRangeTouching(ranges, pos) {
  let lo = 0;
  let hi = ranges.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ranges[mid].to <= pos) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function rangeAt(ranges, pos) {
  const index = firstRangeTouching(ranges, pos) - 1;
  if (index < 0) return null;
  const range = ranges[index];
  return range.from <= pos && pos < range.to ? range : null;
}

export function freeGaps(from, to, ranges) {
  const gaps = [];
  let p = from;
  for (let i = firstRangeTouching(ranges, from); i < ranges.length; i++) {
    const range = ranges[i];
    if (range.from >= to) break;
    if (range.from > p) gaps.push({ from: p, to: Math.min(range.from, to) });
    if (range.to > p) p = range.to;
    if (p >= to) break;
  }
  if (p < to) gaps.push({ from: p, to });
  return gaps;
}

function scanLineInline(text, from, to, pre, found) {
  let i = from;
  let ri = firstRangeTouching(pre, from);
  while (i < to) {
    while (ri < pre.length && pre[ri].to <= i) ri++;
    const blocked = ri < pre.length && pre[ri].from <= i && i < pre[ri].to ? pre[ri] : null;
    if (blocked) {
      i = blocked.to;
      continue;
    }
    const ch = text[i];
    if (ch === "`") {
      let run = 1;
      while (text[i + run] === "`") run++;
      const marker = "`".repeat(run);
      const close = text.indexOf(marker, i + run);
      if (close !== -1 && close + run <= to) {
        found.push({ from: i, to: close + run });
        i = close + run;
        continue;
      }
      i += run;
      continue;
    }
    if (ch === "$") {
      if (text[i + 1] === "$") {
        i += 2;
        continue;
      }
      let j = i + 1;
      let close = -1;
      while (j < to) {
        if (text[j] === "\\") {
          j += 2;
          continue;
        }
        if (text[j] === "$") {
          close = j;
          break;
        }
        j++;
      }
      if (close !== -1) {
        found.push({ from: i, to: close + 1 });
        i = close + 1;
        continue;
      }
      i++;
      continue;
    }
    let link = null;
    if (ch === "!" || ch === "[") {
      link = tryMatch(WIKILINK, text, i, to) || tryMatch(FOOTREF, text, i, to) || tryMatch(MDLINK, text, i, to);
    } else if (ch === "h") {
      link = tryMatch(URL, text, i, to);
    }
    if (link) {
      found.push({ from: i, to: link.to });
      i = link.to;
      continue;
    }
    i++;
  }
}

// The position from which math may render, starting at pos: if pos sits inside
// a fenced code block, a display math block or the YAML frontmatter, that block
// has to end first. The live layer scans forward from pos with this, so it can
// work on a window around the viewport instead of the whole document.
export function openBlockAt(doc, pos) {
  const length = doc.length;
  const lineAt = (from) => {
    const nl = docLineEnd(doc, from);
    return { text: doc.sliceString(from, nl), to: nl };
  };
  const fenceAt = (line) => {
    const match = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(line.text);
    return match ? { char: match[1][0], len: match[1].length } : null;
  };

  if (pos < 0) pos = 0;
  if (pos > length) pos = length;

  const first = lineAt(0);
  if (/^---[ \t]*$/.test(first.text)) {
    let k = first.to + 1;
    while (k <= length) {
      const line = lineAt(k);
      if (/^(---|\.\.\.)[ \t]*$/.test(line.text)) {
        const end = line.to;
        if (pos < end) return end;
        break;
      }
      if (line.to >= length) break;
      k = line.to + 1;
    }
  }

  let i = 0;
  let inFence = false;
  let fenceChar = "";
  let fenceLen = 0;
  let dollars = 0;
  while (i < pos && i < length) {
    const line = lineAt(i);
    const fence = fenceAt(line);
    if (inFence) {
      if (fence && fence.char === fenceChar && fence.len >= fenceLen) inFence = false;
    } else if (fence) {
      inFence = true;
      fenceChar = fence.char;
      fenceLen = fence.len;
    } else {
      for (let at = line.text.indexOf("$$"); at !== -1; at = line.text.indexOf("$$", at + 2)) dollars++;
    }
    if (line.to >= length) break;
    i = line.to + 1;
  }

  if (inFence) {
    let k = pos;
    while (k < length) {
      const line = lineAt(k);
      const fence = fenceAt(line);
      if (fence && fence.char === fenceChar && fence.len >= fenceLen) return line.to;
      if (line.to >= length) break;
      k = line.to + 1;
    }
    return length;
  }

  if (dollars % 2 === 1) {
    const close = docSliceIndexOf(doc, "$$", pos);
    return close === -1 ? length : close + 2;
  }

  return pos;
}

function docLineEnd(doc, from) {
  const text = doc.sliceString(from, Math.min(doc.length, from + 4096));
  const nl = text.indexOf("\n");
  return nl === -1 ? Math.min(doc.length, from + text.length) : from + nl;
}

function docSliceIndexOf(doc, needle, from) {
  let i = from;
  const chunkSize = 65536;
  while (i < doc.length) {
    const chunk = doc.sliceString(i, Math.min(doc.length, i + chunkSize));
    const at = chunk.indexOf(needle);
    if (at !== -1) return i + at;
    if (chunk.length < needle.length) return -1;
    i += chunk.length - needle.length + 1;
  }
  return -1;
}

// Everything the converter must not touch: frontmatter, fenced code, inline
// code, $ and $$ math, wikilinks, markdown links, bare URLs and footnote refs.
export function protectedRanges(text) {
  const ranges = [];
  const lines = splitLines(text);

  let firstContentLine = 0;
  if (lines.length && /^---[ \t]*$/.test(text.slice(lines[0].from, lines[0].to))) {
    for (let k = 1; k < lines.length; k++) {
      const lineText = text.slice(lines[k].from, lines[k].to);
      if (/^(---|\.\.\.)[ \t]*$/.test(lineText)) {
        ranges.push({ from: 0, to: lines[k].to });
        firstContentLine = k + 1;
        break;
      }
    }
  }

  const inFence = new Array(lines.length).fill(false);
  let fenceStart = -1;
  let fenceChar = "";
  let fenceLen = 0;
  for (let k = firstContentLine; k < lines.length; k++) {
    const lineText = text.slice(lines[k].from, lines[k].to);
    const match = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(lineText);
    if (fenceStart >= 0) {
      inFence[k] = true;
      if (match && match[1][0] === fenceChar && match[1].length >= fenceLen) {
        ranges.push({ from: lines[fenceStart].from, to: lines[k].to });
        fenceStart = -1;
      }
      continue;
    }
    if (match) {
      fenceStart = k;
      fenceChar = match[1][0];
      fenceLen = match[1].length;
      inFence[k] = true;
    }
  }
  if (fenceStart >= 0) ranges.push({ from: lines[fenceStart].from, to: text.length });

  // A line of only dashes or stars is a thematic break and a line of only
  // equals signs is a setext heading marker. A markdown table separator row is
  // pipes and dashes. The -- and === shortcuts must not turn any of them into
  // punctuation.
  for (let k = 0; k < lines.length; k++) {
    if (inFence[k]) continue;
    const lineText = text.slice(lines[k].from, lines[k].to);
    const thematicBreak =
      /^[ \t]{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(lineText) || /^[ \t]{0,3}=+[ \t]*$/.test(lineText);
    const tableSeparator = /^[ \t]*[|:\- \t]+$/.test(lineText) && lineText.indexOf("--") !== -1;
    if (thematicBreak || tableSeparator) {
      ranges.push({ from: lines[k].from, to: lines[k].to });
    }
  }

  const pre = mergeRanges(ranges);
  const display = /(?<!\\)\$\$/g;
  let block;
  while ((block = display.exec(text))) {
    const from = block.index;
    if (rangeAt(pre, from)) continue;
    const close = text.indexOf("$$", from + 2);
    if (close === -1) {
      ranges.push({ from, to: text.length });
      break;
    }
    ranges.push({ from, to: close + 2 });
    display.lastIndex = close + 2;
  }

  const beforeInline = mergeRanges(ranges);
  const found = [];
  for (let k = 0; k < lines.length; k++) {
    if (inFence[k]) continue;
    scanLineInline(text, lines[k].from, lines[k].to, beforeInline, found);
  }
  return mergeRanges(ranges.concat(found));
}

function classifyWord(word, mathWords) {
  if (word.length === 1) return "letter";
  if (UNIT_SET.has(word)) return "unit";
  if (mathWords && mathWords.has(word)) return "mathword";
  return "word";
}

function tokenize(text, from, to, mathWords, shortcutToken) {
  const tokens = [];
  let i = from;
  while (i < to) {
    let match;
    if (shortcutToken) {
      shortcutToken.lastIndex = i;
      const shortcut = shortcutToken.exec(text);
      if (shortcut && shortcut.index === i && i + shortcut[0].length <= to) {
        tokens.push(token("unit", shortcut[0], i, i + shortcut[0].length));
        i += shortcut[0].length;
        continue;
      }
    }
    if ((match = tryMatch(SPACE, text, i, to))) {
      i = match.to;
      continue;
    }
    if ((match = tryMatch(NEWLINE, text, i, to))) {
      tokens.push(token("term", "\n", i, match.to));
      i = match.to;
      continue;
    }
    if ((match = tryMatch(LATEX_GROUP, text, i, to))) {
      tokens.push(token("command", match.value, i, match.to));
      i = match.to;
      continue;
    }
    if ((match = tryMatch(COMMAND, text, i, to))) {
      tokens.push(token("command", match.value, i, match.to));
      i = match.to;
      continue;
    }
    if ((match = tryMatch(SCRIPT, text, i, to))) {
      tokens.push(token("script", match.value, i, match.to));
      i = match.to;
      continue;
    }
    if ((match = tryMatch(SUPERSCRIPT, text, i, to))) {
      tokens.push(token("script", match.value, i, match.to));
      i = match.to;
      continue;
    }
    if ((match = tryMatch(VULGAR, text, i, to))) {
      tokens.push(token("number", match.value, i, match.to));
      i = match.to;
      continue;
    }
    if ((match = tryMatch(NUMBER, text, i, to))) {
      tokens.push(token("number", match.value, i, match.to));
      i = match.to;
      continue;
    }
    if ((match = tryMatch(WORD, text, i, to))) {
      tokens.push(token(classifyWord(match.value, mathWords), match.value, i, match.to));
      i = match.to;
      continue;
    }
    if ((match = tryMatch(GREEK_CHAR, text, i, to))) {
      tokens.push(token("letter", match.value, i, match.to));
      i = match.to;
      continue;
    }
    if ((match = tryMatch(OP2, text, i, to))) {
      tokens.push(token("op", match.value, i, match.to));
      i = match.to;
      continue;
    }
    if ((match = tryMatch(OP1, text, i, to))) {
      tokens.push(token("op", match.value, i, match.to));
      i = match.to;
      continue;
    }
    if ((match = tryMatch(APOS, text, i, to))) {
      tokens.push(token("apostrophe", match.value, i, match.to));
      i = match.to;
      continue;
    }
    if ((match = tryMatch(OPEN, text, i, to))) {
      tokens.push(token("open", match.value, i, match.to));
      i = match.to;
      continue;
    }
    if ((match = tryMatch(CLOSE, text, i, to))) {
      tokens.push(token("close", match.value, i, match.to));
      i = match.to;
      continue;
    }
    if ((match = tryMatch(COMMA, text, i, to))) {
      tokens.push(token("term", ",", i, match.to));
      i = match.to;
      continue;
    }
    if ((match = tryMatch(SENTENCE, text, i, to))) {
      tokens.push(token("term", match.value, i, match.to));
      i = match.to;
      continue;
    }
    match = tryMatch(ANY, text, i, to);
    tokens.push(token("term", match.value, i, match.to));
    i = match.to;
  }
  return tokens;
}

function isMathToken(t) {
  return OPERAND_TYPES.has(t.type) || t.type === "op";
}

// A token that can carry a subscript or a superscript: a single letter, a
// number, an already scripted symbol, or a lowercase variable-like word such
// as dxF, dxL or dF. Units, ordinary words and all-caps abbreviations are not
// script bases, so mm^2, AB_12CD_34 and Course_A_16 stay plain text.
function isSymbolToken(t) {
  if (!t) return false;
  if (t.type === "letter" || t.type === "number" || t.type === "script") return true;
  if (t.type !== "word") return false;
  return /^[a-z]{1,3}[A-Z]?$/.test(t.value);
}

// A word may only be welded into a formula it did not start when it is short:
// dxF in (1-dxF), DS in +5.00DS, hf in ΔE=hf. "sphere" and "equivalent" stay
// prose even when an arrow or a plus sign sits next to them.
const MAX_ATTACHED_WORD = 3;

function matchParen(tokens, openIndex) {
  let depth = 0;
  for (let j = openIndex; j < tokens.length; j++) {
    if (tokens[j].type === "open") depth++;
    else if (tokens[j].type === "close") {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

function parenIsMath(tokens, openIndex, closeIndex) {
  const inner = tokens.slice(openIndex + 1, closeIndex);
  if (!inner.length) return false;
  let hasOperand = false;
  for (let j = 0; j < inner.length; j++) {
    const t = inner[j];
    if (OPERAND_TYPES.has(t.type)) hasOperand = true;
    if (t.type !== "word") continue;
    // A word inside brackets is math only when it is welded to a neighbouring
    // math token: "dxL" in (1-dxL) is, "Power" in (Power) is not.
    const prev = j > 0 ? inner[j - 1] : tokens[openIndex];
    const next = j < inner.length - 1 ? inner[j + 1] : tokens[closeIndex];
    const attached =
      (prev && prev.to === t.from && isMathToken(prev)) ||
      (next && next.from === t.to && isMathToken(next));
    if (!attached) return false;
  }
  return hasOperand;
}

function isBullet(text, pos) {
  const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
  const before = text.slice(lineStart, pos).replace(/^[>\s]+/, "");
  if (before !== "") return false;
  const after = text[pos + 1];
  return after === undefined || after === " " || after === "\t";
}

// A formula cannot exist without one of these characters. A quick scan keeps
// pure prose out of the tokenizer, which is the hot path of the live layer.
const TRIGGER_SOURCE =
  "[=<>^_'\\\\±×·⋅→←↔⇒⇐⇔≤≥≠≈÷≡\u00b2\u00b3\u00b9\u2070\u2074-\u2079\u2080-\u2089]";
const TRIGGER = new RegExp(TRIGGER_SOURCE, "g");

function scanSegment(text, from, to, out, mathWords, shortcutToken) {
  TRIGGER.lastIndex = from;
  const trigger = TRIGGER.exec(text);
  if (!trigger || trigger.index >= to) return;
  const tokens = tokenize(text, from, to, mathWords, shortcutToken);
  let start = -1;
  let end = -1;
  let operands = [];
  let equals = [];
  let arrows = [];
  let compares = [];
  let commands = [];

  const flush = () => {
    if (start >= 0 && end >= start) {
      let last = end;
      while (last > start && tokens[last].type === "op" && !TRAILING_KEEP.has(tokens[last].value)) last--;
      const inSpan = (index) => index >= start && index <= last;
      const operandBefore = (index) => operands.some((o) => o >= start && o < index);
      const operandAfter = (index) => operands.some((o) => o > index && o <= last);
      const hasEquals = equals.some(inSpan) || commands.some(inSpan);
      const hasArrow = arrows.some((index) => inSpan(index) && operandBefore(index) && operandAfter(index));
      const hasCompare = compares.some((index) => inSpan(index) && operandBefore(index) && operandAfter(index));
      if (operands.length > 0 && (hasEquals || hasArrow || hasCompare) && tokens[last].to > tokens[start].from) {
        out.push({ from: tokens[start].from, to: tokens[last].to });
      }
    }
    start = -1;
    end = -1;
    operands = [];
    equals = [];
    arrows = [];
    compares = [];
    commands = [];
  };

  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    const prev = k > 0 ? tokens[k - 1] : null;
    const afterScript = Boolean(prev && prev.type === "op" && SCRIPT_OPS.has(prev.value) && prev.to === t.from);
    const base = afterScript && k > 1 ? tokens[k - 2] : null;
    const symbolBase = isSymbolToken(base);
    const hasRelation = equals.length + arrows.length + compares.length + commands.length > 0;

    if (t.type === "letter" || t.type === "number" || t.type === "unit" || t.type === "mathword") {
      if (start < 0) start = k;
      end = k;
      operands.push(k);
      if (afterScript && symbolBase) qualifyScript(arrows, compares, equals, k);
    } else if (t.type === "command") {
      if (start < 0) start = k;
      end = k;
      operands.push(k);
      commands.push(k);
    } else if (t.type === "script") {
      const scriptBase = isSymbolToken(prev) && prev.to === t.from;
      if (start < 0 && !scriptBase) {
        flush();
        continue;
      }
      if (start < 0) start = k - 1;
      end = k;
      operands.push(k);
      if (scriptBase) qualifyScript(arrows, compares, equals, k);
    } else if (t.type === "word") {
      if (afterScript) {
        const simple = /^[A-Za-z]{1,6}$/.test(t.value);
        const numberBase = base && base.type === "number";
        const allowed = simple && (symbolBase || hasRelation) && (!numberBase || t.value.length === 1);
        if (allowed) {
          if (start < 0) start = k - 2;
          end = k;
          operands.push(k);
          if (symbolBase) qualifyScript(arrows, compares, equals, k);
        } else {
          flush();
        }
      } else if (
        start >= 0 &&
        hasRelation &&
        t.value.length <= MAX_ATTACHED_WORD &&
        ((prev && prev.to === t.from && isMathToken(prev)) ||
          (k + 1 < tokens.length && tokens[k + 1].from === t.to && isMathToken(tokens[k + 1])))
      ) {
        end = k;
        operands.push(k);
      } else {
        flush();
      }
    } else if (t.type === "op") {
      if ((t.value === "-" || t.value === "+") && isBullet(text, t.from)) {
        flush();
        continue;
      }
      const scriptOp = SCRIPT_OPS.has(t.value);
      if (!scriptOp) {
        if (t.value === "=") equals.push(k);
        else if (QUALIFY_OPS.has(t.value)) arrows.push(k);
        else if (COMPARE_OPS.has(t.value)) compares.push(k);
      }
      if (start < 0) {
        if (scriptOp || !START_OPS.has(t.value)) {
          flush();
          continue;
        }
        start = k;
        if (t.value === "=" && prev && prev.to === t.from && prev.type === "word") {
          start = k - 1;
          operands.push(k - 1);
        }
      }
      end = k;
    } else if (t.type === "apostrophe") {
      if (afterScript) {
        if (symbolBase) {
          if (start < 0) start = k - 2;
          end = k;
          operands.push(k);
          qualifyScript(arrows, compares, equals, k);
        } else {
          flush();
        }
      } else {
        const primeBase = prev && prev.to === t.from && isSymbolToken(prev);
        if (primeBase) {
          if (start < 0) start = k - 1;
          end = k;
          operands.push(k);
          qualifyScript(arrows, compares, equals, k);
        } else if (start >= 0 && hasRelation) {
          end = k;
          operands.push(k);
        } else {
          flush();
        }
      }
    } else if (t.type === "open") {
      const close = matchParen(tokens, k);
      const prevIsScriptOp = Boolean(prev && prev.type === "op" && SCRIPT_OPS.has(prev.value) && prev.to === t.from);
      const scriptGroup = close > k && prevIsScriptOp && (symbolBase || hasRelation);
      if (close > k && (scriptGroup || parenIsMath(tokens, k, close))) {
        if (start < 0) start = k;
        end = close;
        operands.push(close);
        if (scriptGroup && symbolBase) qualifyScript(arrows, compares, equals, close);
        k = close;
      } else {
        flush();
      }
    } else {
      flush();
    }
    if (start >= 0 && tokens[end].to - tokens[start].from > 240) flush();
  }
  flush();
}

// A script on a symbol base makes the span a formula. The kind of relation it
// counts as is the caller's: a script is as good as an equals sign here.
function qualifyScript(arrows, compares, equals, index) {
  equals.push(index);
}

export function detectSpans(text, options = {}) {
  const mathWords = options.mathWords || new Set();
  const shortcutToken = options.shortcutToken || null;
  const prot = options.protected || protectedRanges(text);
  const out = [];
  let pos = 0;
  for (const range of prot) {
    if (range.from > pos) scanSegment(text, pos, range.from, out, mathWords, shortcutToken);
    if (range.to > pos) pos = range.to;
  }
  if (pos < text.length) scanSegment(text, pos, text.length, out, mathWords, shortcutToken);
  for (const span of out) span.raw = text.slice(span.from, span.to);
  return out;
}

export function applyRules(text, rules) {
  let out = text;
  for (const rule of rules) out = out.replace(rule.regex, rule.replacement);
  return out;
}

export function convertSpan(raw, rules) {
  const out = applyRules(raw, rules || []);
  // Two control words can end up welded together when the source had no space:
  // 16.67·tan becomes \cdottan, which TeX reads as one unknown command. The
  // known command names are matched explicitly and an ASCII letter after one
  // gets a space. Digits already end a control word in TeX, so they are left.
  return out.replace(GLUED_COMMAND, "$1 ");
}

const GLUED_COMMAND =
  /(\\(?:longrightarrow|longleftrightarrow|leftrightarrow|leftarrow|rightarrow|Leftrightarrow|Leftarrow|Rightarrow|arcsin|arccos|arctan|sinh|cosh|tanh|leq|geq|neq|equiv|times|cdot|div|sin|cos|tan|cot|sec|csc|log|ln|exp|pm|mp))(?=[A-Za-z])/g;

function overlaps(sorted, from, to) {
  const index = firstRangeTouching(sorted, from);
  const range = sorted[index];
  return Boolean(range && range.from < to);
}

export function detectShortcutMatches(text, options = {}) {
  const shortcuts = options.shortcuts || [];
  if (!shortcuts.length) return [];
  const prot = options.protected || [];
  const exclude = options.exclude || [];
  const out = [];
  for (const shortcut of shortcuts) {
    const regex = new RegExp(shortcut.regex.source, "g");
    let match;
    while ((match = regex.exec(text))) {
      const from = match.index;
      const to = from + match[0].length;
      if (!overlaps(prot, from, to) && !overlaps(exclude, from, to)) {
        out.push({ from, to, replacement: shortcut.replacement });
      }
      if (match[0].length === 0) regex.lastIndex++;
    }
  }
  out.sort((a, b) => a.from - b.from);
  const clean = [];
  let lastTo = -1;
  for (const match of out) {
    if (match.from >= lastTo) {
      clean.push(match);
      lastTo = match.to;
    }
  }
  return clean;
}

function applyShortcuts(text, shortcuts) {
  let out = text;
  for (const shortcut of shortcuts) {
    out = out.replace(shortcut.regex, () => shortcut.replacement);
  }
  return out;
}

export function candidateRegex(shortcuts) {
  const parts = [TRIGGER_SOURCE];
  for (const shortcut of shortcuts || []) {
    if (shortcut && shortcut.literal) parts.push(escapeRegExp(shortcut.literal));
  }
  return new RegExp(parts.join("|"));
}

// One line at a time, so the sync bake and the chunked async bake share every
// rule of the conversion. The state carries the output and the running count.
function makeBakeState(text, options) {
  return {
    text,
    rules: options.rules || [],
    shortcuts: options.shortcuts || [],
    mathWords: options.mathWords || new Set(),
    shortcutToken: options.shortcutToken || null,
    display: options.displayFormulaLines !== false,
    prot: options.protected || protectedRanges(text),
    result: "",
    count: 0,
    outCursor: 0,
  };
}

function bakeNextLine(state, line) {
  const text = state.text;
  state.result += text.slice(state.outCursor, line.from);
  state.outCursor = line.to;
  const rawLine = text.slice(line.from, line.to);
  if (!rawLine.trim()) {
    state.result += rawLine;
    return;
  }
  const gaps = freeGaps(line.from, line.to, state.prot);
  const pieces = gaps.map((gap) => {
    const seg = applyShortcuts(text.slice(gap.from, gap.to), state.shortcuts);
    return {
      gap,
      seg,
      spans: detectSpans(seg, { mathWords: state.mathWords, shortcutToken: state.shortcutToken, protected: [] }),
    };
  });
  const spanTotal = pieces.reduce((sum, piece) => sum + piece.spans.length, 0);
  const displayLine =
    state.display &&
    spanTotal === 1 &&
    pieces.length === 1 &&
    pieces[0].gap.from === line.from &&
    pieces[0].gap.to === line.to &&
    pieces[0].seg.trim() === pieces[0].spans[0].raw.trim();
  if (displayLine) {
    const piece = pieces[0];
    const span = piece.spans[0];
    state.result +=
      piece.seg.slice(0, span.from) + "$$" + convertSpan(span.raw, state.rules) + "$$" + piece.seg.slice(span.to);
    state.count++;
    return;
  }
  let cursor = line.from;
  for (const piece of pieces) {
    state.result += text.slice(cursor, piece.gap.from);
    let at = 0;
    for (const span of piece.spans) {
      state.result += piece.seg.slice(at, span.from) + "$" + convertSpan(span.raw, state.rules) + "$";
      at = span.to;
      state.count++;
    }
    state.result += piece.seg.slice(at);
    cursor = piece.gap.to;
  }
  state.result += text.slice(cursor, line.to);
}

export function bakeText(text, options = {}) {
  const state = makeBakeState(text, options);
  for (const line of splitLines(text)) bakeNextLine(state, line);
  state.result += text.slice(state.outCursor);
  return { text: state.result, count: state.count };
}

// The same bake, chunked, so a very large note keeps the UI responsive. The
// caller can await it and report progress.
export async function bakeTextAsync(text, options = {}, onProgress) {
  const state = makeBakeState(text, options);
  const lines = splitLines(text);
  const chunk = 2000;
  for (let i = 0; i < lines.length; i += chunk) {
    const end = Math.min(lines.length, i + chunk);
    for (let k = i; k < end; k++) bakeNextLine(state, lines[k]);
    if (onProgress) onProgress(end / Math.max(1, lines.length));
    if (end < lines.length) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  state.result += text.slice(state.outCursor);
  return { text: state.result, count: state.count };
}
