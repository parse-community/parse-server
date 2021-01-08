import PromiseRouter from '../PromiseRouter';
import * as middleware from '../middlewares';
import { Parse } from 'parse/node';

export class PushRouter extends PromiseRouter {
  mountRoutes() {
    this.route('POST', '/push', middleware.promiseEnforceMasterKeyAccess, PushRouter.handlePOST);
  }

  static handlePOST(req) {
    if (req.auth.isReadOnly) {
      throw new Parse.Error(
        Parse.Error.OPERATION_FORBIDDEN,
        "read-only masterKey isn't allowed to send push notifications."
      );
    }
    const pushController = req.config.pushController;
    if (!pushController) {
      throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED, 'Push controller is not set');
    }

    const where = PushRouter.getQueryCondition(req);
    let resolve;
    const promise = new Promise(_resolve => {
      resolve = _resolve;
    });
    let pushStatusId;
    pushController
      .sendPush(req.body, where, req.config, req.auth, objectId => {
        pushStatusId = objectId;
        resolve({
          headers: {
            'X-Parse-Push-Status-Id': pushStatusId,
          },
          response: {
            result: true,
          },
        });
      })
      .catch(err => {
        req.config.loggerController.error(
          `_PushStatus ${pushStatusId}: error while sending push`,
          err
        );
      });
    return promise;
  }

  /**
   * Get query condition from the request body.
   * @param {Object} req A request object
   * @returns {Object} The query condition, the where field in a query api call
   */
  static getQueryCondition(req) {
    const body = req.body || {};
    const hasWhere = typeof body.where !== 'undefined';
    const hasChannels = typeof body.channels !== 'undefined';

    let where;
    if (hasWhere && hasChannels) {
      throw new Parse.Error(
        Parse.Error.PUSH_MISCONFIGURED,
        'Channels and query can not be set at the same time.'
      );
    } else if (hasWhere) {
      where = body.where;
    } else if (hasChannels) {
      where = {
        channels: {
          $in: body.channels,
        },
      };
    } else {
      throw new Parse.Error(
        Parse.Error.PUSH_MISCONFIGURED,
        'Sending a push requires either "channels" or a "where" query.'
      );
    }
    return where;
  }
}

export default PushRouter;
