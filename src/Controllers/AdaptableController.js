/*
AdaptableController.js

AdaptableController is the base class for all controllers
that support adapter, 
The super class takes care of creating the right instance for the adapter
based on the parameters passed

 */

export class AdaptableController {
   /**
   * Check whether the api call has master key or not.
   * @param {options} the adapter options
   * @param {defaultAdapter} the default adapter class or object to use
   * @discussion
   * Supported options types:
   * - string: the options will be loaded with required, when loaded, if default 
   * is set on the returned object, we'll use that one to support modules
   * - object: a plain javascript object (options.constructor === Object), if options.adapter is set, we'll try to load it with the same mechanics
   * - function: we'll create a new instance from that function, and pass the options object
   */ 
  constructor(options, defaultAdapter) {

    // Use the default by default
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

    this.adapter = adapter;
    this.options = options;
  }
}

export default AdaptableController;