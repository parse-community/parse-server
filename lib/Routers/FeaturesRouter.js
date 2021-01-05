"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FeaturesRouter = void 0;

var _package = require("../../package.json");

var _PromiseRouter = _interopRequireDefault(require("../PromiseRouter"));

var middleware = _interopRequireWildcard(require("../middlewares"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0ZlYXR1cmVzUm91dGVyLmpzIl0sIm5hbWVzIjpbIkZlYXR1cmVzUm91dGVyIiwiUHJvbWlzZVJvdXRlciIsIm1vdW50Um91dGVzIiwicm91dGUiLCJtaWRkbGV3YXJlIiwicHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MiLCJyZXEiLCJjb25maWciLCJmZWF0dXJlcyIsImdsb2JhbENvbmZpZyIsImNyZWF0ZSIsInJlYWQiLCJ1cGRhdGUiLCJkZWxldGUiLCJob29rcyIsImNsb3VkQ29kZSIsImpvYnMiLCJsb2dzIiwibGV2ZWwiLCJzaXplIiwib3JkZXIiLCJ1bnRpbCIsImZyb20iLCJwdXNoIiwiaW1tZWRpYXRlUHVzaCIsImhhc1B1c2hTdXBwb3J0Iiwic2NoZWR1bGVkUHVzaCIsImhhc1B1c2hTY2hlZHVsZWRTdXBwb3J0Iiwic3RvcmVkUHVzaERhdGEiLCJwdXNoQXVkaWVuY2VzIiwibG9jYWxpemF0aW9uIiwic2NoZW1hcyIsImFkZEZpZWxkIiwicmVtb3ZlRmllbGQiLCJhZGRDbGFzcyIsInJlbW92ZUNsYXNzIiwiY2xlYXJBbGxEYXRhRnJvbUNsYXNzIiwiZXhwb3J0Q2xhc3MiLCJlZGl0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiZWRpdFBvaW50ZXJQZXJtaXNzaW9ucyIsInJlc3BvbnNlIiwicGFyc2VTZXJ2ZXJWZXJzaW9uIiwidmVyc2lvbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOzs7Ozs7OztBQUVPLE1BQU1BLGNBQU4sU0FBNkJDLHNCQUE3QixDQUEyQztBQUNoREMsRUFBQUEsV0FBVyxHQUFHO0FBQ1osU0FBS0MsS0FBTCxDQUFXLEtBQVgsRUFBa0IsYUFBbEIsRUFBaUNDLFVBQVUsQ0FBQ0MsNkJBQTVDLEVBQTJFQyxHQUFHLElBQUk7QUFDaEYsWUFBTTtBQUFFQyxRQUFBQTtBQUFGLFVBQWFELEdBQW5CO0FBQ0EsWUFBTUUsUUFBUSxHQUFHO0FBQ2ZDLFFBQUFBLFlBQVksRUFBRTtBQUNaQyxVQUFBQSxNQUFNLEVBQUUsSUFESTtBQUVaQyxVQUFBQSxJQUFJLEVBQUUsSUFGTTtBQUdaQyxVQUFBQSxNQUFNLEVBQUUsSUFISTtBQUlaQyxVQUFBQSxNQUFNLEVBQUU7QUFKSSxTQURDO0FBT2ZDLFFBQUFBLEtBQUssRUFBRTtBQUNMSixVQUFBQSxNQUFNLEVBQUUsSUFESDtBQUVMQyxVQUFBQSxJQUFJLEVBQUUsSUFGRDtBQUdMQyxVQUFBQSxNQUFNLEVBQUUsSUFISDtBQUlMQyxVQUFBQSxNQUFNLEVBQUU7QUFKSCxTQVBRO0FBYWZFLFFBQUFBLFNBQVMsRUFBRTtBQUNUQyxVQUFBQSxJQUFJLEVBQUU7QUFERyxTQWJJO0FBZ0JmQyxRQUFBQSxJQUFJLEVBQUU7QUFDSkMsVUFBQUEsS0FBSyxFQUFFLElBREg7QUFFSkMsVUFBQUEsSUFBSSxFQUFFLElBRkY7QUFHSkMsVUFBQUEsS0FBSyxFQUFFLElBSEg7QUFJSkMsVUFBQUEsS0FBSyxFQUFFLElBSkg7QUFLSkMsVUFBQUEsSUFBSSxFQUFFO0FBTEYsU0FoQlM7QUF1QmZDLFFBQUFBLElBQUksRUFBRTtBQUNKQyxVQUFBQSxhQUFhLEVBQUVqQixNQUFNLENBQUNrQixjQURsQjtBQUVKQyxVQUFBQSxhQUFhLEVBQUVuQixNQUFNLENBQUNvQix1QkFGbEI7QUFHSkMsVUFBQUEsY0FBYyxFQUFFckIsTUFBTSxDQUFDa0IsY0FIbkI7QUFJSkksVUFBQUEsYUFBYSxFQUFFLElBSlg7QUFLSkMsVUFBQUEsWUFBWSxFQUFFO0FBTFYsU0F2QlM7QUE4QmZDLFFBQUFBLE9BQU8sRUFBRTtBQUNQQyxVQUFBQSxRQUFRLEVBQUUsSUFESDtBQUVQQyxVQUFBQSxXQUFXLEVBQUUsSUFGTjtBQUdQQyxVQUFBQSxRQUFRLEVBQUUsSUFISDtBQUlQQyxVQUFBQSxXQUFXLEVBQUUsSUFKTjtBQUtQQyxVQUFBQSxxQkFBcUIsRUFBRSxJQUxoQjtBQU1QQyxVQUFBQSxXQUFXLEVBQUUsS0FOTjtBQU9QQyxVQUFBQSx5QkFBeUIsRUFBRSxJQVBwQjtBQVFQQyxVQUFBQSxzQkFBc0IsRUFBRTtBQVJqQjtBQTlCTSxPQUFqQjtBQTBDQSxhQUFPO0FBQ0xDLFFBQUFBLFFBQVEsRUFBRTtBQUNSaEMsVUFBQUEsUUFBUSxFQUFFQSxRQURGO0FBRVJpQyxVQUFBQSxrQkFBa0IsRUFBRUM7QUFGWjtBQURMLE9BQVA7QUFNRCxLQWxERDtBQW1ERDs7QUFyRCtDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgdmVyc2lvbiB9IGZyb20gJy4uLy4uL3BhY2thZ2UuanNvbic7XG5pbXBvcnQgUHJvbWlzZVJvdXRlciBmcm9tICcuLi9Qcm9taXNlUm91dGVyJztcbmltcG9ydCAqIGFzIG1pZGRsZXdhcmUgZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuXG5leHBvcnQgY2xhc3MgRmVhdHVyZXNSb3V0ZXIgZXh0ZW5kcyBQcm9taXNlUm91dGVyIHtcbiAgbW91bnRSb3V0ZXMoKSB7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy9zZXJ2ZXJJbmZvJywgbWlkZGxld2FyZS5wcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcywgcmVxID0+IHtcbiAgICAgIGNvbnN0IHsgY29uZmlnIH0gPSByZXE7XG4gICAgICBjb25zdCBmZWF0dXJlcyA9IHtcbiAgICAgICAgZ2xvYmFsQ29uZmlnOiB7XG4gICAgICAgICAgY3JlYXRlOiB0cnVlLFxuICAgICAgICAgIHJlYWQ6IHRydWUsXG4gICAgICAgICAgdXBkYXRlOiB0cnVlLFxuICAgICAgICAgIGRlbGV0ZTogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgaG9va3M6IHtcbiAgICAgICAgICBjcmVhdGU6IHRydWUsXG4gICAgICAgICAgcmVhZDogdHJ1ZSxcbiAgICAgICAgICB1cGRhdGU6IHRydWUsXG4gICAgICAgICAgZGVsZXRlOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBjbG91ZENvZGU6IHtcbiAgICAgICAgICBqb2JzOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBsb2dzOiB7XG4gICAgICAgICAgbGV2ZWw6IHRydWUsXG4gICAgICAgICAgc2l6ZTogdHJ1ZSxcbiAgICAgICAgICBvcmRlcjogdHJ1ZSxcbiAgICAgICAgICB1bnRpbDogdHJ1ZSxcbiAgICAgICAgICBmcm9tOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBwdXNoOiB7XG4gICAgICAgICAgaW1tZWRpYXRlUHVzaDogY29uZmlnLmhhc1B1c2hTdXBwb3J0LFxuICAgICAgICAgIHNjaGVkdWxlZFB1c2g6IGNvbmZpZy5oYXNQdXNoU2NoZWR1bGVkU3VwcG9ydCxcbiAgICAgICAgICBzdG9yZWRQdXNoRGF0YTogY29uZmlnLmhhc1B1c2hTdXBwb3J0LFxuICAgICAgICAgIHB1c2hBdWRpZW5jZXM6IHRydWUsXG4gICAgICAgICAgbG9jYWxpemF0aW9uOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBzY2hlbWFzOiB7XG4gICAgICAgICAgYWRkRmllbGQ6IHRydWUsXG4gICAgICAgICAgcmVtb3ZlRmllbGQ6IHRydWUsXG4gICAgICAgICAgYWRkQ2xhc3M6IHRydWUsXG4gICAgICAgICAgcmVtb3ZlQ2xhc3M6IHRydWUsXG4gICAgICAgICAgY2xlYXJBbGxEYXRhRnJvbUNsYXNzOiB0cnVlLFxuICAgICAgICAgIGV4cG9ydENsYXNzOiBmYWxzZSxcbiAgICAgICAgICBlZGl0Q2xhc3NMZXZlbFBlcm1pc3Npb25zOiB0cnVlLFxuICAgICAgICAgIGVkaXRQb2ludGVyUGVybWlzc2lvbnM6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICB9O1xuXG4gICAgICByZXR1cm4ge1xuICAgICAgICByZXNwb25zZToge1xuICAgICAgICAgIGZlYXR1cmVzOiBmZWF0dXJlcyxcbiAgICAgICAgICBwYXJzZVNlcnZlclZlcnNpb246IHZlcnNpb24sXG4gICAgICAgIH0sXG4gICAgICB9O1xuICAgIH0pO1xuICB9XG59XG4iXX0=