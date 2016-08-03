"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.AdaptableController = undefined;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _Config = require("../Config");

var _Config2 = _interopRequireDefault(_Config);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/*
AdaptableController.js

AdaptableController is the base class for all controllers
that support adapter,
The super class takes care of creating the right instance for the adapter
based on the parameters passed

 */

// _adapter is private, use Symbol
var _adapter = Symbol();

var AdaptableController = exports.AdaptableController = function () {
  function AdaptableController(adapter, appId, options) {
    _classCallCheck(this, AdaptableController);

    this.options = options;
    this.appId = appId;
    this.adapter = adapter;
  }

  _createClass(AdaptableController, [{
    key: "expectedAdapterType",
    value: function expectedAdapterType() {
      throw new Error("Subclasses should implement expectedAdapterType()");
    }
  }, {
    key: "validateAdapter",
    value: function validateAdapter(adapter) {
      if (!adapter) {
        throw new Error(this.constructor.name + " requires an adapter");
      }

      var Type = this.expectedAdapterType();
      // Allow skipping for testing
      if (!Type) {
        return;
      }

      // Makes sure the prototype matches
      var mismatches = Object.getOwnPropertyNames(Type.prototype).reduce(function (obj, key) {
        var adapterType = _typeof(adapter[key]);
        var expectedType = _typeof(Type.prototype[key]);
        if (adapterType !== expectedType) {
          obj[key] = {
            expected: expectedType,
            actual: adapterType
          };
        }
        return obj;
      }, {});

      if (Object.keys(mismatches).length > 0) {
        throw new Error("Adapter prototype don't match expected prototype", adapter, mismatches);
      }
    }
  }, {
    key: "adapter",
    set: function set(adapter) {
      this.validateAdapter(adapter);
      this[_adapter] = adapter;
    },
    get: function get() {
      return this[_adapter];
    }
  }, {
    key: "config",
    get: function get() {
      return new _Config2.default(this.appId);
    }
  }]);

  return AdaptableController;
}();

exports.default = AdaptableController;