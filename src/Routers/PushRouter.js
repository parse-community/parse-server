import PromiseRouter from '../PromiseRouter';
import * as middleware from "../middlewares";
import { Parse } from "parse/node";

export class PushRouter extends PromiseRouter {

  mountRoutes() {
    this.route("POST", "/push", middleware.promiseEnforceMasterKeyAccess, PushRouter.handlePOST);
  }

  static handlePOST(req) {
    const pushController = req.config.pushController;
    if (!pushController) {
      throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED, 'Push controller is not set');
    }

    let where = PushRouter.getQueryCondition(req);
    pushController.sendPush(req.body, where, req.config, req.auth);
    return Promise.resolve({
      response: {
        'result': true
      }
    });
  }

  /**
   * Get query condition from the request body.
   * @param {Object} req A request object
   * @returns {Object} The query condition, the where field in a query api call
   */
  static getQueryCondition(req) {
    let body = req.body || {};
    let hasWhere = typeof body.where !== 'undefined';
    let hasChannels = typeof body.channels !== 'undefined';

    let where;
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
}

export default PushRouter;
