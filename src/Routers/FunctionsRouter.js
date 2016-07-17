// FunctionsRouter.js

var express = require('express'),
    Parse = require('parse/node').Parse,
    triggers = require('../triggers');

import PromiseRouter from '../PromiseRouter';
import _ from 'lodash';

function parseDate(params) {
  return _.mapValues(params, (obj) => {
    if (Array.isArray(obj)) {
      return obj.map((item) => {
        if (item && item.__type == 'Date') {
          return new Date(item.iso);
        } else if (item && typeof item === 'object') {
          return parseDate(item);
        } else {
          return item;
        }
      });
    } else if (obj && obj.__type == 'Date') {
      return new Date(obj.iso);
    } else if (obj && typeof obj === 'object') {
      return parseDate(obj);
    } else {
      return obj;
    }
  });
}

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
      error: function(code, message) {
        if (!message) {
          message = code;
          code = Parse.Error.SCRIPT_FAILED;
        }
        reject(new Parse.Error(code, message));
      }
    }
  }

  static handleCloudFunction(req) {
    var applicationId = req.config.applicationId;
    var theFunction = triggers.getFunction(req.params.functionName, applicationId);
    var theValidator = triggers.getValidator(req.params.functionName, applicationId);
    if (theFunction) {
      let params = Object.assign({}, req.body, req.query);
      params = parseDate(params);
      var request = {
        params: params,
        master: req.auth && req.auth.isMaster,
        user: req.auth && req.auth.user,
        installationId: req.info.installationId,
        log: req.config.loggerController && req.config.loggerController.adapter,
        headers: req.headers,
        functionName: req.params.functionName
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
