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

// The reading view layer. It walks the rendered block, finds formula spans and
// shortcuts in text nodes and replaces them in place, so nothing else in the
// block (bold, links, list markers) is disturbed.

import { detectShortcutMatches, detectSpans, protectedRanges } from "./engine.js";
import { renderMathInto } from "./math.js";

const SKIP_TAGS = new Set([
  "CODE",
  "PRE",
  "SCRIPT",
  "STYLE",
  "TEXTAREA",
  "INPUT",
  "MJX-CONTAINER",
  "MJX-ASSISTIVE-MML",
]);
const SKIP_CLASSES = ["np-math", "np-glyph", "math", "math-inline", "math-block"];

function shouldSkip(element) {
  if (SKIP_TAGS.has(element.tagName)) return true;
  const classList = element.classList;
  if (classList) {
    for (const name of SKIP_CLASSES) if (classList.contains(name)) return true;
  }
  return false;
}

function makeMathElement(raw, latex) {
  const host = document.createElement("span");
  host.className = "np-math math math-inline";
  renderMathInto(host, raw, latex);
  return host;
}

function makeGlyphElement(replacement) {
  const host = document.createElement("span");
  host.className = "np-glyph";
  host.textContent = replacement;
  return host;
}

// An angle-bracket shortcut such as <deg> looks like an HTML tag to the
// Markdown parser, which turns it into an element and can pull the rest of the
// line (or the lines below) inside it. The reading view puts the glyph in its
// place and moves the swallowed children back out.
function shortcutTagMap(plugin) {
  if (!plugin._shortcutTags) {
    const map = new Map();
    for (const shortcut of plugin.shortcuts()) {
      const match = /^<([A-Za-z][A-Za-z0-9-]*)>$/.exec(shortcut.literal);
      if (match) map.set(match[1].toUpperCase(), shortcut.replacement);
    }
    plugin._shortcutTags = map;
  }
  return plugin._shortcutTags;
}

function unwrapShortcutTags(element, plugin) {
  const map = shortcutTagMap(plugin);
  if (!map.size) return;
  for (const tag of Array.from(element.querySelectorAll("*"))) {
    const replacement = map.get(tag.tagName);
    if (replacement === undefined) continue;
    const parent = tag.parentNode;
    if (!parent) continue;
    parent.insertBefore(makeGlyphElement(replacement), tag);
    while (tag.firstChild) parent.insertBefore(tag.firstChild, tag);
    parent.removeChild(tag);
  }
}

function renderTextNode(node, plugin) {
  const value = node.nodeValue || "";
  if (!value || value.length < 2) return;
  if (!plugin.candidate().test(value)) return;
  const protectedRangesList = protectedRanges(value);
  const spans = detectSpans(value, {
    mathWords: plugin.mathWords(),
    shortcutToken: plugin.shortcutToken(),
    protected: protectedRangesList,
  });
  const shortcuts = detectShortcutMatches(value, {
    shortcuts: plugin.shortcuts(),
    protected: protectedRangesList,
    exclude: spans,
  });
  const matches = [];
  for (const span of spans) {
    matches.push({ from: span.from, to: span.to, kind: "math", raw: span.raw });
  }
  for (const shortcut of shortcuts) {
    matches.push({ from: shortcut.from, to: shortcut.to, kind: "glyph", replacement: shortcut.replacement });
  }
  if (!matches.length) return;
  matches.sort((a, b) => a.from - b.from);
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const tail = node.splitText(match.to);
    const element =
      match.kind === "math"
        ? makeMathElement(match.raw, plugin.convert(match.raw))
        : makeGlyphElement(match.replacement);
    node.parentNode.insertBefore(element, tail);
    node.nodeValue = node.nodeValue.slice(0, match.from);
  }
}

export function processElement(element, plugin) {
  unwrapShortcutTags(element, plugin);
  for (let child = element.firstChild; child; ) {
    const next = child.nextSibling;
    if (child.nodeType === 3) {
      renderTextNode(child, plugin);
    } else if (child.nodeType === 1 && !shouldSkip(child)) {
      processElement(child, plugin);
    }
    child = next;
  }
}

export function readingProcessor(plugin) {
  return (element) => {
    if (!plugin.settings.readingView) return;
    if (!element.textContent) return;
    processElement(element, plugin);
  };
}
