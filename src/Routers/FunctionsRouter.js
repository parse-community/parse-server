// FunctionsRouter.js

var express = require('express'),
    Parse = require('parse/node').Parse,
    triggers = require('../triggers');

import PromiseRouter from '../PromiseRouter';

export class FunctionsRouter extends PromiseRouter {
  
  mountRoutes() {
    this.route('POST', '/functions/:functionName', FunctionsRouter.handleCloudFunction);
  }
  
  static createResponseObject(resolve, reject) {
    return {
      success: function(result) {
        resolve({
          response: {
            result: Parse._encode(result)
          }
        });
      },
      error: function(error) {
        reject(new Parse.Error(Parse.Error.SCRIPT_FAILED, error));
      }
    }
  }
  
  static handleCloudFunction(req) {
    var applicationId = req.config.applicationId;
    var theFunction = triggers.getFunction(req.params.functionName, applicationId);
    var theValidator = triggers.getValidator(req.params.functionName, applicationId);
    if (theFunction) {

      const params = Object.assign({}, req.body, req.query);
      var request = {
        params: params,
        master: req.auth && req.auth.isMaster,
        user: req.auth && req.auth.user,
        installationId: req.info.installationId
      };

      if (theValidator && typeof theValidator === "function") {
        var result = theValidator(request);
        if (!result) {
          throw new Parse.Error(Parse.Error.SCRIPT_FAILED, 'Validation failed.');
        }
      }

      return new Promise(function (resolve, reject) {
        var response = FunctionsRouter.createResponseObject(resolve, reject);
        // Force the keys before the function calls.
        Parse.applicationId = req.config.applicationId;
        Parse.javascriptKey = req.config.javascriptKey;
        Parse.masterKey = req.config.masterKey;
        theFunction(request, response);
      });
    } else {
      throw new Parse.Error(Parse.Error.SCRIPT_FAILED, 'Invalid function.');
    }
  }
}

