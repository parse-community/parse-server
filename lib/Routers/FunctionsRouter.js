'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FunctionsRouter = undefined;

var _PromiseRouter = require('../PromiseRouter');

var _PromiseRouter2 = _interopRequireDefault(_PromiseRouter);

var _middlewares = require('../middlewares');

var _StatusHandler = require('../StatusHandler');

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _logger = require('../logger');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// FunctionsRouter.js

var Parse = require('parse/node').Parse,
    triggers = require('../triggers');

function parseObject(obj) {
  if (Array.isArray(obj)) {
    return obj.map(item => {
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
  return _lodash2.default.mapValues(params, parseObject);
}

class FunctionsRouter extends _PromiseRouter2.default {

  mountRoutes() {
    this.route('POST', '/functions/:functionName', FunctionsRouter.handleCloudFunction);
    this.route('POST', '/jobs/:jobName', _middlewares.promiseEnforceMasterKeyAccess, function (req) {
      return FunctionsRouter.handleCloudJob(req);
    });
    this.route('POST', '/jobs', _middlewares.promiseEnforceMasterKeyAccess, function (req) {
      return FunctionsRouter.handleCloudJob(req);
    });
  }

  static handleCloudJob(req) {
    const jobName = req.params.jobName || req.body.jobName;
    const applicationId = req.config.applicationId;
    const jobHandler = (0, _StatusHandler.jobStatusHandler)(req.config);
    const jobFunction = triggers.getJob(jobName, applicationId);
    if (!jobFunction) {
      throw new Parse.Error(Parse.Error.SCRIPT_FAILED, 'Invalid job.');
    }
    let params = Object.assign({}, req.body, req.query);
    params = parseParams(params);
    const request = {
      params: params,
      log: req.config.loggerController,
      headers: req.config.headers,
      ip: req.config.ip,
      jobName
    };
    const status = {
      success: jobHandler.setSucceeded.bind(jobHandler),
      error: jobHandler.setFailed.bind(jobHandler),
      message: jobHandler.setMessage.bind(jobHandler)
    };
    return jobHandler.setRunning(jobName, params).then(jobStatus => {
      request.jobId = jobStatus.objectId;
      // run the function async
      process.nextTick(() => {
        jobFunction(request, status);
      });
      return {
        headers: {
          'X-Parse-Job-Status-Id': jobStatus.objectId
        },
        response: {}
      };
    });
  }

  static createResponseObject(resolve, reject, message) {
    return {
      success: function (result) {
        resolve({
          response: {
            result: Parse._encode(result)
          }
        });
      },
      error: function (code, message) {
        if (!message) {
          message = code;
          code = Parse.Error.SCRIPT_FAILED;
        }
        reject(new Parse.Error(code, message));
      },
      message: message
    };
  }

  static handleCloudFunction(req) {
    const functionName = req.params.functionName;
    const applicationId = req.config.applicationId;
    const theFunction = triggers.getFunction(functionName, applicationId);
    const theValidator = triggers.getValidator(req.params.functionName, applicationId);
    if (theFunction) {
      let params = Object.assign({}, req.body, req.query);
      params = parseParams(params);
      var request = {
        params: params,
        master: req.auth && req.auth.isMaster,
        user: req.auth && req.auth.user,
        installationId: req.info.installationId,
        log: req.config.loggerController,
        headers: req.config.headers,
        ip: req.config.ip,
        functionName
      };

      if (theValidator && typeof theValidator === "function") {
        var result = theValidator(request);
        if (!result) {
          throw new Parse.Error(Parse.Error.VALIDATION_ERROR, 'Validation failed.');
        }
      }

      return new Promise(function (resolve, reject) {
        const userString = req.auth && req.auth.user ? req.auth.user.id : undefined;
        const cleanInput = _logger.logger.truncateLogMessage(JSON.stringify(params));
        var response = FunctionsRouter.createResponseObject(result => {
          try {
            const cleanResult = _logger.logger.truncateLogMessage(JSON.stringify(result.response.result));
            _logger.logger.info(`Ran cloud function ${functionName} for user ${userString} with:\n  Input: ${cleanInput}\n  Result: ${cleanResult}`, {
              functionName,
              params,
              user: userString
            });
            resolve(result);
          } catch (e) {
            reject(e);
          }
        }, error => {
          try {
            _logger.logger.error(`Failed running cloud function ${functionName} for user ${userString} with:\n  Input: ${cleanInput}\n  Error: ` + JSON.stringify(error), {
              functionName,
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
      throw new Parse.Error(Parse.Error.SCRIPT_FAILED, `Invalid function: "${functionName}"`);
    }
  }
}
exports.FunctionsRouter = FunctionsRouter;