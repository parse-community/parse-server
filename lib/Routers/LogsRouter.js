"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.LogsRouter = void 0;

var _node = require("parse/node");

var _PromiseRouter = _interopRequireDefault(require("../PromiseRouter"));

var middleware = _interopRequireWildcard(require("../middlewares"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class LogsRouter extends _PromiseRouter.default {
  mountRoutes() {
    this.route('GET', '/scriptlog', middleware.promiseEnforceMasterKeyAccess, this.validateRequest, req => {
      return this.handleGET(req);
    });
  }

  validateRequest(req) {
    if (!req.config || !req.config.loggerController) {
      throw new _node.Parse.Error(_node.Parse.Error.PUSH_MISCONFIGURED, 'Logger adapter is not available');
    }
  } // Returns a promise for a {response} object.
  // query params:
  // level (optional) Level of logging you want to query for (info || error)
  // from (optional) Start time for the search. Defaults to 1 week ago.
  // until (optional) End time for the search. Defaults to current time.
  // order (optional) Direction of results returned, either “asc” or “desc”. Defaults to “desc”.
  // size (optional) Number of rows returned by search. Defaults to 10
  // n same as size, overrides size if set


  handleGET(req) {
    const from = req.query.from;
    const until = req.query.until;
    let size = req.query.size;

    if (req.query.n) {
      size = req.query.n;
    }

    const order = req.query.order;
    const level = req.query.level;
    const options = {
      from,
      until,
      size,
      order,
      level
    };
    return req.config.loggerController.getLogs(options).then(result => {
      return Promise.resolve({
        response: result
      });
    });
  }

}

exports.LogsRouter = LogsRouter;
var _default = LogsRouter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0xvZ3NSb3V0ZXIuanMiXSwibmFtZXMiOlsiTG9nc1JvdXRlciIsIlByb21pc2VSb3V0ZXIiLCJtb3VudFJvdXRlcyIsInJvdXRlIiwibWlkZGxld2FyZSIsInByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzIiwidmFsaWRhdGVSZXF1ZXN0IiwicmVxIiwiaGFuZGxlR0VUIiwiY29uZmlnIiwibG9nZ2VyQ29udHJvbGxlciIsIlBhcnNlIiwiRXJyb3IiLCJQVVNIX01JU0NPTkZJR1VSRUQiLCJmcm9tIiwicXVlcnkiLCJ1bnRpbCIsInNpemUiLCJuIiwib3JkZXIiLCJsZXZlbCIsIm9wdGlvbnMiLCJnZXRMb2dzIiwidGhlbiIsInJlc3VsdCIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVzcG9uc2UiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFTyxNQUFNQSxVQUFOLFNBQXlCQyxzQkFBekIsQ0FBdUM7QUFDNUNDLEVBQUFBLFdBQVcsR0FBRztBQUNaLFNBQUtDLEtBQUwsQ0FDRSxLQURGLEVBRUUsWUFGRixFQUdFQyxVQUFVLENBQUNDLDZCQUhiLEVBSUUsS0FBS0MsZUFKUCxFQUtFQyxHQUFHLElBQUk7QUFDTCxhQUFPLEtBQUtDLFNBQUwsQ0FBZUQsR0FBZixDQUFQO0FBQ0QsS0FQSDtBQVNEOztBQUVERCxFQUFBQSxlQUFlLENBQUNDLEdBQUQsRUFBTTtBQUNuQixRQUFJLENBQUNBLEdBQUcsQ0FBQ0UsTUFBTCxJQUFlLENBQUNGLEdBQUcsQ0FBQ0UsTUFBSixDQUFXQyxnQkFBL0IsRUFBaUQ7QUFDL0MsWUFBTSxJQUFJQyxZQUFNQyxLQUFWLENBQWdCRCxZQUFNQyxLQUFOLENBQVlDLGtCQUE1QixFQUFnRCxpQ0FBaEQsQ0FBTjtBQUNEO0FBQ0YsR0FqQjJDLENBbUI1QztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUFDQUwsRUFBQUEsU0FBUyxDQUFDRCxHQUFELEVBQU07QUFDYixVQUFNTyxJQUFJLEdBQUdQLEdBQUcsQ0FBQ1EsS0FBSixDQUFVRCxJQUF2QjtBQUNBLFVBQU1FLEtBQUssR0FBR1QsR0FBRyxDQUFDUSxLQUFKLENBQVVDLEtBQXhCO0FBQ0EsUUFBSUMsSUFBSSxHQUFHVixHQUFHLENBQUNRLEtBQUosQ0FBVUUsSUFBckI7O0FBQ0EsUUFBSVYsR0FBRyxDQUFDUSxLQUFKLENBQVVHLENBQWQsRUFBaUI7QUFDZkQsTUFBQUEsSUFBSSxHQUFHVixHQUFHLENBQUNRLEtBQUosQ0FBVUcsQ0FBakI7QUFDRDs7QUFFRCxVQUFNQyxLQUFLLEdBQUdaLEdBQUcsQ0FBQ1EsS0FBSixDQUFVSSxLQUF4QjtBQUNBLFVBQU1DLEtBQUssR0FBR2IsR0FBRyxDQUFDUSxLQUFKLENBQVVLLEtBQXhCO0FBQ0EsVUFBTUMsT0FBTyxHQUFHO0FBQ2RQLE1BQUFBLElBRGM7QUFFZEUsTUFBQUEsS0FGYztBQUdkQyxNQUFBQSxJQUhjO0FBSWRFLE1BQUFBLEtBSmM7QUFLZEMsTUFBQUE7QUFMYyxLQUFoQjtBQVFBLFdBQU9iLEdBQUcsQ0FBQ0UsTUFBSixDQUFXQyxnQkFBWCxDQUE0QlksT0FBNUIsQ0FBb0NELE9BQXBDLEVBQTZDRSxJQUE3QyxDQUFrREMsTUFBTSxJQUFJO0FBQ2pFLGFBQU9DLE9BQU8sQ0FBQ0MsT0FBUixDQUFnQjtBQUNyQkMsUUFBQUEsUUFBUSxFQUFFSDtBQURXLE9BQWhCLENBQVA7QUFHRCxLQUpNLENBQVA7QUFLRDs7QUFsRDJDOzs7ZUFxRC9CeEIsVSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFBhcnNlIH0gZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgUHJvbWlzZVJvdXRlciBmcm9tICcuLi9Qcm9taXNlUm91dGVyJztcbmltcG9ydCAqIGFzIG1pZGRsZXdhcmUgZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuXG5leHBvcnQgY2xhc3MgTG9nc1JvdXRlciBleHRlbmRzIFByb21pc2VSb3V0ZXIge1xuICBtb3VudFJvdXRlcygpIHtcbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ0dFVCcsXG4gICAgICAnL3NjcmlwdGxvZycsXG4gICAgICBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLFxuICAgICAgdGhpcy52YWxpZGF0ZVJlcXVlc3QsXG4gICAgICByZXEgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5oYW5kbGVHRVQocmVxKTtcbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgdmFsaWRhdGVSZXF1ZXN0KHJlcSkge1xuICAgIGlmICghcmVxLmNvbmZpZyB8fCAhcmVxLmNvbmZpZy5sb2dnZXJDb250cm9sbGVyKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuUFVTSF9NSVNDT05GSUdVUkVELCAnTG9nZ2VyIGFkYXB0ZXIgaXMgbm90IGF2YWlsYWJsZScpO1xuICAgIH1cbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIHtyZXNwb25zZX0gb2JqZWN0LlxuICAvLyBxdWVyeSBwYXJhbXM6XG4gIC8vIGxldmVsIChvcHRpb25hbCkgTGV2ZWwgb2YgbG9nZ2luZyB5b3Ugd2FudCB0byBxdWVyeSBmb3IgKGluZm8gfHwgZXJyb3IpXG4gIC8vIGZyb20gKG9wdGlvbmFsKSBTdGFydCB0aW1lIGZvciB0aGUgc2VhcmNoLiBEZWZhdWx0cyB0byAxIHdlZWsgYWdvLlxuICAvLyB1bnRpbCAob3B0aW9uYWwpIEVuZCB0aW1lIGZvciB0aGUgc2VhcmNoLiBEZWZhdWx0cyB0byBjdXJyZW50IHRpbWUuXG4gIC8vIG9yZGVyIChvcHRpb25hbCkgRGlyZWN0aW9uIG9mIHJlc3VsdHMgcmV0dXJuZWQsIGVpdGhlciDigJxhc2PigJ0gb3Ig4oCcZGVzY+KAnS4gRGVmYXVsdHMgdG8g4oCcZGVzY+KAnS5cbiAgLy8gc2l6ZSAob3B0aW9uYWwpIE51bWJlciBvZiByb3dzIHJldHVybmVkIGJ5IHNlYXJjaC4gRGVmYXVsdHMgdG8gMTBcbiAgLy8gbiBzYW1lIGFzIHNpemUsIG92ZXJyaWRlcyBzaXplIGlmIHNldFxuICBoYW5kbGVHRVQocmVxKSB7XG4gICAgY29uc3QgZnJvbSA9IHJlcS5xdWVyeS5mcm9tO1xuICAgIGNvbnN0IHVudGlsID0gcmVxLnF1ZXJ5LnVudGlsO1xuICAgIGxldCBzaXplID0gcmVxLnF1ZXJ5LnNpemU7XG4gICAgaWYgKHJlcS5xdWVyeS5uKSB7XG4gICAgICBzaXplID0gcmVxLnF1ZXJ5Lm47XG4gICAgfVxuXG4gICAgY29uc3Qgb3JkZXIgPSByZXEucXVlcnkub3JkZXI7XG4gICAgY29uc3QgbGV2ZWwgPSByZXEucXVlcnkubGV2ZWw7XG4gICAgY29uc3Qgb3B0aW9ucyA9IHtcbiAgICAgIGZyb20sXG4gICAgICB1bnRpbCxcbiAgICAgIHNpemUsXG4gICAgICBvcmRlcixcbiAgICAgIGxldmVsLFxuICAgIH07XG5cbiAgICByZXR1cm4gcmVxLmNvbmZpZy5sb2dnZXJDb250cm9sbGVyLmdldExvZ3Mob3B0aW9ucykudGhlbihyZXN1bHQgPT4ge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgIHJlc3BvbnNlOiByZXN1bHQsXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBMb2dzUm91dGVyO1xuIl19