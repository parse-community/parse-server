import { Parse }              from 'parse/node';
import deepcopy               from 'deepcopy';
import RestQuery              from '../RestQuery';
import RestWrite              from '../RestWrite';
import { master }             from '../Auth';
import { pushStatusHandler }  from '../StatusHandler';

export class PushController {

  sendPush(body = {}, where = {}, config, auth, onPushStatusSaved = () => {}) {
    if (!config.hasPushSupport) {
      throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED,
        'Missing push configuration');
    }
    // Replace the expiration_time and push_time with a valid Unix epoch milliseconds time
    body.expiration_time = PushController.getExpirationTime(body);
    const push_time = PushController.getPushTime(body);
    if (typeof push_time !== 'undefined') {
      body['push_time'] = push_time;
    }
    // TODO: If the req can pass the checking, we return immediately instead of waiting
    // pushes to be sent. We probably change this behaviour in the future.
    let badgeUpdate = () => {
      return Promise.resolve();
    }
    if (body.data && body.data.badge) {
      const badge = body.data.badge;
      let restUpdate = {};
      if (typeof badge == 'string' && badge.toLowerCase() === 'increment') {
        restUpdate = { badge: { __op: 'Increment', amount: 1 } }
      } else if (Number(badge)) {
        restUpdate = { badge: badge }
      } else {
        throw "Invalid value for badge, expected number or 'Increment'";
      }
      const updateWhere = deepcopy(where);

      badgeUpdate = () => {
        // Build a real RestQuery so we can use it in RestWrite
        const restQuery = new RestQuery(config, master(config), '_Installation', updateWhere);
        return restQuery.buildRestWhere().then(() => {
          const write = new RestWrite(config, master(config), '_Installation', restQuery.restWhere, restUpdate);
          write.runOptions.many = true;
          return write.execute();
        });
      }
    }
    const pushStatus = pushStatusHandler(config);
    return Promise.resolve().then(() => {
      return pushStatus.setInitial(body, where);
    }).then(() => {
      onPushStatusSaved(pushStatus.objectId);
      return badgeUpdate();
    }).then(() => {
      if (body.hasOwnProperty('push_time') && config.hasPushScheduledSupport) {
        return Promise.resolve();
      }
      return config.pushControllerQueue.enqueue(body, where, config, auth, pushStatus);
    }).catch((err) => {
      return pushStatus.fail(err).then(() => {
        throw err;
      });
    });
  }

  /**
   * Get expiration time from the request body.
   * @param {Object} request A request object
   * @returns {Number|undefined} The expiration time if it exists in the request
   */
  static getExpirationTime(body = {}) {
    var hasExpirationTime = body.hasOwnProperty('expiration_time');
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
   * Get push time from the request body.
   * @param {Object} request A request object
   * @returns {Number|undefined} The push time if it exists in the request
   */
  static getPushTime(body = {}) {
    var hasPushTime = body.hasOwnProperty('push_time');
    if (!hasPushTime) {
      return;
    }
    var pushTimeParam = body['push_time'];
    var pushTime;
    if (typeof pushTimeParam === 'number') {
      pushTime = new Date(pushTimeParam * 1000);
    } else if (typeof pushTimeParam === 'string') {
      pushTime = new Date(pushTimeParam);
    } else {
      throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED,
        body['push_time'] + ' is not valid time.');
    }
    // Check pushTime is valid or not, if it is not valid, pushTime is NaN
    if (!isFinite(pushTime)) {
      throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED,
        body['push_time'] + ' is not valid time.');
    }
    return pushTime;
  }
}

export default PushController;
