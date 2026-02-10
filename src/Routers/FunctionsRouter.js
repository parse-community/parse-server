// FunctionsRouter.js

var Parse = require('parse/node').Parse,
  triggers = require('../triggers');

import PromiseRouter from '../PromiseRouter';
import { promiseEnforceMasterKeyAccess, promiseEnsureIdempotency } from '../middlewares';
import { jobStatusHandler } from '../StatusHandler';
import _ from 'lodash';
import { logger } from '../logger';

function parseObject(obj, config) {
  if (Array.isArray(obj)) {
    return obj.map(item => {
      return parseObject(item, config);
    });
  } else if (obj && obj.__type == 'Date') {
    return Object.assign(new Date(obj.iso), obj);
  } else if (obj && obj.__type == 'File') {
    if (obj.url) {
      const { validateFileUrl } = require('../FileUrlValidator');
      validateFileUrl(obj.url, config);
    }
    return Parse.File.fromJSON(obj);
  } else if (obj && obj.__type == 'Pointer') {
    return Parse.Object.fromJSON({
      __type: 'Pointer',
      className: obj.className,
      objectId: obj.objectId,
    });
  } else if (obj && typeof obj === 'object') {
    return parseParams(obj, config);
  } else {
    return obj;
  }
}

function parseParams(params, config) {
  return _.mapValues(params, item => parseObject(item, config));
}

export class FunctionsRouter extends PromiseRouter {
  mountRoutes() {
    this.route(
      'POST',
      '/functions/:functionName',
      promiseEnsureIdempotency,
      FunctionsRouter.handleCloudFunction
    );
    this.route(
      'POST',
      '/jobs/:jobName',
      promiseEnsureIdempotency,
      promiseEnforceMasterKeyAccess,
      function (req) {
        return FunctionsRouter.handleCloudJob(req);
      }
    );
    this.route('POST', '/jobs', promiseEnforceMasterKeyAccess, function (req) {
      return FunctionsRouter.handleCloudJob(req);
    });
  }

  static handleCloudJob(req) {
    const jobName = req.params.jobName || req.body?.jobName;
    const applicationId = req.config.applicationId;
    const jobHandler = jobStatusHandler(req.config);
    const jobFunction = triggers.getJob(jobName, applicationId);
    if (!jobFunction) {
      throw new Parse.Error(Parse.Error.SCRIPT_FAILED, 'Invalid job.');
    }
    let params = Object.assign({}, req.body, req.query);
    params = parseParams(params, req.config);
    const request = {
      params: params,
      log: req.config.loggerController,
      headers: req.config.headers,
      ip: req.config.ip,
      jobName,
      config: req.config,
      message: jobHandler.setMessage.bind(jobHandler),
    };

    return jobHandler.setRunning(jobName).then(jobStatus => {
      request.jobId = jobStatus.objectId;
      // run the function async
      process.nextTick(() => {
        Promise.resolve()
          .then(() => {
            return jobFunction(request);
          })
          .then(
            result => {
              jobHandler.setSucceeded(result);
            },
            error => {
              jobHandler.setFailed(error);
            }
          );
      });
      return {
        headers: {
          'X-Parse-Job-Status-Id': jobStatus.objectId,
        },
        response: {},
      };
    });
  }

  static createResponseObject(resolve, reject, statusCode = null) {
    let httpStatusCode = statusCode;
    const customHeaders = {};
    let responseSent = false;
    const responseObject = {
      success: function (result) {
        if (responseSent) {
          throw new Error('Cannot call success() after response has already been sent. Make sure to call success() or error() only once per cloud function execution.');
        }
        responseSent = true;
        const response = {
          response: {
            result: Parse._encode(result),
          },
        };
        if (httpStatusCode !== null) {
          response.status = httpStatusCode;
        }
        if (Object.keys(customHeaders).length > 0) {
          response.headers = customHeaders;
        }
        resolve(response);
      },
      error: function (message) {
        if (responseSent) {
          throw new Error('Cannot call error() after response has already been sent. Make sure to call success() or error() only once per cloud function execution.');
        }
        responseSent = true;
        const error = triggers.resolveError(message);
        // If a custom status code was set, attach it to the error
        if (httpStatusCode !== null) {
          error.status = httpStatusCode;
        }
        reject(error);
      },
      status: function (code) {
        httpStatusCode = code;
        return responseObject;
      },
      header: function (key, value) {
        customHeaders[key] = value;
        return responseObject;
      },
      _isResponseSent: () => responseSent,
    };
    return responseObject;
  }
  static handleCloudFunction(req) {
    const functionName = req.params.functionName;
    const applicationId = req.config.applicationId;
    const theFunction = triggers.getFunction(functionName, applicationId);

    if (!theFunction) {
      throw new Parse.Error(Parse.Error.SCRIPT_FAILED, `Invalid function: "${functionName}"`);
    }
    let params = Object.assign({}, req.body, req.query);
    params = parseParams(params, req.config);
    const request = {
      params: params,
      config: req.config,
      master: req.auth && req.auth.isMaster,
      user: req.auth && req.auth.user,
      installationId: req.info.installationId,
      log: req.config.loggerController,
      headers: req.config.headers,
      ip: req.config.ip,
      functionName,
      context: req.info.context,
    };

    return new Promise(function (resolve, reject) {
      const userString = req.auth && req.auth.user ? req.auth.user.id : undefined;
      const responseObject = FunctionsRouter.createResponseObject(
        result => {
          try {
            if (req.config.logLevels.cloudFunctionSuccess !== 'silent') {
              const cleanInput = logger.truncateLogMessage(JSON.stringify(params));
              const cleanResult = logger.truncateLogMessage(JSON.stringify(result.response.result));
              logger[req.config.logLevels.cloudFunctionSuccess](
                `Ran cloud function ${functionName} for user ${userString} with:\n  Input: ${cleanInput}\n  Result: ${cleanResult}`,
                {
                  functionName,
                  params,
                  user: userString,
                }
              );
            }
            resolve(result);
          } catch (e) {
            reject(e);
          }
        },
        error => {
          try {
            if (req.config.logLevels.cloudFunctionError !== 'silent') {
              const cleanInput = logger.truncateLogMessage(JSON.stringify(params));
              logger[req.config.logLevels.cloudFunctionError](
                `Failed running cloud function ${functionName} for user ${userString} with:\n  Input: ${cleanInput}\n  Error: ` +
                  JSON.stringify(error),
                {
                  functionName,
                  error,
                  params,
                  user: userString,
                }
              );
            }
            reject(error);
          } catch (e) {
            reject(e);
          }
        }
      );
      const { success, error } = responseObject;

      return Promise.resolve()
        .then(() => {
          return triggers.maybeRunValidator(request, functionName, req.auth);
        })
        .then(() => {
          // Check if function expects 2 parameters (req, res) - Express style
          if (theFunction.length >= 2) {
            return theFunction(request, responseObject);
          } else {
            // Traditional style - single parameter
            return theFunction(request);
          }
        })
        .then(result => {
          // For Express-style functions, only send response if not already sent
          if (theFunction.length >= 2) {
            if (!responseObject._isResponseSent()) {
              // If Express-style function returns a value without calling res.success/error
              if (result !== undefined) {
                success(result);
              }
              // If no response sent and no value returned, this is an error in user code
              // but we don't handle it here to maintain backward compatibility
            }
          } else {
            // For traditional functions, always call success with the result (even if undefined)
            success(result);
          }
        }, error);
    });
  }
}
