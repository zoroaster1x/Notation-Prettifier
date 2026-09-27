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

// MathJax is loaded lazily by Obsidian. renderMath throws or returns nothing
// before that load finishes, which used to leave a formula as raw text for the
// rest of the session. These helpers kick the load off and retry the render
// until it succeeds, then swap the raw text for the typeset element.

import { loadMathJax, renderMath } from "obsidian";

let loadedPromise = null;

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

export function tryRenderMath(latex, display) {
  try {
    if (typeof renderMath !== "function") {
      ensureMathJax();
      return null;
    }
    return renderMath(latex, display) || null;
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
