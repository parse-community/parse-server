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
      }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9HcmFwaFFML1BhcnNlR3JhcGhRTFNjaGVtYS5qcyJdLCJuYW1lcyI6WyJSRVNFUlZFRF9HUkFQSFFMX1RZUEVfTkFNRVMiLCJSRVNFUlZFRF9HUkFQSFFMX1FVRVJZX05BTUVTIiwiUkVTRVJWRURfR1JBUEhRTF9NVVRBVElPTl9OQU1FUyIsIlBhcnNlR3JhcGhRTFNjaGVtYSIsImNvbnN0cnVjdG9yIiwicGFyYW1zIiwicGFyc2VHcmFwaFFMQ29udHJvbGxlciIsImRhdGFiYXNlQ29udHJvbGxlciIsImxvZyIsImdyYXBoUUxDdXN0b21UeXBlRGVmcyIsImFwcElkIiwic2NoZW1hQ2FjaGUiLCJTY2hlbWFDYWNoZSIsImxvYWQiLCJwYXJzZUdyYXBoUUxDb25maWciLCJfaW5pdGlhbGl6ZVNjaGVtYUFuZENvbmZpZyIsInBhcnNlQ2xhc3NlcyIsIl9nZXRDbGFzc2VzRm9yU2NoZW1hIiwicGFyc2VDbGFzc2VzU3RyaW5nIiwiSlNPTiIsInN0cmluZ2lmeSIsImZ1bmN0aW9uTmFtZXMiLCJfZ2V0RnVuY3Rpb25OYW1lcyIsImZ1bmN0aW9uTmFtZXNTdHJpbmciLCJncmFwaFFMU2NoZW1hIiwiX2hhc1NjaGVtYUlucHV0Q2hhbmdlZCIsInBhcnNlQ2xhc3NUeXBlcyIsInZpZXdlclR5cGUiLCJncmFwaFFMQXV0b1NjaGVtYSIsImdyYXBoUUxUeXBlcyIsImdyYXBoUUxRdWVyaWVzIiwiZ3JhcGhRTE11dGF0aW9ucyIsImdyYXBoUUxTdWJzY3JpcHRpb25zIiwiZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXNEZWZpbml0aW9ucyIsImdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzIiwicmVsYXlOb2RlSW50ZXJmYWNlIiwiZGVmYXVsdEdyYXBoUUxUeXBlcyIsImRlZmF1bHRSZWxheVNjaGVtYSIsInNjaGVtYVR5cGVzIiwiX2dldFBhcnNlQ2xhc3Nlc1dpdGhDb25maWciLCJmb3JFYWNoIiwicGFyc2VDbGFzcyIsInBhcnNlQ2xhc3NDb25maWciLCJjbGFzc05hbWUiLCJPYmplY3QiLCJrZXlzIiwiZmllbGRzIiwiZmllbGROYW1lIiwic3RhcnRzV2l0aCIsInBhcnNlQ2xhc3NRdWVyaWVzIiwicGFyc2VDbGFzc011dGF0aW9ucyIsImxvYWRBcnJheVJlc3VsdCIsImRlZmF1bHRHcmFwaFFMUXVlcmllcyIsImRlZmF1bHRHcmFwaFFMTXV0YXRpb25zIiwiZ3JhcGhRTFF1ZXJ5IiwidW5kZWZpbmVkIiwibGVuZ3RoIiwiR3JhcGhRTE9iamVjdFR5cGUiLCJuYW1lIiwiZGVzY3JpcHRpb24iLCJhZGRHcmFwaFFMVHlwZSIsImdyYXBoUUxNdXRhdGlvbiIsImdyYXBoUUxTdWJzY3JpcHRpb24iLCJHcmFwaFFMU2NoZW1hIiwidHlwZXMiLCJxdWVyeSIsIm11dGF0aW9uIiwic3Vic2NyaXB0aW9uIiwic2NoZW1hRGlyZWN0aXZlcyIsImdldFR5cGVNYXAiLCJjdXN0b21HcmFwaFFMU2NoZW1hVHlwZU1hcCIsIl90eXBlTWFwIiwiZmluZEFuZFJlcGxhY2VMYXN0VHlwZSIsInBhcmVudCIsImtleSIsIm9mVHlwZSIsInNvcnQiLCJjdXN0b21HcmFwaFFMU2NoZW1hVHlwZUtleSIsImN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlIiwiYXV0b0dyYXBoUUxTY2hlbWFUeXBlIiwiZ2V0RmllbGRzIiwiX2ZpZWxkcyIsImZpZWxkS2V5IiwiZmllbGQiLCJkaXJlY3RpdmVzRGVmaW5pdGlvbnNTY2hlbWEiLCJhdXRvU2NoZW1hIiwic3RpdGNoU2NoZW1hcyIsInNjaGVtYXMiLCJtZXJnZURpcmVjdGl2ZXMiLCJncmFwaFFMU2NoZW1hVHlwZU1hcCIsImdyYXBoUUxTY2hlbWFUeXBlTmFtZSIsImdyYXBoUUxTY2hlbWFUeXBlIiwiZGVmaW5pdGlvbnMiLCJncmFwaFFMQ3VzdG9tVHlwZURlZiIsImZpbmQiLCJkZWZpbml0aW9uIiwidmFsdWUiLCJncmFwaFFMU2NoZW1hVHlwZUZpZWxkTWFwIiwiZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE5hbWUiLCJncmFwaFFMU2NoZW1hVHlwZUZpZWxkIiwiYXN0Tm9kZSIsIlNjaGVtYURpcmVjdGl2ZVZpc2l0b3IiLCJ2aXNpdFNjaGVtYURpcmVjdGl2ZXMiLCJ0eXBlIiwidGhyb3dFcnJvciIsImlnbm9yZVJlc2VydmVkIiwiaWdub3JlQ29ubmVjdGlvbiIsImluY2x1ZGVzIiwiZXhpc3RpbmdUeXBlIiwiZW5kc1dpdGgiLCJtZXNzYWdlIiwiRXJyb3IiLCJ3YXJuIiwicHVzaCIsImFkZEdyYXBoUUxRdWVyeSIsImFkZEdyYXBoUUxNdXRhdGlvbiIsImhhbmRsZUVycm9yIiwiZXJyb3IiLCJQYXJzZSIsInN0YWNrIiwic2NoZW1hQ29udHJvbGxlciIsIlByb21pc2UiLCJhbGwiLCJsb2FkU2NoZW1hIiwiZ2V0R3JhcGhRTENvbmZpZyIsImVuYWJsZWRGb3JDbGFzc2VzIiwiZGlzYWJsZWRGb3JDbGFzc2VzIiwiYWxsQ2xhc3NlcyIsImdldEFsbENsYXNzZXMiLCJBcnJheSIsImlzQXJyYXkiLCJpbmNsdWRlZENsYXNzZXMiLCJmaWx0ZXIiLCJjbGF6eiIsImlzVXNlcnNDbGFzc0Rpc2FibGVkIiwic29tZSIsImNsYXNzQ29uZmlncyIsInNvcnRDbGFzc2VzIiwiYSIsImIiLCJtYXAiLCJjIiwiZnVuY3Rpb25OYW1lIiwidGVzdCJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQUVBLE1BQU1BLDJCQUEyQixHQUFHLENBQ2xDLFFBRGtDLEVBRWxDLFNBRmtDLEVBR2xDLEtBSGtDLEVBSWxDLE9BSmtDLEVBS2xDLElBTGtDLEVBTWxDLGFBTmtDLEVBT2xDLE9BUGtDLEVBUWxDLFVBUmtDLEVBU2xDLGNBVGtDLEVBVWxDLGlCQVZrQyxFQVdsQyxtQkFYa0MsRUFZbEMsUUFaa0MsRUFhbEMsYUFia0MsRUFjbEMsZUFka0MsRUFlbEMs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O0FBQ0EsZUFBTyxLQUFQO0FBQ0Q7QUFDRjs7QUFFRCxXQUFPLElBQVA7QUFDRDs7QUEvYnNCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IHsgR3JhcGhRTFNjaGVtYSwgR3JhcGhRTE9iamVjdFR5cGUsIERvY3VtZW50Tm9kZSwgR3JhcGhRTE5hbWVkVHlwZSB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgc3RpdGNoU2NoZW1hcyB9IGZyb20gJ0BncmFwaHFsLXRvb2xzL3N0aXRjaCc7XG5pbXBvcnQgeyBTY2hlbWFEaXJlY3RpdmVWaXNpdG9yIH0gZnJvbSAnQGdyYXBocWwtdG9vbHMvdXRpbHMnO1xuaW1wb3J0IHJlcXVpcmVkUGFyYW1ldGVyIGZyb20gJy4uL3JlcXVpcmVkUGFyYW1ldGVyJztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMVHlwZXMgZnJvbSAnLi9sb2FkZXJzL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0ICogYXMgcGFyc2VDbGFzc1R5cGVzIGZyb20gJy4vbG9hZGVycy9wYXJzZUNsYXNzVHlwZXMnO1xuaW1wb3J0ICogYXMgcGFyc2VDbGFzc1F1ZXJpZXMgZnJvbSAnLi9sb2FkZXJzL3BhcnNlQ2xhc3NRdWVyaWVzJztcbmltcG9ydCAqIGFzIHBhcnNlQ2xhc3NNdXRhdGlvbnMgZnJvbSAnLi9sb2FkZXJzL3BhcnNlQ2xhc3NNdXRhdGlvbnMnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxRdWVyaWVzIGZyb20gJy4vbG9hZGVycy9kZWZhdWx0R3JhcGhRTFF1ZXJpZXMnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxNdXRhdGlvbnMgZnJvbSAnLi9sb2FkZXJzL2RlZmF1bHRHcmFwaFFMTXV0YXRpb25zJztcbmltcG9ydCBQYXJzZUdyYXBoUUxDb250cm9sbGVyLCB7IFBhcnNlR3JhcGhRTENvbmZpZyB9IGZyb20gJy4uL0NvbnRyb2xsZXJzL1BhcnNlR3JhcGhRTENvbnRyb2xsZXInO1xuaW1wb3J0IERhdGFiYXNlQ29udHJvbGxlciBmcm9tICcuLi9Db250cm9sbGVycy9EYXRhYmFzZUNvbnRyb2xsZXInO1xuaW1wb3J0IFNjaGVtYUNhY2hlIGZyb20gJy4uL0FkYXB0ZXJzL0NhY2hlL1NjaGVtYUNhY2hlJztcbmltcG9ydCB7IHRvR3JhcGhRTEVycm9yIH0gZnJvbSAnLi9wYXJzZUdyYXBoUUxVdGlscyc7XG5pbXBvcnQgKiBhcyBzY2hlbWFEaXJlY3RpdmVzIGZyb20gJy4vbG9hZGVycy9zY2hlbWFEaXJlY3RpdmVzJztcbmltcG9ydCAqIGFzIHNjaGVtYVR5cGVzIGZyb20gJy4vbG9hZGVycy9zY2hlbWFUeXBlcyc7XG5pbXBvcnQgeyBnZXRGdW5jdGlvbk5hbWVzIH0gZnJvbSAnLi4vdHJpZ2dlcnMnO1xuaW1wb3J0ICogYXMgZGVmYXVsdFJlbGF5U2NoZW1hIGZyb20gJy4vbG9hZGVycy9kZWZhdWx0UmVsYXlTY2hlbWEnO1xuXG5jb25zdCBSRVNFUlZFRF9HUkFQSFFMX1RZUEVfTkFNRVMgPSBbXG4gICdTdHJpbmcnLFxuICAnQm9vbGVhbicsXG4gICdJbnQnLFxuICAnRmxvYXQnLFxuICAnSUQnLFxuICAnQXJyYXlSZXN1bHQnLFxuICAnUXVlcnknLFxuICAnTXV0YXRpb24nLFxuICAnU3Vic2NyaXB0aW9uJyxcbiAgJ0NyZWF0ZUZpbGVJbnB1dCcsXG4gICdDcmVhdGVGaWxlUGF5bG9hZCcsXG4gICdWaWV3ZXInLFxuICAnU2lnblVwSW5wdXQnLFxuICAnU2lnblVwUGF5bG9hZCcsXG4gICdMb2dJbklucHV0JyxcbiAgJ0xvZ0luUGF5bG9hZCcsXG4gICdMb2dPdXRJbnB1dCcsXG4gICdMb2dPdXRQYXlsb2FkJyxcbiAgJ0Nsb3VkQ29kZUZ1bmN0aW9uJyxcbiAgJ0NhbGxDbG91ZENvZGVJbnB1dCcsXG4gICdDYWxsQ2xvdWRDb2RlUGF5bG9hZCcsXG4gICdDcmVhdGVDbGFzc0lucHV0JyxcbiAgJ0NyZWF0ZUNsYXNzUGF5bG9hZCcsXG4gICdVcGRhdGVDbGFzc0lucHV0JyxcbiAgJ1VwZGF0ZUNsYXNzUGF5bG9hZCcsXG4gICdEZWxldGVDbGFzc0lucHV0JyxcbiAgJ0RlbGV0ZUNsYXNzUGF5bG9hZCcsXG4gICdQYWdlSW5mbycsXG5dO1xuY29uc3QgUkVTRVJWRURfR1JBUEhRTF9RVUVSWV9OQU1FUyA9IFsnaGVhbHRoJywgJ3ZpZXdlcicsICdjbGFzcycsICdjbGFzc2VzJ107XG5jb25zdCBSRVNFUlZFRF9HUkFQSFFMX01VVEFUSU9OX05BTUVTID0gW1xuICAnc2lnblVwJyxcbiAgJ2xvZ0luJyxcbiAgJ2xvZ091dCcsXG4gICdjcmVhdGVGaWxlJyxcbiAgJ2NhbGxDbG91ZENvZGUnLFxuICAnY3JlYXRlQ2xhc3MnLFxuICAndXBkYXRlQ2xhc3MnLFxuICAnZGVsZXRlQ2xhc3MnLFxuXTtcblxuY2xhc3MgUGFyc2VHcmFwaFFMU2NoZW1hIHtcbiAgZGF0YWJhc2VDb250cm9sbGVyOiBEYXRhYmFzZUNvbnRyb2xsZXI7XG4gIHBhcnNlR3JhcGhRTENvbnRyb2xsZXI6IFBhcnNlR3JhcGhRTENvbnRyb2xsZXI7XG4gIHBhcnNlR3JhcGhRTENvbmZpZzogUGFyc2VHcmFwaFFMQ29uZmlnO1xuICBsb2c6IGFueTtcbiAgYXBwSWQ6IHN0cmluZztcbiAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzOiA/KHN0cmluZyB8IEdyYXBoUUxTY2hlbWEgfCBEb2N1bWVudE5vZGUgfCBHcmFwaFFMTmFtZWRUeXBlW10pO1xuICBzY2hlbWFDYWNoZTogYW55O1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHBhcmFtczoge1xuICAgICAgZGF0YWJhc2VDb250cm9sbGVyOiBEYXRhYmFzZUNvbnRyb2xsZXIsXG4gICAgICBwYXJzZUdyYXBoUUxDb250cm9sbGVyOiBQYXJzZUdyYXBoUUxDb250cm9sbGVyLFxuICAgICAgbG9nOiBhbnksXG4gICAgICBhcHBJZDogc3RyaW5nLFxuICAgICAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzOiA/KHN0cmluZyB8IEdyYXBoUUxTY2hlbWEgfCBEb2N1bWVudE5vZGUgfCBHcmFwaFFMTmFtZWRUeXBlW10pLFxuICAgIH0gPSB7fVxuICApIHtcbiAgICB0aGlzLnBhcnNlR3JhcGhRTENvbnRyb2xsZXIgPVxuICAgICAgcGFyYW1zLnBhcnNlR3JhcGhRTENvbnRyb2xsZXIgfHxcbiAgICAgIHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgcGFyc2VHcmFwaFFMQ29udHJvbGxlciBpbnN0YW5jZSEnKTtcbiAgICB0aGlzLmRhdGFiYXNlQ29udHJvbGxlciA9XG4gICAgICBwYXJhbXMuZGF0YWJhc2VDb250cm9sbGVyIHx8XG4gICAgICByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIGRhdGFiYXNlQ29udHJvbGxlciBpbnN0YW5jZSEnKTtcbiAgICB0aGlzLmxvZyA9IHBhcmFtcy5sb2cgfHwgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBsb2cgaW5zdGFuY2UhJyk7XG4gICAgdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMgPSBwYXJhbXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzO1xuICAgIHRoaXMuYXBwSWQgPSBwYXJhbXMuYXBwSWQgfHwgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgdGhlIGFwcElkIScpO1xuICAgIHRoaXMuc2NoZW1hQ2FjaGUgPSBTY2hlbWFDYWNoZTtcbiAgfVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgY29uc3QgeyBwYXJzZUdyYXBoUUxDb25maWcgfSA9IGF3YWl0IHRoaXMuX2luaXRpYWxpemVTY2hlbWFBbmRDb25maWcoKTtcbiAgICBjb25zdCBwYXJzZUNsYXNzZXMgPSBhd2FpdCB0aGlzLl9nZXRDbGFzc2VzRm9yU2NoZW1hKHBhcnNlR3JhcGhRTENvbmZpZyk7XG4gICAgY29uc3QgcGFyc2VDbGFzc2VzU3RyaW5nID0gSlNPTi5zdHJpbmdpZnkocGFyc2VDbGFzc2VzKTtcbiAgICBjb25zdCBmdW5jdGlvbk5hbWVzID0gYXdhaXQgdGhpcy5fZ2V0RnVuY3Rpb25OYW1lcygpO1xuICAgIGNvbnN0IGZ1bmN0aW9uTmFtZXNTdHJpbmcgPSBKU09OLnN0cmluZ2lmeShmdW5jdGlvbk5hbWVzKTtcblxuICAgIGlmIChcbiAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSAmJlxuICAgICAgIXRoaXMuX2hhc1NjaGVtYUlucHV0Q2hhbmdlZCh7XG4gICAgICAgIHBhcnNlQ2xhc3NlcyxcbiAgICAgICAgcGFyc2VDbGFzc2VzU3RyaW5nLFxuICAgICAgICBwYXJzZUdyYXBoUUxDb25maWcsXG4gICAgICAgIGZ1bmN0aW9uTmFtZXNTdHJpbmcsXG4gICAgICB9KVxuICAgICkge1xuICAgICAgcmV0dXJuIHRoaXMuZ3JhcGhRTFNjaGVtYTtcbiAgICB9XG5cbiAgICB0aGlzLnBhcnNlQ2xhc3NlcyA9IHBhcnNlQ2xhc3NlcztcbiAgICB0aGlzLnBhcnNlQ2xhc3Nlc1N0cmluZyA9IHBhcnNlQ2xhc3Nlc1N0cmluZztcbiAgICB0aGlzLnBhcnNlR3JhcGhRTENvbmZpZyA9IHBhcnNlR3JhcGhRTENvbmZpZztcbiAgICB0aGlzLmZ1bmN0aW9uTmFtZXMgPSBmdW5jdGlvbk5hbWVzO1xuICAgIHRoaXMuZnVuY3Rpb25OYW1lc1N0cmluZyA9IGZ1bmN0aW9uTmFtZXNTdHJpbmc7XG4gICAgdGhpcy5wYXJzZUNsYXNzVHlwZXMgPSB7fTtcbiAgICB0aGlzLnZpZXdlclR5cGUgPSBudWxsO1xuICAgIHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEgPSBudWxsO1xuICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSA9IG51bGw7XG4gICAgdGhpcy5ncmFwaFFMVHlwZXMgPSBbXTtcbiAgICB0aGlzLmdyYXBoUUxRdWVyaWVzID0ge307XG4gICAgdGhpcy5ncmFwaFFMTXV0YXRpb25zID0ge307XG4gICAgdGhpcy5ncmFwaFFMU3Vic2NyaXB0aW9ucyA9IHt9O1xuICAgIHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXNEZWZpbml0aW9ucyA9IG51bGw7XG4gICAgdGhpcy5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlcyA9IHt9O1xuICAgIHRoaXMucmVsYXlOb2RlSW50ZXJmYWNlID0gbnVsbDtcblxuICAgIGRlZmF1bHRHcmFwaFFMVHlwZXMubG9hZCh0aGlzKTtcbiAgICBkZWZhdWx0UmVsYXlTY2hlbWEubG9hZCh0aGlzKTtcbiAgICBzY2hlbWFUeXBlcy5sb2FkKHRoaXMpO1xuXG4gICAgdGhpcy5fZ2V0UGFyc2VDbGFzc2VzV2l0aENvbmZpZyhwYXJzZUNsYXNzZXMsIHBhcnNlR3JhcGhRTENvbmZpZykuZm9yRWFjaChcbiAgICAgIChbcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZ10pID0+IHtcbiAgICAgICAgLy8gU29tZSB0aW1lcyBzY2hlbWEgcmV0dXJuIHRoZSBfYXV0aF9kYXRhXyBmaWVsZFxuICAgICAgICAvLyBpdCB3aWxsIGxlYWQgdG8gdW5zdGFibGUgZ3JhcGhxbCBnZW5lcmF0aW9uIG9yZGVyXG4gICAgICAgIGlmIChwYXJzZUNsYXNzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgICAgIE9iamVjdC5rZXlzKHBhcnNlQ2xhc3MuZmllbGRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICBpZiAoZmllbGROYW1lLnN0YXJ0c1dpdGgoJ19hdXRoX2RhdGFfJykpIHtcbiAgICAgICAgICAgICAgZGVsZXRlIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgcGFyc2VDbGFzc1R5cGVzLmxvYWQodGhpcywgcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZyk7XG4gICAgICAgIHBhcnNlQ2xhc3NRdWVyaWVzLmxvYWQodGhpcywgcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZyk7XG4gICAgICAgIHBhcnNlQ2xhc3NNdXRhdGlvbnMubG9hZCh0aGlzLCBwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnKTtcbiAgICAgIH1cbiAgICApO1xuXG4gICAgZGVmYXVsdEdyYXBoUUxUeXBlcy5sb2FkQXJyYXlSZXN1bHQodGhpcywgcGFyc2VDbGFzc2VzKTtcbiAgICBkZWZhdWx0R3JhcGhRTFF1ZXJpZXMubG9hZCh0aGlzKTtcbiAgICBkZWZhdWx0R3JhcGhRTE11dGF0aW9ucy5sb2FkKHRoaXMpO1xuXG4gICAgbGV0IGdyYXBoUUxRdWVyeSA9IHVuZGVmaW5lZDtcbiAgICBpZiAoT2JqZWN0LmtleXModGhpcy5ncmFwaFFMUXVlcmllcykubGVuZ3RoID4gMCkge1xuICAgICAgZ3JhcGhRTFF1ZXJ5ID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICAgICAgbmFtZTogJ1F1ZXJ5JyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdRdWVyeSBpcyB0aGUgdG9wIGxldmVsIHR5cGUgZm9yIHF1ZXJpZXMuJyxcbiAgICAgICAgZmllbGRzOiB0aGlzLmdyYXBoUUxRdWVyaWVzLFxuICAgICAgfSk7XG4gICAgICB0aGlzLmFkZEdyYXBoUUxUeXBlKGdyYXBoUUxRdWVyeSwgdHJ1ZSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgbGV0IGdyYXBoUUxNdXRhdGlvbiA9IHVuZGVmaW5lZDtcbiAgICBpZiAoT2JqZWN0LmtleXModGhpcy5ncmFwaFFMTXV0YXRpb25zKS5sZW5ndGggPiAwKSB7XG4gICAgICBncmFwaFFMTXV0YXRpb24gPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgICAgICBuYW1lOiAnTXV0YXRpb24nLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ011dGF0aW9uIGlzIHRoZSB0b3AgbGV2ZWwgdHlwZSBmb3IgbXV0YXRpb25zLicsXG4gICAgICAgIGZpZWxkczogdGhpcy5ncmFwaFFMTXV0YXRpb25zLFxuICAgICAgfSk7XG4gICAgICB0aGlzLmFkZEdyYXBoUUxUeXBlKGdyYXBoUUxNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgbGV0IGdyYXBoUUxTdWJzY3JpcHRpb24gPSB1bmRlZmluZWQ7XG4gICAgaWYgKE9iamVjdC5rZXlzKHRoaXMuZ3JhcGhRTFN1YnNjcmlwdGlvbnMpLmxlbmd0aCA+IDApIHtcbiAgICAgIGdyYXBoUUxTdWJzY3JpcHRpb24gPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgICAgICBuYW1lOiAnU3Vic2NyaXB0aW9uJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdTdWJzY3JpcHRpb24gaXMgdGhlIHRvcCBsZXZlbCB0eXBlIGZvciBzdWJzY3JpcHRpb25zLicsXG4gICAgICAgIGZpZWxkczogdGhpcy5ncmFwaFFMU3Vic2NyaXB0aW9ucyxcbiAgICAgIH0pO1xuICAgICAgdGhpcy5hZGRHcmFwaFFMVHlwZShncmFwaFFMU3Vic2NyaXB0aW9uLCB0cnVlLCB0cnVlKTtcbiAgICB9XG5cbiAgICB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hID0gbmV3IEdyYXBoUUxTY2hlbWEoe1xuICAgICAgdHlwZXM6IHRoaXMuZ3JhcGhRTFR5cGVzLFxuICAgICAgcXVlcnk6IGdyYXBoUUxRdWVyeSxcbiAgICAgIG11dGF0aW9uOiBncmFwaFFMTXV0YXRpb24sXG4gICAgICBzdWJzY3JpcHRpb246IGdyYXBoUUxTdWJzY3JpcHRpb24sXG4gICAgfSk7XG5cbiAgICBpZiAodGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMpIHtcbiAgICAgIHNjaGVtYURpcmVjdGl2ZXMubG9hZCh0aGlzKTtcblxuICAgICAgaWYgKHR5cGVvZiB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcy5nZXRUeXBlTWFwID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIC8vIEluIGZvbGxvd2luZyBjb2RlIHdlIHVzZSB1bmRlcnNjb3JlIGF0dHIgdG8gYXZvaWQganMgdmFyIHVuIHJlZlxuICAgICAgICBjb25zdCBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZU1hcCA9IHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLl90eXBlTWFwO1xuICAgICAgICBjb25zdCBmaW5kQW5kUmVwbGFjZUxhc3RUeXBlID0gKHBhcmVudCwga2V5KSA9PiB7XG4gICAgICAgICAgaWYgKHBhcmVudFtrZXldLm5hbWUpIHtcbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYS5fdHlwZU1hcFtwYXJlbnRba2V5XS5uYW1lXSAmJlxuICAgICAgICAgICAgICB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLl90eXBlTWFwW3BhcmVudFtrZXldLm5hbWVdICE9PSBwYXJlbnRba2V5XVxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIC8vIFRvIGF2b2lkIHVucmVzb2x2ZWQgZmllbGQgb24gb3ZlcmxvYWRlZCBzY2hlbWFcbiAgICAgICAgICAgICAgLy8gcmVwbGFjZSB0aGUgZmluYWwgdHlwZSB3aXRoIHRoZSBhdXRvIHNjaGVtYSBvbmVcbiAgICAgICAgICAgICAgcGFyZW50W2tleV0gPSB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLl90eXBlTWFwW3BhcmVudFtrZXldLm5hbWVdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAocGFyZW50W2tleV0ub2ZUeXBlKSB7XG4gICAgICAgICAgICAgIGZpbmRBbmRSZXBsYWNlTGFzdFR5cGUocGFyZW50W2tleV0sICdvZlR5cGUnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIC8vIEFkZCBub24gc2hhcmVkIHR5cGVzIGZyb20gY3VzdG9tIHNjaGVtYSB0byBhdXRvIHNjaGVtYVxuICAgICAgICAvLyBub3RlOiBzb21lIG5vbiBzaGFyZWQgdHlwZXMgY2FuIHVzZSBzb21lIHNoYXJlZCB0eXBlc1xuICAgICAgICAvLyBzbyB0aGlzIGNvZGUgbmVlZCB0byBiZSByYW4gYmVmb3JlIHRoZSBzaGFyZWQgdHlwZXMgYWRkaXRpb25cbiAgICAgICAgLy8gd2UgdXNlIHNvcnQgdG8gZW5zdXJlIHNjaGVtYSBjb25zaXN0ZW5jeSBvdmVyIHJlc3RhcnRzXG4gICAgICAgIE9iamVjdC5rZXlzKGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlTWFwKVxuICAgICAgICAgIC5zb3J0KClcbiAgICAgICAgICAuZm9yRWFjaChjdXN0b21HcmFwaFFMU2NoZW1hVHlwZUtleSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZSA9IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlTWFwW2N1c3RvbUdyYXBoUUxTY2hlbWFUeXBlS2V5XTtcbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgIWN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlIHx8XG4gICAgICAgICAgICAgICFjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lIHx8XG4gICAgICAgICAgICAgIGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWUuc3RhcnRzV2l0aCgnX18nKVxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGF1dG9HcmFwaFFMU2NoZW1hVHlwZSA9IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuX3R5cGVNYXBbXG4gICAgICAgICAgICAgIGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWVcbiAgICAgICAgICAgIF07XG4gICAgICAgICAgICBpZiAoIWF1dG9HcmFwaFFMU2NoZW1hVHlwZSkge1xuICAgICAgICAgICAgICB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLl90eXBlTWFwW1xuICAgICAgICAgICAgICAgIGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWVcbiAgICAgICAgICAgICAgXSA9IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAvLyBIYW5kbGUgc2hhcmVkIHR5cGVzXG4gICAgICAgIC8vIFdlIHBhc3MgdGhyb3VnaCBlYWNoIHR5cGUgYW5kIGVuc3VyZSB0aGF0IGFsbCBzdWIgZmllbGQgdHlwZXMgYXJlIHJlcGxhY2VkXG4gICAgICAgIC8vIHdlIHVzZSBzb3J0IHRvIGVuc3VyZSBzY2hlbWEgY29uc2lzdGVuY3kgb3ZlciByZXN0YXJ0c1xuICAgICAgICBPYmplY3Qua2V5cyhjdXN0b21HcmFwaFFMU2NoZW1hVHlwZU1hcClcbiAgICAgICAgICAuc29ydCgpXG4gICAgICAgICAgLmZvckVhY2goY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVLZXkgPT4ge1xuICAgICAgICAgICAgY29uc3QgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUgPSBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZU1hcFtjdXN0b21HcmFwaFFMU2NoZW1hVHlwZUtleV07XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICFjdXN0b21HcmFwaFFMU2NoZW1hVHlwZSB8fFxuICAgICAgICAgICAgICAhY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZSB8fFxuICAgICAgICAgICAgICBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lLnN0YXJ0c1dpdGgoJ19fJylcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBhdXRvR3JhcGhRTFNjaGVtYVR5cGUgPSB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLl90eXBlTWFwW1xuICAgICAgICAgICAgICBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lXG4gICAgICAgICAgICBdO1xuXG4gICAgICAgICAgICBpZiAoYXV0b0dyYXBoUUxTY2hlbWFUeXBlICYmIHR5cGVvZiBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5nZXRGaWVsZHMgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgT2JqZWN0LmtleXMoY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUuX2ZpZWxkcylcbiAgICAgICAgICAgICAgICAuc29ydCgpXG4gICAgICAgICAgICAgICAgLmZvckVhY2goZmllbGRLZXkgPT4ge1xuICAgICAgICAgICAgICAgICAgY29uc3QgZmllbGQgPSBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5fZmllbGRzW2ZpZWxkS2V5XTtcbiAgICAgICAgICAgICAgICAgIGZpbmRBbmRSZXBsYWNlTGFzdFR5cGUoZmllbGQsICd0eXBlJyk7XG4gICAgICAgICAgICAgICAgICBhdXRvR3JhcGhRTFNjaGVtYVR5cGUuX2ZpZWxkc1tmaWVsZC5uYW1lXSA9IGZpZWxkO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hID0gYXdhaXQgdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMoe1xuICAgICAgICAgIGRpcmVjdGl2ZXNEZWZpbml0aW9uc1NjaGVtYTogdGhpcy5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zLFxuICAgICAgICAgIGF1dG9TY2hlbWE6IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEsXG4gICAgICAgICAgc3RpdGNoU2NoZW1hcyxcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSBzdGl0Y2hTY2hlbWFzKHtcbiAgICAgICAgICBzY2hlbWFzOiBbXG4gICAgICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzRGVmaW5pdGlvbnMsXG4gICAgICAgICAgICB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLFxuICAgICAgICAgICAgdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMsXG4gICAgICAgICAgXSxcbiAgICAgICAgICBtZXJnZURpcmVjdGl2ZXM6IHRydWUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICAvLyBPbmx5IG1lcmdlIGRpcmVjdGl2ZSB3aGVuIHN0cmluZyBzY2hlbWEgcHJvdmlkZWRcbiAgICAgIGNvbnN0IGdyYXBoUUxTY2hlbWFUeXBlTWFwID0gdGhpcy5ncmFwaFFMU2NoZW1hLmdldFR5cGVNYXAoKTtcbiAgICAgIE9iamVjdC5rZXlzKGdyYXBoUUxTY2hlbWFUeXBlTWFwKS5mb3JFYWNoKGdyYXBoUUxTY2hlbWFUeXBlTmFtZSA9PiB7XG4gICAgICAgIGNvbnN0IGdyYXBoUUxTY2hlbWFUeXBlID0gZ3JhcGhRTFNjaGVtYVR5cGVNYXBbZ3JhcGhRTFNjaGVtYVR5cGVOYW1lXTtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHR5cGVvZiBncmFwaFFMU2NoZW1hVHlwZS5nZXRGaWVsZHMgPT09ICdmdW5jdGlvbicgJiZcbiAgICAgICAgICB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcy5kZWZpbml0aW9uc1xuICAgICAgICApIHtcbiAgICAgICAgICBjb25zdCBncmFwaFFMQ3VzdG9tVHlwZURlZiA9IHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLmRlZmluaXRpb25zLmZpbmQoXG4gICAgICAgICAgICBkZWZpbml0aW9uID0+IGRlZmluaXRpb24ubmFtZS52YWx1ZSA9PT0gZ3JhcGhRTFNjaGVtYVR5cGVOYW1lXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAoZ3JhcGhRTEN1c3RvbVR5cGVEZWYpIHtcbiAgICAgICAgICAgIGNvbnN0IGdyYXBoUUxTY2hlbWFUeXBlRmllbGRNYXAgPSBncmFwaFFMU2NoZW1hVHlwZS5nZXRGaWVsZHMoKTtcbiAgICAgICAgICAgIE9iamVjdC5rZXlzKGdyYXBoUUxTY2hlbWFUeXBlRmllbGRNYXApLmZvckVhY2goZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBncmFwaFFMU2NoZW1hVHlwZUZpZWxkID0gZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE1hcFtncmFwaFFMU2NoZW1hVHlwZUZpZWxkTmFtZV07XG4gICAgICAgICAgICAgIGlmICghZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZC5hc3ROb2RlKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYXN0Tm9kZSA9IGdyYXBoUUxDdXN0b21UeXBlRGVmLmZpZWxkcy5maW5kKFxuICAgICAgICAgICAgICAgICAgZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE5hbWVcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIGlmIChhc3ROb2RlKSB7XG4gICAgICAgICAgICAgICAgICBncmFwaFFMU2NoZW1hVHlwZUZpZWxkLmFzdE5vZGUgPSBhc3ROb2RlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgU2NoZW1hRGlyZWN0aXZlVmlzaXRvci52aXNpdFNjaGVtYURpcmVjdGl2ZXMoXG4gICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSxcbiAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlc1xuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hID0gdGhpcy5ncmFwaFFMQXV0b1NjaGVtYTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5ncmFwaFFMU2NoZW1hO1xuICB9XG5cbiAgYWRkR3JhcGhRTFR5cGUodHlwZSwgdGhyb3dFcnJvciA9IGZhbHNlLCBpZ25vcmVSZXNlcnZlZCA9IGZhbHNlLCBpZ25vcmVDb25uZWN0aW9uID0gZmFsc2UpIHtcbiAgICBpZiAoXG4gICAgICAoIWlnbm9yZVJlc2VydmVkICYmIFJFU0VSVkVEX0dSQVBIUUxfVFlQRV9OQU1FUy5pbmNsdWRlcyh0eXBlLm5hbWUpKSB8fFxuICAgICAgdGhpcy5ncmFwaFFMVHlwZXMuZmluZChleGlzdGluZ1R5cGUgPT4gZXhpc3RpbmdUeXBlLm5hbWUgPT09IHR5cGUubmFtZSkgfHxcbiAgICAgICghaWdub3JlQ29ubmVjdGlvbiAmJiB0eXBlLm5hbWUuZW5kc1dpdGgoJ0Nvbm5lY3Rpb24nKSlcbiAgICApIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBgVHlwZSAke3R5cGUubmFtZX0gY291bGQgbm90IGJlIGFkZGVkIHRvIHRoZSBhdXRvIHNjaGVtYSBiZWNhdXNlIGl0IGNvbGxpZGVkIHdpdGggYW4gZXhpc3RpbmcgdHlwZS5gO1xuICAgICAgaWYgKHRocm93RXJyb3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UpO1xuICAgICAgfVxuICAgICAgdGhpcy5sb2cud2FybihtZXNzYWdlKTtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHRoaXMuZ3JhcGhRTFR5cGVzLnB1c2godHlwZSk7XG4gICAgcmV0dXJuIHR5cGU7XG4gIH1cblxuICBhZGRHcmFwaFFMUXVlcnkoZmllbGROYW1lLCBmaWVsZCwgdGhyb3dFcnJvciA9IGZhbHNlLCBpZ25vcmVSZXNlcnZlZCA9IGZhbHNlKSB7XG4gICAgaWYgKFxuICAgICAgKCFpZ25vcmVSZXNlcnZlZCAmJiBSRVNFUlZFRF9HUkFQSFFMX1FVRVJZX05BTUVTLmluY2x1ZGVzKGZpZWxkTmFtZSkpIHx8XG4gICAgICB0aGlzLmdyYXBoUUxRdWVyaWVzW2ZpZWxkTmFtZV1cbiAgICApIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBgUXVlcnkgJHtmaWVsZE5hbWV9IGNvdWxkIG5vdCBiZSBhZGRlZCB0byB0aGUgYXV0byBzY2hlbWEgYmVjYXVzZSBpdCBjb2xsaWRlZCB3aXRoIGFuIGV4aXN0aW5nIGZpZWxkLmA7XG4gICAgICBpZiAodGhyb3dFcnJvcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSk7XG4gICAgICB9XG4gICAgICB0aGlzLmxvZy53YXJuKG1lc3NhZ2UpO1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgdGhpcy5ncmFwaFFMUXVlcmllc1tmaWVsZE5hbWVdID0gZmllbGQ7XG4gICAgcmV0dXJuIGZpZWxkO1xuICB9XG5cbiAgYWRkR3JhcGhRTE11dGF0aW9uKGZpZWxkTmFtZSwgZmllbGQsIHRocm93RXJyb3IgPSBmYWxzZSwgaWdub3JlUmVzZXJ2ZWQgPSBmYWxzZSkge1xuICAgIGlmIChcbiAgICAgICghaWdub3JlUmVzZXJ2ZWQgJiYgUkVTRVJWRURfR1JBUEhRTF9NVVRBVElPTl9OQU1FUy5pbmNsdWRlcyhmaWVsZE5hbWUpKSB8fFxuICAgICAgdGhpcy5ncmFwaFFMTXV0YXRpb25zW2ZpZWxkTmFtZV1cbiAgICApIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBgTXV0YXRpb24gJHtmaWVsZE5hbWV9IGNvdWxkIG5vdCBiZSBhZGRlZCB0byB0aGUgYXV0byBzY2hlbWEgYmVjYXVzZSBpdCBjb2xsaWRlZCB3aXRoIGFuIGV4aXN0aW5nIGZpZWxkLmA7XG4gICAgICBpZiAodGhyb3dFcnJvcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSk7XG4gICAgICB9XG4gICAgICB0aGlzLmxvZy53YXJuKG1lc3NhZ2UpO1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgdGhpcy5ncmFwaFFMTXV0YXRpb25zW2ZpZWxkTmFtZV0gPSBmaWVsZDtcbiAgICByZXR1cm4gZmllbGQ7XG4gIH1cblxuICBoYW5kbGVFcnJvcihlcnJvcikge1xuICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIFBhcnNlLkVycm9yKSB7XG4gICAgICB0aGlzLmxvZy5lcnJvcignUGFyc2UgZXJyb3I6ICcsIGVycm9yKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5sb2cuZXJyb3IoJ1VuY2F1Z2h0IGludGVybmFsIHNlcnZlciBlcnJvci4nLCBlcnJvciwgZXJyb3Iuc3RhY2spO1xuICAgIH1cbiAgICB0aHJvdyB0b0dyYXBoUUxFcnJvcihlcnJvcik7XG4gIH1cblxuICBhc3luYyBfaW5pdGlhbGl6ZVNjaGVtYUFuZENvbmZpZygpIHtcbiAgICBjb25zdCBbc2NoZW1hQ29udHJvbGxlciwgcGFyc2VHcmFwaFFMQ29uZmlnXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgIHRoaXMuZGF0YWJhc2VDb250cm9sbGVyLmxvYWRTY2hlbWEoKSxcbiAgICAgIHRoaXMucGFyc2VHcmFwaFFMQ29udHJvbGxlci5nZXRHcmFwaFFMQ29uZmlnKCksXG4gICAgXSk7XG5cbiAgICB0aGlzLnNjaGVtYUNvbnRyb2xsZXIgPSBzY2hlbWFDb250cm9sbGVyO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHBhcnNlR3JhcGhRTENvbmZpZyxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIEdldHMgYWxsIGNsYXNzZXMgZm91bmQgYnkgdGhlIGBzY2hlbWFDb250cm9sbGVyYFxuICAgKiBtaW51cyB0aG9zZSBmaWx0ZXJlZCBvdXQgYnkgdGhlIGFwcCdzIHBhcnNlR3JhcGhRTENvbmZpZy5cbiAgICovXG4gIGFzeW5jIF9nZXRDbGFzc2VzRm9yU2NoZW1hKHBhcnNlR3JhcGhRTENvbmZpZzogUGFyc2VHcmFwaFFMQ29uZmlnKSB7XG4gICAgY29uc3QgeyBlbmFibGVkRm9yQ2xhc3NlcywgZGlzYWJsZWRGb3JDbGFzc2VzIH0gPSBwYXJzZUdyYXBoUUxDb25maWc7XG4gICAgY29uc3QgYWxsQ2xhc3NlcyA9IGF3YWl0IHRoaXMuc2NoZW1hQ29udHJvbGxlci5nZXRBbGxDbGFzc2VzKCk7XG5cbiAgICBpZiAoQXJyYXkuaXNBcnJheShlbmFibGVkRm9yQ2xhc3NlcykgfHwgQXJyYXkuaXNBcnJheShkaXNhYmxlZEZvckNsYXNzZXMpKSB7XG4gICAgICBsZXQgaW5jbHVkZWRDbGFzc2VzID0gYWxsQ2xhc3NlcztcbiAgICAgIGlmIChlbmFibGVkRm9yQ2xhc3Nlcykge1xuICAgICAgICBpbmNsdWRlZENsYXNzZXMgPSBhbGxDbGFzc2VzLmZpbHRlcihjbGF6eiA9PiB7XG4gICAgICAgICAgcmV0dXJuIGVuYWJsZWRGb3JDbGFzc2VzLmluY2x1ZGVzKGNsYXp6LmNsYXNzTmFtZSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgaWYgKGRpc2FibGVkRm9yQ2xhc3Nlcykge1xuICAgICAgICAvLyBDbGFzc2VzIGluY2x1ZGVkIGluIGBlbmFibGVkRm9yQ2xhc3Nlc2AgdGhhdFxuICAgICAgICAvLyBhcmUgYWxzbyBwcmVzZW50IGluIGBkaXNhYmxlZEZvckNsYXNzZXNgIHdpbGxcbiAgICAgICAgLy8gc3RpbGwgYmUgZmlsdGVyZWQgb3V0XG4gICAgICAgIGluY2x1ZGVkQ2xhc3NlcyA9IGluY2x1ZGVkQ2xhc3Nlcy5maWx0ZXIoY2xhenogPT4ge1xuICAgICAgICAgIHJldHVybiAhZGlzYWJsZWRGb3JDbGFzc2VzLmluY2x1ZGVzKGNsYXp6LmNsYXNzTmFtZSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICB0aGlzLmlzVXNlcnNDbGFzc0Rpc2FibGVkID0gIWluY2x1ZGVkQ2xhc3Nlcy5zb21lKGNsYXp6ID0+IHtcbiAgICAgICAgcmV0dXJuIGNsYXp6LmNsYXNzTmFtZSA9PT0gJ19Vc2VyJztcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gaW5jbHVkZWRDbGFzc2VzO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gYWxsQ2xhc3NlcztcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVGhpcyBtZXRob2QgcmV0dXJucyBhIGxpc3Qgb2YgdHVwbGVzXG4gICAqIHRoYXQgcHJvdmlkZSB0aGUgcGFyc2VDbGFzcyBhbG9uZyB3aXRoXG4gICAqIGl0cyBwYXJzZUNsYXNzQ29uZmlnIHdoZXJlIHByb3ZpZGVkLlxuICAgKi9cbiAgX2dldFBhcnNlQ2xhc3Nlc1dpdGhDb25maWcocGFyc2VDbGFzc2VzLCBwYXJzZUdyYXBoUUxDb25maWc6IFBhcnNlR3JhcGhRTENvbmZpZykge1xuICAgIGNvbnN0IHsgY2xhc3NDb25maWdzIH0gPSBwYXJzZUdyYXBoUUxDb25maWc7XG5cbiAgICAvLyBNYWtlIHN1cmVzIHRoYXQgdGhlIGRlZmF1bHQgY2xhc3NlcyBhbmQgY2xhc3NlcyB0aGF0XG4gICAgLy8gc3RhcnRzIHdpdGggY2FwaXRhbGl6ZWQgbGV0dGVyIHdpbGwgYmUgZ2VuZXJhdGVkIGZpcnN0LlxuICAgIGNvbnN0IHNvcnRDbGFzc2VzID0gKGEsIGIpID0+IHtcbiAgICAgIGEgPSBhLmNsYXNzTmFtZTtcbiAgICAgIGIgPSBiLmNsYXNzTmFtZTtcbiAgICAgIGlmIChhWzBdID09PSAnXycpIHtcbiAgICAgICAgaWYgKGJbMF0gIT09ICdfJykge1xuICAgICAgICAgIHJldHVybiAtMTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGJbMF0gPT09ICdfJykge1xuICAgICAgICBpZiAoYVswXSAhPT0gJ18nKSB7XG4gICAgICAgICAgcmV0dXJuIDE7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChhID09PSBiKSB7XG4gICAgICAgIHJldHVybiAwO1xuICAgICAgfSBlbHNlIGlmIChhIDwgYikge1xuICAgICAgICByZXR1cm4gLTE7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gMTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgcmV0dXJuIHBhcnNlQ2xhc3Nlcy5zb3J0KHNvcnRDbGFzc2VzKS5tYXAocGFyc2VDbGFzcyA9PiB7XG4gICAgICBsZXQgcGFyc2VDbGFzc0NvbmZpZztcbiAgICAgIGlmIChjbGFzc0NvbmZpZ3MpIHtcbiAgICAgICAgcGFyc2VDbGFzc0NvbmZpZyA9IGNsYXNzQ29uZmlncy5maW5kKGMgPT4gYy5jbGFzc05hbWUgPT09IHBhcnNlQ2xhc3MuY2xhc3NOYW1lKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBbcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZ107XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBfZ2V0RnVuY3Rpb25OYW1lcygpIHtcbiAgICByZXR1cm4gYXdhaXQgZ2V0RnVuY3Rpb25OYW1lcyh0aGlzLmFwcElkKS5maWx0ZXIoZnVuY3Rpb25OYW1lID0+IHtcbiAgICAgIGlmICgvXltfYS16QS1aXVtfYS16QS1aMC05XSokLy50ZXN0KGZ1bmN0aW9uTmFtZSkpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmxvZy53YXJuKFxuICAgICAgICAgIGBGdW5jdGlvbiAke2Z1bmN0aW9uTmFtZX0gY291bGQgbm90IGJlIGFkZGVkIHRvIHRoZSBhdXRvIHNjaGVtYSBiZWNhdXNlIEdyYXBoUUwgbmFtZXMgbXVzdCBtYXRjaCAvXltfYS16QS1aXVtfYS16QS1aMC05XSokLy5gXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVja3MgZm9yIGNoYW5nZXMgdG8gdGhlIHBhcnNlQ2xhc3Nlc1xuICAgKiBvYmplY3RzIChpLmUuIGRhdGFiYXNlIHNjaGVtYSkgb3IgdG9cbiAgICogdGhlIHBhcnNlR3JhcGhRTENvbmZpZyBvYmplY3QuIElmIG5vXG4gICAqIGNoYW5nZXMgYXJlIGZvdW5kLCByZXR1cm4gdHJ1ZTtcbiAgICovXG4gIF9oYXNTY2hlbWFJbnB1dENoYW5nZWQocGFyYW1zOiB7XG4gICAgcGFyc2VDbGFzc2VzOiBhbnksXG4gICAgcGFyc2VDbGFzc2VzU3RyaW5nOiBzdHJpbmcsXG4gICAgcGFyc2VHcmFwaFFMQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ29uZmlnLFxuICAgIGZ1bmN0aW9uTmFtZXNTdHJpbmc6IHN0cmluZyxcbiAgfSk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IHsgcGFyc2VDbGFzc2VzLCBwYXJzZUNsYXNzZXNTdHJpbmcsIHBhcnNlR3JhcGhRTENvbmZpZywgZnVuY3Rpb25OYW1lc1N0cmluZyB9ID0gcGFyYW1zO1xuXG4gICAgaWYgKFxuICAgICAgSlNPTi5zdHJpbmdpZnkodGhpcy5wYXJzZUdyYXBoUUxDb25maWcpID09PSBKU09OLnN0cmluZ2lmeShwYXJzZUdyYXBoUUxDb25maWcpICYmXG4gICAgICB0aGlzLmZ1bmN0aW9uTmFtZXNTdHJpbmcgPT09IGZ1bmN0aW9uTmFtZXNTdHJpbmdcbiAgICApIHtcbiAgICAgIGlmICh0aGlzLnBhcnNlQ2xhc3NlcyA9PT0gcGFyc2VDbGFzc2VzKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMucGFyc2VDbGFzc2VzU3RyaW5nID09PSBwYXJzZUNsYXNzZXNTdHJpbmcpIHtcbiAgICAgICAgdGhpcy5wYXJzZUNsYXNzZXMgPSBwYXJzZUNsYXNzZXM7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxufVxuXG5leHBvcnQgeyBQYXJzZUdyYXBoUUxTY2hlbWEgfTtcbiJdfQ==