'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PurgeRouter = undefined;

var _PromiseRouter = require('../PromiseRouter');

var _PromiseRouter2 = _interopRequireDefault(_PromiseRouter);

var _middlewares = require('../middlewares');

var middleware = _interopRequireWildcard(_middlewares);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class PurgeRouter extends _PromiseRouter2.default {

  handlePurge(req) {
    return req.config.database.purgeCollection(req.params.className).then(() => {
      var cacheAdapter = req.config.cacheController;
      if (req.params.className == '_Session') {
        cacheAdapter.user.clear();
      } else if (req.params.className == '_Role') {
        cacheAdapter.role.clear();
      }
      return { response: {} };
    });
  }

  mountRoutes() {
    this.route('DELETE', '/purge/:className', middleware.promiseEnforceMasterKeyAccess, req => {
      return this.handlePurge(req);
    });
  }
}

exports.PurgeRouter = PurgeRouter;
exports.default = PurgeRouter;