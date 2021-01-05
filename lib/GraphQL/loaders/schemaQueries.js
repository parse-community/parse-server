"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = exports.getClass = void 0;

var _node = _interopRequireDefault(require("parse/node"));

var _graphql = require("graphql");

var _schemaFields = require("../transformers/schemaFields");

var schemaTypes = _interopRequireWildcard(require("./schemaTypes"));

var _parseGraphQLUtils = require("../parseGraphQLUtils");

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

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
        } = args;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvc2NoZW1hUXVlcmllcy5qcyJdLCJuYW1lcyI6WyJnZXRDbGFzcyIsIm5hbWUiLCJzY2hlbWEiLCJnZXRPbmVTY2hlbWEiLCJlIiwidW5kZWZpbmVkIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfQ0xBU1NfTkFNRSIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJhZGRHcmFwaFFMUXVlcnkiLCJkZXNjcmlwdGlvbiIsImFyZ3MiLCJzY2hlbWFUeXBlcyIsIkNMQVNTX05BTUVfQVRUIiwidHlwZSIsIkdyYXBoUUxOb25OdWxsIiwiQ0xBU1MiLCJyZXNvbHZlIiwiX3NvdXJjZSIsImNvbnRleHQiLCJjb25maWciLCJhdXRoIiwiZGF0YWJhc2UiLCJsb2FkU2NoZW1hIiwiY2xlYXJDYWNoZSIsInBhcnNlQ2xhc3MiLCJjbGFzc05hbWUiLCJzY2hlbWFGaWVsZHMiLCJmaWVsZHMiLCJoYW5kbGVFcnJvciIsIkdyYXBoUUxMaXN0IiwiX2FyZ3MiLCJnZXRBbGxDbGFzc2VzIiwibWFwIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBRUEsTUFBTUEsUUFBUSxHQUFHLE9BQU9DLElBQVAsRUFBYUMsTUFBYixLQUF3QjtBQUN2QyxNQUFJO0FBQ0YsV0FBTyxNQUFNQSxNQUFNLENBQUNDLFlBQVAsQ0FBb0JGLElBQXBCLEVBQTBCLElBQTFCLENBQWI7QUFDRCxHQUZELENBRUUsT0FBT0csQ0FBUCxFQUFVO0FBQ1YsUUFBSUEsQ0FBQyxLQUFLQyxTQUFWLEVBQXFCO0FBQ25CLFlBQU0sSUFBSUMsY0FBTUMsS0FBVixDQUFnQkQsY0FBTUMsS0FBTixDQUFZQyxrQkFBNUIsRUFBaUQsU0FBUVAsSUFBSyxrQkFBOUQsQ0FBTjtBQUNELEtBRkQsTUFFTztBQUNMLFlBQU0sSUFBSUssY0FBTUMsS0FBVixDQUFnQkQsY0FBTUMsS0FBTixDQUFZRSxxQkFBNUIsRUFBbUQseUJBQW5ELENBQU47QUFDRDtBQUNGO0FBQ0YsQ0FWRDs7OztBQVlBLE1BQU1DLElBQUksR0FBR0Msa0JBQWtCLElBQUk7QUFDakNBLEVBQUFBLGtCQUFrQixDQUFDQyxlQUFuQixDQUNFLE9BREYsRUFFRTtBQUNFQyxJQUFBQSxXQUFXLEVBQUUsbUVBRGY7QUFFRUMsSUFBQUEsSUFBSSxFQUFFO0FBQ0piLE1BQUFBLElBQUksRUFBRWMsV0FBVyxDQUFDQztBQURkLEtBRlI7QUFLRUMsSUFBQUEsSUFBSSxFQUFFLElBQUlDLHVCQUFKLENBQW1CSCxXQUFXLENBQUNJLEtBQS9CLENBTFI7QUFNRUMsSUFBQUEsT0FBTyxFQUFFLE9BQU9DLE9BQVAsRUFBZ0JQLElBQWhCLEVBQXNCUSxPQUF0QixLQUFrQztBQUN6QyxVQUFJO0FBQ0YsY0FBTTtBQUFFckIsVUFBQUE7QUFBRixZQUFXYSxJQUFqQjtBQUNBLGNBQU07QUFBRVMsVUFBQUEsTUFBRjtBQUFVQyxVQUFBQTtBQUFWLFlBQW1CRixPQUF6QjtBQUVBLHVEQUF1QkUsSUFBdkI7QUFFQSxjQUFNdEIsTUFBTSxHQUFHLE1BQU1xQixNQUFNLENBQUNFLFFBQVAsQ0FBZ0JDLFVBQWhCLENBQTJCO0FBQUVDLFVBQUFBLFVBQVUsRUFBRTtBQUFkLFNBQTNCLENBQXJCO0FBQ0EsY0FBTUMsVUFBVSxHQUFHLE1BQU01QixRQUFRLENBQUNDLElBQUQsRUFBT0MsTUFBUCxDQUFqQztBQUNBLGVBQU87QUFDTEQsVUFBQUEsSUFBSSxFQUFFMkIsVUFBVSxDQUFDQyxTQURaO0FBRUxDLFVBQUFBLFlBQVksRUFBRSxzQ0FBbUJGLFVBQVUsQ0FBQ0csTUFBOUI7QUFGVCxTQUFQO0FBSUQsT0FaRCxDQVlFLE9BQU8zQixDQUFQLEVBQVU7QUFDVk8sUUFBQUEsa0JBQWtCLENBQUNxQixXQUFuQixDQUErQjVCLENBQS9CO0FBQ0Q7QUFDRjtBQXRCSCxHQUZGLEVBMEJFLElBMUJGLEVBMkJFLElBM0JGO0FBOEJBTyxFQUFBQSxrQkFBa0IsQ0FBQ0MsZUFBbkIsQ0FDRSxTQURGLEVBRUU7QUFDRUMsSUFBQUEsV0FBVyxFQUFFLHdFQURmO0FBRUVJLElBQUFBLElBQUksRUFBRSxJQUFJQyx1QkFBSixDQUFtQixJQUFJZSxvQkFBSixDQUFnQixJQUFJZix1QkFBSixDQUFtQkgsV0FBVyxDQUFDSSxLQUEvQixDQUFoQixDQUFuQixDQUZSO0FBR0VDLElBQUFBLE9BQU8sRUFBRSxPQUFPQyxPQUFQLEVBQWdCYSxLQUFoQixFQUF1QlosT0FBdkIsS0FBbUM7QUFDMUMsVUFBSTtBQUNGLGNBQU07QUFBRUMsVUFBQUEsTUFBRjtBQUFVQyxVQUFBQTtBQUFWLFlBQW1CRixPQUF6QjtBQUVBLHVEQUF1QkUsSUFBdkI7QUFFQSxjQUFNdEIsTUFBTSxHQUFHLE1BQU1xQixNQUFNLENBQUNFLFFBQVAsQ0FBZ0JDLFVBQWhCLENBQTJCO0FBQUVDLFVBQUFBLFVBQVUsRUFBRTtBQUFkLFNBQTNCLENBQXJCO0FBQ0EsZUFBTyxDQUFDLE1BQU16QixNQUFNLENBQUNpQyxhQUFQLENBQXFCLElBQXJCLENBQVAsRUFBbUNDLEdBQW5DLENBQXVDUixVQUFVLEtBQUs7QUFDM0QzQixVQUFBQSxJQUFJLEVBQUUyQixVQUFVLENBQUNDLFNBRDBDO0FBRTNEQyxVQUFBQSxZQUFZLEVBQUUsc0NBQW1CRixVQUFVLENBQUNHLE1BQTlCO0FBRjZDLFNBQUwsQ0FBakQsQ0FBUDtBQUlELE9BVkQsQ0FVRSxPQUFPM0IsQ0FBUCxFQUFVO0FBQ1ZPLFFBQUFBLGtCQUFrQixDQUFDcUIsV0FBbkIsQ0FBK0I1QixDQUEvQjtBQUNEO0FBQ0Y7QUFqQkgsR0FGRixFQXFCRSxJQXJCRixFQXNCRSxJQXRCRjtBQXdCRCxDQXZERCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7IEdyYXBoUUxOb25OdWxsLCBHcmFwaFFMTGlzdCB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgdHJhbnNmb3JtVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL3NjaGVtYUZpZWxkcyc7XG5pbXBvcnQgKiBhcyBzY2hlbWFUeXBlcyBmcm9tICcuL3NjaGVtYVR5cGVzJztcbmltcG9ydCB7IGVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MgfSBmcm9tICcuLi9wYXJzZUdyYXBoUUxVdGlscyc7XG5cbmNvbnN0IGdldENsYXNzID0gYXN5bmMgKG5hbWUsIHNjaGVtYSkgPT4ge1xuICB0cnkge1xuICAgIHJldHVybiBhd2FpdCBzY2hlbWEuZ2V0T25lU2NoZW1hKG5hbWUsIHRydWUpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgaWYgKGUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSwgYENsYXNzICR7bmFtZX0gZG9lcyBub3QgZXhpc3QuYCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsICdEYXRhYmFzZSBhZGFwdGVyIGVycm9yLicpO1xuICAgIH1cbiAgfVxufTtcblxuY29uc3QgbG9hZCA9IHBhcnNlR3JhcGhRTFNjaGVtYSA9PiB7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMUXVlcnkoXG4gICAgJ2NsYXNzJyxcbiAgICB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoZSBjbGFzcyBxdWVyeSBjYW4gYmUgdXNlZCB0byByZXRyaWV2ZSBhbiBleGlzdGluZyBvYmplY3QgY2xhc3MuJyxcbiAgICAgIGFyZ3M6IHtcbiAgICAgICAgbmFtZTogc2NoZW1hVHlwZXMuQ0xBU1NfTkFNRV9BVFQsXG4gICAgICB9LFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKHNjaGVtYVR5cGVzLkNMQVNTKSxcbiAgICAgIHJlc29sdmU6IGFzeW5jIChfc291cmNlLCBhcmdzLCBjb250ZXh0KSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgeyBuYW1lIH0gPSBhcmdzO1xuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoIH0gPSBjb250ZXh0O1xuXG4gICAgICAgICAgZW5mb3JjZU1hc3RlcktleUFjY2VzcyhhdXRoKTtcblxuICAgICAgICAgIGNvbnN0IHNjaGVtYSA9IGF3YWl0IGNvbmZpZy5kYXRhYmFzZS5sb2FkU2NoZW1hKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICAgICAgICBjb25zdCBwYXJzZUNsYXNzID0gYXdhaXQgZ2V0Q2xhc3MobmFtZSwgc2NoZW1hKTtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgbmFtZTogcGFyc2VDbGFzcy5jbGFzc05hbWUsXG4gICAgICAgICAgICBzY2hlbWFGaWVsZHM6IHRyYW5zZm9ybVRvR3JhcGhRTChwYXJzZUNsYXNzLmZpZWxkcyksXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9LFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMUXVlcnkoXG4gICAgJ2NsYXNzZXMnLFxuICAgIHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlIGNsYXNzZXMgcXVlcnkgY2FuIGJlIHVzZWQgdG8gcmV0cmlldmUgdGhlIGV4aXN0aW5nIG9iamVjdCBjbGFzc2VzLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwobmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChzY2hlbWFUeXBlcy5DTEFTUykpKSxcbiAgICAgIHJlc29sdmU6IGFzeW5jIChfc291cmNlLCBfYXJncywgY29udGV4dCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoIH0gPSBjb250ZXh0O1xuXG4gICAgICAgICAgZW5mb3JjZU1hc3RlcktleUFjY2VzcyhhdXRoKTtcblxuICAgICAgICAgIGNvbnN0IHNjaGVtYSA9IGF3YWl0IGNvbmZpZy5kYXRhYmFzZS5sb2FkU2NoZW1hKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICAgICAgICByZXR1cm4gKGF3YWl0IHNjaGVtYS5nZXRBbGxDbGFzc2VzKHRydWUpKS5tYXAocGFyc2VDbGFzcyA9PiAoe1xuICAgICAgICAgICAgbmFtZTogcGFyc2VDbGFzcy5jbGFzc05hbWUsXG4gICAgICAgICAgICBzY2hlbWFGaWVsZHM6IHRyYW5zZm9ybVRvR3JhcGhRTChwYXJzZUNsYXNzLmZpZWxkcyksXG4gICAgICAgICAgfSkpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0sXG4gICAgdHJ1ZSxcbiAgICB0cnVlXG4gICk7XG59O1xuXG5leHBvcnQgeyBnZXRDbGFzcywgbG9hZCB9O1xuIl19