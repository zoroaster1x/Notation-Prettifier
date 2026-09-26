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
