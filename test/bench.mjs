/*
 * Notation Prettifier benchmark. Reports the numbers the README quotes and
 * fails only on generous bounds, so a slow machine reports rather than lies.
 *
 *   bun test/bench.mjs
 */

import { bakeText, bakeTextAsync, detectSpans, openBlockAt, protectedRanges } from "../src/engine.js";
import {
  DEFAULT_SHORTCUTS_TEXT,
  compileRules,
  compileShortcuts,
  mathWordsFor,
  shortcutTokenRegex,
} from "../src/rules.js";

const settings = {
  groups: {
    shortcuts: true,
    scripts: true,
    greek: true,
    operators: true,
    functions: true,
    units: true,
    xMultiply: true,
  },
  shortcutsText: DEFAULT_SHORTCUTS_TEXT,
  customRulesText: "",
};
const shortcuts = compileShortcuts(settings);
const options = {
  rules: compileRules(settings),
  shortcuts,
  mathWords: mathWordsFor(settings),
  shortcutToken: shortcutTokenRegex(shortcuts),
  displayFormulaLines: true,
};

const PROSE = [
  "The cornea is the clear front window of the eye and provides most of the refractive power.",
  "A note about step-along raytracing and the vergence equation L' = L + F in the paraxial region.",
  "Course_AT_12_Topic_SS.pptx was read slide by slide against the register and scored 85 percent.",
  "See [[Lecture Register]] for the covered and missing evidence for this lecture.",
  "This paragraph is plain prose with no notation at all, just words and punctuation, nothing else.",
];

function makeDoc(targetChars, formulaEvery) {
  const parts = [];
  let size = 0;
  let i = 0;
  while (size < targetChars) {
    const line =
      i % formulaEvery === 0 && i > 0
        ? "d=d_1+d_2, (1/25^2)x1000=1.6mm, s=r-sqrt r^2-y^2, L_next=L\u2032/(1\u2212dxL)"
        : PROSE[i % PROSE.length];
    parts.push(line);
    size += line.length + 1;
    i++;
  }
  return parts.join("\n");
}

function time(label, fn, runs = 5) {
  fn();
  const started = performance.now();
  for (let i = 0; i < runs; i++) fn();
  const per = (performance.now() - started) / runs;
  console.log("  " + label.padEnd(42) + per.toFixed(2) + " ms");
  return per;
}

let failures = 0;
function bound(name, value, limit) {
  if (value > limit) {
    failures++;
    console.log("FAIL " + name + " took " + value.toFixed(1) + " ms, over the " + limit + " ms bound");
  }
}

console.log("full document pass (bake command path)");
let oneMegabyte = null;
for (const chars of [50_000, 200_000, 1_000_000, 5_000_000]) {
  const doc = makeDoc(chars, 8);
  const text = doc;
  console.log("  " + text.length.toLocaleString() + " chars, " + text.split("\n").length.toLocaleString() + " lines");
  if (chars === 1_000_000) oneMegabyte = text;
  const spans = time("detectSpans", () => detectSpans(text, options));
  const baked = time("bake", () => bakeText(text, options));
  time("protectedRanges", () => protectedRanges(text));
  if (chars === 1_000_000) {
    bound("detectSpans over 1 MB", spans, 250);
    bound("bake over 1 MB", baked, 800);
  }
}

console.log("");
console.log("live layer, one keystroke in a 1 MB note");
if (oneMegabyte) {
  const doc = {
    length: oneMegabyte.length,
    sliceString: (from, to) => oneMegabyte.slice(from, to),
  };
  const cursor = Math.floor(oneMegabyte.length * 0.9);
  const coldPrefix = time("openBlockAt, cold scan", () => openBlockAt(doc, cursor), 3);
  const prefix = openBlockAt(doc, cursor);
  const windowStart = Math.max(0, cursor - 1500);
  const windowEnd = Math.min(oneMegabyte.length, cursor + 1500);
  const windowText = oneMegabyte.slice(windowStart, windowEnd);
  const warm = time("protectedRanges + detectSpans, 3 KB window", () => {
    const prot = protectedRanges(windowText);
    detectSpans(windowText, Object.assign({}, options, { protected: prot }));
  }, 50);
  console.log("  prefix result " + JSON.stringify(prefix) + ", cold scan " + coldPrefix.toFixed(2) + " ms, warm window " + warm.toFixed(2) + " ms");
  bound("warm keystroke on 1 MB", warm, 20);
} else {
  console.log("  (no 1 MB document built)");
}

console.log("");
console.log("chunked bake");
if (oneMegabyte) {
  const started = performance.now();
  await bakeTextAsync(oneMegabyte, options);
  console.log("  bakeTextAsync 1 MB".padEnd(44) + (performance.now() - started).toFixed(2) + " ms");
}

console.log("");
console.log("bench:", failures, "over bound");
process.exit(failures ? 1 : 0);
