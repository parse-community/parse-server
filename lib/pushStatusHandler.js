'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.flatten = flatten;
exports.default = pushStatusHandler;

var _cryptoUtils = require('./cryptoUtils');

var _logger = require('./logger');

var PUSH_STATUS_COLLECTION = '_PushStatus';

function flatten(array) {
  return array.reduce(function (memo, element) {
    if (Array.isArray(element)) {
      memo = memo.concat(flatten(element));
    } else {
      memo = memo.concat(element);
    }
    return memo;
  }, []);
}

function pushStatusHandler(config) {

  var initialPromise = void 0;
  var pushStatus = void 0;
  var objectId = (0, _cryptoUtils.newObjectId)();
  var database = config.database;

  var setInitial = function setInitial() {
    var body = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];
    var where = arguments[1];
    var options = arguments.length <= 2 || arguments[2] === undefined ? { source: 'rest' } : arguments[2];

    var now = new Date();
    var data = body.data || {};
    var payloadString = JSON.stringify(data);
    var object = {
      objectId: objectId,
      createdAt: now,
      pushTime: now.toISOString(),
      query: JSON.stringify(where),
      payload: payloadString,
      source: options.source,
      title: options.title,
      expiry: body.expiration_time,
      status: "pending",
      numSent: 0,
      pushHash: (0, _cryptoUtils.md5Hash)(payloadString),
      // lockdown!
      ACL: {}
    };

    return database.create(PUSH_STATUS_COLLECTION, object).then(function () {
      pushStatus = {
        objectId: objectId
      };
      return Promise.resolve(pushStatus);
    });
  };

  var setRunning = function setRunning(installations) {
    _logger.logger.verbose('sending push to %d installations', installations.length);
    return database.update(PUSH_STATUS_COLLECTION, { status: "pending", objectId: objectId }, { status: "running", updatedAt: new Date() });
  };

  var complete = function complete(results) {
    var update = {
      status: 'succeeded',
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
        if (result.transmitted) {
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
    _logger.logger.verbose('sent push! %d success, %d failures', update.numSent, update.numFailed);
    return database.update(PUSH_STATUS_COLLECTION, { status: "running", objectId: objectId }, update);
  };

  var fail = function fail(err) {
    var update = {
      errorMessage: JSON.stringify(err),
      status: 'failed',
      updatedAt: new Date()
    };
    _logger.logger.info('warning: error while sending push', err);
    return database.update(PUSH_STATUS_COLLECTION, { objectId: objectId }, update);
  };

  return Object.freeze({
    objectId: objectId,
    setInitial: setInitial,
    setRunning: setRunning,
    complete: complete,
    fail: fail
  });
}