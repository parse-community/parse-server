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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX2dyYXBocWwiLCJfc2NoZW1hIiwiX21lcmdlIiwiX3V0aWwiLCJfcmVxdWlyZWRQYXJhbWV0ZXIiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiX2ludGVyb3BSZXF1aXJlV2lsZGNhcmQiLCJwYXJzZUNsYXNzVHlwZXMiLCJwYXJzZUNsYXNzUXVlcmllcyIsInBhcnNlQ2xhc3NNdXRhdGlvbnMiLCJkZWZhdWx0R3JhcGhRTFF1ZXJpZXMiLCJkZWZhdWx0R3JhcGhRTE11dGF0aW9ucyIsIl9QYXJzZUdyYXBoUUxDb250cm9sbGVyIiwiX0RhdGFiYXNlQ29udHJvbGxlciIsIl9TY2hlbWFDYWNoZSIsIl9wYXJzZUdyYXBoUUxVdGlscyIsInNjaGVtYURpcmVjdGl2ZXMiLCJzY2hlbWFUeXBlcyIsIl90cmlnZ2VycyIsImRlZmF1bHRSZWxheVNjaGVtYSIsIl9nZXRSZXF1aXJlV2lsZGNhcmRDYWNoZSIsIm5vZGVJbnRlcm9wIiwiV2Vha01hcCIsImNhY2hlQmFiZWxJbnRlcm9wIiwiY2FjaGVOb2RlSW50ZXJvcCIsIm9iaiIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiY2FjaGUiLCJoYXMiLCJnZXQiLCJuZXdPYmoiLCJoYXNQcm9wZXJ0eURlc2NyaXB0b3IiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImtleSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImRlc2MiLCJzZXQiLCJSRVNFUlZFRF9HUkFQSFFMX1RZUEVfTkFNRVMiLCJSRVNFUlZFRF9HUkFQSFFMX1FVRVJZX05BTUVTIiwiUkVTRVJWRURfR1JBUEhRTF9NVVRBVElPTl9OQU1FUyIsIlBhcnNlR3JhcGhRTFNjaGVtYSIsImNvbnN0cnVjdG9yIiwicGFyYW1zIiwicGFyc2VHcmFwaFFMQ29udHJvbGxlciIsInJlcXVpcmVkUGFyYW1ldGVyIiwiZGF0YWJhc2VDb250cm9sbGVyIiwibG9nIiwiZ3JhcGhRTEN1c3RvbVR5cGVEZWZzIiwiYXBwSWQiLCJzY2hlbWFDYWNoZSIsIlNjaGVtYUNhY2hlIiwibG9nQ2FjaGUiLCJsb2FkIiwicGFyc2VHcmFwaFFMQ29uZmlnIiwiX2luaXRpYWxpemVTY2hlbWFBbmRDb25maWciLCJwYXJzZUNsYXNzZXNBcnJheSIsIl9nZXRDbGFzc2VzRm9yU2NoZW1hIiwiZnVuY3Rpb25OYW1lcyIsIl9nZXRGdW5jdGlvbk5hbWVzIiwiZnVuY3Rpb25OYW1lc1N0cmluZyIsImpvaW4iLCJwYXJzZUNsYXNzZXMiLCJyZWR1Y2UiLCJhY2MiLCJjbGF6eiIsImNsYXNzTmFtZSIsIl9oYXNTY2hlbWFJbnB1dENoYW5nZWQiLCJncmFwaFFMU2NoZW1hIiwidmlld2VyVHlwZSIsImdyYXBoUUxBdXRvU2NoZW1hIiwiZ3JhcGhRTFR5cGVzIiwiZ3JhcGhRTFF1ZXJpZXMiLCJncmFwaFFMTXV0YXRpb25zIiwiZ3JhcGhRTFN1YnNjcmlwdGlvbnMiLCJncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zIiwiZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXMiLCJyZWxheU5vZGVJbnRlcmZhY2UiLCJfZ2V0UGFyc2VDbGFzc2VzV2l0aENvbmZpZyIsImZvckVhY2giLCJwYXJzZUNsYXNzIiwicGFyc2VDbGFzc0NvbmZpZyIsImtleXMiLCJmaWVsZHMiLCJmaWVsZE5hbWUiLCJzdGFydHNXaXRoIiwib3JkZXJlZEZpZWxkcyIsInNvcnQiLCJsb2FkQXJyYXlSZXN1bHQiLCJncmFwaFFMUXVlcnkiLCJ1bmRlZmluZWQiLCJsZW5ndGgiLCJHcmFwaFFMT2JqZWN0VHlwZSIsIm5hbWUiLCJkZXNjcmlwdGlvbiIsImFkZEdyYXBoUUxUeXBlIiwiZ3JhcGhRTE11dGF0aW9uIiwiZ3JhcGhRTFN1YnNjcmlwdGlvbiIsIkdyYXBoUUxTY2hlbWEiLCJ0eXBlcyIsInF1ZXJ5IiwibXV0YXRpb24iLCJzdWJzY3JpcHRpb24iLCJnZXRUeXBlTWFwIiwiY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXAiLCJfdHlwZU1hcCIsImZpbmRBbmRSZXBsYWNlTGFzdFR5cGUiLCJwYXJlbnQiLCJvZlR5cGUiLCJjdXN0b21HcmFwaFFMU2NoZW1hVHlwZUtleSIsImN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlIiwiYXV0b0dyYXBoUUxTY2hlbWFUeXBlIiwiZ2V0RmllbGRzIiwiX2ZpZWxkcyIsImZpZWxkS2V5IiwiZmllbGQiLCJkaXJlY3RpdmVzRGVmaW5pdGlvbnNTY2hlbWEiLCJhdXRvU2NoZW1hIiwibWVyZ2VTY2hlbWFzIiwic2NoZW1hcyIsInR5cGVEZWZzIiwibWVyZ2VUeXBlRGVmcyIsIl9sb2dPbmNlIiwic2V2ZXJpdHkiLCJtZXNzYWdlIiwidHlwZSIsInRocm93RXJyb3IiLCJpZ25vcmVSZXNlcnZlZCIsImlnbm9yZUNvbm5lY3Rpb24iLCJpbmNsdWRlcyIsImZpbmQiLCJleGlzdGluZ1R5cGUiLCJlbmRzV2l0aCIsIkVycm9yIiwicHVzaCIsImFkZEdyYXBoUUxRdWVyeSIsImFkZEdyYXBoUUxNdXRhdGlvbiIsImhhbmRsZUVycm9yIiwiZXJyb3IiLCJQYXJzZSIsInN0YWNrIiwidG9HcmFwaFFMRXJyb3IiLCJzY2hlbWFDb250cm9sbGVyIiwiUHJvbWlzZSIsImFsbCIsImxvYWRTY2hlbWEiLCJnZXRHcmFwaFFMQ29uZmlnIiwiZW5hYmxlZEZvckNsYXNzZXMiLCJkaXNhYmxlZEZvckNsYXNzZXMiLCJhbGxDbGFzc2VzIiwiZ2V0QWxsQ2xhc3NlcyIsIkFycmF5IiwiaXNBcnJheSIsImluY2x1ZGVkQ2xhc3NlcyIsImZpbHRlciIsImlzVXNlcnNDbGFzc0Rpc2FibGVkIiwic29tZSIsImNsYXNzQ29uZmlncyIsInNvcnRDbGFzc2VzIiwiYSIsImIiLCJtYXAiLCJjIiwiZ2V0RnVuY3Rpb25OYW1lcyIsImZ1bmN0aW9uTmFtZSIsInRlc3QiLCJpc0RlZXBTdHJpY3RFcXVhbCIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvR3JhcGhRTC9QYXJzZUdyYXBoUUxTY2hlbWEuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IHsgR3JhcGhRTFNjaGVtYSwgR3JhcGhRTE9iamVjdFR5cGUsIERvY3VtZW50Tm9kZSwgR3JhcGhRTE5hbWVkVHlwZSB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgbWVyZ2VTY2hlbWFzIH0gZnJvbSAnQGdyYXBocWwtdG9vbHMvc2NoZW1hJztcbmltcG9ydCB7IG1lcmdlVHlwZURlZnMgfSBmcm9tICdAZ3JhcGhxbC10b29scy9tZXJnZSc7XG5pbXBvcnQgeyBpc0RlZXBTdHJpY3RFcXVhbCB9IGZyb20gJ3V0aWwnO1xuaW1wb3J0IHJlcXVpcmVkUGFyYW1ldGVyIGZyb20gJy4uL3JlcXVpcmVkUGFyYW1ldGVyJztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMVHlwZXMgZnJvbSAnLi9sb2FkZXJzL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0ICogYXMgcGFyc2VDbGFzc1R5cGVzIGZyb20gJy4vbG9hZGVycy9wYXJzZUNsYXNzVHlwZXMnO1xuaW1wb3J0ICogYXMgcGFyc2VDbGFzc1F1ZXJpZXMgZnJvbSAnLi9sb2FkZXJzL3BhcnNlQ2xhc3NRdWVyaWVzJztcbmltcG9ydCAqIGFzIHBhcnNlQ2xhc3NNdXRhdGlvbnMgZnJvbSAnLi9sb2FkZXJzL3BhcnNlQ2xhc3NNdXRhdGlvbnMnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxRdWVyaWVzIGZyb20gJy4vbG9hZGVycy9kZWZhdWx0R3JhcGhRTFF1ZXJpZXMnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxNdXRhdGlvbnMgZnJvbSAnLi9sb2FkZXJzL2RlZmF1bHRHcmFwaFFMTXV0YXRpb25zJztcbmltcG9ydCBQYXJzZUdyYXBoUUxDb250cm9sbGVyLCB7IFBhcnNlR3JhcGhRTENvbmZpZyB9IGZyb20gJy4uL0NvbnRyb2xsZXJzL1BhcnNlR3JhcGhRTENvbnRyb2xsZXInO1xuaW1wb3J0IERhdGFiYXNlQ29udHJvbGxlciBmcm9tICcuLi9Db250cm9sbGVycy9EYXRhYmFzZUNvbnRyb2xsZXInO1xuaW1wb3J0IFNjaGVtYUNhY2hlIGZyb20gJy4uL0FkYXB0ZXJzL0NhY2hlL1NjaGVtYUNhY2hlJztcbmltcG9ydCB7IHRvR3JhcGhRTEVycm9yIH0gZnJvbSAnLi9wYXJzZUdyYXBoUUxVdGlscyc7XG5pbXBvcnQgKiBhcyBzY2hlbWFEaXJlY3RpdmVzIGZyb20gJy4vbG9hZGVycy9zY2hlbWFEaXJlY3RpdmVzJztcbmltcG9ydCAqIGFzIHNjaGVtYVR5cGVzIGZyb20gJy4vbG9hZGVycy9zY2hlbWFUeXBlcyc7XG5pbXBvcnQgeyBnZXRGdW5jdGlvbk5hbWVzIH0gZnJvbSAnLi4vdHJpZ2dlcnMnO1xuaW1wb3J0ICogYXMgZGVmYXVsdFJlbGF5U2NoZW1hIGZyb20gJy4vbG9hZGVycy9kZWZhdWx0UmVsYXlTY2hlbWEnO1xuXG5jb25zdCBSRVNFUlZFRF9HUkFQSFFMX1RZUEVfTkFNRVMgPSBbXG4gICdTdHJpbmcnLFxuICAnQm9vbGVhbicsXG4gICdJbnQnLFxuICAnRmxvYXQnLFxuICAnSUQnLFxuICAnQXJyYXlSZXN1bHQnLFxuICAnUXVlcnknLFxuICAnTXV0YXRpb24nLFxuICAnU3Vic2NyaXB0aW9uJyxcbiAgJ0NyZWF0ZUZpbGVJbnB1dCcsXG4gICdDcmVhdGVGaWxlUGF5bG9hZCcsXG4gICdWaWV3ZXInLFxuICAnU2lnblVwSW5wdXQnLFxuICAnU2lnblVwUGF5bG9hZCcsXG4gICdMb2dJbklucHV0JyxcbiAgJ0xvZ0luUGF5bG9hZCcsXG4gICdMb2dPdXRJbnB1dCcsXG4gICdMb2dPdXRQYXlsb2FkJyxcbiAgJ0Nsb3VkQ29kZUZ1bmN0aW9uJyxcbiAgJ0NhbGxDbG91ZENvZGVJbnB1dCcsXG4gICdDYWxsQ2xvdWRDb2RlUGF5bG9hZCcsXG4gICdDcmVhdGVDbGFzc0lucHV0JyxcbiAgJ0NyZWF0ZUNsYXNzUGF5bG9hZCcsXG4gICdVcGRhdGVDbGFzc0lucHV0JyxcbiAgJ1VwZGF0ZUNsYXNzUGF5bG9hZCcsXG4gICdEZWxldGVDbGFzc0lucHV0JyxcbiAgJ0RlbGV0ZUNsYXNzUGF5bG9hZCcsXG4gICdQYWdlSW5mbycsXG5dO1xuY29uc3QgUkVTRVJWRURfR1JBUEhRTF9RVUVSWV9OQU1FUyA9IFsnaGVhbHRoJywgJ3ZpZXdlcicsICdjbGFzcycsICdjbGFzc2VzJ107XG5jb25zdCBSRVNFUlZFRF9HUkFQSFFMX01VVEFUSU9OX05BTUVTID0gW1xuICAnc2lnblVwJyxcbiAgJ2xvZ0luJyxcbiAgJ2xvZ091dCcsXG4gICdjcmVhdGVGaWxlJyxcbiAgJ2NhbGxDbG91ZENvZGUnLFxuICAnY3JlYXRlQ2xhc3MnLFxuICAndXBkYXRlQ2xhc3MnLFxuICAnZGVsZXRlQ2xhc3MnLFxuXTtcblxuY2xhc3MgUGFyc2VHcmFwaFFMU2NoZW1hIHtcbiAgZGF0YWJhc2VDb250cm9sbGVyOiBEYXRhYmFzZUNvbnRyb2xsZXI7XG4gIHBhcnNlR3JhcGhRTENvbnRyb2xsZXI6IFBhcnNlR3JhcGhRTENvbnRyb2xsZXI7XG4gIHBhcnNlR3JhcGhRTENvbmZpZzogUGFyc2VHcmFwaFFMQ29uZmlnO1xuICBsb2c6IGFueTtcbiAgYXBwSWQ6IHN0cmluZztcbiAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzOiA/KHN0cmluZyB8IEdyYXBoUUxTY2hlbWEgfCBEb2N1bWVudE5vZGUgfCBHcmFwaFFMTmFtZWRUeXBlW10pO1xuICBzY2hlbWFDYWNoZTogYW55O1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHBhcmFtczoge1xuICAgICAgZGF0YWJhc2VDb250cm9sbGVyOiBEYXRhYmFzZUNvbnRyb2xsZXIsXG4gICAgICBwYXJzZUdyYXBoUUxDb250cm9sbGVyOiBQYXJzZUdyYXBoUUxDb250cm9sbGVyLFxuICAgICAgbG9nOiBhbnksXG4gICAgICBhcHBJZDogc3RyaW5nLFxuICAgICAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzOiA/KHN0cmluZyB8IEdyYXBoUUxTY2hlbWEgfCBEb2N1bWVudE5vZGUgfCBHcmFwaFFMTmFtZWRUeXBlW10pLFxuICAgIH0gPSB7fVxuICApIHtcbiAgICB0aGlzLnBhcnNlR3JhcGhRTENvbnRyb2xsZXIgPVxuICAgICAgcGFyYW1zLnBhcnNlR3JhcGhRTENvbnRyb2xsZXIgfHxcbiAgICAgIHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgcGFyc2VHcmFwaFFMQ29udHJvbGxlciBpbnN0YW5jZSEnKTtcbiAgICB0aGlzLmRhdGFiYXNlQ29udHJvbGxlciA9XG4gICAgICBwYXJhbXMuZGF0YWJhc2VDb250cm9sbGVyIHx8XG4gICAgICByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIGRhdGFiYXNlQ29udHJvbGxlciBpbnN0YW5jZSEnKTtcbiAgICB0aGlzLmxvZyA9IHBhcmFtcy5sb2cgfHwgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBsb2cgaW5zdGFuY2UhJyk7XG4gICAgdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMgPSBwYXJhbXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzO1xuICAgIHRoaXMuYXBwSWQgPSBwYXJhbXMuYXBwSWQgfHwgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgdGhlIGFwcElkIScpO1xuICAgIHRoaXMuc2NoZW1hQ2FjaGUgPSBTY2hlbWFDYWNoZTtcbiAgICB0aGlzLmxvZ0NhY2hlID0ge307XG4gIH1cblxuICBhc3luYyBsb2FkKCkge1xuICAgIGNvbnN0IHsgcGFyc2VHcmFwaFFMQ29uZmlnIH0gPSBhd2FpdCB0aGlzLl9pbml0aWFsaXplU2NoZW1hQW5kQ29uZmlnKCk7XG4gICAgY29uc3QgcGFyc2VDbGFzc2VzQXJyYXkgPSBhd2FpdCB0aGlzLl9nZXRDbGFzc2VzRm9yU2NoZW1hKHBhcnNlR3JhcGhRTENvbmZpZyk7XG4gICAgY29uc3QgZnVuY3Rpb25OYW1lcyA9IGF3YWl0IHRoaXMuX2dldEZ1bmN0aW9uTmFtZXMoKTtcbiAgICBjb25zdCBmdW5jdGlvbk5hbWVzU3RyaW5nID0gZnVuY3Rpb25OYW1lcy5qb2luKCk7XG5cbiAgICBjb25zdCBwYXJzZUNsYXNzZXMgPSBwYXJzZUNsYXNzZXNBcnJheS5yZWR1Y2UoKGFjYywgY2xhenopID0+IHtcbiAgICAgIGFjY1tjbGF6ei5jbGFzc05hbWVdID0gY2xheno7XG4gICAgICByZXR1cm4gYWNjO1xuICAgIH0sIHt9KTtcbiAgICBpZiAoXG4gICAgICAhdGhpcy5faGFzU2NoZW1hSW5wdXRDaGFuZ2VkKHtcbiAgICAgICAgcGFyc2VDbGFzc2VzLFxuICAgICAgICBwYXJzZUdyYXBoUUxDb25maWcsXG4gICAgICAgIGZ1bmN0aW9uTmFtZXNTdHJpbmcsXG4gICAgICB9KVxuICAgICkge1xuICAgICAgcmV0dXJuIHRoaXMuZ3JhcGhRTFNjaGVtYTtcbiAgICB9XG5cbiAgICB0aGlzLnBhcnNlQ2xhc3NlcyA9IHBhcnNlQ2xhc3NlcztcbiAgICB0aGlzLnBhcnNlR3JhcGhRTENvbmZpZyA9IHBhcnNlR3JhcGhRTENvbmZpZztcbiAgICB0aGlzLmZ1bmN0aW9uTmFtZXMgPSBmdW5jdGlvbk5hbWVzO1xuICAgIHRoaXMuZnVuY3Rpb25OYW1lc1N0cmluZyA9IGZ1bmN0aW9uTmFtZXNTdHJpbmc7XG4gICAgdGhpcy5wYXJzZUNsYXNzVHlwZXMgPSB7fTtcbiAgICB0aGlzLnZpZXdlclR5cGUgPSBudWxsO1xuICAgIHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEgPSBudWxsO1xuICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSA9IG51bGw7XG4gICAgdGhpcy5ncmFwaFFMVHlwZXMgPSBbXTtcbiAgICB0aGlzLmdyYXBoUUxRdWVyaWVzID0ge307XG4gICAgdGhpcy5ncmFwaFFMTXV0YXRpb25zID0ge307XG4gICAgdGhpcy5ncmFwaFFMU3Vic2NyaXB0aW9ucyA9IHt9O1xuICAgIHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXNEZWZpbml0aW9ucyA9IG51bGw7XG4gICAgdGhpcy5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlcyA9IHt9O1xuICAgIHRoaXMucmVsYXlOb2RlSW50ZXJmYWNlID0gbnVsbDtcblxuICAgIGRlZmF1bHRHcmFwaFFMVHlwZXMubG9hZCh0aGlzKTtcbiAgICBkZWZhdWx0UmVsYXlTY2hlbWEubG9hZCh0aGlzKTtcbiAgICBzY2hlbWFUeXBlcy5sb2FkKHRoaXMpO1xuXG4gICAgdGhpcy5fZ2V0UGFyc2VDbGFzc2VzV2l0aENvbmZpZyhwYXJzZUNsYXNzZXNBcnJheSwgcGFyc2VHcmFwaFFMQ29uZmlnKS5mb3JFYWNoKFxuICAgICAgKFtwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnXSkgPT4ge1xuICAgICAgICAvLyBTb21lIHRpbWVzIHNjaGVtYSByZXR1cm4gdGhlIF9hdXRoX2RhdGFfIGZpZWxkXG4gICAgICAgIC8vIGl0IHdpbGwgbGVhZCB0byB1bnN0YWJsZSBncmFwaHFsIGdlbmVyYXRpb24gb3JkZXJcbiAgICAgICAgaWYgKHBhcnNlQ2xhc3MuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICAgICAgT2JqZWN0LmtleXMocGFyc2VDbGFzcy5maWVsZHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgIGlmIChmaWVsZE5hbWUuc3RhcnRzV2l0aCgnX2F1dGhfZGF0YV8nKSkge1xuICAgICAgICAgICAgICBkZWxldGUgcGFyc2VDbGFzcy5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEZpZWxkcyBvcmRlciBpbnNpZGUgdGhlIHNjaGVtYSBzZWVtcyB0byBub3QgYmUgY29uc2lzdGVudCBhY3Jvc3NcbiAgICAgICAgLy8gcmVzdGFydCBzbyB3ZSBuZWVkIHRvIGVuc3VyZSBhbiBhbHBoYWJldGljYWwgb3JkZXJcbiAgICAgICAgLy8gYWxzbyBpdCdzIGJldHRlciBmb3IgdGhlIHBsYXlncm91bmQgZG9jdW1lbnRhdGlvblxuICAgICAgICBjb25zdCBvcmRlcmVkRmllbGRzID0ge307XG4gICAgICAgIE9iamVjdC5rZXlzKHBhcnNlQ2xhc3MuZmllbGRzKVxuICAgICAgICAgIC5zb3J0KClcbiAgICAgICAgICAuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgb3JkZXJlZEZpZWxkc1tmaWVsZE5hbWVdID0gcGFyc2VDbGFzcy5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgcGFyc2VDbGFzcy5maWVsZHMgPSBvcmRlcmVkRmllbGRzO1xuICAgICAgICBwYXJzZUNsYXNzVHlwZXMubG9hZCh0aGlzLCBwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnKTtcbiAgICAgICAgcGFyc2VDbGFzc1F1ZXJpZXMubG9hZCh0aGlzLCBwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnKTtcbiAgICAgICAgcGFyc2VDbGFzc011dGF0aW9ucy5sb2FkKHRoaXMsIHBhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWcpO1xuICAgICAgfVxuICAgICk7XG5cbiAgICBkZWZhdWx0R3JhcGhRTFR5cGVzLmxvYWRBcnJheVJlc3VsdCh0aGlzLCBwYXJzZUNsYXNzZXNBcnJheSk7XG4gICAgZGVmYXVsdEdyYXBoUUxRdWVyaWVzLmxvYWQodGhpcyk7XG4gICAgZGVmYXVsdEdyYXBoUUxNdXRhdGlvbnMubG9hZCh0aGlzKTtcblxuICAgIGxldCBncmFwaFFMUXVlcnkgPSB1bmRlZmluZWQ7XG4gICAgaWYgKE9iamVjdC5rZXlzKHRoaXMuZ3JhcGhRTFF1ZXJpZXMpLmxlbmd0aCA+IDApIHtcbiAgICAgIGdyYXBoUUxRdWVyeSA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgICAgIG5hbWU6ICdRdWVyeScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnUXVlcnkgaXMgdGhlIHRvcCBsZXZlbCB0eXBlIGZvciBxdWVyaWVzLicsXG4gICAgICAgIGZpZWxkczogdGhpcy5ncmFwaFFMUXVlcmllcyxcbiAgICAgIH0pO1xuICAgICAgdGhpcy5hZGRHcmFwaFFMVHlwZShncmFwaFFMUXVlcnksIHRydWUsIHRydWUpO1xuICAgIH1cblxuICAgIGxldCBncmFwaFFMTXV0YXRpb24gPSB1bmRlZmluZWQ7XG4gICAgaWYgKE9iamVjdC5rZXlzKHRoaXMuZ3JhcGhRTE11dGF0aW9ucykubGVuZ3RoID4gMCkge1xuICAgICAgZ3JhcGhRTE11dGF0aW9uID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICAgICAgbmFtZTogJ011dGF0aW9uJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdNdXRhdGlvbiBpcyB0aGUgdG9wIGxldmVsIHR5cGUgZm9yIG11dGF0aW9ucy4nLFxuICAgICAgICBmaWVsZHM6IHRoaXMuZ3JhcGhRTE11dGF0aW9ucyxcbiAgICAgIH0pO1xuICAgICAgdGhpcy5hZGRHcmFwaFFMVHlwZShncmFwaFFMTXV0YXRpb24sIHRydWUsIHRydWUpO1xuICAgIH1cblxuICAgIGxldCBncmFwaFFMU3Vic2NyaXB0aW9uID0gdW5kZWZpbmVkO1xuICAgIGlmIChPYmplY3Qua2V5cyh0aGlzLmdyYXBoUUxTdWJzY3JpcHRpb25zKS5sZW5ndGggPiAwKSB7XG4gICAgICBncmFwaFFMU3Vic2NyaXB0aW9uID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICAgICAgbmFtZTogJ1N1YnNjcmlwdGlvbicsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnU3Vic2NyaXB0aW9uIGlzIHRoZSB0b3AgbGV2ZWwgdHlwZSBmb3Igc3Vic2NyaXB0aW9ucy4nLFxuICAgICAgICBmaWVsZHM6IHRoaXMuZ3JhcGhRTFN1YnNjcmlwdGlvbnMsXG4gICAgICB9KTtcbiAgICAgIHRoaXMuYWRkR3JhcGhRTFR5cGUoZ3JhcGhRTFN1YnNjcmlwdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYSA9IG5ldyBHcmFwaFFMU2NoZW1hKHtcbiAgICAgIHR5cGVzOiB0aGlzLmdyYXBoUUxUeXBlcyxcbiAgICAgIHF1ZXJ5OiBncmFwaFFMUXVlcnksXG4gICAgICBtdXRhdGlvbjogZ3JhcGhRTE11dGF0aW9uLFxuICAgICAgc3Vic2NyaXB0aW9uOiBncmFwaFFMU3Vic2NyaXB0aW9uLFxuICAgIH0pO1xuXG4gICAgaWYgKHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzKSB7XG4gICAgICBzY2hlbWFEaXJlY3RpdmVzLmxvYWQodGhpcyk7XG4gICAgICBpZiAodHlwZW9mIHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLmdldFR5cGVNYXAgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgLy8gSW4gZm9sbG93aW5nIGNvZGUgd2UgdXNlIHVuZGVyc2NvcmUgYXR0ciB0byBrZWVwIHRoZSBkaXJlY3QgdmFyaWFibGUgcmVmZXJlbmNlXG4gICAgICAgIGNvbnN0IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlTWFwID0gdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMuX3R5cGVNYXA7XG4gICAgICAgIGNvbnN0IGZpbmRBbmRSZXBsYWNlTGFzdFR5cGUgPSAocGFyZW50LCBrZXkpID0+IHtcbiAgICAgICAgICBpZiAocGFyZW50W2tleV0ubmFtZSkge1xuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLl90eXBlTWFwW3BhcmVudFtrZXldLm5hbWVdICYmXG4gICAgICAgICAgICAgIHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuX3R5cGVNYXBbcGFyZW50W2tleV0ubmFtZV0gIT09IHBhcmVudFtrZXldXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgLy8gVG8gYXZvaWQgdW5yZXNvbHZlZCBmaWVsZCBvbiBvdmVybG9hZGVkIHNjaGVtYVxuICAgICAgICAgICAgICAvLyByZXBsYWNlIHRoZSBmaW5hbCB0eXBlIHdpdGggdGhlIGF1dG8gc2NoZW1hIG9uZVxuICAgICAgICAgICAgICBwYXJlbnRba2V5XSA9IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuX3R5cGVNYXBbcGFyZW50W2tleV0ubmFtZV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChwYXJlbnRba2V5XS5vZlR5cGUpIHtcbiAgICAgICAgICAgICAgZmluZEFuZFJlcGxhY2VMYXN0VHlwZShwYXJlbnRba2V5XSwgJ29mVHlwZScpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgLy8gQWRkIG5vbiBzaGFyZWQgdHlwZXMgZnJvbSBjdXN0b20gc2NoZW1hIHRvIGF1dG8gc2NoZW1hXG4gICAgICAgIC8vIG5vdGU6IHNvbWUgbm9uIHNoYXJlZCB0eXBlcyBjYW4gdXNlIHNvbWUgc2hhcmVkIHR5cGVzXG4gICAgICAgIC8vIHNvIHRoaXMgY29kZSBuZWVkIHRvIGJlIHJhbiBiZWZvcmUgdGhlIHNoYXJlZCB0eXBlcyBhZGRpdGlvblxuICAgICAgICAvLyB3ZSB1c2Ugc29ydCB0byBlbnN1cmUgc2NoZW1hIGNvbnNpc3RlbmN5IG92ZXIgcmVzdGFydHNcbiAgICAgICAgT2JqZWN0LmtleXMoY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXApXG4gICAgICAgICAgLnNvcnQoKVxuICAgICAgICAgIC5mb3JFYWNoKGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlS2V5ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlID0gY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXBbY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVLZXldO1xuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAhY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUgfHxcbiAgICAgICAgICAgICAgIWN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWUgfHxcbiAgICAgICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZS5zdGFydHNXaXRoKCdfXycpXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYXV0b0dyYXBoUUxTY2hlbWFUeXBlID0gdGhpcy5ncmFwaFFMQXV0b1NjaGVtYS5fdHlwZU1hcFtcbiAgICAgICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZVxuICAgICAgICAgICAgXTtcbiAgICAgICAgICAgIGlmICghYXV0b0dyYXBoUUxTY2hlbWFUeXBlKSB7XG4gICAgICAgICAgICAgIHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuX3R5cGVNYXBbXG4gICAgICAgICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZVxuICAgICAgICAgICAgICBdID0gY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIC8vIEhhbmRsZSBzaGFyZWQgdHlwZXNcbiAgICAgICAgLy8gV2UgcGFzcyB0aHJvdWdoIGVhY2ggdHlwZSBhbmQgZW5zdXJlIHRoYXQgYWxsIHN1YiBmaWVsZCB0eXBlcyBhcmUgcmVwbGFjZWRcbiAgICAgICAgLy8gd2UgdXNlIHNvcnQgdG8gZW5zdXJlIHNjaGVtYSBjb25zaXN0ZW5jeSBvdmVyIHJlc3RhcnRzXG4gICAgICAgIE9iamVjdC5rZXlzKGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlTWFwKVxuICAgICAgICAgIC5zb3J0KClcbiAgICAgICAgICAuZm9yRWFjaChjdXN0b21HcmFwaFFMU2NoZW1hVHlwZUtleSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZSA9IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlTWFwW2N1c3RvbUdyYXBoUUxTY2hlbWFUeXBlS2V5XTtcbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgIWN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlIHx8XG4gICAgICAgICAgICAgICFjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lIHx8XG4gICAgICAgICAgICAgIGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWUuc3RhcnRzV2l0aCgnX18nKVxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGF1dG9HcmFwaFFMU2NoZW1hVHlwZSA9IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuX3R5cGVNYXBbXG4gICAgICAgICAgICAgIGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWVcbiAgICAgICAgICAgIF07XG5cbiAgICAgICAgICAgIGlmIChhdXRvR3JhcGhRTFNjaGVtYVR5cGUgJiYgdHlwZW9mIGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLmdldEZpZWxkcyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICBPYmplY3Qua2V5cyhjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5fZmllbGRzKVxuICAgICAgICAgICAgICAgIC5zb3J0KClcbiAgICAgICAgICAgICAgICAuZm9yRWFjaChmaWVsZEtleSA9PiB7XG4gICAgICAgICAgICAgICAgICBjb25zdCBmaWVsZCA9IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLl9maWVsZHNbZmllbGRLZXldO1xuICAgICAgICAgICAgICAgICAgZmluZEFuZFJlcGxhY2VMYXN0VHlwZShmaWVsZCwgJ3R5cGUnKTtcbiAgICAgICAgICAgICAgICAgIGF1dG9HcmFwaFFMU2NoZW1hVHlwZS5fZmllbGRzW2ZpZWxkLm5hbWVdID0gZmllbGQ7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSA9IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWE7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSBhd2FpdCB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcyh7XG4gICAgICAgICAgZGlyZWN0aXZlc0RlZmluaXRpb25zU2NoZW1hOiB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzRGVmaW5pdGlvbnMsXG4gICAgICAgICAgYXV0b1NjaGVtYTogdGhpcy5ncmFwaFFMQXV0b1NjaGVtYSxcbiAgICAgICAgICBncmFwaFFMU2NoZW1hRGlyZWN0aXZlczogdGhpcy5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlcyxcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSBtZXJnZVNjaGVtYXMoe1xuICAgICAgICAgIHNjaGVtYXM6IFt0aGlzLmdyYXBoUUxBdXRvU2NoZW1hXSxcbiAgICAgICAgICB0eXBlRGVmczogbWVyZ2VUeXBlRGVmcyhbXG4gICAgICAgICAgICB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcyxcbiAgICAgICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXNEZWZpbml0aW9ucyxcbiAgICAgICAgICBdKSxcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSA9IHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXModGhpcy5ncmFwaFFMU2NoZW1hKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hID0gdGhpcy5ncmFwaFFMQXV0b1NjaGVtYTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5ncmFwaFFMU2NoZW1hO1xuICB9XG5cbiAgX2xvZ09uY2Uoc2V2ZXJpdHksIG1lc3NhZ2UpIHtcbiAgICBpZiAodGhpcy5sb2dDYWNoZVttZXNzYWdlXSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aGlzLmxvZ1tzZXZlcml0eV0obWVzc2FnZSk7XG4gICAgdGhpcy5sb2dDYWNoZVttZXNzYWdlXSA9IHRydWU7XG4gIH1cblxuICBhZGRHcmFwaFFMVHlwZSh0eXBlLCB0aHJvd0Vycm9yID0gZmFsc2UsIGlnbm9yZVJlc2VydmVkID0gZmFsc2UsIGlnbm9yZUNvbm5lY3Rpb24gPSBmYWxzZSkge1xuICAgIGlmIChcbiAgICAgICghaWdub3JlUmVzZXJ2ZWQgJiYgUkVTRVJWRURfR1JBUEhRTF9UWVBFX05BTUVTLmluY2x1ZGVzKHR5cGUubmFtZSkpIHx8XG4gICAgICB0aGlzLmdyYXBoUUxUeXBlcy5maW5kKGV4aXN0aW5nVHlwZSA9PiBleGlzdGluZ1R5cGUubmFtZSA9PT0gdHlwZS5uYW1lKSB8fFxuICAgICAgKCFpZ25vcmVDb25uZWN0aW9uICYmIHR5cGUubmFtZS5lbmRzV2l0aCgnQ29ubmVjdGlvbicpKVxuICAgICkge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGBUeXBlICR7dHlwZS5uYW1lfSBjb3VsZCBub3QgYmUgYWRkZWQgdG8gdGhlIGF1dG8gc2NoZW1hIGJlY2F1c2UgaXQgY29sbGlkZWQgd2l0aCBhbiBleGlzdGluZyB0eXBlLmA7XG4gICAgICBpZiAodGhyb3dFcnJvcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSk7XG4gICAgICB9XG4gICAgICB0aGlzLl9sb2dPbmNlKCd3YXJuJywgbWVzc2FnZSk7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICB0aGlzLmdyYXBoUUxUeXBlcy5wdXNoKHR5cGUpO1xuICAgIHJldHVybiB0eXBlO1xuICB9XG5cbiAgYWRkR3JhcGhRTFF1ZXJ5KGZpZWxkTmFtZSwgZmllbGQsIHRocm93RXJyb3IgPSBmYWxzZSwgaWdub3JlUmVzZXJ2ZWQgPSBmYWxzZSkge1xuICAgIGlmIChcbiAgICAgICghaWdub3JlUmVzZXJ2ZWQgJiYgUkVTRVJWRURfR1JBUEhRTF9RVUVSWV9OQU1FUy5pbmNsdWRlcyhmaWVsZE5hbWUpKSB8fFxuICAgICAgdGhpcy5ncmFwaFFMUXVlcmllc1tmaWVsZE5hbWVdXG4gICAgKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gYFF1ZXJ5ICR7ZmllbGROYW1lfSBjb3VsZCBub3QgYmUgYWRkZWQgdG8gdGhlIGF1dG8gc2NoZW1hIGJlY2F1c2UgaXQgY29sbGlkZWQgd2l0aCBhbiBleGlzdGluZyBmaWVsZC5gO1xuICAgICAgaWYgKHRocm93RXJyb3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UpO1xuICAgICAgfVxuICAgICAgdGhpcy5fbG9nT25jZSgnd2FybicsIG1lc3NhZ2UpO1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgdGhpcy5ncmFwaFFMUXVlcmllc1tmaWVsZE5hbWVdID0gZmllbGQ7XG4gICAgcmV0dXJuIGZpZWxkO1xuICB9XG5cbiAgYWRkR3JhcGhRTE11dGF0aW9uKGZpZWxkTmFtZSwgZmllbGQsIHRocm93RXJyb3IgPSBmYWxzZSwgaWdub3JlUmVzZXJ2ZWQgPSBmYWxzZSkge1xuICAgIGlmIChcbiAgICAgICghaWdub3JlUmVzZXJ2ZWQgJiYgUkVTRVJWRURfR1JBUEhRTF9NVVRBVElPTl9OQU1FUy5pbmNsdWRlcyhmaWVsZE5hbWUpKSB8fFxuICAgICAgdGhpcy5ncmFwaFFMTXV0YXRpb25zW2ZpZWxkTmFtZV1cbiAgICApIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBgTXV0YXRpb24gJHtmaWVsZE5hbWV9IGNvdWxkIG5vdCBiZSBhZGRlZCB0byB0aGUgYXV0byBzY2hlbWEgYmVjYXVzZSBpdCBjb2xsaWRlZCB3aXRoIGFuIGV4aXN0aW5nIGZpZWxkLmA7XG4gICAgICBpZiAodGhyb3dFcnJvcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSk7XG4gICAgICB9XG4gICAgICB0aGlzLl9sb2dPbmNlKCd3YXJuJywgbWVzc2FnZSk7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICB0aGlzLmdyYXBoUUxNdXRhdGlvbnNbZmllbGROYW1lXSA9IGZpZWxkO1xuICAgIHJldHVybiBmaWVsZDtcbiAgfVxuXG4gIGhhbmRsZUVycm9yKGVycm9yKSB7XG4gICAgaWYgKGVycm9yIGluc3RhbmNlb2YgUGFyc2UuRXJyb3IpIHtcbiAgICAgIHRoaXMubG9nLmVycm9yKCdQYXJzZSBlcnJvcjogJywgZXJyb3IpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmxvZy5lcnJvcignVW5jYXVnaHQgaW50ZXJuYWwgc2VydmVyIGVycm9yLicsIGVycm9yLCBlcnJvci5zdGFjayk7XG4gICAgfVxuICAgIHRocm93IHRvR3JhcGhRTEVycm9yKGVycm9yKTtcbiAgfVxuXG4gIGFzeW5jIF9pbml0aWFsaXplU2NoZW1hQW5kQ29uZmlnKCkge1xuICAgIGNvbnN0IFtzY2hlbWFDb250cm9sbGVyLCBwYXJzZUdyYXBoUUxDb25maWddID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgdGhpcy5kYXRhYmFzZUNvbnRyb2xsZXIubG9hZFNjaGVtYSgpLFxuICAgICAgdGhpcy5wYXJzZUdyYXBoUUxDb250cm9sbGVyLmdldEdyYXBoUUxDb25maWcoKSxcbiAgICBdKTtcblxuICAgIHRoaXMuc2NoZW1hQ29udHJvbGxlciA9IHNjaGVtYUNvbnRyb2xsZXI7XG5cbiAgICByZXR1cm4ge1xuICAgICAgcGFyc2VHcmFwaFFMQ29uZmlnLFxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogR2V0cyBhbGwgY2xhc3NlcyBmb3VuZCBieSB0aGUgYHNjaGVtYUNvbnRyb2xsZXJgXG4gICAqIG1pbnVzIHRob3NlIGZpbHRlcmVkIG91dCBieSB0aGUgYXBwJ3MgcGFyc2VHcmFwaFFMQ29uZmlnLlxuICAgKi9cbiAgYXN5bmMgX2dldENsYXNzZXNGb3JTY2hlbWEocGFyc2VHcmFwaFFMQ29uZmlnOiBQYXJzZUdyYXBoUUxDb25maWcpIHtcbiAgICBjb25zdCB7IGVuYWJsZWRGb3JDbGFzc2VzLCBkaXNhYmxlZEZvckNsYXNzZXMgfSA9IHBhcnNlR3JhcGhRTENvbmZpZztcbiAgICBjb25zdCBhbGxDbGFzc2VzID0gYXdhaXQgdGhpcy5zY2hlbWFDb250cm9sbGVyLmdldEFsbENsYXNzZXMoKTtcblxuICAgIGlmIChBcnJheS5pc0FycmF5KGVuYWJsZWRGb3JDbGFzc2VzKSB8fCBBcnJheS5pc0FycmF5KGRpc2FibGVkRm9yQ2xhc3NlcykpIHtcbiAgICAgIGxldCBpbmNsdWRlZENsYXNzZXMgPSBhbGxDbGFzc2VzO1xuICAgICAgaWYgKGVuYWJsZWRGb3JDbGFzc2VzKSB7XG4gICAgICAgIGluY2x1ZGVkQ2xhc3NlcyA9IGFsbENsYXNzZXMuZmlsdGVyKGNsYXp6ID0+IHtcbiAgICAgICAgICByZXR1cm4gZW5hYmxlZEZvckNsYXNzZXMuaW5jbHVkZXMoY2xhenouY2xhc3NOYW1lKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICBpZiAoZGlzYWJsZWRGb3JDbGFzc2VzKSB7XG4gICAgICAgIC8vIENsYXNzZXMgaW5jbHVkZWQgaW4gYGVuYWJsZWRGb3JDbGFzc2VzYCB0aGF0XG4gICAgICAgIC8vIGFyZSBhbHNvIHByZXNlbnQgaW4gYGRpc2FibGVkRm9yQ2xhc3Nlc2Agd2lsbFxuICAgICAgICAvLyBzdGlsbCBiZSBmaWx0ZXJlZCBvdXRcbiAgICAgICAgaW5jbHVkZWRDbGFzc2VzID0gaW5jbHVkZWRDbGFzc2VzLmZpbHRlcihjbGF6eiA9PiB7XG4gICAgICAgICAgcmV0dXJuICFkaXNhYmxlZEZvckNsYXNzZXMuaW5jbHVkZXMoY2xhenouY2xhc3NOYW1lKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuaXNVc2Vyc0NsYXNzRGlzYWJsZWQgPSAhaW5jbHVkZWRDbGFzc2VzLnNvbWUoY2xhenogPT4ge1xuICAgICAgICByZXR1cm4gY2xhenouY2xhc3NOYW1lID09PSAnX1VzZXInO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBpbmNsdWRlZENsYXNzZXM7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBhbGxDbGFzc2VzO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBUaGlzIG1ldGhvZCByZXR1cm5zIGEgbGlzdCBvZiB0dXBsZXNcbiAgICogdGhhdCBwcm92aWRlIHRoZSBwYXJzZUNsYXNzIGFsb25nIHdpdGhcbiAgICogaXRzIHBhcnNlQ2xhc3NDb25maWcgd2hlcmUgcHJvdmlkZWQuXG4gICAqL1xuICBfZ2V0UGFyc2VDbGFzc2VzV2l0aENvbmZpZyhwYXJzZUNsYXNzZXMsIHBhcnNlR3JhcGhRTENvbmZpZzogUGFyc2VHcmFwaFFMQ29uZmlnKSB7XG4gICAgY29uc3QgeyBjbGFzc0NvbmZpZ3MgfSA9IHBhcnNlR3JhcGhRTENvbmZpZztcblxuICAgIC8vIE1ha2Ugc3VyZXMgdGhhdCB0aGUgZGVmYXVsdCBjbGFzc2VzIGFuZCBjbGFzc2VzIHRoYXRcbiAgICAvLyBzdGFydHMgd2l0aCBjYXBpdGFsaXplZCBsZXR0ZXIgd2lsbCBiZSBnZW5lcmF0ZWQgZmlyc3QuXG4gICAgY29uc3Qgc29ydENsYXNzZXMgPSAoYSwgYikgPT4ge1xuICAgICAgYSA9IGEuY2xhc3NOYW1lO1xuICAgICAgYiA9IGIuY2xhc3NOYW1lO1xuICAgICAgaWYgKGFbMF0gPT09ICdfJykge1xuICAgICAgICBpZiAoYlswXSAhPT0gJ18nKSB7XG4gICAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoYlswXSA9PT0gJ18nKSB7XG4gICAgICAgIGlmIChhWzBdICE9PSAnXycpIHtcbiAgICAgICAgICByZXR1cm4gMTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGEgPT09IGIpIHtcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9IGVsc2UgaWYgKGEgPCBiKSB7XG4gICAgICAgIHJldHVybiAtMTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiAxO1xuICAgICAgfVxuICAgIH07XG5cbiAgICByZXR1cm4gcGFyc2VDbGFzc2VzLnNvcnQoc29ydENsYXNzZXMpLm1hcChwYXJzZUNsYXNzID0+IHtcbiAgICAgIGxldCBwYXJzZUNsYXNzQ29uZmlnO1xuICAgICAgaWYgKGNsYXNzQ29uZmlncykge1xuICAgICAgICBwYXJzZUNsYXNzQ29uZmlnID0gY2xhc3NDb25maWdzLmZpbmQoYyA9PiBjLmNsYXNzTmFtZSA9PT0gcGFyc2VDbGFzcy5jbGFzc05hbWUpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIFtwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnXTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIF9nZXRGdW5jdGlvbk5hbWVzKCkge1xuICAgIHJldHVybiBhd2FpdCBnZXRGdW5jdGlvbk5hbWVzKHRoaXMuYXBwSWQpLmZpbHRlcihmdW5jdGlvbk5hbWUgPT4ge1xuICAgICAgaWYgKC9eW19hLXpBLVpdW19hLXpBLVowLTldKiQvLnRlc3QoZnVuY3Rpb25OYW1lKSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuX2xvZ09uY2UoXG4gICAgICAgICAgJ3dhcm4nLFxuICAgICAgICAgIGBGdW5jdGlvbiAke2Z1bmN0aW9uTmFtZX0gY291bGQgbm90IGJlIGFkZGVkIHRvIHRoZSBhdXRvIHNjaGVtYSBiZWNhdXNlIEdyYXBoUUwgbmFtZXMgbXVzdCBtYXRjaCAvXltfYS16QS1aXVtfYS16QS1aMC05XSokLy5gXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVja3MgZm9yIGNoYW5nZXMgdG8gdGhlIHBhcnNlQ2xhc3Nlc1xuICAgKiBvYmplY3RzIChpLmUuIGRhdGFiYXNlIHNjaGVtYSkgb3IgdG9cbiAgICogdGhlIHBhcnNlR3JhcGhRTENvbmZpZyBvYmplY3QuIElmIG5vXG4gICAqIGNoYW5nZXMgYXJlIGZvdW5kLCByZXR1cm4gdHJ1ZTtcbiAgICovXG4gIF9oYXNTY2hlbWFJbnB1dENoYW5nZWQocGFyYW1zOiB7XG4gICAgcGFyc2VDbGFzc2VzOiBhbnksXG4gICAgcGFyc2VHcmFwaFFMQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ29uZmlnLFxuICAgIGZ1bmN0aW9uTmFtZXNTdHJpbmc6IHN0cmluZyxcbiAgfSk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IHsgcGFyc2VDbGFzc2VzLCBwYXJzZUdyYXBoUUxDb25maWcsIGZ1bmN0aW9uTmFtZXNTdHJpbmcgfSA9IHBhcmFtcztcblxuICAgIC8vIEZpcnN0IGluaXRcbiAgICBpZiAoIXRoaXMuZ3JhcGhRTFNjaGVtYSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgaXNEZWVwU3RyaWN0RXF1YWwodGhpcy5wYXJzZUdyYXBoUUxDb25maWcsIHBhcnNlR3JhcGhRTENvbmZpZykgJiZcbiAgICAgIHRoaXMuZnVuY3Rpb25OYW1lc1N0cmluZyA9PT0gZnVuY3Rpb25OYW1lc1N0cmluZyAmJlxuICAgICAgaXNEZWVwU3RyaWN0RXF1YWwodGhpcy5wYXJzZUNsYXNzZXMsIHBhcnNlQ2xhc3NlcylcbiAgICApIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbn1cblxuZXhwb3J0IHsgUGFyc2VHcmFwaFFMU2NoZW1hIH07XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLElBQUFBLEtBQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLFFBQUEsR0FBQUQsT0FBQTtBQUNBLElBQUFFLE9BQUEsR0FBQUYsT0FBQTtBQUNBLElBQUFHLE1BQUEsR0FBQUgsT0FBQTtBQUNBLElBQUFJLEtBQUEsR0FBQUosT0FBQTtBQUNBLElBQUFLLGtCQUFBLEdBQUFOLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBTSxtQkFBQSxHQUFBQyx1QkFBQSxDQUFBUCxPQUFBO0FBQ0EsSUFBQVEsZUFBQSxHQUFBRCx1QkFBQSxDQUFBUCxPQUFBO0FBQ0EsSUFBQVMsaUJBQUEsR0FBQUYsdUJBQUEsQ0FBQVAsT0FBQTtBQUNBLElBQUFVLG1CQUFBLEdBQUFILHVCQUFBLENBQUFQLE9BQUE7QUFDQSxJQUFBVyxxQkFBQSxHQUFBSix1QkFBQSxDQUFBUCxPQUFBO0FBQ0EsSUFBQVksdUJBQUEsR0FBQUwsdUJBQUEsQ0FBQVAsT0FBQTtBQUNBLElBQUFhLHVC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