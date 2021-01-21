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

const BASE_KEYS = ['where', 'distinct', 'pipeline', 'hint', 'explain'];
const PIPELINE_KEYS = ['addFields', 'bucket', 'bucketAuto', 'collStats', 'count', 'currentOp', 'facet', 'geoNear', 'graphLookup', 'group', 'indexStats', 'limit', 'listLocalSessions', 'listSessions', 'lookup', 'match', 'out', 'project', 'redact', 'replaceRoot', 'sample', 'search', 'skip', 'sort', 'sortByCount', 'unwind'];
const ALLOWED_KEYS = [...BASE_KEYS, ...PIPELINE_KEYS];

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

    return _rest.default.find(req.config, req.auth, this.className(req), body.where, options, req.info.clientSDK).then(response => {
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
    if (ALLOWED_KEYS.indexOf(stageName) === -1) {
      throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Invalid parameter for query: ${stageName}`);
    }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0FnZ3JlZ2F0ZVJvdXRlci5qcyJdLCJuYW1lcyI6WyJCQVNFX0tFWVMiLCJQSVBFTElORV9LRVlTIiwiQUxMT1dFRF9LRVlTIiwiQWdncmVnYXRlUm91dGVyIiwiQ2xhc3Nlc1JvdXRlciIsImhhbmRsZUZpbmQiLCJyZXEiLCJib2R5IiwiT2JqZWN0IiwiYXNzaWduIiwiSlNPTkZyb21RdWVyeSIsInF1ZXJ5Iiwib3B0aW9ucyIsImRpc3RpbmN0IiwiU3RyaW5nIiwiaGludCIsImV4cGxhaW4iLCJyZWFkUHJlZmVyZW5jZSIsInBpcGVsaW5lIiwiZ2V0UGlwZWxpbmUiLCJ3aGVyZSIsIkpTT04iLCJwYXJzZSIsInJlc3QiLCJmaW5kIiwiY29uZmlnIiwiYXV0aCIsImNsYXNzTmFtZSIsImluZm8iLCJjbGllbnRTREsiLCJ0aGVuIiwicmVzcG9uc2UiLCJyZXN1bHQiLCJyZXN1bHRzIiwiVXNlcnNSb3V0ZXIiLCJyZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzIiwiQXJyYXkiLCJpc0FycmF5Iiwia2V5cyIsIm1hcCIsImtleSIsInN0YWdlIiwibGVuZ3RoIiwiRXJyb3IiLCJqb2luIiwidHJhbnNmb3JtU3RhZ2UiLCJzdGFnZU5hbWUiLCJpbmRleE9mIiwiUGFyc2UiLCJJTlZBTElEX1FVRVJZIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiX2lkIiwib2JqZWN0SWQiLCJtb3VudFJvdXRlcyIsInJvdXRlIiwibWlkZGxld2FyZSIsInByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBRUEsTUFBTUEsU0FBUyxHQUFHLENBQUMsT0FBRCxFQUFVLFVBQVYsRUFBc0IsVUFBdEIsRUFBa0MsTUFBbEMsRUFBMEMsU0FBMUMsQ0FBbEI7QUFFQSxNQUFNQyxhQUFhLEdBQUcsQ0FDcEIsV0FEb0IsRUFFcEIsUUFG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Y0FBTUwsS0FBTixDQUFZTSxhQURSLEVBRUgsd0VBRkcsQ0FBTjtBQUlEOztBQUNELFVBQUksQ0FBQ3pDLE1BQU0sQ0FBQzBDLFNBQVAsQ0FBaUJDLGNBQWpCLENBQWdDQyxJQUFoQyxDQUFxQ1gsS0FBSyxDQUFDSyxTQUFELENBQTFDLEVBQXVELFVBQXZELENBQUwsRUFBeUU7QUFDdkUsY0FBTSxJQUFJRSxjQUFNTCxLQUFWLENBQ0pLLGNBQU1MLEtBQU4sQ0FBWU0sYUFEUixFQUVILDBEQUZHLENBQU47QUFJRDs7QUFDRFIsTUFBQUEsS0FBSyxDQUFDSyxTQUFELENBQUwsQ0FBaUJPLEdBQWpCLEdBQXVCWixLQUFLLENBQUNLLFNBQUQsQ0FBTCxDQUFpQlEsUUFBeEM7QUFDQSxhQUFPYixLQUFLLENBQUNLLFNBQUQsQ0FBTCxDQUFpQlEsUUFBeEI7QUFDRDs7QUFDRCxXQUFPO0FBQUUsT0FBRSxJQUFHUixTQUFVLEVBQWYsR0FBbUJMLEtBQUssQ0FBQ0ssU0FBRDtBQUExQixLQUFQO0FBQ0Q7O0FBRURTLEVBQUFBLFdBQVcsR0FBRztBQUNaLFNBQUtDLEtBQUwsQ0FDRSxLQURGLEVBRUUsdUJBRkYsRUFHRUMsVUFBVSxDQUFDQyw2QkFIYixFQUlHcEQsR0FBRCxJQUFTO0FBQ1AsYUFBTyxLQUFLRCxVQUFMLENBQWdCQyxHQUFoQixDQUFQO0FBQ0QsS0FOSDtBQVFEOztBQTVIZ0Q7OztlQStIcENILGUiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgQ2xhc3Nlc1JvdXRlciBmcm9tICcuL0NsYXNzZXNSb3V0ZXInO1xuaW1wb3J0IHJlc3QgZnJvbSAnLi4vcmVzdCc7XG5pbXBvcnQgKiBhcyBtaWRkbGV3YXJlIGZyb20gJy4uL21pZGRsZXdhcmVzJztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBVc2Vyc1JvdXRlciBmcm9tICcuL1VzZXJzUm91dGVyJztcblxuY29uc3QgQkFTRV9LRVlTID0gWyd3aGVyZScsICdkaXN0aW5jdCcsICdwaXBlbGluZScsICdoaW50JywgJ2V4cGxhaW4nXTtcblxuY29uc3QgUElQRUxJTkVfS0VZUyA9IFtcbiAgJ2FkZEZpZWxkcycsXG4gICdidWNrZXQnLFxuICAnYnVja2V0QXV0bycsXG4gICdjb2xsU3RhdHMnLFxuICAnY291bnQnLFxuICAnY3VycmVudE9wJyxcbiAgJ2ZhY2V0JyxcbiAgJ2dlb05lYXInLFxuICAnZ3JhcGhMb29rdXAnLFxuICAnZ3JvdXAnLFxuICAnaW5kZXhTdGF0cycsXG4gICdsaW1pdCcsXG4gICdsaXN0TG9jYWxTZXNzaW9ucycsXG4gICdsaXN0U2Vzc2lvbnMnLFxuICAnbG9va3VwJyxcbiAgJ21hdGNoJyxcbiAgJ291dCcsXG4gICdwcm9qZWN0JyxcbiAgJ3JlZGFjdCcsXG4gICdyZXBsYWNlUm9vdCcsXG4gICdzYW1wbGUnLFxuICAnc2VhcmNoJyxcbiAgJ3NraXAnLFxuICAnc29ydCcsXG4gICdzb3J0QnlDb3VudCcsXG4gICd1bndpbmQnLFxuXTtcblxuY29uc3QgQUxMT1dFRF9LRVlTID0gWy4uLkJBU0VfS0VZUywgLi4uUElQRUxJTkVfS0VZU107XG5cbmV4cG9ydCBjbGFzcyBBZ2dyZWdhdGVSb3V0ZXIgZXh0ZW5kcyBDbGFzc2VzUm91dGVyIHtcbiAgaGFuZGxlRmluZChyZXEpIHtcbiAgICBjb25zdCBib2R5ID0gT2JqZWN0LmFzc2lnbihcbiAgICAgIHJlcS5ib2R5LFxuICAgICAgQ2xhc3Nlc1JvdXRlci5KU09ORnJvbVF1ZXJ5KHJlcS5xdWVyeSlcbiAgICApO1xuICAgIGNvbnN0IG9wdGlvbnMgPSB7fTtcbiAgICBpZiAoYm9keS5kaXN0aW5jdCkge1xuICAgICAgb3B0aW9ucy5kaXN0aW5jdCA9IFN0cmluZyhib2R5LmRpc3RpbmN0KTtcbiAgICB9XG4gICAgaWYgKGJvZHkuaGludCkge1xuICAgICAgb3B0aW9ucy5oaW50ID0gYm9keS5oaW50O1xuICAgICAgZGVsZXRlIGJvZHkuaGludDtcbiAgICB9XG4gICAgaWYgKGJvZHkuZXhwbGFpbikge1xuICAgICAgb3B0aW9ucy5leHBsYWluID0gYm9keS5leHBsYWluO1xuICAgICAgZGVsZXRlIGJvZHkuZXhwbGFpbjtcbiAgICB9XG4gICAgaWYgKGJvZHkucmVhZFByZWZlcmVuY2UpIHtcbiAgICAgIG9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSBib2R5LnJlYWRQcmVmZXJlbmNlO1xuICAgICAgZGVsZXRlIGJvZHkucmVhZFByZWZlcmVuY2U7XG4gICAgfVxuICAgIG9wdGlvbnMucGlwZWxpbmUgPSBBZ2dyZWdhdGVSb3V0ZXIuZ2V0UGlwZWxpbmUoYm9keSk7XG4gICAgaWYgKHR5cGVvZiBib2R5LndoZXJlID09PSAnc3RyaW5nJykge1xuICAgICAgYm9keS53aGVyZSA9IEpTT04ucGFyc2UoYm9keS53aGVyZSk7XG4gICAgfVxuICAgIHJldHVybiByZXN0XG4gICAgICAuZmluZChcbiAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgcmVxLmF1dGgsXG4gICAgICAgIHRoaXMuY2xhc3NOYW1lKHJlcSksXG4gICAgICAgIGJvZHkud2hlcmUsXG4gICAgICAgIG9wdGlvbnMsXG4gICAgICAgIHJlcS5pbmZvLmNsaWVudFNES1xuICAgICAgKVxuICAgICAgLnRoZW4oKHJlc3BvbnNlKSA9PiB7XG4gICAgICAgIGZvciAoY29uc3QgcmVzdWx0IG9mIHJlc3BvbnNlLnJlc3VsdHMpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIHJlc3VsdCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXMocmVzdWx0KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2UgfTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLyogQnVpbGRzIGEgcGlwZWxpbmUgZnJvbSB0aGUgYm9keS4gT3JpZ2luYWxseSB0aGUgYm9keSBjb3VsZCBiZSBwYXNzZWQgYXMgYSBzaW5nbGUgb2JqZWN0LFxuICAgKiBhbmQgbm93IHdlIHN1cHBvcnQgbWFueSBvcHRpb25zXG4gICAqXG4gICAqIEFycmF5XG4gICAqXG4gICAqIGJvZHk6IFt7XG4gICAqICAgZ3JvdXA6IHsgb2JqZWN0SWQ6ICckbmFtZScgfSxcbiAgICogfV1cbiAgICpcbiAgICogT2JqZWN0XG4gICAqXG4gICAqIGJvZHk6IHtcbiAgICogICBncm91cDogeyBvYmplY3RJZDogJyRuYW1lJyB9LFxuICAgKiB9XG4gICAqXG4gICAqXG4gICAqIFBpcGVsaW5lIE9wZXJhdG9yIHdpdGggYW4gQXJyYXkgb3IgYW4gT2JqZWN0XG4gICAqXG4gICAqIGJvZHk6IHtcbiAgICogICBwaXBlbGluZToge1xuICAgKiAgICAgZ3JvdXA6IHsgb2JqZWN0SWQ6ICckbmFtZScgfSxcbiAgICogICB9XG4gICAqIH1cbiAgICpcbiAgICovXG4gIHN0YXRpYyBnZXRQaXBlbGluZShib2R5KSB7XG4gICAgbGV0IHBpcGVsaW5lID0gYm9keS5waXBlbGluZSB8fCBib2R5O1xuICAgIGlmICghQXJyYXkuaXNBcnJheShwaXBlbGluZSkpIHtcbiAgICAgIHBpcGVsaW5lID0gT2JqZWN0LmtleXMocGlwZWxpbmUpLm1hcCgoa2V5KSA9PiB7XG4gICAgICAgIHJldHVybiB7IFtrZXldOiBwaXBlbGluZVtrZXldIH07XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gcGlwZWxpbmUubWFwKChzdGFnZSkgPT4ge1xuICAgICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHN0YWdlKTtcbiAgICAgIGlmIChrZXlzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICBgUGlwZWxpbmUgc3RhZ2VzIHNob3VsZCBvbmx5IGhhdmUgb25lIGtleSBmb3VuZCAke2tleXMuam9pbignLCAnKX1gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICByZXR1cm4gQWdncmVnYXRlUm91dGVyLnRyYW5zZm9ybVN0YWdlKGtleXNbMF0sIHN0YWdlKTtcbiAgICB9KTtcbiAgfVxuXG4gIHN0YXRpYyB0cmFuc2Zvcm1TdGFnZShzdGFnZU5hbWUsIHN0YWdlKSB7XG4gICAgaWYgKEFMTE9XRURfS0VZUy5pbmRleE9mKHN0YWdlTmFtZSkgPT09IC0xKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgIGBJbnZhbGlkIHBhcmFtZXRlciBmb3IgcXVlcnk6ICR7c3RhZ2VOYW1lfWBcbiAgICAgICk7XG4gICAgfVxuICAgIGlmIChzdGFnZU5hbWUgPT09ICdncm91cCcpIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoc3RhZ2Vbc3RhZ2VOYW1lXSwgJ19pZCcpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgIGBJbnZhbGlkIHBhcmFtZXRlciBmb3IgcXVlcnk6IGdyb3VwLiBQbGVhc2UgdXNlIG9iamVjdElkIGluc3RlYWQgb2YgX2lkYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoc3RhZ2Vbc3RhZ2VOYW1lXSwgJ29iamVjdElkJykpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgYEludmFsaWQgcGFyYW1ldGVyIGZvciBxdWVyeTogZ3JvdXAuIG9iamVjdElkIGlzIHJlcXVpcmVkYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgc3RhZ2Vbc3RhZ2VOYW1lXS5faWQgPSBzdGFnZVtzdGFnZU5hbWVdLm9iamVjdElkO1xuICAgICAgZGVsZXRlIHN0YWdlW3N0YWdlTmFtZV0ub2JqZWN0SWQ7XG4gICAgfVxuICAgIHJldHVybiB7IFtgJCR7c3RhZ2VOYW1lfWBdOiBzdGFnZVtzdGFnZU5hbWVdIH07XG4gIH1cblxuICBtb3VudFJvdXRlcygpIHtcbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ0dFVCcsXG4gICAgICAnL2FnZ3JlZ2F0ZS86Y2xhc3NOYW1lJyxcbiAgICAgIG1pZGRsZXdhcmUucHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsXG4gICAgICAocmVxKSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmhhbmRsZUZpbmQocmVxKTtcbiAgICAgIH1cbiAgICApO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IEFnZ3JlZ2F0ZVJvdXRlcjtcbiJdfQ==