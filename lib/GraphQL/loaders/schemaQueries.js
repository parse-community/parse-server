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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvc2NoZW1hUXVlcmllcy5qcyJdLCJuYW1lcyI6WyJnZXRDbGFzcyIsIm5hbWUiLCJzY2hlbWEiLCJnZXRPbmVTY2hlbWEiLCJlIiwidW5kZWZpbmVkIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfQ0xBU1NfTkFNRSIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJhZGRHcmFwaFFMUXVlcnkiLCJkZXNjcmlwdGlvbiIsImFyZ3MiLCJzY2hlbWFUeXBlcyIsIkNMQVNTX05BTUVfQVRUIiwidHlwZSIsIkdyYXBoUUxOb25OdWxsIiwiQ0xBU1MiLCJyZXNvbHZlIiwiX3NvdXJjZSIsImNvbnRleHQiLCJjb25maWciLCJhdXRoIiwiZGF0YWJhc2UiLCJsb2FkU2NoZW1hIiwiY2xlYXJDYWNoZSIsInBhcnNlQ2xhc3MiLCJjbGFzc05hbWUiLCJzY2hlbWFGaWVsZHMiLCJmaWVsZHMiLCJoYW5kbGVFcnJvciIsIkdyYXBoUUxMaXN0IiwiX2FyZ3MiLCJnZXRBbGxDbGFzc2VzIiwibWFwIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBRUEsTUFBTUEsUUFBUSxHQUFHLE9BQU9DLElBQVAsRUFBYUMsTUFBYixLQUF3QjtBQUN2QyxNQUFJO0FBQ0YsV0FBTyxNQUFNQSxNQUFNLENBQUNDLFlBQVAsQ0FBb0JGLElBQXBCLEVBQTBCLElBQTFCLENBQWI7QUFDRCxHQUZELENBRUUsT0FBT0csQ0FBUCxFQUFVO0FBQ1YsUUFBSUEsQ0FBQyxLQUFLQyxTQUFWLEVBQXFCO0FBQ25CLFlBQU0sSUFBSUMsY0FBTUMsS0FBVixDQUFnQkQsY0FBTUMsS0FBTixDQUFZQyxrQkFBNUIsRUFBaUQsU0FBUVAsSUFBSyxrQkFBOUQsQ0FBTjtBQUNELEtBRkQsTUFFTztBQUNMLFlBQU0sSUFBSUssY0FBTUMsS0FBVixDQUFnQkQsY0FBTUMsS0FBTixDQUFZRSxxQkFBNUIsRUFBbUQseUJBQW5ELENBQU47QUFDRDtBQUNGO0FBQ0YsQ0FWRDs7OztBQVlBLE1BQU1DLElBQUksR0FBR0Msa0JBQWtCLElBQUk7QUFDakNBLEVBQUFBLGtCQUFrQixDQUFDQyxlQUFuQixDQUNFLE9BREYsRUFFRTtBQUNFQyxJQUFBQSxXQUFXLEVBQUUsbUVBRGY7QUFFRUMsSUFBQUEsSUFBSSxFQUFFO0FBQ0piLE1BQUFBLElBQUksRUFBRWMsV0FBVyxDQUFDQztBQURkLEtBRlI7QUFLRUMsSUFBQUEsSUFBSSxFQUFFLElBQUlDLHVCQUFKLENBQW1CSCxXQUFXLENBQUNJLEtBQS9CLENBTFI7QUFNRUMsSUFBQUEsT0FBTyxFQUFFLE9BQU9DLE9BQVAsRUFBZ0JQLElBQWhCLEVBQXNCUSxPQUF0QixLQUFrQztBQUN6QyxVQUFJO0FBQ0YsY0FBTTtBQUFFckIsVUFBQUE7QUFBRixZQUFXLHVCQUFTYSxJQUFULENBQWpCO0FBQ0EsY0FBTTtBQUFFUyxVQUFBQSxNQUFGO0FBQVVDLFVBQUFBO0FBQVYsWUFBbUJGLE9BQXpCO0FBRUEsdURBQXVCRSxJQUF2QjtBQUVBLGNBQU10QixNQUFNLEdBQUcsTUFBTXFCLE1BQU0sQ0FBQ0UsUUFBUCxDQUFnQkMsVUFBaEIsQ0FBMkI7QUFBRUMsVUFBQUEsVUFBVSxFQUFFO0FBQWQsU0FBM0IsQ0FBckI7QUFDQSxjQUFNQyxVQUFVLEdBQUcsTUFBTTVCLFFBQVEsQ0FBQ0MsSUFBRCxFQUFPQyxNQUFQLENBQWpDO0FBQ0EsZUFBTztBQUNMRCxVQUFBQSxJQUFJLEVBQUUyQixVQUFVLENBQUNDLFNBRFo7QUFFTEMsVUFBQUEsWUFBWSxFQUFFLHNDQUFtQkYsVUFBVSxDQUFDRyxNQUE5QjtBQUZULFNBQVA7QUFJRCxPQVpELENBWUUsT0FBTzNCLENBQVAsRUFBVTtBQUNWTyxRQUFBQSxrQkFBa0IsQ0FBQ3FCLFdBQW5CLENBQStCNUIsQ0FBL0I7QUFDRDtBQUNGO0FBdEJILEdBRkYsRUEwQkUsSUExQkYsRUEyQkUsSUEzQkY7QUE4QkFPLEVBQUFBLGtCQUFrQixDQUFDQyxlQUFuQixDQUNFLFNBREYsRUFFRTtBQUNFQyxJQUFBQSxXQUFXLEVBQUUsd0VBRGY7QUFFRUksSUFBQUEsSUFBSSxFQUFFLElBQUlDLHVCQUFKLENBQW1CLElBQUllLG9CQUFKLENBQWdCLElBQUlmLHVCQUFKLENBQW1CSCxXQUFXLENBQUNJLEtBQS9CLENBQWhCLENBQW5CLENBRlI7QUFHRUMsSUFBQUEsT0FBTyxFQUFFLE9BQU9DLE9BQVAsRUFBZ0JhLEtBQWhCLEVBQXVCWixPQUF2QixLQUFtQztBQUMxQyxVQUFJO0FBQ0YsY0FBTTtBQUFFQyxVQUFBQSxNQUFGO0FBQVVDLFVBQUFBO0FBQVYsWUFBbUJGLE9BQXpCO0FBRUEsdURBQXVCRSxJQUF2QjtBQUVBLGNBQU10QixNQUFNLEdBQUcsTUFBTXFCLE1BQU0sQ0FBQ0UsUUFBUCxDQUFnQkMsVUFBaEIsQ0FBMkI7QUFBRUMsVUFBQUEsVUFBVSxFQUFFO0FBQWQsU0FBM0IsQ0FBckI7QUFDQSxlQUFPLENBQUMsTUFBTXpCLE1BQU0sQ0FBQ2lDLGFBQVAsQ0FBcUIsSUFBckIsQ0FBUCxFQUFtQ0MsR0FBbkMsQ0FBdUNSLFVBQVUsS0FBSztBQUMzRDNCLFVBQUFBLElBQUksRUFBRTJCLFVBQVUsQ0FBQ0MsU0FEMEM7QUFFM0RDLFVBQUFBLFlBQVksRUFBRSxzQ0FBbUJGLFVBQVUsQ0FBQ0csTUFBOUI7QUFGNkMsU0FBTCxDQUFqRCxDQUFQO0FBSUQsT0FWRCxDQVVFLE9BQU8zQixDQUFQLEVBQVU7QUFDVk8sUUFBQUEsa0JBQWtCLENBQUNxQixXQUFuQixDQUErQjVCLENBQS9CO0FBQ0Q7QUFDRjtBQWpCSCxHQUZGLEVBcUJFLElBckJGLEVBc0JFLElBdEJGO0FBd0JELENBdkREIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IGRlZXBjb3B5IGZyb20gJ2RlZXBjb3B5JztcbmltcG9ydCB7IEdyYXBoUUxOb25OdWxsLCBHcmFwaFFMTGlzdCB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgdHJhbnNmb3JtVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL3NjaGVtYUZpZWxkcyc7XG5pbXBvcnQgKiBhcyBzY2hlbWFUeXBlcyBmcm9tICcuL3NjaGVtYVR5cGVzJztcbmltcG9ydCB7IGVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MgfSBmcm9tICcuLi9wYXJzZUdyYXBoUUxVdGlscyc7XG5cbmNvbnN0IGdldENsYXNzID0gYXN5bmMgKG5hbWUsIHNjaGVtYSkgPT4ge1xuICB0cnkge1xuICAgIHJldHVybiBhd2FpdCBzY2hlbWEuZ2V0T25lU2NoZW1hKG5hbWUsIHRydWUpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgaWYgKGUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSwgYENsYXNzICR7bmFtZX0gZG9lcyBub3QgZXhpc3QuYCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsICdEYXRhYmFzZSBhZGFwdGVyIGVycm9yLicpO1xuICAgIH1cbiAgfVxufTtcblxuY29uc3QgbG9hZCA9IHBhcnNlR3JhcGhRTFNjaGVtYSA9PiB7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMUXVlcnkoXG4gICAgJ2NsYXNzJyxcbiAgICB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoZSBjbGFzcyBxdWVyeSBjYW4gYmUgdXNlZCB0byByZXRyaWV2ZSBhbiBleGlzdGluZyBvYmplY3QgY2xhc3MuJyxcbiAgICAgIGFyZ3M6IHtcbiAgICAgICAgbmFtZTogc2NoZW1hVHlwZXMuQ0xBU1NfTkFNRV9BVFQsXG4gICAgICB9LFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKHNjaGVtYVR5cGVzLkNMQVNTKSxcbiAgICAgIHJlc29sdmU6IGFzeW5jIChfc291cmNlLCBhcmdzLCBjb250ZXh0KSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgeyBuYW1lIH0gPSBkZWVwY29weShhcmdzKTtcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCB9ID0gY29udGV4dDtcblxuICAgICAgICAgIGVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MoYXV0aCk7XG5cbiAgICAgICAgICBjb25zdCBzY2hlbWEgPSBhd2FpdCBjb25maWcuZGF0YWJhc2UubG9hZFNjaGVtYSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgICAgICAgY29uc3QgcGFyc2VDbGFzcyA9IGF3YWl0IGdldENsYXNzKG5hbWUsIHNjaGVtYSk7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIG5hbWU6IHBhcnNlQ2xhc3MuY2xhc3NOYW1lLFxuICAgICAgICAgICAgc2NoZW1hRmllbGRzOiB0cmFuc2Zvcm1Ub0dyYXBoUUwocGFyc2VDbGFzcy5maWVsZHMpLFxuICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFF1ZXJ5KFxuICAgICdjbGFzc2VzJyxcbiAgICB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoZSBjbGFzc2VzIHF1ZXJ5IGNhbiBiZSB1c2VkIHRvIHJldHJpZXZlIHRoZSBleGlzdGluZyBvYmplY3QgY2xhc3Nlcy4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoc2NoZW1hVHlwZXMuQ0xBU1MpKSksXG4gICAgICByZXNvbHZlOiBhc3luYyAoX3NvdXJjZSwgX2FyZ3MsIGNvbnRleHQpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCB9ID0gY29udGV4dDtcblxuICAgICAgICAgIGVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MoYXV0aCk7XG5cbiAgICAgICAgICBjb25zdCBzY2hlbWEgPSBhd2FpdCBjb25maWcuZGF0YWJhc2UubG9hZFNjaGVtYSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgICAgICAgcmV0dXJuIChhd2FpdCBzY2hlbWEuZ2V0QWxsQ2xhc3Nlcyh0cnVlKSkubWFwKHBhcnNlQ2xhc3MgPT4gKHtcbiAgICAgICAgICAgIG5hbWU6IHBhcnNlQ2xhc3MuY2xhc3NOYW1lLFxuICAgICAgICAgICAgc2NoZW1hRmllbGRzOiB0cmFuc2Zvcm1Ub0dyYXBoUUwocGFyc2VDbGFzcy5maWVsZHMpLFxuICAgICAgICAgIH0pKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9LFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xufTtcblxuZXhwb3J0IHsgZ2V0Q2xhc3MsIGxvYWQgfTtcbiJdfQ==