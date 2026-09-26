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

// The reading view layer. It walks the rendered block, finds formula spans and
// shortcuts in text nodes and replaces them in place, so nothing else in the
// block (bold, links, list markers) is disturbed.

import { renderMath } from "obsidian";
import { detectShortcutMatches, detectSpans, protectedRanges } from "./engine.js";

const SKIP_TAGS = new Set([
  "CODE",
  "PRE",
  "SCRIPT",
  "STYLE",
  "TEXTAREA",
  "INPUT",
  "MJX-CONTAINER",
  "MJX-ASSISTIVE-MML",
]);
const SKIP_CLASSES = ["np-math", "np-glyph", "math", "math-inline", "math-block"];

function shouldSkip(element) {
  if (SKIP_TAGS.has(element.tagName)) return true;
  const classList = element.classList;
  if (classList) {
    for (const name of SKIP_CLASSES) if (classList.contains(name)) return true;
  }
  return false;
}

function makeMathElement(raw, latex) {
  const host = document.createElement("span");
  host.className = "np-math";
  try {
    const rendered = renderMath(latex, false);
    if (rendered) host.appendChild(rendered);
    else host.textContent = "$" + latex + "$";
  } catch (error) {
    host.textContent = raw;
  }
  return host;
}

function makeGlyphElement(replacement) {
  const host = document.createElement("span");
  host.className = "np-glyph";
  host.textContent = replacement;
  return host;
}

function renderTextNode(node, plugin) {
  const value = node.nodeValue || "";
  if (!value || value.length < 2) return;
  if (!plugin.candidate().test(value)) return;
  const protectedRangesList = protectedRanges(value);
  const spans = detectSpans(value, {
    mathWords: plugin.mathWords(),
    shortcutToken: plugin.shortcutToken(),
    protected: protectedRangesList,
  });
  const shortcuts = detectShortcutMatches(value, {
    shortcuts: plugin.shortcuts(),
    protected: protectedRangesList,
    exclude: spans,
  });
  const matches = [];
  for (const span of spans) {
    matches.push({ from: span.from, to: span.to, kind: "math", raw: span.raw });
  }
  for (const shortcut of shortcuts) {
    matches.push({ from: shortcut.from, to: shortcut.to, kind: "glyph", replacement: shortcut.replacement });
  }
  if (!matches.length) return;
  matches.sort((a, b) => a.from - b.from);
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const tail = node.splitText(match.to);
    const element =
      match.kind === "math"
        ? makeMathElement(match.raw, plugin.convert(match.raw))
        : makeGlyphElement(match.replacement);
    node.parentNode.insertBefore(element, tail);
    node.nodeValue = node.nodeValue.slice(0, match.from);
  }
}

export function processElement(element, plugin) {
  for (let child = element.firstChild; child; ) {
    const next = child.nextSibling;
    if (child.nodeType === 3) {
      renderTextNode(child, plugin);
    } else if (child.nodeType === 1 && !shouldSkip(child)) {
      processElement(child, plugin);
    }
    child = next;
  }
}

export function readingProcessor(plugin) {
  return (element) => {
    if (!plugin.settings.readingView) return;
    if (!element.textContent) return;
    processElement(element, plugin);
  };
}
