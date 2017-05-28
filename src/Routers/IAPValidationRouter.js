import PromiseRouter from '../PromiseRouter';
var request = require("request");
var rest = require("../rest");
import Parse from 'parse/node';

// TODO move validation logic in IAPValidationController
const IAP_SANDBOX_URL = "https://sandbox.itunes.apple.com/verifyReceipt";
const IAP_PRODUCTION_URL = "https://buy.itunes.apple.com/verifyReceipt";

const APP_STORE_ERRORS = {
  21000: "The App Store could not read the JSON object you provided.",
  21002: "The data in the receipt-data property was malformed or missing.",
  21003: "The receipt could not be authenticated.",
  21004: "The shared secret you provided does not match the shared secret on file for your account.",
  21005: "The receipt server is not currently available.",
  21006: "This receipt is valid but the subscription has expired.",
  21007: "This receipt is from the test environment, but it was sent to the production environment for verification. Send it to the test environment instead.",
  21008: "This receipt is from the production environment, but it was sent to the test environment for verification. Send it to the production environment instead."
}

function appStoreError(status) {
  status = parseInt(status);
  var errorString = APP_STORE_ERRORS[status] || "unknown error.";
  return { status: status, error: errorString }
}

function validateWithAppStore(url, receipt) {
  return new Promise(function(fulfill, reject) {
    request.post({
      url: url,
      body: { "receipt-data": receipt },
      json: true,
    }, function(err, res, body) {
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
  return rest.find(req.config, req.auth, '_Product', { productIdentifier: productIdentifier }, undefined, req.info.clientSDK).then(function(result){
    const products = result.results;
    if (!products || products.length != 1) {
      // Error not found or too many
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.')
    }

    var download = products[0].download;
    return Promise.resolve({response: download});
  });
}


export class IAPValidationRouter extends PromiseRouter {

  handleRequest(req) {
    let receipt = req.body.receipt;
    const productIdentifier = req.body.productIdentifier;

    if (!receipt || ! productIdentifier) {
      // TODO: Error, malformed request
      throw new Parse.Error(Parse.Error.INVALID_JSON, "missing receipt or productIdentifier");
    }

    // Transform the object if there
    // otherwise assume it's in Base64 already
    if (typeof receipt == "object") {
      if (receipt["__type"] == "Bytes") {
        receipt = receipt.base64;
      }
    }

    if (process.env.TESTING == "1" && req.body.bypassAppStoreValidation) {
      return getFileForProductIdentifier(productIdentifier, req);
    }

    function successCallback() {
      return getFileForProductIdentifier(productIdentifier, req);
    }

    function errorCallback(error) {
      return Promise.resolve({response: appStoreError(error.status) });
    }

    return validateWithAppStore(IAP_PRODUCTION_URL, receipt).then(() => {

      return successCallback();

    }, (error) => {
      if (error.status == 21007) {
        return validateWithAppStore(IAP_SANDBOX_URL, receipt).then(() => {
          return successCallback();
        }, (error) => {
          return errorCallback(error);
        }
        );
      }

      return errorCallback(error);
    });
  }

  mountRoutes() {
    this.route("POST","/validate_purchase", this.handleRequest);
  }
}
