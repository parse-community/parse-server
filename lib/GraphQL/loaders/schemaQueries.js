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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvc2NoZW1hUXVlcmllcy5qcyJdLCJuYW1lcyI6WyJnZXRDbGFzcyIsIm5hbWUiLCJzY2hlbWEiLCJnZXRPbmVTY2hlbWEiLCJlIiwidW5kZWZpbmVkIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfQ0xBU1NfTkFNRSIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJhZGRHcmFwaFFMUXVlcnkiLCJkZXNjcmlwdGlvbiIsImFyZ3MiLCJzY2hlbWFUeXBlcyIsIkNMQVNTX05BTUVfQVRUIiwidHlwZSIsIkdyYXBoUUxOb25OdWxsIiwiQ0xBU1MiLCJyZXNvbHZlIiwiX3NvdXJjZSIsImNvbnRleHQiLCJjb25maWciLCJhdXRoIiwiZGF0YWJhc2UiLCJsb2FkU2NoZW1hIiwiY2xlYXJDYWNoZSIsInBhcnNlQ2xhc3MiLCJjbGFzc05hbWUiLCJzY2hlbWFGaWVsZHMiLCJmaWVsZHMiLCJoYW5kbGVFcnJvciIsIkdyYXBoUUxMaXN0IiwiX2FyZ3MiLCJnZXRBbGxDbGFzc2VzIiwibWFwIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBRUEsTUFBTUEsUUFBUSxHQUFHLE9BQU9DLElBQVAsRUFBYUMsTUFBYixLQUF3QjtBQUN2QyxNQUFJO0FBQ0YsV0FBTyxNQUFNQSxNQUFNLENBQUNDLFlBQVAsQ0FBb0JGLElBQXBCLEVBQTBCLElBQTFCLENBQWI7QUFDRCxHQUZELENBRUUsT0FBT0csQ0FBUCxFQUFVO0FBQ1YsUUFBSUEsQ0FBQyxLQUFLQyxTQUFWLEVBQXFCO0FBQ25CLFlBQU0sSUFBSUMsY0FBTUMsS0FBVixDQUNKRCxjQUFNQyxLQUFOLENBQVlDLGtCQURSLEVBRUgsU0FBUVAsSUFBSyxrQkFGVixDQUFOO0FBSUQsS0FMRCxNQUtPO0FBQ0wsWUFBTSxJQUFJSyxjQUFNQyxLQUFWLENBQ0pELGNBQU1DLEtBQU4sQ0FBWUUscUJBRFIsRUFFSix5QkFGSSxDQUFOO0FBSUQ7QUFDRjtBQUNGLENBaEJEOzs7O0FBa0JBLE1BQU1DLElBQUksR0FBR0Msa0JBQWtCLElBQUk7QUFDakNBLEVBQUFBLGtCQUFrQixDQUFDQyxlQUFuQixDQUNFLE9BREYsRUFFRTtBQUNFQyxJQUFBQSxXQUFXLEVBQ1QsbUVBRko7QUFHRUMsSUFBQUEsSUFBSSxFQUFFO0FBQ0piLE1BQUFBLElBQUksRUFBRWMsV0FBVyxDQUFDQztBQURkLEtBSFI7QUFNRUMsSUFBQUEsSUFBSSxFQUFFLElBQUlDLHVCQUFKLENBQW1CSCxXQUFXLENBQUNJLEtBQS9CLENBTlI7QUFPRUMsSUFBQUEsT0FBTyxFQUFFLE9BQU9DLE9BQVAsRUFBZ0JQLElBQWhCLEVBQXNCUSxPQUF0QixLQUFrQztBQUN6QyxVQUFJO0FBQ0YsY0FBTTtBQUFFckIsVUFBQUE7QUFBRixZQUFXYSxJQUFqQjtBQUNBLGNBQU07QUFBRVMsVUFBQUEsTUFBRjtBQUFVQyxVQUFBQTtBQUFWLFlBQW1CRixPQUF6QjtBQUVBLHVEQUF1QkUsSUFBdkI7QUFFQSxjQUFNdEIsTUFBTSxHQUFHLE1BQU1xQixNQUFNLENBQUNFLFFBQVAsQ0FBZ0JDLFVBQWhCLENBQTJCO0FBQUVDLFVBQUFBLFVBQVUsRUFBRTtBQUFkLFNBQTNCLENBQXJCO0FBQ0EsY0FBTUMsVUFBVSxHQUFHLE1BQU01QixRQUFRLENBQUNDLElBQUQsRUFBT0MsTUFBUCxDQUFqQztBQUNBLGVBQU87QUFDTEQsVUFBQUEsSUFBSSxFQUFFMkIsVUFBVSxDQUFDQyxTQURaO0FBRUxDLFVBQUFBLFlBQVksRUFBRSxzQ0FBbUJGLFVBQVUsQ0FBQ0csTUFBOUI7QUFGVCxTQUFQO0FBSUQsT0FaRCxDQVlFLE9BQU8zQixDQUFQLEVBQVU7QUFDVk8sUUFBQUEsa0JBQWtCLENBQUNxQixXQUFuQixDQUErQjVCLENBQS9CO0FBQ0Q7QUFDRjtBQXZCSCxHQUZGLEVBMkJFLElBM0JGLEVBNEJFLElBNUJGO0FBK0JBTyxFQUFBQSxrQkFBa0IsQ0FBQ0MsZUFBbkIsQ0FDRSxTQURGLEVBRUU7QUFDRUMsSUFBQUEsV0FBVyxFQUNULHdFQUZKO0FBR0VJLElBQUFBLElBQUksRUFBRSxJQUFJQyx1QkFBSixDQUNKLElBQUllLG9CQUFKLENBQWdCLElBQUlmLHVCQUFKLENBQW1CSCxXQUFXLENBQUNJLEtBQS9CLENBQWhCLENBREksQ0FIUjtBQU1FQyxJQUFBQSxPQUFPLEVBQUUsT0FBT0MsT0FBUCxFQUFnQmEsS0FBaEIsRUFBdUJaLE9BQXZCLEtBQW1DO0FBQzFDLFVBQUk7QUFDRixjQUFNO0FBQUVDLFVBQUFBLE1BQUY7QUFBVUMsVUFBQUE7QUFBVixZQUFtQkYsT0FBekI7QUFFQSx1REFBdUJFLElBQXZCO0FBRUEsY0FBTXRCLE1BQU0sR0FBRyxNQUFNcUIsTUFBTSxDQUFDRSxRQUFQLENBQWdCQyxVQUFoQixDQUEyQjtBQUFFQyxVQUFBQSxVQUFVLEVBQUU7QUFBZCxTQUEzQixDQUFyQjtBQUNBLGVBQU8sQ0FBQyxNQUFNekIsTUFBTSxDQUFDaUMsYUFBUCxDQUFxQixJQUFyQixDQUFQLEVBQW1DQyxHQUFuQyxDQUF1Q1IsVUFBVSxLQUFLO0FBQzNEM0IsVUFBQUEsSUFBSSxFQUFFMkIsVUFBVSxDQUFDQyxTQUQwQztBQUUzREMsVUFBQUEsWUFBWSxFQUFFLHNDQUFtQkYsVUFBVSxDQUFDRyxNQUE5QjtBQUY2QyxTQUFMLENBQWpELENBQVA7QUFJRCxPQVZELENBVUUsT0FBTzNCLENBQVAsRUFBVTtBQUNWTyxRQUFBQSxrQkFBa0IsQ0FBQ3FCLFdBQW5CLENBQStCNUIsQ0FBL0I7QUFDRDtBQUNGO0FBcEJILEdBRkYsRUF3QkUsSUF4QkYsRUF5QkUsSUF6QkY7QUEyQkQsQ0EzREQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgeyBHcmFwaFFMTm9uTnVsbCwgR3JhcGhRTExpc3QgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IHRyYW5zZm9ybVRvR3JhcGhRTCB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9zY2hlbWFGaWVsZHMnO1xuaW1wb3J0ICogYXMgc2NoZW1hVHlwZXMgZnJvbSAnLi9zY2hlbWFUeXBlcyc7XG5pbXBvcnQgeyBlbmZvcmNlTWFzdGVyS2V5QWNjZXNzIH0gZnJvbSAnLi4vcGFyc2VHcmFwaFFMVXRpbHMnO1xuXG5jb25zdCBnZXRDbGFzcyA9IGFzeW5jIChuYW1lLCBzY2hlbWEpID0+IHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gYXdhaXQgc2NoZW1hLmdldE9uZVNjaGVtYShuYW1lLCB0cnVlKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGlmIChlID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLFxuICAgICAgICBgQ2xhc3MgJHtuYW1lfSBkb2VzIG5vdCBleGlzdC5gXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgICAgJ0RhdGFiYXNlIGFkYXB0ZXIgZXJyb3IuJ1xuICAgICAgKTtcbiAgICB9XG4gIH1cbn07XG5cbmNvbnN0IGxvYWQgPSBwYXJzZUdyYXBoUUxTY2hlbWEgPT4ge1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFF1ZXJ5KFxuICAgICdjbGFzcycsXG4gICAge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGUgY2xhc3MgcXVlcnkgY2FuIGJlIHVzZWQgdG8gcmV0cmlldmUgYW4gZXhpc3Rpbmcgb2JqZWN0IGNsYXNzLicsXG4gICAgICBhcmdzOiB7XG4gICAgICAgIG5hbWU6IHNjaGVtYVR5cGVzLkNMQVNTX05BTUVfQVRULFxuICAgICAgfSxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChzY2hlbWFUeXBlcy5DTEFTUyksXG4gICAgICByZXNvbHZlOiBhc3luYyAoX3NvdXJjZSwgYXJncywgY29udGV4dCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHsgbmFtZSB9ID0gYXJncztcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCB9ID0gY29udGV4dDtcblxuICAgICAgICAgIGVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MoYXV0aCk7XG5cbiAgICAgICAgICBjb25zdCBzY2hlbWEgPSBhd2FpdCBjb25maWcuZGF0YWJhc2UubG9hZFNjaGVtYSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgICAgICAgY29uc3QgcGFyc2VDbGFzcyA9IGF3YWl0IGdldENsYXNzKG5hbWUsIHNjaGVtYSk7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIG5hbWU6IHBhcnNlQ2xhc3MuY2xhc3NOYW1lLFxuICAgICAgICAgICAgc2NoZW1hRmllbGRzOiB0cmFuc2Zvcm1Ub0dyYXBoUUwocGFyc2VDbGFzcy5maWVsZHMpLFxuICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFF1ZXJ5KFxuICAgICdjbGFzc2VzJyxcbiAgICB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoZSBjbGFzc2VzIHF1ZXJ5IGNhbiBiZSB1c2VkIHRvIHJldHJpZXZlIHRoZSBleGlzdGluZyBvYmplY3QgY2xhc3Nlcy4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKFxuICAgICAgICBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKHNjaGVtYVR5cGVzLkNMQVNTKSlcbiAgICAgICksXG4gICAgICByZXNvbHZlOiBhc3luYyAoX3NvdXJjZSwgX2FyZ3MsIGNvbnRleHQpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCB9ID0gY29udGV4dDtcblxuICAgICAgICAgIGVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MoYXV0aCk7XG5cbiAgICAgICAgICBjb25zdCBzY2hlbWEgPSBhd2FpdCBjb25maWcuZGF0YWJhc2UubG9hZFNjaGVtYSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgICAgICAgcmV0dXJuIChhd2FpdCBzY2hlbWEuZ2V0QWxsQ2xhc3Nlcyh0cnVlKSkubWFwKHBhcnNlQ2xhc3MgPT4gKHtcbiAgICAgICAgICAgIG5hbWU6IHBhcnNlQ2xhc3MuY2xhc3NOYW1lLFxuICAgICAgICAgICAgc2NoZW1hRmllbGRzOiB0cmFuc2Zvcm1Ub0dyYXBoUUwocGFyc2VDbGFzcy5maWVsZHMpLFxuICAgICAgICAgIH0pKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9LFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xufTtcblxuZXhwb3J0IHsgZ2V0Q2xhc3MsIGxvYWQgfTtcbiJdfQ==