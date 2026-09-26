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

// The rule packs. A rule is { pattern, replacement }: pattern is a JavaScript
// regular expression source, replacement is a JavaScript replacement string,
// so $1, $2 work. Rules run in order over the text of one formula. Text
// shortcuts are literals and run over plain text as well.

export const GREEK_NAMES = [
  "alpha", "beta", "gamma", "delta", "Delta", "epsilon", "varepsilon",
  "zeta", "eta", "theta", "vartheta", "Theta", "iota", "kappa", "lambda",
  "Lambda", "mu", "nu", "xi", "Xi", "pi", "Pi", "rho", "sigma", "Sigma",
  "tau", "upsilon", "phi", "varphi", "Phi", "chi", "psi", "Psi", "omega",
  "Omega",
];

export const FUNCTION_NAMES = [
  "sin", "cos", "tan", "cot", "sec", "csc",
  "arcsin", "arccos", "arctan",
  "sinh", "cosh", "tanh",
  "log", "ln", "exp",
];

export const EXTRA_MATH_WORDS = ["sqrt", "lim", "max", "min", "mod", "det"];

// Words that are units, not prose. They extend a formula even when they are
// three letters long, which ordinary words never do.
export const UNIT_WORDS = [
  "mm", "cm", "dm", "nm", "km", "um", "ms", "ns", "kg", "mg", "mol",
  "ml", "mL", "Hz", "kHz", "MHz", "rad", "deg", "dpt", "VA", "DS", "DC",
];

// Shortcuts are literal text replacements, applied in the note, in formulas
// and in plain text alike. This list is the Symbols Prettifier map plus the
// degree sign: typing -> gives an arrow, typing <degrees> gives a degree sign.
// Order matters; the longer forms come first so <-> is not eaten by <-.
export const DEFAULT_SHORTCUTS_TEXT = [
  "# Symbols Prettifier style arrow and sign shortcuts",
  "<-> => \u2194",
  "<=> => \u21d4",
  "=== => \u2261",
  "=/= => \u2260",
  "<= => \u21d0",
  "=> => \u21d2",
  "-> => \u2192",
  "<- => \u2190",
  "-- => \u2013",
  "!= => \u2260",
  "=< => \u2264",
  ">= => \u2265",
  "+- => \u00b1",
  "-+ => \u2213",
  "",
  "# Degree sign. The [ ] forms are HTML safe; an angle bracket at the start of",
  "# a line can be read by Markdown as an HTML tag and swallow the lines below.",
  "<degrees> => \u00b0",
  "<degree> => \u00b0",
  "<deg> => \u00b0",
  "[degrees] => \u00b0",
  "[degree] => \u00b0",
  "[deg] => \u00b0",
].join("\n");

const GREEK_PATTERN = "(?<!\\\\)\\b(" + GREEK_NAMES.join("|") + ")\\b";
const FN = "(sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh|log|ln|exp)";
const BASE = "([A-Za-z0-9)\\]}])";

// Unicode superscript and subscript digits, mapped to real scripts.
const SUPERSCRIPT_CHARS = [
  "\u2070", "\u00b9", "\u00b2", "\u00b3", "\u2074", "\u2075", "\u2076",
  "\u2077", "\u2078", "\u2079",
];
const SUBSCRIPT_CHARS = [
  "\u2080", "\u2081", "\u2082", "\u2083", "\u2084", "\u2085", "\u2086",
  "\u2087", "\u2088", "\u2089",
];
const SCRIPT_CHAR_RULES = [
  ...SUPERSCRIPT_CHARS.map((char, digit) => ({ pattern: char, replacement: "^{" + digit + "}" })),
  ...SUBSCRIPT_CHARS.map((char, digit) => ({ pattern: char, replacement: "_{" + digit + "}" })),
];

export const RULE_GROUPS = [
  {
    id: "functions",
    name: "Functions and roots",
    description: "sin(x) becomes \\sin(x), sqrt x becomes \\sqrt{x}.",
    rules: [
      { pattern: "(?<!\\\\)\\b" + FN + "(?=\\s*[(\^])", replacement: "\\$1" },
      {
        pattern: "(?<!\\\\)\\b(sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh)\\s*(?=[\\u0370-\\u03ff])",
        replacement: "\\$1 ",
      },
      {
        pattern: "(?<!\\\\)\\b(sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh)\\s+(?=[A-Za-z])",
        replacement: "\\$1 ",
      },
      { pattern: "\\bsqrt\\s*\\(([^()]*)\\)", replacement: "\\sqrt{$1}" },
      {
        pattern:
          "\\bsqrt\\s+([A-Za-z0-9][A-Za-z0-9^(){}\\[\\].,]*(?:\\s*[-+]\\s*[A-Za-z0-9][A-Za-z0-9^(){}\\[\\].,]*)*)",
        replacement: "\\sqrt{$1}",
      },
    ],
  },
  {
    id: "xMultiply",
    name: "x between numbers means multiply",
    description:
      "25^2x6.5 and (1/25^2)x1000 become \\times; a lone x stays a variable.",
    rules: [
      { pattern: "(?<=[0-9)\\]}])x(?=-?\\d|\\()", replacement: "\\times" },
      { pattern: "(?<=[0-9)\\]}])x(?=[-+]\\d)", replacement: "\\times" },
      { pattern: "(?<=[A-Z])x(?=\\()", replacement: "\\times" },
    ],
  },
  {
    id: "scripts",
    name: "Primes, superscripts and subscripts",
    description:
      "L^' becomes L', n^(i) becomes n^{i}, i_1 becomes i_{1}, L_next becomes L_{next}.",
    rules: [
      { pattern: "[\\u2019\\u2032]", replacement: "'" },
      { pattern: "\\^\\(\\s*('+)\\s*\\)", replacement: "$1" },
      { pattern: "\\^('+)", replacement: "$1" },
      { pattern: "\\^\\(\\s*([-+]?[A-Za-z0-9]{1,4})\\s*\\)", replacement: "^{$1}" },
      { pattern: "\\^\\(\\s*([^()]{1,24}?)\\s*\\)", replacement: "^{$1}" },
      { pattern: BASE + "\\^(-?\\d+(?:\\.\\d+)?)", replacement: "$1^{$2}" },
      { pattern: BASE + "\\^(-?[A-Za-z0-9])", replacement: "$1^{$2}" },
      { pattern: BASE + "_\\s*\\(\\s*([-+]?[A-Za-z0-9]{1,6})\\s*\\)", replacement: "$1_{$2}" },
      { pattern: BASE + "_\\s*\\(\\s*([^()]{1,24}?)\\s*\\)", replacement: "$1_{$2}" },
      { pattern: BASE + "_\\{\\s*([^{}]{1,40}?)\\s*\\}", replacement: "$1_{$2}" },
      { pattern: BASE + "_([A-Za-z]{1,12})", replacement: "$1_{$2}" },
      { pattern: BASE + "_(-?\\d{2,})", replacement: "$1_{$2}" },
      { pattern: BASE + "_([A-Za-z0-9])", replacement: "$1_{$2}" },
      { pattern: "([\\^_])\\{\\s*([^{}]{1,60}?)\\s*\\}", replacement: "$1{$2}" },
      ...SCRIPT_CHAR_RULES,
    ],
  },
  {
    id: "greek",
    name: "Greek letter names",
    description: "theta, lambda, Delta and the rest become \\theta, \\lambda, \\Delta.",
    rules: [{ pattern: GREEK_PATTERN, replacement: "\\$1" }],
  },
  {
    id: "operators",
    name: "Operators and relations",
    description: "-> becomes \\to, >= becomes \\geq, != becomes \\neq, x/unicode signs normalise.",
    rules: [
      { pattern: "<=>", replacement: "\\Leftrightarrow" },
      { pattern: "<->", replacement: "\\leftrightarrow" },
      { pattern: "->", replacement: "\\to" },
      { pattern: "<-", replacement: "\\leftarrow" },
      { pattern: "=>", replacement: "\\Rightarrow" },
      { pattern: "<=", replacement: "\\Leftarrow" },
      { pattern: "=<", replacement: "\\leq" },
      { pattern: ">=", replacement: "\\geq" },
      { pattern: "!=", replacement: "\\neq" },
      { pattern: "\\+-", replacement: "\\pm" },
      { pattern: "-\\+", replacement: "\\mp" },
      { pattern: "\u00d7", replacement: "\\times" },
      { pattern: "\u00f7", replacement: "\\div" },
      { pattern: "[\u00b7\u22c5]", replacement: "\\cdot" },
      { pattern: "[\u2212\u2013\u2014]", replacement: "-" },
      { pattern: "\u2192", replacement: "\\to" },
      { pattern: "\u27f6", replacement: "\\longrightarrow" },
      { pattern: "\u2190", replacement: "\\leftarrow" },
      { pattern: "\u2194", replacement: "\\leftrightarrow" },
      { pattern: "\u27f7", replacement: "\\longleftrightarrow" },
      { pattern: "\u21d2", replacement: "\\Rightarrow" },
      { pattern: "\u21d0", replacement: "\\Leftarrow" },
      { pattern: "\u21d4", replacement: "\\Leftrightarrow" },
      { pattern: "\u2264", replacement: "\\leq" },
      { pattern: "\u2265", replacement: "\\geq" },
      { pattern: "\u2260", replacement: "\\neq" },
      { pattern: "\u2261", replacement: "\\equiv" },
      { pattern: "\u00b1", replacement: "\\pm" },
      { pattern: "\u2213", replacement: "\\mp" },
      { pattern: "(?<!\\\\)%", replacement: "\\%" },
    ],
  },
  {
    id: "units",
    name: "Units after a number",
    description: "3.75mm becomes 3.75\\,\\text{mm}, 40 mg becomes 40\\,\\text{mg}.",
    rules: [
      {
        pattern:
          "([0-9)])\\s*(mm|cm|dm|nm|km|um|ms|ns|kg|mg|mol|ml|mL|Hz|kHz|MHz|rad|deg|dpt|VA|DS|DC|D)\\b",
        replacement: "$1\\,\\text{$2}",
      },
      {
        pattern:
          "(/)\\s*(mm|cm|dm|nm|km|um|ms|ns|kg|mg|mol|ml|mL|Hz|kHz|MHz|rad|deg|dpt|VA|DS|DC|D)\\b",
        replacement: "$1\\text{$2}",
      },
      { pattern: "([0-9])\\s*\u00b0\\s*C\\b", replacement: "$1^{\\circ}\\text{C}" },
    ],
  },
];

const GROUP_BY_ID = new Map(RULE_GROUPS.map((g) => [g.id, g]));

export function groupOn(settings, id) {
  const groups = settings && settings.groups ? settings.groups : {};
  return groups[id] !== false;
}

export function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeReplacement(text) {
  return String(text).replace(/\$/g, "$$$$");
}

export function parseCustomRules(text) {
  const out = [];
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const at = line.lastIndexOf("=>");
    if (at <= 0) continue;
    const pattern = line.slice(0, at).trim();
    const replacement = line.slice(at + 2).trim();
    if (pattern) out.push({ pattern, replacement });
  }
  return out;
}

export function parseCustomShortcuts(text) {
  const out = [];
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const at = line.lastIndexOf("=>");
    if (at <= 0) continue;
    const literal = line.slice(0, at).trim();
    const replacement = line.slice(at + 2).trim();
    if (literal) out.push({ literal, replacement });
  }
  return out;
}

// Shortcuts are literals, not regexes: a reader writes <degrees> and gets a
// degree sign. They are applied to plain text and inside formulas.
export function compileShortcuts(settings) {
  if (!groupOn(settings, "shortcuts")) return [];
  const list = parseCustomShortcuts(settings && settings.shortcutsText);
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (seen.has(item.literal)) continue;
    seen.add(item.literal);
    out.push({
      literal: item.literal,
      replacement: item.replacement,
      regex: new RegExp(escapeRegExp(item.literal), "g"),
    });
  }
  return out;
}

// The token a formula detector may meet in raw text. A shortcut such as
// <degrees> is one token there, so a formula that contains it stays one span.
export function shortcutTokenRegex(shortcuts) {
  if (!shortcuts.length) return null;
  const parts = shortcuts.map((s) => escapeRegExp(s.literal));
  return new RegExp(parts.join("|"), "y");
}

export function compileRules(settings) {
  const rules = [];
  const push = (pattern, replacement, group) => {
    try {
      rules.push({ pattern, replacement, group, regex: new RegExp(pattern, "g") });
    } catch (error) {
      // An invalid custom pattern is reported in the settings tab and skipped
      // here, so one bad line cannot stop the rest from applying.
    }
  };
  if (groupOn(settings, "shortcuts")) {
    for (const shortcut of compileShortcuts(settings)) {
      push(escapeRegExp(shortcut.literal), escapeReplacement(shortcut.replacement), "shortcuts");
    }
  }
  for (const group of RULE_GROUPS) {
    if (!groupOn(settings, group.id)) continue;
    for (const rule of group.rules) push(rule.pattern, rule.replacement, group.id);
  }
  for (const rule of parseCustomRules(settings && settings.customRulesText)) {
    push(rule.pattern, rule.replacement, "custom");
  }
  return rules;
}

export function invalidCustomRules(text) {
  const bad = [];
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const at = line.lastIndexOf("=>");
    if (at <= 0) {
      bad.push(line.slice(0, 60));
      continue;
    }
    const pattern = line.slice(0, at).trim();
    try {
      new RegExp(pattern, "g");
    } catch (error) {
      bad.push(pattern.slice(0, 60));
    }
  }
  return bad;
}

export function mathWordsFor(settings) {
  const words = new Set();
  if (groupOn(settings, "greek")) for (const name of GREEK_NAMES) words.add(name);
  if (groupOn(settings, "functions")) for (const name of FUNCTION_NAMES) words.add(name);
  if (groupOn(settings, "functions")) for (const name of EXTRA_MATH_WORDS) words.add(name);
  if (groupOn(settings, "units")) for (const name of UNIT_WORDS) words.add(name);
  return words;
}

export function describeGroups() {
  return RULE_GROUPS.map((group) => ({
    id: group.id,
    name: group.name,
    description: group.description,
    rules: group.rules.map((rule) => ({ pattern: rule.pattern, replacement: rule.replacement })),
  }));
}

export { GROUP_BY_ID };
