"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;
var _node = _interopRequireDefault(require("parse/node"));
var _graphql = require("graphql");
var _deepcopy = _interopRequireDefault(require("deepcopy"));
var _graphqlRelay = require("graphql-relay");
var schemaTypes = _interopRequireWildcard(require("./schemaTypes"));
var _schemaFields = require("../transformers/schemaFields");
var _parseGraphQLUtils = require("../parseGraphQLUtils");
var _schemaQueries = require("./schemaQueries");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const load = parseGraphQLSchema => {
  const createClassMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'CreateClass',
    description: 'The createClass mutation can be used to create the schema for a new object class.',
    inputFields: {
      name: schemaTypes.CLASS_NAME_ATT,
      schemaFields: {
        description: "These are the schema's fields of the object class.",
        type: schemaTypes.SCHEMA_FIELDS_INPUT
      }
    },
    outputFields: {
      class: {
        description: 'This is the created class.',
        type: new _graphql.GraphQLNonNull(schemaTypes.CLASS)
      }
    },
    mutateAndGetPayload: async (args, context) => {
      try {
        const {
          name,
          schemaFields
        } = (0, _deepcopy.default)(args);
        const {
          config,
          auth
        } = context;
        (0, _parseGraphQLUtils.enforceMasterKeyAccess)(auth);
        if (auth.isReadOnly) {
          throw new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, "read-only masterKey isn't allowed to create a schema.");
        }
        const schema = await config.database.loadSchema({
          clearCache: true
        });
        const parseClass = await schema.addClassIfNotExists(name, (0, _schemaFields.transformToParse)(schemaFields));
        return {
          class: {
            name: parseClass.className,
            schemaFields: (0, _schemaFields.transformToGraphQL)(parseClass.fields)
          }
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(createClassMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(createClassMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('createClass', createClassMutation, true, true);
  const updateClassMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'UpdateClass',
    description: 'The updateClass mutation can be used to update the schema for an existing object class.',
    inputFields: {
      name: schemaTypes.CLASS_NAME_ATT,
      schemaFields: {
        description: "These are the schema's fields of the object class.",
        type: schemaTypes.SCHEMA_FIELDS_INPUT
      }
    },
    outputFields: {
      class: {
        description: 'This is the updated class.',
        type: new _graphql.GraphQLNonNull(schemaTypes.CLASS)
      }
    },
    mutateAndGetPayload: async (args, context) => {
      try {
        const {
          name,
          schemaFields
        } = (0, _deepcopy.default)(args);
        const {
          config,
          auth
        } = context;
        (0, _parseGraphQLUtils.enforceMasterKeyAccess)(auth);
        if (auth.isReadOnly) {
          throw new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, "read-only masterKey isn't allowed to update a schema.");
        }
        const schema = await config.database.loadSchema({
          clearCache: true
        });
        const existingParseClass = await (0, _schemaQueries.getClass)(name, schema);
        const parseClass = await schema.updateClass(name, (0, _schemaFields.transformToParse)(schemaFields, existingParseClass.fields), undefined, undefined, config.database);
        return {
          class: {
            name: parseClass.className,
            schemaFields: (0, _schemaFields.transformToGraphQL)(parseClass.fields)
          }
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(updateClassMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(updateClassMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('updateClass', updateClassMutation, true, true);
  const deleteClassMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'DeleteClass',
    description: 'The deleteClass mutation can be used to delete an existing object class.',
    inputFields: {
      name: schemaTypes.CLASS_NAME_ATT
    },
    outputFields: {
      class: {
        description: 'This is the deleted class.',
        type: new _graphql.GraphQLNonNull(schemaTypes.CLASS)
      }
    },
    mutateAndGetPayload: async (args, context) => {
      try {
        const {
          name
        } = (0, _deepcopy.default)(args);
        const {
          config,
          auth
        } = context;
        (0, _parseGraphQLUtils.enforceMasterKeyAccess)(auth);
        if (auth.isReadOnly) {
          throw new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, "read-only masterKey isn't allowed to delete a schema.");
        }
        const schema = await config.database.loadSchema({
          clearCache: true
        });
        const existingParseClass = await (0, _schemaQueries.getClass)(name, schema);
        await config.database.deleteSchema(name);
        return {
          class: {
            name: existingParseClass.className,
            schemaFields: (0, _schemaFields.transformToGraphQL)(existingParseClass.fields)
          }
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(deleteClassMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(deleteClassMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('deleteClass', deleteClassMutation, true, true);
};
exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJsb2FkIiwicGFyc2VHcmFwaFFMU2NoZW1hIiwiY3JlYXRlQ2xhc3NNdXRhdGlvbiIsIm11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQiLCJuYW1lIiwiZGVzY3JpcHRpb24iLCJpbnB1dEZpZWxkcyIsInNjaGVtYVR5cGVzIiwiQ0xBU1NfTkFNRV9BVFQiLCJzY2hlbWFGaWVsZHMiLCJ0eXBlIiwiU0NIRU1BX0ZJRUxEU19JTlBVVCIsIm91dHB1dEZpZWxkcyIsImNsYXNzIiwiR3JhcGhRTE5vbk51bGwiLCJDTEFTUyIsIm11dGF0ZUFuZEdldFBheWxvYWQiLCJhcmdzIiwiY29udGV4dCIsImRlZXBjb3B5IiwiY29uZmlnIiwiYXV0aCIsImVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MiLCJpc1JlYWRPbmx5IiwiUGFyc2UiLCJFcnJvciIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJzY2hlbWEiLCJkYXRhYmFzZSIsImxvYWRTY2hlbWEiLCJjbGVhckNhY2hlIiwicGFyc2VDbGFzcyIsImFkZENsYXNzSWZOb3RFeGlzdHMiLCJ0cmFuc2Zvcm1Ub1BhcnNlIiwiY2xhc3NOYW1lIiwidHJhbnNmb3JtVG9HcmFwaFFMIiwiZmllbGRzIiwiZSIsImhhbmRsZUVycm9yIiwiYWRkR3JhcGhRTFR5cGUiLCJpbnB1dCIsIm9mVHlwZSIsImFkZEdyYXBoUUxNdXRhdGlvbiIsInVwZGF0ZUNsYXNzTXV0YXRpb24iLCJleGlzdGluZ1BhcnNlQ2xhc3MiLCJnZXRDbGFzcyIsInVwZGF0ZUNsYXNzIiwidW5kZWZpbmVkIiwiZGVsZXRlQ2xhc3NNdXRhdGlvbiIsImRlbGV0ZVNjaGVtYSJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvc2NoZW1hTXV0YXRpb25zLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7IEdyYXBoUUxOb25OdWxsIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgZGVlcGNvcHkgZnJvbSAnZGVlcGNvcHknO1xuaW1wb3J0IHsgbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0ICogYXMgc2NoZW1hVHlwZXMgZnJvbSAnLi9zY2hlbWFUeXBlcyc7XG5pbXBvcnQgeyB0cmFuc2Zvcm1Ub1BhcnNlLCB0cmFuc2Zvcm1Ub0dyYXBoUUwgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvc2NoZW1hRmllbGRzJztcbmltcG9ydCB7IGVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MgfSBmcm9tICcuLi9wYXJzZUdyYXBoUUxVdGlscyc7XG5pbXBvcnQgeyBnZXRDbGFzcyB9IGZyb20gJy4vc2NoZW1hUXVlcmllcyc7XG5cbmNvbnN0IGxvYWQgPSBwYXJzZUdyYXBoUUxTY2hlbWEgPT4ge1xuICBjb25zdCBjcmVhdGVDbGFzc011dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ0NyZWF0ZUNsYXNzJyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdUaGUgY3JlYXRlQ2xhc3MgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gY3JlYXRlIHRoZSBzY2hlbWEgZm9yIGEgbmV3IG9iamVjdCBjbGFzcy4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICBuYW1lOiBzY2hlbWFUeXBlcy5DTEFTU19OQU1FX0FUVCxcbiAgICAgIHNjaGVtYUZpZWxkczoge1xuICAgICAgICBkZXNjcmlwdGlvbjogXCJUaGVzZSBhcmUgdGhlIHNjaGVtYSdzIGZpZWxkcyBvZiB0aGUgb2JqZWN0IGNsYXNzLlwiLFxuICAgICAgICB0eXBlOiBzY2hlbWFUeXBlcy5TQ0hFTUFfRklFTERTX0lOUFVULFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgY2xhc3M6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBjcmVhdGVkIGNsYXNzLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChzY2hlbWFUeXBlcy5DTEFTUyksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgbmFtZSwgc2NoZW1hRmllbGRzIH0gPSBkZWVwY29weShhcmdzKTtcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGggfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgZW5mb3JjZU1hc3RlcktleUFjY2VzcyhhdXRoKTtcblxuICAgICAgICBpZiAoYXV0aC5pc1JlYWRPbmx5KSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgICAgIFwicmVhZC1vbmx5IG1hc3RlcktleSBpc24ndCBhbGxvd2VkIHRvIGNyZWF0ZSBhIHNjaGVtYS5cIlxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBzY2hlbWEgPSBhd2FpdCBjb25maWcuZGF0YWJhc2UubG9hZFNjaGVtYSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgICAgIGNvbnN0IHBhcnNlQ2xhc3MgPSBhd2FpdCBzY2hlbWEuYWRkQ2xhc3NJZk5vdEV4aXN0cyhuYW1lLCB0cmFuc2Zvcm1Ub1BhcnNlKHNjaGVtYUZpZWxkcykpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGNsYXNzOiB7XG4gICAgICAgICAgICBuYW1lOiBwYXJzZUNsYXNzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgIHNjaGVtYUZpZWxkczogdHJhbnNmb3JtVG9HcmFwaFFMKHBhcnNlQ2xhc3MuZmllbGRzKSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNyZWF0ZUNsYXNzTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjcmVhdGVDbGFzc011dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdjcmVhdGVDbGFzcycsIGNyZWF0ZUNsYXNzTXV0YXRpb24sIHRydWUsIHRydWUpO1xuXG4gIGNvbnN0IHVwZGF0ZUNsYXNzTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnVXBkYXRlQ2xhc3MnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSB1cGRhdGVDbGFzcyBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byB1cGRhdGUgdGhlIHNjaGVtYSBmb3IgYW4gZXhpc3Rpbmcgb2JqZWN0IGNsYXNzLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIG5hbWU6IHNjaGVtYVR5cGVzLkNMQVNTX05BTUVfQVRULFxuICAgICAgc2NoZW1hRmllbGRzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIlRoZXNlIGFyZSB0aGUgc2NoZW1hJ3MgZmllbGRzIG9mIHRoZSBvYmplY3QgY2xhc3MuXCIsXG4gICAgICAgIHR5cGU6IHNjaGVtYVR5cGVzLlNDSEVNQV9GSUVMRFNfSU5QVVQsXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICBjbGFzczoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHVwZGF0ZWQgY2xhc3MuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKHNjaGVtYVR5cGVzLkNMQVNTKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyBuYW1lLCBzY2hlbWFGaWVsZHMgfSA9IGRlZXBjb3B5KGFyZ3MpO1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCB9ID0gY29udGV4dDtcblxuICAgICAgICBlbmZvcmNlTWFzdGVyS2V5QWNjZXNzKGF1dGgpO1xuXG4gICAgICAgIGlmIChhdXRoLmlzUmVhZE9ubHkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgXCJyZWFkLW9ubHkgbWFzdGVyS2V5IGlzbid0IGFsbG93ZWQgdG8gdXBkYXRlIGEgc2NoZW1hLlwiXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHNjaGVtYSA9IGF3YWl0IGNvbmZpZy5kYXRhYmFzZS5sb2FkU2NoZW1hKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICAgICAgY29uc3QgZXhpc3RpbmdQYXJzZUNsYXNzID0gYXdhaXQgZ2V0Q2xhc3MobmFtZSwgc2NoZW1hKTtcbiAgICAgICAgY29uc3QgcGFyc2VDbGFzcyA9IGF3YWl0IHNjaGVtYS51cGRhdGVDbGFzcyhcbiAgICAgICAgICBuYW1lLFxuICAgICAgICAgIHRyYW5zZm9ybVRvUGFyc2Uoc2NoZW1hRmllbGRzLCBleGlzdGluZ1BhcnNlQ2xhc3MuZmllbGRzKSxcbiAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgIGNvbmZpZy5kYXRhYmFzZVxuICAgICAgICApO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGNsYXNzOiB7XG4gICAgICAgICAgICBuYW1lOiBwYXJzZUNsYXNzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgIHNjaGVtYUZpZWxkczogdHJhbnNmb3JtVG9HcmFwaFFMKHBhcnNlQ2xhc3MuZmllbGRzKSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHVwZGF0ZUNsYXNzTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZSh1cGRhdGVDbGFzc011dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCd1cGRhdGVDbGFzcycsIHVwZGF0ZUNsYXNzTXV0YXRpb24sIHRydWUsIHRydWUpO1xuXG4gIGNvbnN0IGRlbGV0ZUNsYXNzTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnRGVsZXRlQ2xhc3MnLFxuICAgIGRlc2NyaXB0aW9uOiAnVGhlIGRlbGV0ZUNsYXNzIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGRlbGV0ZSBhbiBleGlzdGluZyBvYmplY3QgY2xhc3MuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgbmFtZTogc2NoZW1hVHlwZXMuQ0xBU1NfTkFNRV9BVFQsXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIGNsYXNzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZGVsZXRlZCBjbGFzcy4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoc2NoZW1hVHlwZXMuQ0xBU1MpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0KSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IG5hbWUgfSA9IGRlZXBjb3B5KGFyZ3MpO1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCB9ID0gY29udGV4dDtcblxuICAgICAgICBlbmZvcmNlTWFzdGVyS2V5QWNjZXNzKGF1dGgpO1xuXG4gICAgICAgIGlmIChhdXRoLmlzUmVhZE9ubHkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgXCJyZWFkLW9ubHkgbWFzdGVyS2V5IGlzbid0IGFsbG93ZWQgdG8gZGVsZXRlIGEgc2NoZW1hLlwiXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHNjaGVtYSA9IGF3YWl0IGNvbmZpZy5kYXRhYmFzZS5sb2FkU2NoZW1hKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICAgICAgY29uc3QgZXhpc3RpbmdQYXJzZUNsYXNzID0gYXdhaXQgZ2V0Q2xhc3MobmFtZSwgc2NoZW1hKTtcbiAgICAgICAgYXdhaXQgY29uZmlnLmRhdGFiYXNlLmRlbGV0ZVNjaGVtYShuYW1lKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBjbGFzczoge1xuICAgICAgICAgICAgbmFtZTogZXhpc3RpbmdQYXJzZUNsYXNzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgIHNjaGVtYUZpZWxkczogdHJhbnNmb3JtVG9HcmFwaFFMKGV4aXN0aW5nUGFyc2VDbGFzcy5maWVsZHMpLFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoZGVsZXRlQ2xhc3NNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGRlbGV0ZUNsYXNzTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oJ2RlbGV0ZUNsYXNzJywgZGVsZXRlQ2xhc3NNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBMkM7QUFBQTtBQUFBO0FBRTNDLE1BQU1BLElBQUksR0FBR0Msa0JBQWtCLElBQUk7RUFDakMsTUFBTUMsbUJBQW1CLEdBQUcsSUFBQUMsMENBQTRCLEVBQUM7SUFDdkRDLElBQUksRUFBRSxhQUFhO0lBQ25CQyxXQUFXLEVBQ1QsbUZBQW1GO0lBQ3JGQyxXQUFXLEVBQUU7TUFDWEYsSUFBSSxFQUFFRyxXQUFXLENBQUNDLGNBQWM7TUFDaENDLFlBQVksRUFBRTtRQUNaSixXQUFXLEVBQUUsb0RBQW9EO1FBQ2pFSyxJQUFJLEVBQUVILFdBQVcsQ0FBQ0k7TUFDcEI7SUFDRixDQUFDO0lBQ0RDLFlBQVksRUFBRTtNQUNaQyxLQUFLLEVBQUU7UUFDTFIsV0FBVyxFQUFFLDRCQUE0QjtRQUN6Q0ssSUFBSSxFQUFFLElBQUlJLHVCQUFjLENBQUNQLFdBQVcsQ0FBQ1EsS0FBSztNQUM1QztJQUNGLENBQUM7SUFDREMsbUJBQW1CLEVBQUUsT0FBT0MsSUFBSSxFQUFFQyxPQUFPLEtBQUs7TUFDNUMsSUFBSTtRQUNGLE1BQU07VUFBRWQsSUFBSTtVQUFFSztRQUFhLENBQUMsR0FBRyxJQUFBVSxpQkFBUSxFQUFDRixJQUFJLENBQUM7UUFDN0MsTUFBTTtVQUFFRyxNQUFNO1VBQUVDO1FBQUssQ0FBQyxHQUFHSCxPQUFPO1FBRWhDLElBQUFJLHlDQUFzQixFQUFDRCxJQUFJLENBQUM7UUFFNUIsSUFBSUEsSUFBSSxDQUFDRSxVQUFVLEVBQUU7VUFDbkIsTUFBTSxJQUFJQyxhQUFLLENBQUNDLEtBQUssQ0FDbkJE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