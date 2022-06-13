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

var _Deprecator = _interopRequireDefault(require("../Deprecator/Deprecator"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

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
      if (Object.prototype.hasOwnProperty.call(stage[stageName], 'objectId')) {
        _Deprecator.default.logRuntimeDeprecation({
          usage: 'The use of objectId in aggregation stage $group',
          solution: 'Use _id instead.'
        });

        stage[stageName]._id = stage[stageName].objectId;
        delete stage[stageName].objectId;
      }

      if (!Object.prototype.hasOwnProperty.call(stage[stageName], '_id')) {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Invalid parameter for query: group. Missing key _id`);
      }
    }

    if (stageName[0] !== '$') {
      _Deprecator.default.logRuntimeDeprecation({
        usage: "Using aggregation stages without a leading '$'",
        solution: `Try $${stageName} instead.`
      });
    }

    const key = stageName[0] === '$' ? stageName : `$${stageName}`;
    return {
      [key]: stage[stageName]
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0FnZ3JlZ2F0ZVJvdXRlci5qcyJdLCJuYW1lcyI6WyJBZ2dyZWdhdGVSb3V0ZXIiLCJDbGFzc2VzUm91dGVyIiwiaGFuZGxlRmluZCIsInJlcSIsImJvZHkiLCJPYmplY3QiLCJhc3NpZ24iLCJKU09ORnJvbVF1ZXJ5IiwicXVlcnkiLCJvcHRpb25zIiwiZGlzdGluY3QiLCJTdHJpbmciLCJoaW50IiwiZXhwbGFpbiIsInJlYWRQcmVmZXJlbmNlIiwicGlwZWxpbmUiLCJnZXRQaXBlbGluZSIsIndoZXJlIiwiSlNPTiIsInBhcnNlIiwicmVzdCIsImZpbmQiLCJjb25maWciLCJhdXRoIiwiY2xhc3NOYW1lIiwiaW5mbyIsImNsaWVudFNESyIsImNvbnRleHQiLCJ0aGVuIiwicmVzcG9uc2UiLCJyZXN1bHQiLCJyZXN1bHRzIiwiVXNlcnNSb3V0ZXIiLCJyZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzIiwiQXJyYXkiLCJpc0FycmF5Iiwia2V5cyIsIm1hcCIsImtleSIsInN0YWdlIiwibGVuZ3RoIiwiRXJyb3IiLCJqb2luIiwidHJhbnNmb3JtU3RhZ2UiLCJzdGFnZU5hbWUiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJEZXByZWNhdG9yIiwibG9nUnVudGltZURlcHJlY2F0aW9uIiwidXNhZ2UiLCJzb2x1dGlvbiIsIl9pZCIsIm9iamVjdElkIiwiUGFyc2UiLCJJTlZBTElEX1FVRVJZIiwibW91bnRSb3V0ZXMiLCJyb3V0ZSIsIm1pZGRsZXdhcmUiLCJwcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcyJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQUVPLE1BQU1BLGVBQU4sU0FBOEJDLHNCQUE5QixDQUE0QztBQUNqREMsRUFBQUEsVUFBVSxDQUFDQyxHQUFELEVBQU07QUFDZCxVQUFNQyxJQUFJLEdBQUdDLE1BQU0sQ0FBQ0MsTUFB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QUcsUUFBT1AsU0FBVTtBQUZHLE9BQWpDO0FBSUQ7O0FBQ0QsVUFBTU4sR0FBRyxHQUFHTSxTQUFTLENBQUMsQ0FBRCxDQUFULEtBQWlCLEdBQWpCLEdBQXVCQSxTQUF2QixHQUFvQyxJQUFHQSxTQUFVLEVBQTdEO0FBQ0EsV0FBTztBQUFFLE9BQUNOLEdBQUQsR0FBT0MsS0FBSyxDQUFDSyxTQUFEO0FBQWQsS0FBUDtBQUNEOztBQUVEWSxFQUFBQSxXQUFXLEdBQUc7QUFDWixTQUFLQyxLQUFMLENBQVcsS0FBWCxFQUFrQix1QkFBbEIsRUFBMkNDLFVBQVUsQ0FBQ0MsNkJBQXRELEVBQXFGeEQsR0FBRyxJQUFJO0FBQzFGLGFBQU8sS0FBS0QsVUFBTCxDQUFnQkMsR0FBaEIsQ0FBUDtBQUNELEtBRkQ7QUFHRDs7QUFySGdEOzs7ZUF3SHBDSCxlIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IENsYXNzZXNSb3V0ZXIgZnJvbSAnLi9DbGFzc2VzUm91dGVyJztcbmltcG9ydCByZXN0IGZyb20gJy4uL3Jlc3QnO1xuaW1wb3J0ICogYXMgbWlkZGxld2FyZSBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgVXNlcnNSb3V0ZXIgZnJvbSAnLi9Vc2Vyc1JvdXRlcic7XG5pbXBvcnQgRGVwcmVjYXRvciBmcm9tICcuLi9EZXByZWNhdG9yL0RlcHJlY2F0b3InO1xuXG5leHBvcnQgY2xhc3MgQWdncmVnYXRlUm91dGVyIGV4dGVuZHMgQ2xhc3Nlc1JvdXRlciB7XG4gIGhhbmRsZUZpbmQocmVxKSB7XG4gICAgY29uc3QgYm9keSA9IE9iamVjdC5hc3NpZ24ocmVxLmJvZHksIENsYXNzZXNSb3V0ZXIuSlNPTkZyb21RdWVyeShyZXEucXVlcnkpKTtcbiAgICBjb25zdCBvcHRpb25zID0ge307XG4gICAgaWYgKGJvZHkuZGlzdGluY3QpIHtcbiAgICAgIG9wdGlvbnMuZGlzdGluY3QgPSBTdHJpbmcoYm9keS5kaXN0aW5jdCk7XG4gICAgfVxuICAgIGlmIChib2R5LmhpbnQpIHtcbiAgICAgIG9wdGlvbnMuaGludCA9IGJvZHkuaGludDtcbiAgICAgIGRlbGV0ZSBib2R5LmhpbnQ7XG4gICAgfVxuICAgIGlmIChib2R5LmV4cGxhaW4pIHtcbiAgICAgIG9wdGlvbnMuZXhwbGFpbiA9IGJvZHkuZXhwbGFpbjtcbiAgICAgIGRlbGV0ZSBib2R5LmV4cGxhaW47XG4gICAgfVxuICAgIGlmIChib2R5LnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgICBvcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gYm9keS5yZWFkUHJlZmVyZW5jZTtcbiAgICAgIGRlbGV0ZSBib2R5LnJlYWRQcmVmZXJlbmNlO1xuICAgIH1cbiAgICBvcHRpb25zLnBpcGVsaW5lID0gQWdncmVnYXRlUm91dGVyLmdldFBpcGVsaW5lKGJvZHkpO1xuICAgIGlmICh0eXBlb2YgYm9keS53aGVyZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIGJvZHkud2hlcmUgPSBKU09OLnBhcnNlKGJvZHkud2hlcmUpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdFxuICAgICAgLmZpbmQoXG4gICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgIHJlcS5hdXRoLFxuICAgICAgICB0aGlzLmNsYXNzTmFtZShyZXEpLFxuICAgICAgICBib2R5LndoZXJlLFxuICAgICAgICBvcHRpb25zLFxuICAgICAgICByZXEuaW5mby5jbGllbnRTREssXG4gICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgZm9yIChjb25zdCByZXN1bHQgb2YgcmVzcG9uc2UucmVzdWx0cykge1xuICAgICAgICAgIGlmICh0eXBlb2YgcmVzdWx0ID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgVXNlcnNSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyhyZXN1bHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyByZXNwb25zZSB9O1xuICAgICAgfSk7XG4gIH1cblxuICAvKiBCdWlsZHMgYSBwaXBlbGluZSBmcm9tIHRoZSBib2R5LiBPcmlnaW5hbGx5IHRoZSBib2R5IGNvdWxkIGJlIHBhc3NlZCBhcyBhIHNpbmdsZSBvYmplY3QsXG4gICAqIGFuZCBub3cgd2Ugc3VwcG9ydCBtYW55IG9wdGlvbnNcbiAgICpcbiAgICogQXJyYXlcbiAgICpcbiAgICogYm9keTogW3tcbiAgICogICBncm91cDogeyBvYmplY3RJZDogJyRuYW1lJyB9LFxuICAgKiB9XVxuICAgKlxuICAgKiBPYmplY3RcbiAgICpcbiAgICogYm9keToge1xuICAgKiAgIGdyb3VwOiB7IG9iamVjdElkOiAnJG5hbWUnIH0sXG4gICAqIH1cbiAgICpcbiAgICpcbiAgICogUGlwZWxpbmUgT3BlcmF0b3Igd2l0aCBhbiBBcnJheSBvciBhbiBPYmplY3RcbiAgICpcbiAgICogYm9keToge1xuICAgKiAgIHBpcGVsaW5lOiB7XG4gICAqICAgICBncm91cDogeyBvYmplY3RJZDogJyRuYW1lJyB9LFxuICAgKiAgIH1cbiAgICogfVxuICAgKlxuICAgKi9cbiAgc3RhdGljIGdldFBpcGVsaW5lKGJvZHkpIHtcbiAgICBsZXQgcGlwZWxpbmUgPSBib2R5LnBpcGVsaW5lIHx8IGJvZHk7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KHBpcGVsaW5lKSkge1xuICAgICAgcGlwZWxpbmUgPSBPYmplY3Qua2V5cyhwaXBlbGluZSkubWFwKGtleSA9PiB7XG4gICAgICAgIHJldHVybiB7IFtrZXldOiBwaXBlbGluZVtrZXldIH07XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gcGlwZWxpbmUubWFwKHN0YWdlID0+IHtcbiAgICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyhzdGFnZSk7XG4gICAgICBpZiAoa2V5cy5sZW5ndGggIT0gMSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFBpcGVsaW5lIHN0YWdlcyBzaG91bGQgb25seSBoYXZlIG9uZSBrZXkgZm91bmQgJHtrZXlzLmpvaW4oJywgJyl9YCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gQWdncmVnYXRlUm91dGVyLnRyYW5zZm9ybVN0YWdlKGtleXNbMF0sIHN0YWdlKTtcbiAgICB9KTtcbiAgfVxuXG4gIHN0YXRpYyB0cmFuc2Zvcm1TdGFnZShzdGFnZU5hbWUsIHN0YWdlKSB7XG4gICAgaWYgKHN0YWdlTmFtZSA9PT0gJ2dyb3VwJykge1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChzdGFnZVtzdGFnZU5hbWVdLCAnb2JqZWN0SWQnKSkge1xuICAgICAgICBEZXByZWNhdG9yLmxvZ1J1bnRpbWVEZXByZWNhdGlvbih7XG4gICAgICAgICAgdXNhZ2U6ICdUaGUgdXNlIG9mIG9iamVjdElkIGluIGFnZ3JlZ2F0aW9uIHN0YWdlICRncm91cCcsXG4gICAgICAgICAgc29sdXRpb246ICdVc2UgX2lkIGluc3RlYWQuJyxcbiAgICAgICAgfSk7XG4gICAgICAgIHN0YWdlW3N0YWdlTmFtZV0uX2lkID0gc3RhZ2Vbc3RhZ2VOYW1lXS5vYmplY3RJZDtcbiAgICAgICAgZGVsZXRlIHN0YWdlW3N0YWdlTmFtZV0ub2JqZWN0SWQ7XG4gICAgICB9XG4gICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChzdGFnZVtzdGFnZU5hbWVdLCAnX2lkJykpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgYEludmFsaWQgcGFyYW1ldGVyIGZvciBxdWVyeTogZ3JvdXAuIE1pc3Npbmcga2V5IF9pZGBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoc3RhZ2VOYW1lWzBdICE9PSAnJCcpIHtcbiAgICAgIERlcHJlY2F0b3IubG9nUnVudGltZURlcHJlY2F0aW9uKHtcbiAgICAgICAgdXNhZ2U6IFwiVXNpbmcgYWdncmVnYXRpb24gc3RhZ2VzIHdpdGhvdXQgYSBsZWFkaW5nICckJ1wiLFxuICAgICAgICBzb2x1dGlvbjogYFRyeSAkJHtzdGFnZU5hbWV9IGluc3RlYWQuYCxcbiAgICAgIH0pO1xuICAgIH1cbiAgICBjb25zdCBrZXkgPSBzdGFnZU5hbWVbMF0gPT09ICckJyA/IHN0YWdlTmFtZSA6IGAkJHtzdGFnZU5hbWV9YDtcbiAgICByZXR1cm4geyBba2V5XTogc3RhZ2Vbc3RhZ2VOYW1lXSB9O1xuICB9XG5cbiAgbW91bnRSb3V0ZXMoKSB7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy9hZ2dyZWdhdGUvOmNsYXNzTmFtZScsIG1pZGRsZXdhcmUucHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVGaW5kKHJlcSk7XG4gICAgfSk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgQWdncmVnYXRlUm91dGVyO1xuIl19