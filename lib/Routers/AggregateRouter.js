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
      if (keys.length !== 1) {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Pipeline stages should only have one key but found ${keys.join(', ')}.`);
      }
      return AggregateRouter.transformStage(keys[0], stage);
    });
  }
  static transformStage(stageName, stage) {
    const skipKeys = ['distinct', 'where'];
    if (skipKeys.includes(stageName)) {
      return;
    }
    if (stageName[0] !== '$') {
      throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Invalid aggregate stage '${stageName}'.`);
    }
    if (stageName === '$group') {
      if (Object.prototype.hasOwnProperty.call(stage[stageName], 'objectId')) {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Cannot use 'objectId' in aggregation stage $group.`);
      }
      if (!Object.prototype.hasOwnProperty.call(stage[stageName], '_id')) {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Invalid parameter for query: group. Missing key _id`);
      }
    }
    return {
      [stageName]: stage[stageName]
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJBZ2dyZWdhdGVSb3V0ZXIiLCJDbGFzc2VzUm91dGVyIiwiaGFuZGxlRmluZCIsInJlcSIsImJvZHkiLCJPYmplY3QiLCJhc3NpZ24iLCJKU09ORnJvbVF1ZXJ5IiwicXVlcnkiLCJvcHRpb25zIiwiZGlzdGluY3QiLCJTdHJpbmciLCJoaW50IiwiZXhwbGFpbiIsInJlYWRQcmVmZXJlbmNlIiwicGlwZWxpbmUiLCJnZXRQaXBlbGluZSIsIndoZXJlIiwiSlNPTiIsInBhcnNlIiwicmVzdCIsImZpbmQiLCJjb25maWciLCJhdXRoIiwiY2xhc3NOYW1lIiwiaW5mbyIsImNsaWVudFNESyIsImNvbnRleHQiLCJ0aGVuIiwicmVzcG9uc2UiLCJyZXN1bHQiLCJyZXN1bHRzIiwiVXNlcnNSb3V0ZXIiLCJyZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzIiwiQXJyYXkiLCJpc0FycmF5Iiwia2V5cyIsIm1hcCIsImtleSIsInN0YWdlIiwibGVuZ3RoIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfUVVFUlkiLCJqb2luIiwidHJhbnNmb3JtU3RhZ2UiLCJzdGFnZU5hbWUiLCJza2lwS2V5cyIsImluY2x1ZGVzIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwibW91bnRSb3V0ZXMiLCJyb3V0ZSIsIm1pZGRsZXdhcmUiLCJwcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0FnZ3JlZ2F0ZVJvdXRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgQ2xhc3Nlc1JvdXRlciBmcm9tICcuL0NsYXNzZXNSb3V0ZXInO1xuaW1wb3J0IHJlc3QgZnJvbSAnLi4vcmVzdCc7XG5pbXBvcnQgKiBhcyBtaWRkbGV3YXJlIGZyb20gJy4uL21pZGRsZXdhcmVzJztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBVc2Vyc1JvdXRlciBmcm9tICcuL1VzZXJzUm91dGVyJztcblxuZXhwb3J0IGNsYXNzIEFnZ3JlZ2F0ZVJvdXRlciBleHRlbmRzIENsYXNzZXNSb3V0ZXIge1xuICBoYW5kbGVGaW5kKHJlcSkge1xuICAgIGNvbnN0IGJvZHkgPSBPYmplY3QuYXNzaWduKHJlcS5ib2R5LCBDbGFzc2VzUm91dGVyLkpTT05Gcm9tUXVlcnkocmVxLnF1ZXJ5KSk7XG4gICAgY29uc3Qgb3B0aW9ucyA9IHt9O1xuICAgIGlmIChib2R5LmRpc3RpbmN0KSB7XG4gICAgICBvcHRpb25zLmRpc3RpbmN0ID0gU3RyaW5nKGJvZHkuZGlzdGluY3QpO1xuICAgIH1cbiAgICBpZiAoYm9keS5oaW50KSB7XG4gICAgICBvcHRpb25zLmhpbnQgPSBib2R5LmhpbnQ7XG4gICAgICBkZWxldGUgYm9keS5oaW50O1xuICAgIH1cbiAgICBpZiAoYm9keS5leHBsYWluKSB7XG4gICAgICBvcHRpb25zLmV4cGxhaW4gPSBib2R5LmV4cGxhaW47XG4gICAgICBkZWxldGUgYm9keS5leHBsYWluO1xuICAgIH1cbiAgICBpZiAoYm9keS5yZWFkUHJlZmVyZW5jZSkge1xuICAgICAgb3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IGJvZHkucmVhZFByZWZlcmVuY2U7XG4gICAgICBkZWxldGUgYm9keS5yZWFkUHJlZmVyZW5jZTtcbiAgICB9XG4gICAgb3B0aW9ucy5waXBlbGluZSA9IEFnZ3JlZ2F0ZVJvdXRlci5nZXRQaXBlbGluZShib2R5KTtcbiAgICBpZiAodHlwZW9mIGJvZHkud2hlcmUgPT09ICdzdHJpbmcnKSB7XG4gICAgICBib2R5LndoZXJlID0gSlNPTi5wYXJzZShib2R5LndoZXJlKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3RcbiAgICAgIC5maW5kKFxuICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICByZXEuYXV0aCxcbiAgICAgICAgdGhpcy5jbGFzc05hbWUocmVxKSxcbiAgICAgICAgYm9keS53aGVyZSxcbiAgICAgICAgb3B0aW9ucyxcbiAgICAgICAgcmVxLmluZm8uY2xpZW50U0RLLFxuICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICApXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgIGZvciAoY29uc3QgcmVzdWx0IG9mIHJlc3BvbnNlLnJlc3VsdHMpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIHJlc3VsdCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXMocmVzdWx0KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2UgfTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLyogQnVpbGRzIGEgcGlwZWxpbmUgZnJvbSB0aGUgYm9keS4gT3JpZ2luYWxseSB0aGUgYm9keSBjb3VsZCBiZSBwYXNzZWQgYXMgYSBzaW5nbGUgb2JqZWN0LFxuICAgKiBhbmQgbm93IHdlIHN1cHBvcnQgbWFueSBvcHRpb25zXG4gICAqXG4gICAqIEFycmF5XG4gICAqXG4gICAqIGJvZHk6IFt7XG4gICAqICAgZ3JvdXA6IHsgb2JqZWN0SWQ6ICckbmFtZScgfSxcbiAgICogfV1cbiAgICpcbiAgICogT2JqZWN0XG4gICAqXG4gICAqIGJvZHk6IHtcbiAgICogICBncm91cDogeyBvYmplY3RJZDogJyRuYW1lJyB9LFxuICAgKiB9XG4gICAqXG4gICAqXG4gICAqIFBpcGVsaW5lIE9wZXJhdG9yIHdpdGggYW4gQXJyYXkgb3IgYW4gT2JqZWN0XG4gICAqXG4gICAqIGJvZHk6IHtcbiAgICogICBwaXBlbGluZToge1xuICAgKiAgICAgZ3JvdXA6IHsgb2JqZWN0SWQ6ICckbmFtZScgfSxcbiAgICogICB9XG4gICAqIH1cbiAgICpcbiAgICovXG4gIHN0YXRpYyBnZXRQaXBlbGluZShib2R5KSB7XG4gICAgbGV0IHBpcGVsaW5lID0gYm9keS5waXBlbGluZSB8fCBib2R5O1xuICAgIGlmICghQXJyYXkuaXNBcnJheShwaXBlbGluZSkpIHtcbiAgICAgIHBpcGVsaW5lID0gT2JqZWN0LmtleXMocGlwZWxpbmUpLm1hcChrZXkgPT4ge1xuICAgICAgICByZXR1cm4geyBba2V5XTogcGlwZWxpbmVba2V5XSB9O1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHBpcGVsaW5lLm1hcChzdGFnZSA9PiB7XG4gICAgICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXMoc3RhZ2UpO1xuICAgICAgaWYgKGtleXMubGVuZ3RoICE9PSAxKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgIGBQaXBlbGluZSBzdGFnZXMgc2hvdWxkIG9ubHkgaGF2ZSBvbmUga2V5IGJ1dCBmb3VuZCAke2tleXMuam9pbignLCAnKX0uYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIEFnZ3JlZ2F0ZVJvdXRlci50cmFuc2Zvcm1TdGFnZShrZXlzWzBdLCBzdGFnZSk7XG4gICAgfSk7XG4gIH1cblxuICBzdGF0aWMgdHJhbnNmb3JtU3RhZ2Uoc3RhZ2VOYW1lLCBzdGFnZSkge1xuICAgIGNvbnN0IHNraXBLZXlzID0gWydkaXN0aW5jdCcsICd3aGVyZSddO1xuICAgIGlmIChza2lwS2V5cy5pbmNsdWRlcyhzdGFnZU5hbWUpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChzdGFnZU5hbWVbMF0gIT09ICckJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksIGBJbnZhbGlkIGFnZ3JlZ2F0ZSBzdGFnZSAnJHtzdGFnZU5hbWV9Jy5gKTtcbiAgICB9XG4gICAgaWYgKHN0YWdlTmFtZSA9PT0gJyRncm91cCcpIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoc3RhZ2Vbc3RhZ2VOYW1lXSwgJ29iamVjdElkJykpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgYENhbm5vdCB1c2UgJ29iamVjdElkJyBpbiBhZ2dyZWdhdGlvbiBzdGFnZSAkZ3JvdXAuYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoc3RhZ2Vbc3RhZ2VOYW1lXSwgJ19pZCcpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgIGBJbnZhbGlkIHBhcmFtZXRlciBmb3IgcXVlcnk6IGdyb3VwLiBNaXNzaW5nIGtleSBfaWRgXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB7IFtzdGFnZU5hbWVdOiBzdGFnZVtzdGFnZU5hbWVdIH07XG4gIH1cblxuICBtb3VudFJvdXRlcygpIHtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL2FnZ3JlZ2F0ZS86Y2xhc3NOYW1lJywgbWlkZGxld2FyZS5wcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUZpbmQocmVxKTtcbiAgICB9KTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBBZ2dyZWdhdGVSb3V0ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBd0M7QUFBQTtBQUFBO0FBRWpDLE1BQU1BLGVBQWUsU0FBU0Msc0JBQWEsQ0FBQztFQUNqREMsVUFBVSxDQUFDQyxHQUFHLEVBQUU7SUFDZCxNQUFNQyxJQUFJLEdBQUdDLE1BQU0sQ0FBQ0MsTUFBTSxDQUFDSCxHQUFHLENBQUNDLElBQUksRUFBRUgsc0JBQWEsQ0FBQ00sYUFBYSxDQUFDSixHQUFHLENBQUNLLEtBQUssQ0FBQyxDQUFDO0lBQzVFLE1BQU1DLE9BQU8sR0FBRyxDQUFDLENBQUM7SUFDbEIsSUFBSUwsSUFB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