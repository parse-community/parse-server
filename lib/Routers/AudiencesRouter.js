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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0F1ZGllbmNlc1JvdXRlci5qcyJdLCJuYW1lcyI6WyJBdWRpZW5jZXNSb3V0ZXIiLCJDbGFzc2VzUm91dGVyIiwiY2xhc3NOYW1lIiwiaGFuZGxlRmluZCIsInJlcSIsImJvZHkiLCJPYmplY3QiLCJhc3NpZ24iLCJKU09ORnJvbVF1ZXJ5IiwicXVlcnkiLCJvcHRpb25zIiwib3B0aW9uc0Zyb21Cb2R5IiwiY29uZmlnIiwiZGVmYXVsdExpbWl0IiwicmVzdCIsImZpbmQiLCJhdXRoIiwid2hlcmUiLCJpbmZvIiwiY2xpZW50U0RLIiwiY29udGV4dCIsInRoZW4iLCJyZXNwb25zZSIsInJlc3VsdHMiLCJmb3JFYWNoIiwiaXRlbSIsIkpTT04iLCJwYXJzZSIsImhhbmRsZUdldCIsImRhdGEiLCJtb3VudFJvdXRlcyIsInJvdXRlIiwibWlkZGxld2FyZSIsInByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzIiwiaGFuZGxlQ3JlYXRlIiwiaGFuZGxlVXBkYXRlIiwiaGFuZGxlRGVsZXRlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBRU8sTUFBTUEsZUFBTixTQUE4QkMsc0JBQTlCLENBQTRDO0FBQ2pEQyxFQUFBQSxTQUFTLEdBQUc7QUFDVixXQUFPLFdBQVA7QUFDRDs7QUFFREMsRUFBQUEsVUFBVSxDQUFDQyxHQUFELEVBQU07QUFDZCxVQUFNQyxJQUFJLEdBQUdDLE1BQU0sQ0FBQ0MsTUFBUCxDQUFjSCxHQUFHLENBQUNDLElBQWxCLEVBQXdCSix1QkFBY08sYUFBZCxDQUE0QkosR0FBRyxDQUFDSyxLQUFoQyxDQUF4QixDQUFiOztBQUNBLFVBQU1DLE9BQU8sR0FBR1QsdUJBQWNVLGVBQWQsQ0FBOEJOLElBQTlCLEVBQW9DRCxHQUFHLENBQUNRLE1BQUosQ0FBV0MsWUFBL0MsQ0FBaEI7O0FBRUEsV0FBT0MsY0FDSkMsSUFESSxDQUVIWCxHQUFHLENBQUNRLE1BRkQsRUFHSFIsR0FBRyxDQUFDWSxJQUhELEVBSUgsV0FKRyxFQUtIWCxJQUFJLENBQUNZLEtBTEYsRUFNSFAsT0FORyxFQU9ITixHQUFHLENBQUNjLElBQUosQ0FBU0MsU0FQTixFQVFIZixHQUFHLENBQUNjLElBQUosQ0FBU0UsT0FSTixFQVVKQyxJQVZJLENBVUNDLFFBQVEsSUFBSTtBQUNoQkEsTUFBQUEsUUFBUSxDQUFDQyxPQUFULENBQWlCQyxPQUFqQixDQUF5QkMsSUFBSSxJQUFJO0FBQy9CQSxRQUFBQSxJQUFJLENBQUNoQixLQUFMLEdBQWFpQixJQUFJLENBQUNDLEtBQUwsQ0FBV0YsSUFBSSxDQUFDaEIsS0FBaEIsQ0FBYjtBQUNELE9BRkQ7QUFJQSxhQUFPO0FBQUVhLFFBQUFBLFFBQVEsRUFBRUE7QUFBWixPQUFQO0FBQ0QsS0FoQkksQ0FBUDtBQWlCRDs7QUFFRE0sRUFBQUEsU0FBUyxDQUFDeEIsR0FBRCxFQUFNO0FBQ2IsV0FBTyxNQUFNd0IsU0FBTixDQUFnQnhCLEdBQWhCLEVBQXFCaUIsSUFBckIsQ0FBMEJRLElBQUksSUFBSTtBQUN2Q0EsTUFBQUEsSUFBSSxDQUFDUCxRQUFMLENBQWNiLEtBQWQsR0FBc0JpQixJQUFJLENBQUNDLEtBQUwsQ0FBV0UsSUFBSSxDQUFDUCxRQUFMLENBQWNiLEtBQXpCLENBQXRCO0FBRUEsYUFBT29CLElBQVA7QUFDRCxLQUpNLENBQVA7QUFLRDs7QUFFREMsRUFBQUEsV0FBVyxHQUFHO0FBQ1osU0FBS0MsS0FBTCxDQUFXLEtBQVgsRUFBa0IsaUJBQWxCLEVBQXFDQyxVQUFVLENBQUNDLDZCQUFoRCxFQUErRTdCLEdBQUcsSUFBSTtBQUNwRixhQUFPLEtBQUtELFVBQUwsQ0FBZ0JDLEdBQWhCLENBQVA7QUFDRCxLQUZEO0FBR0EsU0FBSzJCLEtBQUwsQ0FDRSxLQURGLEVBRUUsMkJBRkYsRUFHRUMsVUFBVSxDQUFDQyw2QkFIYixFQUlFN0IsR0FBRyxJQUFJO0FBQ0wsYUFBTyxLQUFLd0IsU0FBTCxDQUFleEIsR0FBZixDQUFQO0FBQ0QsS0FOSDtBQVFBLFNBQUsyQixLQUFMLENBQVcsTUFBWCxFQUFtQixpQkFBbkIsRUFBc0NDLFVBQVUsQ0FBQ0MsNkJBQWpELEVBQWdGN0IsR0FBRyxJQUFJO0FBQ3JGLGFBQU8sS0FBSzhCLFlBQUwsQ0FBa0I5QixHQUFsQixDQUFQO0FBQ0QsS0FGRDtBQUdBLFNBQUsyQixLQUFMLENBQ0UsS0FERixFQUVFLDJCQUZGLEVBR0VDLFVBQVUsQ0FBQ0MsNkJBSGIsRUFJRTdCLEdBQUcsSUFBSTtBQUNMLGFBQU8sS0FBSytCLFlBQUwsQ0FBa0IvQixHQUFsQixDQUFQO0FBQ0QsS0FOSDtBQVFBLFNBQUsyQixLQUFMLENBQ0UsUUFERixFQUVFLDJCQUZGLEVBR0VDLFVBQVUsQ0FBQ0MsNkJBSGIsRUFJRTdCLEdBQUcsSUFBSTtBQUNMLGFBQU8sS0FBS2dDLFlBQUwsQ0FBa0JoQyxHQUFsQixDQUFQO0FBQ0QsS0FOSDtBQVFEOztBQW5FZ0Q7OztlQXNFcENKLGUiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgQ2xhc3Nlc1JvdXRlciBmcm9tICcuL0NsYXNzZXNSb3V0ZXInO1xuaW1wb3J0IHJlc3QgZnJvbSAnLi4vcmVzdCc7XG5pbXBvcnQgKiBhcyBtaWRkbGV3YXJlIGZyb20gJy4uL21pZGRsZXdhcmVzJztcblxuZXhwb3J0IGNsYXNzIEF1ZGllbmNlc1JvdXRlciBleHRlbmRzIENsYXNzZXNSb3V0ZXIge1xuICBjbGFzc05hbWUoKSB7XG4gICAgcmV0dXJuICdfQXVkaWVuY2UnO1xuICB9XG5cbiAgaGFuZGxlRmluZChyZXEpIHtcbiAgICBjb25zdCBib2R5ID0gT2JqZWN0LmFzc2lnbihyZXEuYm9keSwgQ2xhc3Nlc1JvdXRlci5KU09ORnJvbVF1ZXJ5KHJlcS5xdWVyeSkpO1xuICAgIGNvbnN0IG9wdGlvbnMgPSBDbGFzc2VzUm91dGVyLm9wdGlvbnNGcm9tQm9keShib2R5LCByZXEuY29uZmlnLmRlZmF1bHRMaW1pdCk7XG5cbiAgICByZXR1cm4gcmVzdFxuICAgICAgLmZpbmQoXG4gICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgIHJlcS5hdXRoLFxuICAgICAgICAnX0F1ZGllbmNlJyxcbiAgICAgICAgYm9keS53aGVyZSxcbiAgICAgICAgb3B0aW9ucyxcbiAgICAgICAgcmVxLmluZm8uY2xpZW50U0RLLFxuICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICApXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgIHJlc3BvbnNlLnJlc3VsdHMuZm9yRWFjaChpdGVtID0+IHtcbiAgICAgICAgICBpdGVtLnF1ZXJ5ID0gSlNPTi5wYXJzZShpdGVtLnF1ZXJ5KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2U6IHJlc3BvbnNlIH07XG4gICAgICB9KTtcbiAgfVxuXG4gIGhhbmRsZUdldChyZXEpIHtcbiAgICByZXR1cm4gc3VwZXIuaGFuZGxlR2V0KHJlcSkudGhlbihkYXRhID0+IHtcbiAgICAgIGRhdGEucmVzcG9uc2UucXVlcnkgPSBKU09OLnBhcnNlKGRhdGEucmVzcG9uc2UucXVlcnkpO1xuXG4gICAgICByZXR1cm4gZGF0YTtcbiAgICB9KTtcbiAgfVxuXG4gIG1vdW50Um91dGVzKCkge1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvcHVzaF9hdWRpZW5jZXMnLCBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRmluZChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoXG4gICAgICAnR0VUJyxcbiAgICAgICcvcHVzaF9hdWRpZW5jZXMvOm9iamVjdElkJyxcbiAgICAgIG1pZGRsZXdhcmUucHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsXG4gICAgICByZXEgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5oYW5kbGVHZXQocmVxKTtcbiAgICAgIH1cbiAgICApO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3B1c2hfYXVkaWVuY2VzJywgbWlkZGxld2FyZS5wcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUNyZWF0ZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoXG4gICAgICAnUFVUJyxcbiAgICAgICcvcHVzaF9hdWRpZW5jZXMvOm9iamVjdElkJyxcbiAgICAgIG1pZGRsZXdhcmUucHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsXG4gICAgICByZXEgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5oYW5kbGVVcGRhdGUocmVxKTtcbiAgICAgIH1cbiAgICApO1xuICAgIHRoaXMucm91dGUoXG4gICAgICAnREVMRVRFJyxcbiAgICAgICcvcHVzaF9hdWRpZW5jZXMvOm9iamVjdElkJyxcbiAgICAgIG1pZGRsZXdhcmUucHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsXG4gICAgICByZXEgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5oYW5kbGVEZWxldGUocmVxKTtcbiAgICAgIH1cbiAgICApO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IEF1ZGllbmNlc1JvdXRlcjtcbiJdfQ==