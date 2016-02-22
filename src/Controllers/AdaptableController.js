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
   * - object: a plain javascript object (options.constructor === Object), if options.adapter is set, we'll try to load it with the same mechanics.
   * - function: we'll create a new instance from that function, and pass the options object
   */ 
  constructor(adapter, options) {
    this.setAdapter(adapter, options);
  }
  
  setAdapter(adapter, options) {
    this.validateAdapter(adapter);
    this.adapter = adapter;
    this.options = options;
  }
  
  expectedAdapterType() {
    throw new Error("Subclasses should implement expectedAdapterType()");
  }
  
  validateAdapter(adapter) {
    
    if (!adapter) {
      throw new Error(this.constructor.name+" requires an adapter");
    }
    
    let Type = this.expectedAdapterType();
    // Allow skipping for testing
    if (!Type) { 
      return;
    }
    
    // Makes sure the prototype matches
    let mismatches = Object.getOwnPropertyNames(Type.prototype).reduce( (obj, key) => {
       const adapterType = typeof adapter[key];
       const expectedType = typeof Type.prototype[key];
       if (adapterType !== expectedType) {
         obj[key] = {
           expected: expectedType,
           actual: adapterType
         }
       }
       return obj;
    }, {});
   
    if (Object.keys(mismatches).length > 0) {
      console.error(adapter, mismatches);
      throw new Error("Adapter prototype don't match expected prototype");
    }
  }
}

export default AdaptableController;