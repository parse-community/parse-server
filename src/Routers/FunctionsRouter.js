// FunctionsRouter.js

import Parse from 'parse/node';
import { getJob, getFunction, maybeRunValidator, resolveError } from '../triggers.js';
import PromiseRouter from '../PromiseRouter';
import { promiseEnforceMasterKeyAccess, promiseEnsureIdempotency } from '../middlewares';
import { jobStatusHandler } from '../StatusHandler';
import _ from 'lodash';
import { logger } from '../logger';

function parseObject(obj) {
  if (!(obj ?? false)) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => parseObject(item));
  }
  if (obj.__type === 'Date') {
    return Object.assign(new Date(obj.iso), obj);
  }
  if (obj.__type === 'File') {
    return Parse.File.fromJSON(obj);
  }
  if (typeof obj === 'object') {
    return parseParams(obj);
  }
  return obj;
}

function parseParams(params) {
  return _.mapValues(params, parseObject);
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
      FunctionsRouter.handleCloudJob
    );
    this.route('POST', '/jobs', promiseEnforceMasterKeyAccess, FunctionsRouter.handleCloudJob);
  }

  static async handleCloudJob(req) {
    const jobName = req.params.jobName || req.body.jobName;
    const applicationId = req.config.applicationId;
    const jobHandler = jobStatusHandler(req.config);
    const jobFunction = getJob(jobName, applicationId);
    if (!jobFunction) {
      throw new Parse.Error(Parse.Error.SCRIPT_FAILED, 'Invalid job.');
    }
    const params = parseParams({ ...req.body, ...req.query });
    const request = {
      params,
      log: req.config.loggerController,
      headers: req.config.headers,
      ip: req.config.ip,
      jobName,
      message: jobHandler.setMessage.bind(jobHandler),
    };

    const jobStatus = await jobHandler.setRunning(jobName, params);
    request.jobId = jobStatus.objectId;
    // run the function async
    process.nextTick(() => {
      (async () => {
        try {
          const result = await jobFunction(request);
          jobHandler.setSucceeded(result);
        } catch (error) {
          jobHandler.setFailed(error);
        }
      })();
    });
    return {
      headers: {
        'X-Parse-Job-Status-Id': jobStatus.objectId,
      },
      response: {},
    };
  }

  static async handleCloudFunction(req) {
    const functionName = req.params.functionName;
    const applicationId = req.config.applicationId;
    const theFunction = getFunction(functionName, applicationId);

    if (!theFunction) {
      throw new Parse.Error(Parse.Error.SCRIPT_FAILED, `Invalid function: "${functionName}"`);
    }
    const params = parseParams({ ...req.body, ...req.query });
    const request = {
      params,
      master: req.auth?.isMaster,
      user: req.auth?.user,
      installationId: req.info.installationId,
      log: req.config.loggerController,
      headers: req.config.headers,
      ip: req.config.ip,
      functionName,
      context: req.info.context,
    };

    const userString = req.auth?.user?.id;
    const cleanInput = logger.truncateLogMessage(JSON.stringify(params));
    try {
      await maybeRunValidator(request, functionName, req.auth);
      const response = await theFunction(request);
      const result = Parse._encode(response);
      const cleanResult = logger.truncateLogMessage(JSON.stringify(result));
      logger.info(
        `Ran cloud function ${functionName} for user ${userString} with:\n  Input: ${cleanInput}\n  Result: ${cleanResult}`,
        {
          functionName,
          params,
          user: userString,
        }
      );
      return {
        response: {
          result,
        },
      };
    } catch (e) {
      const error = resolveError(e);
      logger.error(
        `Failed running cloud function ${functionName} for user ${userString} with:\n  Input: ${cleanInput}\n  Error: ${JSON.stringify(
          error
        )}\n  Stack: ${error.stack}\n`
      );
      throw error;
    }
  }
}
