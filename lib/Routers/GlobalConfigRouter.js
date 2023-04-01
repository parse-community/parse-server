"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.GlobalConfigRouter = void 0;
var _node = _interopRequireDefault(require("parse/node"));
var _PromiseRouter = _interopRequireDefault(require("../PromiseRouter"));
var middleware = _interopRequireWildcard(require("../middlewares"));
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
// global_config.js

class GlobalConfigRouter extends _PromiseRouter.default {
  getGlobalConfig(req) {
    return req.config.database.find('_GlobalConfig', {
      objectId: '1'
    }, {
      limit: 1
    }).then(results => {
      if (results.length != 1) {
        // If there is no config in the database - return empty config.
        return {
          response: {
            params: {}
          }
        };
      }
      const globalConfig = results[0];
      if (!req.auth.isMaster && globalConfig.masterKeyOnly !== undefined) {
        for (const param in globalConfig.params) {
          if (globalConfig.masterKeyOnly[param]) {
            delete globalConfig.params[param];
            delete globalConfig.masterKeyOnly[param];
          }
        }
      }
      return {
        response: {
          params: globalConfig.params,
          masterKeyOnly: globalConfig.masterKeyOnly
        }
      };
    });
  }
  updateGlobalConfig(req) {
    if (req.auth.isReadOnly) {
      throw new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, "read-only masterKey isn't allowed to update the config.");
    }
    const params = req.body.params;
    const masterKeyOnly = req.body.masterKeyOnly || {};
    // Transform in dot notation to make sure it works
    const update = Object.keys(params).reduce((acc, key) => {
      acc[`params.${key}`] = params[key];
      acc[`masterKeyOnly.${key}`] = masterKeyOnly[key] || false;
      return acc;
    }, {});
    return req.config.database.update('_GlobalConfig', {
      objectId: '1'
    }, update, {
      upsert: true
    }).then(() => ({
      response: {
        result: true
      }
    }));
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
exports.GlobalConfigRouter = GlobalConfigRouter;
var _default = GlobalConfigRouter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJHbG9iYWxDb25maWdSb3V0ZXIiLCJQcm9taXNlUm91dGVyIiwiZ2V0R2xvYmFsQ29uZmlnIiwicmVxIiwiY29uZmlnIiwiZGF0YWJhc2UiLCJmaW5kIiwib2JqZWN0SWQiLCJsaW1pdCIsInRoZW4iLCJyZXN1bHRzIiwibGVuZ3RoIiwicmVzcG9uc2UiLCJwYXJhbXMiLCJnbG9iYWxDb25maWciLCJhdXRoIiwiaXNNYXN0ZXIiLCJtYXN0ZXJLZXlPbmx5IiwidW5kZWZpbmVkIiwicGFyYW0iLCJ1cGRhdGVHbG9iYWxDb25maWciLCJpc1JlYWRPbmx5IiwiUGFyc2UiLCJFcnJvciIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJib2R5IiwidXBkYXRlIiwiT2JqZWN0Iiwia2V5cyIsInJlZHVjZSIsImFjYyIsImtleSIsInVwc2VydCIsInJlc3VsdCIsIm1vdW50Um91dGVzIiwicm91dGUiLCJtaWRkbGV3YXJlIiwicHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvUm91dGVycy9HbG9iYWxDb25maWdSb3V0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gZ2xvYmFsX2NvbmZpZy5qc1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IFByb21pc2VSb3V0ZXIgZnJvbSAnLi4vUHJvbWlzZVJvdXRlcic7XG5pbXBvcnQgKiBhcyBtaWRkbGV3YXJlIGZyb20gJy4uL21pZGRsZXdhcmVzJztcblxuZXhwb3J0IGNsYXNzIEdsb2JhbENvbmZpZ1JvdXRlciBleHRlbmRzIFByb21pc2VSb3V0ZXIge1xuICBnZXRHbG9iYWxDb25maWcocmVxKSB7XG4gICAgcmV0dXJuIHJlcS5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5maW5kKCdfR2xvYmFsQ29uZmlnJywgeyBvYmplY3RJZDogJzEnIH0sIHsgbGltaXQ6IDEgfSlcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggIT0gMSkge1xuICAgICAgICAgIC8vIElmIHRoZXJlIGlzIG5vIGNvbmZpZyBpbiB0aGUgZGF0YWJhc2UgLSByZXR1cm4gZW1wdHkgY29uZmlnLlxuICAgICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiB7IHBhcmFtczoge30gfSB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGdsb2JhbENvbmZpZyA9IHJlc3VsdHNbMF07XG4gICAgICAgIGlmICghcmVxLmF1dGguaXNNYXN0ZXIgJiYgZ2xvYmFsQ29uZmlnLm1hc3RlcktleU9ubHkgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGZvciAoY29uc3QgcGFyYW0gaW4gZ2xvYmFsQ29uZmlnLnBhcmFtcykge1xuICAgICAgICAgICAgaWYgKGdsb2JhbENvbmZpZy5tYXN0ZXJLZXlPbmx5W3BhcmFtXSkge1xuICAgICAgICAgICAgICBkZWxldGUgZ2xvYmFsQ29uZmlnLnBhcmFtc1twYXJhbV07XG4gICAgICAgICAgICAgIGRlbGV0ZSBnbG9iYWxDb25maWcubWFzdGVyS2V5T25seVtwYXJhbV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgcmVzcG9uc2U6IHtcbiAgICAgICAgICAgIHBhcmFtczogZ2xvYmFsQ29uZmlnLnBhcmFtcyxcbiAgICAgICAgICAgIG1hc3RlcktleU9ubHk6IGdsb2JhbENvbmZpZy5tYXN0ZXJLZXlPbmx5LFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9KTtcbiAgfVxuXG4gIHVwZGF0ZUdsb2JhbENvbmZpZyhyZXEpIHtcbiAgICBpZiAocmVxLmF1dGguaXNSZWFkT25seSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICBcInJlYWQtb25seSBtYXN0ZXJLZXkgaXNuJ3QgYWxsb3dlZCB0byB1cGRhdGUgdGhlIGNvbmZpZy5cIlxuICAgICAgKTtcbiAgICB9XG4gICAgY29uc3QgcGFyYW1zID0gcmVxLmJvZHkucGFyYW1zO1xuICAgIGNvbnN0IG1hc3RlcktleU9ubHkgPSByZXEuYm9keS5tYXN0ZXJLZXlPbmx5IHx8IHt9O1xuICAgIC8vIFRyYW5zZm9ybSBpbiBkb3Qgbm90YXRpb24gdG8gbWFrZSBzdXJlIGl0IHdvcmtzXG4gICAgY29uc3QgdXBkYXRlID0gT2JqZWN0LmtleXMocGFyYW1zKS5yZWR1Y2UoKGFjYywga2V5KSA9PiB7XG4gICAgICBhY2NbYHBhcmFtcy4ke2tleX1gXSA9IHBhcmFtc1trZXldO1xuICAgICAgYWNjW2BtYXN0ZXJLZXlPbmx5LiR7a2V5fWBdID0gbWFzdGVyS2V5T25seVtrZXldIHx8IGZhbHNlO1xuICAgICAgcmV0dXJuIGFjYztcbiAgICB9LCB7fSk7XG4gICAgcmV0dXJuIHJlcS5jb25maWcuZGF0YWJhc2VcbiAgICAgIC51cGRhdGUoJ19HbG9iYWxDb25maWcnLCB7IG9iamVjdElkOiAnMScgfSwgdXBkYXRlLCB7IHVwc2VydDogdHJ1ZSB9KVxuICAgICAgLnRoZW4oKCkgPT4gKHsgcmVzcG9uc2U6IHsgcmVzdWx0OiB0cnVlIH0gfSkpO1xuICB9XG5cbiAgbW91bnRSb3V0ZXMoKSB7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy9jb25maWcnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0R2xvYmFsQ29uZmlnKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUFVUJywgJy9jb25maWcnLCBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMudXBkYXRlR2xvYmFsQ29uZmlnKHJlcSk7XG4gICAgfSk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgR2xvYmFsQ29uZmlnUm91dGVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFDQTtBQUNBO0FBQ0E7QUFBNkM7QUFBQTtBQUFB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