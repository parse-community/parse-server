"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.AudiencesRouter = void 0;

var _ClassesRouter = _interopRequireDefault(require("./ClassesRouter"));

var _rest = _interopRequireDefault(require("../rest"));

var middleware = _interopRequireWildcard(require("../middlewares"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0F1ZGllbmNlc1JvdXRlci5qcyJdLCJuYW1lcyI6WyJBdWRpZW5jZXNSb3V0ZXIiLCJDbGFzc2VzUm91dGVyIiwiY2xhc3NOYW1lIiwiaGFuZGxlRmluZCIsInJlcSIsImJvZHkiLCJPYmplY3QiLCJhc3NpZ24iLCJKU09ORnJvbVF1ZXJ5IiwicXVlcnkiLCJvcHRpb25zIiwib3B0aW9uc0Zyb21Cb2R5IiwicmVzdCIsImZpbmQiLCJjb25maWciLCJhdXRoIiwid2hlcmUiLCJpbmZvIiwiY2xpZW50U0RLIiwiY29udGV4dCIsInRoZW4iLCJyZXNwb25zZSIsInJlc3VsdHMiLCJmb3JFYWNoIiwiaXRlbSIsIkpTT04iLCJwYXJzZSIsImhhbmRsZUdldCIsImRhdGEiLCJtb3VudFJvdXRlcyIsInJvdXRlIiwibWlkZGxld2FyZSIsInByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzIiwiaGFuZGxlQ3JlYXRlIiwiaGFuZGxlVXBkYXRlIiwiaGFuZGxlRGVsZXRlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBRU8sTUFBTUEsZUFBTixTQUE4QkMsc0JBQTlCLENBQTRDO0FBQ2pEQyxFQUFBQSxTQUFTLEdBQUc7QUFDVixXQUFPLFdBQVA7QUFDRDs7QUFFREMsRUFBQUEsVUFBVSxDQUFDQyxHQUFELEVBQU07QUFDZCxVQUFNQyxJQUFJLEdBQUdDLE1BQU0sQ0FBQ0MsTUFBUCxDQUFjSCxHQUFHLENBQUNDLElBQWxCLEVBQXdCSix1QkFBY08sYUFBZCxDQUE0QkosR0FBRyxDQUFDSyxLQUFoQyxDQUF4QixDQUFiOztBQUNBLFVBQU1DLE9BQU8sR0FBR1QsdUJBQWNVLGVBQWQsQ0FBOEJOLElBQTlCLENBQWhCOztBQUVBLFdBQU9PLGNBQ0pDLElBREksQ0FFSFQsR0FBRyxDQUFDVSxNQUZELEVBR0hWLEdBQUcsQ0FBQ1csSUFIRCxFQUlILFdBSkcsRUFLSFYsSUFBSSxDQUFDVyxLQUxGLEVBTUhOLE9BTkcsRUFPSE4sR0FBRyxDQUFDYSxJQUFKLENBQVNDLFNBUE4sRUFRSGQsR0FBRyxDQUFDYSxJQUFKLENBQVNFLE9BUk4sRUFVSkMsSUFWSSxDQVVDQyxRQUFRLElBQUk7QUFDaEJBLE1BQUFBLFFBQVEsQ0FBQ0MsT0FBVCxDQUFpQkMsT0FBakIsQ0FBeUJDLElBQUksSUFBSTtBQUMvQkEsUUFBQUEsSUFBSSxDQUFDZixLQUFMLEdBQWFnQixJQUFJLENBQUNDLEtBQUwsQ0FBV0YsSUFBSSxDQUFDZixLQUFoQixDQUFiO0FBQ0QsT0FGRDtBQUlBLGFBQU87QUFBRVksUUFBQUEsUUFBUSxFQUFFQTtBQUFaLE9BQVA7QUFDRCxLQWhCSSxDQUFQO0FBaUJEOztBQUVETSxFQUFBQSxTQUFTLENBQUN2QixHQUFELEVBQU07QUFDYixXQUFPLE1BQU11QixTQUFOLENBQWdCdkIsR0FBaEIsRUFBcUJnQixJQUFyQixDQUEwQlEsSUFBSSxJQUFJO0FBQ3ZDQSxNQUFBQSxJQUFJLENBQUNQLFFBQUwsQ0FBY1osS0FBZCxHQUFzQmdCLElBQUksQ0FBQ0MsS0FBTCxDQUFXRSxJQUFJLENBQUNQLFFBQUwsQ0FBY1osS0FBekIsQ0FBdEI7QUFFQSxhQUFPbUIsSUFBUDtBQUNELEtBSk0sQ0FBUDtBQUtEOztBQUVEQyxFQUFBQSxXQUFXLEdBQUc7QUFDWixTQUFLQyxLQUFMLENBQVcsS0FBWCxFQUFrQixpQkFBbEIsRUFBcUNDLFVBQVUsQ0FBQ0MsNkJBQWhELEVBQStFNUIsR0FBRyxJQUFJO0FBQ3BGLGFBQU8sS0FBS0QsVUFBTCxDQUFnQkMsR0FBaEIsQ0FBUDtBQUNELEtBRkQ7QUFHQSxTQUFLMEIsS0FBTCxDQUNFLEtBREYsRUFFRSwyQkFGRixFQUdFQyxVQUFVLENBQUNDLDZCQUhiLEVBSUU1QixHQUFHLElBQUk7QUFDTCxhQUFPLEtBQUt1QixTQUFMLENBQWV2QixHQUFmLENBQVA7QUFDRCxLQU5IO0FBUUEsU0FBSzBCLEtBQUwsQ0FBVyxNQUFYLEVBQW1CLGlCQUFuQixFQUFzQ0MsVUFBVSxDQUFDQyw2QkFBakQsRUFBZ0Y1QixHQUFHLElBQUk7QUFDckYsYUFBTyxLQUFLNkIsWUFBTCxDQUFrQjdCLEdBQWxCLENBQVA7QUFDRCxLQUZEO0FBR0EsU0FBSzBCLEtBQUwsQ0FDRSxLQURGLEVBRUUsMkJBRkYsRUFHRUMsVUFBVSxDQUFDQyw2QkFIYixFQUlFNUIsR0FBRyxJQUFJO0FBQ0wsYUFBTyxLQUFLOEIsWUFBTCxDQUFrQjlCLEdBQWxCLENBQVA7QUFDRCxLQU5IO0FBUUEsU0FBSzBCLEtBQUwsQ0FDRSxRQURGLEVBRUUsMkJBRkYsRUFHRUMsVUFBVSxDQUFDQyw2QkFIYixFQUlFNUIsR0FBRyxJQUFJO0FBQ0wsYUFBTyxLQUFLK0IsWUFBTCxDQUFrQi9CLEdBQWxCLENBQVA7QUFDRCxLQU5IO0FBUUQ7O0FBbkVnRDs7O2VBc0VwQ0osZSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBDbGFzc2VzUm91dGVyIGZyb20gJy4vQ2xhc3Nlc1JvdXRlcic7XG5pbXBvcnQgcmVzdCBmcm9tICcuLi9yZXN0JztcbmltcG9ydCAqIGFzIG1pZGRsZXdhcmUgZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuXG5leHBvcnQgY2xhc3MgQXVkaWVuY2VzUm91dGVyIGV4dGVuZHMgQ2xhc3Nlc1JvdXRlciB7XG4gIGNsYXNzTmFtZSgpIHtcbiAgICByZXR1cm4gJ19BdWRpZW5jZSc7XG4gIH1cblxuICBoYW5kbGVGaW5kKHJlcSkge1xuICAgIGNvbnN0IGJvZHkgPSBPYmplY3QuYXNzaWduKHJlcS5ib2R5LCBDbGFzc2VzUm91dGVyLkpTT05Gcm9tUXVlcnkocmVxLnF1ZXJ5KSk7XG4gICAgY29uc3Qgb3B0aW9ucyA9IENsYXNzZXNSb3V0ZXIub3B0aW9uc0Zyb21Cb2R5KGJvZHkpO1xuXG4gICAgcmV0dXJuIHJlc3RcbiAgICAgIC5maW5kKFxuICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICByZXEuYXV0aCxcbiAgICAgICAgJ19BdWRpZW5jZScsXG4gICAgICAgIGJvZHkud2hlcmUsXG4gICAgICAgIG9wdGlvbnMsXG4gICAgICAgIHJlcS5pbmZvLmNsaWVudFNESyxcbiAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICByZXNwb25zZS5yZXN1bHRzLmZvckVhY2goaXRlbSA9PiB7XG4gICAgICAgICAgaXRlbS5xdWVyeSA9IEpTT04ucGFyc2UoaXRlbS5xdWVyeSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiByZXNwb25zZSB9O1xuICAgICAgfSk7XG4gIH1cblxuICBoYW5kbGVHZXQocmVxKSB7XG4gICAgcmV0dXJuIHN1cGVyLmhhbmRsZUdldChyZXEpLnRoZW4oZGF0YSA9PiB7XG4gICAgICBkYXRhLnJlc3BvbnNlLnF1ZXJ5ID0gSlNPTi5wYXJzZShkYXRhLnJlc3BvbnNlLnF1ZXJ5KTtcblxuICAgICAgcmV0dXJuIGRhdGE7XG4gICAgfSk7XG4gIH1cblxuICBtb3VudFJvdXRlcygpIHtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3B1c2hfYXVkaWVuY2VzJywgbWlkZGxld2FyZS5wcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUZpbmQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ0dFVCcsXG4gICAgICAnL3B1c2hfYXVkaWVuY2VzLzpvYmplY3RJZCcsXG4gICAgICBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlR2V0KHJlcSk7XG4gICAgICB9XG4gICAgKTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9wdXNoX2F1ZGllbmNlcycsIG1pZGRsZXdhcmUucHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVDcmVhdGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ1BVVCcsXG4gICAgICAnL3B1c2hfYXVkaWVuY2VzLzpvYmplY3RJZCcsXG4gICAgICBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVXBkYXRlKHJlcSk7XG4gICAgICB9XG4gICAgKTtcbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ0RFTEVURScsXG4gICAgICAnL3B1c2hfYXVkaWVuY2VzLzpvYmplY3RJZCcsXG4gICAgICBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRGVsZXRlKHJlcSk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBBdWRpZW5jZXNSb3V0ZXI7XG4iXX0=