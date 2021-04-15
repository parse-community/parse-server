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


      if (typeof this.graphQLCustomTypeDefs === 'string') {
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
      }
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9HcmFwaFFML1BhcnNlR3JhcGhRTFNjaGVtYS5qcyJdLCJuYW1lcyI6WyJSRVNFUlZFRF9HUkFQSFFMX1RZUEVfTkFNRVMiLCJSRVNFUlZFRF9HUkFQSFFMX1FVRVJZX05BTUVTIiwiUkVTRVJWRURfR1JBUEhRTF9NVVRBVElPTl9OQU1FUyIsIlBhcnNlR3JhcGhRTFNjaGVtYSIsImNvbnN0cnVjdG9yIiwicGFyYW1zIiwicGFyc2VHcmFwaFFMQ29udHJvbGxlciIsImRhdGFiYXNlQ29udHJvbGxlciIsImxvZyIsImdyYXBoUUxDdXN0b21UeXBlRGVmcyIsImFwcElkIiwic2NoZW1hQ2FjaGUiLCJTY2hlbWFDYWNoZSIsImxvYWQiLCJwYXJzZUdyYXBoUUxDb25maWciLCJfaW5pdGlhbGl6ZVNjaGVtYUFuZENvbmZpZyIsInBhcnNlQ2xhc3NlcyIsIl9nZXRDbGFzc2VzRm9yU2NoZW1hIiwicGFyc2VDbGFzc2VzU3RyaW5nIiwiSlNPTiIsInN0cmluZ2lmeSIsImZ1bmN0aW9uTmFtZXMiLCJfZ2V0RnVuY3Rpb25OYW1lcyIsImZ1bmN0aW9uTmFtZXNTdHJpbmciLCJncmFwaFFMU2NoZW1hIiwiX2hhc1NjaGVtYUlucHV0Q2hhbmdlZCIsInBhcnNlQ2xhc3NUeXBlcyIsInZpZXdlclR5cGUiLCJncmFwaFFMQXV0b1NjaGVtYSIsImdyYXBoUUxUeXBlcyIsImdyYXBoUUxRdWVyaWVzIiwiZ3JhcGhRTE11dGF0aW9ucyIsImdyYXBoUUxTdWJzY3JpcHRpb25zIiwiZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXNEZWZpbml0aW9ucyIsImdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzIiwicmVsYXlOb2RlSW50ZXJmYWNlIiwiZGVmYXVsdEdyYXBoUUxUeXBlcyIsImRlZmF1bHRSZWxheVNjaGVtYSIsInNjaGVtYVR5cGVzIiwiX2dldFBhcnNlQ2xhc3Nlc1dpdGhDb25maWciLCJmb3JFYWNoIiwicGFyc2VDbGFzcyIsInBhcnNlQ2xhc3NDb25maWciLCJwYXJzZUNsYXNzUXVlcmllcyIsInBhcnNlQ2xhc3NNdXRhdGlvbnMiLCJsb2FkQXJyYXlSZXN1bHQiLCJkZWZhdWx0R3JhcGhRTFF1ZXJpZXMiLCJkZWZhdWx0R3JhcGhRTE11dGF0aW9ucyIsImdyYXBoUUxRdWVyeSIsInVuZGVmaW5lZCIsIk9iamVjdCIsImtleXMiLCJsZW5ndGgiLCJHcmFwaFFMT2JqZWN0VHlwZSIsIm5hbWUiLCJkZXNjcmlwdGlvbiIsImZpZWxkcyIsImFkZEdyYXBoUUxUeXBlIiwiZ3JhcGhRTE11dGF0aW9uIiwiZ3JhcGhRTFN1YnNjcmlwdGlvbiIsIkdyYXBoUUxTY2hlbWEiLCJ0eXBlcyIsInF1ZXJ5IiwibXV0YXRpb24iLCJzdWJzY3JpcHRpb24iLCJzY2hlbWFEaXJlY3RpdmVzIiwiZ2V0VHlwZU1hcCIsImN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlTWFwIiwiX3R5cGVNYXAiLCJmaW5kQW5kUmVwbGFjZUxhc3RUeXBlIiwicGFyZW50Iiwia2V5Iiwib2ZUeXBlIiwic29ydCIsImN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlS2V5IiwiY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUiLCJzdGFydHNXaXRoIiwiYXV0b0dyYXBoUUxTY2hlbWFUeXBlIiwiZ2V0RmllbGRzIiwiX2ZpZWxkcyIsImZpZWxkS2V5IiwiZmllbGQiLCJkaXJlY3RpdmVzRGVmaW5pdGlvbnNTY2hlbWEiLCJhdXRvU2NoZW1hIiwic3RpdGNoU2NoZW1hcyIsInNjaGVtYXMiLCJtZXJnZURpcmVjdGl2ZXMiLCJncmFwaFFMU2NoZW1hVHlwZU1hcCIsImdyYXBoUUxTY2hlbWFUeXBlTmFtZSIsImdyYXBoUUxTY2hlbWFUeXBlIiwiZGVmaW5pdGlvbnMiLCJncmFwaFFMQ3VzdG9tVHlwZURlZiIsImZpbmQiLCJkZWZpbml0aW9uIiwidmFsdWUiLCJncmFwaFFMU2NoZW1hVHlwZUZpZWxkTWFwIiwiZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE5hbWUiLCJncmFwaFFMU2NoZW1hVHlwZUZpZWxkIiwiYXN0Tm9kZSIsIlNjaGVtYURpcmVjdGl2ZVZpc2l0b3IiLCJ2aXNpdFNjaGVtYURpcmVjdGl2ZXMiLCJ0eXBlIiwidGhyb3dFcnJvciIsImlnbm9yZVJlc2VydmVkIiwiaWdub3JlQ29ubmVjdGlvbiIsImluY2x1ZGVzIiwiZXhpc3RpbmdUeXBlIiwiZW5kc1dpdGgiLCJtZXNzYWdlIiwiRXJyb3IiLCJ3YXJuIiwicHVzaCIsImFkZEdyYXBoUUxRdWVyeSIsImZpZWxkTmFtZSIsImFkZEdyYXBoUUxNdXRhdGlvbiIsImhhbmRsZUVycm9yIiwiZXJyb3IiLCJQYXJzZSIsInN0YWNrIiwic2NoZW1hQ29udHJvbGxlciIsIlByb21pc2UiLCJhbGwiLCJsb2FkU2NoZW1hIiwiZ2V0R3JhcGhRTENvbmZpZyIsImVuYWJsZWRGb3JDbGFzc2VzIiwiZGlzYWJsZWRGb3JDbGFzc2VzIiwiYWxsQ2xhc3NlcyIsImdldEFsbENsYXNzZXMiLCJBcnJheSIsImlzQXJyYXkiLCJpbmNsdWRlZENsYXNzZXMiLCJmaWx0ZXIiLCJjbGF6eiIsImNsYXNzTmFtZSIsImlzVXNlcnNDbGFzc0Rpc2FibGVkIiwic29tZSIsImNsYXNzQ29uZmlncyIsInNvcnRDbGFzc2VzIiwiYSIsImIiLCJtYXAiLCJjIiwiZnVuY3Rpb25OYW1lIiwidGVzdCJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQUVBLE1BQU1BLDJCQUEyQixHQUFHLENBQ2xDLFFBRGtDLEVBRWxDLFNBRmtDLEVBR2xDLEtBSGtDLEVBSWxDLE9BSmtDLEVBS2xDLElBTGtDLEVBTWxDLGFBTmtDLEVBT2xDLE9BUGtDLEVBUWxDLFVBUmtDLEVBU2xDLGNBVGtDLEVBVWxDLGlCQVZrQyxFQVdsQyxtQkFYa0MsRUFZbEMsUUFaa0MsRUFhbEMsYUFia0MsRUFjbEMsZUFka0MsRUFlbEMs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RXNCLFFBQWpCcEIsaUJBQWlCLEdBQUc7QUFDeEIsV0FBTyxNQUFNLGdDQUFpQixLQUFLWixLQUF0QixFQUE2QnlILE1BQTdCLENBQW9DVyxZQUFZLElBQUk7QUFDL0QsVUFBSSwyQkFBMkJDLElBQTNCLENBQWdDRCxZQUFoQyxDQUFKLEVBQW1EO0FBQ2pELGVBQU8sSUFBUDtBQUNELE9BRkQsTUFFTztBQUNMLGFBQUt0SSxHQUFMLENBQVNzRyxJQUFULENBQ0csWUFBV2dDLFlBQWEscUdBRDNCO0FBR0EsZUFBTyxLQUFQO0FBQ0Q7QUFDRixLQVRZLENBQWI7QUFVRDtBQUVEO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBQ0VySCxFQUFBQSxzQkFBc0IsQ0FBQ3BCLE1BQUQsRUFLVjtBQUNWLFVBQU07QUFBRVcsTUFBQUEsWUFBRjtBQUFnQkUsTUFBQUEsa0JBQWhCO0FBQW9DSixNQUFBQSxrQkFBcEM7QUFBd0RTLE1BQUFBO0FBQXhELFFBQWdGbEIsTUFBdEY7O0FBRUEsUUFDRWMsSUFBSSxDQUFDQyxTQUFMLENBQWUsS0FBS04sa0JBQXBCLE1BQTRDSyxJQUFJLENBQUNDLFNBQUwsQ0FBZU4sa0JBQWYsQ0FBNUMsSUFDQSxLQUFLUyxtQkFBTCxLQUE2QkEsbUJBRi9CLEVBR0U7QUFDQSxVQUFJLEtBQUtQLFlBQUwsS0FBc0JBLFlBQTFCLEVBQXdDO0FBQ3RDLGVBQU8sS0FBUDtBQUNEOztBQUVELFVBQUksS0FBS0Usa0JBQUwsS0FBNEJBLGtCQUFoQyxFQUFvRDtBQUNsRCxhQUFLRixZQUFMLEdBQW9CQSxZQUFwQjtBQUNBLGVBQU8sS0FBUDtBQUNEO0FBQ0Y7O0FBRUQsV0FBTyxJQUFQO0FBQ0Q7O0FBemJzQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7IEdyYXBoUUxTY2hlbWEsIEdyYXBoUUxPYmplY3RUeXBlLCBEb2N1bWVudE5vZGUsIEdyYXBoUUxOYW1lZFR5cGUgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IHN0aXRjaFNjaGVtYXMgfSBmcm9tICdAZ3JhcGhxbC10b29scy9zdGl0Y2gnO1xuaW1wb3J0IHsgU2NoZW1hRGlyZWN0aXZlVmlzaXRvciB9IGZyb20gJ0BncmFwaHFsLXRvb2xzL3V0aWxzJztcbmltcG9ydCByZXF1aXJlZFBhcmFtZXRlciBmcm9tICcuLi9yZXF1aXJlZFBhcmFtZXRlcic7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4vbG9hZGVycy9kZWZhdWx0R3JhcGhRTFR5cGVzJztcbmltcG9ydCAqIGFzIHBhcnNlQ2xhc3NUeXBlcyBmcm9tICcuL2xvYWRlcnMvcGFyc2VDbGFzc1R5cGVzJztcbmltcG9ydCAqIGFzIHBhcnNlQ2xhc3NRdWVyaWVzIGZyb20gJy4vbG9hZGVycy9wYXJzZUNsYXNzUXVlcmllcyc7XG5pbXBvcnQgKiBhcyBwYXJzZUNsYXNzTXV0YXRpb25zIGZyb20gJy4vbG9hZGVycy9wYXJzZUNsYXNzTXV0YXRpb25zJztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMUXVlcmllcyBmcm9tICcuL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxRdWVyaWVzJztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMTXV0YXRpb25zIGZyb20gJy4vbG9hZGVycy9kZWZhdWx0R3JhcGhRTE11dGF0aW9ucyc7XG5pbXBvcnQgUGFyc2VHcmFwaFFMQ29udHJvbGxlciwgeyBQYXJzZUdyYXBoUUxDb25maWcgfSBmcm9tICcuLi9Db250cm9sbGVycy9QYXJzZUdyYXBoUUxDb250cm9sbGVyJztcbmltcG9ydCBEYXRhYmFzZUNvbnRyb2xsZXIgZnJvbSAnLi4vQ29udHJvbGxlcnMvRGF0YWJhc2VDb250cm9sbGVyJztcbmltcG9ydCBTY2hlbWFDYWNoZSBmcm9tICcuLi9BZGFwdGVycy9DYWNoZS9TY2hlbWFDYWNoZSc7XG5pbXBvcnQgeyB0b0dyYXBoUUxFcnJvciB9IGZyb20gJy4vcGFyc2VHcmFwaFFMVXRpbHMnO1xuaW1wb3J0ICogYXMgc2NoZW1hRGlyZWN0aXZlcyBmcm9tICcuL2xvYWRlcnMvc2NoZW1hRGlyZWN0aXZlcyc7XG5pbXBvcnQgKiBhcyBzY2hlbWFUeXBlcyBmcm9tICcuL2xvYWRlcnMvc2NoZW1hVHlwZXMnO1xuaW1wb3J0IHsgZ2V0RnVuY3Rpb25OYW1lcyB9IGZyb20gJy4uL3RyaWdnZXJzJztcbmltcG9ydCAqIGFzIGRlZmF1bHRSZWxheVNjaGVtYSBmcm9tICcuL2xvYWRlcnMvZGVmYXVsdFJlbGF5U2NoZW1hJztcblxuY29uc3QgUkVTRVJWRURfR1JBUEhRTF9UWVBFX05BTUVTID0gW1xuICAnU3RyaW5nJyxcbiAgJ0Jvb2xlYW4nLFxuICAnSW50JyxcbiAgJ0Zsb2F0JyxcbiAgJ0lEJyxcbiAgJ0FycmF5UmVzdWx0JyxcbiAgJ1F1ZXJ5JyxcbiAgJ011dGF0aW9uJyxcbiAgJ1N1YnNjcmlwdGlvbicsXG4gICdDcmVhdGVGaWxlSW5wdXQnLFxuICAnQ3JlYXRlRmlsZVBheWxvYWQnLFxuICAnVmlld2VyJyxcbiAgJ1NpZ25VcElucHV0JyxcbiAgJ1NpZ25VcFBheWxvYWQnLFxuICAnTG9nSW5JbnB1dCcsXG4gICdMb2dJblBheWxvYWQnLFxuICAnTG9nT3V0SW5wdXQnLFxuICAnTG9nT3V0UGF5bG9hZCcsXG4gICdDbG91ZENvZGVGdW5jdGlvbicsXG4gICdDYWxsQ2xvdWRDb2RlSW5wdXQnLFxuICAnQ2FsbENsb3VkQ29kZVBheWxvYWQnLFxuICAnQ3JlYXRlQ2xhc3NJbnB1dCcsXG4gICdDcmVhdGVDbGFzc1BheWxvYWQnLFxuICAnVXBkYXRlQ2xhc3NJbnB1dCcsXG4gICdVcGRhdGVDbGFzc1BheWxvYWQnLFxuICAnRGVsZXRlQ2xhc3NJbnB1dCcsXG4gICdEZWxldGVDbGFzc1BheWxvYWQnLFxuICAnUGFnZUluZm8nLFxuXTtcbmNvbnN0IFJFU0VSVkVEX0dSQVBIUUxfUVVFUllfTkFNRVMgPSBbJ2hlYWx0aCcsICd2aWV3ZXInLCAnY2xhc3MnLCAnY2xhc3NlcyddO1xuY29uc3QgUkVTRVJWRURfR1JBUEhRTF9NVVRBVElPTl9OQU1FUyA9IFtcbiAgJ3NpZ25VcCcsXG4gICdsb2dJbicsXG4gICdsb2dPdXQnLFxuICAnY3JlYXRlRmlsZScsXG4gICdjYWxsQ2xvdWRDb2RlJyxcbiAgJ2NyZWF0ZUNsYXNzJyxcbiAgJ3VwZGF0ZUNsYXNzJyxcbiAgJ2RlbGV0ZUNsYXNzJyxcbl07XG5cbmNsYXNzIFBhcnNlR3JhcGhRTFNjaGVtYSB7XG4gIGRhdGFiYXNlQ29udHJvbGxlcjogRGF0YWJhc2VDb250cm9sbGVyO1xuICBwYXJzZUdyYXBoUUxDb250cm9sbGVyOiBQYXJzZUdyYXBoUUxDb250cm9sbGVyO1xuICBwYXJzZUdyYXBoUUxDb25maWc6IFBhcnNlR3JhcGhRTENvbmZpZztcbiAgbG9nOiBhbnk7XG4gIGFwcElkOiBzdHJpbmc7XG4gIGdyYXBoUUxDdXN0b21UeXBlRGVmczogPyhzdHJpbmcgfCBHcmFwaFFMU2NoZW1hIHwgRG9jdW1lbnROb2RlIHwgR3JhcGhRTE5hbWVkVHlwZVtdKTtcbiAgc2NoZW1hQ2FjaGU6IGFueTtcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwYXJhbXM6IHtcbiAgICAgIGRhdGFiYXNlQ29udHJvbGxlcjogRGF0YWJhc2VDb250cm9sbGVyLFxuICAgICAgcGFyc2VHcmFwaFFMQ29udHJvbGxlcjogUGFyc2VHcmFwaFFMQ29udHJvbGxlcixcbiAgICAgIGxvZzogYW55LFxuICAgICAgYXBwSWQ6IHN0cmluZyxcbiAgICAgIGdyYXBoUUxDdXN0b21UeXBlRGVmczogPyhzdHJpbmcgfCBHcmFwaFFMU2NoZW1hIHwgRG9jdW1lbnROb2RlIHwgR3JhcGhRTE5hbWVkVHlwZVtdKSxcbiAgICB9ID0ge31cbiAgKSB7XG4gICAgdGhpcy5wYXJzZUdyYXBoUUxDb250cm9sbGVyID1cbiAgICAgIHBhcmFtcy5wYXJzZUdyYXBoUUxDb250cm9sbGVyIHx8XG4gICAgICByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIHBhcnNlR3JhcGhRTENvbnRyb2xsZXIgaW5zdGFuY2UhJyk7XG4gICAgdGhpcy5kYXRhYmFzZUNvbnRyb2xsZXIgPVxuICAgICAgcGFyYW1zLmRhdGFiYXNlQ29udHJvbGxlciB8fFxuICAgICAgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBkYXRhYmFzZUNvbnRyb2xsZXIgaW5zdGFuY2UhJyk7XG4gICAgdGhpcy5sb2cgPSBwYXJhbXMubG9nIHx8IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgbG9nIGluc3RhbmNlIScpO1xuICAgIHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID0gcGFyYW1zLmdyYXBoUUxDdXN0b21UeXBlRGVmcztcbiAgICB0aGlzLmFwcElkID0gcGFyYW1zLmFwcElkIHx8IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIHRoZSBhcHBJZCEnKTtcbiAgICB0aGlzLnNjaGVtYUNhY2hlID0gU2NoZW1hQ2FjaGU7XG4gIH1cblxuICBhc3luYyBsb2FkKCkge1xuICAgIGNvbnN0IHsgcGFyc2VHcmFwaFFMQ29uZmlnIH0gPSBhd2FpdCB0aGlzLl9pbml0aWFsaXplU2NoZW1hQW5kQ29uZmlnKCk7XG4gICAgY29uc3QgcGFyc2VDbGFzc2VzID0gYXdhaXQgdGhpcy5fZ2V0Q2xhc3Nlc0ZvclNjaGVtYShwYXJzZUdyYXBoUUxDb25maWcpO1xuICAgIGNvbnN0IHBhcnNlQ2xhc3Nlc1N0cmluZyA9IEpTT04uc3RyaW5naWZ5KHBhcnNlQ2xhc3Nlcyk7XG4gICAgY29uc3QgZnVuY3Rpb25OYW1lcyA9IGF3YWl0IHRoaXMuX2dldEZ1bmN0aW9uTmFtZXMoKTtcbiAgICBjb25zdCBmdW5jdGlvbk5hbWVzU3RyaW5nID0gSlNPTi5zdHJpbmdpZnkoZnVuY3Rpb25OYW1lcyk7XG5cbiAgICBpZiAoXG4gICAgICB0aGlzLmdyYXBoUUxTY2hlbWEgJiZcbiAgICAgICF0aGlzLl9oYXNTY2hlbWFJbnB1dENoYW5nZWQoe1xuICAgICAgICBwYXJzZUNsYXNzZXMsXG4gICAgICAgIHBhcnNlQ2xhc3Nlc1N0cmluZyxcbiAgICAgICAgcGFyc2VHcmFwaFFMQ29uZmlnLFxuICAgICAgICBmdW5jdGlvbk5hbWVzU3RyaW5nLFxuICAgICAgfSlcbiAgICApIHtcbiAgICAgIHJldHVybiB0aGlzLmdyYXBoUUxTY2hlbWE7XG4gICAgfVxuXG4gICAgdGhpcy5wYXJzZUNsYXNzZXMgPSBwYXJzZUNsYXNzZXM7XG4gICAgdGhpcy5wYXJzZUNsYXNzZXNTdHJpbmcgPSBwYXJzZUNsYXNzZXNTdHJpbmc7XG4gICAgdGhpcy5wYXJzZUdyYXBoUUxDb25maWcgPSBwYXJzZUdyYXBoUUxDb25maWc7XG4gICAgdGhpcy5mdW5jdGlvbk5hbWVzID0gZnVuY3Rpb25OYW1lcztcbiAgICB0aGlzLmZ1bmN0aW9uTmFtZXNTdHJpbmcgPSBmdW5jdGlvbk5hbWVzU3RyaW5nO1xuICAgIHRoaXMucGFyc2VDbGFzc1R5cGVzID0ge307XG4gICAgdGhpcy52aWV3ZXJUeXBlID0gbnVsbDtcbiAgICB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hID0gbnVsbDtcbiAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSBudWxsO1xuICAgIHRoaXMuZ3JhcGhRTFR5cGVzID0gW107XG4gICAgdGhpcy5ncmFwaFFMUXVlcmllcyA9IHt9O1xuICAgIHRoaXMuZ3JhcGhRTE11dGF0aW9ucyA9IHt9O1xuICAgIHRoaXMuZ3JhcGhRTFN1YnNjcmlwdGlvbnMgPSB7fTtcbiAgICB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzRGVmaW5pdGlvbnMgPSBudWxsO1xuICAgIHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXMgPSB7fTtcbiAgICB0aGlzLnJlbGF5Tm9kZUludGVyZmFjZSA9IG51bGw7XG5cbiAgICBkZWZhdWx0R3JhcGhRTFR5cGVzLmxvYWQodGhpcyk7XG4gICAgZGVmYXVsdFJlbGF5U2NoZW1hLmxvYWQodGhpcyk7XG4gICAgc2NoZW1hVHlwZXMubG9hZCh0aGlzKTtcblxuICAgIHRoaXMuX2dldFBhcnNlQ2xhc3Nlc1dpdGhDb25maWcocGFyc2VDbGFzc2VzLCBwYXJzZUdyYXBoUUxDb25maWcpLmZvckVhY2goXG4gICAgICAoW3BhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWddKSA9PiB7XG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlcy5sb2FkKHRoaXMsIHBhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWcpO1xuICAgICAgICBwYXJzZUNsYXNzUXVlcmllcy5sb2FkKHRoaXMsIHBhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWcpO1xuICAgICAgICBwYXJzZUNsYXNzTXV0YXRpb25zLmxvYWQodGhpcywgcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZyk7XG4gICAgICB9XG4gICAgKTtcblxuICAgIGRlZmF1bHRHcmFwaFFMVHlwZXMubG9hZEFycmF5UmVzdWx0KHRoaXMsIHBhcnNlQ2xhc3Nlcyk7XG4gICAgZGVmYXVsdEdyYXBoUUxRdWVyaWVzLmxvYWQodGhpcyk7XG4gICAgZGVmYXVsdEdyYXBoUUxNdXRhdGlvbnMubG9hZCh0aGlzKTtcblxuICAgIGxldCBncmFwaFFMUXVlcnkgPSB1bmRlZmluZWQ7XG4gICAgaWYgKE9iamVjdC5rZXlzKHRoaXMuZ3JhcGhRTFF1ZXJpZXMpLmxlbmd0aCA+IDApIHtcbiAgICAgIGdyYXBoUUxRdWVyeSA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgICAgIG5hbWU6ICdRdWVyeScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnUXVlcnkgaXMgdGhlIHRvcCBsZXZlbCB0eXBlIGZvciBxdWVyaWVzLicsXG4gICAgICAgIGZpZWxkczogdGhpcy5ncmFwaFFMUXVlcmllcyxcbiAgICAgIH0pO1xuICAgICAgdGhpcy5hZGRHcmFwaFFMVHlwZShncmFwaFFMUXVlcnksIHRydWUsIHRydWUpO1xuICAgIH1cblxuICAgIGxldCBncmFwaFFMTXV0YXRpb24gPSB1bmRlZmluZWQ7XG4gICAgaWYgKE9iamVjdC5rZXlzKHRoaXMuZ3JhcGhRTE11dGF0aW9ucykubGVuZ3RoID4gMCkge1xuICAgICAgZ3JhcGhRTE11dGF0aW9uID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICAgICAgbmFtZTogJ011dGF0aW9uJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdNdXRhdGlvbiBpcyB0aGUgdG9wIGxldmVsIHR5cGUgZm9yIG11dGF0aW9ucy4nLFxuICAgICAgICBmaWVsZHM6IHRoaXMuZ3JhcGhRTE11dGF0aW9ucyxcbiAgICAgIH0pO1xuICAgICAgdGhpcy5hZGRHcmFwaFFMVHlwZShncmFwaFFMTXV0YXRpb24sIHRydWUsIHRydWUpO1xuICAgIH1cblxuICAgIGxldCBncmFwaFFMU3Vic2NyaXB0aW9uID0gdW5kZWZpbmVkO1xuICAgIGlmIChPYmplY3Qua2V5cyh0aGlzLmdyYXBoUUxTdWJzY3JpcHRpb25zKS5sZW5ndGggPiAwKSB7XG4gICAgICBncmFwaFFMU3Vic2NyaXB0aW9uID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICAgICAgbmFtZTogJ1N1YnNjcmlwdGlvbicsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnU3Vic2NyaXB0aW9uIGlzIHRoZSB0b3AgbGV2ZWwgdHlwZSBmb3Igc3Vic2NyaXB0aW9ucy4nLFxuICAgICAgICBmaWVsZHM6IHRoaXMuZ3JhcGhRTFN1YnNjcmlwdGlvbnMsXG4gICAgICB9KTtcbiAgICAgIHRoaXMuYWRkR3JhcGhRTFR5cGUoZ3JhcGhRTFN1YnNjcmlwdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYSA9IG5ldyBHcmFwaFFMU2NoZW1hKHtcbiAgICAgIHR5cGVzOiB0aGlzLmdyYXBoUUxUeXBlcyxcbiAgICAgIHF1ZXJ5OiBncmFwaFFMUXVlcnksXG4gICAgICBtdXRhdGlvbjogZ3JhcGhRTE11dGF0aW9uLFxuICAgICAgc3Vic2NyaXB0aW9uOiBncmFwaFFMU3Vic2NyaXB0aW9uLFxuICAgIH0pO1xuXG4gICAgaWYgKHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzKSB7XG4gICAgICBzY2hlbWFEaXJlY3RpdmVzLmxvYWQodGhpcyk7XG5cbiAgICAgIGlmICh0eXBlb2YgdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMuZ2V0VHlwZU1hcCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAvLyBJbiBmb2xsb3dpbmcgY29kZSB3ZSB1c2UgdW5kZXJzY29yZSBhdHRyIHRvIGF2b2lkIGpzIHZhciB1biByZWZcbiAgICAgICAgY29uc3QgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXAgPSB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcy5fdHlwZU1hcDtcbiAgICAgICAgY29uc3QgZmluZEFuZFJlcGxhY2VMYXN0VHlwZSA9IChwYXJlbnQsIGtleSkgPT4ge1xuICAgICAgICAgIGlmIChwYXJlbnRba2V5XS5uYW1lKSB7XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgIHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuX3R5cGVNYXBbcGFyZW50W2tleV0ubmFtZV0gJiZcbiAgICAgICAgICAgICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYS5fdHlwZU1hcFtwYXJlbnRba2V5XS5uYW1lXSAhPT0gcGFyZW50W2tleV1cbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAvLyBUbyBhdm9pZCB1bnJlc29sdmVkIGZpZWxkIG9uIG92ZXJsb2FkZWQgc2NoZW1hXG4gICAgICAgICAgICAgIC8vIHJlcGxhY2UgdGhlIGZpbmFsIHR5cGUgd2l0aCB0aGUgYXV0byBzY2hlbWEgb25lXG4gICAgICAgICAgICAgIHBhcmVudFtrZXldID0gdGhpcy5ncmFwaFFMQXV0b1NjaGVtYS5fdHlwZU1hcFtwYXJlbnRba2V5XS5uYW1lXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKHBhcmVudFtrZXldLm9mVHlwZSkge1xuICAgICAgICAgICAgICBmaW5kQW5kUmVwbGFjZUxhc3RUeXBlKHBhcmVudFtrZXldLCAnb2ZUeXBlJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICAvLyBBZGQgbm9uIHNoYXJlZCB0eXBlcyBmcm9tIGN1c3RvbSBzY2hlbWEgdG8gYXV0byBzY2hlbWFcbiAgICAgICAgLy8gbm90ZTogc29tZSBub24gc2hhcmVkIHR5cGVzIGNhbiB1c2Ugc29tZSBzaGFyZWQgdHlwZXNcbiAgICAgICAgLy8gc28gdGhpcyBjb2RlIG5lZWQgdG8gYmUgcmFuIGJlZm9yZSB0aGUgc2hhcmVkIHR5cGVzIGFkZGl0aW9uXG4gICAgICAgIC8vIHdlIHVzZSBzb3J0IHRvIGVuc3VyZSBzY2hlbWEgY29uc2lzdGVuY3kgb3ZlciByZXN0YXJ0c1xuICAgICAgICBPYmplY3Qua2V5cyhjdXN0b21HcmFwaFFMU2NoZW1hVHlwZU1hcClcbiAgICAgICAgICAuc29ydCgpXG4gICAgICAgICAgLmZvckVhY2goY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVLZXkgPT4ge1xuICAgICAgICAgICAgY29uc3QgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUgPSBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZU1hcFtjdXN0b21HcmFwaFFMU2NoZW1hVHlwZUtleV07XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICFjdXN0b21HcmFwaFFMU2NoZW1hVHlwZSB8fFxuICAgICAgICAgICAgICAhY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZSB8fFxuICAgICAgICAgICAgICBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lLnN0YXJ0c1dpdGgoJ19fJylcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBhdXRvR3JhcGhRTFNjaGVtYVR5cGUgPSB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLl90eXBlTWFwW1xuICAgICAgICAgICAgICBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lXG4gICAgICAgICAgICBdO1xuICAgICAgICAgICAgaWYgKCFhdXRvR3JhcGhRTFNjaGVtYVR5cGUpIHtcbiAgICAgICAgICAgICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYS5fdHlwZU1hcFtcbiAgICAgICAgICAgICAgICBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lXG4gICAgICAgICAgICAgIF0gPSBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgLy8gSGFuZGxlIHNoYXJlZCB0eXBlc1xuICAgICAgICAvLyBXZSBwYXNzIHRocm91Z2ggZWFjaCB0eXBlIGFuZCBlbnN1cmUgdGhhdCBhbGwgc3ViIGZpZWxkIHR5cGVzIGFyZSByZXBsYWNlZFxuICAgICAgICAvLyB3ZSB1c2Ugc29ydCB0byBlbnN1cmUgc2NoZW1hIGNvbnNpc3RlbmN5IG92ZXIgcmVzdGFydHNcbiAgICAgICAgT2JqZWN0LmtleXMoY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXApXG4gICAgICAgICAgLnNvcnQoKVxuICAgICAgICAgIC5mb3JFYWNoKGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlS2V5ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlID0gY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXBbY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVLZXldO1xuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAhY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUgfHxcbiAgICAgICAgICAgICAgIWN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWUgfHxcbiAgICAgICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZS5zdGFydHNXaXRoKCdfXycpXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYXV0b0dyYXBoUUxTY2hlbWFUeXBlID0gdGhpcy5ncmFwaFFMQXV0b1NjaGVtYS5fdHlwZU1hcFtcbiAgICAgICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZVxuICAgICAgICAgICAgXTtcblxuICAgICAgICAgICAgaWYgKGF1dG9HcmFwaFFMU2NoZW1hVHlwZSAmJiB0eXBlb2YgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUuZ2V0RmllbGRzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgIE9iamVjdC5rZXlzKGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLl9maWVsZHMpXG4gICAgICAgICAgICAgICAgLnNvcnQoKVxuICAgICAgICAgICAgICAgIC5mb3JFYWNoKGZpZWxkS2V5ID0+IHtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IGZpZWxkID0gY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUuX2ZpZWxkc1tmaWVsZEtleV07XG4gICAgICAgICAgICAgICAgICBmaW5kQW5kUmVwbGFjZUxhc3RUeXBlKGZpZWxkLCAndHlwZScpO1xuICAgICAgICAgICAgICAgICAgYXV0b0dyYXBoUUxTY2hlbWFUeXBlLl9maWVsZHNbZmllbGQubmFtZV0gPSBmaWVsZDtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hID0gdGhpcy5ncmFwaFFMQXV0b1NjaGVtYTtcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSA9IGF3YWl0IHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzKHtcbiAgICAgICAgICBkaXJlY3RpdmVzRGVmaW5pdGlvbnNTY2hlbWE6IHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXNEZWZpbml0aW9ucyxcbiAgICAgICAgICBhdXRvU2NoZW1hOiB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLFxuICAgICAgICAgIHN0aXRjaFNjaGVtYXMsXG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hID0gc3RpdGNoU2NoZW1hcyh7XG4gICAgICAgICAgc2NoZW1hczogW1xuICAgICAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zLFxuICAgICAgICAgICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYSxcbiAgICAgICAgICAgIHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLFxuICAgICAgICAgIF0sXG4gICAgICAgICAgbWVyZ2VEaXJlY3RpdmVzOiB0cnVlLFxuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgLy8gT25seSBtZXJnZSBkaXJlY3RpdmUgd2hlbiBzdHJpbmcgc2NoZW1hIHByb3ZpZGVkXG4gICAgICBpZiAodHlwZW9mIHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID09PSAnc3RyaW5nJykge1xuICAgICAgICBjb25zdCBncmFwaFFMU2NoZW1hVHlwZU1hcCA9IHRoaXMuZ3JhcGhRTFNjaGVtYS5nZXRUeXBlTWFwKCk7XG4gICAgICAgIE9iamVjdC5rZXlzKGdyYXBoUUxTY2hlbWFUeXBlTWFwKS5mb3JFYWNoKGdyYXBoUUxTY2hlbWFUeXBlTmFtZSA9PiB7XG4gICAgICAgICAgY29uc3QgZ3JhcGhRTFNjaGVtYVR5cGUgPSBncmFwaFFMU2NoZW1hVHlwZU1hcFtncmFwaFFMU2NoZW1hVHlwZU5hbWVdO1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIHR5cGVvZiBncmFwaFFMU2NoZW1hVHlwZS5nZXRGaWVsZHMgPT09ICdmdW5jdGlvbicgJiZcbiAgICAgICAgICAgIHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLmRlZmluaXRpb25zXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBjb25zdCBncmFwaFFMQ3VzdG9tVHlwZURlZiA9IHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLmRlZmluaXRpb25zLmZpbmQoXG4gICAgICAgICAgICAgIGRlZmluaXRpb24gPT4gZGVmaW5pdGlvbi5uYW1lLnZhbHVlID09PSBncmFwaFFMU2NoZW1hVHlwZU5hbWVcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBpZiAoZ3JhcGhRTEN1c3RvbVR5cGVEZWYpIHtcbiAgICAgICAgICAgICAgY29uc3QgZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE1hcCA9IGdyYXBoUUxTY2hlbWFUeXBlLmdldEZpZWxkcygpO1xuICAgICAgICAgICAgICBPYmplY3Qua2V5cyhncmFwaFFMU2NoZW1hVHlwZUZpZWxkTWFwKS5mb3JFYWNoKGdyYXBoUUxTY2hlbWFUeXBlRmllbGROYW1lID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBncmFwaFFMU2NoZW1hVHlwZUZpZWxkID1cbiAgICAgICAgICAgICAgICAgIGdyYXBoUUxTY2hlbWFUeXBlRmllbGRNYXBbZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE5hbWVdO1xuICAgICAgICAgICAgICAgIGlmICghZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZC5hc3ROb2RlKSB7XG4gICAgICAgICAgICAgICAgICBjb25zdCBhc3ROb2RlID0gZ3JhcGhRTEN1c3RvbVR5cGVEZWYuZmllbGRzLmZpbmQoXG4gICAgICAgICAgICAgICAgICAgIGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09IGdyYXBoUUxTY2hlbWFUeXBlRmllbGROYW1lXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgaWYgKGFzdE5vZGUpIHtcbiAgICAgICAgICAgICAgICAgICAgZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZC5hc3ROb2RlID0gYXN0Tm9kZTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgU2NoZW1hRGlyZWN0aXZlVmlzaXRvci52aXNpdFNjaGVtYURpcmVjdGl2ZXMoXG4gICAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hLFxuICAgICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXNcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hID0gdGhpcy5ncmFwaFFMQXV0b1NjaGVtYTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5ncmFwaFFMU2NoZW1hO1xuICB9XG5cbiAgYWRkR3JhcGhRTFR5cGUodHlwZSwgdGhyb3dFcnJvciA9IGZhbHNlLCBpZ25vcmVSZXNlcnZlZCA9IGZhbHNlLCBpZ25vcmVDb25uZWN0aW9uID0gZmFsc2UpIHtcbiAgICBpZiAoXG4gICAgICAoIWlnbm9yZVJlc2VydmVkICYmIFJFU0VSVkVEX0dSQVBIUUxfVFlQRV9OQU1FUy5pbmNsdWRlcyh0eXBlLm5hbWUpKSB8fFxuICAgICAgdGhpcy5ncmFwaFFMVHlwZXMuZmluZChleGlzdGluZ1R5cGUgPT4gZXhpc3RpbmdUeXBlLm5hbWUgPT09IHR5cGUubmFtZSkgfHxcbiAgICAgICghaWdub3JlQ29ubmVjdGlvbiAmJiB0eXBlLm5hbWUuZW5kc1dpdGgoJ0Nvbm5lY3Rpb24nKSlcbiAgICApIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBgVHlwZSAke3R5cGUubmFtZX0gY291bGQgbm90IGJlIGFkZGVkIHRvIHRoZSBhdXRvIHNjaGVtYSBiZWNhdXNlIGl0IGNvbGxpZGVkIHdpdGggYW4gZXhpc3RpbmcgdHlwZS5gO1xuICAgICAgaWYgKHRocm93RXJyb3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UpO1xuICAgICAgfVxuICAgICAgdGhpcy5sb2cud2FybihtZXNzYWdlKTtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHRoaXMuZ3JhcGhRTFR5cGVzLnB1c2godHlwZSk7XG4gICAgcmV0dXJuIHR5cGU7XG4gIH1cblxuICBhZGRHcmFwaFFMUXVlcnkoZmllbGROYW1lLCBmaWVsZCwgdGhyb3dFcnJvciA9IGZhbHNlLCBpZ25vcmVSZXNlcnZlZCA9IGZhbHNlKSB7XG4gICAgaWYgKFxuICAgICAgKCFpZ25vcmVSZXNlcnZlZCAmJiBSRVNFUlZFRF9HUkFQSFFMX1FVRVJZX05BTUVTLmluY2x1ZGVzKGZpZWxkTmFtZSkpIHx8XG4gICAgICB0aGlzLmdyYXBoUUxRdWVyaWVzW2ZpZWxkTmFtZV1cbiAgICApIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBgUXVlcnkgJHtmaWVsZE5hbWV9IGNvdWxkIG5vdCBiZSBhZGRlZCB0byB0aGUgYXV0byBzY2hlbWEgYmVjYXVzZSBpdCBjb2xsaWRlZCB3aXRoIGFuIGV4aXN0aW5nIGZpZWxkLmA7XG4gICAgICBpZiAodGhyb3dFcnJvcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSk7XG4gICAgICB9XG4gICAgICB0aGlzLmxvZy53YXJuKG1lc3NhZ2UpO1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgdGhpcy5ncmFwaFFMUXVlcmllc1tmaWVsZE5hbWVdID0gZmllbGQ7XG4gICAgcmV0dXJuIGZpZWxkO1xuICB9XG5cbiAgYWRkR3JhcGhRTE11dGF0aW9uKGZpZWxkTmFtZSwgZmllbGQsIHRocm93RXJyb3IgPSBmYWxzZSwgaWdub3JlUmVzZXJ2ZWQgPSBmYWxzZSkge1xuICAgIGlmIChcbiAgICAgICghaWdub3JlUmVzZXJ2ZWQgJiYgUkVTRVJWRURfR1JBUEhRTF9NVVRBVElPTl9OQU1FUy5pbmNsdWRlcyhmaWVsZE5hbWUpKSB8fFxuICAgICAgdGhpcy5ncmFwaFFMTXV0YXRpb25zW2ZpZWxkTmFtZV1cbiAgICApIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBgTXV0YXRpb24gJHtmaWVsZE5hbWV9IGNvdWxkIG5vdCBiZSBhZGRlZCB0byB0aGUgYXV0byBzY2hlbWEgYmVjYXVzZSBpdCBjb2xsaWRlZCB3aXRoIGFuIGV4aXN0aW5nIGZpZWxkLmA7XG4gICAgICBpZiAodGhyb3dFcnJvcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSk7XG4gICAgICB9XG4gICAgICB0aGlzLmxvZy53YXJuKG1lc3NhZ2UpO1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgdGhpcy5ncmFwaFFMTXV0YXRpb25zW2ZpZWxkTmFtZV0gPSBmaWVsZDtcbiAgICByZXR1cm4gZmllbGQ7XG4gIH1cblxuICBoYW5kbGVFcnJvcihlcnJvcikge1xuICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIFBhcnNlLkVycm9yKSB7XG4gICAgICB0aGlzLmxvZy5lcnJvcignUGFyc2UgZXJyb3I6ICcsIGVycm9yKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5sb2cuZXJyb3IoJ1VuY2F1Z2h0IGludGVybmFsIHNlcnZlciBlcnJvci4nLCBlcnJvciwgZXJyb3Iuc3RhY2spO1xuICAgIH1cbiAgICB0aHJvdyB0b0dyYXBoUUxFcnJvcihlcnJvcik7XG4gIH1cblxuICBhc3luYyBfaW5pdGlhbGl6ZVNjaGVtYUFuZENvbmZpZygpIHtcbiAgICBjb25zdCBbc2NoZW1hQ29udHJvbGxlciwgcGFyc2VHcmFwaFFMQ29uZmlnXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgIHRoaXMuZGF0YWJhc2VDb250cm9sbGVyLmxvYWRTY2hlbWEoKSxcbiAgICAgIHRoaXMucGFyc2VHcmFwaFFMQ29udHJvbGxlci5nZXRHcmFwaFFMQ29uZmlnKCksXG4gICAgXSk7XG5cbiAgICB0aGlzLnNjaGVtYUNvbnRyb2xsZXIgPSBzY2hlbWFDb250cm9sbGVyO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHBhcnNlR3JhcGhRTENvbmZpZyxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIEdldHMgYWxsIGNsYXNzZXMgZm91bmQgYnkgdGhlIGBzY2hlbWFDb250cm9sbGVyYFxuICAgKiBtaW51cyB0aG9zZSBmaWx0ZXJlZCBvdXQgYnkgdGhlIGFwcCdzIHBhcnNlR3JhcGhRTENvbmZpZy5cbiAgICovXG4gIGFzeW5jIF9nZXRDbGFzc2VzRm9yU2NoZW1hKHBhcnNlR3JhcGhRTENvbmZpZzogUGFyc2VHcmFwaFFMQ29uZmlnKSB7XG4gICAgY29uc3QgeyBlbmFibGVkRm9yQ2xhc3NlcywgZGlzYWJsZWRGb3JDbGFzc2VzIH0gPSBwYXJzZUdyYXBoUUxDb25maWc7XG4gICAgY29uc3QgYWxsQ2xhc3NlcyA9IGF3YWl0IHRoaXMuc2NoZW1hQ29udHJvbGxlci5nZXRBbGxDbGFzc2VzKCk7XG5cbiAgICBpZiAoQXJyYXkuaXNBcnJheShlbmFibGVkRm9yQ2xhc3NlcykgfHwgQXJyYXkuaXNBcnJheShkaXNhYmxlZEZvckNsYXNzZXMpKSB7XG4gICAgICBsZXQgaW5jbHVkZWRDbGFzc2VzID0gYWxsQ2xhc3NlcztcbiAgICAgIGlmIChlbmFibGVkRm9yQ2xhc3Nlcykge1xuICAgICAgICBpbmNsdWRlZENsYXNzZXMgPSBhbGxDbGFzc2VzLmZpbHRlcihjbGF6eiA9PiB7XG4gICAgICAgICAgcmV0dXJuIGVuYWJsZWRGb3JDbGFzc2VzLmluY2x1ZGVzKGNsYXp6LmNsYXNzTmFtZSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgaWYgKGRpc2FibGVkRm9yQ2xhc3Nlcykge1xuICAgICAgICAvLyBDbGFzc2VzIGluY2x1ZGVkIGluIGBlbmFibGVkRm9yQ2xhc3Nlc2AgdGhhdFxuICAgICAgICAvLyBhcmUgYWxzbyBwcmVzZW50IGluIGBkaXNhYmxlZEZvckNsYXNzZXNgIHdpbGxcbiAgICAgICAgLy8gc3RpbGwgYmUgZmlsdGVyZWQgb3V0XG4gICAgICAgIGluY2x1ZGVkQ2xhc3NlcyA9IGluY2x1ZGVkQ2xhc3Nlcy5maWx0ZXIoY2xhenogPT4ge1xuICAgICAgICAgIHJldHVybiAhZGlzYWJsZWRGb3JDbGFzc2VzLmluY2x1ZGVzKGNsYXp6LmNsYXNzTmFtZSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICB0aGlzLmlzVXNlcnNDbGFzc0Rpc2FibGVkID0gIWluY2x1ZGVkQ2xhc3Nlcy5zb21lKGNsYXp6ID0+IHtcbiAgICAgICAgcmV0dXJuIGNsYXp6LmNsYXNzTmFtZSA9PT0gJ19Vc2VyJztcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gaW5jbHVkZWRDbGFzc2VzO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gYWxsQ2xhc3NlcztcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVGhpcyBtZXRob2QgcmV0dXJucyBhIGxpc3Qgb2YgdHVwbGVzXG4gICAqIHRoYXQgcHJvdmlkZSB0aGUgcGFyc2VDbGFzcyBhbG9uZyB3aXRoXG4gICAqIGl0cyBwYXJzZUNsYXNzQ29uZmlnIHdoZXJlIHByb3ZpZGVkLlxuICAgKi9cbiAgX2dldFBhcnNlQ2xhc3Nlc1dpdGhDb25maWcocGFyc2VDbGFzc2VzLCBwYXJzZUdyYXBoUUxDb25maWc6IFBhcnNlR3JhcGhRTENvbmZpZykge1xuICAgIGNvbnN0IHsgY2xhc3NDb25maWdzIH0gPSBwYXJzZUdyYXBoUUxDb25maWc7XG5cbiAgICAvLyBNYWtlIHN1cmVzIHRoYXQgdGhlIGRlZmF1bHQgY2xhc3NlcyBhbmQgY2xhc3NlcyB0aGF0XG4gICAgLy8gc3RhcnRzIHdpdGggY2FwaXRhbGl6ZWQgbGV0dGVyIHdpbGwgYmUgZ2VuZXJhdGVkIGZpcnN0LlxuICAgIGNvbnN0IHNvcnRDbGFzc2VzID0gKGEsIGIpID0+IHtcbiAgICAgIGEgPSBhLmNsYXNzTmFtZTtcbiAgICAgIGIgPSBiLmNsYXNzTmFtZTtcbiAgICAgIGlmIChhWzBdID09PSAnXycpIHtcbiAgICAgICAgaWYgKGJbMF0gIT09ICdfJykge1xuICAgICAgICAgIHJldHVybiAtMTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGJbMF0gPT09ICdfJykge1xuICAgICAgICBpZiAoYVswXSAhPT0gJ18nKSB7XG4gICAgICAgICAgcmV0dXJuIDE7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChhID09PSBiKSB7XG4gICAgICAgIHJldHVybiAwO1xuICAgICAgfSBlbHNlIGlmIChhIDwgYikge1xuICAgICAgICByZXR1cm4gLTE7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gMTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgcmV0dXJuIHBhcnNlQ2xhc3Nlcy5zb3J0KHNvcnRDbGFzc2VzKS5tYXAocGFyc2VDbGFzcyA9PiB7XG4gICAgICBsZXQgcGFyc2VDbGFzc0NvbmZpZztcbiAgICAgIGlmIChjbGFzc0NvbmZpZ3MpIHtcbiAgICAgICAgcGFyc2VDbGFzc0NvbmZpZyA9IGNsYXNzQ29uZmlncy5maW5kKGMgPT4gYy5jbGFzc05hbWUgPT09IHBhcnNlQ2xhc3MuY2xhc3NOYW1lKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBbcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZ107XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBfZ2V0RnVuY3Rpb25OYW1lcygpIHtcbiAgICByZXR1cm4gYXdhaXQgZ2V0RnVuY3Rpb25OYW1lcyh0aGlzLmFwcElkKS5maWx0ZXIoZnVuY3Rpb25OYW1lID0+IHtcbiAgICAgIGlmICgvXltfYS16QS1aXVtfYS16QS1aMC05XSokLy50ZXN0KGZ1bmN0aW9uTmFtZSkpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmxvZy53YXJuKFxuICAgICAgICAgIGBGdW5jdGlvbiAke2Z1bmN0aW9uTmFtZX0gY291bGQgbm90IGJlIGFkZGVkIHRvIHRoZSBhdXRvIHNjaGVtYSBiZWNhdXNlIEdyYXBoUUwgbmFtZXMgbXVzdCBtYXRjaCAvXltfYS16QS1aXVtfYS16QS1aMC05XSokLy5gXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVja3MgZm9yIGNoYW5nZXMgdG8gdGhlIHBhcnNlQ2xhc3Nlc1xuICAgKiBvYmplY3RzIChpLmUuIGRhdGFiYXNlIHNjaGVtYSkgb3IgdG9cbiAgICogdGhlIHBhcnNlR3JhcGhRTENvbmZpZyBvYmplY3QuIElmIG5vXG4gICAqIGNoYW5nZXMgYXJlIGZvdW5kLCByZXR1cm4gdHJ1ZTtcbiAgICovXG4gIF9oYXNTY2hlbWFJbnB1dENoYW5nZWQocGFyYW1zOiB7XG4gICAgcGFyc2VDbGFzc2VzOiBhbnksXG4gICAgcGFyc2VDbGFzc2VzU3RyaW5nOiBzdHJpbmcsXG4gICAgcGFyc2VHcmFwaFFMQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ29uZmlnLFxuICAgIGZ1bmN0aW9uTmFtZXNTdHJpbmc6IHN0cmluZyxcbiAgfSk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IHsgcGFyc2VDbGFzc2VzLCBwYXJzZUNsYXNzZXNTdHJpbmcsIHBhcnNlR3JhcGhRTENvbmZpZywgZnVuY3Rpb25OYW1lc1N0cmluZyB9ID0gcGFyYW1zO1xuXG4gICAgaWYgKFxuICAgICAgSlNPTi5zdHJpbmdpZnkodGhpcy5wYXJzZUdyYXBoUUxDb25maWcpID09PSBKU09OLnN0cmluZ2lmeShwYXJzZUdyYXBoUUxDb25maWcpICYmXG4gICAgICB0aGlzLmZ1bmN0aW9uTmFtZXNTdHJpbmcgPT09IGZ1bmN0aW9uTmFtZXNTdHJpbmdcbiAgICApIHtcbiAgICAgIGlmICh0aGlzLnBhcnNlQ2xhc3NlcyA9PT0gcGFyc2VDbGFzc2VzKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMucGFyc2VDbGFzc2VzU3RyaW5nID09PSBwYXJzZUNsYXNzZXNTdHJpbmcpIHtcbiAgICAgICAgdGhpcy5wYXJzZUNsYXNzZXMgPSBwYXJzZUNsYXNzZXM7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxufVxuXG5leHBvcnQgeyBQYXJzZUdyYXBoUUxTY2hlbWEgfTtcbiJdfQ==