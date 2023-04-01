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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJBZ2dyZWdhdGVSb3V0ZXIiLCJDbGFzc2VzUm91dGVyIiwiaGFuZGxlRmluZCIsInJlcSIsImJvZHkiLCJPYmplY3QiLCJhc3NpZ24iLCJKU09ORnJvbVF1ZXJ5IiwicXVlcnkiLCJvcHRpb25zIiwiZGlzdGluY3QiLCJTdHJpbmciLCJoaW50IiwiZXhwbGFpbiIsInJlYWRQcmVmZXJlbmNlIiwicGlwZWxpbmUiLCJnZXRQaXBlbGluZSIsIndoZXJlIiwiSlNPTiIsInBhcnNlIiwicmVzdCIsImZpbmQiLCJjb25maWciLCJhdXRoIiwiY2xhc3NOYW1lIiwiaW5mbyIsImNsaWVudFNESyIsImNvbnRleHQiLCJ0aGVuIiwicmVzcG9uc2UiLCJyZXN1bHQiLCJyZXN1bHRzIiwiVXNlcnNSb3V0ZXIiLCJyZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzIiwiQXJyYXkiLCJpc0FycmF5Iiwia2V5cyIsIm1hcCIsImtleSIsInN0YWdlIiwibGVuZ3RoIiwiRXJyb3IiLCJqb2luIiwidHJhbnNmb3JtU3RhZ2UiLCJzdGFnZU5hbWUiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJEZXByZWNhdG9yIiwibG9nUnVudGltZURlcHJlY2F0aW9uIiwidXNhZ2UiLCJzb2x1dGlvbiIsIl9pZCIsIm9iamVjdElkIiwiUGFyc2UiLCJJTlZBTElEX1FVRVJZIiwibW91bnRSb3V0ZXMiLCJyb3V0ZSIsIm1pZGRsZXdhcmUiLCJwcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0FnZ3JlZ2F0ZVJvdXRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgQ2xhc3Nlc1JvdXRlciBmcm9tICcuL0NsYXNzZXNSb3V0ZXInO1xuaW1wb3J0IHJlc3QgZnJvbSAnLi4vcmVzdCc7XG5pbXBvcnQgKiBhcyBtaWRkbGV3YXJlIGZyb20gJy4uL21pZGRsZXdhcmVzJztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBVc2Vyc1JvdXRlciBmcm9tICcuL1VzZXJzUm91dGVyJztcbmltcG9ydCBEZXByZWNhdG9yIGZyb20gJy4uL0RlcHJlY2F0b3IvRGVwcmVjYXRvcic7XG5cbmV4cG9ydCBjbGFzcyBBZ2dyZWdhdGVSb3V0ZXIgZXh0ZW5kcyBDbGFzc2VzUm91dGVyIHtcbiAgaGFuZGxlRmluZChyZXEpIHtcbiAgICBjb25zdCBib2R5ID0gT2JqZWN0LmFzc2lnbihyZXEuYm9keSwgQ2xhc3Nlc1JvdXRlci5KU09ORnJvbVF1ZXJ5KHJlcS5xdWVyeSkpO1xuICAgIGNvbnN0IG9wdGlvbnMgPSB7fTtcbiAgICBpZiAoYm9keS5kaXN0aW5jdCkge1xuICAgICAgb3B0aW9ucy5kaXN0aW5jdCA9IFN0cmluZyhib2R5LmRpc3RpbmN0KTtcbiAgICB9XG4gICAgaWYgKGJvZHkuaGludCkge1xuICAgICAgb3B0aW9ucy5oaW50ID0gYm9keS5oaW50O1xuICAgICAgZGVsZXRlIGJvZHkuaGludDtcbiAgICB9XG4gICAgaWYgKGJvZHkuZXhwbGFpbikge1xuICAgICAgb3B0aW9ucy5leHBsYWluID0gYm9keS5leHBsYWluO1xuICAgICAgZGVsZXRlIGJvZHkuZXhwbGFpbjtcbiAgICB9XG4gICAgaWYgKGJvZHkucmVhZFByZWZlcmVuY2UpIHtcbiAgICAgIG9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSBib2R5LnJlYWRQcmVmZXJlbmNlO1xuICAgICAgZGVsZXRlIGJvZHkucmVhZFByZWZlcmVuY2U7XG4gICAgfVxuICAgIG9wdGlvbnMucGlwZWxpbmUgPSBBZ2dyZWdhdGVSb3V0ZXIuZ2V0UGlwZWxpbmUoYm9keSk7XG4gICAgaWYgKHR5cGVvZiBib2R5LndoZXJlID09PSAnc3RyaW5nJykge1xuICAgICAgYm9keS53aGVyZSA9IEpTT04ucGFyc2UoYm9keS53aGVyZSk7XG4gICAgfVxuICAgIHJldHVybiByZXN0XG4gICAgICAuZmluZChcbiAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgcmVxLmF1dGgsXG4gICAgICAgIHRoaXMuY2xhc3NOYW1lKHJlcSksXG4gICAgICAgIGJvZHkud2hlcmUsXG4gICAgICAgIG9wdGlvbnMsXG4gICAgICAgIHJlcS5pbmZvLmNsaWVudFNESyxcbiAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICBmb3IgKGNvbnN0IHJlc3VsdCBvZiByZXNwb25zZS5yZXN1bHRzKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBVc2Vyc1JvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKHJlc3VsdCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHJlc3BvbnNlIH07XG4gICAgICB9KTtcbiAgfVxuXG4gIC8qIEJ1aWxkcyBhIHBpcGVsaW5lIGZyb20gdGhlIGJvZHkuIE9yaWdpbmFsbHkgdGhlIGJvZHkgY291bGQgYmUgcGFzc2VkIGFzIGEgc2luZ2xlIG9iamVjdCxcbiAgICogYW5kIG5vdyB3ZSBzdXBwb3J0IG1hbnkgb3B0aW9uc1xuICAgKlxuICAgKiBBcnJheVxuICAgKlxuICAgKiBib2R5OiBbe1xuICAgKiAgIGdyb3VwOiB7IG9iamVjdElkOiAnJG5hbWUnIH0sXG4gICAqIH1dXG4gICAqXG4gICAqIE9iamVjdFxuICAgKlxuICAgKiBib2R5OiB7XG4gICAqICAgZ3JvdXA6IHsgb2JqZWN0SWQ6ICckbmFtZScgfSxcbiAgICogfVxuICAgKlxuICAgKlxuICAgKiBQaXBlbGluZSBPcGVyYXRvciB3aXRoIGFuIEFycmF5IG9yIGFuIE9iamVjdFxuICAgKlxuICAgKiBib2R5OiB7XG4gICAqICAgcGlwZWxpbmU6IHtcbiAgICogICAgIGdyb3VwOiB7IG9iamVjdElkOiAnJG5hbWUnIH0sXG4gICAqICAgfVxuICAgKiB9XG4gICAqXG4gICAqL1xuICBzdGF0aWMgZ2V0UGlwZWxpbmUoYm9keSkge1xuICAgIGxldCBwaXBlbGluZSA9IGJvZHkucGlwZWxpbmUgfHwgYm9keTtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkocGlwZWxpbmUpKSB7XG4gICAgICBwaXBlbGluZSA9IE9iamVjdC5rZXlzKHBpcGVsaW5lKS5tYXAoa2V5ID0+IHtcbiAgICAgICAgcmV0dXJuIHsgW2tleV06IHBpcGVsaW5lW2tleV0gfTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBwaXBlbGluZS5tYXAoc3RhZ2UgPT4ge1xuICAgICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHN0YWdlKTtcbiAgICAgIGlmIChrZXlzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgUGlwZWxpbmUgc3RhZ2VzIHNob3VsZCBvbmx5IGhhdmUgb25lIGtleSBmb3VuZCAke2tleXMuam9pbignLCAnKX1gKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBBZ2dyZWdhdGVSb3V0ZXIudHJhbnNmb3JtU3RhZ2Uoa2V5c1swXSwgc3RhZ2UpO1xuICAgIH0pO1xuICB9XG5cbiAgc3RhdGljIHRyYW5zZm9ybVN0YWdlKHN0YWdlTmFtZSwgc3RhZ2UpIHtcbiAgICBpZiAoc3RhZ2VOYW1lID09PSAnZ3JvdXAnKSB7XG4gICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHN0YWdlW3N0YWdlTmFtZV0sICdvYmplY3RJZCcpKSB7XG4gICAgICAgIERlcHJlY2F0b3IubG9nUnVudGltZURlcHJlY2F0aW9uKHtcbiAgICAgICAgICB1c2FnZTogJ1RoZSB1c2Ugb2Ygb2JqZWN0SWQgaW4gYWdncmVnYXRpb24gc3RhZ2UgJGdyb3VwJyxcbiAgICAgICAgICBzb2x1dGlvbjogJ1VzZSBfaWQgaW5zdGVhZC4nLFxuICAgICAgICB9KTtcbiAgICAgICAgc3RhZ2Vbc3RhZ2VOYW1lXS5faWQgPSBzdGFnZVtzdGFnZU5hbWVdLm9iamVjdElkO1xuICAgICAgICBkZWxldGUgc3RhZ2Vbc3RhZ2VOYW1lXS5vYmplY3RJZDtcbiAgICAgIH1cbiAgICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHN0YWdlW3N0YWdlTmFtZV0sICdfaWQnKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICBgSW52YWxpZCBwYXJhbWV0ZXIgZm9yIHF1ZXJ5OiBncm91cC4gTWlzc2luZyBrZXkgX2lkYFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChzdGFnZU5hbWVbMF0gIT09ICckJykge1xuICAgICAgRGVwcmVjYXRvci5sb2dSdW50aW1lRGVwcmVjYXRpb24oe1xuICAgICAgICB1c2FnZTogXCJVc2luZyBhZ2dyZWdhdGlvbiBzdGFnZXMgd2l0aG91dCBhIGxlYWRpbmcgJyQnXCIsXG4gICAgICAgIHNvbHV0aW9uOiBgVHJ5ICQke3N0YWdlTmFtZX0gaW5zdGVhZC5gLFxuICAgICAgfSk7XG4gICAgfVxuICAgIGNvbnN0IGtleSA9IHN0YWdlTmFtZVswXSA9PT0gJyQnID8gc3RhZ2VOYW1lIDogYCQke3N0YWdlTmFtZX1gO1xuICAgIHJldHVybiB7IFtrZXldOiBzdGFnZVtzdGFnZU5hbWVdIH07XG4gIH1cblxuICBtb3VudFJvdXRlcygpIHtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL2FnZ3JlZ2F0ZS86Y2xhc3NOYW1lJywgbWlkZGxld2FyZS5wcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUZpbmQocmVxKTtcbiAgICB9KTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBBZ2dyZWdhdGVSb3V0ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFrRDtBQUFBO0FBQUE7QUFFM0MsTUFBTUEsZUFBZSxTQUFTQyxzQkFBYSxDQUFDO0VBQ2pE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