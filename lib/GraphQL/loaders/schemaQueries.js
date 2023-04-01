"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = exports.getClass = void 0;
var _node = _interopRequireDefault(require("parse/node"));
var _deepcopy = _interopRequireDefault(require("deepcopy"));
var _graphql = require("graphql");
var _schemaFields = require("../transformers/schemaFields");
var schemaTypes = _interopRequireWildcard(require("./schemaTypes"));
var _parseGraphQLUtils = require("../parseGraphQLUtils");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const getClass = async (name, schema) => {
  try {
    return await schema.getOneSchema(name, true);
  } catch (e) {
    if (e === undefined) {
      throw new _node.default.Error(_node.default.Error.INVALID_CLASS_NAME, `Class ${name} does not exist.`);
    } else {
      throw new _node.default.Error(_node.default.Error.INTERNAL_SERVER_ERROR, 'Database adapter error.');
    }
  }
};
exports.getClass = getClass;
const load = parseGraphQLSchema => {
  parseGraphQLSchema.addGraphQLQuery('class', {
    description: 'The class query can be used to retrieve an existing object class.',
    args: {
      name: schemaTypes.CLASS_NAME_ATT
    },
    type: new _graphql.GraphQLNonNull(schemaTypes.CLASS),
    resolve: async (_source, args, context) => {
      try {
        const {
          name
        } = (0, _deepcopy.default)(args);
        const {
          config,
          auth
        } = context;
        (0, _parseGraphQLUtils.enforceMasterKeyAccess)(auth);
        const schema = await config.database.loadSchema({
          clearCache: true
        });
        const parseClass = await getClass(name, schema);
        return {
          name: parseClass.className,
          schemaFields: (0, _schemaFields.transformToGraphQL)(parseClass.fields)
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  }, true, true);
  parseGraphQLSchema.addGraphQLQuery('classes', {
    description: 'The classes query can be used to retrieve the existing object classes.',
    type: new _graphql.GraphQLNonNull(new _graphql.GraphQLList(new _graphql.GraphQLNonNull(schemaTypes.CLASS))),
    resolve: async (_source, _args, context) => {
      try {
        const {
          config,
          auth
        } = context;
        (0, _parseGraphQLUtils.enforceMasterKeyAccess)(auth);
        const schema = await config.database.loadSchema({
          clearCache: true
        });
        return (await schema.getAllClasses(true)).map(parseClass => ({
          name: parseClass.className,
          schemaFields: (0, _schemaFields.transformToGraphQL)(parseClass.fields)
        }));
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  }, true, true);
};
exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJnZXRDbGFzcyIsIm5hbWUiLCJzY2hlbWEiLCJnZXRPbmVTY2hlbWEiLCJlIiwidW5kZWZpbmVkIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfQ0xBU1NfTkFNRSIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJhZGRHcmFwaFFMUXVlcnkiLCJkZXNjcmlwdGlvbiIsImFyZ3MiLCJzY2hlbWFUeXBlcyIsIkNMQVNTX05BTUVfQVRUIiwidHlwZSIsIkdyYXBoUUxOb25OdWxsIiwiQ0xBU1MiLCJyZXNvbHZlIiwiX3NvdXJjZSIsImNvbnRleHQiLCJkZWVwY29weSIsImNvbmZpZyIsImF1dGgiLCJlbmZvcmNlTWFzdGVyS2V5QWNjZXNzIiwiZGF0YWJhc2UiLCJsb2FkU2NoZW1hIiwiY2xlYXJDYWNoZSIsInBhcnNlQ2xhc3MiLCJjbGFzc05hbWUiLCJzY2hlbWFGaWVsZHMiLCJ0cmFuc2Zvcm1Ub0dyYXBoUUwiLCJmaWVsZHMiLCJoYW5kbGVFcnJvciIsIkdyYXBoUUxMaXN0IiwiX2FyZ3MiLCJnZXRBbGxDbGFzc2VzIiwibWFwIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0dyYXBoUUwvbG9hZGVycy9zY2hlbWFRdWVyaWVzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBkZWVwY29weSBmcm9tICdkZWVwY29weSc7XG5pbXBvcnQgeyBHcmFwaFFMTm9uTnVsbCwgR3JhcGhRTExpc3QgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IHRyYW5zZm9ybVRvR3JhcGhRTCB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9zY2hlbWFGaWVsZHMnO1xuaW1wb3J0ICogYXMgc2NoZW1hVHlwZXMgZnJvbSAnLi9zY2hlbWFUeXBlcyc7XG5pbXBvcnQgeyBlbmZvcmNlTWFzdGVyS2V5QWNjZXNzIH0gZnJvbSAnLi4vcGFyc2VHcmFwaFFMVXRpbHMnO1xuXG5jb25zdCBnZXRDbGFzcyA9IGFzeW5jIChuYW1lLCBzY2hlbWEpID0+IHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gYXdhaXQgc2NoZW1hLmdldE9uZVNjaGVtYShuYW1lLCB0cnVlKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGlmIChlID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsIGBDbGFzcyAke25hbWV9IGRvZXMgbm90IGV4aXN0LmApO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLCAnRGF0YWJhc2UgYWRhcHRlciBlcnJvci4nKTtcbiAgICB9XG4gIH1cbn07XG5cbmNvbnN0IGxvYWQgPSBwYXJzZUdyYXBoUUxTY2hlbWEgPT4ge1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFF1ZXJ5KFxuICAgICdjbGFzcycsXG4gICAge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGUgY2xhc3MgcXVlcnkgY2FuIGJlIHVzZWQgdG8gcmV0cmlldmUgYW4gZXhpc3Rpbmcgb2JqZWN0IGNsYXNzLicsXG4gICAgICBhcmdzOiB7XG4gICAgICAgIG5hbWU6IHNjaGVtYVR5cGVzLkNMQVNTX05BTUVfQVRULFxuICAgICAgfSxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChzY2hlbWFUeXBlcy5DTEFTUyksXG4gICAgICByZXNvbHZlOiBhc3luYyAoX3NvdXJjZSwgYXJncywgY29udGV4dCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHsgbmFtZSB9ID0gZGVlcGNvcHkoYXJncyk7XG4gICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGggfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgICBlbmZvcmNlTWFzdGVyS2V5QWNjZXNzKGF1dGgpO1xuXG4gICAgICAgICAgY29uc3Qgc2NoZW1hID0gYXdhaXQgY29uZmlnLmRhdGFiYXNlLmxvYWRTY2hlbWEoeyBjbGVhckNhY2hlOiB0cnVlIH0pO1xuICAgICAgICAgIGNvbnN0IHBhcnNlQ2xhc3MgPSBhd2FpdCBnZXRDbGFzcyhuYW1lLCBzY2hlbWEpO1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBuYW1lOiBwYXJzZUNsYXNzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgIHNjaGVtYUZpZWxkczogdHJhbnNmb3JtVG9HcmFwaFFMKHBhcnNlQ2xhc3MuZmllbGRzKSxcbiAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0sXG4gICAgdHJ1ZSxcbiAgICB0cnVlXG4gICk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxRdWVyeShcbiAgICAnY2xhc3NlcycsXG4gICAge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGUgY2xhc3NlcyBxdWVyeSBjYW4gYmUgdXNlZCB0byByZXRyaWV2ZSB0aGUgZXhpc3Rpbmcgb2JqZWN0IGNsYXNzZXMuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKHNjaGVtYVR5cGVzLkNMQVNTKSkpLFxuICAgICAgcmVzb2x2ZTogYXN5bmMgKF9zb3VyY2UsIF9hcmdzLCBjb250ZXh0KSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGggfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgICBlbmZvcmNlTWFzdGVyS2V5QWNjZXNzKGF1dGgpO1xuXG4gICAgICAgICAgY29uc3Qgc2NoZW1hID0gYXdhaXQgY29uZmlnLmRhdGFiYXNlLmxvYWRTY2hlbWEoeyBjbGVhckNhY2hlOiB0cnVlIH0pO1xuICAgICAgICAgIHJldHVybiAoYXdhaXQgc2NoZW1hLmdldEFsbENsYXNzZXModHJ1ZSkpLm1hcChwYXJzZUNsYXNzID0+ICh7XG4gICAgICAgICAgICBuYW1lOiBwYXJzZUNsYXNzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgIHNjaGVtYUZpZWxkczogdHJhbnNmb3JtVG9HcmFwaFFMKHBhcnNlQ2xhc3MuZmllbGRzKSxcbiAgICAgICAgICB9KSk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbn07XG5cbmV4cG9ydCB7IGdldENsYXNzLCBsb2FkIH07XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUE4RDtBQUFBO0FBQUE7QUFFOUQsTUFBTUEsUUFBUSxHQUFHLE9BQU9DLElBQUksRUFBRUMsTUFBTSxLQUFLO0VBQ3ZDLElBQUk7SUFDRixPQUFPLE1BQU1BLE1BQU0sQ0FBQ0MsWUFBWSxDQUFDRixJQUFJLEVBQUUsSUFBSSxDQUFDO0VBQzlDLENBQUMsQ0FBQyxPQUFPRyxDQUFDLEVBQUU7SUFDVixJQUFJQSxDQUFDLEtBQUtDLFNBQVMsRUFBRTtNQUNuQixNQUFNLElBQUlDLGFBQUssQ0FBQ0MsS0FBSyxDQUFDRCxhQUFLLENBQUNDLEtBQUssQ0FBQ0Msa0JBQWtCLEVBQUcsU0FBUVAsSUFBSyxrQkFBaUIsQ0FBQztJQUN4RixDQUFDLE1BQU07TUFDTCxNQUFNLElBQUlLLGFBQUssQ0FBQ0MsS0FBSyxDQUFDRCxhQUFLLENBQUNDLEtBQUssQ0FBQ0UscUJBQXFCLEVBQUUseUJBQXlCLENBQUM7SUFDckY7RUFDRjtBQUNGLENBQUM7QUFBQztBQUVGLE1BQU1DLElBQUksR0FBR0Msa0JBQWtCLElBQUk7RUFDakNBLGtCQUFrQixDQUFDQyxlQUFlLENBQ2hDLE9BQU8sRUFDUDtJQUNFQyxXQUFXLEVBQUUsbUVBQW1FO0lBQ2hGQyxJQUFJLEVBQUU7TUFDSmIsSUFBSSxFQUFFYyxXQUFXLENBQUNDO0lBQ3BCLENBQUM7SUFDREMsSUFBSSxFQUFFLElBQUlDLHVCQUFjLENBQUNILFdBQVcsQ0FBQ0ksS0FBSyxDQUFDO0lBQzNDQyxPQUFPLEVBQUUsT0FBT0MsT0FBTyxFQUFFUCxJQUFJLEVBQUVRLE9BQU8sS0FBSztNQUN6QyxJQUFJO1FBQ0YsTUFBTTtVQUFFckI7UUFBSyxDQUFDLEdBQUcsSUFBQXNCLGlCQUFRLEVBQUNULElBQUksQ0FBQztRQUMvQixNQUFNO1VBQUVVLE1BQU07VUFBRUM7UUFBSyxDQUFDLEdBQUdILE9BQU87UUFFaEMsSUFBQUkseUNBQXNCLEVBQUNELElBQUksQ0FBQztRQUU1QixNQUFNdkIsTUFBTSxHQUFHLE1BQU1zQixNQUFNLENBQUNHLFFBQVEsQ0FBQ0MsVUFBVSxDQUFDO1VBQUVDLFVBQVUsRUFBRTtRQUFLLENBQUMsQ0FBQztRQUNyRSxNQUFNQyxVQUFVLEdBQUcsTUFBTTlCLFFBQVEsQ0FBQ0MsSUFBSSxFQUFFQyxNQUFNLENBQUM7UUFDL0MsT0FBTztVQUNMRCxJQUFJLEVBQUU2QixVQUFVLENBQUNDLFNBQVM7VUFDMUJDLFlBQVksRUFBRSxJQUFBQyxnQ0FBa0IsRUFBQ0gsVUFBVSxDQUFDSSxNQUFNO1FBQ3BELENBQUM7TUFDSCxDQUFDLENBQUMsT0FBTzlCLENBQUMsRUFBRTtRQUNWTyxrQkFBa0IsQ0FBQ3dCLFdBQVcsQ0FBQy9CLENBQUMsQ0FBQztNQUNuQztJQUNGO0VBQ0YsQ0FBQyxFQUNELElBQUksRUFDSixJQUFJLENBQ0w7RUFFRE8sa0JBQWtCLENBQUNDLGVBQWUsQ0FDaEMsU0FBUyxFQUNUO0lBQ0VDLFdBQVcsRUFBRSx3RUFBd0U7SUFDckZJLElBQUksRUFBRSxJQUFJQyx1QkFBYyxDQUFDLElBQUlrQixvQkFBVyxDQUFDLElBQUlsQix1QkFBYyxDQUFDSCxXQUFXLENBQUNJLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDaEZDLE9BQU8sRUFBRSxPQUFPQyxPQUFPLEVBQUVnQixLQUFLLEVBQUVmLE9BQU8sS0FBSztNQUMxQyxJQUFJO1FBQ0YsTUFBTTtVQUFFRSxNQUFNO1VBQUVDO1FBQUssQ0FBQyxHQUFHSCxPQUFPO1FBRWhDLElBQUFJLHlDQUFzQixFQUFDRCxJQUFJLENBQUM7UUFFNUIsTUFBTXZCLE1BQU0sR0FBRyxNQUFNc0IsTUFBTSxDQUFDRyxRQUFRLENBQUNDLFVBQVUsQ0FBQztVQUFFQyxVQUFVLEVBQUU7UUFBSyxDQUFDLENBQUM7UUFDckUsT0FBTyxDQUFDLE1BQU0zQixNQUFNLENBQUNvQyxhQUFhLENBQUMsSUFBSSxDQUFDLEVBQUVDLEdBQUcsQ0FBQ1QsVUFBVSxLQUFLO1VBQzNEN0IsSUFBSSxFQUFFNkIsVUFBVSxDQUFDQyxTQUFTO1VBQzFCQyxZQUFZLEVBQUUsSUFBQUMsZ0NBQWtCLEVBQUNILFVBQVUsQ0FBQ0ksTUFBTTtRQUNwRCxDQUFDLENBQUMsQ0FBQztNQUNMLENBQUMsQ0FBQyxPQUFPOUIsQ0FBQyxFQUFFO1FBQ1ZPLGtCQUFrQixDQUFDd0IsV0FBVyxDQUFDL0IsQ0FBQyxDQUFDO01BQ25DO0lBQ0Y7RUFDRixDQUFDLEVBQ0QsSUFBSSxFQUNKLElBQUksQ0FDTDtBQUNILENBQUM7QUFBQyJ9