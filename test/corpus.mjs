/*
 * Corpus run over a folder of real notes. It is read only: the files are never
 * written, only parsed and converted.
 *
 *   bun test/corpus.mjs                 full run, invariants, timing
 *   bun test/corpus.mjs --show 40       also print 40 converted lines
 *   bun test/corpus.mjs --limit 20      first 20 files only
 *
 * The folder comes from NP_TEST_FOLDER in the environment or from .testenv at
 * the repository root. Without it the run skips with a notice.
 *
 * Invariants checked per file:
 *   - baking does not throw
 *   - baking twice gives the same text (idempotent)
 *   - the line count is unchanged
 *   - every protected region (frontmatter, code, math, links) survives verbatim
 *   - dollar delimiters come in pairs, braces balance inside each span
 *   - no injected span contains a stray dollar sign
 * plus a DOM pass that renders a sample of converted lines through the real
 * reading view code under linkedom.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { bakeText, candidateRegex, convertSpan, protectedRanges, rangeAt, splitLines } from "../src/engine.js";
import { processElement } from "../src/reading.js";
import {
  DEFAULT_SHORTCUTS_TEXT,
  compileRules,
  compileShortcuts,
  mathWordsFor,
  shortcutTokenRegex,
} from "../src/rules.js";
import { setupDom } from "./harness.mjs";
import { reportConfiguration, testPath } from "./env.mjs";

const argv = process.argv.slice(2);
const showCount = numberFlag("--show", 0);
const limit = numberFlag("--limit", 0);

function numberFlag(name, fallback) {
  const index = argv.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const folder = testPath("NP_TEST_FOLDER");
if (!folder) {
  reportConfiguration(["NP_TEST_FOLDER"]);
  process.exit(0);
}

function walk(dir, files) {
  for (const entry of readdirSync(dir)) {
    if (entry === ".obsidian" || entry === ".trash" || entry === ".git" || entry === "node_modules") continue;
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) walk(path, files);
    else if (extname(entry).toLowerCase() === ".md") files.push(path);
  }
  return files;
}

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

function snippet(text) {
  return text.replace(/\s+/g, " ").slice(0, 90);
}

function countChar(text, char) {
  let count = 0;
  for (const ch of text) if (ch === char) count++;
  return count;
}

function dollarProblems(text) {
  const problems = [];
  const blocks = text.split("$$");
  if (blocks.length % 2 === 0) problems.push("unclosed $$");
  for (let i = 1; i < blocks.length; i += 2) {
    if (countChar(blocks[i], "{") !== countChar(blocks[i], "}")) problems.push("braces in $$: " + snippet(blocks[i]));
  }
  for (let i = 0; i < blocks.length; i += 2) {
    const parts = blocks[i].split("$");
    if (parts.length % 2 === 0) {
      problems.push("odd number of $: " + snippet(blocks[i]));
      continue;
    }
    for (let j = 1; j < parts.length; j += 2) {
      if (countChar(parts[j], "{") !== countChar(parts[j], "}")) problems.push("braces: " + snippet(parts[j]));
      if (parts[j].indexOf("$") !== -1) problems.push("nested $: " + snippet(parts[j]));
    }
  }
  return problems;
}

function protectedProblems(source, output, ranges) {
  const problems = [];
  let cursor = 0;
  for (const range of ranges) {
    const chunk = source.slice(range.from, range.to);
    if (!chunk.trim()) continue;
    const at = output.indexOf(chunk, cursor);
    if (at === -1) {
      problems.push("protected text lost: " + snippet(chunk));
      break;
    }
    cursor = at + chunk.length;
  }
  return problems;
}

function firstDiff(a, b) {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) if (a[i] !== b[i]) return i;
  return length;
}

const files = walk(folder, []);
files.sort();
const selected = limit ? files.slice(0, limit) : files;

setupDom();
const fakePlugin = {
  settings: { readingView: true },
  rules: () => options.rules,
  shortcuts: () => options.shortcuts,
  mathWords: () => options.mathWords,
  shortcutToken: () => options.shortcutToken,
  candidate: () => candidateRegex(options.shortcuts),
  convert: (raw) => convertSpan(raw, options.rules),
};

let failures = 0;
let totalLines = 0;
let changedFiles = 0;
let totalFormulas = 0;
let totalMs = 0;
let protectedChecked = 0;
let emptyFiles = 0;
let renderedLines = 0;
let renderedElements = 0;
const perFile = [];
const samples = [];
const renderSamples = [];

for (const file of selected) {
  const source = readFileSync(file, "utf8");
  const relativePath = relative(folder, file);
  const started = performance.now();
  let first;
  try {
    first = bakeText(source, options);
  } catch (error) {
    failures++;
    console.log("FAIL " + relativePath + " bake threw: " + error.message);
    continue;
  }
  totalMs += performance.now() - started;
  totalLines += source.split("\n").length;
  const protectedList = protectedRanges(source);
  protectedChecked += protectedList.length;
  if (first.count) {
    changedFiles++;
    totalFormulas += first.count;
    perFile.push({ path: relativePath, count: first.count });
  } else {
    emptyFiles++;
  }

  for (const problem of dollarProblems(first.text)) {
    failures++;
    console.log("FAIL " + relativePath + " " + problem);
  }
  for (const problem of protectedProblems(source, first.text, protectedList)) {
    failures++;
    console.log("FAIL " + relativePath + " " + problem);
  }
  if (first.text.split("\n").length !== source.split("\n").length) {
    failures++;
    console.log("FAIL " + relativePath + " line count changed");
  }

  let second;
  try {
    second = bakeText(first.text, options);
  } catch (error) {
    failures++;
    console.log("FAIL " + relativePath + " second bake threw: " + error.message);
    continue;
  }
  if (second.text !== first.text) {
    failures++;
    const at = firstDiff(first.text, second.text);
    console.log(
      "FAIL " + relativePath + " not idempotent near: " + snippet(first.text.slice(Math.max(0, at - 40), at + 40))
    );
  }

  if (first.count) {
    const beforeLines = source.split("\n");
    const afterLines = first.text.split("\n");
    const lineInfos = splitLines(source);
    for (let k = 0; k < lineInfos.length; k++) {
      if (beforeLines[k] === afterLines[k]) continue;
      const line = beforeLines[k];
      if (samples.length < showCount && line.indexOf("$") === -1) {
        samples.push({ before: line, after: afterLines[k], count: 1 });
      }
      if (
        renderSamples.length < 300 &&
        line.indexOf("$") === -1 &&
        !rangeAt(protectedList, lineInfos[k].from)
      ) {
        renderSamples.push(line);
      }
    }
  }
}

// DOM pass: every sample line is rendered through the real reading view code.
for (const line of renderSamples) {
  try {
    const block = document.createElement("div");
    block.textContent = line;
    processElement(block, fakePlugin);
    const elements = block.querySelectorAll(".np-math, .np-glyph");
    const mathElements = block.querySelectorAll(".np-math");
    renderedLines++;
    renderedElements += elements.length;
    if (!elements.length) {
      failures++;
      console.log("FAIL dom pass rendered nothing for: " + snippet(line));
      continue;
    }
    for (const element of mathElements) {
      if (!element.textContent || !element.textContent.trim()) {
        failures++;
        console.log("FAIL dom pass rendered an empty formula for: " + snippet(line));
      }
    }
  } catch (error) {
    failures++;
    console.log("FAIL dom pass threw for: " + snippet(line) + " -> " + error.message);
  }
}

// A last guard: no converted span may start or end with whitespace or a
// dangling operator once baked.
for (const sample of samples) {
  for (const latex of extractSpans(sample.after)) {
    if (!latex.trim() || latex !== latex.trim()) {
      failures++;
      console.log("FAIL span has stray whitespace: " + JSON.stringify(latex));
    }
    if (/[=+\-*/\^_,]$/.test(latex)) {
      failures++;
      console.log("FAIL span ends with a dangling operator: " + JSON.stringify(latex));
    }
  }
}
function extractSpans(text) {
  const spans = [];
  for (const block of text.split("$$")) spans.push(block);
  const inner = [];
  for (let i = 1; i < spans.length; i += 2) inner.push(spans[i]);
  for (let i = 0; i < spans.length; i += 2) {
    const parts = spans[i].split("$");
    for (let j = 1; j < parts.length; j += 2) inner.push(parts[j]);
  }
  return inner;
}

console.log("");
console.log("corpus: " + selected.length + " files, " + totalLines + " lines, " + totalMs.toFixed(0) + " ms");
console.log("corpus: " + changedFiles + " files changed by baking, " + totalFormulas + " formulas wrapped, " + emptyFiles + " files untouched");
console.log("corpus: " + protectedChecked + " protected regions preserved");
console.log("corpus: " + renderedLines + " lines rendered through the reading view, " + renderedElements + " inline elements");
console.log("corpus: " + failures + " failures");
if (perFile.length) {
  perFile.sort((a, b) => b.count - a.count);
  const top = perFile.slice(0, 8);
  console.log("corpus: busiest files: " + top.map((item) => item.path + " (" + item.count + ")").join(", "));
}

if (showCount) {
  console.log("");
  console.log("--- sample conversions");
  for (const sample of samples) {
    console.log("IN : " + sample.before.trim());
    console.log("OUT: " + sample.after.trim());
    console.log("");
  }
}

console.log("");
console.log("corpus:", failures, "fail");
process.exit(failures ? 1 : 0);
