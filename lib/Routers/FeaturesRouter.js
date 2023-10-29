"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FeaturesRouter = void 0;
var _package = require("../../package.json");
var _PromiseRouter = _interopRequireDefault(require("../PromiseRouter"));
var middleware = _interopRequireWildcard(require("../middlewares"));
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
class FeaturesRouter extends _PromiseRouter.default {
  mountRoutes() {
    this.route('GET', '/serverInfo', middleware.promiseEnforceMasterKeyAccess, req => {
      const {
        config
      } = req;
      const features = {
        globalConfig: {
          create: true,
          read: true,
          update: true,
          delete: true
        },
        hooks: {
          create: true,
          read: true,
          update: true,
          delete: true
        },
        cloudCode: {
          jobs: true
        },
        logs: {
          level: true,
          size: true,
          order: true,
          until: true,
          from: true
        },
        push: {
          immediatePush: config.hasPushSupport,
          scheduledPush: config.hasPushScheduledSupport,
          storedPushData: config.hasPushSupport,
          pushAudiences: true,
          localization: true
        },
        schemas: {
          addField: true,
          removeField: true,
          addClass: true,
          removeClass: true,
          clearAllDataFromClass: true,
          exportClass: false,
          editClassLevelPermissions: true,
          editPointerPermissions: true
        }
      };
      return {
        response: {
          features: features,
          parseServerVersion: _package.version
        }
      };
    });
  }
}
exports.FeaturesRouter = FeaturesRouter;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfcGFja2FnZSIsInJlcXVpcmUiLCJfUHJvbWlzZVJvdXRlciIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJtaWRkbGV3YXJlIiwiX2ludGVyb3BSZXF1aXJlV2lsZGNhcmQiLCJfZ2V0UmVxdWlyZVdpbGRjYXJkQ2FjaGUiLCJub2RlSW50ZXJvcCIsIldlYWtNYXAiLCJjYWNoZUJhYmVsSW50ZXJvcCIsImNhY2hlTm9kZUludGVyb3AiLCJvYmoiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsImNhY2hlIiwiaGFzIiwiZ2V0IiwibmV3T2JqIiwiaGFzUHJvcGVydHlEZXNjcmlwdG9yIiwiT2JqZWN0IiwiZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJrZXkiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJkZXNjIiwic2V0IiwiRmVhdHVyZXNSb3V0ZXIiLCJQcm9taXNlUm91dGVyIiwibW91bnRSb3V0ZXMiLCJyb3V0ZSIsInByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzIiwicmVxIiwiY29uZmlnIiwiZmVhdHVyZXMiLCJnbG9iYWxDb25maWciLCJjcmVhdGUiLCJyZWFkIiwidXBkYXRlIiwiZGVsZXRlIiwiaG9va3MiLCJjbG91ZENvZGUiLCJqb2JzIiwibG9ncyIsImxldmVsIiwic2l6ZSIsIm9yZGVyIiwidW50aWwiLCJmcm9tIiwicHVzaCIsImltbWVkaWF0ZVB1c2giLCJoYXNQdXNoU3VwcG9ydCIsInNjaGVkdWxlZFB1c2giLCJoYXNQdXNoU2NoZWR1bGVkU3VwcG9ydCIsInN0b3JlZFB1c2hEYXRhIiwicHVzaEF1ZGllbmNlcyIsImxvY2FsaXphdGlvbiIsInNjaGVtYXMiLCJhZGRGaWVsZCIsInJlbW92ZUZpZWxkIiwiYWRkQ2xhc3MiLCJyZW1vdmVDbGFzcyIsImNsZWFyQWxsRGF0YUZyb21DbGFzcyIsImV4cG9ydENsYXNzIiwiZWRpdENsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImVkaXRQb2ludGVyUGVybWlzc2lvbnMiLCJyZXNwb25zZSIsInBhcnNlU2VydmVyVmVyc2lvbiIsInZlcnNpb24iLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL1JvdXRlcnMvRmVhdHVyZXNSb3V0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgdmVyc2lvbiB9IGZyb20gJy4uLy4uL3BhY2thZ2UuanNvbic7XG5pbXBvcnQgUHJvbWlzZVJvdXRlciBmcm9tICcuLi9Qcm9taXNlUm91dGVyJztcbmltcG9ydCAqIGFzIG1pZGRsZXdhcmUgZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuXG5leHBvcnQgY2xhc3MgRmVhdHVyZXNSb3V0ZXIgZXh0ZW5kcyBQcm9taXNlUm91dGVyIHtcbiAgbW91bnRSb3V0ZXMoKSB7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy9zZXJ2ZXJJbmZvJywgbWlkZGxld2FyZS5wcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcywgcmVxID0+IHtcbiAgICAgIGNvbnN0IHsgY29uZmlnIH0gPSByZXE7XG4gICAgICBjb25zdCBmZWF0dXJlcyA9IHtcbiAgICAgICAgZ2xvYmFsQ29uZmlnOiB7XG4gICAgICAgICAgY3JlYXRlOiB0cnVlLFxuICAgICAgICAgIHJlYWQ6IHRydWUsXG4gICAgICAgICAgdXBkYXRlOiB0cnVlLFxuICAgICAgICAgIGRlbGV0ZTogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgaG9va3M6IHtcbiAgICAgICAgICBjcmVhdGU6IHRydWUsXG4gICAgICAgICAgcmVhZDogdHJ1ZSxcbiAgICAgICAgICB1cGRhdGU6IHRydWUsXG4gICAgICAgICAgZGVsZXRlOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBjbG91ZENvZGU6IHtcbiAgICAgICAgICBqb2JzOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBsb2dzOiB7XG4gICAgICAgICAgbGV2ZWw6IHRydWUsXG4gICAgICAgICAgc2l6ZTogdHJ1ZSxcbiAgICAgICAgICBvcmRlcjogdHJ1ZSxcbiAgICAgICAgICB1bnRpbDogdHJ1ZSxcbiAgICAgICAgICBmcm9tOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBwdXNoOiB7XG4gICAgICAgICAgaW1tZWRpYXRlUHVzaDogY29uZmlnLmhhc1B1c2hTdXBwb3J0LFxuICAgICAgICAgIHNjaGVkdWxlZFB1c2g6IGNvbmZpZy5oYXNQdXNoU2NoZWR1bGVkU3VwcG9ydCxcbiAgICAgICAgICBzdG9yZWRQdXNoRGF0YTogY29uZmlnLmhhc1B1c2hTdXBwb3J0LFxuICAgICAgICAgIHB1c2hBdWRpZW5jZXM6IHRydWUsXG4gICAgICAgICAgbG9jYWxpemF0aW9uOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBzY2hlbWFzOiB7XG4gICAgICAgICAgYWRkRmllbGQ6IHRydWUsXG4gICAgICAgICAgcmVtb3ZlRmllbGQ6IHRydWUsXG4gICAgICAgICAgYWRkQ2xhc3M6IHRydWUsXG4gICAgICAgICAgcmVtb3ZlQ2xhc3M6IHRydWUsXG4gICAgICAgICAgY2xlYXJBbGxEYXRhRnJvbUNsYXNzOiB0cnVlLFxuICAgICAgICAgIGV4cG9ydENsYXNzOiBmYWxzZSxcbiAgICAgICAgICBlZGl0Q2xhc3NMZXZlbFBlcm1pc3Npb25zOiB0cnVlLFxuICAgICAgICAgIGVkaXRQb2ludGVyUGVybWlzc2lvbnM6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICB9O1xuXG4gICAgICByZXR1cm4ge1xuICAgICAgICByZXNwb25zZToge1xuICAgICAgICAgIGZlYXR1cmVzOiBmZWF0dXJlcyxcbiAgICAgICAgICBwYXJzZVNlcnZlclZlcnNpb246IHZlcnNpb24sXG4gICAgICAgIH0sXG4gICAgICB9O1xuICAgIH0pO1xuICB9XG59XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLElBQUFBLFFBQUEsR0FBQUMsT0FBQTtBQUNBLElBQUFDLGNBQUEsR0FBQUMsc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFHLFVBQUEsR0FBQUMsdUJBQUEsQ0FBQUos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