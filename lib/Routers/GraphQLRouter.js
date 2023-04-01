"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.GraphQLRouter = void 0;
var _node = _interopRequireDefault(require("parse/node"));
var _PromiseRouter = _interopRequireDefault(require("../PromiseRouter"));
var middleware = _interopRequireWildcard(require("../middlewares"));
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJHcmFwaFFMQ29uZmlnUGF0aCIsIkdyYXBoUUxSb3V0ZXIiLCJQcm9taXNlUm91dGVyIiwiZ2V0R3JhcGhRTENvbmZpZyIsInJlcSIsInJlc3VsdCIsImNvbmZpZyIsInBhcnNlR3JhcGhRTENvbnRyb2xsZXIiLCJyZXNwb25zZSIsInVwZGF0ZUdyYXBoUUxDb25maWciLCJhdXRoIiwiaXNSZWFkT25seSIsIlBhcnNlIiwiRXJyb3IiLCJPUEVSQVRJT05fRk9SQklEREVOIiwiZGF0YSIsImJvZHkiLCJwYXJhbXMiLCJtb3VudFJvdXRlcyIsInJvdXRlIiwibWlkZGxld2FyZSIsInByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL1JvdXRlcnMvR3JhcGhRTFJvdXRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgUHJvbWlzZVJvdXRlciBmcm9tICcuLi9Qcm9taXNlUm91dGVyJztcbmltcG9ydCAqIGFzIG1pZGRsZXdhcmUgZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuXG5jb25zdCBHcmFwaFFMQ29uZmlnUGF0aCA9ICcvZ3JhcGhxbC1jb25maWcnO1xuXG5leHBvcnQgY2xhc3MgR3JhcGhRTFJvdXRlciBleHRlbmRzIFByb21pc2VSb3V0ZXIge1xuICBhc3luYyBnZXRHcmFwaFFMQ29uZmlnKHJlcSkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlcS5jb25maWcucGFyc2VHcmFwaFFMQ29udHJvbGxlci5nZXRHcmFwaFFMQ29uZmlnKCk7XG4gICAgcmV0dXJuIHtcbiAgICAgIHJlc3BvbnNlOiByZXN1bHQsXG4gICAgfTtcbiAgfVxuXG4gIGFzeW5jIHVwZGF0ZUdyYXBoUUxDb25maWcocmVxKSB7XG4gICAgaWYgKHJlcS5hdXRoLmlzUmVhZE9ubHkpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgXCJyZWFkLW9ubHkgbWFzdGVyS2V5IGlzbid0IGFsbG93ZWQgdG8gdXBkYXRlIHRoZSBHcmFwaFFMIGNvbmZpZy5cIlxuICAgICAgKTtcbiAgICB9XG4gICAgY29uc3QgZGF0YSA9IGF3YWl0IHJlcS5jb25maWcucGFyc2VHcmFwaFFMQ29udHJvbGxlci51cGRhdGVHcmFwaFFMQ29uZmlnKHJlcS5ib2R5LnBhcmFtcyk7XG4gICAgcmV0dXJuIHtcbiAgICAgIHJlc3BvbnNlOiBkYXRhLFxuICAgIH07XG4gIH1cblxuICBtb3VudFJvdXRlcygpIHtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCBHcmFwaFFMQ29uZmlnUGF0aCwgbWlkZGxld2FyZS5wcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmdldEdyYXBoUUxDb25maWcocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQVVQnLCBHcmFwaFFMQ29uZmlnUGF0aCwgbWlkZGxld2FyZS5wcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnVwZGF0ZUdyYXBoUUxDb25maWcocmVxKTtcbiAgICB9KTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBHcmFwaFFMUm91dGVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFBNkM7QUFBQTtBQUFBO0FBRTdDLE1BQU1BLGlCQUFpQixHQUFHLGlCQUFpQjtBQUVwQyxNQUFNQyxhQUFhLFNBQVNDLHNCQUFhLENBQUM7RUFDL0MsTUFBTUMsZ0JBQWdCLENBQUNDLEdBQUcsRUFBRTtJQUMxQixNQUFNQyxNQUFNLEdBQUcsTUFBTUQsR0FBRyxDQUFDRSxNQUFNLENBQUNDLHNCQUFzQixDQUFDSixnQkFBZ0IsRUFBRTtJQUN6RSxPQUFPO01BQ0xLLFFBQVEsRUFBRUg7SUFDWixDQUFDO0VBQ0g7RUFFQSxNQUFNSSxtQkFBbUIsQ0FBQ0wsR0FBRyxFQUFFO0lBQzdCLElBQUlBLEdBQUcsQ0FBQ00sSUFBSSxDQUFDQyxVQUFVLEVBQUU7TUFDdkIsTUFBTSxJQUFJQyxhQUFLLENBQUNDLEtBQUssQ0FDbkJELGFBQUssQ0FBQ0MsS0FBSyxDQUFDQyxtQkFBbUIsRUFDL0IsaUVBQWlFLENBQ2xFO0lBQ0g7SUFDQSxNQUFNQyxJQUFJLEdBQUcsTUFBTVgsR0FBRyxDQUFDRSxNQUFNLENBQUNDLHNCQUFzQixDQUFDRSxtQkFBbUIsQ0FBQ0wsR0FBRyxDQUFDWSxJQUFJLENBQUNDLE1BQU0sQ0FBQztJQUN6RixPQUFPO01BQ0xULFFBQVEsRUFBRU87SUFDWixDQUFDO0VBQ0g7RUFFQUcsV0FBVyxHQUFHO0lBQ1osSUFBSSxDQUFDQyxLQUFLLENBQUMsS0FBSyxFQUFFbkIsaUJBQWlCLEVBQUVvQixVQUFVLENBQUNDLDZCQUE2QixFQUFFakIsR0FBRyxJQUFJO01BQ3BGLE9BQU8sSUFBSSxDQUFDRCxnQkFBZ0IsQ0FBQ0MsR0FBRyxDQUFDO0lBQ25DLENBQUMsQ0FBQztJQUNGLElBQUksQ0FBQ2UsS0FBSyxDQUFDLEtBQUssRUFBRW5CLGlCQUFpQixFQUFFb0IsVUFBVSxDQUFDQyw2QkFBNkIsRUFBRWpCLEdBQUcsSUFBSTtNQUNwRixPQUFPLElBQUksQ0FBQ0ssbUJBQW1CLENBQUNMLEdBQUcsQ0FBQztJQUN0QyxDQUFDLENBQUM7RUFDSjtBQUNGO0FBQUM7QUFBQSxlQUVjSCxhQUFhO0FBQUEifQ==