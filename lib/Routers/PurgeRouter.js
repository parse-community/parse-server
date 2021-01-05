"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.PurgeRouter = void 0;

var _PromiseRouter = _interopRequireDefault(require("../PromiseRouter"));

var middleware = _interopRequireWildcard(require("../middlewares"));

var _node = _interopRequireDefault(require("parse/node"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1B1cmdlUm91dGVyLmpzIl0sIm5hbWVzIjpbIlB1cmdlUm91dGVyIiwiUHJvbWlzZVJvdXRlciIsImhhbmRsZVB1cmdlIiwicmVxIiwiYXV0aCIsImlzUmVhZE9ubHkiLCJQYXJzZSIsIkVycm9yIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsImNvbmZpZyIsImRhdGFiYXNlIiwicHVyZ2VDb2xsZWN0aW9uIiwicGFyYW1zIiwiY2xhc3NOYW1lIiwidGhlbiIsImNhY2hlQWRhcHRlciIsImNhY2hlQ29udHJvbGxlciIsInVzZXIiLCJjbGVhciIsInJvbGUiLCJyZXNwb25zZSIsImNhdGNoIiwiZXJyb3IiLCJjb2RlIiwiT0JKRUNUX05PVF9GT1VORCIsIm1vdW50Um91dGVzIiwicm91dGUiLCJtaWRkbGV3YXJlIiwicHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFTyxNQUFNQSxXQUFOLFNBQTBCQyxzQkFBMUIsQ0FBd0M7QUFDN0NDLEVBQUFBLFdBQVcsQ0FBQ0MsR0FBRCxFQUFNO0FBQ2YsUUFBSUEsR0FBRyxDQUFDQyxJQUFKLENBQVNDLFVBQWIsRUFBeUI7QUFDdkIsWUFBTSxJQUFJQyxjQUFNQyxLQUFWLENBQ0pELGNBQU1DLEtBQU4sQ0FBWUMsbUJBRFIsRUFFSixzREFGSSxDQUFOO0FBSUQ7O0FBQ0QsV0FBT0wsR0FBRyxDQUFDTSxNQUFKLENBQVdDLFFBQVgsQ0FDSkMsZUFESSxDQUNZUixHQUFHLENBQUNTLE1BQUosQ0FBV0MsU0FEdkIsRUFFSkMsSUFGSSxDQUVDLE1BQU07QUFDVixVQUFJQyxZQUFZLEdBQUdaLEdBQUcsQ0FBQ00sTUFBSixDQUFXTyxlQUE5Qjs7QUFDQSxVQUFJYixHQUFHLENBQUNTLE1BQUosQ0FBV0MsU0FBWCxJQUF3QixVQUE1QixFQUF3QztBQUN0Q0UsUUFBQUEsWUFBWSxDQUFDRSxJQUFiLENBQWtCQyxLQUFsQjtBQUNELE9BRkQsTUFFTyxJQUFJZixHQUFHLENBQUNTLE1BQUosQ0FBV0MsU0FBWCxJQUF3QixPQUE1QixFQUFxQztBQUMxQ0UsUUFBQUEsWUFBWSxDQUFDSSxJQUFiLENBQWtCRCxLQUFsQjtBQUNEOztBQUNELGFBQU87QUFBRUUsUUFBQUEsUUFBUSxFQUFFO0FBQVosT0FBUDtBQUNELEtBVkksRUFXSkMsS0FYSSxDQVdFQyxLQUFLLElBQUk7QUFDZCxVQUFJLENBQUNBLEtBQUQsSUFBV0EsS0FBSyxJQUFJQSxLQUFLLENBQUNDLElBQU4sS0FBZWpCLGNBQU1DLEtBQU4sQ0FBWWlCLGdCQUFuRCxFQUFzRTtBQUNwRSxlQUFPO0FBQUVKLFVBQUFBLFFBQVEsRUFBRTtBQUFaLFNBQVA7QUFDRDs7QUFDRCxZQUFNRSxLQUFOO0FBQ0QsS0FoQkksQ0FBUDtBQWlCRDs7QUFFREcsRUFBQUEsV0FBVyxHQUFHO0FBQ1osU0FBS0MsS0FBTCxDQUFXLFFBQVgsRUFBcUIsbUJBQXJCLEVBQTBDQyxVQUFVLENBQUNDLDZCQUFyRCxFQUFvRnpCLEdBQUcsSUFBSTtBQUN6RixhQUFPLEtBQUtELFdBQUwsQ0FBaUJDLEdBQWpCLENBQVA7QUFDRCxLQUZEO0FBR0Q7O0FBL0I0Qzs7O2VBa0NoQ0gsVyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQcm9taXNlUm91dGVyIGZyb20gJy4uL1Byb21pc2VSb3V0ZXInO1xuaW1wb3J0ICogYXMgbWlkZGxld2FyZSBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5cbmV4cG9ydCBjbGFzcyBQdXJnZVJvdXRlciBleHRlbmRzIFByb21pc2VSb3V0ZXIge1xuICBoYW5kbGVQdXJnZShyZXEpIHtcbiAgICBpZiAocmVxLmF1dGguaXNSZWFkT25seSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICBcInJlYWQtb25seSBtYXN0ZXJLZXkgaXNuJ3QgYWxsb3dlZCB0byBwdXJnZSBhIHNjaGVtYS5cIlxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlcS5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5wdXJnZUNvbGxlY3Rpb24ocmVxLnBhcmFtcy5jbGFzc05hbWUpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHZhciBjYWNoZUFkYXB0ZXIgPSByZXEuY29uZmlnLmNhY2hlQ29udHJvbGxlcjtcbiAgICAgICAgaWYgKHJlcS5wYXJhbXMuY2xhc3NOYW1lID09ICdfU2Vzc2lvbicpIHtcbiAgICAgICAgICBjYWNoZUFkYXB0ZXIudXNlci5jbGVhcigpO1xuICAgICAgICB9IGVsc2UgaWYgKHJlcS5wYXJhbXMuY2xhc3NOYW1lID09ICdfUm9sZScpIHtcbiAgICAgICAgICBjYWNoZUFkYXB0ZXIucm9sZS5jbGVhcigpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiB7fSB9O1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmICghZXJyb3IgfHwgKGVycm9yICYmIGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpKSB7XG4gICAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2U6IHt9IH07XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgfVxuXG4gIG1vdW50Um91dGVzKCkge1xuICAgIHRoaXMucm91dGUoJ0RFTEVURScsICcvcHVyZ2UvOmNsYXNzTmFtZScsIG1pZGRsZXdhcmUucHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVQdXJnZShyZXEpO1xuICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFB1cmdlUm91dGVyO1xuIl19