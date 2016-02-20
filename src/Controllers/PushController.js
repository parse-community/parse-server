import { Parse } from 'parse/node';
import PromiseRouter from '../PromiseRouter';
import rest from '../rest';

export class PushController {

  constructor(pushAdapter) {
    this._pushAdapter = pushAdapter;
  }

  handlePOST(req) {
    if (!this._pushAdapter) {
      throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED,
                            'Push adapter is not availabe');
    }

    validateMasterKey(req);
    var where = getQueryCondition(req);
    var pushAdapter = this._pushAdapter;
    validatePushType(where, pushAdapter.getValidPushTypes());
    // Replace the expiration_time with a valid Unix epoch milliseconds time
    req.body['expiration_time'] = getExpirationTime(req);
    // TODO: If the req can pass the checking, we return immediately instead of waiting
    // pushes to be sent. We probably change this behaviour in the future.
    rest.find(req.config, req.auth, '_Installation', where).then(function(response) {
      return pushAdapter.send(req.body, response.results);
    });
    return Parse.Promise.as({
        response: {
          'result': true
        }
    });
  }
  
  static getExpressRouter() {
    var router = new PromiseRouter();
    router.route('POST','/push', (req) => {
      return req.config.pushController.handlePOST(req);
    });
    return router;
  }
}

/**
 * Check whether the deviceType parameter in qury condition is valid or not.
 * @param {Object} where A query condition
 * @param {Array} validPushTypes An array of valid push types(string)
 */
function validatePushType(where, validPushTypes) {
  var where = where || {};
  var deviceTypeField = where.deviceType || {};
  var deviceTypes = [];
  if (typeof deviceTypeField === 'string') {
    deviceTypes.push(deviceTypeField);
  } else if (typeof deviceTypeField['$in'] === 'array') {
    deviceTypes.concat(deviceTypeField['$in']);
  }
  for (var i = 0; i < deviceTypes.length; i++) {
    var deviceType = deviceTypes[i];
    if (validPushTypes.indexOf(deviceType) < 0) {
      throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED,
                            deviceType + ' is not supported push type.');
    }
  }
}

/**
 * Get expiration time from the request body.
 * @param {Object} request A request object
 * @returns {Number|undefined} The expiration time if it exists in the request
 */
function getExpirationTime(req) {
  var body = req.body || {};
  var hasExpirationTime = !!body['expiration_time'];
  if (!hasExpirationTime) {
    return;
  }
  var expirationTimeParam = body['expiration_time'];
  var expirationTime;
  if (typeof expirationTimeParam === 'number') {
    expirationTime = new Date(expirationTimeParam * 1000);
  } else if (typeof expirationTimeParam === 'string') {
    expirationTime = new Date(expirationTimeParam);
  } else {
    throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED,
                          body['expiration_time'] + ' is not valid time.');
  }
  // Check expirationTime is valid or not, if it is not valid, expirationTime is NaN
  if (!isFinite(expirationTime)) {
    throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED,
                          body['expiration_time'] + ' is not valid time.');
  }
  return expirationTime.valueOf();
}

/**
 * Get query condition from the request body.
 * @param {Object} request A request object
 * @returns {Object} The query condition, the where field in a query api call
 */
function getQueryCondition(req) {
  var body = req.body || {};
  var hasWhere = typeof body.where !== 'undefined';
  var hasChannels = typeof body.channels !== 'undefined';

  var where;
  if (hasWhere && hasChannels) {
    throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED,
                          'Channels and query can not be set at the same time.');
  } else if (hasWhere) {
    where = body.where;
  } else if (hasChannels) {
    where = {
      "channels": {
        "$in": body.channels
      }
    }
  } else {
    throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED,
                          'Channels and query should be set at least one.');
  }
  return where;
}

/**
 * Check whether the api call has master key or not.
 * @param {Object} request A request object
 */
function validateMasterKey(req) {
  if (req.info.masterKey !== req.config.masterKey) {
    throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED,
                          'Master key is invalid, you should only use master key to send push');
  }
}

if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
  PushController.getQueryCondition = getQueryCondition;
  PushController.validateMasterKey = validateMasterKey;
  PushController.getExpirationTime = getExpirationTime;
  PushController.validatePushType = validatePushType;
}

export default PushController;
