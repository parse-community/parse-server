import { md5Hash, newObjectId } from './cryptoUtils';
import { logger }               from './logger';

const PUSH_STATUS_COLLECTION = '_PushStatus';
const JOB_STATUS_COLLECTION = '_JobStatus';

export function flatten(array) {
  var flattened = [];
  for (var i = 0; i < array.length; ++i) {
    var current = array[i];
    if (Array.isArray(current)) {
      for (var j = 0; j < current.length; ++j) {
        flattened.push(current[j]);
      }
    } else{
      flattened.push(current);
    }
  }
  return flattened;
}

function statusHandler(className, database) {
  let lastPromise = Promise.resolve();

  function create(object) {
    lastPromise = lastPromise.then(() => {
      return database.create(className, object).then(() => {
        return Promise.resolve(object);
      });
    });
    return lastPromise;
  }

  function update(where, object) {
    lastPromise = lastPromise.then(() => {
      return database.update(className, where, object);
    });
    return lastPromise;
  }

  return Object.freeze({
    create,
    update
  })
}

export function jobStatusHandler(config) {
  let jobStatus;
  const objectId = newObjectId();
  const database = config.database;
  const handler = statusHandler(JOB_STATUS_COLLECTION, database);
  const setRunning = function(jobName, params) {
    const now = new Date();
    jobStatus = {
      objectId,
      jobName,
      params,
      status: 'running',
      source: 'api',
      createdAt: now,
      // lockdown!
      ACL: {}
    }

    return handler.create(jobStatus);
  }

  const setMessage = function(message) {
    if (!message || typeof message !== 'string') {
      return Promise.resolve();
    }
    return handler.update({ objectId }, { message });
  }

  const setSucceeded = function(message) {
    return setFinalStatus('succeeded', message);
  }

  const setFailed = function(message) {
    return setFinalStatus('failed', message);
  }

  const setFinalStatus = function(status, message = undefined) {
    const finishedAt = new Date();
    const update = { status, finishedAt };
    if (message && typeof message === 'string') {
      update.message = message;
    }
    return handler.update({ objectId }, update);
  }

  return Object.freeze({
    setRunning,
    setSucceeded,
    setMessage,
    setFailed
  });
}

export function pushStatusHandler(config) {

  let pushStatus;
  const objectId = newObjectId();
  const database = config.database;
  const handler = statusHandler(PUSH_STATUS_COLLECTION, database);
  const setInitial = function(body = {}, where, options = {source: 'rest'}) {
    const now = new Date();
    const data =  body.data || {};
    const payloadString = JSON.stringify(data);
    let pushHash;
    if (typeof data.alert === 'string') {
      pushHash = md5Hash(data.alert);
    } else if (typeof data.alert === 'object') {
      pushHash = md5Hash(JSON.stringify(data.alert));
    } else {
      pushHash = 'd41d8cd98f00b204e9800998ecf8427e';
    }
    const object = {
      objectId,
      createdAt: now,
      pushTime: now.toISOString(),
      query: JSON.stringify(where),
      payload: payloadString,
      source: options.source,
      title: options.title,
      expiry: body.expiration_time,
      status: "pending",
      numSent: 0,
      pushHash,
      // lockdown!
      ACL: {}
    }

    return handler.create(object).then(() => {
      pushStatus = {
        objectId
      };
      return Promise.resolve(pushStatus);
    });
  }

  const setRunning = function(installations) {
    logger.verbose('sending push to %d installations', installations.length);
    return handler.update({status:"pending", objectId: objectId},
        {status: "running", updatedAt: new Date() });
  }

  const complete = function(results) {
    const update = {
      status: 'succeeded',
      updatedAt: new Date(),
      numSent: 0,
      numFailed: 0,
    };
    if (Array.isArray(results)) {
      results = flatten(results);
      results.reduce((memo, result) => {
        // Cannot handle that
        if (!result || !result.device || !result.device.deviceType) {
          return memo;
        }
        const deviceType = result.device.deviceType;
        if (result.transmitted)
        {
          memo.numSent++;
          memo.sentPerType = memo.sentPerType || {};
          memo.sentPerType[deviceType] = memo.sentPerType[deviceType] || 0;
          memo.sentPerType[deviceType]++;
        } else {
          memo.numFailed++;
          memo.failedPerType = memo.failedPerType || {};
          memo.failedPerType[deviceType] = memo.failedPerType[deviceType] || 0;
          memo.failedPerType[deviceType]++;
        }
        return memo;
      }, update);
    }
    logger.verbose('sent push! %d success, %d failures', update.numSent, update.numFailed);
    return handler.update({status:"running", objectId }, update);
  }

  const fail = function(err) {
    const update = {
      errorMessage: JSON.stringify(err),
      status: 'failed',
      updatedAt: new Date()
    }
    logger.info('warning: error while sending push', err);
    return handler.update({ objectId }, update);
  }

  return Object.freeze({
    objectId,
    setInitial,
    setRunning,
    complete,
    fail
  })
}
