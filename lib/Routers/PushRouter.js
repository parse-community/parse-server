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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1B1c2hSb3V0ZXIuanMiXSwibmFtZXMiOlsiUHVzaFJvdXRlciIsIlByb21pc2VSb3V0ZXIiLCJtb3VudFJvdXRlcyIsInJvdXRlIiwibWlkZGxld2FyZSIsInByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzIiwiaGFuZGxlUE9TVCIsInJlcSIsImF1dGgiLCJpc1JlYWRPbmx5IiwiUGFyc2UiLCJFcnJvciIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJwdXNoQ29udHJvbGxlciIsImNvbmZpZyIsIlBVU0hfTUlTQ09ORklHVVJFRCIsIndoZXJlIiwiZ2V0UXVlcnlDb25kaXRpb24iLCJyZXNvbHZlIiwicHJvbWlzZSIsIlByb21pc2UiLCJfcmVzb2x2ZSIsInB1c2hTdGF0dXNJZCIsInNlbmRQdXNoIiwiYm9keSIsIm9iamVjdElkIiwiaGVhZGVycyIsInJlc3BvbnNlIiwicmVzdWx0IiwiY2F0Y2giLCJlcnIiLCJsb2dnZXJDb250cm9sbGVyIiwiZXJyb3IiLCJoYXNXaGVyZSIsImhhc0NoYW5uZWxzIiwiY2hhbm5lbHMiLCIkaW4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFTyxNQUFNQSxVQUFOLFNBQXlCQyxzQkFBekIsQ0FBdUM7QUFDNUNDLEVBQUFBLFdBQVcsR0FBRztBQUNaLFNBQUtDLEtBQUwsQ0FDRSxNQURGLEVBRUUsT0FGRixFQUdFQyxVQUFVLENBQUNDLDZCQUhiLEVBSUVMLFVBQVUsQ0FBQ00sVUFKYjtBQU1EOztBQUVELFNBQU9BLFVBQVAsQ0FBa0JDLEdBQWxCLEVBQXVCO0FBQ3JCLFFBQUlBLEdBQUcsQ0FBQ0MsSUFBSixDQUFTQyxVQUFiLEVBQXlCO0FBQ3ZCLFlBQU0sSUFBSUMsWUFBTUMsS0FBVixDQUNKRCxZQUFNQyxLQUFOLENBQVlDLG1CQURSLEVBRUosK0RBRkksQ0FBTjtBQUlEOztBQUNELFVBQU1DLGNBQWMsR0FBR04sR0FBRyxDQUFDTyxNQUFKLENBQVdELGNBQWxDOztBQUNBLFFBQUksQ0FBQ0EsY0FBTCxFQUFxQjtBQUNuQixZQUFNLElBQUlILFlBQU1DLEtBQVYsQ0FDSkQsWUFBTUMsS0FBTixDQUFZSSxrQkFEUixFQUVKLDRCQUZJLENBQU47QUFJRDs7QUFFRCxVQUFNQyxLQUFLLEdBQUdoQixVQUFVLENBQUNpQixpQkFBWCxDQUE2QlYsR0FBN0IsQ0FBZDtBQUNBLFFBQUlXLE9BQUo7QUFDQSxVQUFNQyxPQUFPLEdBQUcsSUFBSUMsT0FBSixDQUFZQyxRQUFRLElBQUk7QUFDdENILE1BQUFBLE9BQU8sR0FBR0csUUFBVjtBQUNELEtBRmUsQ0FBaEI7QUFHQSxRQUFJQyxZQUFKO0FBQ0FULElBQUFBLGNBQWMsQ0FDWFUsUUFESCxDQUNZaEIsR0FBRyxDQUFDaUIsSUFEaEIsRUFDc0JSLEtBRHRCLEVBQzZCVCxHQUFHLENBQUNPLE1BRGpDLEVBQ3lDUCxHQUFHLENBQUNDLElBRDdDLEVBQ21EaUIsUUFBUSxJQUFJO0FBQzNESCxNQUFBQSxZQUFZLEdBQUdHLFFBQWY7QUFDQVAsTUFBQUEsT0FBTyxDQUFDO0FBQ05RLFFBQUFBLE9BQU8sRUFBRTtBQUNQLG9DQUEwQko7QUFEbkIsU0FESDtBQUlOSyxRQUFBQSxRQUFRLEVBQUU7QUFDUkMsVUFBQUEsTUFBTSxFQUFFO0FBREE7QUFKSixPQUFELENBQVA7QUFRRCxLQVhILEVBWUdDLEtBWkgsQ0FZU0MsR0FBRyxJQUFJO0FBQ1p2QixNQUFBQSxHQUFHLENBQUNPLE1BQUosQ0FBV2lCLGdCQUFYLENBQTRCQyxLQUE1QixDQUNHLGVBQWNWLFlBQWEsNEJBRDlCLEVBRUVRLEdBRkY7QUFJRCxLQWpCSDtBQWtCQSxXQUFPWCxPQUFQO0FBQ0Q7QUFFRDs7Ozs7OztBQUtBLFNBQU9GLGlCQUFQLENBQXlCVixHQUF6QixFQUE4QjtBQUM1QixVQUFNaUIsSUFBSSxHQUFHakIsR0FBRyxDQUFDaUIsSUFBSixJQUFZLEVBQXpCO0FBQ0EsVUFBTVMsUUFBUSxHQUFHLE9BQU9ULElBQUksQ0FBQ1IsS0FBWixLQUFzQixXQUF2QztBQUNBLFVBQU1rQixXQUFXLEdBQUcsT0FBT1YsSUFBSSxDQUFDVyxRQUFaLEtBQXlCLFdBQTdDO0FBRUEsUUFBSW5CLEtBQUo7O0FBQ0EsUUFBSWlCLFFBQVEsSUFBSUMsV0FBaEIsRUFBNkI7QUFDM0IsWUFBTSxJQUFJeEIsWUFBTUMsS0FBVixDQUNKRCxZQUFNQyxLQUFOLENBQVlJLGtCQURSLEVBRUoscURBRkksQ0FBTjtBQUlELEtBTEQsTUFLTyxJQUFJa0IsUUFBSixFQUFjO0FBQ25CakIsTUFBQUEsS0FBSyxHQUFHUSxJQUFJLENBQUNSLEtBQWI7QUFDRCxLQUZNLE1BRUEsSUFBSWtCLFdBQUosRUFBaUI7QUFDdEJsQixNQUFBQSxLQUFLLEdBQUc7QUFDTm1CLFFBQUFBLFFBQVEsRUFBRTtBQUNSQyxVQUFBQSxHQUFHLEVBQUVaLElBQUksQ0FBQ1c7QUFERjtBQURKLE9BQVI7QUFLRCxLQU5NLE1BTUE7QUFDTCxZQUFNLElBQUl6QixZQUFNQyxLQUFWLENBQ0pELFlBQU1DLEtBQU4sQ0FBWUksa0JBRFIsRUFFSiwrREFGSSxDQUFOO0FBSUQ7O0FBQ0QsV0FBT0MsS0FBUDtBQUNEOztBQW5GMkM7OztlQXNGL0JoQixVIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFByb21pc2VSb3V0ZXIgZnJvbSAnLi4vUHJvbWlzZVJvdXRlcic7XG5pbXBvcnQgKiBhcyBtaWRkbGV3YXJlIGZyb20gJy4uL21pZGRsZXdhcmVzJztcbmltcG9ydCB7IFBhcnNlIH0gZnJvbSAncGFyc2Uvbm9kZSc7XG5cbmV4cG9ydCBjbGFzcyBQdXNoUm91dGVyIGV4dGVuZHMgUHJvbWlzZVJvdXRlciB7XG4gIG1vdW50Um91dGVzKCkge1xuICAgIHRoaXMucm91dGUoXG4gICAgICAnUE9TVCcsXG4gICAgICAnL3B1c2gnLFxuICAgICAgbWlkZGxld2FyZS5wcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcyxcbiAgICAgIFB1c2hSb3V0ZXIuaGFuZGxlUE9TVFxuICAgICk7XG4gIH1cblxuICBzdGF0aWMgaGFuZGxlUE9TVChyZXEpIHtcbiAgICBpZiAocmVxLmF1dGguaXNSZWFkT25seSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICBcInJlYWQtb25seSBtYXN0ZXJLZXkgaXNuJ3QgYWxsb3dlZCB0byBzZW5kIHB1c2ggbm90aWZpY2F0aW9ucy5cIlxuICAgICAgKTtcbiAgICB9XG4gICAgY29uc3QgcHVzaENvbnRyb2xsZXIgPSByZXEuY29uZmlnLnB1c2hDb250cm9sbGVyO1xuICAgIGlmICghcHVzaENvbnRyb2xsZXIpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuUFVTSF9NSVNDT05GSUdVUkVELFxuICAgICAgICAnUHVzaCBjb250cm9sbGVyIGlzIG5vdCBzZXQnXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHdoZXJlID0gUHVzaFJvdXRlci5nZXRRdWVyeUNvbmRpdGlvbihyZXEpO1xuICAgIGxldCByZXNvbHZlO1xuICAgIGNvbnN0IHByb21pc2UgPSBuZXcgUHJvbWlzZShfcmVzb2x2ZSA9PiB7XG4gICAgICByZXNvbHZlID0gX3Jlc29sdmU7XG4gICAgfSk7XG4gICAgbGV0IHB1c2hTdGF0dXNJZDtcbiAgICBwdXNoQ29udHJvbGxlclxuICAgICAgLnNlbmRQdXNoKHJlcS5ib2R5LCB3aGVyZSwgcmVxLmNvbmZpZywgcmVxLmF1dGgsIG9iamVjdElkID0+IHtcbiAgICAgICAgcHVzaFN0YXR1c0lkID0gb2JqZWN0SWQ7XG4gICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICdYLVBhcnNlLVB1c2gtU3RhdHVzLUlkJzogcHVzaFN0YXR1c0lkLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgcmVzcG9uc2U6IHtcbiAgICAgICAgICAgIHJlc3VsdDogdHJ1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgcmVxLmNvbmZpZy5sb2dnZXJDb250cm9sbGVyLmVycm9yKFxuICAgICAgICAgIGBfUHVzaFN0YXR1cyAke3B1c2hTdGF0dXNJZH06IGVycm9yIHdoaWxlIHNlbmRpbmcgcHVzaGAsXG4gICAgICAgICAgZXJyXG4gICAgICAgICk7XG4gICAgICB9KTtcbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgcXVlcnkgY29uZGl0aW9uIGZyb20gdGhlIHJlcXVlc3QgYm9keS5cbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcSBBIHJlcXVlc3Qgb2JqZWN0XG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBxdWVyeSBjb25kaXRpb24sIHRoZSB3aGVyZSBmaWVsZCBpbiBhIHF1ZXJ5IGFwaSBjYWxsXG4gICAqL1xuICBzdGF0aWMgZ2V0UXVlcnlDb25kaXRpb24ocmVxKSB7XG4gICAgY29uc3QgYm9keSA9IHJlcS5ib2R5IHx8IHt9O1xuICAgIGNvbnN0IGhhc1doZXJlID0gdHlwZW9mIGJvZHkud2hlcmUgIT09ICd1bmRlZmluZWQnO1xuICAgIGNvbnN0IGhhc0NoYW5uZWxzID0gdHlwZW9mIGJvZHkuY2hhbm5lbHMgIT09ICd1bmRlZmluZWQnO1xuXG4gICAgbGV0IHdoZXJlO1xuICAgIGlmIChoYXNXaGVyZSAmJiBoYXNDaGFubmVscykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5QVVNIX01JU0NPTkZJR1VSRUQsXG4gICAgICAgICdDaGFubmVscyBhbmQgcXVlcnkgY2FuIG5vdCBiZSBzZXQgYXQgdGhlIHNhbWUgdGltZS4nXG4gICAgICApO1xuICAgIH0gZWxzZSBpZiAoaGFzV2hlcmUpIHtcbiAgICAgIHdoZXJlID0gYm9keS53aGVyZTtcbiAgICB9IGVsc2UgaWYgKGhhc0NoYW5uZWxzKSB7XG4gICAgICB3aGVyZSA9IHtcbiAgICAgICAgY2hhbm5lbHM6IHtcbiAgICAgICAgICAkaW46IGJvZHkuY2hhbm5lbHMsXG4gICAgICAgIH0sXG4gICAgICB9O1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLlBVU0hfTUlTQ09ORklHVVJFRCxcbiAgICAgICAgJ1NlbmRpbmcgYSBwdXNoIHJlcXVpcmVzIGVpdGhlciBcImNoYW5uZWxzXCIgb3IgYSBcIndoZXJlXCIgcXVlcnkuJ1xuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIHdoZXJlO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFB1c2hSb3V0ZXI7XG4iXX0=