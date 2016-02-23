
export function loadAdapter(options, defaultAdapter) {
  let adapter;

  // We have options and options have adapter key
  if (options) {
    // Pass an adapter as a module name, a function or an instance
    if (typeof options == "string" || typeof options == "function" || options.constructor != Object) {
      adapter = options;
    }
    if (options.adapter) {
      adapter = options.adapter;
    }
  }
  
  if (!adapter) {
    adapter = defaultAdapter;
  }

  // This is a string, require the module
  if (typeof adapter === "string") {
    adapter = require(adapter);
    // If it's define as a module, get the default
    if (adapter.default) {
      adapter = adapter.default;
    }
  }
  // From there it's either a function or an object
  // if it's an function, instanciate and pass the options 
  if (typeof adapter === "function") {
    var Adapter = adapter;
    adapter = new Adapter(options);
  }
  return adapter;
}
