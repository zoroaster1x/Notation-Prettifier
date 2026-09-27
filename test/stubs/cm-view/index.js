/* Stub of @codemirror/view for the smoke test: enough to load the bundle. */

class WidgetType {
  eq() {
    return false;
  }
  toDOM() {
    return document.createElement("span");
  }
  ignoreEvent() {
    return false;
  }
}

const Decoration = {
  none: [],
  replace(spec) {
    const value = { spec, isReplace: true };
    return {
      spec,
      value,
      range(from, to) {
        return { from, to, value };
      },
    };
  },
  set(items) {
    return items;
  },
};

const ViewPlugin = {
  fromClass(cls, spec) {
    return { cls, spec, isViewPlugin: true };
  },
};

const EditorView = {
  inputHandler: {
    of(handler) {
      return { handler, isInputHandler: true };
    },
  },
};

module.exports = { WidgetType, Decoration, ViewPlugin, EditorView };
