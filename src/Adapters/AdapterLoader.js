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
      var Adapter = adapter;
      return new Adapter(options);
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
  } else {
    // Try to load the defaultAdapter with the options
    // The default adapter should throw if the options are
    // incompatible
    try {
      return loadAdapter(defaultAdapter, undefined, adapter);
    } catch (e) {};
  }
  // return the adapter as is as it's unusable otherwise
  return adapter;     
}

export default loadAdapter;
