"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.GraphQLRouter = void 0;

var _node = _interopRequireDefault(require("parse/node"));

var _PromiseRouter = _interopRequireDefault(require("../PromiseRouter"));

var middleware = _interopRequireWildcard(require("../middlewares"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const GraphQLConfigPath = '/graphql-config';

class GraphQLRouter extends _PromiseRouter.default {
  async getGraphQLConfig(req) {
    const result = await req.config.parseGraphQLController.getGraphQLConfig();
    return {
      response: result
    };
  }

  async updateGraphQLConfig(req) {
    if (req.auth.isReadOnly) {
      throw new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, "read-only masterKey isn't allowed to update the GraphQL config.");
    }

    const data = await req.config.parseGraphQLController.updateGraphQLConfig(req.body.params);
    return {
      response: data
    };
  }

  mountRoutes() {
    this.route('GET', GraphQLConfigPath, middleware.promiseEnforceMasterKeyAccess, req => {
      return this.getGraphQLConfig(req);
    });
    this.route('PUT', GraphQLConfigPath, middleware.promiseEnforceMasterKeyAccess, req => {
      return this.updateGraphQLConfig(req);
    });
  }

}

exports.GraphQLRouter = GraphQLRouter;
var _default = GraphQLRouter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0dyYXBoUUxSb3V0ZXIuanMiXSwibmFtZXMiOlsiR3JhcGhRTENvbmZpZ1BhdGgiLCJHcmFwaFFMUm91dGVyIiwiUHJvbWlzZVJvdXRlciIsImdldEdyYXBoUUxDb25maWciLCJyZXEiLCJyZXN1bHQiLCJjb25maWciLCJwYXJzZUdyYXBoUUxDb250cm9sbGVyIiwicmVzcG9uc2UiLCJ1cGRhdGVHcmFwaFFMQ29uZmlnIiwiYXV0aCIsImlzUmVhZE9ubHkiLCJQYXJzZSIsIkVycm9yIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsImRhdGEiLCJib2R5IiwicGFyYW1zIiwibW91bnRSb3V0ZXMiLCJyb3V0ZSIsIm1pZGRsZXdhcmUiLCJwcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcyJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOzs7Ozs7OztBQUVBLE1BQU1BLGlCQUFpQixHQUFHLGlCQUExQjs7QUFFTyxNQUFNQyxhQUFOLFNBQTRCQyxzQkFBNUIsQ0FBMEM7QUFDekIsUUFBaEJDLGdCQUFnQixDQUFDQyxHQUFELEVBQU07QUFDMUIsVUFBTUMsTUFBTSxHQUFHLE1BQU1ELEdBQUcsQ0FBQ0UsTUFBSixDQUFXQyxzQkFBWCxDQUFrQ0osZ0JBQWxDLEVBQXJCO0FBQ0EsV0FBTztBQUNMSyxNQUFBQSxRQUFRLEVBQUVIO0FBREwsS0FBUDtBQUdEOztBQUV3QixRQUFuQkksbUJBQW1CLENBQUNMLEdBQUQsRUFBTTtBQUM3QixRQUFJQSxHQUFHLENBQUNNLElBQUosQ0FBU0MsVUFBYixFQUF5QjtBQUN2QixZQUFNLElBQUlDLGNBQU1DLEtBQVYsQ0FDSkQsY0FBTUMsS0FBTixDQUFZQyxtQkFEUixFQUVKLGlFQUZJLENBQU47QUFJRDs7QUFDRCxVQUFNQyxJQUFJLEdBQUcsTUFBTVgsR0FBRyxDQUFDRSxNQUFKLENBQVdDLHNCQUFYLENBQWtDRSxtQkFBbEMsQ0FBc0RMLEdBQUcsQ0FBQ1ksSUFBSixDQUFTQyxNQUEvRCxDQUFuQjtBQUNBLFdBQU87QUFDTFQsTUFBQUEsUUFBUSxFQUFFTztBQURMLEtBQVA7QUFHRDs7QUFFREcsRUFBQUEsV0FBVyxHQUFHO0FBQ1osU0FBS0MsS0FBTCxDQUFXLEtBQVgsRUFBa0JuQixpQkFBbEIsRUFBcUNvQixVQUFVLENBQUNDLDZCQUFoRCxFQUErRWpCLEdBQUcsSUFBSTtBQUNwRixhQUFPLEtBQUtELGdCQUFMLENBQXNCQyxHQUF0QixDQUFQO0FBQ0QsS0FGRDtBQUdBLFNBQUtlLEtBQUwsQ0FBVyxLQUFYLEVBQWtCbkIsaUJBQWxCLEVBQXFDb0IsVUFBVSxDQUFDQyw2QkFBaEQsRUFBK0VqQixHQUFHLElBQUk7QUFDcEYsYUFBTyxLQUFLSyxtQkFBTCxDQUF5QkwsR0FBekIsQ0FBUDtBQUNELEtBRkQ7QUFHRDs7QUE1QjhDOzs7ZUErQmxDSCxhIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IFByb21pc2VSb3V0ZXIgZnJvbSAnLi4vUHJvbWlzZVJvdXRlcic7XG5pbXBvcnQgKiBhcyBtaWRkbGV3YXJlIGZyb20gJy4uL21pZGRsZXdhcmVzJztcblxuY29uc3QgR3JhcGhRTENvbmZpZ1BhdGggPSAnL2dyYXBocWwtY29uZmlnJztcblxuZXhwb3J0IGNsYXNzIEdyYXBoUUxSb3V0ZXIgZXh0ZW5kcyBQcm9taXNlUm91dGVyIHtcbiAgYXN5bmMgZ2V0R3JhcGhRTENvbmZpZyhyZXEpIHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCByZXEuY29uZmlnLnBhcnNlR3JhcGhRTENvbnRyb2xsZXIuZ2V0R3JhcGhRTENvbmZpZygpO1xuICAgIHJldHVybiB7XG4gICAgICByZXNwb25zZTogcmVzdWx0LFxuICAgIH07XG4gIH1cblxuICBhc3luYyB1cGRhdGVHcmFwaFFMQ29uZmlnKHJlcSkge1xuICAgIGlmIChyZXEuYXV0aC5pc1JlYWRPbmx5KSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgIFwicmVhZC1vbmx5IG1hc3RlcktleSBpc24ndCBhbGxvd2VkIHRvIHVwZGF0ZSB0aGUgR3JhcGhRTCBjb25maWcuXCJcbiAgICAgICk7XG4gICAgfVxuICAgIGNvbnN0IGRhdGEgPSBhd2FpdCByZXEuY29uZmlnLnBhcnNlR3JhcGhRTENvbnRyb2xsZXIudXBkYXRlR3JhcGhRTENvbmZpZyhyZXEuYm9keS5wYXJhbXMpO1xuICAgIHJldHVybiB7XG4gICAgICByZXNwb25zZTogZGF0YSxcbiAgICB9O1xuICB9XG5cbiAgbW91bnRSb3V0ZXMoKSB7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgR3JhcGhRTENvbmZpZ1BhdGgsIG1pZGRsZXdhcmUucHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5nZXRHcmFwaFFMQ29uZmlnKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUFVUJywgR3JhcGhRTENvbmZpZ1BhdGgsIG1pZGRsZXdhcmUucHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy51cGRhdGVHcmFwaFFMQ29uZmlnKHJlcSk7XG4gICAgfSk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgR3JhcGhRTFJvdXRlcjtcbiJdfQ==