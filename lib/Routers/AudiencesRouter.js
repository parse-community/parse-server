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

    return _rest.default.find(req.config, req.auth, '_Audience', body.where, options, req.info.clientSDK).then(response => {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0F1ZGllbmNlc1JvdXRlci5qcyJdLCJuYW1lcyI6WyJBdWRpZW5jZXNSb3V0ZXIiLCJDbGFzc2VzUm91dGVyIiwiY2xhc3NOYW1lIiwiaGFuZGxlRmluZCIsInJlcSIsImJvZHkiLCJPYmplY3QiLCJhc3NpZ24iLCJKU09ORnJvbVF1ZXJ5IiwicXVlcnkiLCJvcHRpb25zIiwib3B0aW9uc0Zyb21Cb2R5IiwicmVzdCIsImZpbmQiLCJjb25maWciLCJhdXRoIiwid2hlcmUiLCJpbmZvIiwiY2xpZW50U0RLIiwidGhlbiIsInJlc3BvbnNlIiwicmVzdWx0cyIsImZvckVhY2giLCJpdGVtIiwiSlNPTiIsInBhcnNlIiwiaGFuZGxlR2V0IiwiZGF0YSIsIm1vdW50Um91dGVzIiwicm91dGUiLCJtaWRkbGV3YXJlIiwicHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MiLCJoYW5kbGVDcmVhdGUiLCJoYW5kbGVVcGRhdGUiLCJoYW5kbGVEZWxldGUiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFTyxNQUFNQSxlQUFOLFNBQThCQyxzQkFBOUIsQ0FBNEM7QUFDakRDLEVBQUFBLFNBQVMsR0FBRztBQUNWLFdBQU8sV0FBUDtBQUNEOztBQUVEQyxFQUFBQSxVQUFVLENBQUNDLEdBQUQsRUFBTTtBQUNkLFVBQU1DLElBQUksR0FBR0MsTUFBTSxDQUFDQyxNQUFQLENBQ1hILEdBQUcsQ0FBQ0MsSUFETyxFQUVYSix1QkFBY08sYUFBZCxDQUE0QkosR0FBRyxDQUFDSyxLQUFoQyxDQUZXLENBQWI7O0FBSUEsVUFBTUMsT0FBTyxHQUFHVCx1QkFBY1UsZUFBZCxDQUE4Qk4sSUFBOUIsQ0FBaEI7O0FBRUEsV0FBT08sY0FDSkMsSUFESSxDQUVIVCxHQUFHLENBQUNVLE1BRkQsRUFHSFYsR0FBRyxDQUFDVyxJQUhELEVBSUgsV0FKRyxFQUtIVixJQUFJLENBQUNXLEtBTEYsRUFNSE4sT0FORyxFQU9ITixHQUFHLENBQUNhLElBQUosQ0FBU0MsU0FQTixFQVNKQyxJQVRJLENBU0NDLFFBQVEsSUFBSTtBQUNoQkEsTUFBQUEsUUFBUSxDQUFDQyxPQUFULENBQWlCQyxPQUFqQixDQUF5QkMsSUFBSSxJQUFJO0FBQy9CQSxRQUFBQSxJQUFJLENBQUNkLEtBQUwsR0FBYWUsSUFBSSxDQUFDQyxLQUFMLENBQVdGLElBQUksQ0FBQ2QsS0FBaEIsQ0FBYjtBQUNELE9BRkQ7QUFJQSxhQUFPO0FBQUVXLFFBQUFBLFFBQVEsRUFBRUE7QUFBWixPQUFQO0FBQ0QsS0FmSSxDQUFQO0FBZ0JEOztBQUVETSxFQUFBQSxTQUFTLENBQUN0QixHQUFELEVBQU07QUFDYixXQUFPLE1BQU1zQixTQUFOLENBQWdCdEIsR0FBaEIsRUFBcUJlLElBQXJCLENBQTBCUSxJQUFJLElBQUk7QUFDdkNBLE1BQUFBLElBQUksQ0FBQ1AsUUFBTCxDQUFjWCxLQUFkLEdBQXNCZSxJQUFJLENBQUNDLEtBQUwsQ0FBV0UsSUFBSSxDQUFDUCxRQUFMLENBQWNYLEtBQXpCLENBQXRCO0FBRUEsYUFBT2tCLElBQVA7QUFDRCxLQUpNLENBQVA7QUFLRDs7QUFFREMsRUFBQUEsV0FBVyxHQUFHO0FBQ1osU0FBS0MsS0FBTCxDQUNFLEtBREYsRUFFRSxpQkFGRixFQUdFQyxVQUFVLENBQUNDLDZCQUhiLEVBSUUzQixHQUFHLElBQUk7QUFDTCxhQUFPLEtBQUtELFVBQUwsQ0FBZ0JDLEdBQWhCLENBQVA7QUFDRCxLQU5IO0FBUUEsU0FBS3lCLEtBQUwsQ0FDRSxLQURGLEVBRUUsMkJBRkYsRUFHRUMsVUFBVSxDQUFDQyw2QkFIYixFQUlFM0IsR0FBRyxJQUFJO0FBQ0wsYUFBTyxLQUFLc0IsU0FBTCxDQUFldEIsR0FBZixDQUFQO0FBQ0QsS0FOSDtBQVFBLFNBQUt5QixLQUFMLENBQ0UsTUFERixFQUVFLGlCQUZGLEVBR0VDLFVBQVUsQ0FBQ0MsNkJBSGIsRUFJRTNCLEdBQUcsSUFBSTtBQUNMLGFBQU8sS0FBSzRCLFlBQUwsQ0FBa0I1QixHQUFsQixDQUFQO0FBQ0QsS0FOSDtBQVFBLFNBQUt5QixLQUFMLENBQ0UsS0FERixFQUVFLDJCQUZGLEVBR0VDLFVBQVUsQ0FBQ0MsNkJBSGIsRUFJRTNCLEdBQUcsSUFBSTtBQUNMLGFBQU8sS0FBSzZCLFlBQUwsQ0FBa0I3QixHQUFsQixDQUFQO0FBQ0QsS0FOSDtBQVFBLFNBQUt5QixLQUFMLENBQ0UsUUFERixFQUVFLDJCQUZGLEVBR0VDLFVBQVUsQ0FBQ0MsNkJBSGIsRUFJRTNCLEdBQUcsSUFBSTtBQUNMLGFBQU8sS0FBSzhCLFlBQUwsQ0FBa0I5QixHQUFsQixDQUFQO0FBQ0QsS0FOSDtBQVFEOztBQS9FZ0Q7OztlQWtGcENKLGUiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgQ2xhc3Nlc1JvdXRlciBmcm9tICcuL0NsYXNzZXNSb3V0ZXInO1xuaW1wb3J0IHJlc3QgZnJvbSAnLi4vcmVzdCc7XG5pbXBvcnQgKiBhcyBtaWRkbGV3YXJlIGZyb20gJy4uL21pZGRsZXdhcmVzJztcblxuZXhwb3J0IGNsYXNzIEF1ZGllbmNlc1JvdXRlciBleHRlbmRzIENsYXNzZXNSb3V0ZXIge1xuICBjbGFzc05hbWUoKSB7XG4gICAgcmV0dXJuICdfQXVkaWVuY2UnO1xuICB9XG5cbiAgaGFuZGxlRmluZChyZXEpIHtcbiAgICBjb25zdCBib2R5ID0gT2JqZWN0LmFzc2lnbihcbiAgICAgIHJlcS5ib2R5LFxuICAgICAgQ2xhc3Nlc1JvdXRlci5KU09ORnJvbVF1ZXJ5KHJlcS5xdWVyeSlcbiAgICApO1xuICAgIGNvbnN0IG9wdGlvbnMgPSBDbGFzc2VzUm91dGVyLm9wdGlvbnNGcm9tQm9keShib2R5KTtcblxuICAgIHJldHVybiByZXN0XG4gICAgICAuZmluZChcbiAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgcmVxLmF1dGgsXG4gICAgICAgICdfQXVkaWVuY2UnLFxuICAgICAgICBib2R5LndoZXJlLFxuICAgICAgICBvcHRpb25zLFxuICAgICAgICByZXEuaW5mby5jbGllbnRTREtcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgcmVzcG9uc2UucmVzdWx0cy5mb3JFYWNoKGl0ZW0gPT4ge1xuICAgICAgICAgIGl0ZW0ucXVlcnkgPSBKU09OLnBhcnNlKGl0ZW0ucXVlcnkpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4geyByZXNwb25zZTogcmVzcG9uc2UgfTtcbiAgICAgIH0pO1xuICB9XG5cbiAgaGFuZGxlR2V0KHJlcSkge1xuICAgIHJldHVybiBzdXBlci5oYW5kbGVHZXQocmVxKS50aGVuKGRhdGEgPT4ge1xuICAgICAgZGF0YS5yZXNwb25zZS5xdWVyeSA9IEpTT04ucGFyc2UoZGF0YS5yZXNwb25zZS5xdWVyeSk7XG5cbiAgICAgIHJldHVybiBkYXRhO1xuICAgIH0pO1xuICB9XG5cbiAgbW91bnRSb3V0ZXMoKSB7XG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdHRVQnLFxuICAgICAgJy9wdXNoX2F1ZGllbmNlcycsXG4gICAgICBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRmluZChyZXEpO1xuICAgICAgfVxuICAgICk7XG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdHRVQnLFxuICAgICAgJy9wdXNoX2F1ZGllbmNlcy86b2JqZWN0SWQnLFxuICAgICAgbWlkZGxld2FyZS5wcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcyxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmhhbmRsZUdldChyZXEpO1xuICAgICAgfVxuICAgICk7XG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdQT1NUJyxcbiAgICAgICcvcHVzaF9hdWRpZW5jZXMnLFxuICAgICAgbWlkZGxld2FyZS5wcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcyxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmhhbmRsZUNyZWF0ZShyZXEpO1xuICAgICAgfVxuICAgICk7XG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdQVVQnLFxuICAgICAgJy9wdXNoX2F1ZGllbmNlcy86b2JqZWN0SWQnLFxuICAgICAgbWlkZGxld2FyZS5wcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcyxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmhhbmRsZVVwZGF0ZShyZXEpO1xuICAgICAgfVxuICAgICk7XG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdERUxFVEUnLFxuICAgICAgJy9wdXNoX2F1ZGllbmNlcy86b2JqZWN0SWQnLFxuICAgICAgbWlkZGxld2FyZS5wcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcyxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmhhbmRsZURlbGV0ZShyZXEpO1xuICAgICAgfVxuICAgICk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgQXVkaWVuY2VzUm91dGVyO1xuIl19