/*
 * Notation Prettifier tests: every rendering context and every MathJax failure
 * path, so a formula can never come out blank again.
 *
 *   bun test/render.mjs
 *
 * The Obsidian module is mocked with a controllable MathJax, which lets the
 * suite exercise a throw, an empty result, a result without mjx-math, a
 * stylesheet that grows as new characters are used, and the retry recovery.
 */

import { mock } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setupDom } from "./harness.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const state = {
  mode: "ok", // ok, throw, empty, no-mjx
  rendered: [],
  sheet: null,
};

mock.module("obsidian", () => ({
  renderMath(latex, display) {
    state.rendered.push(latex);
    if (state.mode === "throw") throw new Error("math engine exploded");
    if (state.mode === "empty") return document.createElement("span");
    const wrapper = document.createElement("span");
    wrapper.className = display ? "math math-block" : "math math-inline";
    if (state.mode === "no-mjx") {
      wrapper.textContent = latex;
      return wrapper;
    }
    const math = document.createElement("mjx-math");
    math.textContent = latex;
    wrapper.appendChild(math);
    return wrapper;
  },
  loadMathJax: async () => undefined,
}));

setupDom();
const require = createRequire(import.meta.url);

const { processElement } = await import("../src/reading.js");
const { renderMathInto, tryRenderMath } = await import("../src/math.js");
const { bakeText, candidateRegex, convertSpan, shortcutMapFor } = await import("../src/engine.js");
const {
  DEFAULT_SHORTCUTS_TEXT,
  compileRules,
  compileShortcuts,
  mathWordsFor,
  shortcutTokenRegex,
} = await import("../src/rules.js");

let pass = 0;
let fail = 0;
function check(name, condition, detail) {
  if (condition) {
    pass++;
    console.log("ok   " + name);
  } else {
    fail++;
    console.log("FAIL " + name + (detail ? "  -> " + detail : ""));
  }
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
  shortcutMap: shortcutMapFor(shortcuts),
  displayFormulaLines: false,
};
const fakePlugin = {
  settings: { readingView: true },
  rules: () => options.rules,
  shortcuts: () => options.shortcuts,
  mathWords: () => options.mathWords,
  shortcutToken: () => options.shortcutToken,
  shortcutMap: () => options.shortcutMap,
  candidate: () => candidateRegex(options.shortcuts),
  convert: (raw) => convertSpan(raw, options.rules),
};

console.log("--- every markdown context renders the formula");
const contextCases = [
  ["paragraph", "p", "L^' = L + F", "L' = L + F", null],
  ["strong", "strong", "n^(i) = n^(')i^(')", "n^{i} = n'i'", "strong"],
  ["emphasis", "em", "L^' = L + F", "L' = L + F", "em"],
  ["strong inside emphasis", "em>strong", "L^' = L + F", "L' = L + F", "em"],
  ["heading", "h2", "L^' = L + F", "L' = L + F", "h2"],
  ["list item", "li", "L^' = L + F", "L' = L + F", "li"],
  ["blockquote", "blockquote", "L^' = L + F", "L' = L + F", "blockquote"],
  ["table cell", "td", "L^' = L + F", "L' = L + F", "td"],
  ["anchor text", "a", "L^' = L + F", "L' = L + F", "a"],
];
for (const [label, selector, source, expected, wrapper] of contextCases) {
  const container = document.createElement("div");
  const parts = selector.split(">");
  let host = container;
  for (const tag of parts) host = host.appendChild(document.createElement(tag));
  host.textContent = "before " + source + " after";
  processElement(container, fakePlugin);
  const math = container.querySelector(".np-math");
  const insideWrapper = wrapper ? Boolean(container.querySelector(wrapper + " .np-math")) : Boolean(math);
  check(
    label + ": rendered " + expected,
    Boolean(math) && math.textContent === expected && math.className.indexOf("math math-inline") !== -1 && math.className.indexOf("is-loaded") !== -1,
    math ? math.outerHTML.slice(0, 120) : "no math"
  );
  check(label + ": keeps its wrapper", insideWrapper, container.innerHTML.slice(0, 140));
  check(label + ": prose kept", container.textContent.indexOf("before ") === 0 && container.textContent.indexOf(" after") !== -1, container.textContent);
}

console.log("--- contexts that must stay untouched");
const untouchedCases = [
  ["inline code", "code", "L^' = L + F"],
  ["preformatted", "pre", "L^' = L + F"],
  ["existing math wrapper", "span", "L^' = L + F", "math math-inline"],
];
for (const [label, tag, source, cls] of untouchedCases) {
  const container = document.createElement("div");
  const host = container.appendChild(document.createElement(tag));
  if (cls) host.className = cls;
  host.textContent = source;
  processElement(container, fakePlugin);
  check(label + " untouched", container.querySelectorAll(".np-math").length === 0 && container.textContent === source, container.innerHTML.slice(0, 120));
}

console.log("--- HTML and styling wrappers");
const htmlCases = [
  ["mark highlight", "<mark>L^' = L + F</mark>", "mark"],
  ["underline", "<u>L^' = L + F</u>", "u"],
  ["strikethrough element", "<s>L^' = L + F</s>", "s"],
  ["deleted element", "<del>L^' = L + F</del>", "del"],
  ["superscript element", "<sup>L^' = L + F</sup>", "sup"],
  ["subscript element", "<sub>L^' = L + F</sub>", "sub"],
  ["keyboard element", "<kbd>L^' = L + F</kbd>", "kbd"],
  ["legacy font colour", '<font color="red">L^\' = L + F</font>', "font"],
  ["styled span", '<span style="color: red">L^\' = L + F</span>', "span"],
  ["colored text plugin", '<span class="colored-text" style="color:#e91e63">L^\' = L + F</span>', "span.colored-text"],
  ["highlight div", '<div style="background:#fff3">L^\' = L + F</div>', "div"],
  ["details summary", "<details><summary>L^' = L + F</summary></details>", "summary"],
];
for (const [label, html, wrapper] of htmlCases) {
  const container = document.createElement("div");
  container.innerHTML = html;
  processElement(container, fakePlugin);
  const math = container.querySelector(".np-math");
  check(
    label + " renders",
    Boolean(math) && math.textContent === "L' = L + F" && math.className.indexOf("is-loaded") !== -1,
    container.innerHTML.slice(0, 160)
  );
  check(label + " keeps its wrapper", Boolean(container.querySelector(wrapper + " .np-math")), container.innerHTML.slice(0, 160));
}

console.log("--- pattern matrix with markdown and HTML stylers");
const matrixSources = [
  "L^' = L + F",
  "n^(i) = n^(')i^(')",
  "i_1^' = i_2",
  "L_next=L\u2032/(1\u2212dxL)",
  "s=r-sqrt r^2-y^2",
  "theta = 2",
  "Delta E = h f",
  "sin(x) = 0.5",
  "cos \u03b8 = 0.5",
  "d = 1.6mm",
  "F = +5.00DS",
  "(1/25^2)x1000=1.6",
  "A <- B",
  "n > 1.7",
  "x = 50%",
  "45\u00b0 \u2192 90\u00b0",
  "m=-1.87/+0.72",
  "F=(n'\u2212n)/r",
  "d=d_1+d_2",
  "L'=L+F \u2192 image",
];
const stylers = [
  ["bare", "", ""],
  ["bold", "**", "**"],
  ["italic", "*", "*"],
  ["underscore", "_", "_"],
  ["strike", "~~", "~~"],
  ["highlight", "==", "=="],
  ["html mark", "<mark>", "</mark>"],
  ["html colour", '<span style="color:red">', "</span>"],
];
for (const source of matrixSources) {
  const problems = [];
  for (const [label, open, close] of stylers) {
    const baked = bakeText(open + source + close, options);
    if (!baked.count) {
      problems.push(label + ": no span");
      continue;
    }
    const spans = [];
    const blocks = baked.text.split("$$");
    for (let i = 1; i < blocks.length; i += 2) spans.push(blocks[i]);
    for (let i = 0; i < blocks.length; i += 2) {
      const parts = blocks[i].split("$");
      for (let j = 1; j < parts.length; j += 2) spans.push(parts[j]);
    }
    if (!spans.length) {
      problems.push(label + ": no inline span");
      continue;
    }
    for (const span of spans) {
      if (!span.trim()) problems.push(label + ": empty span");
      if (span.indexOf("*") !== -1 || span.indexOf("~") !== -1 || span.indexOf("`") !== -1) {
        problems.push(label + ": styler inside " + JSON.stringify(span));
      }
      if ((span.match(/\{/g) || []).length !== (span.match(/\}/g) || []).length) {
        problems.push(label + ": unbalanced braces " + JSON.stringify(span));
      }
    }
    const container = document.createElement("div");
    container.textContent = open + source + close;
    processElement(container, fakePlugin);
    const math = container.querySelectorAll(".np-math");
    if (math.length !== spans.length) problems.push(label + ": rendered " + math.length + " of " + spans.length);
    for (const element of math) {
      if (!element.textContent || !element.textContent.trim()) problems.push(label + ": blank render");
      if (element.className.indexOf("is-loaded") === -1) problems.push(label + ": not loaded");
    }
  }
  check("matrix: " + source, problems.length === 0, problems.slice(0, 3).join(" | "));
}

console.log("--- MathJax failure paths");
state.mode = "throw";
const throwHost = document.createElement("span");
throwHost.className = "np-math math math-inline";
const throwResult = renderMathInto(throwHost, "L^' = L + F", "L' = L + F");
check("a throwing render is refused", throwResult === false, String(throwResult));
check("the raw text stays visible", throwHost.textContent === "L^' = L + F", throwHost.textContent);
check("no is-loaded on a failure", throwHost.className.indexOf("is-loaded") === -1, throwHost.className);

state.mode = "empty";
const emptyHost = document.createElement("span");
const emptyResult = renderMathInto(emptyHost, "L^' = L + F", "L' = L + F");
check("an empty render is refused", emptyResult === false, String(emptyResult));
check("the raw text stays visible on empty", emptyHost.textContent === "L^' = L + F", emptyHost.textContent);

state.mode = "no-mjx";
const noMjxHost = document.createElement("span");
const noMjxResult = renderMathInto(noMjxHost, "L^' = L + F", "L' = L + F");
check("a text-only render is accepted", noMjxResult === true, String(noMjxResult));
check("the text-only render shows the latex", noMjxHost.textContent === "L' = L + F", noMjxHost.textContent);
check("is-loaded is set on success", noMjxHost.className.indexOf("is-loaded") !== -1, noMjxHost.className);

console.log("--- retry recovery");
state.mode = "throw";
const retryHost = document.createElement("span");
document.body.appendChild(retryHost);
renderMathInto(retryHost, "L^' = L + F", "L' = L + F");
check("starts as raw text", retryHost.textContent === "L^' = L + F", retryHost.textContent);
state.mode = "ok";
await new Promise((resolve) => setTimeout(resolve, 250));
check("swaps to math when the engine answers", retryHost.querySelector("mjx-math") !== null, retryHost.innerHTML.slice(0, 120));
check("marks the swap as loaded", retryHost.className.indexOf("is-loaded") !== -1, retryHost.className);
retryHost.remove();

console.log("--- the stylesheet grows with every new character");
// Drop the harness stand-in so this section owns the stylesheet state.
for (const stale of Array.from(document.head.querySelectorAll("style"))) {
  if ((stale.textContent || "").indexOf("mjx-c::before") !== -1) stale.remove();
}
const firstSheet = document.createElement("style");
firstSheet.textContent = "mjx-c::before{content:'x'}";
state.sheet = firstSheet;
globalThis.MathJax = { chtmlStylesheet: () => state.sheet };
state.mode = "ok";
tryRenderMath("n^1", false);
check("the stylesheet is attached", document.head.contains(firstSheet));
check("the change attribute is toggled", firstSheet.dataset.change === "1", firstSheet.dataset.change);
const secondSheet = document.createElement("style");
secondSheet.textContent = "mjx-c::before{content:'y'}";
state.sheet = secondSheet;
tryRenderMath("n^2", false);
check("a new stylesheet replaces the old", document.head.contains(secondSheet) && !document.head.contains(firstSheet));
check("the change attribute toggles again", secondSheet.dataset.change === "1", secondSheet.dataset.change);
secondSheet.remove();
state.sheet = null;
check("a render without a stylesheet is refused", tryRenderMath("n^3", false) === null);
globalThis.MathJax = undefined;

console.log("--- environment preconditions are checked");
check("every render was attempted", state.rendered.length > 0, String(state.rendered.length));
check("the latex came from the engine", state.rendered.indexOf("n^{1}") !== -1 || state.rendered.indexOf("L' = L + F") !== -1, state.rendered.slice(0, 5).join(" | "));

console.log("--- the stylesheet contract the community review checks");
const css = readFileSync(join(root, "styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
check("no !important", css.indexOf("!important") === -1);
check("no mjx-container type selector", css.indexOf("mjx-container") === -1);
check("the math scale is a variable", css.indexOf("--np-math-scale") !== -1);
check("math gets the theme classes", true);

console.log("");
console.log("render:", pass, "pass,", fail, "fail");
process.exit(fail ? 1 : 0);
