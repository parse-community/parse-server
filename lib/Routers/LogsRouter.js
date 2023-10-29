"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.LogsRouter = void 0;
var _node = require("parse/node");
var _PromiseRouter = _interopRequireDefault(require("../PromiseRouter"));
var middleware = _interopRequireWildcard(require("../middlewares"));
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
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
  }

  // Returns a promise for a {response} object.
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsInJlcXVpcmUiLCJfUHJvbWlzZVJvdXRlciIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJtaWRkbGV3YXJlIiwiX2ludGVyb3BSZXF1aXJlV2lsZGNhcmQiLCJfZ2V0UmVxdWlyZVdpbGRjYXJkQ2FjaGUiLCJub2RlSW50ZXJvcCIsIldlYWtNYXAiLCJjYWNoZUJhYmVsSW50ZXJvcCIsImNhY2hlTm9kZUludGVyb3AiLCJvYmoiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsImNhY2hlIiwiaGFzIiwiZ2V0IiwibmV3T2JqIiwiaGFzUHJvcGVydHlEZXNjcmlwdG9yIiwiT2JqZWN0IiwiZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJrZXkiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJkZXNjIiwic2V0IiwiTG9nc1JvdXRlciIsIlByb21pc2VSb3V0ZXIiLCJtb3VudFJvdXRlcyIsInJvdXRlIiwicHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MiLCJ2YWxpZGF0ZVJlcXVlc3QiLCJyZXEiLCJoYW5kbGVHRVQiLCJjb25maWciLCJsb2dnZXJDb250cm9sbGVyIiwiUGFyc2UiLCJFcnJvciIsIlBVU0hfTUlTQ09ORklHVVJFRCIsImZyb20iLCJxdWVyeSIsInVudGlsIiwic2l6ZSIsIm4iLCJvcmRlciIsImxldmVsIiwib3B0aW9ucyIsImdldExvZ3MiLCJ0aGVuIiwicmVzdWx0IiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZXNwb25zZSIsImV4cG9ydHMiLCJfZGVmYXVsdCJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0xvZ3NSb3V0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgUGFyc2UgfSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBQcm9taXNlUm91dGVyIGZyb20gJy4uL1Byb21pc2VSb3V0ZXInO1xuaW1wb3J0ICogYXMgbWlkZGxld2FyZSBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5cbmV4cG9ydCBjbGFzcyBMb2dzUm91dGVyIGV4dGVuZHMgUHJvbWlzZVJvdXRlciB7XG4gIG1vdW50Um91dGVzKCkge1xuICAgIHRoaXMucm91dGUoXG4gICAgICAnR0VUJyxcbiAgICAgICcvc2NyaXB0bG9nJyxcbiAgICAgIG1pZGRsZXdhcmUucHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsXG4gICAgICB0aGlzLnZhbGlkYXRlUmVxdWVzdCxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmhhbmRsZUdFVChyZXEpO1xuICAgICAgfVxuICAgICk7XG4gIH1cblxuICB2YWxpZGF0ZVJlcXVlc3QocmVxKSB7XG4gICAgaWYgKCFyZXEuY29uZmlnIHx8ICFyZXEuY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5QVVNIX01JU0NPTkZJR1VSRUQsICdMb2dnZXIgYWRhcHRlciBpcyBub3QgYXZhaWxhYmxlJyk7XG4gICAgfVxuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEge3Jlc3BvbnNlfSBvYmplY3QuXG4gIC8vIHF1ZXJ5IHBhcmFtczpcbiAgLy8gbGV2ZWwgKG9wdGlvbmFsKSBMZXZlbCBvZiBsb2dnaW5nIHlvdSB3YW50IHRvIHF1ZXJ5IGZvciAoaW5mbyB8fCBlcnJvcilcbiAgLy8gZnJvbSAob3B0aW9uYWwpIFN0YXJ0IHRpbWUgZm9yIHRoZSBzZWFyY2guIERlZmF1bHRzIHRvIDEgd2VlayBhZ28uXG4gIC8vIHVudGlsIChvcHRpb25hbCkgRW5kIHRpbWUgZm9yIHRoZSBzZWFyY2guIERlZmF1bHRzIHRvIGN1cnJlbnQgdGltZS5cbiAgLy8gb3JkZXIgKG9wdGlvbmFsKSBEaXJlY3Rpb24gb2YgcmVzdWx0cyByZXR1cm5lZCwgZWl0aGVyIOKAnGFzY+KAnSBvciDigJxkZXNj4oCdLiBEZWZhdWx0cyB0byDigJxkZXNj4oCdLlxuICAvLyBzaXplIChvcHRpb25hbCkgTnVtYmVyIG9mIHJvd3MgcmV0dXJuZWQgYnkgc2VhcmNoLiBEZWZhdWx0cyB0byAxMFxuICAvLyBuIHNhbWUgYXMgc2l6ZSwgb3ZlcnJpZGVzIHNpemUgaWYgc2V0XG4gIGhhbmRsZUdFVChyZXEpIHtcbiAgICBjb25zdCBmcm9tID0gcmVxLnF1ZXJ5LmZyb207XG4gICAgY29uc3QgdW50aWwgPSByZXEucXVlcnkudW50aWw7XG4gICAgbGV0IHNpemUgPSByZXEucXVlcnkuc2l6ZTtcbiAgICBpZiAocmVxLnF1ZXJ5Lm4pIHtcbiAgICAgIHNpemUgPSByZXEucXVlcnkubjtcbiAgICB9XG5cbiAgICBjb25zdCBvcmRlciA9IHJlcS5xdWVyeS5vcmRlcjtcbiAgICBjb25zdCBsZXZlbCA9IHJlcS5xdWVyeS5sZXZlbDtcbiAgICBjb25zdCBvcHRpb25zID0ge1xuICAgICAgZnJvbSxcbiAgICAgIHVudGlsLFxuICAgICAgc2l6ZSxcbiAgICAgIG9yZGVyLFxuICAgICAgbGV2ZWwsXG4gICAgfTtcblxuICAgIHJldHVybiByZXEuY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIuZ2V0TG9ncyhvcHRpb25zKS50aGVuKHJlc3VsdCA9PiB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgcmVzcG9uc2U6IHJlc3VsdCxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IExvZ3NSb3V0ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLElBQUFBLEtBQUEsR0FBQUMsT0FBQTtBQUNBLElBQUFDLGNBQUEsR0FBQUMsc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFHLFVBQUEsR0FBQUMsdUJBQUEsQ0FBQUosT0FBQTtBQUE2QyxTQUFBSyx5QkFBQUMsV0FBQSxlQUFBQyxPQUFBLGtDQUFBQyxpQkFBQSxPQUFBRCxPQUFBLFFBQUFFLGdCQUFBLE9BQUFGLE9BQUEsWUFBQUYsd0JBQUEsWUFBQUEsQ0FBQUMsV0FBQSxXQUFBQSxX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