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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0FnZ3JlZ2F0ZVJvdXRlci5qcyJdLCJuYW1lcyI6WyJCQVNFX0tFWVMiLCJQSVBFTElORV9LRVlTIiwiQUxMT1dFRF9LRVlTIiwiQWdncmVnYXRlUm91dGVyIiwiQ2xhc3Nlc1JvdXRlciIsImhhbmRsZUZpbmQiLCJyZXEiLCJib2R5IiwiT2JqZWN0IiwiYXNzaWduIiwiSlNPTkZyb21RdWVyeSIsInF1ZXJ5Iiwib3B0aW9ucyIsImRpc3RpbmN0IiwiU3RyaW5nIiwiaGludCIsImV4cGxhaW4iLCJwaXBlbGluZSIsImdldFBpcGVsaW5lIiwid2hlcmUiLCJKU09OIiwicGFyc2UiLCJyZXN0IiwiZmluZCIsImNvbmZpZyIsImF1dGgiLCJjbGFzc05hbWUiLCJpbmZvIiwiY2xpZW50U0RLIiwidGhlbiIsInJlc3BvbnNlIiwicmVzdWx0IiwicmVzdWx0cyIsIlVzZXJzUm91dGVyIiwicmVtb3ZlSGlkZGVuUHJvcGVydGllcyIsIkFycmF5IiwiaXNBcnJheSIsImtleXMiLCJtYXAiLCJrZXkiLCJzdGFnZSIsImxlbmd0aCIsIkVycm9yIiwiam9pbiIsInRyYW5zZm9ybVN0YWdlIiwic3RhZ2VOYW1lIiwiaW5kZXhPZiIsIlBhcnNlIiwiSU5WQUxJRF9RVUVSWSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsIl9pZCIsIm9iamVjdElkIiwibW91bnRSb3V0ZXMiLCJyb3V0ZSIsIm1pZGRsZXdhcmUiLCJwcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcyJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQUVBLE1BQU1BLFNBQVMsR0FBRyxDQUFDLE9BQUQsRUFBVSxVQUFWLEVBQXNCLFVBQXRCLEVBQWtDLE1BQWxDLEVBQTBDLFNBQTFDLENBQWxCO0FBRUEsTUFBTUMsYUFBYSxHQUFHLENBQ3BCLFdBRG9CLEVBRXBCLFFBRm9CLEVBR3BCLFlBSG9CLEVB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QUF5RTtBQUN2RSxjQUFNLElBQUlFLGNBQU1MLEtBQVYsQ0FDSkssY0FBTUwsS0FBTixDQUFZTSxhQURSLEVBRUgsMERBRkcsQ0FBTjtBQUlEOztBQUNEUixNQUFBQSxLQUFLLENBQUNLLFNBQUQsQ0FBTCxDQUFpQk8sR0FBakIsR0FBdUJaLEtBQUssQ0FBQ0ssU0FBRCxDQUFMLENBQWlCUSxRQUF4QztBQUNBLGFBQU9iLEtBQUssQ0FBQ0ssU0FBRCxDQUFMLENBQWlCUSxRQUF4QjtBQUNEOztBQUNELFdBQU87QUFBRSxPQUFFLElBQUdSLFNBQVUsRUFBZixHQUFtQkwsS0FBSyxDQUFDSyxTQUFEO0FBQTFCLEtBQVA7QUFDRDs7QUFFRFMsRUFBQUEsV0FBVyxHQUFHO0FBQ1osU0FBS0MsS0FBTCxDQUNFLEtBREYsRUFFRSx1QkFGRixFQUdFQyxVQUFVLENBQUNDLDZCQUhiLEVBSUVuRCxHQUFHLElBQUk7QUFDTCxhQUFPLEtBQUtELFVBQUwsQ0FBZ0JDLEdBQWhCLENBQVA7QUFDRCxLQU5IO0FBUUQ7O0FBeEhnRDs7O2VBMkhwQ0gsZSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBDbGFzc2VzUm91dGVyIGZyb20gJy4vQ2xhc3Nlc1JvdXRlcic7XG5pbXBvcnQgcmVzdCBmcm9tICcuLi9yZXN0JztcbmltcG9ydCAqIGFzIG1pZGRsZXdhcmUgZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IFVzZXJzUm91dGVyIGZyb20gJy4vVXNlcnNSb3V0ZXInO1xuXG5jb25zdCBCQVNFX0tFWVMgPSBbJ3doZXJlJywgJ2Rpc3RpbmN0JywgJ3BpcGVsaW5lJywgJ2hpbnQnLCAnZXhwbGFpbiddO1xuXG5jb25zdCBQSVBFTElORV9LRVlTID0gW1xuICAnYWRkRmllbGRzJyxcbiAgJ2J1Y2tldCcsXG4gICdidWNrZXRBdXRvJyxcbiAgJ2NvbGxTdGF0cycsXG4gICdjb3VudCcsXG4gICdjdXJyZW50T3AnLFxuICAnZmFjZXQnLFxuICAnZ2VvTmVhcicsXG4gICdncmFwaExvb2t1cCcsXG4gICdncm91cCcsXG4gICdpbmRleFN0YXRzJyxcbiAgJ2xpbWl0JyxcbiAgJ2xpc3RMb2NhbFNlc3Npb25zJyxcbiAgJ2xpc3RTZXNzaW9ucycsXG4gICdsb29rdXAnLFxuICAnbWF0Y2gnLFxuICAnb3V0JyxcbiAgJ3Byb2plY3QnLFxuICAncmVkYWN0JyxcbiAgJ3JlcGxhY2VSb290JyxcbiAgJ3NhbXBsZScsXG4gICdza2lwJyxcbiAgJ3NvcnQnLFxuICAnc29ydEJ5Q291bnQnLFxuICAndW53aW5kJyxcbl07XG5cbmNvbnN0IEFMTE9XRURfS0VZUyA9IFsuLi5CQVNFX0tFWVMsIC4uLlBJUEVMSU5FX0tFWVNdO1xuXG5leHBvcnQgY2xhc3MgQWdncmVnYXRlUm91dGVyIGV4dGVuZHMgQ2xhc3Nlc1JvdXRlciB7XG4gIGhhbmRsZUZpbmQocmVxKSB7XG4gICAgY29uc3QgYm9keSA9IE9iamVjdC5hc3NpZ24oXG4gICAgICByZXEuYm9keSxcbiAgICAgIENsYXNzZXNSb3V0ZXIuSlNPTkZyb21RdWVyeShyZXEucXVlcnkpXG4gICAgKTtcbiAgICBjb25zdCBvcHRpb25zID0ge307XG4gICAgaWYgKGJvZHkuZGlzdGluY3QpIHtcbiAgICAgIG9wdGlvbnMuZGlzdGluY3QgPSBTdHJpbmcoYm9keS5kaXN0aW5jdCk7XG4gICAgfVxuICAgIGlmIChib2R5LmhpbnQpIHtcbiAgICAgIG9wdGlvbnMuaGludCA9IGJvZHkuaGludDtcbiAgICAgIGRlbGV0ZSBib2R5LmhpbnQ7XG4gICAgfVxuICAgIGlmIChib2R5LmV4cGxhaW4pIHtcbiAgICAgIG9wdGlvbnMuZXhwbGFpbiA9IGJvZHkuZXhwbGFpbjtcbiAgICAgIGRlbGV0ZSBib2R5LmV4cGxhaW47XG4gICAgfVxuICAgIG9wdGlvbnMucGlwZWxpbmUgPSBBZ2dyZWdhdGVSb3V0ZXIuZ2V0UGlwZWxpbmUoYm9keSk7XG4gICAgaWYgKHR5cGVvZiBib2R5LndoZXJlID09PSAnc3RyaW5nJykge1xuICAgICAgYm9keS53aGVyZSA9IEpTT04ucGFyc2UoYm9keS53aGVyZSk7XG4gICAgfVxuICAgIHJldHVybiByZXN0XG4gICAgICAuZmluZChcbiAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgcmVxLmF1dGgsXG4gICAgICAgIHRoaXMuY2xhc3NOYW1lKHJlcSksXG4gICAgICAgIGJvZHkud2hlcmUsXG4gICAgICAgIG9wdGlvbnMsXG4gICAgICAgIHJlcS5pbmZvLmNsaWVudFNES1xuICAgICAgKVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICBmb3IgKGNvbnN0IHJlc3VsdCBvZiByZXNwb25zZS5yZXN1bHRzKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBVc2Vyc1JvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKHJlc3VsdCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHJlc3BvbnNlIH07XG4gICAgICB9KTtcbiAgfVxuXG4gIC8qIEJ1aWxkcyBhIHBpcGVsaW5lIGZyb20gdGhlIGJvZHkuIE9yaWdpbmFsbHkgdGhlIGJvZHkgY291bGQgYmUgcGFzc2VkIGFzIGEgc2luZ2xlIG9iamVjdCxcbiAgICogYW5kIG5vdyB3ZSBzdXBwb3J0IG1hbnkgb3B0aW9uc1xuICAgKlxuICAgKiBBcnJheVxuICAgKlxuICAgKiBib2R5OiBbe1xuICAgKiAgIGdyb3VwOiB7IG9iamVjdElkOiAnJG5hbWUnIH0sXG4gICAqIH1dXG4gICAqXG4gICAqIE9iamVjdFxuICAgKlxuICAgKiBib2R5OiB7XG4gICAqICAgZ3JvdXA6IHsgb2JqZWN0SWQ6ICckbmFtZScgfSxcbiAgICogfVxuICAgKlxuICAgKlxuICAgKiBQaXBlbGluZSBPcGVyYXRvciB3aXRoIGFuIEFycmF5IG9yIGFuIE9iamVjdFxuICAgKlxuICAgKiBib2R5OiB7XG4gICAqICAgcGlwZWxpbmU6IHtcbiAgICogICAgIGdyb3VwOiB7IG9iamVjdElkOiAnJG5hbWUnIH0sXG4gICAqICAgfVxuICAgKiB9XG4gICAqXG4gICAqL1xuICBzdGF0aWMgZ2V0UGlwZWxpbmUoYm9keSkge1xuICAgIGxldCBwaXBlbGluZSA9IGJvZHkucGlwZWxpbmUgfHwgYm9keTtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkocGlwZWxpbmUpKSB7XG4gICAgICBwaXBlbGluZSA9IE9iamVjdC5rZXlzKHBpcGVsaW5lKS5tYXAoa2V5ID0+IHtcbiAgICAgICAgcmV0dXJuIHsgW2tleV06IHBpcGVsaW5lW2tleV0gfTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBwaXBlbGluZS5tYXAoc3RhZ2UgPT4ge1xuICAgICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHN0YWdlKTtcbiAgICAgIGlmIChrZXlzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICBgUGlwZWxpbmUgc3RhZ2VzIHNob3VsZCBvbmx5IGhhdmUgb25lIGtleSBmb3VuZCAke2tleXMuam9pbignLCAnKX1gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICByZXR1cm4gQWdncmVnYXRlUm91dGVyLnRyYW5zZm9ybVN0YWdlKGtleXNbMF0sIHN0YWdlKTtcbiAgICB9KTtcbiAgfVxuXG4gIHN0YXRpYyB0cmFuc2Zvcm1TdGFnZShzdGFnZU5hbWUsIHN0YWdlKSB7XG4gICAgaWYgKEFMTE9XRURfS0VZUy5pbmRleE9mKHN0YWdlTmFtZSkgPT09IC0xKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgIGBJbnZhbGlkIHBhcmFtZXRlciBmb3IgcXVlcnk6ICR7c3RhZ2VOYW1lfWBcbiAgICAgICk7XG4gICAgfVxuICAgIGlmIChzdGFnZU5hbWUgPT09ICdncm91cCcpIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoc3RhZ2Vbc3RhZ2VOYW1lXSwgJ19pZCcpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgIGBJbnZhbGlkIHBhcmFtZXRlciBmb3IgcXVlcnk6IGdyb3VwLiBQbGVhc2UgdXNlIG9iamVjdElkIGluc3RlYWQgb2YgX2lkYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoc3RhZ2Vbc3RhZ2VOYW1lXSwgJ29iamVjdElkJykpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgYEludmFsaWQgcGFyYW1ldGVyIGZvciBxdWVyeTogZ3JvdXAuIG9iamVjdElkIGlzIHJlcXVpcmVkYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgc3RhZ2Vbc3RhZ2VOYW1lXS5faWQgPSBzdGFnZVtzdGFnZU5hbWVdLm9iamVjdElkO1xuICAgICAgZGVsZXRlIHN0YWdlW3N0YWdlTmFtZV0ub2JqZWN0SWQ7XG4gICAgfVxuICAgIHJldHVybiB7IFtgJCR7c3RhZ2VOYW1lfWBdOiBzdGFnZVtzdGFnZU5hbWVdIH07XG4gIH1cblxuICBtb3VudFJvdXRlcygpIHtcbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ0dFVCcsXG4gICAgICAnL2FnZ3JlZ2F0ZS86Y2xhc3NOYW1lJyxcbiAgICAgIG1pZGRsZXdhcmUucHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsXG4gICAgICByZXEgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5oYW5kbGVGaW5kKHJlcSk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBBZ2dyZWdhdGVSb3V0ZXI7XG4iXX0=