"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseGraphQLSchema = void 0;

var _node = _interopRequireDefault(require("parse/node"));

var _graphql = require("graphql");

var _graphqlTools = require("graphql-tools");

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

          if (autoGraphQLSchemaType) {
            autoGraphQLSchemaType._fields = _objectSpread({}, autoGraphQLSchemaType._fields, {}, customGraphQLSchemaType._fields);
          }
        });
        this.graphQLSchema = (0, _graphqlTools.mergeSchemas)({
          schemas: [this.graphQLSchemaDirectivesDefinitions, this.graphQLCustomTypeDefs, this.graphQLAutoSchema],
          mergeDirectives: true
        });
      } else if (typeof this.graphQLCustomTypeDefs === 'function') {
        this.graphQLSchema = await this.graphQLCustomTypeDefs({
          directivesDefinitionsSchema: this.graphQLSchemaDirectivesDefinitions,
          autoSchema: this.graphQLAutoSchema,
          mergeSchemas: _graphqlTools.mergeSchemas
        });
      } else {
        this.graphQLSchema = (0, _graphqlTools.mergeSchemas)({
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

      _graphqlTools.SchemaDirectiveVisitor.visitSchemaDirectives(this.graphQLSchema, this.graphQLSchemaDirectives);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9HcmFwaFFML1BhcnNlR3JhcGhRTFNjaGVtYS5qcyJdLCJuYW1lcyI6WyJSRVNFUlZFRF9HUkFQSFFMX1RZUEVfTkFNRVMiLCJSRVNFUlZFRF9HUkFQSFFMX1FVRVJZX05BTUVTIiwiUkVTRVJWRURfR1JBUEhRTF9NVVRBVElPTl9OQU1FUyIsIlBhcnNlR3JhcGhRTFNjaGVtYSIsImNvbnN0cnVjdG9yIiwicGFyYW1zIiwicGFyc2VHcmFwaFFMQ29udHJvbGxlciIsImRhdGFiYXNlQ29udHJvbGxlciIsImxvZyIsImdyYXBoUUxDdXN0b21UeXBlRGVmcyIsImFwcElkIiwibG9hZCIsInBhcnNlR3JhcGhRTENvbmZpZyIsIl9pbml0aWFsaXplU2NoZW1hQW5kQ29uZmlnIiwicGFyc2VDbGFzc2VzIiwiX2dldENsYXNzZXNGb3JTY2hlbWEiLCJwYXJzZUNsYXNzZXNTdHJpbmciLCJKU09OIiwic3RyaW5naWZ5IiwiZnVuY3Rpb25OYW1lcyIsIl9nZXRGdW5jdGlvbk5hbWVzIiwiZnVuY3Rpb25OYW1lc1N0cmluZyIsImdyYXBoUUxTY2hlbWEiLCJfaGFzU2NoZW1hSW5wdXRDaGFuZ2VkIiwicGFyc2VDbGFzc1R5cGVzIiwidmlld2VyVHlwZSIsImdyYXBoUUxBdXRvU2NoZW1hIiwiZ3JhcGhRTFR5cGVzIiwiZ3JhcGhRTFF1ZXJpZXMiLCJncmFwaFFMTXV0YXRpb25zIiwiZ3JhcGhRTFN1YnNjcmlwdGlvbnMiLCJncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zIiwiZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXMiLCJyZWxheU5vZGVJbnRlcmZhY2UiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiZGVmYXVsdFJlbGF5U2NoZW1hIiwic2NoZW1hVHlwZXMiLCJfZ2V0UGFyc2VDbGFzc2VzV2l0aENvbmZpZyIsImZvckVhY2giLCJwYXJzZUNsYXNzIiwicGFyc2VDbGFzc0NvbmZpZyIsInBhcnNlQ2xhc3NRdWVyaWVzIiwicGFyc2VDbGFzc011dGF0aW9ucyIsImxvYWRBcnJheVJlc3VsdCIsImRlZmF1bHRHcmFwaFFMUXVlcmllcyIsImRlZmF1bHRHcmFwaFFMTXV0YXRpb25zIiwiZ3JhcGhRTFF1ZXJ5IiwidW5kZWZpbmVkIiwiT2JqZWN0Iiwia2V5cyIsImxlbmd0aCIsIkdyYXBoUUxPYmplY3RUeXBlIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiZmllbGRzIiwiYWRkR3JhcGhRTFR5cGUiLCJncmFwaFFMTXV0YXRpb24iLCJncmFwaFFMU3Vic2NyaXB0aW9uIiwiR3JhcGhRTFNjaGVtYSIsInR5cGVzIiwicXVlcnkiLCJtdXRhdGlvbiIsInN1YnNjcmlwdGlvbiIsInNjaGVtYURpcmVjdGl2ZXMiLCJnZXRUeXBlTWFwIiwiY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXAiLCJ2YWx1ZXMiLCJjdXN0b21HcmFwaFFMU2NoZW1hVHlwZSIsInN0YXJ0c1dpdGgiLCJhdXRvR3JhcGhRTFNjaGVtYVR5cGUiLCJnZXRUeXBlIiwiX2ZpZWxkcyIsInNjaGVtYXMiLCJtZXJnZURpcmVjdGl2ZXMiLCJkaXJlY3RpdmVzRGVmaW5pdGlvbnNTY2hlbWEiLCJhdXRvU2NoZW1hIiwibWVyZ2VTY2hlbWFzIiwiZ3JhcGhRTFNjaGVtYVR5cGVNYXAiLCJncmFwaFFMU2NoZW1hVHlwZU5hbWUiLCJncmFwaFFMU2NoZW1hVHlwZSIsImdldEZpZWxkcyIsImRlZmluaXRpb25zIiwiZ3JhcGhRTEN1c3RvbVR5cGVEZWYiLCJmaW5kIiwiZGVmaW5pdGlvbiIsInZhbHVlIiwiZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE1hcCIsImdyYXBoUUxTY2hlbWFUeXBlRmllbGROYW1lIiwiZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZCIsImFzdE5vZGUiLCJmaWVsZCIsIlNjaGVtYURpcmVjdGl2ZVZpc2l0b3IiLCJ2aXNpdFNjaGVtYURpcmVjdGl2ZXMiLCJ0eXBlIiwidGhyb3dFcnJvciIsImlnbm9yZVJlc2VydmVkIiwiaWdub3JlQ29ubmVjdGlvbiIsImluY2x1ZGVzIiwiZXhpc3RpbmdUeXBlIiwiZW5kc1dpdGgiLCJtZXNzYWdlIiwiRXJyb3IiLCJ3YXJuIiwicHVzaCIsImFkZEdyYXBoUUxRdWVyeSIsImZpZWxkTmFtZSIsImFkZEdyYXBoUUxNdXRhdGlvbiIsImhhbmRsZUVycm9yIiwiZXJyb3IiLCJQYXJzZSIsInN0YWNrIiwic2NoZW1hQ29udHJvbGxlciIsIlByb21pc2UiLCJhbGwiLCJsb2FkU2NoZW1hIiwiZ2V0R3JhcGhRTENvbmZpZyIsImVuYWJsZWRGb3JDbGFzc2VzIiwiZGlzYWJsZWRGb3JDbGFzc2VzIiwiYWxsQ2xhc3NlcyIsImdldEFsbENsYXNzZXMiLCJBcnJheSIsImlzQXJyYXkiLCJpbmNsdWRlZENsYXNzZXMiLCJmaWx0ZXIiLCJjbGF6eiIsImNsYXNzTmFtZSIsImlzVXNlcnNDbGFzc0Rpc2FibGVkIiwic29tZSIsImNsYXNzQ29uZmlncyIsInNvcnRDbGFzc2VzIiwiYSIsImIiLCJzb3J0IiwibWFwIiwiYyIsImZ1bmN0aW9uTmFtZSIsInRlc3QiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFNQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFHQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7Ozs7Ozs7QUFFQSxNQUFNQSwyQkFBMkIsR0FBRyxDQUNsQyxRQURrQyxFQUVsQyxTQUZrQyxFQUdsQyxLQUhrQyxFQUlsQyxPQUprQyxFQUtsQyxJQUxrQyxFQU1sQyxhQU5rQyxFQU9sQyxPQVBrQyxFQVFsQyxVQVJrQyxFQVNsQyxjQVRrQyxFQVVsQyxpQkFWa0MsRUFXbEMsbUJBWGtDLEVBWWxDLFFBWmtDLEVBYWxDLGFBYmtDLEVBY2xDLGVBZGtDLEVBZWxDLFlBZmtDLEVBZ0JsQyxjQWhCa0MsRUFpQmxDLGFBakJrQyxFQWtCbEMsZUFsQmtDLEVBbUJsQyxtQkFuQmtDLEVBb0JsQyxvQkFwQmtDLEVBcUJsQyxzQkFyQmtDLEVBc0JsQyxrQkF0QmtDLEVBdUJsQyxv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b0JBLFlBQXBCO0FBQ0EsZUFBTyxLQUFQO0FBQ0Q7QUFDRjs7QUFFRCxXQUFPLElBQVA7QUFDRDs7QUFuYnNCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IHtcbiAgR3JhcGhRTFNjaGVtYSxcbiAgR3JhcGhRTE9iamVjdFR5cGUsXG4gIERvY3VtZW50Tm9kZSxcbiAgR3JhcGhRTE5hbWVkVHlwZSxcbn0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBtZXJnZVNjaGVtYXMsIFNjaGVtYURpcmVjdGl2ZVZpc2l0b3IgfSBmcm9tICdncmFwaHFsLXRvb2xzJztcbmltcG9ydCByZXF1aXJlZFBhcmFtZXRlciBmcm9tICcuLi9yZXF1aXJlZFBhcmFtZXRlcic7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4vbG9hZGVycy9kZWZhdWx0R3JhcGhRTFR5cGVzJztcbmltcG9ydCAqIGFzIHBhcnNlQ2xhc3NUeXBlcyBmcm9tICcuL2xvYWRlcnMvcGFyc2VDbGFzc1R5cGVzJztcbmltcG9ydCAqIGFzIHBhcnNlQ2xhc3NRdWVyaWVzIGZyb20gJy4vbG9hZGVycy9wYXJzZUNsYXNzUXVlcmllcyc7XG5pbXBvcnQgKiBhcyBwYXJzZUNsYXNzTXV0YXRpb25zIGZyb20gJy4vbG9hZGVycy9wYXJzZUNsYXNzTXV0YXRpb25zJztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMUXVlcmllcyBmcm9tICcuL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxRdWVyaWVzJztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMTXV0YXRpb25zIGZyb20gJy4vbG9hZGVycy9kZWZhdWx0R3JhcGhRTE11dGF0aW9ucyc7XG5pbXBvcnQgUGFyc2VHcmFwaFFMQ29udHJvbGxlciwge1xuICBQYXJzZUdyYXBoUUxDb25maWcsXG59IGZyb20gJy4uL0NvbnRyb2xsZXJzL1BhcnNlR3JhcGhRTENvbnRyb2xsZXInO1xuaW1wb3J0IERhdGFiYXNlQ29udHJvbGxlciBmcm9tICcuLi9Db250cm9sbGVycy9EYXRhYmFzZUNvbnRyb2xsZXInO1xuaW1wb3J0IHsgdG9HcmFwaFFMRXJyb3IgfSBmcm9tICcuL3BhcnNlR3JhcGhRTFV0aWxzJztcbmltcG9ydCAqIGFzIHNjaGVtYURpcmVjdGl2ZXMgZnJvbSAnLi9sb2FkZXJzL3NjaGVtYURpcmVjdGl2ZXMnO1xuaW1wb3J0ICogYXMgc2NoZW1hVHlwZXMgZnJvbSAnLi9sb2FkZXJzL3NjaGVtYVR5cGVzJztcbmltcG9ydCB7IGdldEZ1bmN0aW9uTmFtZXMgfSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0UmVsYXlTY2hlbWEgZnJvbSAnLi9sb2FkZXJzL2RlZmF1bHRSZWxheVNjaGVtYSc7XG5cbmNvbnN0IFJFU0VSVkVEX0dSQVBIUUxfVFlQRV9OQU1FUyA9IFtcbiAgJ1N0cmluZycsXG4gICdCb29sZWFuJyxcbiAgJ0ludCcsXG4gICdGbG9hdCcsXG4gICdJRCcsXG4gICdBcnJheVJlc3VsdCcsXG4gICdRdWVyeScsXG4gICdNdXRhdGlvbicsXG4gICdTdWJzY3JpcHRpb24nLFxuICAnQ3JlYXRlRmlsZUlucHV0JyxcbiAgJ0NyZWF0ZUZpbGVQYXlsb2FkJyxcbiAgJ1ZpZXdlcicsXG4gICdTaWduVXBJbnB1dCcsXG4gICdTaWduVXBQYXlsb2FkJyxcbiAgJ0xvZ0luSW5wdXQnLFxuICAnTG9nSW5QYXlsb2FkJyxcbiAgJ0xvZ091dElucHV0JyxcbiAgJ0xvZ091dFBheWxvYWQnLFxuICAnQ2xvdWRDb2RlRnVuY3Rpb24nLFxuICAnQ2FsbENsb3VkQ29kZUlucHV0JyxcbiAgJ0NhbGxDbG91ZENvZGVQYXlsb2FkJyxcbiAgJ0NyZWF0ZUNsYXNzSW5wdXQnLFxuICAnQ3JlYXRlQ2xhc3NQYXlsb2FkJyxcbiAgJ1VwZGF0ZUNsYXNzSW5wdXQnLFxuICAnVXBkYXRlQ2xhc3NQYXlsb2FkJyxcbiAgJ0RlbGV0ZUNsYXNzSW5wdXQnLFxuICAnRGVsZXRlQ2xhc3NQYXlsb2FkJyxcbiAgJ1BhZ2VJbmZvJyxcbl07XG5jb25zdCBSRVNFUlZFRF9HUkFQSFFMX1FVRVJZX05BTUVTID0gWydoZWFsdGgnLCAndmlld2VyJywgJ2NsYXNzJywgJ2NsYXNzZXMnXTtcbmNvbnN0IFJFU0VSVkVEX0dSQVBIUUxfTVVUQVRJT05fTkFNRVMgPSBbXG4gICdzaWduVXAnLFxuICAnbG9nSW4nLFxuICAnbG9nT3V0JyxcbiAgJ2NyZWF0ZUZpbGUnLFxuICAnY2FsbENsb3VkQ29kZScsXG4gICdjcmVhdGVDbGFzcycsXG4gICd1cGRhdGVDbGFzcycsXG4gICdkZWxldGVDbGFzcycsXG5dO1xuXG5jbGFzcyBQYXJzZUdyYXBoUUxTY2hlbWEge1xuICBkYXRhYmFzZUNvbnRyb2xsZXI6IERhdGFiYXNlQ29udHJvbGxlcjtcbiAgcGFyc2VHcmFwaFFMQ29udHJvbGxlcjogUGFyc2VHcmFwaFFMQ29udHJvbGxlcjtcbiAgcGFyc2VHcmFwaFFMQ29uZmlnOiBQYXJzZUdyYXBoUUxDb25maWc7XG4gIGxvZzogYW55O1xuICBhcHBJZDogc3RyaW5nO1xuICBncmFwaFFMQ3VzdG9tVHlwZURlZnM6ID8oXG4gICAgfCBzdHJpbmdcbiAgICB8IEdyYXBoUUxTY2hlbWFcbiAgICB8IERvY3VtZW50Tm9kZVxuICAgIHwgR3JhcGhRTE5hbWVkVHlwZVtdXG4gICk7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcGFyYW1zOiB7XG4gICAgICBkYXRhYmFzZUNvbnRyb2xsZXI6IERhdGFiYXNlQ29udHJvbGxlcixcbiAgICAgIHBhcnNlR3JhcGhRTENvbnRyb2xsZXI6IFBhcnNlR3JhcGhRTENvbnRyb2xsZXIsXG4gICAgICBsb2c6IGFueSxcbiAgICAgIGFwcElkOiBzdHJpbmcsXG4gICAgICBncmFwaFFMQ3VzdG9tVHlwZURlZnM6ID8oXG4gICAgICAgIHwgc3RyaW5nXG4gICAgICAgIHwgR3JhcGhRTFNjaGVtYVxuICAgICAgICB8IERvY3VtZW50Tm9kZVxuICAgICAgICB8IEdyYXBoUUxOYW1lZFR5cGVbXVxuICAgICAgKSxcbiAgICB9ID0ge31cbiAgKSB7XG4gICAgdGhpcy5wYXJzZUdyYXBoUUxDb250cm9sbGVyID1cbiAgICAgIHBhcmFtcy5wYXJzZUdyYXBoUUxDb250cm9sbGVyIHx8XG4gICAgICByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIHBhcnNlR3JhcGhRTENvbnRyb2xsZXIgaW5zdGFuY2UhJyk7XG4gICAgdGhpcy5kYXRhYmFzZUNvbnRyb2xsZXIgPVxuICAgICAgcGFyYW1zLmRhdGFiYXNlQ29udHJvbGxlciB8fFxuICAgICAgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBkYXRhYmFzZUNvbnRyb2xsZXIgaW5zdGFuY2UhJyk7XG4gICAgdGhpcy5sb2cgPVxuICAgICAgcGFyYW1zLmxvZyB8fCByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIGxvZyBpbnN0YW5jZSEnKTtcbiAgICB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcyA9IHBhcmFtcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnM7XG4gICAgdGhpcy5hcHBJZCA9XG4gICAgICBwYXJhbXMuYXBwSWQgfHwgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgdGhlIGFwcElkIScpO1xuICB9XG5cbiAgYXN5bmMgbG9hZCgpIHtcbiAgICBjb25zdCB7IHBhcnNlR3JhcGhRTENvbmZpZyB9ID0gYXdhaXQgdGhpcy5faW5pdGlhbGl6ZVNjaGVtYUFuZENvbmZpZygpO1xuICAgIGNvbnN0IHBhcnNlQ2xhc3NlcyA9IGF3YWl0IHRoaXMuX2dldENsYXNzZXNGb3JTY2hlbWEocGFyc2VHcmFwaFFMQ29uZmlnKTtcbiAgICBjb25zdCBwYXJzZUNsYXNzZXNTdHJpbmcgPSBKU09OLnN0cmluZ2lmeShwYXJzZUNsYXNzZXMpO1xuICAgIGNvbnN0IGZ1bmN0aW9uTmFtZXMgPSBhd2FpdCB0aGlzLl9nZXRGdW5jdGlvbk5hbWVzKCk7XG4gICAgY29uc3QgZnVuY3Rpb25OYW1lc1N0cmluZyA9IEpTT04uc3RyaW5naWZ5KGZ1bmN0aW9uTmFtZXMpO1xuXG4gICAgaWYgKFxuICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hICYmXG4gICAgICAhdGhpcy5faGFzU2NoZW1hSW5wdXRDaGFuZ2VkKHtcbiAgICAgICAgcGFyc2VDbGFzc2VzLFxuICAgICAgICBwYXJzZUNsYXNzZXNTdHJpbmcsXG4gICAgICAgIHBhcnNlR3JhcGhRTENvbmZpZyxcbiAgICAgICAgZnVuY3Rpb25OYW1lc1N0cmluZyxcbiAgICAgIH0pXG4gICAgKSB7XG4gICAgICByZXR1cm4gdGhpcy5ncmFwaFFMU2NoZW1hO1xuICAgIH1cblxuICAgIHRoaXMucGFyc2VDbGFzc2VzID0gcGFyc2VDbGFzc2VzO1xuICAgIHRoaXMucGFyc2VDbGFzc2VzU3RyaW5nID0gcGFyc2VDbGFzc2VzU3RyaW5nO1xuICAgIHRoaXMucGFyc2VHcmFwaFFMQ29uZmlnID0gcGFyc2VHcmFwaFFMQ29uZmlnO1xuICAgIHRoaXMuZnVuY3Rpb25OYW1lcyA9IGZ1bmN0aW9uTmFtZXM7XG4gICAgdGhpcy5mdW5jdGlvbk5hbWVzU3RyaW5nID0gZnVuY3Rpb25OYW1lc1N0cmluZztcbiAgICB0aGlzLnBhcnNlQ2xhc3NUeXBlcyA9IHt9O1xuICAgIHRoaXMudmlld2VyVHlwZSA9IG51bGw7XG4gICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYSA9IG51bGw7XG4gICAgdGhpcy5ncmFwaFFMU2NoZW1hID0gbnVsbDtcbiAgICB0aGlzLmdyYXBoUUxUeXBlcyA9IFtdO1xuICAgIHRoaXMuZ3JhcGhRTFF1ZXJpZXMgPSB7fTtcbiAgICB0aGlzLmdyYXBoUUxNdXRhdGlvbnMgPSB7fTtcbiAgICB0aGlzLmdyYXBoUUxTdWJzY3JpcHRpb25zID0ge307XG4gICAgdGhpcy5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zID0gbnVsbDtcbiAgICB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzID0ge307XG4gICAgdGhpcy5yZWxheU5vZGVJbnRlcmZhY2UgPSBudWxsO1xuXG4gICAgZGVmYXVsdEdyYXBoUUxUeXBlcy5sb2FkKHRoaXMpO1xuICAgIGRlZmF1bHRSZWxheVNjaGVtYS5sb2FkKHRoaXMpO1xuICAgIHNjaGVtYVR5cGVzLmxvYWQodGhpcyk7XG5cbiAgICB0aGlzLl9nZXRQYXJzZUNsYXNzZXNXaXRoQ29uZmlnKHBhcnNlQ2xhc3NlcywgcGFyc2VHcmFwaFFMQ29uZmlnKS5mb3JFYWNoKFxuICAgICAgKFtwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnXSkgPT4ge1xuICAgICAgICBwYXJzZUNsYXNzVHlwZXMubG9hZCh0aGlzLCBwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnKTtcbiAgICAgICAgcGFyc2VDbGFzc1F1ZXJpZXMubG9hZCh0aGlzLCBwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnKTtcbiAgICAgICAgcGFyc2VDbGFzc011dGF0aW9ucy5sb2FkKHRoaXMsIHBhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWcpO1xuICAgICAgfVxuICAgICk7XG5cbiAgICBkZWZhdWx0R3JhcGhRTFR5cGVzLmxvYWRBcnJheVJlc3VsdCh0aGlzLCBwYXJzZUNsYXNzZXMpO1xuICAgIGRlZmF1bHRHcmFwaFFMUXVlcmllcy5sb2FkKHRoaXMpO1xuICAgIGRlZmF1bHRHcmFwaFFMTXV0YXRpb25zLmxvYWQodGhpcyk7XG5cbiAgICBsZXQgZ3JhcGhRTFF1ZXJ5ID0gdW5kZWZpbmVkO1xuICAgIGlmIChPYmplY3Qua2V5cyh0aGlzLmdyYXBoUUxRdWVyaWVzKS5sZW5ndGggPiAwKSB7XG4gICAgICBncmFwaFFMUXVlcnkgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgICAgICBuYW1lOiAnUXVlcnknLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1F1ZXJ5IGlzIHRoZSB0b3AgbGV2ZWwgdHlwZSBmb3IgcXVlcmllcy4nLFxuICAgICAgICBmaWVsZHM6IHRoaXMuZ3JhcGhRTFF1ZXJpZXMsXG4gICAgICB9KTtcbiAgICAgIHRoaXMuYWRkR3JhcGhRTFR5cGUoZ3JhcGhRTFF1ZXJ5LCB0cnVlLCB0cnVlKTtcbiAgICB9XG5cbiAgICBsZXQgZ3JhcGhRTE11dGF0aW9uID0gdW5kZWZpbmVkO1xuICAgIGlmIChPYmplY3Qua2V5cyh0aGlzLmdyYXBoUUxNdXRhdGlvbnMpLmxlbmd0aCA+IDApIHtcbiAgICAgIGdyYXBoUUxNdXRhdGlvbiA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgICAgIG5hbWU6ICdNdXRhdGlvbicsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnTXV0YXRpb24gaXMgdGhlIHRvcCBsZXZlbCB0eXBlIGZvciBtdXRhdGlvbnMuJyxcbiAgICAgICAgZmllbGRzOiB0aGlzLmdyYXBoUUxNdXRhdGlvbnMsXG4gICAgICB9KTtcbiAgICAgIHRoaXMuYWRkR3JhcGhRTFR5cGUoZ3JhcGhRTE11dGF0aW9uLCB0cnVlLCB0cnVlKTtcbiAgICB9XG5cbiAgICBsZXQgZ3JhcGhRTFN1YnNjcmlwdGlvbiA9IHVuZGVmaW5lZDtcbiAgICBpZiAoT2JqZWN0LmtleXModGhpcy5ncmFwaFFMU3Vic2NyaXB0aW9ucykubGVuZ3RoID4gMCkge1xuICAgICAgZ3JhcGhRTFN1YnNjcmlwdGlvbiA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgICAgIG5hbWU6ICdTdWJzY3JpcHRpb24nLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1N1YnNjcmlwdGlvbiBpcyB0aGUgdG9wIGxldmVsIHR5cGUgZm9yIHN1YnNjcmlwdGlvbnMuJyxcbiAgICAgICAgZmllbGRzOiB0aGlzLmdyYXBoUUxTdWJzY3JpcHRpb25zLFxuICAgICAgfSk7XG4gICAgICB0aGlzLmFkZEdyYXBoUUxUeXBlKGdyYXBoUUxTdWJzY3JpcHRpb24sIHRydWUsIHRydWUpO1xuICAgIH1cblxuICAgIHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEgPSBuZXcgR3JhcGhRTFNjaGVtYSh7XG4gICAgICB0eXBlczogdGhpcy5ncmFwaFFMVHlwZXMsXG4gICAgICBxdWVyeTogZ3JhcGhRTFF1ZXJ5LFxuICAgICAgbXV0YXRpb246IGdyYXBoUUxNdXRhdGlvbixcbiAgICAgIHN1YnNjcmlwdGlvbjogZ3JhcGhRTFN1YnNjcmlwdGlvbixcbiAgICB9KTtcblxuICAgIGlmICh0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcykge1xuICAgICAgc2NoZW1hRGlyZWN0aXZlcy5sb2FkKHRoaXMpO1xuXG4gICAgICBpZiAodHlwZW9mIHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLmdldFR5cGVNYXAgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgY29uc3QgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXAgPSB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcy5nZXRUeXBlTWFwKCk7XG4gICAgICAgIE9iamVjdC52YWx1ZXMoY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXApLmZvckVhY2goXG4gICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUgPT4ge1xuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAhY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUgfHxcbiAgICAgICAgICAgICAgIWN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWUgfHxcbiAgICAgICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZS5zdGFydHNXaXRoKCdfXycpXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYXV0b0dyYXBoUUxTY2hlbWFUeXBlID0gdGhpcy5ncmFwaFFMQXV0b1NjaGVtYS5nZXRUeXBlKFxuICAgICAgICAgICAgICBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgaWYgKGF1dG9HcmFwaFFMU2NoZW1hVHlwZSkge1xuICAgICAgICAgICAgICBhdXRvR3JhcGhRTFNjaGVtYVR5cGUuX2ZpZWxkcyA9IHtcbiAgICAgICAgICAgICAgICAuLi5hdXRvR3JhcGhRTFNjaGVtYVR5cGUuX2ZpZWxkcyxcbiAgICAgICAgICAgICAgICAuLi5jdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5fZmllbGRzLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hID0gbWVyZ2VTY2hlbWFzKHtcbiAgICAgICAgICBzY2hlbWFzOiBbXG4gICAgICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzRGVmaW5pdGlvbnMsXG4gICAgICAgICAgICB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcyxcbiAgICAgICAgICAgIHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEsXG4gICAgICAgICAgXSxcbiAgICAgICAgICBtZXJnZURpcmVjdGl2ZXM6IHRydWUsXG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hID0gYXdhaXQgdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMoe1xuICAgICAgICAgIGRpcmVjdGl2ZXNEZWZpbml0aW9uc1NjaGVtYTogdGhpcy5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zLFxuICAgICAgICAgIGF1dG9TY2hlbWE6IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEsXG4gICAgICAgICAgbWVyZ2VTY2hlbWFzLFxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSA9IG1lcmdlU2NoZW1hcyh7XG4gICAgICAgICAgc2NoZW1hczogW1xuICAgICAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zLFxuICAgICAgICAgICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYSxcbiAgICAgICAgICAgIHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLFxuICAgICAgICAgIF0sXG4gICAgICAgICAgbWVyZ2VEaXJlY3RpdmVzOiB0cnVlLFxuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZ3JhcGhRTFNjaGVtYVR5cGVNYXAgPSB0aGlzLmdyYXBoUUxTY2hlbWEuZ2V0VHlwZU1hcCgpO1xuICAgICAgT2JqZWN0LmtleXMoZ3JhcGhRTFNjaGVtYVR5cGVNYXApLmZvckVhY2goZ3JhcGhRTFNjaGVtYVR5cGVOYW1lID0+IHtcbiAgICAgICAgY29uc3QgZ3JhcGhRTFNjaGVtYVR5cGUgPSBncmFwaFFMU2NoZW1hVHlwZU1hcFtncmFwaFFMU2NoZW1hVHlwZU5hbWVdO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdHlwZW9mIGdyYXBoUUxTY2hlbWFUeXBlLmdldEZpZWxkcyA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgICAgIHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLmRlZmluaXRpb25zXG4gICAgICAgICkge1xuICAgICAgICAgIGNvbnN0IGdyYXBoUUxDdXN0b21UeXBlRGVmID0gdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMuZGVmaW5pdGlvbnMuZmluZChcbiAgICAgICAgICAgIGRlZmluaXRpb24gPT4gZGVmaW5pdGlvbi5uYW1lLnZhbHVlID09PSBncmFwaFFMU2NoZW1hVHlwZU5hbWVcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmIChncmFwaFFMQ3VzdG9tVHlwZURlZikge1xuICAgICAgICAgICAgY29uc3QgZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE1hcCA9IGdyYXBoUUxTY2hlbWFUeXBlLmdldEZpZWxkcygpO1xuICAgICAgICAgICAgT2JqZWN0LmtleXMoZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE1hcCkuZm9yRWFjaChcbiAgICAgICAgICAgICAgZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGdyYXBoUUxTY2hlbWFUeXBlRmllbGQgPVxuICAgICAgICAgICAgICAgICAgZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE1hcFtncmFwaFFMU2NoZW1hVHlwZUZpZWxkTmFtZV07XG4gICAgICAgICAgICAgICAgaWYgKCFncmFwaFFMU2NoZW1hVHlwZUZpZWxkLmFzdE5vZGUpIHtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IGFzdE5vZGUgPSBncmFwaFFMQ3VzdG9tVHlwZURlZi5maWVsZHMuZmluZChcbiAgICAgICAgICAgICAgICAgICAgZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE5hbWVcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICBpZiAoYXN0Tm9kZSkge1xuICAgICAgICAgICAgICAgICAgICBncmFwaFFMU2NoZW1hVHlwZUZpZWxkLmFzdE5vZGUgPSBhc3ROb2RlO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBTY2hlbWFEaXJlY3RpdmVWaXNpdG9yLnZpc2l0U2NoZW1hRGlyZWN0aXZlcyhcbiAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hLFxuICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmdyYXBoUUxTY2hlbWE7XG4gIH1cblxuICBhZGRHcmFwaFFMVHlwZShcbiAgICB0eXBlLFxuICAgIHRocm93RXJyb3IgPSBmYWxzZSxcbiAgICBpZ25vcmVSZXNlcnZlZCA9IGZhbHNlLFxuICAgIGlnbm9yZUNvbm5lY3Rpb24gPSBmYWxzZVxuICApIHtcbiAgICBpZiAoXG4gICAgICAoIWlnbm9yZVJlc2VydmVkICYmIFJFU0VSVkVEX0dSQVBIUUxfVFlQRV9OQU1FUy5pbmNsdWRlcyh0eXBlLm5hbWUpKSB8fFxuICAgICAgdGhpcy5ncmFwaFFMVHlwZXMuZmluZChleGlzdGluZ1R5cGUgPT4gZXhpc3RpbmdUeXBlLm5hbWUgPT09IHR5cGUubmFtZSkgfHxcbiAgICAgICghaWdub3JlQ29ubmVjdGlvbiAmJiB0eXBlLm5hbWUuZW5kc1dpdGgoJ0Nvbm5lY3Rpb24nKSlcbiAgICApIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBgVHlwZSAke3R5cGUubmFtZX0gY291bGQgbm90IGJlIGFkZGVkIHRvIHRoZSBhdXRvIHNjaGVtYSBiZWNhdXNlIGl0IGNvbGxpZGVkIHdpdGggYW4gZXhpc3RpbmcgdHlwZS5gO1xuICAgICAgaWYgKHRocm93RXJyb3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UpO1xuICAgICAgfVxuICAgICAgdGhpcy5sb2cud2FybihtZXNzYWdlKTtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHRoaXMuZ3JhcGhRTFR5cGVzLnB1c2godHlwZSk7XG4gICAgcmV0dXJuIHR5cGU7XG4gIH1cblxuICBhZGRHcmFwaFFMUXVlcnkoXG4gICAgZmllbGROYW1lLFxuICAgIGZpZWxkLFxuICAgIHRocm93RXJyb3IgPSBmYWxzZSxcbiAgICBpZ25vcmVSZXNlcnZlZCA9IGZhbHNlXG4gICkge1xuICAgIGlmIChcbiAgICAgICghaWdub3JlUmVzZXJ2ZWQgJiYgUkVTRVJWRURfR1JBUEhRTF9RVUVSWV9OQU1FUy5pbmNsdWRlcyhmaWVsZE5hbWUpKSB8fFxuICAgICAgdGhpcy5ncmFwaFFMUXVlcmllc1tmaWVsZE5hbWVdXG4gICAgKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gYFF1ZXJ5ICR7ZmllbGROYW1lfSBjb3VsZCBub3QgYmUgYWRkZWQgdG8gdGhlIGF1dG8gc2NoZW1hIGJlY2F1c2UgaXQgY29sbGlkZWQgd2l0aCBhbiBleGlzdGluZyBmaWVsZC5gO1xuICAgICAgaWYgKHRocm93RXJyb3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UpO1xuICAgICAgfVxuICAgICAgdGhpcy5sb2cud2FybihtZXNzYWdlKTtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHRoaXMuZ3JhcGhRTFF1ZXJpZXNbZmllbGROYW1lXSA9IGZpZWxkO1xuICAgIHJldHVybiBmaWVsZDtcbiAgfVxuXG4gIGFkZEdyYXBoUUxNdXRhdGlvbihcbiAgICBmaWVsZE5hbWUsXG4gICAgZmllbGQsXG4gICAgdGhyb3dFcnJvciA9IGZhbHNlLFxuICAgIGlnbm9yZVJlc2VydmVkID0gZmFsc2VcbiAgKSB7XG4gICAgaWYgKFxuICAgICAgKCFpZ25vcmVSZXNlcnZlZCAmJlxuICAgICAgICBSRVNFUlZFRF9HUkFQSFFMX01VVEFUSU9OX05BTUVTLmluY2x1ZGVzKGZpZWxkTmFtZSkpIHx8XG4gICAgICB0aGlzLmdyYXBoUUxNdXRhdGlvbnNbZmllbGROYW1lXVxuICAgICkge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGBNdXRhdGlvbiAke2ZpZWxkTmFtZX0gY291bGQgbm90IGJlIGFkZGVkIHRvIHRoZSBhdXRvIHNjaGVtYSBiZWNhdXNlIGl0IGNvbGxpZGVkIHdpdGggYW4gZXhpc3RpbmcgZmllbGQuYDtcbiAgICAgIGlmICh0aHJvd0Vycm9yKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihtZXNzYWdlKTtcbiAgICAgIH1cbiAgICAgIHRoaXMubG9nLndhcm4obWVzc2FnZSk7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICB0aGlzLmdyYXBoUUxNdXRhdGlvbnNbZmllbGROYW1lXSA9IGZpZWxkO1xuICAgIHJldHVybiBmaWVsZDtcbiAgfVxuXG4gIGhhbmRsZUVycm9yKGVycm9yKSB7XG4gICAgaWYgKGVycm9yIGluc3RhbmNlb2YgUGFyc2UuRXJyb3IpIHtcbiAgICAgIHRoaXMubG9nLmVycm9yKCdQYXJzZSBlcnJvcjogJywgZXJyb3IpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmxvZy5lcnJvcignVW5jYXVnaHQgaW50ZXJuYWwgc2VydmVyIGVycm9yLicsIGVycm9yLCBlcnJvci5zdGFjayk7XG4gICAgfVxuICAgIHRocm93IHRvR3JhcGhRTEVycm9yKGVycm9yKTtcbiAgfVxuXG4gIGFzeW5jIF9pbml0aWFsaXplU2NoZW1hQW5kQ29uZmlnKCkge1xuICAgIGNvbnN0IFtzY2hlbWFDb250cm9sbGVyLCBwYXJzZUdyYXBoUUxDb25maWddID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgdGhpcy5kYXRhYmFzZUNvbnRyb2xsZXIubG9hZFNjaGVtYSgpLFxuICAgICAgdGhpcy5wYXJzZUdyYXBoUUxDb250cm9sbGVyLmdldEdyYXBoUUxDb25maWcoKSxcbiAgICBdKTtcblxuICAgIHRoaXMuc2NoZW1hQ29udHJvbGxlciA9IHNjaGVtYUNvbnRyb2xsZXI7XG5cbiAgICByZXR1cm4ge1xuICAgICAgcGFyc2VHcmFwaFFMQ29uZmlnLFxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogR2V0cyBhbGwgY2xhc3NlcyBmb3VuZCBieSB0aGUgYHNjaGVtYUNvbnRyb2xsZXJgXG4gICAqIG1pbnVzIHRob3NlIGZpbHRlcmVkIG91dCBieSB0aGUgYXBwJ3MgcGFyc2VHcmFwaFFMQ29uZmlnLlxuICAgKi9cbiAgYXN5bmMgX2dldENsYXNzZXNGb3JTY2hlbWEocGFyc2VHcmFwaFFMQ29uZmlnOiBQYXJzZUdyYXBoUUxDb25maWcpIHtcbiAgICBjb25zdCB7IGVuYWJsZWRGb3JDbGFzc2VzLCBkaXNhYmxlZEZvckNsYXNzZXMgfSA9IHBhcnNlR3JhcGhRTENvbmZpZztcbiAgICBjb25zdCBhbGxDbGFzc2VzID0gYXdhaXQgdGhpcy5zY2hlbWFDb250cm9sbGVyLmdldEFsbENsYXNzZXMoKTtcblxuICAgIGlmIChBcnJheS5pc0FycmF5KGVuYWJsZWRGb3JDbGFzc2VzKSB8fCBBcnJheS5pc0FycmF5KGRpc2FibGVkRm9yQ2xhc3NlcykpIHtcbiAgICAgIGxldCBpbmNsdWRlZENsYXNzZXMgPSBhbGxDbGFzc2VzO1xuICAgICAgaWYgKGVuYWJsZWRGb3JDbGFzc2VzKSB7XG4gICAgICAgIGluY2x1ZGVkQ2xhc3NlcyA9IGFsbENsYXNzZXMuZmlsdGVyKGNsYXp6ID0+IHtcbiAgICAgICAgICByZXR1cm4gZW5hYmxlZEZvckNsYXNzZXMuaW5jbHVkZXMoY2xhenouY2xhc3NOYW1lKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICBpZiAoZGlzYWJsZWRGb3JDbGFzc2VzKSB7XG4gICAgICAgIC8vIENsYXNzZXMgaW5jbHVkZWQgaW4gYGVuYWJsZWRGb3JDbGFzc2VzYCB0aGF0XG4gICAgICAgIC8vIGFyZSBhbHNvIHByZXNlbnQgaW4gYGRpc2FibGVkRm9yQ2xhc3Nlc2Agd2lsbFxuICAgICAgICAvLyBzdGlsbCBiZSBmaWx0ZXJlZCBvdXRcbiAgICAgICAgaW5jbHVkZWRDbGFzc2VzID0gaW5jbHVkZWRDbGFzc2VzLmZpbHRlcihjbGF6eiA9PiB7XG4gICAgICAgICAgcmV0dXJuICFkaXNhYmxlZEZvckNsYXNzZXMuaW5jbHVkZXMoY2xhenouY2xhc3NOYW1lKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuaXNVc2Vyc0NsYXNzRGlzYWJsZWQgPSAhaW5jbHVkZWRDbGFzc2VzLnNvbWUoY2xhenogPT4ge1xuICAgICAgICByZXR1cm4gY2xhenouY2xhc3NOYW1lID09PSAnX1VzZXInO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBpbmNsdWRlZENsYXNzZXM7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBhbGxDbGFzc2VzO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBUaGlzIG1ldGhvZCByZXR1cm5zIGEgbGlzdCBvZiB0dXBsZXNcbiAgICogdGhhdCBwcm92aWRlIHRoZSBwYXJzZUNsYXNzIGFsb25nIHdpdGhcbiAgICogaXRzIHBhcnNlQ2xhc3NDb25maWcgd2hlcmUgcHJvdmlkZWQuXG4gICAqL1xuICBfZ2V0UGFyc2VDbGFzc2VzV2l0aENvbmZpZyhcbiAgICBwYXJzZUNsYXNzZXMsXG4gICAgcGFyc2VHcmFwaFFMQ29uZmlnOiBQYXJzZUdyYXBoUUxDb25maWdcbiAgKSB7XG4gICAgY29uc3QgeyBjbGFzc0NvbmZpZ3MgfSA9IHBhcnNlR3JhcGhRTENvbmZpZztcblxuICAgIC8vIE1ha2Ugc3VyZXMgdGhhdCB0aGUgZGVmYXVsdCBjbGFzc2VzIGFuZCBjbGFzc2VzIHRoYXRcbiAgICAvLyBzdGFydHMgd2l0aCBjYXBpdGFsaXplZCBsZXR0ZXIgd2lsbCBiZSBnZW5lcmF0ZWQgZmlyc3QuXG4gICAgY29uc3Qgc29ydENsYXNzZXMgPSAoYSwgYikgPT4ge1xuICAgICAgYSA9IGEuY2xhc3NOYW1lO1xuICAgICAgYiA9IGIuY2xhc3NOYW1lO1xuICAgICAgaWYgKGFbMF0gPT09ICdfJykge1xuICAgICAgICBpZiAoYlswXSAhPT0gJ18nKSB7XG4gICAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoYlswXSA9PT0gJ18nKSB7XG4gICAgICAgIGlmIChhWzBdICE9PSAnXycpIHtcbiAgICAgICAgICByZXR1cm4gMTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGEgPT09IGIpIHtcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9IGVsc2UgaWYgKGEgPCBiKSB7XG4gICAgICAgIHJldHVybiAtMTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiAxO1xuICAgICAgfVxuICAgIH07XG5cbiAgICByZXR1cm4gcGFyc2VDbGFzc2VzLnNvcnQoc29ydENsYXNzZXMpLm1hcChwYXJzZUNsYXNzID0+IHtcbiAgICAgIGxldCBwYXJzZUNsYXNzQ29uZmlnO1xuICAgICAgaWYgKGNsYXNzQ29uZmlncykge1xuICAgICAgICBwYXJzZUNsYXNzQ29uZmlnID0gY2xhc3NDb25maWdzLmZpbmQoXG4gICAgICAgICAgYyA9PiBjLmNsYXNzTmFtZSA9PT0gcGFyc2VDbGFzcy5jbGFzc05hbWVcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBbcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZ107XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBfZ2V0RnVuY3Rpb25OYW1lcygpIHtcbiAgICByZXR1cm4gYXdhaXQgZ2V0RnVuY3Rpb25OYW1lcyh0aGlzLmFwcElkKS5maWx0ZXIoZnVuY3Rpb25OYW1lID0+IHtcbiAgICAgIGlmICgvXltfYS16QS1aXVtfYS16QS1aMC05XSokLy50ZXN0KGZ1bmN0aW9uTmFtZSkpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmxvZy53YXJuKFxuICAgICAgICAgIGBGdW5jdGlvbiAke2Z1bmN0aW9uTmFtZX0gY291bGQgbm90IGJlIGFkZGVkIHRvIHRoZSBhdXRvIHNjaGVtYSBiZWNhdXNlIEdyYXBoUUwgbmFtZXMgbXVzdCBtYXRjaCAvXltfYS16QS1aXVtfYS16QS1aMC05XSokLy5gXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVja3MgZm9yIGNoYW5nZXMgdG8gdGhlIHBhcnNlQ2xhc3Nlc1xuICAgKiBvYmplY3RzIChpLmUuIGRhdGFiYXNlIHNjaGVtYSkgb3IgdG9cbiAgICogdGhlIHBhcnNlR3JhcGhRTENvbmZpZyBvYmplY3QuIElmIG5vXG4gICAqIGNoYW5nZXMgYXJlIGZvdW5kLCByZXR1cm4gdHJ1ZTtcbiAgICovXG4gIF9oYXNTY2hlbWFJbnB1dENoYW5nZWQocGFyYW1zOiB7XG4gICAgcGFyc2VDbGFzc2VzOiBhbnksXG4gICAgcGFyc2VDbGFzc2VzU3RyaW5nOiBzdHJpbmcsXG4gICAgcGFyc2VHcmFwaFFMQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ29uZmlnLFxuICAgIGZ1bmN0aW9uTmFtZXNTdHJpbmc6IHN0cmluZyxcbiAgfSk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IHtcbiAgICAgIHBhcnNlQ2xhc3NlcyxcbiAgICAgIHBhcnNlQ2xhc3Nlc1N0cmluZyxcbiAgICAgIHBhcnNlR3JhcGhRTENvbmZpZyxcbiAgICAgIGZ1bmN0aW9uTmFtZXNTdHJpbmcsXG4gICAgfSA9IHBhcmFtcztcblxuICAgIGlmIChcbiAgICAgIEpTT04uc3RyaW5naWZ5KHRoaXMucGFyc2VHcmFwaFFMQ29uZmlnKSA9PT1cbiAgICAgICAgSlNPTi5zdHJpbmdpZnkocGFyc2VHcmFwaFFMQ29uZmlnKSAmJlxuICAgICAgdGhpcy5mdW5jdGlvbk5hbWVzU3RyaW5nID09PSBmdW5jdGlvbk5hbWVzU3RyaW5nXG4gICAgKSB7XG4gICAgICBpZiAodGhpcy5wYXJzZUNsYXNzZXMgPT09IHBhcnNlQ2xhc3Nlcykge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLnBhcnNlQ2xhc3Nlc1N0cmluZyA9PT0gcGFyc2VDbGFzc2VzU3RyaW5nKSB7XG4gICAgICAgIHRoaXMucGFyc2VDbGFzc2VzID0gcGFyc2VDbGFzc2VzO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbn1cblxuZXhwb3J0IHsgUGFyc2VHcmFwaFFMU2NoZW1hIH07XG4iXX0=