'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ClassesRouter = undefined;

var _PromiseRouter = require('../PromiseRouter');

var _PromiseRouter2 = _interopRequireDefault(_PromiseRouter);

var _rest = require('../rest');

var _rest2 = _interopRequireDefault(_rest);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _node = require('parse/node');

var _node2 = _interopRequireDefault(_node);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const ALLOWED_GET_QUERY_KEYS = ['keys', 'include'];

class ClassesRouter extends _PromiseRouter2.default {

  className(req) {
    return req.params.className;
  }

  handleFind(req) {
    const body = Object.assign(req.body, ClassesRouter.JSONFromQuery(req.query));
    const options = ClassesRouter.optionsFromBody(body);
    if (req.config.maxLimit && body.limit > req.config.maxLimit) {
      // Silently replace the limit on the query with the max configured
      options.limit = Number(req.config.maxLimit);
    }
    if (body.redirectClassNameForKey) {
      options.redirectClassNameForKey = String(body.redirectClassNameForKey);
    }
    if (typeof body.where === 'string') {
      body.where = JSON.parse(body.where);
    }
    return _rest2.default.find(req.config, req.auth, this.className(req), body.where, options, req.info.clientSDK).then(response => {
      return { response: response };
    });
  }

  // Returns a promise for a {response} object.
  handleGet(req) {
    const body = Object.assign(req.body, ClassesRouter.JSONFromQuery(req.query));
    const options = {};

    for (const key of Object.keys(body)) {
      if (ALLOWED_GET_QUERY_KEYS.indexOf(key) === -1) {
        throw new _node2.default.Error(_node2.default.Error.INVALID_QUERY, 'Improper encode of parameter');
      }
    }

    if (typeof body.keys == 'string') {
      options.keys = body.keys;
    }
    if (body.include) {
      options.include = String(body.include);
    }

    return _rest2.default.get(req.config, req.auth, this.className(req), req.params.objectId, options, req.info.clientSDK).then(response => {
      if (!response.results || response.results.length == 0) {
        throw new _node2.default.Error(_node2.default.Error.OBJECT_NOT_FOUND, 'Object not found.');
      }

      if (this.className(req) === "_User") {

        delete response.results[0].sessionToken;

        const user = response.results[0];

        if (req.auth.user && user.objectId == req.auth.user.id) {
          // Force the session token
          response.results[0].sessionToken = req.info.sessionToken;
        }
      }
      return { response: response.results[0] };
    });
  }

  handleCreate(req) {
    return _rest2.default.create(req.config, req.auth, this.className(req), req.body, req.info.clientSDK);
  }

  handleUpdate(req) {
    const where = { objectId: req.params.objectId };
    return _rest2.default.update(req.config, req.auth, this.className(req), where, req.body, req.info.clientSDK);
  }

  handleDelete(req) {
    return _rest2.default.del(req.config, req.auth, this.className(req), req.params.objectId, req.info.clientSDK).then(() => {
      return { response: {} };
    });
  }

  static JSONFromQuery(query) {
    const json = {};
    for (const [key, value] of _lodash2.default.entries(query)) {
      try {
        json[key] = JSON.parse(value);
      } catch (e) {
        json[key] = value;
      }
    }
    return json;
  }

  static optionsFromBody(body) {
    const allowConstraints = ['skip', 'limit', 'order', 'count', 'keys', 'include', 'redirectClassNameForKey', 'where'];

    for (const key of Object.keys(body)) {
      if (allowConstraints.indexOf(key) === -1) {
        throw new _node2.default.Error(_node2.default.Error.INVALID_QUERY, `Invalid parameter for query: ${key}`);
      }
    }
    const options = {};
    if (body.skip) {
      options.skip = Number(body.skip);
    }
    if (body.limit || body.limit === 0) {
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
    return options;
  }

  mountRoutes() {
    this.route('GET', '/classes/:className', req => {
      return this.handleFind(req);
    });
    this.route('GET', '/classes/:className/:objectId', req => {
      return this.handleGet(req);
    });
    this.route('POST', '/classes/:className', req => {
      return this.handleCreate(req);
    });
    this.route('PUT', '/classes/:className/:objectId', req => {
      return this.handleUpdate(req);
    });
    this.route('DELETE', '/classes/:className/:objectId', req => {
      return this.handleDelete(req);
    });
  }
}

exports.ClassesRouter = ClassesRouter;
exports.default = ClassesRouter;