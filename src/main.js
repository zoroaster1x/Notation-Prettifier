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

import { MarkdownRenderer, Modal, Notice, Plugin, Setting, editorLivePreviewField, loadMathJax, renderMath } from "obsidian";
import { createEditorExtension, refreshEditors } from "./editor.js";
import {
  bakeText,
  bakeTextAsync,
  candidateRegex,
  convertSpan,
  detectShortcutMatches,
  detectSpans,
  shortcutMapFor,
} from "./engine.js";
import { attachMathStylesheet, ensureMathJax, hasMathStylesheet } from "./math.js";
import { buildDebugReport } from "./debug.js";
import { readingProcessor } from "./reading.js";
import { compileRules, compileShortcuts, mathWordsFor, shortcutTokenRegex } from "./rules.js";
import { DEFAULT_SETTINGS, NotationPrettifierSettingTab } from "./settings.js";

class ConversionPreviewModal extends Modal {
  constructor(app, converted, count, onApply) {
    super(app);
    this.converted = converted;
    this.count = count;
    this.onApply = onApply;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("np-modal");
    contentEl.createEl("h3", { text: "Notation Prettifier preview" });
    contentEl.createEl("p", {
      text:
        this.count +
        " formula" +
        (this.count === 1 ? "" : "s") +
        " would be wrapped in math delimiters. Nothing is written until you apply.",
    });
    const scroller = contentEl.createDiv({ cls: "np-preview" });
    scroller.createEl("pre", { text: this.converted });
    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText("Apply")
          .setCta()
          .onClick(() => {
            this.onApply();
            this.close();
          })
      )
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()));
  }

  onClose() {
    this.contentEl.empty();
  }
}

class ReportModal extends Modal {
  constructor(app, title, text) {
    super(app);
    this.title = title;
    this.text = text;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("np-modal");
    contentEl.createEl("h3", { text: this.title });
    const scroller = contentEl.createDiv({ cls: "np-preview" });
    scroller.createEl("pre", { text: this.text });
  }

  onClose() {
    this.contentEl.empty();
  }
}

export default class NotationPrettifierPlugin extends Plugin {
  async onload() {
    this._cache = null;
    this._configVersion = 0;
    await this.loadSettings();
    this.applyMathScale();
    ensureMathJax().then(() => this.warmUpMath());
    this.registerEditorExtension(createEditorExtension(this));
    this.registerMarkdownPostProcessor(readingProcessor(this));
    this.addCommand({
      id: "convert-selection",
      name: "Convert notation in the selection or line to LaTeX",
      editorCallback: (editor) => this.convertSelection(editor),
    });
    this.addCommand({
      id: "convert-note",
      name: "Convert notation in the whole note to LaTeX",
      editorCallback: (editor) => this.convertNote(editor),
    });
    this.addCommand({
      id: "preview-note",
      name: "Preview the whole note conversion",
      editorCallback: (editor) => this.previewNote(editor),
    });
    this.addCommand({
      id: "check-current-line",
      name: "Check the current line (diagnostics)",
      editorCallback: (editor) => this.checkCurrentLine(editor),
    });
    this.addCommand({
      id: "write-debug-report",
      name: "Write a debug report to the plugin folder",
      callback: () => this.writeDebugReport(),
    });
    this.addCommand({
      id: "toggle-live-preview",
      name: "Toggle live preview",
      callback: () => this.toggleLivePreview(),
    });
    this.addSettingTab(new NotationPrettifierSettingTab(this.app, this));
  }

  async loadSettings() {
    const data = (await this.loadData()) || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    this.settings.groups = Object.assign({}, DEFAULT_SETTINGS.groups, data.groups || {});
    this._cache = null;
  }

  async saveSettings() {
    this._cache = null;
    this._conversions = null;
    this._configVersion++;
    this.applyMathScale();
    await this.saveData(this.settings);
    refreshEditors(this.app);
    // Reading view panes hold their own render, so a pattern change has to ask
    // them to draw again or the old conversion stays on screen.
    this.refreshPreviews();
  }

  // MathJax draws its letters narrower than the interface font, so the reader
  // can scale this plugin's formulas without touching Obsidian's own math.
  applyMathScale() {
    const scale = Number(this.settings.mathScale) || 100;
    try {
      document.body.style.setProperty("--np-math-scale", String(scale / 100));
    } catch (error) {
      // A document without a body is not a place this plugin runs.
    }
  }

  onunload() {
    try {
      document.body.style.removeProperty("--np-math-scale");
    } catch (error) {
      // Nothing to clean up.
    }
  }

  configVersion() {
    return this._configVersion;
  }

  _compiled() {
    if (!this._cache) {
      const shortcuts = compileShortcuts(this.settings);
      this._cache = {
        rules: compileRules(this.settings),
        shortcuts,
        mathWords: mathWordsFor(this.settings),
        shortcutToken: shortcutTokenRegex(shortcuts),
        shortcutMap: shortcutMapFor(shortcuts),
        candidate: candidateRegex(shortcuts),
      };
      this._conversions = null;
    }
    return this._cache;
  }

  rules() {
    return this._compiled().rules;
  }

  shortcuts() {
    return this._compiled().shortcuts;
  }

  mathWords() {
    return this._compiled().mathWords;
  }

  shortcutToken() {
    return this._compiled().shortcutToken;
  }

  shortcutMap() {
    return this._compiled().shortcutMap;
  }

  candidate() {
    return this._compiled().candidate;
  }

  // The same raw span appears in many places (a formula repeated in a table,
  // a reading view re-render, a settings preview). Rules are cheap but not
  // free, so the compiled result is memoised per configuration version. The
  // cache is read again after rules() because a settings change can reset it.
  convert(raw) {
    let cache = this._conversions;
    if (!cache) {
      cache = new Map();
      this._conversions = cache;
    }
    let latex = cache.get(raw);
    if (latex === undefined) {
      latex = convertSpan(raw, this.rules());
      cache = this._conversions || (this._conversions = new Map());
      if (cache.size >= 4000) cache.clear();
      cache.set(raw, latex);
    }
    return latex;
  }

  bakeOptions(overrides) {
    return Object.assign(
      {
        rules: this.rules(),
        shortcuts: this.shortcuts(),
        mathWords: this.mathWords(),
        shortcutToken: this.shortcutToken(),
        shortcutMap: this.shortcutMap(),
        displayFormulaLines: this.settings.displayFormulaLines !== false,
      },
      overrides || {}
    );
  }

  convertSelection(editor) {
    const selection = editor.getSelection();
    if (selection && selection.trim()) {
      const result = bakeText(selection, this.bakeOptions({ displayFormulaLines: false }));
      if (!result.count) {
        new Notice("Notation Prettifier: no notation found in the selection.");
        return;
      }
      editor.replaceSelection(result.text);
      new Notice(this.countNotice(result.count) + " in the selection.");
      return;
    }
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    const result = bakeText(line, this.bakeOptions());
    if (!result.count) {
      new Notice("Notation Prettifier: no notation found on this line.");
      return;
    }
    editor.replaceRange(result.text, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: line.length });
    new Notice(this.countNotice(result.count) + " on this line.");
  }

  async convertNote(editor) {
    const source = editor.getValue();
    if (source.length > 200000) {
      const progress = new Notice("Notation Prettifier: converting the note...", 0);
      const result = await bakeTextAsync(
        source,
        this.bakeOptions(),
        (fraction) => progress.setMessage("Notation Prettifier: converting " + Math.round(fraction * 100) + "%")
      );
      progress.hide();
      if (!result.count) {
        new Notice("Notation Prettifier: no notation found in this note.");
        return;
      }
      this.replaceWholeNote(editor, result.text);
      new Notice(this.countNotice(result.count) + " in this note.");
      return;
    }
    const result = bakeText(source, this.bakeOptions());
    if (!result.count) {
      new Notice("Notation Prettifier: no notation found in this note.");
      return;
    }
    this.replaceWholeNote(editor, result.text);
    new Notice(this.countNotice(result.count) + " in this note.");
  }

  async previewNote(editor) {
    const source = editor.getValue();
    let result;
    if (source.length > 200000) {
      const progress = new Notice("Notation Prettifier: converting the note...", 0);
      result = await bakeTextAsync(
        source,
        this.bakeOptions(),
        (fraction) => progress.setMessage("Notation Prettifier: converting " + Math.round(fraction * 100) + "%")
      );
      progress.hide();
    } else {
      result = bakeText(source, this.bakeOptions());
    }
    if (!result.count) {
      new Notice("Notation Prettifier: no notation found in this note.");
      return;
    }
    new ConversionPreviewModal(this.app, result.text, result.count, () => {
      this.replaceWholeNote(editor, result.text);
      new Notice(this.countNotice(result.count) + " in this note.");
    }).open();
  }

  replaceWholeNote(editor, text) {
    const last = editor.lastLine();
    editor.replaceRange(text, { line: 0, ch: 0 }, { line: last, ch: editor.getLine(last).length });
  }

  countNotice(count) {
    return "Notation Prettifier: converted " + count + " formula" + (count === 1 ? "" : "s");
  }

  async toggleLivePreview() {
    this.settings.livePreview = !this.settings.livePreview;
    await this.saveSettings();
    new Notice("Notation Prettifier: live preview " + (this.settings.livePreview ? "on" : "off") + ".");
  }

  async writeDebugReport() {
    const report = buildDebugReport(this);
    const path = this.app.vault.configDir + "/plugins/notation-prettifier/debug-report.json";
    try {
      await this.app.vault.adapter.write(path, JSON.stringify(report, null, 2));
      new Notice("Notation Prettifier: wrote " + path, 6000);
    } catch (error) {
      new Notice("Notation Prettifier: could not write the report: " + ((error && error.message) || error), 6000);
    }
  }

  editorMode(editor) {
    try {
      const cm = editor.cm;
      if (!cm || !cm.state || typeof cm.state.field !== "function") return "unknown";
      if (editorLivePreviewField) {
        try {
          return cm.state.field(editorLivePreviewField) ? "Live Preview" : "Source mode";
        } catch (error) {
          return "unknown";
        }
      }
      return "unknown (this Obsidian does not expose the live preview field)";
    } catch (error) {
      return "unknown";
    }
  }

  mathRenderState() {
    try {
      const element = renderMath("n^{2}", false);
      const html = element && element.outerHTML ? element.outerHTML.slice(0, 160) : "";
      return (
        (element ? "ok" : "returned nothing") +
        ", stylesheet " +
        (hasMathStylesheet() ? "attached" : "missing") +
        (html ? ", " + html : "")
      );
    } catch (error) {
      return "threw: " + (error && error.message ? error.message : String(error));
    }
  }

  // Rendering a tiny formula once through Obsidian's own renderer makes the app
  // attach the MathJax CHTML stylesheet, which is what makes the glyphs of
  // plugin-rendered math visible. The direct attach covers a vault that never
  // rendered its own math, and both are retried for a few seconds.
  warmUpMath() {
    try {
      const holder = document.createElement("div");
      holder.style.position = "absolute";
      holder.style.visibility = "hidden";
      holder.style.pointerEvents = "none";
      document.body.appendChild(holder);
      const result = MarkdownRenderer.render(this.app, "$x$", holder, "", this);
      if (result && typeof result.then === "function") {
        result.then(() => holder.remove()).catch(() => holder.remove());
      } else {
        setTimeout(() => holder.remove(), 500);
      }
    } catch (error) {
      // The direct stylesheet attach below still runs.
    }

    const delays = [300, 1000, 2500, 5000];
    delays.forEach((delay, index) => {
      setTimeout(() => {
        const ready = hasMathStylesheet() || attachMathStylesheet();
        if (ready) {
          if (!this._mathReadyNoticed) {
            this._mathReadyNoticed = true;
            this.refreshPreviews();
          }
          return;
        }
        if (index === delays.length - 1) {
          new Notice(
            "Notation Prettifier " + this.manifest.version +
              ": the MathJax stylesheet is missing, so formulas stay as text. Run Check the current line for details.",
            8000
          );
        }
      }, delay);
    });
  }

  refreshPreviews() {
    const app = this.app;
    if (!app || !app.workspace || !app.workspace.iterateAllLeaves) return;
    app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf && leaf.view;
      if (!view || !view.previewMode || typeof view.previewMode.rerender !== "function") return;
      try {
        view.previewMode.rerender(true);
      } catch (error) {
        // A view that cannot rerender simply keeps the retry from its elements.
      }
    });
  }

  // Explains what the engine sees on one line, which is the fastest way to tell
  // a cursor sitting inside a span from a rule that did not fire.
  checkCurrentLine(editor) {
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    const spans = detectSpans(line, {
      mathWords: this.mathWords(),
      shortcutToken: this.shortcutToken(),
    });
    const shortcuts = detectShortcutMatches(line, {
      shortcuts: this.shortcuts(),
      exclude: spans,
    });
    const report = [
      "Notation Prettifier " + this.manifest.version,
      "Live preview: " + (this.settings.livePreview ? "on" : "off") + ", Reading view: " + (this.settings.readingView ? "on" : "off"),
      "Editor: " + this.editorMode(editor),
      "Math rendering: " + this.mathRenderState(),
      "renderMath: " + (typeof renderMath === "function" ? "exported" : "not exported") + ", loadMathJax: " + (typeof loadMathJax === "function" ? "exported" : "not exported"),
      "",
      "Line " + (cursor.line + 1) + ": " + line,
      "",
      "Formula spans: " + spans.length,
    ];
    for (const span of spans) {
      const inside = cursor.ch > span.from && cursor.ch < span.to;
      report.push(
        "  [" + span.from + ".." + span.to + "] " + JSON.stringify(span.raw) + "  ->  $" + this.convert(span.raw) + "$" +
          (inside ? "   <- the cursor is inside this span, so it stays raw" : "")
      );
    }
    if (!spans.length) report.push("  none. If you expected one, the line needs a relation (=, an arrow), or a script or prime on a symbol base.");
    report.push("Shortcut matches: " + shortcuts.length);
    for (const match of shortcuts) {
      const inside = cursor.ch > match.from && cursor.ch < match.to;
      report.push(
        "  [" + match.from + ".." + match.to + "] -> " + match.replacement + (inside ? "   <- the cursor is inside this match, so it stays raw" : "")
      );
    }
    report.push("");
    report.push("A formula is drawn only when the cursor is not strictly inside it.");
    report.push("Source mode never draws; switch to Live Preview or Reading view.");
    new ReportModal(this.app, "Notation Prettifier check", report.join("\n")).open();
  }
}
