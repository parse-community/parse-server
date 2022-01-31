"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseGraphQLSchema = void 0;

var _node = _interopRequireDefault(require("parse/node"));

var _graphql = require("graphql");

var _stitch = require("@graphql-tools/stitch");

var _util = require("util");

var _utils = require("@graphql-tools/utils");

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
  }

  async load() {
    const {
      parseGraphQLConfig
    } = await this._initializeSchemaAndConfig();
    const parseClassesArray = await this._getClassesForSchema(parseGraphQLConfig);
    const functionNames = await this._getFunctionNames();
    const functionNamesString = JSON.stringify(functionNames);
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
      } // Fields order inside the schema seems to not be consistent across
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
        // In following code we use underscore attr to avoid js var un ref
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
        }; // Add non shared types from custom schema to auto schema
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
        }); // Handle shared types
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
          stitchSchemas: _stitch.stitchSchemas
        });
      } else {
        this.graphQLSchema = (0, _stitch.stitchSchemas)({
          schemas: [this.graphQLSchemaDirectivesDefinitions, this.graphQLAutoSchema, this.graphQLCustomTypeDefs],
          mergeDirectives: true
        });
      } // Only merge directive when string schema provided


      const graphQLSchemaTypeMap = this.graphQLSchema.getTypeMap();
      Object.keys(graphQLSchemaTypeMap).forEach(graphQLSchemaTypeName => {
        const graphQLSchemaType = graphQLSchemaTypeMap[graphQLSchemaTypeName];

        if (typeof graphQLSchemaType.getFields === 'function' && this.graphQLCustomTypeDefs.definitions) {
          const graphQLCustomTypeDef = this.graphQLCustomTypeDefs.definitions.find(definition => definition.name.value === graphQLSchemaTypeName);

          if (graphQLCustomTypeDef) {
            const graphQLSchemaTypeFieldMap = graphQLSchemaType.getFields();
            Object.keys(graphQLSchemaTypeFieldMap).forEach(graphQLSchemaTypeFieldName => {
              const graphQLSchemaTypeField = graphQLSchemaTypeFieldMap[graphQLSchemaTypeFieldName];

              if (!graphQLSchemaTypeField.astNode) {
                const astNode = graphQLCustomTypeDef.fields.find(field => field.name.value === graphQLSchemaTypeFieldName);

                if (astNode) {
                  graphQLSchemaTypeField.astNode = astNode;
                }
              }
            });
          }
        }
      });

      _utils.SchemaDirectiveVisitor.visitSchemaDirectives(this.graphQLSchema, this.graphQLSchemaDirectives);
    } else {
      this.graphQLSchema = this.graphQLAutoSchema;
    }

    return this.graphQLSchema;
  }

  addGraphQLType(type, throwError = false, ignoreReserved = false, ignoreConnection = false) {
    if (!ignoreReserved && RESERVED_GRAPHQL_TYPE_NAMES.includes(type.name) || this.graphQLTypes.find(existingType => existingType.name === type.name) || !ignoreConnection && type.name.endsWith('Connection')) {
      const message = `Type ${type.name} could not be added to the auto schema because it collided with an existing type.`;

      if (throwError) {
        throw new Error(message);
      }

      this.log.warn(message);
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

      this.log.warn(message);
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

      this.log.warn(message);
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
    } = parseGraphQLConfig; // Make sures that the default classes and classes that
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
        this.log.warn(`Function ${functionName} could not be added to the auto schema because GraphQL names must match /^[_a-zA-Z][_a-zA-Z0-9]*$/.`);
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
    } = params; // First init

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9HcmFwaFFML1BhcnNlR3JhcGhRTFNjaGVtYS5qcyJdLCJuYW1lcyI6WyJSRVNFUlZFRF9HUkFQSFFMX1RZUEVfTkFNRVMiLCJSRVNFUlZFRF9HUkFQSFFMX1FVRVJZX05BTUVTIiwiUkVTRVJWRURfR1JBUEhRTF9NVVRBVElPTl9OQU1FUyIsIlBhcnNlR3JhcGhRTFNjaGVtYSIsImNvbnN0cnVjdG9yIiwicGFyYW1zIiwicGFyc2VHcmFwaFFMQ29udHJvbGxlciIsImRhdGFiYXNlQ29udHJvbGxlciIsImxvZyIsImdyYXBoUUxDdXN0b21UeXBlRGVmcyIsImFwcElkIiwic2NoZW1hQ2FjaGUiLCJTY2hlbWFDYWNoZSIsImxvYWQiLCJwYXJzZUdyYXBoUUxDb25maWciLCJfaW5pdGlhbGl6ZVNjaGVtYUFuZENvbmZpZyIsInBhcnNlQ2xhc3Nlc0FycmF5IiwiX2dldENsYXNzZXNGb3JTY2hlbWEiLCJmdW5jdGlvbk5hbWVzIiwiX2dldEZ1bmN0aW9uTmFtZXMiLCJmdW5jdGlvbk5hbWVzU3RyaW5nIiwiSlNPTiIsInN0cmluZ2lmeSIsInBhcnNlQ2xhc3NlcyIsInJlZHVjZSIsImFjYyIsImNsYXp6IiwiY2xhc3NOYW1lIiwiX2hhc1NjaGVtYUlucHV0Q2hhbmdlZCIsImdyYXBoUUxTY2hlbWEiLCJwYXJzZUNsYXNzVHlwZXMiLCJ2aWV3ZXJUeXBlIiwiZ3JhcGhRTEF1dG9TY2hlbWEiLCJncmFwaFFMVHlwZXMiLCJncmFwaFFMUXVlcmllcyIsImdyYXBoUUxNdXRhdGlvbnMiLCJncmFwaFFMU3Vic2NyaXB0aW9ucyIsImdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzRGVmaW5pdGlvbnMiLCJncmFwaFFMU2NoZW1hRGlyZWN0aXZlcyIsInJlbGF5Tm9kZUludGVyZmFjZSIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJkZWZhdWx0UmVsYXlTY2hlbWEiLCJzY2hlbWFUeXBlcyIsIl9nZXRQYXJzZUNsYXNzZXNXaXRoQ29uZmlnIiwiZm9yRWFjaCIsInBhcnNlQ2xhc3MiLCJwYXJzZUNsYXNzQ29uZmlnIiwiT2JqZWN0Iiwia2V5cyIsImZpZWxkcyIsImZpZWxkTmFtZSIsInN0YXJ0c1dpdGgiLCJvcmRlcmVkRmllbGRzIiwic29ydCIsInBhcnNlQ2xhc3NRdWVyaWVzIiwicGFyc2VDbGFzc011dGF0aW9ucyIsImxvYWRBcnJheVJlc3VsdCIsImRlZmF1bHRHcmFwaFFMUXVlcmllcyIsImRlZmF1bHRHcmFwaFFMTXV0YXRpb25zIiwiZ3JhcGhRTFF1ZXJ5IiwidW5kZWZpbmVkIiwibGVuZ3RoIiwiR3JhcGhRTE9iamVjdFR5cGUiLCJuYW1lIiwiZGVzY3JpcHRpb24iLCJhZGRHcmFwaFFMVHlwZSIsImdyYXBoUUxNdXRhdGlvbiIsImdyYXBoUUxTdWJzY3JpcHRpb24iLCJHcmFwaFFMU2NoZW1hIiwidHlwZXMiLCJxdWVyeSIsIm11dGF0aW9uIiwic3Vic2NyaXB0aW9uIiwic2NoZW1hRGlyZWN0aXZlcyIsImdldFR5cGVNYXAiLCJjdXN0b21HcmFwaFFMU2NoZW1hVHlwZU1hcCIsIl90eXBlTWFwIiwiZmluZEFuZFJlcGxhY2VMYXN0VHlwZSIsInBhcmVudCIsImtleSIsIm9mVHlwZSIsImN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlS2V5IiwiY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUiLCJhdXRvR3JhcGhRTFNjaGVtYVR5cGUiLCJnZXRGaWVsZHMiLCJfZmllbGRzIiwiZmllbGRLZXkiLCJmaWVsZCIsImRpcmVjdGl2ZXNEZWZpbml0aW9uc1NjaGVtYSIsImF1dG9TY2hlbWEiLCJzdGl0Y2hTY2hlbWFzIiwic2NoZW1hcyIsIm1lcmdlRGlyZWN0aXZlcyIsImdyYXBoUUxTY2hlbWFUeXBlTWFwIiwiZ3JhcGhRTFNjaGVtYVR5cGVOYW1lIiwiZ3JhcGhRTFNjaGVtYVR5cGUiLCJkZWZpbml0aW9ucyIsImdyYXBoUUxDdXN0b21UeXBlRGVmIiwiZmluZCIsImRlZmluaXRpb24iLCJ2YWx1ZSIsImdyYXBoUUxTY2hlbWFUeXBlRmllbGRNYXAiLCJncmFwaFFMU2NoZW1hVHlwZUZpZWxkTmFtZSIsImdyYXBoUUxTY2hlbWFUeXBlRmllbGQiLCJhc3ROb2RlIiwiU2NoZW1hRGlyZWN0aXZlVmlzaXRvciIsInZpc2l0U2NoZW1hRGlyZWN0aXZlcyIsInR5cGUiLCJ0aHJvd0Vycm9yIiwiaWdub3JlUmVzZXJ2ZWQiLCJpZ25vcmVDb25uZWN0aW9uIiwiaW5jbHVkZXMiLCJleGlzdGluZ1R5cGUiLCJlbmRzV2l0aCIsIm1lc3NhZ2UiLCJFcnJvciIsIndhcm4iLCJwdXNoIiwiYWRkR3JhcGhRTFF1ZXJ5IiwiYWRkR3JhcGhRTE11dGF0aW9uIiwiaGFuZGxlRXJyb3IiLCJlcnJvciIsIlBhcnNlIiwic3RhY2siLCJzY2hlbWFDb250cm9sbGVyIiwiUHJvbWlzZSIsImFsbCIsImxvYWRTY2hlbWEiLCJnZXRHcmFwaFFMQ29uZmlnIiwiZW5hYmxlZEZvckNsYXNzZXMiLCJkaXNhYmxlZEZvckNsYXNzZXMiLCJhbGxDbGFzc2VzIiwiZ2V0QWxsQ2xhc3NlcyIsIkFycmF5IiwiaXNBcnJheSIsImluY2x1ZGVkQ2xhc3NlcyIsImZpbHRlciIsImlzVXNlcnNDbGFzc0Rpc2FibGVkIiwic29tZSIsImNsYXNzQ29uZmlncyIsInNvcnRDbGFzc2VzIiwiYSIsImIiLCJtYXAiLCJjIiwiZnVuY3Rpb25OYW1lIiwidGVzdCJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQUVBLE1BQU1BLDJCQUEyQixHQUFHLENBQ2xDLFFBRGtDLEVBRWxDLFNBRmtDLEVBR2xDLEtBSGtDLEVBSWxDLE9BSmtDLEVBS2xDLElBTGtDLEVBTWxDLGFBTmtDLEVBT2xDLE9BUGtDLEVBUWxDLFVBUmtDLEVBU2xDLGNBVGtDLEVBVWxDLGlCQVZrQyxFQVdsQyxtQkFYa0MsRUFZbEMs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QixNQUFELEVBSVY7QUFDVixVQUFNO0FBQUVrQixNQUFBQSxZQUFGO0FBQWdCVCxNQUFBQSxrQkFBaEI7QUFBb0NNLE1BQUFBO0FBQXBDLFFBQTREZixNQUFsRSxDQURVLENBR1Y7O0FBQ0EsUUFBSSxDQUFDLEtBQUt3QixhQUFWLEVBQXlCO0FBQ3ZCLGFBQU8sSUFBUDtBQUNEOztBQUVELFFBQ0UsNkJBQWtCLEtBQUtmLGtCQUF2QixFQUEyQ0Esa0JBQTNDLEtBQ0EsS0FBS00sbUJBQUwsS0FBNkJBLG1CQUQ3QixJQUVBLDZCQUFrQixLQUFLRyxZQUF2QixFQUFxQ0EsWUFBckMsQ0FIRixFQUlFO0FBQ0EsYUFBTyxLQUFQO0FBQ0Q7O0FBQ0QsV0FBTyxJQUFQO0FBQ0Q7O0FBdmNzQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7IEdyYXBoUUxTY2hlbWEsIEdyYXBoUUxPYmplY3RUeXBlLCBEb2N1bWVudE5vZGUsIEdyYXBoUUxOYW1lZFR5cGUgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IHN0aXRjaFNjaGVtYXMgfSBmcm9tICdAZ3JhcGhxbC10b29scy9zdGl0Y2gnO1xuaW1wb3J0IHsgaXNEZWVwU3RyaWN0RXF1YWwgfSBmcm9tICd1dGlsJztcbmltcG9ydCB7IFNjaGVtYURpcmVjdGl2ZVZpc2l0b3IgfSBmcm9tICdAZ3JhcGhxbC10b29scy91dGlscyc7XG5pbXBvcnQgcmVxdWlyZWRQYXJhbWV0ZXIgZnJvbSAnLi4vcmVxdWlyZWRQYXJhbWV0ZXInO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgKiBhcyBwYXJzZUNsYXNzVHlwZXMgZnJvbSAnLi9sb2FkZXJzL3BhcnNlQ2xhc3NUeXBlcyc7XG5pbXBvcnQgKiBhcyBwYXJzZUNsYXNzUXVlcmllcyBmcm9tICcuL2xvYWRlcnMvcGFyc2VDbGFzc1F1ZXJpZXMnO1xuaW1wb3J0ICogYXMgcGFyc2VDbGFzc011dGF0aW9ucyBmcm9tICcuL2xvYWRlcnMvcGFyc2VDbGFzc011dGF0aW9ucyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFF1ZXJpZXMgZnJvbSAnLi9sb2FkZXJzL2RlZmF1bHRHcmFwaFFMUXVlcmllcyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTE11dGF0aW9ucyBmcm9tICcuL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxNdXRhdGlvbnMnO1xuaW1wb3J0IFBhcnNlR3JhcGhRTENvbnRyb2xsZXIsIHsgUGFyc2VHcmFwaFFMQ29uZmlnIH0gZnJvbSAnLi4vQ29udHJvbGxlcnMvUGFyc2VHcmFwaFFMQ29udHJvbGxlcic7XG5pbXBvcnQgRGF0YWJhc2VDb250cm9sbGVyIGZyb20gJy4uL0NvbnRyb2xsZXJzL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgU2NoZW1hQ2FjaGUgZnJvbSAnLi4vQWRhcHRlcnMvQ2FjaGUvU2NoZW1hQ2FjaGUnO1xuaW1wb3J0IHsgdG9HcmFwaFFMRXJyb3IgfSBmcm9tICcuL3BhcnNlR3JhcGhRTFV0aWxzJztcbmltcG9ydCAqIGFzIHNjaGVtYURpcmVjdGl2ZXMgZnJvbSAnLi9sb2FkZXJzL3NjaGVtYURpcmVjdGl2ZXMnO1xuaW1wb3J0ICogYXMgc2NoZW1hVHlwZXMgZnJvbSAnLi9sb2FkZXJzL3NjaGVtYVR5cGVzJztcbmltcG9ydCB7IGdldEZ1bmN0aW9uTmFtZXMgfSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0UmVsYXlTY2hlbWEgZnJvbSAnLi9sb2FkZXJzL2RlZmF1bHRSZWxheVNjaGVtYSc7XG5cbmNvbnN0IFJFU0VSVkVEX0dSQVBIUUxfVFlQRV9OQU1FUyA9IFtcbiAgJ1N0cmluZycsXG4gICdCb29sZWFuJyxcbiAgJ0ludCcsXG4gICdGbG9hdCcsXG4gICdJRCcsXG4gICdBcnJheVJlc3VsdCcsXG4gICdRdWVyeScsXG4gICdNdXRhdGlvbicsXG4gICdTdWJzY3JpcHRpb24nLFxuICAnQ3JlYXRlRmlsZUlucHV0JyxcbiAgJ0NyZWF0ZUZpbGVQYXlsb2FkJyxcbiAgJ1ZpZXdlcicsXG4gICdTaWduVXBJbnB1dCcsXG4gICdTaWduVXBQYXlsb2FkJyxcbiAgJ0xvZ0luSW5wdXQnLFxuICAnTG9nSW5QYXlsb2FkJyxcbiAgJ0xvZ091dElucHV0JyxcbiAgJ0xvZ091dFBheWxvYWQnLFxuICAnQ2xvdWRDb2RlRnVuY3Rpb24nLFxuICAnQ2FsbENsb3VkQ29kZUlucHV0JyxcbiAgJ0NhbGxDbG91ZENvZGVQYXlsb2FkJyxcbiAgJ0NyZWF0ZUNsYXNzSW5wdXQnLFxuICAnQ3JlYXRlQ2xhc3NQYXlsb2FkJyxcbiAgJ1VwZGF0ZUNsYXNzSW5wdXQnLFxuICAnVXBkYXRlQ2xhc3NQYXlsb2FkJyxcbiAgJ0RlbGV0ZUNsYXNzSW5wdXQnLFxuICAnRGVsZXRlQ2xhc3NQYXlsb2FkJyxcbiAgJ1BhZ2VJbmZvJyxcbl07XG5jb25zdCBSRVNFUlZFRF9HUkFQSFFMX1FVRVJZX05BTUVTID0gWydoZWFsdGgnLCAndmlld2VyJywgJ2NsYXNzJywgJ2NsYXNzZXMnXTtcbmNvbnN0IFJFU0VSVkVEX0dSQVBIUUxfTVVUQVRJT05fTkFNRVMgPSBbXG4gICdzaWduVXAnLFxuICAnbG9nSW4nLFxuICAnbG9nT3V0JyxcbiAgJ2NyZWF0ZUZpbGUnLFxuICAnY2FsbENsb3VkQ29kZScsXG4gICdjcmVhdGVDbGFzcycsXG4gICd1cGRhdGVDbGFzcycsXG4gICdkZWxldGVDbGFzcycsXG5dO1xuXG5jbGFzcyBQYXJzZUdyYXBoUUxTY2hlbWEge1xuICBkYXRhYmFzZUNvbnRyb2xsZXI6IERhdGFiYXNlQ29udHJvbGxlcjtcbiAgcGFyc2VHcmFwaFFMQ29udHJvbGxlcjogUGFyc2VHcmFwaFFMQ29udHJvbGxlcjtcbiAgcGFyc2VHcmFwaFFMQ29uZmlnOiBQYXJzZUdyYXBoUUxDb25maWc7XG4gIGxvZzogYW55O1xuICBhcHBJZDogc3RyaW5nO1xuICBncmFwaFFMQ3VzdG9tVHlwZURlZnM6ID8oc3RyaW5nIHwgR3JhcGhRTFNjaGVtYSB8IERvY3VtZW50Tm9kZSB8IEdyYXBoUUxOYW1lZFR5cGVbXSk7XG4gIHNjaGVtYUNhY2hlOiBhbnk7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcGFyYW1zOiB7XG4gICAgICBkYXRhYmFzZUNvbnRyb2xsZXI6IERhdGFiYXNlQ29udHJvbGxlcixcbiAgICAgIHBhcnNlR3JhcGhRTENvbnRyb2xsZXI6IFBhcnNlR3JhcGhRTENvbnRyb2xsZXIsXG4gICAgICBsb2c6IGFueSxcbiAgICAgIGFwcElkOiBzdHJpbmcsXG4gICAgICBncmFwaFFMQ3VzdG9tVHlwZURlZnM6ID8oc3RyaW5nIHwgR3JhcGhRTFNjaGVtYSB8IERvY3VtZW50Tm9kZSB8IEdyYXBoUUxOYW1lZFR5cGVbXSksXG4gICAgfSA9IHt9XG4gICkge1xuICAgIHRoaXMucGFyc2VHcmFwaFFMQ29udHJvbGxlciA9XG4gICAgICBwYXJhbXMucGFyc2VHcmFwaFFMQ29udHJvbGxlciB8fFxuICAgICAgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBwYXJzZUdyYXBoUUxDb250cm9sbGVyIGluc3RhbmNlIScpO1xuICAgIHRoaXMuZGF0YWJhc2VDb250cm9sbGVyID1cbiAgICAgIHBhcmFtcy5kYXRhYmFzZUNvbnRyb2xsZXIgfHxcbiAgICAgIHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgZGF0YWJhc2VDb250cm9sbGVyIGluc3RhbmNlIScpO1xuICAgIHRoaXMubG9nID0gcGFyYW1zLmxvZyB8fCByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIGxvZyBpbnN0YW5jZSEnKTtcbiAgICB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcyA9IHBhcmFtcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnM7XG4gICAgdGhpcy5hcHBJZCA9IHBhcmFtcy5hcHBJZCB8fCByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSB0aGUgYXBwSWQhJyk7XG4gICAgdGhpcy5zY2hlbWFDYWNoZSA9IFNjaGVtYUNhY2hlO1xuICB9XG5cbiAgYXN5bmMgbG9hZCgpIHtcbiAgICBjb25zdCB7IHBhcnNlR3JhcGhRTENvbmZpZyB9ID0gYXdhaXQgdGhpcy5faW5pdGlhbGl6ZVNjaGVtYUFuZENvbmZpZygpO1xuICAgIGNvbnN0IHBhcnNlQ2xhc3Nlc0FycmF5ID0gYXdhaXQgdGhpcy5fZ2V0Q2xhc3Nlc0ZvclNjaGVtYShwYXJzZUdyYXBoUUxDb25maWcpO1xuICAgIGNvbnN0IGZ1bmN0aW9uTmFtZXMgPSBhd2FpdCB0aGlzLl9nZXRGdW5jdGlvbk5hbWVzKCk7XG4gICAgY29uc3QgZnVuY3Rpb25OYW1lc1N0cmluZyA9IEpTT04uc3RyaW5naWZ5KGZ1bmN0aW9uTmFtZXMpO1xuXG4gICAgY29uc3QgcGFyc2VDbGFzc2VzID0gcGFyc2VDbGFzc2VzQXJyYXkucmVkdWNlKChhY2MsIGNsYXp6KSA9PiB7XG4gICAgICBhY2NbY2xhenouY2xhc3NOYW1lXSA9IGNsYXp6O1xuICAgICAgcmV0dXJuIGFjYztcbiAgICB9LCB7fSk7XG4gICAgaWYgKFxuICAgICAgIXRoaXMuX2hhc1NjaGVtYUlucHV0Q2hhbmdlZCh7XG4gICAgICAgIHBhcnNlQ2xhc3NlcyxcbiAgICAgICAgcGFyc2VHcmFwaFFMQ29uZmlnLFxuICAgICAgICBmdW5jdGlvbk5hbWVzU3RyaW5nLFxuICAgICAgfSlcbiAgICApIHtcbiAgICAgIHJldHVybiB0aGlzLmdyYXBoUUxTY2hlbWE7XG4gICAgfVxuXG4gICAgdGhpcy5wYXJzZUNsYXNzZXMgPSBwYXJzZUNsYXNzZXM7XG4gICAgdGhpcy5wYXJzZUdyYXBoUUxDb25maWcgPSBwYXJzZUdyYXBoUUxDb25maWc7XG4gICAgdGhpcy5mdW5jdGlvbk5hbWVzID0gZnVuY3Rpb25OYW1lcztcbiAgICB0aGlzLmZ1bmN0aW9uTmFtZXNTdHJpbmcgPSBmdW5jdGlvbk5hbWVzU3RyaW5nO1xuICAgIHRoaXMucGFyc2VDbGFzc1R5cGVzID0ge307XG4gICAgdGhpcy52aWV3ZXJUeXBlID0gbnVsbDtcbiAgICB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hID0gbnVsbDtcbiAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSBudWxsO1xuICAgIHRoaXMuZ3JhcGhRTFR5cGVzID0gW107XG4gICAgdGhpcy5ncmFwaFFMUXVlcmllcyA9IHt9O1xuICAgIHRoaXMuZ3JhcGhRTE11dGF0aW9ucyA9IHt9O1xuICAgIHRoaXMuZ3JhcGhRTFN1YnNjcmlwdGlvbnMgPSB7fTtcbiAgICB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzRGVmaW5pdGlvbnMgPSBudWxsO1xuICAgIHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXMgPSB7fTtcbiAgICB0aGlzLnJlbGF5Tm9kZUludGVyZmFjZSA9IG51bGw7XG5cbiAgICBkZWZhdWx0R3JhcGhRTFR5cGVzLmxvYWQodGhpcyk7XG4gICAgZGVmYXVsdFJlbGF5U2NoZW1hLmxvYWQodGhpcyk7XG4gICAgc2NoZW1hVHlwZXMubG9hZCh0aGlzKTtcblxuICAgIHRoaXMuX2dldFBhcnNlQ2xhc3Nlc1dpdGhDb25maWcocGFyc2VDbGFzc2VzQXJyYXksIHBhcnNlR3JhcGhRTENvbmZpZykuZm9yRWFjaChcbiAgICAgIChbcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZ10pID0+IHtcbiAgICAgICAgLy8gU29tZSB0aW1lcyBzY2hlbWEgcmV0dXJuIHRoZSBfYXV0aF9kYXRhXyBmaWVsZFxuICAgICAgICAvLyBpdCB3aWxsIGxlYWQgdG8gdW5zdGFibGUgZ3JhcGhxbCBnZW5lcmF0aW9uIG9yZGVyXG4gICAgICAgIGlmIChwYXJzZUNsYXNzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgICAgIE9iamVjdC5rZXlzKHBhcnNlQ2xhc3MuZmllbGRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICBpZiAoZmllbGROYW1lLnN0YXJ0c1dpdGgoJ19hdXRoX2RhdGFfJykpIHtcbiAgICAgICAgICAgICAgZGVsZXRlIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBGaWVsZHMgb3JkZXIgaW5zaWRlIHRoZSBzY2hlbWEgc2VlbXMgdG8gbm90IGJlIGNvbnNpc3RlbnQgYWNyb3NzXG4gICAgICAgIC8vIHJlc3RhcnQgc28gd2UgbmVlZCB0byBlbnN1cmUgYW4gYWxwaGFiZXRpY2FsIG9yZGVyXG4gICAgICAgIC8vIGFsc28gaXQncyBiZXR0ZXIgZm9yIHRoZSBwbGF5Z3JvdW5kIGRvY3VtZW50YXRpb25cbiAgICAgICAgY29uc3Qgb3JkZXJlZEZpZWxkcyA9IHt9O1xuICAgICAgICBPYmplY3Qua2V5cyhwYXJzZUNsYXNzLmZpZWxkcylcbiAgICAgICAgICAuc29ydCgpXG4gICAgICAgICAgLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgIG9yZGVyZWRGaWVsZHNbZmllbGROYW1lXSA9IHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgICAgfSk7XG4gICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzID0gb3JkZXJlZEZpZWxkcztcbiAgICAgICAgcGFyc2VDbGFzc1R5cGVzLmxvYWQodGhpcywgcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZyk7XG4gICAgICAgIHBhcnNlQ2xhc3NRdWVyaWVzLmxvYWQodGhpcywgcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZyk7XG4gICAgICAgIHBhcnNlQ2xhc3NNdXRhdGlvbnMubG9hZCh0aGlzLCBwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnKTtcbiAgICAgIH1cbiAgICApO1xuXG4gICAgZGVmYXVsdEdyYXBoUUxUeXBlcy5sb2FkQXJyYXlSZXN1bHQodGhpcywgcGFyc2VDbGFzc2VzQXJyYXkpO1xuICAgIGRlZmF1bHRHcmFwaFFMUXVlcmllcy5sb2FkKHRoaXMpO1xuICAgIGRlZmF1bHRHcmFwaFFMTXV0YXRpb25zLmxvYWQodGhpcyk7XG5cbiAgICBsZXQgZ3JhcGhRTFF1ZXJ5ID0gdW5kZWZpbmVkO1xuICAgIGlmIChPYmplY3Qua2V5cyh0aGlzLmdyYXBoUUxRdWVyaWVzKS5sZW5ndGggPiAwKSB7XG4gICAgICBncmFwaFFMUXVlcnkgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgICAgICBuYW1lOiAnUXVlcnknLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1F1ZXJ5IGlzIHRoZSB0b3AgbGV2ZWwgdHlwZSBmb3IgcXVlcmllcy4nLFxuICAgICAgICBmaWVsZHM6IHRoaXMuZ3JhcGhRTFF1ZXJpZXMsXG4gICAgICB9KTtcbiAgICAgIHRoaXMuYWRkR3JhcGhRTFR5cGUoZ3JhcGhRTFF1ZXJ5LCB0cnVlLCB0cnVlKTtcbiAgICB9XG5cbiAgICBsZXQgZ3JhcGhRTE11dGF0aW9uID0gdW5kZWZpbmVkO1xuICAgIGlmIChPYmplY3Qua2V5cyh0aGlzLmdyYXBoUUxNdXRhdGlvbnMpLmxlbmd0aCA+IDApIHtcbiAgICAgIGdyYXBoUUxNdXRhdGlvbiA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgICAgIG5hbWU6ICdNdXRhdGlvbicsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnTXV0YXRpb24gaXMgdGhlIHRvcCBsZXZlbCB0eXBlIGZvciBtdXRhdGlvbnMuJyxcbiAgICAgICAgZmllbGRzOiB0aGlzLmdyYXBoUUxNdXRhdGlvbnMsXG4gICAgICB9KTtcbiAgICAgIHRoaXMuYWRkR3JhcGhRTFR5cGUoZ3JhcGhRTE11dGF0aW9uLCB0cnVlLCB0cnVlKTtcbiAgICB9XG5cbiAgICBsZXQgZ3JhcGhRTFN1YnNjcmlwdGlvbiA9IHVuZGVmaW5lZDtcbiAgICBpZiAoT2JqZWN0LmtleXModGhpcy5ncmFwaFFMU3Vic2NyaXB0aW9ucykubGVuZ3RoID4gMCkge1xuICAgICAgZ3JhcGhRTFN1YnNjcmlwdGlvbiA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgICAgIG5hbWU6ICdTdWJzY3JpcHRpb24nLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1N1YnNjcmlwdGlvbiBpcyB0aGUgdG9wIGxldmVsIHR5cGUgZm9yIHN1YnNjcmlwdGlvbnMuJyxcbiAgICAgICAgZmllbGRzOiB0aGlzLmdyYXBoUUxTdWJzY3JpcHRpb25zLFxuICAgICAgfSk7XG4gICAgICB0aGlzLmFkZEdyYXBoUUxUeXBlKGdyYXBoUUxTdWJzY3JpcHRpb24sIHRydWUsIHRydWUpO1xuICAgIH1cblxuICAgIHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEgPSBuZXcgR3JhcGhRTFNjaGVtYSh7XG4gICAgICB0eXBlczogdGhpcy5ncmFwaFFMVHlwZXMsXG4gICAgICBxdWVyeTogZ3JhcGhRTFF1ZXJ5LFxuICAgICAgbXV0YXRpb246IGdyYXBoUUxNdXRhdGlvbixcbiAgICAgIHN1YnNjcmlwdGlvbjogZ3JhcGhRTFN1YnNjcmlwdGlvbixcbiAgICB9KTtcblxuICAgIGlmICh0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcykge1xuICAgICAgc2NoZW1hRGlyZWN0aXZlcy5sb2FkKHRoaXMpO1xuXG4gICAgICBpZiAodHlwZW9mIHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLmdldFR5cGVNYXAgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgLy8gSW4gZm9sbG93aW5nIGNvZGUgd2UgdXNlIHVuZGVyc2NvcmUgYXR0ciB0byBhdm9pZCBqcyB2YXIgdW4gcmVmXG4gICAgICAgIGNvbnN0IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlTWFwID0gdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMuX3R5cGVNYXA7XG4gICAgICAgIGNvbnN0IGZpbmRBbmRSZXBsYWNlTGFzdFR5cGUgPSAocGFyZW50LCBrZXkpID0+IHtcbiAgICAgICAgICBpZiAocGFyZW50W2tleV0ubmFtZSkge1xuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLl90eXBlTWFwW3BhcmVudFtrZXldLm5hbWVdICYmXG4gICAgICAgICAgICAgIHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuX3R5cGVNYXBbcGFyZW50W2tleV0ubmFtZV0gIT09IHBhcmVudFtrZXldXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgLy8gVG8gYXZvaWQgdW5yZXNvbHZlZCBmaWVsZCBvbiBvdmVybG9hZGVkIHNjaGVtYVxuICAgICAgICAgICAgICAvLyByZXBsYWNlIHRoZSBmaW5hbCB0eXBlIHdpdGggdGhlIGF1dG8gc2NoZW1hIG9uZVxuICAgICAgICAgICAgICBwYXJlbnRba2V5XSA9IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuX3R5cGVNYXBbcGFyZW50W2tleV0ubmFtZV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChwYXJlbnRba2V5XS5vZlR5cGUpIHtcbiAgICAgICAgICAgICAgZmluZEFuZFJlcGxhY2VMYXN0VHlwZShwYXJlbnRba2V5XSwgJ29mVHlwZScpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgLy8gQWRkIG5vbiBzaGFyZWQgdHlwZXMgZnJvbSBjdXN0b20gc2NoZW1hIHRvIGF1dG8gc2NoZW1hXG4gICAgICAgIC8vIG5vdGU6IHNvbWUgbm9uIHNoYXJlZCB0eXBlcyBjYW4gdXNlIHNvbWUgc2hhcmVkIHR5cGVzXG4gICAgICAgIC8vIHNvIHRoaXMgY29kZSBuZWVkIHRvIGJlIHJhbiBiZWZvcmUgdGhlIHNoYXJlZCB0eXBlcyBhZGRpdGlvblxuICAgICAgICAvLyB3ZSB1c2Ugc29ydCB0byBlbnN1cmUgc2NoZW1hIGNvbnNpc3RlbmN5IG92ZXIgcmVzdGFydHNcbiAgICAgICAgT2JqZWN0LmtleXMoY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXApXG4gICAgICAgICAgLnNvcnQoKVxuICAgICAgICAgIC5mb3JFYWNoKGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlS2V5ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlID0gY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXBbY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVLZXldO1xuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAhY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUgfHxcbiAgICAgICAgICAgICAgIWN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWUgfHxcbiAgICAgICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZS5zdGFydHNXaXRoKCdfXycpXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYXV0b0dyYXBoUUxTY2hlbWFUeXBlID0gdGhpcy5ncmFwaFFMQXV0b1NjaGVtYS5fdHlwZU1hcFtcbiAgICAgICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZVxuICAgICAgICAgICAgXTtcbiAgICAgICAgICAgIGlmICghYXV0b0dyYXBoUUxTY2hlbWFUeXBlKSB7XG4gICAgICAgICAgICAgIHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuX3R5cGVNYXBbXG4gICAgICAgICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZVxuICAgICAgICAgICAgICBdID0gY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIC8vIEhhbmRsZSBzaGFyZWQgdHlwZXNcbiAgICAgICAgLy8gV2UgcGFzcyB0aHJvdWdoIGVhY2ggdHlwZSBhbmQgZW5zdXJlIHRoYXQgYWxsIHN1YiBmaWVsZCB0eXBlcyBhcmUgcmVwbGFjZWRcbiAgICAgICAgLy8gd2UgdXNlIHNvcnQgdG8gZW5zdXJlIHNjaGVtYSBjb25zaXN0ZW5jeSBvdmVyIHJlc3RhcnRzXG4gICAgICAgIE9iamVjdC5rZXlzKGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlTWFwKVxuICAgICAgICAgIC5zb3J0KClcbiAgICAgICAgICAuZm9yRWFjaChjdXN0b21HcmFwaFFMU2NoZW1hVHlwZUtleSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZSA9IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlTWFwW2N1c3RvbUdyYXBoUUxTY2hlbWFUeXBlS2V5XTtcbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgIWN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlIHx8XG4gICAgICAgICAgICAgICFjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lIHx8XG4gICAgICAgICAgICAgIGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWUuc3RhcnRzV2l0aCgnX18nKVxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGF1dG9HcmFwaFFMU2NoZW1hVHlwZSA9IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuX3R5cGVNYXBbXG4gICAgICAgICAgICAgIGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWVcbiAgICAgICAgICAgIF07XG5cbiAgICAgICAgICAgIGlmIChhdXRvR3JhcGhRTFNjaGVtYVR5cGUgJiYgdHlwZW9mIGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLmdldEZpZWxkcyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICBPYmplY3Qua2V5cyhjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5fZmllbGRzKVxuICAgICAgICAgICAgICAgIC5zb3J0KClcbiAgICAgICAgICAgICAgICAuZm9yRWFjaChmaWVsZEtleSA9PiB7XG4gICAgICAgICAgICAgICAgICBjb25zdCBmaWVsZCA9IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLl9maWVsZHNbZmllbGRLZXldO1xuICAgICAgICAgICAgICAgICAgZmluZEFuZFJlcGxhY2VMYXN0VHlwZShmaWVsZCwgJ3R5cGUnKTtcbiAgICAgICAgICAgICAgICAgIGF1dG9HcmFwaFFMU2NoZW1hVHlwZS5fZmllbGRzW2ZpZWxkLm5hbWVdID0gZmllbGQ7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSA9IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWE7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSBhd2FpdCB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcyh7XG4gICAgICAgICAgZGlyZWN0aXZlc0RlZmluaXRpb25zU2NoZW1hOiB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzRGVmaW5pdGlvbnMsXG4gICAgICAgICAgYXV0b1NjaGVtYTogdGhpcy5ncmFwaFFMQXV0b1NjaGVtYSxcbiAgICAgICAgICBzdGl0Y2hTY2hlbWFzLFxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSA9IHN0aXRjaFNjaGVtYXMoe1xuICAgICAgICAgIHNjaGVtYXM6IFtcbiAgICAgICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXNEZWZpbml0aW9ucyxcbiAgICAgICAgICAgIHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEsXG4gICAgICAgICAgICB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcyxcbiAgICAgICAgICBdLFxuICAgICAgICAgIG1lcmdlRGlyZWN0aXZlczogdHJ1ZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIC8vIE9ubHkgbWVyZ2UgZGlyZWN0aXZlIHdoZW4gc3RyaW5nIHNjaGVtYSBwcm92aWRlZFxuICAgICAgY29uc3QgZ3JhcGhRTFNjaGVtYVR5cGVNYXAgPSB0aGlzLmdyYXBoUUxTY2hlbWEuZ2V0VHlwZU1hcCgpO1xuICAgICAgT2JqZWN0LmtleXMoZ3JhcGhRTFNjaGVtYVR5cGVNYXApLmZvckVhY2goZ3JhcGhRTFNjaGVtYVR5cGVOYW1lID0+IHtcbiAgICAgICAgY29uc3QgZ3JhcGhRTFNjaGVtYVR5cGUgPSBncmFwaFFMU2NoZW1hVHlwZU1hcFtncmFwaFFMU2NoZW1hVHlwZU5hbWVdO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdHlwZW9mIGdyYXBoUUxTY2hlbWFUeXBlLmdldEZpZWxkcyA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgICAgIHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLmRlZmluaXRpb25zXG4gICAgICAgICkge1xuICAgICAgICAgIGNvbnN0IGdyYXBoUUxDdXN0b21UeXBlRGVmID0gdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMuZGVmaW5pdGlvbnMuZmluZChcbiAgICAgICAgICAgIGRlZmluaXRpb24gPT4gZGVmaW5pdGlvbi5uYW1lLnZhbHVlID09PSBncmFwaFFMU2NoZW1hVHlwZU5hbWVcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmIChncmFwaFFMQ3VzdG9tVHlwZURlZikge1xuICAgICAgICAgICAgY29uc3QgZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE1hcCA9IGdyYXBoUUxTY2hlbWFUeXBlLmdldEZpZWxkcygpO1xuICAgICAgICAgICAgT2JqZWN0LmtleXMoZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE1hcCkuZm9yRWFjaChncmFwaFFMU2NoZW1hVHlwZUZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICAgIGNvbnN0IGdyYXBoUUxTY2hlbWFUeXBlRmllbGQgPSBncmFwaFFMU2NoZW1hVHlwZUZpZWxkTWFwW2dyYXBoUUxTY2hlbWFUeXBlRmllbGROYW1lXTtcbiAgICAgICAgICAgICAgaWYgKCFncmFwaFFMU2NoZW1hVHlwZUZpZWxkLmFzdE5vZGUpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBhc3ROb2RlID0gZ3JhcGhRTEN1c3RvbVR5cGVEZWYuZmllbGRzLmZpbmQoXG4gICAgICAgICAgICAgICAgICBmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSBncmFwaFFMU2NoZW1hVHlwZUZpZWxkTmFtZVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgaWYgKGFzdE5vZGUpIHtcbiAgICAgICAgICAgICAgICAgIGdyYXBoUUxTY2hlbWFUeXBlRmllbGQuYXN0Tm9kZSA9IGFzdE5vZGU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBTY2hlbWFEaXJlY3RpdmVWaXNpdG9yLnZpc2l0U2NoZW1hRGlyZWN0aXZlcyhcbiAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hLFxuICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmdyYXBoUUxTY2hlbWE7XG4gIH1cblxuICBhZGRHcmFwaFFMVHlwZSh0eXBlLCB0aHJvd0Vycm9yID0gZmFsc2UsIGlnbm9yZVJlc2VydmVkID0gZmFsc2UsIGlnbm9yZUNvbm5lY3Rpb24gPSBmYWxzZSkge1xuICAgIGlmIChcbiAgICAgICghaWdub3JlUmVzZXJ2ZWQgJiYgUkVTRVJWRURfR1JBUEhRTF9UWVBFX05BTUVTLmluY2x1ZGVzKHR5cGUubmFtZSkpIHx8XG4gICAgICB0aGlzLmdyYXBoUUxUeXBlcy5maW5kKGV4aXN0aW5nVHlwZSA9PiBleGlzdGluZ1R5cGUubmFtZSA9PT0gdHlwZS5uYW1lKSB8fFxuICAgICAgKCFpZ25vcmVDb25uZWN0aW9uICYmIHR5cGUubmFtZS5lbmRzV2l0aCgnQ29ubmVjdGlvbicpKVxuICAgICkge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGBUeXBlICR7dHlwZS5uYW1lfSBjb3VsZCBub3QgYmUgYWRkZWQgdG8gdGhlIGF1dG8gc2NoZW1hIGJlY2F1c2UgaXQgY29sbGlkZWQgd2l0aCBhbiBleGlzdGluZyB0eXBlLmA7XG4gICAgICBpZiAodGhyb3dFcnJvcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSk7XG4gICAgICB9XG4gICAgICB0aGlzLmxvZy53YXJuKG1lc3NhZ2UpO1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgdGhpcy5ncmFwaFFMVHlwZXMucHVzaCh0eXBlKTtcbiAgICByZXR1cm4gdHlwZTtcbiAgfVxuXG4gIGFkZEdyYXBoUUxRdWVyeShmaWVsZE5hbWUsIGZpZWxkLCB0aHJvd0Vycm9yID0gZmFsc2UsIGlnbm9yZVJlc2VydmVkID0gZmFsc2UpIHtcbiAgICBpZiAoXG4gICAgICAoIWlnbm9yZVJlc2VydmVkICYmIFJFU0VSVkVEX0dSQVBIUUxfUVVFUllfTkFNRVMuaW5jbHVkZXMoZmllbGROYW1lKSkgfHxcbiAgICAgIHRoaXMuZ3JhcGhRTFF1ZXJpZXNbZmllbGROYW1lXVxuICAgICkge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGBRdWVyeSAke2ZpZWxkTmFtZX0gY291bGQgbm90IGJlIGFkZGVkIHRvIHRoZSBhdXRvIHNjaGVtYSBiZWNhdXNlIGl0IGNvbGxpZGVkIHdpdGggYW4gZXhpc3RpbmcgZmllbGQuYDtcbiAgICAgIGlmICh0aHJvd0Vycm9yKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihtZXNzYWdlKTtcbiAgICAgIH1cbiAgICAgIHRoaXMubG9nLndhcm4obWVzc2FnZSk7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICB0aGlzLmdyYXBoUUxRdWVyaWVzW2ZpZWxkTmFtZV0gPSBmaWVsZDtcbiAgICByZXR1cm4gZmllbGQ7XG4gIH1cblxuICBhZGRHcmFwaFFMTXV0YXRpb24oZmllbGROYW1lLCBmaWVsZCwgdGhyb3dFcnJvciA9IGZhbHNlLCBpZ25vcmVSZXNlcnZlZCA9IGZhbHNlKSB7XG4gICAgaWYgKFxuICAgICAgKCFpZ25vcmVSZXNlcnZlZCAmJiBSRVNFUlZFRF9HUkFQSFFMX01VVEFUSU9OX05BTUVTLmluY2x1ZGVzKGZpZWxkTmFtZSkpIHx8XG4gICAgICB0aGlzLmdyYXBoUUxNdXRhdGlvbnNbZmllbGROYW1lXVxuICAgICkge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGBNdXRhdGlvbiAke2ZpZWxkTmFtZX0gY291bGQgbm90IGJlIGFkZGVkIHRvIHRoZSBhdXRvIHNjaGVtYSBiZWNhdXNlIGl0IGNvbGxpZGVkIHdpdGggYW4gZXhpc3RpbmcgZmllbGQuYDtcbiAgICAgIGlmICh0aHJvd0Vycm9yKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihtZXNzYWdlKTtcbiAgICAgIH1cbiAgICAgIHRoaXMubG9nLndhcm4obWVzc2FnZSk7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICB0aGlzLmdyYXBoUUxNdXRhdGlvbnNbZmllbGROYW1lXSA9IGZpZWxkO1xuICAgIHJldHVybiBmaWVsZDtcbiAgfVxuXG4gIGhhbmRsZUVycm9yKGVycm9yKSB7XG4gICAgaWYgKGVycm9yIGluc3RhbmNlb2YgUGFyc2UuRXJyb3IpIHtcbiAgICAgIHRoaXMubG9nLmVycm9yKCdQYXJzZSBlcnJvcjogJywgZXJyb3IpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmxvZy5lcnJvcignVW5jYXVnaHQgaW50ZXJuYWwgc2VydmVyIGVycm9yLicsIGVycm9yLCBlcnJvci5zdGFjayk7XG4gICAgfVxuICAgIHRocm93IHRvR3JhcGhRTEVycm9yKGVycm9yKTtcbiAgfVxuXG4gIGFzeW5jIF9pbml0aWFsaXplU2NoZW1hQW5kQ29uZmlnKCkge1xuICAgIGNvbnN0IFtzY2hlbWFDb250cm9sbGVyLCBwYXJzZUdyYXBoUUxDb25maWddID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgdGhpcy5kYXRhYmFzZUNvbnRyb2xsZXIubG9hZFNjaGVtYSgpLFxuICAgICAgdGhpcy5wYXJzZUdyYXBoUUxDb250cm9sbGVyLmdldEdyYXBoUUxDb25maWcoKSxcbiAgICBdKTtcblxuICAgIHRoaXMuc2NoZW1hQ29udHJvbGxlciA9IHNjaGVtYUNvbnRyb2xsZXI7XG5cbiAgICByZXR1cm4ge1xuICAgICAgcGFyc2VHcmFwaFFMQ29uZmlnLFxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogR2V0cyBhbGwgY2xhc3NlcyBmb3VuZCBieSB0aGUgYHNjaGVtYUNvbnRyb2xsZXJgXG4gICAqIG1pbnVzIHRob3NlIGZpbHRlcmVkIG91dCBieSB0aGUgYXBwJ3MgcGFyc2VHcmFwaFFMQ29uZmlnLlxuICAgKi9cbiAgYXN5bmMgX2dldENsYXNzZXNGb3JTY2hlbWEocGFyc2VHcmFwaFFMQ29uZmlnOiBQYXJzZUdyYXBoUUxDb25maWcpIHtcbiAgICBjb25zdCB7IGVuYWJsZWRGb3JDbGFzc2VzLCBkaXNhYmxlZEZvckNsYXNzZXMgfSA9IHBhcnNlR3JhcGhRTENvbmZpZztcbiAgICBjb25zdCBhbGxDbGFzc2VzID0gYXdhaXQgdGhpcy5zY2hlbWFDb250cm9sbGVyLmdldEFsbENsYXNzZXMoKTtcblxuICAgIGlmIChBcnJheS5pc0FycmF5KGVuYWJsZWRGb3JDbGFzc2VzKSB8fCBBcnJheS5pc0FycmF5KGRpc2FibGVkRm9yQ2xhc3NlcykpIHtcbiAgICAgIGxldCBpbmNsdWRlZENsYXNzZXMgPSBhbGxDbGFzc2VzO1xuICAgICAgaWYgKGVuYWJsZWRGb3JDbGFzc2VzKSB7XG4gICAgICAgIGluY2x1ZGVkQ2xhc3NlcyA9IGFsbENsYXNzZXMuZmlsdGVyKGNsYXp6ID0+IHtcbiAgICAgICAgICByZXR1cm4gZW5hYmxlZEZvckNsYXNzZXMuaW5jbHVkZXMoY2xhenouY2xhc3NOYW1lKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICBpZiAoZGlzYWJsZWRGb3JDbGFzc2VzKSB7XG4gICAgICAgIC8vIENsYXNzZXMgaW5jbHVkZWQgaW4gYGVuYWJsZWRGb3JDbGFzc2VzYCB0aGF0XG4gICAgICAgIC8vIGFyZSBhbHNvIHByZXNlbnQgaW4gYGRpc2FibGVkRm9yQ2xhc3Nlc2Agd2lsbFxuICAgICAgICAvLyBzdGlsbCBiZSBmaWx0ZXJlZCBvdXRcbiAgICAgICAgaW5jbHVkZWRDbGFzc2VzID0gaW5jbHVkZWRDbGFzc2VzLmZpbHRlcihjbGF6eiA9PiB7XG4gICAgICAgICAgcmV0dXJuICFkaXNhYmxlZEZvckNsYXNzZXMuaW5jbHVkZXMoY2xhenouY2xhc3NOYW1lKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuaXNVc2Vyc0NsYXNzRGlzYWJsZWQgPSAhaW5jbHVkZWRDbGFzc2VzLnNvbWUoY2xhenogPT4ge1xuICAgICAgICByZXR1cm4gY2xhenouY2xhc3NOYW1lID09PSAnX1VzZXInO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBpbmNsdWRlZENsYXNzZXM7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBhbGxDbGFzc2VzO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBUaGlzIG1ldGhvZCByZXR1cm5zIGEgbGlzdCBvZiB0dXBsZXNcbiAgICogdGhhdCBwcm92aWRlIHRoZSBwYXJzZUNsYXNzIGFsb25nIHdpdGhcbiAgICogaXRzIHBhcnNlQ2xhc3NDb25maWcgd2hlcmUgcHJvdmlkZWQuXG4gICAqL1xuICBfZ2V0UGFyc2VDbGFzc2VzV2l0aENvbmZpZyhwYXJzZUNsYXNzZXMsIHBhcnNlR3JhcGhRTENvbmZpZzogUGFyc2VHcmFwaFFMQ29uZmlnKSB7XG4gICAgY29uc3QgeyBjbGFzc0NvbmZpZ3MgfSA9IHBhcnNlR3JhcGhRTENvbmZpZztcblxuICAgIC8vIE1ha2Ugc3VyZXMgdGhhdCB0aGUgZGVmYXVsdCBjbGFzc2VzIGFuZCBjbGFzc2VzIHRoYXRcbiAgICAvLyBzdGFydHMgd2l0aCBjYXBpdGFsaXplZCBsZXR0ZXIgd2lsbCBiZSBnZW5lcmF0ZWQgZmlyc3QuXG4gICAgY29uc3Qgc29ydENsYXNzZXMgPSAoYSwgYikgPT4ge1xuICAgICAgYSA9IGEuY2xhc3NOYW1lO1xuICAgICAgYiA9IGIuY2xhc3NOYW1lO1xuICAgICAgaWYgKGFbMF0gPT09ICdfJykge1xuICAgICAgICBpZiAoYlswXSAhPT0gJ18nKSB7XG4gICAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoYlswXSA9PT0gJ18nKSB7XG4gICAgICAgIGlmIChhWzBdICE9PSAnXycpIHtcbiAgICAgICAgICByZXR1cm4gMTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGEgPT09IGIpIHtcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9IGVsc2UgaWYgKGEgPCBiKSB7XG4gICAgICAgIHJldHVybiAtMTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiAxO1xuICAgICAgfVxuICAgIH07XG5cbiAgICByZXR1cm4gcGFyc2VDbGFzc2VzLnNvcnQoc29ydENsYXNzZXMpLm1hcChwYXJzZUNsYXNzID0+IHtcbiAgICAgIGxldCBwYXJzZUNsYXNzQ29uZmlnO1xuICAgICAgaWYgKGNsYXNzQ29uZmlncykge1xuICAgICAgICBwYXJzZUNsYXNzQ29uZmlnID0gY2xhc3NDb25maWdzLmZpbmQoYyA9PiBjLmNsYXNzTmFtZSA9PT0gcGFyc2VDbGFzcy5jbGFzc05hbWUpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIFtwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnXTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIF9nZXRGdW5jdGlvbk5hbWVzKCkge1xuICAgIHJldHVybiBhd2FpdCBnZXRGdW5jdGlvbk5hbWVzKHRoaXMuYXBwSWQpLmZpbHRlcihmdW5jdGlvbk5hbWUgPT4ge1xuICAgICAgaWYgKC9eW19hLXpBLVpdW19hLXpBLVowLTldKiQvLnRlc3QoZnVuY3Rpb25OYW1lKSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMubG9nLndhcm4oXG4gICAgICAgICAgYEZ1bmN0aW9uICR7ZnVuY3Rpb25OYW1lfSBjb3VsZCBub3QgYmUgYWRkZWQgdG8gdGhlIGF1dG8gc2NoZW1hIGJlY2F1c2UgR3JhcGhRTCBuYW1lcyBtdXN0IG1hdGNoIC9eW19hLXpBLVpdW19hLXpBLVowLTldKiQvLmBcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIENoZWNrcyBmb3IgY2hhbmdlcyB0byB0aGUgcGFyc2VDbGFzc2VzXG4gICAqIG9iamVjdHMgKGkuZS4gZGF0YWJhc2Ugc2NoZW1hKSBvciB0b1xuICAgKiB0aGUgcGFyc2VHcmFwaFFMQ29uZmlnIG9iamVjdC4gSWYgbm9cbiAgICogY2hhbmdlcyBhcmUgZm91bmQsIHJldHVybiB0cnVlO1xuICAgKi9cbiAgX2hhc1NjaGVtYUlucHV0Q2hhbmdlZChwYXJhbXM6IHtcbiAgICBwYXJzZUNsYXNzZXM6IGFueSxcbiAgICBwYXJzZUdyYXBoUUxDb25maWc6ID9QYXJzZUdyYXBoUUxDb25maWcsXG4gICAgZnVuY3Rpb25OYW1lc1N0cmluZzogc3RyaW5nLFxuICB9KTogYm9vbGVhbiB7XG4gICAgY29uc3QgeyBwYXJzZUNsYXNzZXMsIHBhcnNlR3JhcGhRTENvbmZpZywgZnVuY3Rpb25OYW1lc1N0cmluZyB9ID0gcGFyYW1zO1xuXG4gICAgLy8gRmlyc3QgaW5pdFxuICAgIGlmICghdGhpcy5ncmFwaFFMU2NoZW1hKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAoXG4gICAgICBpc0RlZXBTdHJpY3RFcXVhbCh0aGlzLnBhcnNlR3JhcGhRTENvbmZpZywgcGFyc2VHcmFwaFFMQ29uZmlnKSAmJlxuICAgICAgdGhpcy5mdW5jdGlvbk5hbWVzU3RyaW5nID09PSBmdW5jdGlvbk5hbWVzU3RyaW5nICYmXG4gICAgICBpc0RlZXBTdHJpY3RFcXVhbCh0aGlzLnBhcnNlQ2xhc3NlcywgcGFyc2VDbGFzc2VzKVxuICAgICkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxufVxuXG5leHBvcnQgeyBQYXJzZUdyYXBoUUxTY2hlbWEgfTtcbiJdfQ==