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

// A debug report for the cases a screenshot cannot explain: what MathJax the
// app exposes, whether its CHTML stylesheet is attached, and the real DOM and
// computed style of a rendered formula. Written next to data.json on command.

import { Platform, loadMathJax, renderMath } from "obsidian";
import { hasMathStylesheet, mathJaxGlobal } from "./math.js";

function describeElement(element) {
  if (!element) return null;
  const styles = typeof getComputedStyle === "function" ? getComputedStyle(element) : null;
  const child = element.firstElementChild;
  const childStyles = child && typeof getComputedStyle === "function" ? getComputedStyle(child) : null;
  let glyph = null;
  try {
    const glyphElement = element.querySelector ? element.querySelector("mjx-c") : null;
    if (glyphElement && typeof getComputedStyle === "function") {
      const pseudo = getComputedStyle(glyphElement, "::before");
      glyph = {
        tag: glyphElement.tagName,
        content: pseudo ? String(pseudo.content) : null,
        fontFamily: pseudo ? pseudo.fontFamily : null,
        rect: rectOf(glyphElement),
      };
    }
  } catch (error) {
    glyph = { error: String((error && error.message) || error) };
  }
  return {
    tag: element.tagName,
    class: element.className,
    text: (element.textContent || "").slice(0, 80),
    html: (element.outerHTML || "").slice(0, 800),
    rect: rectOf(element),
    display: styles ? styles.display : null,
    visibility: styles ? styles.visibility : null,
    color: styles ? styles.color : null,
    fontSize: styles ? styles.fontSize : null,
    childDisplay: childStyles ? childStyles.display : null,
    childTag: child ? child.tagName : null,
    glyph,
  };
}

function rectOf(element) {
  try {
    if (!element || typeof element.getBoundingClientRect !== "function") return null;
    const rect = element.getBoundingClientRect();
    return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
  } catch (error) {
    return null;
  }
}

export function buildDebugReport(plugin) {
  const mathJax = mathJaxGlobal();
  const report = {
    version: plugin && plugin.manifest ? plugin.manifest.version : "unknown",
    generated: new Date().toISOString(),
    platform: typeof Platform !== "undefined" ? { desktop: Platform.isDesktop, mobile: Platform.isMobile } : null,
    settings: plugin ? plugin.settings : null,
    math: {
      renderMath: typeof renderMath,
      loadMathJax: typeof loadMathJax,
      MathJaxGlobal: typeof mathJax,
      MathJaxVersion: mathJax ? mathJax.version || null : null,
      chtmlStylesheetType: mathJax ? typeof mathJax.chtmlStylesheet : null,
      stylesheetAttached: hasMathStylesheet(),
      headStyles: [],
    },
    renderedSample: null,
    liveWidget: null,
  };
  try {
    report.math.headStyles = Array.from(document.head.querySelectorAll("style"))
      .map((style) => ({
        change: style.dataset ? style.dataset.change : undefined,
        hasGlyphs: (style.textContent || "").includes("mjx-c"),
        start: (style.textContent || "").slice(0, 60),
      }))
      .slice(0, 60);
  } catch (error) {
    report.math.headStyles = ["unavailable"];
  }
  try {
    const element = renderMath("n^{1}", false);
    const holder = document.createElement("div");
    holder.style.position = "absolute";
    holder.style.visibility = "hidden";
    holder.style.top = "0";
    document.body.appendChild(holder);
    holder.appendChild(element);
    report.renderedSample = describeElement(element);
    setTimeout(() => holder.remove(), 2000);
  } catch (error) {
    report.renderedSample = { error: String((error && error.message) || error) };
  }
  try {
    const widget = document.querySelector(".np-math");
    report.liveWidget = widget ? describeElement(widget) : null;
    report.widgetsOnPage = document.querySelectorAll(".np-math").length;
  } catch (error) {
    report.liveWidget = { error: String((error && error.message) || error) };
  }
  return report;
}
