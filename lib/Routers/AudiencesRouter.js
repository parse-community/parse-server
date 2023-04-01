"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.AudiencesRouter = void 0;
var _ClassesRouter = _interopRequireDefault(require("./ClassesRouter"));
var _rest = _interopRequireDefault(require("../rest"));
var middleware = _interopRequireWildcard(require("../middlewares"));
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
class AudiencesRouter extends _ClassesRouter.default {
  className() {
    return '_Audience';
  }
  handleFind(req) {
    const body = Object.assign(req.body, _ClassesRouter.default.JSONFromQuery(req.query));
    const options = _ClassesRouter.default.optionsFromBody(body, req.config.defaultLimit);
    return _rest.default.find(req.config, req.auth, '_Audience', body.where, options, req.info.clientSDK, req.info.context).then(response => {
      response.results.forEach(item => {
        item.query = JSON.parse(item.query);
      });
      return {
        response: response
      };
    });
  }
  handleGet(req) {
    return super.handleGet(req).then(data => {
      data.response.query = JSON.parse(data.response.query);
      return data;
    });
  }
  mountRoutes() {
    this.route('GET', '/push_audiences', middleware.promiseEnforceMasterKeyAccess, req => {
      return this.handleFind(req);
    });
    this.route('GET', '/push_audiences/:objectId', middleware.promiseEnforceMasterKeyAccess, req => {
      return this.handleGet(req);
    });
    this.route('POST', '/push_audiences', middleware.promiseEnforceMasterKeyAccess, req => {
      return this.handleCreate(req);
    });
    this.route('PUT', '/push_audiences/:objectId', middleware.promiseEnforceMasterKeyAccess, req => {
      return this.handleUpdate(req);
    });
    this.route('DELETE', '/push_audiences/:objectId', middleware.promiseEnforceMasterKeyAccess, req => {
      return this.handleDelete(req);
    });
  }
}
exports.AudiencesRouter = AudiencesRouter;
var _default = AudiencesRouter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJBdWRpZW5jZXNSb3V0ZXIiLCJDbGFzc2VzUm91dGVyIiwiY2xhc3NOYW1lIiwiaGFuZGxlRmluZCIsInJlcSIsImJvZHkiLCJPYmplY3QiLCJhc3NpZ24iLCJKU09ORnJvbVF1ZXJ5IiwicXVlcnkiLCJvcHRpb25zIiwib3B0aW9uc0Zyb21Cb2R5IiwiY29uZmlnIiwiZGVmYXVsdExpbWl0IiwicmVzdCIsImZpbmQiLCJhdXRoIiwid2hlcmUiLCJpbmZvIiwiY2xpZW50U0RLIiwiY29udGV4dCIsInRoZW4iLCJyZXNwb25zZSIsInJlc3VsdHMiLCJmb3JFYWNoIiwiaXRlbSIsIkpTT04iLCJwYXJzZSIsImhhbmRsZUdldCIsImRhdGEiLCJtb3VudFJvdXRlcyIsInJvdXRlIiwibWlkZGxld2FyZSIsInByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzIiwiaGFuZGxlQ3JlYXRlIiwiaGFuZGxlVXBkYXRlIiwiaGFuZGxlRGVsZXRlIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL1JvdXRlcnMvQXVkaWVuY2VzUm91dGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBDbGFzc2VzUm91dGVyIGZyb20gJy4vQ2xhc3Nlc1JvdXRlcic7XG5pbXBvcnQgcmVzdCBmcm9tICcuLi9yZXN0JztcbmltcG9ydCAqIGFzIG1pZGRsZXdhcmUgZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuXG5leHBvcnQgY2xhc3MgQXVkaWVuY2VzUm91dGVyIGV4dGVuZHMgQ2xhc3Nlc1JvdXRlciB7XG4gIGNsYXNzTmFtZSgpIHtcbiAgICByZXR1cm4gJ19BdWRpZW5jZSc7XG4gIH1cblxuICBoYW5kbGVGaW5kKHJlcSkge1xuICAgIGNvbnN0IGJvZHkgPSBPYmplY3QuYXNzaWduKHJlcS5ib2R5LCBDbGFzc2VzUm91dGVyLkpTT05Gcm9tUXVlcnkocmVxLnF1ZXJ5KSk7XG4gICAgY29uc3Qgb3B0aW9ucyA9IENsYXNzZXNSb3V0ZXIub3B0aW9uc0Zyb21Cb2R5KGJvZHksIHJlcS5jb25maWcuZGVmYXVsdExpbWl0KTtcblxuICAgIHJldHVybiByZXN0XG4gICAgICAuZmluZChcbiAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgcmVxLmF1dGgsXG4gICAgICAgICdfQXVkaWVuY2UnLFxuICAgICAgICBib2R5LndoZXJlLFxuICAgICAgICBvcHRpb25zLFxuICAgICAgICByZXEuaW5mby5jbGllbnRTREssXG4gICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgcmVzcG9uc2UucmVzdWx0cy5mb3JFYWNoKGl0ZW0gPT4ge1xuICAgICAgICAgIGl0ZW0ucXVlcnkgPSBKU09OLnBhcnNlKGl0ZW0ucXVlcnkpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4geyByZXNwb25zZTogcmVzcG9uc2UgfTtcbiAgICAgIH0pO1xuICB9XG5cbiAgaGFuZGxlR2V0KHJlcSkge1xuICAgIHJldHVybiBzdXBlci5oYW5kbGVHZXQocmVxKS50aGVuKGRhdGEgPT4ge1xuICAgICAgZGF0YS5yZXNwb25zZS5xdWVyeSA9IEpTT04ucGFyc2UoZGF0YS5yZXNwb25zZS5xdWVyeSk7XG5cbiAgICAgIHJldHVybiBkYXRhO1xuICAgIH0pO1xuICB9XG5cbiAgbW91bnRSb3V0ZXMoKSB7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy9wdXNoX2F1ZGllbmNlcycsIG1pZGRsZXdhcmUucHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVGaW5kKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdHRVQnLFxuICAgICAgJy9wdXNoX2F1ZGllbmNlcy86b2JqZWN0SWQnLFxuICAgICAgbWlkZGxld2FyZS5wcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcyxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmhhbmRsZUdldChyZXEpO1xuICAgICAgfVxuICAgICk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvcHVzaF9hdWRpZW5jZXMnLCBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlQ3JlYXRlKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdQVVQnLFxuICAgICAgJy9wdXNoX2F1ZGllbmNlcy86b2JqZWN0SWQnLFxuICAgICAgbWlkZGxld2FyZS5wcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcyxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmhhbmRsZVVwZGF0ZShyZXEpO1xuICAgICAgfVxuICAgICk7XG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdERUxFVEUnLFxuICAgICAgJy9wdXNoX2F1ZGllbmNlcy86b2JqZWN0SWQnLFxuICAgICAgbWlkZGxld2FyZS5wcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcyxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmhhbmRsZURlbGV0ZShyZXEpO1xuICAgICAgfVxuICAgICk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgQXVkaWVuY2VzUm91dGVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFBNkM7QUFBQTtBQUFBO0FBRXRDLE1BQU1BLGVBQWUsU0FBU0Msc0JBQWEsQ0FBQztFQUNqREMsU0FBUyxHQUFHO0lBQ1YsT0FBTyxXQUFXO0VBQ3BCO0VBRUFDLFVBQVUsQ0FBQ0MsR0FBRyxFQUFFO0lBQ2QsTUFBTUMsSUFBSSxHQUFHQyxNQUFNLENBQUNDLE1BQU0sQ0FBQ0gsR0FBRyxDQUFDQyxJQUFJLEVBQUVKLHNCQUFhLENBQUNPLGFBQWEsQ0FBQ0osR0FBRyxDQUFDSyxLQUFLLENBQUMsQ0FBQztJQUM1RSxNQUFNQyxPQUFPLEdBQUdULHNCQUFhLENBQUNVLGVBQWUsQ0FBQ04sSUFBSSxFQUFFRCxHQUFHLENBQUNRLE1BQU0sQ0FBQ0MsWUFBWSxDQUFDO0lBRTVFLE9BQU9DLGFBQUksQ0FDUkMsSUFBSSxDQUNIWCxHQUFHLENBQUNRLE1BQU0sRUFDVlIsR0FBRyxDQUFDWSxJQUFJLEVBQ1IsV0FBVyxFQUNYWCxJQUFJLENBQUNZLEtBQUssRUFDVlAsT0FBTyxFQUNQTixHQUFHLENBQUNjLElBQUksQ0FBQ0MsU0FBUyxFQUNsQmYsR0FBRyxDQUFDYyxJQUFJLENBQUNFLE9BQU8sQ0FDakIsQ0FDQUMsSUFBSSxDQUFDQyxRQUFRLElBQUk7TUFDaEJBLFFBQVEsQ0FBQ0MsT0FBTyxDQUFDQyxPQUFPLENBQUNDLElBQUksSUFBSTtRQUMvQkEsSUFBSSxDQUFDaEIsS0FBSyxHQUFHaUIsSUFBSSxDQUFDQyxLQUFLLENBQUNGLElBQUksQ0FBQ2hCLEtBQUssQ0FBQztNQUNyQyxDQUFDLENBQUM7TUFFRixPQUFPO1FBQUVhLFFBQVEsRUFBRUE7TUFBUyxDQUFDO0lBQy9CLENBQUMsQ0FBQztFQUNOO0VBRUFNLFNBQVMsQ0FBQ3hCLEdBQUcsRUFBRTtJQUNiLE9BQU8sS0FBSyxDQUFDd0IsU0FBUyxDQUFDeEIsR0FBRyxDQUFDLENBQUNpQixJQUFJLENBQUNRLElBQUksSUFBSTtNQUN2Q0EsSUFBSSxDQUFDUCxRQUFRLENBQUNiLEtBQUssR0FBR2lCLElBQUksQ0FBQ0MsS0FBSyxDQUFDRSxJQUFJLENBQUNQLFFBQVEsQ0FBQ2IsS0FBSyxDQUFDO01BRXJELE9BQU9vQixJQUFJO0lBQ2IsQ0FBQyxDQUFDO0VBQ0o7RUFFQUMsV0FBVyxHQUFHO0lBQ1osSUFBSSxDQUFDQyxLQUFLLENBQUMsS0FBSyxFQUFFLGlCQUFpQixFQUFFQyxVQUFVLENBQUNDLDZCQUE2QixFQUFFN0IsR0FBRyxJQUFJO01BQ3BGLE9BQU8sSUFBSSxDQUFDRCxVQUFVLENBQUNDLEdBQUcsQ0FBQztJQUM3QixDQUFDLENBQUM7SUFDRixJQUFJLENBQUMyQixLQUFLLENBQ1IsS0FBSyxFQUNMLDJCQUEyQixFQUMzQkMsVUFBVSxDQUFDQyw2QkFBNkIsRUFDeEM3QixHQUFHLElBQUk7TUFDTCxPQUFPLElBQUksQ0FBQ3dCLFNBQVMsQ0FBQ3hCLEdBQUcsQ0FBQztJQUM1QixDQUFDLENBQ0Y7SUFDRCxJQUFJLENBQUMyQixLQUFLLENBQUMsTUFBTSxFQUFFLGlCQUFpQixFQUFFQyxVQUFVLENBQUNDLDZCQUE2QixFQUFFN0IsR0FBRyxJQUFJO01BQ3JGLE9BQU8sSUFBSSxDQUFDOEIsWUFBWSxDQUFDOUIsR0FBRyxDQUFDO0lBQy9CLENBQUMsQ0FBQztJQUNGLElBQUksQ0FBQzJCLEtBQUssQ0FDUixLQUFLLEVBQ0wsMkJBQTJCLEVBQzNCQyxVQUFVLENBQUNDLDZCQUE2QixFQUN4QzdCLEdBQUcsSUFBSTtNQUNMLE9BQU8sSUFBSSxDQUFDK0IsWUFBWSxDQUFDL0IsR0FBRyxDQUFDO0lBQy9CLENBQUMsQ0FDRjtJQUNELElBQUksQ0FBQzJCLEtBQUssQ0FDUixRQUFRLEVBQ1IsMkJBQTJCLEVBQzNCQyxVQUFVLENBQUNDLDZCQUE2QixFQUN4QzdCLEdBQUcsSUFBSTtNQUNMLE9BQU8sSUFBSSxDQUFDZ0MsWUFBWSxDQUFDaEMsR0FBRyxDQUFDO0lBQy9CLENBQUMsQ0FDRjtFQUNIO0FBQ0Y7QUFBQztBQUFBLGVBRWNKLGVBQWU7QUFBQSJ9