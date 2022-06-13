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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvc2NoZW1hTXV0YXRpb25zLmpzIl0sIm5hbWVzIjpbImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJjcmVhdGVDbGFzc011dGF0aW9uIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiaW5wdXRGaWVsZHMiLCJzY2hlbWFUeXBlcyIsIkNMQVNTX05BTUVfQVRUIiwic2NoZW1hRmllbGRzIiwidHlwZSIsIlNDSEVNQV9GSUVMRFNfSU5QVVQiLCJvdXRwdXRGaWVsZHMiLCJjbGFzcyIsIkdyYXBoUUxOb25OdWxsIiwiQ0xBU1MiLCJtdXRhdGVBbmRHZXRQYXlsb2FkIiwiYXJncyIsImNvbnRleHQiLCJjb25maWciLCJhdXRoIiwiaXNSZWFkT25seSIsIlBhcnNlIiwiRXJyb3IiLCJPUEVSQVRJT05fRk9SQklEREVOIiwic2NoZW1hIiwiZGF0YWJhc2UiLCJsb2FkU2NoZW1hIiwiY2xlYXJDYWNoZSIsInBhcnNlQ2xhc3MiLCJhZGRDbGFzc0lmTm90RXhpc3RzIiwiY2xhc3NOYW1lIiwiZmllbGRzIiwiZSIsImhhbmRsZUVycm9yIiwiYWRkR3JhcGhRTFR5cGUiLCJpbnB1dCIsIm9mVHlwZSIsImFkZEdyYXBoUUxNdXRhdGlvbiIsInVwZGF0ZUNsYXNzTXV0YXRpb24iLCJleGlzdGluZ1BhcnNlQ2xhc3MiLCJ1cGRhdGVDbGFzcyIsInVuZGVmaW5lZCIsImRlbGV0ZUNsYXNzTXV0YXRpb24iLCJkZWxldGVTY2hlbWEiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFQSxNQUFNQSxJQUFJLEdBQUdDLGtCQUFrQixJQUFJO0FBQ2pDLFFBQU1DLG1CQUFtQixHQUFHLGdEQUE2QjtBQUN2REMsSUFBQUEsSUFBSSxFQUFFLGFBRGlEO0FBRXZEQyxJQUFBQSxXQUFXLEVBQ1QsbUZBSHFEO0FBSXZEQyxJQUFBQSxXQUFXLEVBQUU7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QUFFQyxVQUFBQSxVQUFVLEVBQUU7QUFBZCxTQUEzQixDQUFyQjtBQUNBLGNBQU1ZLGtCQUFrQixHQUFHLE1BQU0sNkJBQVNwQyxJQUFULEVBQWVxQixNQUFmLENBQWpDO0FBQ0EsY0FBTU4sTUFBTSxDQUFDTyxRQUFQLENBQWdCa0IsWUFBaEIsQ0FBNkJ4QyxJQUE3QixDQUFOO0FBQ0EsZUFBTztBQUNMUyxVQUFBQSxLQUFLLEVBQUU7QUFDTFQsWUFBQUEsSUFBSSxFQUFFb0Msa0JBQWtCLENBQUNULFNBRHBCO0FBRUx0QixZQUFBQSxZQUFZLEVBQUUsc0NBQW1CK0Isa0JBQWtCLENBQUNSLE1BQXRDO0FBRlQ7QUFERixTQUFQO0FBTUQsT0F0QkQsQ0FzQkUsT0FBT0MsQ0FBUCxFQUFVO0FBQ1YvQixRQUFBQSxrQkFBa0IsQ0FBQ2dDLFdBQW5CLENBQStCRCxDQUEvQjtBQUNEO0FBQ0Y7QUF0Q3NELEdBQTdCLENBQTVCO0FBeUNBL0IsRUFBQUEsa0JBQWtCLENBQUNpQyxjQUFuQixDQUFrQ1EsbUJBQW1CLENBQUMxQixJQUFwQixDQUF5Qm1CLEtBQXpCLENBQStCMUIsSUFBL0IsQ0FBb0MyQixNQUF0RSxFQUE4RSxJQUE5RSxFQUFvRixJQUFwRjtBQUNBbkMsRUFBQUEsa0JBQWtCLENBQUNpQyxjQUFuQixDQUFrQ1EsbUJBQW1CLENBQUNqQyxJQUF0RCxFQUE0RCxJQUE1RCxFQUFrRSxJQUFsRTtBQUNBUixFQUFBQSxrQkFBa0IsQ0FBQ29DLGtCQUFuQixDQUFzQyxhQUF0QyxFQUFxREssbUJBQXJELEVBQTBFLElBQTFFLEVBQWdGLElBQWhGO0FBQ0QsQ0F0SkQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgeyBHcmFwaFFMTm9uTnVsbCB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IGRlZXBjb3B5IGZyb20gJ2RlZXBjb3B5JztcbmltcG9ydCB7IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQgfSBmcm9tICdncmFwaHFsLXJlbGF5JztcbmltcG9ydCAqIGFzIHNjaGVtYVR5cGVzIGZyb20gJy4vc2NoZW1hVHlwZXMnO1xuaW1wb3J0IHsgdHJhbnNmb3JtVG9QYXJzZSwgdHJhbnNmb3JtVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL3NjaGVtYUZpZWxkcyc7XG5pbXBvcnQgeyBlbmZvcmNlTWFzdGVyS2V5QWNjZXNzIH0gZnJvbSAnLi4vcGFyc2VHcmFwaFFMVXRpbHMnO1xuaW1wb3J0IHsgZ2V0Q2xhc3MgfSBmcm9tICcuL3NjaGVtYVF1ZXJpZXMnO1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgY29uc3QgY3JlYXRlQ2xhc3NNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdDcmVhdGVDbGFzcycsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIGNyZWF0ZUNsYXNzIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGNyZWF0ZSB0aGUgc2NoZW1hIGZvciBhIG5ldyBvYmplY3QgY2xhc3MuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgbmFtZTogc2NoZW1hVHlwZXMuQ0xBU1NfTkFNRV9BVFQsXG4gICAgICBzY2hlbWFGaWVsZHM6IHtcbiAgICAgICAgZGVzY3JpcHRpb246IFwiVGhlc2UgYXJlIHRoZSBzY2hlbWEncyBmaWVsZHMgb2YgdGhlIG9iamVjdCBjbGFzcy5cIixcbiAgICAgICAgdHlwZTogc2NoZW1hVHlwZXMuU0NIRU1BX0ZJRUxEU19JTlBVVCxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIGNsYXNzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgY3JlYXRlZCBjbGFzcy4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoc2NoZW1hVHlwZXMuQ0xBU1MpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0KSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IG5hbWUsIHNjaGVtYUZpZWxkcyB9ID0gZGVlcGNvcHkoYXJncyk7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoIH0gPSBjb250ZXh0O1xuXG4gICAgICAgIGVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MoYXV0aCk7XG5cbiAgICAgICAgaWYgKGF1dGguaXNSZWFkT25seSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgICAgICBcInJlYWQtb25seSBtYXN0ZXJLZXkgaXNuJ3QgYWxsb3dlZCB0byBjcmVhdGUgYSBzY2hlbWEuXCJcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qgc2NoZW1hID0gYXdhaXQgY29uZmlnLmRhdGFiYXNlLmxvYWRTY2hlbWEoeyBjbGVhckNhY2hlOiB0cnVlIH0pO1xuICAgICAgICBjb25zdCBwYXJzZUNsYXNzID0gYXdhaXQgc2NoZW1hLmFkZENsYXNzSWZOb3RFeGlzdHMobmFtZSwgdHJhbnNmb3JtVG9QYXJzZShzY2hlbWFGaWVsZHMpKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBjbGFzczoge1xuICAgICAgICAgICAgbmFtZTogcGFyc2VDbGFzcy5jbGFzc05hbWUsXG4gICAgICAgICAgICBzY2hlbWFGaWVsZHM6IHRyYW5zZm9ybVRvR3JhcGhRTChwYXJzZUNsYXNzLmZpZWxkcyksXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjcmVhdGVDbGFzc011dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY3JlYXRlQ2xhc3NNdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbignY3JlYXRlQ2xhc3MnLCBjcmVhdGVDbGFzc011dGF0aW9uLCB0cnVlLCB0cnVlKTtcblxuICBjb25zdCB1cGRhdGVDbGFzc011dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ1VwZGF0ZUNsYXNzJyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdUaGUgdXBkYXRlQ2xhc3MgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gdXBkYXRlIHRoZSBzY2hlbWEgZm9yIGFuIGV4aXN0aW5nIG9iamVjdCBjbGFzcy4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICBuYW1lOiBzY2hlbWFUeXBlcy5DTEFTU19OQU1FX0FUVCxcbiAgICAgIHNjaGVtYUZpZWxkczoge1xuICAgICAgICBkZXNjcmlwdGlvbjogXCJUaGVzZSBhcmUgdGhlIHNjaGVtYSdzIGZpZWxkcyBvZiB0aGUgb2JqZWN0IGNsYXNzLlwiLFxuICAgICAgICB0eXBlOiBzY2hlbWFUeXBlcy5TQ0hFTUFfRklFTERTX0lOUFVULFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgY2xhc3M6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB1cGRhdGVkIGNsYXNzLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChzY2hlbWFUeXBlcy5DTEFTUyksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgbmFtZSwgc2NoZW1hRmllbGRzIH0gPSBkZWVwY29weShhcmdzKTtcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGggfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgZW5mb3JjZU1hc3RlcktleUFjY2VzcyhhdXRoKTtcblxuICAgICAgICBpZiAoYXV0aC5pc1JlYWRPbmx5KSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgICAgIFwicmVhZC1vbmx5IG1hc3RlcktleSBpc24ndCBhbGxvd2VkIHRvIHVwZGF0ZSBhIHNjaGVtYS5cIlxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBzY2hlbWEgPSBhd2FpdCBjb25maWcuZGF0YWJhc2UubG9hZFNjaGVtYSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nUGFyc2VDbGFzcyA9IGF3YWl0IGdldENsYXNzKG5hbWUsIHNjaGVtYSk7XG4gICAgICAgIGNvbnN0IHBhcnNlQ2xhc3MgPSBhd2FpdCBzY2hlbWEudXBkYXRlQ2xhc3MoXG4gICAgICAgICAgbmFtZSxcbiAgICAgICAgICB0cmFuc2Zvcm1Ub1BhcnNlKHNjaGVtYUZpZWxkcywgZXhpc3RpbmdQYXJzZUNsYXNzLmZpZWxkcyksXG4gICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICBjb25maWcuZGF0YWJhc2VcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBjbGFzczoge1xuICAgICAgICAgICAgbmFtZTogcGFyc2VDbGFzcy5jbGFzc05hbWUsXG4gICAgICAgICAgICBzY2hlbWFGaWVsZHM6IHRyYW5zZm9ybVRvR3JhcGhRTChwYXJzZUNsYXNzLmZpZWxkcyksXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZSh1cGRhdGVDbGFzc011dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUodXBkYXRlQ2xhc3NNdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbigndXBkYXRlQ2xhc3MnLCB1cGRhdGVDbGFzc011dGF0aW9uLCB0cnVlLCB0cnVlKTtcblxuICBjb25zdCBkZWxldGVDbGFzc011dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ0RlbGV0ZUNsYXNzJyxcbiAgICBkZXNjcmlwdGlvbjogJ1RoZSBkZWxldGVDbGFzcyBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBkZWxldGUgYW4gZXhpc3Rpbmcgb2JqZWN0IGNsYXNzLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIG5hbWU6IHNjaGVtYVR5cGVzLkNMQVNTX05BTUVfQVRULFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICBjbGFzczoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGRlbGV0ZWQgY2xhc3MuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKHNjaGVtYVR5cGVzLkNMQVNTKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyBuYW1lIH0gPSBkZWVwY29weShhcmdzKTtcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGggfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgZW5mb3JjZU1hc3RlcktleUFjY2VzcyhhdXRoKTtcblxuICAgICAgICBpZiAoYXV0aC5pc1JlYWRPbmx5KSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgICAgIFwicmVhZC1vbmx5IG1hc3RlcktleSBpc24ndCBhbGxvd2VkIHRvIGRlbGV0ZSBhIHNjaGVtYS5cIlxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBzY2hlbWEgPSBhd2FpdCBjb25maWcuZGF0YWJhc2UubG9hZFNjaGVtYSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nUGFyc2VDbGFzcyA9IGF3YWl0IGdldENsYXNzKG5hbWUsIHNjaGVtYSk7XG4gICAgICAgIGF3YWl0IGNvbmZpZy5kYXRhYmFzZS5kZWxldGVTY2hlbWEobmFtZSk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgY2xhc3M6IHtcbiAgICAgICAgICAgIG5hbWU6IGV4aXN0aW5nUGFyc2VDbGFzcy5jbGFzc05hbWUsXG4gICAgICAgICAgICBzY2hlbWFGaWVsZHM6IHRyYW5zZm9ybVRvR3JhcGhRTChleGlzdGluZ1BhcnNlQ2xhc3MuZmllbGRzKSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGRlbGV0ZUNsYXNzTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShkZWxldGVDbGFzc011dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdkZWxldGVDbGFzcycsIGRlbGV0ZUNsYXNzTXV0YXRpb24sIHRydWUsIHRydWUpO1xufTtcblxuZXhwb3J0IHsgbG9hZCB9O1xuIl19