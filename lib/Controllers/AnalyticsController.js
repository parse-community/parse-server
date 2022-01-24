"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.AnalyticsController = void 0;

var _AdaptableController = _interopRequireDefault(require("./AdaptableController"));

var _AnalyticsAdapter = require("../Adapters/Analytics/AnalyticsAdapter");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class AnalyticsController extends _AdaptableController.default {
  appOpened(req) {
    return Promise.resolve().then(() => {
      return this.adapter.appOpened(req.body, req);
    }).then(response => {
      return {
        response: response || {}
      };
    }).catch(() => {
      return {
        response: {}
      };
    });
  }

  trackEvent(req) {
    return Promise.resolve().then(() => {
      return this.adapter.trackEvent(req.params.eventName, req.body, req);
    }).then(response => {
      return {
        response: response || {}
      };
    }).catch(() => {
      return {
        response: {}
      };
    });
  }

  expectedAdapterType() {
    return _AnalyticsAdapter.AnalyticsAdapter;
  }

}

exports.AnalyticsController = AnalyticsController;
var _default = AnalyticsController;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9BbmFseXRpY3NDb250cm9sbGVyLmpzIl0sIm5hbWVzIjpbIkFuYWx5dGljc0NvbnRyb2xsZXIiLCJBZGFwdGFibGVDb250cm9sbGVyIiwiYXBwT3BlbmVkIiwicmVxIiwiUHJvbWlzZSIsInJlc29sdmUiLCJ0aGVuIiwiYWRhcHRlciIsImJvZHkiLCJyZXNwb25zZSIsImNhdGNoIiwidHJhY2tFdmVudCIsInBhcmFtcyIsImV2ZW50TmFtZSIsImV4cGVjdGVkQWRhcHRlclR5cGUiLCJBbmFseXRpY3NBZGFwdGVyIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7Ozs7QUFFTyxNQUFNQSxtQkFBTixTQUFrQ0MsNEJBQWxDLENBQXNEO0FBQzNEQyxFQUFBQSxTQUFTLENBQUNDLEdBQUQsRUFBTTtBQUNiLFdBQU9DLE9BQU8sQ0FBQ0MsT0FBUixHQUNKQyxJQURJLENBQ0MsTUFBTTtBQUNWLGFBQU8sS0FBS0MsT0FBTCxDQUFhTCxTQUFiLENBQXVCQyxHQUFHLENBQUNLLElBQTNCLEVBQWlDTCxHQUFqQyxDQUFQO0FBQ0QsS0FISSxFQUlKRyxJQUpJLENBSUNHLFFBQVEsSUFBSTtBQUNoQixhQUFPO0FBQUVBLFFBQUFBLFFBQVEsRUFBRUEsUUFBUSxJQUFJO0FBQXhCLE9BQVA7QUFDRCxLQU5JLEVBT0pDLEtBUEksQ0FPRSxNQUFNO0FBQ1gsYUFBTztBQUFFRCxRQUFBQSxRQUFRLEVBQUU7QUFBWixPQUFQO0FBQ0QsS0FUSSxDQUFQO0FBVUQ7O0FBRURFLEVBQUFBLFVBQVUsQ0FBQ1IsR0FBRCxFQUFNO0FBQ2QsV0FBT0MsT0FBTyxDQUFDQyxPQUFSLEdBQ0pDLElBREksQ0FDQyxNQUFNO0FBQ1YsYUFBTyxLQUFLQyxPQUFMLENBQWFJLFVBQWIsQ0FBd0JSLEdBQUcsQ0FBQ1MsTUFBSixDQUFXQyxTQUFuQyxFQUE4Q1YsR0FBRyxDQUFDSyxJQUFsRCxFQUF3REwsR0FBeEQsQ0FBUDtBQUNELEtBSEksRUFJSkcsSUFKSSxDQUlDRyxRQUFRLElBQUk7QUFDaEIsYUFBTztBQUFFQSxRQUFBQSxRQUFRLEVBQUVBLFFBQVEsSUFBSTtBQUF4QixPQUFQO0FBQ0QsS0FOSSxFQU9KQyxLQVBJLENBT0UsTUFBTTtBQUNYLGFBQU87QUFBRUQsUUFBQUEsUUFBUSxFQUFFO0FBQVosT0FBUDtBQUNELEtBVEksQ0FBUDtBQVVEOztBQUVESyxFQUFBQSxtQkFBbUIsR0FBRztBQUNwQixXQUFPQyxrQ0FBUDtBQUNEOztBQTdCMEQ7OztlQWdDOUNmLG1CIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IEFkYXB0YWJsZUNvbnRyb2xsZXIgZnJvbSAnLi9BZGFwdGFibGVDb250cm9sbGVyJztcbmltcG9ydCB7IEFuYWx5dGljc0FkYXB0ZXIgfSBmcm9tICcuLi9BZGFwdGVycy9BbmFseXRpY3MvQW5hbHl0aWNzQWRhcHRlcic7XG5cbmV4cG9ydCBjbGFzcyBBbmFseXRpY3NDb250cm9sbGVyIGV4dGVuZHMgQWRhcHRhYmxlQ29udHJvbGxlciB7XG4gIGFwcE9wZW5lZChyZXEpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5hcHBPcGVuZWQocmVxLmJvZHksIHJlcSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICByZXR1cm4geyByZXNwb25zZTogcmVzcG9uc2UgfHwge30gfTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goKCkgPT4ge1xuICAgICAgICByZXR1cm4geyByZXNwb25zZToge30gfTtcbiAgICAgIH0pO1xuICB9XG5cbiAgdHJhY2tFdmVudChyZXEpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci50cmFja0V2ZW50KHJlcS5wYXJhbXMuZXZlbnROYW1lLCByZXEuYm9keSwgcmVxKTtcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiByZXNwb25zZSB8fCB7fSB9O1xuICAgICAgfSlcbiAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiB7fSB9O1xuICAgICAgfSk7XG4gIH1cblxuICBleHBlY3RlZEFkYXB0ZXJUeXBlKCkge1xuICAgIHJldHVybiBBbmFseXRpY3NBZGFwdGVyO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IEFuYWx5dGljc0NvbnRyb2xsZXI7XG4iXX0=