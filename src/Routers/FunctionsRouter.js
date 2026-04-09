// FunctionsRouter.js

var Parse = require('parse/node').Parse,
  triggers = require('../triggers');

import PromiseRouter from '../PromiseRouter';
import { promiseEnforceMasterKeyAccess, promiseEnsureIdempotency } from '../middlewares';
import { jobStatusHandler } from '../StatusHandler';
import _ from 'lodash';
import { logger } from '../logger';
import { createSanitizedError } from '../Error';
import Busboy from '@fastify/busboy';
import Utils from '../Utils';

function redactBuffers(obj) {
  if (Buffer.isBuffer(obj)) {
    return `[Buffer: ${obj.length} bytes]`;
  }
  if (Array.isArray(obj)) {
    return obj.map(redactBuffers);
  }
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const key of Object.keys(obj)) {
      result[key] = redactBuffers(obj[key]);
    }
    return result;
  }
  return obj;
}

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
  } else if (Buffer.isBuffer(obj)) {
    return obj;
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
      FunctionsRouter.multipartMiddleware,
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
    if (req.auth.isReadOnly) {
      throw createSanitizedError(
        Parse.Error.OPERATION_FORBIDDEN,
        "read-only masterKey isn't allowed to run a job.",
        req.config
      );
    }
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

  /**
   * Parses multipart/form-data requests for Cloud Function invocation.
   * For non-multipart requests, this is a no-op.
   *
   * Text fields are set as strings in `req.body`. File fields are set as
   * objects with the shape `{ filename: string, contentType: string, data: Buffer }`.
   * All fields are merged flat into `req.body`; the caller is responsible for
   * avoiding name collisions between text and file fields.
   *
   * The total request size is limited by the server's `maxUploadSize` option.
   */
  static multipartMiddleware(req) {
    if (!req.is || !req.is('multipart/form-data')) {
      return Promise.resolve();
    }
    const maxBytes = Utils.parseSizeToBytes(req.config.maxUploadSize);
    return new Promise((resolve, reject) => {
      const fields = Object.create(null);
      let totalBytes = 0;
      let settled = false;
      let busboy;
      try {
        busboy = Busboy({ headers: req.headers, limits: { fieldSize: maxBytes } });
      } catch (err) {
        return reject(
          new Parse.Error(Parse.Error.INVALID_JSON, `Invalid multipart request: ${err.message}`)
        );
      }
      const safeReject = (err) => {
        if (settled) {
          return;
        }
        settled = true;
        busboy.destroy();
        reject(err);
      };
      busboy.on('field', (name, value, fieldnameTruncated, valueTruncated) => {
        if (valueTruncated) {
          return safeReject(
            new Parse.Error(
              Parse.Error.OBJECT_TOO_LARGE,
              'Multipart request exceeds maximum upload size.'
            )
          );
        }
        totalBytes += Buffer.byteLength(value);
        if (totalBytes > maxBytes) {
          return safeReject(
            new Parse.Error(
              Parse.Error.OBJECT_TOO_LARGE,
              'Multipart request exceeds maximum upload size.'
            )
          );
        }
        fields[name] = value;
      });
      busboy.on('file', (name, stream, filename, transferEncoding, mimeType) => {
        const chunks = [];
        stream.on('data', chunk => {
          totalBytes += chunk.length;
          if (totalBytes > maxBytes) {
            stream.destroy();
            return safeReject(
              new Parse.Error(
                Parse.Error.OBJECT_TOO_LARGE,
                'Multipart request exceeds maximum upload size.'
              )
            );
          }
          chunks.push(chunk);
        });
        stream.on('end', () => {
          if (settled) {
            return;
          }
          fields[name] = {
            filename,
            contentType: mimeType || 'application/octet-stream',
            data: Buffer.concat(chunks),
          };
        });
      });
      busboy.on('finish', () => {
        if (settled) {
          return;
        }
        settled = true;
        req.body = fields;
        resolve();
      });
      busboy.on('error', err => {
        safeReject(
          new Parse.Error(Parse.Error.INVALID_JSON, `Invalid multipart request: ${err.message}`)
        );
      });
      req.pipe(busboy);
    });
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
      isReadOnly: !!(req.auth && req.auth.isReadOnly),
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
              const cleanInput = logger.truncateLogMessage(JSON.stringify(redactBuffers(params)));
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
              const cleanInput = logger.truncateLogMessage(JSON.stringify(redactBuffers(params)));
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
