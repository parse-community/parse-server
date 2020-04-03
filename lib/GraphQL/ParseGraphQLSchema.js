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

          if (autoGraphQLSchemaType && typeof customGraphQLSchemaType.getFields === 'function') {
            const findAndAddLastType = type => {
              if (type.name) {
                if (!this.graphQLAutoSchema.getType(type)) {
                  // To avoid schema stitching (Unknow type) bug on variables
                  // transfer the final type to the Auto Schema
                  this.graphQLAutoSchema._typeMap[type.name] = type;
                }
              } else {
                if (type.ofType) {
                  findAndAddLastType(type.ofType);
                }
              }
            };

            Object.values(customGraphQLSchemaType.getFields()).forEach(field => {
              findAndAddLastType(field.type);

              if (field.args) {
                field.args.forEach(arg => {
                  findAndAddLastType(arg.type);
                });
              }
            });
            autoGraphQLSchemaType._fields = _objectSpread({}, autoGraphQLSchemaType._fields, {}, customGraphQLSchemaType._fields);

            if (customGraphQLSchemaType.name !== 'Query' && customGraphQLSchemaType.name !== 'Mutation' && customGraphQLSchemaType.name !== 'Subscription') {
              customGraphQLSchemaType._fields = _objectSpread({}, autoGraphQLSchemaType._fields, {}, customGraphQLSchemaType._fields);
            }
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9HcmFwaFFML1BhcnNlR3JhcGhRTFNjaGVtYS5qcyJdLCJuYW1lcyI6WyJSRVNFUlZFRF9HUkFQSFFMX1RZUEVfTkFNRVMiLCJSRVNFUlZFRF9HUkFQSFFMX1FVRVJZX05BTUVTIiwiUkVTRVJWRURfR1JBUEhRTF9NVVRBVElPTl9OQU1FUyIsIlBhcnNlR3JhcGhRTFNjaGVtYSIsImNvbnN0cnVjdG9yIiwicGFyYW1zIiwicGFyc2VHcmFwaFFMQ29udHJvbGxlciIsImRhdGFiYXNlQ29udHJvbGxlciIsImxvZyIsImdyYXBoUUxDdXN0b21UeXBlRGVmcyIsImFwcElkIiwibG9hZCIsInBhcnNlR3JhcGhRTENvbmZpZyIsIl9pbml0aWFsaXplU2NoZW1hQW5kQ29uZmlnIiwicGFyc2VDbGFzc2VzIiwiX2dldENsYXNzZXNGb3JTY2hlbWEiLCJwYXJzZUNsYXNzZXNTdHJpbmciLCJKU09OIiwic3RyaW5naWZ5IiwiZnVuY3Rpb25OYW1lcyIsIl9nZXRGdW5jdGlvbk5hbWVzIiwiZnVuY3Rpb25OYW1lc1N0cmluZyIsImdyYXBoUUxTY2hlbWEiLCJfaGFzU2NoZW1hSW5wdXRDaGFuZ2VkIiwicGFyc2VDbGFzc1R5cGVzIiwidmlld2VyVHlwZSIsImdyYXBoUUxBdXRvU2NoZW1hIiwiZ3JhcGhRTFR5cGVzIiwiZ3JhcGhRTFF1ZXJpZXMiLCJncmFwaFFMTXV0YXRpb25zIiwiZ3JhcGhRTFN1YnNjcmlwdGlvbnMiLCJncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zIiwiZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXMiLCJyZWxheU5vZGVJbnRlcmZhY2UiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiZGVmYXVsdFJlbGF5U2NoZW1hIiwic2NoZW1hVHlwZXMiLCJfZ2V0UGFyc2VDbGFzc2VzV2l0aENvbmZpZyIsImZvckVhY2giLCJwYXJzZUNsYXNzIiwicGFyc2VDbGFzc0NvbmZpZyIsInBhcnNlQ2xhc3NRdWVyaWVzIiwicGFyc2VDbGFzc011dGF0aW9ucyIsImxvYWRBcnJheVJlc3VsdCIsImRlZmF1bHRHcmFwaFFMUXVlcmllcyIsImRlZmF1bHRHcmFwaFFMTXV0YXRpb25zIiwiZ3JhcGhRTFF1ZXJ5IiwidW5kZWZpbmVkIiwiT2JqZWN0Iiwia2V5cyIsImxlbmd0aCIsIkdyYXBoUUxPYmplY3RUeXBlIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiZmllbGRzIiwiYWRkR3JhcGhRTFR5cGUiLCJncmFwaFFMTXV0YXRpb24iLCJncmFwaFFMU3Vic2NyaXB0aW9uIiwiR3JhcGhRTFNjaGVtYSIsInR5cGVzIiwicXVlcnkiLCJtdXRhdGlvbiIsInN1YnNjcmlwdGlvbiIsInNjaGVtYURpcmVjdGl2ZXMiLCJnZXRUeXBlTWFwIiwiY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXAiLCJ2YWx1ZXMiLCJjdXN0b21HcmFwaFFMU2NoZW1hVHlwZSIsInN0YXJ0c1dpdGgiLCJhdXRvR3JhcGhRTFNjaGVtYVR5cGUiLCJnZXRUeXBlIiwiZ2V0RmllbGRzIiwiZmluZEFuZEFkZExhc3RUeXBlIiwidHlwZSIsIl90eXBlTWFwIiwib2ZUeXBlIiwiZmllbGQiLCJhcmdzIiwiYXJnIiwiX2ZpZWxkcyIsInNjaGVtYXMiLCJtZXJnZURpcmVjdGl2ZXMiLCJkaXJlY3RpdmVzRGVmaW5pdGlvbnNTY2hlbWEiLCJhdXRvU2NoZW1hIiwibWVyZ2VTY2hlbWFzIiwiZ3JhcGhRTFNjaGVtYVR5cGVNYXAiLCJncmFwaFFMU2NoZW1hVHlwZU5hbWUiLCJncmFwaFFMU2NoZW1hVHlwZSIsImRlZmluaXRpb25zIiwiZ3JhcGhRTEN1c3RvbVR5cGVEZWYiLCJmaW5kIiwiZGVmaW5pdGlvbiIsInZhbHVlIiwiZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE1hcCIsImdyYXBoUUxTY2hlbWFUeXBlRmllbGROYW1lIiwiZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZCIsImFzdE5vZGUiLCJTY2hlbWFEaXJlY3RpdmVWaXNpdG9yIiwidmlzaXRTY2hlbWFEaXJlY3RpdmVzIiwidGhyb3dFcnJvciIsImlnbm9yZVJlc2VydmVkIiwiaWdub3JlQ29ubmVjdGlvbiIsImluY2x1ZGVzIiwiZXhpc3RpbmdUeXBlIiwiZW5kc1dpdGgiLCJtZXNzYWdlIiwiRXJyb3IiLCJ3YXJuIiwicHVzaCIsImFkZEdyYXBoUUxRdWVyeSIsImZpZWxkTmFtZSIsImFkZEdyYXBoUUxNdXRhdGlvbiIsImhhbmRsZUVycm9yIiwiZXJyb3IiLCJQYXJzZSIsInN0YWNrIiwic2NoZW1hQ29udHJvbGxlciIsIlByb21pc2UiLCJhbGwiLCJsb2FkU2NoZW1hIiwiZ2V0R3JhcGhRTENvbmZpZyIsImVuYWJsZWRGb3JDbGFzc2VzIiwiZGlzYWJsZWRGb3JDbGFzc2VzIiwiYWxsQ2xhc3NlcyIsImdldEFsbENsYXNzZXMiLCJBcnJheSIsImlzQXJyYXkiLCJpbmNsdWRlZENsYXNzZXMiLCJmaWx0ZXIiLCJjbGF6eiIsImNsYXNzTmFtZSIsImlzVXNlcnNDbGFzc0Rpc2FibGVkIiwic29tZSIsImNsYXNzQ29uZmlncyIsInNvcnRDbGFzc2VzIiwiYSIsImIiLCJzb3J0IiwibWFwIiwiYyIsImZ1bmN0aW9uTmFtZSIsInRlc3QiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFNQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFHQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7Ozs7Ozs7QUFFQSxNQUFNQSwyQkFBMkIsR0FBRyxDQUNsQyxRQURrQyxFQUVsQyxTQUZrQyxFQUdsQyxLQUhrQyxFQUlsQyxPQUprQyxFQUtsQyxJQUxrQyxFQU1sQyxhQU5rQyxFQU9sQyxPQVBrQyxFQVFsQyxVQVJrQyxFQVNsQyxjQVRrQyxFQVVsQyxpQkFWa0MsRUFXbEMsbUJBWGtDLEVBWWxDLFFBWmtDLEVBYWxDLGFBYmtDLEVBY2xDLGVBZGtDLEVBZWxDLFlBZmtDLEVBZ0JsQyxjQWhCa0MsRUFpQmxDLGFBakJrQyxFQWtCbEMsZUFsQmtDLEVBbUJsQyxtQkFuQmtD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UDtBQUNEOztBQUVELFVBQUksS0FBS0Usa0JBQUwsS0FBNEJBLGtCQUFoQyxFQUFvRDtBQUNsRCxhQUFLRixZQUFMLEdBQW9CQSxZQUFwQjtBQUNBLGVBQU8sS0FBUDtBQUNEO0FBQ0Y7O0FBRUQsV0FBTyxJQUFQO0FBQ0Q7O0FBdmRzQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7XG4gIEdyYXBoUUxTY2hlbWEsXG4gIEdyYXBoUUxPYmplY3RUeXBlLFxuICBEb2N1bWVudE5vZGUsXG4gIEdyYXBoUUxOYW1lZFR5cGUsXG59IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgbWVyZ2VTY2hlbWFzLCBTY2hlbWFEaXJlY3RpdmVWaXNpdG9yIH0gZnJvbSAnZ3JhcGhxbC10b29scyc7XG5pbXBvcnQgcmVxdWlyZWRQYXJhbWV0ZXIgZnJvbSAnLi4vcmVxdWlyZWRQYXJhbWV0ZXInO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgKiBhcyBwYXJzZUNsYXNzVHlwZXMgZnJvbSAnLi9sb2FkZXJzL3BhcnNlQ2xhc3NUeXBlcyc7XG5pbXBvcnQgKiBhcyBwYXJzZUNsYXNzUXVlcmllcyBmcm9tICcuL2xvYWRlcnMvcGFyc2VDbGFzc1F1ZXJpZXMnO1xuaW1wb3J0ICogYXMgcGFyc2VDbGFzc011dGF0aW9ucyBmcm9tICcuL2xvYWRlcnMvcGFyc2VDbGFzc011dGF0aW9ucyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFF1ZXJpZXMgZnJvbSAnLi9sb2FkZXJzL2RlZmF1bHRHcmFwaFFMUXVlcmllcyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTE11dGF0aW9ucyBmcm9tICcuL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxNdXRhdGlvbnMnO1xuaW1wb3J0IFBhcnNlR3JhcGhRTENvbnRyb2xsZXIsIHtcbiAgUGFyc2VHcmFwaFFMQ29uZmlnLFxufSBmcm9tICcuLi9Db250cm9sbGVycy9QYXJzZUdyYXBoUUxDb250cm9sbGVyJztcbmltcG9ydCBEYXRhYmFzZUNvbnRyb2xsZXIgZnJvbSAnLi4vQ29udHJvbGxlcnMvRGF0YWJhc2VDb250cm9sbGVyJztcbmltcG9ydCB7IHRvR3JhcGhRTEVycm9yIH0gZnJvbSAnLi9wYXJzZUdyYXBoUUxVdGlscyc7XG5pbXBvcnQgKiBhcyBzY2hlbWFEaXJlY3RpdmVzIGZyb20gJy4vbG9hZGVycy9zY2hlbWFEaXJlY3RpdmVzJztcbmltcG9ydCAqIGFzIHNjaGVtYVR5cGVzIGZyb20gJy4vbG9hZGVycy9zY2hlbWFUeXBlcyc7XG5pbXBvcnQgeyBnZXRGdW5jdGlvbk5hbWVzIH0gZnJvbSAnLi4vdHJpZ2dlcnMnO1xuaW1wb3J0ICogYXMgZGVmYXVsdFJlbGF5U2NoZW1hIGZyb20gJy4vbG9hZGVycy9kZWZhdWx0UmVsYXlTY2hlbWEnO1xuXG5jb25zdCBSRVNFUlZFRF9HUkFQSFFMX1RZUEVfTkFNRVMgPSBbXG4gICdTdHJpbmcnLFxuICAnQm9vbGVhbicsXG4gICdJbnQnLFxuICAnRmxvYXQnLFxuICAnSUQnLFxuICAnQXJyYXlSZXN1bHQnLFxuICAnUXVlcnknLFxuICAnTXV0YXRpb24nLFxuICAnU3Vic2NyaXB0aW9uJyxcbiAgJ0NyZWF0ZUZpbGVJbnB1dCcsXG4gICdDcmVhdGVGaWxlUGF5bG9hZCcsXG4gICdWaWV3ZXInLFxuICAnU2lnblVwSW5wdXQnLFxuICAnU2lnblVwUGF5bG9hZCcsXG4gICdMb2dJbklucHV0JyxcbiAgJ0xvZ0luUGF5bG9hZCcsXG4gICdMb2dPdXRJbnB1dCcsXG4gICdMb2dPdXRQYXlsb2FkJyxcbiAgJ0Nsb3VkQ29kZUZ1bmN0aW9uJyxcbiAgJ0NhbGxDbG91ZENvZGVJbnB1dCcsXG4gICdDYWxsQ2xvdWRDb2RlUGF5bG9hZCcsXG4gICdDcmVhdGVDbGFzc0lucHV0JyxcbiAgJ0NyZWF0ZUNsYXNzUGF5bG9hZCcsXG4gICdVcGRhdGVDbGFzc0lucHV0JyxcbiAgJ1VwZGF0ZUNsYXNzUGF5bG9hZCcsXG4gICdEZWxldGVDbGFzc0lucHV0JyxcbiAgJ0RlbGV0ZUNsYXNzUGF5bG9hZCcsXG4gICdQYWdlSW5mbycsXG5dO1xuY29uc3QgUkVTRVJWRURfR1JBUEhRTF9RVUVSWV9OQU1FUyA9IFsnaGVhbHRoJywgJ3ZpZXdlcicsICdjbGFzcycsICdjbGFzc2VzJ107XG5jb25zdCBSRVNFUlZFRF9HUkFQSFFMX01VVEFUSU9OX05BTUVTID0gW1xuICAnc2lnblVwJyxcbiAgJ2xvZ0luJyxcbiAgJ2xvZ091dCcsXG4gICdjcmVhdGVGaWxlJyxcbiAgJ2NhbGxDbG91ZENvZGUnLFxuICAnY3JlYXRlQ2xhc3MnLFxuICAndXBkYXRlQ2xhc3MnLFxuICAnZGVsZXRlQ2xhc3MnLFxuXTtcblxuY2xhc3MgUGFyc2VHcmFwaFFMU2NoZW1hIHtcbiAgZGF0YWJhc2VDb250cm9sbGVyOiBEYXRhYmFzZUNvbnRyb2xsZXI7XG4gIHBhcnNlR3JhcGhRTENvbnRyb2xsZXI6IFBhcnNlR3JhcGhRTENvbnRyb2xsZXI7XG4gIHBhcnNlR3JhcGhRTENvbmZpZzogUGFyc2VHcmFwaFFMQ29uZmlnO1xuICBsb2c6IGFueTtcbiAgYXBwSWQ6IHN0cmluZztcbiAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzOiA/KFxuICAgIHwgc3RyaW5nXG4gICAgfCBHcmFwaFFMU2NoZW1hXG4gICAgfCBEb2N1bWVudE5vZGVcbiAgICB8IEdyYXBoUUxOYW1lZFR5cGVbXVxuICApO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHBhcmFtczoge1xuICAgICAgZGF0YWJhc2VDb250cm9sbGVyOiBEYXRhYmFzZUNvbnRyb2xsZXIsXG4gICAgICBwYXJzZUdyYXBoUUxDb250cm9sbGVyOiBQYXJzZUdyYXBoUUxDb250cm9sbGVyLFxuICAgICAgbG9nOiBhbnksXG4gICAgICBhcHBJZDogc3RyaW5nLFxuICAgICAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzOiA/KFxuICAgICAgICB8IHN0cmluZ1xuICAgICAgICB8IEdyYXBoUUxTY2hlbWFcbiAgICAgICAgfCBEb2N1bWVudE5vZGVcbiAgICAgICAgfCBHcmFwaFFMTmFtZWRUeXBlW11cbiAgICAgICksXG4gICAgfSA9IHt9XG4gICkge1xuICAgIHRoaXMucGFyc2VHcmFwaFFMQ29udHJvbGxlciA9XG4gICAgICBwYXJhbXMucGFyc2VHcmFwaFFMQ29udHJvbGxlciB8fFxuICAgICAgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBwYXJzZUdyYXBoUUxDb250cm9sbGVyIGluc3RhbmNlIScpO1xuICAgIHRoaXMuZGF0YWJhc2VDb250cm9sbGVyID1cbiAgICAgIHBhcmFtcy5kYXRhYmFzZUNvbnRyb2xsZXIgfHxcbiAgICAgIHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgZGF0YWJhc2VDb250cm9sbGVyIGluc3RhbmNlIScpO1xuICAgIHRoaXMubG9nID1cbiAgICAgIHBhcmFtcy5sb2cgfHwgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBsb2cgaW5zdGFuY2UhJyk7XG4gICAgdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMgPSBwYXJhbXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzO1xuICAgIHRoaXMuYXBwSWQgPVxuICAgICAgcGFyYW1zLmFwcElkIHx8IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIHRoZSBhcHBJZCEnKTtcbiAgfVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgY29uc3QgeyBwYXJzZUdyYXBoUUxDb25maWcgfSA9IGF3YWl0IHRoaXMuX2luaXRpYWxpemVTY2hlbWFBbmRDb25maWcoKTtcbiAgICBjb25zdCBwYXJzZUNsYXNzZXMgPSBhd2FpdCB0aGlzLl9nZXRDbGFzc2VzRm9yU2NoZW1hKHBhcnNlR3JhcGhRTENvbmZpZyk7XG4gICAgY29uc3QgcGFyc2VDbGFzc2VzU3RyaW5nID0gSlNPTi5zdHJpbmdpZnkocGFyc2VDbGFzc2VzKTtcbiAgICBjb25zdCBmdW5jdGlvbk5hbWVzID0gYXdhaXQgdGhpcy5fZ2V0RnVuY3Rpb25OYW1lcygpO1xuICAgIGNvbnN0IGZ1bmN0aW9uTmFtZXNTdHJpbmcgPSBKU09OLnN0cmluZ2lmeShmdW5jdGlvbk5hbWVzKTtcblxuICAgIGlmIChcbiAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSAmJlxuICAgICAgIXRoaXMuX2hhc1NjaGVtYUlucHV0Q2hhbmdlZCh7XG4gICAgICAgIHBhcnNlQ2xhc3NlcyxcbiAgICAgICAgcGFyc2VDbGFzc2VzU3RyaW5nLFxuICAgICAgICBwYXJzZUdyYXBoUUxDb25maWcsXG4gICAgICAgIGZ1bmN0aW9uTmFtZXNTdHJpbmcsXG4gICAgICB9KVxuICAgICkge1xuICAgICAgcmV0dXJuIHRoaXMuZ3JhcGhRTFNjaGVtYTtcbiAgICB9XG5cbiAgICB0aGlzLnBhcnNlQ2xhc3NlcyA9IHBhcnNlQ2xhc3NlcztcbiAgICB0aGlzLnBhcnNlQ2xhc3Nlc1N0cmluZyA9IHBhcnNlQ2xhc3Nlc1N0cmluZztcbiAgICB0aGlzLnBhcnNlR3JhcGhRTENvbmZpZyA9IHBhcnNlR3JhcGhRTENvbmZpZztcbiAgICB0aGlzLmZ1bmN0aW9uTmFtZXMgPSBmdW5jdGlvbk5hbWVzO1xuICAgIHRoaXMuZnVuY3Rpb25OYW1lc1N0cmluZyA9IGZ1bmN0aW9uTmFtZXNTdHJpbmc7XG4gICAgdGhpcy5wYXJzZUNsYXNzVHlwZXMgPSB7fTtcbiAgICB0aGlzLnZpZXdlclR5cGUgPSBudWxsO1xuICAgIHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEgPSBudWxsO1xuICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSA9IG51bGw7XG4gICAgdGhpcy5ncmFwaFFMVHlwZXMgPSBbXTtcbiAgICB0aGlzLmdyYXBoUUxRdWVyaWVzID0ge307XG4gICAgdGhpcy5ncmFwaFFMTXV0YXRpb25zID0ge307XG4gICAgdGhpcy5ncmFwaFFMU3Vic2NyaXB0aW9ucyA9IHt9O1xuICAgIHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXNEZWZpbml0aW9ucyA9IG51bGw7XG4gICAgdGhpcy5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlcyA9IHt9O1xuICAgIHRoaXMucmVsYXlOb2RlSW50ZXJmYWNlID0gbnVsbDtcblxuICAgIGRlZmF1bHRHcmFwaFFMVHlwZXMubG9hZCh0aGlzKTtcbiAgICBkZWZhdWx0UmVsYXlTY2hlbWEubG9hZCh0aGlzKTtcbiAgICBzY2hlbWFUeXBlcy5sb2FkKHRoaXMpO1xuXG4gICAgdGhpcy5fZ2V0UGFyc2VDbGFzc2VzV2l0aENvbmZpZyhwYXJzZUNsYXNzZXMsIHBhcnNlR3JhcGhRTENvbmZpZykuZm9yRWFjaChcbiAgICAgIChbcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZ10pID0+IHtcbiAgICAgICAgcGFyc2VDbGFzc1R5cGVzLmxvYWQodGhpcywgcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZyk7XG4gICAgICAgIHBhcnNlQ2xhc3NRdWVyaWVzLmxvYWQodGhpcywgcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZyk7XG4gICAgICAgIHBhcnNlQ2xhc3NNdXRhdGlvbnMubG9hZCh0aGlzLCBwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnKTtcbiAgICAgIH1cbiAgICApO1xuXG4gICAgZGVmYXVsdEdyYXBoUUxUeXBlcy5sb2FkQXJyYXlSZXN1bHQodGhpcywgcGFyc2VDbGFzc2VzKTtcbiAgICBkZWZhdWx0R3JhcGhRTFF1ZXJpZXMubG9hZCh0aGlzKTtcbiAgICBkZWZhdWx0R3JhcGhRTE11dGF0aW9ucy5sb2FkKHRoaXMpO1xuXG4gICAgbGV0IGdyYXBoUUxRdWVyeSA9IHVuZGVmaW5lZDtcbiAgICBpZiAoT2JqZWN0LmtleXModGhpcy5ncmFwaFFMUXVlcmllcykubGVuZ3RoID4gMCkge1xuICAgICAgZ3JhcGhRTFF1ZXJ5ID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICAgICAgbmFtZTogJ1F1ZXJ5JyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdRdWVyeSBpcyB0aGUgdG9wIGxldmVsIHR5cGUgZm9yIHF1ZXJpZXMuJyxcbiAgICAgICAgZmllbGRzOiB0aGlzLmdyYXBoUUxRdWVyaWVzLFxuICAgICAgfSk7XG4gICAgICB0aGlzLmFkZEdyYXBoUUxUeXBlKGdyYXBoUUxRdWVyeSwgdHJ1ZSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgbGV0IGdyYXBoUUxNdXRhdGlvbiA9IHVuZGVmaW5lZDtcbiAgICBpZiAoT2JqZWN0LmtleXModGhpcy5ncmFwaFFMTXV0YXRpb25zKS5sZW5ndGggPiAwKSB7XG4gICAgICBncmFwaFFMTXV0YXRpb24gPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgICAgICBuYW1lOiAnTXV0YXRpb24nLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ011dGF0aW9uIGlzIHRoZSB0b3AgbGV2ZWwgdHlwZSBmb3IgbXV0YXRpb25zLicsXG4gICAgICAgIGZpZWxkczogdGhpcy5ncmFwaFFMTXV0YXRpb25zLFxuICAgICAgfSk7XG4gICAgICB0aGlzLmFkZEdyYXBoUUxUeXBlKGdyYXBoUUxNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgbGV0IGdyYXBoUUxTdWJzY3JpcHRpb24gPSB1bmRlZmluZWQ7XG4gICAgaWYgKE9iamVjdC5rZXlzKHRoaXMuZ3JhcGhRTFN1YnNjcmlwdGlvbnMpLmxlbmd0aCA+IDApIHtcbiAgICAgIGdyYXBoUUxTdWJzY3JpcHRpb24gPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgICAgICBuYW1lOiAnU3Vic2NyaXB0aW9uJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdTdWJzY3JpcHRpb24gaXMgdGhlIHRvcCBsZXZlbCB0eXBlIGZvciBzdWJzY3JpcHRpb25zLicsXG4gICAgICAgIGZpZWxkczogdGhpcy5ncmFwaFFMU3Vic2NyaXB0aW9ucyxcbiAgICAgIH0pO1xuICAgICAgdGhpcy5hZGRHcmFwaFFMVHlwZShncmFwaFFMU3Vic2NyaXB0aW9uLCB0cnVlLCB0cnVlKTtcbiAgICB9XG5cbiAgICB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hID0gbmV3IEdyYXBoUUxTY2hlbWEoe1xuICAgICAgdHlwZXM6IHRoaXMuZ3JhcGhRTFR5cGVzLFxuICAgICAgcXVlcnk6IGdyYXBoUUxRdWVyeSxcbiAgICAgIG11dGF0aW9uOiBncmFwaFFMTXV0YXRpb24sXG4gICAgICBzdWJzY3JpcHRpb246IGdyYXBoUUxTdWJzY3JpcHRpb24sXG4gICAgfSk7XG5cbiAgICBpZiAodGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMpIHtcbiAgICAgIHNjaGVtYURpcmVjdGl2ZXMubG9hZCh0aGlzKTtcblxuICAgICAgaWYgKHR5cGVvZiB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcy5nZXRUeXBlTWFwID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIGNvbnN0IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlTWFwID0gdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMuZ2V0VHlwZU1hcCgpO1xuICAgICAgICBPYmplY3QudmFsdWVzKGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlTWFwKS5mb3JFYWNoKFxuICAgICAgICAgIGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlID0+IHtcbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgIWN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlIHx8XG4gICAgICAgICAgICAgICFjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lIHx8XG4gICAgICAgICAgICAgIGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWUuc3RhcnRzV2l0aCgnX18nKVxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGF1dG9HcmFwaFFMU2NoZW1hVHlwZSA9IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuZ2V0VHlwZShcbiAgICAgICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgYXV0b0dyYXBoUUxTY2hlbWFUeXBlICYmXG4gICAgICAgICAgICAgIHR5cGVvZiBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5nZXRGaWVsZHMgPT09ICdmdW5jdGlvbidcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICBjb25zdCBmaW5kQW5kQWRkTGFzdFR5cGUgPSB0eXBlID0+IHtcbiAgICAgICAgICAgICAgICBpZiAodHlwZS5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICBpZiAoIXRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuZ2V0VHlwZSh0eXBlKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBUbyBhdm9pZCBzY2hlbWEgc3RpdGNoaW5nIChVbmtub3cgdHlwZSkgYnVnIG9uIHZhcmlhYmxlc1xuICAgICAgICAgICAgICAgICAgICAvLyB0cmFuc2ZlciB0aGUgZmluYWwgdHlwZSB0byB0aGUgQXV0byBTY2hlbWFcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYS5fdHlwZU1hcFt0eXBlLm5hbWVdID0gdHlwZTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgaWYgKHR5cGUub2ZUeXBlKSB7XG4gICAgICAgICAgICAgICAgICAgIGZpbmRBbmRBZGRMYXN0VHlwZSh0eXBlLm9mVHlwZSk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICBPYmplY3QudmFsdWVzKGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLmdldEZpZWxkcygpKS5mb3JFYWNoKFxuICAgICAgICAgICAgICAgIGZpZWxkID0+IHtcbiAgICAgICAgICAgICAgICAgIGZpbmRBbmRBZGRMYXN0VHlwZShmaWVsZC50eXBlKTtcbiAgICAgICAgICAgICAgICAgIGlmIChmaWVsZC5hcmdzKSB7XG4gICAgICAgICAgICAgICAgICAgIGZpZWxkLmFyZ3MuZm9yRWFjaChhcmcgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgIGZpbmRBbmRBZGRMYXN0VHlwZShhcmcudHlwZSk7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgYXV0b0dyYXBoUUxTY2hlbWFUeXBlLl9maWVsZHMgPSB7XG4gICAgICAgICAgICAgICAgLi4uYXV0b0dyYXBoUUxTY2hlbWFUeXBlLl9maWVsZHMsXG4gICAgICAgICAgICAgICAgLi4uY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUuX2ZpZWxkcyxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgIGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWUgIT09ICdRdWVyeScgJiZcbiAgICAgICAgICAgICAgICBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lICE9PSAnTXV0YXRpb24nICYmXG4gICAgICAgICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZSAhPT0gJ1N1YnNjcmlwdGlvbidcbiAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUuX2ZpZWxkcyA9IHtcbiAgICAgICAgICAgICAgICAgIC4uLmF1dG9HcmFwaFFMU2NoZW1hVHlwZS5fZmllbGRzLFxuICAgICAgICAgICAgICAgICAgLi4uY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUuX2ZpZWxkcyxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICApO1xuICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSBtZXJnZVNjaGVtYXMoe1xuICAgICAgICAgIHNjaGVtYXM6IFtcbiAgICAgICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXNEZWZpbml0aW9ucyxcbiAgICAgICAgICAgIHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLFxuICAgICAgICAgICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYSxcbiAgICAgICAgICBdLFxuICAgICAgICAgIG1lcmdlRGlyZWN0aXZlczogdHJ1ZSxcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSBhd2FpdCB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcyh7XG4gICAgICAgICAgZGlyZWN0aXZlc0RlZmluaXRpb25zU2NoZW1hOiB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzRGVmaW5pdGlvbnMsXG4gICAgICAgICAgYXV0b1NjaGVtYTogdGhpcy5ncmFwaFFMQXV0b1NjaGVtYSxcbiAgICAgICAgICBtZXJnZVNjaGVtYXMsXG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hID0gbWVyZ2VTY2hlbWFzKHtcbiAgICAgICAgICBzY2hlbWFzOiBbXG4gICAgICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzRGVmaW5pdGlvbnMsXG4gICAgICAgICAgICB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLFxuICAgICAgICAgICAgdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMsXG4gICAgICAgICAgXSxcbiAgICAgICAgICBtZXJnZURpcmVjdGl2ZXM6IHRydWUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBncmFwaFFMU2NoZW1hVHlwZU1hcCA9IHRoaXMuZ3JhcGhRTFNjaGVtYS5nZXRUeXBlTWFwKCk7XG4gICAgICBPYmplY3Qua2V5cyhncmFwaFFMU2NoZW1hVHlwZU1hcCkuZm9yRWFjaChncmFwaFFMU2NoZW1hVHlwZU5hbWUgPT4ge1xuICAgICAgICBjb25zdCBncmFwaFFMU2NoZW1hVHlwZSA9IGdyYXBoUUxTY2hlbWFUeXBlTWFwW2dyYXBoUUxTY2hlbWFUeXBlTmFtZV07XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0eXBlb2YgZ3JhcGhRTFNjaGVtYVR5cGUuZ2V0RmllbGRzID09PSAnZnVuY3Rpb24nICYmXG4gICAgICAgICAgdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMuZGVmaW5pdGlvbnNcbiAgICAgICAgKSB7XG4gICAgICAgICAgY29uc3QgZ3JhcGhRTEN1c3RvbVR5cGVEZWYgPSB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcy5kZWZpbml0aW9ucy5maW5kKFxuICAgICAgICAgICAgZGVmaW5pdGlvbiA9PiBkZWZpbml0aW9uLm5hbWUudmFsdWUgPT09IGdyYXBoUUxTY2hlbWFUeXBlTmFtZVxuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKGdyYXBoUUxDdXN0b21UeXBlRGVmKSB7XG4gICAgICAgICAgICBjb25zdCBncmFwaFFMU2NoZW1hVHlwZUZpZWxkTWFwID0gZ3JhcGhRTFNjaGVtYVR5cGUuZ2V0RmllbGRzKCk7XG4gICAgICAgICAgICBPYmplY3Qua2V5cyhncmFwaFFMU2NoZW1hVHlwZUZpZWxkTWFwKS5mb3JFYWNoKFxuICAgICAgICAgICAgICBncmFwaFFMU2NoZW1hVHlwZUZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZCA9XG4gICAgICAgICAgICAgICAgICBncmFwaFFMU2NoZW1hVHlwZUZpZWxkTWFwW2dyYXBoUUxTY2hlbWFUeXBlRmllbGROYW1lXTtcbiAgICAgICAgICAgICAgICBpZiAoIWdyYXBoUUxTY2hlbWFUeXBlRmllbGQuYXN0Tm9kZSkge1xuICAgICAgICAgICAgICAgICAgY29uc3QgYXN0Tm9kZSA9IGdyYXBoUUxDdXN0b21UeXBlRGVmLmZpZWxkcy5maW5kKFxuICAgICAgICAgICAgICAgICAgICBmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSBncmFwaFFMU2NoZW1hVHlwZUZpZWxkTmFtZVxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgIGlmIChhc3ROb2RlKSB7XG4gICAgICAgICAgICAgICAgICAgIGdyYXBoUUxTY2hlbWFUeXBlRmllbGQuYXN0Tm9kZSA9IGFzdE5vZGU7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIFNjaGVtYURpcmVjdGl2ZVZpc2l0b3IudmlzaXRTY2hlbWFEaXJlY3RpdmVzKFxuICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWEsXG4gICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXNcbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSA9IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWE7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuZ3JhcGhRTFNjaGVtYTtcbiAgfVxuXG4gIGFkZEdyYXBoUUxUeXBlKFxuICAgIHR5cGUsXG4gICAgdGhyb3dFcnJvciA9IGZhbHNlLFxuICAgIGlnbm9yZVJlc2VydmVkID0gZmFsc2UsXG4gICAgaWdub3JlQ29ubmVjdGlvbiA9IGZhbHNlXG4gICkge1xuICAgIGlmIChcbiAgICAgICghaWdub3JlUmVzZXJ2ZWQgJiYgUkVTRVJWRURfR1JBUEhRTF9UWVBFX05BTUVTLmluY2x1ZGVzKHR5cGUubmFtZSkpIHx8XG4gICAgICB0aGlzLmdyYXBoUUxUeXBlcy5maW5kKGV4aXN0aW5nVHlwZSA9PiBleGlzdGluZ1R5cGUubmFtZSA9PT0gdHlwZS5uYW1lKSB8fFxuICAgICAgKCFpZ25vcmVDb25uZWN0aW9uICYmIHR5cGUubmFtZS5lbmRzV2l0aCgnQ29ubmVjdGlvbicpKVxuICAgICkge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGBUeXBlICR7dHlwZS5uYW1lfSBjb3VsZCBub3QgYmUgYWRkZWQgdG8gdGhlIGF1dG8gc2NoZW1hIGJlY2F1c2UgaXQgY29sbGlkZWQgd2l0aCBhbiBleGlzdGluZyB0eXBlLmA7XG4gICAgICBpZiAodGhyb3dFcnJvcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSk7XG4gICAgICB9XG4gICAgICB0aGlzLmxvZy53YXJuKG1lc3NhZ2UpO1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgdGhpcy5ncmFwaFFMVHlwZXMucHVzaCh0eXBlKTtcbiAgICByZXR1cm4gdHlwZTtcbiAgfVxuXG4gIGFkZEdyYXBoUUxRdWVyeShcbiAgICBmaWVsZE5hbWUsXG4gICAgZmllbGQsXG4gICAgdGhyb3dFcnJvciA9IGZhbHNlLFxuICAgIGlnbm9yZVJlc2VydmVkID0gZmFsc2VcbiAgKSB7XG4gICAgaWYgKFxuICAgICAgKCFpZ25vcmVSZXNlcnZlZCAmJiBSRVNFUlZFRF9HUkFQSFFMX1FVRVJZX05BTUVTLmluY2x1ZGVzKGZpZWxkTmFtZSkpIHx8XG4gICAgICB0aGlzLmdyYXBoUUxRdWVyaWVzW2ZpZWxkTmFtZV1cbiAgICApIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBgUXVlcnkgJHtmaWVsZE5hbWV9IGNvdWxkIG5vdCBiZSBhZGRlZCB0byB0aGUgYXV0byBzY2hlbWEgYmVjYXVzZSBpdCBjb2xsaWRlZCB3aXRoIGFuIGV4aXN0aW5nIGZpZWxkLmA7XG4gICAgICBpZiAodGhyb3dFcnJvcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSk7XG4gICAgICB9XG4gICAgICB0aGlzLmxvZy53YXJuKG1lc3NhZ2UpO1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgdGhpcy5ncmFwaFFMUXVlcmllc1tmaWVsZE5hbWVdID0gZmllbGQ7XG4gICAgcmV0dXJuIGZpZWxkO1xuICB9XG5cbiAgYWRkR3JhcGhRTE11dGF0aW9uKFxuICAgIGZpZWxkTmFtZSxcbiAgICBmaWVsZCxcbiAgICB0aHJvd0Vycm9yID0gZmFsc2UsXG4gICAgaWdub3JlUmVzZXJ2ZWQgPSBmYWxzZVxuICApIHtcbiAgICBpZiAoXG4gICAgICAoIWlnbm9yZVJlc2VydmVkICYmXG4gICAgICAgIFJFU0VSVkVEX0dSQVBIUUxfTVVUQVRJT05fTkFNRVMuaW5jbHVkZXMoZmllbGROYW1lKSkgfHxcbiAgICAgIHRoaXMuZ3JhcGhRTE11dGF0aW9uc1tmaWVsZE5hbWVdXG4gICAgKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gYE11dGF0aW9uICR7ZmllbGROYW1lfSBjb3VsZCBub3QgYmUgYWRkZWQgdG8gdGhlIGF1dG8gc2NoZW1hIGJlY2F1c2UgaXQgY29sbGlkZWQgd2l0aCBhbiBleGlzdGluZyBmaWVsZC5gO1xuICAgICAgaWYgKHRocm93RXJyb3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UpO1xuICAgICAgfVxuICAgICAgdGhpcy5sb2cud2FybihtZXNzYWdlKTtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHRoaXMuZ3JhcGhRTE11dGF0aW9uc1tmaWVsZE5hbWVdID0gZmllbGQ7XG4gICAgcmV0dXJuIGZpZWxkO1xuICB9XG5cbiAgaGFuZGxlRXJyb3IoZXJyb3IpIHtcbiAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBQYXJzZS5FcnJvcikge1xuICAgICAgdGhpcy5sb2cuZXJyb3IoJ1BhcnNlIGVycm9yOiAnLCBlcnJvcik7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMubG9nLmVycm9yKCdVbmNhdWdodCBpbnRlcm5hbCBzZXJ2ZXIgZXJyb3IuJywgZXJyb3IsIGVycm9yLnN0YWNrKTtcbiAgICB9XG4gICAgdGhyb3cgdG9HcmFwaFFMRXJyb3IoZXJyb3IpO1xuICB9XG5cbiAgYXN5bmMgX2luaXRpYWxpemVTY2hlbWFBbmRDb25maWcoKSB7XG4gICAgY29uc3QgW3NjaGVtYUNvbnRyb2xsZXIsIHBhcnNlR3JhcGhRTENvbmZpZ10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICB0aGlzLmRhdGFiYXNlQ29udHJvbGxlci5sb2FkU2NoZW1hKCksXG4gICAgICB0aGlzLnBhcnNlR3JhcGhRTENvbnRyb2xsZXIuZ2V0R3JhcGhRTENvbmZpZygpLFxuICAgIF0pO1xuXG4gICAgdGhpcy5zY2hlbWFDb250cm9sbGVyID0gc2NoZW1hQ29udHJvbGxlcjtcblxuICAgIHJldHVybiB7XG4gICAgICBwYXJzZUdyYXBoUUxDb25maWcsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXRzIGFsbCBjbGFzc2VzIGZvdW5kIGJ5IHRoZSBgc2NoZW1hQ29udHJvbGxlcmBcbiAgICogbWludXMgdGhvc2UgZmlsdGVyZWQgb3V0IGJ5IHRoZSBhcHAncyBwYXJzZUdyYXBoUUxDb25maWcuXG4gICAqL1xuICBhc3luYyBfZ2V0Q2xhc3Nlc0ZvclNjaGVtYShwYXJzZUdyYXBoUUxDb25maWc6IFBhcnNlR3JhcGhRTENvbmZpZykge1xuICAgIGNvbnN0IHsgZW5hYmxlZEZvckNsYXNzZXMsIGRpc2FibGVkRm9yQ2xhc3NlcyB9ID0gcGFyc2VHcmFwaFFMQ29uZmlnO1xuICAgIGNvbnN0IGFsbENsYXNzZXMgPSBhd2FpdCB0aGlzLnNjaGVtYUNvbnRyb2xsZXIuZ2V0QWxsQ2xhc3NlcygpO1xuXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZW5hYmxlZEZvckNsYXNzZXMpIHx8IEFycmF5LmlzQXJyYXkoZGlzYWJsZWRGb3JDbGFzc2VzKSkge1xuICAgICAgbGV0IGluY2x1ZGVkQ2xhc3NlcyA9IGFsbENsYXNzZXM7XG4gICAgICBpZiAoZW5hYmxlZEZvckNsYXNzZXMpIHtcbiAgICAgICAgaW5jbHVkZWRDbGFzc2VzID0gYWxsQ2xhc3Nlcy5maWx0ZXIoY2xhenogPT4ge1xuICAgICAgICAgIHJldHVybiBlbmFibGVkRm9yQ2xhc3Nlcy5pbmNsdWRlcyhjbGF6ei5jbGFzc05hbWUpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIGlmIChkaXNhYmxlZEZvckNsYXNzZXMpIHtcbiAgICAgICAgLy8gQ2xhc3NlcyBpbmNsdWRlZCBpbiBgZW5hYmxlZEZvckNsYXNzZXNgIHRoYXRcbiAgICAgICAgLy8gYXJlIGFsc28gcHJlc2VudCBpbiBgZGlzYWJsZWRGb3JDbGFzc2VzYCB3aWxsXG4gICAgICAgIC8vIHN0aWxsIGJlIGZpbHRlcmVkIG91dFxuICAgICAgICBpbmNsdWRlZENsYXNzZXMgPSBpbmNsdWRlZENsYXNzZXMuZmlsdGVyKGNsYXp6ID0+IHtcbiAgICAgICAgICByZXR1cm4gIWRpc2FibGVkRm9yQ2xhc3Nlcy5pbmNsdWRlcyhjbGF6ei5jbGFzc05hbWUpO1xuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5pc1VzZXJzQ2xhc3NEaXNhYmxlZCA9ICFpbmNsdWRlZENsYXNzZXMuc29tZShjbGF6eiA9PiB7XG4gICAgICAgIHJldHVybiBjbGF6ei5jbGFzc05hbWUgPT09ICdfVXNlcic7XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIGluY2x1ZGVkQ2xhc3NlcztcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGFsbENsYXNzZXM7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFRoaXMgbWV0aG9kIHJldHVybnMgYSBsaXN0IG9mIHR1cGxlc1xuICAgKiB0aGF0IHByb3ZpZGUgdGhlIHBhcnNlQ2xhc3MgYWxvbmcgd2l0aFxuICAgKiBpdHMgcGFyc2VDbGFzc0NvbmZpZyB3aGVyZSBwcm92aWRlZC5cbiAgICovXG4gIF9nZXRQYXJzZUNsYXNzZXNXaXRoQ29uZmlnKFxuICAgIHBhcnNlQ2xhc3NlcyxcbiAgICBwYXJzZUdyYXBoUUxDb25maWc6IFBhcnNlR3JhcGhRTENvbmZpZ1xuICApIHtcbiAgICBjb25zdCB7IGNsYXNzQ29uZmlncyB9ID0gcGFyc2VHcmFwaFFMQ29uZmlnO1xuXG4gICAgLy8gTWFrZSBzdXJlcyB0aGF0IHRoZSBkZWZhdWx0IGNsYXNzZXMgYW5kIGNsYXNzZXMgdGhhdFxuICAgIC8vIHN0YXJ0cyB3aXRoIGNhcGl0YWxpemVkIGxldHRlciB3aWxsIGJlIGdlbmVyYXRlZCBmaXJzdC5cbiAgICBjb25zdCBzb3J0Q2xhc3NlcyA9IChhLCBiKSA9PiB7XG4gICAgICBhID0gYS5jbGFzc05hbWU7XG4gICAgICBiID0gYi5jbGFzc05hbWU7XG4gICAgICBpZiAoYVswXSA9PT0gJ18nKSB7XG4gICAgICAgIGlmIChiWzBdICE9PSAnXycpIHtcbiAgICAgICAgICByZXR1cm4gLTE7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChiWzBdID09PSAnXycpIHtcbiAgICAgICAgaWYgKGFbMF0gIT09ICdfJykge1xuICAgICAgICAgIHJldHVybiAxO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoYSA9PT0gYikge1xuICAgICAgICByZXR1cm4gMDtcbiAgICAgIH0gZWxzZSBpZiAoYSA8IGIpIHtcbiAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIDE7XG4gICAgICB9XG4gICAgfTtcblxuICAgIHJldHVybiBwYXJzZUNsYXNzZXMuc29ydChzb3J0Q2xhc3NlcykubWFwKHBhcnNlQ2xhc3MgPT4ge1xuICAgICAgbGV0IHBhcnNlQ2xhc3NDb25maWc7XG4gICAgICBpZiAoY2xhc3NDb25maWdzKSB7XG4gICAgICAgIHBhcnNlQ2xhc3NDb25maWcgPSBjbGFzc0NvbmZpZ3MuZmluZChcbiAgICAgICAgICBjID0+IGMuY2xhc3NOYW1lID09PSBwYXJzZUNsYXNzLmNsYXNzTmFtZVxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIFtwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnXTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIF9nZXRGdW5jdGlvbk5hbWVzKCkge1xuICAgIHJldHVybiBhd2FpdCBnZXRGdW5jdGlvbk5hbWVzKHRoaXMuYXBwSWQpLmZpbHRlcihmdW5jdGlvbk5hbWUgPT4ge1xuICAgICAgaWYgKC9eW19hLXpBLVpdW19hLXpBLVowLTldKiQvLnRlc3QoZnVuY3Rpb25OYW1lKSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMubG9nLndhcm4oXG4gICAgICAgICAgYEZ1bmN0aW9uICR7ZnVuY3Rpb25OYW1lfSBjb3VsZCBub3QgYmUgYWRkZWQgdG8gdGhlIGF1dG8gc2NoZW1hIGJlY2F1c2UgR3JhcGhRTCBuYW1lcyBtdXN0IG1hdGNoIC9eW19hLXpBLVpdW19hLXpBLVowLTldKiQvLmBcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIENoZWNrcyBmb3IgY2hhbmdlcyB0byB0aGUgcGFyc2VDbGFzc2VzXG4gICAqIG9iamVjdHMgKGkuZS4gZGF0YWJhc2Ugc2NoZW1hKSBvciB0b1xuICAgKiB0aGUgcGFyc2VHcmFwaFFMQ29uZmlnIG9iamVjdC4gSWYgbm9cbiAgICogY2hhbmdlcyBhcmUgZm91bmQsIHJldHVybiB0cnVlO1xuICAgKi9cbiAgX2hhc1NjaGVtYUlucHV0Q2hhbmdlZChwYXJhbXM6IHtcbiAgICBwYXJzZUNsYXNzZXM6IGFueSxcbiAgICBwYXJzZUNsYXNzZXNTdHJpbmc6IHN0cmluZyxcbiAgICBwYXJzZUdyYXBoUUxDb25maWc6ID9QYXJzZUdyYXBoUUxDb25maWcsXG4gICAgZnVuY3Rpb25OYW1lc1N0cmluZzogc3RyaW5nLFxuICB9KTogYm9vbGVhbiB7XG4gICAgY29uc3Qge1xuICAgICAgcGFyc2VDbGFzc2VzLFxuICAgICAgcGFyc2VDbGFzc2VzU3RyaW5nLFxuICAgICAgcGFyc2VHcmFwaFFMQ29uZmlnLFxuICAgICAgZnVuY3Rpb25OYW1lc1N0cmluZyxcbiAgICB9ID0gcGFyYW1zO1xuXG4gICAgaWYgKFxuICAgICAgSlNPTi5zdHJpbmdpZnkodGhpcy5wYXJzZUdyYXBoUUxDb25maWcpID09PVxuICAgICAgICBKU09OLnN0cmluZ2lmeShwYXJzZUdyYXBoUUxDb25maWcpICYmXG4gICAgICB0aGlzLmZ1bmN0aW9uTmFtZXNTdHJpbmcgPT09IGZ1bmN0aW9uTmFtZXNTdHJpbmdcbiAgICApIHtcbiAgICAgIGlmICh0aGlzLnBhcnNlQ2xhc3NlcyA9PT0gcGFyc2VDbGFzc2VzKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMucGFyc2VDbGFzc2VzU3RyaW5nID09PSBwYXJzZUNsYXNzZXNTdHJpbmcpIHtcbiAgICAgICAgdGhpcy5wYXJzZUNsYXNzZXMgPSBwYXJzZUNsYXNzZXM7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxufVxuXG5leHBvcnQgeyBQYXJzZUdyYXBoUUxTY2hlbWEgfTtcbiJdfQ==