import { Parse } from 'parse/node';
import PromiseRouter from '../PromiseRouter';
import rest from '../rest';
import AdaptableController from './AdaptableController';
import { PushAdapter } from '../Adapters/Push/PushAdapter';
import deepcopy from 'deepcopy';
import { md5Hash } from '../cryptoUtils';
import features from '../features';
import RestQuery from '../RestQuery';
import RestWrite from '../RestWrite';

const FEATURE_NAME = 'push';
const UNSUPPORTED_BADGE_KEY = "unsupported";

export class PushController extends AdaptableController {

  setFeature() {
    features.setFeature(FEATURE_NAME, this.adapter.feature || {});
  }

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

  sendPush(body = {}, where = {}, config, auth) {
    var pushAdapter = this.adapter;
    if (!pushAdapter) {
      throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED,
                            'Push adapter is not available');
    }
    PushController.validatePushType(where, pushAdapter.getValidPushTypes());
    // Replace the expiration_time with a valid Unix epoch milliseconds time
    body['expiration_time'] = PushController.getExpirationTime(body);
    // TODO: If the req can pass the checking, we return immediately instead of waiting
    // pushes to be sent. We probably change this behaviour in the future.
    let badgeUpdate = () => {
      return Promise.resolve();
    }

    if (body.data && body.data.badge) {
      let badge = body.data.badge;
      let op = {};
      if (badge == "Increment") {
        op = { $inc: { badge: 1 } }
      } else if (Number(badge)) {
        op = { $set: { badge: badge } }
      } else {
        throw "Invalid value for badge, expected number or 'Increment'";
      }
      let updateWhere = deepcopy(where);

      badgeUpdate = () => {
        let badgeQuery = new RestQuery(config, auth, '_Installation', updateWhere);
        return badgeQuery.buildRestWhere().then(() => {
          let restWhere = deepcopy(badgeQuery.restWhere);
          // Force iOS only devices
          if (!restWhere['$and']) {
            restWhere['$and'] = [badgeQuery.restWhere];
          }
          restWhere['$and'].push({
            'deviceType': 'ios'
          });
          return config.database.adaptiveCollection("_Installation")
            .then(coll => coll.updateMany(restWhere, op));
        })
      }
    }
    let pushStatus;
    return Promise.resolve().then(() => {
      return this.saveInitialPushStatus(body, where, config);
    }).then((res) => {
      pushStatus = res.response;
      return badgeUpdate();
    }).then(() => {
      return rest.find(config, auth, '_Installation', where);
    }).then((response) => {
      this.updatePushStatus({status: "running"}, {status:"pending", objectId: pushStatus.objectId}, config);
      if (body.data && body.data.badge && body.data.badge == "Increment") {
        // Collect the badges to reduce the # of calls
        let badgeInstallationsMap = response.results.reduce((map, installation) => {
          let badge = installation.badge;
          if (installation.deviceType != "ios") {
            badge = UNSUPPORTED_BADGE_KEY;
          }
          map[badge+''] = map[badge+''] || [];
          map[badge+''].push(installation);
          return map;
        }, {});

        // Map the on the badges count and return the send result
        let promises = Object.keys(badgeInstallationsMap).map((badge) => {
          let payload = deepcopy(body);
          if (badge == UNSUPPORTED_BADGE_KEY) {
            delete payload.data.badge;
          } else {
            payload.data.badge = parseInt(badge);
          }
          return pushAdapter.send(payload, badgeInstallationsMap[badge], pushStatus);
        });
        return Promise.all(promises);
      }
      return pushAdapter.send(body, response.results, pushStatus);
    }).then((results) => {
      console.log(results);
      return Promise.resolve(results);
    });
  }

  saveInitialPushStatus(body, where, config, options = {source: 'rest'}) {
    let pushStatus = {
      pushTime: (new Date()).toISOString(),
      query: JSON.stringify(where),
      payload: body.data,
      source: options.source,
      title: options.title,
      expiry: body.expiration_time,
      status: "pending",
      numSent: 0,
      pushHash: md5Hash(JSON.stringify(body.data)),
      ACL: new Parse.ACL() // lockdown!
    }
    let restWrite = new RestWrite(config, {isMaster: true},'_PushStatus',null, pushStatus);
    return restWrite.execute();
  }

  updatePushStatus(update, where, config) {
    let restWrite = new RestWrite(config, {isMaster: true}, '_PushStatus', where, update);
    return restWrite.execute();
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
}

export default PushController;
