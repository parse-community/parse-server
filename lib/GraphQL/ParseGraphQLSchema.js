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


        Object.values(customGraphQLSchemaTypeMap).forEach(customGraphQLSchemaType => {
          if (!customGraphQLSchemaType || !customGraphQLSchemaType.name || customGraphQLSchemaType.name.startsWith('__')) {
            return;
          }

          const autoGraphQLSchemaType = this.graphQLAutoSchema._typeMap[customGraphQLSchemaType.name];

          if (!autoGraphQLSchemaType) {
            this.graphQLAutoSchema._typeMap[customGraphQLSchemaType.name] = customGraphQLSchemaType;
          }
        }); // Handle shared types
        // We pass through each type and ensure that all sub field types are replaced
        // with a

        Object.values(customGraphQLSchemaTypeMap).forEach(customGraphQLSchemaType => {
          if (!customGraphQLSchemaType || !customGraphQLSchemaType.name || customGraphQLSchemaType.name.startsWith('__')) {
            return;
          }

          const autoGraphQLSchemaType = this.graphQLAutoSchema._typeMap[customGraphQLSchemaType.name];

          if (autoGraphQLSchemaType && typeof customGraphQLSchemaType.getFields === 'function') {
            Object.values(customGraphQLSchemaType._fields).forEach(field => {
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
      }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9HcmFwaFFML1BhcnNlR3JhcGhRTFNjaGVtYS5qcyJdLCJuYW1lcyI6WyJSRVNFUlZFRF9HUkFQSFFMX1RZUEVfTkFNRVMiLCJSRVNFUlZFRF9HUkFQSFFMX1FVRVJZX05BTUVTIiwiUkVTRVJWRURfR1JBUEhRTF9NVVRBVElPTl9OQU1FUyIsIlBhcnNlR3JhcGhRTFNjaGVtYSIsImNvbnN0cnVjdG9yIiwicGFyYW1zIiwicGFyc2VHcmFwaFFMQ29udHJvbGxlciIsImRhdGFiYXNlQ29udHJvbGxlciIsImxvZyIsImdyYXBoUUxDdXN0b21UeXBlRGVmcyIsImFwcElkIiwic2NoZW1hQ2FjaGUiLCJTY2hlbWFDYWNoZSIsImxvYWQiLCJwYXJzZUdyYXBoUUxDb25maWciLCJfaW5pdGlhbGl6ZVNjaGVtYUFuZENvbmZpZyIsInBhcnNlQ2xhc3NlcyIsIl9nZXRDbGFzc2VzRm9yU2NoZW1hIiwicGFyc2VDbGFzc2VzU3RyaW5nIiwiSlNPTiIsInN0cmluZ2lmeSIsImZ1bmN0aW9uTmFtZXMiLCJfZ2V0RnVuY3Rpb25OYW1lcyIsImZ1bmN0aW9uTmFtZXNTdHJpbmciLCJncmFwaFFMU2NoZW1hIiwiX2hhc1NjaGVtYUlucHV0Q2hhbmdlZCIsInBhcnNlQ2xhc3NUeXBlcyIsInZpZXdlclR5cGUiLCJncmFwaFFMQXV0b1NjaGVtYSIsImdyYXBoUUxUeXBlcyIsImdyYXBoUUxRdWVyaWVzIiwiZ3JhcGhRTE11dGF0aW9ucyIsImdyYXBoUUxTdWJzY3JpcHRpb25zIiwiZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXNEZWZpbml0aW9ucyIsImdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzIiwicmVsYXlOb2RlSW50ZXJmYWNlIiwiZGVmYXVsdEdyYXBoUUxUeXBlcyIsImRlZmF1bHRSZWxheVNjaGVtYSIsInNjaGVtYVR5cGVzIiwiX2dldFBhcnNlQ2xhc3Nlc1dpdGhDb25maWciLCJmb3JFYWNoIiwicGFyc2VDbGFzcyIsInBhcnNlQ2xhc3NDb25maWciLCJwYXJzZUNsYXNzUXVlcmllcyIsInBhcnNlQ2xhc3NNdXRhdGlvbnMiLCJsb2FkQXJyYXlSZXN1bHQiLCJkZWZhdWx0R3JhcGhRTFF1ZXJpZXMiLCJkZWZhdWx0R3JhcGhRTE11dGF0aW9ucyIsImdyYXBoUUxRdWVyeSIsInVuZGVmaW5lZCIsIk9iamVjdCIsImtleXMiLCJsZW5ndGgiLCJHcmFwaFFMT2JqZWN0VHlwZSIsIm5hbWUiLCJkZXNjcmlwdGlvbiIsImZpZWxkcyIsImFkZEdyYXBoUUxUeXBlIiwiZ3JhcGhRTE11dGF0aW9uIiwiZ3JhcGhRTFN1YnNjcmlwdGlvbiIsIkdyYXBoUUxTY2hlbWEiLCJ0eXBlcyIsInF1ZXJ5IiwibXV0YXRpb24iLCJzdWJzY3JpcHRpb24iLCJzY2hlbWFEaXJlY3RpdmVzIiwiZ2V0VHlwZU1hcCIsImN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlTWFwIiwiX3R5cGVNYXAiLCJmaW5kQW5kUmVwbGFjZUxhc3RUeXBlIiwicGFyZW50Iiwia2V5Iiwib2ZUeXBlIiwidmFsdWVzIiwiY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUiLCJzdGFydHNXaXRoIiwiYXV0b0dyYXBoUUxTY2hlbWFUeXBlIiwiZ2V0RmllbGRzIiwiX2ZpZWxkcyIsImZpZWxkIiwiZGlyZWN0aXZlc0RlZmluaXRpb25zU2NoZW1hIiwiYXV0b1NjaGVtYSIsInN0aXRjaFNjaGVtYXMiLCJzY2hlbWFzIiwibWVyZ2VEaXJlY3RpdmVzIiwiZ3JhcGhRTFNjaGVtYVR5cGVNYXAiLCJncmFwaFFMU2NoZW1hVHlwZU5hbWUiLCJncmFwaFFMU2NoZW1hVHlwZSIsImRlZmluaXRpb25zIiwiZ3JhcGhRTEN1c3RvbVR5cGVEZWYiLCJmaW5kIiwiZGVmaW5pdGlvbiIsInZhbHVlIiwiZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE1hcCIsImdyYXBoUUxTY2hlbWFUeXBlRmllbGROYW1lIiwiZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZCIsImFzdE5vZGUiLCJTY2hlbWFEaXJlY3RpdmVWaXNpdG9yIiwidmlzaXRTY2hlbWFEaXJlY3RpdmVzIiwidHlwZSIsInRocm93RXJyb3IiLCJpZ25vcmVSZXNlcnZlZCIsImlnbm9yZUNvbm5lY3Rpb24iLCJpbmNsdWRlcyIsImV4aXN0aW5nVHlwZSIsImVuZHNXaXRoIiwibWVzc2FnZSIsIkVycm9yIiwid2FybiIsInB1c2giLCJhZGRHcmFwaFFMUXVlcnkiLCJmaWVsZE5hbWUiLCJhZGRHcmFwaFFMTXV0YXRpb24iLCJoYW5kbGVFcnJvciIsImVycm9yIiwiUGFyc2UiLCJzdGFjayIsInNjaGVtYUNvbnRyb2xsZXIiLCJQcm9taXNlIiwiYWxsIiwibG9hZFNjaGVtYSIsImdldEdyYXBoUUxDb25maWciLCJlbmFibGVkRm9yQ2xhc3NlcyIsImRpc2FibGVkRm9yQ2xhc3NlcyIsImFsbENsYXNzZXMiLCJnZXRBbGxDbGFzc2VzIiwiQXJyYXkiLCJpc0FycmF5IiwiaW5jbHVkZWRDbGFzc2VzIiwiZmlsdGVyIiwiY2xhenoiLCJjbGFzc05hbWUiLCJpc1VzZXJzQ2xhc3NEaXNhYmxlZCIsInNvbWUiLCJjbGFzc0NvbmZpZ3MiLCJzb3J0Q2xhc3NlcyIsImEiLCJiIiwic29ydCIsIm1hcCIsImMiLCJmdW5jdGlvbk5hbWUiLCJ0ZXN0Il0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBRUEsTUFBTUEsMkJBQTJCLEdBQUcsQ0FDbEMsUUFEa0MsRUFFbEMsU0FGa0MsRUFHbEMsS0FIa0MsRUFJbEMsT0FKa0MsRUFLbEMsSUFMa0MsRUFNbEMsYUFOa0MsRUFPbEMsT0FQa0MsRUFRbEMsVUFSa0MsRUFTbEMsY0FUa0MsRUFVbEMsaUJBVmtDLEVBV2xDLG1CQVhrQyxFQVlsQyxRQVprQyxFQWFsQyxhQWJrQyxFQWNsQyxlQWRrQyxFQWVsQyxZQWZrQyxFQWdCbEMsY0FoQmtDLEVBaUJsQyxhQWpCa0MsRUFrQmxDLGVBbEJrQyxFQW1CbEMsbUJBbkJrQyxFQW9CbEMsb0JBcEJrQyxFQXFCbEMsc0JBckJrQyxFQXNCbEMsa0JBdEJrQyxFQXVCbEMsb0JBdkJrQyxFQXdCbEMsa0JBeEJrQyxFQXlCbEMsb0JBekJrQyxFQTBCbEMsa0JBMUJrQyxFQTJCbEMsb0JBM0JrQyxFQTRCbEMsVUE1QmtDLENBQXBDO0FBOEJBLE1BQU1DLDRCQUE0QixHQUFHLENBQUMsUUFBRCxFQUFXLFFBQVgsRUFBcUIsT0FBckIsRUFBOEIsU0FBOUIsQ0FBckM7QUFDQSxNQUFNQywrQkFBK0IsR0FBRyxDQUN0QyxRQURzQyxFQUV0QyxPQUZzQyxFQUd0QyxRQUhzQyxFQUl0QyxZQUpzQyxFQUt0QyxlQUxzQyxFQU10QyxhQU5zQyxFQU90QyxhQVBzQyxFQVF0QyxhQVJzQyxDQUF4Qzs7QUFXQSxNQUFNQyxrQkFBTixDQUF5QjtBQVN2QkMsRUFBQUEsV0FBVyxDQUNUQyxNQU1DLEdBQUcsRUFQSyxFQVFUO0FBQ0EsU0FBS0Msc0JBQUwsR0FDRUQsTUFBTSxDQUFDQyxzQkFBUCxJQUNBLGdDQUFrQixxREFBbEIsQ0FGRjtBQUdBLFNBQUtDLGtCQUFMLEdBQ0VGLE1BQU0sQ0FBQ0Usa0JBQVAsSUFDQSxnQ0FBa0IsaURBQWxCLENBRkY7QUFHQSxTQUFLQyxHQUFMLEdBQVdILE1BQU0sQ0FBQ0csR0FBUCxJQUFjLGdDQUFrQixrQ0FBbEIsQ0FBekI7QUFDQSxTQUFLQyxxQkFBTCxHQUE2QkosTUFBTSxDQUFDSSxxQkFBcEM7QUFDQSxTQUFLQyxLQUFMLEdBQWFMLE1BQU0sQ0FBQ0ssS0FBUCxJQUFnQixnQ0FBa0IsNkJBQWxCLENBQTdCO0FBQ0EsU0FBS0MsV0FBTCxHQUFtQkMsb0JBQW5CO0FBQ0Q7O0FBRVMsUUFBSkMsSUFBSSxHQUFHO0FBQ1gsVUFBTTtBQUFFQyxNQUFBQTtBQUFGLFFBQXlCLE1BQU0sS0FBS0MsMEJBQUwsRUFBckM7QUFDQSxVQUFNQyxZQUFZLEdBQUcsTUFBTSxLQUFLQyxvQkFBTCxDQUEwQkgsa0JBQTFCLENBQTNCO0FBQ0EsVUFBTUksa0JBQWtCLEdBQUdDLElBQUksQ0FBQ0MsU0FBTCxDQUFlSixZQUFmLENBQTNCO0FBQ0EsVUFBTUssYUFBYSxHQUFHLE1BQU0sS0FBS0MsaUJBQUwsRUFBNUI7QUFDQSxVQUFNQyxtQkFBbUIsR0FBR0osSUFBSSxDQUFDQyxTQUFMLENBQWVDLGFBQWYsQ0FBNUI7O0FBRUEsUUFDRSxLQUFLRyxhQUFMLElBQ0EsQ0FBQyxLQUFLQyxzQkFBTCxDQUE0QjtBQUMzQlQsTUFBQUEsWUFEMkI7QUFFM0JFLE1BQUFBLGtCQUYyQjtBQUczQkosTUFBQUEsa0JBSDJCO0FBSTNCUyxNQUFBQTtBQUoyQixLQUE1QixDQUZILEVBUUU7QUFDQSxhQUFPLEtBQUtDLGFBQVo7QUFDRDs7QUFFRCxTQUFLUixZQUFMLEdBQW9CQSxZQUFwQjtBQUNBLFNBQUtFLGtCQUFMLEdBQTBCQSxrQkFBMUI7QUFDQSxTQUFLSixrQkFBTCxHQUEwQkEsa0JBQTFCO0FBQ0EsU0FBS08sYUFBTCxHQUFxQkEsYUFBckI7QUFDQSxTQUFLRSxtQkFBTCxHQUEyQkEsbUJBQTNCO0FBQ0EsU0FBS0csZUFBTCxHQUF1QixFQUF2QjtBQUNBLFNBQUtDLFVBQUwsR0FBa0IsSUFBbEI7QUFDQSxTQUFLQyxpQkFBTCxHQUF5QixJQUF6QjtBQUNBLFNBQUtKLGFBQUwsR0FBcUIsSUFBckI7QUFDQSxTQUFLSyxZQUFMLEdBQW9CLEVBQXBCO0FBQ0EsU0FBS0MsY0FBTCxHQUFzQixFQUF0QjtBQUNBLFNBQUtDLGdCQUFMLEdBQXdCLEVBQXhCO0FBQ0EsU0FBS0Msb0JBQUwsR0FBNEIsRUFBNUI7QUFDQSxTQUFLQyxrQ0FBTCxHQUEwQyxJQUExQztBQUNBLFNBQUtDLHVCQUFMLEdBQStCLEVBQS9CO0FBQ0EsU0FBS0Msa0JBQUwsR0FBMEIsSUFBMUI7QUFFQUMsSUFBQUEsbUJBQW1CLENBQUN2QixJQUFwQixDQUF5QixJQUF6QjtBQUNBd0IsSUFBQUEsa0JBQWtCLENBQUN4QixJQUFuQixDQUF3QixJQUF4QjtBQUNBeUIsSUFBQUEsV0FBVyxDQUFDekIsSUFBWixDQUFpQixJQUFqQjs7QUFFQSxTQUFLMEIsMEJBQUwsQ0FBZ0N2QixZQUFoQyxFQUE4Q0Ysa0JBQTlDLEVBQWtFMEIsT0FBbEUsQ0FDRSxDQUFDLENBQUNDLFVBQUQsRUFBYUMsZ0JBQWIsQ0FBRCxLQUFvQztBQUNsQ2hCLE1BQUFBLGVBQWUsQ0FBQ2IsSUFBaEIsQ0FBcUIsSUFBckIsRUFBMkI0QixVQUEzQixFQUF1Q0MsZ0JBQXZDO0FBQ0FDLE1BQUFBLGlCQUFpQixDQUFDOUIsSUFBbEIsQ0FBdUIsSUFBdkIsRUFBNkI0QixVQUE3QixFQUF5Q0MsZ0JBQXpDO0FBQ0FFLE1BQUFBLG1CQUFtQixDQUFDL0IsSUFBcEIsQ0FBeUIsSUFBekIsRUFBK0I0QixVQUEvQixFQUEyQ0MsZ0JBQTNDO0FBQ0QsS0FMSDs7QUFRQU4sSUFBQUEsbUJBQW1CLENBQUNTLGVBQXBCLENBQW9DLElBQXBDLEVBQTBDN0IsWUFBMUM7QUFDQThCLElBQUFBLHFCQUFxQixDQUFDakMsSUFBdEIsQ0FBMkIsSUFBM0I7QUFDQWtDLElBQUFBLHVCQUF1QixDQUFDbEMsSUFBeEIsQ0FBNkIsSUFBN0I7QUFFQSxRQUFJbUMsWUFBWSxHQUFHQyxTQUFuQjs7QUFDQSxRQUFJQyxNQUFNLENBQUNDLElBQVAsQ0FBWSxLQUFLckIsY0FBakIsRUFBaUNzQixNQUFqQyxHQUEwQyxDQUE5QyxFQUFpRDtBQUMvQ0osTUFBQUEsWUFBWSxHQUFHLElBQUlLLDBCQUFKLENBQXNCO0FBQ25DQyxRQUFBQSxJQUFJLEVBQUUsT0FENkI7QUFFbkNDLFFBQUFBLFdBQVcsRUFBRSwwQ0FGc0I7QUFHbkNDLFFBQUFBLE1BQU0sRUFBRSxLQUFLMUI7QUFIc0IsT0FBdEIsQ0FBZjtBQUtBLFdBQUsyQixjQUFMLENBQW9CVCxZQUFwQixFQUFrQyxJQUFsQyxFQUF3QyxJQUF4QztBQUNEOztBQUVELFFBQUlVLGVBQWUsR0FBR1QsU0FBdEI7O0FBQ0EsUUFBSUMsTUFBTSxDQUFDQyxJQUFQLENBQVksS0FBS3BCLGdCQUFqQixFQUFtQ3FCLE1BQW5DLEdBQTRDLENBQWhELEVBQW1EO0FBQ2pETSxNQUFBQSxlQUFlLEdBQUcsSUFBSUwsMEJBQUosQ0FBc0I7QUFDdENDLFFBQUFBLElBQUksRUFBRSxVQURnQztBQUV0Q0MsUUFBQUEsV0FBVyxFQUFFLCtDQUZ5QjtBQUd0Q0MsUUFBQUEsTUFBTSxFQUFFLEtBQUt6QjtBQUh5QixPQUF0QixDQUFsQjtBQUtBLFdBQUswQixjQUFMLENBQW9CQyxlQUFwQixFQUFxQyxJQUFyQyxFQUEyQyxJQUEzQztBQUNEOztBQUVELFFBQUlDLG1CQUFtQixHQUFHVixTQUExQjs7QUFDQSxRQUFJQyxNQUFNLENBQUNDLElBQVAsQ0FBWSxLQUFLbkIsb0JBQWpCLEVBQXVDb0IsTUFBdkMsR0FBZ0QsQ0FBcEQsRUFBdUQ7QUFDckRPLE1BQUFBLG1CQUFtQixHQUFHLElBQUlOLDBCQUFKLENBQXNCO0FBQzFDQyxRQUFBQSxJQUFJLEVBQUUsY0FEb0M7QUFFMUNDLFFBQUFBLFdBQVcsRUFBRSx1REFGNkI7QUFHMUNDLFFBQUFBLE1BQU0sRUFBRSxLQUFLeEI7QUFINkIsT0FBdEIsQ0FBdEI7QUFLQSxXQUFLeUIsY0FBTCxDQUFvQkUsbUJBQXBCLEVBQXlDLElBQXpDLEVBQStDLElBQS9DO0FBQ0Q7O0FBRUQsU0FBSy9CLGlCQUFMLEdBQXlCLElBQUlnQyxzQkFBSixDQUFrQjtBQUN6Q0MsTUFBQUEsS0FBSyxFQUFFLEtBQUtoQyxZQUQ2QjtBQUV6Q2lDLE1BQUFBLEtBQUssRUFBRWQsWUFGa0M7QUFHekNlLE1BQUFBLFFBQVEsRUFBRUwsZUFIK0I7QUFJekNNLE1BQUFBLFlBQVksRUFBRUw7QUFKMkIsS0FBbEIsQ0FBekI7O0FBT0EsUUFBSSxLQUFLbEQscUJBQVQsRUFBZ0M7QUFDOUJ3RCxNQUFBQSxnQkFBZ0IsQ0FBQ3BELElBQWpCLENBQXNCLElBQXRCOztBQUVBLFVBQUksT0FBTyxLQUFLSixxQkFBTCxDQUEyQnlELFVBQWxDLEtBQWlELFVBQXJELEVBQWlFO0FBQy9EO0FBQ0EsY0FBTUMsMEJBQTBCLEdBQUcsS0FBSzFELHFCQUFMLENBQTJCMkQsUUFBOUQ7O0FBQ0EsY0FBTUMsc0JBQXNCLEdBQUcsQ0FBQ0MsTUFBRCxFQUFTQyxHQUFULEtBQWlCO0FBQzlDLGNBQUlELE1BQU0sQ0FBQ0MsR0FBRCxDQUFOLENBQVlqQixJQUFoQixFQUFzQjtBQUNwQixnQkFDRSxLQUFLMUIsaUJBQUwsQ0FBdUJ3QyxRQUF2QixDQUFnQ0UsTUFBTSxDQUFDQyxHQUFELENBQU4sQ0FBWWpCLElBQTVDLEtBQ0EsS0FBSzFCLGlCQUFMLENBQXVCd0MsUUFBdkIsQ0FBZ0NFLE1BQU0sQ0FBQ0MsR0FBRCxDQUFOLENBQVlqQixJQUE1QyxNQUFzRGdCLE1BQU0sQ0FBQ0MsR0FBRCxDQUY5RCxFQUdFO0FBQ0E7QUFDQTtBQUNBRCxjQUFBQSxNQUFNLENBQUNDLEdBQUQsQ0FBTixHQUFjLEtBQUszQyxpQkFBTCxDQUF1QndDLFFBQXZCLENBQWdDRSxNQUFNLENBQUNDLEdBQUQsQ0FBTixDQUFZakIsSUFBNUMsQ0FBZDtBQUNEO0FBQ0YsV0FURCxNQVNPO0FBQ0wsZ0JBQUlnQixNQUFNLENBQUNDLEdBQUQsQ0FBTixDQUFZQyxNQUFoQixFQUF3QjtBQUN0QkgsY0FBQUEsc0JBQXNCLENBQUNDLE1BQU0sQ0FBQ0MsR0FBRCxDQUFQLEVBQWMsUUFBZCxDQUF0QjtBQUNEO0FBQ0Y7QUFDRixTQWZELENBSCtELENBbUIvRDtBQUNBO0FBQ0E7OztBQUNBckIsUUFBQUEsTUFBTSxDQUFDdUIsTUFBUCxDQUFjTiwwQkFBZCxFQUEwQzNCLE9BQTFDLENBQWtEa0MsdUJBQXVCLElBQUk7QUFDM0UsY0FDRSxDQUFDQSx1QkFBRCxJQUNBLENBQUNBLHVCQUF1QixDQUFDcEIsSUFEekIsSUFFQW9CLHVCQUF1QixDQUFDcEIsSUFBeEIsQ0FBNkJxQixVQUE3QixDQUF3QyxJQUF4QyxDQUhGLEVBSUU7QUFDQTtBQUNEOztBQUNELGdCQUFNQyxxQkFBcUIsR0FBRyxLQUFLaEQsaUJBQUwsQ0FBdUJ3QyxRQUF2QixDQUM1Qk0sdUJBQXVCLENBQUNwQixJQURJLENBQTlCOztBQUdBLGNBQUksQ0FBQ3NCLHFCQUFMLEVBQTRCO0FBQzFCLGlCQUFLaEQsaUJBQUwsQ0FBdUJ3QyxRQUF2QixDQUFnQ00sdUJBQXVCLENBQUNwQixJQUF4RCxJQUFnRW9CLHVCQUFoRTtBQUNEO0FBQ0YsU0FkRCxFQXRCK0QsQ0FxQy9EO0FBQ0E7QUFDQTs7QUFDQXhCLFFBQUFBLE1BQU0sQ0FBQ3VCLE1BQVAsQ0FBY04sMEJBQWQsRUFBMEMzQixPQUExQyxDQUFrRGtDLHVCQUF1QixJQUFJO0FBQzNFLGNBQ0UsQ0FBQ0EsdUJBQUQsSUFDQSxDQUFDQSx1QkFBdUIsQ0FBQ3BCLElBRHpCLElBRUFvQix1QkFBdUIsQ0FBQ3BCLElBQXhCLENBQTZCcUIsVUFBN0IsQ0FBd0MsSUFBeEMsQ0FIRixFQUlFO0FBQ0E7QUFDRDs7QUFDRCxnQkFBTUMscUJBQXFCLEdBQUcsS0FBS2hELGlCQUFMLENBQXVCd0MsUUFBdkIsQ0FDNUJNLHVCQUF1QixDQUFDcEIsSUFESSxDQUE5Qjs7QUFJQSxjQUFJc0IscUJBQXFCLElBQUksT0FBT0YsdUJBQXVCLENBQUNHLFNBQS9CLEtBQTZDLFVBQTFFLEVBQXNGO0FBQ3BGM0IsWUFBQUEsTUFBTSxDQUFDdUIsTUFBUCxDQUFjQyx1QkFBdUIsQ0FBQ0ksT0FBdEMsRUFBK0N0QyxPQUEvQyxDQUF1RHVDLEtBQUssSUFBSTtBQUM5RFYsY0FBQUEsc0JBQXNCLENBQUNVLEtBQUQsRUFBUSxNQUFSLENBQXRCO0FBQ0FILGNBQUFBLHFCQUFxQixDQUFDRSxPQUF0QixDQUE4QkMsS0FBSyxDQUFDekIsSUFBcEMsSUFBNEN5QixLQUE1QztBQUNELGFBSEQ7QUFJRDtBQUNGLFNBbEJEO0FBbUJBLGFBQUt2RCxhQUFMLEdBQXFCLEtBQUtJLGlCQUExQjtBQUNELE9BNURELE1BNERPLElBQUksT0FBTyxLQUFLbkIscUJBQVosS0FBc0MsVUFBMUMsRUFBc0Q7QUFDM0QsYUFBS2UsYUFBTCxHQUFxQixNQUFNLEtBQUtmLHFCQUFMLENBQTJCO0FBQ3BEdUUsVUFBQUEsMkJBQTJCLEVBQUUsS0FBSy9DLGtDQURrQjtBQUVwRGdELFVBQUFBLFVBQVUsRUFBRSxLQUFLckQsaUJBRm1DO0FBR3BEc0QsVUFBQUEsYUFBYSxFQUFiQTtBQUhvRCxTQUEzQixDQUEzQjtBQUtELE9BTk0sTUFNQTtBQUNMLGFBQUsxRCxhQUFMLEdBQXFCLDJCQUFjO0FBQ2pDMkQsVUFBQUEsT0FBTyxFQUFFLENBQ1AsS0FBS2xELGtDQURFLEVBRVAsS0FBS0wsaUJBRkUsRUFHUCxLQUFLbkIscUJBSEUsQ0FEd0I7QUFNakMyRSxVQUFBQSxlQUFlLEVBQUU7QUFOZ0IsU0FBZCxDQUFyQjtBQVFEOztBQUVELFlBQU1DLG9CQUFvQixHQUFHLEtBQUs3RCxhQUFMLENBQW1CMEMsVUFBbkIsRUFBN0I7QUFDQWhCLE1BQUFBLE1BQU0sQ0FBQ0MsSUFBUCxDQUFZa0Msb0JBQVosRUFBa0M3QyxPQUFsQyxDQUEwQzhDLHFCQUFxQixJQUFJO0FBQ2pFLGNBQU1DLGlCQUFpQixHQUFHRixvQkFBb0IsQ0FBQ0MscUJBQUQsQ0FBOUM7O0FBQ0EsWUFDRSxPQUFPQyxpQkFBaUIsQ0FBQ1YsU0FBekIsS0FBdUMsVUFBdkMsSUFDQSxLQUFLcEUscUJBQUwsQ0FBMkIrRSxXQUY3QixFQUdFO0FBQ0EsZ0JBQU1DLG9CQUFvQixHQUFHLEtBQUtoRixxQkFBTCxDQUEyQitFLFdBQTNCLENBQXVDRSxJQUF2QyxDQUMzQkMsVUFBVSxJQUFJQSxVQUFVLENBQUNyQyxJQUFYLENBQWdCc0MsS0FBaEIsS0FBMEJOLHFCQURiLENBQTdCOztBQUdBLGNBQUlHLG9CQUFKLEVBQTBCO0FBQ3hCLGtCQUFNSSx5QkFBeUIsR0FBR04saUJBQWlCLENBQUNWLFNBQWxCLEVBQWxDO0FBQ0EzQixZQUFBQSxNQUFNLENBQUNDLElBQVAsQ0FBWTBDLHlCQUFaLEVBQXVDckQsT0FBdkMsQ0FBK0NzRCwwQkFBMEIsSUFBSTtBQUMzRSxvQkFBTUMsc0JBQXNCLEdBQUdGLHlCQUF5QixDQUFDQywwQkFBRCxDQUF4RDs7QUFDQSxrQkFBSSxDQUFDQyxzQkFBc0IsQ0FBQ0MsT0FBNUIsRUFBcUM7QUFDbkMsc0JBQU1BLE9BQU8sR0FBR1Asb0JBQW9CLENBQUNqQyxNQUFyQixDQUE0QmtDLElBQTVCLENBQ2RYLEtBQUssSUFBSUEsS0FBSyxDQUFDekIsSUFBTixDQUFXc0MsS0FBWCxLQUFxQkUsMEJBRGhCLENBQWhCOztBQUdBLG9CQUFJRSxPQUFKLEVBQWE7QUFDWEQsa0JBQUFBLHNCQUFzQixDQUFDQyxPQUF2QixHQUFpQ0EsT0FBakM7QUFDRDtBQUNGO0FBQ0YsYUFWRDtBQVdEO0FBQ0Y7QUFDRixPQXhCRDs7QUEwQkFDLG9DQUF1QkMscUJBQXZCLENBQ0UsS0FBSzFFLGFBRFAsRUFFRSxLQUFLVSx1QkFGUDtBQUlELEtBL0dELE1BK0dPO0FBQ0wsV0FBS1YsYUFBTCxHQUFxQixLQUFLSSxpQkFBMUI7QUFDRDs7QUFFRCxXQUFPLEtBQUtKLGFBQVo7QUFDRDs7QUFFRGlDLEVBQUFBLGNBQWMsQ0FBQzBDLElBQUQsRUFBT0MsVUFBVSxHQUFHLEtBQXBCLEVBQTJCQyxjQUFjLEdBQUcsS0FBNUMsRUFBbURDLGdCQUFnQixHQUFHLEtBQXRFLEVBQTZFO0FBQ3pGLFFBQ0csQ0FBQ0QsY0FBRCxJQUFtQnJHLDJCQUEyQixDQUFDdUcsUUFBNUIsQ0FBcUNKLElBQUksQ0FBQzdDLElBQTFDLENBQXBCLElBQ0EsS0FBS3pCLFlBQUwsQ0FBa0I2RCxJQUFsQixDQUF1QmMsWUFBWSxJQUFJQSxZQUFZLENBQUNsRCxJQUFiLEtBQXNCNkMsSUFBSSxDQUFDN0MsSUFBbEUsQ0FEQSxJQUVDLENBQUNnRCxnQkFBRCxJQUFxQkgsSUFBSSxDQUFDN0MsSUFBTCxDQUFVbUQsUUFBVixDQUFtQixZQUFuQixDQUh4QixFQUlFO0FBQ0EsWUFBTUMsT0FBTyxHQUFJLFFBQU9QLElBQUksQ0FBQzdDLElBQUssbUZBQWxDOztBQUNBLFVBQUk4QyxVQUFKLEVBQWdCO0FBQ2QsY0FBTSxJQUFJTyxLQUFKLENBQVVELE9BQVYsQ0FBTjtBQUNEOztBQUNELFdBQUtsRyxHQUFMLENBQVNvRyxJQUFULENBQWNGLE9BQWQ7QUFDQSxhQUFPekQsU0FBUDtBQUNEOztBQUNELFNBQUtwQixZQUFMLENBQWtCZ0YsSUFBbEIsQ0FBdUJWLElBQXZCO0FBQ0EsV0FBT0EsSUFBUDtBQUNEOztBQUVEVyxFQUFBQSxlQUFlLENBQUNDLFNBQUQsRUFBWWhDLEtBQVosRUFBbUJxQixVQUFVLEdBQUcsS0FBaEMsRUFBdUNDLGNBQWMsR0FBRyxLQUF4RCxFQUErRDtBQUM1RSxRQUNHLENBQUNBLGNBQUQsSUFBbUJwRyw0QkFBNEIsQ0FBQ3NHLFFBQTdCLENBQXNDUSxTQUF0QyxDQUFwQixJQUNBLEtBQUtqRixjQUFMLENBQW9CaUYsU0FBcEIsQ0FGRixFQUdFO0FBQ0EsWUFBTUwsT0FBTyxHQUFJLFNBQVFLLFNBQVUsb0ZBQW5DOztBQUNBLFVBQUlYLFVBQUosRUFBZ0I7QUFDZCxjQUFNLElBQUlPLEtBQUosQ0FBVUQsT0FBVixDQUFOO0FBQ0Q7O0FBQ0QsV0FBS2xHLEdBQUwsQ0FBU29HLElBQVQsQ0FBY0YsT0FBZDtBQUNBLGFBQU96RCxTQUFQO0FBQ0Q7O0FBQ0QsU0FBS25CLGNBQUwsQ0FBb0JpRixTQUFwQixJQUFpQ2hDLEtBQWpDO0FBQ0EsV0FBT0EsS0FBUDtBQUNEOztBQUVEaUMsRUFBQUEsa0JBQWtCLENBQUNELFNBQUQsRUFBWWhDLEtBQVosRUFBbUJxQixVQUFVLEdBQUcsS0FBaEMsRUFBdUNDLGNBQWMsR0FBRyxLQUF4RCxFQUErRDtBQUMvRSxRQUNHLENBQUNBLGNBQUQsSUFBbUJuRywrQkFBK0IsQ0FBQ3FHLFFBQWhDLENBQXlDUSxTQUF6QyxDQUFwQixJQUNBLEtBQUtoRixnQkFBTCxDQUFzQmdGLFNBQXRCLENBRkYsRUFHRTtBQUNBLFlBQU1MLE9BQU8sR0FBSSxZQUFXSyxTQUFVLG9GQUF0Qzs7QUFDQSxVQUFJWCxVQUFKLEVBQWdCO0FBQ2QsY0FBTSxJQUFJTyxLQUFKLENBQVVELE9BQVYsQ0FBTjtBQUNEOztBQUNELFdBQUtsRyxHQUFMLENBQVNvRyxJQUFULENBQWNGLE9BQWQ7QUFDQSxhQUFPekQsU0FBUDtBQUNEOztBQUNELFNBQUtsQixnQkFBTCxDQUFzQmdGLFNBQXRCLElBQW1DaEMsS0FBbkM7QUFDQSxXQUFPQSxLQUFQO0FBQ0Q7O0FBRURrQyxFQUFBQSxXQUFXLENBQUNDLEtBQUQsRUFBUTtBQUNqQixRQUFJQSxLQUFLLFlBQVlDLGNBQU1SLEtBQTNCLEVBQWtDO0FBQ2hDLFdBQUtuRyxHQUFMLENBQVMwRyxLQUFULENBQWUsZUFBZixFQUFnQ0EsS0FBaEM7QUFDRCxLQUZELE1BRU87QUFDTCxXQUFLMUcsR0FBTCxDQUFTMEcsS0FBVCxDQUFlLGlDQUFmLEVBQWtEQSxLQUFsRCxFQUF5REEsS0FBSyxDQUFDRSxLQUEvRDtBQUNEOztBQUNELFVBQU0sdUNBQWVGLEtBQWYsQ0FBTjtBQUNEOztBQUUrQixRQUExQm5HLDBCQUEwQixHQUFHO0FBQ2pDLFVBQU0sQ0FBQ3NHLGdCQUFELEVBQW1Cdkcsa0JBQW5CLElBQXlDLE1BQU13RyxPQUFPLENBQUNDLEdBQVIsQ0FBWSxDQUMvRCxLQUFLaEgsa0JBQUwsQ0FBd0JpSCxVQUF4QixFQUQrRCxFQUUvRCxLQUFLbEgsc0JBQUwsQ0FBNEJtSCxnQkFBNUIsRUFGK0QsQ0FBWixDQUFyRDtBQUtBLFNBQUtKLGdCQUFMLEdBQXdCQSxnQkFBeEI7QUFFQSxXQUFPO0FBQ0x2RyxNQUFBQTtBQURLLEtBQVA7QUFHRDtBQUVEO0FBQ0Y7QUFDQTtBQUNBOzs7QUFDNEIsUUFBcEJHLG9CQUFvQixDQUFDSCxrQkFBRCxFQUF5QztBQUNqRSxVQUFNO0FBQUU0RyxNQUFBQSxpQkFBRjtBQUFxQkMsTUFBQUE7QUFBckIsUUFBNEM3RyxrQkFBbEQ7QUFDQSxVQUFNOEcsVUFBVSxHQUFHLE1BQU0sS0FBS1AsZ0JBQUwsQ0FBc0JRLGFBQXRCLEVBQXpCOztBQUVBLFFBQUlDLEtBQUssQ0FBQ0MsT0FBTixDQUFjTCxpQkFBZCxLQUFvQ0ksS0FBSyxDQUFDQyxPQUFOLENBQWNKLGtCQUFkLENBQXhDLEVBQTJFO0FBQ3pFLFVBQUlLLGVBQWUsR0FBR0osVUFBdEI7O0FBQ0EsVUFBSUYsaUJBQUosRUFBdUI7QUFDckJNLFFBQUFBLGVBQWUsR0FBR0osVUFBVSxDQUFDSyxNQUFYLENBQWtCQyxLQUFLLElBQUk7QUFDM0MsaUJBQU9SLGlCQUFpQixDQUFDbkIsUUFBbEIsQ0FBMkIyQixLQUFLLENBQUNDLFNBQWpDLENBQVA7QUFDRCxTQUZpQixDQUFsQjtBQUdEOztBQUNELFVBQUlSLGtCQUFKLEVBQXdCO0FBQ3RCO0FBQ0E7QUFDQTtBQUNBSyxRQUFBQSxlQUFlLEdBQUdBLGVBQWUsQ0FBQ0MsTUFBaEIsQ0FBdUJDLEtBQUssSUFBSTtBQUNoRCxpQkFBTyxDQUFDUCxrQkFBa0IsQ0FBQ3BCLFFBQW5CLENBQTRCMkIsS0FBSyxDQUFDQyxTQUFsQyxDQUFSO0FBQ0QsU0FGaUIsQ0FBbEI7QUFHRDs7QUFFRCxXQUFLQyxvQkFBTCxHQUE0QixDQUFDSixlQUFlLENBQUNLLElBQWhCLENBQXFCSCxLQUFLLElBQUk7QUFDekQsZUFBT0EsS0FBSyxDQUFDQyxTQUFOLEtBQW9CLE9BQTNCO0FBQ0QsT0FGNEIsQ0FBN0I7QUFJQSxhQUFPSCxlQUFQO0FBQ0QsS0FyQkQsTUFxQk87QUFDTCxhQUFPSixVQUFQO0FBQ0Q7QUFDRjtBQUVEO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7OztBQUNFckYsRUFBQUEsMEJBQTBCLENBQUN2QixZQUFELEVBQWVGLGtCQUFmLEVBQXVEO0FBQy9FLFVBQU07QUFBRXdILE1BQUFBO0FBQUYsUUFBbUJ4SCxrQkFBekIsQ0FEK0UsQ0FHL0U7QUFDQTs7QUFDQSxVQUFNeUgsV0FBVyxHQUFHLENBQUNDLENBQUQsRUFBSUMsQ0FBSixLQUFVO0FBQzVCRCxNQUFBQSxDQUFDLEdBQUdBLENBQUMsQ0FBQ0wsU0FBTjtBQUNBTSxNQUFBQSxDQUFDLEdBQUdBLENBQUMsQ0FBQ04sU0FBTjs7QUFDQSxVQUFJSyxDQUFDLENBQUMsQ0FBRCxDQUFELEtBQVMsR0FBYixFQUFrQjtBQUNoQixZQUFJQyxDQUFDLENBQUMsQ0FBRCxDQUFELEtBQVMsR0FBYixFQUFrQjtBQUNoQixpQkFBTyxDQUFDLENBQVI7QUFDRDtBQUNGOztBQUNELFVBQUlBLENBQUMsQ0FBQyxDQUFELENBQUQsS0FBUyxHQUFiLEVBQWtCO0FBQ2hCLFlBQUlELENBQUMsQ0FBQyxDQUFELENBQUQsS0FBUyxHQUFiLEVBQWtCO0FBQ2hCLGlCQUFPLENBQVA7QUFDRDtBQUNGOztBQUNELFVBQUlBLENBQUMsS0FBS0MsQ0FBVixFQUFhO0FBQ1gsZUFBTyxDQUFQO0FBQ0QsT0FGRCxNQUVPLElBQUlELENBQUMsR0FBR0MsQ0FBUixFQUFXO0FBQ2hCLGVBQU8sQ0FBQyxDQUFSO0FBQ0QsT0FGTSxNQUVBO0FBQ0wsZUFBTyxDQUFQO0FBQ0Q7QUFDRixLQXBCRDs7QUFzQkEsV0FBT3pILFlBQVksQ0FBQzBILElBQWIsQ0FBa0JILFdBQWxCLEVBQStCSSxHQUEvQixDQUFtQ2xHLFVBQVUsSUFBSTtBQUN0RCxVQUFJQyxnQkFBSjs7QUFDQSxVQUFJNEYsWUFBSixFQUFrQjtBQUNoQjVGLFFBQUFBLGdCQUFnQixHQUFHNEYsWUFBWSxDQUFDNUMsSUFBYixDQUFrQmtELENBQUMsSUFBSUEsQ0FBQyxDQUFDVCxTQUFGLEtBQWdCMUYsVUFBVSxDQUFDMEYsU0FBbEQsQ0FBbkI7QUFDRDs7QUFDRCxhQUFPLENBQUMxRixVQUFELEVBQWFDLGdCQUFiLENBQVA7QUFDRCxLQU5NLENBQVA7QUFPRDs7QUFFc0IsUUFBakJwQixpQkFBaUIsR0FBRztBQUN4QixXQUFPLE1BQU0sZ0NBQWlCLEtBQUtaLEtBQXRCLEVBQTZCdUgsTUFBN0IsQ0FBb0NZLFlBQVksSUFBSTtBQUMvRCxVQUFJLDJCQUEyQkMsSUFBM0IsQ0FBZ0NELFlBQWhDLENBQUosRUFBbUQ7QUFDakQsZUFBTyxJQUFQO0FBQ0QsT0FGRCxNQUVPO0FBQ0wsYUFBS3JJLEdBQUwsQ0FBU29HLElBQVQsQ0FDRyxZQUFXaUMsWUFBYSxxR0FEM0I7QUFHQSxlQUFPLEtBQVA7QUFDRDtBQUNGLEtBVFksQ0FBYjtBQVVEO0FBRUQ7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUFDRXBILEVBQUFBLHNCQUFzQixDQUFDcEIsTUFBRCxFQUtWO0FBQ1YsVUFBTTtBQUFFVyxNQUFBQSxZQUFGO0FBQWdCRSxNQUFBQSxrQkFBaEI7QUFBb0NKLE1BQUFBLGtCQUFwQztBQUF3RFMsTUFBQUE7QUFBeEQsUUFBZ0ZsQixNQUF0Rjs7QUFFQSxRQUNFYyxJQUFJLENBQUNDLFNBQUwsQ0FBZSxLQUFLTixrQkFBcEIsTUFBNENLLElBQUksQ0FBQ0MsU0FBTCxDQUFlTixrQkFBZixDQUE1QyxJQUNBLEtBQUtTLG1CQUFMLEtBQTZCQSxtQkFGL0IsRUFHRTtBQUNBLFVBQUksS0FBS1AsWUFBTCxLQUFzQkEsWUFBMUIsRUFBd0M7QUFDdEMsZUFBTyxLQUFQO0FBQ0Q7O0FBRUQsVUFBSSxLQUFLRSxrQkFBTCxLQUE0QkEsa0JBQWhDLEVBQW9EO0FBQ2xELGFBQUtGLFlBQUwsR0FBb0JBLFlBQXBCO0FBQ0EsZUFBTyxLQUFQO0FBQ0Q7QUFDRjs7QUFFRCxXQUFPLElBQVA7QUFDRDs7QUF6YXNCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IHsgR3JhcGhRTFNjaGVtYSwgR3JhcGhRTE9iamVjdFR5cGUsIERvY3VtZW50Tm9kZSwgR3JhcGhRTE5hbWVkVHlwZSB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgc3RpdGNoU2NoZW1hcyB9IGZyb20gJ0BncmFwaHFsLXRvb2xzL3N0aXRjaCc7XG5pbXBvcnQgeyBTY2hlbWFEaXJlY3RpdmVWaXNpdG9yIH0gZnJvbSAnQGdyYXBocWwtdG9vbHMvdXRpbHMnO1xuaW1wb3J0IHJlcXVpcmVkUGFyYW1ldGVyIGZyb20gJy4uL3JlcXVpcmVkUGFyYW1ldGVyJztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMVHlwZXMgZnJvbSAnLi9sb2FkZXJzL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0ICogYXMgcGFyc2VDbGFzc1R5cGVzIGZyb20gJy4vbG9hZGVycy9wYXJzZUNsYXNzVHlwZXMnO1xuaW1wb3J0ICogYXMgcGFyc2VDbGFzc1F1ZXJpZXMgZnJvbSAnLi9sb2FkZXJzL3BhcnNlQ2xhc3NRdWVyaWVzJztcbmltcG9ydCAqIGFzIHBhcnNlQ2xhc3NNdXRhdGlvbnMgZnJvbSAnLi9sb2FkZXJzL3BhcnNlQ2xhc3NNdXRhdGlvbnMnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxRdWVyaWVzIGZyb20gJy4vbG9hZGVycy9kZWZhdWx0R3JhcGhRTFF1ZXJpZXMnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxNdXRhdGlvbnMgZnJvbSAnLi9sb2FkZXJzL2RlZmF1bHRHcmFwaFFMTXV0YXRpb25zJztcbmltcG9ydCBQYXJzZUdyYXBoUUxDb250cm9sbGVyLCB7IFBhcnNlR3JhcGhRTENvbmZpZyB9IGZyb20gJy4uL0NvbnRyb2xsZXJzL1BhcnNlR3JhcGhRTENvbnRyb2xsZXInO1xuaW1wb3J0IERhdGFiYXNlQ29udHJvbGxlciBmcm9tICcuLi9Db250cm9sbGVycy9EYXRhYmFzZUNvbnRyb2xsZXInO1xuaW1wb3J0IFNjaGVtYUNhY2hlIGZyb20gJy4uL0FkYXB0ZXJzL0NhY2hlL1NjaGVtYUNhY2hlJztcbmltcG9ydCB7IHRvR3JhcGhRTEVycm9yIH0gZnJvbSAnLi9wYXJzZUdyYXBoUUxVdGlscyc7XG5pbXBvcnQgKiBhcyBzY2hlbWFEaXJlY3RpdmVzIGZyb20gJy4vbG9hZGVycy9zY2hlbWFEaXJlY3RpdmVzJztcbmltcG9ydCAqIGFzIHNjaGVtYVR5cGVzIGZyb20gJy4vbG9hZGVycy9zY2hlbWFUeXBlcyc7XG5pbXBvcnQgeyBnZXRGdW5jdGlvbk5hbWVzIH0gZnJvbSAnLi4vdHJpZ2dlcnMnO1xuaW1wb3J0ICogYXMgZGVmYXVsdFJlbGF5U2NoZW1hIGZyb20gJy4vbG9hZGVycy9kZWZhdWx0UmVsYXlTY2hlbWEnO1xuXG5jb25zdCBSRVNFUlZFRF9HUkFQSFFMX1RZUEVfTkFNRVMgPSBbXG4gICdTdHJpbmcnLFxuICAnQm9vbGVhbicsXG4gICdJbnQnLFxuICAnRmxvYXQnLFxuICAnSUQnLFxuICAnQXJyYXlSZXN1bHQnLFxuICAnUXVlcnknLFxuICAnTXV0YXRpb24nLFxuICAnU3Vic2NyaXB0aW9uJyxcbiAgJ0NyZWF0ZUZpbGVJbnB1dCcsXG4gICdDcmVhdGVGaWxlUGF5bG9hZCcsXG4gICdWaWV3ZXInLFxuICAnU2lnblVwSW5wdXQnLFxuICAnU2lnblVwUGF5bG9hZCcsXG4gICdMb2dJbklucHV0JyxcbiAgJ0xvZ0luUGF5bG9hZCcsXG4gICdMb2dPdXRJbnB1dCcsXG4gICdMb2dPdXRQYXlsb2FkJyxcbiAgJ0Nsb3VkQ29kZUZ1bmN0aW9uJyxcbiAgJ0NhbGxDbG91ZENvZGVJbnB1dCcsXG4gICdDYWxsQ2xvdWRDb2RlUGF5bG9hZCcsXG4gICdDcmVhdGVDbGFzc0lucHV0JyxcbiAgJ0NyZWF0ZUNsYXNzUGF5bG9hZCcsXG4gICdVcGRhdGVDbGFzc0lucHV0JyxcbiAgJ1VwZGF0ZUNsYXNzUGF5bG9hZCcsXG4gICdEZWxldGVDbGFzc0lucHV0JyxcbiAgJ0RlbGV0ZUNsYXNzUGF5bG9hZCcsXG4gICdQYWdlSW5mbycsXG5dO1xuY29uc3QgUkVTRVJWRURfR1JBUEhRTF9RVUVSWV9OQU1FUyA9IFsnaGVhbHRoJywgJ3ZpZXdlcicsICdjbGFzcycsICdjbGFzc2VzJ107XG5jb25zdCBSRVNFUlZFRF9HUkFQSFFMX01VVEFUSU9OX05BTUVTID0gW1xuICAnc2lnblVwJyxcbiAgJ2xvZ0luJyxcbiAgJ2xvZ091dCcsXG4gICdjcmVhdGVGaWxlJyxcbiAgJ2NhbGxDbG91ZENvZGUnLFxuICAnY3JlYXRlQ2xhc3MnLFxuICAndXBkYXRlQ2xhc3MnLFxuICAnZGVsZXRlQ2xhc3MnLFxuXTtcblxuY2xhc3MgUGFyc2VHcmFwaFFMU2NoZW1hIHtcbiAgZGF0YWJhc2VDb250cm9sbGVyOiBEYXRhYmFzZUNvbnRyb2xsZXI7XG4gIHBhcnNlR3JhcGhRTENvbnRyb2xsZXI6IFBhcnNlR3JhcGhRTENvbnRyb2xsZXI7XG4gIHBhcnNlR3JhcGhRTENvbmZpZzogUGFyc2VHcmFwaFFMQ29uZmlnO1xuICBsb2c6IGFueTtcbiAgYXBwSWQ6IHN0cmluZztcbiAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzOiA/KHN0cmluZyB8IEdyYXBoUUxTY2hlbWEgfCBEb2N1bWVudE5vZGUgfCBHcmFwaFFMTmFtZWRUeXBlW10pO1xuICBzY2hlbWFDYWNoZTogYW55O1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHBhcmFtczoge1xuICAgICAgZGF0YWJhc2VDb250cm9sbGVyOiBEYXRhYmFzZUNvbnRyb2xsZXIsXG4gICAgICBwYXJzZUdyYXBoUUxDb250cm9sbGVyOiBQYXJzZUdyYXBoUUxDb250cm9sbGVyLFxuICAgICAgbG9nOiBhbnksXG4gICAgICBhcHBJZDogc3RyaW5nLFxuICAgICAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzOiA/KHN0cmluZyB8IEdyYXBoUUxTY2hlbWEgfCBEb2N1bWVudE5vZGUgfCBHcmFwaFFMTmFtZWRUeXBlW10pLFxuICAgIH0gPSB7fVxuICApIHtcbiAgICB0aGlzLnBhcnNlR3JhcGhRTENvbnRyb2xsZXIgPVxuICAgICAgcGFyYW1zLnBhcnNlR3JhcGhRTENvbnRyb2xsZXIgfHxcbiAgICAgIHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgcGFyc2VHcmFwaFFMQ29udHJvbGxlciBpbnN0YW5jZSEnKTtcbiAgICB0aGlzLmRhdGFiYXNlQ29udHJvbGxlciA9XG4gICAgICBwYXJhbXMuZGF0YWJhc2VDb250cm9sbGVyIHx8XG4gICAgICByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIGRhdGFiYXNlQ29udHJvbGxlciBpbnN0YW5jZSEnKTtcbiAgICB0aGlzLmxvZyA9IHBhcmFtcy5sb2cgfHwgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBsb2cgaW5zdGFuY2UhJyk7XG4gICAgdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMgPSBwYXJhbXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzO1xuICAgIHRoaXMuYXBwSWQgPSBwYXJhbXMuYXBwSWQgfHwgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgdGhlIGFwcElkIScpO1xuICAgIHRoaXMuc2NoZW1hQ2FjaGUgPSBTY2hlbWFDYWNoZTtcbiAgfVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgY29uc3QgeyBwYXJzZUdyYXBoUUxDb25maWcgfSA9IGF3YWl0IHRoaXMuX2luaXRpYWxpemVTY2hlbWFBbmRDb25maWcoKTtcbiAgICBjb25zdCBwYXJzZUNsYXNzZXMgPSBhd2FpdCB0aGlzLl9nZXRDbGFzc2VzRm9yU2NoZW1hKHBhcnNlR3JhcGhRTENvbmZpZyk7XG4gICAgY29uc3QgcGFyc2VDbGFzc2VzU3RyaW5nID0gSlNPTi5zdHJpbmdpZnkocGFyc2VDbGFzc2VzKTtcbiAgICBjb25zdCBmdW5jdGlvbk5hbWVzID0gYXdhaXQgdGhpcy5fZ2V0RnVuY3Rpb25OYW1lcygpO1xuICAgIGNvbnN0IGZ1bmN0aW9uTmFtZXNTdHJpbmcgPSBKU09OLnN0cmluZ2lmeShmdW5jdGlvbk5hbWVzKTtcblxuICAgIGlmIChcbiAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSAmJlxuICAgICAgIXRoaXMuX2hhc1NjaGVtYUlucHV0Q2hhbmdlZCh7XG4gICAgICAgIHBhcnNlQ2xhc3NlcyxcbiAgICAgICAgcGFyc2VDbGFzc2VzU3RyaW5nLFxuICAgICAgICBwYXJzZUdyYXBoUUxDb25maWcsXG4gICAgICAgIGZ1bmN0aW9uTmFtZXNTdHJpbmcsXG4gICAgICB9KVxuICAgICkge1xuICAgICAgcmV0dXJuIHRoaXMuZ3JhcGhRTFNjaGVtYTtcbiAgICB9XG5cbiAgICB0aGlzLnBhcnNlQ2xhc3NlcyA9IHBhcnNlQ2xhc3NlcztcbiAgICB0aGlzLnBhcnNlQ2xhc3Nlc1N0cmluZyA9IHBhcnNlQ2xhc3Nlc1N0cmluZztcbiAgICB0aGlzLnBhcnNlR3JhcGhRTENvbmZpZyA9IHBhcnNlR3JhcGhRTENvbmZpZztcbiAgICB0aGlzLmZ1bmN0aW9uTmFtZXMgPSBmdW5jdGlvbk5hbWVzO1xuICAgIHRoaXMuZnVuY3Rpb25OYW1lc1N0cmluZyA9IGZ1bmN0aW9uTmFtZXNTdHJpbmc7XG4gICAgdGhpcy5wYXJzZUNsYXNzVHlwZXMgPSB7fTtcbiAgICB0aGlzLnZpZXdlclR5cGUgPSBudWxsO1xuICAgIHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEgPSBudWxsO1xuICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSA9IG51bGw7XG4gICAgdGhpcy5ncmFwaFFMVHlwZXMgPSBbXTtcbiAgICB0aGlzLmdyYXBoUUxRdWVyaWVzID0ge307XG4gICAgdGhpcy5ncmFwaFFMTXV0YXRpb25zID0ge307XG4gICAgdGhpcy5ncmFwaFFMU3Vic2NyaXB0aW9ucyA9IHt9O1xuICAgIHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXNEZWZpbml0aW9ucyA9IG51bGw7XG4gICAgdGhpcy5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlcyA9IHt9O1xuICAgIHRoaXMucmVsYXlOb2RlSW50ZXJmYWNlID0gbnVsbDtcblxuICAgIGRlZmF1bHRHcmFwaFFMVHlwZXMubG9hZCh0aGlzKTtcbiAgICBkZWZhdWx0UmVsYXlTY2hlbWEubG9hZCh0aGlzKTtcbiAgICBzY2hlbWFUeXBlcy5sb2FkKHRoaXMpO1xuXG4gICAgdGhpcy5fZ2V0UGFyc2VDbGFzc2VzV2l0aENvbmZpZyhwYXJzZUNsYXNzZXMsIHBhcnNlR3JhcGhRTENvbmZpZykuZm9yRWFjaChcbiAgICAgIChbcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZ10pID0+IHtcbiAgICAgICAgcGFyc2VDbGFzc1R5cGVzLmxvYWQodGhpcywgcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZyk7XG4gICAgICAgIHBhcnNlQ2xhc3NRdWVyaWVzLmxvYWQodGhpcywgcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZyk7XG4gICAgICAgIHBhcnNlQ2xhc3NNdXRhdGlvbnMubG9hZCh0aGlzLCBwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnKTtcbiAgICAgIH1cbiAgICApO1xuXG4gICAgZGVmYXVsdEdyYXBoUUxUeXBlcy5sb2FkQXJyYXlSZXN1bHQodGhpcywgcGFyc2VDbGFzc2VzKTtcbiAgICBkZWZhdWx0R3JhcGhRTFF1ZXJpZXMubG9hZCh0aGlzKTtcbiAgICBkZWZhdWx0R3JhcGhRTE11dGF0aW9ucy5sb2FkKHRoaXMpO1xuXG4gICAgbGV0IGdyYXBoUUxRdWVyeSA9IHVuZGVmaW5lZDtcbiAgICBpZiAoT2JqZWN0LmtleXModGhpcy5ncmFwaFFMUXVlcmllcykubGVuZ3RoID4gMCkge1xuICAgICAgZ3JhcGhRTFF1ZXJ5ID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICAgICAgbmFtZTogJ1F1ZXJ5JyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdRdWVyeSBpcyB0aGUgdG9wIGxldmVsIHR5cGUgZm9yIHF1ZXJpZXMuJyxcbiAgICAgICAgZmllbGRzOiB0aGlzLmdyYXBoUUxRdWVyaWVzLFxuICAgICAgfSk7XG4gICAgICB0aGlzLmFkZEdyYXBoUUxUeXBlKGdyYXBoUUxRdWVyeSwgdHJ1ZSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgbGV0IGdyYXBoUUxNdXRhdGlvbiA9IHVuZGVmaW5lZDtcbiAgICBpZiAoT2JqZWN0LmtleXModGhpcy5ncmFwaFFMTXV0YXRpb25zKS5sZW5ndGggPiAwKSB7XG4gICAgICBncmFwaFFMTXV0YXRpb24gPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgICAgICBuYW1lOiAnTXV0YXRpb24nLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ011dGF0aW9uIGlzIHRoZSB0b3AgbGV2ZWwgdHlwZSBmb3IgbXV0YXRpb25zLicsXG4gICAgICAgIGZpZWxkczogdGhpcy5ncmFwaFFMTXV0YXRpb25zLFxuICAgICAgfSk7XG4gICAgICB0aGlzLmFkZEdyYXBoUUxUeXBlKGdyYXBoUUxNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgbGV0IGdyYXBoUUxTdWJzY3JpcHRpb24gPSB1bmRlZmluZWQ7XG4gICAgaWYgKE9iamVjdC5rZXlzKHRoaXMuZ3JhcGhRTFN1YnNjcmlwdGlvbnMpLmxlbmd0aCA+IDApIHtcbiAgICAgIGdyYXBoUUxTdWJzY3JpcHRpb24gPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgICAgICBuYW1lOiAnU3Vic2NyaXB0aW9uJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdTdWJzY3JpcHRpb24gaXMgdGhlIHRvcCBsZXZlbCB0eXBlIGZvciBzdWJzY3JpcHRpb25zLicsXG4gICAgICAgIGZpZWxkczogdGhpcy5ncmFwaFFMU3Vic2NyaXB0aW9ucyxcbiAgICAgIH0pO1xuICAgICAgdGhpcy5hZGRHcmFwaFFMVHlwZShncmFwaFFMU3Vic2NyaXB0aW9uLCB0cnVlLCB0cnVlKTtcbiAgICB9XG5cbiAgICB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hID0gbmV3IEdyYXBoUUxTY2hlbWEoe1xuICAgICAgdHlwZXM6IHRoaXMuZ3JhcGhRTFR5cGVzLFxuICAgICAgcXVlcnk6IGdyYXBoUUxRdWVyeSxcbiAgICAgIG11dGF0aW9uOiBncmFwaFFMTXV0YXRpb24sXG4gICAgICBzdWJzY3JpcHRpb246IGdyYXBoUUxTdWJzY3JpcHRpb24sXG4gICAgfSk7XG5cbiAgICBpZiAodGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMpIHtcbiAgICAgIHNjaGVtYURpcmVjdGl2ZXMubG9hZCh0aGlzKTtcblxuICAgICAgaWYgKHR5cGVvZiB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcy5nZXRUeXBlTWFwID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIC8vIEluIGZvbGxvd2luZyBjb2RlIHdlIHVzZSB1bmRlcnNjb3JlIGF0dHIgdG8gYXZvaWQganMgdmFyIHVuIHJlZlxuICAgICAgICBjb25zdCBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZU1hcCA9IHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLl90eXBlTWFwO1xuICAgICAgICBjb25zdCBmaW5kQW5kUmVwbGFjZUxhc3RUeXBlID0gKHBhcmVudCwga2V5KSA9PiB7XG4gICAgICAgICAgaWYgKHBhcmVudFtrZXldLm5hbWUpIHtcbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYS5fdHlwZU1hcFtwYXJlbnRba2V5XS5uYW1lXSAmJlxuICAgICAgICAgICAgICB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLl90eXBlTWFwW3BhcmVudFtrZXldLm5hbWVdICE9PSBwYXJlbnRba2V5XVxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIC8vIFRvIGF2b2lkIHVucmVzb2x2ZWQgZmllbGQgb24gb3ZlcmxvYWRlZCBzY2hlbWFcbiAgICAgICAgICAgICAgLy8gcmVwbGFjZSB0aGUgZmluYWwgdHlwZSB3aXRoIHRoZSBhdXRvIHNjaGVtYSBvbmVcbiAgICAgICAgICAgICAgcGFyZW50W2tleV0gPSB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLl90eXBlTWFwW3BhcmVudFtrZXldLm5hbWVdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAocGFyZW50W2tleV0ub2ZUeXBlKSB7XG4gICAgICAgICAgICAgIGZpbmRBbmRSZXBsYWNlTGFzdFR5cGUocGFyZW50W2tleV0sICdvZlR5cGUnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIC8vIEFkZCBub24gc2hhcmVkIHR5cGVzIGZyb20gY3VzdG9tIHNjaGVtYSB0byBhdXRvIHNjaGVtYVxuICAgICAgICAvLyBub3RlOiBzb21lIG5vbiBzaGFyZWQgdHlwZXMgY2FuIHVzZSBzb21lIHNoYXJlZCB0eXBlc1xuICAgICAgICAvLyBzbyB0aGlzIGNvZGUgbmVlZCB0byBiZSByYW4gYmVmb3JlIHRoZSBzaGFyZWQgdHlwZXMgYWRkaXRpb25cbiAgICAgICAgT2JqZWN0LnZhbHVlcyhjdXN0b21HcmFwaFFMU2NoZW1hVHlwZU1hcCkuZm9yRWFjaChjdXN0b21HcmFwaFFMU2NoZW1hVHlwZSA9PiB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgIWN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlIHx8XG4gICAgICAgICAgICAhY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZSB8fFxuICAgICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZS5zdGFydHNXaXRoKCdfXycpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IGF1dG9HcmFwaFFMU2NoZW1hVHlwZSA9IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuX3R5cGVNYXBbXG4gICAgICAgICAgICBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lXG4gICAgICAgICAgXTtcbiAgICAgICAgICBpZiAoIWF1dG9HcmFwaFFMU2NoZW1hVHlwZSkge1xuICAgICAgICAgICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYS5fdHlwZU1hcFtjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lXSA9IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIC8vIEhhbmRsZSBzaGFyZWQgdHlwZXNcbiAgICAgICAgLy8gV2UgcGFzcyB0aHJvdWdoIGVhY2ggdHlwZSBhbmQgZW5zdXJlIHRoYXQgYWxsIHN1YiBmaWVsZCB0eXBlcyBhcmUgcmVwbGFjZWRcbiAgICAgICAgLy8gd2l0aCBhXG4gICAgICAgIE9iamVjdC52YWx1ZXMoY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXApLmZvckVhY2goY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUgPT4ge1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICFjdXN0b21HcmFwaFFMU2NoZW1hVHlwZSB8fFxuICAgICAgICAgICAgIWN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWUgfHxcbiAgICAgICAgICAgIGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWUuc3RhcnRzV2l0aCgnX18nKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCBhdXRvR3JhcGhRTFNjaGVtYVR5cGUgPSB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLl90eXBlTWFwW1xuICAgICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZVxuICAgICAgICAgIF07XG5cbiAgICAgICAgICBpZiAoYXV0b0dyYXBoUUxTY2hlbWFUeXBlICYmIHR5cGVvZiBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5nZXRGaWVsZHMgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIE9iamVjdC52YWx1ZXMoY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUuX2ZpZWxkcykuZm9yRWFjaChmaWVsZCA9PiB7XG4gICAgICAgICAgICAgIGZpbmRBbmRSZXBsYWNlTGFzdFR5cGUoZmllbGQsICd0eXBlJyk7XG4gICAgICAgICAgICAgIGF1dG9HcmFwaFFMU2NoZW1hVHlwZS5fZmllbGRzW2ZpZWxkLm5hbWVdID0gZmllbGQ7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hID0gYXdhaXQgdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMoe1xuICAgICAgICAgIGRpcmVjdGl2ZXNEZWZpbml0aW9uc1NjaGVtYTogdGhpcy5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zLFxuICAgICAgICAgIGF1dG9TY2hlbWE6IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEsXG4gICAgICAgICAgc3RpdGNoU2NoZW1hcyxcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSBzdGl0Y2hTY2hlbWFzKHtcbiAgICAgICAgICBzY2hlbWFzOiBbXG4gICAgICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzRGVmaW5pdGlvbnMsXG4gICAgICAgICAgICB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLFxuICAgICAgICAgICAgdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMsXG4gICAgICAgICAgXSxcbiAgICAgICAgICBtZXJnZURpcmVjdGl2ZXM6IHRydWUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBncmFwaFFMU2NoZW1hVHlwZU1hcCA9IHRoaXMuZ3JhcGhRTFNjaGVtYS5nZXRUeXBlTWFwKCk7XG4gICAgICBPYmplY3Qua2V5cyhncmFwaFFMU2NoZW1hVHlwZU1hcCkuZm9yRWFjaChncmFwaFFMU2NoZW1hVHlwZU5hbWUgPT4ge1xuICAgICAgICBjb25zdCBncmFwaFFMU2NoZW1hVHlwZSA9IGdyYXBoUUxTY2hlbWFUeXBlTWFwW2dyYXBoUUxTY2hlbWFUeXBlTmFtZV07XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0eXBlb2YgZ3JhcGhRTFNjaGVtYVR5cGUuZ2V0RmllbGRzID09PSAnZnVuY3Rpb24nICYmXG4gICAgICAgICAgdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMuZGVmaW5pdGlvbnNcbiAgICAgICAgKSB7XG4gICAgICAgICAgY29uc3QgZ3JhcGhRTEN1c3RvbVR5cGVEZWYgPSB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcy5kZWZpbml0aW9ucy5maW5kKFxuICAgICAgICAgICAgZGVmaW5pdGlvbiA9PiBkZWZpbml0aW9uLm5hbWUudmFsdWUgPT09IGdyYXBoUUxTY2hlbWFUeXBlTmFtZVxuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKGdyYXBoUUxDdXN0b21UeXBlRGVmKSB7XG4gICAgICAgICAgICBjb25zdCBncmFwaFFMU2NoZW1hVHlwZUZpZWxkTWFwID0gZ3JhcGhRTFNjaGVtYVR5cGUuZ2V0RmllbGRzKCk7XG4gICAgICAgICAgICBPYmplY3Qua2V5cyhncmFwaFFMU2NoZW1hVHlwZUZpZWxkTWFwKS5mb3JFYWNoKGdyYXBoUUxTY2hlbWFUeXBlRmllbGROYW1lID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZCA9IGdyYXBoUUxTY2hlbWFUeXBlRmllbGRNYXBbZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE5hbWVdO1xuICAgICAgICAgICAgICBpZiAoIWdyYXBoUUxTY2hlbWFUeXBlRmllbGQuYXN0Tm9kZSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFzdE5vZGUgPSBncmFwaFFMQ3VzdG9tVHlwZURlZi5maWVsZHMuZmluZChcbiAgICAgICAgICAgICAgICAgIGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09IGdyYXBoUUxTY2hlbWFUeXBlRmllbGROYW1lXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBpZiAoYXN0Tm9kZSkge1xuICAgICAgICAgICAgICAgICAgZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZC5hc3ROb2RlID0gYXN0Tm9kZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIFNjaGVtYURpcmVjdGl2ZVZpc2l0b3IudmlzaXRTY2hlbWFEaXJlY3RpdmVzKFxuICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWEsXG4gICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXNcbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSA9IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWE7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuZ3JhcGhRTFNjaGVtYTtcbiAgfVxuXG4gIGFkZEdyYXBoUUxUeXBlKHR5cGUsIHRocm93RXJyb3IgPSBmYWxzZSwgaWdub3JlUmVzZXJ2ZWQgPSBmYWxzZSwgaWdub3JlQ29ubmVjdGlvbiA9IGZhbHNlKSB7XG4gICAgaWYgKFxuICAgICAgKCFpZ25vcmVSZXNlcnZlZCAmJiBSRVNFUlZFRF9HUkFQSFFMX1RZUEVfTkFNRVMuaW5jbHVkZXModHlwZS5uYW1lKSkgfHxcbiAgICAgIHRoaXMuZ3JhcGhRTFR5cGVzLmZpbmQoZXhpc3RpbmdUeXBlID0+IGV4aXN0aW5nVHlwZS5uYW1lID09PSB0eXBlLm5hbWUpIHx8XG4gICAgICAoIWlnbm9yZUNvbm5lY3Rpb24gJiYgdHlwZS5uYW1lLmVuZHNXaXRoKCdDb25uZWN0aW9uJykpXG4gICAgKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gYFR5cGUgJHt0eXBlLm5hbWV9IGNvdWxkIG5vdCBiZSBhZGRlZCB0byB0aGUgYXV0byBzY2hlbWEgYmVjYXVzZSBpdCBjb2xsaWRlZCB3aXRoIGFuIGV4aXN0aW5nIHR5cGUuYDtcbiAgICAgIGlmICh0aHJvd0Vycm9yKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihtZXNzYWdlKTtcbiAgICAgIH1cbiAgICAgIHRoaXMubG9nLndhcm4obWVzc2FnZSk7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICB0aGlzLmdyYXBoUUxUeXBlcy5wdXNoKHR5cGUpO1xuICAgIHJldHVybiB0eXBlO1xuICB9XG5cbiAgYWRkR3JhcGhRTFF1ZXJ5KGZpZWxkTmFtZSwgZmllbGQsIHRocm93RXJyb3IgPSBmYWxzZSwgaWdub3JlUmVzZXJ2ZWQgPSBmYWxzZSkge1xuICAgIGlmIChcbiAgICAgICghaWdub3JlUmVzZXJ2ZWQgJiYgUkVTRVJWRURfR1JBUEhRTF9RVUVSWV9OQU1FUy5pbmNsdWRlcyhmaWVsZE5hbWUpKSB8fFxuICAgICAgdGhpcy5ncmFwaFFMUXVlcmllc1tmaWVsZE5hbWVdXG4gICAgKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gYFF1ZXJ5ICR7ZmllbGROYW1lfSBjb3VsZCBub3QgYmUgYWRkZWQgdG8gdGhlIGF1dG8gc2NoZW1hIGJlY2F1c2UgaXQgY29sbGlkZWQgd2l0aCBhbiBleGlzdGluZyBmaWVsZC5gO1xuICAgICAgaWYgKHRocm93RXJyb3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UpO1xuICAgICAgfVxuICAgICAgdGhpcy5sb2cud2FybihtZXNzYWdlKTtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHRoaXMuZ3JhcGhRTFF1ZXJpZXNbZmllbGROYW1lXSA9IGZpZWxkO1xuICAgIHJldHVybiBmaWVsZDtcbiAgfVxuXG4gIGFkZEdyYXBoUUxNdXRhdGlvbihmaWVsZE5hbWUsIGZpZWxkLCB0aHJvd0Vycm9yID0gZmFsc2UsIGlnbm9yZVJlc2VydmVkID0gZmFsc2UpIHtcbiAgICBpZiAoXG4gICAgICAoIWlnbm9yZVJlc2VydmVkICYmIFJFU0VSVkVEX0dSQVBIUUxfTVVUQVRJT05fTkFNRVMuaW5jbHVkZXMoZmllbGROYW1lKSkgfHxcbiAgICAgIHRoaXMuZ3JhcGhRTE11dGF0aW9uc1tmaWVsZE5hbWVdXG4gICAgKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gYE11dGF0aW9uICR7ZmllbGROYW1lfSBjb3VsZCBub3QgYmUgYWRkZWQgdG8gdGhlIGF1dG8gc2NoZW1hIGJlY2F1c2UgaXQgY29sbGlkZWQgd2l0aCBhbiBleGlzdGluZyBmaWVsZC5gO1xuICAgICAgaWYgKHRocm93RXJyb3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UpO1xuICAgICAgfVxuICAgICAgdGhpcy5sb2cud2FybihtZXNzYWdlKTtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHRoaXMuZ3JhcGhRTE11dGF0aW9uc1tmaWVsZE5hbWVdID0gZmllbGQ7XG4gICAgcmV0dXJuIGZpZWxkO1xuICB9XG5cbiAgaGFuZGxlRXJyb3IoZXJyb3IpIHtcbiAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBQYXJzZS5FcnJvcikge1xuICAgICAgdGhpcy5sb2cuZXJyb3IoJ1BhcnNlIGVycm9yOiAnLCBlcnJvcik7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMubG9nLmVycm9yKCdVbmNhdWdodCBpbnRlcm5hbCBzZXJ2ZXIgZXJyb3IuJywgZXJyb3IsIGVycm9yLnN0YWNrKTtcbiAgICB9XG4gICAgdGhyb3cgdG9HcmFwaFFMRXJyb3IoZXJyb3IpO1xuICB9XG5cbiAgYXN5bmMgX2luaXRpYWxpemVTY2hlbWFBbmRDb25maWcoKSB7XG4gICAgY29uc3QgW3NjaGVtYUNvbnRyb2xsZXIsIHBhcnNlR3JhcGhRTENvbmZpZ10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICB0aGlzLmRhdGFiYXNlQ29udHJvbGxlci5sb2FkU2NoZW1hKCksXG4gICAgICB0aGlzLnBhcnNlR3JhcGhRTENvbnRyb2xsZXIuZ2V0R3JhcGhRTENvbmZpZygpLFxuICAgIF0pO1xuXG4gICAgdGhpcy5zY2hlbWFDb250cm9sbGVyID0gc2NoZW1hQ29udHJvbGxlcjtcblxuICAgIHJldHVybiB7XG4gICAgICBwYXJzZUdyYXBoUUxDb25maWcsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXRzIGFsbCBjbGFzc2VzIGZvdW5kIGJ5IHRoZSBgc2NoZW1hQ29udHJvbGxlcmBcbiAgICogbWludXMgdGhvc2UgZmlsdGVyZWQgb3V0IGJ5IHRoZSBhcHAncyBwYXJzZUdyYXBoUUxDb25maWcuXG4gICAqL1xuICBhc3luYyBfZ2V0Q2xhc3Nlc0ZvclNjaGVtYShwYXJzZUdyYXBoUUxDb25maWc6IFBhcnNlR3JhcGhRTENvbmZpZykge1xuICAgIGNvbnN0IHsgZW5hYmxlZEZvckNsYXNzZXMsIGRpc2FibGVkRm9yQ2xhc3NlcyB9ID0gcGFyc2VHcmFwaFFMQ29uZmlnO1xuICAgIGNvbnN0IGFsbENsYXNzZXMgPSBhd2FpdCB0aGlzLnNjaGVtYUNvbnRyb2xsZXIuZ2V0QWxsQ2xhc3NlcygpO1xuXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZW5hYmxlZEZvckNsYXNzZXMpIHx8IEFycmF5LmlzQXJyYXkoZGlzYWJsZWRGb3JDbGFzc2VzKSkge1xuICAgICAgbGV0IGluY2x1ZGVkQ2xhc3NlcyA9IGFsbENsYXNzZXM7XG4gICAgICBpZiAoZW5hYmxlZEZvckNsYXNzZXMpIHtcbiAgICAgICAgaW5jbHVkZWRDbGFzc2VzID0gYWxsQ2xhc3Nlcy5maWx0ZXIoY2xhenogPT4ge1xuICAgICAgICAgIHJldHVybiBlbmFibGVkRm9yQ2xhc3Nlcy5pbmNsdWRlcyhjbGF6ei5jbGFzc05hbWUpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIGlmIChkaXNhYmxlZEZvckNsYXNzZXMpIHtcbiAgICAgICAgLy8gQ2xhc3NlcyBpbmNsdWRlZCBpbiBgZW5hYmxlZEZvckNsYXNzZXNgIHRoYXRcbiAgICAgICAgLy8gYXJlIGFsc28gcHJlc2VudCBpbiBgZGlzYWJsZWRGb3JDbGFzc2VzYCB3aWxsXG4gICAgICAgIC8vIHN0aWxsIGJlIGZpbHRlcmVkIG91dFxuICAgICAgICBpbmNsdWRlZENsYXNzZXMgPSBpbmNsdWRlZENsYXNzZXMuZmlsdGVyKGNsYXp6ID0+IHtcbiAgICAgICAgICByZXR1cm4gIWRpc2FibGVkRm9yQ2xhc3Nlcy5pbmNsdWRlcyhjbGF6ei5jbGFzc05hbWUpO1xuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5pc1VzZXJzQ2xhc3NEaXNhYmxlZCA9ICFpbmNsdWRlZENsYXNzZXMuc29tZShjbGF6eiA9PiB7XG4gICAgICAgIHJldHVybiBjbGF6ei5jbGFzc05hbWUgPT09ICdfVXNlcic7XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIGluY2x1ZGVkQ2xhc3NlcztcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGFsbENsYXNzZXM7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFRoaXMgbWV0aG9kIHJldHVybnMgYSBsaXN0IG9mIHR1cGxlc1xuICAgKiB0aGF0IHByb3ZpZGUgdGhlIHBhcnNlQ2xhc3MgYWxvbmcgd2l0aFxuICAgKiBpdHMgcGFyc2VDbGFzc0NvbmZpZyB3aGVyZSBwcm92aWRlZC5cbiAgICovXG4gIF9nZXRQYXJzZUNsYXNzZXNXaXRoQ29uZmlnKHBhcnNlQ2xhc3NlcywgcGFyc2VHcmFwaFFMQ29uZmlnOiBQYXJzZUdyYXBoUUxDb25maWcpIHtcbiAgICBjb25zdCB7IGNsYXNzQ29uZmlncyB9ID0gcGFyc2VHcmFwaFFMQ29uZmlnO1xuXG4gICAgLy8gTWFrZSBzdXJlcyB0aGF0IHRoZSBkZWZhdWx0IGNsYXNzZXMgYW5kIGNsYXNzZXMgdGhhdFxuICAgIC8vIHN0YXJ0cyB3aXRoIGNhcGl0YWxpemVkIGxldHRlciB3aWxsIGJlIGdlbmVyYXRlZCBmaXJzdC5cbiAgICBjb25zdCBzb3J0Q2xhc3NlcyA9IChhLCBiKSA9PiB7XG4gICAgICBhID0gYS5jbGFzc05hbWU7XG4gICAgICBiID0gYi5jbGFzc05hbWU7XG4gICAgICBpZiAoYVswXSA9PT0gJ18nKSB7XG4gICAgICAgIGlmIChiWzBdICE9PSAnXycpIHtcbiAgICAgICAgICByZXR1cm4gLTE7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChiWzBdID09PSAnXycpIHtcbiAgICAgICAgaWYgKGFbMF0gIT09ICdfJykge1xuICAgICAgICAgIHJldHVybiAxO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoYSA9PT0gYikge1xuICAgICAgICByZXR1cm4gMDtcbiAgICAgIH0gZWxzZSBpZiAoYSA8IGIpIHtcbiAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIDE7XG4gICAgICB9XG4gICAgfTtcblxuICAgIHJldHVybiBwYXJzZUNsYXNzZXMuc29ydChzb3J0Q2xhc3NlcykubWFwKHBhcnNlQ2xhc3MgPT4ge1xuICAgICAgbGV0IHBhcnNlQ2xhc3NDb25maWc7XG4gICAgICBpZiAoY2xhc3NDb25maWdzKSB7XG4gICAgICAgIHBhcnNlQ2xhc3NDb25maWcgPSBjbGFzc0NvbmZpZ3MuZmluZChjID0+IGMuY2xhc3NOYW1lID09PSBwYXJzZUNsYXNzLmNsYXNzTmFtZSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gW3BhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWddO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgX2dldEZ1bmN0aW9uTmFtZXMoKSB7XG4gICAgcmV0dXJuIGF3YWl0IGdldEZ1bmN0aW9uTmFtZXModGhpcy5hcHBJZCkuZmlsdGVyKGZ1bmN0aW9uTmFtZSA9PiB7XG4gICAgICBpZiAoL15bX2EtekEtWl1bX2EtekEtWjAtOV0qJC8udGVzdChmdW5jdGlvbk5hbWUpKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5sb2cud2FybihcbiAgICAgICAgICBgRnVuY3Rpb24gJHtmdW5jdGlvbk5hbWV9IGNvdWxkIG5vdCBiZSBhZGRlZCB0byB0aGUgYXV0byBzY2hlbWEgYmVjYXVzZSBHcmFwaFFMIG5hbWVzIG11c3QgbWF0Y2ggL15bX2EtekEtWl1bX2EtekEtWjAtOV0qJC8uYFxuICAgICAgICApO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogQ2hlY2tzIGZvciBjaGFuZ2VzIHRvIHRoZSBwYXJzZUNsYXNzZXNcbiAgICogb2JqZWN0cyAoaS5lLiBkYXRhYmFzZSBzY2hlbWEpIG9yIHRvXG4gICAqIHRoZSBwYXJzZUdyYXBoUUxDb25maWcgb2JqZWN0LiBJZiBub1xuICAgKiBjaGFuZ2VzIGFyZSBmb3VuZCwgcmV0dXJuIHRydWU7XG4gICAqL1xuICBfaGFzU2NoZW1hSW5wdXRDaGFuZ2VkKHBhcmFtczoge1xuICAgIHBhcnNlQ2xhc3NlczogYW55LFxuICAgIHBhcnNlQ2xhc3Nlc1N0cmluZzogc3RyaW5nLFxuICAgIHBhcnNlR3JhcGhRTENvbmZpZzogP1BhcnNlR3JhcGhRTENvbmZpZyxcbiAgICBmdW5jdGlvbk5hbWVzU3RyaW5nOiBzdHJpbmcsXG4gIH0pOiBib29sZWFuIHtcbiAgICBjb25zdCB7IHBhcnNlQ2xhc3NlcywgcGFyc2VDbGFzc2VzU3RyaW5nLCBwYXJzZUdyYXBoUUxDb25maWcsIGZ1bmN0aW9uTmFtZXNTdHJpbmcgfSA9IHBhcmFtcztcblxuICAgIGlmIChcbiAgICAgIEpTT04uc3RyaW5naWZ5KHRoaXMucGFyc2VHcmFwaFFMQ29uZmlnKSA9PT0gSlNPTi5zdHJpbmdpZnkocGFyc2VHcmFwaFFMQ29uZmlnKSAmJlxuICAgICAgdGhpcy5mdW5jdGlvbk5hbWVzU3RyaW5nID09PSBmdW5jdGlvbk5hbWVzU3RyaW5nXG4gICAgKSB7XG4gICAgICBpZiAodGhpcy5wYXJzZUNsYXNzZXMgPT09IHBhcnNlQ2xhc3Nlcykge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLnBhcnNlQ2xhc3Nlc1N0cmluZyA9PT0gcGFyc2VDbGFzc2VzU3RyaW5nKSB7XG4gICAgICAgIHRoaXMucGFyc2VDbGFzc2VzID0gcGFyc2VDbGFzc2VzO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbn1cblxuZXhwb3J0IHsgUGFyc2VHcmFwaFFMU2NoZW1hIH07XG4iXX0=