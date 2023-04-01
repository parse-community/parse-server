"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.SecurityRouter = void 0;
var _PromiseRouter = _interopRequireDefault(require("../PromiseRouter"));
var middleware = _interopRequireWildcard(require("../middlewares"));
var _CheckRunner = _interopRequireDefault(require("../Security/CheckRunner"));
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
class SecurityRouter extends _PromiseRouter.default {
  mountRoutes() {
    this.route('GET', '/security', middleware.promiseEnforceMasterKeyAccess, this._enforceSecurityCheckEnabled, async req => {
      const report = await new _CheckRunner.default(req.config.security).run();
      return {
        status: 200,
        response: report
      };
    });
  }
  async _enforceSecurityCheckEnabled(req) {
    const config = req.config;
    if (!config.security || !config.security.enableCheck) {
      const error = new Error();
      error.status = 409;
      error.message = 'Enable Parse Server option `security.enableCheck` to run security check.';
      throw error;
    }
  }
}
exports.SecurityRouter = SecurityRouter;
var _default = SecurityRouter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJTZWN1cml0eVJvdXRlciIsIlByb21pc2VSb3V0ZXIiLCJtb3VudFJvdXRlcyIsInJvdXRlIiwibWlkZGxld2FyZSIsInByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzIiwiX2VuZm9yY2VTZWN1cml0eUNoZWNrRW5hYmxlZCIsInJlcSIsInJlcG9ydCIsIkNoZWNrUnVubmVyIiwiY29uZmlnIiwic2VjdXJpdHkiLCJydW4iLCJzdGF0dXMiLCJyZXNwb25zZSIsImVuYWJsZUNoZWNrIiwiZXJyb3IiLCJFcnJvciIsIm1lc3NhZ2UiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvUm91dGVycy9TZWN1cml0eVJvdXRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgUHJvbWlzZVJvdXRlciBmcm9tICcuLi9Qcm9taXNlUm91dGVyJztcbmltcG9ydCAqIGFzIG1pZGRsZXdhcmUgZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuaW1wb3J0IENoZWNrUnVubmVyIGZyb20gJy4uL1NlY3VyaXR5L0NoZWNrUnVubmVyJztcblxuZXhwb3J0IGNsYXNzIFNlY3VyaXR5Um91dGVyIGV4dGVuZHMgUHJvbWlzZVJvdXRlciB7XG4gIG1vdW50Um91dGVzKCkge1xuICAgIHRoaXMucm91dGUoXG4gICAgICAnR0VUJyxcbiAgICAgICcvc2VjdXJpdHknLFxuICAgICAgbWlkZGxld2FyZS5wcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcyxcbiAgICAgIHRoaXMuX2VuZm9yY2VTZWN1cml0eUNoZWNrRW5hYmxlZCxcbiAgICAgIGFzeW5jIHJlcSA9PiB7XG4gICAgICAgIGNvbnN0IHJlcG9ydCA9IGF3YWl0IG5ldyBDaGVja1J1bm5lcihyZXEuY29uZmlnLnNlY3VyaXR5KS5ydW4oKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBzdGF0dXM6IDIwMCxcbiAgICAgICAgICByZXNwb25zZTogcmVwb3J0LFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICk7XG4gIH1cblxuICBhc3luYyBfZW5mb3JjZVNlY3VyaXR5Q2hlY2tFbmFibGVkKHJlcSkge1xuICAgIGNvbnN0IGNvbmZpZyA9IHJlcS5jb25maWc7XG4gICAgaWYgKCFjb25maWcuc2VjdXJpdHkgfHwgIWNvbmZpZy5zZWN1cml0eS5lbmFibGVDaGVjaykge1xuICAgICAgY29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoKTtcbiAgICAgIGVycm9yLnN0YXR1cyA9IDQwOTtcbiAgICAgIGVycm9yLm1lc3NhZ2UgPSAnRW5hYmxlIFBhcnNlIFNlcnZlciBvcHRpb24gYHNlY3VyaXR5LmVuYWJsZUNoZWNrYCB0byBydW4gc2VjdXJpdHkgY2hlY2suJztcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBTZWN1cml0eVJvdXRlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUE7QUFDQTtBQUNBO0FBQWtEO0FBQUE7QUFBQTtBQUUzQyxNQUFNQSxjQUFjLFNBQVNDLHNCQUFhLENBQUM7RUFDaERDLFdBQVcsR0FBRztJQUNaLElBQUksQ0FBQ0MsS0FBSyxDQUNSLEtBQUssRUFDTCxXQUFXLEVBQ1hDLFVBQVUsQ0FBQ0MsNkJBQTZCLEVBQ3hDLElBQUksQ0FBQ0MsNEJBQTRCLEVBQ2pDLE1BQU1DLEdBQUcsSUFBSTtNQUNYLE1BQU1DLE1BQU0sR0FBRyxNQUFNLElBQUlDLG9CQUFXLENBQUNGLEdBQUcsQ0FBQ0csTUFBTSxDQUFDQyxRQUFRLENBQUMsQ0FBQ0MsR0FBRyxFQUFFO01BQy9ELE9BQU87UUFDTEMsTUFBTSxFQUFFLEdBQUc7UUFDWEMsUUFBUSxFQUFFTjtNQUNaLENBQUM7SUFDSCxDQUFDLENBQ0Y7RUFDSDtFQUVBLE1BQU1GLDRCQUE0QixDQUFDQyxHQUFHLEVBQUU7SUFDdEMsTUFBTUcsTUFBTSxHQUFHSCxHQUFHLENBQUNHLE1BQU07SUFDekIsSUFBSSxDQUFDQSxNQUFNLENBQUNDLFFBQVEsSUFBSSxDQUFDRCxNQUFNLENBQUNDLFFBQVEsQ0FBQ0ksV0FBVyxFQUFFO01BQ3BELE1BQU1DLEtBQUssR0FBRyxJQUFJQyxLQUFLLEVBQUU7TUFDekJELEtBQUssQ0FBQ0gsTUFBTSxHQUFHLEdBQUc7TUFDbEJHLEtBQUssQ0FBQ0UsT0FBTyxHQUFHLDBFQUEwRTtNQUMxRixNQUFNRixLQUFLO0lBQ2I7RUFDRjtBQUNGO0FBQUM7QUFBQSxlQUVjaEIsY0FBYztBQUFBIn0=