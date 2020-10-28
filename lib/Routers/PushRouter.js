"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.PushRouter = void 0;

var _PromiseRouter = _interopRequireDefault(require("../PromiseRouter"));

var middleware = _interopRequireWildcard(require("../middlewares"));

var _node = require("parse/node");

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class PushRouter extends _PromiseRouter.default {
  mountRoutes() {
    this.route('POST', '/push', middleware.promiseEnforceMasterKeyAccess, PushRouter.handlePOST);
  }

  static handlePOST(req) {
    if (req.auth.isReadOnly) {
      throw new _node.Parse.Error(_node.Parse.Error.OPERATION_FORBIDDEN, "read-only masterKey isn't allowed to send push notifications.");
    }

    const pushController = req.config.pushController;

    if (!pushController) {
      throw new _node.Parse.Error(_node.Parse.Error.PUSH_MISCONFIGURED, 'Push controller is not set');
    }

    const where = PushRouter.getQueryCondition(req);
    let resolve;
    const promise = new Promise(_resolve => {
      resolve = _resolve;
    });
    let pushStatusId;
    pushController.sendPush(req.body, where, req.config, req.auth, objectId => {
      pushStatusId = objectId;
      resolve({
        headers: {
          'X-Parse-Push-Status-Id': pushStatusId
        },
        response: {
          result: true
        }
      });
    }).catch(err => {
      req.config.loggerController.error(`_PushStatus ${pushStatusId}: error while sending push`, err);
    });
    return promise;
  }
  /**
   * Get query condition from the request body.
   * @param {Object} req A request object
   * @returns {Object} The query condition, the where field in a query api call
   */


  static getQueryCondition(req) {
    const body = req.body || {};
    const hasWhere = typeof body.where !== 'undefined';
    const hasChannels = typeof body.channels !== 'undefined';
    let where;

    if (hasWhere && hasChannels) {
      throw new _node.Parse.Error(_node.Parse.Error.PUSH_MISCONFIGURED, 'Channels and query can not be set at the same time.');
    } else if (hasWhere) {
      where = body.where;
    } else if (hasChannels) {
      where = {
        channels: {
          $in: body.channels
        }
      };
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.PUSH_MISCONFIGURED, 'Sending a push requires either "channels" or a "where" query.');
    }

    return where;
  }

}

exports.PushRouter = PushRouter;
var _default = PushRouter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1B1c2hSb3V0ZXIuanMiXSwibmFtZXMiOlsiUHVzaFJvdXRlciIsIlByb21pc2VSb3V0ZXIiLCJtb3VudFJvdXRlcyIsInJvdXRlIiwibWlkZGxld2FyZSIsInByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzIiwiaGFuZGxlUE9TVCIsInJlcSIsImF1dGgiLCJpc1JlYWRPbmx5IiwiUGFyc2UiLCJFcnJvciIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJwdXNoQ29udHJvbGxlciIsImNvbmZpZyIsIlBVU0hfTUlTQ09ORklHVVJFRCIsIndoZXJlIiwiZ2V0UXVlcnlDb25kaXRpb24iLCJyZXNvbHZlIiwicHJvbWlzZSIsIlByb21pc2UiLCJfcmVzb2x2ZSIsInB1c2hTdGF0dXNJZCIsInNlbmRQdXNoIiwiYm9keSIsIm9iamVjdElkIiwiaGVhZGVycyIsInJlc3BvbnNlIiwicmVzdWx0IiwiY2F0Y2giLCJlcnIiLCJsb2dnZXJDb250cm9sbGVyIiwiZXJyb3IiLCJoYXNXaGVyZSIsImhhc0NoYW5uZWxzIiwiY2hhbm5lbHMiLCIkaW4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFTyxNQUFNQSxVQUFOLFNBQXlCQyxzQkFBekIsQ0FBdUM7QUFDNUNDLEVBQUFBLFdBQVcsR0FBRztBQUNaLFNBQUtDLEtBQUwsQ0FBVyxNQUFYLEVBQW1CLE9BQW5CLEVBQTRCQyxVQUFVLENBQUNDLDZCQUF2QyxFQUFzRUwsVUFBVSxDQUFDTSxVQUFqRjtBQUNEOztBQUVELFNBQU9BLFVBQVAsQ0FBa0JDLEdBQWxCLEVBQXVCO0FBQ3JCLFFBQUlBLEdBQUcsQ0FBQ0MsSUFBSixDQUFTQyxVQUFiLEVBQXlCO0FBQ3ZCLFlBQU0sSUFBSUMsWUFBTUMsS0FBVixDQUNKRCxZQUFNQyxLQUFOLENBQVlDLG1CQURSLEVBRUosK0RBRkksQ0FBTjtBQUlEOztBQUNELFVBQU1DLGNBQWMsR0FBR04sR0FBRyxDQUFDTyxNQUFKLENBQVdELGNBQWxDOztBQUNBLFFBQUksQ0FBQ0EsY0FBTCxFQUFxQjtBQUNuQixZQUFNLElBQUlILFlBQU1DLEtBQVYsQ0FBZ0JELFlBQU1DLEtBQU4sQ0FBWUksa0JBQTVCLEVBQWdELDRCQUFoRCxDQUFOO0FBQ0Q7O0FBRUQsVUFBTUMsS0FBSyxHQUFHaEIsVUFBVSxDQUFDaUIsaUJBQVgsQ0FBNkJWLEdBQTdCLENBQWQ7QUFDQSxRQUFJVyxPQUFKO0FBQ0EsVUFBTUMsT0FBTyxHQUFHLElBQUlDLE9BQUosQ0FBWUMsUUFBUSxJQUFJO0FBQ3RDSCxNQUFBQSxPQUFPLEdBQUdHLFFBQVY7QUFDRCxLQUZlLENBQWhCO0FBR0EsUUFBSUMsWUFBSjtBQUNBVCxJQUFBQSxjQUFjLENBQ1hVLFFBREgsQ0FDWWhCLEdBQUcsQ0FBQ2lCLElBRGhCLEVBQ3NCUixLQUR0QixFQUM2QlQsR0FBRyxDQUFDTyxNQURqQyxFQUN5Q1AsR0FBRyxDQUFDQyxJQUQ3QyxFQUNtRGlCLFFBQVEsSUFBSTtBQUMzREgsTUFBQUEsWUFBWSxHQUFHRyxRQUFmO0FBQ0FQLE1BQUFBLE9BQU8sQ0FBQztBQUNOUSxRQUFBQSxPQUFPLEVBQUU7QUFDUCxvQ0FBMEJKO0FBRG5CLFNBREg7QUFJTkssUUFBQUEsUUFBUSxFQUFFO0FBQ1JDLFVBQUFBLE1BQU0sRUFBRTtBQURBO0FBSkosT0FBRCxDQUFQO0FBUUQsS0FYSCxFQVlHQyxLQVpILENBWVNDLEdBQUcsSUFBSTtBQUNadkIsTUFBQUEsR0FBRyxDQUFDTyxNQUFKLENBQVdpQixnQkFBWCxDQUE0QkMsS0FBNUIsQ0FDRyxlQUFjVixZQUFhLDRCQUQ5QixFQUVFUSxHQUZGO0FBSUQsS0FqQkg7QUFrQkEsV0FBT1gsT0FBUDtBQUNEO0FBRUQ7Ozs7Ozs7QUFLQSxTQUFPRixpQkFBUCxDQUF5QlYsR0FBekIsRUFBOEI7QUFDNUIsVUFBTWlCLElBQUksR0FBR2pCLEdBQUcsQ0FBQ2lCLElBQUosSUFBWSxFQUF6QjtBQUNBLFVBQU1TLFFBQVEsR0FBRyxPQUFPVCxJQUFJLENBQUNSLEtBQVosS0FBc0IsV0FBdkM7QUFDQSxVQUFNa0IsV0FBVyxHQUFHLE9BQU9WLElBQUksQ0FBQ1csUUFBWixLQUF5QixXQUE3QztBQUVBLFFBQUluQixLQUFKOztBQUNBLFFBQUlpQixRQUFRLElBQUlDLFdBQWhCLEVBQTZCO0FBQzNCLFlBQU0sSUFBSXhCLFlBQU1DLEtBQVYsQ0FDSkQsWUFBTUMsS0FBTixDQUFZSSxrQkFEUixFQUVKLHFEQUZJLENBQU47QUFJRCxLQUxELE1BS08sSUFBSWtCLFFBQUosRUFBYztBQUNuQmpCLE1BQUFBLEtBQUssR0FBR1EsSUFBSSxDQUFDUixLQUFiO0FBQ0QsS0FGTSxNQUVBLElBQUlrQixXQUFKLEVBQWlCO0FBQ3RCbEIsTUFBQUEsS0FBSyxHQUFHO0FBQ05tQixRQUFBQSxRQUFRLEVBQUU7QUFDUkMsVUFBQUEsR0FBRyxFQUFFWixJQUFJLENBQUNXO0FBREY7QUFESixPQUFSO0FBS0QsS0FOTSxNQU1BO0FBQ0wsWUFBTSxJQUFJekIsWUFBTUMsS0FBVixDQUNKRCxZQUFNQyxLQUFOLENBQVlJLGtCQURSLEVBRUosK0RBRkksQ0FBTjtBQUlEOztBQUNELFdBQU9DLEtBQVA7QUFDRDs7QUEzRTJDOzs7ZUE4RS9CaEIsVSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQcm9taXNlUm91dGVyIGZyb20gJy4uL1Byb21pc2VSb3V0ZXInO1xuaW1wb3J0ICogYXMgbWlkZGxld2FyZSBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5pbXBvcnQgeyBQYXJzZSB9IGZyb20gJ3BhcnNlL25vZGUnO1xuXG5leHBvcnQgY2xhc3MgUHVzaFJvdXRlciBleHRlbmRzIFByb21pc2VSb3V0ZXIge1xuICBtb3VudFJvdXRlcygpIHtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9wdXNoJywgbWlkZGxld2FyZS5wcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcywgUHVzaFJvdXRlci5oYW5kbGVQT1NUKTtcbiAgfVxuXG4gIHN0YXRpYyBoYW5kbGVQT1NUKHJlcSkge1xuICAgIGlmIChyZXEuYXV0aC5pc1JlYWRPbmx5KSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgIFwicmVhZC1vbmx5IG1hc3RlcktleSBpc24ndCBhbGxvd2VkIHRvIHNlbmQgcHVzaCBub3RpZmljYXRpb25zLlwiXG4gICAgICApO1xuICAgIH1cbiAgICBjb25zdCBwdXNoQ29udHJvbGxlciA9IHJlcS5jb25maWcucHVzaENvbnRyb2xsZXI7XG4gICAgaWYgKCFwdXNoQ29udHJvbGxlcikge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlBVU0hfTUlTQ09ORklHVVJFRCwgJ1B1c2ggY29udHJvbGxlciBpcyBub3Qgc2V0Jyk7XG4gICAgfVxuXG4gICAgY29uc3Qgd2hlcmUgPSBQdXNoUm91dGVyLmdldFF1ZXJ5Q29uZGl0aW9uKHJlcSk7XG4gICAgbGV0IHJlc29sdmU7XG4gICAgY29uc3QgcHJvbWlzZSA9IG5ldyBQcm9taXNlKF9yZXNvbHZlID0+IHtcbiAgICAgIHJlc29sdmUgPSBfcmVzb2x2ZTtcbiAgICB9KTtcbiAgICBsZXQgcHVzaFN0YXR1c0lkO1xuICAgIHB1c2hDb250cm9sbGVyXG4gICAgICAuc2VuZFB1c2gocmVxLmJvZHksIHdoZXJlLCByZXEuY29uZmlnLCByZXEuYXV0aCwgb2JqZWN0SWQgPT4ge1xuICAgICAgICBwdXNoU3RhdHVzSWQgPSBvYmplY3RJZDtcbiAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgJ1gtUGFyc2UtUHVzaC1TdGF0dXMtSWQnOiBwdXNoU3RhdHVzSWQsXG4gICAgICAgICAgfSxcbiAgICAgICAgICByZXNwb25zZToge1xuICAgICAgICAgICAgcmVzdWx0OiB0cnVlLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICByZXEuY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIuZXJyb3IoXG4gICAgICAgICAgYF9QdXNoU3RhdHVzICR7cHVzaFN0YXR1c0lkfTogZXJyb3Igd2hpbGUgc2VuZGluZyBwdXNoYCxcbiAgICAgICAgICBlcnJcbiAgICAgICAgKTtcbiAgICAgIH0pO1xuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBxdWVyeSBjb25kaXRpb24gZnJvbSB0aGUgcmVxdWVzdCBib2R5LlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVxIEEgcmVxdWVzdCBvYmplY3RcbiAgICogQHJldHVybnMge09iamVjdH0gVGhlIHF1ZXJ5IGNvbmRpdGlvbiwgdGhlIHdoZXJlIGZpZWxkIGluIGEgcXVlcnkgYXBpIGNhbGxcbiAgICovXG4gIHN0YXRpYyBnZXRRdWVyeUNvbmRpdGlvbihyZXEpIHtcbiAgICBjb25zdCBib2R5ID0gcmVxLmJvZHkgfHwge307XG4gICAgY29uc3QgaGFzV2hlcmUgPSB0eXBlb2YgYm9keS53aGVyZSAhPT0gJ3VuZGVmaW5lZCc7XG4gICAgY29uc3QgaGFzQ2hhbm5lbHMgPSB0eXBlb2YgYm9keS5jaGFubmVscyAhPT0gJ3VuZGVmaW5lZCc7XG5cbiAgICBsZXQgd2hlcmU7XG4gICAgaWYgKGhhc1doZXJlICYmIGhhc0NoYW5uZWxzKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLlBVU0hfTUlTQ09ORklHVVJFRCxcbiAgICAgICAgJ0NoYW5uZWxzIGFuZCBxdWVyeSBjYW4gbm90IGJlIHNldCBhdCB0aGUgc2FtZSB0aW1lLidcbiAgICAgICk7XG4gICAgfSBlbHNlIGlmIChoYXNXaGVyZSkge1xuICAgICAgd2hlcmUgPSBib2R5LndoZXJlO1xuICAgIH0gZWxzZSBpZiAoaGFzQ2hhbm5lbHMpIHtcbiAgICAgIHdoZXJlID0ge1xuICAgICAgICBjaGFubmVsczoge1xuICAgICAgICAgICRpbjogYm9keS5jaGFubmVscyxcbiAgICAgICAgfSxcbiAgICAgIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuUFVTSF9NSVNDT05GSUdVUkVELFxuICAgICAgICAnU2VuZGluZyBhIHB1c2ggcmVxdWlyZXMgZWl0aGVyIFwiY2hhbm5lbHNcIiBvciBhIFwid2hlcmVcIiBxdWVyeS4nXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gd2hlcmU7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgUHVzaFJvdXRlcjtcbiJdfQ==