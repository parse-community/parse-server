/*
AdaptableController.js

AdaptableController is the base class for all controllers
that support adapter,
The super class takes care of creating the right instance for the adapter
based on the parameters passed

 */

// _adapter is private, use Symbol
var _adapter = Symbol();

export class AdaptableController {
  constructor(adapter, appId, options) {
    this.options = options;
    this.appId = appId;
    this.adapter = adapter;
  }

  set adapter(adapter) {
    this.validateAdapter(adapter);
    this[_adapter] = adapter;
  }

  get adapter() {
    return this[_adapter];
  }

  expectedAdapterType() {
    throw new Error('Subclasses should implement expectedAdapterType()');
  }

  validateAdapter(adapter) {
    AdaptableController.validateAdapter(adapter, this);
  }

  static validateAdapter(adapter, self, ExpectedType) {
    if (!adapter) {
      throw new Error(this.constructor.name + ' requires an adapter');
    }

    const Type = ExpectedType || self.expectedAdapterType();
    // Allow skipping for testing
    if (!Type) {
      return;
    }

    // Makes sure the prototype matches
    const mismatches = Object.getOwnPropertyNames(Type.prototype).reduce((obj, key) => {
      const adapterType = typeof adapter[key];
      const expectedType = typeof Type.prototype[key];
      if (adapterType !== expectedType) {
        obj[key] = {
          expected: expectedType,
          actual: adapterType,
        };
      }
      return obj;
    }, {});

    if (Object.keys(mismatches).length > 0) {
      throw new Error("Adapter prototype don't match expected prototype", adapter, mismatches);
    }
  }
}

export default AdaptableController;
