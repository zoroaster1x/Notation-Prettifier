/*
 * Notation Prettifier tests: the documented examples in the README, pinned to
 * the current engine, so a rule change that disagrees with the manual fails.
 *
 *   bun test/examples.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { bakeText } from "../src/engine.js";
import {
  DEFAULT_SHORTCUTS_TEXT,
  compileRules,
  compileShortcuts,
  mathWordsFor,
  shortcutTokenRegex,
} from "../src/rules.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readme = readFileSync(join(root, "README.md"), "utf8");

const start = readme.indexOf("<!-- examples:start -->");
const end = readme.indexOf("<!-- examples:end -->");
if (start === -1 || end === -1) {
  console.log("FAIL the README has no examples block");
  process.exit(1);
}
const block = readme.slice(start, end);
const lines = block
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.includes("  ==>  "));

if (lines.length < 40) {
  console.log("FAIL the README examples block looks wrong: " + lines.length + " lines");
  process.exit(1);
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
  displayFormulaLines: false,
};

let pass = 0;
let fail = 0;
for (const line of lines) {
  const at = line.indexOf("  ==>  ");
  const input = line.slice(0, at);
  const expected = line.slice(at + 7);
  let source = input;
  let display = false;
  if (source.startsWith("[display] ")) {
    display = true;
    source = source.slice(10);
  }
  const actual = bakeText(source, Object.assign({}, options, { displayFormulaLines: display })).text;
  if (actual === expected) {
    pass++;
  } else {
    fail++;
    console.log("FAIL " + JSON.stringify(source));
    console.log("     expected " + JSON.stringify(expected));
    console.log("     actual   " + JSON.stringify(actual));
  }
}

console.log("");
console.log("examples:", pass, "pass,", fail, "fail");
process.exit(fail ? 1 : 0);
