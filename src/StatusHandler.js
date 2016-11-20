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
  return array.reduce((memo, element) => {
    if (Array.isArray(element)) {
      memo = memo.concat(flatten(element));
    } else {
      memo = memo.concat(element);
    }
    return memo;
  }, []);
}

function statusHandler(className, database) {
  let lastPromise = Promise.resolve();

  function create(object) {
    lastPromise = lastPromise.then(() => {
      return database.create(className, object).then(() => {
        return Promise.resolve(object);
      });
    });
    return lastPromise;
  }

  function update(where, object) {
    lastPromise = lastPromise.then(() => {
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
  let objectId = newObjectId();
  let database = config.database;
  let lastPromise = Promise.resolve();
  let handler = statusHandler(JOB_STATUS_COLLECTION, database);
  let setRunning = function(jobName, params) {
    let now = new Date();
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

  let setMessage = function(message) {
    if (!message || typeof message !== 'string') {
      return Promise.resolve();
    }
    return handler.update({ objectId }, { message });
  }

  let setSucceeded = function(message) {
    return setFinalStatus('succeeded', message);
  }

  let setFailed = function(message) {
    return setFinalStatus('failed', message);
  }

  let setFinalStatus = function(status, message = undefined) {
    let finishedAt = new Date();
    let update = { status, finishedAt };
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

export function pushStatusHandler(config, objectId = newObjectId()) {

  let pushStatus;
  let database = config.database;
  let handler = statusHandler(PUSH_STATUS_COLLECTION, database);
  let setInitial = function(body = {}, where, options = {source: 'rest'}) {
    let now = new Date();
    let data =  body.data || {};
    let payloadString = JSON.stringify(data);
    let pushHash;
    if (typeof data.alert === 'string') {
      pushHash = md5Hash(data.alert);
    } else if (typeof data.alert === 'object') {
      pushHash = md5Hash(JSON.stringify(data.alert));
    } else {
      pushHash = 'd41d8cd98f00b204e9800998ecf8427e';
    }
    let object = {
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

  let setRunning = function(count) {
    logger.verbose('sending push to %d installations', count);
    return handler.update({status:"pending", objectId: objectId},
        {status: "running", updatedAt: new Date(), count });
  }

  let trackSent = function(results) {
    let update = {
      updatedAt: new Date()
    };
    if (Array.isArray(results)) {
      results = flatten(results);
      results.reduce((memo, result) => {
        // Cannot handle that
        if (!result || !result.device || !result.device.deviceType) {
          return memo;
        }
        let deviceType = result.device.deviceType;
        let key = result.transmitted ? `sentPerType.${deviceType}` : `failedPerType.${deviceType}`;
        memo[key] = incrementOp(memo, key);
        if (result.transmitted) {
          incrementOp(memo, 'numSent');
        } else {
          incrementOp(memo, 'numFailed');
        }
        return memo;
      }, update);
      incrementOp(update, 'count', -results.length);
    }
    logger.verbose('sent push! %d success, %d failures', update.numSent, update.numFailed);
    return handler.update({ objectId }, update).then((res) => {
      if (res && res.count === 0) {
        return this.complete();
      }
    })
  }

  let complete = function() {
    return handler.update({ objectId }, {
      status: 'succeeded',
      count: {__op: 'Delete'},
      updatedAt: new Date()
    });
  }

  let fail = function(err) {
    let update = {
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
    trackSent,
    complete,
    fail
  })
}
