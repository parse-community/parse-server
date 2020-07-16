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
const PIPELINE_KEYS = ['addFields', 'bucket', 'bucketAuto', 'collStats', 'count', 'currentOp', 'facet', 'geoNear', 'graphLookup', 'group', 'indexStats', 'limit', 'listLocalSessions', 'listSessions', 'lookup', 'match', 'out', 'project', 'redact', 'replaceRoot', 'sample', 'skip', 'sort', 'sortByCount', 'unwind'];
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0FnZ3JlZ2F0ZVJvdXRlci5qcyJdLCJuYW1lcyI6WyJCQVNFX0tFWVMiLCJQSVBFTElORV9LRVlTIiwiQUxMT1dFRF9LRVlTIiwiQWdncmVnYXRlUm91dGVyIiwiQ2xhc3Nlc1JvdXRlciIsImhhbmRsZUZpbmQiLCJyZXEiLCJib2R5IiwiT2JqZWN0IiwiYXNzaWduIiwiSlNPTkZyb21RdWVyeSIsInF1ZXJ5Iiwib3B0aW9ucyIsImRpc3RpbmN0IiwiU3RyaW5nIiwiaGludCIsImV4cGxhaW4iLCJyZWFkUHJlZmVyZW5jZSIsInBpcGVsaW5lIiwiZ2V0UGlwZWxpbmUiLCJ3aGVyZSIsIkpTT04iLCJwYXJzZSIsInJlc3QiLCJmaW5kIiwiY29uZmlnIiwiYXV0aCIsImNsYXNzTmFtZSIsImluZm8iLCJjbGllbnRTREsiLCJjb250ZXh0IiwidGhlbiIsInJlc3BvbnNlIiwicmVzdWx0IiwicmVzdWx0cyIsIlVzZXJzUm91dGVyIiwicmVtb3ZlSGlkZGVuUHJvcGVydGllcyIsIkFycmF5IiwiaXNBcnJheSIsImtleXMiLCJtYXAiLCJrZXkiLCJzdGFnZSIsImxlbmd0aCIsIkVycm9yIiwiam9pbiIsInRyYW5zZm9ybVN0YWdlIiwic3RhZ2VOYW1lIiwiaW5kZXhPZiIsIlBhcnNlIiwiSU5WQUxJRF9RVUVSWSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsIl9pZCIsIm9iamVjdElkIiwibW91bnRSb3V0ZXMiLCJyb3V0ZSIsIm1pZGRsZXdhcmUiLCJwcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcyJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQUVBLE1BQU1BLFNBQVMsR0FBRyxDQUFDLE9BQUQsRUFBVSxVQUFWLEVBQXNCLFVBQXRCLEVBQWtDLE1BQWxDLEVBQTBDLFNBQTFDLENBQWxCO0FBRUEsTUFBTUMsYUFBYSxHQUFHLENBQ3BCLFdBRG9C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akUsY0FBTSxJQUFJRSxjQUFNTCxLQUFWLENBQ0pLLGNBQU1MLEtBQU4sQ0FBWU0sYUFEUixFQUVILHdFQUZHLENBQU47QUFJRDs7QUFDRCxVQUFJLENBQUMxQyxNQUFNLENBQUMyQyxTQUFQLENBQWlCQyxjQUFqQixDQUFnQ0MsSUFBaEMsQ0FBcUNYLEtBQUssQ0FBQ0ssU0FBRCxDQUExQyxFQUF1RCxVQUF2RCxDQUFMLEVBQXlFO0FBQ3ZFLGNBQU0sSUFBSUUsY0FBTUwsS0FBVixDQUNKSyxjQUFNTCxLQUFOLENBQVlNLGFBRFIsRUFFSCwwREFGRyxDQUFOO0FBSUQ7O0FBQ0RSLE1BQUFBLEtBQUssQ0FBQ0ssU0FBRCxDQUFMLENBQWlCTyxHQUFqQixHQUF1QlosS0FBSyxDQUFDSyxTQUFELENBQUwsQ0FBaUJRLFFBQXhDO0FBQ0EsYUFBT2IsS0FBSyxDQUFDSyxTQUFELENBQUwsQ0FBaUJRLFFBQXhCO0FBQ0Q7O0FBQ0QsV0FBTztBQUFFLE9BQUUsSUFBR1IsU0FBVSxFQUFmLEdBQW1CTCxLQUFLLENBQUNLLFNBQUQ7QUFBMUIsS0FBUDtBQUNEOztBQUVEUyxFQUFBQSxXQUFXLEdBQUc7QUFDWixTQUFLQyxLQUFMLENBQ0UsS0FERixFQUVFLHVCQUZGLEVBR0VDLFVBQVUsQ0FBQ0MsNkJBSGIsRUFJRXJELEdBQUcsSUFBSTtBQUNMLGFBQU8sS0FBS0QsVUFBTCxDQUFnQkMsR0FBaEIsQ0FBUDtBQUNELEtBTkg7QUFRRDs7QUE3SGdEOzs7ZUFnSXBDSCxlIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IENsYXNzZXNSb3V0ZXIgZnJvbSAnLi9DbGFzc2VzUm91dGVyJztcbmltcG9ydCByZXN0IGZyb20gJy4uL3Jlc3QnO1xuaW1wb3J0ICogYXMgbWlkZGxld2FyZSBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgVXNlcnNSb3V0ZXIgZnJvbSAnLi9Vc2Vyc1JvdXRlcic7XG5cbmNvbnN0IEJBU0VfS0VZUyA9IFsnd2hlcmUnLCAnZGlzdGluY3QnLCAncGlwZWxpbmUnLCAnaGludCcsICdleHBsYWluJ107XG5cbmNvbnN0IFBJUEVMSU5FX0tFWVMgPSBbXG4gICdhZGRGaWVsZHMnLFxuICAnYnVja2V0JyxcbiAgJ2J1Y2tldEF1dG8nLFxuICAnY29sbFN0YXRzJyxcbiAgJ2NvdW50JyxcbiAgJ2N1cnJlbnRPcCcsXG4gICdmYWNldCcsXG4gICdnZW9OZWFyJyxcbiAgJ2dyYXBoTG9va3VwJyxcbiAgJ2dyb3VwJyxcbiAgJ2luZGV4U3RhdHMnLFxuICAnbGltaXQnLFxuICAnbGlzdExvY2FsU2Vzc2lvbnMnLFxuICAnbGlzdFNlc3Npb25zJyxcbiAgJ2xvb2t1cCcsXG4gICdtYXRjaCcsXG4gICdvdXQnLFxuICAncHJvamVjdCcsXG4gICdyZWRhY3QnLFxuICAncmVwbGFjZVJvb3QnLFxuICAnc2FtcGxlJyxcbiAgJ3NraXAnLFxuICAnc29ydCcsXG4gICdzb3J0QnlDb3VudCcsXG4gICd1bndpbmQnLFxuXTtcblxuY29uc3QgQUxMT1dFRF9LRVlTID0gWy4uLkJBU0VfS0VZUywgLi4uUElQRUxJTkVfS0VZU107XG5cbmV4cG9ydCBjbGFzcyBBZ2dyZWdhdGVSb3V0ZXIgZXh0ZW5kcyBDbGFzc2VzUm91dGVyIHtcbiAgaGFuZGxlRmluZChyZXEpIHtcbiAgICBjb25zdCBib2R5ID0gT2JqZWN0LmFzc2lnbihcbiAgICAgIHJlcS5ib2R5LFxuICAgICAgQ2xhc3Nlc1JvdXRlci5KU09ORnJvbVF1ZXJ5KHJlcS5xdWVyeSlcbiAgICApO1xuICAgIGNvbnN0IG9wdGlvbnMgPSB7fTtcbiAgICBpZiAoYm9keS5kaXN0aW5jdCkge1xuICAgICAgb3B0aW9ucy5kaXN0aW5jdCA9IFN0cmluZyhib2R5LmRpc3RpbmN0KTtcbiAgICB9XG4gICAgaWYgKGJvZHkuaGludCkge1xuICAgICAgb3B0aW9ucy5oaW50ID0gYm9keS5oaW50O1xuICAgICAgZGVsZXRlIGJvZHkuaGludDtcbiAgICB9XG4gICAgaWYgKGJvZHkuZXhwbGFpbikge1xuICAgICAgb3B0aW9ucy5leHBsYWluID0gYm9keS5leHBsYWluO1xuICAgICAgZGVsZXRlIGJvZHkuZXhwbGFpbjtcbiAgICB9XG4gICAgaWYgKGJvZHkucmVhZFByZWZlcmVuY2UpIHtcbiAgICAgIG9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSBib2R5LnJlYWRQcmVmZXJlbmNlO1xuICAgICAgZGVsZXRlIGJvZHkucmVhZFByZWZlcmVuY2U7XG4gICAgfVxuICAgIG9wdGlvbnMucGlwZWxpbmUgPSBBZ2dyZWdhdGVSb3V0ZXIuZ2V0UGlwZWxpbmUoYm9keSk7XG4gICAgaWYgKHR5cGVvZiBib2R5LndoZXJlID09PSAnc3RyaW5nJykge1xuICAgICAgYm9keS53aGVyZSA9IEpTT04ucGFyc2UoYm9keS53aGVyZSk7XG4gICAgfVxuICAgIHJldHVybiByZXN0XG4gICAgICAuZmluZChcbiAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgcmVxLmF1dGgsXG4gICAgICAgIHRoaXMuY2xhc3NOYW1lKHJlcSksXG4gICAgICAgIGJvZHkud2hlcmUsXG4gICAgICAgIG9wdGlvbnMsXG4gICAgICAgIHJlcS5pbmZvLmNsaWVudFNESyxcbiAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICBmb3IgKGNvbnN0IHJlc3VsdCBvZiByZXNwb25zZS5yZXN1bHRzKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBVc2Vyc1JvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKHJlc3VsdCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHJlc3BvbnNlIH07XG4gICAgICB9KTtcbiAgfVxuXG4gIC8qIEJ1aWxkcyBhIHBpcGVsaW5lIGZyb20gdGhlIGJvZHkuIE9yaWdpbmFsbHkgdGhlIGJvZHkgY291bGQgYmUgcGFzc2VkIGFzIGEgc2luZ2xlIG9iamVjdCxcbiAgICogYW5kIG5vdyB3ZSBzdXBwb3J0IG1hbnkgb3B0aW9uc1xuICAgKlxuICAgKiBBcnJheVxuICAgKlxuICAgKiBib2R5OiBbe1xuICAgKiAgIGdyb3VwOiB7IG9iamVjdElkOiAnJG5hbWUnIH0sXG4gICAqIH1dXG4gICAqXG4gICAqIE9iamVjdFxuICAgKlxuICAgKiBib2R5OiB7XG4gICAqICAgZ3JvdXA6IHsgb2JqZWN0SWQ6ICckbmFtZScgfSxcbiAgICogfVxuICAgKlxuICAgKlxuICAgKiBQaXBlbGluZSBPcGVyYXRvciB3aXRoIGFuIEFycmF5IG9yIGFuIE9iamVjdFxuICAgKlxuICAgKiBib2R5OiB7XG4gICAqICAgcGlwZWxpbmU6IHtcbiAgICogICAgIGdyb3VwOiB7IG9iamVjdElkOiAnJG5hbWUnIH0sXG4gICAqICAgfVxuICAgKiB9XG4gICAqXG4gICAqL1xuICBzdGF0aWMgZ2V0UGlwZWxpbmUoYm9keSkge1xuICAgIGxldCBwaXBlbGluZSA9IGJvZHkucGlwZWxpbmUgfHwgYm9keTtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkocGlwZWxpbmUpKSB7XG4gICAgICBwaXBlbGluZSA9IE9iamVjdC5rZXlzKHBpcGVsaW5lKS5tYXAoa2V5ID0+IHtcbiAgICAgICAgcmV0dXJuIHsgW2tleV06IHBpcGVsaW5lW2tleV0gfTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBwaXBlbGluZS5tYXAoc3RhZ2UgPT4ge1xuICAgICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHN0YWdlKTtcbiAgICAgIGlmIChrZXlzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICBgUGlwZWxpbmUgc3RhZ2VzIHNob3VsZCBvbmx5IGhhdmUgb25lIGtleSBmb3VuZCAke2tleXMuam9pbignLCAnKX1gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICByZXR1cm4gQWdncmVnYXRlUm91dGVyLnRyYW5zZm9ybVN0YWdlKGtleXNbMF0sIHN0YWdlKTtcbiAgICB9KTtcbiAgfVxuXG4gIHN0YXRpYyB0cmFuc2Zvcm1TdGFnZShzdGFnZU5hbWUsIHN0YWdlKSB7XG4gICAgaWYgKEFMTE9XRURfS0VZUy5pbmRleE9mKHN0YWdlTmFtZSkgPT09IC0xKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgIGBJbnZhbGlkIHBhcmFtZXRlciBmb3IgcXVlcnk6ICR7c3RhZ2VOYW1lfWBcbiAgICAgICk7XG4gICAgfVxuICAgIGlmIChzdGFnZU5hbWUgPT09ICdncm91cCcpIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoc3RhZ2Vbc3RhZ2VOYW1lXSwgJ19pZCcpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgIGBJbnZhbGlkIHBhcmFtZXRlciBmb3IgcXVlcnk6IGdyb3VwLiBQbGVhc2UgdXNlIG9iamVjdElkIGluc3RlYWQgb2YgX2lkYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoc3RhZ2Vbc3RhZ2VOYW1lXSwgJ29iamVjdElkJykpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgYEludmFsaWQgcGFyYW1ldGVyIGZvciBxdWVyeTogZ3JvdXAuIG9iamVjdElkIGlzIHJlcXVpcmVkYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgc3RhZ2Vbc3RhZ2VOYW1lXS5faWQgPSBzdGFnZVtzdGFnZU5hbWVdLm9iamVjdElkO1xuICAgICAgZGVsZXRlIHN0YWdlW3N0YWdlTmFtZV0ub2JqZWN0SWQ7XG4gICAgfVxuICAgIHJldHVybiB7IFtgJCR7c3RhZ2VOYW1lfWBdOiBzdGFnZVtzdGFnZU5hbWVdIH07XG4gIH1cblxuICBtb3VudFJvdXRlcygpIHtcbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ0dFVCcsXG4gICAgICAnL2FnZ3JlZ2F0ZS86Y2xhc3NOYW1lJyxcbiAgICAgIG1pZGRsZXdhcmUucHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsXG4gICAgICByZXEgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5oYW5kbGVGaW5kKHJlcSk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBBZ2dyZWdhdGVSb3V0ZXI7XG4iXX0=