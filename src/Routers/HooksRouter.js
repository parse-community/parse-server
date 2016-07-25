import { Parse }       from 'parse/node';
import PromiseRouter   from '../PromiseRouter';
import * as middleware from "../middlewares";

export class HooksRouter extends PromiseRouter {
  createHook(aHook, config) {
    return config.hooksController.createHook(aHook).then( (hook) => ({response: hook}));
  };

  updateHook(aHook, config) {
    return  config.hooksController.updateHook(aHook).then((hook) => ({response: hook}));
  };

  handlePost(req) {
    return this.createHook(req.body, req.config);
  };

  handleGetFunctions(req) {
    var hooksController = req.config.hooksController;
    if (req.params.functionName) {
      return hooksController.getFunction(req.params.functionName).then( (foundFunction) => {
        if (!foundFunction) {
          throw new Parse.Error(143, `no function named: ${req.params.functionName} is defined`);
        }
        return Promise.resolve({response: foundFunction});
      });
    }

    return hooksController.getFunctions().then((functions) => {
      return { response: functions || [] };
    }, (err) => {
      throw err;
    });
  }

  handleGetTriggers(req) {
    var hooksController = req.config.hooksController;
    if (req.params.className && req.params.triggerName) {

      return hooksController.getTrigger(req.params.className, req.params.triggerName).then((foundTrigger) => {
        if (!foundTrigger) {
          throw new Parse.Error(143,`class ${req.params.className} does not exist`);
        }
        return Promise.resolve({response: foundTrigger});
      });
    }

    return hooksController.getTriggers().then((triggers) => ({ response: triggers || [] }));
  }

  handleDelete(req) {
    var hooksController = req.config.hooksController;
    if (req.params.functionName) {
      return hooksController.deleteFunction(req.params.functionName).then(() => ({response: {}}))

    } else if (req.params.className && req.params.triggerName) {
      return hooksController.deleteTrigger(req.params.className, req.params.triggerName).then(() => ({response: {}}))
    }
    return Promise.resolve({response: {}});
  }

  handleUpdate(req) {
    var hook;
    if (req.params.functionName && req.body.url) {
      hook = {}
      hook.functionName = req.params.functionName;
      hook.url = req.body.url;
    } else if (req.params.className && req.params.triggerName && req.body.url) {
      hook = {}
      hook.className = req.params.className;
      hook.triggerName = req.params.triggerName;
      hook.url = req.body.url
    } else {
      throw new Parse.Error(143, "invalid hook declaration");
    }
    return this.updateHook(hook, req.config);
  }

  handlePut(req) {
    var body = req.body;
    if (body.__op == "Delete") {
      return this.handleDelete(req);
    } else {
      return this.handleUpdate(req);
    }
  }

  mountRoutes() {
    this.route('GET',  '/hooks/functions', middleware.promiseEnforceMasterKeyAccess, this.handleGetFunctions.bind(this));
    this.route('GET',  '/hooks/triggers', middleware.promiseEnforceMasterKeyAccess, this.handleGetTriggers.bind(this));
    this.route('GET',  '/hooks/functions/:functionName', middleware.promiseEnforceMasterKeyAccess, this.handleGetFunctions.bind(this));
    this.route('GET',  '/hooks/triggers/:className/:triggerName', middleware.promiseEnforceMasterKeyAccess, this.handleGetTriggers.bind(this));
    this.route('POST', '/hooks/functions', middleware.promiseEnforceMasterKeyAccess, this.handlePost.bind(this));
    this.route('POST', '/hooks/triggers', middleware.promiseEnforceMasterKeyAccess, this.handlePost.bind(this));
    this.route('PUT',  '/hooks/functions/:functionName', middleware.promiseEnforceMasterKeyAccess, this.handlePut.bind(this));
    this.route('PUT',  '/hooks/triggers/:className/:triggerName', middleware.promiseEnforceMasterKeyAccess, this.handlePut.bind(this));
  }
}

export default HooksRouter;
