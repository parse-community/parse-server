export function loadAdapter(adapter, defaultAdapter, options) {
  if (!adapter)
  {
    if (!defaultAdapter) {
      return options;
    }
    // Load from the default adapter when no adapter is set
    return loadAdapter(defaultAdapter, undefined, options);
  } else if (typeof adapter === "function") {
    try {
      return adapter(options);
    } catch(e) {
      if (e.name === 'TypeError') {
        var Adapter = adapter;
        return new Adapter(options);
      } else {
        throw e;
      }
    }
  } else if (typeof adapter === "string") {
    adapter = require(adapter);
    // If it's define as a module, get the default
    if (adapter.default) {
      adapter = adapter.default;
    }
    return loadAdapter(adapter, undefined, options);
  } else if (adapter.module) {
    return loadAdapter(adapter.module, undefined, adapter.options);
  } else if (adapter.class) {
    return loadAdapter(adapter.class, undefined, adapter.options);
  } else if (adapter.adapter) {
    return loadAdapter(adapter.adapter, undefined, adapter.options);
  }
  // return the adapter as provided
  return adapter;
}

export default loadAdapter;
