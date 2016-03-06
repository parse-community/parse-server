/*
AdaptableController.js

AdaptableController is the base class for all controllers
that support adapter, 
The super class takes care of creating the right instance for the adapter
based on the parameters passed

 */

// _adapter is private, use Symbol
var _adapter = Symbol();
import cache from '../cache';

export class AdaptableController {

  constructor(adapter, appId, options) {
    this.options = options;
    this.appId = appId;
    this.adapter = adapter;
    this.setFeature();
  }

  // sets features for Dashboard to consume from features router
  setFeature() {}

  set adapter(adapter) {
    this.validateAdapter(adapter);
    this[_adapter] = adapter;
  }
  
  get adapter() {
    return this[_adapter];
  }
  
  get config() {
    return cache.apps.get(this.appId);
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
      throw new Error("Adapter prototype don't match expected prototype", adapter, mismatches);
    }
  }
}

export default AdaptableController;
