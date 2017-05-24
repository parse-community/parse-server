'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

exports.flatten = flatten;
exports.jobStatusHandler = jobStatusHandler;
exports.pushStatusHandler = pushStatusHandler;

var _cryptoUtils = require('./cryptoUtils');

var _logger = require('./logger');

var PUSH_STATUS_COLLECTION = '_PushStatus';
var JOB_STATUS_COLLECTION = '_JobStatus';

var incrementOp = function incrementOp() {
  var object = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  var key = arguments[1];
  var amount = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 1;

  if (!object[key]) {
    object[key] = { __op: 'Increment', amount: amount };
  } else {
    object[key].amount += amount;
  }
  return object[key];
};

function flatten(array) {
  var flattened = [];
  for (var i = 0; i < array.length; i++) {
    if (Array.isArray(array[i])) {
      flattened = flattened.concat(flatten(array[i]));
    } else {
      flattened.push(array[i]);
    }
  }
  return flattened;
}

function statusHandler(className, database) {
  var lastPromise = Promise.resolve();

  function create(object) {
    lastPromise = lastPromise.then(function () {
      return database.create(className, object).then(function () {
        return Promise.resolve(object);
      });
    });
    return lastPromise;
  }

  function update(where, object) {
    lastPromise = lastPromise.then(function () {
      return database.update(className, where, object);
    });
    return lastPromise;
  }

  return Object.freeze({
    create: create,
    update: update
  });
}

function jobStatusHandler(config) {
  var jobStatus = void 0;
  var objectId = (0, _cryptoUtils.newObjectId)();
  var database = config.database;
  var handler = statusHandler(JOB_STATUS_COLLECTION, database);
  var setRunning = function setRunning(jobName, params) {
    var now = new Date();
    jobStatus = {
      objectId: objectId,
      jobName: jobName,
      params: params,
      status: 'running',
      source: 'api',
      createdAt: now,
      // lockdown!
      ACL: {}
    };

    return handler.create(jobStatus);
  };

  var setMessage = function setMessage(message) {
    if (!message || typeof message !== 'string') {
      return Promise.resolve();
    }
    return handler.update({ objectId: objectId }, { message: message });
  };

  var setSucceeded = function setSucceeded(message) {
    return setFinalStatus('succeeded', message);
  };

  var setFailed = function setFailed(message) {
    return setFinalStatus('failed', message);
  };

  var setFinalStatus = function setFinalStatus(status) {
    var message = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : undefined;

    var finishedAt = new Date();
    var update = { status: status, finishedAt: finishedAt };
    if (message && typeof message === 'string') {
      update.message = message;
    }
    return handler.update({ objectId: objectId }, update);
  };

  return Object.freeze({
    setRunning: setRunning,
    setSucceeded: setSucceeded,
    setMessage: setMessage,
    setFailed: setFailed
  });
}

function pushStatusHandler(config) {
  var objectId = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : (0, _cryptoUtils.newObjectId)();


  var pushStatus = void 0;
  var database = config.database;
  var handler = statusHandler(PUSH_STATUS_COLLECTION, database);
  var setInitial = function setInitial() {
    var body = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    var where = arguments[1];
    var options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : { source: 'rest' };

    var now = new Date();
    var pushTime = new Date();
    var status = 'pending';
    if (body.hasOwnProperty('push_time')) {
      if (config.hasPushScheduledSupport) {
        pushTime = body.push_time;
        status = 'scheduled';
      } else {
        _logger.logger.warn('Trying to schedule a push while server is not configured.');
        _logger.logger.warn('Push will be sent immediately');
      }
    }

    var data = body.data || {};
    var payloadString = JSON.stringify(data);
    var pushHash = void 0;
    if (typeof data.alert === 'string') {
      pushHash = (0, _cryptoUtils.md5Hash)(data.alert);
    } else if (_typeof(data.alert) === 'object') {
      pushHash = (0, _cryptoUtils.md5Hash)(JSON.stringify(data.alert));
    } else {
      pushHash = 'd41d8cd98f00b204e9800998ecf8427e';
    }
    var object = {
      objectId: objectId,
      createdAt: now,
      pushTime: pushTime.toISOString(),
      query: JSON.stringify(where),
      payload: payloadString,
      source: options.source,
      title: options.title,
      expiry: body.expiration_time,
      status: status,
      numSent: 0,
      pushHash: pushHash,
      // lockdown!
      ACL: {}
    };

    return handler.create(object).then(function () {
      pushStatus = {
        objectId: objectId
      };
      return Promise.resolve(pushStatus);
    });
  };

  var setRunning = function setRunning(count) {
    _logger.logger.verbose('_PushStatus ' + objectId + ': sending push to %d installations', count);
    return handler.update({ status: "pending", objectId: objectId }, { status: "running", updatedAt: new Date(), count: count });
  };

  var trackSent = function trackSent(results) {
    var _this = this;

    var update = {
      updatedAt: new Date(),
      numSent: 0,
      numFailed: 0
    };
    if (Array.isArray(results)) {
      results = flatten(results);
      results.reduce(function (memo, result) {
        // Cannot handle that
        if (!result || !result.device || !result.device.deviceType) {
          return memo;
        }
        var deviceType = result.device.deviceType;
        var key = result.transmitted ? 'sentPerType.' + deviceType : 'failedPerType.' + deviceType;
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

    _logger.logger.verbose('_PushStatus ' + objectId + ': sent push! %d success, %d failures', update.numSent, update.numFailed);

    ['numSent', 'numFailed'].forEach(function (key) {
      if (update[key] > 0) {
        update[key] = {
          __op: 'Increment',
          amount: update[key]
        };
      } else {
        delete update[key];
      }
    });

    return handler.update({ objectId: objectId }, update).then(function (res) {
      if (res && res.count === 0) {
        return _this.complete();
      }
    });
  };

  var complete = function complete() {
    return handler.update({ objectId: objectId }, {
      status: 'succeeded',
      count: { __op: 'Delete' },
      updatedAt: new Date()
    });
  };

  var fail = function fail(err) {
    var update = {
      errorMessage: JSON.stringify(err),
      status: 'failed',
      updatedAt: new Date()
    };
    _logger.logger.warn('_PushStatus ' + objectId + ': error while sending push', err);
    return handler.update({ objectId: objectId }, update);
  };

  return Object.freeze({
    objectId: objectId,
    setInitial: setInitial,
    setRunning: setRunning,
    trackSent: trackSent,
    complete: complete,
    fail: fail
  });
}