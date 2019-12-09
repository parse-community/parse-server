"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _node = _interopRequireDefault(require("parse/node"));

var _graphql = require("graphql");

var _graphqlRelay = require("graphql-relay");

var schemaTypes = _interopRequireWildcard(require("./schemaTypes"));

var _schemaFields = require("../transformers/schemaFields");

var _parseGraphQLUtils = require("../parseGraphQLUtils");

var _schemaQueries = require("./schemaQueries");

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

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
        } = args;
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
        } = args;
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
        } = args;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvc2NoZW1hTXV0YXRpb25zLmpzIl0sIm5hbWVzIjpbImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJjcmVhdGVDbGFzc011dGF0aW9uIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiaW5wdXRGaWVsZHMiLCJzY2hlbWFUeXBlcyIsIkNMQVNTX05BTUVfQVRUIiwic2NoZW1hRmllbGRzIiwidHlwZSIsIlNDSEVNQV9GSUVMRFNfSU5QVVQiLCJvdXRwdXRGaWVsZHMiLCJjbGFzcyIsIkdyYXBoUUxOb25OdWxsIiwiQ0xBU1MiLCJtdXRhdGVBbmRHZXRQYXlsb2FkIiwiYXJncyIsImNvbnRleHQiLCJjb25maWciLCJhdXRoIiwiaXNSZWFkT25seSIsIlBhcnNlIiwiRXJyb3IiLCJPUEVSQVRJT05fRk9SQklEREVOIiwic2NoZW1hIiwiZGF0YWJhc2UiLCJsb2FkU2NoZW1hIiwiY2xlYXJDYWNoZSIsInBhcnNlQ2xhc3MiLCJhZGRDbGFzc0lmTm90RXhpc3RzIiwiY2xhc3NOYW1lIiwiZmllbGRzIiwiZSIsImhhbmRsZUVycm9yIiwiYWRkR3JhcGhRTFR5cGUiLCJpbnB1dCIsIm9mVHlwZSIsImFkZEdyYXBoUUxNdXRhdGlvbiIsInVwZGF0ZUNsYXNzTXV0YXRpb24iLCJleGlzdGluZ1BhcnNlQ2xhc3MiLCJ1cGRhdGVDbGFzcyIsInVuZGVmaW5lZCIsImRlbGV0ZUNsYXNzTXV0YXRpb24iLCJkZWxldGVTY2hlbWEiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFJQTs7QUFDQTs7Ozs7Ozs7QUFFQSxNQUFNQSxJQUFJLEdBQUdDLGtCQUFrQixJQUFJO0FBQ2pDLFFBQU1DLG1CQUFtQixHQUFHLGdEQUE2QjtBQUN2REMsSUFBQUEsSUFBSSxFQUFFLGFBRGlEO0FBRXZEQyxJQUFBQSxXQUFXLEVBQ1QsbUZBSHFEO0FBSXZEQyxJQUFBQSxXQUFXLEVBQUU7QUFDWEYs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LDZCQUFTcEMsSUFBVCxFQUFlcUIsTUFBZixDQUFqQztBQUNBLGNBQU1OLE1BQU0sQ0FBQ08sUUFBUCxDQUFnQmtCLFlBQWhCLENBQTZCeEMsSUFBN0IsQ0FBTjtBQUNBLGVBQU87QUFDTFMsVUFBQUEsS0FBSyxFQUFFO0FBQ0xULFlBQUFBLElBQUksRUFBRW9DLGtCQUFrQixDQUFDVCxTQURwQjtBQUVMdEIsWUFBQUEsWUFBWSxFQUFFLHNDQUFtQitCLGtCQUFrQixDQUFDUixNQUF0QztBQUZUO0FBREYsU0FBUDtBQU1ELE9BdEJELENBc0JFLE9BQU9DLENBQVAsRUFBVTtBQUNWL0IsUUFBQUEsa0JBQWtCLENBQUNnQyxXQUFuQixDQUErQkQsQ0FBL0I7QUFDRDtBQUNGO0FBdkNzRCxHQUE3QixDQUE1QjtBQTBDQS9CLEVBQUFBLGtCQUFrQixDQUFDaUMsY0FBbkIsQ0FDRVEsbUJBQW1CLENBQUMxQixJQUFwQixDQUF5Qm1CLEtBQXpCLENBQStCMUIsSUFBL0IsQ0FBb0MyQixNQUR0QyxFQUVFLElBRkYsRUFHRSxJQUhGO0FBS0FuQyxFQUFBQSxrQkFBa0IsQ0FBQ2lDLGNBQW5CLENBQWtDUSxtQkFBbUIsQ0FBQ2pDLElBQXRELEVBQTRELElBQTVELEVBQWtFLElBQWxFO0FBQ0FSLEVBQUFBLGtCQUFrQixDQUFDb0Msa0JBQW5CLENBQ0UsYUFERixFQUVFSyxtQkFGRixFQUdFLElBSEYsRUFJRSxJQUpGO0FBTUQsQ0FyTEQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgeyBHcmFwaFFMTm9uTnVsbCB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0ICogYXMgc2NoZW1hVHlwZXMgZnJvbSAnLi9zY2hlbWFUeXBlcyc7XG5pbXBvcnQge1xuICB0cmFuc2Zvcm1Ub1BhcnNlLFxuICB0cmFuc2Zvcm1Ub0dyYXBoUUwsXG59IGZyb20gJy4uL3RyYW5zZm9ybWVycy9zY2hlbWFGaWVsZHMnO1xuaW1wb3J0IHsgZW5mb3JjZU1hc3RlcktleUFjY2VzcyB9IGZyb20gJy4uL3BhcnNlR3JhcGhRTFV0aWxzJztcbmltcG9ydCB7IGdldENsYXNzIH0gZnJvbSAnLi9zY2hlbWFRdWVyaWVzJztcblxuY29uc3QgbG9hZCA9IHBhcnNlR3JhcGhRTFNjaGVtYSA9PiB7XG4gIGNvbnN0IGNyZWF0ZUNsYXNzTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnQ3JlYXRlQ2xhc3MnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSBjcmVhdGVDbGFzcyBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBjcmVhdGUgdGhlIHNjaGVtYSBmb3IgYSBuZXcgb2JqZWN0IGNsYXNzLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIG5hbWU6IHNjaGVtYVR5cGVzLkNMQVNTX05BTUVfQVRULFxuICAgICAgc2NoZW1hRmllbGRzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIlRoZXNlIGFyZSB0aGUgc2NoZW1hJ3MgZmllbGRzIG9mIHRoZSBvYmplY3QgY2xhc3MuXCIsXG4gICAgICAgIHR5cGU6IHNjaGVtYVR5cGVzLlNDSEVNQV9GSUVMRFNfSU5QVVQsXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICBjbGFzczoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGNyZWF0ZWQgY2xhc3MuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKHNjaGVtYVR5cGVzLkNMQVNTKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyBuYW1lLCBzY2hlbWFGaWVsZHMgfSA9IGFyZ3M7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoIH0gPSBjb250ZXh0O1xuXG4gICAgICAgIGVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MoYXV0aCk7XG5cbiAgICAgICAgaWYgKGF1dGguaXNSZWFkT25seSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgICAgICBcInJlYWQtb25seSBtYXN0ZXJLZXkgaXNuJ3QgYWxsb3dlZCB0byBjcmVhdGUgYSBzY2hlbWEuXCJcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qgc2NoZW1hID0gYXdhaXQgY29uZmlnLmRhdGFiYXNlLmxvYWRTY2hlbWEoeyBjbGVhckNhY2hlOiB0cnVlIH0pO1xuICAgICAgICBjb25zdCBwYXJzZUNsYXNzID0gYXdhaXQgc2NoZW1hLmFkZENsYXNzSWZOb3RFeGlzdHMoXG4gICAgICAgICAgbmFtZSxcbiAgICAgICAgICB0cmFuc2Zvcm1Ub1BhcnNlKHNjaGVtYUZpZWxkcylcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBjbGFzczoge1xuICAgICAgICAgICAgbmFtZTogcGFyc2VDbGFzcy5jbGFzc05hbWUsXG4gICAgICAgICAgICBzY2hlbWFGaWVsZHM6IHRyYW5zZm9ybVRvR3JhcGhRTChwYXJzZUNsYXNzLmZpZWxkcyksXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICBjcmVhdGVDbGFzc011dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsXG4gICAgdHJ1ZSxcbiAgICB0cnVlXG4gICk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjcmVhdGVDbGFzc011dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKFxuICAgICdjcmVhdGVDbGFzcycsXG4gICAgY3JlYXRlQ2xhc3NNdXRhdGlvbixcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcblxuICBjb25zdCB1cGRhdGVDbGFzc011dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ1VwZGF0ZUNsYXNzJyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdUaGUgdXBkYXRlQ2xhc3MgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gdXBkYXRlIHRoZSBzY2hlbWEgZm9yIGFuIGV4aXN0aW5nIG9iamVjdCBjbGFzcy4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICBuYW1lOiBzY2hlbWFUeXBlcy5DTEFTU19OQU1FX0FUVCxcbiAgICAgIHNjaGVtYUZpZWxkczoge1xuICAgICAgICBkZXNjcmlwdGlvbjogXCJUaGVzZSBhcmUgdGhlIHNjaGVtYSdzIGZpZWxkcyBvZiB0aGUgb2JqZWN0IGNsYXNzLlwiLFxuICAgICAgICB0eXBlOiBzY2hlbWFUeXBlcy5TQ0hFTUFfRklFTERTX0lOUFVULFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgY2xhc3M6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB1cGRhdGVkIGNsYXNzLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChzY2hlbWFUeXBlcy5DTEFTUyksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgbmFtZSwgc2NoZW1hRmllbGRzIH0gPSBhcmdzO1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCB9ID0gY29udGV4dDtcblxuICAgICAgICBlbmZvcmNlTWFzdGVyS2V5QWNjZXNzKGF1dGgpO1xuXG4gICAgICAgIGlmIChhdXRoLmlzUmVhZE9ubHkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgXCJyZWFkLW9ubHkgbWFzdGVyS2V5IGlzbid0IGFsbG93ZWQgdG8gdXBkYXRlIGEgc2NoZW1hLlwiXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHNjaGVtYSA9IGF3YWl0IGNvbmZpZy5kYXRhYmFzZS5sb2FkU2NoZW1hKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICAgICAgY29uc3QgZXhpc3RpbmdQYXJzZUNsYXNzID0gYXdhaXQgZ2V0Q2xhc3MobmFtZSwgc2NoZW1hKTtcbiAgICAgICAgY29uc3QgcGFyc2VDbGFzcyA9IGF3YWl0IHNjaGVtYS51cGRhdGVDbGFzcyhcbiAgICAgICAgICBuYW1lLFxuICAgICAgICAgIHRyYW5zZm9ybVRvUGFyc2Uoc2NoZW1hRmllbGRzLCBleGlzdGluZ1BhcnNlQ2xhc3MuZmllbGRzKSxcbiAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgIGNvbmZpZy5kYXRhYmFzZVxuICAgICAgICApO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGNsYXNzOiB7XG4gICAgICAgICAgICBuYW1lOiBwYXJzZUNsYXNzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgIHNjaGVtYUZpZWxkczogdHJhbnNmb3JtVG9HcmFwaFFMKHBhcnNlQ2xhc3MuZmllbGRzKSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgIHVwZGF0ZUNsYXNzTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHVwZGF0ZUNsYXNzTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oXG4gICAgJ3VwZGF0ZUNsYXNzJyxcbiAgICB1cGRhdGVDbGFzc011dGF0aW9uLFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuXG4gIGNvbnN0IGRlbGV0ZUNsYXNzTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnRGVsZXRlQ2xhc3MnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSBkZWxldGVDbGFzcyBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBkZWxldGUgYW4gZXhpc3Rpbmcgb2JqZWN0IGNsYXNzLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIG5hbWU6IHNjaGVtYVR5cGVzLkNMQVNTX05BTUVfQVRULFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICBjbGFzczoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGRlbGV0ZWQgY2xhc3MuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKHNjaGVtYVR5cGVzLkNMQVNTKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyBuYW1lIH0gPSBhcmdzO1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCB9ID0gY29udGV4dDtcblxuICAgICAgICBlbmZvcmNlTWFzdGVyS2V5QWNjZXNzKGF1dGgpO1xuXG4gICAgICAgIGlmIChhdXRoLmlzUmVhZE9ubHkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgXCJyZWFkLW9ubHkgbWFzdGVyS2V5IGlzbid0IGFsbG93ZWQgdG8gZGVsZXRlIGEgc2NoZW1hLlwiXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHNjaGVtYSA9IGF3YWl0IGNvbmZpZy5kYXRhYmFzZS5sb2FkU2NoZW1hKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICAgICAgY29uc3QgZXhpc3RpbmdQYXJzZUNsYXNzID0gYXdhaXQgZ2V0Q2xhc3MobmFtZSwgc2NoZW1hKTtcbiAgICAgICAgYXdhaXQgY29uZmlnLmRhdGFiYXNlLmRlbGV0ZVNjaGVtYShuYW1lKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBjbGFzczoge1xuICAgICAgICAgICAgbmFtZTogZXhpc3RpbmdQYXJzZUNsYXNzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgIHNjaGVtYUZpZWxkczogdHJhbnNmb3JtVG9HcmFwaFFMKGV4aXN0aW5nUGFyc2VDbGFzcy5maWVsZHMpLFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgZGVsZXRlQ2xhc3NNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoZGVsZXRlQ2xhc3NNdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbihcbiAgICAnZGVsZXRlQ2xhc3MnLFxuICAgIGRlbGV0ZUNsYXNzTXV0YXRpb24sXG4gICAgdHJ1ZSxcbiAgICB0cnVlXG4gICk7XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXX0=