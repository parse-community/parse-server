import { md5Hash, newObjectId } from './cryptoUtils';
import { logger }               from './logger';

const PUSH_STATUS_COLLECTION = '_PushStatus';

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

export function pushStatusHandler(config) {

  let initialPromise;
  let pushStatus;
  let objectId = newObjectId();
  let database = config.database;
  let lastPromise;
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
    lastPromise = Promise.resolve().then(() => {
      return database.create(PUSH_STATUS_COLLECTION, object).then(() => {
        pushStatus = {
          objectId
        };
        return Promise.resolve(pushStatus);
      });
    });
    return lastPromise;
  }

  let setRunning = function(installations) {
    logger.verbose('sending push to %d installations', installations.length);
    lastPromise = lastPromise.then(() => {
      return database.update(PUSH_STATUS_COLLECTION,
        {status:"pending", objectId: objectId},
        {status: "running", updatedAt: new Date() });
    });
    return lastPromise;
  }

  let complete = function(results) {
    let update = {
      status: 'succeeded',
      updatedAt: new Date(),
      numSent: 0,
      numFailed: 0,
    };
    if (Array.isArray(results)) {
      results = flatten(results);
      results.reduce((memo, result) => {
        // Cannot handle that
        if (!result || !result.device || !result.device.deviceType) {
          return memo;
        }
        let deviceType = result.device.deviceType;
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
    lastPromise = lastPromise.then(() => {
      return database.update(PUSH_STATUS_COLLECTION, {status:"running", objectId }, update);
    });
    return lastPromise;
  }

  let fail = function(err) {
    let update = {
      errorMessage: JSON.stringify(err),
      status: 'failed',
      updatedAt: new Date()
    }
    logger.info('warning: error while sending push', err);
    lastPromise = lastPromise.then(() => {
      return database.update(PUSH_STATUS_COLLECTION, { objectId }, update);
    });
    return lastPromise;
  }

  return Object.freeze({
    objectId,
    setInitial,
    setRunning,
    complete,
    fail
  })
}
