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

import { Modal, Notice, Plugin, Setting } from "obsidian";
import { createEditorExtension, refreshEditors } from "./editor.js";
import { bakeText, bakeTextAsync, candidateRegex, convertSpan } from "./engine.js";
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

export default class NotationPrettifierPlugin extends Plugin {
  async onload() {
    this._cache = null;
    this._configVersion = 0;
    await this.loadSettings();
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
    this._configVersion++;
    await this.saveData(this.settings);
    refreshEditors(this.app);
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

  candidate() {
    return this._compiled().candidate;
  }

  // The same raw span appears in many places (a formula repeated in a table,
  // a reading view re-render, a settings preview). Rules are cheap but not
  // free, so the compiled result is memoised per configuration version.
  convert(raw) {
    if (!this._conversions) this._conversions = new Map();
    let latex = this._conversions.get(raw);
    if (latex === undefined) {
      if (this._conversions.size >= 4000) this._conversions.clear();
      latex = convertSpan(raw, this.rules());
      this._conversions.set(raw, latex);
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
}
