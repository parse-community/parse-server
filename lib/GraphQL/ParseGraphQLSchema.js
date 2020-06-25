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

var _parseGraphQLUtils = require("./parseGraphQLUtils");

var schemaDirectives = _interopRequireWildcard(require("./loaders/schemaDirectives"));

var schemaTypes = _interopRequireWildcard(require("./loaders/schemaTypes"));

var _triggers = require("../triggers");

var defaultRelaySchema = _interopRequireWildcard(require("./loaders/defaultRelaySchema"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

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
        const customGraphQLSchemaTypeMap = this.graphQLCustomTypeDefs.getTypeMap();

        const findAndReplaceLastType = (parent, key) => {
          if (parent[key].name) {
            if (this.graphQLAutoSchema.getType(parent[key].name) && this.graphQLAutoSchema.getType(parent[key].name) !== parent[key]) {
              // To avoid unresolved field on overloaded schema
              // replace the final type with the auto schema one
              parent[key] = this.graphQLAutoSchema.getType(parent[key].name);
            }
          } else {
            if (parent[key].ofType) {
              findAndReplaceLastType(parent[key], 'ofType');
            }
          }
        };

        Object.values(customGraphQLSchemaTypeMap).forEach(customGraphQLSchemaType => {
          if (!customGraphQLSchemaType || !customGraphQLSchemaType.name || customGraphQLSchemaType.name.startsWith('__')) {
            return;
          }

          const autoGraphQLSchemaType = this.graphQLAutoSchema.getType(customGraphQLSchemaType.name);

          if (!autoGraphQLSchemaType) {
            this.graphQLAutoSchema._typeMap[customGraphQLSchemaType.name] = customGraphQLSchemaType;
          }
        });
        Object.values(customGraphQLSchemaTypeMap).forEach(customGraphQLSchemaType => {
          if (!customGraphQLSchemaType || !customGraphQLSchemaType.name || customGraphQLSchemaType.name.startsWith('__')) {
            return;
          }

          const autoGraphQLSchemaType = this.graphQLAutoSchema.getType(customGraphQLSchemaType.name);

          if (autoGraphQLSchemaType && typeof customGraphQLSchemaType.getFields === 'function') {
            Object.values(customGraphQLSchemaType.getFields()).forEach(field => {
              findAndReplaceLastType(field, 'type');
            });
            autoGraphQLSchemaType._fields = _objectSpread(_objectSpread({}, autoGraphQLSchemaType.getFields()), customGraphQLSchemaType.getFields());
          }
        });
        this.graphQLSchema = (0, _stitch.stitchSchemas)({
          schemas: [this.graphQLSchemaDirectivesDefinitions, this.graphQLAutoSchema],
          mergeDirectives: true
        });
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9HcmFwaFFML1BhcnNlR3JhcGhRTFNjaGVtYS5qcyJdLCJuYW1lcyI6WyJSRVNFUlZFRF9HUkFQSFFMX1RZUEVfTkFNRVMiLCJSRVNFUlZFRF9HUkFQSFFMX1FVRVJZX05BTUVTIiwiUkVTRVJWRURfR1JBUEhRTF9NVVRBVElPTl9OQU1FUyIsIlBhcnNlR3JhcGhRTFNjaGVtYSIsImNvbnN0cnVjdG9yIiwicGFyYW1zIiwicGFyc2VHcmFwaFFMQ29udHJvbGxlciIsImRhdGFiYXNlQ29udHJvbGxlciIsImxvZyIsImdyYXBoUUxDdXN0b21UeXBlRGVmcyIsImFwcElkIiwibG9hZCIsInBhcnNlR3JhcGhRTENvbmZpZyIsIl9pbml0aWFsaXplU2NoZW1hQW5kQ29uZmlnIiwicGFyc2VDbGFzc2VzIiwiX2dldENsYXNzZXNGb3JTY2hlbWEiLCJwYXJzZUNsYXNzZXNTdHJpbmciLCJKU09OIiwic3RyaW5naWZ5IiwiZnVuY3Rpb25OYW1lcyIsIl9nZXRGdW5jdGlvbk5hbWVzIiwiZnVuY3Rpb25OYW1lc1N0cmluZyIsImdyYXBoUUxTY2hlbWEiLCJfaGFzU2NoZW1hSW5wdXRDaGFuZ2VkIiwicGFyc2VDbGFzc1R5cGVzIiwidmlld2VyVHlwZSIsImdyYXBoUUxBdXRvU2NoZW1hIiwiZ3JhcGhRTFR5cGVzIiwiZ3JhcGhRTFF1ZXJpZXMiLCJncmFwaFFMTXV0YXRpb25zIiwiZ3JhcGhRTFN1YnNjcmlwdGlvbnMiLCJncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zIiwiZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXMiLCJyZWxheU5vZGVJbnRlcmZhY2UiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiZGVmYXVsdFJlbGF5U2NoZW1hIiwic2NoZW1hVHlwZXMiLCJfZ2V0UGFyc2VDbGFzc2VzV2l0aENvbmZpZyIsImZvckVhY2giLCJwYXJzZUNsYXNzIiwicGFyc2VDbGFzc0NvbmZpZyIsInBhcnNlQ2xhc3NRdWVyaWVzIiwicGFyc2VDbGFzc011dGF0aW9ucyIsImxvYWRBcnJheVJlc3VsdCIsImRlZmF1bHRHcmFwaFFMUXVlcmllcyIsImRlZmF1bHRHcmFwaFFMTXV0YXRpb25zIiwiZ3JhcGhRTFF1ZXJ5IiwidW5kZWZpbmVkIiwiT2JqZWN0Iiwia2V5cyIsImxlbmd0aCIsIkdyYXBoUUxPYmplY3RUeXBlIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiZmllbGRzIiwiYWRkR3JhcGhRTFR5cGUiLCJncmFwaFFMTXV0YXRpb24iLCJncmFwaFFMU3Vic2NyaXB0aW9uIiwiR3JhcGhRTFNjaGVtYSIsInR5cGVzIiwicXVlcnkiLCJtdXRhdGlvbiIsInN1YnNjcmlwdGlvbiIsInNjaGVtYURpcmVjdGl2ZXMiLCJnZXRUeXBlTWFwIiwiY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXAiLCJmaW5kQW5kUmVwbGFjZUxhc3RUeXBlIiwicGFyZW50Iiwia2V5IiwiZ2V0VHlwZSIsIm9mVHlwZSIsInZhbHVlcyIsImN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlIiwic3RhcnRzV2l0aCIsImF1dG9HcmFwaFFMU2NoZW1hVHlwZSIsIl90eXBlTWFwIiwiZ2V0RmllbGRzIiwiZmllbGQiLCJfZmllbGRzIiwic2NoZW1hcyIsIm1lcmdlRGlyZWN0aXZlcyIsImRpcmVjdGl2ZXNEZWZpbml0aW9uc1NjaGVtYSIsImF1dG9TY2hlbWEiLCJzdGl0Y2hTY2hlbWFzIiwiZ3JhcGhRTFNjaGVtYVR5cGVNYXAiLCJncmFwaFFMU2NoZW1hVHlwZU5hbWUiLCJncmFwaFFMU2NoZW1hVHlwZSIsImRlZmluaXRpb25zIiwiZ3JhcGhRTEN1c3RvbVR5cGVEZWYiLCJmaW5kIiwiZGVmaW5pdGlvbiIsInZhbHVlIiwiZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE1hcCIsImdyYXBoUUxTY2hlbWFUeXBlRmllbGROYW1lIiwiZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZCIsImFzdE5vZGUiLCJTY2hlbWFEaXJlY3RpdmVWaXNpdG9yIiwidmlzaXRTY2hlbWFEaXJlY3RpdmVzIiwidHlwZSIsInRocm93RXJyb3IiLCJpZ25vcmVSZXNlcnZlZCIsImlnbm9yZUNvbm5lY3Rpb24iLCJpbmNsdWRlcyIsImV4aXN0aW5nVHlwZSIsImVuZHNXaXRoIiwibWVzc2FnZSIsIkVycm9yIiwid2FybiIsInB1c2giLCJhZGRHcmFwaFFMUXVlcnkiLCJmaWVsZE5hbWUiLCJhZGRHcmFwaFFMTXV0YXRpb24iLCJoYW5kbGVFcnJvciIsImVycm9yIiwiUGFyc2UiLCJzdGFjayIsInNjaGVtYUNvbnRyb2xsZXIiLCJQcm9taXNlIiwiYWxsIiwibG9hZFNjaGVtYSIsImdldEdyYXBoUUxDb25maWciLCJlbmFibGVkRm9yQ2xhc3NlcyIsImRpc2FibGVkRm9yQ2xhc3NlcyIsImFsbENsYXNzZXMiLCJnZXRBbGxDbGFzc2VzIiwiQXJyYXkiLCJpc0FycmF5IiwiaW5jbHVkZWRDbGFzc2VzIiwiZmlsdGVyIiwiY2xhenoiLCJjbGFzc05hbWUiLCJpc1VzZXJzQ2xhc3NEaXNhYmxlZCIsInNvbWUiLCJjbGFzc0NvbmZpZ3MiLCJzb3J0Q2xhc3NlcyIsImEiLCJiIiwic29ydCIsIm1hcCIsImMiLCJmdW5jdGlvbk5hbWUiLCJ0ZXN0Il0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBTUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBR0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7O0FBRUEsTUFBTUEsMkJBQTJCLEdBQUcsQ0FDbEMsUUFEa0MsRUFFbEMsU0FGa0MsRUFHbEMsS0FIa0MsRUFJbEMsT0FKa0MsRUFLbEMsSUFMa0MsRUFNbEMsYUFOa0MsRUFPbEMsT0FQa0MsRUFRbEMsVUFSa0MsRUFTbEMsY0FUa0MsRUFVbEMsaUJBVmtDLEVBV2xDLG1CQVhrQyxFQVlsQyxRQVprQyxFQWFsQyxhQWJrQyxFQWNsQyxlQWRrQyxFQWVsQyxZQWZrQyxFQWdCbEMsY0FoQmtDLEVBaUJsQyxhQWpCa0MsRUFrQmxDLGVBbEJrQyxFQW1CbEMsbUJBbkJrQyxFQW9CbEMsb0JBcEJrQyxFQXFCbEMsc0JBckJrQyxFQXNCbEMsa0JBdEJrQyxFQXVCbEMsb0JBdkJrQyxFQXdCbEMsa0JBeEJrQyxFQXlCbEMsb0JBekJrQyxFQTBCbEMsa0JBMUJrQyxFQTJCbEMsb0JBM0JrQyxFQTRCbEMsVUE1QmtDLENBQXBDO0FBOEJBLE1BQU1DLDRCQUE0QixHQUFHLENBQUMsUUFBRCxFQUFXLFFBQVgsRUFBcUIsT0FBckIsRUFBOEIsU0FBOUIsQ0FBckM7QUFDQSxNQUFNQywrQkFBK0IsR0FBRyxDQUN0QyxRQURzQyxFQUV0QyxPQUZzQyxFQUd0QyxRQUhzQyxFQUl0QyxZQUpzQyxFQUt0QyxlQUxzQyxFQU10QyxhQU5zQyxFQU90QyxhQVBzQyxFQVF0QyxhQVJzQyxDQUF4Qzs7QUFXQSxNQUFNQyxrQkFBTixDQUF5QjtBQWF2QkMsRUFBQUEsV0FBVyxDQUNUQyxNQVdDLEdBQUcsRUFaSyxFQWFUO0FBQ0EsU0FBS0Msc0JBQUwsR0FDRUQsTUFBTSxDQUFDQyxzQkFBUCxJQUNBLGdDQUFrQixxREFBbEIsQ0FGRjtBQUdBLFNBQUtDLGtCQUFMLEdBQ0VGLE1BQU0sQ0FBQ0Usa0JBQVAsSUFDQSxnQ0FBa0IsaURBQWxCLENBRkY7QUFHQSxTQUFLQyxHQUFMLEdBQ0VILE1BQU0sQ0FBQ0csR0FBUCxJQUFjLGdDQUFrQixrQ0FBbEIsQ0FEaEI7QUFFQSxTQUFLQyxxQkFBTCxHQUE2QkosTUFBTSxDQUFDSSxxQkFBcEM7QUFDQSxTQUFLQyxLQUFMLEdBQ0VMLE1BQU0sQ0FBQ0ssS0FBUCxJQUFnQixnQ0FBa0IsNkJBQWxCLENBRGxCO0FBRUQ7O0FBRUQsUUFBTUMsSUFBTixHQUFhO0FBQ1gsVUFBTTtBQUFFQyxNQUFBQTtBQUFGLFFBQXlCLE1BQU0sS0FBS0MsMEJBQUwsRUFBckM7QUFDQSxVQUFNQyxZQUFZLEdBQUcsTUFBTSxLQUFLQyxvQkFBTCxDQUEwQkgsa0JBQTFCLENBQTNCO0FBQ0EsVUFBTUksa0JBQWtCLEdBQUdDLElBQUksQ0FBQ0MsU0FBTCxDQUFlSixZQUFmLENBQTNCO0FBQ0EsVUFBTUssYUFBYSxHQUFHLE1BQU0sS0FBS0MsaUJBQUwsRUFBNUI7QUFDQSxVQUFNQyxtQkFBbUIsR0FBR0osSUFBSSxDQUFDQyxTQUFMLENBQWVDLGFBQWYsQ0FBNUI7O0FBRUEsUUFDRSxLQUFLRyxhQUFMLElBQ0EsQ0FBQyxLQUFLQyxzQkFBTCxDQUE0QjtBQUMzQlQsTUFBQUEsWUFEMkI7QUFFM0JFLE1BQUFBLGtCQUYyQjtBQUczQkosTUFBQUEsa0JBSDJCO0FBSTNCUyxNQUFBQTtBQUoyQixLQUE1QixDQUZILEVBUUU7QUFDQSxhQUFPLEtBQUtDLGFBQVo7QUFDRDs7QUFFRCxTQUFLUixZQUFMLEdBQW9CQSxZQUFwQjtBQUNBLFNBQUtFLGtCQUFMLEdBQTBCQSxrQkFBMUI7QUFDQSxTQUFLSixrQkFBTCxHQUEwQkEsa0JBQTFCO0FBQ0EsU0FBS08sYUFBTCxHQUFxQkEsYUFBckI7QUFDQSxTQUFLRSxtQkFBTCxHQUEyQkEsbUJBQTNCO0FBQ0EsU0FBS0csZUFBTCxHQUF1QixFQUF2QjtBQUNBLFNBQUtDLFVBQUwsR0FBa0IsSUFBbEI7QUFDQSxTQUFLQyxpQkFBTCxHQUF5QixJQUF6QjtBQUNBLFNBQUtKLGFBQUwsR0FBcUIsSUFBckI7QUFDQSxTQUFLSyxZQUFMLEdBQW9CLEVBQXBCO0FBQ0EsU0FBS0MsY0FBTCxHQUFzQixFQUF0QjtBQUNBLFNBQUtDLGdCQUFMLEdBQXdCLEVBQXhCO0FBQ0EsU0FBS0Msb0JBQUwsR0FBNEIsRUFBNUI7QUFDQSxTQUFLQyxrQ0FBTCxHQUEwQyxJQUExQztBQUNBLFNBQUtDLHVCQUFMLEdBQStCLEVBQS9CO0FBQ0EsU0FBS0Msa0JBQUwsR0FBMEIsSUFBMUI7QUFFQUMsSUFBQUEsbUJBQW1CLENBQUN2QixJQUFwQixDQUF5QixJQUF6QjtBQUNBd0IsSUFBQUEsa0JBQWtCLENBQUN4QixJQUFuQixDQUF3QixJQUF4QjtBQUNBeUIsSUFBQUEsV0FBVyxDQUFDekIsSUFBWixDQUFpQixJQUFqQjs7QUFFQSxTQUFLMEIsMEJBQUwsQ0FBZ0N2QixZQUFoQyxFQUE4Q0Ysa0JBQTlDLEVBQWtFMEIsT0FBbEUsQ0FDRSxDQUFDLENBQUNDLFVBQUQsRUFBYUMsZ0JBQWIsQ0FBRCxLQUFvQztBQUNsQ2hCLE1BQUFBLGVBQWUsQ0FBQ2IsSUFBaEIsQ0FBcUIsSUFBckIsRUFBMkI0QixVQUEzQixFQUF1Q0MsZ0JBQXZDO0FBQ0FDLE1BQUFBLGlCQUFpQixDQUFDOUIsSUFBbEIsQ0FBdUIsSUFBdkIsRUFBNkI0QixVQUE3QixFQUF5Q0MsZ0JBQXpDO0FBQ0FFLE1BQUFBLG1CQUFtQixDQUFDL0IsSUFBcEIsQ0FBeUIsSUFBekIsRUFBK0I0QixVQUEvQixFQUEyQ0MsZ0JBQTNDO0FBQ0QsS0FMSDs7QUFRQU4sSUFBQUEsbUJBQW1CLENBQUNTLGVBQXBCLENBQW9DLElBQXBDLEVBQTBDN0IsWUFBMUM7QUFDQThCLElBQUFBLHFCQUFxQixDQUFDakMsSUFBdEIsQ0FBMkIsSUFBM0I7QUFDQWtDLElBQUFBLHVCQUF1QixDQUFDbEMsSUFBeEIsQ0FBNkIsSUFBN0I7QUFFQSxRQUFJbUMsWUFBWSxHQUFHQyxTQUFuQjs7QUFDQSxRQUFJQyxNQUFNLENBQUNDLElBQVAsQ0FBWSxLQUFLckIsY0FBakIsRUFBaUNzQixNQUFqQyxHQUEwQyxDQUE5QyxFQUFpRDtBQUMvQ0osTUFBQUEsWUFBWSxHQUFHLElBQUlLLDBCQUFKLENBQXNCO0FBQ25DQyxRQUFBQSxJQUFJLEVBQUUsT0FENkI7QUFFbkNDLFFBQUFBLFdBQVcsRUFBRSwwQ0FGc0I7QUFHbkNDLFFBQUFBLE1BQU0sRUFBRSxLQUFLMUI7QUFIc0IsT0FBdEIsQ0FBZjtBQUtBLFdBQUsyQixjQUFMLENBQW9CVCxZQUFwQixFQUFrQyxJQUFsQyxFQUF3QyxJQUF4QztBQUNEOztBQUVELFFBQUlVLGVBQWUsR0FBR1QsU0FBdEI7O0FBQ0EsUUFBSUMsTUFBTSxDQUFDQyxJQUFQLENBQVksS0FBS3BCLGdCQUFqQixFQUFtQ3FCLE1BQW5DLEdBQTRDLENBQWhELEVBQW1EO0FBQ2pETSxNQUFBQSxlQUFlLEdBQUcsSUFBSUwsMEJBQUosQ0FBc0I7QUFDdENDLFFBQUFBLElBQUksRUFBRSxVQURnQztBQUV0Q0MsUUFBQUEsV0FBVyxFQUFFLCtDQUZ5QjtBQUd0Q0MsUUFBQUEsTUFBTSxFQUFFLEtBQUt6QjtBQUh5QixPQUF0QixDQUFsQjtBQUtBLFdBQUswQixjQUFMLENBQW9CQyxlQUFwQixFQUFxQyxJQUFyQyxFQUEyQyxJQUEzQztBQUNEOztBQUVELFFBQUlDLG1CQUFtQixHQUFHVixTQUExQjs7QUFDQSxRQUFJQyxNQUFNLENBQUNDLElBQVAsQ0FBWSxLQUFLbkIsb0JBQWpCLEVBQXVDb0IsTUFBdkMsR0FBZ0QsQ0FBcEQsRUFBdUQ7QUFDckRPLE1BQUFBLG1CQUFtQixHQUFHLElBQUlOLDBCQUFKLENBQXNCO0FBQzFDQyxRQUFBQSxJQUFJLEVBQUUsY0FEb0M7QUFFMUNDLFFBQUFBLFdBQVcsRUFBRSx1REFGNkI7QUFHMUNDLFFBQUFBLE1BQU0sRUFBRSxLQUFLeEI7QUFINkIsT0FBdEIsQ0FBdEI7QUFLQSxXQUFLeUIsY0FBTCxDQUFvQkUsbUJBQXBCLEVBQXlDLElBQXpDLEVBQStDLElBQS9DO0FBQ0Q7O0FBRUQsU0FBSy9CLGlCQUFMLEdBQXlCLElBQUlnQyxzQkFBSixDQUFrQjtBQUN6Q0MsTUFBQUEsS0FBSyxFQUFFLEtBQUtoQyxZQUQ2QjtBQUV6Q2lDLE1BQUFBLEtBQUssRUFBRWQsWUFGa0M7QUFHekNlLE1BQUFBLFFBQVEsRUFBRUwsZUFIK0I7QUFJekNNLE1BQUFBLFlBQVksRUFBRUw7QUFKMkIsS0FBbEIsQ0FBekI7O0FBT0EsUUFBSSxLQUFLaEQscUJBQVQsRUFBZ0M7QUFDOUJzRCxNQUFBQSxnQkFBZ0IsQ0FBQ3BELElBQWpCLENBQXNCLElBQXRCOztBQUVBLFVBQUksT0FBTyxLQUFLRixxQkFBTCxDQUEyQnVELFVBQWxDLEtBQWlELFVBQXJELEVBQWlFO0FBQy9ELGNBQU1DLDBCQUEwQixHQUFHLEtBQUt4RCxxQkFBTCxDQUEyQnVELFVBQTNCLEVBQW5DOztBQUNBLGNBQU1FLHNCQUFzQixHQUFHLENBQUNDLE1BQUQsRUFBU0MsR0FBVCxLQUFpQjtBQUM5QyxjQUFJRCxNQUFNLENBQUNDLEdBQUQsQ0FBTixDQUFZaEIsSUFBaEIsRUFBc0I7QUFDcEIsZ0JBQ0UsS0FBSzFCLGlCQUFMLENBQXVCMkMsT0FBdkIsQ0FBK0JGLE1BQU0sQ0FBQ0MsR0FBRCxDQUFOLENBQVloQixJQUEzQyxLQUNBLEtBQUsxQixpQkFBTCxDQUF1QjJDLE9BQXZCLENBQStCRixNQUFNLENBQUNDLEdBQUQsQ0FBTixDQUFZaEIsSUFBM0MsTUFBcURlLE1BQU0sQ0FBQ0MsR0FBRCxDQUY3RCxFQUdFO0FBQ0E7QUFDQTtBQUNBRCxjQUFBQSxNQUFNLENBQUNDLEdBQUQsQ0FBTixHQUFjLEtBQUsxQyxpQkFBTCxDQUF1QjJDLE9BQXZCLENBQStCRixNQUFNLENBQUNDLEdBQUQsQ0FBTixDQUFZaEIsSUFBM0MsQ0FBZDtBQUNEO0FBQ0YsV0FURCxNQVNPO0FBQ0wsZ0JBQUllLE1BQU0sQ0FBQ0MsR0FBRCxDQUFOLENBQVlFLE1BQWhCLEVBQXdCO0FBQ3RCSixjQUFBQSxzQkFBc0IsQ0FBQ0MsTUFBTSxDQUFDQyxHQUFELENBQVAsRUFBYyxRQUFkLENBQXRCO0FBQ0Q7QUFDRjtBQUNGLFNBZkQ7O0FBZ0JBcEIsUUFBQUEsTUFBTSxDQUFDdUIsTUFBUCxDQUFjTiwwQkFBZCxFQUEwQzNCLE9BQTFDLENBQ0drQyx1QkFBRCxJQUE2QjtBQUMzQixjQUNFLENBQUNBLHVCQUFELElBQ0EsQ0FBQ0EsdUJBQXVCLENBQUNwQixJQUR6QixJQUVBb0IsdUJBQXVCLENBQUNwQixJQUF4QixDQUE2QnFCLFVBQTdCLENBQXdDLElBQXhDLENBSEYsRUFJRTtBQUNBO0FBQ0Q7O0FBQ0QsZ0JBQU1DLHFCQUFxQixHQUFHLEtBQUtoRCxpQkFBTCxDQUF1QjJDLE9BQXZCLENBQzVCRyx1QkFBdUIsQ0FBQ3BCLElBREksQ0FBOUI7O0FBR0EsY0FBSSxDQUFDc0IscUJBQUwsRUFBNEI7QUFDMUIsaUJBQUtoRCxpQkFBTCxDQUF1QmlELFFBQXZCLENBQ0VILHVCQUF1QixDQUFDcEIsSUFEMUIsSUFFSW9CLHVCQUZKO0FBR0Q7QUFDRixTQWpCSDtBQW1CQXhCLFFBQUFBLE1BQU0sQ0FBQ3VCLE1BQVAsQ0FBY04sMEJBQWQsRUFBMEMzQixPQUExQyxDQUNHa0MsdUJBQUQsSUFBNkI7QUFDM0IsY0FDRSxDQUFDQSx1QkFBRCxJQUNBLENBQUNBLHVCQUF1QixDQUFDcEIsSUFEekIsSUFFQW9CLHVCQUF1QixDQUFDcEIsSUFBeEIsQ0FBNkJxQixVQUE3QixDQUF3QyxJQUF4QyxDQUhGLEVBSUU7QUFDQTtBQUNEOztBQUNELGdCQUFNQyxxQkFBcUIsR0FBRyxLQUFLaEQsaUJBQUwsQ0FBdUIyQyxPQUF2QixDQUM1QkcsdUJBQXVCLENBQUNwQixJQURJLENBQTlCOztBQUlBLGNBQ0VzQixxQkFBcUIsSUFDckIsT0FBT0YsdUJBQXVCLENBQUNJLFNBQS9CLEtBQTZDLFVBRi9DLEVBR0U7QUFDQTVCLFlBQUFBLE1BQU0sQ0FBQ3VCLE1BQVAsQ0FBY0MsdUJBQXVCLENBQUNJLFNBQXhCLEVBQWQsRUFBbUR0QyxPQUFuRCxDQUNHdUMsS0FBRCxJQUFXO0FBQ1RYLGNBQUFBLHNCQUFzQixDQUFDVyxLQUFELEVBQVEsTUFBUixDQUF0QjtBQUNELGFBSEg7QUFLQUgsWUFBQUEscUJBQXFCLENBQUNJLE9BQXRCLG1DQUNLSixxQkFBcUIsQ0FBQ0UsU0FBdEIsRUFETCxHQUVLSix1QkFBdUIsQ0FBQ0ksU0FBeEIsRUFGTDtBQUlEO0FBQ0YsU0EzQkg7QUE2QkEsYUFBS3RELGFBQUwsR0FBcUIsMkJBQWM7QUFDakN5RCxVQUFBQSxPQUFPLEVBQUUsQ0FDUCxLQUFLaEQsa0NBREUsRUFFUCxLQUFLTCxpQkFGRSxDQUR3QjtBQUtqQ3NELFVBQUFBLGVBQWUsRUFBRTtBQUxnQixTQUFkLENBQXJCO0FBT0QsT0F6RUQsTUF5RU8sSUFBSSxPQUFPLEtBQUt2RSxxQkFBWixLQUFzQyxVQUExQyxFQUFzRDtBQUMzRCxhQUFLYSxhQUFMLEdBQXFCLE1BQU0sS0FBS2IscUJBQUwsQ0FBMkI7QUFDcER3RSxVQUFBQSwyQkFBMkIsRUFBRSxLQUFLbEQsa0NBRGtCO0FBRXBEbUQsVUFBQUEsVUFBVSxFQUFFLEtBQUt4RCxpQkFGbUM7QUFHcER5RCxVQUFBQSxhQUFhLEVBQWJBO0FBSG9ELFNBQTNCLENBQTNCO0FBS0QsT0FOTSxNQU1BO0FBQ0wsYUFBSzdELGFBQUwsR0FBcUIsMkJBQWM7QUFDakN5RCxVQUFBQSxPQUFPLEVBQUUsQ0FDUCxLQUFLaEQsa0NBREUsRUFFUCxLQUFLTCxpQkFGRSxFQUdQLEtBQUtqQixxQkFIRSxDQUR3QjtBQU1qQ3VFLFVBQUFBLGVBQWUsRUFBRTtBQU5nQixTQUFkLENBQXJCO0FBUUQ7O0FBRUQsWUFBTUksb0JBQW9CLEdBQUcsS0FBSzlELGFBQUwsQ0FBbUIwQyxVQUFuQixFQUE3QjtBQUNBaEIsTUFBQUEsTUFBTSxDQUFDQyxJQUFQLENBQVltQyxvQkFBWixFQUFrQzlDLE9BQWxDLENBQTJDK0MscUJBQUQsSUFBMkI7QUFDbkUsY0FBTUMsaUJBQWlCLEdBQUdGLG9CQUFvQixDQUFDQyxxQkFBRCxDQUE5Qzs7QUFDQSxZQUNFLE9BQU9DLGlCQUFpQixDQUFDVixTQUF6QixLQUF1QyxVQUF2QyxJQUNBLEtBQUtuRSxxQkFBTCxDQUEyQjhFLFdBRjdCLEVBR0U7QUFDQSxnQkFBTUMsb0JBQW9CLEdBQUcsS0FBSy9FLHFCQUFMLENBQTJCOEUsV0FBM0IsQ0FBdUNFLElBQXZDLENBQzFCQyxVQUFELElBQWdCQSxVQUFVLENBQUN0QyxJQUFYLENBQWdCdUMsS0FBaEIsS0FBMEJOLHFCQURmLENBQTdCOztBQUdBLGNBQUlHLG9CQUFKLEVBQTBCO0FBQ3hCLGtCQUFNSSx5QkFBeUIsR0FBR04saUJBQWlCLENBQUNWLFNBQWxCLEVBQWxDO0FBQ0E1QixZQUFBQSxNQUFNLENBQUNDLElBQVAsQ0FBWTJDLHlCQUFaLEVBQXVDdEQsT0FBdkMsQ0FDR3VELDBCQUFELElBQWdDO0FBQzlCLG9CQUFNQyxzQkFBc0IsR0FDMUJGLHlCQUF5QixDQUFDQywwQkFBRCxDQUQzQjs7QUFFQSxrQkFBSSxDQUFDQyxzQkFBc0IsQ0FBQ0MsT0FBNUIsRUFBcUM7QUFDbkMsc0JBQU1BLE9BQU8sR0FBR1Asb0JBQW9CLENBQUNsQyxNQUFyQixDQUE0Qm1DLElBQTVCLENBQ2JaLEtBQUQsSUFBV0EsS0FBSyxDQUFDekIsSUFBTixDQUFXdUMsS0FBWCxLQUFxQkUsMEJBRGxCLENBQWhCOztBQUdBLG9CQUFJRSxPQUFKLEVBQWE7QUFDWEQsa0JBQUFBLHNCQUFzQixDQUFDQyxPQUF2QixHQUFpQ0EsT0FBakM7QUFDRDtBQUNGO0FBQ0YsYUFaSDtBQWNEO0FBQ0Y7QUFDRixPQTNCRDs7QUE2QkFDLG9DQUF1QkMscUJBQXZCLENBQ0UsS0FBSzNFLGFBRFAsRUFFRSxLQUFLVSx1QkFGUDtBQUlELEtBL0hELE1BK0hPO0FBQ0wsV0FBS1YsYUFBTCxHQUFxQixLQUFLSSxpQkFBMUI7QUFDRDs7QUFFRCxXQUFPLEtBQUtKLGFBQVo7QUFDRDs7QUFFRGlDLEVBQUFBLGNBQWMsQ0FDWjJDLElBRFksRUFFWkMsVUFBVSxHQUFHLEtBRkQsRUFHWkMsY0FBYyxHQUFHLEtBSEwsRUFJWkMsZ0JBQWdCLEdBQUcsS0FKUCxFQUtaO0FBQ0EsUUFDRyxDQUFDRCxjQUFELElBQW1CcEcsMkJBQTJCLENBQUNzRyxRQUE1QixDQUFxQ0osSUFBSSxDQUFDOUMsSUFBMUMsQ0FBcEIsSUFDQSxLQUFLekIsWUFBTCxDQUFrQjhELElBQWxCLENBQ0djLFlBQUQsSUFBa0JBLFlBQVksQ0FBQ25ELElBQWIsS0FBc0I4QyxJQUFJLENBQUM5QyxJQUQvQyxDQURBLElBSUMsQ0FBQ2lELGdCQUFELElBQXFCSCxJQUFJLENBQUM5QyxJQUFMLENBQVVvRCxRQUFWLENBQW1CLFlBQW5CLENBTHhCLEVBTUU7QUFDQSxZQUFNQyxPQUFPLEdBQUksUUFBT1AsSUFBSSxDQUFDOUMsSUFBSyxtRkFBbEM7O0FBQ0EsVUFBSStDLFVBQUosRUFBZ0I7QUFDZCxjQUFNLElBQUlPLEtBQUosQ0FBVUQsT0FBVixDQUFOO0FBQ0Q7O0FBQ0QsV0FBS2pHLEdBQUwsQ0FBU21HLElBQVQsQ0FBY0YsT0FBZDtBQUNBLGFBQU8xRCxTQUFQO0FBQ0Q7O0FBQ0QsU0FBS3BCLFlBQUwsQ0FBa0JpRixJQUFsQixDQUF1QlYsSUFBdkI7QUFDQSxXQUFPQSxJQUFQO0FBQ0Q7O0FBRURXLEVBQUFBLGVBQWUsQ0FDYkMsU0FEYSxFQUViakMsS0FGYSxFQUdic0IsVUFBVSxHQUFHLEtBSEEsRUFJYkMsY0FBYyxHQUFHLEtBSkosRUFLYjtBQUNBLFFBQ0csQ0FBQ0EsY0FBRCxJQUFtQm5HLDRCQUE0QixDQUFDcUcsUUFBN0IsQ0FBc0NRLFNBQXRDLENBQXBCLElBQ0EsS0FBS2xGLGNBQUwsQ0FBb0JrRixTQUFwQixDQUZGLEVBR0U7QUFDQSxZQUFNTCxPQUFPLEdBQUksU0FBUUssU0FBVSxvRkFBbkM7O0FBQ0EsVUFBSVgsVUFBSixFQUFnQjtBQUNkLGNBQU0sSUFBSU8sS0FBSixDQUFVRCxPQUFWLENBQU47QUFDRDs7QUFDRCxXQUFLakcsR0FBTCxDQUFTbUcsSUFBVCxDQUFjRixPQUFkO0FBQ0EsYUFBTzFELFNBQVA7QUFDRDs7QUFDRCxTQUFLbkIsY0FBTCxDQUFvQmtGLFNBQXBCLElBQWlDakMsS0FBakM7QUFDQSxXQUFPQSxLQUFQO0FBQ0Q7O0FBRURrQyxFQUFBQSxrQkFBa0IsQ0FDaEJELFNBRGdCLEVBRWhCakMsS0FGZ0IsRUFHaEJzQixVQUFVLEdBQUcsS0FIRyxFQUloQkMsY0FBYyxHQUFHLEtBSkQsRUFLaEI7QUFDQSxRQUNHLENBQUNBLGNBQUQsSUFDQ2xHLCtCQUErQixDQUFDb0csUUFBaEMsQ0FBeUNRLFNBQXpDLENBREYsSUFFQSxLQUFLakYsZ0JBQUwsQ0FBc0JpRixTQUF0QixDQUhGLEVBSUU7QUFDQSxZQUFNTCxPQUFPLEdBQUksWUFBV0ssU0FBVSxvRkFBdEM7O0FBQ0EsVUFBSVgsVUFBSixFQUFnQjtBQUNkLGNBQU0sSUFBSU8sS0FBSixDQUFVRCxPQUFWLENBQU47QUFDRDs7QUFDRCxXQUFLakcsR0FBTCxDQUFTbUcsSUFBVCxDQUFjRixPQUFkO0FBQ0EsYUFBTzFELFNBQVA7QUFDRDs7QUFDRCxTQUFLbEIsZ0JBQUwsQ0FBc0JpRixTQUF0QixJQUFtQ2pDLEtBQW5DO0FBQ0EsV0FBT0EsS0FBUDtBQUNEOztBQUVEbUMsRUFBQUEsV0FBVyxDQUFDQyxLQUFELEVBQVE7QUFDakIsUUFBSUEsS0FBSyxZQUFZQyxjQUFNUixLQUEzQixFQUFrQztBQUNoQyxXQUFLbEcsR0FBTCxDQUFTeUcsS0FBVCxDQUFlLGVBQWYsRUFBZ0NBLEtBQWhDO0FBQ0QsS0FGRCxNQUVPO0FBQ0wsV0FBS3pHLEdBQUwsQ0FBU3lHLEtBQVQsQ0FBZSxpQ0FBZixFQUFrREEsS0FBbEQsRUFBeURBLEtBQUssQ0FBQ0UsS0FBL0Q7QUFDRDs7QUFDRCxVQUFNLHVDQUFlRixLQUFmLENBQU47QUFDRDs7QUFFRCxRQUFNcEcsMEJBQU4sR0FBbUM7QUFDakMsVUFBTSxDQUFDdUcsZ0JBQUQsRUFBbUJ4RyxrQkFBbkIsSUFBeUMsTUFBTXlHLE9BQU8sQ0FBQ0MsR0FBUixDQUFZLENBQy9ELEtBQUsvRyxrQkFBTCxDQUF3QmdILFVBQXhCLEVBRCtELEVBRS9ELEtBQUtqSCxzQkFBTCxDQUE0QmtILGdCQUE1QixFQUYrRCxDQUFaLENBQXJEO0FBS0EsU0FBS0osZ0JBQUwsR0FBd0JBLGdCQUF4QjtBQUVBLFdBQU87QUFDTHhHLE1BQUFBO0FBREssS0FBUDtBQUdEO0FBRUQ7Ozs7OztBQUlBLFFBQU1HLG9CQUFOLENBQTJCSCxrQkFBM0IsRUFBbUU7QUFDakUsVUFBTTtBQUFFNkcsTUFBQUEsaUJBQUY7QUFBcUJDLE1BQUFBO0FBQXJCLFFBQTRDOUcsa0JBQWxEO0FBQ0EsVUFBTStHLFVBQVUsR0FBRyxNQUFNLEtBQUtQLGdCQUFMLENBQXNCUSxhQUF0QixFQUF6Qjs7QUFFQSxRQUFJQyxLQUFLLENBQUNDLE9BQU4sQ0FBY0wsaUJBQWQsS0FBb0NJLEtBQUssQ0FBQ0MsT0FBTixDQUFjSixrQkFBZCxDQUF4QyxFQUEyRTtBQUN6RSxVQUFJSyxlQUFlLEdBQUdKLFVBQXRCOztBQUNBLFVBQUlGLGlCQUFKLEVBQXVCO0FBQ3JCTSxRQUFBQSxlQUFlLEdBQUdKLFVBQVUsQ0FBQ0ssTUFBWCxDQUFtQkMsS0FBRCxJQUFXO0FBQzdDLGlCQUFPUixpQkFBaUIsQ0FBQ25CLFFBQWxCLENBQTJCMkIsS0FBSyxDQUFDQyxTQUFqQyxDQUFQO0FBQ0QsU0FGaUIsQ0FBbEI7QUFHRDs7QUFDRCxVQUFJUixrQkFBSixFQUF3QjtBQUN0QjtBQUNBO0FBQ0E7QUFDQUssUUFBQUEsZUFBZSxHQUFHQSxlQUFlLENBQUNDLE1BQWhCLENBQXdCQyxLQUFELElBQVc7QUFDbEQsaUJBQU8sQ0FBQ1Asa0JBQWtCLENBQUNwQixRQUFuQixDQUE0QjJCLEtBQUssQ0FBQ0MsU0FBbEMsQ0FBUjtBQUNELFNBRmlCLENBQWxCO0FBR0Q7O0FBRUQsV0FBS0Msb0JBQUwsR0FBNEIsQ0FBQ0osZUFBZSxDQUFDSyxJQUFoQixDQUFzQkgsS0FBRCxJQUFXO0FBQzNELGVBQU9BLEtBQUssQ0FBQ0MsU0FBTixLQUFvQixPQUEzQjtBQUNELE9BRjRCLENBQTdCO0FBSUEsYUFBT0gsZUFBUDtBQUNELEtBckJELE1BcUJPO0FBQ0wsYUFBT0osVUFBUDtBQUNEO0FBQ0Y7QUFFRDs7Ozs7OztBQUtBdEYsRUFBQUEsMEJBQTBCLENBQ3hCdkIsWUFEd0IsRUFFeEJGLGtCQUZ3QixFQUd4QjtBQUNBLFVBQU07QUFBRXlILE1BQUFBO0FBQUYsUUFBbUJ6SCxrQkFBekIsQ0FEQSxDQUdBO0FBQ0E7O0FBQ0EsVUFBTTBILFdBQVcsR0FBRyxDQUFDQyxDQUFELEVBQUlDLENBQUosS0FBVTtBQUM1QkQsTUFBQUEsQ0FBQyxHQUFHQSxDQUFDLENBQUNMLFNBQU47QUFDQU0sTUFBQUEsQ0FBQyxHQUFHQSxDQUFDLENBQUNOLFNBQU47O0FBQ0EsVUFBSUssQ0FBQyxDQUFDLENBQUQsQ0FBRCxLQUFTLEdBQWIsRUFBa0I7QUFDaEIsWUFBSUMsQ0FBQyxDQUFDLENBQUQsQ0FBRCxLQUFTLEdBQWIsRUFBa0I7QUFDaEIsaUJBQU8sQ0FBQyxDQUFSO0FBQ0Q7QUFDRjs7QUFDRCxVQUFJQSxDQUFDLENBQUMsQ0FBRCxDQUFELEtBQVMsR0FBYixFQUFrQjtBQUNoQixZQUFJRCxDQUFDLENBQUMsQ0FBRCxDQUFELEtBQVMsR0FBYixFQUFrQjtBQUNoQixpQkFBTyxDQUFQO0FBQ0Q7QUFDRjs7QUFDRCxVQUFJQSxDQUFDLEtBQUtDLENBQVYsRUFBYTtBQUNYLGVBQU8sQ0FBUDtBQUNELE9BRkQsTUFFTyxJQUFJRCxDQUFDLEdBQUdDLENBQVIsRUFBVztBQUNoQixlQUFPLENBQUMsQ0FBUjtBQUNELE9BRk0sTUFFQTtBQUNMLGVBQU8sQ0FBUDtBQUNEO0FBQ0YsS0FwQkQ7O0FBc0JBLFdBQU8xSCxZQUFZLENBQUMySCxJQUFiLENBQWtCSCxXQUFsQixFQUErQkksR0FBL0IsQ0FBb0NuRyxVQUFELElBQWdCO0FBQ3hELFVBQUlDLGdCQUFKOztBQUNBLFVBQUk2RixZQUFKLEVBQWtCO0FBQ2hCN0YsUUFBQUEsZ0JBQWdCLEdBQUc2RixZQUFZLENBQUM1QyxJQUFiLENBQ2hCa0QsQ0FBRCxJQUFPQSxDQUFDLENBQUNULFNBQUYsS0FBZ0IzRixVQUFVLENBQUMyRixTQURqQixDQUFuQjtBQUdEOztBQUNELGFBQU8sQ0FBQzNGLFVBQUQsRUFBYUMsZ0JBQWIsQ0FBUDtBQUNELEtBUk0sQ0FBUDtBQVNEOztBQUVELFFBQU1wQixpQkFBTixHQUEwQjtBQUN4QixXQUFPLE1BQU0sZ0NBQWlCLEtBQUtWLEtBQXRCLEVBQTZCc0gsTUFBN0IsQ0FBcUNZLFlBQUQsSUFBa0I7QUFDakUsVUFBSSwyQkFBMkJDLElBQTNCLENBQWdDRCxZQUFoQyxDQUFKLEVBQW1EO0FBQ2pELGVBQU8sSUFBUDtBQUNELE9BRkQsTUFFTztBQUNMLGFBQUtwSSxHQUFMLENBQVNtRyxJQUFULENBQ0csWUFBV2lDLFlBQWEscUdBRDNCO0FBR0EsZUFBTyxLQUFQO0FBQ0Q7QUFDRixLQVRZLENBQWI7QUFVRDtBQUVEOzs7Ozs7OztBQU1BckgsRUFBQUEsc0JBQXNCLENBQUNsQixNQUFELEVBS1Y7QUFDVixVQUFNO0FBQ0pTLE1BQUFBLFlBREk7QUFFSkUsTUFBQUEsa0JBRkk7QUFHSkosTUFBQUEsa0JBSEk7QUFJSlMsTUFBQUE7QUFKSSxRQUtGaEIsTUFMSjs7QUFPQSxRQUNFWSxJQUFJLENBQUNDLFNBQUwsQ0FBZSxLQUFLTixrQkFBcEIsTUFDRUssSUFBSSxDQUFDQyxTQUFMLENBQWVOLGtCQUFmLENBREYsSUFFQSxLQUFLUyxtQkFBTCxLQUE2QkEsbUJBSC9CLEVBSUU7QUFDQSxVQUFJLEtBQUtQLFlBQUwsS0FBc0JBLFlBQTFCLEVBQXdDO0FBQ3RDLGVBQU8sS0FBUDtBQUNEOztBQUVELFVBQUksS0FBS0Usa0JBQUwsS0FBNEJBLGtCQUFoQyxFQUFvRDtBQUNsRCxhQUFLRixZQUFMLEdBQW9CQSxZQUFwQjtBQUNBLGVBQU8sS0FBUDtBQUNEO0FBQ0Y7O0FBRUQsV0FBTyxJQUFQO0FBQ0Q7O0FBaGVzQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7XG4gIEdyYXBoUUxTY2hlbWEsXG4gIEdyYXBoUUxPYmplY3RUeXBlLFxuICBEb2N1bWVudE5vZGUsXG4gIEdyYXBoUUxOYW1lZFR5cGUsXG59IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgc3RpdGNoU2NoZW1hcyB9IGZyb20gJ0BncmFwaHFsLXRvb2xzL3N0aXRjaCc7XG5pbXBvcnQgeyBTY2hlbWFEaXJlY3RpdmVWaXNpdG9yIH0gZnJvbSAnQGdyYXBocWwtdG9vbHMvdXRpbHMnO1xuaW1wb3J0IHJlcXVpcmVkUGFyYW1ldGVyIGZyb20gJy4uL3JlcXVpcmVkUGFyYW1ldGVyJztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMVHlwZXMgZnJvbSAnLi9sb2FkZXJzL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0ICogYXMgcGFyc2VDbGFzc1R5cGVzIGZyb20gJy4vbG9hZGVycy9wYXJzZUNsYXNzVHlwZXMnO1xuaW1wb3J0ICogYXMgcGFyc2VDbGFzc1F1ZXJpZXMgZnJvbSAnLi9sb2FkZXJzL3BhcnNlQ2xhc3NRdWVyaWVzJztcbmltcG9ydCAqIGFzIHBhcnNlQ2xhc3NNdXRhdGlvbnMgZnJvbSAnLi9sb2FkZXJzL3BhcnNlQ2xhc3NNdXRhdGlvbnMnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxRdWVyaWVzIGZyb20gJy4vbG9hZGVycy9kZWZhdWx0R3JhcGhRTFF1ZXJpZXMnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxNdXRhdGlvbnMgZnJvbSAnLi9sb2FkZXJzL2RlZmF1bHRHcmFwaFFMTXV0YXRpb25zJztcbmltcG9ydCBQYXJzZUdyYXBoUUxDb250cm9sbGVyLCB7XG4gIFBhcnNlR3JhcGhRTENvbmZpZyxcbn0gZnJvbSAnLi4vQ29udHJvbGxlcnMvUGFyc2VHcmFwaFFMQ29udHJvbGxlcic7XG5pbXBvcnQgRGF0YWJhc2VDb250cm9sbGVyIGZyb20gJy4uL0NvbnRyb2xsZXJzL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgeyB0b0dyYXBoUUxFcnJvciB9IGZyb20gJy4vcGFyc2VHcmFwaFFMVXRpbHMnO1xuaW1wb3J0ICogYXMgc2NoZW1hRGlyZWN0aXZlcyBmcm9tICcuL2xvYWRlcnMvc2NoZW1hRGlyZWN0aXZlcyc7XG5pbXBvcnQgKiBhcyBzY2hlbWFUeXBlcyBmcm9tICcuL2xvYWRlcnMvc2NoZW1hVHlwZXMnO1xuaW1wb3J0IHsgZ2V0RnVuY3Rpb25OYW1lcyB9IGZyb20gJy4uL3RyaWdnZXJzJztcbmltcG9ydCAqIGFzIGRlZmF1bHRSZWxheVNjaGVtYSBmcm9tICcuL2xvYWRlcnMvZGVmYXVsdFJlbGF5U2NoZW1hJztcblxuY29uc3QgUkVTRVJWRURfR1JBUEhRTF9UWVBFX05BTUVTID0gW1xuICAnU3RyaW5nJyxcbiAgJ0Jvb2xlYW4nLFxuICAnSW50JyxcbiAgJ0Zsb2F0JyxcbiAgJ0lEJyxcbiAgJ0FycmF5UmVzdWx0JyxcbiAgJ1F1ZXJ5JyxcbiAgJ011dGF0aW9uJyxcbiAgJ1N1YnNjcmlwdGlvbicsXG4gICdDcmVhdGVGaWxlSW5wdXQnLFxuICAnQ3JlYXRlRmlsZVBheWxvYWQnLFxuICAnVmlld2VyJyxcbiAgJ1NpZ25VcElucHV0JyxcbiAgJ1NpZ25VcFBheWxvYWQnLFxuICAnTG9nSW5JbnB1dCcsXG4gICdMb2dJblBheWxvYWQnLFxuICAnTG9nT3V0SW5wdXQnLFxuICAnTG9nT3V0UGF5bG9hZCcsXG4gICdDbG91ZENvZGVGdW5jdGlvbicsXG4gICdDYWxsQ2xvdWRDb2RlSW5wdXQnLFxuICAnQ2FsbENsb3VkQ29kZVBheWxvYWQnLFxuICAnQ3JlYXRlQ2xhc3NJbnB1dCcsXG4gICdDcmVhdGVDbGFzc1BheWxvYWQnLFxuICAnVXBkYXRlQ2xhc3NJbnB1dCcsXG4gICdVcGRhdGVDbGFzc1BheWxvYWQnLFxuICAnRGVsZXRlQ2xhc3NJbnB1dCcsXG4gICdEZWxldGVDbGFzc1BheWxvYWQnLFxuICAnUGFnZUluZm8nLFxuXTtcbmNvbnN0IFJFU0VSVkVEX0dSQVBIUUxfUVVFUllfTkFNRVMgPSBbJ2hlYWx0aCcsICd2aWV3ZXInLCAnY2xhc3MnLCAnY2xhc3NlcyddO1xuY29uc3QgUkVTRVJWRURfR1JBUEhRTF9NVVRBVElPTl9OQU1FUyA9IFtcbiAgJ3NpZ25VcCcsXG4gICdsb2dJbicsXG4gICdsb2dPdXQnLFxuICAnY3JlYXRlRmlsZScsXG4gICdjYWxsQ2xvdWRDb2RlJyxcbiAgJ2NyZWF0ZUNsYXNzJyxcbiAgJ3VwZGF0ZUNsYXNzJyxcbiAgJ2RlbGV0ZUNsYXNzJyxcbl07XG5cbmNsYXNzIFBhcnNlR3JhcGhRTFNjaGVtYSB7XG4gIGRhdGFiYXNlQ29udHJvbGxlcjogRGF0YWJhc2VDb250cm9sbGVyO1xuICBwYXJzZUdyYXBoUUxDb250cm9sbGVyOiBQYXJzZUdyYXBoUUxDb250cm9sbGVyO1xuICBwYXJzZUdyYXBoUUxDb25maWc6IFBhcnNlR3JhcGhRTENvbmZpZztcbiAgbG9nOiBhbnk7XG4gIGFwcElkOiBzdHJpbmc7XG4gIGdyYXBoUUxDdXN0b21UeXBlRGVmczogPyhcbiAgICB8IHN0cmluZ1xuICAgIHwgR3JhcGhRTFNjaGVtYVxuICAgIHwgRG9jdW1lbnROb2RlXG4gICAgfCBHcmFwaFFMTmFtZWRUeXBlW11cbiAgKTtcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwYXJhbXM6IHtcbiAgICAgIGRhdGFiYXNlQ29udHJvbGxlcjogRGF0YWJhc2VDb250cm9sbGVyLFxuICAgICAgcGFyc2VHcmFwaFFMQ29udHJvbGxlcjogUGFyc2VHcmFwaFFMQ29udHJvbGxlcixcbiAgICAgIGxvZzogYW55LFxuICAgICAgYXBwSWQ6IHN0cmluZyxcbiAgICAgIGdyYXBoUUxDdXN0b21UeXBlRGVmczogPyhcbiAgICAgICAgfCBzdHJpbmdcbiAgICAgICAgfCBHcmFwaFFMU2NoZW1hXG4gICAgICAgIHwgRG9jdW1lbnROb2RlXG4gICAgICAgIHwgR3JhcGhRTE5hbWVkVHlwZVtdXG4gICAgICApLFxuICAgIH0gPSB7fVxuICApIHtcbiAgICB0aGlzLnBhcnNlR3JhcGhRTENvbnRyb2xsZXIgPVxuICAgICAgcGFyYW1zLnBhcnNlR3JhcGhRTENvbnRyb2xsZXIgfHxcbiAgICAgIHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgcGFyc2VHcmFwaFFMQ29udHJvbGxlciBpbnN0YW5jZSEnKTtcbiAgICB0aGlzLmRhdGFiYXNlQ29udHJvbGxlciA9XG4gICAgICBwYXJhbXMuZGF0YWJhc2VDb250cm9sbGVyIHx8XG4gICAgICByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIGRhdGFiYXNlQ29udHJvbGxlciBpbnN0YW5jZSEnKTtcbiAgICB0aGlzLmxvZyA9XG4gICAgICBwYXJhbXMubG9nIHx8IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgbG9nIGluc3RhbmNlIScpO1xuICAgIHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID0gcGFyYW1zLmdyYXBoUUxDdXN0b21UeXBlRGVmcztcbiAgICB0aGlzLmFwcElkID1cbiAgICAgIHBhcmFtcy5hcHBJZCB8fCByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSB0aGUgYXBwSWQhJyk7XG4gIH1cblxuICBhc3luYyBsb2FkKCkge1xuICAgIGNvbnN0IHsgcGFyc2VHcmFwaFFMQ29uZmlnIH0gPSBhd2FpdCB0aGlzLl9pbml0aWFsaXplU2NoZW1hQW5kQ29uZmlnKCk7XG4gICAgY29uc3QgcGFyc2VDbGFzc2VzID0gYXdhaXQgdGhpcy5fZ2V0Q2xhc3Nlc0ZvclNjaGVtYShwYXJzZUdyYXBoUUxDb25maWcpO1xuICAgIGNvbnN0IHBhcnNlQ2xhc3Nlc1N0cmluZyA9IEpTT04uc3RyaW5naWZ5KHBhcnNlQ2xhc3Nlcyk7XG4gICAgY29uc3QgZnVuY3Rpb25OYW1lcyA9IGF3YWl0IHRoaXMuX2dldEZ1bmN0aW9uTmFtZXMoKTtcbiAgICBjb25zdCBmdW5jdGlvbk5hbWVzU3RyaW5nID0gSlNPTi5zdHJpbmdpZnkoZnVuY3Rpb25OYW1lcyk7XG5cbiAgICBpZiAoXG4gICAgICB0aGlzLmdyYXBoUUxTY2hlbWEgJiZcbiAgICAgICF0aGlzLl9oYXNTY2hlbWFJbnB1dENoYW5nZWQoe1xuICAgICAgICBwYXJzZUNsYXNzZXMsXG4gICAgICAgIHBhcnNlQ2xhc3Nlc1N0cmluZyxcbiAgICAgICAgcGFyc2VHcmFwaFFMQ29uZmlnLFxuICAgICAgICBmdW5jdGlvbk5hbWVzU3RyaW5nLFxuICAgICAgfSlcbiAgICApIHtcbiAgICAgIHJldHVybiB0aGlzLmdyYXBoUUxTY2hlbWE7XG4gICAgfVxuXG4gICAgdGhpcy5wYXJzZUNsYXNzZXMgPSBwYXJzZUNsYXNzZXM7XG4gICAgdGhpcy5wYXJzZUNsYXNzZXNTdHJpbmcgPSBwYXJzZUNsYXNzZXNTdHJpbmc7XG4gICAgdGhpcy5wYXJzZUdyYXBoUUxDb25maWcgPSBwYXJzZUdyYXBoUUxDb25maWc7XG4gICAgdGhpcy5mdW5jdGlvbk5hbWVzID0gZnVuY3Rpb25OYW1lcztcbiAgICB0aGlzLmZ1bmN0aW9uTmFtZXNTdHJpbmcgPSBmdW5jdGlvbk5hbWVzU3RyaW5nO1xuICAgIHRoaXMucGFyc2VDbGFzc1R5cGVzID0ge307XG4gICAgdGhpcy52aWV3ZXJUeXBlID0gbnVsbDtcbiAgICB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hID0gbnVsbDtcbiAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSBudWxsO1xuICAgIHRoaXMuZ3JhcGhRTFR5cGVzID0gW107XG4gICAgdGhpcy5ncmFwaFFMUXVlcmllcyA9IHt9O1xuICAgIHRoaXMuZ3JhcGhRTE11dGF0aW9ucyA9IHt9O1xuICAgIHRoaXMuZ3JhcGhRTFN1YnNjcmlwdGlvbnMgPSB7fTtcbiAgICB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzRGVmaW5pdGlvbnMgPSBudWxsO1xuICAgIHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXMgPSB7fTtcbiAgICB0aGlzLnJlbGF5Tm9kZUludGVyZmFjZSA9IG51bGw7XG5cbiAgICBkZWZhdWx0R3JhcGhRTFR5cGVzLmxvYWQodGhpcyk7XG4gICAgZGVmYXVsdFJlbGF5U2NoZW1hLmxvYWQodGhpcyk7XG4gICAgc2NoZW1hVHlwZXMubG9hZCh0aGlzKTtcblxuICAgIHRoaXMuX2dldFBhcnNlQ2xhc3Nlc1dpdGhDb25maWcocGFyc2VDbGFzc2VzLCBwYXJzZUdyYXBoUUxDb25maWcpLmZvckVhY2goXG4gICAgICAoW3BhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWddKSA9PiB7XG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlcy5sb2FkKHRoaXMsIHBhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWcpO1xuICAgICAgICBwYXJzZUNsYXNzUXVlcmllcy5sb2FkKHRoaXMsIHBhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWcpO1xuICAgICAgICBwYXJzZUNsYXNzTXV0YXRpb25zLmxvYWQodGhpcywgcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZyk7XG4gICAgICB9XG4gICAgKTtcblxuICAgIGRlZmF1bHRHcmFwaFFMVHlwZXMubG9hZEFycmF5UmVzdWx0KHRoaXMsIHBhcnNlQ2xhc3Nlcyk7XG4gICAgZGVmYXVsdEdyYXBoUUxRdWVyaWVzLmxvYWQodGhpcyk7XG4gICAgZGVmYXVsdEdyYXBoUUxNdXRhdGlvbnMubG9hZCh0aGlzKTtcblxuICAgIGxldCBncmFwaFFMUXVlcnkgPSB1bmRlZmluZWQ7XG4gICAgaWYgKE9iamVjdC5rZXlzKHRoaXMuZ3JhcGhRTFF1ZXJpZXMpLmxlbmd0aCA+IDApIHtcbiAgICAgIGdyYXBoUUxRdWVyeSA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgICAgIG5hbWU6ICdRdWVyeScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnUXVlcnkgaXMgdGhlIHRvcCBsZXZlbCB0eXBlIGZvciBxdWVyaWVzLicsXG4gICAgICAgIGZpZWxkczogdGhpcy5ncmFwaFFMUXVlcmllcyxcbiAgICAgIH0pO1xuICAgICAgdGhpcy5hZGRHcmFwaFFMVHlwZShncmFwaFFMUXVlcnksIHRydWUsIHRydWUpO1xuICAgIH1cblxuICAgIGxldCBncmFwaFFMTXV0YXRpb24gPSB1bmRlZmluZWQ7XG4gICAgaWYgKE9iamVjdC5rZXlzKHRoaXMuZ3JhcGhRTE11dGF0aW9ucykubGVuZ3RoID4gMCkge1xuICAgICAgZ3JhcGhRTE11dGF0aW9uID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICAgICAgbmFtZTogJ011dGF0aW9uJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdNdXRhdGlvbiBpcyB0aGUgdG9wIGxldmVsIHR5cGUgZm9yIG11dGF0aW9ucy4nLFxuICAgICAgICBmaWVsZHM6IHRoaXMuZ3JhcGhRTE11dGF0aW9ucyxcbiAgICAgIH0pO1xuICAgICAgdGhpcy5hZGRHcmFwaFFMVHlwZShncmFwaFFMTXV0YXRpb24sIHRydWUsIHRydWUpO1xuICAgIH1cblxuICAgIGxldCBncmFwaFFMU3Vic2NyaXB0aW9uID0gdW5kZWZpbmVkO1xuICAgIGlmIChPYmplY3Qua2V5cyh0aGlzLmdyYXBoUUxTdWJzY3JpcHRpb25zKS5sZW5ndGggPiAwKSB7XG4gICAgICBncmFwaFFMU3Vic2NyaXB0aW9uID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICAgICAgbmFtZTogJ1N1YnNjcmlwdGlvbicsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnU3Vic2NyaXB0aW9uIGlzIHRoZSB0b3AgbGV2ZWwgdHlwZSBmb3Igc3Vic2NyaXB0aW9ucy4nLFxuICAgICAgICBmaWVsZHM6IHRoaXMuZ3JhcGhRTFN1YnNjcmlwdGlvbnMsXG4gICAgICB9KTtcbiAgICAgIHRoaXMuYWRkR3JhcGhRTFR5cGUoZ3JhcGhRTFN1YnNjcmlwdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYSA9IG5ldyBHcmFwaFFMU2NoZW1hKHtcbiAgICAgIHR5cGVzOiB0aGlzLmdyYXBoUUxUeXBlcyxcbiAgICAgIHF1ZXJ5OiBncmFwaFFMUXVlcnksXG4gICAgICBtdXRhdGlvbjogZ3JhcGhRTE11dGF0aW9uLFxuICAgICAgc3Vic2NyaXB0aW9uOiBncmFwaFFMU3Vic2NyaXB0aW9uLFxuICAgIH0pO1xuXG4gICAgaWYgKHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzKSB7XG4gICAgICBzY2hlbWFEaXJlY3RpdmVzLmxvYWQodGhpcyk7XG5cbiAgICAgIGlmICh0eXBlb2YgdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMuZ2V0VHlwZU1hcCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBjb25zdCBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZU1hcCA9IHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLmdldFR5cGVNYXAoKTtcbiAgICAgICAgY29uc3QgZmluZEFuZFJlcGxhY2VMYXN0VHlwZSA9IChwYXJlbnQsIGtleSkgPT4ge1xuICAgICAgICAgIGlmIChwYXJlbnRba2V5XS5uYW1lKSB7XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgIHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuZ2V0VHlwZShwYXJlbnRba2V5XS5uYW1lKSAmJlxuICAgICAgICAgICAgICB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLmdldFR5cGUocGFyZW50W2tleV0ubmFtZSkgIT09IHBhcmVudFtrZXldXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgLy8gVG8gYXZvaWQgdW5yZXNvbHZlZCBmaWVsZCBvbiBvdmVybG9hZGVkIHNjaGVtYVxuICAgICAgICAgICAgICAvLyByZXBsYWNlIHRoZSBmaW5hbCB0eXBlIHdpdGggdGhlIGF1dG8gc2NoZW1hIG9uZVxuICAgICAgICAgICAgICBwYXJlbnRba2V5XSA9IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuZ2V0VHlwZShwYXJlbnRba2V5XS5uYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKHBhcmVudFtrZXldLm9mVHlwZSkge1xuICAgICAgICAgICAgICBmaW5kQW5kUmVwbGFjZUxhc3RUeXBlKHBhcmVudFtrZXldLCAnb2ZUeXBlJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICBPYmplY3QudmFsdWVzKGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlTWFwKS5mb3JFYWNoKFxuICAgICAgICAgIChjdXN0b21HcmFwaFFMU2NoZW1hVHlwZSkgPT4ge1xuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAhY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUgfHxcbiAgICAgICAgICAgICAgIWN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWUgfHxcbiAgICAgICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZS5zdGFydHNXaXRoKCdfXycpXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYXV0b0dyYXBoUUxTY2hlbWFUeXBlID0gdGhpcy5ncmFwaFFMQXV0b1NjaGVtYS5nZXRUeXBlKFxuICAgICAgICAgICAgICBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgaWYgKCFhdXRvR3JhcGhRTFNjaGVtYVR5cGUpIHtcbiAgICAgICAgICAgICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYS5fdHlwZU1hcFtcbiAgICAgICAgICAgICAgICBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lXG4gICAgICAgICAgICAgIF0gPSBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICk7XG4gICAgICAgIE9iamVjdC52YWx1ZXMoY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXApLmZvckVhY2goXG4gICAgICAgICAgKGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlKSA9PiB7XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICFjdXN0b21HcmFwaFFMU2NoZW1hVHlwZSB8fFxuICAgICAgICAgICAgICAhY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZSB8fFxuICAgICAgICAgICAgICBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lLnN0YXJ0c1dpdGgoJ19fJylcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBhdXRvR3JhcGhRTFNjaGVtYVR5cGUgPSB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLmdldFR5cGUoXG4gICAgICAgICAgICAgIGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWVcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgYXV0b0dyYXBoUUxTY2hlbWFUeXBlICYmXG4gICAgICAgICAgICAgIHR5cGVvZiBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5nZXRGaWVsZHMgPT09ICdmdW5jdGlvbidcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICBPYmplY3QudmFsdWVzKGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLmdldEZpZWxkcygpKS5mb3JFYWNoKFxuICAgICAgICAgICAgICAgIChmaWVsZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgZmluZEFuZFJlcGxhY2VMYXN0VHlwZShmaWVsZCwgJ3R5cGUnKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIGF1dG9HcmFwaFFMU2NoZW1hVHlwZS5fZmllbGRzID0ge1xuICAgICAgICAgICAgICAgIC4uLmF1dG9HcmFwaFFMU2NoZW1hVHlwZS5nZXRGaWVsZHMoKSxcbiAgICAgICAgICAgICAgICAuLi5jdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5nZXRGaWVsZHMoKSxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICk7XG4gICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSA9IHN0aXRjaFNjaGVtYXMoe1xuICAgICAgICAgIHNjaGVtYXM6IFtcbiAgICAgICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXNEZWZpbml0aW9ucyxcbiAgICAgICAgICAgIHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEsXG4gICAgICAgICAgXSxcbiAgICAgICAgICBtZXJnZURpcmVjdGl2ZXM6IHRydWUsXG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hID0gYXdhaXQgdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMoe1xuICAgICAgICAgIGRpcmVjdGl2ZXNEZWZpbml0aW9uc1NjaGVtYTogdGhpcy5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zLFxuICAgICAgICAgIGF1dG9TY2hlbWE6IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEsXG4gICAgICAgICAgc3RpdGNoU2NoZW1hcyxcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSBzdGl0Y2hTY2hlbWFzKHtcbiAgICAgICAgICBzY2hlbWFzOiBbXG4gICAgICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzRGVmaW5pdGlvbnMsXG4gICAgICAgICAgICB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLFxuICAgICAgICAgICAgdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMsXG4gICAgICAgICAgXSxcbiAgICAgICAgICBtZXJnZURpcmVjdGl2ZXM6IHRydWUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBncmFwaFFMU2NoZW1hVHlwZU1hcCA9IHRoaXMuZ3JhcGhRTFNjaGVtYS5nZXRUeXBlTWFwKCk7XG4gICAgICBPYmplY3Qua2V5cyhncmFwaFFMU2NoZW1hVHlwZU1hcCkuZm9yRWFjaCgoZ3JhcGhRTFNjaGVtYVR5cGVOYW1lKSA9PiB7XG4gICAgICAgIGNvbnN0IGdyYXBoUUxTY2hlbWFUeXBlID0gZ3JhcGhRTFNjaGVtYVR5cGVNYXBbZ3JhcGhRTFNjaGVtYVR5cGVOYW1lXTtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHR5cGVvZiBncmFwaFFMU2NoZW1hVHlwZS5nZXRGaWVsZHMgPT09ICdmdW5jdGlvbicgJiZcbiAgICAgICAgICB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcy5kZWZpbml0aW9uc1xuICAgICAgICApIHtcbiAgICAgICAgICBjb25zdCBncmFwaFFMQ3VzdG9tVHlwZURlZiA9IHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLmRlZmluaXRpb25zLmZpbmQoXG4gICAgICAgICAgICAoZGVmaW5pdGlvbikgPT4gZGVmaW5pdGlvbi5uYW1lLnZhbHVlID09PSBncmFwaFFMU2NoZW1hVHlwZU5hbWVcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmIChncmFwaFFMQ3VzdG9tVHlwZURlZikge1xuICAgICAgICAgICAgY29uc3QgZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE1hcCA9IGdyYXBoUUxTY2hlbWFUeXBlLmdldEZpZWxkcygpO1xuICAgICAgICAgICAgT2JqZWN0LmtleXMoZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE1hcCkuZm9yRWFjaChcbiAgICAgICAgICAgICAgKGdyYXBoUUxTY2hlbWFUeXBlRmllbGROYW1lKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZCA9XG4gICAgICAgICAgICAgICAgICBncmFwaFFMU2NoZW1hVHlwZUZpZWxkTWFwW2dyYXBoUUxTY2hlbWFUeXBlRmllbGROYW1lXTtcbiAgICAgICAgICAgICAgICBpZiAoIWdyYXBoUUxTY2hlbWFUeXBlRmllbGQuYXN0Tm9kZSkge1xuICAgICAgICAgICAgICAgICAgY29uc3QgYXN0Tm9kZSA9IGdyYXBoUUxDdXN0b21UeXBlRGVmLmZpZWxkcy5maW5kKFxuICAgICAgICAgICAgICAgICAgICAoZmllbGQpID0+IGZpZWxkLm5hbWUudmFsdWUgPT09IGdyYXBoUUxTY2hlbWFUeXBlRmllbGROYW1lXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgaWYgKGFzdE5vZGUpIHtcbiAgICAgICAgICAgICAgICAgICAgZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZC5hc3ROb2RlID0gYXN0Tm9kZTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgU2NoZW1hRGlyZWN0aXZlVmlzaXRvci52aXNpdFNjaGVtYURpcmVjdGl2ZXMoXG4gICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSxcbiAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlc1xuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hID0gdGhpcy5ncmFwaFFMQXV0b1NjaGVtYTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5ncmFwaFFMU2NoZW1hO1xuICB9XG5cbiAgYWRkR3JhcGhRTFR5cGUoXG4gICAgdHlwZSxcbiAgICB0aHJvd0Vycm9yID0gZmFsc2UsXG4gICAgaWdub3JlUmVzZXJ2ZWQgPSBmYWxzZSxcbiAgICBpZ25vcmVDb25uZWN0aW9uID0gZmFsc2VcbiAgKSB7XG4gICAgaWYgKFxuICAgICAgKCFpZ25vcmVSZXNlcnZlZCAmJiBSRVNFUlZFRF9HUkFQSFFMX1RZUEVfTkFNRVMuaW5jbHVkZXModHlwZS5uYW1lKSkgfHxcbiAgICAgIHRoaXMuZ3JhcGhRTFR5cGVzLmZpbmQoXG4gICAgICAgIChleGlzdGluZ1R5cGUpID0+IGV4aXN0aW5nVHlwZS5uYW1lID09PSB0eXBlLm5hbWVcbiAgICAgICkgfHxcbiAgICAgICghaWdub3JlQ29ubmVjdGlvbiAmJiB0eXBlLm5hbWUuZW5kc1dpdGgoJ0Nvbm5lY3Rpb24nKSlcbiAgICApIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBgVHlwZSAke3R5cGUubmFtZX0gY291bGQgbm90IGJlIGFkZGVkIHRvIHRoZSBhdXRvIHNjaGVtYSBiZWNhdXNlIGl0IGNvbGxpZGVkIHdpdGggYW4gZXhpc3RpbmcgdHlwZS5gO1xuICAgICAgaWYgKHRocm93RXJyb3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UpO1xuICAgICAgfVxuICAgICAgdGhpcy5sb2cud2FybihtZXNzYWdlKTtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHRoaXMuZ3JhcGhRTFR5cGVzLnB1c2godHlwZSk7XG4gICAgcmV0dXJuIHR5cGU7XG4gIH1cblxuICBhZGRHcmFwaFFMUXVlcnkoXG4gICAgZmllbGROYW1lLFxuICAgIGZpZWxkLFxuICAgIHRocm93RXJyb3IgPSBmYWxzZSxcbiAgICBpZ25vcmVSZXNlcnZlZCA9IGZhbHNlXG4gICkge1xuICAgIGlmIChcbiAgICAgICghaWdub3JlUmVzZXJ2ZWQgJiYgUkVTRVJWRURfR1JBUEhRTF9RVUVSWV9OQU1FUy5pbmNsdWRlcyhmaWVsZE5hbWUpKSB8fFxuICAgICAgdGhpcy5ncmFwaFFMUXVlcmllc1tmaWVsZE5hbWVdXG4gICAgKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gYFF1ZXJ5ICR7ZmllbGROYW1lfSBjb3VsZCBub3QgYmUgYWRkZWQgdG8gdGhlIGF1dG8gc2NoZW1hIGJlY2F1c2UgaXQgY29sbGlkZWQgd2l0aCBhbiBleGlzdGluZyBmaWVsZC5gO1xuICAgICAgaWYgKHRocm93RXJyb3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UpO1xuICAgICAgfVxuICAgICAgdGhpcy5sb2cud2FybihtZXNzYWdlKTtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHRoaXMuZ3JhcGhRTFF1ZXJpZXNbZmllbGROYW1lXSA9IGZpZWxkO1xuICAgIHJldHVybiBmaWVsZDtcbiAgfVxuXG4gIGFkZEdyYXBoUUxNdXRhdGlvbihcbiAgICBmaWVsZE5hbWUsXG4gICAgZmllbGQsXG4gICAgdGhyb3dFcnJvciA9IGZhbHNlLFxuICAgIGlnbm9yZVJlc2VydmVkID0gZmFsc2VcbiAgKSB7XG4gICAgaWYgKFxuICAgICAgKCFpZ25vcmVSZXNlcnZlZCAmJlxuICAgICAgICBSRVNFUlZFRF9HUkFQSFFMX01VVEFUSU9OX05BTUVTLmluY2x1ZGVzKGZpZWxkTmFtZSkpIHx8XG4gICAgICB0aGlzLmdyYXBoUUxNdXRhdGlvbnNbZmllbGROYW1lXVxuICAgICkge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGBNdXRhdGlvbiAke2ZpZWxkTmFtZX0gY291bGQgbm90IGJlIGFkZGVkIHRvIHRoZSBhdXRvIHNjaGVtYSBiZWNhdXNlIGl0IGNvbGxpZGVkIHdpdGggYW4gZXhpc3RpbmcgZmllbGQuYDtcbiAgICAgIGlmICh0aHJvd0Vycm9yKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihtZXNzYWdlKTtcbiAgICAgIH1cbiAgICAgIHRoaXMubG9nLndhcm4obWVzc2FnZSk7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICB0aGlzLmdyYXBoUUxNdXRhdGlvbnNbZmllbGROYW1lXSA9IGZpZWxkO1xuICAgIHJldHVybiBmaWVsZDtcbiAgfVxuXG4gIGhhbmRsZUVycm9yKGVycm9yKSB7XG4gICAgaWYgKGVycm9yIGluc3RhbmNlb2YgUGFyc2UuRXJyb3IpIHtcbiAgICAgIHRoaXMubG9nLmVycm9yKCdQYXJzZSBlcnJvcjogJywgZXJyb3IpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmxvZy5lcnJvcignVW5jYXVnaHQgaW50ZXJuYWwgc2VydmVyIGVycm9yLicsIGVycm9yLCBlcnJvci5zdGFjayk7XG4gICAgfVxuICAgIHRocm93IHRvR3JhcGhRTEVycm9yKGVycm9yKTtcbiAgfVxuXG4gIGFzeW5jIF9pbml0aWFsaXplU2NoZW1hQW5kQ29uZmlnKCkge1xuICAgIGNvbnN0IFtzY2hlbWFDb250cm9sbGVyLCBwYXJzZUdyYXBoUUxDb25maWddID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgdGhpcy5kYXRhYmFzZUNvbnRyb2xsZXIubG9hZFNjaGVtYSgpLFxuICAgICAgdGhpcy5wYXJzZUdyYXBoUUxDb250cm9sbGVyLmdldEdyYXBoUUxDb25maWcoKSxcbiAgICBdKTtcblxuICAgIHRoaXMuc2NoZW1hQ29udHJvbGxlciA9IHNjaGVtYUNvbnRyb2xsZXI7XG5cbiAgICByZXR1cm4ge1xuICAgICAgcGFyc2VHcmFwaFFMQ29uZmlnLFxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogR2V0cyBhbGwgY2xhc3NlcyBmb3VuZCBieSB0aGUgYHNjaGVtYUNvbnRyb2xsZXJgXG4gICAqIG1pbnVzIHRob3NlIGZpbHRlcmVkIG91dCBieSB0aGUgYXBwJ3MgcGFyc2VHcmFwaFFMQ29uZmlnLlxuICAgKi9cbiAgYXN5bmMgX2dldENsYXNzZXNGb3JTY2hlbWEocGFyc2VHcmFwaFFMQ29uZmlnOiBQYXJzZUdyYXBoUUxDb25maWcpIHtcbiAgICBjb25zdCB7IGVuYWJsZWRGb3JDbGFzc2VzLCBkaXNhYmxlZEZvckNsYXNzZXMgfSA9IHBhcnNlR3JhcGhRTENvbmZpZztcbiAgICBjb25zdCBhbGxDbGFzc2VzID0gYXdhaXQgdGhpcy5zY2hlbWFDb250cm9sbGVyLmdldEFsbENsYXNzZXMoKTtcblxuICAgIGlmIChBcnJheS5pc0FycmF5KGVuYWJsZWRGb3JDbGFzc2VzKSB8fCBBcnJheS5pc0FycmF5KGRpc2FibGVkRm9yQ2xhc3NlcykpIHtcbiAgICAgIGxldCBpbmNsdWRlZENsYXNzZXMgPSBhbGxDbGFzc2VzO1xuICAgICAgaWYgKGVuYWJsZWRGb3JDbGFzc2VzKSB7XG4gICAgICAgIGluY2x1ZGVkQ2xhc3NlcyA9IGFsbENsYXNzZXMuZmlsdGVyKChjbGF6eikgPT4ge1xuICAgICAgICAgIHJldHVybiBlbmFibGVkRm9yQ2xhc3Nlcy5pbmNsdWRlcyhjbGF6ei5jbGFzc05hbWUpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIGlmIChkaXNhYmxlZEZvckNsYXNzZXMpIHtcbiAgICAgICAgLy8gQ2xhc3NlcyBpbmNsdWRlZCBpbiBgZW5hYmxlZEZvckNsYXNzZXNgIHRoYXRcbiAgICAgICAgLy8gYXJlIGFsc28gcHJlc2VudCBpbiBgZGlzYWJsZWRGb3JDbGFzc2VzYCB3aWxsXG4gICAgICAgIC8vIHN0aWxsIGJlIGZpbHRlcmVkIG91dFxuICAgICAgICBpbmNsdWRlZENsYXNzZXMgPSBpbmNsdWRlZENsYXNzZXMuZmlsdGVyKChjbGF6eikgPT4ge1xuICAgICAgICAgIHJldHVybiAhZGlzYWJsZWRGb3JDbGFzc2VzLmluY2x1ZGVzKGNsYXp6LmNsYXNzTmFtZSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICB0aGlzLmlzVXNlcnNDbGFzc0Rpc2FibGVkID0gIWluY2x1ZGVkQ2xhc3Nlcy5zb21lKChjbGF6eikgPT4ge1xuICAgICAgICByZXR1cm4gY2xhenouY2xhc3NOYW1lID09PSAnX1VzZXInO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBpbmNsdWRlZENsYXNzZXM7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBhbGxDbGFzc2VzO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBUaGlzIG1ldGhvZCByZXR1cm5zIGEgbGlzdCBvZiB0dXBsZXNcbiAgICogdGhhdCBwcm92aWRlIHRoZSBwYXJzZUNsYXNzIGFsb25nIHdpdGhcbiAgICogaXRzIHBhcnNlQ2xhc3NDb25maWcgd2hlcmUgcHJvdmlkZWQuXG4gICAqL1xuICBfZ2V0UGFyc2VDbGFzc2VzV2l0aENvbmZpZyhcbiAgICBwYXJzZUNsYXNzZXMsXG4gICAgcGFyc2VHcmFwaFFMQ29uZmlnOiBQYXJzZUdyYXBoUUxDb25maWdcbiAgKSB7XG4gICAgY29uc3QgeyBjbGFzc0NvbmZpZ3MgfSA9IHBhcnNlR3JhcGhRTENvbmZpZztcblxuICAgIC8vIE1ha2Ugc3VyZXMgdGhhdCB0aGUgZGVmYXVsdCBjbGFzc2VzIGFuZCBjbGFzc2VzIHRoYXRcbiAgICAvLyBzdGFydHMgd2l0aCBjYXBpdGFsaXplZCBsZXR0ZXIgd2lsbCBiZSBnZW5lcmF0ZWQgZmlyc3QuXG4gICAgY29uc3Qgc29ydENsYXNzZXMgPSAoYSwgYikgPT4ge1xuICAgICAgYSA9IGEuY2xhc3NOYW1lO1xuICAgICAgYiA9IGIuY2xhc3NOYW1lO1xuICAgICAgaWYgKGFbMF0gPT09ICdfJykge1xuICAgICAgICBpZiAoYlswXSAhPT0gJ18nKSB7XG4gICAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoYlswXSA9PT0gJ18nKSB7XG4gICAgICAgIGlmIChhWzBdICE9PSAnXycpIHtcbiAgICAgICAgICByZXR1cm4gMTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGEgPT09IGIpIHtcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9IGVsc2UgaWYgKGEgPCBiKSB7XG4gICAgICAgIHJldHVybiAtMTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiAxO1xuICAgICAgfVxuICAgIH07XG5cbiAgICByZXR1cm4gcGFyc2VDbGFzc2VzLnNvcnQoc29ydENsYXNzZXMpLm1hcCgocGFyc2VDbGFzcykgPT4ge1xuICAgICAgbGV0IHBhcnNlQ2xhc3NDb25maWc7XG4gICAgICBpZiAoY2xhc3NDb25maWdzKSB7XG4gICAgICAgIHBhcnNlQ2xhc3NDb25maWcgPSBjbGFzc0NvbmZpZ3MuZmluZChcbiAgICAgICAgICAoYykgPT4gYy5jbGFzc05hbWUgPT09IHBhcnNlQ2xhc3MuY2xhc3NOYW1lXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICByZXR1cm4gW3BhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWddO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgX2dldEZ1bmN0aW9uTmFtZXMoKSB7XG4gICAgcmV0dXJuIGF3YWl0IGdldEZ1bmN0aW9uTmFtZXModGhpcy5hcHBJZCkuZmlsdGVyKChmdW5jdGlvbk5hbWUpID0+IHtcbiAgICAgIGlmICgvXltfYS16QS1aXVtfYS16QS1aMC05XSokLy50ZXN0KGZ1bmN0aW9uTmFtZSkpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmxvZy53YXJuKFxuICAgICAgICAgIGBGdW5jdGlvbiAke2Z1bmN0aW9uTmFtZX0gY291bGQgbm90IGJlIGFkZGVkIHRvIHRoZSBhdXRvIHNjaGVtYSBiZWNhdXNlIEdyYXBoUUwgbmFtZXMgbXVzdCBtYXRjaCAvXltfYS16QS1aXVtfYS16QS1aMC05XSokLy5gXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVja3MgZm9yIGNoYW5nZXMgdG8gdGhlIHBhcnNlQ2xhc3Nlc1xuICAgKiBvYmplY3RzIChpLmUuIGRhdGFiYXNlIHNjaGVtYSkgb3IgdG9cbiAgICogdGhlIHBhcnNlR3JhcGhRTENvbmZpZyBvYmplY3QuIElmIG5vXG4gICAqIGNoYW5nZXMgYXJlIGZvdW5kLCByZXR1cm4gdHJ1ZTtcbiAgICovXG4gIF9oYXNTY2hlbWFJbnB1dENoYW5nZWQocGFyYW1zOiB7XG4gICAgcGFyc2VDbGFzc2VzOiBhbnksXG4gICAgcGFyc2VDbGFzc2VzU3RyaW5nOiBzdHJpbmcsXG4gICAgcGFyc2VHcmFwaFFMQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ29uZmlnLFxuICAgIGZ1bmN0aW9uTmFtZXNTdHJpbmc6IHN0cmluZyxcbiAgfSk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IHtcbiAgICAgIHBhcnNlQ2xhc3NlcyxcbiAgICAgIHBhcnNlQ2xhc3Nlc1N0cmluZyxcbiAgICAgIHBhcnNlR3JhcGhRTENvbmZpZyxcbiAgICAgIGZ1bmN0aW9uTmFtZXNTdHJpbmcsXG4gICAgfSA9IHBhcmFtcztcblxuICAgIGlmIChcbiAgICAgIEpTT04uc3RyaW5naWZ5KHRoaXMucGFyc2VHcmFwaFFMQ29uZmlnKSA9PT1cbiAgICAgICAgSlNPTi5zdHJpbmdpZnkocGFyc2VHcmFwaFFMQ29uZmlnKSAmJlxuICAgICAgdGhpcy5mdW5jdGlvbk5hbWVzU3RyaW5nID09PSBmdW5jdGlvbk5hbWVzU3RyaW5nXG4gICAgKSB7XG4gICAgICBpZiAodGhpcy5wYXJzZUNsYXNzZXMgPT09IHBhcnNlQ2xhc3Nlcykge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLnBhcnNlQ2xhc3Nlc1N0cmluZyA9PT0gcGFyc2VDbGFzc2VzU3RyaW5nKSB7XG4gICAgICAgIHRoaXMucGFyc2VDbGFzc2VzID0gcGFyc2VDbGFzc2VzO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbn1cblxuZXhwb3J0IHsgUGFyc2VHcmFwaFFMU2NoZW1hIH07XG4iXX0=