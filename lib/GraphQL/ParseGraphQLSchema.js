"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseGraphQLSchema = void 0;
var _node = _interopRequireDefault(require("parse/node"));
var _graphql = require("graphql");
var _schema = require("@graphql-tools/schema");
var _merge = require("@graphql-tools/merge");
var _util = require("util");
var _requiredParameter = _interopRequireDefault(require("../requiredParameter"));
var defaultGraphQLTypes = _interopRequireWildcard(require("./loaders/defaultGraphQLTypes"));
var parseClassTypes = _interopRequireWildcard(require("./loaders/parseClassTypes"));
var parseClassQueries = _interopRequireWildcard(require("./loaders/parseClassQueries"));
var parseClassMutations = _interopRequireWildcard(require("./loaders/parseClassMutations"));
var defaultGraphQLQueries = _interopRequireWildcard(require("./loaders/defaultGraphQLQueries"));
var defaultGraphQLMutations = _interopRequireWildcard(require("./loaders/defaultGraphQLMutations"));
var _ParseGraphQLController = _interopRequireWildcard(require("../Controllers/ParseGraphQLController"));
var _DatabaseController = _interopRequireDefault(require("../Controllers/DatabaseController"));
var _SchemaCache = _interopRequireDefault(require("../Adapters/Cache/SchemaCache"));
var _parseGraphQLUtils = require("./parseGraphQLUtils");
var schemaDirectives = _interopRequireWildcard(require("./loaders/schemaDirectives"));
var schemaTypes = _interopRequireWildcard(require("./loaders/schemaTypes"));
var _triggers = require("../triggers");
var defaultRelaySchema = _interopRequireWildcard(require("./loaders/defaultRelaySchema"));
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const RESERVED_GRAPHQL_TYPE_NAMES = ['String', 'Boolean', 'Int', 'Float', 'ID', 'ArrayResult', 'Query', 'Mutation', 'Subscription', 'CreateFileInput', 'CreateFilePayload', 'Viewer', 'SignUpInput', 'SignUpPayload', 'LogInInput', 'LogInPayload', 'LogOutInput', 'LogOutPayload', 'CloudCodeFunction', 'CallCloudCodeInput', 'CallCloudCodePayload', 'CreateClassInput', 'CreateClassPayload', 'UpdateClassInput', 'UpdateClassPayload', 'DeleteClassInput', 'DeleteClassPayload', 'PageInfo'];
const RESERVED_GRAPHQL_QUERY_NAMES = ['health', 'viewer', 'class', 'classes'];
const RESERVED_GRAPHQL_MUTATION_NAMES = ['signUp', 'logIn', 'logOut', 'createFile', 'callCloudCode', 'createClass', 'updateClass', 'deleteClass'];
class ParseGraphQLSchema {
  constructor(params = {}) {
    this.parseGraphQLController = params.parseGraphQLController || (0, _requiredParameter.default)('You must provide a parseGraphQLController instance!');
    this.databaseController = params.databaseController || (0, _requiredParameter.default)('You must provide a databaseController instance!');
    this.log = params.log || (0, _requiredParameter.default)('You must provide a log instance!');
    this.graphQLCustomTypeDefs = params.graphQLCustomTypeDefs;
    this.appId = params.appId || (0, _requiredParameter.default)('You must provide the appId!');
    this.schemaCache = _SchemaCache.default;
    this.logCache = {};
  }
  async load() {
    const {
      parseGraphQLConfig
    } = await this._initializeSchemaAndConfig();
    const parseClassesArray = await this._getClassesForSchema(parseGraphQLConfig);
    const functionNames = await this._getFunctionNames();
    const functionNamesString = functionNames.join();
    const parseClasses = parseClassesArray.reduce((acc, clazz) => {
      acc[clazz.className] = clazz;
      return acc;
    }, {});
    if (!this._hasSchemaInputChanged({
      parseClasses,
      parseGraphQLConfig,
      functionNamesString
    })) {
      return this.graphQLSchema;
    }
    this.parseClasses = parseClasses;
    this.parseGraphQLConfig = parseGraphQLConfig;
    this.functionNames = functionNames;
    this.functionNamesString = functionNamesString;
    this.parseClassTypes = {};
    this.viewerType = null;
    this.graphQLAutoSchema = null;
    this.graphQLSchema = null;
    this.graphQLTypes = [];
    this.graphQLQueries = {};
    this.graphQLMutations = {};
    this.graphQLSubscriptions = {};
    this.graphQLSchemaDirectivesDefinitions = null;
    this.graphQLSchemaDirectives = {};
    this.relayNodeInterface = null;
    defaultGraphQLTypes.load(this);
    defaultRelaySchema.load(this);
    schemaTypes.load(this);
    this._getParseClassesWithConfig(parseClassesArray, parseGraphQLConfig).forEach(([parseClass, parseClassConfig]) => {
      // Some times schema return the _auth_data_ field
      // it will lead to unstable graphql generation order
      if (parseClass.className === '_User') {
        Object.keys(parseClass.fields).forEach(fieldName => {
          if (fieldName.startsWith('_auth_data_')) {
            delete parseClass.fields[fieldName];
          }
        });
      }

      // Fields order inside the schema seems to not be consistent across
      // restart so we need to ensure an alphabetical order
      // also it's better for the playground documentation
      const orderedFields = {};
      Object.keys(parseClass.fields).sort().forEach(fieldName => {
        orderedFields[fieldName] = parseClass.fields[fieldName];
      });
      parseClass.fields = orderedFields;
      parseClassTypes.load(this, parseClass, parseClassConfig);
      parseClassQueries.load(this, parseClass, parseClassConfig);
      parseClassMutations.load(this, parseClass, parseClassConfig);
    });
    defaultGraphQLTypes.loadArrayResult(this, parseClassesArray);
    defaultGraphQLQueries.load(this);
    defaultGraphQLMutations.load(this);
    let graphQLQuery = undefined;
    if (Object.keys(this.graphQLQueries).length > 0) {
      graphQLQuery = new _graphql.GraphQLObjectType({
        name: 'Query',
        description: 'Query is the top level type for queries.',
        fields: this.graphQLQueries
      });
      this.addGraphQLType(graphQLQuery, true, true);
    }
    let graphQLMutation = undefined;
    if (Object.keys(this.graphQLMutations).length > 0) {
      graphQLMutation = new _graphql.GraphQLObjectType({
        name: 'Mutation',
        description: 'Mutation is the top level type for mutations.',
        fields: this.graphQLMutations
      });
      this.addGraphQLType(graphQLMutation, true, true);
    }
    let graphQLSubscription = undefined;
    if (Object.keys(this.graphQLSubscriptions).length > 0) {
      graphQLSubscription = new _graphql.GraphQLObjectType({
        name: 'Subscription',
        description: 'Subscription is the top level type for subscriptions.',
        fields: this.graphQLSubscriptions
      });
      this.addGraphQLType(graphQLSubscription, true, true);
    }
    this.graphQLAutoSchema = new _graphql.GraphQLSchema({
      types: this.graphQLTypes,
      query: graphQLQuery,
      mutation: graphQLMutation,
      subscription: graphQLSubscription
    });
    if (this.graphQLCustomTypeDefs) {
      schemaDirectives.load(this);
      if (typeof this.graphQLCustomTypeDefs.getTypeMap === 'function') {
        // In following code we use underscore attr to keep the direct variable reference
        const customGraphQLSchemaTypeMap = this.graphQLCustomTypeDefs._typeMap;
        const findAndReplaceLastType = (parent, key) => {
          if (parent[key].name) {
            if (this.graphQLAutoSchema._typeMap[parent[key].name] && this.graphQLAutoSchema._typeMap[parent[key].name] !== parent[key]) {
              // To avoid unresolved field on overloaded schema
              // replace the final type with the auto schema one
              parent[key] = this.graphQLAutoSchema._typeMap[parent[key].name];
            }
          } else {
            if (parent[key].ofType) {
              findAndReplaceLastType(parent[key], 'ofType');
            }
          }
        };
        // Add non shared types from custom schema to auto schema
        // note: some non shared types can use some shared types
        // so this code need to be ran before the shared types addition
        // we use sort to ensure schema consistency over restarts
        Object.keys(customGraphQLSchemaTypeMap).sort().forEach(customGraphQLSchemaTypeKey => {
          const customGraphQLSchemaType = customGraphQLSchemaTypeMap[customGraphQLSchemaTypeKey];
          if (!customGraphQLSchemaType || !customGraphQLSchemaType.name || customGraphQLSchemaType.name.startsWith('__')) {
            return;
          }
          const autoGraphQLSchemaType = this.graphQLAutoSchema._typeMap[customGraphQLSchemaType.name];
          if (!autoGraphQLSchemaType) {
            this.graphQLAutoSchema._typeMap[customGraphQLSchemaType.name] = customGraphQLSchemaType;
          }
        });
        // Handle shared types
        // We pass through each type and ensure that all sub field types are replaced
        // we use sort to ensure schema consistency over restarts
        Object.keys(customGraphQLSchemaTypeMap).sort().forEach(customGraphQLSchemaTypeKey => {
          const customGraphQLSchemaType = customGraphQLSchemaTypeMap[customGraphQLSchemaTypeKey];
          if (!customGraphQLSchemaType || !customGraphQLSchemaType.name || customGraphQLSchemaType.name.startsWith('__')) {
            return;
          }
          const autoGraphQLSchemaType = this.graphQLAutoSchema._typeMap[customGraphQLSchemaType.name];
          if (autoGraphQLSchemaType && typeof customGraphQLSchemaType.getFields === 'function') {
            Object.keys(customGraphQLSchemaType._fields).sort().forEach(fieldKey => {
              const field = customGraphQLSchemaType._fields[fieldKey];
              findAndReplaceLastType(field, 'type');
              autoGraphQLSchemaType._fields[field.name] = field;
            });
          }
        });
        this.graphQLSchema = this.graphQLAutoSchema;
      } else if (typeof this.graphQLCustomTypeDefs === 'function') {
        this.graphQLSchema = await this.graphQLCustomTypeDefs({
          directivesDefinitionsSchema: this.graphQLSchemaDirectivesDefinitions,
          autoSchema: this.graphQLAutoSchema,
          graphQLSchemaDirectives: this.graphQLSchemaDirectives
        });
      } else {
        this.graphQLSchema = (0, _schema.mergeSchemas)({
          schemas: [this.graphQLAutoSchema],
          typeDefs: (0, _merge.mergeTypeDefs)([this.graphQLCustomTypeDefs, this.graphQLSchemaDirectivesDefinitions])
        });
        this.graphQLSchema = this.graphQLSchemaDirectives(this.graphQLSchema);
      }
    } else {
      this.graphQLSchema = this.graphQLAutoSchema;
    }
    return this.graphQLSchema;
  }
  _logOnce(severity, message) {
    if (this.logCache[message]) {
      return;
    }
    this.log[severity](message);
    this.logCache[message] = true;
  }
  addGraphQLType(type, throwError = false, ignoreReserved = false, ignoreConnection = false) {
    if (!ignoreReserved && RESERVED_GRAPHQL_TYPE_NAMES.includes(type.name) || this.graphQLTypes.find(existingType => existingType.name === type.name) || !ignoreConnection && type.name.endsWith('Connection')) {
      const message = `Type ${type.name} could not be added to the auto schema because it collided with an existing type.`;
      if (throwError) {
        throw new Error(message);
      }
      this._logOnce('warn', message);
      return undefined;
    }
    this.graphQLTypes.push(type);
    return type;
  }
  addGraphQLQuery(fieldName, field, throwError = false, ignoreReserved = false) {
    if (!ignoreReserved && RESERVED_GRAPHQL_QUERY_NAMES.includes(fieldName) || this.graphQLQueries[fieldName]) {
      const message = `Query ${fieldName} could not be added to the auto schema because it collided with an existing field.`;
      if (throwError) {
        throw new Error(message);
      }
      this._logOnce('warn', message);
      return undefined;
    }
    this.graphQLQueries[fieldName] = field;
    return field;
  }
  addGraphQLMutation(fieldName, field, throwError = false, ignoreReserved = false) {
    if (!ignoreReserved && RESERVED_GRAPHQL_MUTATION_NAMES.includes(fieldName) || this.graphQLMutations[fieldName]) {
      const message = `Mutation ${fieldName} could not be added to the auto schema because it collided with an existing field.`;
      if (throwError) {
        throw new Error(message);
      }
      this._logOnce('warn', message);
      return undefined;
    }
    this.graphQLMutations[fieldName] = field;
    return field;
  }
  handleError(error) {
    if (error instanceof _node.default.Error) {
      this.log.error('Parse error: ', error);
    } else {
      this.log.error('Uncaught internal server error.', error, error.stack);
    }
    throw (0, _parseGraphQLUtils.toGraphQLError)(error);
  }
  async _initializeSchemaAndConfig() {
    const [schemaController, parseGraphQLConfig] = await Promise.all([this.databaseController.loadSchema(), this.parseGraphQLController.getGraphQLConfig()]);
    this.schemaController = schemaController;
    return {
      parseGraphQLConfig
    };
  }

  /**
   * Gets all classes found by the `schemaController`
   * minus those filtered out by the app's parseGraphQLConfig.
   */
  async _getClassesForSchema(parseGraphQLConfig) {
    const {
      enabledForClasses,
      disabledForClasses
    } = parseGraphQLConfig;
    const allClasses = await this.schemaController.getAllClasses();
    if (Array.isArray(enabledForClasses) || Array.isArray(disabledForClasses)) {
      let includedClasses = allClasses;
      if (enabledForClasses) {
        includedClasses = allClasses.filter(clazz => {
          return enabledForClasses.includes(clazz.className);
        });
      }
      if (disabledForClasses) {
        // Classes included in `enabledForClasses` that
        // are also present in `disabledForClasses` will
        // still be filtered out
        includedClasses = includedClasses.filter(clazz => {
          return !disabledForClasses.includes(clazz.className);
        });
      }
      this.isUsersClassDisabled = !includedClasses.some(clazz => {
        return clazz.className === '_User';
      });
      return includedClasses;
    } else {
      return allClasses;
    }
  }

  /**
   * This method returns a list of tuples
   * that provide the parseClass along with
   * its parseClassConfig where provided.
   */
  _getParseClassesWithConfig(parseClasses, parseGraphQLConfig) {
    const {
      classConfigs
    } = parseGraphQLConfig;

    // Make sures that the default classes and classes that
    // starts with capitalized letter will be generated first.
    const sortClasses = (a, b) => {
      a = a.className;
      b = b.className;
      if (a[0] === '_') {
        if (b[0] !== '_') {
          return -1;
        }
      }
      if (b[0] === '_') {
        if (a[0] !== '_') {
          return 1;
        }
      }
      if (a === b) {
        return 0;
      } else if (a < b) {
        return -1;
      } else {
        return 1;
      }
    };
    return parseClasses.sort(sortClasses).map(parseClass => {
      let parseClassConfig;
      if (classConfigs) {
        parseClassConfig = classConfigs.find(c => c.className === parseClass.className);
      }
      return [parseClass, parseClassConfig];
    });
  }
  async _getFunctionNames() {
    return await (0, _triggers.getFunctionNames)(this.appId).filter(functionName => {
      if (/^[_a-zA-Z][_a-zA-Z0-9]*$/.test(functionName)) {
        return true;
      } else {
        this._logOnce('warn', `Function ${functionName} could not be added to the auto schema because GraphQL names must match /^[_a-zA-Z][_a-zA-Z0-9]*$/.`);
        return false;
      }
    });
  }

  /**
   * Checks for changes to the parseClasses
   * objects (i.e. database schema) or to
   * the parseGraphQLConfig object. If no
   * changes are found, return true;
   */
  _hasSchemaInputChanged(params) {
    const {
      parseClasses,
      parseGraphQLConfig,
      functionNamesString
    } = params;

    // First init
    if (!this.graphQLSchema) {
      return true;
    }
    if ((0, _util.isDeepStrictEqual)(this.parseGraphQLConfig, parseGraphQLConfig) && this.functionNamesString === functionNamesString && (0, _util.isDeepStrictEqual)(this.parseClasses, parseClasses)) {
      return false;
    }
    return true;
  }
}
exports.ParseGraphQLSchema = ParseGraphQLSchema;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSRVNFUlZFRF9HUkFQSFFMX1RZUEVfTkFNRVMiLCJSRVNFUlZFRF9HUkFQSFFMX1FVRVJZX05BTUVTIiwiUkVTRVJWRURfR1JBUEhRTF9NVVRBVElPTl9OQU1FUyIsIlBhcnNlR3JhcGhRTFNjaGVtYSIsImNvbnN0cnVjdG9yIiwicGFyYW1zIiwicGFyc2VHcmFwaFFMQ29udHJvbGxlciIsInJlcXVpcmVkUGFyYW1ldGVyIiwiZGF0YWJhc2VDb250cm9sbGVyIiwibG9nIiwiZ3JhcGhRTEN1c3RvbVR5cGVEZWZzIiwiYXBwSWQiLCJzY2hlbWFDYWNoZSIsIlNjaGVtYUNhY2hlIiwibG9nQ2FjaGUiLCJsb2FkIiwicGFyc2VHcmFwaFFMQ29uZmlnIiwiX2luaXRpYWxpemVTY2hlbWFBbmRDb25maWciLCJwYXJzZUNsYXNzZXNBcnJheSIsIl9nZXRDbGFzc2VzRm9yU2NoZW1hIiwiZnVuY3Rpb25OYW1lcyIsIl9nZXRGdW5jdGlvbk5hbWVzIiwiZnVuY3Rpb25OYW1lc1N0cmluZyIsImpvaW4iLCJwYXJzZUNsYXNzZXMiLCJyZWR1Y2UiLCJhY2MiLCJjbGF6eiIsImNsYXNzTmFtZSIsIl9oYXNTY2hlbWFJbnB1dENoYW5nZWQiLCJncmFwaFFMU2NoZW1hIiwicGFyc2VDbGFzc1R5cGVzIiwidmlld2VyVHlwZSIsImdyYXBoUUxBdXRvU2NoZW1hIiwiZ3JhcGhRTFR5cGVzIiwiZ3JhcGhRTFF1ZXJpZXMiLCJncmFwaFFMTXV0YXRpb25zIiwiZ3JhcGhRTFN1YnNjcmlwdGlvbnMiLCJncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zIiwiZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXMiLCJyZWxheU5vZGVJbnRlcmZhY2UiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiZGVmYXVsdFJlbGF5U2NoZW1hIiwic2NoZW1hVHlwZXMiLCJfZ2V0UGFyc2VDbGFzc2VzV2l0aENvbmZpZyIsImZvckVhY2giLCJwYXJzZUNsYXNzIiwicGFyc2VDbGFzc0NvbmZpZyIsIk9iamVjdCIsImtleXMiLCJmaWVsZHMiLCJmaWVsZE5hbWUiLCJzdGFydHNXaXRoIiwib3JkZXJlZEZpZWxkcyIsInNvcnQiLCJwYXJzZUNsYXNzUXVlcmllcyIsInBhcnNlQ2xhc3NNdXRhdGlvbnMiLCJsb2FkQXJyYXlSZXN1bHQiLCJkZWZhdWx0R3JhcGhRTFF1ZXJpZXMiLCJkZWZhdWx0R3JhcGhRTE11dGF0aW9ucyIsImdyYXBoUUxRdWVyeSIsInVuZGVmaW5lZCIsImxlbmd0aCIsIkdyYXBoUUxPYmplY3RUeXBlIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiYWRkR3JhcGhRTFR5cGUiLCJncmFwaFFMTXV0YXRpb24iLCJncmFwaFFMU3Vic2NyaXB0aW9uIiwiR3JhcGhRTFNjaGVtYSIsInR5cGVzIiwicXVlcnkiLCJtdXRhdGlvbiIsInN1YnNjcmlwdGlvbiIsInNjaGVtYURpcmVjdGl2ZXMiLCJnZXRUeXBlTWFwIiwiY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXAiLCJfdHlwZU1hcCIsImZpbmRBbmRSZXBsYWNlTGFzdFR5cGUiLCJwYXJlbnQiLCJrZXkiLCJvZlR5cGUiLCJjdXN0b21HcmFwaFFMU2NoZW1hVHlwZUtleSIsImN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlIiwiYXV0b0dyYXBoUUxTY2hlbWFUeXBlIiwiZ2V0RmllbGRzIiwiX2ZpZWxkcyIsImZpZWxkS2V5IiwiZmllbGQiLCJkaXJlY3RpdmVzRGVmaW5pdGlvbnNTY2hlbWEiLCJhdXRvU2NoZW1hIiwibWVyZ2VTY2hlbWFzIiwic2NoZW1hcyIsInR5cGVEZWZzIiwibWVyZ2VUeXBlRGVmcyIsIl9sb2dPbmNlIiwic2V2ZXJpdHkiLCJtZXNzYWdlIiwidHlwZSIsInRocm93RXJyb3IiLCJpZ25vcmVSZXNlcnZlZCIsImlnbm9yZUNvbm5lY3Rpb24iLCJpbmNsdWRlcyIsImZpbmQiLCJleGlzdGluZ1R5cGUiLCJlbmRzV2l0aCIsIkVycm9yIiwicHVzaCIsImFkZEdyYXBoUUxRdWVyeSIsImFkZEdyYXBoUUxNdXRhdGlvbiIsImhhbmRsZUVycm9yIiwiZXJyb3IiLCJQYXJzZSIsInN0YWNrIiwidG9HcmFwaFFMRXJyb3IiLCJzY2hlbWFDb250cm9sbGVyIiwiUHJvbWlzZSIsImFsbCIsImxvYWRTY2hlbWEiLCJnZXRHcmFwaFFMQ29uZmlnIiwiZW5hYmxlZEZvckNsYXNzZXMiLCJkaXNhYmxlZEZvckNsYXNzZXMiLCJhbGxDbGFzc2VzIiwiZ2V0QWxsQ2xhc3NlcyIsIkFycmF5IiwiaXNBcnJheSIsImluY2x1ZGVkQ2xhc3NlcyIsImZpbHRlciIsImlzVXNlcnNDbGFzc0Rpc2FibGVkIiwic29tZSIsImNsYXNzQ29uZmlncyIsInNvcnRDbGFzc2VzIiwiYSIsImIiLCJtYXAiLCJjIiwiZ2V0RnVuY3Rpb25OYW1lcyIsImZ1bmN0aW9uTmFtZSIsInRlc3QiLCJpc0RlZXBTdHJpY3RFcXVhbCJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9HcmFwaFFML1BhcnNlR3JhcGhRTFNjaGVtYS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgeyBHcmFwaFFMU2NoZW1hLCBHcmFwaFFMT2JqZWN0VHlwZSwgRG9jdW1lbnROb2RlLCBHcmFwaFFMTmFtZWRUeXBlIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBtZXJnZVNjaGVtYXMgfSBmcm9tICdAZ3JhcGhxbC10b29scy9zY2hlbWEnO1xuaW1wb3J0IHsgbWVyZ2VUeXBlRGVmcyB9IGZyb20gJ0BncmFwaHFsLXRvb2xzL21lcmdlJztcbmltcG9ydCB7IGlzRGVlcFN0cmljdEVxdWFsIH0gZnJvbSAndXRpbCc7XG5pbXBvcnQgcmVxdWlyZWRQYXJhbWV0ZXIgZnJvbSAnLi4vcmVxdWlyZWRQYXJhbWV0ZXInO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgKiBhcyBwYXJzZUNsYXNzVHlwZXMgZnJvbSAnLi9sb2FkZXJzL3BhcnNlQ2xhc3NUeXBlcyc7XG5pbXBvcnQgKiBhcyBwYXJzZUNsYXNzUXVlcmllcyBmcm9tICcuL2xvYWRlcnMvcGFyc2VDbGFzc1F1ZXJpZXMnO1xuaW1wb3J0ICogYXMgcGFyc2VDbGFzc011dGF0aW9ucyBmcm9tICcuL2xvYWRlcnMvcGFyc2VDbGFzc011dGF0aW9ucyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFF1ZXJpZXMgZnJvbSAnLi9sb2FkZXJzL2RlZmF1bHRHcmFwaFFMUXVlcmllcyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTE11dGF0aW9ucyBmcm9tICcuL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxNdXRhdGlvbnMnO1xuaW1wb3J0IFBhcnNlR3JhcGhRTENvbnRyb2xsZXIsIHsgUGFyc2VHcmFwaFFMQ29uZmlnIH0gZnJvbSAnLi4vQ29udHJvbGxlcnMvUGFyc2VHcmFwaFFMQ29udHJvbGxlcic7XG5pbXBvcnQgRGF0YWJhc2VDb250cm9sbGVyIGZyb20gJy4uL0NvbnRyb2xsZXJzL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgU2NoZW1hQ2FjaGUgZnJvbSAnLi4vQWRhcHRlcnMvQ2FjaGUvU2NoZW1hQ2FjaGUnO1xuaW1wb3J0IHsgdG9HcmFwaFFMRXJyb3IgfSBmcm9tICcuL3BhcnNlR3JhcGhRTFV0aWxzJztcbmltcG9ydCAqIGFzIHNjaGVtYURpcmVjdGl2ZXMgZnJvbSAnLi9sb2FkZXJzL3NjaGVtYURpcmVjdGl2ZXMnO1xuaW1wb3J0ICogYXMgc2NoZW1hVHlwZXMgZnJvbSAnLi9sb2FkZXJzL3NjaGVtYVR5cGVzJztcbmltcG9ydCB7IGdldEZ1bmN0aW9uTmFtZXMgfSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0UmVsYXlTY2hlbWEgZnJvbSAnLi9sb2FkZXJzL2RlZmF1bHRSZWxheVNjaGVtYSc7XG5cbmNvbnN0IFJFU0VSVkVEX0dSQVBIUUxfVFlQRV9OQU1FUyA9IFtcbiAgJ1N0cmluZycsXG4gICdCb29sZWFuJyxcbiAgJ0ludCcsXG4gICdGbG9hdCcsXG4gICdJRCcsXG4gICdBcnJheVJlc3VsdCcsXG4gICdRdWVyeScsXG4gICdNdXRhdGlvbicsXG4gICdTdWJzY3JpcHRpb24nLFxuICAnQ3JlYXRlRmlsZUlucHV0JyxcbiAgJ0NyZWF0ZUZpbGVQYXlsb2FkJyxcbiAgJ1ZpZXdlcicsXG4gICdTaWduVXBJbnB1dCcsXG4gICdTaWduVXBQYXlsb2FkJyxcbiAgJ0xvZ0luSW5wdXQnLFxuICAnTG9nSW5QYXlsb2FkJyxcbiAgJ0xvZ091dElucHV0JyxcbiAgJ0xvZ091dFBheWxvYWQnLFxuICAnQ2xvdWRDb2RlRnVuY3Rpb24nLFxuICAnQ2FsbENsb3VkQ29kZUlucHV0JyxcbiAgJ0NhbGxDbG91ZENvZGVQYXlsb2FkJyxcbiAgJ0NyZWF0ZUNsYXNzSW5wdXQnLFxuICAnQ3JlYXRlQ2xhc3NQYXlsb2FkJyxcbiAgJ1VwZGF0ZUNsYXNzSW5wdXQnLFxuICAnVXBkYXRlQ2xhc3NQYXlsb2FkJyxcbiAgJ0RlbGV0ZUNsYXNzSW5wdXQnLFxuICAnRGVsZXRlQ2xhc3NQYXlsb2FkJyxcbiAgJ1BhZ2VJbmZvJyxcbl07XG5jb25zdCBSRVNFUlZFRF9HUkFQSFFMX1FVRVJZX05BTUVTID0gWydoZWFsdGgnLCAndmlld2VyJywgJ2NsYXNzJywgJ2NsYXNzZXMnXTtcbmNvbnN0IFJFU0VSVkVEX0dSQVBIUUxfTVVUQVRJT05fTkFNRVMgPSBbXG4gICdzaWduVXAnLFxuICAnbG9nSW4nLFxuICAnbG9nT3V0JyxcbiAgJ2NyZWF0ZUZpbGUnLFxuICAnY2FsbENsb3VkQ29kZScsXG4gICdjcmVhdGVDbGFzcycsXG4gICd1cGRhdGVDbGFzcycsXG4gICdkZWxldGVDbGFzcycsXG5dO1xuXG5jbGFzcyBQYXJzZUdyYXBoUUxTY2hlbWEge1xuICBkYXRhYmFzZUNvbnRyb2xsZXI6IERhdGFiYXNlQ29udHJvbGxlcjtcbiAgcGFyc2VHcmFwaFFMQ29udHJvbGxlcjogUGFyc2VHcmFwaFFMQ29udHJvbGxlcjtcbiAgcGFyc2VHcmFwaFFMQ29uZmlnOiBQYXJzZUdyYXBoUUxDb25maWc7XG4gIGxvZzogYW55O1xuICBhcHBJZDogc3RyaW5nO1xuICBncmFwaFFMQ3VzdG9tVHlwZURlZnM6ID8oc3RyaW5nIHwgR3JhcGhRTFNjaGVtYSB8IERvY3VtZW50Tm9kZSB8IEdyYXBoUUxOYW1lZFR5cGVbXSk7XG4gIHNjaGVtYUNhY2hlOiBhbnk7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcGFyYW1zOiB7XG4gICAgICBkYXRhYmFzZUNvbnRyb2xsZXI6IERhdGFiYXNlQ29udHJvbGxlcixcbiAgICAgIHBhcnNlR3JhcGhRTENvbnRyb2xsZXI6IFBhcnNlR3JhcGhRTENvbnRyb2xsZXIsXG4gICAgICBsb2c6IGFueSxcbiAgICAgIGFwcElkOiBzdHJpbmcsXG4gICAgICBncmFwaFFMQ3VzdG9tVHlwZURlZnM6ID8oc3RyaW5nIHwgR3JhcGhRTFNjaGVtYSB8IERvY3VtZW50Tm9kZSB8IEdyYXBoUUxOYW1lZFR5cGVbXSksXG4gICAgfSA9IHt9XG4gICkge1xuICAgIHRoaXMucGFyc2VHcmFwaFFMQ29udHJvbGxlciA9XG4gICAgICBwYXJhbXMucGFyc2VHcmFwaFFMQ29udHJvbGxlciB8fFxuICAgICAgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBwYXJzZUdyYXBoUUxDb250cm9sbGVyIGluc3RhbmNlIScpO1xuICAgIHRoaXMuZGF0YWJhc2VDb250cm9sbGVyID1cbiAgICAgIHBhcmFtcy5kYXRhYmFzZUNvbnRyb2xsZXIgfHxcbiAgICAgIHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgZGF0YWJhc2VDb250cm9sbGVyIGluc3RhbmNlIScpO1xuICAgIHRoaXMubG9nID0gcGFyYW1zLmxvZyB8fCByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIGxvZyBpbnN0YW5jZSEnKTtcbiAgICB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcyA9IHBhcmFtcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnM7XG4gICAgdGhpcy5hcHBJZCA9IHBhcmFtcy5hcHBJZCB8fCByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSB0aGUgYXBwSWQhJyk7XG4gICAgdGhpcy5zY2hlbWFDYWNoZSA9IFNjaGVtYUNhY2hlO1xuICAgIHRoaXMubG9nQ2FjaGUgPSB7fTtcbiAgfVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgY29uc3QgeyBwYXJzZUdyYXBoUUxDb25maWcgfSA9IGF3YWl0IHRoaXMuX2luaXRpYWxpemVTY2hlbWFBbmRDb25maWcoKTtcbiAgICBjb25zdCBwYXJzZUNsYXNzZXNBcnJheSA9IGF3YWl0IHRoaXMuX2dldENsYXNzZXNGb3JTY2hlbWEocGFyc2VHcmFwaFFMQ29uZmlnKTtcbiAgICBjb25zdCBmdW5jdGlvbk5hbWVzID0gYXdhaXQgdGhpcy5fZ2V0RnVuY3Rpb25OYW1lcygpO1xuICAgIGNvbnN0IGZ1bmN0aW9uTmFtZXNTdHJpbmcgPSBmdW5jdGlvbk5hbWVzLmpvaW4oKTtcblxuICAgIGNvbnN0IHBhcnNlQ2xhc3NlcyA9IHBhcnNlQ2xhc3Nlc0FycmF5LnJlZHVjZSgoYWNjLCBjbGF6eikgPT4ge1xuICAgICAgYWNjW2NsYXp6LmNsYXNzTmFtZV0gPSBjbGF6ejtcbiAgICAgIHJldHVybiBhY2M7XG4gICAgfSwge30pO1xuICAgIGlmIChcbiAgICAgICF0aGlzLl9oYXNTY2hlbWFJbnB1dENoYW5nZWQoe1xuICAgICAgICBwYXJzZUNsYXNzZXMsXG4gICAgICAgIHBhcnNlR3JhcGhRTENvbmZpZyxcbiAgICAgICAgZnVuY3Rpb25OYW1lc1N0cmluZyxcbiAgICAgIH0pXG4gICAgKSB7XG4gICAgICByZXR1cm4gdGhpcy5ncmFwaFFMU2NoZW1hO1xuICAgIH1cblxuICAgIHRoaXMucGFyc2VDbGFzc2VzID0gcGFyc2VDbGFzc2VzO1xuICAgIHRoaXMucGFyc2VHcmFwaFFMQ29uZmlnID0gcGFyc2VHcmFwaFFMQ29uZmlnO1xuICAgIHRoaXMuZnVuY3Rpb25OYW1lcyA9IGZ1bmN0aW9uTmFtZXM7XG4gICAgdGhpcy5mdW5jdGlvbk5hbWVzU3RyaW5nID0gZnVuY3Rpb25OYW1lc1N0cmluZztcbiAgICB0aGlzLnBhcnNlQ2xhc3NUeXBlcyA9IHt9O1xuICAgIHRoaXMudmlld2VyVHlwZSA9IG51bGw7XG4gICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYSA9IG51bGw7XG4gICAgdGhpcy5ncmFwaFFMU2NoZW1hID0gbnVsbDtcbiAgICB0aGlzLmdyYXBoUUxUeXBlcyA9IFtdO1xuICAgIHRoaXMuZ3JhcGhRTFF1ZXJpZXMgPSB7fTtcbiAgICB0aGlzLmdyYXBoUUxNdXRhdGlvbnMgPSB7fTtcbiAgICB0aGlzLmdyYXBoUUxTdWJzY3JpcHRpb25zID0ge307XG4gICAgdGhpcy5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zID0gbnVsbDtcbiAgICB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzID0ge307XG4gICAgdGhpcy5yZWxheU5vZGVJbnRlcmZhY2UgPSBudWxsO1xuXG4gICAgZGVmYXVsdEdyYXBoUUxUeXBlcy5sb2FkKHRoaXMpO1xuICAgIGRlZmF1bHRSZWxheVNjaGVtYS5sb2FkKHRoaXMpO1xuICAgIHNjaGVtYVR5cGVzLmxvYWQodGhpcyk7XG5cbiAgICB0aGlzLl9nZXRQYXJzZUNsYXNzZXNXaXRoQ29uZmlnKHBhcnNlQ2xhc3Nlc0FycmF5LCBwYXJzZUdyYXBoUUxDb25maWcpLmZvckVhY2goXG4gICAgICAoW3BhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWddKSA9PiB7XG4gICAgICAgIC8vIFNvbWUgdGltZXMgc2NoZW1hIHJldHVybiB0aGUgX2F1dGhfZGF0YV8gZmllbGRcbiAgICAgICAgLy8gaXQgd2lsbCBsZWFkIHRvIHVuc3RhYmxlIGdyYXBocWwgZ2VuZXJhdGlvbiBvcmRlclxuICAgICAgICBpZiAocGFyc2VDbGFzcy5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgICAgICBPYmplY3Qua2V5cyhwYXJzZUNsYXNzLmZpZWxkcykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgaWYgKGZpZWxkTmFtZS5zdGFydHNXaXRoKCdfYXV0aF9kYXRhXycpKSB7XG4gICAgICAgICAgICAgIGRlbGV0ZSBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRmllbGRzIG9yZGVyIGluc2lkZSB0aGUgc2NoZW1hIHNlZW1zIHRvIG5vdCBiZSBjb25zaXN0ZW50IGFjcm9zc1xuICAgICAgICAvLyByZXN0YXJ0IHNvIHdlIG5lZWQgdG8gZW5zdXJlIGFuIGFscGhhYmV0aWNhbCBvcmRlclxuICAgICAgICAvLyBhbHNvIGl0J3MgYmV0dGVyIGZvciB0aGUgcGxheWdyb3VuZCBkb2N1bWVudGF0aW9uXG4gICAgICAgIGNvbnN0IG9yZGVyZWRGaWVsZHMgPSB7fTtcbiAgICAgICAgT2JqZWN0LmtleXMocGFyc2VDbGFzcy5maWVsZHMpXG4gICAgICAgICAgLnNvcnQoKVxuICAgICAgICAgIC5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICBvcmRlcmVkRmllbGRzW2ZpZWxkTmFtZV0gPSBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAgIH0pO1xuICAgICAgICBwYXJzZUNsYXNzLmZpZWxkcyA9IG9yZGVyZWRGaWVsZHM7XG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlcy5sb2FkKHRoaXMsIHBhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWcpO1xuICAgICAgICBwYXJzZUNsYXNzUXVlcmllcy5sb2FkKHRoaXMsIHBhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWcpO1xuICAgICAgICBwYXJzZUNsYXNzTXV0YXRpb25zLmxvYWQodGhpcywgcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZyk7XG4gICAgICB9XG4gICAgKTtcblxuICAgIGRlZmF1bHRHcmFwaFFMVHlwZXMubG9hZEFycmF5UmVzdWx0KHRoaXMsIHBhcnNlQ2xhc3Nlc0FycmF5KTtcbiAgICBkZWZhdWx0R3JhcGhRTFF1ZXJpZXMubG9hZCh0aGlzKTtcbiAgICBkZWZhdWx0R3JhcGhRTE11dGF0aW9ucy5sb2FkKHRoaXMpO1xuXG4gICAgbGV0IGdyYXBoUUxRdWVyeSA9IHVuZGVmaW5lZDtcbiAgICBpZiAoT2JqZWN0LmtleXModGhpcy5ncmFwaFFMUXVlcmllcykubGVuZ3RoID4gMCkge1xuICAgICAgZ3JhcGhRTFF1ZXJ5ID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICAgICAgbmFtZTogJ1F1ZXJ5JyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdRdWVyeSBpcyB0aGUgdG9wIGxldmVsIHR5cGUgZm9yIHF1ZXJpZXMuJyxcbiAgICAgICAgZmllbGRzOiB0aGlzLmdyYXBoUUxRdWVyaWVzLFxuICAgICAgfSk7XG4gICAgICB0aGlzLmFkZEdyYXBoUUxUeXBlKGdyYXBoUUxRdWVyeSwgdHJ1ZSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgbGV0IGdyYXBoUUxNdXRhdGlvbiA9IHVuZGVmaW5lZDtcbiAgICBpZiAoT2JqZWN0LmtleXModGhpcy5ncmFwaFFMTXV0YXRpb25zKS5sZW5ndGggPiAwKSB7XG4gICAgICBncmFwaFFMTXV0YXRpb24gPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgICAgICBuYW1lOiAnTXV0YXRpb24nLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ011dGF0aW9uIGlzIHRoZSB0b3AgbGV2ZWwgdHlwZSBmb3IgbXV0YXRpb25zLicsXG4gICAgICAgIGZpZWxkczogdGhpcy5ncmFwaFFMTXV0YXRpb25zLFxuICAgICAgfSk7XG4gICAgICB0aGlzLmFkZEdyYXBoUUxUeXBlKGdyYXBoUUxNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgbGV0IGdyYXBoUUxTdWJzY3JpcHRpb24gPSB1bmRlZmluZWQ7XG4gICAgaWYgKE9iamVjdC5rZXlzKHRoaXMuZ3JhcGhRTFN1YnNjcmlwdGlvbnMpLmxlbmd0aCA+IDApIHtcbiAgICAgIGdyYXBoUUxTdWJzY3JpcHRpb24gPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgICAgICBuYW1lOiAnU3Vic2NyaXB0aW9uJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdTdWJzY3JpcHRpb24gaXMgdGhlIHRvcCBsZXZlbCB0eXBlIGZvciBzdWJzY3JpcHRpb25zLicsXG4gICAgICAgIGZpZWxkczogdGhpcy5ncmFwaFFMU3Vic2NyaXB0aW9ucyxcbiAgICAgIH0pO1xuICAgICAgdGhpcy5hZGRHcmFwaFFMVHlwZShncmFwaFFMU3Vic2NyaXB0aW9uLCB0cnVlLCB0cnVlKTtcbiAgICB9XG5cbiAgICB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hID0gbmV3IEdyYXBoUUxTY2hlbWEoe1xuICAgICAgdHlwZXM6IHRoaXMuZ3JhcGhRTFR5cGVzLFxuICAgICAgcXVlcnk6IGdyYXBoUUxRdWVyeSxcbiAgICAgIG11dGF0aW9uOiBncmFwaFFMTXV0YXRpb24sXG4gICAgICBzdWJzY3JpcHRpb246IGdyYXBoUUxTdWJzY3JpcHRpb24sXG4gICAgfSk7XG5cbiAgICBpZiAodGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMpIHtcbiAgICAgIHNjaGVtYURpcmVjdGl2ZXMubG9hZCh0aGlzKTtcbiAgICAgIGlmICh0eXBlb2YgdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMuZ2V0VHlwZU1hcCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAvLyBJbiBmb2xsb3dpbmcgY29kZSB3ZSB1c2UgdW5kZXJzY29yZSBhdHRyIHRvIGtlZXAgdGhlIGRpcmVjdCB2YXJpYWJsZSByZWZlcmVuY2VcbiAgICAgICAgY29uc3QgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXAgPSB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcy5fdHlwZU1hcDtcbiAgICAgICAgY29uc3QgZmluZEFuZFJlcGxhY2VMYXN0VHlwZSA9IChwYXJlbnQsIGtleSkgPT4ge1xuICAgICAgICAgIGlmIChwYXJlbnRba2V5XS5uYW1lKSB7XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgIHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuX3R5cGVNYXBbcGFyZW50W2tleV0ubmFtZV0gJiZcbiAgICAgICAgICAgICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYS5fdHlwZU1hcFtwYXJlbnRba2V5XS5uYW1lXSAhPT0gcGFyZW50W2tleV1cbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAvLyBUbyBhdm9pZCB1bnJlc29sdmVkIGZpZWxkIG9uIG92ZXJsb2FkZWQgc2NoZW1hXG4gICAgICAgICAgICAgIC8vIHJlcGxhY2UgdGhlIGZpbmFsIHR5cGUgd2l0aCB0aGUgYXV0byBzY2hlbWEgb25lXG4gICAgICAgICAgICAgIHBhcmVudFtrZXldID0gdGhpcy5ncmFwaFFMQXV0b1NjaGVtYS5fdHlwZU1hcFtwYXJlbnRba2V5XS5uYW1lXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKHBhcmVudFtrZXldLm9mVHlwZSkge1xuICAgICAgICAgICAgICBmaW5kQW5kUmVwbGFjZUxhc3RUeXBlKHBhcmVudFtrZXldLCAnb2ZUeXBlJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICAvLyBBZGQgbm9uIHNoYXJlZCB0eXBlcyBmcm9tIGN1c3RvbSBzY2hlbWEgdG8gYXV0byBzY2hlbWFcbiAgICAgICAgLy8gbm90ZTogc29tZSBub24gc2hhcmVkIHR5cGVzIGNhbiB1c2Ugc29tZSBzaGFyZWQgdHlwZXNcbiAgICAgICAgLy8gc28gdGhpcyBjb2RlIG5lZWQgdG8gYmUgcmFuIGJlZm9yZSB0aGUgc2hhcmVkIHR5cGVzIGFkZGl0aW9uXG4gICAgICAgIC8vIHdlIHVzZSBzb3J0IHRvIGVuc3VyZSBzY2hlbWEgY29uc2lzdGVuY3kgb3ZlciByZXN0YXJ0c1xuICAgICAgICBPYmplY3Qua2V5cyhjdXN0b21HcmFwaFFMU2NoZW1hVHlwZU1hcClcbiAgICAgICAgICAuc29ydCgpXG4gICAgICAgICAgLmZvckVhY2goY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVLZXkgPT4ge1xuICAgICAgICAgICAgY29uc3QgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUgPSBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZU1hcFtjdXN0b21HcmFwaFFMU2NoZW1hVHlwZUtleV07XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICFjdXN0b21HcmFwaFFMU2NoZW1hVHlwZSB8fFxuICAgICAgICAgICAgICAhY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZSB8fFxuICAgICAgICAgICAgICBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lLnN0YXJ0c1dpdGgoJ19fJylcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBhdXRvR3JhcGhRTFNjaGVtYVR5cGUgPSB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLl90eXBlTWFwW1xuICAgICAgICAgICAgICBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lXG4gICAgICAgICAgICBdO1xuICAgICAgICAgICAgaWYgKCFhdXRvR3JhcGhRTFNjaGVtYVR5cGUpIHtcbiAgICAgICAgICAgICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYS5fdHlwZU1hcFtcbiAgICAgICAgICAgICAgICBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lXG4gICAgICAgICAgICAgIF0gPSBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgLy8gSGFuZGxlIHNoYXJlZCB0eXBlc1xuICAgICAgICAvLyBXZSBwYXNzIHRocm91Z2ggZWFjaCB0eXBlIGFuZCBlbnN1cmUgdGhhdCBhbGwgc3ViIGZpZWxkIHR5cGVzIGFyZSByZXBsYWNlZFxuICAgICAgICAvLyB3ZSB1c2Ugc29ydCB0byBlbnN1cmUgc2NoZW1hIGNvbnNpc3RlbmN5IG92ZXIgcmVzdGFydHNcbiAgICAgICAgT2JqZWN0LmtleXMoY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXApXG4gICAgICAgICAgLnNvcnQoKVxuICAgICAgICAgIC5mb3JFYWNoKGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlS2V5ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlID0gY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXBbY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVLZXldO1xuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAhY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUgfHxcbiAgICAgICAgICAgICAgIWN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWUgfHxcbiAgICAgICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZS5zdGFydHNXaXRoKCdfXycpXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYXV0b0dyYXBoUUxTY2hlbWFUeXBlID0gdGhpcy5ncmFwaFFMQXV0b1NjaGVtYS5fdHlwZU1hcFtcbiAgICAgICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZVxuICAgICAgICAgICAgXTtcblxuICAgICAgICAgICAgaWYgKGF1dG9HcmFwaFFMU2NoZW1hVHlwZSAmJiB0eXBlb2YgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUuZ2V0RmllbGRzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgIE9iamVjdC5rZXlzKGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLl9maWVsZHMpXG4gICAgICAgICAgICAgICAgLnNvcnQoKVxuICAgICAgICAgICAgICAgIC5mb3JFYWNoKGZpZWxkS2V5ID0+IHtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IGZpZWxkID0gY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUuX2ZpZWxkc1tmaWVsZEtleV07XG4gICAgICAgICAgICAgICAgICBmaW5kQW5kUmVwbGFjZUxhc3RUeXBlKGZpZWxkLCAndHlwZScpO1xuICAgICAgICAgICAgICAgICAgYXV0b0dyYXBoUUxTY2hlbWFUeXBlLl9maWVsZHNbZmllbGQubmFtZV0gPSBmaWVsZDtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hID0gdGhpcy5ncmFwaFFMQXV0b1NjaGVtYTtcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSA9IGF3YWl0IHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzKHtcbiAgICAgICAgICBkaXJlY3RpdmVzRGVmaW5pdGlvbnNTY2hlbWE6IHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXNEZWZpbml0aW9ucyxcbiAgICAgICAgICBhdXRvU2NoZW1hOiB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLFxuICAgICAgICAgIGdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzOiB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzLFxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSA9IG1lcmdlU2NoZW1hcyh7XG4gICAgICAgICAgc2NoZW1hczogW3RoaXMuZ3JhcGhRTEF1dG9TY2hlbWFdLFxuICAgICAgICAgIHR5cGVEZWZzOiBtZXJnZVR5cGVEZWZzKFtcbiAgICAgICAgICAgIHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLFxuICAgICAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zLFxuICAgICAgICAgIF0pLFxuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hID0gdGhpcy5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlcyh0aGlzLmdyYXBoUUxTY2hlbWEpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmdyYXBoUUxTY2hlbWE7XG4gIH1cblxuICBfbG9nT25jZShzZXZlcml0eSwgbWVzc2FnZSkge1xuICAgIGlmICh0aGlzLmxvZ0NhY2hlW21lc3NhZ2VdKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMubG9nW3NldmVyaXR5XShtZXNzYWdlKTtcbiAgICB0aGlzLmxvZ0NhY2hlW21lc3NhZ2VdID0gdHJ1ZTtcbiAgfVxuXG4gIGFkZEdyYXBoUUxUeXBlKHR5cGUsIHRocm93RXJyb3IgPSBmYWxzZSwgaWdub3JlUmVzZXJ2ZWQgPSBmYWxzZSwgaWdub3JlQ29ubmVjdGlvbiA9IGZhbHNlKSB7XG4gICAgaWYgKFxuICAgICAgKCFpZ25vcmVSZXNlcnZlZCAmJiBSRVNFUlZFRF9HUkFQSFFMX1RZUEVfTkFNRVMuaW5jbHVkZXModHlwZS5uYW1lKSkgfHxcbiAgICAgIHRoaXMuZ3JhcGhRTFR5cGVzLmZpbmQoZXhpc3RpbmdUeXBlID0+IGV4aXN0aW5nVHlwZS5uYW1lID09PSB0eXBlLm5hbWUpIHx8XG4gICAgICAoIWlnbm9yZUNvbm5lY3Rpb24gJiYgdHlwZS5uYW1lLmVuZHNXaXRoKCdDb25uZWN0aW9uJykpXG4gICAgKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gYFR5cGUgJHt0eXBlLm5hbWV9IGNvdWxkIG5vdCBiZSBhZGRlZCB0byB0aGUgYXV0byBzY2hlbWEgYmVjYXVzZSBpdCBjb2xsaWRlZCB3aXRoIGFuIGV4aXN0aW5nIHR5cGUuYDtcbiAgICAgIGlmICh0aHJvd0Vycm9yKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihtZXNzYWdlKTtcbiAgICAgIH1cbiAgICAgIHRoaXMuX2xvZ09uY2UoJ3dhcm4nLCBtZXNzYWdlKTtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHRoaXMuZ3JhcGhRTFR5cGVzLnB1c2godHlwZSk7XG4gICAgcmV0dXJuIHR5cGU7XG4gIH1cblxuICBhZGRHcmFwaFFMUXVlcnkoZmllbGROYW1lLCBmaWVsZCwgdGhyb3dFcnJvciA9IGZhbHNlLCBpZ25vcmVSZXNlcnZlZCA9IGZhbHNlKSB7XG4gICAgaWYgKFxuICAgICAgKCFpZ25vcmVSZXNlcnZlZCAmJiBSRVNFUlZFRF9HUkFQSFFMX1FVRVJZX05BTUVTLmluY2x1ZGVzKGZpZWxkTmFtZSkpIHx8XG4gICAgICB0aGlzLmdyYXBoUUxRdWVyaWVzW2ZpZWxkTmFtZV1cbiAgICApIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBgUXVlcnkgJHtmaWVsZE5hbWV9IGNvdWxkIG5vdCBiZSBhZGRlZCB0byB0aGUgYXV0byBzY2hlbWEgYmVjYXVzZSBpdCBjb2xsaWRlZCB3aXRoIGFuIGV4aXN0aW5nIGZpZWxkLmA7XG4gICAgICBpZiAodGhyb3dFcnJvcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSk7XG4gICAgICB9XG4gICAgICB0aGlzLl9sb2dPbmNlKCd3YXJuJywgbWVzc2FnZSk7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICB0aGlzLmdyYXBoUUxRdWVyaWVzW2ZpZWxkTmFtZV0gPSBmaWVsZDtcbiAgICByZXR1cm4gZmllbGQ7XG4gIH1cblxuICBhZGRHcmFwaFFMTXV0YXRpb24oZmllbGROYW1lLCBmaWVsZCwgdGhyb3dFcnJvciA9IGZhbHNlLCBpZ25vcmVSZXNlcnZlZCA9IGZhbHNlKSB7XG4gICAgaWYgKFxuICAgICAgKCFpZ25vcmVSZXNlcnZlZCAmJiBSRVNFUlZFRF9HUkFQSFFMX01VVEFUSU9OX05BTUVTLmluY2x1ZGVzKGZpZWxkTmFtZSkpIHx8XG4gICAgICB0aGlzLmdyYXBoUUxNdXRhdGlvbnNbZmllbGROYW1lXVxuICAgICkge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGBNdXRhdGlvbiAke2ZpZWxkTmFtZX0gY291bGQgbm90IGJlIGFkZGVkIHRvIHRoZSBhdXRvIHNjaGVtYSBiZWNhdXNlIGl0IGNvbGxpZGVkIHdpdGggYW4gZXhpc3RpbmcgZmllbGQuYDtcbiAgICAgIGlmICh0aHJvd0Vycm9yKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihtZXNzYWdlKTtcbiAgICAgIH1cbiAgICAgIHRoaXMuX2xvZ09uY2UoJ3dhcm4nLCBtZXNzYWdlKTtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHRoaXMuZ3JhcGhRTE11dGF0aW9uc1tmaWVsZE5hbWVdID0gZmllbGQ7XG4gICAgcmV0dXJuIGZpZWxkO1xuICB9XG5cbiAgaGFuZGxlRXJyb3IoZXJyb3IpIHtcbiAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBQYXJzZS5FcnJvcikge1xuICAgICAgdGhpcy5sb2cuZXJyb3IoJ1BhcnNlIGVycm9yOiAnLCBlcnJvcik7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMubG9nLmVycm9yKCdVbmNhdWdodCBpbnRlcm5hbCBzZXJ2ZXIgZXJyb3IuJywgZXJyb3IsIGVycm9yLnN0YWNrKTtcbiAgICB9XG4gICAgdGhyb3cgdG9HcmFwaFFMRXJyb3IoZXJyb3IpO1xuICB9XG5cbiAgYXN5bmMgX2luaXRpYWxpemVTY2hlbWFBbmRDb25maWcoKSB7XG4gICAgY29uc3QgW3NjaGVtYUNvbnRyb2xsZXIsIHBhcnNlR3JhcGhRTENvbmZpZ10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICB0aGlzLmRhdGFiYXNlQ29udHJvbGxlci5sb2FkU2NoZW1hKCksXG4gICAgICB0aGlzLnBhcnNlR3JhcGhRTENvbnRyb2xsZXIuZ2V0R3JhcGhRTENvbmZpZygpLFxuICAgIF0pO1xuXG4gICAgdGhpcy5zY2hlbWFDb250cm9sbGVyID0gc2NoZW1hQ29udHJvbGxlcjtcblxuICAgIHJldHVybiB7XG4gICAgICBwYXJzZUdyYXBoUUxDb25maWcsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXRzIGFsbCBjbGFzc2VzIGZvdW5kIGJ5IHRoZSBgc2NoZW1hQ29udHJvbGxlcmBcbiAgICogbWludXMgdGhvc2UgZmlsdGVyZWQgb3V0IGJ5IHRoZSBhcHAncyBwYXJzZUdyYXBoUUxDb25maWcuXG4gICAqL1xuICBhc3luYyBfZ2V0Q2xhc3Nlc0ZvclNjaGVtYShwYXJzZUdyYXBoUUxDb25maWc6IFBhcnNlR3JhcGhRTENvbmZpZykge1xuICAgIGNvbnN0IHsgZW5hYmxlZEZvckNsYXNzZXMsIGRpc2FibGVkRm9yQ2xhc3NlcyB9ID0gcGFyc2VHcmFwaFFMQ29uZmlnO1xuICAgIGNvbnN0IGFsbENsYXNzZXMgPSBhd2FpdCB0aGlzLnNjaGVtYUNvbnRyb2xsZXIuZ2V0QWxsQ2xhc3NlcygpO1xuXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZW5hYmxlZEZvckNsYXNzZXMpIHx8IEFycmF5LmlzQXJyYXkoZGlzYWJsZWRGb3JDbGFzc2VzKSkge1xuICAgICAgbGV0IGluY2x1ZGVkQ2xhc3NlcyA9IGFsbENsYXNzZXM7XG4gICAgICBpZiAoZW5hYmxlZEZvckNsYXNzZXMpIHtcbiAgICAgICAgaW5jbHVkZWRDbGFzc2VzID0gYWxsQ2xhc3Nlcy5maWx0ZXIoY2xhenogPT4ge1xuICAgICAgICAgIHJldHVybiBlbmFibGVkRm9yQ2xhc3Nlcy5pbmNsdWRlcyhjbGF6ei5jbGFzc05hbWUpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIGlmIChkaXNhYmxlZEZvckNsYXNzZXMpIHtcbiAgICAgICAgLy8gQ2xhc3NlcyBpbmNsdWRlZCBpbiBgZW5hYmxlZEZvckNsYXNzZXNgIHRoYXRcbiAgICAgICAgLy8gYXJlIGFsc28gcHJlc2VudCBpbiBgZGlzYWJsZWRGb3JDbGFzc2VzYCB3aWxsXG4gICAgICAgIC8vIHN0aWxsIGJlIGZpbHRlcmVkIG91dFxuICAgICAgICBpbmNsdWRlZENsYXNzZXMgPSBpbmNsdWRlZENsYXNzZXMuZmlsdGVyKGNsYXp6ID0+IHtcbiAgICAgICAgICByZXR1cm4gIWRpc2FibGVkRm9yQ2xhc3Nlcy5pbmNsdWRlcyhjbGF6ei5jbGFzc05hbWUpO1xuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5pc1VzZXJzQ2xhc3NEaXNhYmxlZCA9ICFpbmNsdWRlZENsYXNzZXMuc29tZShjbGF6eiA9PiB7XG4gICAgICAgIHJldHVybiBjbGF6ei5jbGFzc05hbWUgPT09ICdfVXNlcic7XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIGluY2x1ZGVkQ2xhc3NlcztcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGFsbENsYXNzZXM7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFRoaXMgbWV0aG9kIHJldHVybnMgYSBsaXN0IG9mIHR1cGxlc1xuICAgKiB0aGF0IHByb3ZpZGUgdGhlIHBhcnNlQ2xhc3MgYWxvbmcgd2l0aFxuICAgKiBpdHMgcGFyc2VDbGFzc0NvbmZpZyB3aGVyZSBwcm92aWRlZC5cbiAgICovXG4gIF9nZXRQYXJzZUNsYXNzZXNXaXRoQ29uZmlnKHBhcnNlQ2xhc3NlcywgcGFyc2VHcmFwaFFMQ29uZmlnOiBQYXJzZUdyYXBoUUxDb25maWcpIHtcbiAgICBjb25zdCB7IGNsYXNzQ29uZmlncyB9ID0gcGFyc2VHcmFwaFFMQ29uZmlnO1xuXG4gICAgLy8gTWFrZSBzdXJlcyB0aGF0IHRoZSBkZWZhdWx0IGNsYXNzZXMgYW5kIGNsYXNzZXMgdGhhdFxuICAgIC8vIHN0YXJ0cyB3aXRoIGNhcGl0YWxpemVkIGxldHRlciB3aWxsIGJlIGdlbmVyYXRlZCBmaXJzdC5cbiAgICBjb25zdCBzb3J0Q2xhc3NlcyA9IChhLCBiKSA9PiB7XG4gICAgICBhID0gYS5jbGFzc05hbWU7XG4gICAgICBiID0gYi5jbGFzc05hbWU7XG4gICAgICBpZiAoYVswXSA9PT0gJ18nKSB7XG4gICAgICAgIGlmIChiWzBdICE9PSAnXycpIHtcbiAgICAgICAgICByZXR1cm4gLTE7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChiWzBdID09PSAnXycpIHtcbiAgICAgICAgaWYgKGFbMF0gIT09ICdfJykge1xuICAgICAgICAgIHJldHVybiAxO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoYSA9PT0gYikge1xuICAgICAgICByZXR1cm4gMDtcbiAgICAgIH0gZWxzZSBpZiAoYSA8IGIpIHtcbiAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIDE7XG4gICAgICB9XG4gICAgfTtcblxuICAgIHJldHVybiBwYXJzZUNsYXNzZXMuc29ydChzb3J0Q2xhc3NlcykubWFwKHBhcnNlQ2xhc3MgPT4ge1xuICAgICAgbGV0IHBhcnNlQ2xhc3NDb25maWc7XG4gICAgICBpZiAoY2xhc3NDb25maWdzKSB7XG4gICAgICAgIHBhcnNlQ2xhc3NDb25maWcgPSBjbGFzc0NvbmZpZ3MuZmluZChjID0+IGMuY2xhc3NOYW1lID09PSBwYXJzZUNsYXNzLmNsYXNzTmFtZSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gW3BhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWddO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgX2dldEZ1bmN0aW9uTmFtZXMoKSB7XG4gICAgcmV0dXJuIGF3YWl0IGdldEZ1bmN0aW9uTmFtZXModGhpcy5hcHBJZCkuZmlsdGVyKGZ1bmN0aW9uTmFtZSA9PiB7XG4gICAgICBpZiAoL15bX2EtekEtWl1bX2EtekEtWjAtOV0qJC8udGVzdChmdW5jdGlvbk5hbWUpKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5fbG9nT25jZShcbiAgICAgICAgICAnd2FybicsXG4gICAgICAgICAgYEZ1bmN0aW9uICR7ZnVuY3Rpb25OYW1lfSBjb3VsZCBub3QgYmUgYWRkZWQgdG8gdGhlIGF1dG8gc2NoZW1hIGJlY2F1c2UgR3JhcGhRTCBuYW1lcyBtdXN0IG1hdGNoIC9eW19hLXpBLVpdW19hLXpBLVowLTldKiQvLmBcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIENoZWNrcyBmb3IgY2hhbmdlcyB0byB0aGUgcGFyc2VDbGFzc2VzXG4gICAqIG9iamVjdHMgKGkuZS4gZGF0YWJhc2Ugc2NoZW1hKSBvciB0b1xuICAgKiB0aGUgcGFyc2VHcmFwaFFMQ29uZmlnIG9iamVjdC4gSWYgbm9cbiAgICogY2hhbmdlcyBhcmUgZm91bmQsIHJldHVybiB0cnVlO1xuICAgKi9cbiAgX2hhc1NjaGVtYUlucHV0Q2hhbmdlZChwYXJhbXM6IHtcbiAgICBwYXJzZUNsYXNzZXM6IGFueSxcbiAgICBwYXJzZUdyYXBoUUxDb25maWc6ID9QYXJzZUdyYXBoUUxDb25maWcsXG4gICAgZnVuY3Rpb25OYW1lc1N0cmluZzogc3RyaW5nLFxuICB9KTogYm9vbGVhbiB7XG4gICAgY29uc3QgeyBwYXJzZUNsYXNzZXMsIHBhcnNlR3JhcGhRTENvbmZpZywgZnVuY3Rpb25OYW1lc1N0cmluZyB9ID0gcGFyYW1zO1xuXG4gICAgLy8gRmlyc3QgaW5pdFxuICAgIGlmICghdGhpcy5ncmFwaFFMU2NoZW1hKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAoXG4gICAgICBpc0RlZXBTdHJpY3RFcXVhbCh0aGlzLnBhcnNlR3JhcGhRTENvbmZpZywgcGFyc2VHcmFwaFFMQ29uZmlnKSAmJlxuICAgICAgdGhpcy5mdW5jdGlvbk5hbWVzU3RyaW5nID09PSBmdW5jdGlvbk5hbWVzU3RyaW5nICYmXG4gICAgICBpc0RlZXBTdHJpY3RFcXVhbCh0aGlzLnBhcnNlQ2xhc3NlcywgcGFyc2VDbGFzc2VzKVxuICAgICkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxufVxuXG5leHBvcnQgeyBQYXJzZUdyYXBoUUxTY2hlbWEgfTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFD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