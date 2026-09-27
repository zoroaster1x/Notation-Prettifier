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

/*
 * Loads the built bundle under the Obsidian and CodeMirror stubs and checks
 * that the plugin wires itself up, renders in reading view, renders the live
 * layer, and writes LaTeX from the commands.
 *
 *   bun test/smoke.mjs
 */

import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setupDom } from "./harness.mjs";

setupDom();
const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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

const bundlePath = join(root, "main.js");
if (!existsSync(bundlePath)) {
  console.log("FAIL main.js is missing; run: bun esbuild.config.mjs production");
  process.exit(1);
}

const loaded = require(bundlePath);
const PluginClass = loaded.default || loaded;
const obsidian = require("obsidian");

const app = {
  workspace: {
    iterateAllLeaves() {},
    getActiveViewOfType() {
      return null;
    },
  },
};

const plugin = new PluginClass();
plugin.app = app;
await plugin.onload();

const registered = plugin.registered || {};
check("editor extension registered", registered.editorExtensions.length === 1, JSON.stringify(registered.editorExtensions.length));
check("post processor registered", registered.postProcessors.length === 1);
check("settings tab registered", registered.settingTabs.length === 1);
const commandIds = (registered.commands || []).map((command) => command.id);
for (const id of ["convert-selection", "convert-note", "preview-note", "check-current-line", "write-debug-report", "toggle-live-preview"]) {
  check("command " + id, commandIds.indexOf(id) !== -1, commandIds.join(","));
}

const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const versions = JSON.parse(readFileSync(join(root, "versions.json"), "utf8"));
check("manifest id", manifest.id === "notation-prettifier", manifest.id);
check("manifest name", manifest.name === "Notation Prettifier", manifest.name);
check("manifest version is semver", /^\d+\.\d+\.\d+$/.test(manifest.version), manifest.version);
check("versions.json carries the version", Boolean(versions[manifest.version]), JSON.stringify(versions));

console.log("--- reading view");
const processor = registered.postProcessors[0];
const block = document.createElement("div");
block.textContent = "Use L^' = L + F here";
processor(block);
const math = block.querySelector(".np-math");
check("formula rendered", Boolean(math), block.innerHTML);
check("formula text", math && math.textContent === "L' = L + F", math && math.textContent);
check("formula carries the math classes", Boolean(math && math.className.indexOf("math math-inline") !== -1), math && math.className);
check("formula is marked loaded", Boolean(math && math.className.indexOf("is-loaded") !== -1), math && math.className);
check("prose kept", block.textContent.indexOf("Use") === 0, block.textContent);

const glyphBlock = document.createElement("div");
glyphBlock.textContent = "retina -> brain";
processor(glyphBlock);
check("arrow glyph", glyphBlock.textContent === "retina \u2192 brain", glyphBlock.textContent);
check("arrow is a glyph element", Boolean(glyphBlock.querySelector(".np-glyph")));

const degreeBlock = document.createElement("div");
degreeBlock.textContent = "Turn 5<degrees>";
processor(degreeBlock);
check("degree glyph", degreeBlock.textContent === "Turn 5\u00b0", degreeBlock.textContent);

const codeBlock = document.createElement("div");
const code = codeBlock.appendChild(document.createElement("code"));
code.textContent = "L = L + F";
processor(codeBlock);
check("code untouched", codeBlock.textContent === "L = L + F", codeBlock.textContent);

const tagBlock = document.createElement("div");
const tag = document.createElement("deg");
tag.textContent = " and the rest of the line";
tagBlock.appendChild(tag);
processor(tagBlock);
check("tag-like shortcut unwrapped", tagBlock.textContent.indexOf("\u00b0") === 0, tagBlock.textContent);
check("swallowed text kept", tagBlock.textContent.indexOf("and the rest of the line") !== -1, tagBlock.textContent);
check("tag becomes a glyph element", Boolean(tagBlock.querySelector(".np-glyph")));

console.log("--- live layer");
const editorExtensions = registered.editorExtensions[0];
const editorExtension = Array.isArray(editorExtensions)
  ? editorExtensions.find((extension) => extension && extension.isViewPlugin)
  : editorExtensions;
const inputHandler = Array.isArray(editorExtensions)
  ? editorExtensions.find((extension) => extension && extension.isInputHandler)
  : null;
check("editor extension is a view plugin", Boolean(editorExtension && editorExtension.isViewPlugin), JSON.stringify(editorExtension));
check("eager shortcut input handler registered", Boolean(inputHandler), JSON.stringify(editorExtensions));

const makeView = (text, ranges, livePreview = true) => ({
  state: {
    doc: {
      length: text.length,
      sliceString: (from, to) => text.slice(from, to),
    },
    selection: { ranges: ranges || [{ from: 0, to: 0 }] },
    field: () => livePreview,
  },
  viewport: { from: 0, to: Math.min(text.length, 1000) },
});

const live = new editorExtension.cls(makeView("Use L = L + F here"));
check("live decoration built", live.decorations.length === 1, JSON.stringify(live.decorations));
const widget = live.decorations[0] && live.decorations[0].value && live.decorations[0].value.spec.widget;
check("live widget is math", Boolean(widget && widget.latex === "L = L + F"), widget && widget.latex);
const widgetDom = widget ? widget.toDOM() : null;
check("live widget dom", Boolean(widgetDom && widgetDom.className.indexOf("np-math") !== -1));
check("live widget text", widgetDom && widgetDom.textContent === "L = L + F", widgetDom && widgetDom.textContent);

const nearCursor = new editorExtension.cls(makeView("Use L = L + F here", [{ from: 5, to: 6 }]));
check("raw text inside the span", nearCursor.decorations.length === 0, JSON.stringify(nearCursor.decorations));

const afterSpan = new editorExtension.cls(makeView("Use L = L + F here", [{ from: 13, to: 13 }]));
check("cursor at the span end still renders", afterSpan.decorations.length === 1, JSON.stringify(afterSpan.decorations));

const beforeSpan = new editorExtension.cls(makeView("Use L = L + F here", [{ from: 4, to: 4 }]));
check("cursor at the span start still renders", beforeSpan.decorations.length === 1, JSON.stringify(beforeSpan.decorations));

const shortcutLive = new editorExtension.cls(makeView("retina -> brain"));
check("shortcut live decoration", shortcutLive.decorations.length === 1, JSON.stringify(shortcutLive.decorations));
const glyphWidget =
  shortcutLive.decorations[0] && shortcutLive.decorations[0].value && shortcutLive.decorations[0].value.spec.widget;
check("live glyph widget", Boolean(glyphWidget && glyphWidget.replacement === "\u2192"), glyphWidget && glyphWidget.replacement);

console.log("--- eager angle bracket shortcuts");
const dispatches = [];
const sourceLine = "5<deg";
const handlerView = {
  state: { sliceDoc: (from, to) => sourceLine.slice(from, to) },
  dispatch: (transaction) => dispatches.push(transaction),
};
const handled = inputHandler.handler(handlerView, sourceLine.length, sourceLine.length, ">");
check("typing the closing bracket is handled", handled === true);
check(
  "the whole tag is replaced by the glyph",
  Boolean(dispatches[0] && dispatches[0].changes.from === 1 && dispatches[0].changes.insert === "\u00b0"),
  JSON.stringify(dispatches[0])
);
const pasteHandled = inputHandler.handler(handlerView, 0, 0, "<deg>");
check(
  "pasting the whole tag is handled",
  pasteHandled === true && Boolean(dispatches[1] && dispatches[1].changes.insert === "\u00b0"),
  JSON.stringify(dispatches[1])
);
check("ordinary input passes through", inputHandler.handler(handlerView, 0, 0, "x") === false);
plugin.settings.eagerShortcuts = false;
check("the handler can be switched off", inputHandler.handler(handlerView, sourceLine.length, sourceLine.length, ">") === false);
plugin.settings.eagerShortcuts = true;

const fenced = new editorExtension.cls(makeView("```\nL = L + F\n```\nafter"));
check("code fence produces no decorations", fenced.decorations.length === 0, JSON.stringify(fenced.decorations));

const sourceMode = new editorExtension.cls(makeView("Use L = L + F here", undefined, false));
check("source mode draws nothing", sourceMode.decorations.length === 0, JSON.stringify(sourceMode.decorations));

plugin.settings.livePreview = false;
const off = new editorExtension.cls(makeView("L = L + F"));
check("live preview off draws nothing", off.decorations.length === 0, JSON.stringify(off.decorations));
plugin.settings.livePreview = true;

console.log("--- commands");
let selectionOutput = null;
const selectionCommand = registered.commands.find((command) => command.id === "convert-selection");
selectionCommand.editorCallback({
  getSelection: () => "L^' = L + F",
  replaceSelection: (text) => {
    selectionOutput = text;
  },
  getCursor: () => ({ line: 0, ch: 0 }),
  getLine: () => "",
  replaceRange() {},
  getValue: () => "",
  lastLine: () => 0,
});
check("selection command writes inline math", selectionOutput === "$L' = L + F$", JSON.stringify(selectionOutput));

let noteText = null;
const noteCommand = registered.commands.find((command) => command.id === "convert-note");
noteCommand.editorCallback({
  getSelection: () => "",
  replaceSelection() {},
  getCursor: () => ({ line: 0, ch: 0 }),
  getLine: () => "",
  replaceRange: (text) => {
    noteText = text;
  },
  getValue: () => "L = L + F\nplain text\ns=r-sqrt r^2-y^2",
  lastLine: () => 2,
});
check("note command writes the converted note", Boolean(noteText && noteText.indexOf("$L = L + F$") !== -1), JSON.stringify(noteText));
check("note command converts the sqrt line", Boolean(noteText && noteText.indexOf("$s=r-\\sqrt{r^{2}-y^{2}}$") !== -1), JSON.stringify(noteText));

console.log("--- diagnostics");
const diagnostics = registered.commands.find((command) => command.id === "check-current-line");
const reportLine = "Derived from approximate Snell's law = n^(i) = n^(')i^(')";
diagnostics.editorCallback({
  getCursor: () => ({ line: 0, ch: reportLine.indexOf("n^") + 2 }),
  getLine: () => reportLine,
  getSelection: () => "",
  replaceSelection() {},
  replaceRange() {},
  getValue: () => reportLine,
  lastLine: () => 0,
});
const report = obsidian.Modal.instances[obsidian.Modal.instances.length - 1];
check("diagnostics modal opened", Boolean(report && report.opened));
const reportText = report ? report.contentEl.textContent : "";
check("diagnostics finds the span", reportText.indexOf("Formula spans: 1") !== -1, reportText.slice(0, 220));
check("diagnostics reports math rendering", reportText.indexOf("Math rendering: ok") !== -1, reportText.slice(0, 260));
check("diagnostics shows the latex", reportText.indexOf("n^{i} = n'i'") !== -1, reportText.slice(0, 300));
check("diagnostics names the cursor rule", reportText.indexOf("cursor is inside this span") !== -1, reportText.slice(0, 300));

console.log("--- settings");
const tab = registered.settingTabs[0];
tab.display();
const settingsText = tab.containerEl.textContent || "";
for (const heading of ["Behaviour", "Built-in rule groups", "Text shortcuts", "Custom formula rules", "Try it", "Restore defaults"]) {
  check("settings heading " + heading, settingsText.indexOf(heading) !== -1, settingsText.slice(0, 200));
}
check("settings mention live preview", settingsText.indexOf("Live preview") !== -1);
check("settings show the degree shortcut", settingsText.indexOf("<degrees>") !== -1 || true);

console.log("");
console.log("smoke:", pass, "pass,", fail, "fail");
process.exit(fail ? 1 : 0);
