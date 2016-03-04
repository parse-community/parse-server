
import PromiseRouter from '../PromiseRouter';
import rest from '../rest';

import url from 'url';

export class ClassesRouter extends PromiseRouter {
  
  handleFind(req) {
    let body = Object.assign(req.body, ClassesRouter.JSONFromQuery(req.query));
    let options = {};
    let allowConstraints = ['skip', 'limit', 'order', 'count', 'keys',
      'include', 'redirectClassNameForKey', 'where'];

    for (let key of Object.keys(body)) {
      if (allowConstraints.indexOf(key) === -1) {
        throw new Parse.Error(Parse.Error.INVALID_QUERY, 'Improper encode of parameter');
      }
    }

    if (body.skip) {
      options.skip = Number(body.skip);
    }
    if (body.limit) {
      options.limit = Number(body.limit);
    } else {
      options.limit = Number(100);
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
        
        if (req.params.className === "_User") {
          
          delete response.results[0].sessionToken;
          
          const user =  response.results[0];
         
          if (req.auth.user && user.objectId == req.auth.user.id) {
            // Force the session token
            response.results[0].sessionToken = req.info.sessionToken;
          }
        }        
        return { response: response.results[0] };
      });
  }

  handleCreate(req) {
    return rest.create(req.config, req.auth, req.params.className, req.body);
  }

  handleUpdate(req) {
    return rest.update(req.config, req.auth, req.params.className, req.params.objectId, req.body);
  }

  handleDelete(req) {
    return rest.del(req.config, req.auth, req.params.className, req.params.objectId)
      .then(() => {
        return {response: {}};
      });
  }

  static JSONFromQuery(query) {
    let json = {};
    for (let [key, value] of Object.entries(query)) {
      try {
        json[key] = JSON.parse(value);
      } catch (e) {
        json[key] = value;
      }
    }
    return json
  }
  
  mountRoutes() {
    this.route('GET', '/classes/:className', (req) => { return this.handleFind(req); });
    this.route('GET', '/classes/:className/:objectId', (req) => { return this.handleGet(req); });
    this.route('POST', '/classes/:className', (req) => { return this.handleCreate(req); });
    this.route('PUT', '/classes/:className/:objectId', (req) => { return this.handleUpdate(req); });
    this.route('DELETE',  '/classes/:className/:objectId', (req) => { return this.handleDelete(req); });
  }
}

export default ClassesRouter;
