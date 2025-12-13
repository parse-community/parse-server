// FunctionsRouter.js

var Parse = require('parse/node').Parse,
  triggers = require('../triggers');

import PromiseRouter from '../PromiseRouter';
import { promiseEnforceMasterKeyAccess, promiseEnsureIdempotency } from '../middlewares';
import { jobStatusHandler } from '../StatusHandler';
import _ from 'lodash';
import { logger } from '../logger';

class CloudResponse {
  constructor() {
    this._status = null;
    this._headers = Object.create(null);
  }

  status(code) {
    if (!Number.isInteger(code)) {
      throw new Error('Status code must be an integer');
    }
    if (code < 100 || code > 599) {
      throw new Error('Status code must be between 100 and 599');
    }
    this._status = code;
    return this;
  }

  set(name, value) {
    if (typeof name !== 'string') {
      throw new Error('Header name must be a string');
    }
    const headerName = name.trim();
    if (!headerName) {
      throw new Error('Header name must not be empty');
    }
    if (headerName === '__proto__' || headerName === 'constructor' || headerName === 'prototype') {
      throw new Error('Invalid header name');
    }
    if (value === undefined || value === null) {
      throw new Error('Header value must be defined');
    }
    const headerValue = Array.isArray(value) ? value.map(v => String(v)) : String(value);
    const values = Array.isArray(headerValue) ? headerValue : [headerValue];
    if (values.some(v => /[\r\n]/.test(v))) {
      throw new Error('Header value must not contain CRLF');
    }
    this._headers[headerName] = headerValue;
    return this;
  }

  hasCustomResponse() {
    return this._status !== null || Object.keys(this._headers).length > 0;
  }

  getStatus() {
    return this._status;
  }

  getHeaders() {
    return this._headers;
  }
}

function parseObject(obj, config) {
  if (Array.isArray(obj)) {
    return obj.map(item => {
      return parseObject(item, config);
    });
  } else if (obj && obj.__type == 'Date') {
    return Object.assign(new Date(obj.iso), obj);
  } else if (obj && obj.__type == 'File') {
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

  static createResponseObject(resolve, reject, cloudResponse) {
    return {
      success: function (result) {
        const response = {
          response: {
            result: Parse._encode(result),
          },
        };
        if (cloudResponse && cloudResponse.hasCustomResponse()) {
          const status = cloudResponse.getStatus();
          const headers = cloudResponse.getHeaders();
          if (status !== null) {
            response.status = status;
          }
          if (Object.keys(headers).length > 0) {
            response.headers = { ...headers };
          }
        }
        resolve(response);
      },
      error: function (message) {
        const error = triggers.resolveError(message);
        reject(error);
      },
    };
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
    const cloudResponse = new CloudResponse();
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
      const { success, error } = FunctionsRouter.createResponseObject(
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
        },
        cloudResponse
      );
      return Promise.resolve()
        .then(() => {
          return triggers.maybeRunValidator(request, functionName, req.auth);
        })
        .then(() => {
          return theFunction(request, cloudResponse);
        })
        .then(success, error);
    });
  }
}
