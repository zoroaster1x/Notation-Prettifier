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

/*
 * Test harness: linkedom plus the Obsidian element helpers and createEl
 * extensions the plugin calls. Production code stays free of test branches.
 */

import { parseHTML } from "linkedom";

export function setupDom() {
  const { window, document } = parseHTML("<!doctype html><html><body></body></html>");
  globalThis.window = window;
  globalThis.document = document;
  globalThis.Node = window.Node;
  globalThis.NodeFilter = window.NodeFilter;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.CSSStyleDeclaration = window.CSSStyleDeclaration;
  patchElement(window);
  patchText(window);
  // Stand in for the MathJax CHTML stylesheet, which the plugin requires
  // before it accepts a rendered formula.
  const style = document.createElement("style");
  style.textContent = "mjx-c::before{content:'x'}";
  document.head.appendChild(style);
  return { window, document };
}

function patchText(window) {
  const proto = window.Text && window.Text.prototype;
  if (!proto || proto.__npPatched) return;
  proto.__npPatched = true;
  if (typeof proto.splitText !== "function") {
    proto.splitText = function (offset) {
      const value = this.nodeValue || "";
      const tail = this.ownerDocument.createTextNode(value.slice(offset));
      this.nodeValue = value.slice(0, offset);
      if (this.nextSibling) this.parentNode.insertBefore(tail, this.nextSibling);
      else this.parentNode.appendChild(tail);
      return tail;
    };
  }
}

function patchElement(window) {
  const proto = window.Element.prototype;
  if (proto.__npPatched) return;
  proto.__npPatched = true;
  proto.createEl = function (tag, options) {
    return createEl(this, tag, options);
  };
  proto.createDiv = function (options) {
    return createEl(this, "div", options);
  };
  proto.createSpan = function (options) {
    return createEl(this, "span", options);
  };
  proto.setText = function (text) {
    this.textContent = text == null ? "" : String(text);
    return this;
  };
  proto.empty = function () {
    while (this.firstChild) this.removeChild(this.firstChild);
    return this;
  };
  proto.addClass = function (name) {
    for (const part of String(name).split(/\s+/)) if (part) this.classList.add(part);
    return this;
  };
  proto.removeClass = function (name) {
    for (const part of String(name).split(/\s+/)) if (part) this.classList.remove(part);
    return this;
  };
  proto.hasClass = function (name) {
    return this.classList.contains(name);
  };
}

function createEl(host, tag, options) {
  const opts = typeof options === "string" ? { cls: options } : options || {};
  const doc = host.ownerDocument || globalThis.document;
  const node = doc.createElement(tag);
  if (opts.cls) node.className = opts.cls;
  if (opts.text != null) node.textContent = String(opts.text);
  if (opts.attr) for (const key of Object.keys(opts.attr)) node.setAttribute(key, opts.attr[key]);
  host.appendChild(node);
  return node;
}
