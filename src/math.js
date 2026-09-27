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

// MathJax is loaded lazily by Obsidian, and the CHTML output draws its glyphs
// through a stylesheet that Obsidian only attaches a moment after it renders
// its own math. A plugin calling renderMath alone gets containers whose
// characters are invisible. These helpers load the engine, attach the
// stylesheet, and retry a render until it produces real content.

import { loadMathJax, renderMath } from "obsidian";

let loadedPromise = null;
let stylesheet = null;
let stylesheetChecked = false;

export function ensureMathJax() {
  if (loadedPromise) return loadedPromise;
  try {
    if (typeof loadMathJax === "function") {
      loadedPromise = Promise.resolve(loadMathJax());
      loadedPromise.catch(() => {});
    } else {
      loadedPromise = Promise.resolve();
    }
  } catch (error) {
    loadedPromise = null;
  }
  return loadedPromise || Promise.resolve();
}

export function hasMathStylesheet() {
  if (stylesheet && stylesheet.isConnected) return true;
  try {
    for (const style of Array.from(document.head.querySelectorAll("style"))) {
      if ((style.textContent || "").indexOf("mjx-container") !== -1) return true;
    }
  } catch (error) {
    // A document without a head is not a place this plugin runs.
  }
  return false;
}

// Obsidian's own math renderer attaches MathJax.chtmlStylesheet() to the head
// 100 ms after a render. Doing the same keeps plugin-rendered math visible
// without waiting for the note to contain its own $...$ formula.
export function attachMathStylesheet() {
  if (hasMathStylesheet()) return true;
  try {
    if (typeof MathJax === "undefined" || typeof MathJax.chtmlStylesheet !== "function") return false;
    const sheet = MathJax.chtmlStylesheet();
    if (!sheet) return false;
    if (!document.head.contains(sheet)) document.head.appendChild(sheet);
    stylesheet = sheet;
    return true;
  } catch (error) {
    return false;
  }
}

function looksRendered(element) {
  if (!element) return false;
  try {
    if (element.querySelector && element.querySelector("mjx-math, .katex-html, svg")) return true;
  } catch (error) {
    // Fall through to the text check.
  }
  return Boolean((element.textContent || "").trim());
}

export function tryRenderMath(latex, display) {
  try {
    if (typeof renderMath !== "function") {
      ensureMathJax();
      return null;
    }
    const element = renderMath(latex, display);
    if (!looksRendered(element)) {
      ensureMathJax();
      return null;
    }
    if (!stylesheetChecked) {
      stylesheetChecked = true;
      attachMathStylesheet();
    }
    return element;
  } catch (error) {
    ensureMathJax();
    return null;
  }
}

// Fills host with the typeset formula. Until MathJax answers, the raw text
// stays visible and a timer tries again, up to about ten seconds.
export function renderMathInto(host, raw, latex, attempt = 0) {
  const rendered = tryRenderMath(latex, false);
  if (rendered) {
    while (host.firstChild) host.removeChild(host.firstChild);
    host.appendChild(rendered);
    return true;
  }
  host.textContent = raw;
  if (attempt < 12) {
    setTimeout(() => {
      if (host.isConnected === false) return;
      renderMathInto(host, raw, latex, attempt + 1);
    }, Math.min(2000, 120 * (attempt + 1)));
  }
  return false;
}
