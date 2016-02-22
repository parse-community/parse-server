import { Parse } from 'parse/node';
import PromiseRouter from '../PromiseRouter';
import rest from '../rest';
import AdaptableController from './AdaptableController';
import { PushAdapter } from '../Adapters/Push/PushAdapter';

export class PushController extends AdaptableController {

  /**
   * Check whether the deviceType parameter in qury condition is valid or not.
   * @param {Object} where A query condition
   * @param {Array} validPushTypes An array of valid push types(string)
   */
  static validatePushType(where = {}, validPushTypes = []) {
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
   * Check whether the api call has master key or not.
   * @param {Object} request A request object
   */ 
  static validateMasterKey(auth = {}) {
    if (!auth.isMaster) {
      throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED,
                            'Master key is invalid, you should only use master key to send push');
    }
  }

  sendPush(body = {}, where = {}, config, auth) {
    var pushAdapter = this.adapter;
    if (!pushAdapter) {
      throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED,
                            'Push adapter is not available');
    }
    PushController.validateMasterKey(auth);
    PushController.validatePushType(where, pushAdapter.getValidPushTypes());
    // Replace the expiration_time with a valid Unix epoch milliseconds time
    body['expiration_time'] = PushController.getExpirationTime(body);
    // TODO: If the req can pass the checking, we return immediately instead of waiting
    // pushes to be sent. We probably change this behaviour in the future.
    rest.find(config, auth, '_Installation', where).then(function(response) {
      return pushAdapter.send(body, response.results);
    });
  }
  
  /**
   * Get expiration time from the request body.
   * @param {Object} request A request object
   * @returns {Number|undefined} The expiration time if it exists in the request
   */
  static getExpirationTime(body = {}) {
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

  expectedAdapterType() {
    return PushAdapter;
  }
};

export default PushController;
