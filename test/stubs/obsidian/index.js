/*
 * A stub of the Obsidian API for the tests. Only the surface the plugin uses
 * is implemented, with enough DOM to exercise the reading view, the settings
 * tab and the preview modal under linkedom.
 */

const notices = [];

function el(tag, options) {
  const node = document.createElement(tag);
  if (options && options.cls) node.className = options.cls;
  if (options && options.text != null) node.textContent = String(options.text);
  return node;
}

class Events {
  on() { return this; }
  off() { return this; }
  trigger() { return this; }
}

class Component extends Events {
  load() {}
  onload() {}
  unload() {}
  register() {}
  registerEvent() {}
  registerDomEvent() {}
  registerInterval() {}
}

class Plugin extends Component {
  constructor(app, manifest) {
    super();
    this.app = app || null;
    this.manifest = manifest || { id: "notation-prettifier", version: "1.0.0" };
    this.registered = {
      editorExtensions: [],
      postProcessors: [],
      commands: [],
      settingTabs: [],
      ribbonIcons: [],
    };
  }
  registerEditorExtension(extension) {
    this.registered.editorExtensions.push(extension);
  }
  registerMarkdownPostProcessor(processor) {
    this.registered.postProcessors.push(processor);
  }
  addCommand(command) {
    this.registered.commands.push(command);
  }
  addSettingTab(tab) {
    this.registered.settingTabs.push(tab);
  }
  addRibbonIcon() {}
  async loadData() {
    return {};
  }
  async saveData() {}
}

class PluginSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement("div");
  }
  display() {}
  hide() {}
}

class Setting {
  constructor(containerEl) {
    this.containerEl = containerEl;
    this.settingEl = el("div", { cls: "setting-item" });
    containerEl.appendChild(this.settingEl);
  }
  setName(name) {
    this.settingEl.appendChild(el("div", { cls: "setting-item-name", text: name }));
    return this;
  }
  setDesc(desc) {
    this.settingEl.appendChild(el("div", { cls: "setting-item-description", text: desc }));
    return this;
  }
  setHeading() {
    this.settingEl.classList.add("setting-item-heading");
    return this;
  }
  setClass(cls) {
    this.settingEl.classList.add(cls);
    return this;
  }
  setTooltip() { return this; }
  addToggle(callback) {
    const component = new ToggleComponent(this.settingEl);
    callback(component);
    return this;
  }
  addText(callback) {
    const component = new TextComponent(this.settingEl);
    callback(component);
    return this;
  }
  addTextArea(callback) {
    const component = new TextAreaComponent(this.settingEl);
    callback(component);
    return this;
  }
  addDropdown(callback) {
    const component = new DropdownComponent(this.settingEl);
    callback(component);
    return this;
  }
  addButton(callback) {
    const component = new ButtonComponent(this.settingEl);
    callback(component);
    return this;
  }
  addExtraButton(callback) {
    return this.addButton(callback);
  }
}

class BaseComponent {
  setDisabled() { return this; }
  setTooltip() { return this; }
}

class ToggleComponent extends BaseComponent {
  constructor(parent) {
    super();
    this.inputEl = el("input");
    this.inputEl.type = "checkbox";
    parent.appendChild(this.inputEl);
    this.value = false;
  }
  setValue(value) {
    this.value = value;
    this.inputEl.checked = Boolean(value);
    return this;
  }
  onChange(callback) {
    this.change = callback;
    return this;
  }
  async trigger(value) {
    if (this.change) await this.change(value);
  }
}

class TextComponent extends BaseComponent {
  constructor(parent) {
    super();
    this.inputEl = el("input");
    parent.appendChild(this.inputEl);
    this.value = "";
  }
  setValue(value) {
    this.value = value;
    this.inputEl.value = value;
    return this;
  }
  setPlaceholder(value) {
    this.inputEl.placeholder = value;
    return this;
  }
  onChange(callback) {
    this.change = callback;
    return this;
  }
  async trigger(value) {
    if (this.change) await this.change(value);
  }
}

class TextAreaComponent extends TextComponent {}

class DropdownComponent extends BaseComponent {
  constructor(parent) {
    super();
    this.selectEl = el("select");
    parent.appendChild(this.selectEl);
  }
  addOption() { return this; }
  setValue() { return this; }
  onChange(callback) {
    this.change = callback;
    return this;
  }
}

class ButtonComponent extends BaseComponent {
  constructor(parent) {
    super();
    this.buttonEl = el("button");
    parent.appendChild(this.buttonEl);
  }
  setButtonText(text) {
    this.buttonEl.textContent = text;
    return this;
  }
  setCta() {
    this.buttonEl.classList.add("mod-cta");
    return this;
  }
  onClick(callback) {
    this.click = callback;
    return this;
  }
  async trigger() {
    if (this.click) await this.click();
  }
}

class Modal {
  constructor(app) {
    this.app = app;
    this.containerEl = document.createElement("div");
    this.contentEl = document.createElement("div");
    this.containerEl.appendChild(this.contentEl);
    this.opened = false;
    this.closed = false;
    Modal.instances.push(this);
  }
  open() {
    this.opened = true;
    if (this.onOpen) this.onOpen();
  }
  close() {
    this.closed = true;
    if (this.onClose) this.onClose();
  }
}
Modal.instances = [];

class Notice {
  constructor(message) {
    this.message = message;
    notices.push(message);
  }
  setMessage(message) {
    this.message = message;
  }
  hide() {}
}
Notice.messages = notices;

class MarkdownView {
  constructor() {
    this.editor = null;
  }
}

function renderMath(source, display) {
  const host = el("span", { cls: display ? "math math-block" : "math math-inline" });
  host.textContent = String(source);
  return host;
}

async function loadMathJax() {
  return undefined;
}

const MarkdownRenderer = {
  async render() {
    return undefined;
  },
};

const editorLivePreviewField = { __livePreview: true };

const Platform = {
  isDesktop: true,
  isMobile: false,
  isDesktopApp: true,
  isMobileApp: false,
};

module.exports = {
  Component,
  Events,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  ToggleComponent,
  TextComponent,
  TextAreaComponent,
  DropdownComponent,
  ButtonComponent,
  renderMath,
  loadMathJax,
  MarkdownRenderer,
  editorLivePreviewField,
  Platform,
};
module.exports.default = module.exports;
