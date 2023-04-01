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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJGZWF0dXJlc1JvdXRlciIsIlByb21pc2VSb3V0ZXIiLCJtb3VudFJvdXRlcyIsInJvdXRlIiwibWlkZGxld2FyZSIsInByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzIiwicmVxIiwiY29uZmlnIiwiZmVhdHVyZXMiLCJnbG9iYWxDb25maWciLCJjcmVhdGUiLCJyZWFkIiwidXBkYXRlIiwiZGVsZXRlIiwiaG9va3MiLCJjbG91ZENvZGUiLCJqb2JzIiwibG9ncyIsImxldmVsIiwic2l6ZSIsIm9yZGVyIiwidW50aWwiLCJmcm9tIiwicHVzaCIsImltbWVkaWF0ZVB1c2giLCJoYXNQdXNoU3VwcG9ydCIsInNjaGVkdWxlZFB1c2giLCJoYXNQdXNoU2NoZWR1bGVkU3VwcG9ydCIsInN0b3JlZFB1c2hEYXRhIiwicHVzaEF1ZGllbmNlcyIsImxvY2FsaXphdGlvbiIsInNjaGVtYXMiLCJhZGRGaWVsZCIsInJlbW92ZUZpZWxkIiwiYWRkQ2xhc3MiLCJyZW1vdmVDbGFzcyIsImNsZWFyQWxsRGF0YUZyb21DbGFzcyIsImV4cG9ydENsYXNzIiwiZWRpdENsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImVkaXRQb2ludGVyUGVybWlzc2lvbnMiLCJyZXNwb25zZSIsInBhcnNlU2VydmVyVmVyc2lvbiIsInZlcnNpb24iXSwic291cmNlcyI6WyIuLi8uLi9zcmMvUm91dGVycy9GZWF0dXJlc1JvdXRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyB2ZXJzaW9uIH0gZnJvbSAnLi4vLi4vcGFja2FnZS5qc29uJztcbmltcG9ydCBQcm9taXNlUm91dGVyIGZyb20gJy4uL1Byb21pc2VSb3V0ZXInO1xuaW1wb3J0ICogYXMgbWlkZGxld2FyZSBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5cbmV4cG9ydCBjbGFzcyBGZWF0dXJlc1JvdXRlciBleHRlbmRzIFByb21pc2VSb3V0ZXIge1xuICBtb3VudFJvdXRlcygpIHtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3NlcnZlckluZm8nLCBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLCByZXEgPT4ge1xuICAgICAgY29uc3QgeyBjb25maWcgfSA9IHJlcTtcbiAgICAgIGNvbnN0IGZlYXR1cmVzID0ge1xuICAgICAgICBnbG9iYWxDb25maWc6IHtcbiAgICAgICAgICBjcmVhdGU6IHRydWUsXG4gICAgICAgICAgcmVhZDogdHJ1ZSxcbiAgICAgICAgICB1cGRhdGU6IHRydWUsXG4gICAgICAgICAgZGVsZXRlOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBob29rczoge1xuICAgICAgICAgIGNyZWF0ZTogdHJ1ZSxcbiAgICAgICAgICByZWFkOiB0cnVlLFxuICAgICAgICAgIHVwZGF0ZTogdHJ1ZSxcbiAgICAgICAgICBkZWxldGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIGNsb3VkQ29kZToge1xuICAgICAgICAgIGpvYnM6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIGxvZ3M6IHtcbiAgICAgICAgICBsZXZlbDogdHJ1ZSxcbiAgICAgICAgICBzaXplOiB0cnVlLFxuICAgICAgICAgIG9yZGVyOiB0cnVlLFxuICAgICAgICAgIHVudGlsOiB0cnVlLFxuICAgICAgICAgIGZyb206IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIHB1c2g6IHtcbiAgICAgICAgICBpbW1lZGlhdGVQdXNoOiBjb25maWcuaGFzUHVzaFN1cHBvcnQsXG4gICAgICAgICAgc2NoZWR1bGVkUHVzaDogY29uZmlnLmhhc1B1c2hTY2hlZHVsZWRTdXBwb3J0LFxuICAgICAgICAgIHN0b3JlZFB1c2hEYXRhOiBjb25maWcuaGFzUHVzaFN1cHBvcnQsXG4gICAgICAgICAgcHVzaEF1ZGllbmNlczogdHJ1ZSxcbiAgICAgICAgICBsb2NhbGl6YXRpb246IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIHNjaGVtYXM6IHtcbiAgICAgICAgICBhZGRGaWVsZDogdHJ1ZSxcbiAgICAgICAgICByZW1vdmVGaWVsZDogdHJ1ZSxcbiAgICAgICAgICBhZGRDbGFzczogdHJ1ZSxcbiAgICAgICAgICByZW1vdmVDbGFzczogdHJ1ZSxcbiAgICAgICAgICBjbGVhckFsbERhdGFGcm9tQ2xhc3M6IHRydWUsXG4gICAgICAgICAgZXhwb3J0Q2xhc3M6IGZhbHNlLFxuICAgICAgICAgIGVkaXRDbGFzc0xldmVsUGVybWlzc2lvbnM6IHRydWUsXG4gICAgICAgICAgZWRpdFBvaW50ZXJQZXJtaXNzaW9uczogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgIH07XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIHJlc3BvbnNlOiB7XG4gICAgICAgICAgZmVhdHVyZXM6IGZlYXR1cmVzLFxuICAgICAgICAgIHBhcnNlU2VydmVyVmVyc2lvbjogdmVyc2lvbixcbiAgICAgICAgfSxcbiAgICAgIH07XG4gICAgfSk7XG4gIH1cbn1cbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUE7QUFDQTtBQUNBO0FBQTZDO0FBQUE7QUFBQTtBQUV0QyxNQUFNQSxjQUFjLFNBQVNDLHNCQUFhLENBQUM7RUFDaERDLFdBQVcsR0FBRztJQUNaLElBQUksQ0FBQ0MsS0FBSyxDQUFDLEtBQUssRUFBRSxhQUFhLEVBQUVDLFVBQVUsQ0FBQ0MsNkJBQTZCLEVBQUVDLEdBQUcsSUFBSTtNQUNoRixNQUFNO1FBQUVDO01BQU8sQ0FBQyxHQUFHRCxHQUFHO01BQ3RCLE1BQU1FLFFBQVEsR0FBRztRQUNmQyxZQUFZLEVBQUU7VUFDWkMsTUFBTSxFQUFFLElBQUk7VUFDWkMsSUFBSSxFQUFFLElBQUk7VUFDVkMsTUFBTSxFQUFFLElBQUk7VUFDWkMsTUFBTSxFQUFFO1FBQ1YsQ0FBQztRQUNEQyxLQUFLLEVBQUU7VUFDTEosTUFBTSxFQUFFLElBQUk7VUFDWkMsSUFBSSxFQUFFLElBQUk7VUFDVkMsTUFBTSxFQUFFLElBQUk7VUFDWkMsTUFBTSxFQUFFO1FBQ1YsQ0FBQztRQUNERSxTQUFTLEVBQUU7VUFDVEMsSUFBSSxFQUFFO1FBQ1IsQ0FBQztRQUNEQyxJQUFJLEVBQUU7VUFDSkMsS0FBSyxFQUFFLElBQUk7VUFDWEMsSUFBSSxFQUFFLElBQUk7VUFDVkMsS0FBSyxFQUFFLElBQUk7VUFDWEMsS0FBSyxFQUFFLElBQUk7VUFDWEMsSUFBSSxFQUFFO1FBQ1IsQ0FBQztRQUNEQyxJQUFJLEVBQUU7VUFDSkMsYUFBYSxFQUFFakIsTUFBTSxDQUFDa0IsY0FBYztVQUNwQ0MsYUFBYSxFQUFFbkIsTUFBTSxDQUFDb0IsdUJBQXVCO1VBQzdDQyxjQUFjLEVBQUVyQixNQUFNLENBQUNrQixjQUFjO1VBQ3JDSSxhQUFhLEVBQUUsSUFBSTtVQUNuQkMsWUFBWSxFQUFFO1FBQ2hCLENBQUM7UUFDREMsT0FBTyxFQUFFO1VBQ1BDLFFBQVEsRUFBRSxJQUFJO1VBQ2RDLFdBQVcsRUFBRSxJQUFJO1VBQ2pCQyxRQUFRLEVBQUUsSUFBSTtVQUNkQyxXQUFXLEVBQUUsSUFBSTtVQUNqQkMscUJBQXFCLEVBQUUsSUFBSTtVQUMzQkMsV0FBVyxFQUFFLEtBQUs7VUFDbEJDLHlCQUF5QixFQUFFLElBQUk7VUFDL0JDLHNCQUFzQixFQUFFO1FBQzFCO01BQ0YsQ0FBQztNQUVELE9BQU87UUFDTEMsUUFBUSxFQUFFO1VBQ1JoQyxRQUFRLEVBQUVBLFFBQVE7VUFDbEJpQyxrQkFBa0IsRUFBRUM7UUFDdEI7TUFDRixDQUFDO0lBQ0gsQ0FBQyxDQUFDO0VBQ0o7QUFDRjtBQUFDIn0=