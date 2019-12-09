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

const BASE_KEYS = ['where', 'distinct', 'pipeline'];
const PIPELINE_KEYS = ['addFields', 'bucket', 'bucketAuto', 'collStats', 'count', 'currentOp', 'facet', 'geoNear', 'graphLookup', 'group', 'indexStats', 'limit', 'listLocalSessions', 'listSessions', 'lookup', 'match', 'out', 'project', 'redact', 'replaceRoot', 'sample', 'skip', 'sort', 'sortByCount', 'unwind'];
const ALLOWED_KEYS = [...BASE_KEYS, ...PIPELINE_KEYS];

class AggregateRouter extends _ClassesRouter.default {
  handleFind(req) {
    const body = Object.assign(req.body, _ClassesRouter.default.JSONFromQuery(req.query));
    const options = {};

    if (body.distinct) {
      options.distinct = String(body.distinct);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0FnZ3JlZ2F0ZVJvdXRlci5qcyJdLCJuYW1lcyI6WyJCQVNFX0tFWVMiLCJQSVBFTElORV9LRVlTIiwiQUxMT1dFRF9LRVlTIiwiQWdncmVnYXRlUm91dGVyIiwiQ2xhc3Nlc1JvdXRlciIsImhhbmRsZUZpbmQiLCJyZXEiLCJib2R5IiwiT2JqZWN0IiwiYXNzaWduIiwiSlNPTkZyb21RdWVyeSIsInF1ZXJ5Iiwib3B0aW9ucyIsImRpc3RpbmN0IiwiU3RyaW5nIiwicGlwZWxpbmUiLCJnZXRQaXBlbGluZSIsIndoZXJlIiwiSlNPTiIsInBhcnNlIiwicmVzdCIsImZpbmQiLCJjb25maWciLCJhdXRoIiwiY2xhc3NOYW1lIiwiaW5mbyIsImNsaWVudFNESyIsInRoZW4iLCJyZXNwb25zZSIsInJlc3VsdCIsInJlc3VsdHMiLCJVc2Vyc1JvdXRlciIsInJlbW92ZUhpZGRlblByb3BlcnRpZXMiLCJBcnJheSIsImlzQXJyYXkiLCJrZXlzIiwibWFwIiwia2V5Iiwic3RhZ2UiLCJsZW5ndGgiLCJFcnJvciIsImpvaW4iLCJ0cmFuc2Zvcm1TdGFnZSIsInN0YWdlTmFtZSIsImluZGV4T2YiLCJQYXJzZSIsIklOVkFMSURfUVVFUlkiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJfaWQiLCJvYmplY3RJZCIsIm1vdW50Um91dGVzIiwicm91dGUiLCJtaWRkbGV3YXJlIiwicHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFQSxNQUFNQSxTQUFTLEdBQUcsQ0FBQyxPQUFELEVBQVUsVUFBVixFQUFzQixVQUF0QixDQUFsQjtBQUVBLE1BQU1DLGFBQWEsR0FBRyxDQUNwQixXQURvQixFQUVwQixRQUZvQixFQUdwQixZQUhvQixFQUlwQixXQUpvQixFQUtwQixPQUxvQixFQU1wQixXQU5vQixFQU9wQixP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QUQ7QUFBMUIsS0FBUDtBQUNEOztBQUVEUyxFQUFBQSxXQUFXLEdBQUc7QUFDWixTQUFLQyxLQUFMLENBQ0UsS0FERixFQUVFLHVCQUZGLEVBR0VDLFVBQVUsQ0FBQ0MsNkJBSGIsRUFJRWpELEdBQUcsSUFBSTtBQUNMLGFBQU8sS0FBS0QsVUFBTCxDQUFnQkMsR0FBaEIsQ0FBUDtBQUNELEtBTkg7QUFRRDs7QUFqSGdEOzs7ZUFvSHBDSCxlIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IENsYXNzZXNSb3V0ZXIgZnJvbSAnLi9DbGFzc2VzUm91dGVyJztcbmltcG9ydCByZXN0IGZyb20gJy4uL3Jlc3QnO1xuaW1wb3J0ICogYXMgbWlkZGxld2FyZSBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgVXNlcnNSb3V0ZXIgZnJvbSAnLi9Vc2Vyc1JvdXRlcic7XG5cbmNvbnN0IEJBU0VfS0VZUyA9IFsnd2hlcmUnLCAnZGlzdGluY3QnLCAncGlwZWxpbmUnXTtcblxuY29uc3QgUElQRUxJTkVfS0VZUyA9IFtcbiAgJ2FkZEZpZWxkcycsXG4gICdidWNrZXQnLFxuICAnYnVja2V0QXV0bycsXG4gICdjb2xsU3RhdHMnLFxuICAnY291bnQnLFxuICAnY3VycmVudE9wJyxcbiAgJ2ZhY2V0JyxcbiAgJ2dlb05lYXInLFxuICAnZ3JhcGhMb29rdXAnLFxuICAnZ3JvdXAnLFxuICAnaW5kZXhTdGF0cycsXG4gICdsaW1pdCcsXG4gICdsaXN0TG9jYWxTZXNzaW9ucycsXG4gICdsaXN0U2Vzc2lvbnMnLFxuICAnbG9va3VwJyxcbiAgJ21hdGNoJyxcbiAgJ291dCcsXG4gICdwcm9qZWN0JyxcbiAgJ3JlZGFjdCcsXG4gICdyZXBsYWNlUm9vdCcsXG4gICdzYW1wbGUnLFxuICAnc2tpcCcsXG4gICdzb3J0JyxcbiAgJ3NvcnRCeUNvdW50JyxcbiAgJ3Vud2luZCcsXG5dO1xuXG5jb25zdCBBTExPV0VEX0tFWVMgPSBbLi4uQkFTRV9LRVlTLCAuLi5QSVBFTElORV9LRVlTXTtcblxuZXhwb3J0IGNsYXNzIEFnZ3JlZ2F0ZVJvdXRlciBleHRlbmRzIENsYXNzZXNSb3V0ZXIge1xuICBoYW5kbGVGaW5kKHJlcSkge1xuICAgIGNvbnN0IGJvZHkgPSBPYmplY3QuYXNzaWduKFxuICAgICAgcmVxLmJvZHksXG4gICAgICBDbGFzc2VzUm91dGVyLkpTT05Gcm9tUXVlcnkocmVxLnF1ZXJ5KVxuICAgICk7XG4gICAgY29uc3Qgb3B0aW9ucyA9IHt9O1xuICAgIGlmIChib2R5LmRpc3RpbmN0KSB7XG4gICAgICBvcHRpb25zLmRpc3RpbmN0ID0gU3RyaW5nKGJvZHkuZGlzdGluY3QpO1xuICAgIH1cbiAgICBvcHRpb25zLnBpcGVsaW5lID0gQWdncmVnYXRlUm91dGVyLmdldFBpcGVsaW5lKGJvZHkpO1xuICAgIGlmICh0eXBlb2YgYm9keS53aGVyZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIGJvZHkud2hlcmUgPSBKU09OLnBhcnNlKGJvZHkud2hlcmUpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdFxuICAgICAgLmZpbmQoXG4gICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgIHJlcS5hdXRoLFxuICAgICAgICB0aGlzLmNsYXNzTmFtZShyZXEpLFxuICAgICAgICBib2R5LndoZXJlLFxuICAgICAgICBvcHRpb25zLFxuICAgICAgICByZXEuaW5mby5jbGllbnRTREtcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgZm9yIChjb25zdCByZXN1bHQgb2YgcmVzcG9uc2UucmVzdWx0cykge1xuICAgICAgICAgIGlmICh0eXBlb2YgcmVzdWx0ID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgVXNlcnNSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyhyZXN1bHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyByZXNwb25zZSB9O1xuICAgICAgfSk7XG4gIH1cblxuICAvKiBCdWlsZHMgYSBwaXBlbGluZSBmcm9tIHRoZSBib2R5LiBPcmlnaW5hbGx5IHRoZSBib2R5IGNvdWxkIGJlIHBhc3NlZCBhcyBhIHNpbmdsZSBvYmplY3QsXG4gICAqIGFuZCBub3cgd2Ugc3VwcG9ydCBtYW55IG9wdGlvbnNcbiAgICpcbiAgICogQXJyYXlcbiAgICpcbiAgICogYm9keTogW3tcbiAgICogICBncm91cDogeyBvYmplY3RJZDogJyRuYW1lJyB9LFxuICAgKiB9XVxuICAgKlxuICAgKiBPYmplY3RcbiAgICpcbiAgICogYm9keToge1xuICAgKiAgIGdyb3VwOiB7IG9iamVjdElkOiAnJG5hbWUnIH0sXG4gICAqIH1cbiAgICpcbiAgICpcbiAgICogUGlwZWxpbmUgT3BlcmF0b3Igd2l0aCBhbiBBcnJheSBvciBhbiBPYmplY3RcbiAgICpcbiAgICogYm9keToge1xuICAgKiAgIHBpcGVsaW5lOiB7XG4gICAqICAgICBncm91cDogeyBvYmplY3RJZDogJyRuYW1lJyB9LFxuICAgKiAgIH1cbiAgICogfVxuICAgKlxuICAgKi9cbiAgc3RhdGljIGdldFBpcGVsaW5lKGJvZHkpIHtcbiAgICBsZXQgcGlwZWxpbmUgPSBib2R5LnBpcGVsaW5lIHx8IGJvZHk7XG5cbiAgICBpZiAoIUFycmF5LmlzQXJyYXkocGlwZWxpbmUpKSB7XG4gICAgICBwaXBlbGluZSA9IE9iamVjdC5rZXlzKHBpcGVsaW5lKS5tYXAoa2V5ID0+IHtcbiAgICAgICAgcmV0dXJuIHsgW2tleV06IHBpcGVsaW5lW2tleV0gfTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBwaXBlbGluZS5tYXAoc3RhZ2UgPT4ge1xuICAgICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHN0YWdlKTtcbiAgICAgIGlmIChrZXlzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICBgUGlwZWxpbmUgc3RhZ2VzIHNob3VsZCBvbmx5IGhhdmUgb25lIGtleSBmb3VuZCAke2tleXMuam9pbignLCAnKX1gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICByZXR1cm4gQWdncmVnYXRlUm91dGVyLnRyYW5zZm9ybVN0YWdlKGtleXNbMF0sIHN0YWdlKTtcbiAgICB9KTtcbiAgfVxuXG4gIHN0YXRpYyB0cmFuc2Zvcm1TdGFnZShzdGFnZU5hbWUsIHN0YWdlKSB7XG4gICAgaWYgKEFMTE9XRURfS0VZUy5pbmRleE9mKHN0YWdlTmFtZSkgPT09IC0xKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgIGBJbnZhbGlkIHBhcmFtZXRlciBmb3IgcXVlcnk6ICR7c3RhZ2VOYW1lfWBcbiAgICAgICk7XG4gICAgfVxuICAgIGlmIChzdGFnZU5hbWUgPT09ICdncm91cCcpIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoc3RhZ2Vbc3RhZ2VOYW1lXSwgJ19pZCcpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgIGBJbnZhbGlkIHBhcmFtZXRlciBmb3IgcXVlcnk6IGdyb3VwLiBQbGVhc2UgdXNlIG9iamVjdElkIGluc3RlYWQgb2YgX2lkYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoc3RhZ2Vbc3RhZ2VOYW1lXSwgJ29iamVjdElkJykpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgYEludmFsaWQgcGFyYW1ldGVyIGZvciBxdWVyeTogZ3JvdXAuIG9iamVjdElkIGlzIHJlcXVpcmVkYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgc3RhZ2Vbc3RhZ2VOYW1lXS5faWQgPSBzdGFnZVtzdGFnZU5hbWVdLm9iamVjdElkO1xuICAgICAgZGVsZXRlIHN0YWdlW3N0YWdlTmFtZV0ub2JqZWN0SWQ7XG4gICAgfVxuICAgIHJldHVybiB7IFtgJCR7c3RhZ2VOYW1lfWBdOiBzdGFnZVtzdGFnZU5hbWVdIH07XG4gIH1cblxuICBtb3VudFJvdXRlcygpIHtcbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ0dFVCcsXG4gICAgICAnL2FnZ3JlZ2F0ZS86Y2xhc3NOYW1lJyxcbiAgICAgIG1pZGRsZXdhcmUucHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsXG4gICAgICByZXEgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5oYW5kbGVGaW5kKHJlcSk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBBZ2dyZWdhdGVSb3V0ZXI7XG4iXX0=