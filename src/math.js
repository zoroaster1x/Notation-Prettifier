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

// The Obsidian module is read through its namespace so the test stubs can swap
// renderMath and loadMathJax between cases and exercise the failure paths.
import * as obsidian from "obsidian";

let loadedPromise = null;
let attachedStylesheet = null;

export function ensureMathJax() {
  if (loadedPromise) return loadedPromise;
  try {
    if (typeof obsidian.loadMathJax === "function") {
      loadedPromise = Promise.resolve(obsidian.loadMathJax());
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
export { mathJaxGlobal };

// The glyph rules are the marker. Obsidian's own CSS mentions mjx-container,
// so that string is not enough to know the CHTML stylesheet is attached. The
// authoritative answer is the stylesheet element MathJax hands out.
export function hasMathStylesheet() {
  try {
    if (attachedStylesheet && attachedStylesheet.isConnected) return true;
    const mathJax = mathJaxGlobal();
    if (mathJax && typeof mathJax.chtmlStylesheet === "function") {
      const sheet = mathJax.chtmlStylesheet();
      if (sheet && document.head.contains(sheet)) {
        attachedStylesheet = sheet;
        return true;
      }
    }
    for (const style of Array.from(document.head.querySelectorAll("style"))) {
      const text = style.textContent || "";
      if (text.indexOf("mjx-c::before") !== -1) return true;
    }
  } catch (error) {
    // A document without a head is not a place this plugin runs.
  }
  return false;
}

// MathJax's CHTML stylesheet grows as new characters are typeset: a glyph's
// content rule is added when its character is first used. Obsidian re-applies
// the stylesheet after every render for that reason, and toggling the data
// attribute forces the browser to re-evaluate the rules. Skipping this leaves
// every newly used character blank while older ones keep drawing, which looks
// exactly like "only the primes show".
function refreshStylesheet() {
  const mathJax = mathJaxGlobal();
  if (!mathJax || typeof mathJax.chtmlStylesheet !== "function") return false;
  let sheet = null;
  try {
    sheet = mathJax.chtmlStylesheet();
  } catch (error) {
    return false;
  }
  if (!sheet) return false;
  if (attachedStylesheet && attachedStylesheet !== sheet && attachedStylesheet.parentNode) {
    attachedStylesheet.remove();
  }
  if (!document.head.contains(sheet)) document.head.appendChild(sheet);
  attachedStylesheet = sheet;
  if (sheet.dataset) {
    sheet.dataset.change = sheet.dataset.change === "1" ? "2" : "1";
  }
  return true;
}

export function attachMathStylesheet() {
  return refreshStylesheet() || hasMathStylesheet();
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
    if (typeof obsidian.renderMath !== "function") {
      ensureMathJax();
      return null;
    }
    const element = obsidian.renderMath(latex, display);
    if (!looksRendered(element)) {
      ensureMathJax();
      return null;
    }
    // The stylesheet gains the rules for every newly used character, so it is
    // re-applied after each render, before the element is accepted.
    refreshStylesheet();
    if (!hasMathStylesheet()) return null;
    return element;
  } catch (error) {
    ensureMathJax();
    return null;
  }
}

// Fills host with the typeset formula. Until the engine and its stylesheet
// answer, the raw text stays visible and a timer tries again. onLayout runs
// whenever the host content changes, so CodeMirror can re-measure a widget
// whose size arrived asynchronously.
export function renderMathInto(host, raw, latex, attempt = 0, onLayout) {
  const rendered = tryRenderMath(latex, false);
  if (rendered) {
    while (host.firstChild) host.removeChild(host.firstChild);
    host.appendChild(rendered);
    // Obsidian marks its own math is-loaded once typeset; themes hang fade-in
    // and sizing on that class.
    if (host.classList) host.classList.add("is-loaded");
    if (onLayout) onLayout();
    verifyVisible(host, raw, latex, attempt, onLayout);
    return true;
  }
  host.textContent = raw;
  if (host.classList) host.classList.remove("is-loaded");
  if (onLayout) onLayout();
  if (attempt < 40) {
    setTimeout(() => {
      if (host.isConnected === false) return;
      renderMathInto(host, raw, latex, attempt + 1, onLayout);
    }, Math.min(2000, 100 + 80 * attempt));
  }
  return false;
}

// After the element is in the page, a zero sized box means the math did not
// actually draw (a missing stylesheet, a missing font, an unusual host). Fall
// back to the raw text and try again. Measurement is skipped in a test DOM,
// which reports every element as zero sized.
function verifyVisible(host, raw, latex, attempt, onLayout) {
  if (!mathJaxGlobal()) return;
  if (typeof host.getBoundingClientRect !== "function") return;
  setTimeout(() => {
    if (host.isConnected === false) return;
    let visible = false;
    try {
      const rect = host.getBoundingClientRect();
      visible = Boolean(rect && rect.width > 0 && rect.height > 0);
      if (!visible && host.firstElementChild && typeof host.firstElementChild.getBoundingClientRect === "function") {
        const childRect = host.firstElementChild.getBoundingClientRect();
        visible = Boolean(childRect && childRect.width > 0 && childRect.height > 0);
      }
    } catch (error) {
      return;
    }
    if (visible) return;
    host.textContent = raw;
    if (onLayout) onLayout();
    renderMathInto(host, raw, latex, attempt + 1, onLayout);
  }, 400);
}
