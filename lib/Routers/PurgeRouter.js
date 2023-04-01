"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.PurgeRouter = void 0;
var _PromiseRouter = _interopRequireDefault(require("../PromiseRouter"));
var middleware = _interopRequireWildcard(require("../middlewares"));
var _node = _interopRequireDefault(require("parse/node"));
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
class PurgeRouter extends _PromiseRouter.default {
  handlePurge(req) {
    if (req.auth.isReadOnly) {
      throw new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, "read-only masterKey isn't allowed to purge a schema.");
    }
    return req.config.database.purgeCollection(req.params.className).then(() => {
      var cacheAdapter = req.config.cacheController;
      if (req.params.className == '_Session') {
        cacheAdapter.user.clear();
      } else if (req.params.className == '_Role') {
        cacheAdapter.role.clear();
      }
      return {
        response: {}
      };
    }).catch(error => {
      if (!error || error && error.code === _node.default.Error.OBJECT_NOT_FOUND) {
        return {
          response: {}
        };
      }
      throw error;
    });
  }
  mountRoutes() {
    this.route('DELETE', '/purge/:className', middleware.promiseEnforceMasterKeyAccess, req => {
      return this.handlePurge(req);
    });
  }
}
exports.PurgeRouter = PurgeRouter;
var _default = PurgeRouter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQdXJnZVJvdXRlciIsIlByb21pc2VSb3V0ZXIiLCJoYW5kbGVQdXJnZSIsInJlcSIsImF1dGgiLCJpc1JlYWRPbmx5IiwiUGFyc2UiLCJFcnJvciIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJjb25maWciLCJkYXRhYmFzZSIsInB1cmdlQ29sbGVjdGlvbiIsInBhcmFtcyIsImNsYXNzTmFtZSIsInRoZW4iLCJjYWNoZUFkYXB0ZXIiLCJjYWNoZUNvbnRyb2xsZXIiLCJ1c2VyIiwiY2xlYXIiLCJyb2xlIiwicmVzcG9uc2UiLCJjYXRjaCIsImVycm9yIiwiY29kZSIsIk9CSkVDVF9OT1RfRk9VTkQiLCJtb3VudFJvdXRlcyIsInJvdXRlIiwibWlkZGxld2FyZSIsInByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL1JvdXRlcnMvUHVyZ2VSb3V0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFByb21pc2VSb3V0ZXIgZnJvbSAnLi4vUHJvbWlzZVJvdXRlcic7XG5pbXBvcnQgKiBhcyBtaWRkbGV3YXJlIGZyb20gJy4uL21pZGRsZXdhcmVzJztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcblxuZXhwb3J0IGNsYXNzIFB1cmdlUm91dGVyIGV4dGVuZHMgUHJvbWlzZVJvdXRlciB7XG4gIGhhbmRsZVB1cmdlKHJlcSkge1xuICAgIGlmIChyZXEuYXV0aC5pc1JlYWRPbmx5KSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgIFwicmVhZC1vbmx5IG1hc3RlcktleSBpc24ndCBhbGxvd2VkIHRvIHB1cmdlIGEgc2NoZW1hLlwiXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gcmVxLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLnB1cmdlQ29sbGVjdGlvbihyZXEucGFyYW1zLmNsYXNzTmFtZSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgdmFyIGNhY2hlQWRhcHRlciA9IHJlcS5jb25maWcuY2FjaGVDb250cm9sbGVyO1xuICAgICAgICBpZiAocmVxLnBhcmFtcy5jbGFzc05hbWUgPT0gJ19TZXNzaW9uJykge1xuICAgICAgICAgIGNhY2hlQWRhcHRlci51c2VyLmNsZWFyKCk7XG4gICAgICAgIH0gZWxzZSBpZiAocmVxLnBhcmFtcy5jbGFzc05hbWUgPT0gJ19Sb2xlJykge1xuICAgICAgICAgIGNhY2hlQWRhcHRlci5yb2xlLmNsZWFyKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2U6IHt9IH07XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKCFlcnJvciB8fCAoZXJyb3IgJiYgZXJyb3IuY29kZSA9PT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkpIHtcbiAgICAgICAgICByZXR1cm4geyByZXNwb25zZToge30gfTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICB9XG5cbiAgbW91bnRSb3V0ZXMoKSB7XG4gICAgdGhpcy5yb3V0ZSgnREVMRVRFJywgJy9wdXJnZS86Y2xhc3NOYW1lJywgbWlkZGxld2FyZS5wcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVB1cmdlKHJlcSk7XG4gICAgfSk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgUHVyZ2VSb3V0ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBO0FBQ0E7QUFDQTtBQUErQjtBQUFBO0FBQUE7QUFFeEIsTUFBTUEsV0FBVyxTQUFTQyxzQkFBYSxDQUFDO0VBQzdDQyxXQUFXLENBQUNDLEdBQUcsRUFBRTtJQUNmLElBQUlBLEdBQUcsQ0FBQ0MsSUFBSSxDQUFDQyxVQUFVLEVBQUU7TUFDdkIsTUFBTSxJQUFJQyxhQUFLLENBQUNDLEtBQUssQ0FDbkJELGFBQUssQ0FBQ0MsS0FBSyxDQUFDQyxtQkFBbUIsRUFDL0Isc0RBQXNELENBQ3ZEO0lBQ0g7SUFDQSxPQUFPTCxHQUFHLENBQUNNLE1BQU0sQ0FBQ0MsUUFBUSxDQUN2QkMsZUFBZSxDQUFDUixHQUFHLENBQUNTLE1BQU0sQ0FBQ0MsU0FBUyxDQUFDLENBQ3JDQyxJQUFJLENBQUMsTUFBTTtNQUNWLElBQUlDLFlBQVksR0FBR1osR0FBRyxDQUFDTSxNQUFNLENBQUNPLGVBQWU7TUFDN0MsSUFBSWIsR0FBRyxDQUFDUyxNQUFNLENBQUNDLFNBQVMsSUFBSSxVQUFVLEVBQUU7UUFDdENFLFlBQVksQ0FBQ0UsSUFBSSxDQUFDQyxLQUFLLEVBQUU7TUFDM0IsQ0FBQyxNQUFNLElBQUlmLEdBQUcsQ0FBQ1MsTUFBTSxDQUFDQyxTQUFTLElBQUksT0FBTyxFQUFFO1FBQzFDRSxZQUFZLENBQUNJLElBQUksQ0FBQ0QsS0FBSyxFQUFFO01BQzNCO01BQ0EsT0FBTztRQUFFRSxRQUFRLEVBQUUsQ0FBQztNQUFFLENBQUM7SUFDekIsQ0FBQyxDQUFDLENBQ0RDLEtBQUssQ0FBQ0MsS0FBSyxJQUFJO01BQ2QsSUFBSSxDQUFDQSxLQUFLLElBQUtBLEtBQUssSUFBSUEsS0FBSyxDQUFDQyxJQUFJLEtBQUtqQixhQUFLLENBQUNDLEtBQUssQ0FBQ2lCLGdCQUFpQixFQUFFO1FBQ3BFLE9BQU87VUFBRUosUUFBUSxFQUFFLENBQUM7UUFBRSxDQUFDO01BQ3pCO01BQ0EsTUFBTUUsS0FBSztJQUNiLENBQUMsQ0FBQztFQUNOO0VBRUFHLFdBQVcsR0FBRztJQUNaLElBQUksQ0FBQ0MsS0FBSyxDQUFDLFFBQVEsRUFBRSxtQkFBbUIsRUFBRUMsVUFBVSxDQUFDQyw2QkFBNkIsRUFBRXpCLEdBQUcsSUFBSTtNQUN6RixPQUFPLElBQUksQ0FBQ0QsV0FBVyxDQUFDQyxHQUFHLENBQUM7SUFDOUIsQ0FBQyxDQUFDO0VBQ0o7QUFDRjtBQUFDO0FBQUEsZUFFY0gsV0FBVztBQUFBIn0=