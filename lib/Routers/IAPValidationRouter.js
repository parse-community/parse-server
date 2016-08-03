"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.IAPValidationRouter = undefined;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _PromiseRouter2 = require("../PromiseRouter");

var _PromiseRouter3 = _interopRequireDefault(_PromiseRouter2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var request = require("request");
var rest = require("../rest");
var Auth = require("../Auth");

// TODO move validation logic in IAPValidationController
var IAP_SANDBOX_URL = "https://sandbox.itunes.apple.com/verifyReceipt";
var IAP_PRODUCTION_URL = "https://buy.itunes.apple.com/verifyReceipt";

var APP_STORE_ERRORS = {
  21000: "The App Store could not read the JSON object you provided.",
  21002: "The data in the receipt-data property was malformed or missing.",
  21003: "The receipt could not be authenticated.",
  21004: "The shared secret you provided does not match the shared secret on file for your account.",
  21005: "The receipt server is not currently available.",
  21006: "This receipt is valid but the subscription has expired.",
  21007: "This receipt is from the test environment, but it was sent to the production environment for verification. Send it to the test environment instead.",
  21008: "This receipt is from the production environment, but it was sent to the test environment for verification. Send it to the production environment instead."
};

function appStoreError(status) {
  status = parseInt(status);
  var errorString = APP_STORE_ERRORS[status] || "unknown error.";
  return { status: status, error: errorString };
}

function validateWithAppStore(url, receipt) {
  return new Promise(function (fulfill, reject) {
    request.post({
      url: url,
      body: { "receipt-data": receipt },
      json: true
    }, function (err, res, body) {
      var status = body.status;
      if (status == 0) {
        // No need to pass anything, status is OK
        return fulfill();
      }
      // receipt is from test and should go to test
      return reject(body);
    });
  });
}

function getFileForProductIdentifier(productIdentifier, req) {
  return rest.find(req.config, req.auth, '_Product', { productIdentifier: productIdentifier }, undefined, req.info.clientSDK).then(function (result) {
    var products = result.results;
    if (!products || products.length != 1) {
      // Error not found or too many
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
    }

    var download = products[0].download;
    return Promise.resolve({ response: download });
  });
}

var IAPValidationRouter = exports.IAPValidationRouter = function (_PromiseRouter) {
  _inherits(IAPValidationRouter, _PromiseRouter);

  function IAPValidationRouter() {
    _classCallCheck(this, IAPValidationRouter);

    return _possibleConstructorReturn(this, Object.getPrototypeOf(IAPValidationRouter).apply(this, arguments));
  }

  _createClass(IAPValidationRouter, [{
    key: "handleRequest",
    value: function handleRequest(req) {
      var receipt = req.body.receipt;
      var productIdentifier = req.body.productIdentifier;

      if (!receipt || !productIdentifier) {
        // TODO: Error, malformed request
        throw new Parse.Error(Parse.Error.INVALID_JSON, "missing receipt or productIdentifier");
      }

      // Transform the object if there
      // otherwise assume it's in Base64 already
      if ((typeof receipt === "undefined" ? "undefined" : _typeof(receipt)) == "object") {
        if (receipt["__type"] == "Bytes") {
          receipt = receipt.base64;
        }
      }

      if (process.env.NODE_ENV == "test" && req.body.bypassAppStoreValidation) {
        return getFileForProductIdentifier(productIdentifier, req);
      }

      function successCallback() {
        return getFileForProductIdentifier(productIdentifier, req);
      };

      function errorCallback(error) {
        return Promise.resolve({ response: appStoreError(error.status) });
      }

      return validateWithAppStore(IAP_PRODUCTION_URL, receipt).then(function () {

        return successCallback();
      }, function (error) {
        if (error.status == 21007) {
          return validateWithAppStore(IAP_SANDBOX_URL, receipt).then(function () {
            return successCallback();
          }, function (error) {
            return errorCallback(error);
          });
        }

        return errorCallback(error);
      });
    }
  }, {
    key: "mountRoutes",
    value: function mountRoutes() {
      this.route("POST", "/validate_purchase", this.handleRequest);
    }
  }]);

  return IAPValidationRouter;
}(_PromiseRouter3.default);