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

// MathJax and its CHTML stylesheet.
//
// renderMath is MathJax.tex2chtml(source, { display }), and its glyphs come
// from a stylesheet Obsidian attaches a moment after it renders its own math.
// A plugin calling renderMath alone gets containers whose characters are
// invisible, so nothing is drawn until the stylesheet is confirmed: the raw
// text stays visible and a timer retries. Invisible math can never happen.

import { loadMathJax, renderMath } from "obsidian";

let loadedPromise = null;
let attachedStylesheet = null;

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

function mathJaxGlobal() {
  if (typeof MathJax !== "undefined" && MathJax) return MathJax;
  if (typeof window !== "undefined" && window.MathJax) return window.MathJax;
  return null;
}

// The glyph rules are the marker. Obsidian's own CSS mentions mjx-container,
// so that string is not enough to know the CHTML stylesheet is attached.
export function hasMathStylesheet() {
  try {
    if (attachedStylesheet && attachedStylesheet.isConnected) return true;
    for (const style of Array.from(document.head.querySelectorAll("style"))) {
      const text = style.textContent || "";
      if (text.indexOf("mjx-c") !== -1 || text.indexOf("MJX-TEX") !== -1) return true;
    }
  } catch (error) {
    // A document without a head is not a place this plugin runs.
  }
  return false;
}

export function attachMathStylesheet() {
  if (hasMathStylesheet()) return true;
  try {
    const mathJax = mathJaxGlobal();
    if (!mathJax || typeof mathJax.chtmlStylesheet !== "function") return false;
    const sheet = mathJax.chtmlStylesheet();
    if (!sheet) return false;
    if (!document.head.contains(sheet)) document.head.appendChild(sheet);
    attachedStylesheet = sheet;
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
    // A container without the glyph stylesheet draws nothing. Keep the raw
    // text instead and retry once the stylesheet is attached.
    if (!hasMathStylesheet() && !attachMathStylesheet()) return null;
    return element;
  } catch (error) {
    ensureMathJax();
    return null;
  }
}

// Fills host with the typeset formula. Until the engine and its stylesheet
// answer, the raw text stays visible and a timer tries again.
export function renderMathInto(host, raw, latex, attempt = 0) {
  const rendered = tryRenderMath(latex, false);
  if (rendered) {
    while (host.firstChild) host.removeChild(host.firstChild);
    host.appendChild(rendered);
    return true;
  }
  host.textContent = raw;
  if (attempt < 40) {
    setTimeout(() => {
      if (host.isConnected === false) return;
      renderMathInto(host, raw, latex, attempt + 1);
    }, Math.min(2000, 100 + 80 * attempt));
  }
  return false;
}
