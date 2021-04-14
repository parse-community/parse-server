"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.SecurityRouter = void 0;

var _PromiseRouter = _interopRequireDefault(require("../PromiseRouter"));

var middleware = _interopRequireWildcard(require("../middlewares"));

var _CheckRunner = _interopRequireDefault(require("../Security/CheckRunner"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1NlY3VyaXR5Um91dGVyLmpzIl0sIm5hbWVzIjpbIlNlY3VyaXR5Um91dGVyIiwiUHJvbWlzZVJvdXRlciIsIm1vdW50Um91dGVzIiwicm91dGUiLCJtaWRkbGV3YXJlIiwicHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MiLCJfZW5mb3JjZVNlY3VyaXR5Q2hlY2tFbmFibGVkIiwicmVxIiwicmVwb3J0IiwiQ2hlY2tSdW5uZXIiLCJjb25maWciLCJzZWN1cml0eSIsInJ1biIsInN0YXR1cyIsInJlc3BvbnNlIiwiZW5hYmxlQ2hlY2siLCJlcnJvciIsIkVycm9yIiwibWVzc2FnZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOzs7Ozs7OztBQUVPLE1BQU1BLGNBQU4sU0FBNkJDLHNCQUE3QixDQUEyQztBQUNoREMsRUFBQUEsV0FBVyxHQUFHO0FBQ1osU0FBS0MsS0FBTCxDQUNFLEtBREYsRUFFRSxXQUZGLEVBR0VDLFVBQVUsQ0FBQ0MsNkJBSGIsRUFJRSxLQUFLQyw0QkFKUCxFQUtFLE1BQU1DLEdBQU4sSUFBYTtBQUNYLFlBQU1DLE1BQU0sR0FBRyxNQUFNLElBQUlDLG9CQUFKLENBQWdCRixHQUFHLENBQUNHLE1BQUosQ0FBV0MsUUFBM0IsRUFBcUNDLEdBQXJDLEVBQXJCO0FBQ0EsYUFBTztBQUNMQyxRQUFBQSxNQUFNLEVBQUUsR0FESDtBQUVMQyxRQUFBQSxRQUFRLEVBQUVOO0FBRkwsT0FBUDtBQUlELEtBWEg7QUFhRDs7QUFFaUMsUUFBNUJGLDRCQUE0QixDQUFDQyxHQUFELEVBQU07QUFDdEMsVUFBTUcsTUFBTSxHQUFHSCxHQUFHLENBQUNHLE1BQW5COztBQUNBLFFBQUksQ0FBQ0EsTUFBTSxDQUFDQyxRQUFSLElBQW9CLENBQUNELE1BQU0sQ0FBQ0MsUUFBUCxDQUFnQkksV0FBekMsRUFBc0Q7QUFDcEQsWUFBTUMsS0FBSyxHQUFHLElBQUlDLEtBQUosRUFBZDtBQUNBRCxNQUFBQSxLQUFLLENBQUNILE1BQU4sR0FBZSxHQUFmO0FBQ0FHLE1BQUFBLEtBQUssQ0FBQ0UsT0FBTixHQUFnQiwwRUFBaEI7QUFDQSxZQUFNRixLQUFOO0FBQ0Q7QUFDRjs7QUF6QitDOzs7ZUE0Qm5DaEIsYyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQcm9taXNlUm91dGVyIGZyb20gJy4uL1Byb21pc2VSb3V0ZXInO1xuaW1wb3J0ICogYXMgbWlkZGxld2FyZSBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5pbXBvcnQgQ2hlY2tSdW5uZXIgZnJvbSAnLi4vU2VjdXJpdHkvQ2hlY2tSdW5uZXInO1xuXG5leHBvcnQgY2xhc3MgU2VjdXJpdHlSb3V0ZXIgZXh0ZW5kcyBQcm9taXNlUm91dGVyIHtcbiAgbW91bnRSb3V0ZXMoKSB7XG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdHRVQnLFxuICAgICAgJy9zZWN1cml0eScsXG4gICAgICBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLFxuICAgICAgdGhpcy5fZW5mb3JjZVNlY3VyaXR5Q2hlY2tFbmFibGVkLFxuICAgICAgYXN5bmMgcmVxID0+IHtcbiAgICAgICAgY29uc3QgcmVwb3J0ID0gYXdhaXQgbmV3IENoZWNrUnVubmVyKHJlcS5jb25maWcuc2VjdXJpdHkpLnJ1bigpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHN0YXR1czogMjAwLFxuICAgICAgICAgIHJlc3BvbnNlOiByZXBvcnQsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIF9lbmZvcmNlU2VjdXJpdHlDaGVja0VuYWJsZWQocmVxKSB7XG4gICAgY29uc3QgY29uZmlnID0gcmVxLmNvbmZpZztcbiAgICBpZiAoIWNvbmZpZy5zZWN1cml0eSB8fCAhY29uZmlnLnNlY3VyaXR5LmVuYWJsZUNoZWNrKSB7XG4gICAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcigpO1xuICAgICAgZXJyb3Iuc3RhdHVzID0gNDA5O1xuICAgICAgZXJyb3IubWVzc2FnZSA9ICdFbmFibGUgUGFyc2UgU2VydmVyIG9wdGlvbiBgc2VjdXJpdHkuZW5hYmxlQ2hlY2tgIHRvIHJ1biBzZWN1cml0eSBjaGVjay4nO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFNlY3VyaXR5Um91dGVyO1xuIl19