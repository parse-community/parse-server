'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.GlobalConfigRouter = undefined;

var _node = require('parse/node');

var _node2 = _interopRequireDefault(_node);

var _PromiseRouter = require('../PromiseRouter');

var _PromiseRouter2 = _interopRequireDefault(_PromiseRouter);

var _middlewares = require('../middlewares');

var middleware = _interopRequireWildcard(_middlewares);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class GlobalConfigRouter extends _PromiseRouter2.default {
  getGlobalConfig(req) {
    return req.config.database.find('_GlobalConfig', { objectId: "1" }, { limit: 1 }).then(results => {
      if (results.length != 1) {
        // If there is no config in the database - return empty config.
        return { response: { params: {} } };
      }
      const globalConfig = results[0];
      return { response: { params: globalConfig.params } };
    });
  }

  updateGlobalConfig(req) {
    if (req.auth.isReadOnly) {
      throw new _node2.default.Error(_node2.default.Error.OPERATION_FORBIDDEN, 'read-only masterKey isn\'t allowed to update the config.');
    }
    const params = req.body.params;
    // Transform in dot notation to make sure it works
    const update = Object.keys(params).reduce((acc, key) => {
      acc[`params.${key}`] = params[key];
      return acc;
    }, {});
    return req.config.database.update('_GlobalConfig', { objectId: "1" }, update, { upsert: true }).then(() => ({ response: { result: true } }));
  }

  mountRoutes() {
    this.route('GET', '/config', req => {
      return this.getGlobalConfig(req);
    });
    this.route('PUT', '/config', middleware.promiseEnforceMasterKeyAccess, req => {
      return this.updateGlobalConfig(req);
    });
  }
}

exports.GlobalConfigRouter = GlobalConfigRouter; // global_config.js

exports.default = GlobalConfigRouter;