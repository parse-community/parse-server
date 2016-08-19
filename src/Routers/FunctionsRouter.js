// FunctionsRouter.js

var express = require('express'),
    Parse = require('parse/node').Parse,
    triggers = require('../triggers');

import PromiseRouter from '../PromiseRouter';
import _ from 'lodash';
import { logger } from '../logger';

function parseObject(obj) {
  if (Array.isArray(obj)) {
      return obj.map((item) => {
        return parseObject(item);
      });
  } else if (obj && obj.__type == 'Date') {
    return Object.assign(new Date(obj.iso), obj);
  } else if (obj && obj.__type == 'File') {
    return Parse.File.fromJSON(obj);
  } else if (obj && typeof obj === 'object') {
    return parseParams(obj);
  } else {
    return obj;
  }
}

function parseParams(params) {
  return _.mapValues(params, parseObject);
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
      params = parseParams(params);
      var request = {
        params: params,
        master: req.auth && req.auth.isMaster,
        user: req.auth && req.auth.user,
        installationId: req.info.installationId,
        log: req.config.loggerController,
        headers: req.headers,
        functionName: req.params.functionName
      };

      if (theValidator && typeof theValidator === "function") {
        var result = theValidator(request);
        if (!result) {
          throw new Parse.Error(Parse.Error.VALIDATION_ERROR, 'Validation failed.');
        }
      }

      return new Promise(function (resolve, reject) {
        const userString = (req.auth && req.auth.user) ? req.auth.user.id : undefined;
        const cleanInput = logger.truncateLogMessage(JSON.stringify(params));
        var response = FunctionsRouter.createResponseObject((result) => {
          try {
            const cleanResult = logger.truncateLogMessage(JSON.stringify(result.response.result));
            logger.info(`Ran cloud function ${req.params.functionName} for user ${userString} `
              + `with:\n  Input: ${cleanInput }\n  Result: ${cleanResult }`, {
              functionName: req.params.functionName,
              params,
              user: userString,
            });
            resolve(result);
          } catch (e) {
            reject(e);
          }
        }, (error) => {
          try {
            logger.error(`Failed running cloud function ${req.params.functionName} for `
              + `user ${userString} with:\n  Input: ${cleanInput}\n  Error: `
              + JSON.stringify(error), {
              functionName: req.params.functionName,
              error,
              params,
              user: userString
            });
            reject(error);
          } catch (e) {
            reject(e);
          }
        });
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
