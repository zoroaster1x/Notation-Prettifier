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

import { PluginSettingTab, Setting } from "obsidian";
import { bakeText } from "./engine.js";
import { processElement } from "./reading.js";
import {
  DEFAULT_SHORTCUTS_TEXT,
  RULE_GROUPS,
  describeGroups,
  invalidCustomRules,
  parseCustomShortcuts,
  parseCustomRules,
} from "./rules.js";

export const DEFAULT_SETTINGS = {
  livePreview: true,
  readingView: true,
  eagerShortcuts: true,
  displayFormulaLines: true,
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

const BEHAVIOUR = [
  {
    key: "livePreview",
    name: "Live preview",
    description:
      "Render notation as math while you type. The note text is not changed; the cursor inside a range shows the raw text again.",
  },
  {
    key: "readingView",
    name: "Reading view",
    description: "Render notation as math in reading view and in exported HTML.",
  },
  {
    key: "eagerShortcuts",
    name: "Rewrite angle bracket shortcuts as you type",
    description:
      "Typing <deg> writes the degree sign into the note immediately, so Markdown never sees a tag and cannot swallow the lines below. The square bracket forms are always safe; turn this off to leave the source untouched.",
  },
  {
    key: "displayFormulaLines",
    name: "Display math for a line that is one formula",
    description:
      "When baking, a line whose whole content is one formula becomes $$...$$ instead of $...$. Applies to the note and line commands, not to a selection.",
  },
];

export class NotationPrettifierSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("np-settings");
    new Setting(containerEl)
      .setName("Notation Prettifier " + (this.plugin.manifest ? this.plugin.manifest.version : ""))
      .setHeading();

    this.renderBehaviour(containerEl);
    this.renderGroups(containerEl);
    this.renderShortcuts(containerEl);
    this.renderCustomRules(containerEl);
    this.renderTryIt(containerEl);
    this.renderReference(containerEl);
    this.renderReset(containerEl);
  }

  renderBehaviour(containerEl) {
    new Setting(containerEl).setName("Behaviour").setHeading();
    for (const item of BEHAVIOUR) {
      new Setting(containerEl)
        .setName(item.name)
        .setDesc(item.description)
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings[item.key] !== false).onChange(async (value) => {
            this.plugin.settings[item.key] = value;
            await this.plugin.saveSettings();
          })
        );
    }
  }

  renderGroups(containerEl) {
    new Setting(containerEl).setName("Built-in rule groups").setHeading();
    const groups = [
      {
        id: "shortcuts",
        name: "Text shortcuts",
        description:
          "Literal replacements such as <degrees> to a degree sign. They apply to plain text and inside formulas. Edit the list below.",
      },
      ...RULE_GROUPS.map((group) => ({
        id: group.id,
        name: group.name,
        description: group.description,
      })),
    ];
    for (const group of groups) {
      new Setting(containerEl)
        .setName(group.name)
        .setDesc(group.description)
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings.groups[group.id] !== false).onChange(async (value) => {
            this.plugin.settings.groups[group.id] = value;
            await this.plugin.saveSettings();
          })
        );
    }
  }

  renderShortcuts(containerEl) {
    new Setting(containerEl).setName("Text shortcuts").setHeading();
    const setting = new Setting(containerEl)
      .setName("Shortcut list")
      .setDesc("One per line: literal => replacement. The literal is plain text, not a regular expression. Changes apply as you type.");
    const hint = containerEl.createDiv({ cls: "np-hint" });
    setting.addTextArea((area) => {
      area.setValue(this.plugin.settings.shortcutsText);
      area.inputEl.rows = 4;
      area.inputEl.addClass("np-textarea");
      area.onChange(async (value) => {
        this.plugin.settings.shortcutsText = value;
        await this.plugin.saveSettings();
        this.updateShortcutHint(hint);
      });
    });
    this.updateShortcutHint(hint);
  }

  updateShortcutHint(hint) {
    const parsed = parseCustomShortcuts(this.plugin.settings.shortcutsText);
    const bad = [];
    for (const rawLine of String(this.plugin.settings.shortcutsText || "").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      if (line.lastIndexOf("=>") <= 0) bad.push(line.slice(0, 50));
    }
    if (bad.length) {
      hint.setText("Skipped, no \"=>\" found: " + bad.join(" | "));
      hint.addClass("np-hint-error");
    } else {
      hint.setText(parsed.length + " shortcut" + (parsed.length === 1 ? "" : "s") + " active.");
      hint.removeClass("np-hint-error");
    }
  }

  renderCustomRules(containerEl) {
    new Setting(containerEl).setName("Custom formula rules").setHeading();
    const setting = new Setting(containerEl)
      .setName("Rule list")
      .setDesc(
        "One per line: regular expression => replacement ($1 refers to the first group). These run after the built-in groups, inside formulas only. Write \\\\ for a literal backslash, for example L\\\\^' => L'."
      );
    const hint = containerEl.createDiv({ cls: "np-hint" });
    setting.addTextArea((area) => {
      area.setValue(this.plugin.settings.customRulesText);
      area.inputEl.rows = 6;
      area.inputEl.addClass("np-textarea");
      area.onChange(async (value) => {
        this.plugin.settings.customRulesText = value;
        await this.plugin.saveSettings();
        this.updateRulesHint(hint);
      });
    });
    this.updateRulesHint(hint);
  }

  updateRulesHint(hint) {
    const rules = parseCustomRules(this.plugin.settings.customRulesText);
    const bad = invalidCustomRules(this.plugin.settings.customRulesText);
    if (bad.length) {
      hint.setText("Invalid pattern, skipped: " + bad.join(" | "));
      hint.addClass("np-hint-error");
    } else if (rules.length) {
      hint.setText(rules.length + " custom rule" + (rules.length === 1 ? "" : "s") + " active.");
      hint.removeClass("np-hint-error");
    } else {
      hint.setText("No custom rules yet. Add one line per rule.");
      hint.removeClass("np-hint-error");
    }
  }

  renderTryIt(containerEl) {
    new Setting(containerEl).setName("Try it").setHeading();
    const setting = new Setting(containerEl)
      .setName("Sample")
      .setDesc("Type rough notation and see what the plugin renders and what the bake command would write.");
    const source = containerEl.createEl("pre", { cls: "np-try-source" });
    const preview = containerEl.createDiv({ cls: "np-try-preview" });

    const update = (value) => {
      const sample = value || "";
      if (!sample) {
        source.setText("");
        preview.empty();
        return;
      }
      const baked = bakeText(sample, this.plugin.bakeOptions({ displayFormulaLines: false }));
      source.setText(baked.count ? baked.text : "No formula found yet.");
      preview.empty();
      const line = preview.createDiv({ cls: "np-try-line" });
      line.textContent = sample;
      processElement(line, this.plugin);
    };

    setting.addText((text) => {
      text.setPlaceholder("L^' = L + F, i_1^' , sqrt r^2-y^2, 5<degrees>");
      text.onChange(update);
    });
    update("");
  }

  renderReference(containerEl) {
    const wrapper = containerEl.createEl("details", { cls: "np-reference" });
    wrapper.createEl("summary", { text: "Built-in rule reference" });
    wrapper.createEl("p", {
      cls: "np-reference-note",
      text: "These are the patterns that ship with the plugin. A custom rule can reuse or override any of them.",
    });
    const shortcuts = parseCustomShortcuts(this.plugin.settings.shortcutsText);
    if (shortcuts.length) {
      wrapper.createEl("h4", { text: "Text shortcuts" });
      const list = wrapper.createEl("pre");
      list.setText(shortcuts.map((s) => s.literal + " => " + s.replacement).join("\n"));
    }
    for (const group of describeGroups()) {
      wrapper.createEl("h4", { text: group.name });
      wrapper.createEl("p", { text: group.description });
      const list = wrapper.createEl("pre");
      list.setText(group.rules.map((rule) => rule.pattern + " => " + rule.replacement).join("\n"));
    }
  }

  renderReset(containerEl) {
    new Setting(containerEl)
      .setName("Restore defaults")
      .setDesc("Put every toggle, shortcut and custom rule back to the shipped values.")
      .addButton((button) =>
        button.setButtonText("Restore").onClick(async () => {
          this.plugin.settings.livePreview = DEFAULT_SETTINGS.livePreview;
          this.plugin.settings.readingView = DEFAULT_SETTINGS.readingView;
          this.plugin.settings.displayFormulaLines = DEFAULT_SETTINGS.displayFormulaLines;
          this.plugin.settings.groups = Object.assign({}, DEFAULT_SETTINGS.groups);
          this.plugin.settings.shortcutsText = DEFAULT_SETTINGS.shortcutsText;
          this.plugin.settings.customRulesText = DEFAULT_SETTINGS.customRulesText;
          await this.plugin.saveSettings();
          this.display();
        })
      );
  }
}
