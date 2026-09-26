/* Stub of @codemirror/state for the smoke test: enough to load the bundle. */

class RangeSetBuilder {
  constructor() {
    this.items = [];
  }
  add(from, to, value) {
    this.items.push({ from, to, value });
    return this;
  }
  finish() {
    return this.items;
  }
}

const StateField = {
  define(spec) {
    return { spec, isStateField: true };
  },
};

class RangeValue {
  eq() {
    return false;
  }
}

module.exports = { RangeSetBuilder, StateField, RangeValue };
