
import PromiseRouter from '../PromiseRouter';
import rest from '../rest';

export class ClassesRouter {
  // Returns a promise that resolves to a {response} object.
  handleFind(req) {
    let body = Object.assign(req.body, req.query);
    let options = {};
    if (body.skip) {
      options.skip = Number(body.skip);
    }
    if (body.limit) {
      options.limit = Number(body.limit);
    }
    if (body.order) {
      options.order = String(body.order);
    }
    if (body.count) {
      options.count = true;
    }
    if (typeof body.keys == 'string') {
      options.keys = body.keys;
    }
    if (body.include) {
      options.include = String(body.include);
    }
    if (body.redirectClassNameForKey) {
      options.redirectClassNameForKey = String(body.redirectClassNameForKey);
    }
    if (typeof body.where === 'string') {
      body.where = JSON.parse(body.where);
    }
    return rest.find(req.config, req.auth, req.params.className, body.where, options)
      .then((response) => {
        if (response && response.results) {
          for (let result of response.results) {
            if (result.sessionToken) {
              result.sessionToken = req.info.sessionToken || result.sessionToken;
            }
          }
        }
        return { response: response };
      });
  }

  // Returns a promise for a {response} object.
  handleGet(req) {
    return rest.find(req.config, req.auth, req.params.className, {objectId: req.params.objectId})
      .then((response) => {
        if (!response.results || response.results.length == 0) {
          throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
        }
        
        if(req.params.className === "_User"){
          delete response.results[0].sessionToken;
        }

        return { response: response.results[0] };
      });
  }

  handleCreate(req) {
    return rest.create(req.config, req.auth, req.params.className, req.body);
  }

  handleUpdate(req) {
    return rest.update(req.config, req.auth, req.params.className, req.params.objectId, req.body)
      .then((response) => {
        return {response: response};
      });
  }

  handleDelete(req) {
    return rest.del(req.config, req.auth, req.params.className, req.params.objectId)
      .then(() => {
        return {response: {}};
      });
  }

  getExpressRouter() {
    var router = new PromiseRouter();
    router.route('GET', '/classes/:className', (req) => { return this.handleFind(req); });
    router.route('GET', '/classes/:className/:objectId', (req) => { return this.handleGet(req); });
    router.route('POST', '/classes/:className', (req) => { return this.handleCreate(req); });
    router.route('PUT', '/classes/:className/:objectId', (req) => { return this.handleUpdate(req); });
    router.route('DELETE',  '/classes/:className/:objectId', (req) => { return this.handleDelete(req); });
    return router;
  }
}

export default ClassesRouter;
