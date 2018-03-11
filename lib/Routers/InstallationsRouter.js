'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.InstallationsRouter = undefined;

var _ClassesRouter = require('./ClassesRouter');

var _ClassesRouter2 = _interopRequireDefault(_ClassesRouter);

var _rest = require('../rest');

var _rest2 = _interopRequireDefault(_rest);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// InstallationsRouter.js

class InstallationsRouter extends _ClassesRouter2.default {
  className() {
    return '_Installation';
  }

  handleFind(req) {
    const body = Object.assign(req.body, _ClassesRouter2.default.JSONFromQuery(req.query));
    const options = _ClassesRouter2.default.optionsFromBody(body);
    return _rest2.default.find(req.config, req.auth, '_Installation', body.where, options, req.info.clientSDK).then(response => {
      return { response: response };
    });
  }

  mountRoutes() {
    this.route('GET', '/installations', req => {
      return this.handleFind(req);
    });
    this.route('GET', '/installations/:objectId', req => {
      return this.handleGet(req);
    });
    this.route('POST', '/installations', req => {
      return this.handleCreate(req);
    });
    this.route('PUT', '/installations/:objectId', req => {
      return this.handleUpdate(req);
    });
    this.route('DELETE', '/installations/:objectId', req => {
      return this.handleDelete(req);
    });
  }
}

exports.InstallationsRouter = InstallationsRouter;
exports.default = InstallationsRouter;