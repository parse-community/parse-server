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
        Object.values(customGraphQLSchemaTypeMap).forEach(customGraphQLSchemaType => {
          if (!customGraphQLSchemaType || !customGraphQLSchemaType.name || customGraphQLSchemaType.name.startsWith('__')) {
            return;
          }

          const autoGraphQLSchemaType = this.graphQLAutoSchema.getType(customGraphQLSchemaType.name);

          if (autoGraphQLSchemaType && typeof customGraphQLSchemaType.getFields === 'function') {
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

            Object.values(customGraphQLSchemaType.getFields()).forEach(field => {
              findAndReplaceLastType(field, 'type');
            });
            autoGraphQLSchemaType._fields = _objectSpread(_objectSpread({}, autoGraphQLSchemaType.getFields()), customGraphQLSchemaType.getFields());
          } else {
            this.graphQLAutoSchema._typeMap[customGraphQLSchemaType.name] = customGraphQLSchemaType;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9HcmFwaFFML1BhcnNlR3JhcGhRTFNjaGVtYS5qcyJdLCJuYW1lcyI6WyJSRVNFUlZFRF9HUkFQSFFMX1RZUEVfTkFNRVMiLCJSRVNFUlZFRF9HUkFQSFFMX1FVRVJZX05BTUVTIiwiUkVTRVJWRURfR1JBUEhRTF9NVVRBVElPTl9OQU1FUyIsIlBhcnNlR3JhcGhRTFNjaGVtYSIsImNvbnN0cnVjdG9yIiwicGFyYW1zIiwicGFyc2VHcmFwaFFMQ29udHJvbGxlciIsImRhdGFiYXNlQ29udHJvbGxlciIsImxvZyIsImdyYXBoUUxDdXN0b21UeXBlRGVmcyIsImFwcElkIiwibG9hZCIsInBhcnNlR3JhcGhRTENvbmZpZyIsIl9pbml0aWFsaXplU2NoZW1hQW5kQ29uZmlnIiwicGFyc2VDbGFzc2VzIiwiX2dldENsYXNzZXNGb3JTY2hlbWEiLCJwYXJzZUNsYXNzZXNTdHJpbmciLCJKU09OIiwic3RyaW5naWZ5IiwiZnVuY3Rpb25OYW1lcyIsIl9nZXRGdW5jdGlvbk5hbWVzIiwiZnVuY3Rpb25OYW1lc1N0cmluZyIsImdyYXBoUUxTY2hlbWEiLCJfaGFzU2NoZW1hSW5wdXRDaGFuZ2VkIiwicGFyc2VDbGFzc1R5cGVzIiwidmlld2VyVHlwZSIsImdyYXBoUUxBdXRvU2NoZW1hIiwiZ3JhcGhRTFR5cGVzIiwiZ3JhcGhRTFF1ZXJpZXMiLCJncmFwaFFMTXV0YXRpb25zIiwiZ3JhcGhRTFN1YnNjcmlwdGlvbnMiLCJncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zIiwiZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXMiLCJyZWxheU5vZGVJbnRlcmZhY2UiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiZGVmYXVsdFJlbGF5U2NoZW1hIiwic2NoZW1hVHlwZXMiLCJfZ2V0UGFyc2VDbGFzc2VzV2l0aENvbmZpZyIsImZvckVhY2giLCJwYXJzZUNsYXNzIiwicGFyc2VDbGFzc0NvbmZpZyIsInBhcnNlQ2xhc3NRdWVyaWVzIiwicGFyc2VDbGFzc011dGF0aW9ucyIsImxvYWRBcnJheVJlc3VsdCIsImRlZmF1bHRHcmFwaFFMUXVlcmllcyIsImRlZmF1bHRHcmFwaFFMTXV0YXRpb25zIiwiZ3JhcGhRTFF1ZXJ5IiwidW5kZWZpbmVkIiwiT2JqZWN0Iiwia2V5cyIsImxlbmd0aCIsIkdyYXBoUUxPYmplY3RUeXBlIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiZmllbGRzIiwiYWRkR3JhcGhRTFR5cGUiLCJncmFwaFFMTXV0YXRpb24iLCJncmFwaFFMU3Vic2NyaXB0aW9uIiwiR3JhcGhRTFNjaGVtYSIsInR5cGVzIiwicXVlcnkiLCJtdXRhdGlvbiIsInN1YnNjcmlwdGlvbiIsInNjaGVtYURpcmVjdGl2ZXMiLCJnZXRUeXBlTWFwIiwiY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXAiLCJ2YWx1ZXMiLCJjdXN0b21HcmFwaFFMU2NoZW1hVHlwZSIsInN0YXJ0c1dpdGgiLCJhdXRvR3JhcGhRTFNjaGVtYVR5cGUiLCJnZXRUeXBlIiwiZ2V0RmllbGRzIiwiZmluZEFuZFJlcGxhY2VMYXN0VHlwZSIsInBhcmVudCIsImtleSIsIm9mVHlwZSIsImZpZWxkIiwiX2ZpZWxkcyIsIl90eXBlTWFwIiwic2NoZW1hcyIsIm1lcmdlRGlyZWN0aXZlcyIsImRpcmVjdGl2ZXNEZWZpbml0aW9uc1NjaGVtYSIsImF1dG9TY2hlbWEiLCJzdGl0Y2hTY2hlbWFzIiwiZ3JhcGhRTFNjaGVtYVR5cGVNYXAiLCJncmFwaFFMU2NoZW1hVHlwZU5hbWUiLCJncmFwaFFMU2NoZW1hVHlwZSIsImRlZmluaXRpb25zIiwiZ3JhcGhRTEN1c3RvbVR5cGVEZWYiLCJmaW5kIiwiZGVmaW5pdGlvbiIsInZhbHVlIiwiZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE1hcCIsImdyYXBoUUxTY2hlbWFUeXBlRmllbGROYW1lIiwiZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZCIsImFzdE5vZGUiLCJTY2hlbWFEaXJlY3RpdmVWaXNpdG9yIiwidmlzaXRTY2hlbWFEaXJlY3RpdmVzIiwidHlwZSIsInRocm93RXJyb3IiLCJpZ25vcmVSZXNlcnZlZCIsImlnbm9yZUNvbm5lY3Rpb24iLCJpbmNsdWRlcyIsImV4aXN0aW5nVHlwZSIsImVuZHNXaXRoIiwibWVzc2FnZSIsIkVycm9yIiwid2FybiIsInB1c2giLCJhZGRHcmFwaFFMUXVlcnkiLCJmaWVsZE5hbWUiLCJhZGRHcmFwaFFMTXV0YXRpb24iLCJoYW5kbGVFcnJvciIsImVycm9yIiwiUGFyc2UiLCJzdGFjayIsInNjaGVtYUNvbnRyb2xsZXIiLCJQcm9taXNlIiwiYWxsIiwibG9hZFNjaGVtYSIsImdldEdyYXBoUUxDb25maWciLCJlbmFibGVkRm9yQ2xhc3NlcyIsImRpc2FibGVkRm9yQ2xhc3NlcyIsImFsbENsYXNzZXMiLCJnZXRBbGxDbGFzc2VzIiwiQXJyYXkiLCJpc0FycmF5IiwiaW5jbHVkZWRDbGFzc2VzIiwiZmlsdGVyIiwiY2xhenoiLCJjbGFzc05hbWUiLCJpc1VzZXJzQ2xhc3NEaXNhYmxlZCIsInNvbWUiLCJjbGFzc0NvbmZpZ3MiLCJzb3J0Q2xhc3NlcyIsImEiLCJiIiwic29ydCIsIm1hcCIsImMiLCJmdW5jdGlvbk5hbWUiLCJ0ZXN0Il0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBTUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBR0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7O0FBRUEsTUFBTUEsMkJBQTJCLEdBQUcsQ0FDbEMsUUFEa0MsRUFFbEMsU0FGa0MsRUFHbEMsS0FIa0MsRUFJbEMsT0FKa0MsRUFLbEMsSUFMa0MsRUFNbEMsYUFOa0MsRUFPbEMsT0FQa0MsRUFRbEMsVUFSa0MsRUFTbEMsY0FUa0MsRUFVbEMsaUJBVmtDLEVBV2xDLG1CQVhrQyxFQVlsQyxRQVprQyxFQWFsQyxhQWJrQyxFQWNsQyxlQWRrQyxFQWVsQyxZQWZrQyxFQWdCbEMsY0FoQmtDLEVBaUJsQyxhQWpCa0MsRUFrQmxDLGVBbEJrQyxF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RCxhQUFLRixZQUFMLEdBQW9CQSxZQUFwQjtBQUNBLGVBQU8sS0FBUDtBQUNEO0FBQ0Y7O0FBRUQsV0FBTyxJQUFQO0FBQ0Q7O0FBcGRzQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7XG4gIEdyYXBoUUxTY2hlbWEsXG4gIEdyYXBoUUxPYmplY3RUeXBlLFxuICBEb2N1bWVudE5vZGUsXG4gIEdyYXBoUUxOYW1lZFR5cGUsXG59IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgc3RpdGNoU2NoZW1hcyB9IGZyb20gJ0BncmFwaHFsLXRvb2xzL3N0aXRjaCc7XG5pbXBvcnQgeyBTY2hlbWFEaXJlY3RpdmVWaXNpdG9yIH0gZnJvbSAnQGdyYXBocWwtdG9vbHMvdXRpbHMnO1xuaW1wb3J0IHJlcXVpcmVkUGFyYW1ldGVyIGZyb20gJy4uL3JlcXVpcmVkUGFyYW1ldGVyJztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMVHlwZXMgZnJvbSAnLi9sb2FkZXJzL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0ICogYXMgcGFyc2VDbGFzc1R5cGVzIGZyb20gJy4vbG9hZGVycy9wYXJzZUNsYXNzVHlwZXMnO1xuaW1wb3J0ICogYXMgcGFyc2VDbGFzc1F1ZXJpZXMgZnJvbSAnLi9sb2FkZXJzL3BhcnNlQ2xhc3NRdWVyaWVzJztcbmltcG9ydCAqIGFzIHBhcnNlQ2xhc3NNdXRhdGlvbnMgZnJvbSAnLi9sb2FkZXJzL3BhcnNlQ2xhc3NNdXRhdGlvbnMnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxRdWVyaWVzIGZyb20gJy4vbG9hZGVycy9kZWZhdWx0R3JhcGhRTFF1ZXJpZXMnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxNdXRhdGlvbnMgZnJvbSAnLi9sb2FkZXJzL2RlZmF1bHRHcmFwaFFMTXV0YXRpb25zJztcbmltcG9ydCBQYXJzZUdyYXBoUUxDb250cm9sbGVyLCB7XG4gIFBhcnNlR3JhcGhRTENvbmZpZyxcbn0gZnJvbSAnLi4vQ29udHJvbGxlcnMvUGFyc2VHcmFwaFFMQ29udHJvbGxlcic7XG5pbXBvcnQgRGF0YWJhc2VDb250cm9sbGVyIGZyb20gJy4uL0NvbnRyb2xsZXJzL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgeyB0b0dyYXBoUUxFcnJvciB9IGZyb20gJy4vcGFyc2VHcmFwaFFMVXRpbHMnO1xuaW1wb3J0ICogYXMgc2NoZW1hRGlyZWN0aXZlcyBmcm9tICcuL2xvYWRlcnMvc2NoZW1hRGlyZWN0aXZlcyc7XG5pbXBvcnQgKiBhcyBzY2hlbWFUeXBlcyBmcm9tICcuL2xvYWRlcnMvc2NoZW1hVHlwZXMnO1xuaW1wb3J0IHsgZ2V0RnVuY3Rpb25OYW1lcyB9IGZyb20gJy4uL3RyaWdnZXJzJztcbmltcG9ydCAqIGFzIGRlZmF1bHRSZWxheVNjaGVtYSBmcm9tICcuL2xvYWRlcnMvZGVmYXVsdFJlbGF5U2NoZW1hJztcblxuY29uc3QgUkVTRVJWRURfR1JBUEhRTF9UWVBFX05BTUVTID0gW1xuICAnU3RyaW5nJyxcbiAgJ0Jvb2xlYW4nLFxuICAnSW50JyxcbiAgJ0Zsb2F0JyxcbiAgJ0lEJyxcbiAgJ0FycmF5UmVzdWx0JyxcbiAgJ1F1ZXJ5JyxcbiAgJ011dGF0aW9uJyxcbiAgJ1N1YnNjcmlwdGlvbicsXG4gICdDcmVhdGVGaWxlSW5wdXQnLFxuICAnQ3JlYXRlRmlsZVBheWxvYWQnLFxuICAnVmlld2VyJyxcbiAgJ1NpZ25VcElucHV0JyxcbiAgJ1NpZ25VcFBheWxvYWQnLFxuICAnTG9nSW5JbnB1dCcsXG4gICdMb2dJblBheWxvYWQnLFxuICAnTG9nT3V0SW5wdXQnLFxuICAnTG9nT3V0UGF5bG9hZCcsXG4gICdDbG91ZENvZGVGdW5jdGlvbicsXG4gICdDYWxsQ2xvdWRDb2RlSW5wdXQnLFxuICAnQ2FsbENsb3VkQ29kZVBheWxvYWQnLFxuICAnQ3JlYXRlQ2xhc3NJbnB1dCcsXG4gICdDcmVhdGVDbGFzc1BheWxvYWQnLFxuICAnVXBkYXRlQ2xhc3NJbnB1dCcsXG4gICdVcGRhdGVDbGFzc1BheWxvYWQnLFxuICAnRGVsZXRlQ2xhc3NJbnB1dCcsXG4gICdEZWxldGVDbGFzc1BheWxvYWQnLFxuICAnUGFnZUluZm8nLFxuXTtcbmNvbnN0IFJFU0VSVkVEX0dSQVBIUUxfUVVFUllfTkFNRVMgPSBbJ2hlYWx0aCcsICd2aWV3ZXInLCAnY2xhc3MnLCAnY2xhc3NlcyddO1xuY29uc3QgUkVTRVJWRURfR1JBUEhRTF9NVVRBVElPTl9OQU1FUyA9IFtcbiAgJ3NpZ25VcCcsXG4gICdsb2dJbicsXG4gICdsb2dPdXQnLFxuICAnY3JlYXRlRmlsZScsXG4gICdjYWxsQ2xvdWRDb2RlJyxcbiAgJ2NyZWF0ZUNsYXNzJyxcbiAgJ3VwZGF0ZUNsYXNzJyxcbiAgJ2RlbGV0ZUNsYXNzJyxcbl07XG5cbmNsYXNzIFBhcnNlR3JhcGhRTFNjaGVtYSB7XG4gIGRhdGFiYXNlQ29udHJvbGxlcjogRGF0YWJhc2VDb250cm9sbGVyO1xuICBwYXJzZUdyYXBoUUxDb250cm9sbGVyOiBQYXJzZUdyYXBoUUxDb250cm9sbGVyO1xuICBwYXJzZUdyYXBoUUxDb25maWc6IFBhcnNlR3JhcGhRTENvbmZpZztcbiAgbG9nOiBhbnk7XG4gIGFwcElkOiBzdHJpbmc7XG4gIGdyYXBoUUxDdXN0b21UeXBlRGVmczogPyhcbiAgICB8IHN0cmluZ1xuICAgIHwgR3JhcGhRTFNjaGVtYVxuICAgIHwgRG9jdW1lbnROb2RlXG4gICAgfCBHcmFwaFFMTmFtZWRUeXBlW11cbiAgKTtcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwYXJhbXM6IHtcbiAgICAgIGRhdGFiYXNlQ29udHJvbGxlcjogRGF0YWJhc2VDb250cm9sbGVyLFxuICAgICAgcGFyc2VHcmFwaFFMQ29udHJvbGxlcjogUGFyc2VHcmFwaFFMQ29udHJvbGxlcixcbiAgICAgIGxvZzogYW55LFxuICAgICAgYXBwSWQ6IHN0cmluZyxcbiAgICAgIGdyYXBoUUxDdXN0b21UeXBlRGVmczogPyhcbiAgICAgICAgfCBzdHJpbmdcbiAgICAgICAgfCBHcmFwaFFMU2NoZW1hXG4gICAgICAgIHwgRG9jdW1lbnROb2RlXG4gICAgICAgIHwgR3JhcGhRTE5hbWVkVHlwZVtdXG4gICAgICApLFxuICAgIH0gPSB7fVxuICApIHtcbiAgICB0aGlzLnBhcnNlR3JhcGhRTENvbnRyb2xsZXIgPVxuICAgICAgcGFyYW1zLnBhcnNlR3JhcGhRTENvbnRyb2xsZXIgfHxcbiAgICAgIHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgcGFyc2VHcmFwaFFMQ29udHJvbGxlciBpbnN0YW5jZSEnKTtcbiAgICB0aGlzLmRhdGFiYXNlQ29udHJvbGxlciA9XG4gICAgICBwYXJhbXMuZGF0YWJhc2VDb250cm9sbGVyIHx8XG4gICAgICByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIGRhdGFiYXNlQ29udHJvbGxlciBpbnN0YW5jZSEnKTtcbiAgICB0aGlzLmxvZyA9XG4gICAgICBwYXJhbXMubG9nIHx8IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgbG9nIGluc3RhbmNlIScpO1xuICAgIHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID0gcGFyYW1zLmdyYXBoUUxDdXN0b21UeXBlRGVmcztcbiAgICB0aGlzLmFwcElkID1cbiAgICAgIHBhcmFtcy5hcHBJZCB8fCByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSB0aGUgYXBwSWQhJyk7XG4gIH1cblxuICBhc3luYyBsb2FkKCkge1xuICAgIGNvbnN0IHsgcGFyc2VHcmFwaFFMQ29uZmlnIH0gPSBhd2FpdCB0aGlzLl9pbml0aWFsaXplU2NoZW1hQW5kQ29uZmlnKCk7XG4gICAgY29uc3QgcGFyc2VDbGFzc2VzID0gYXdhaXQgdGhpcy5fZ2V0Q2xhc3Nlc0ZvclNjaGVtYShwYXJzZUdyYXBoUUxDb25maWcpO1xuICAgIGNvbnN0IHBhcnNlQ2xhc3Nlc1N0cmluZyA9IEpTT04uc3RyaW5naWZ5KHBhcnNlQ2xhc3Nlcyk7XG4gICAgY29uc3QgZnVuY3Rpb25OYW1lcyA9IGF3YWl0IHRoaXMuX2dldEZ1bmN0aW9uTmFtZXMoKTtcbiAgICBjb25zdCBmdW5jdGlvbk5hbWVzU3RyaW5nID0gSlNPTi5zdHJpbmdpZnkoZnVuY3Rpb25OYW1lcyk7XG5cbiAgICBpZiAoXG4gICAgICB0aGlzLmdyYXBoUUxTY2hlbWEgJiZcbiAgICAgICF0aGlzLl9oYXNTY2hlbWFJbnB1dENoYW5nZWQoe1xuICAgICAgICBwYXJzZUNsYXNzZXMsXG4gICAgICAgIHBhcnNlQ2xhc3Nlc1N0cmluZyxcbiAgICAgICAgcGFyc2VHcmFwaFFMQ29uZmlnLFxuICAgICAgICBmdW5jdGlvbk5hbWVzU3RyaW5nLFxuICAgICAgfSlcbiAgICApIHtcbiAgICAgIHJldHVybiB0aGlzLmdyYXBoUUxTY2hlbWE7XG4gICAgfVxuXG4gICAgdGhpcy5wYXJzZUNsYXNzZXMgPSBwYXJzZUNsYXNzZXM7XG4gICAgdGhpcy5wYXJzZUNsYXNzZXNTdHJpbmcgPSBwYXJzZUNsYXNzZXNTdHJpbmc7XG4gICAgdGhpcy5wYXJzZUdyYXBoUUxDb25maWcgPSBwYXJzZUdyYXBoUUxDb25maWc7XG4gICAgdGhpcy5mdW5jdGlvbk5hbWVzID0gZnVuY3Rpb25OYW1lcztcbiAgICB0aGlzLmZ1bmN0aW9uTmFtZXNTdHJpbmcgPSBmdW5jdGlvbk5hbWVzU3RyaW5nO1xuICAgIHRoaXMucGFyc2VDbGFzc1R5cGVzID0ge307XG4gICAgdGhpcy52aWV3ZXJUeXBlID0gbnVsbDtcbiAgICB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hID0gbnVsbDtcbiAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSBudWxsO1xuICAgIHRoaXMuZ3JhcGhRTFR5cGVzID0gW107XG4gICAgdGhpcy5ncmFwaFFMUXVlcmllcyA9IHt9O1xuICAgIHRoaXMuZ3JhcGhRTE11dGF0aW9ucyA9IHt9O1xuICAgIHRoaXMuZ3JhcGhRTFN1YnNjcmlwdGlvbnMgPSB7fTtcbiAgICB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzRGVmaW5pdGlvbnMgPSBudWxsO1xuICAgIHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXMgPSB7fTtcbiAgICB0aGlzLnJlbGF5Tm9kZUludGVyZmFjZSA9IG51bGw7XG5cbiAgICBkZWZhdWx0R3JhcGhRTFR5cGVzLmxvYWQodGhpcyk7XG4gICAgZGVmYXVsdFJlbGF5U2NoZW1hLmxvYWQodGhpcyk7XG4gICAgc2NoZW1hVHlwZXMubG9hZCh0aGlzKTtcblxuICAgIHRoaXMuX2dldFBhcnNlQ2xhc3Nlc1dpdGhDb25maWcocGFyc2VDbGFzc2VzLCBwYXJzZUdyYXBoUUxDb25maWcpLmZvckVhY2goXG4gICAgICAoW3BhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWddKSA9PiB7XG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlcy5sb2FkKHRoaXMsIHBhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWcpO1xuICAgICAgICBwYXJzZUNsYXNzUXVlcmllcy5sb2FkKHRoaXMsIHBhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWcpO1xuICAgICAgICBwYXJzZUNsYXNzTXV0YXRpb25zLmxvYWQodGhpcywgcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZyk7XG4gICAgICB9XG4gICAgKTtcblxuICAgIGRlZmF1bHRHcmFwaFFMVHlwZXMubG9hZEFycmF5UmVzdWx0KHRoaXMsIHBhcnNlQ2xhc3Nlcyk7XG4gICAgZGVmYXVsdEdyYXBoUUxRdWVyaWVzLmxvYWQodGhpcyk7XG4gICAgZGVmYXVsdEdyYXBoUUxNdXRhdGlvbnMubG9hZCh0aGlzKTtcblxuICAgIGxldCBncmFwaFFMUXVlcnkgPSB1bmRlZmluZWQ7XG4gICAgaWYgKE9iamVjdC5rZXlzKHRoaXMuZ3JhcGhRTFF1ZXJpZXMpLmxlbmd0aCA+IDApIHtcbiAgICAgIGdyYXBoUUxRdWVyeSA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgICAgIG5hbWU6ICdRdWVyeScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnUXVlcnkgaXMgdGhlIHRvcCBsZXZlbCB0eXBlIGZvciBxdWVyaWVzLicsXG4gICAgICAgIGZpZWxkczogdGhpcy5ncmFwaFFMUXVlcmllcyxcbiAgICAgIH0pO1xuICAgICAgdGhpcy5hZGRHcmFwaFFMVHlwZShncmFwaFFMUXVlcnksIHRydWUsIHRydWUpO1xuICAgIH1cblxuICAgIGxldCBncmFwaFFMTXV0YXRpb24gPSB1bmRlZmluZWQ7XG4gICAgaWYgKE9iamVjdC5rZXlzKHRoaXMuZ3JhcGhRTE11dGF0aW9ucykubGVuZ3RoID4gMCkge1xuICAgICAgZ3JhcGhRTE11dGF0aW9uID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICAgICAgbmFtZTogJ011dGF0aW9uJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdNdXRhdGlvbiBpcyB0aGUgdG9wIGxldmVsIHR5cGUgZm9yIG11dGF0aW9ucy4nLFxuICAgICAgICBmaWVsZHM6IHRoaXMuZ3JhcGhRTE11dGF0aW9ucyxcbiAgICAgIH0pO1xuICAgICAgdGhpcy5hZGRHcmFwaFFMVHlwZShncmFwaFFMTXV0YXRpb24sIHRydWUsIHRydWUpO1xuICAgIH1cblxuICAgIGxldCBncmFwaFFMU3Vic2NyaXB0aW9uID0gdW5kZWZpbmVkO1xuICAgIGlmIChPYmplY3Qua2V5cyh0aGlzLmdyYXBoUUxTdWJzY3JpcHRpb25zKS5sZW5ndGggPiAwKSB7XG4gICAgICBncmFwaFFMU3Vic2NyaXB0aW9uID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICAgICAgbmFtZTogJ1N1YnNjcmlwdGlvbicsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnU3Vic2NyaXB0aW9uIGlzIHRoZSB0b3AgbGV2ZWwgdHlwZSBmb3Igc3Vic2NyaXB0aW9ucy4nLFxuICAgICAgICBmaWVsZHM6IHRoaXMuZ3JhcGhRTFN1YnNjcmlwdGlvbnMsXG4gICAgICB9KTtcbiAgICAgIHRoaXMuYWRkR3JhcGhRTFR5cGUoZ3JhcGhRTFN1YnNjcmlwdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYSA9IG5ldyBHcmFwaFFMU2NoZW1hKHtcbiAgICAgIHR5cGVzOiB0aGlzLmdyYXBoUUxUeXBlcyxcbiAgICAgIHF1ZXJ5OiBncmFwaFFMUXVlcnksXG4gICAgICBtdXRhdGlvbjogZ3JhcGhRTE11dGF0aW9uLFxuICAgICAgc3Vic2NyaXB0aW9uOiBncmFwaFFMU3Vic2NyaXB0aW9uLFxuICAgIH0pO1xuXG4gICAgaWYgKHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzKSB7XG4gICAgICBzY2hlbWFEaXJlY3RpdmVzLmxvYWQodGhpcyk7XG5cbiAgICAgIGlmICh0eXBlb2YgdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMuZ2V0VHlwZU1hcCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBjb25zdCBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZU1hcCA9IHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLmdldFR5cGVNYXAoKTtcbiAgICAgICAgT2JqZWN0LnZhbHVlcyhjdXN0b21HcmFwaFFMU2NoZW1hVHlwZU1hcCkuZm9yRWFjaChcbiAgICAgICAgICAoY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUpID0+IHtcbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgIWN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlIHx8XG4gICAgICAgICAgICAgICFjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lIHx8XG4gICAgICAgICAgICAgIGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWUuc3RhcnRzV2l0aCgnX18nKVxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGF1dG9HcmFwaFFMU2NoZW1hVHlwZSA9IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuZ2V0VHlwZShcbiAgICAgICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgYXV0b0dyYXBoUUxTY2hlbWFUeXBlICYmXG4gICAgICAgICAgICAgIHR5cGVvZiBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5nZXRGaWVsZHMgPT09ICdmdW5jdGlvbidcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICBjb25zdCBmaW5kQW5kUmVwbGFjZUxhc3RUeXBlID0gKHBhcmVudCwga2V5KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHBhcmVudFtrZXldLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYS5nZXRUeXBlKHBhcmVudFtrZXldLm5hbWUpICYmXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuZ2V0VHlwZShwYXJlbnRba2V5XS5uYW1lKSAhPT1cbiAgICAgICAgICAgICAgICAgICAgICBwYXJlbnRba2V5XVxuICAgICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFRvIGF2b2lkIHVucmVzb2x2ZWQgZmllbGQgb24gb3ZlcmxvYWRlZCBzY2hlbWFcbiAgICAgICAgICAgICAgICAgICAgLy8gcmVwbGFjZSB0aGUgZmluYWwgdHlwZSB3aXRoIHRoZSBhdXRvIHNjaGVtYSBvbmVcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50W2tleV0gPSB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLmdldFR5cGUoXG4gICAgICAgICAgICAgICAgICAgICAgcGFyZW50W2tleV0ubmFtZVxuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICBpZiAocGFyZW50W2tleV0ub2ZUeXBlKSB7XG4gICAgICAgICAgICAgICAgICAgIGZpbmRBbmRSZXBsYWNlTGFzdFR5cGUocGFyZW50W2tleV0sICdvZlR5cGUnKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgT2JqZWN0LnZhbHVlcyhjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5nZXRGaWVsZHMoKSkuZm9yRWFjaChcbiAgICAgICAgICAgICAgICAoZmllbGQpID0+IHtcbiAgICAgICAgICAgICAgICAgIGZpbmRBbmRSZXBsYWNlTGFzdFR5cGUoZmllbGQsICd0eXBlJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICBhdXRvR3JhcGhRTFNjaGVtYVR5cGUuX2ZpZWxkcyA9IHtcbiAgICAgICAgICAgICAgICAuLi5hdXRvR3JhcGhRTFNjaGVtYVR5cGUuZ2V0RmllbGRzKCksXG4gICAgICAgICAgICAgICAgLi4uY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUuZ2V0RmllbGRzKCksXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLl90eXBlTWFwW1xuICAgICAgICAgICAgICAgIGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWVcbiAgICAgICAgICAgICAgXSA9IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hID0gc3RpdGNoU2NoZW1hcyh7XG4gICAgICAgICAgc2NoZW1hczogW1xuICAgICAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zLFxuICAgICAgICAgICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYSxcbiAgICAgICAgICBdLFxuICAgICAgICAgIG1lcmdlRGlyZWN0aXZlczogdHJ1ZSxcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSBhd2FpdCB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcyh7XG4gICAgICAgICAgZGlyZWN0aXZlc0RlZmluaXRpb25zU2NoZW1hOiB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzRGVmaW5pdGlvbnMsXG4gICAgICAgICAgYXV0b1NjaGVtYTogdGhpcy5ncmFwaFFMQXV0b1NjaGVtYSxcbiAgICAgICAgICBzdGl0Y2hTY2hlbWFzLFxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSA9IHN0aXRjaFNjaGVtYXMoe1xuICAgICAgICAgIHNjaGVtYXM6IFtcbiAgICAgICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXNEZWZpbml0aW9ucyxcbiAgICAgICAgICAgIHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEsXG4gICAgICAgICAgICB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcyxcbiAgICAgICAgICBdLFxuICAgICAgICAgIG1lcmdlRGlyZWN0aXZlczogdHJ1ZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGdyYXBoUUxTY2hlbWFUeXBlTWFwID0gdGhpcy5ncmFwaFFMU2NoZW1hLmdldFR5cGVNYXAoKTtcbiAgICAgIE9iamVjdC5rZXlzKGdyYXBoUUxTY2hlbWFUeXBlTWFwKS5mb3JFYWNoKChncmFwaFFMU2NoZW1hVHlwZU5hbWUpID0+IHtcbiAgICAgICAgY29uc3QgZ3JhcGhRTFNjaGVtYVR5cGUgPSBncmFwaFFMU2NoZW1hVHlwZU1hcFtncmFwaFFMU2NoZW1hVHlwZU5hbWVdO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdHlwZW9mIGdyYXBoUUxTY2hlbWFUeXBlLmdldEZpZWxkcyA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgICAgIHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLmRlZmluaXRpb25zXG4gICAgICAgICkge1xuICAgICAgICAgIGNvbnN0IGdyYXBoUUxDdXN0b21UeXBlRGVmID0gdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMuZGVmaW5pdGlvbnMuZmluZChcbiAgICAgICAgICAgIChkZWZpbml0aW9uKSA9PiBkZWZpbml0aW9uLm5hbWUudmFsdWUgPT09IGdyYXBoUUxTY2hlbWFUeXBlTmFtZVxuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKGdyYXBoUUxDdXN0b21UeXBlRGVmKSB7XG4gICAgICAgICAgICBjb25zdCBncmFwaFFMU2NoZW1hVHlwZUZpZWxkTWFwID0gZ3JhcGhRTFNjaGVtYVR5cGUuZ2V0RmllbGRzKCk7XG4gICAgICAgICAgICBPYmplY3Qua2V5cyhncmFwaFFMU2NoZW1hVHlwZUZpZWxkTWFwKS5mb3JFYWNoKFxuICAgICAgICAgICAgICAoZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE5hbWUpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBncmFwaFFMU2NoZW1hVHlwZUZpZWxkID1cbiAgICAgICAgICAgICAgICAgIGdyYXBoUUxTY2hlbWFUeXBlRmllbGRNYXBbZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE5hbWVdO1xuICAgICAgICAgICAgICAgIGlmICghZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZC5hc3ROb2RlKSB7XG4gICAgICAgICAgICAgICAgICBjb25zdCBhc3ROb2RlID0gZ3JhcGhRTEN1c3RvbVR5cGVEZWYuZmllbGRzLmZpbmQoXG4gICAgICAgICAgICAgICAgICAgIChmaWVsZCkgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE5hbWVcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICBpZiAoYXN0Tm9kZSkge1xuICAgICAgICAgICAgICAgICAgICBncmFwaFFMU2NoZW1hVHlwZUZpZWxkLmFzdE5vZGUgPSBhc3ROb2RlO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBTY2hlbWFEaXJlY3RpdmVWaXNpdG9yLnZpc2l0U2NoZW1hRGlyZWN0aXZlcyhcbiAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hLFxuICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmdyYXBoUUxTY2hlbWE7XG4gIH1cblxuICBhZGRHcmFwaFFMVHlwZShcbiAgICB0eXBlLFxuICAgIHRocm93RXJyb3IgPSBmYWxzZSxcbiAgICBpZ25vcmVSZXNlcnZlZCA9IGZhbHNlLFxuICAgIGlnbm9yZUNvbm5lY3Rpb24gPSBmYWxzZVxuICApIHtcbiAgICBpZiAoXG4gICAgICAoIWlnbm9yZVJlc2VydmVkICYmIFJFU0VSVkVEX0dSQVBIUUxfVFlQRV9OQU1FUy5pbmNsdWRlcyh0eXBlLm5hbWUpKSB8fFxuICAgICAgdGhpcy5ncmFwaFFMVHlwZXMuZmluZChcbiAgICAgICAgKGV4aXN0aW5nVHlwZSkgPT4gZXhpc3RpbmdUeXBlLm5hbWUgPT09IHR5cGUubmFtZVxuICAgICAgKSB8fFxuICAgICAgKCFpZ25vcmVDb25uZWN0aW9uICYmIHR5cGUubmFtZS5lbmRzV2l0aCgnQ29ubmVjdGlvbicpKVxuICAgICkge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGBUeXBlICR7dHlwZS5uYW1lfSBjb3VsZCBub3QgYmUgYWRkZWQgdG8gdGhlIGF1dG8gc2NoZW1hIGJlY2F1c2UgaXQgY29sbGlkZWQgd2l0aCBhbiBleGlzdGluZyB0eXBlLmA7XG4gICAgICBpZiAodGhyb3dFcnJvcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSk7XG4gICAgICB9XG4gICAgICB0aGlzLmxvZy53YXJuKG1lc3NhZ2UpO1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgdGhpcy5ncmFwaFFMVHlwZXMucHVzaCh0eXBlKTtcbiAgICByZXR1cm4gdHlwZTtcbiAgfVxuXG4gIGFkZEdyYXBoUUxRdWVyeShcbiAgICBmaWVsZE5hbWUsXG4gICAgZmllbGQsXG4gICAgdGhyb3dFcnJvciA9IGZhbHNlLFxuICAgIGlnbm9yZVJlc2VydmVkID0gZmFsc2VcbiAgKSB7XG4gICAgaWYgKFxuICAgICAgKCFpZ25vcmVSZXNlcnZlZCAmJiBSRVNFUlZFRF9HUkFQSFFMX1FVRVJZX05BTUVTLmluY2x1ZGVzKGZpZWxkTmFtZSkpIHx8XG4gICAgICB0aGlzLmdyYXBoUUxRdWVyaWVzW2ZpZWxkTmFtZV1cbiAgICApIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBgUXVlcnkgJHtmaWVsZE5hbWV9IGNvdWxkIG5vdCBiZSBhZGRlZCB0byB0aGUgYXV0byBzY2hlbWEgYmVjYXVzZSBpdCBjb2xsaWRlZCB3aXRoIGFuIGV4aXN0aW5nIGZpZWxkLmA7XG4gICAgICBpZiAodGhyb3dFcnJvcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSk7XG4gICAgICB9XG4gICAgICB0aGlzLmxvZy53YXJuKG1lc3NhZ2UpO1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgdGhpcy5ncmFwaFFMUXVlcmllc1tmaWVsZE5hbWVdID0gZmllbGQ7XG4gICAgcmV0dXJuIGZpZWxkO1xuICB9XG5cbiAgYWRkR3JhcGhRTE11dGF0aW9uKFxuICAgIGZpZWxkTmFtZSxcbiAgICBmaWVsZCxcbiAgICB0aHJvd0Vycm9yID0gZmFsc2UsXG4gICAgaWdub3JlUmVzZXJ2ZWQgPSBmYWxzZVxuICApIHtcbiAgICBpZiAoXG4gICAgICAoIWlnbm9yZVJlc2VydmVkICYmXG4gICAgICAgIFJFU0VSVkVEX0dSQVBIUUxfTVVUQVRJT05fTkFNRVMuaW5jbHVkZXMoZmllbGROYW1lKSkgfHxcbiAgICAgIHRoaXMuZ3JhcGhRTE11dGF0aW9uc1tmaWVsZE5hbWVdXG4gICAgKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gYE11dGF0aW9uICR7ZmllbGROYW1lfSBjb3VsZCBub3QgYmUgYWRkZWQgdG8gdGhlIGF1dG8gc2NoZW1hIGJlY2F1c2UgaXQgY29sbGlkZWQgd2l0aCBhbiBleGlzdGluZyBmaWVsZC5gO1xuICAgICAgaWYgKHRocm93RXJyb3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UpO1xuICAgICAgfVxuICAgICAgdGhpcy5sb2cud2FybihtZXNzYWdlKTtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHRoaXMuZ3JhcGhRTE11dGF0aW9uc1tmaWVsZE5hbWVdID0gZmllbGQ7XG4gICAgcmV0dXJuIGZpZWxkO1xuICB9XG5cbiAgaGFuZGxlRXJyb3IoZXJyb3IpIHtcbiAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBQYXJzZS5FcnJvcikge1xuICAgICAgdGhpcy5sb2cuZXJyb3IoJ1BhcnNlIGVycm9yOiAnLCBlcnJvcik7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMubG9nLmVycm9yKCdVbmNhdWdodCBpbnRlcm5hbCBzZXJ2ZXIgZXJyb3IuJywgZXJyb3IsIGVycm9yLnN0YWNrKTtcbiAgICB9XG4gICAgdGhyb3cgdG9HcmFwaFFMRXJyb3IoZXJyb3IpO1xuICB9XG5cbiAgYXN5bmMgX2luaXRpYWxpemVTY2hlbWFBbmRDb25maWcoKSB7XG4gICAgY29uc3QgW3NjaGVtYUNvbnRyb2xsZXIsIHBhcnNlR3JhcGhRTENvbmZpZ10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICB0aGlzLmRhdGFiYXNlQ29udHJvbGxlci5sb2FkU2NoZW1hKCksXG4gICAgICB0aGlzLnBhcnNlR3JhcGhRTENvbnRyb2xsZXIuZ2V0R3JhcGhRTENvbmZpZygpLFxuICAgIF0pO1xuXG4gICAgdGhpcy5zY2hlbWFDb250cm9sbGVyID0gc2NoZW1hQ29udHJvbGxlcjtcblxuICAgIHJldHVybiB7XG4gICAgICBwYXJzZUdyYXBoUUxDb25maWcsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXRzIGFsbCBjbGFzc2VzIGZvdW5kIGJ5IHRoZSBgc2NoZW1hQ29udHJvbGxlcmBcbiAgICogbWludXMgdGhvc2UgZmlsdGVyZWQgb3V0IGJ5IHRoZSBhcHAncyBwYXJzZUdyYXBoUUxDb25maWcuXG4gICAqL1xuICBhc3luYyBfZ2V0Q2xhc3Nlc0ZvclNjaGVtYShwYXJzZUdyYXBoUUxDb25maWc6IFBhcnNlR3JhcGhRTENvbmZpZykge1xuICAgIGNvbnN0IHsgZW5hYmxlZEZvckNsYXNzZXMsIGRpc2FibGVkRm9yQ2xhc3NlcyB9ID0gcGFyc2VHcmFwaFFMQ29uZmlnO1xuICAgIGNvbnN0IGFsbENsYXNzZXMgPSBhd2FpdCB0aGlzLnNjaGVtYUNvbnRyb2xsZXIuZ2V0QWxsQ2xhc3NlcygpO1xuXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZW5hYmxlZEZvckNsYXNzZXMpIHx8IEFycmF5LmlzQXJyYXkoZGlzYWJsZWRGb3JDbGFzc2VzKSkge1xuICAgICAgbGV0IGluY2x1ZGVkQ2xhc3NlcyA9IGFsbENsYXNzZXM7XG4gICAgICBpZiAoZW5hYmxlZEZvckNsYXNzZXMpIHtcbiAgICAgICAgaW5jbHVkZWRDbGFzc2VzID0gYWxsQ2xhc3Nlcy5maWx0ZXIoKGNsYXp6KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGVuYWJsZWRGb3JDbGFzc2VzLmluY2x1ZGVzKGNsYXp6LmNsYXNzTmFtZSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgaWYgKGRpc2FibGVkRm9yQ2xhc3Nlcykge1xuICAgICAgICAvLyBDbGFzc2VzIGluY2x1ZGVkIGluIGBlbmFibGVkRm9yQ2xhc3Nlc2AgdGhhdFxuICAgICAgICAvLyBhcmUgYWxzbyBwcmVzZW50IGluIGBkaXNhYmxlZEZvckNsYXNzZXNgIHdpbGxcbiAgICAgICAgLy8gc3RpbGwgYmUgZmlsdGVyZWQgb3V0XG4gICAgICAgIGluY2x1ZGVkQ2xhc3NlcyA9IGluY2x1ZGVkQ2xhc3Nlcy5maWx0ZXIoKGNsYXp6KSA9PiB7XG4gICAgICAgICAgcmV0dXJuICFkaXNhYmxlZEZvckNsYXNzZXMuaW5jbHVkZXMoY2xhenouY2xhc3NOYW1lKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuaXNVc2Vyc0NsYXNzRGlzYWJsZWQgPSAhaW5jbHVkZWRDbGFzc2VzLnNvbWUoKGNsYXp6KSA9PiB7XG4gICAgICAgIHJldHVybiBjbGF6ei5jbGFzc05hbWUgPT09ICdfVXNlcic7XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIGluY2x1ZGVkQ2xhc3NlcztcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGFsbENsYXNzZXM7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFRoaXMgbWV0aG9kIHJldHVybnMgYSBsaXN0IG9mIHR1cGxlc1xuICAgKiB0aGF0IHByb3ZpZGUgdGhlIHBhcnNlQ2xhc3MgYWxvbmcgd2l0aFxuICAgKiBpdHMgcGFyc2VDbGFzc0NvbmZpZyB3aGVyZSBwcm92aWRlZC5cbiAgICovXG4gIF9nZXRQYXJzZUNsYXNzZXNXaXRoQ29uZmlnKFxuICAgIHBhcnNlQ2xhc3NlcyxcbiAgICBwYXJzZUdyYXBoUUxDb25maWc6IFBhcnNlR3JhcGhRTENvbmZpZ1xuICApIHtcbiAgICBjb25zdCB7IGNsYXNzQ29uZmlncyB9ID0gcGFyc2VHcmFwaFFMQ29uZmlnO1xuXG4gICAgLy8gTWFrZSBzdXJlcyB0aGF0IHRoZSBkZWZhdWx0IGNsYXNzZXMgYW5kIGNsYXNzZXMgdGhhdFxuICAgIC8vIHN0YXJ0cyB3aXRoIGNhcGl0YWxpemVkIGxldHRlciB3aWxsIGJlIGdlbmVyYXRlZCBmaXJzdC5cbiAgICBjb25zdCBzb3J0Q2xhc3NlcyA9IChhLCBiKSA9PiB7XG4gICAgICBhID0gYS5jbGFzc05hbWU7XG4gICAgICBiID0gYi5jbGFzc05hbWU7XG4gICAgICBpZiAoYVswXSA9PT0gJ18nKSB7XG4gICAgICAgIGlmIChiWzBdICE9PSAnXycpIHtcbiAgICAgICAgICByZXR1cm4gLTE7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChiWzBdID09PSAnXycpIHtcbiAgICAgICAgaWYgKGFbMF0gIT09ICdfJykge1xuICAgICAgICAgIHJldHVybiAxO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoYSA9PT0gYikge1xuICAgICAgICByZXR1cm4gMDtcbiAgICAgIH0gZWxzZSBpZiAoYSA8IGIpIHtcbiAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIDE7XG4gICAgICB9XG4gICAgfTtcblxuICAgIHJldHVybiBwYXJzZUNsYXNzZXMuc29ydChzb3J0Q2xhc3NlcykubWFwKChwYXJzZUNsYXNzKSA9PiB7XG4gICAgICBsZXQgcGFyc2VDbGFzc0NvbmZpZztcbiAgICAgIGlmIChjbGFzc0NvbmZpZ3MpIHtcbiAgICAgICAgcGFyc2VDbGFzc0NvbmZpZyA9IGNsYXNzQ29uZmlncy5maW5kKFxuICAgICAgICAgIChjKSA9PiBjLmNsYXNzTmFtZSA9PT0gcGFyc2VDbGFzcy5jbGFzc05hbWVcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBbcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZ107XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBfZ2V0RnVuY3Rpb25OYW1lcygpIHtcbiAgICByZXR1cm4gYXdhaXQgZ2V0RnVuY3Rpb25OYW1lcyh0aGlzLmFwcElkKS5maWx0ZXIoKGZ1bmN0aW9uTmFtZSkgPT4ge1xuICAgICAgaWYgKC9eW19hLXpBLVpdW19hLXpBLVowLTldKiQvLnRlc3QoZnVuY3Rpb25OYW1lKSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMubG9nLndhcm4oXG4gICAgICAgICAgYEZ1bmN0aW9uICR7ZnVuY3Rpb25OYW1lfSBjb3VsZCBub3QgYmUgYWRkZWQgdG8gdGhlIGF1dG8gc2NoZW1hIGJlY2F1c2UgR3JhcGhRTCBuYW1lcyBtdXN0IG1hdGNoIC9eW19hLXpBLVpdW19hLXpBLVowLTldKiQvLmBcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIENoZWNrcyBmb3IgY2hhbmdlcyB0byB0aGUgcGFyc2VDbGFzc2VzXG4gICAqIG9iamVjdHMgKGkuZS4gZGF0YWJhc2Ugc2NoZW1hKSBvciB0b1xuICAgKiB0aGUgcGFyc2VHcmFwaFFMQ29uZmlnIG9iamVjdC4gSWYgbm9cbiAgICogY2hhbmdlcyBhcmUgZm91bmQsIHJldHVybiB0cnVlO1xuICAgKi9cbiAgX2hhc1NjaGVtYUlucHV0Q2hhbmdlZChwYXJhbXM6IHtcbiAgICBwYXJzZUNsYXNzZXM6IGFueSxcbiAgICBwYXJzZUNsYXNzZXNTdHJpbmc6IHN0cmluZyxcbiAgICBwYXJzZUdyYXBoUUxDb25maWc6ID9QYXJzZUdyYXBoUUxDb25maWcsXG4gICAgZnVuY3Rpb25OYW1lc1N0cmluZzogc3RyaW5nLFxuICB9KTogYm9vbGVhbiB7XG4gICAgY29uc3Qge1xuICAgICAgcGFyc2VDbGFzc2VzLFxuICAgICAgcGFyc2VDbGFzc2VzU3RyaW5nLFxuICAgICAgcGFyc2VHcmFwaFFMQ29uZmlnLFxuICAgICAgZnVuY3Rpb25OYW1lc1N0cmluZyxcbiAgICB9ID0gcGFyYW1zO1xuXG4gICAgaWYgKFxuICAgICAgSlNPTi5zdHJpbmdpZnkodGhpcy5wYXJzZUdyYXBoUUxDb25maWcpID09PVxuICAgICAgICBKU09OLnN0cmluZ2lmeShwYXJzZUdyYXBoUUxDb25maWcpICYmXG4gICAgICB0aGlzLmZ1bmN0aW9uTmFtZXNTdHJpbmcgPT09IGZ1bmN0aW9uTmFtZXNTdHJpbmdcbiAgICApIHtcbiAgICAgIGlmICh0aGlzLnBhcnNlQ2xhc3NlcyA9PT0gcGFyc2VDbGFzc2VzKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMucGFyc2VDbGFzc2VzU3RyaW5nID09PSBwYXJzZUNsYXNzZXNTdHJpbmcpIHtcbiAgICAgICAgdGhpcy5wYXJzZUNsYXNzZXMgPSBwYXJzZUNsYXNzZXM7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxufVxuXG5leHBvcnQgeyBQYXJzZUdyYXBoUUxTY2hlbWEgfTtcbiJdfQ==