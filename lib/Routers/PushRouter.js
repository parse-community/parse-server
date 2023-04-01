"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.PushRouter = void 0;
var _PromiseRouter = _interopRequireDefault(require("../PromiseRouter"));
var middleware = _interopRequireWildcard(require("../middlewares"));
var _node = require("parse/node");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQdXNoUm91dGVyIiwiUHJvbWlzZVJvdXRlciIsIm1vdW50Um91dGVzIiwicm91dGUiLCJtaWRkbGV3YXJlIiwicHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MiLCJoYW5kbGVQT1NUIiwicmVxIiwiYXV0aCIsImlzUmVhZE9ubHkiLCJQYXJzZSIsIkVycm9yIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsInB1c2hDb250cm9sbGVyIiwiY29uZmlnIiwiUFVTSF9NSVNDT05GSUdVUkVEIiwid2hlcmUiLCJnZXRRdWVyeUNvbmRpdGlvbiIsInJlc29sdmUiLCJwcm9taXNlIiwiUHJvbWlzZSIsIl9yZXNvbHZlIiwicHVzaFN0YXR1c0lkIiwic2VuZFB1c2giLCJib2R5Iiwib2JqZWN0SWQiLCJoZWFkZXJzIiwicmVzcG9uc2UiLCJyZXN1bHQiLCJjYXRjaCIsImVyciIsImxvZ2dlckNvbnRyb2xsZXIiLCJlcnJvciIsImhhc1doZXJlIiwiaGFzQ2hhbm5lbHMiLCJjaGFubmVscyIsIiRpbiJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1B1c2hSb3V0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFByb21pc2VSb3V0ZXIgZnJvbSAnLi4vUHJvbWlzZVJvdXRlcic7XG5pbXBvcnQgKiBhcyBtaWRkbGV3YXJlIGZyb20gJy4uL21pZGRsZXdhcmVzJztcbmltcG9ydCB7IFBhcnNlIH0gZnJvbSAncGFyc2Uvbm9kZSc7XG5cbmV4cG9ydCBjbGFzcyBQdXNoUm91dGVyIGV4dGVuZHMgUHJvbWlzZVJvdXRlciB7XG4gIG1vdW50Um91dGVzKCkge1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3B1c2gnLCBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLCBQdXNoUm91dGVyLmhhbmRsZVBPU1QpO1xuICB9XG5cbiAgc3RhdGljIGhhbmRsZVBPU1QocmVxKSB7XG4gICAgaWYgKHJlcS5hdXRoLmlzUmVhZE9ubHkpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgXCJyZWFkLW9ubHkgbWFzdGVyS2V5IGlzbid0IGFsbG93ZWQgdG8gc2VuZCBwdXNoIG5vdGlmaWNhdGlvbnMuXCJcbiAgICAgICk7XG4gICAgfVxuICAgIGNvbnN0IHB1c2hDb250cm9sbGVyID0gcmVxLmNvbmZpZy5wdXNoQ29udHJvbGxlcjtcbiAgICBpZiAoIXB1c2hDb250cm9sbGVyKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuUFVTSF9NSVNDT05GSUdVUkVELCAnUHVzaCBjb250cm9sbGVyIGlzIG5vdCBzZXQnKTtcbiAgICB9XG5cbiAgICBjb25zdCB3aGVyZSA9IFB1c2hSb3V0ZXIuZ2V0UXVlcnlDb25kaXRpb24ocmVxKTtcbiAgICBsZXQgcmVzb2x2ZTtcbiAgICBjb25zdCBwcm9taXNlID0gbmV3IFByb21pc2UoX3Jlc29sdmUgPT4ge1xuICAgICAgcmVzb2x2ZSA9IF9yZXNvbHZlO1xuICAgIH0pO1xuICAgIGxldCBwdXNoU3RhdHVzSWQ7XG4gICAgcHVzaENvbnRyb2xsZXJcbiAgICAgIC5zZW5kUHVzaChyZXEuYm9keSwgd2hlcmUsIHJlcS5jb25maWcsIHJlcS5hdXRoLCBvYmplY3RJZCA9PiB7XG4gICAgICAgIHB1c2hTdGF0dXNJZCA9IG9iamVjdElkO1xuICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICAnWC1QYXJzZS1QdXNoLVN0YXR1cy1JZCc6IHB1c2hTdGF0dXNJZCxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHJlc3BvbnNlOiB7XG4gICAgICAgICAgICByZXN1bHQ6IHRydWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgIHJlcS5jb25maWcubG9nZ2VyQ29udHJvbGxlci5lcnJvcihcbiAgICAgICAgICBgX1B1c2hTdGF0dXMgJHtwdXNoU3RhdHVzSWR9OiBlcnJvciB3aGlsZSBzZW5kaW5nIHB1c2hgLFxuICAgICAgICAgIGVyclxuICAgICAgICApO1xuICAgICAgfSk7XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cblxuICAvKipcbiAgICogR2V0IHF1ZXJ5IGNvbmRpdGlvbiBmcm9tIHRoZSByZXF1ZXN0IGJvZHkuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXEgQSByZXF1ZXN0IG9iamVjdFxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgcXVlcnkgY29uZGl0aW9uLCB0aGUgd2hlcmUgZmllbGQgaW4gYSBxdWVyeSBhcGkgY2FsbFxuICAgKi9cbiAgc3RhdGljIGdldFF1ZXJ5Q29uZGl0aW9uKHJlcSkge1xuICAgIGNvbnN0IGJvZHkgPSByZXEuYm9keSB8fCB7fTtcbiAgICBjb25zdCBoYXNXaGVyZSA9IHR5cGVvZiBib2R5LndoZXJlICE9PSAndW5kZWZpbmVkJztcbiAgICBjb25zdCBoYXNDaGFubmVscyA9IHR5cGVvZiBib2R5LmNoYW5uZWxzICE9PSAndW5kZWZpbmVkJztcblxuICAgIGxldCB3aGVyZTtcbiAgICBpZiAoaGFzV2hlcmUgJiYgaGFzQ2hhbm5lbHMpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuUFVTSF9NSVNDT05GSUdVUkVELFxuICAgICAgICAnQ2hhbm5lbHMgYW5kIHF1ZXJ5IGNhbiBub3QgYmUgc2V0IGF0IHRoZSBzYW1lIHRpbWUuJ1xuICAgICAgKTtcbiAgICB9IGVsc2UgaWYgKGhhc1doZXJlKSB7XG4gICAgICB3aGVyZSA9IGJvZHkud2hlcmU7XG4gICAgfSBlbHNlIGlmIChoYXNDaGFubmVscykge1xuICAgICAgd2hlcmUgPSB7XG4gICAgICAgIGNoYW5uZWxzOiB7XG4gICAgICAgICAgJGluOiBib2R5LmNoYW5uZWxzLFxuICAgICAgICB9LFxuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5QVVNIX01JU0NPTkZJR1VSRUQsXG4gICAgICAgICdTZW5kaW5nIGEgcHVzaCByZXF1aXJlcyBlaXRoZXIgXCJjaGFubmVsc1wiIG9yIGEgXCJ3aGVyZVwiIHF1ZXJ5LidcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiB3aGVyZTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBQdXNoUm91dGVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFBbUM7QUFBQTtBQUFBO0FBRTVCLE1BQU1BLFVBQVUsU0FBU0Msc0JBQWEsQ0FBQztFQUM1Q0MsV0FBVyxHQUFHO0lBQ1osSUFBSSxDQUFDQyxLQUFLLENBQUMsTUFBTSxFQUFFLE9BQU8sRUFBRUMsVUFBVSxDQUFDQyw2QkFBNkIsRUFBRUwsVUFBVSxDQUFDTSxVQUFVLENBQUM7RUFDOUY7RUFFQSxPQUFPQSxVQUFVLENBQUNDLEdBQUcsRUFBRTtJQUNyQixJQUFJQSxHQUFHLENBQUNDLElBQUksQ0FBQ0MsVUFBVSxFQUFFO01BQ3ZCLE1BQU0sSUFBSUMsV0FBSyxDQUFDQyxLQUFLLENBQ25CRCxXQUFLLENBQUNDLEtBQUssQ0FBQ0MsbUJBQW1CLEVBQy9CLCtEQUErRCxDQUNoRTtJQUNIO0lBQ0EsTUFBTUMsY0FBYyxHQUFHTixHQUFHLENBQUNPLE1BQU0sQ0FBQ0QsY0FBYztJQUNoRCxJQUFJLENBQUNBLGNBQWMsRUFBRTtNQUNuQixNQUFNLElBQUlILFdBQUssQ0FBQ0MsS0FBSyxDQUFDRCxXQUFLLENBQUNDLEtBQUssQ0FBQ0ksa0JBQWtCLEVBQUUsNEJBQTRCLENBQUM7SUFDckY7SUFFQSxNQUFNQyxLQUFLLEdBQUdoQixVQUFVLENBQUNpQixpQkFBaUIsQ0FBQ1YsR0FBRyxDQUFDO0lBQy9DLElBQUlXLE9BQU87SUFDWCxNQUFNQyxPQUFPLEdBQUcsSUFBSUMsT0FBTyxDQUFDQyxRQUFRLElBQUk7TUFDdENILE9BQU8sR0FBR0csUUFBUTtJQUNwQixDQUFDLENBQUM7SUFDRixJQUFJQyxZQUFZO0lBQ2hCVCxjQUFjLENBQ1hVLFFBQVEsQ0FBQ2hCLEdBQUcsQ0FBQ2lCLElBQUksRUFBRVIsS0FBSyxFQUFFVCxHQUFHLENBQUNPLE1BQU0sRUFBRVAsR0FBRyxDQUFDQyxJQUFJLEVBQUVpQixRQUFRLElBQUk7TUFDM0RILFlBQVksR0FBR0csUUFBUTtNQUN2QlAsT0FBTyxDQUFDO1FBQ05RLE9BQU8sRUFBRTtVQUNQLHdCQUF3QixFQUFFSjtRQUM1QixDQUFDO1FBQ0RLLFFBQVEsRUFBRTtVQUNSQyxNQUFNLEVBQUU7UUFDVjtNQUNGLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUNEQyxLQUFLLENBQUNDLEdBQUcsSUFBSTtNQUNadkIsR0FBRyxDQUFDTyxNQUFNLENBQUNpQixnQkFBZ0IsQ0FBQ0MsS0FBSyxDQUM5QixlQUFjVixZQUFhLDRCQUEyQixFQUN2RFEsR0FBRyxDQUNKO0lBQ0gsQ0FBQyxDQUFDO0lBQ0osT0FBT1gsT0FBTztFQUNoQjs7RUFFQTtBQUNGO0FBQ0E7QUFDQTtBQUNBO0VBQ0UsT0FBT0YsaUJBQWlCLENBQUNWLEdBQUcsRUFBRTtJQUM1QixNQUFNaUIsSUFBSSxHQUFHakIsR0FBRyxDQUFDaUIsSUFBSSxJQUFJLENBQUMsQ0FBQztJQUMzQixNQUFNUyxRQUFRLEdBQUcsT0FBT1QsSUFBSSxDQUFDUixLQUFLLEtBQUssV0FBVztJQUNsRCxNQUFNa0IsV0FBVyxHQUFHLE9BQU9WLElBQUksQ0FBQ1csUUFBUSxLQUFLLFdBQVc7SUFFeEQsSUFBSW5CLEtBQUs7SUFDVCxJQUFJaUIsUUFBUSxJQUFJQyxXQUFXLEVBQUU7TUFDM0IsTUFBTSxJQUFJeEIsV0FBSyxDQUFDQyxLQUFLLENBQ25CRCxXQUFLLENBQUNDLEtBQUssQ0FBQ0ksa0JBQWtCLEVBQzlCLHFEQUFxRCxDQUN0RDtJQUNILENBQUMsTUFBTSxJQUFJa0IsUUFBUSxFQUFFO01BQ25CakIsS0FBSyxHQUFHUSxJQUFJLENBQUNSLEtBQUs7SUFDcEIsQ0FBQyxNQUFNLElBQUlrQixXQUFXLEVBQUU7TUFDdEJsQixLQUFLLEdBQUc7UUFDTm1CLFFBQVEsRUFBRTtVQUNSQyxHQUFHLEVBQUVaLElBQUksQ0FBQ1c7UUFDWjtNQUNGLENBQUM7SUFDSCxDQUFDLE1BQU07TUFDTCxNQUFNLElBQUl6QixXQUFLLENBQUNDLEtBQUssQ0FDbkJELFdBQUssQ0FBQ0MsS0FBSyxDQUFDSSxrQkFBa0IsRUFDOUIsK0RBQStELENBQ2hFO0lBQ0g7SUFDQSxPQUFPQyxLQUFLO0VBQ2Q7QUFDRjtBQUFDO0FBQUEsZUFFY2hCLFVBQVU7QUFBQSJ9