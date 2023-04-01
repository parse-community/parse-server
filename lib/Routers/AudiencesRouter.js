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
    const options = _ClassesRouter.default.optionsFromBody(body);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJBdWRpZW5jZXNSb3V0ZXIiLCJDbGFzc2VzUm91dGVyIiwiY2xhc3NOYW1lIiwiaGFuZGxlRmluZCIsInJlcSIsImJvZHkiLCJPYmplY3QiLCJhc3NpZ24iLCJKU09ORnJvbVF1ZXJ5IiwicXVlcnkiLCJvcHRpb25zIiwib3B0aW9uc0Zyb21Cb2R5IiwicmVzdCIsImZpbmQiLCJjb25maWciLCJhdXRoIiwid2hlcmUiLCJpbmZvIiwiY2xpZW50U0RLIiwiY29udGV4dCIsInRoZW4iLCJyZXNwb25zZSIsInJlc3VsdHMiLCJmb3JFYWNoIiwiaXRlbSIsIkpTT04iLCJwYXJzZSIsImhhbmRsZUdldCIsImRhdGEiLCJtb3VudFJvdXRlcyIsInJvdXRlIiwibWlkZGxld2FyZSIsInByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzIiwiaGFuZGxlQ3JlYXRlIiwiaGFuZGxlVXBkYXRlIiwiaGFuZGxlRGVsZXRlIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL1JvdXRlcnMvQXVkaWVuY2VzUm91dGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBDbGFzc2VzUm91dGVyIGZyb20gJy4vQ2xhc3Nlc1JvdXRlcic7XG5pbXBvcnQgcmVzdCBmcm9tICcuLi9yZXN0JztcbmltcG9ydCAqIGFzIG1pZGRsZXdhcmUgZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuXG5leHBvcnQgY2xhc3MgQXVkaWVuY2VzUm91dGVyIGV4dGVuZHMgQ2xhc3Nlc1JvdXRlciB7XG4gIGNsYXNzTmFtZSgpIHtcbiAgICByZXR1cm4gJ19BdWRpZW5jZSc7XG4gIH1cblxuICBoYW5kbGVGaW5kKHJlcSkge1xuICAgIGNvbnN0IGJvZHkgPSBPYmplY3QuYXNzaWduKHJlcS5ib2R5LCBDbGFzc2VzUm91dGVyLkpTT05Gcm9tUXVlcnkocmVxLnF1ZXJ5KSk7XG4gICAgY29uc3Qgb3B0aW9ucyA9IENsYXNzZXNSb3V0ZXIub3B0aW9uc0Zyb21Cb2R5KGJvZHkpO1xuXG4gICAgcmV0dXJuIHJlc3RcbiAgICAgIC5maW5kKFxuICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICByZXEuYXV0aCxcbiAgICAgICAgJ19BdWRpZW5jZScsXG4gICAgICAgIGJvZHkud2hlcmUsXG4gICAgICAgIG9wdGlvbnMsXG4gICAgICAgIHJlcS5pbmZvLmNsaWVudFNESyxcbiAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICByZXNwb25zZS5yZXN1bHRzLmZvckVhY2goaXRlbSA9PiB7XG4gICAgICAgICAgaXRlbS5xdWVyeSA9IEpTT04ucGFyc2UoaXRlbS5xdWVyeSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiByZXNwb25zZSB9O1xuICAgICAgfSk7XG4gIH1cblxuICBoYW5kbGVHZXQocmVxKSB7XG4gICAgcmV0dXJuIHN1cGVyLmhhbmRsZUdldChyZXEpLnRoZW4oZGF0YSA9PiB7XG4gICAgICBkYXRhLnJlc3BvbnNlLnF1ZXJ5ID0gSlNPTi5wYXJzZShkYXRhLnJlc3BvbnNlLnF1ZXJ5KTtcblxuICAgICAgcmV0dXJuIGRhdGE7XG4gICAgfSk7XG4gIH1cblxuICBtb3VudFJvdXRlcygpIHtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3B1c2hfYXVkaWVuY2VzJywgbWlkZGxld2FyZS5wcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUZpbmQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ0dFVCcsXG4gICAgICAnL3B1c2hfYXVkaWVuY2VzLzpvYmplY3RJZCcsXG4gICAgICBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlR2V0KHJlcSk7XG4gICAgICB9XG4gICAgKTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9wdXNoX2F1ZGllbmNlcycsIG1pZGRsZXdhcmUucHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVDcmVhdGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ1BVVCcsXG4gICAgICAnL3B1c2hfYXVkaWVuY2VzLzpvYmplY3RJZCcsXG4gICAgICBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVXBkYXRlKHJlcSk7XG4gICAgICB9XG4gICAgKTtcbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ0RFTEVURScsXG4gICAgICAnL3B1c2hfYXVkaWVuY2VzLzpvYmplY3RJZCcsXG4gICAgICBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRGVsZXRlKHJlcSk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBBdWRpZW5jZXNSb3V0ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBO0FBQ0E7QUFDQTtBQUE2QztBQUFBO0FBQUE7QUFFdEMsTUFBTUEsZUFBZSxTQUFTQyxzQkFBYSxDQUFDO0VBQ2pEQyxTQUFTLEdBQUc7SUFDVixPQUFPLFdBQVc7RUFDcEI7RUFFQUMsVUFBVSxDQUFDQyxHQUFHLEVBQUU7SUFDZCxNQUFNQyxJQUFJLEdBQUdDLE1BQU0sQ0FBQ0MsTUFBTSxDQUFDSCxHQUFHLENBQUNDLElBQUksRUFBRUosc0JBQWEsQ0FBQ08sYUFBYSxDQUFDSixHQUFHLENBQUNLLEtBQUssQ0FBQyxDQUFDO0lBQzVFLE1BQU1DLE9BQU8sR0FBR1Qsc0JBQWEsQ0FBQ1UsZUFBZSxDQUFDTixJQUFJLENBQUM7SUFFbkQsT0FBT08sYUFBSSxDQUNSQyxJQUFJLENBQ0hULEdBQUcsQ0FBQ1UsTUFBTSxFQUNWVixHQUFHLENBQUNXLElBQUksRUFDUixXQUFXLEVBQ1hWLElBQUksQ0FBQ1csS0FBSyxFQUNWTixPQUFPLEVBQ1BOLEdBQUcsQ0FBQ2EsSUFBSSxDQUFDQyxTQUFTLEVBQ2xCZCxHQUFHLENBQUNhLElBQUksQ0FBQ0UsT0FBTyxDQUNqQixDQUNBQyxJQUFJLENBQUNDLFFBQVEsSUFBSTtNQUNoQkEsUUFBUSxDQUFDQyxPQUFPLENBQUNDLE9BQU8sQ0FBQ0MsSUFBSSxJQUFJO1FBQy9CQSxJQUFJLENBQUNmLEtBQUssR0FBR2dCLElBQUksQ0FBQ0MsS0FBSyxDQUFDRixJQUFJLENBQUNmLEtBQUssQ0FBQztNQUNyQyxDQUFDLENBQUM7TUFFRixPQUFPO1FBQUVZLFFBQVEsRUFBRUE7TUFBUyxDQUFDO0lBQy9CLENBQUMsQ0FBQztFQUNOO0VBRUFNLFNBQVMsQ0FBQ3ZCLEdBQUcsRUFBRTtJQUNiLE9BQU8sS0FBSyxDQUFDdUIsU0FBUyxDQUFDdkIsR0FBRyxDQUFDLENBQUNnQixJQUFJLENBQUNRLElBQUksSUFBSTtNQUN2Q0EsSUFBSSxDQUFDUCxRQUFRLENBQUNaLEtBQUssR0FBR2dCLElBQUksQ0FBQ0MsS0FBSyxDQUFDRSxJQUFJLENBQUNQLFFBQVEsQ0FBQ1osS0FBSyxDQUFDO01BRXJELE9BQU9tQixJQUFJO0lBQ2IsQ0FBQyxDQUFDO0VBQ0o7RUFFQUMsV0FBVyxHQUFHO0lBQ1osSUFBSSxDQUFDQyxLQUFLLENBQUMsS0FBSyxFQUFFLGlCQUFpQixFQUFFQyxVQUFVLENBQUNDLDZCQUE2QixFQUFFNUIsR0FBRyxJQUFJO01BQ3BGLE9BQU8sSUFBSSxDQUFDRCxVQUFVLENBQUNDLEdBQUcsQ0FBQztJQUM3QixDQUFDLENBQUM7SUFDRixJQUFJLENBQUMwQixLQUFLLENBQ1IsS0FBSyxFQUNMLDJCQUEyQixFQUMzQkMsVUFBVSxDQUFDQyw2QkFBNkIsRUFDeEM1QixHQUFHLElBQUk7TUFDTCxPQUFPLElBQUksQ0FBQ3VCLFNBQVMsQ0FBQ3ZCLEdBQUcsQ0FBQztJQUM1QixDQUFDLENBQ0Y7SUFDRCxJQUFJLENBQUMwQixLQUFLLENBQUMsTUFBTSxFQUFFLGlCQUFpQixFQUFFQyxVQUFVLENBQUNDLDZCQUE2QixFQUFFNUIsR0FBRyxJQUFJO01BQ3JGLE9BQU8sSUFBSSxDQUFDNkIsWUFBWSxDQUFDN0IsR0FBRyxDQUFDO0lBQy9CLENBQUMsQ0FBQztJQUNGLElBQUksQ0FBQzBCLEtBQUssQ0FDUixLQUFLLEVBQ0wsMkJBQTJCLEVBQzNCQyxVQUFVLENBQUNDLDZCQUE2QixFQUN4QzVCLEdBQUcsSUFBSTtNQUNMLE9BQU8sSUFBSSxDQUFDOEIsWUFBWSxDQUFDOUIsR0FBRyxDQUFDO0lBQy9CLENBQUMsQ0FDRjtJQUNELElBQUksQ0FBQzBCLEtBQUssQ0FDUixRQUFRLEVBQ1IsMkJBQTJCLEVBQzNCQyxVQUFVLENBQUNDLDZCQUE2QixFQUN4QzVCLEdBQUcsSUFBSTtNQUNMLE9BQU8sSUFBSSxDQUFDK0IsWUFBWSxDQUFDL0IsR0FBRyxDQUFDO0lBQy9CLENBQUMsQ0FDRjtFQUNIO0FBQ0Y7QUFBQztBQUFBLGVBRWNKLGVBQWU7QUFBQSJ9