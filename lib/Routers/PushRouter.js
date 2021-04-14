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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1B1c2hSb3V0ZXIuanMiXSwibmFtZXMiOlsiUHVzaFJvdXRlciIsIlByb21pc2VSb3V0ZXIiLCJtb3VudFJvdXRlcyIsInJvdXRlIiwibWlkZGxld2FyZSIsInByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzIiwiaGFuZGxlUE9TVCIsInJlcSIsImF1dGgiLCJpc1JlYWRPbmx5IiwiUGFyc2UiLCJFcnJvciIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJwdXNoQ29udHJvbGxlciIsImNvbmZpZyIsIlBVU0hfTUlTQ09ORklHVVJFRCIsIndoZXJlIiwiZ2V0UXVlcnlDb25kaXRpb24iLCJyZXNvbHZlIiwicHJvbWlzZSIsIlByb21pc2UiLCJfcmVzb2x2ZSIsInB1c2hTdGF0dXNJZCIsInNlbmRQdXNoIiwiYm9keSIsIm9iamVjdElkIiwiaGVhZGVycyIsInJlc3BvbnNlIiwicmVzdWx0IiwiY2F0Y2giLCJlcnIiLCJsb2dnZXJDb250cm9sbGVyIiwiZXJyb3IiLCJoYXNXaGVyZSIsImhhc0NoYW5uZWxzIiwiY2hhbm5lbHMiLCIkaW4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFTyxNQUFNQSxVQUFOLFNBQXlCQyxzQkFBekIsQ0FBdUM7QUFDNUNDLEVBQUFBLFdBQVcsR0FBRztBQUNaLFNBQUtDLEtBQUwsQ0FBVyxNQUFYLEVBQW1CLE9BQW5CLEVBQTRCQyxVQUFVLENBQUNDLDZCQUF2QyxFQUFzRUwsVUFBVSxDQUFDTSxVQUFqRjtBQUNEOztBQUVnQixTQUFWQSxVQUFVLENBQUNDLEdBQUQsRUFBTTtBQUNyQixRQUFJQSxHQUFHLENBQUNDLElBQUosQ0FBU0MsVUFBYixFQUF5QjtBQUN2QixZQUFNLElBQUlDLFlBQU1DLEtBQVYsQ0FDSkQsWUFBTUMsS0FBTixDQUFZQyxtQkFEUixFQUVKLCtEQUZJLENBQU47QUFJRDs7QUFDRCxVQUFNQyxjQUFjLEdBQUdOLEdBQUcsQ0FBQ08sTUFBSixDQUFXRCxjQUFsQzs7QUFDQSxRQUFJLENBQUNBLGNBQUwsRUFBcUI7QUFDbkIsWUFBTSxJQUFJSCxZQUFNQyxLQUFWLENBQWdCRCxZQUFNQyxLQUFOLENBQVlJLGtCQUE1QixFQUFnRCw0QkFBaEQsQ0FBTjtBQUNEOztBQUVELFVBQU1DLEtBQUssR0FBR2hCLFVBQVUsQ0FBQ2lCLGlCQUFYLENBQTZCVixHQUE3QixDQUFkO0FBQ0EsUUFBSVcsT0FBSjtBQUNBLFVBQU1DLE9BQU8sR0FBRyxJQUFJQyxPQUFKLENBQVlDLFFBQVEsSUFBSTtBQUN0Q0gsTUFBQUEsT0FBTyxHQUFHRyxRQUFWO0FBQ0QsS0FGZSxDQUFoQjtBQUdBLFFBQUlDLFlBQUo7QUFDQVQsSUFBQUEsY0FBYyxDQUNYVSxRQURILENBQ1loQixHQUFHLENBQUNpQixJQURoQixFQUNzQlIsS0FEdEIsRUFDNkJULEdBQUcsQ0FBQ08sTUFEakMsRUFDeUNQLEdBQUcsQ0FBQ0MsSUFEN0MsRUFDbURpQixRQUFRLElBQUk7QUFDM0RILE1BQUFBLFlBQVksR0FBR0csUUFBZjtBQUNBUCxNQUFBQSxPQUFPLENBQUM7QUFDTlEsUUFBQUEsT0FBTyxFQUFFO0FBQ1Asb0NBQTBCSjtBQURuQixTQURIO0FBSU5LLFFBQUFBLFFBQVEsRUFBRTtBQUNSQyxVQUFBQSxNQUFNLEVBQUU7QUFEQTtBQUpKLE9BQUQsQ0FBUDtBQVFELEtBWEgsRUFZR0MsS0FaSCxDQVlTQyxHQUFHLElBQUk7QUFDWnZCLE1BQUFBLEdBQUcsQ0FBQ08sTUFBSixDQUFXaUIsZ0JBQVgsQ0FBNEJDLEtBQTVCLENBQ0csZUFBY1YsWUFBYSw0QkFEOUIsRUFFRVEsR0FGRjtBQUlELEtBakJIO0FBa0JBLFdBQU9YLE9BQVA7QUFDRDtBQUVEO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7OztBQUMwQixTQUFqQkYsaUJBQWlCLENBQUNWLEdBQUQsRUFBTTtBQUM1QixVQUFNaUIsSUFBSSxHQUFHakIsR0FBRyxDQUFDaUIsSUFBSixJQUFZLEVBQXpCO0FBQ0EsVUFBTVMsUUFBUSxHQUFHLE9BQU9ULElBQUksQ0FBQ1IsS0FBWixLQUFzQixXQUF2QztBQUNBLFVBQU1rQixXQUFXLEdBQUcsT0FBT1YsSUFBSSxDQUFDVyxRQUFaLEtBQXlCLFdBQTdDO0FBRUEsUUFBSW5CLEtBQUo7O0FBQ0EsUUFBSWlCLFFBQVEsSUFBSUMsV0FBaEIsRUFBNkI7QUFDM0IsWUFBTSxJQUFJeEIsWUFBTUMsS0FBVixDQUNKRCxZQUFNQyxLQUFOLENBQVlJLGtCQURSLEVBRUoscURBRkksQ0FBTjtBQUlELEtBTEQsTUFLTyxJQUFJa0IsUUFBSixFQUFjO0FBQ25CakIsTUFBQUEsS0FBSyxHQUFHUSxJQUFJLENBQUNSLEtBQWI7QUFDRCxLQUZNLE1BRUEsSUFBSWtCLFdBQUosRUFBaUI7QUFDdEJsQixNQUFBQSxLQUFLLEdBQUc7QUFDTm1CLFFBQUFBLFFBQVEsRUFBRTtBQUNSQyxVQUFBQSxHQUFHLEVBQUVaLElBQUksQ0FBQ1c7QUFERjtBQURKLE9BQVI7QUFLRCxLQU5NLE1BTUE7QUFDTCxZQUFNLElBQUl6QixZQUFNQyxLQUFWLENBQ0pELFlBQU1DLEtBQU4sQ0FBWUksa0JBRFIsRUFFSiwrREFGSSxDQUFOO0FBSUQ7O0FBQ0QsV0FBT0MsS0FBUDtBQUNEOztBQTNFMkM7OztlQThFL0JoQixVIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFByb21pc2VSb3V0ZXIgZnJvbSAnLi4vUHJvbWlzZVJvdXRlcic7XG5pbXBvcnQgKiBhcyBtaWRkbGV3YXJlIGZyb20gJy4uL21pZGRsZXdhcmVzJztcbmltcG9ydCB7IFBhcnNlIH0gZnJvbSAncGFyc2Uvbm9kZSc7XG5cbmV4cG9ydCBjbGFzcyBQdXNoUm91dGVyIGV4dGVuZHMgUHJvbWlzZVJvdXRlciB7XG4gIG1vdW50Um91dGVzKCkge1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3B1c2gnLCBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLCBQdXNoUm91dGVyLmhhbmRsZVBPU1QpO1xuICB9XG5cbiAgc3RhdGljIGhhbmRsZVBPU1QocmVxKSB7XG4gICAgaWYgKHJlcS5hdXRoLmlzUmVhZE9ubHkpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgXCJyZWFkLW9ubHkgbWFzdGVyS2V5IGlzbid0IGFsbG93ZWQgdG8gc2VuZCBwdXNoIG5vdGlmaWNhdGlvbnMuXCJcbiAgICAgICk7XG4gICAgfVxuICAgIGNvbnN0IHB1c2hDb250cm9sbGVyID0gcmVxLmNvbmZpZy5wdXNoQ29udHJvbGxlcjtcbiAgICBpZiAoIXB1c2hDb250cm9sbGVyKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuUFVTSF9NSVNDT05GSUdVUkVELCAnUHVzaCBjb250cm9sbGVyIGlzIG5vdCBzZXQnKTtcbiAgICB9XG5cbiAgICBjb25zdCB3aGVyZSA9IFB1c2hSb3V0ZXIuZ2V0UXVlcnlDb25kaXRpb24ocmVxKTtcbiAgICBsZXQgcmVzb2x2ZTtcbiAgICBjb25zdCBwcm9taXNlID0gbmV3IFByb21pc2UoX3Jlc29sdmUgPT4ge1xuICAgICAgcmVzb2x2ZSA9IF9yZXNvbHZlO1xuICAgIH0pO1xuICAgIGxldCBwdXNoU3RhdHVzSWQ7XG4gICAgcHVzaENvbnRyb2xsZXJcbiAgICAgIC5zZW5kUHVzaChyZXEuYm9keSwgd2hlcmUsIHJlcS5jb25maWcsIHJlcS5hdXRoLCBvYmplY3RJZCA9PiB7XG4gICAgICAgIHB1c2hTdGF0dXNJZCA9IG9iamVjdElkO1xuICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICAnWC1QYXJzZS1QdXNoLVN0YXR1cy1JZCc6IHB1c2hTdGF0dXNJZCxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHJlc3BvbnNlOiB7XG4gICAgICAgICAgICByZXN1bHQ6IHRydWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgIHJlcS5jb25maWcubG9nZ2VyQ29udHJvbGxlci5lcnJvcihcbiAgICAgICAgICBgX1B1c2hTdGF0dXMgJHtwdXNoU3RhdHVzSWR9OiBlcnJvciB3aGlsZSBzZW5kaW5nIHB1c2hgLFxuICAgICAgICAgIGVyclxuICAgICAgICApO1xuICAgICAgfSk7XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cblxuICAvKipcbiAgICogR2V0IHF1ZXJ5IGNvbmRpdGlvbiBmcm9tIHRoZSByZXF1ZXN0IGJvZHkuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXEgQSByZXF1ZXN0IG9iamVjdFxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgcXVlcnkgY29uZGl0aW9uLCB0aGUgd2hlcmUgZmllbGQgaW4gYSBxdWVyeSBhcGkgY2FsbFxuICAgKi9cbiAgc3RhdGljIGdldFF1ZXJ5Q29uZGl0aW9uKHJlcSkge1xuICAgIGNvbnN0IGJvZHkgPSByZXEuYm9keSB8fCB7fTtcbiAgICBjb25zdCBoYXNXaGVyZSA9IHR5cGVvZiBib2R5LndoZXJlICE9PSAndW5kZWZpbmVkJztcbiAgICBjb25zdCBoYXNDaGFubmVscyA9IHR5cGVvZiBib2R5LmNoYW5uZWxzICE9PSAndW5kZWZpbmVkJztcblxuICAgIGxldCB3aGVyZTtcbiAgICBpZiAoaGFzV2hlcmUgJiYgaGFzQ2hhbm5lbHMpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuUFVTSF9NSVNDT05GSUdVUkVELFxuICAgICAgICAnQ2hhbm5lbHMgYW5kIHF1ZXJ5IGNhbiBub3QgYmUgc2V0IGF0IHRoZSBzYW1lIHRpbWUuJ1xuICAgICAgKTtcbiAgICB9IGVsc2UgaWYgKGhhc1doZXJlKSB7XG4gICAgICB3aGVyZSA9IGJvZHkud2hlcmU7XG4gICAgfSBlbHNlIGlmIChoYXNDaGFubmVscykge1xuICAgICAgd2hlcmUgPSB7XG4gICAgICAgIGNoYW5uZWxzOiB7XG4gICAgICAgICAgJGluOiBib2R5LmNoYW5uZWxzLFxuICAgICAgICB9LFxuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5QVVNIX01JU0NPTkZJR1VSRUQsXG4gICAgICAgICdTZW5kaW5nIGEgcHVzaCByZXF1aXJlcyBlaXRoZXIgXCJjaGFubmVsc1wiIG9yIGEgXCJ3aGVyZVwiIHF1ZXJ5LidcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiB3aGVyZTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBQdXNoUm91dGVyO1xuIl19