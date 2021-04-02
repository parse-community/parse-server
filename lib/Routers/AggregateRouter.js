"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.AggregateRouter = void 0;

var _ClassesRouter = _interopRequireDefault(require("./ClassesRouter"));

var _rest = _interopRequireDefault(require("../rest"));

var middleware = _interopRequireWildcard(require("../middlewares"));

var _node = _interopRequireDefault(require("parse/node"));

var _UsersRouter = _interopRequireDefault(require("./UsersRouter"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class AggregateRouter extends _ClassesRouter.default {
  handleFind(req) {
    const body = Object.assign(req.body, _ClassesRouter.default.JSONFromQuery(req.query));
    const options = {};

    if (body.distinct) {
      options.distinct = String(body.distinct);
    }

    if (body.hint) {
      options.hint = body.hint;
      delete body.hint;
    }

    if (body.explain) {
      options.explain = body.explain;
      delete body.explain;
    }

    if (body.readPreference) {
      options.readPreference = body.readPreference;
      delete body.readPreference;
    }

    options.pipeline = AggregateRouter.getPipeline(body);

    if (typeof body.where === 'string') {
      body.where = JSON.parse(body.where);
    }

    return _rest.default.find(req.config, req.auth, this.className(req), body.where, options, req.info.clientSDK, req.info.context).then(response => {
      for (const result of response.results) {
        if (typeof result === 'object') {
          _UsersRouter.default.removeHiddenProperties(result);
        }
      }

      return {
        response
      };
    });
  }
  /* Builds a pipeline from the body. Originally the body could be passed as a single object,
   * and now we support many options
   *
   * Array
   *
   * body: [{
   *   group: { objectId: '$name' },
   * }]
   *
   * Object
   *
   * body: {
   *   group: { objectId: '$name' },
   * }
   *
   *
   * Pipeline Operator with an Array or an Object
   *
   * body: {
   *   pipeline: {
   *     group: { objectId: '$name' },
   *   }
   * }
   *
   */


  static getPipeline(body) {
    let pipeline = body.pipeline || body;

    if (!Array.isArray(pipeline)) {
      pipeline = Object.keys(pipeline).map(key => {
        return {
          [key]: pipeline[key]
        };
      });
    }

    return pipeline.map(stage => {
      const keys = Object.keys(stage);

      if (keys.length != 1) {
        throw new Error(`Pipeline stages should only have one key found ${keys.join(', ')}`);
      }

      return AggregateRouter.transformStage(keys[0], stage);
    });
  }

  static transformStage(stageName, stage) {
    if (stageName === 'group') {
      if (Object.prototype.hasOwnProperty.call(stage[stageName], '_id')) {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Invalid parameter for query: group. Please use objectId instead of _id`);
      }

      if (!Object.prototype.hasOwnProperty.call(stage[stageName], 'objectId')) {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Invalid parameter for query: group. objectId is required`);
      }

      stage[stageName]._id = stage[stageName].objectId;
      delete stage[stageName].objectId;
    }

    return {
      [`$${stageName}`]: stage[stageName]
    };
  }

  mountRoutes() {
    this.route('GET', '/aggregate/:className', middleware.promiseEnforceMasterKeyAccess, req => {
      return this.handleFind(req);
    });
  }

}

exports.AggregateRouter = AggregateRouter;
var _default = AggregateRouter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0FnZ3JlZ2F0ZVJvdXRlci5qcyJdLCJuYW1lcyI6WyJBZ2dyZWdhdGVSb3V0ZXIiLCJDbGFzc2VzUm91dGVyIiwiaGFuZGxlRmluZCIsInJlcSIsImJvZHkiLCJPYmplY3QiLCJhc3NpZ24iLCJKU09ORnJvbVF1ZXJ5IiwicXVlcnkiLCJvcHRpb25zIiwiZGlzdGluY3QiLCJTdHJpbmciLCJoaW50IiwiZXhwbGFpbiIsInJlYWRQcmVmZXJlbmNlIiwicGlwZWxpbmUiLCJnZXRQaXBlbGluZSIsIndoZXJlIiwiSlNPTiIsInBhcnNlIiwicmVzdCIsImZpbmQiLCJjb25maWciLCJhdXRoIiwiY2xhc3NOYW1lIiwiaW5mbyIsImNsaWVudFNESyIsImNvbnRleHQiLCJ0aGVuIiwicmVzcG9uc2UiLCJyZXN1bHQiLCJyZXN1bHRzIiwiVXNlcnNSb3V0ZXIiLCJyZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzIiwiQXJyYXkiLCJpc0FycmF5Iiwia2V5cyIsIm1hcCIsImtleSIsInN0YWdlIiwibGVuZ3RoIiwiRXJyb3IiLCJqb2luIiwidHJhbnNmb3JtU3RhZ2UiLCJzdGFnZU5hbWUiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJQYXJzZSIsIklOVkFMSURfUVVFUlkiLCJfaWQiLCJvYmplY3RJZCIsIm1vdW50Um91dGVzIiwicm91dGUiLCJtaWRkbGV3YXJlIiwicHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFTyxNQUFNQSxlQUFOLFNBQThCQyxzQkFBOUIsQ0FBNEM7QUFDakRDLEVBQUFBLFVBQVUsQ0FBQ0MsR0FBRCxFQUFNO0FBQ2QsVUFBTUMsSUFBSSxHQUFHQyxNQUFNLENBQUNDLE1BQVAsQ0FBY0gsR0FBRyxDQUFDQyxJQUFsQixFQUF3QkgsdUJBQWNNLGFBQWQsQ0FBNEJKLEdBQUcsQ0FBQ0ssS0FBaEMsQ0FBeEIsQ0FBYjtBQUNBLFVBQU1DLE9BQU8sR0FBRyxFQUFoQjs7QUFDQSxRQUFJTCxJQUFJLENBQUNNLFFBQVQsRUFBbUI7QUFDakJELE1BQUFBLE9BQU8sQ0FBQ0MsUUFBUixHQUFtQkMsTUFBTSxDQUFDUCxJQUFJLENBQUNNLFFBQU4sQ0FBekI7QUFDRDs7QUFDRCxRQUFJTixJQUFJLENBQUNRLElBQVQsRUFBZTtBQUNiSCxNQUFBQSxPQUFPLENBQUNHLElBQVIsR0FBZVIsSUFBSSxDQUFDUSxJQUFwQjtBQUNBLGFBQU9SLElBQUksQ0FBQ1EsSUFBWjtBQUNEOztBQUNELFFBQUlSLElBQUksQ0FBQ1MsT0FBVCxFQUFrQjtBQUNoQkosTUFBQUEsT0FBTyxDQUFDSSxPQUFSLEdBQWtCVCxJQUFJLENBQUNTLE9BQXZCO0FBQ0EsYUFBT1QsSUFBSSxDQUFDUyxPQUFaO0FBQ0Q7O0FBQ0QsUUFBSVQsSUFBSSxDQUFDVSxjQUFULEVBQXlCO0FBQ3ZCTCxNQUFBQSxPQUFPLENBQUNLLGNBQVIsR0FBeUJWLElBQUksQ0FBQ1UsY0FBOUI7QUFDQSxhQUFPVixJQUFJLENBQUNVLGNBQVo7QUFDRDs7QUFDREwsSUFBQUEsT0FBTyxDQUFDTSxRQUFSLEdBQW1CZixlQUFlLENBQUNnQixXQUFoQixDQUE0QlosSUFBNUIsQ0FBbkI7O0FBQ0EsUUFBSSxPQUFPQSxJQUFJLENBQUNhLEtBQVosS0FBc0IsUUFBMUIsRUFBb0M7QUFDbENiLE1BQUFBLElBQUksQ0FBQ2EsS0FBTCxHQUFhQyxJQUFJLENBQUNDLEtBQUwsQ0FBV2YsSUFBSSxDQUFDYSxLQUFoQixDQUFiO0FBQ0Q7O0FBQ0QsV0FBT0csY0FDSkMsSUFESSxDQUVIbEIsR0FBRyxDQUFDbUIsTUFGRCxFQUdIbkIsR0FBRyxDQUFDb0IsSUFIRCxFQUlILEtBQUtDLFNBQUwsQ0FBZXJCLEdBQWYsQ0FKRyxFQUtIQyxJQUFJLENBQUNhLEtBTEYsRUFNSFIsT0FORyxFQU9ITixHQUFHLENBQUNzQixJQUFKLENBQVNDLFNBUE4sRUFRSHZCLEdBQUcsQ0FBQ3NCLElBQUosQ0FBU0UsT0FSTixFQVVKQyxJQVZJLENBVUNDLFFBQVEsSUFBSTtBQUNoQixXQUFLLE1BQU1DLE1BQVgsSUFBcUJELFFBQVEsQ0FBQ0UsT0FBOUIsRUFBdUM7QUFDckMsWUFBSSxPQUFPRCxNQUFQLEtBQWtCLFFBQXRCLEVBQWdDO0FBQzlCRSwrQkFBWUMsc0JBQVosQ0FBbUNILE1BQW5DO0FBQ0Q7QUFDRjs7QUFDRCxhQUFPO0FBQUVELFFBQUFBO0FBQUYsT0FBUDtBQUNELEtBakJJLENBQVA7QUFrQkQ7QUFFRDtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBQ0UsU0FBT2IsV0FBUCxDQUFtQlosSUFBbkIsRUFBeUI7QUFDdkIsUUFBSVcsUUFBUSxHQUFHWCxJQUFJLENBQUNXLFFBQUwsSUFBaUJYLElBQWhDOztBQUNBLFFBQUksQ0FBQzhCLEtBQUssQ0FBQ0MsT0FBTixDQUFjcEIsUUFBZCxDQUFMLEVBQThCO0FBQzVCQSxNQUFBQSxRQUFRLEdBQUdWLE1BQU0sQ0FBQytCLElBQVAsQ0FBWXJCLFFBQVosRUFBc0JzQixHQUF0QixDQUEwQkMsR0FBRyxJQUFJO0FBQzFDLGVBQU87QUFBRSxXQUFDQSxHQUFELEdBQU92QixRQUFRLENBQUN1QixHQUFEO0FBQWpCLFNBQVA7QUFDRCxPQUZVLENBQVg7QUFHRDs7QUFFRCxXQUFPdkIsUUFBUSxDQUFDc0IsR0FBVCxDQUFhRSxLQUFLLElBQUk7QUFDM0IsWUFBTUgsSUFBSSxHQUFHL0IsTUFBTSxDQUFDK0IsSUFBUCxDQUFZRyxLQUFaLENBQWI7O0FBQ0EsVUFBSUgsSUFBSSxDQUFDSSxNQUFMLElBQWUsQ0FBbkIsRUFBc0I7QUFDcEIsY0FBTSxJQUFJQyxLQUFKLENBQVcsa0RBQWlETCxJQUFJLENBQUNNLElBQUwsQ0FBVSxJQUFWLENBQWdCLEVBQTVFLENBQU47QUFDRDs7QUFDRCxhQUFPMUMsZUFBZSxDQUFDMkMsY0FBaEIsQ0FBK0JQLElBQUksQ0FBQyxDQUFELENBQW5DLEVBQXdDRyxLQUF4QyxDQUFQO0FBQ0QsS0FOTSxDQUFQO0FBT0Q7O0FBRUQsU0FBT0ksY0FBUCxDQUFzQkMsU0FBdEIsRUFBaUNMLEtBQWpDLEVBQXdDO0FBQ3RDLFFBQUlLLFNBQVMsS0FBSyxPQUFsQixFQUEyQjtBQUN6QixVQUFJdkMsTUFBTSxDQUFDd0MsU0FBUCxDQUFpQkMsY0FBakIsQ0FBZ0NDLElBQWhDLENBQXFDUixLQUFLLENBQUNLLFNBQUQsQ0FBMUMsRUFBdUQsS0FBdkQsQ0FBSixFQUFtRTtBQUNqRSxjQUFNLElBQUlJLGNBQU1QLEtBQVYsQ0FDSk8sY0FBTVAsS0FBTixDQUFZUSxhQURSLEVBRUgsd0VBRkcsQ0FBTjtBQUlEOztBQUNELFVBQUksQ0FBQzVDLE1BQU0sQ0FBQ3dDLFNBQVAsQ0FBaUJDLGNBQWpCLENBQWdDQyxJQUFoQyxDQUFxQ1IsS0FBSyxDQUFDSyxTQUFELENBQTFDLEVBQXVELFVBQXZELENBQUwsRUFBeUU7QUFDdkUsY0FBTSxJQUFJSSxjQUFNUCxLQUFWLENBQ0pPLGNBQU1QLEtBQU4sQ0FBWVEsYUFEUixFQUVILDBEQUZHLENBQU47QUFJRDs7QUFDRFYsTUFBQUEsS0FBSyxDQUFDSyxTQUFELENBQUwsQ0FBaUJNLEdBQWpCLEdBQXVCWCxLQUFLLENBQUNLLFNBQUQsQ0FBTCxDQUFpQk8sUUFBeEM7QUFDQSxhQUFPWixLQUFLLENBQUNLLFNBQUQsQ0FBTCxDQUFpQk8sUUFBeEI7QUFDRDs7QUFDRCxXQUFPO0FBQUUsT0FBRSxJQUFHUCxTQUFVLEVBQWYsR0FBbUJMLEtBQUssQ0FBQ0ssU0FBRDtBQUExQixLQUFQO0FBQ0Q7O0FBRURRLEVBQUFBLFdBQVcsR0FBRztBQUNaLFNBQUtDLEtBQUwsQ0FBVyxLQUFYLEVBQWtCLHVCQUFsQixFQUEyQ0MsVUFBVSxDQUFDQyw2QkFBdEQsRUFBcUZwRCxHQUFHLElBQUk7QUFDMUYsYUFBTyxLQUFLRCxVQUFMLENBQWdCQyxHQUFoQixDQUFQO0FBQ0QsS0FGRDtBQUdEOztBQTdHZ0Q7OztlQWdIcENILGUiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgQ2xhc3Nlc1JvdXRlciBmcm9tICcuL0NsYXNzZXNSb3V0ZXInO1xuaW1wb3J0IHJlc3QgZnJvbSAnLi4vcmVzdCc7XG5pbXBvcnQgKiBhcyBtaWRkbGV3YXJlIGZyb20gJy4uL21pZGRsZXdhcmVzJztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBVc2Vyc1JvdXRlciBmcm9tICcuL1VzZXJzUm91dGVyJztcblxuZXhwb3J0IGNsYXNzIEFnZ3JlZ2F0ZVJvdXRlciBleHRlbmRzIENsYXNzZXNSb3V0ZXIge1xuICBoYW5kbGVGaW5kKHJlcSkge1xuICAgIGNvbnN0IGJvZHkgPSBPYmplY3QuYXNzaWduKHJlcS5ib2R5LCBDbGFzc2VzUm91dGVyLkpTT05Gcm9tUXVlcnkocmVxLnF1ZXJ5KSk7XG4gICAgY29uc3Qgb3B0aW9ucyA9IHt9O1xuICAgIGlmIChib2R5LmRpc3RpbmN0KSB7XG4gICAgICBvcHRpb25zLmRpc3RpbmN0ID0gU3RyaW5nKGJvZHkuZGlzdGluY3QpO1xuICAgIH1cbiAgICBpZiAoYm9keS5oaW50KSB7XG4gICAgICBvcHRpb25zLmhpbnQgPSBib2R5LmhpbnQ7XG4gICAgICBkZWxldGUgYm9keS5oaW50O1xuICAgIH1cbiAgICBpZiAoYm9keS5leHBsYWluKSB7XG4gICAgICBvcHRpb25zLmV4cGxhaW4gPSBib2R5LmV4cGxhaW47XG4gICAgICBkZWxldGUgYm9keS5leHBsYWluO1xuICAgIH1cbiAgICBpZiAoYm9keS5yZWFkUHJlZmVyZW5jZSkge1xuICAgICAgb3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IGJvZHkucmVhZFByZWZlcmVuY2U7XG4gICAgICBkZWxldGUgYm9keS5yZWFkUHJlZmVyZW5jZTtcbiAgICB9XG4gICAgb3B0aW9ucy5waXBlbGluZSA9IEFnZ3JlZ2F0ZVJvdXRlci5nZXRQaXBlbGluZShib2R5KTtcbiAgICBpZiAodHlwZW9mIGJvZHkud2hlcmUgPT09ICdzdHJpbmcnKSB7XG4gICAgICBib2R5LndoZXJlID0gSlNPTi5wYXJzZShib2R5LndoZXJlKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3RcbiAgICAgIC5maW5kKFxuICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICByZXEuYXV0aCxcbiAgICAgICAgdGhpcy5jbGFzc05hbWUocmVxKSxcbiAgICAgICAgYm9keS53aGVyZSxcbiAgICAgICAgb3B0aW9ucyxcbiAgICAgICAgcmVxLmluZm8uY2xpZW50U0RLLFxuICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICApXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgIGZvciAoY29uc3QgcmVzdWx0IG9mIHJlc3BvbnNlLnJlc3VsdHMpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIHJlc3VsdCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXMocmVzdWx0KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2UgfTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLyogQnVpbGRzIGEgcGlwZWxpbmUgZnJvbSB0aGUgYm9keS4gT3JpZ2luYWxseSB0aGUgYm9keSBjb3VsZCBiZSBwYXNzZWQgYXMgYSBzaW5nbGUgb2JqZWN0LFxuICAgKiBhbmQgbm93IHdlIHN1cHBvcnQgbWFueSBvcHRpb25zXG4gICAqXG4gICAqIEFycmF5XG4gICAqXG4gICAqIGJvZHk6IFt7XG4gICAqICAgZ3JvdXA6IHsgb2JqZWN0SWQ6ICckbmFtZScgfSxcbiAgICogfV1cbiAgICpcbiAgICogT2JqZWN0XG4gICAqXG4gICAqIGJvZHk6IHtcbiAgICogICBncm91cDogeyBvYmplY3RJZDogJyRuYW1lJyB9LFxuICAgKiB9XG4gICAqXG4gICAqXG4gICAqIFBpcGVsaW5lIE9wZXJhdG9yIHdpdGggYW4gQXJyYXkgb3IgYW4gT2JqZWN0XG4gICAqXG4gICAqIGJvZHk6IHtcbiAgICogICBwaXBlbGluZToge1xuICAgKiAgICAgZ3JvdXA6IHsgb2JqZWN0SWQ6ICckbmFtZScgfSxcbiAgICogICB9XG4gICAqIH1cbiAgICpcbiAgICovXG4gIHN0YXRpYyBnZXRQaXBlbGluZShib2R5KSB7XG4gICAgbGV0IHBpcGVsaW5lID0gYm9keS5waXBlbGluZSB8fCBib2R5O1xuICAgIGlmICghQXJyYXkuaXNBcnJheShwaXBlbGluZSkpIHtcbiAgICAgIHBpcGVsaW5lID0gT2JqZWN0LmtleXMocGlwZWxpbmUpLm1hcChrZXkgPT4ge1xuICAgICAgICByZXR1cm4geyBba2V5XTogcGlwZWxpbmVba2V5XSB9O1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHBpcGVsaW5lLm1hcChzdGFnZSA9PiB7XG4gICAgICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXMoc3RhZ2UpO1xuICAgICAgaWYgKGtleXMubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBQaXBlbGluZSBzdGFnZXMgc2hvdWxkIG9ubHkgaGF2ZSBvbmUga2V5IGZvdW5kICR7a2V5cy5qb2luKCcsICcpfWApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIEFnZ3JlZ2F0ZVJvdXRlci50cmFuc2Zvcm1TdGFnZShrZXlzWzBdLCBzdGFnZSk7XG4gICAgfSk7XG4gIH1cblxuICBzdGF0aWMgdHJhbnNmb3JtU3RhZ2Uoc3RhZ2VOYW1lLCBzdGFnZSkge1xuICAgIGlmIChzdGFnZU5hbWUgPT09ICdncm91cCcpIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoc3RhZ2Vbc3RhZ2VOYW1lXSwgJ19pZCcpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgIGBJbnZhbGlkIHBhcmFtZXRlciBmb3IgcXVlcnk6IGdyb3VwLiBQbGVhc2UgdXNlIG9iamVjdElkIGluc3RlYWQgb2YgX2lkYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoc3RhZ2Vbc3RhZ2VOYW1lXSwgJ29iamVjdElkJykpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgYEludmFsaWQgcGFyYW1ldGVyIGZvciBxdWVyeTogZ3JvdXAuIG9iamVjdElkIGlzIHJlcXVpcmVkYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgc3RhZ2Vbc3RhZ2VOYW1lXS5faWQgPSBzdGFnZVtzdGFnZU5hbWVdLm9iamVjdElkO1xuICAgICAgZGVsZXRlIHN0YWdlW3N0YWdlTmFtZV0ub2JqZWN0SWQ7XG4gICAgfVxuICAgIHJldHVybiB7IFtgJCR7c3RhZ2VOYW1lfWBdOiBzdGFnZVtzdGFnZU5hbWVdIH07XG4gIH1cblxuICBtb3VudFJvdXRlcygpIHtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL2FnZ3JlZ2F0ZS86Y2xhc3NOYW1lJywgbWlkZGxld2FyZS5wcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUZpbmQocmVxKTtcbiAgICB9KTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBBZ2dyZWdhdGVSb3V0ZXI7XG4iXX0=