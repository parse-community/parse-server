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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0dyYXBoUUxSb3V0ZXIuanMiXSwibmFtZXMiOlsiR3JhcGhRTENvbmZpZ1BhdGgiLCJHcmFwaFFMUm91dGVyIiwiUHJvbWlzZVJvdXRlciIsImdldEdyYXBoUUxDb25maWciLCJyZXEiLCJyZXN1bHQiLCJjb25maWciLCJwYXJzZUdyYXBoUUxDb250cm9sbGVyIiwicmVzcG9uc2UiLCJ1cGRhdGVHcmFwaFFMQ29uZmlnIiwiYXV0aCIsImlzUmVhZE9ubHkiLCJQYXJzZSIsIkVycm9yIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsImRhdGEiLCJib2R5IiwicGFyYW1zIiwibW91bnRSb3V0ZXMiLCJyb3V0ZSIsIm1pZGRsZXdhcmUiLCJwcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcyJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOzs7Ozs7OztBQUVBLE1BQU1BLGlCQUFpQixHQUFHLGlCQUExQjs7QUFFTyxNQUFNQyxhQUFOLFNBQTRCQyxzQkFBNUIsQ0FBMEM7QUFDL0MsUUFBTUMsZ0JBQU4sQ0FBdUJDLEdBQXZCLEVBQTRCO0FBQzFCLFVBQU1DLE1BQU0sR0FBRyxNQUFNRCxHQUFHLENBQUNFLE1BQUosQ0FBV0Msc0JBQVgsQ0FBa0NKLGdCQUFsQyxFQUFyQjtBQUNBLFdBQU87QUFDTEssTUFBQUEsUUFBUSxFQUFFSDtBQURMLEtBQVA7QUFHRDs7QUFFRCxRQUFNSSxtQkFBTixDQUEwQkwsR0FBMUIsRUFBK0I7QUFDN0IsUUFBSUEsR0FBRyxDQUFDTSxJQUFKLENBQVNDLFVBQWIsRUFBeUI7QUFDdkIsWUFBTSxJQUFJQyxjQUFNQyxLQUFWLENBQ0pELGNBQU1DLEtBQU4sQ0FBWUMsbUJBRFIsRUFFSixpRUFGSSxDQUFOO0FBSUQ7O0FBQ0QsVUFBTUMsSUFBSSxHQUFHLE1BQU1YLEdBQUcsQ0FBQ0UsTUFBSixDQUFXQyxzQkFBWCxDQUFrQ0UsbUJBQWxDLENBQXNETCxHQUFHLENBQUNZLElBQUosQ0FBU0MsTUFBL0QsQ0FBbkI7QUFDQSxXQUFPO0FBQ0xULE1BQUFBLFFBQVEsRUFBRU87QUFETCxLQUFQO0FBR0Q7O0FBRURHLEVBQUFBLFdBQVcsR0FBRztBQUNaLFNBQUtDLEtBQUwsQ0FBVyxLQUFYLEVBQWtCbkIsaUJBQWxCLEVBQXFDb0IsVUFBVSxDQUFDQyw2QkFBaEQsRUFBK0VqQixHQUFHLElBQUk7QUFDcEYsYUFBTyxLQUFLRCxnQkFBTCxDQUFzQkMsR0FBdEIsQ0FBUDtBQUNELEtBRkQ7QUFHQSxTQUFLZSxLQUFMLENBQVcsS0FBWCxFQUFrQm5CLGlCQUFsQixFQUFxQ29CLFVBQVUsQ0FBQ0MsNkJBQWhELEVBQStFakIsR0FBRyxJQUFJO0FBQ3BGLGFBQU8sS0FBS0ssbUJBQUwsQ0FBeUJMLEdBQXpCLENBQVA7QUFDRCxLQUZEO0FBR0Q7O0FBNUI4Qzs7O2VBK0JsQ0gsYSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBQcm9taXNlUm91dGVyIGZyb20gJy4uL1Byb21pc2VSb3V0ZXInO1xuaW1wb3J0ICogYXMgbWlkZGxld2FyZSBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5cbmNvbnN0IEdyYXBoUUxDb25maWdQYXRoID0gJy9ncmFwaHFsLWNvbmZpZyc7XG5cbmV4cG9ydCBjbGFzcyBHcmFwaFFMUm91dGVyIGV4dGVuZHMgUHJvbWlzZVJvdXRlciB7XG4gIGFzeW5jIGdldEdyYXBoUUxDb25maWcocmVxKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcmVxLmNvbmZpZy5wYXJzZUdyYXBoUUxDb250cm9sbGVyLmdldEdyYXBoUUxDb25maWcoKTtcbiAgICByZXR1cm4ge1xuICAgICAgcmVzcG9uc2U6IHJlc3VsdCxcbiAgICB9O1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlR3JhcGhRTENvbmZpZyhyZXEpIHtcbiAgICBpZiAocmVxLmF1dGguaXNSZWFkT25seSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICBcInJlYWQtb25seSBtYXN0ZXJLZXkgaXNuJ3QgYWxsb3dlZCB0byB1cGRhdGUgdGhlIEdyYXBoUUwgY29uZmlnLlwiXG4gICAgICApO1xuICAgIH1cbiAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVxLmNvbmZpZy5wYXJzZUdyYXBoUUxDb250cm9sbGVyLnVwZGF0ZUdyYXBoUUxDb25maWcocmVxLmJvZHkucGFyYW1zKTtcbiAgICByZXR1cm4ge1xuICAgICAgcmVzcG9uc2U6IGRhdGEsXG4gICAgfTtcbiAgfVxuXG4gIG1vdW50Um91dGVzKCkge1xuICAgIHRoaXMucm91dGUoJ0dFVCcsIEdyYXBoUUxDb25maWdQYXRoLCBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0R3JhcGhRTENvbmZpZyhyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BVVCcsIEdyYXBoUUxDb25maWdQYXRoLCBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMudXBkYXRlR3JhcGhRTENvbmZpZyhyZXEpO1xuICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IEdyYXBoUUxSb3V0ZXI7XG4iXX0=