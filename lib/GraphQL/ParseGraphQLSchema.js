"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseGraphQLSchema = void 0;

var _node = _interopRequireDefault(require("parse/node"));

var _graphql = require("graphql");

var _stitch = require("@graphql-tools/stitch");

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

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

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
    const parseClasses = await this._getClassesForSchema(parseGraphQLConfig);
    const parseClassesString = JSON.stringify(parseClasses);
    const functionNames = await this._getFunctionNames();
    const functionNamesString = JSON.stringify(functionNames);

    if (this.graphQLSchema && !this._hasSchemaInputChanged({
      parseClasses,
      parseClassesString,
      parseGraphQLConfig,
      functionNamesString
    })) {
      return this.graphQLSchema;
    }

    this.parseClasses = parseClasses;
    this.parseClassesString = parseClassesString;
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

    this._getParseClassesWithConfig(parseClasses, parseGraphQLConfig).forEach(([parseClass, parseClassConfig]) => {
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

    defaultGraphQLTypes.loadArrayResult(this, parseClasses);
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
      parseClassesString,
      parseGraphQLConfig,
      functionNamesString
    } = params;

    if (JSON.stringify(this.parseGraphQLConfig) === JSON.stringify(parseGraphQLConfig) && this.functionNamesString === functionNamesString) {
      if (this.parseClasses === parseClasses) {
        return false;
      }

      if (this.parseClassesString === parseClassesString) {
        this.parseClasses = parseClasses;
        return false;
      }
    }

    return true;
  }

}

exports.ParseGraphQLSchema = ParseGraphQLSchema;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9HcmFwaFFML1BhcnNlR3JhcGhRTFNjaGVtYS5qcyJdLCJuYW1lcyI6WyJSRVNFUlZFRF9HUkFQSFFMX1RZUEVfTkFNRVMiLCJSRVNFUlZFRF9HUkFQSFFMX1FVRVJZX05BTUVTIiwiUkVTRVJWRURfR1JBUEhRTF9NVVRBVElPTl9OQU1FUyIsIlBhcnNlR3JhcGhRTFNjaGVtYSIsImNvbnN0cnVjdG9yIiwicGFyYW1zIiwicGFyc2VHcmFwaFFMQ29udHJvbGxlciIsImRhdGFiYXNlQ29udHJvbGxlciIsImxvZyIsImdyYXBoUUxDdXN0b21UeXBlRGVmcyIsImFwcElkIiwic2NoZW1hQ2FjaGUiLCJTY2hlbWFDYWNoZSIsImxvYWQiLCJwYXJzZUdyYXBoUUxDb25maWciLCJfaW5pdGlhbGl6ZVNjaGVtYUFuZENvbmZpZyIsInBhcnNlQ2xhc3NlcyIsIl9nZXRDbGFzc2VzRm9yU2NoZW1hIiwicGFyc2VDbGFzc2VzU3RyaW5nIiwiSlNPTiIsInN0cmluZ2lmeSIsImZ1bmN0aW9uTmFtZXMiLCJfZ2V0RnVuY3Rpb25OYW1lcyIsImZ1bmN0aW9uTmFtZXNTdHJpbmciLCJncmFwaFFMU2NoZW1hIiwiX2hhc1NjaGVtYUlucHV0Q2hhbmdlZCIsInBhcnNlQ2xhc3NUeXBlcyIsInZpZXdlclR5cGUiLCJncmFwaFFMQXV0b1NjaGVtYSIsImdyYXBoUUxUeXBlcyIsImdyYXBoUUxRdWVyaWVzIiwiZ3JhcGhRTE11dGF0aW9ucyIsImdyYXBoUUxTdWJzY3JpcHRpb25zIiwiZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXNEZWZpbml0aW9ucyIsImdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzIiwicmVsYXlOb2RlSW50ZXJmYWNlIiwiZGVmYXVsdEdyYXBoUUxUeXBlcyIsImRlZmF1bHRSZWxheVNjaGVtYSIsInNjaGVtYVR5cGVzIiwiX2dldFBhcnNlQ2xhc3Nlc1dpdGhDb25maWciLCJmb3JFYWNoIiwicGFyc2VDbGFzcyIsInBhcnNlQ2xhc3NDb25maWciLCJjbGFzc05hbWUiLCJPYmplY3QiLCJrZXlzIiwiZmllbGRzIiwiZmllbGROYW1lIiwic3RhcnRzV2l0aCIsIm9yZGVyZWRGaWVsZHMiLCJzb3J0IiwicGFyc2VDbGFzc1F1ZXJpZXMiLCJwYXJzZUNsYXNzTXV0YXRpb25zIiwibG9hZEFycmF5UmVzdWx0IiwiZGVmYXVsdEdyYXBoUUxRdWVyaWVzIiwiZGVmYXVsdEdyYXBoUUxNdXRhdGlvbnMiLCJncmFwaFFMUXVlcnkiLCJ1bmRlZmluZWQiLCJsZW5ndGgiLCJHcmFwaFFMT2JqZWN0VHlwZSIsIm5hbWUiLCJkZXNjcmlwdGlvbiIsImFkZEdyYXBoUUxUeXBlIiwiZ3JhcGhRTE11dGF0aW9uIiwiZ3JhcGhRTFN1YnNjcmlwdGlvbiIsIkdyYXBoUUxTY2hlbWEiLCJ0eXBlcyIsInF1ZXJ5IiwibXV0YXRpb24iLCJzdWJzY3JpcHRpb24iLCJzY2hlbWFEaXJlY3RpdmVzIiwiZ2V0VHlwZU1hcCIsImN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlTWFwIiwiX3R5cGVNYXAiLCJmaW5kQW5kUmVwbGFjZUxhc3RUeXBlIiwicGFyZW50Iiwia2V5Iiwib2ZUeXBlIiwiY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVLZXkiLCJjdXN0b21HcmFwaFFMU2NoZW1hVHlwZSIsImF1dG9HcmFwaFFMU2NoZW1hVHlwZSIsImdldEZpZWxkcyIsIl9maWVsZHMiLCJmaWVsZEtleSIsImZpZWxkIiwiZGlyZWN0aXZlc0RlZmluaXRpb25zU2NoZW1hIiwiYXV0b1NjaGVtYSIsInN0aXRjaFNjaGVtYXMiLCJzY2hlbWFzIiwibWVyZ2VEaXJlY3RpdmVzIiwiZ3JhcGhRTFNjaGVtYVR5cGVNYXAiLCJncmFwaFFMU2NoZW1hVHlwZU5hbWUiLCJncmFwaFFMU2NoZW1hVHlwZSIsImRlZmluaXRpb25zIiwiZ3JhcGhRTEN1c3RvbVR5cGVEZWYiLCJmaW5kIiwiZGVmaW5pdGlvbiIsInZhbHVlIiwiZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE1hcCIsImdyYXBoUUxTY2hlbWFUeXBlRmllbGROYW1lIiwiZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZCIsImFzdE5vZGUiLCJTY2hlbWFEaXJlY3RpdmVWaXNpdG9yIiwidmlzaXRTY2hlbWFEaXJlY3RpdmVzIiwidHlwZSIsInRocm93RXJyb3IiLCJpZ25vcmVSZXNlcnZlZCIsImlnbm9yZUNvbm5lY3Rpb24iLCJpbmNsdWRlcyIsImV4aXN0aW5nVHlwZSIsImVuZHNXaXRoIiwibWVzc2FnZSIsIkVycm9yIiwid2FybiIsInB1c2giLCJhZGRHcmFwaFFMUXVlcnkiLCJhZGRHcmFwaFFMTXV0YXRpb24iLCJoYW5kbGVFcnJvciIsImVycm9yIiwiUGFyc2UiLCJzdGFjayIsInNjaGVtYUNvbnRyb2xsZXIiLCJQcm9taXNlIiwiYWxsIiwibG9hZFNjaGVtYSIsImdldEdyYXBoUUxDb25maWciLCJlbmFibGVkRm9yQ2xhc3NlcyIsImRpc2FibGVkRm9yQ2xhc3NlcyIsImFsbENsYXNzZXMiLCJnZXRBbGxDbGFzc2VzIiwiQXJyYXkiLCJpc0FycmF5IiwiaW5jbHVkZWRDbGFzc2VzIiwiZmlsdGVyIiwiY2xhenoiLCJpc1VzZXJzQ2xhc3NEaXNhYmxlZCIsInNvbWUiLCJjbGFzc0NvbmZpZ3MiLCJzb3J0Q2xhc3NlcyIsImEiLCJiIiwibWFwIiwiYyIsImZ1bmN0aW9uTmFtZSIsInRlc3QiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFQSxNQUFNQSwyQkFBMkIsR0FBRyxDQUNsQyxRQURrQyxFQUVsQyxTQUZrQyxFQUdsQyxLQUhrQyxFQUlsQyxPQUprQyxFQUtsQyxJQUxrQyxFQU1sQyxhQU5rQyxFQU9sQyxPQVBrQyxFQVFsQyxVQVJrQyxFQVNsQyxjQVRrQyxFQVVsQyxpQkFWa0MsRUFXbEMsbUJBWGtDLEVBWWxDLFFBWmtDLEVBYWxDLGFBYmtDLEVBY2xDLGVBZGtDLEVBZWxDLFlBZmtDLEVBZ0JsQyxjQWhCa0MsRUFpQmxDLGFBakJrQyxFQWtCbEMsZUFsQmtDLEVBbUJsQyxtQkFuQmtDLEVBb0JsQyxvQkFwQmtDLEVBcUJsQyxzQkFyQmtDLEVBc0JsQyxrQkF0QmtDLEVBdUJsQyxvQkF2QmtDLEVBd0JsQyxrQkF4QmtDLEVBeUJsQyxvQkF6QmtDLEVBMEJsQyxrQkExQmtDLEVBMkJsQyxvQkEzQmtDLEVBNEJsQyxVQTVCa0MsQ0FBcEM7QUE4QkEsTUFBTUMsNEJBQTRCLEdBQUcsQ0FBQyxRQUFELEVBQVcsUUFBWCxFQUFxQixPQUFyQixFQUE4QixTQUE5QixDQUFyQztBQUNBLE1BQU1DLCtCQUErQixHQUFHLENBQ3RDLFFBRHNDLEVBRXRDLE9BRnNDLEVBR3RDLFFBSHNDLEVBSXRDLFlBSnNDLEVBS3RDLGVBTHNDLEVBTXRDLGFBTnNDLEVBT3RDLGFBUHNDLEVBUXRDLGFBUnNDLENBQXhDOztBQVdBLE1BQU1DLGtCQUFOLENBQXlCO0FBU3ZCQyxFQUFBQSxXQUFXLENBQ1RDLE1BTUMsR0FBRyxFQVBLLEVBUVQ7QUFDQSxTQUFLQyxzQkFBTCxHQUNFRCxNQUFNLENBQUNDLHNCQUFQLElBQ0EsZ0NBQWtCLHFEQUFsQixDQUZGO0FBR0EsU0FBS0Msa0JBQUwsR0FDRUYsTUFBTSxDQUFDRSxrQkFBUCxJQUNBLGdDQUFrQixpREFBbEIsQ0FGRjtBQUdBLFNBQUtDLEdBQUwsR0FBV0gsTUFBTSxDQUFDRyxHQUFQLElBQWMsZ0NBQWtCLGtDQUFsQixDQUF6QjtBQUNBLFNBQUtDLHFCQUFMLEdBQTZCSixNQUFNLENBQUNJLHFCQUFwQztBQUNBLFNBQUtDLEtBQUwsR0FBYUwsTUFBTSxDQUFDSyxLQUFQLElBQWdCLGdDQUFrQiw2QkFBbEIsQ0FBN0I7QUFDQSxTQUFLQyxXQUFMLEdBQW1CQyxvQkFBbkI7QUFDRDs7QUFFUyxRQUFKQyxJQUFJLEdBQUc7QUFDWCxVQUFNO0FBQUVDLE1BQUFBO0FBQUYsUUFBeUIsTUFBTSxLQUFLQywwQkFBTCxFQUFyQztBQUNBLFVBQU1DLFlBQVksR0FBRyxNQUFNLEtBQUtDLG9CQUFMLENBQTBCSCxrQkFBMUIsQ0FBM0I7QUFDQSxVQUFNSSxrQkFBa0IsR0FBR0MsSUFBSSxDQUFDQyxTQUFMLENBQWVKLFlBQWYsQ0FBM0I7QUFDQSxVQUFNSyxhQUFhLEdBQUcsTUFBTSxLQUFLQyxpQkFBTCxFQUE1QjtBQUNBLFVBQU1DLG1CQUFtQixHQUFHSixJQUFJLENBQUNDLFNBQUwsQ0FBZUMsYUFBZixDQUE1Qjs7QUFFQSxRQUNFLEtBQUtHLGFBQUwsSUFDQSxDQUFDLEtBQUtDLHNCQUFMLENBQTRCO0FBQzNCVCxNQUFBQSxZQUQyQjtBQUUzQkUsTUFBQUEsa0JBRjJCO0FBRzNCSixNQUFBQSxrQkFIMkI7QUFJM0JTLE1BQUFBO0FBSjJCLEtBQTVCLENBRkgsRUFRRTtBQUNBLGFBQU8sS0FBS0MsYUFBWjtBQUNEOztBQUVELFNBQUtSLFlBQUwsR0FBb0JBLFlBQXBCO0FBQ0EsU0FBS0Usa0JBQUwsR0FBMEJBLGtCQUExQjtBQUNBLFNBQUtKLGtCQUFMLEdBQTBCQSxrQkFBMUI7QUFDQSxTQUFLTyxhQUFMLEdBQXFCQSxhQUFyQjtBQUNBLFNBQUtFLG1CQUFMLEdBQTJCQSxtQkFBM0I7QUFDQSxTQUFLRyxlQUFMLEdBQXVCLEVBQXZCO0FBQ0EsU0FBS0MsVUFBTCxHQUFrQixJQUFsQjtBQUNBLFNBQUtDLGlCQUFMLEdBQXlCLElBQXpCO0FBQ0EsU0FBS0osYUFBTCxHQUFxQixJQUFyQjtBQUNBLFNBQUtLLFlBQUwsR0FBb0IsRUFBcEI7QUFDQSxTQUFLQyxjQUFMLEdBQXNCLEVBQXRCO0FBQ0EsU0FBS0MsZ0JBQUwsR0FBd0IsRUFBeEI7QUFDQSxTQUFLQyxvQkFBTCxHQUE0QixFQUE1QjtBQUNBLFNBQUtDLGtDQUFMLEdBQTBDLElBQTFDO0FBQ0EsU0FBS0MsdUJBQUwsR0FBK0IsRUFBL0I7QUFDQSxTQUFLQyxrQkFBTCxHQUEwQixJQUExQjtBQUVBQyxJQUFBQSxtQkFBbUIsQ0FBQ3ZCLElBQXBCLENBQXlCLElBQXpCO0FBQ0F3QixJQUFBQSxrQkFBa0IsQ0FBQ3hCLElBQW5CLENBQXdCLElBQXhCO0FBQ0F5QixJQUFBQSxXQUFXLENBQUN6QixJQUFaLENBQWlCLElBQWpCOztBQUVBLFNBQUswQiwwQkFBTCxDQUFnQ3ZCLFlBQWhDLEVBQThDRixrQkFBOUMsRUFBa0UwQixPQUFsRSxDQUNFLENBQUMsQ0FBQ0MsVUFBRCxFQUFhQyxnQkFBYixDQUFELEtBQW9DO0FBQ2xDO0FBQ0E7QUFDQSxVQUFJRCxVQUFVLENBQUNFLFNBQVgsS0FBeUIsT0FBN0IsRUFBc0M7QUFDcENDLFFBQUFBLE1BQU0sQ0FBQ0MsSUFBUCxDQUFZSixVQUFVLENBQUNLLE1BQXZCLEVBQStCTixPQUEvQixDQUF1Q08sU0FBUyxJQUFJO0FBQ2xELGNBQUlBLFNBQVMsQ0FBQ0MsVUFBVixDQUFxQixhQUFyQixDQUFKLEVBQXlDO0FBQ3ZDLG1CQUFPUCxVQUFVLENBQUNLLE1BQVgsQ0FBa0JDLFNBQWxCLENBQVA7QUFDRDtBQUNGLFNBSkQ7QUFLRCxPQVRpQyxDQVdsQztBQUNBO0FBQ0E7OztBQUNBLFlBQU1FLGFBQWEsR0FBRyxFQUF0QjtBQUNBTCxNQUFBQSxNQUFNLENBQUNDLElBQVAsQ0FBWUosVUFBVSxDQUFDSyxNQUF2QixFQUNHSSxJQURILEdBRUdWLE9BRkgsQ0FFV08sU0FBUyxJQUFJO0FBQ3BCRSxRQUFBQSxhQUFhLENBQUNGLFNBQUQsQ0FBYixHQUEyQk4sVUFBVSxDQUFDSyxNQUFYLENBQWtCQyxTQUFsQixDQUEzQjtBQUNELE9BSkg7QUFLQU4sTUFBQUEsVUFBVSxDQUFDSyxNQUFYLEdBQW9CRyxhQUFwQjtBQUNBdkIsTUFBQUEsZUFBZSxDQUFDYixJQUFoQixDQUFxQixJQUFyQixFQUEyQjRCLFVBQTNCLEVBQXVDQyxnQkFBdkM7QUFDQVMsTUFBQUEsaUJBQWlCLENBQUN0QyxJQUFsQixDQUF1QixJQUF2QixFQUE2QjRCLFVBQTdCLEVBQXlDQyxnQkFBekM7QUFDQVUsTUFBQUEsbUJBQW1CLENBQUN2QyxJQUFwQixDQUF5QixJQUF6QixFQUErQjRCLFVBQS9CLEVBQTJDQyxnQkFBM0M7QUFDRCxLQXpCSDs7QUE0QkFOLElBQUFBLG1CQUFtQixDQUFDaUIsZUFBcEIsQ0FBb0MsSUFBcEMsRUFBMENyQyxZQUExQztBQUNBc0MsSUFBQUEscUJBQXFCLENBQUN6QyxJQUF0QixDQUEyQixJQUEzQjtBQUNBMEMsSUFBQUEsdUJBQXVCLENBQUMxQyxJQUF4QixDQUE2QixJQUE3QjtBQUVBLFFBQUkyQyxZQUFZLEdBQUdDLFNBQW5COztBQUNBLFFBQUliLE1BQU0sQ0FBQ0MsSUFBUCxDQUFZLEtBQUtmLGNBQWpCLEVBQWlDNEIsTUFBakMsR0FBMEMsQ0FBOUMsRUFBaUQ7QUFDL0NGLE1BQUFBLFlBQVksR0FBRyxJQUFJRywwQkFBSixDQUFzQjtBQUNuQ0MsUUFBQUEsSUFBSSxFQUFFLE9BRDZCO0FBRW5DQyxRQUFBQSxXQUFXLEVBQUUsMENBRnNCO0FBR25DZixRQUFBQSxNQUFNLEVBQUUsS0FBS2hCO0FBSHNCLE9BQXRCLENBQWY7QUFLQSxXQUFLZ0MsY0FBTCxDQUFvQk4sWUFBcEIsRUFBa0MsSUFBbEMsRUFBd0MsSUFBeEM7QUFDRDs7QUFFRCxRQUFJTyxlQUFlLEdBQUdOLFNBQXRCOztBQUNBLFFBQUliLE1BQU0sQ0FBQ0MsSUFBUCxDQUFZLEtBQUtkLGdCQUFqQixFQUFtQzJCLE1BQW5DLEdBQTRDLENBQWhELEVBQW1EO0FBQ2pESyxNQUFBQSxlQUFlLEdBQUcsSUFBSUosMEJBQUosQ0FBc0I7QUFDdENDLFFBQUFBLElBQUksRUFBRSxVQURnQztBQUV0Q0MsUUFBQUEsV0FBVyxFQUFFLCtDQUZ5QjtBQUd0Q2YsUUFBQUEsTUFBTSxFQUFFLEtBQUtmO0FBSHlCLE9BQXRCLENBQWxCO0FBS0EsV0FBSytCLGNBQUwsQ0FBb0JDLGVBQXBCLEVBQXFDLElBQXJDLEVBQTJDLElBQTNDO0FBQ0Q7O0FBRUQsUUFBSUMsbUJBQW1CLEdBQUdQLFNBQTFCOztBQUNBLFFBQUliLE1BQU0sQ0FBQ0MsSUFBUCxDQUFZLEtBQUtiLG9CQUFqQixFQUF1QzBCLE1BQXZDLEdBQWdELENBQXBELEVBQXVEO0FBQ3JETSxNQUFBQSxtQkFBbUIsR0FBRyxJQUFJTCwwQkFBSixDQUFzQjtBQUMxQ0MsUUFBQUEsSUFBSSxFQUFFLGNBRG9DO0FBRTFDQyxRQUFBQSxXQUFXLEVBQUUsdURBRjZCO0FBRzFDZixRQUFBQSxNQUFNLEVBQUUsS0FBS2Q7QUFINkIsT0FBdEIsQ0FBdEI7QUFLQSxXQUFLOEIsY0FBTCxDQUFvQkUsbUJBQXBCLEVBQXlDLElBQXpDLEVBQStDLElBQS9DO0FBQ0Q7O0FBRUQsU0FBS3BDLGlCQUFMLEdBQXlCLElBQUlxQyxzQkFBSixDQUFrQjtBQUN6Q0MsTUFBQUEsS0FBSyxFQUFFLEtBQUtyQyxZQUQ2QjtBQUV6Q3NDLE1BQUFBLEtBQUssRUFBRVgsWUFGa0M7QUFHekNZLE1BQUFBLFFBQVEsRUFBRUwsZUFIK0I7QUFJekNNLE1BQUFBLFlBQVksRUFBRUw7QUFKMkIsS0FBbEIsQ0FBekI7O0FBT0EsUUFBSSxLQUFLdkQscUJBQVQsRUFBZ0M7QUFDOUI2RCxNQUFBQSxnQkFBZ0IsQ0FBQ3pELElBQWpCLENBQXNCLElBQXRCOztBQUVBLFVBQUksT0FBTyxLQUFLSixxQkFBTCxDQUEyQjhELFVBQWxDLEtBQWlELFVBQXJELEVBQWlFO0FBQy9EO0FBQ0EsY0FBTUMsMEJBQTBCLEdBQUcsS0FBSy9ELHFCQUFMLENBQTJCZ0UsUUFBOUQ7O0FBQ0EsY0FBTUMsc0JBQXNCLEdBQUcsQ0FBQ0MsTUFBRCxFQUFTQyxHQUFULEtBQWlCO0FBQzlDLGNBQUlELE1BQU0sQ0FBQ0MsR0FBRCxDQUFOLENBQVloQixJQUFoQixFQUFzQjtBQUNwQixnQkFDRSxLQUFLaEMsaUJBQUwsQ0FBdUI2QyxRQUF2QixDQUFnQ0UsTUFBTSxDQUFDQyxHQUFELENBQU4sQ0FBWWhCLElBQTVDLEtBQ0EsS0FBS2hDLGlCQUFMLENBQXVCNkMsUUFBdkIsQ0FBZ0NFLE1BQU0sQ0FBQ0MsR0FBRCxDQUFOLENBQVloQixJQUE1QyxNQUFzRGUsTUFBTSxDQUFDQyxHQUFELENBRjlELEVBR0U7QUFDQTtBQUNBO0FBQ0FELGNBQUFBLE1BQU0sQ0FBQ0MsR0FBRCxDQUFOLEdBQWMsS0FBS2hELGlCQUFMLENBQXVCNkMsUUFBdkIsQ0FBZ0NFLE1BQU0sQ0FBQ0MsR0FBRCxDQUFOLENBQVloQixJQUE1QyxDQUFkO0FBQ0Q7QUFDRixXQVRELE1BU087QUFDTCxnQkFBSWUsTUFBTSxDQUFDQyxHQUFELENBQU4sQ0FBWUMsTUFBaEIsRUFBd0I7QUFDdEJILGNBQUFBLHNCQUFzQixDQUFDQyxNQUFNLENBQUNDLEdBQUQsQ0FBUCxFQUFjLFFBQWQsQ0FBdEI7QUFDRDtBQUNGO0FBQ0YsU0FmRCxDQUgrRCxDQW1CL0Q7QUFDQTtBQUNBO0FBQ0E7OztBQUNBaEMsUUFBQUEsTUFBTSxDQUFDQyxJQUFQLENBQVkyQiwwQkFBWixFQUNHdEIsSUFESCxHQUVHVixPQUZILENBRVdzQywwQkFBMEIsSUFBSTtBQUNyQyxnQkFBTUMsdUJBQXVCLEdBQUdQLDBCQUEwQixDQUFDTSwwQkFBRCxDQUExRDs7QUFDQSxjQUNFLENBQUNDLHVCQUFELElBQ0EsQ0FBQ0EsdUJBQXVCLENBQUNuQixJQUR6QixJQUVBbUIsdUJBQXVCLENBQUNuQixJQUF4QixDQUE2QlosVUFBN0IsQ0FBd0MsSUFBeEMsQ0FIRixFQUlFO0FBQ0E7QUFDRDs7QUFDRCxnQkFBTWdDLHFCQUFxQixHQUFHLEtBQUtwRCxpQkFBTCxDQUF1QjZDLFFBQXZCLENBQzVCTSx1QkFBdUIsQ0FBQ25CLElBREksQ0FBOUI7O0FBR0EsY0FBSSxDQUFDb0IscUJBQUwsRUFBNEI7QUFDMUIsaUJBQUtwRCxpQkFBTCxDQUF1QjZDLFFBQXZCLENBQ0VNLHVCQUF1QixDQUFDbkIsSUFEMUIsSUFFSW1CLHVCQUZKO0FBR0Q7QUFDRixTQW5CSCxFQXZCK0QsQ0EyQy9EO0FBQ0E7QUFDQTs7QUFDQW5DLFFBQUFBLE1BQU0sQ0FBQ0MsSUFBUCxDQUFZMkIsMEJBQVosRUFDR3RCLElBREgsR0FFR1YsT0FGSCxDQUVXc0MsMEJBQTBCLElBQUk7QUFDckMsZ0JBQU1DLHVCQUF1QixHQUFHUCwwQkFBMEIsQ0FBQ00sMEJBQUQsQ0FBMUQ7O0FBQ0EsY0FDRSxDQUFDQyx1QkFBRCxJQUNBLENBQUNBLHVCQUF1QixDQUFDbkIsSUFEekIsSUFFQW1CLHVCQUF1QixDQUFDbkIsSUFBeEIsQ0FBNkJaLFVBQTdCLENBQXdDLElBQXhDLENBSEYsRUFJRTtBQUNBO0FBQ0Q7O0FBQ0QsZ0JBQU1nQyxxQkFBcUIsR0FBRyxLQUFLcEQsaUJBQUwsQ0FBdUI2QyxRQUF2QixDQUM1Qk0sdUJBQXVCLENBQUNuQixJQURJLENBQTlCOztBQUlBLGNBQUlvQixxQkFBcUIsSUFBSSxPQUFPRCx1QkFBdUIsQ0FBQ0UsU0FBL0IsS0FBNkMsVUFBMUUsRUFBc0Y7QUFDcEZyQyxZQUFBQSxNQUFNLENBQUNDLElBQVAsQ0FBWWtDLHVCQUF1QixDQUFDRyxPQUFwQyxFQUNHaEMsSUFESCxHQUVHVixPQUZILENBRVcyQyxRQUFRLElBQUk7QUFDbkIsb0JBQU1DLEtBQUssR0FBR0wsdUJBQXVCLENBQUNHLE9BQXhCLENBQWdDQyxRQUFoQyxDQUFkO0FBQ0FULGNBQUFBLHNCQUFzQixDQUFDVSxLQUFELEVBQVEsTUFBUixDQUF0QjtBQUNBSixjQUFBQSxxQkFBcUIsQ0FBQ0UsT0FBdEIsQ0FBOEJFLEtBQUssQ0FBQ3hCLElBQXBDLElBQTRDd0IsS0FBNUM7QUFDRCxhQU5IO0FBT0Q7QUFDRixTQXhCSDtBQXlCQSxhQUFLNUQsYUFBTCxHQUFxQixLQUFLSSxpQkFBMUI7QUFDRCxPQXhFRCxNQXdFTyxJQUFJLE9BQU8sS0FBS25CLHFCQUFaLEtBQXNDLFVBQTFDLEVBQXNEO0FBQzNELGFBQUtlLGFBQUwsR0FBcUIsTUFBTSxLQUFLZixxQkFBTCxDQUEyQjtBQUNwRDRFLFVBQUFBLDJCQUEyQixFQUFFLEtBQUtwRCxrQ0FEa0I7QUFFcERxRCxVQUFBQSxVQUFVLEVBQUUsS0FBSzFELGlCQUZtQztBQUdwRDJELFVBQUFBLGFBQWEsRUFBYkE7QUFIb0QsU0FBM0IsQ0FBM0I7QUFLRCxPQU5NLE1BTUE7QUFDTCxhQUFLL0QsYUFBTCxHQUFxQiwyQkFBYztBQUNqQ2dFLFVBQUFBLE9BQU8sRUFBRSxDQUNQLEtBQUt2RCxrQ0FERSxFQUVQLEtBQUtMLGlCQUZFLEVBR1AsS0FBS25CLHFCQUhFLENBRHdCO0FBTWpDZ0YsVUFBQUEsZUFBZSxFQUFFO0FBTmdCLFNBQWQsQ0FBckI7QUFRRCxPQTFGNkIsQ0E0RjlCOzs7QUFDQSxZQUFNQyxvQkFBb0IsR0FBRyxLQUFLbEUsYUFBTCxDQUFtQitDLFVBQW5CLEVBQTdCO0FBQ0EzQixNQUFBQSxNQUFNLENBQUNDLElBQVAsQ0FBWTZDLG9CQUFaLEVBQWtDbEQsT0FBbEMsQ0FBMENtRCxxQkFBcUIsSUFBSTtBQUNqRSxjQUFNQyxpQkFBaUIsR0FBR0Ysb0JBQW9CLENBQUNDLHFCQUFELENBQTlDOztBQUNBLFlBQ0UsT0FBT0MsaUJBQWlCLENBQUNYLFNBQXpCLEtBQXVDLFVBQXZDLElBQ0EsS0FBS3hFLHFCQUFMLENBQTJCb0YsV0FGN0IsRUFHRTtBQUNBLGdCQUFNQyxvQkFBb0IsR0FBRyxLQUFLckYscUJBQUwsQ0FBMkJvRixXQUEzQixDQUF1Q0UsSUFBdkMsQ0FDM0JDLFVBQVUsSUFBSUEsVUFBVSxDQUFDcEMsSUFBWCxDQUFnQnFDLEtBQWhCLEtBQTBCTixxQkFEYixDQUE3Qjs7QUFHQSxjQUFJRyxvQkFBSixFQUEwQjtBQUN4QixrQkFBTUkseUJBQXlCLEdBQUdOLGlCQUFpQixDQUFDWCxTQUFsQixFQUFsQztBQUNBckMsWUFBQUEsTUFBTSxDQUFDQyxJQUFQLENBQVlxRCx5QkFBWixFQUF1QzFELE9BQXZDLENBQStDMkQsMEJBQTBCLElBQUk7QUFDM0Usb0JBQU1DLHNCQUFzQixHQUFHRix5QkFBeUIsQ0FBQ0MsMEJBQUQsQ0FBeEQ7O0FBQ0Esa0JBQUksQ0FBQ0Msc0JBQXNCLENBQUNDLE9BQTVCLEVBQXFDO0FBQ25DLHNCQUFNQSxPQUFPLEdBQUdQLG9CQUFvQixDQUFDaEQsTUFBckIsQ0FBNEJpRCxJQUE1QixDQUNkWCxLQUFLLElBQUlBLEtBQUssQ0FBQ3hCLElBQU4sQ0FBV3FDLEtBQVgsS0FBcUJFLDBCQURoQixDQUFoQjs7QUFHQSxvQkFBSUUsT0FBSixFQUFhO0FBQ1hELGtCQUFBQSxzQkFBc0IsQ0FBQ0MsT0FBdkIsR0FBaUNBLE9BQWpDO0FBQ0Q7QUFDRjtBQUNGLGFBVkQ7QUFXRDtBQUNGO0FBQ0YsT0F4QkQ7O0FBMEJBQyxvQ0FBdUJDLHFCQUF2QixDQUNFLEtBQUsvRSxhQURQLEVBRUUsS0FBS1UsdUJBRlA7QUFJRCxLQTVIRCxNQTRITztBQUNMLFdBQUtWLGFBQUwsR0FBcUIsS0FBS0ksaUJBQTFCO0FBQ0Q7O0FBRUQsV0FBTyxLQUFLSixhQUFaO0FBQ0Q7O0FBRURzQyxFQUFBQSxjQUFjLENBQUMwQyxJQUFELEVBQU9DLFVBQVUsR0FBRyxLQUFwQixFQUEyQkMsY0FBYyxHQUFHLEtBQTVDLEVBQW1EQyxnQkFBZ0IsR0FBRyxLQUF0RSxFQUE2RTtBQUN6RixRQUNHLENBQUNELGNBQUQsSUFBbUIxRywyQkFBMkIsQ0FBQzRHLFFBQTVCLENBQXFDSixJQUFJLENBQUM1QyxJQUExQyxDQUFwQixJQUNBLEtBQUsvQixZQUFMLENBQWtCa0UsSUFBbEIsQ0FBdUJjLFlBQVksSUFBSUEsWUFBWSxDQUFDakQsSUFBYixLQUFzQjRDLElBQUksQ0FBQzVDLElBQWxFLENBREEsSUFFQyxDQUFDK0MsZ0JBQUQsSUFBcUJILElBQUksQ0FBQzVDLElBQUwsQ0FBVWtELFFBQVYsQ0FBbUIsWUFBbkIsQ0FIeEIsRUFJRTtBQUNBLFlBQU1DLE9BQU8sR0FBSSxRQUFPUCxJQUFJLENBQUM1QyxJQUFLLG1GQUFsQzs7QUFDQSxVQUFJNkMsVUFBSixFQUFnQjtBQUNkLGNBQU0sSUFBSU8sS0FBSixDQUFVRCxPQUFWLENBQU47QUFDRDs7QUFDRCxXQUFLdkcsR0FBTCxDQUFTeUcsSUFBVCxDQUFjRixPQUFkO0FBQ0EsYUFBT3RELFNBQVA7QUFDRDs7QUFDRCxTQUFLNUIsWUFBTCxDQUFrQnFGLElBQWxCLENBQXVCVixJQUF2QjtBQUNBLFdBQU9BLElBQVA7QUFDRDs7QUFFRFcsRUFBQUEsZUFBZSxDQUFDcEUsU0FBRCxFQUFZcUMsS0FBWixFQUFtQnFCLFVBQVUsR0FBRyxLQUFoQyxFQUF1Q0MsY0FBYyxHQUFHLEtBQXhELEVBQStEO0FBQzVFLFFBQ0csQ0FBQ0EsY0FBRCxJQUFtQnpHLDRCQUE0QixDQUFDMkcsUUFBN0IsQ0FBc0M3RCxTQUF0QyxDQUFwQixJQUNBLEtBQUtqQixjQUFMLENBQW9CaUIsU0FBcEIsQ0FGRixFQUdFO0FBQ0EsWUFBTWdFLE9BQU8sR0FBSSxTQUFRaEUsU0FBVSxvRkFBbkM7O0FBQ0EsVUFBSTBELFVBQUosRUFBZ0I7QUFDZCxjQUFNLElBQUlPLEtBQUosQ0FBVUQsT0FBVixDQUFOO0FBQ0Q7O0FBQ0QsV0FBS3ZHLEdBQUwsQ0FBU3lHLElBQVQsQ0FBY0YsT0FBZDtBQUNBLGFBQU90RCxTQUFQO0FBQ0Q7O0FBQ0QsU0FBSzNCLGNBQUwsQ0FBb0JpQixTQUFwQixJQUFpQ3FDLEtBQWpDO0FBQ0EsV0FBT0EsS0FBUDtBQUNEOztBQUVEZ0MsRUFBQUEsa0JBQWtCLENBQUNyRSxTQUFELEVBQVlxQyxLQUFaLEVBQW1CcUIsVUFBVSxHQUFHLEtBQWhDLEVBQXVDQyxjQUFjLEdBQUcsS0FBeEQsRUFBK0Q7QUFDL0UsUUFDRyxDQUFDQSxjQUFELElBQW1CeEcsK0JBQStCLENBQUMwRyxRQUFoQyxDQUF5QzdELFNBQXpDLENBQXBCLElBQ0EsS0FBS2hCLGdCQUFMLENBQXNCZ0IsU0FBdEIsQ0FGRixFQUdFO0FBQ0EsWUFBTWdFLE9BQU8sR0FBSSxZQUFXaEUsU0FBVSxvRkFBdEM7O0FBQ0EsVUFBSTBELFVBQUosRUFBZ0I7QUFDZCxjQUFNLElBQUlPLEtBQUosQ0FBVUQsT0FBVixDQUFOO0FBQ0Q7O0FBQ0QsV0FBS3ZHLEdBQUwsQ0FBU3lHLElBQVQsQ0FBY0YsT0FBZDtBQUNBLGFBQU90RCxTQUFQO0FBQ0Q7O0FBQ0QsU0FBSzFCLGdCQUFMLENBQXNCZ0IsU0FBdEIsSUFBbUNxQyxLQUFuQztBQUNBLFdBQU9BLEtBQVA7QUFDRDs7QUFFRGlDLEVBQUFBLFdBQVcsQ0FBQ0MsS0FBRCxFQUFRO0FBQ2pCLFFBQUlBLEtBQUssWUFBWUMsY0FBTVAsS0FBM0IsRUFBa0M7QUFDaEMsV0FBS3hHLEdBQUwsQ0FBUzhHLEtBQVQsQ0FBZSxlQUFmLEVBQWdDQSxLQUFoQztBQUNELEtBRkQsTUFFTztBQUNMLFdBQUs5RyxHQUFMLENBQVM4RyxLQUFULENBQWUsaUNBQWYsRUFBa0RBLEtBQWxELEVBQXlEQSxLQUFLLENBQUNFLEtBQS9EO0FBQ0Q7O0FBQ0QsVUFBTSx1Q0FBZUYsS0FBZixDQUFOO0FBQ0Q7O0FBRStCLFFBQTFCdkcsMEJBQTBCLEdBQUc7QUFDakMsVUFBTSxDQUFDMEcsZ0JBQUQsRUFBbUIzRyxrQkFBbkIsSUFBeUMsTUFBTTRHLE9BQU8sQ0FBQ0MsR0FBUixDQUFZLENBQy9ELEtBQUtwSCxrQkFBTCxDQUF3QnFILFVBQXhCLEVBRCtELEVBRS9ELEtBQUt0SCxzQkFBTCxDQUE0QnVILGdCQUE1QixFQUYrRCxDQUFaLENBQXJEO0FBS0EsU0FBS0osZ0JBQUwsR0FBd0JBLGdCQUF4QjtBQUVBLFdBQU87QUFDTDNHLE1BQUFBO0FBREssS0FBUDtBQUdEO0FBRUQ7QUFDRjtBQUNBO0FBQ0E7OztBQUM0QixRQUFwQkcsb0JBQW9CLENBQUNILGtCQUFELEVBQXlDO0FBQ2pFLFVBQU07QUFBRWdILE1BQUFBLGlCQUFGO0FBQXFCQyxNQUFBQTtBQUFyQixRQUE0Q2pILGtCQUFsRDtBQUNBLFVBQU1rSCxVQUFVLEdBQUcsTUFBTSxLQUFLUCxnQkFBTCxDQUFzQlEsYUFBdEIsRUFBekI7O0FBRUEsUUFBSUMsS0FBSyxDQUFDQyxPQUFOLENBQWNMLGlCQUFkLEtBQW9DSSxLQUFLLENBQUNDLE9BQU4sQ0FBY0osa0JBQWQsQ0FBeEMsRUFBMkU7QUFDekUsVUFBSUssZUFBZSxHQUFHSixVQUF0Qjs7QUFDQSxVQUFJRixpQkFBSixFQUF1QjtBQUNyQk0sUUFBQUEsZUFBZSxHQUFHSixVQUFVLENBQUNLLE1BQVgsQ0FBa0JDLEtBQUssSUFBSTtBQUMzQyxpQkFBT1IsaUJBQWlCLENBQUNsQixRQUFsQixDQUEyQjBCLEtBQUssQ0FBQzNGLFNBQWpDLENBQVA7QUFDRCxTQUZpQixDQUFsQjtBQUdEOztBQUNELFVBQUlvRixrQkFBSixFQUF3QjtBQUN0QjtBQUNBO0FBQ0E7QUFDQUssUUFBQUEsZUFBZSxHQUFHQSxlQUFlLENBQUNDLE1BQWhCLENBQXVCQyxLQUFLLElBQUk7QUFDaEQsaUJBQU8sQ0FBQ1Asa0JBQWtCLENBQUNuQixRQUFuQixDQUE0QjBCLEtBQUssQ0FBQzNGLFNBQWxDLENBQVI7QUFDRCxTQUZpQixDQUFsQjtBQUdEOztBQUVELFdBQUs0RixvQkFBTCxHQUE0QixDQUFDSCxlQUFlLENBQUNJLElBQWhCLENBQXFCRixLQUFLLElBQUk7QUFDekQsZUFBT0EsS0FBSyxDQUFDM0YsU0FBTixLQUFvQixPQUEzQjtBQUNELE9BRjRCLENBQTdCO0FBSUEsYUFBT3lGLGVBQVA7QUFDRCxLQXJCRCxNQXFCTztBQUNMLGFBQU9KLFVBQVA7QUFDRDtBQUNGO0FBRUQ7QUFDRjtBQUNBO0FBQ0E7QUFDQTs7O0FBQ0V6RixFQUFBQSwwQkFBMEIsQ0FBQ3ZCLFlBQUQsRUFBZUYsa0JBQWYsRUFBdUQ7QUFDL0UsVUFBTTtBQUFFMkgsTUFBQUE7QUFBRixRQUFtQjNILGtCQUF6QixDQUQrRSxDQUcvRTtBQUNBOztBQUNBLFVBQU00SCxXQUFXLEdBQUcsQ0FBQ0MsQ0FBRCxFQUFJQyxDQUFKLEtBQVU7QUFDNUJELE1BQUFBLENBQUMsR0FBR0EsQ0FBQyxDQUFDaEcsU0FBTjtBQUNBaUcsTUFBQUEsQ0FBQyxHQUFHQSxDQUFDLENBQUNqRyxTQUFOOztBQUNBLFVBQUlnRyxDQUFDLENBQUMsQ0FBRCxDQUFELEtBQVMsR0FBYixFQUFrQjtBQUNoQixZQUFJQyxDQUFDLENBQUMsQ0FBRCxDQUFELEtBQVMsR0FBYixFQUFrQjtBQUNoQixpQkFBTyxDQUFDLENBQVI7QUFDRDtBQUNGOztBQUNELFVBQUlBLENBQUMsQ0FBQyxDQUFELENBQUQsS0FBUyxHQUFiLEVBQWtCO0FBQ2hCLFlBQUlELENBQUMsQ0FBQyxDQUFELENBQUQsS0FBUyxHQUFiLEVBQWtCO0FBQ2hCLGlCQUFPLENBQVA7QUFDRDtBQUNGOztBQUNELFVBQUlBLENBQUMsS0FBS0MsQ0FBVixFQUFhO0FBQ1gsZUFBTyxDQUFQO0FBQ0QsT0FGRCxNQUVPLElBQUlELENBQUMsR0FBR0MsQ0FBUixFQUFXO0FBQ2hCLGVBQU8sQ0FBQyxDQUFSO0FBQ0QsT0FGTSxNQUVBO0FBQ0wsZUFBTyxDQUFQO0FBQ0Q7QUFDRixLQXBCRDs7QUFzQkEsV0FBTzVILFlBQVksQ0FBQ2tDLElBQWIsQ0FBa0J3RixXQUFsQixFQUErQkcsR0FBL0IsQ0FBbUNwRyxVQUFVLElBQUk7QUFDdEQsVUFBSUMsZ0JBQUo7O0FBQ0EsVUFBSStGLFlBQUosRUFBa0I7QUFDaEIvRixRQUFBQSxnQkFBZ0IsR0FBRytGLFlBQVksQ0FBQzFDLElBQWIsQ0FBa0IrQyxDQUFDLElBQUlBLENBQUMsQ0FBQ25HLFNBQUYsS0FBZ0JGLFVBQVUsQ0FBQ0UsU0FBbEQsQ0FBbkI7QUFDRDs7QUFDRCxhQUFPLENBQUNGLFVBQUQsRUFBYUMsZ0JBQWIsQ0FBUDtBQUNELEtBTk0sQ0FBUDtBQU9EOztBQUVzQixRQUFqQnBCLGlCQUFpQixHQUFHO0FBQ3hCLFdBQU8sTUFBTSxnQ0FBaUIsS0FBS1osS0FBdEIsRUFBNkIySCxNQUE3QixDQUFvQ1UsWUFBWSxJQUFJO0FBQy9ELFVBQUksMkJBQTJCQyxJQUEzQixDQUFnQ0QsWUFBaEMsQ0FBSixFQUFtRDtBQUNqRCxlQUFPLElBQVA7QUFDRCxPQUZELE1BRU87QUFDTCxhQUFLdkksR0FBTCxDQUFTeUcsSUFBVCxDQUNHLFlBQVc4QixZQUFhLHFHQUQzQjtBQUdBLGVBQU8sS0FBUDtBQUNEO0FBQ0YsS0FUWSxDQUFiO0FBVUQ7QUFFRDtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQUNFdEgsRUFBQUEsc0JBQXNCLENBQUNwQixNQUFELEVBS1Y7QUFDVixVQUFNO0FBQUVXLE1BQUFBLFlBQUY7QUFBZ0JFLE1BQUFBLGtCQUFoQjtBQUFvQ0osTUFBQUEsa0JBQXBDO0FBQXdEUyxNQUFBQTtBQUF4RCxRQUFnRmxCLE1BQXRGOztBQUVBLFFBQ0VjLElBQUksQ0FBQ0MsU0FBTCxDQUFlLEtBQUtOLGtCQUFwQixNQUE0Q0ssSUFBSSxDQUFDQyxTQUFMLENBQWVOLGtCQUFmLENBQTVDLElBQ0EsS0FBS1MsbUJBQUwsS0FBNkJBLG1CQUYvQixFQUdFO0FBQ0EsVUFBSSxLQUFLUCxZQUFMLEtBQXNCQSxZQUExQixFQUF3QztBQUN0QyxlQUFPLEtBQVA7QUFDRDs7QUFFRCxVQUFJLEtBQUtFLGtCQUFMLEtBQTRCQSxrQkFBaEMsRUFBb0Q7QUFDbEQsYUFBS0YsWUFBTCxHQUFvQkEsWUFBcEI7QUFDQSxlQUFPLEtBQVA7QUFDRDtBQUNGOztBQUVELFdBQU8sSUFBUDtBQUNEOztBQTFjc0IiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgeyBHcmFwaFFMU2NoZW1hLCBHcmFwaFFMT2JqZWN0VHlwZSwgRG9jdW1lbnROb2RlLCBHcmFwaFFMTmFtZWRUeXBlIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBzdGl0Y2hTY2hlbWFzIH0gZnJvbSAnQGdyYXBocWwtdG9vbHMvc3RpdGNoJztcbmltcG9ydCB7IFNjaGVtYURpcmVjdGl2ZVZpc2l0b3IgfSBmcm9tICdAZ3JhcGhxbC10b29scy91dGlscyc7XG5pbXBvcnQgcmVxdWlyZWRQYXJhbWV0ZXIgZnJvbSAnLi4vcmVxdWlyZWRQYXJhbWV0ZXInO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgKiBhcyBwYXJzZUNsYXNzVHlwZXMgZnJvbSAnLi9sb2FkZXJzL3BhcnNlQ2xhc3NUeXBlcyc7XG5pbXBvcnQgKiBhcyBwYXJzZUNsYXNzUXVlcmllcyBmcm9tICcuL2xvYWRlcnMvcGFyc2VDbGFzc1F1ZXJpZXMnO1xuaW1wb3J0ICogYXMgcGFyc2VDbGFzc011dGF0aW9ucyBmcm9tICcuL2xvYWRlcnMvcGFyc2VDbGFzc011dGF0aW9ucyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFF1ZXJpZXMgZnJvbSAnLi9sb2FkZXJzL2RlZmF1bHRHcmFwaFFMUXVlcmllcyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTE11dGF0aW9ucyBmcm9tICcuL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxNdXRhdGlvbnMnO1xuaW1wb3J0IFBhcnNlR3JhcGhRTENvbnRyb2xsZXIsIHsgUGFyc2VHcmFwaFFMQ29uZmlnIH0gZnJvbSAnLi4vQ29udHJvbGxlcnMvUGFyc2VHcmFwaFFMQ29udHJvbGxlcic7XG5pbXBvcnQgRGF0YWJhc2VDb250cm9sbGVyIGZyb20gJy4uL0NvbnRyb2xsZXJzL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgU2NoZW1hQ2FjaGUgZnJvbSAnLi4vQWRhcHRlcnMvQ2FjaGUvU2NoZW1hQ2FjaGUnO1xuaW1wb3J0IHsgdG9HcmFwaFFMRXJyb3IgfSBmcm9tICcuL3BhcnNlR3JhcGhRTFV0aWxzJztcbmltcG9ydCAqIGFzIHNjaGVtYURpcmVjdGl2ZXMgZnJvbSAnLi9sb2FkZXJzL3NjaGVtYURpcmVjdGl2ZXMnO1xuaW1wb3J0ICogYXMgc2NoZW1hVHlwZXMgZnJvbSAnLi9sb2FkZXJzL3NjaGVtYVR5cGVzJztcbmltcG9ydCB7IGdldEZ1bmN0aW9uTmFtZXMgfSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0UmVsYXlTY2hlbWEgZnJvbSAnLi9sb2FkZXJzL2RlZmF1bHRSZWxheVNjaGVtYSc7XG5cbmNvbnN0IFJFU0VSVkVEX0dSQVBIUUxfVFlQRV9OQU1FUyA9IFtcbiAgJ1N0cmluZycsXG4gICdCb29sZWFuJyxcbiAgJ0ludCcsXG4gICdGbG9hdCcsXG4gICdJRCcsXG4gICdBcnJheVJlc3VsdCcsXG4gICdRdWVyeScsXG4gICdNdXRhdGlvbicsXG4gICdTdWJzY3JpcHRpb24nLFxuICAnQ3JlYXRlRmlsZUlucHV0JyxcbiAgJ0NyZWF0ZUZpbGVQYXlsb2FkJyxcbiAgJ1ZpZXdlcicsXG4gICdTaWduVXBJbnB1dCcsXG4gICdTaWduVXBQYXlsb2FkJyxcbiAgJ0xvZ0luSW5wdXQnLFxuICAnTG9nSW5QYXlsb2FkJyxcbiAgJ0xvZ091dElucHV0JyxcbiAgJ0xvZ091dFBheWxvYWQnLFxuICAnQ2xvdWRDb2RlRnVuY3Rpb24nLFxuICAnQ2FsbENsb3VkQ29kZUlucHV0JyxcbiAgJ0NhbGxDbG91ZENvZGVQYXlsb2FkJyxcbiAgJ0NyZWF0ZUNsYXNzSW5wdXQnLFxuICAnQ3JlYXRlQ2xhc3NQYXlsb2FkJyxcbiAgJ1VwZGF0ZUNsYXNzSW5wdXQnLFxuICAnVXBkYXRlQ2xhc3NQYXlsb2FkJyxcbiAgJ0RlbGV0ZUNsYXNzSW5wdXQnLFxuICAnRGVsZXRlQ2xhc3NQYXlsb2FkJyxcbiAgJ1BhZ2VJbmZvJyxcbl07XG5jb25zdCBSRVNFUlZFRF9HUkFQSFFMX1FVRVJZX05BTUVTID0gWydoZWFsdGgnLCAndmlld2VyJywgJ2NsYXNzJywgJ2NsYXNzZXMnXTtcbmNvbnN0IFJFU0VSVkVEX0dSQVBIUUxfTVVUQVRJT05fTkFNRVMgPSBbXG4gICdzaWduVXAnLFxuICAnbG9nSW4nLFxuICAnbG9nT3V0JyxcbiAgJ2NyZWF0ZUZpbGUnLFxuICAnY2FsbENsb3VkQ29kZScsXG4gICdjcmVhdGVDbGFzcycsXG4gICd1cGRhdGVDbGFzcycsXG4gICdkZWxldGVDbGFzcycsXG5dO1xuXG5jbGFzcyBQYXJzZUdyYXBoUUxTY2hlbWEge1xuICBkYXRhYmFzZUNvbnRyb2xsZXI6IERhdGFiYXNlQ29udHJvbGxlcjtcbiAgcGFyc2VHcmFwaFFMQ29udHJvbGxlcjogUGFyc2VHcmFwaFFMQ29udHJvbGxlcjtcbiAgcGFyc2VHcmFwaFFMQ29uZmlnOiBQYXJzZUdyYXBoUUxDb25maWc7XG4gIGxvZzogYW55O1xuICBhcHBJZDogc3RyaW5nO1xuICBncmFwaFFMQ3VzdG9tVHlwZURlZnM6ID8oc3RyaW5nIHwgR3JhcGhRTFNjaGVtYSB8IERvY3VtZW50Tm9kZSB8IEdyYXBoUUxOYW1lZFR5cGVbXSk7XG4gIHNjaGVtYUNhY2hlOiBhbnk7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcGFyYW1zOiB7XG4gICAgICBkYXRhYmFzZUNvbnRyb2xsZXI6IERhdGFiYXNlQ29udHJvbGxlcixcbiAgICAgIHBhcnNlR3JhcGhRTENvbnRyb2xsZXI6IFBhcnNlR3JhcGhRTENvbnRyb2xsZXIsXG4gICAgICBsb2c6IGFueSxcbiAgICAgIGFwcElkOiBzdHJpbmcsXG4gICAgICBncmFwaFFMQ3VzdG9tVHlwZURlZnM6ID8oc3RyaW5nIHwgR3JhcGhRTFNjaGVtYSB8IERvY3VtZW50Tm9kZSB8IEdyYXBoUUxOYW1lZFR5cGVbXSksXG4gICAgfSA9IHt9XG4gICkge1xuICAgIHRoaXMucGFyc2VHcmFwaFFMQ29udHJvbGxlciA9XG4gICAgICBwYXJhbXMucGFyc2VHcmFwaFFMQ29udHJvbGxlciB8fFxuICAgICAgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBwYXJzZUdyYXBoUUxDb250cm9sbGVyIGluc3RhbmNlIScpO1xuICAgIHRoaXMuZGF0YWJhc2VDb250cm9sbGVyID1cbiAgICAgIHBhcmFtcy5kYXRhYmFzZUNvbnRyb2xsZXIgfHxcbiAgICAgIHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgZGF0YWJhc2VDb250cm9sbGVyIGluc3RhbmNlIScpO1xuICAgIHRoaXMubG9nID0gcGFyYW1zLmxvZyB8fCByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIGxvZyBpbnN0YW5jZSEnKTtcbiAgICB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcyA9IHBhcmFtcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnM7XG4gICAgdGhpcy5hcHBJZCA9IHBhcmFtcy5hcHBJZCB8fCByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSB0aGUgYXBwSWQhJyk7XG4gICAgdGhpcy5zY2hlbWFDYWNoZSA9IFNjaGVtYUNhY2hlO1xuICB9XG5cbiAgYXN5bmMgbG9hZCgpIHtcbiAgICBjb25zdCB7IHBhcnNlR3JhcGhRTENvbmZpZyB9ID0gYXdhaXQgdGhpcy5faW5pdGlhbGl6ZVNjaGVtYUFuZENvbmZpZygpO1xuICAgIGNvbnN0IHBhcnNlQ2xhc3NlcyA9IGF3YWl0IHRoaXMuX2dldENsYXNzZXNGb3JTY2hlbWEocGFyc2VHcmFwaFFMQ29uZmlnKTtcbiAgICBjb25zdCBwYXJzZUNsYXNzZXNTdHJpbmcgPSBKU09OLnN0cmluZ2lmeShwYXJzZUNsYXNzZXMpO1xuICAgIGNvbnN0IGZ1bmN0aW9uTmFtZXMgPSBhd2FpdCB0aGlzLl9nZXRGdW5jdGlvbk5hbWVzKCk7XG4gICAgY29uc3QgZnVuY3Rpb25OYW1lc1N0cmluZyA9IEpTT04uc3RyaW5naWZ5KGZ1bmN0aW9uTmFtZXMpO1xuXG4gICAgaWYgKFxuICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hICYmXG4gICAgICAhdGhpcy5faGFzU2NoZW1hSW5wdXRDaGFuZ2VkKHtcbiAgICAgICAgcGFyc2VDbGFzc2VzLFxuICAgICAgICBwYXJzZUNsYXNzZXNTdHJpbmcsXG4gICAgICAgIHBhcnNlR3JhcGhRTENvbmZpZyxcbiAgICAgICAgZnVuY3Rpb25OYW1lc1N0cmluZyxcbiAgICAgIH0pXG4gICAgKSB7XG4gICAgICByZXR1cm4gdGhpcy5ncmFwaFFMU2NoZW1hO1xuICAgIH1cblxuICAgIHRoaXMucGFyc2VDbGFzc2VzID0gcGFyc2VDbGFzc2VzO1xuICAgIHRoaXMucGFyc2VDbGFzc2VzU3RyaW5nID0gcGFyc2VDbGFzc2VzU3RyaW5nO1xuICAgIHRoaXMucGFyc2VHcmFwaFFMQ29uZmlnID0gcGFyc2VHcmFwaFFMQ29uZmlnO1xuICAgIHRoaXMuZnVuY3Rpb25OYW1lcyA9IGZ1bmN0aW9uTmFtZXM7XG4gICAgdGhpcy5mdW5jdGlvbk5hbWVzU3RyaW5nID0gZnVuY3Rpb25OYW1lc1N0cmluZztcbiAgICB0aGlzLnBhcnNlQ2xhc3NUeXBlcyA9IHt9O1xuICAgIHRoaXMudmlld2VyVHlwZSA9IG51bGw7XG4gICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYSA9IG51bGw7XG4gICAgdGhpcy5ncmFwaFFMU2NoZW1hID0gbnVsbDtcbiAgICB0aGlzLmdyYXBoUUxUeXBlcyA9IFtdO1xuICAgIHRoaXMuZ3JhcGhRTFF1ZXJpZXMgPSB7fTtcbiAgICB0aGlzLmdyYXBoUUxNdXRhdGlvbnMgPSB7fTtcbiAgICB0aGlzLmdyYXBoUUxTdWJzY3JpcHRpb25zID0ge307XG4gICAgdGhpcy5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zID0gbnVsbDtcbiAgICB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzID0ge307XG4gICAgdGhpcy5yZWxheU5vZGVJbnRlcmZhY2UgPSBudWxsO1xuXG4gICAgZGVmYXVsdEdyYXBoUUxUeXBlcy5sb2FkKHRoaXMpO1xuICAgIGRlZmF1bHRSZWxheVNjaGVtYS5sb2FkKHRoaXMpO1xuICAgIHNjaGVtYVR5cGVzLmxvYWQodGhpcyk7XG5cbiAgICB0aGlzLl9nZXRQYXJzZUNsYXNzZXNXaXRoQ29uZmlnKHBhcnNlQ2xhc3NlcywgcGFyc2VHcmFwaFFMQ29uZmlnKS5mb3JFYWNoKFxuICAgICAgKFtwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnXSkgPT4ge1xuICAgICAgICAvLyBTb21lIHRpbWVzIHNjaGVtYSByZXR1cm4gdGhlIF9hdXRoX2RhdGFfIGZpZWxkXG4gICAgICAgIC8vIGl0IHdpbGwgbGVhZCB0byB1bnN0YWJsZSBncmFwaHFsIGdlbmVyYXRpb24gb3JkZXJcbiAgICAgICAgaWYgKHBhcnNlQ2xhc3MuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICAgICAgT2JqZWN0LmtleXMocGFyc2VDbGFzcy5maWVsZHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgIGlmIChmaWVsZE5hbWUuc3RhcnRzV2l0aCgnX2F1dGhfZGF0YV8nKSkge1xuICAgICAgICAgICAgICBkZWxldGUgcGFyc2VDbGFzcy5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEZpZWxkcyBvcmRlciBpbnNpZGUgdGhlIHNjaGVtYSBzZWVtcyB0byBub3QgYmUgY29uc2lzdGVudCBhY3Jvc3NcbiAgICAgICAgLy8gcmVzdGFydCBzbyB3ZSBuZWVkIHRvIGVuc3VyZSBhbiBhbHBoYWJldGljYWwgb3JkZXJcbiAgICAgICAgLy8gYWxzbyBpdCdzIGJldHRlciBmb3IgdGhlIHBsYXlncm91bmQgZG9jdW1lbnRhdGlvblxuICAgICAgICBjb25zdCBvcmRlcmVkRmllbGRzID0ge307XG4gICAgICAgIE9iamVjdC5rZXlzKHBhcnNlQ2xhc3MuZmllbGRzKVxuICAgICAgICAgIC5zb3J0KClcbiAgICAgICAgICAuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgb3JkZXJlZEZpZWxkc1tmaWVsZE5hbWVdID0gcGFyc2VDbGFzcy5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgcGFyc2VDbGFzcy5maWVsZHMgPSBvcmRlcmVkRmllbGRzO1xuICAgICAgICBwYXJzZUNsYXNzVHlwZXMubG9hZCh0aGlzLCBwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnKTtcbiAgICAgICAgcGFyc2VDbGFzc1F1ZXJpZXMubG9hZCh0aGlzLCBwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnKTtcbiAgICAgICAgcGFyc2VDbGFzc011dGF0aW9ucy5sb2FkKHRoaXMsIHBhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWcpO1xuICAgICAgfVxuICAgICk7XG5cbiAgICBkZWZhdWx0R3JhcGhRTFR5cGVzLmxvYWRBcnJheVJlc3VsdCh0aGlzLCBwYXJzZUNsYXNzZXMpO1xuICAgIGRlZmF1bHRHcmFwaFFMUXVlcmllcy5sb2FkKHRoaXMpO1xuICAgIGRlZmF1bHRHcmFwaFFMTXV0YXRpb25zLmxvYWQodGhpcyk7XG5cbiAgICBsZXQgZ3JhcGhRTFF1ZXJ5ID0gdW5kZWZpbmVkO1xuICAgIGlmIChPYmplY3Qua2V5cyh0aGlzLmdyYXBoUUxRdWVyaWVzKS5sZW5ndGggPiAwKSB7XG4gICAgICBncmFwaFFMUXVlcnkgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgICAgICBuYW1lOiAnUXVlcnknLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1F1ZXJ5IGlzIHRoZSB0b3AgbGV2ZWwgdHlwZSBmb3IgcXVlcmllcy4nLFxuICAgICAgICBmaWVsZHM6IHRoaXMuZ3JhcGhRTFF1ZXJpZXMsXG4gICAgICB9KTtcbiAgICAgIHRoaXMuYWRkR3JhcGhRTFR5cGUoZ3JhcGhRTFF1ZXJ5LCB0cnVlLCB0cnVlKTtcbiAgICB9XG5cbiAgICBsZXQgZ3JhcGhRTE11dGF0aW9uID0gdW5kZWZpbmVkO1xuICAgIGlmIChPYmplY3Qua2V5cyh0aGlzLmdyYXBoUUxNdXRhdGlvbnMpLmxlbmd0aCA+IDApIHtcbiAgICAgIGdyYXBoUUxNdXRhdGlvbiA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgICAgIG5hbWU6ICdNdXRhdGlvbicsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnTXV0YXRpb24gaXMgdGhlIHRvcCBsZXZlbCB0eXBlIGZvciBtdXRhdGlvbnMuJyxcbiAgICAgICAgZmllbGRzOiB0aGlzLmdyYXBoUUxNdXRhdGlvbnMsXG4gICAgICB9KTtcbiAgICAgIHRoaXMuYWRkR3JhcGhRTFR5cGUoZ3JhcGhRTE11dGF0aW9uLCB0cnVlLCB0cnVlKTtcbiAgICB9XG5cbiAgICBsZXQgZ3JhcGhRTFN1YnNjcmlwdGlvbiA9IHVuZGVmaW5lZDtcbiAgICBpZiAoT2JqZWN0LmtleXModGhpcy5ncmFwaFFMU3Vic2NyaXB0aW9ucykubGVuZ3RoID4gMCkge1xuICAgICAgZ3JhcGhRTFN1YnNjcmlwdGlvbiA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgICAgIG5hbWU6ICdTdWJzY3JpcHRpb24nLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1N1YnNjcmlwdGlvbiBpcyB0aGUgdG9wIGxldmVsIHR5cGUgZm9yIHN1YnNjcmlwdGlvbnMuJyxcbiAgICAgICAgZmllbGRzOiB0aGlzLmdyYXBoUUxTdWJzY3JpcHRpb25zLFxuICAgICAgfSk7XG4gICAgICB0aGlzLmFkZEdyYXBoUUxUeXBlKGdyYXBoUUxTdWJzY3JpcHRpb24sIHRydWUsIHRydWUpO1xuICAgIH1cblxuICAgIHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEgPSBuZXcgR3JhcGhRTFNjaGVtYSh7XG4gICAgICB0eXBlczogdGhpcy5ncmFwaFFMVHlwZXMsXG4gICAgICBxdWVyeTogZ3JhcGhRTFF1ZXJ5LFxuICAgICAgbXV0YXRpb246IGdyYXBoUUxNdXRhdGlvbixcbiAgICAgIHN1YnNjcmlwdGlvbjogZ3JhcGhRTFN1YnNjcmlwdGlvbixcbiAgICB9KTtcblxuICAgIGlmICh0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcykge1xuICAgICAgc2NoZW1hRGlyZWN0aXZlcy5sb2FkKHRoaXMpO1xuXG4gICAgICBpZiAodHlwZW9mIHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLmdldFR5cGVNYXAgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgLy8gSW4gZm9sbG93aW5nIGNvZGUgd2UgdXNlIHVuZGVyc2NvcmUgYXR0ciB0byBhdm9pZCBqcyB2YXIgdW4gcmVmXG4gICAgICAgIGNvbnN0IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlTWFwID0gdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMuX3R5cGVNYXA7XG4gICAgICAgIGNvbnN0IGZpbmRBbmRSZXBsYWNlTGFzdFR5cGUgPSAocGFyZW50LCBrZXkpID0+IHtcbiAgICAgICAgICBpZiAocGFyZW50W2tleV0ubmFtZSkge1xuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLl90eXBlTWFwW3BhcmVudFtrZXldLm5hbWVdICYmXG4gICAgICAgICAgICAgIHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuX3R5cGVNYXBbcGFyZW50W2tleV0ubmFtZV0gIT09IHBhcmVudFtrZXldXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgLy8gVG8gYXZvaWQgdW5yZXNvbHZlZCBmaWVsZCBvbiBvdmVybG9hZGVkIHNjaGVtYVxuICAgICAgICAgICAgICAvLyByZXBsYWNlIHRoZSBmaW5hbCB0eXBlIHdpdGggdGhlIGF1dG8gc2NoZW1hIG9uZVxuICAgICAgICAgICAgICBwYXJlbnRba2V5XSA9IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuX3R5cGVNYXBbcGFyZW50W2tleV0ubmFtZV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChwYXJlbnRba2V5XS5vZlR5cGUpIHtcbiAgICAgICAgICAgICAgZmluZEFuZFJlcGxhY2VMYXN0VHlwZShwYXJlbnRba2V5XSwgJ29mVHlwZScpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgLy8gQWRkIG5vbiBzaGFyZWQgdHlwZXMgZnJvbSBjdXN0b20gc2NoZW1hIHRvIGF1dG8gc2NoZW1hXG4gICAgICAgIC8vIG5vdGU6IHNvbWUgbm9uIHNoYXJlZCB0eXBlcyBjYW4gdXNlIHNvbWUgc2hhcmVkIHR5cGVzXG4gICAgICAgIC8vIHNvIHRoaXMgY29kZSBuZWVkIHRvIGJlIHJhbiBiZWZvcmUgdGhlIHNoYXJlZCB0eXBlcyBhZGRpdGlvblxuICAgICAgICAvLyB3ZSB1c2Ugc29ydCB0byBlbnN1cmUgc2NoZW1hIGNvbnNpc3RlbmN5IG92ZXIgcmVzdGFydHNcbiAgICAgICAgT2JqZWN0LmtleXMoY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXApXG4gICAgICAgICAgLnNvcnQoKVxuICAgICAgICAgIC5mb3JFYWNoKGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlS2V5ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlID0gY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXBbY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVLZXldO1xuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAhY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUgfHxcbiAgICAgICAgICAgICAgIWN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWUgfHxcbiAgICAgICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZS5zdGFydHNXaXRoKCdfXycpXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYXV0b0dyYXBoUUxTY2hlbWFUeXBlID0gdGhpcy5ncmFwaFFMQXV0b1NjaGVtYS5fdHlwZU1hcFtcbiAgICAgICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZVxuICAgICAgICAgICAgXTtcbiAgICAgICAgICAgIGlmICghYXV0b0dyYXBoUUxTY2hlbWFUeXBlKSB7XG4gICAgICAgICAgICAgIHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuX3R5cGVNYXBbXG4gICAgICAgICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZVxuICAgICAgICAgICAgICBdID0gY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIC8vIEhhbmRsZSBzaGFyZWQgdHlwZXNcbiAgICAgICAgLy8gV2UgcGFzcyB0aHJvdWdoIGVhY2ggdHlwZSBhbmQgZW5zdXJlIHRoYXQgYWxsIHN1YiBmaWVsZCB0eXBlcyBhcmUgcmVwbGFjZWRcbiAgICAgICAgLy8gd2UgdXNlIHNvcnQgdG8gZW5zdXJlIHNjaGVtYSBjb25zaXN0ZW5jeSBvdmVyIHJlc3RhcnRzXG4gICAgICAgIE9iamVjdC5rZXlzKGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlTWFwKVxuICAgICAgICAgIC5zb3J0KClcbiAgICAgICAgICAuZm9yRWFjaChjdXN0b21HcmFwaFFMU2NoZW1hVHlwZUtleSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZSA9IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlTWFwW2N1c3RvbUdyYXBoUUxTY2hlbWFUeXBlS2V5XTtcbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgIWN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlIHx8XG4gICAgICAgICAgICAgICFjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lIHx8XG4gICAgICAgICAgICAgIGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWUuc3RhcnRzV2l0aCgnX18nKVxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGF1dG9HcmFwaFFMU2NoZW1hVHlwZSA9IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuX3R5cGVNYXBbXG4gICAgICAgICAgICAgIGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWVcbiAgICAgICAgICAgIF07XG5cbiAgICAgICAgICAgIGlmIChhdXRvR3JhcGhRTFNjaGVtYVR5cGUgJiYgdHlwZW9mIGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLmdldEZpZWxkcyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICBPYmplY3Qua2V5cyhjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5fZmllbGRzKVxuICAgICAgICAgICAgICAgIC5zb3J0KClcbiAgICAgICAgICAgICAgICAuZm9yRWFjaChmaWVsZEtleSA9PiB7XG4gICAgICAgICAgICAgICAgICBjb25zdCBmaWVsZCA9IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLl9maWVsZHNbZmllbGRLZXldO1xuICAgICAgICAgICAgICAgICAgZmluZEFuZFJlcGxhY2VMYXN0VHlwZShmaWVsZCwgJ3R5cGUnKTtcbiAgICAgICAgICAgICAgICAgIGF1dG9HcmFwaFFMU2NoZW1hVHlwZS5fZmllbGRzW2ZpZWxkLm5hbWVdID0gZmllbGQ7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSA9IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWE7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSBhd2FpdCB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcyh7XG4gICAgICAgICAgZGlyZWN0aXZlc0RlZmluaXRpb25zU2NoZW1hOiB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzRGVmaW5pdGlvbnMsXG4gICAgICAgICAgYXV0b1NjaGVtYTogdGhpcy5ncmFwaFFMQXV0b1NjaGVtYSxcbiAgICAgICAgICBzdGl0Y2hTY2hlbWFzLFxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSA9IHN0aXRjaFNjaGVtYXMoe1xuICAgICAgICAgIHNjaGVtYXM6IFtcbiAgICAgICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXNEZWZpbml0aW9ucyxcbiAgICAgICAgICAgIHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEsXG4gICAgICAgICAgICB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcyxcbiAgICAgICAgICBdLFxuICAgICAgICAgIG1lcmdlRGlyZWN0aXZlczogdHJ1ZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIC8vIE9ubHkgbWVyZ2UgZGlyZWN0aXZlIHdoZW4gc3RyaW5nIHNjaGVtYSBwcm92aWRlZFxuICAgICAgY29uc3QgZ3JhcGhRTFNjaGVtYVR5cGVNYXAgPSB0aGlzLmdyYXBoUUxTY2hlbWEuZ2V0VHlwZU1hcCgpO1xuICAgICAgT2JqZWN0LmtleXMoZ3JhcGhRTFNjaGVtYVR5cGVNYXApLmZvckVhY2goZ3JhcGhRTFNjaGVtYVR5cGVOYW1lID0+IHtcbiAgICAgICAgY29uc3QgZ3JhcGhRTFNjaGVtYVR5cGUgPSBncmFwaFFMU2NoZW1hVHlwZU1hcFtncmFwaFFMU2NoZW1hVHlwZU5hbWVdO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdHlwZW9mIGdyYXBoUUxTY2hlbWFUeXBlLmdldEZpZWxkcyA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgICAgIHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLmRlZmluaXRpb25zXG4gICAgICAgICkge1xuICAgICAgICAgIGNvbnN0IGdyYXBoUUxDdXN0b21UeXBlRGVmID0gdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMuZGVmaW5pdGlvbnMuZmluZChcbiAgICAgICAgICAgIGRlZmluaXRpb24gPT4gZGVmaW5pdGlvbi5uYW1lLnZhbHVlID09PSBncmFwaFFMU2NoZW1hVHlwZU5hbWVcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmIChncmFwaFFMQ3VzdG9tVHlwZURlZikge1xuICAgICAgICAgICAgY29uc3QgZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE1hcCA9IGdyYXBoUUxTY2hlbWFUeXBlLmdldEZpZWxkcygpO1xuICAgICAgICAgICAgT2JqZWN0LmtleXMoZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE1hcCkuZm9yRWFjaChncmFwaFFMU2NoZW1hVHlwZUZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICAgIGNvbnN0IGdyYXBoUUxTY2hlbWFUeXBlRmllbGQgPSBncmFwaFFMU2NoZW1hVHlwZUZpZWxkTWFwW2dyYXBoUUxTY2hlbWFUeXBlRmllbGROYW1lXTtcbiAgICAgICAgICAgICAgaWYgKCFncmFwaFFMU2NoZW1hVHlwZUZpZWxkLmFzdE5vZGUpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBhc3ROb2RlID0gZ3JhcGhRTEN1c3RvbVR5cGVEZWYuZmllbGRzLmZpbmQoXG4gICAgICAgICAgICAgICAgICBmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSBncmFwaFFMU2NoZW1hVHlwZUZpZWxkTmFtZVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgaWYgKGFzdE5vZGUpIHtcbiAgICAgICAgICAgICAgICAgIGdyYXBoUUxTY2hlbWFUeXBlRmllbGQuYXN0Tm9kZSA9IGFzdE5vZGU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBTY2hlbWFEaXJlY3RpdmVWaXNpdG9yLnZpc2l0U2NoZW1hRGlyZWN0aXZlcyhcbiAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hLFxuICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmdyYXBoUUxTY2hlbWE7XG4gIH1cblxuICBhZGRHcmFwaFFMVHlwZSh0eXBlLCB0aHJvd0Vycm9yID0gZmFsc2UsIGlnbm9yZVJlc2VydmVkID0gZmFsc2UsIGlnbm9yZUNvbm5lY3Rpb24gPSBmYWxzZSkge1xuICAgIGlmIChcbiAgICAgICghaWdub3JlUmVzZXJ2ZWQgJiYgUkVTRVJWRURfR1JBUEhRTF9UWVBFX05BTUVTLmluY2x1ZGVzKHR5cGUubmFtZSkpIHx8XG4gICAgICB0aGlzLmdyYXBoUUxUeXBlcy5maW5kKGV4aXN0aW5nVHlwZSA9PiBleGlzdGluZ1R5cGUubmFtZSA9PT0gdHlwZS5uYW1lKSB8fFxuICAgICAgKCFpZ25vcmVDb25uZWN0aW9uICYmIHR5cGUubmFtZS5lbmRzV2l0aCgnQ29ubmVjdGlvbicpKVxuICAgICkge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGBUeXBlICR7dHlwZS5uYW1lfSBjb3VsZCBub3QgYmUgYWRkZWQgdG8gdGhlIGF1dG8gc2NoZW1hIGJlY2F1c2UgaXQgY29sbGlkZWQgd2l0aCBhbiBleGlzdGluZyB0eXBlLmA7XG4gICAgICBpZiAodGhyb3dFcnJvcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSk7XG4gICAgICB9XG4gICAgICB0aGlzLmxvZy53YXJuKG1lc3NhZ2UpO1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgdGhpcy5ncmFwaFFMVHlwZXMucHVzaCh0eXBlKTtcbiAgICByZXR1cm4gdHlwZTtcbiAgfVxuXG4gIGFkZEdyYXBoUUxRdWVyeShmaWVsZE5hbWUsIGZpZWxkLCB0aHJvd0Vycm9yID0gZmFsc2UsIGlnbm9yZVJlc2VydmVkID0gZmFsc2UpIHtcbiAgICBpZiAoXG4gICAgICAoIWlnbm9yZVJlc2VydmVkICYmIFJFU0VSVkVEX0dSQVBIUUxfUVVFUllfTkFNRVMuaW5jbHVkZXMoZmllbGROYW1lKSkgfHxcbiAgICAgIHRoaXMuZ3JhcGhRTFF1ZXJpZXNbZmllbGROYW1lXVxuICAgICkge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGBRdWVyeSAke2ZpZWxkTmFtZX0gY291bGQgbm90IGJlIGFkZGVkIHRvIHRoZSBhdXRvIHNjaGVtYSBiZWNhdXNlIGl0IGNvbGxpZGVkIHdpdGggYW4gZXhpc3RpbmcgZmllbGQuYDtcbiAgICAgIGlmICh0aHJvd0Vycm9yKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihtZXNzYWdlKTtcbiAgICAgIH1cbiAgICAgIHRoaXMubG9nLndhcm4obWVzc2FnZSk7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICB0aGlzLmdyYXBoUUxRdWVyaWVzW2ZpZWxkTmFtZV0gPSBmaWVsZDtcbiAgICByZXR1cm4gZmllbGQ7XG4gIH1cblxuICBhZGRHcmFwaFFMTXV0YXRpb24oZmllbGROYW1lLCBmaWVsZCwgdGhyb3dFcnJvciA9IGZhbHNlLCBpZ25vcmVSZXNlcnZlZCA9IGZhbHNlKSB7XG4gICAgaWYgKFxuICAgICAgKCFpZ25vcmVSZXNlcnZlZCAmJiBSRVNFUlZFRF9HUkFQSFFMX01VVEFUSU9OX05BTUVTLmluY2x1ZGVzKGZpZWxkTmFtZSkpIHx8XG4gICAgICB0aGlzLmdyYXBoUUxNdXRhdGlvbnNbZmllbGROYW1lXVxuICAgICkge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGBNdXRhdGlvbiAke2ZpZWxkTmFtZX0gY291bGQgbm90IGJlIGFkZGVkIHRvIHRoZSBhdXRvIHNjaGVtYSBiZWNhdXNlIGl0IGNvbGxpZGVkIHdpdGggYW4gZXhpc3RpbmcgZmllbGQuYDtcbiAgICAgIGlmICh0aHJvd0Vycm9yKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihtZXNzYWdlKTtcbiAgICAgIH1cbiAgICAgIHRoaXMubG9nLndhcm4obWVzc2FnZSk7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICB0aGlzLmdyYXBoUUxNdXRhdGlvbnNbZmllbGROYW1lXSA9IGZpZWxkO1xuICAgIHJldHVybiBmaWVsZDtcbiAgfVxuXG4gIGhhbmRsZUVycm9yKGVycm9yKSB7XG4gICAgaWYgKGVycm9yIGluc3RhbmNlb2YgUGFyc2UuRXJyb3IpIHtcbiAgICAgIHRoaXMubG9nLmVycm9yKCdQYXJzZSBlcnJvcjogJywgZXJyb3IpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmxvZy5lcnJvcignVW5jYXVnaHQgaW50ZXJuYWwgc2VydmVyIGVycm9yLicsIGVycm9yLCBlcnJvci5zdGFjayk7XG4gICAgfVxuICAgIHRocm93IHRvR3JhcGhRTEVycm9yKGVycm9yKTtcbiAgfVxuXG4gIGFzeW5jIF9pbml0aWFsaXplU2NoZW1hQW5kQ29uZmlnKCkge1xuICAgIGNvbnN0IFtzY2hlbWFDb250cm9sbGVyLCBwYXJzZUdyYXBoUUxDb25maWddID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgdGhpcy5kYXRhYmFzZUNvbnRyb2xsZXIubG9hZFNjaGVtYSgpLFxuICAgICAgdGhpcy5wYXJzZUdyYXBoUUxDb250cm9sbGVyLmdldEdyYXBoUUxDb25maWcoKSxcbiAgICBdKTtcblxuICAgIHRoaXMuc2NoZW1hQ29udHJvbGxlciA9IHNjaGVtYUNvbnRyb2xsZXI7XG5cbiAgICByZXR1cm4ge1xuICAgICAgcGFyc2VHcmFwaFFMQ29uZmlnLFxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogR2V0cyBhbGwgY2xhc3NlcyBmb3VuZCBieSB0aGUgYHNjaGVtYUNvbnRyb2xsZXJgXG4gICAqIG1pbnVzIHRob3NlIGZpbHRlcmVkIG91dCBieSB0aGUgYXBwJ3MgcGFyc2VHcmFwaFFMQ29uZmlnLlxuICAgKi9cbiAgYXN5bmMgX2dldENsYXNzZXNGb3JTY2hlbWEocGFyc2VHcmFwaFFMQ29uZmlnOiBQYXJzZUdyYXBoUUxDb25maWcpIHtcbiAgICBjb25zdCB7IGVuYWJsZWRGb3JDbGFzc2VzLCBkaXNhYmxlZEZvckNsYXNzZXMgfSA9IHBhcnNlR3JhcGhRTENvbmZpZztcbiAgICBjb25zdCBhbGxDbGFzc2VzID0gYXdhaXQgdGhpcy5zY2hlbWFDb250cm9sbGVyLmdldEFsbENsYXNzZXMoKTtcblxuICAgIGlmIChBcnJheS5pc0FycmF5KGVuYWJsZWRGb3JDbGFzc2VzKSB8fCBBcnJheS5pc0FycmF5KGRpc2FibGVkRm9yQ2xhc3NlcykpIHtcbiAgICAgIGxldCBpbmNsdWRlZENsYXNzZXMgPSBhbGxDbGFzc2VzO1xuICAgICAgaWYgKGVuYWJsZWRGb3JDbGFzc2VzKSB7XG4gICAgICAgIGluY2x1ZGVkQ2xhc3NlcyA9IGFsbENsYXNzZXMuZmlsdGVyKGNsYXp6ID0+IHtcbiAgICAgICAgICByZXR1cm4gZW5hYmxlZEZvckNsYXNzZXMuaW5jbHVkZXMoY2xhenouY2xhc3NOYW1lKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICBpZiAoZGlzYWJsZWRGb3JDbGFzc2VzKSB7XG4gICAgICAgIC8vIENsYXNzZXMgaW5jbHVkZWQgaW4gYGVuYWJsZWRGb3JDbGFzc2VzYCB0aGF0XG4gICAgICAgIC8vIGFyZSBhbHNvIHByZXNlbnQgaW4gYGRpc2FibGVkRm9yQ2xhc3Nlc2Agd2lsbFxuICAgICAgICAvLyBzdGlsbCBiZSBmaWx0ZXJlZCBvdXRcbiAgICAgICAgaW5jbHVkZWRDbGFzc2VzID0gaW5jbHVkZWRDbGFzc2VzLmZpbHRlcihjbGF6eiA9PiB7XG4gICAgICAgICAgcmV0dXJuICFkaXNhYmxlZEZvckNsYXNzZXMuaW5jbHVkZXMoY2xhenouY2xhc3NOYW1lKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuaXNVc2Vyc0NsYXNzRGlzYWJsZWQgPSAhaW5jbHVkZWRDbGFzc2VzLnNvbWUoY2xhenogPT4ge1xuICAgICAgICByZXR1cm4gY2xhenouY2xhc3NOYW1lID09PSAnX1VzZXInO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBpbmNsdWRlZENsYXNzZXM7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBhbGxDbGFzc2VzO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBUaGlzIG1ldGhvZCByZXR1cm5zIGEgbGlzdCBvZiB0dXBsZXNcbiAgICogdGhhdCBwcm92aWRlIHRoZSBwYXJzZUNsYXNzIGFsb25nIHdpdGhcbiAgICogaXRzIHBhcnNlQ2xhc3NDb25maWcgd2hlcmUgcHJvdmlkZWQuXG4gICAqL1xuICBfZ2V0UGFyc2VDbGFzc2VzV2l0aENvbmZpZyhwYXJzZUNsYXNzZXMsIHBhcnNlR3JhcGhRTENvbmZpZzogUGFyc2VHcmFwaFFMQ29uZmlnKSB7XG4gICAgY29uc3QgeyBjbGFzc0NvbmZpZ3MgfSA9IHBhcnNlR3JhcGhRTENvbmZpZztcblxuICAgIC8vIE1ha2Ugc3VyZXMgdGhhdCB0aGUgZGVmYXVsdCBjbGFzc2VzIGFuZCBjbGFzc2VzIHRoYXRcbiAgICAvLyBzdGFydHMgd2l0aCBjYXBpdGFsaXplZCBsZXR0ZXIgd2lsbCBiZSBnZW5lcmF0ZWQgZmlyc3QuXG4gICAgY29uc3Qgc29ydENsYXNzZXMgPSAoYSwgYikgPT4ge1xuICAgICAgYSA9IGEuY2xhc3NOYW1lO1xuICAgICAgYiA9IGIuY2xhc3NOYW1lO1xuICAgICAgaWYgKGFbMF0gPT09ICdfJykge1xuICAgICAgICBpZiAoYlswXSAhPT0gJ18nKSB7XG4gICAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoYlswXSA9PT0gJ18nKSB7XG4gICAgICAgIGlmIChhWzBdICE9PSAnXycpIHtcbiAgICAgICAgICByZXR1cm4gMTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGEgPT09IGIpIHtcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9IGVsc2UgaWYgKGEgPCBiKSB7XG4gICAgICAgIHJldHVybiAtMTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiAxO1xuICAgICAgfVxuICAgIH07XG5cbiAgICByZXR1cm4gcGFyc2VDbGFzc2VzLnNvcnQoc29ydENsYXNzZXMpLm1hcChwYXJzZUNsYXNzID0+IHtcbiAgICAgIGxldCBwYXJzZUNsYXNzQ29uZmlnO1xuICAgICAgaWYgKGNsYXNzQ29uZmlncykge1xuICAgICAgICBwYXJzZUNsYXNzQ29uZmlnID0gY2xhc3NDb25maWdzLmZpbmQoYyA9PiBjLmNsYXNzTmFtZSA9PT0gcGFyc2VDbGFzcy5jbGFzc05hbWUpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIFtwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnXTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIF9nZXRGdW5jdGlvbk5hbWVzKCkge1xuICAgIHJldHVybiBhd2FpdCBnZXRGdW5jdGlvbk5hbWVzKHRoaXMuYXBwSWQpLmZpbHRlcihmdW5jdGlvbk5hbWUgPT4ge1xuICAgICAgaWYgKC9eW19hLXpBLVpdW19hLXpBLVowLTldKiQvLnRlc3QoZnVuY3Rpb25OYW1lKSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMubG9nLndhcm4oXG4gICAgICAgICAgYEZ1bmN0aW9uICR7ZnVuY3Rpb25OYW1lfSBjb3VsZCBub3QgYmUgYWRkZWQgdG8gdGhlIGF1dG8gc2NoZW1hIGJlY2F1c2UgR3JhcGhRTCBuYW1lcyBtdXN0IG1hdGNoIC9eW19hLXpBLVpdW19hLXpBLVowLTldKiQvLmBcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIENoZWNrcyBmb3IgY2hhbmdlcyB0byB0aGUgcGFyc2VDbGFzc2VzXG4gICAqIG9iamVjdHMgKGkuZS4gZGF0YWJhc2Ugc2NoZW1hKSBvciB0b1xuICAgKiB0aGUgcGFyc2VHcmFwaFFMQ29uZmlnIG9iamVjdC4gSWYgbm9cbiAgICogY2hhbmdlcyBhcmUgZm91bmQsIHJldHVybiB0cnVlO1xuICAgKi9cbiAgX2hhc1NjaGVtYUlucHV0Q2hhbmdlZChwYXJhbXM6IHtcbiAgICBwYXJzZUNsYXNzZXM6IGFueSxcbiAgICBwYXJzZUNsYXNzZXNTdHJpbmc6IHN0cmluZyxcbiAgICBwYXJzZUdyYXBoUUxDb25maWc6ID9QYXJzZUdyYXBoUUxDb25maWcsXG4gICAgZnVuY3Rpb25OYW1lc1N0cmluZzogc3RyaW5nLFxuICB9KTogYm9vbGVhbiB7XG4gICAgY29uc3QgeyBwYXJzZUNsYXNzZXMsIHBhcnNlQ2xhc3Nlc1N0cmluZywgcGFyc2VHcmFwaFFMQ29uZmlnLCBmdW5jdGlvbk5hbWVzU3RyaW5nIH0gPSBwYXJhbXM7XG5cbiAgICBpZiAoXG4gICAgICBKU09OLnN0cmluZ2lmeSh0aGlzLnBhcnNlR3JhcGhRTENvbmZpZykgPT09IEpTT04uc3RyaW5naWZ5KHBhcnNlR3JhcGhRTENvbmZpZykgJiZcbiAgICAgIHRoaXMuZnVuY3Rpb25OYW1lc1N0cmluZyA9PT0gZnVuY3Rpb25OYW1lc1N0cmluZ1xuICAgICkge1xuICAgICAgaWYgKHRoaXMucGFyc2VDbGFzc2VzID09PSBwYXJzZUNsYXNzZXMpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5wYXJzZUNsYXNzZXNTdHJpbmcgPT09IHBhcnNlQ2xhc3Nlc1N0cmluZykge1xuICAgICAgICB0aGlzLnBhcnNlQ2xhc3NlcyA9IHBhcnNlQ2xhc3NlcztcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuICB9XG59XG5cbmV4cG9ydCB7IFBhcnNlR3JhcGhRTFNjaGVtYSB9O1xuIl19