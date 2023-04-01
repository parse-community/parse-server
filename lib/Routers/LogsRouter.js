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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJMb2dzUm91dGVyIiwiUHJvbWlzZVJvdXRlciIsIm1vdW50Um91dGVzIiwicm91dGUiLCJtaWRkbGV3YXJlIiwicHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MiLCJ2YWxpZGF0ZVJlcXVlc3QiLCJyZXEiLCJoYW5kbGVHRVQiLCJjb25maWciLCJsb2dnZXJDb250cm9sbGVyIiwiUGFyc2UiLCJFcnJvciIsIlBVU0hfTUlTQ09ORklHVVJFRCIsImZyb20iLCJxdWVyeSIsInVudGlsIiwic2l6ZSIsIm4iLCJvcmRlciIsImxldmVsIiwib3B0aW9ucyIsImdldExvZ3MiLCJ0aGVuIiwicmVzdWx0IiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZXNwb25zZSJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0xvZ3NSb3V0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgUGFyc2UgfSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBQcm9taXNlUm91dGVyIGZyb20gJy4uL1Byb21pc2VSb3V0ZXInO1xuaW1wb3J0ICogYXMgbWlkZGxld2FyZSBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5cbmV4cG9ydCBjbGFzcyBMb2dzUm91dGVyIGV4dGVuZHMgUHJvbWlzZVJvdXRlciB7XG4gIG1vdW50Um91dGVzKCkge1xuICAgIHRoaXMucm91dGUoXG4gICAgICAnR0VUJyxcbiAgICAgICcvc2NyaXB0bG9nJyxcbiAgICAgIG1pZGRsZXdhcmUucHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsXG4gICAgICB0aGlzLnZhbGlkYXRlUmVxdWVzdCxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmhhbmRsZUdFVChyZXEpO1xuICAgICAgfVxuICAgICk7XG4gIH1cblxuICB2YWxpZGF0ZVJlcXVlc3QocmVxKSB7XG4gICAgaWYgKCFyZXEuY29uZmlnIHx8ICFyZXEuY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5QVVNIX01JU0NPTkZJR1VSRUQsICdMb2dnZXIgYWRhcHRlciBpcyBub3QgYXZhaWxhYmxlJyk7XG4gICAgfVxuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEge3Jlc3BvbnNlfSBvYmplY3QuXG4gIC8vIHF1ZXJ5IHBhcmFtczpcbiAgLy8gbGV2ZWwgKG9wdGlvbmFsKSBMZXZlbCBvZiBsb2dnaW5nIHlvdSB3YW50IHRvIHF1ZXJ5IGZvciAoaW5mbyB8fCBlcnJvcilcbiAgLy8gZnJvbSAob3B0aW9uYWwpIFN0YXJ0IHRpbWUgZm9yIHRoZSBzZWFyY2guIERlZmF1bHRzIHRvIDEgd2VlayBhZ28uXG4gIC8vIHVudGlsIChvcHRpb25hbCkgRW5kIHRpbWUgZm9yIHRoZSBzZWFyY2guIERlZmF1bHRzIHRvIGN1cnJlbnQgdGltZS5cbiAgLy8gb3JkZXIgKG9wdGlvbmFsKSBEaXJlY3Rpb24gb2YgcmVzdWx0cyByZXR1cm5lZCwgZWl0aGVyIOKAnGFzY+KAnSBvciDigJxkZXNj4oCdLiBEZWZhdWx0cyB0byDigJxkZXNj4oCdLlxuICAvLyBzaXplIChvcHRpb25hbCkgTnVtYmVyIG9mIHJvd3MgcmV0dXJuZWQgYnkgc2VhcmNoLiBEZWZhdWx0cyB0byAxMFxuICAvLyBuIHNhbWUgYXMgc2l6ZSwgb3ZlcnJpZGVzIHNpemUgaWYgc2V0XG4gIGhhbmRsZUdFVChyZXEpIHtcbiAgICBjb25zdCBmcm9tID0gcmVxLnF1ZXJ5LmZyb207XG4gICAgY29uc3QgdW50aWwgPSByZXEucXVlcnkudW50aWw7XG4gICAgbGV0IHNpemUgPSByZXEucXVlcnkuc2l6ZTtcbiAgICBpZiAocmVxLnF1ZXJ5Lm4pIHtcbiAgICAgIHNpemUgPSByZXEucXVlcnkubjtcbiAgICB9XG5cbiAgICBjb25zdCBvcmRlciA9IHJlcS5xdWVyeS5vcmRlcjtcbiAgICBjb25zdCBsZXZlbCA9IHJlcS5xdWVyeS5sZXZlbDtcbiAgICBjb25zdCBvcHRpb25zID0ge1xuICAgICAgZnJvbSxcbiAgICAgIHVudGlsLFxuICAgICAgc2l6ZSxcbiAgICAgIG9yZGVyLFxuICAgICAgbGV2ZWwsXG4gICAgfTtcblxuICAgIHJldHVybiByZXEuY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIuZ2V0TG9ncyhvcHRpb25zKS50aGVuKHJlc3VsdCA9PiB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgcmVzcG9uc2U6IHJlc3VsdCxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IExvZ3NSb3V0ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBO0FBQ0E7QUFDQTtBQUE2QztBQUFBO0FBQUE7QUFFdEMsTUFBTUEsVUFBVSxTQUFTQyxzQkFBYSxDQUFDO0VBQzVDQyxXQUFXLEdBQUc7SUFDWixJQUFJLENBQUNDLEtBQUssQ0FDUixLQUFLLEVBQ0wsWUFBWSxFQUNaQyxVQUFVLENBQUNDLDZCQUE2QixFQUN4QyxJQUFJLENBQUNDLGVBQWUsRUFDcEJDLEdBQUcsSUFBSTtNQUNMLE9BQU8sSUFBSSxDQUFDQyxTQUFTLENBQUNELEdBQUcsQ0FBQztJQUM1QixDQUFDLENBQ0Y7RUFDSDtFQUVBRCxlQUFlLENBQUNDLEdBQUcsRUFBRTtJQUNuQixJQUFJLENBQUNBLEdBQUcsQ0FBQ0UsTUFBTSxJQUFJLENBQUNGLEdBQUcsQ0FBQ0UsTUFBTSxDQUFDQyxnQkFBZ0IsRUFBRTtNQUMvQyxNQUFNLElBQUlDLFdBQUssQ0FBQ0MsS0FBSyxDQUFDRCxXQUFLLENBQUNDLEtBQUssQ0FBQ0Msa0JBQWtCLEVBQUUsaUNBQWlDLENBQUM7SUFDMUY7RUFDRjs7RUFFQTtFQUNBO0VBQ0E7RUFDQTtFQUNBO0VBQ0E7RUFDQTtFQUNBO0VBQ0FMLFNBQVMsQ0FBQ0QsR0FBRyxFQUFFO0lBQ2IsTUFBTU8sSUFBSSxHQUFHUCxHQUFHLENBQUNRLEtBQUssQ0FBQ0QsSUFBSTtJQUMzQixNQUFNRSxLQUFLLEdBQUdULEdBQUcsQ0FBQ1EsS0FBSyxDQUFDQyxLQUFLO0lBQzdCLElBQUlDLElBQUksR0FBR1YsR0FBRyxDQUFDUSxLQUFLLENBQUNFLElBQUk7SUFDekIsSUFBSVYsR0FBRyxDQUFDUSxLQUFLLENBQUNHLENBQUMsRUFBRTtNQUNmRCxJQUFJLEdBQUdWLEdBQUcsQ0FBQ1EsS0FBSyxDQUFDRyxDQUFDO0lBQ3BCO0lBRUEsTUFBTUMsS0FBSyxHQUFHWixHQUFHLENBQUNRLEtBQUssQ0FBQ0ksS0FBSztJQUM3QixNQUFNQyxLQUFLLEdBQUdiLEdBQUcsQ0FBQ1EsS0FBSyxDQUFDSyxLQUFLO0lBQzdCLE1BQU1DLE9BQU8sR0FBRztNQUNkUCxJQUFJO01BQ0pFLEtBQUs7TUFDTEMsSUFBSTtNQUNKRSxLQUFLO01BQ0xDO0lBQ0YsQ0FBQztJQUVELE9BQU9iLEdBQUcsQ0FBQ0UsTUFBTSxDQUFDQyxnQkFBZ0IsQ0FBQ1ksT0FBTyxDQUFDRCxPQUFPLENBQUMsQ0FBQ0UsSUFBSSxDQUFDQyxNQUFNLElBQUk7TUFDakUsT0FBT0MsT0FBTyxDQUFDQyxPQUFPLENBQUM7UUFDckJDLFFBQVEsRUFBRUg7TUFDWixDQUFDLENBQUM7SUFDSixDQUFDLENBQUM7RUFDSjtBQUNGO0FBQUM7QUFBQSxlQUVjeEIsVUFBVTtBQUFBIn0=