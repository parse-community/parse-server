import PromiseRouter from '../PromiseRouter';

export class PushRouter extends PromiseRouter {

  mountRoutes() {
    this.route("POST", "/push", req => { return this.handlePOST(req); });
  }
  
  /**
   * Check whether the api call has master key or not.
   * @param {Object} request A request object
   */ 
  static validateMasterKey(req) {
    if (req.info.masterKey !== req.config.masterKey) {
      throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED,
                            'Master key is invalid, you should only use master key to send push');
    }
  }

  handlePOST(req) {
    // TODO: move to middlewares when support for Promise middlewares
    PushRouter.validateMasterKey(req);
    
    const pushController = req.config.pushController;
    if (!pushController) {
      throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED,
                            'Push controller is not set');
    }

    var where = PushRouter.getQueryCondition(req);

    pushController.sendPush(req.body, where, req.config, req.auth);
    return Promise.resolve({
        response: {
          'result': true
        }
    });
  }
  
    /**
   * Get query condition from the request body.
   * @param {Object} request A request object
   * @returns {Object} The query condition, the where field in a query api call
   */
  static getQueryCondition(req) {
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
  
}

export default PushRouter;
