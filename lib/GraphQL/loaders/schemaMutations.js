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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvc2NoZW1hTXV0YXRpb25zLmpzIl0sIm5hbWVzIjpbImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJjcmVhdGVDbGFzc011dGF0aW9uIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiaW5wdXRGaWVsZHMiLCJzY2hlbWFUeXBlcyIsIkNMQVNTX05BTUVfQVRUIiwic2NoZW1hRmllbGRzIiwidHlwZSIsIlNDSEVNQV9GSUVMRFNfSU5QVVQiLCJvdXRwdXRGaWVsZHMiLCJjbGFzcyIsIkdyYXBoUUxOb25OdWxsIiwiQ0xBU1MiLCJtdXRhdGVBbmRHZXRQYXlsb2FkIiwiYXJncyIsImNvbnRleHQiLCJjb25maWciLCJhdXRoIiwiaXNSZWFkT25seSIsIlBhcnNlIiwiRXJyb3IiLCJPUEVSQVRJT05fRk9SQklEREVOIiwic2NoZW1hIiwiZGF0YWJhc2UiLCJsb2FkU2NoZW1hIiwiY2xlYXJDYWNoZSIsInBhcnNlQ2xhc3MiLCJhZGRDbGFzc0lmTm90RXhpc3RzIiwiY2xhc3NOYW1lIiwiZmllbGRzIiwiZSIsImhhbmRsZUVycm9yIiwiYWRkR3JhcGhRTFR5cGUiLCJpbnB1dCIsIm9mVHlwZSIsImFkZEdyYXBoUUxNdXRhdGlvbiIsInVwZGF0ZUNsYXNzTXV0YXRpb24iLCJleGlzdGluZ1BhcnNlQ2xhc3MiLCJ1cGRhdGVDbGFzcyIsInVuZGVmaW5lZCIsImRlbGV0ZUNsYXNzTXV0YXRpb24iLCJkZWxldGVTY2hlbWEiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFQSxNQUFNQSxJQUFJLEdBQUdDLGtCQUFrQixJQUFJO0FBQ2pDLFFBQU1DLG1CQUFtQixHQUFHLGdEQUE2QjtBQUN2REMsSUFBQUEsSUFBSSxFQUFFLGFBRGlEO0FBRXZEQyxJQUFBQSxXQUFXLEVBQ1QsbUZBSHFEO0FBSXZEQyxJQUFBQSxXQUFXLEVBQUU7QUFDWEYs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QUNBLGNBQU1ZLGtCQUFrQixHQUFHLE1BQU0sNkJBQVNwQyxJQUFULEVBQWVxQixNQUFmLENBQWpDO0FBQ0EsY0FBTU4sTUFBTSxDQUFDTyxRQUFQLENBQWdCa0IsWUFBaEIsQ0FBNkJ4QyxJQUE3QixDQUFOO0FBQ0EsZUFBTztBQUNMUyxVQUFBQSxLQUFLLEVBQUU7QUFDTFQsWUFBQUEsSUFBSSxFQUFFb0Msa0JBQWtCLENBQUNULFNBRHBCO0FBRUx0QixZQUFBQSxZQUFZLEVBQUUsc0NBQW1CK0Isa0JBQWtCLENBQUNSLE1BQXRDO0FBRlQ7QUFERixTQUFQO0FBTUQsT0F0QkQsQ0FzQkUsT0FBT0MsQ0FBUCxFQUFVO0FBQ1YvQixRQUFBQSxrQkFBa0IsQ0FBQ2dDLFdBQW5CLENBQStCRCxDQUEvQjtBQUNEO0FBQ0Y7QUF0Q3NELEdBQTdCLENBQTVCO0FBeUNBL0IsRUFBQUEsa0JBQWtCLENBQUNpQyxjQUFuQixDQUFrQ1EsbUJBQW1CLENBQUMxQixJQUFwQixDQUF5Qm1CLEtBQXpCLENBQStCMUIsSUFBL0IsQ0FBb0MyQixNQUF0RSxFQUE4RSxJQUE5RSxFQUFvRixJQUFwRjtBQUNBbkMsRUFBQUEsa0JBQWtCLENBQUNpQyxjQUFuQixDQUFrQ1EsbUJBQW1CLENBQUNqQyxJQUF0RCxFQUE0RCxJQUE1RCxFQUFrRSxJQUFsRTtBQUNBUixFQUFBQSxrQkFBa0IsQ0FBQ29DLGtCQUFuQixDQUFzQyxhQUF0QyxFQUFxREssbUJBQXJELEVBQTBFLElBQTFFLEVBQWdGLElBQWhGO0FBQ0QsQ0F0SkQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgeyBHcmFwaFFMTm9uTnVsbCB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0ICogYXMgc2NoZW1hVHlwZXMgZnJvbSAnLi9zY2hlbWFUeXBlcyc7XG5pbXBvcnQgeyB0cmFuc2Zvcm1Ub1BhcnNlLCB0cmFuc2Zvcm1Ub0dyYXBoUUwgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvc2NoZW1hRmllbGRzJztcbmltcG9ydCB7IGVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MgfSBmcm9tICcuLi9wYXJzZUdyYXBoUUxVdGlscyc7XG5pbXBvcnQgeyBnZXRDbGFzcyB9IGZyb20gJy4vc2NoZW1hUXVlcmllcyc7XG5cbmNvbnN0IGxvYWQgPSBwYXJzZUdyYXBoUUxTY2hlbWEgPT4ge1xuICBjb25zdCBjcmVhdGVDbGFzc011dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ0NyZWF0ZUNsYXNzJyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdUaGUgY3JlYXRlQ2xhc3MgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gY3JlYXRlIHRoZSBzY2hlbWEgZm9yIGEgbmV3IG9iamVjdCBjbGFzcy4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICBuYW1lOiBzY2hlbWFUeXBlcy5DTEFTU19OQU1FX0FUVCxcbiAgICAgIHNjaGVtYUZpZWxkczoge1xuICAgICAgICBkZXNjcmlwdGlvbjogXCJUaGVzZSBhcmUgdGhlIHNjaGVtYSdzIGZpZWxkcyBvZiB0aGUgb2JqZWN0IGNsYXNzLlwiLFxuICAgICAgICB0eXBlOiBzY2hlbWFUeXBlcy5TQ0hFTUFfRklFTERTX0lOUFVULFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgY2xhc3M6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBjcmVhdGVkIGNsYXNzLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChzY2hlbWFUeXBlcy5DTEFTUyksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgbmFtZSwgc2NoZW1hRmllbGRzIH0gPSBhcmdzO1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCB9ID0gY29udGV4dDtcblxuICAgICAgICBlbmZvcmNlTWFzdGVyS2V5QWNjZXNzKGF1dGgpO1xuXG4gICAgICAgIGlmIChhdXRoLmlzUmVhZE9ubHkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgXCJyZWFkLW9ubHkgbWFzdGVyS2V5IGlzbid0IGFsbG93ZWQgdG8gY3JlYXRlIGEgc2NoZW1hLlwiXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHNjaGVtYSA9IGF3YWl0IGNvbmZpZy5kYXRhYmFzZS5sb2FkU2NoZW1hKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICAgICAgY29uc3QgcGFyc2VDbGFzcyA9IGF3YWl0IHNjaGVtYS5hZGRDbGFzc0lmTm90RXhpc3RzKG5hbWUsIHRyYW5zZm9ybVRvUGFyc2Uoc2NoZW1hRmllbGRzKSk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgY2xhc3M6IHtcbiAgICAgICAgICAgIG5hbWU6IHBhcnNlQ2xhc3MuY2xhc3NOYW1lLFxuICAgICAgICAgICAgc2NoZW1hRmllbGRzOiB0cmFuc2Zvcm1Ub0dyYXBoUUwocGFyc2VDbGFzcy5maWVsZHMpLFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY3JlYXRlQ2xhc3NNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNyZWF0ZUNsYXNzTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oJ2NyZWF0ZUNsYXNzJywgY3JlYXRlQ2xhc3NNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgY29uc3QgdXBkYXRlQ2xhc3NNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdVcGRhdGVDbGFzcycsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIHVwZGF0ZUNsYXNzIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIHVwZGF0ZSB0aGUgc2NoZW1hIGZvciBhbiBleGlzdGluZyBvYmplY3QgY2xhc3MuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgbmFtZTogc2NoZW1hVHlwZXMuQ0xBU1NfTkFNRV9BVFQsXG4gICAgICBzY2hlbWFGaWVsZHM6IHtcbiAgICAgICAgZGVzY3JpcHRpb246IFwiVGhlc2UgYXJlIHRoZSBzY2hlbWEncyBmaWVsZHMgb2YgdGhlIG9iamVjdCBjbGFzcy5cIixcbiAgICAgICAgdHlwZTogc2NoZW1hVHlwZXMuU0NIRU1BX0ZJRUxEU19JTlBVVCxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIGNsYXNzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdXBkYXRlZCBjbGFzcy4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoc2NoZW1hVHlwZXMuQ0xBU1MpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0KSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IG5hbWUsIHNjaGVtYUZpZWxkcyB9ID0gYXJncztcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGggfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgZW5mb3JjZU1hc3RlcktleUFjY2VzcyhhdXRoKTtcblxuICAgICAgICBpZiAoYXV0aC5pc1JlYWRPbmx5KSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgICAgIFwicmVhZC1vbmx5IG1hc3RlcktleSBpc24ndCBhbGxvd2VkIHRvIHVwZGF0ZSBhIHNjaGVtYS5cIlxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBzY2hlbWEgPSBhd2FpdCBjb25maWcuZGF0YWJhc2UubG9hZFNjaGVtYSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nUGFyc2VDbGFzcyA9IGF3YWl0IGdldENsYXNzKG5hbWUsIHNjaGVtYSk7XG4gICAgICAgIGNvbnN0IHBhcnNlQ2xhc3MgPSBhd2FpdCBzY2hlbWEudXBkYXRlQ2xhc3MoXG4gICAgICAgICAgbmFtZSxcbiAgICAgICAgICB0cmFuc2Zvcm1Ub1BhcnNlKHNjaGVtYUZpZWxkcywgZXhpc3RpbmdQYXJzZUNsYXNzLmZpZWxkcyksXG4gICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICBjb25maWcuZGF0YWJhc2VcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBjbGFzczoge1xuICAgICAgICAgICAgbmFtZTogcGFyc2VDbGFzcy5jbGFzc05hbWUsXG4gICAgICAgICAgICBzY2hlbWFGaWVsZHM6IHRyYW5zZm9ybVRvR3JhcGhRTChwYXJzZUNsYXNzLmZpZWxkcyksXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZSh1cGRhdGVDbGFzc011dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUodXBkYXRlQ2xhc3NNdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbigndXBkYXRlQ2xhc3MnLCB1cGRhdGVDbGFzc011dGF0aW9uLCB0cnVlLCB0cnVlKTtcblxuICBjb25zdCBkZWxldGVDbGFzc011dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ0RlbGV0ZUNsYXNzJyxcbiAgICBkZXNjcmlwdGlvbjogJ1RoZSBkZWxldGVDbGFzcyBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBkZWxldGUgYW4gZXhpc3Rpbmcgb2JqZWN0IGNsYXNzLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIG5hbWU6IHNjaGVtYVR5cGVzLkNMQVNTX05BTUVfQVRULFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICBjbGFzczoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGRlbGV0ZWQgY2xhc3MuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKHNjaGVtYVR5cGVzLkNMQVNTKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyBuYW1lIH0gPSBhcmdzO1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCB9ID0gY29udGV4dDtcblxuICAgICAgICBlbmZvcmNlTWFzdGVyS2V5QWNjZXNzKGF1dGgpO1xuXG4gICAgICAgIGlmIChhdXRoLmlzUmVhZE9ubHkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgXCJyZWFkLW9ubHkgbWFzdGVyS2V5IGlzbid0IGFsbG93ZWQgdG8gZGVsZXRlIGEgc2NoZW1hLlwiXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHNjaGVtYSA9IGF3YWl0IGNvbmZpZy5kYXRhYmFzZS5sb2FkU2NoZW1hKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICAgICAgY29uc3QgZXhpc3RpbmdQYXJzZUNsYXNzID0gYXdhaXQgZ2V0Q2xhc3MobmFtZSwgc2NoZW1hKTtcbiAgICAgICAgYXdhaXQgY29uZmlnLmRhdGFiYXNlLmRlbGV0ZVNjaGVtYShuYW1lKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBjbGFzczoge1xuICAgICAgICAgICAgbmFtZTogZXhpc3RpbmdQYXJzZUNsYXNzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgIHNjaGVtYUZpZWxkczogdHJhbnNmb3JtVG9HcmFwaFFMKGV4aXN0aW5nUGFyc2VDbGFzcy5maWVsZHMpLFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoZGVsZXRlQ2xhc3NNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGRlbGV0ZUNsYXNzTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oJ2RlbGV0ZUNsYXNzJywgZGVsZXRlQ2xhc3NNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXX0=