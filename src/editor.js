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

// The live preview layer. Like Symbols Prettifier it never edits the source:
// it replaces the range with a widget while the cursor is elsewhere, and shows
// the raw text again as soon as the cursor enters the range.
//
// Cost control: only a window around the viewport is tokenized, not the whole
// document, and the scan for an open code fence or $$ block before the window
// is cached until an edit touches that part of the document. A one million
// character note then costs a fraction of a millisecond per keystroke instead
// of a full document pass.

import { Decoration, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";
import { editorLivePreviewField } from "obsidian";
import { renderMathInto } from "./math.js";
import {
  detectShortcutMatches,
  detectSpans,
  openBlockAt,
  protectedRanges,
} from "./engine.js";

const WINDOW_BACK = 1500;
const WINDOW_FORWARD = 1500;
const VIEWPORT_MARGIN = 200;

class MathWidget extends WidgetType {
  constructor(raw, latex) {
    super();
    this.raw = raw;
    this.latex = latex;
  }

  eq(other) {
    return other.raw === this.raw && other.latex === this.latex;
  }

  toDOM(view) {
    const host = document.createElement("span");
    host.className = "np-math math math-inline";
    const layout = () => {
      if (view && typeof view.requestMeasure === "function") view.requestMeasure();
    };
    renderMathInto(host, this.raw, this.latex, 0, layout);
    // MathJax's glyph widths come from CSS and its fonts load after the
    // element exists, so the widget changes size once or twice without a
    // document change. Without another measure, the caret and the next typed
    // character sit at stale positions and look invisible.
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(layout);
    setTimeout(layout, 60);
    setTimeout(layout, 300);
    try {
      if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === "function") {
        document.fonts.ready.then(layout);
      }
    } catch (error) {
      // A document without fonts is not a place this widget runs.
    }
    return host;
  }

  ignoreEvent() {
    return false;
  }
}

class GlyphWidget extends WidgetType {
  constructor(replacement) {
    super();
    this.replacement = replacement;
  }

  eq(other) {
    return other.replacement === this.replacement;
  }

  toDOM() {
    const host = document.createElement("span");
    host.className = "np-glyph";
    host.textContent = this.replacement;
    return host;
  }

  ignoreEvent() {
    return false;
  }
}

function collectWindow(doc, from, to, plugin) {
  const text = doc.sliceString(from, to);
  if (!plugin.candidate().test(text)) return { spans: [], shortcuts: [] };
  const protectedList = protectedRanges(text);
  const spans = detectSpans(text, {
    mathWords: plugin.mathWords(),
    shortcutToken: plugin.shortcutToken(),
    protected: protectedList,
  });
  const shortcuts = detectShortcutMatches(text, {
    shortcuts: plugin.shortcuts(),
    protected: protectedList,
    exclude: spans,
  });
  return { spans, shortcuts };
}

function createViewPlugin(plugin) {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.prefix = null;
        this.configVersion = plugin.configVersion();
        this.decorations = this.build(view, null);
      }

      update(update) {
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.selectionSet ||
          this.configVersion !== plugin.configVersion()
        ) {
          this.decorations = this.build(update.view, update);
        }
      }

      openAt(view, update, pos) {
        if (this.prefix && this.prefix.pos === pos) {
          if (!update || !update.docChanged) return this.prefix.result;
          let before = false;
          update.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
            if (fromB < pos) before = true;
          });
          if (!before) return this.prefix.result;
          this.prefix = null;
        }
        const result = openBlockAt(view.state.doc, pos);
        this.prefix = { pos, result };
        return result;
      }

      build(view, update) {
        this.configVersion = plugin.configVersion();
        if (!plugin.settings.livePreview) return Decoration.none;
        // Source mode shows the raw markdown by definition; a widget there is
        // in the way of editing, so nothing is drawn.
        if (editorLivePreviewField) {
          try {
            if (view.state.field(editorLivePreviewField) === false) return Decoration.none;
          } catch (error) {
            // A state without the field, such as the test stub.
          }
        }
        const doc = view.state.doc;
        const viewport = view.viewport;
        const from = Math.max(0, viewport.from - WINDOW_BACK);
        const to = Math.min(doc.length, viewport.to + WINDOW_FORWARD);
        const start = this.openAt(view, update, from);
        if (start >= to) return Decoration.none;

        const window = collectWindow(doc, start, to, plugin);
        const items = [];
        for (const span of window.spans) {
          const at = start + span.from;
          const end = start + span.to;
          if (end < viewport.from - VIEWPORT_MARGIN || at > viewport.to + VIEWPORT_MARGIN) continue;
          items.push({ from: at, to: end, kind: "math", raw: span.raw });
        }
        for (const match of window.shortcuts) {
          const at = start + match.from;
          const end = start + match.to;
          if (end < viewport.from - VIEWPORT_MARGIN || at > viewport.to + VIEWPORT_MARGIN) continue;
          items.push({ from: at, to: end, kind: "glyph", replacement: match.replacement });
        }
        items.sort((a, b) => a.from - b.from || a.to - b.to);

        const ranges = view.state.selection.ranges;
        // A cursor at either edge of a span still draws it. Only a cursor
        // strictly inside shows the raw text, which is the editing state.
        const nearSelection = (a, b) => ranges.some((range) => range.from < b && range.to > a);
        const builder = []; // RangeSetBuilder is not needed: replace decorations are sorted
        for (const item of items) {
          if (nearSelection(item.from, item.to)) continue;
          const widget =
            item.kind === "math"
              ? new MathWidget(item.raw, plugin.convert(item.raw))
              : new GlyphWidget(item.replacement);
          builder.push(Decoration.replace({ widget }).range(item.from, item.to));
        }
        return Decoration.set(builder, true);
      }
    },
    { decorations: (value) => value.decorations }
  );
}

// Angle bracket shortcuts are the only kind that must not sit in the file:
// Markdown reads <deg> as an HTML tag and can pull the lines below into one
// raw HTML block. With this handler the closing ">" turns the tag into the
// glyph in the document, so the parser never sees it.
function tagLiterals(plugin) {
  if (!plugin._tagLiterals) {
    const map = new Map();
    for (const shortcut of plugin.shortcuts()) {
      if (/^<[A-Za-z][A-Za-z0-9-]*>$/.test(shortcut.literal)) {
        map.set(shortcut.literal, shortcut.replacement);
      }
    }
    plugin._tagLiterals = map;
  }
  return plugin._tagLiterals;
}

function createInputHandler(plugin) {
  if (!EditorView.inputHandler) return null;
  return EditorView.inputHandler.of((view, from, to, text) => {
    if (plugin.settings.eagerShortcuts === false) return false;
    const literals = tagLiterals(plugin);
    if (!literals.size) return false;

    const paste = literals.get(text);
    if (paste !== undefined) {
      view.dispatch({
        changes: { from, to, insert: paste },
        selection: { anchor: from + paste.length },
        userEvent: "input.type",
      });
      return true;
    }

    if (text !== ">") return false;
    for (const [literal, replacement] of literals) {
      const head = literal.slice(0, -1); // without the closing >
      if (from - head.length < 0) continue;
      if (view.state.sliceDoc(from - head.length, from) !== head) continue;
      view.dispatch({
        changes: { from: from - head.length, to, insert: replacement },
        selection: { anchor: from - head.length + replacement.length },
        userEvent: "input.type",
      });
      return true;
    }
    return false;
  });
}

export function createEditorExtension(plugin) {
  const extensions = [createViewPlugin(plugin)];
  const inputHandler = createInputHandler(plugin);
  if (inputHandler) extensions.push(inputHandler);
  return extensions;
}

// An empty transaction makes every open editor rebuild its decorations, which
// is how a settings change reaches the panes that are already open.
export function refreshEditors(app) {
  if (!app || !app.workspace || !app.workspace.iterateAllLeaves) return;
  app.workspace.iterateAllLeaves((leaf) => {
    const cm = leaf && leaf.view && leaf.view.editor && leaf.view.editor.cm;
    if (cm && typeof cm.dispatch === "function") cm.dispatch({});
  });
}
