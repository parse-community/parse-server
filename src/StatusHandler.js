import { md5Hash, newObjectId } from './cryptoUtils';
import { logger }               from './logger';

const PUSH_STATUS_COLLECTION = '_PushStatus';
const JOB_STATUS_COLLECTION = '_JobStatus';

const incrementOp = function(object = {}, key, amount = 1) {
  if (!object[key]) {
    object[key] = {__op: 'Increment', amount: amount}
  } else {
    object[key].amount += amount;
  }
  return object[key];
}

export function flatten(array) {
  var flattened = [];
  for(var i = 0; i < array.length; i++) {
    if(Array.isArray(array[i])) {
      flattened = flattened.concat(flatten(array[i]));
    } else {
      flattened.push(array[i]);
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
  const objectId = newObjectId(config.objectIdSize);
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

export function pushStatusHandler(config, objectId = newObjectId(config.objectIdSize)) {

  let pushStatus;
  const database = config.database;
  const handler = statusHandler(PUSH_STATUS_COLLECTION, database);
  const setInitial = function(body = {}, where, options = {source: 'rest'}) {
    const now = new Date();
    let pushTime = new Date();
    let status = 'pending';
    if (body.hasOwnProperty('push_time')) {
      if (config.hasPushScheduledSupport) {
        pushTime = body.push_time;
        status = 'scheduled';
      } else {
        logger.warn('Trying to schedule a push while server is not configured.');
        logger.warn('Push will be sent immediately');
      }
    }

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
      pushTime: pushTime.toISOString(),
      query: JSON.stringify(where),
      payload: payloadString,
      source: options.source,
      title: options.title,
      expiry: body.expiration_time,
      status: status,
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

  const setRunning = function(count) {
    logger.verbose(`_PushStatus ${objectId}: sending push to %d installations`, count);
    return handler.update({status:"pending", objectId: objectId},
      {status: "running", updatedAt: new Date(), count });
  }

  const trackSent = function(results) {
    const update = {
      updatedAt: new Date(),
      numSent: 0,
      numFailed: 0
    };
    if (Array.isArray(results)) {
      results = flatten(results);
      results.reduce((memo, result) => {
        // Cannot handle that
        if (!result || !result.device || !result.device.deviceType) {
          return memo;
        }
        const deviceType = result.device.deviceType;
        const key = result.transmitted ? `sentPerType.${deviceType}` : `failedPerType.${deviceType}`;
        memo[key] = incrementOp(memo, key);
        if (result.transmitted) {
          memo.numSent++;
        } else {
          memo.numFailed++;
        }
        return memo;
      }, update);
      incrementOp(update, 'count', -results.length);
    }

    logger.verbose(`_PushStatus ${objectId}: sent push! %d success, %d failures`, update.numSent, update.numFailed);

    ['numSent', 'numFailed'].forEach((key) => {
      if (update[key] > 0) {
        update[key] = {
          __op: 'Increment',
          amount: update[key]
        };
      } else {
        delete update[key];
      }
    });

    return handler.update({ objectId }, update).then((res) => {
      if (res && res.count === 0) {
        return this.complete();
      }
    })
  }

  const complete = function() {
    return handler.update({ objectId }, {
      status: 'succeeded',
      count: {__op: 'Delete'},
      updatedAt: new Date()
    });
  }

  const fail = function(err) {
    const update = {
      errorMessage: JSON.stringify(err),
      status: 'failed',
      updatedAt: new Date()
    }
    logger.warn(`_PushStatus ${objectId}: error while sending push`, err);
    return handler.update({ objectId }, update);
  }

  return Object.freeze({
    objectId,
    setInitial,
    setRunning,
    trackSent,
    complete,
    fail
  })
}
