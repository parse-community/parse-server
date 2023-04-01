"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.GraphQLConfigKey = exports.GraphQLConfigId = exports.GraphQLConfigClassName = void 0;
var _requiredParameter = _interopRequireDefault(require("../../lib/requiredParameter"));
var _DatabaseController = _interopRequireDefault(require("./DatabaseController"));
var _CacheController = _interopRequireDefault(require("./CacheController"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function _objectWithoutProperties(source, excluded) { if (source == null) return {}; var target = _objectWithoutPropertiesLoose(source, excluded); var key, i; if (Object.getOwnPropertySymbols) { var sourceSymbolKeys = Object.getOwnPropertySymbols(source); for (i = 0; i < sourceSymbolKeys.length; i++) { key = sourceSymbolKeys[i]; if (excluded.indexOf(key) >= 0) continue; if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue; target[key] = source[key]; } } return target; }
function _objectWithoutPropertiesLoose(source, excluded) { if (source == null) return {}; var target = {}; var sourceKeys = Object.keys(source); var key, i; for (i = 0; i < sourceKeys.length; i++) { key = sourceKeys[i]; if (excluded.indexOf(key) >= 0) continue; target[key] = source[key]; } return target; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
const GraphQLConfigClassName = '_GraphQLConfig';
exports.GraphQLConfigClassName = GraphQLConfigClassName;
const GraphQLConfigId = '1';
exports.GraphQLConfigId = GraphQLConfigId;
const GraphQLConfigKey = 'config';
exports.GraphQLConfigKey = GraphQLConfigKey;
class ParseGraphQLController {
  constructor(params = {}) {
    this.databaseController = params.databaseController || (0, _requiredParameter.default)(`ParseGraphQLController requires a "databaseController" to be instantiated.`);
    this.cacheController = params.cacheController;
    this.isMounted = !!params.mountGraphQL;
    this.configCacheKey = GraphQLConfigKey;
  }
  async getGraphQLConfig() {
    if (this.isMounted) {
      const _cachedConfig = await this._getCachedGraphQLConfig();
      if (_cachedConfig) {
        return _cachedConfig;
      }
    }
    const results = await this.databaseController.find(GraphQLConfigClassName, {
      objectId: GraphQLConfigId
    }, {
      limit: 1
    });
    let graphQLConfig;
    if (results.length != 1) {
      // If there is no config in the database - return empty config.
      return {};
    } else {
      graphQLConfig = results[0][GraphQLConfigKey];
    }
    if (this.isMounted) {
      this._putCachedGraphQLConfig(graphQLConfig);
    }
    return graphQLConfig;
  }
  async updateGraphQLConfig(graphQLConfig) {
    // throws if invalid
    this._validateGraphQLConfig(graphQLConfig || (0, _requiredParameter.default)('You must provide a graphQLConfig!'));

    // Transform in dot notation to make sure it works
    const update = Object.keys(graphQLConfig).reduce((acc, key) => {
      return {
        [GraphQLConfigKey]: _objectSpread(_objectSpread({}, acc[GraphQLConfigKey]), {}, {
          [key]: graphQLConfig[key]
        })
      };
    }, {
      [GraphQLConfigKey]: {}
    });
    await this.databaseController.update(GraphQLConfigClassName, {
      objectId: GraphQLConfigId
    }, update, {
      upsert: true
    });
    if (this.isMounted) {
      this._putCachedGraphQLConfig(graphQLConfig);
    }
    return {
      response: {
        result: true
      }
    };
  }
  _getCachedGraphQLConfig() {
    return this.cacheController.graphQL.get(this.configCacheKey);
  }
  _putCachedGraphQLConfig(graphQLConfig) {
    return this.cacheController.graphQL.put(this.configCacheKey, graphQLConfig, 60000);
  }
  _validateGraphQLConfig(graphQLConfig) {
    const errorMessages = [];
    if (!graphQLConfig) {
      errorMessages.push('cannot be undefined, null or empty');
    } else if (!isValidSimpleObject(graphQLConfig)) {
      errorMessages.push('must be a valid object');
    } else {
      const {
          enabledForClasses = null,
          disabledForClasses = null,
          classConfigs = null
        } = graphQLConfig,
        invalidKeys = _objectWithoutProperties(graphQLConfig, ["enabledForClasses", "disabledForClasses", "classConfigs"]);
      if (Object.keys(invalidKeys).length) {
        errorMessages.push(`encountered invalid keys: [${Object.keys(invalidKeys)}]`);
      }
      if (enabledForClasses !== null && !isValidStringArray(enabledForClasses)) {
        errorMessages.push(`"enabledForClasses" is not a valid array`);
      }
      if (disabledForClasses !== null && !isValidStringArray(disabledForClasses)) {
        errorMessages.push(`"disabledForClasses" is not a valid array`);
      }
      if (classConfigs !== null) {
        if (Array.isArray(classConfigs)) {
          classConfigs.forEach(classConfig => {
            const errorMessage = this._validateClassConfig(classConfig);
            if (errorMessage) {
              errorMessages.push(`classConfig:${classConfig.className} is invalid because ${errorMessage}`);
            }
          });
        } else {
          errorMessages.push(`"classConfigs" is not a valid array`);
        }
      }
    }
    if (errorMessages.length) {
      throw new Error(`Invalid graphQLConfig: ${errorMessages.join('; ')}`);
    }
  }
  _validateClassConfig(classConfig) {
    if (!isValidSimpleObject(classConfig)) {
      return 'it must be a valid object';
    } else {
      const {
          className,
          type = null,
          query = null,
          mutation = null
        } = classConfig,
        invalidKeys = _objectWithoutProperties(classConfig, ["className", "type", "query", "mutation"]);
      if (Object.keys(invalidKeys).length) {
        return `"invalidKeys" [${Object.keys(invalidKeys)}] should not be present`;
      }
      if (typeof className !== 'string' || !className.trim().length) {
        // TODO consider checking class exists in schema?
        return `"className" must be a valid string`;
      }
      if (type !== null) {
        if (!isValidSimpleObject(type)) {
          return `"type" must be a valid object`;
        }
        const {
            inputFields = null,
            outputFields = null,
            constraintFields = null,
            sortFields = null
          } = type,
          invalidKeys = _objectWithoutProperties(type, ["inputFields", "outputFields", "constraintFields", "sortFields"]);
        if (Object.keys(invalidKeys).length) {
          return `"type" contains invalid keys, [${Object.keys(invalidKeys)}]`;
        } else if (outputFields !== null && !isValidStringArray(outputFields)) {
          return `"outputFields" must be a valid string array`;
        } else if (constraintFields !== null && !isValidStringArray(constraintFields)) {
          return `"constraintFields" must be a valid string array`;
        }
        if (sortFields !== null) {
          if (Array.isArray(sortFields)) {
            let errorMessage;
            sortFields.every((sortField, index) => {
              if (!isValidSimpleObject(sortField)) {
                errorMessage = `"sortField" at index ${index} is not a valid object`;
                return false;
              } else {
                const {
                    field,
                    asc,
                    desc
                  } = sortField,
                  invalidKeys = _objectWithoutProperties(sortField, ["field", "asc", "desc"]);
                if (Object.keys(invalidKeys).length) {
                  errorMessage = `"sortField" at index ${index} contains invalid keys, [${Object.keys(invalidKeys)}]`;
                  return false;
                } else {
                  if (typeof field !== 'string' || field.trim().length === 0) {
                    errorMessage = `"sortField" at index ${index} did not provide the "field" as a string`;
                    return false;
                  } else if (typeof asc !== 'boolean' || typeof desc !== 'boolean') {
                    errorMessage = `"sortField" at index ${index} did not provide "asc" or "desc" as booleans`;
                    return false;
                  }
                }
              }
              return true;
            });
            if (errorMessage) {
              return errorMessage;
            }
          } else {
            return `"sortFields" must be a valid array.`;
          }
        }
        if (inputFields !== null) {
          if (isValidSimpleObject(inputFields)) {
            const {
                create = null,
                update = null
              } = inputFields,
              invalidKeys = _objectWithoutProperties(inputFields, ["create", "update"]);
            if (Object.keys(invalidKeys).length) {
              return `"inputFields" contains invalid keys: [${Object.keys(invalidKeys)}]`;
            } else {
              if (update !== null && !isValidStringArray(update)) {
                return `"inputFields.update" must be a valid string array`;
              } else if (create !== null) {
                if (!isValidStringArray(create)) {
                  return `"inputFields.create" must be a valid string array`;
                } else if (className === '_User') {
                  if (!create.includes('username') || !create.includes('password')) {
                    return `"inputFields.create" must include required fields, username and password`;
                  }
                }
              }
            }
          } else {
            return `"inputFields" must be a valid object`;
          }
        }
      }
      if (query !== null) {
        if (isValidSimpleObject(query)) {
          const {
              find = null,
              get = null,
              findAlias = null,
              getAlias = null
            } = query,
            invalidKeys = _objectWithoutProperties(query, ["find", "get", "findAlias", "getAlias"]);
          if (Object.keys(invalidKeys).length) {
            return `"query" contains invalid keys, [${Object.keys(invalidKeys)}]`;
          } else if (find !== null && typeof find !== 'boolean') {
            return `"query.find" must be a boolean`;
          } else if (get !== null && typeof get !== 'boolean') {
            return `"query.get" must be a boolean`;
          } else if (findAlias !== null && typeof findAlias !== 'string') {
            return `"query.findAlias" must be a string`;
          } else if (getAlias !== null && typeof getAlias !== 'string') {
            return `"query.getAlias" must be a string`;
          }
        } else {
          return `"query" must be a valid object`;
        }
      }
      if (mutation !== null) {
        if (isValidSimpleObject(mutation)) {
          const {
              create = null,
              update = null,
              destroy = null,
              createAlias = null,
              updateAlias = null,
              destroyAlias = null
            } = mutation,
            invalidKeys = _objectWithoutProperties(mutation, ["create", "update", "destroy", "createAlias", "updateAlias", "destroyAlias"]);
          if (Object.keys(invalidKeys).length) {
            return `"mutation" contains invalid keys, [${Object.keys(invalidKeys)}]`;
          }
          if (create !== null && typeof create !== 'boolean') {
            return `"mutation.create" must be a boolean`;
          }
          if (update !== null && typeof update !== 'boolean') {
            return `"mutation.update" must be a boolean`;
          }
          if (destroy !== null && typeof destroy !== 'boolean') {
            return `"mutation.destroy" must be a boolean`;
          }
          if (createAlias !== null && typeof createAlias !== 'string') {
            return `"mutation.createAlias" must be a string`;
          }
          if (updateAlias !== null && typeof updateAlias !== 'string') {
            return `"mutation.updateAlias" must be a string`;
          }
          if (destroyAlias !== null && typeof destroyAlias !== 'string') {
            return `"mutation.destroyAlias" must be a string`;
          }
        } else {
          return `"mutation" must be a valid object`;
        }
      }
    }
  }
}
const isValidStringArray = function (array) {
  return Array.isArray(array) ? !array.some(s => typeof s !== 'string' || s.trim().length < 1) : false;
};
/**
 * Ensures the obj is a simple JSON/{}
 * object, i.e. not an array, null, date
 * etc.
 */
const isValidSimpleObject = function (obj) {
  return typeof obj === 'object' && !Array.isArray(obj) && obj !== null && obj instanceof Date !== true && obj instanceof Promise !== true;
};
var _default = ParseGraphQLController;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJHcmFwaFFMQ29uZmlnQ2xhc3NOYW1lIiwiR3JhcGhRTENvbmZpZ0lkIiwiR3JhcGhRTENvbmZpZ0tleSIsIlBhcnNlR3JhcGhRTENvbnRyb2xsZXIiLCJjb25zdHJ1Y3RvciIsInBhcmFtcyIsImRhdGFiYXNlQ29udHJvbGxlciIsInJlcXVpcmVkUGFyYW1ldGVyIiwiY2FjaGVDb250cm9sbGVyIiwiaXNNb3VudGVkIiwibW91bnRHcmFwaFFMIiwiY29uZmlnQ2FjaGVLZXkiLCJnZXRHcmFwaFFMQ29uZmlnIiwiX2NhY2hlZENvbmZpZyIsIl9nZXRDYWNoZWRHcmFwaFFMQ29uZmlnIiwicmVzdWx0cyIsImZpbmQiLCJvYmplY3RJZCIsImxpbWl0IiwiZ3JhcGhRTENvbmZpZyIsImxlbmd0aCIsIl9wdXRDYWNoZWRHcmFwaFFMQ29uZmlnIiwidXBkYXRlR3JhcGhRTENvbmZpZyIsIl92YWxpZGF0ZUdyYXBoUUxDb25maWciLCJ1cGRhdGUiLCJPYmplY3QiLCJrZXlzIiwicmVkdWNlIiwiYWNjIiwia2V5IiwidXBzZXJ0IiwicmVzcG9uc2UiLCJyZXN1bHQiLCJncmFwaFFMIiwiZ2V0IiwicHV0IiwiZXJyb3JNZXNzYWdlcyIsInB1c2giLCJpc1ZhbGlkU2ltcGxlT2JqZWN0IiwiZW5hYmxlZEZvckNsYXNzZXMiLCJkaXNhYmxlZEZvckNsYXNzZXMiLCJjbGFzc0NvbmZpZ3MiLCJpbnZhbGlkS2V5cyIsImlzVmFsaWRTdHJpbmdBcnJheSIsIkFycmF5IiwiaXNBcnJheSIsImZvckVhY2giLCJjbGFzc0NvbmZpZyIsImVycm9yTWVzc2FnZSIsIl92YWxpZGF0ZUNsYXNzQ29uZmlnIiwiY2xhc3NOYW1lIiwiRXJyb3IiLCJqb2luIiwidHlwZSIsInF1ZXJ5IiwibXV0YXRpb24iLCJ0cmltIiwiaW5wdXRGaWVsZHMiLCJvdXRwdXRGaWVsZHMiLCJjb25zdHJhaW50RmllbGRzIiwic29ydEZpZWxkcyIsImV2ZXJ5Iiwic29ydEZpZWxkIiwiaW5kZXgiLCJmaWVsZCIsImFzYyIsImRlc2MiLCJjcmVhdGUiLCJpbmNsdWRlcyIsImZpbmRBbGlhcyIsImdldEFsaWFzIiwiZGVzdHJveSIsImNyZWF0ZUFsaWFzIiwidXBkYXRlQWxpYXMiLCJkZXN0cm95QWxpYXMiLCJhcnJheSIsInNvbWUiLCJzIiwib2JqIiwiRGF0ZSIsIlByb21pc2UiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvQ29udHJvbGxlcnMvUGFyc2VHcmFwaFFMQ29udHJvbGxlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgcmVxdWlyZWRQYXJhbWV0ZXIgZnJvbSAnLi4vLi4vbGliL3JlcXVpcmVkUGFyYW1ldGVyJztcbmltcG9ydCBEYXRhYmFzZUNvbnRyb2xsZXIgZnJvbSAnLi9EYXRhYmFzZUNvbnRyb2xsZXInO1xuaW1wb3J0IENhY2hlQ29udHJvbGxlciBmcm9tICcuL0NhY2hlQ29udHJvbGxlcic7XG5cbmNvbnN0IEdyYXBoUUxDb25maWdDbGFzc05hbWUgPSAnX0dyYXBoUUxDb25maWcnO1xuY29uc3QgR3JhcGhRTENvbmZpZ0lkID0gJzEnO1xuY29uc3QgR3JhcGhRTENvbmZpZ0tleSA9ICdjb25maWcnO1xuXG5jbGFzcyBQYXJzZUdyYXBoUUxDb250cm9sbGVyIHtcbiAgZGF0YWJhc2VDb250cm9sbGVyOiBEYXRhYmFzZUNvbnRyb2xsZXI7XG4gIGNhY2hlQ29udHJvbGxlcjogQ2FjaGVDb250cm9sbGVyO1xuICBpc01vdW50ZWQ6IGJvb2xlYW47XG4gIGNvbmZpZ0NhY2hlS2V5OiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcGFyYW1zOiB7XG4gICAgICBkYXRhYmFzZUNvbnRyb2xsZXI6IERhdGFiYXNlQ29udHJvbGxlcixcbiAgICAgIGNhY2hlQ29udHJvbGxlcjogQ2FjaGVDb250cm9sbGVyLFxuICAgIH0gPSB7fVxuICApIHtcbiAgICB0aGlzLmRhdGFiYXNlQ29udHJvbGxlciA9XG4gICAgICBwYXJhbXMuZGF0YWJhc2VDb250cm9sbGVyIHx8XG4gICAgICByZXF1aXJlZFBhcmFtZXRlcihcbiAgICAgICAgYFBhcnNlR3JhcGhRTENvbnRyb2xsZXIgcmVxdWlyZXMgYSBcImRhdGFiYXNlQ29udHJvbGxlclwiIHRvIGJlIGluc3RhbnRpYXRlZC5gXG4gICAgICApO1xuICAgIHRoaXMuY2FjaGVDb250cm9sbGVyID0gcGFyYW1zLmNhY2hlQ29udHJvbGxlcjtcbiAgICB0aGlzLmlzTW91bnRlZCA9ICEhcGFyYW1zLm1vdW50R3JhcGhRTDtcbiAgICB0aGlzLmNvbmZpZ0NhY2hlS2V5ID0gR3JhcGhRTENvbmZpZ0tleTtcbiAgfVxuXG4gIGFzeW5jIGdldEdyYXBoUUxDb25maWcoKTogUHJvbWlzZTxQYXJzZUdyYXBoUUxDb25maWc+IHtcbiAgICBpZiAodGhpcy5pc01vdW50ZWQpIHtcbiAgICAgIGNvbnN0IF9jYWNoZWRDb25maWcgPSBhd2FpdCB0aGlzLl9nZXRDYWNoZWRHcmFwaFFMQ29uZmlnKCk7XG4gICAgICBpZiAoX2NhY2hlZENvbmZpZykge1xuICAgICAgICByZXR1cm4gX2NhY2hlZENvbmZpZztcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5kYXRhYmFzZUNvbnRyb2xsZXIuZmluZChcbiAgICAgIEdyYXBoUUxDb25maWdDbGFzc05hbWUsXG4gICAgICB7IG9iamVjdElkOiBHcmFwaFFMQ29uZmlnSWQgfSxcbiAgICAgIHsgbGltaXQ6IDEgfVxuICAgICk7XG5cbiAgICBsZXQgZ3JhcGhRTENvbmZpZztcbiAgICBpZiAocmVzdWx0cy5sZW5ndGggIT0gMSkge1xuICAgICAgLy8gSWYgdGhlcmUgaXMgbm8gY29uZmlnIGluIHRoZSBkYXRhYmFzZSAtIHJldHVybiBlbXB0eSBjb25maWcuXG4gICAgICByZXR1cm4ge307XG4gICAgfSBlbHNlIHtcbiAgICAgIGdyYXBoUUxDb25maWcgPSByZXN1bHRzWzBdW0dyYXBoUUxDb25maWdLZXldO1xuICAgIH1cblxuICAgIGlmICh0aGlzLmlzTW91bnRlZCkge1xuICAgICAgdGhpcy5fcHV0Q2FjaGVkR3JhcGhRTENvbmZpZyhncmFwaFFMQ29uZmlnKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZ3JhcGhRTENvbmZpZztcbiAgfVxuXG4gIGFzeW5jIHVwZGF0ZUdyYXBoUUxDb25maWcoZ3JhcGhRTENvbmZpZzogUGFyc2VHcmFwaFFMQ29uZmlnKTogUHJvbWlzZTxQYXJzZUdyYXBoUUxDb25maWc+IHtcbiAgICAvLyB0aHJvd3MgaWYgaW52YWxpZFxuICAgIHRoaXMuX3ZhbGlkYXRlR3JhcGhRTENvbmZpZyhcbiAgICAgIGdyYXBoUUxDb25maWcgfHwgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBncmFwaFFMQ29uZmlnIScpXG4gICAgKTtcblxuICAgIC8vIFRyYW5zZm9ybSBpbiBkb3Qgbm90YXRpb24gdG8gbWFrZSBzdXJlIGl0IHdvcmtzXG4gICAgY29uc3QgdXBkYXRlID0gT2JqZWN0LmtleXMoZ3JhcGhRTENvbmZpZykucmVkdWNlKFxuICAgICAgKGFjYywga2V5KSA9PiB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgW0dyYXBoUUxDb25maWdLZXldOiB7XG4gICAgICAgICAgICAuLi5hY2NbR3JhcGhRTENvbmZpZ0tleV0sXG4gICAgICAgICAgICBba2V5XTogZ3JhcGhRTENvbmZpZ1trZXldLFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9LFxuICAgICAgeyBbR3JhcGhRTENvbmZpZ0tleV06IHt9IH1cbiAgICApO1xuXG4gICAgYXdhaXQgdGhpcy5kYXRhYmFzZUNvbnRyb2xsZXIudXBkYXRlKFxuICAgICAgR3JhcGhRTENvbmZpZ0NsYXNzTmFtZSxcbiAgICAgIHsgb2JqZWN0SWQ6IEdyYXBoUUxDb25maWdJZCB9LFxuICAgICAgdXBkYXRlLFxuICAgICAgeyB1cHNlcnQ6IHRydWUgfVxuICAgICk7XG5cbiAgICBpZiAodGhpcy5pc01vdW50ZWQpIHtcbiAgICAgIHRoaXMuX3B1dENhY2hlZEdyYXBoUUxDb25maWcoZ3JhcGhRTENvbmZpZyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgcmVzcG9uc2U6IHsgcmVzdWx0OiB0cnVlIH0gfTtcbiAgfVxuXG4gIF9nZXRDYWNoZWRHcmFwaFFMQ29uZmlnKCkge1xuICAgIHJldHVybiB0aGlzLmNhY2hlQ29udHJvbGxlci5ncmFwaFFMLmdldCh0aGlzLmNvbmZpZ0NhY2hlS2V5KTtcbiAgfVxuXG4gIF9wdXRDYWNoZWRHcmFwaFFMQ29uZmlnKGdyYXBoUUxDb25maWc6IFBhcnNlR3JhcGhRTENvbmZpZykge1xuICAgIHJldHVybiB0aGlzLmNhY2hlQ29udHJvbGxlci5ncmFwaFFMLnB1dCh0aGlzLmNvbmZpZ0NhY2hlS2V5LCBncmFwaFFMQ29uZmlnLCA2MDAwMCk7XG4gIH1cblxuICBfdmFsaWRhdGVHcmFwaFFMQ29uZmlnKGdyYXBoUUxDb25maWc6ID9QYXJzZUdyYXBoUUxDb25maWcpOiB2b2lkIHtcbiAgICBjb25zdCBlcnJvck1lc3NhZ2VzOiBzdHJpbmcgPSBbXTtcbiAgICBpZiAoIWdyYXBoUUxDb25maWcpIHtcbiAgICAgIGVycm9yTWVzc2FnZXMucHVzaCgnY2Fubm90IGJlIHVuZGVmaW5lZCwgbnVsbCBvciBlbXB0eScpO1xuICAgIH0gZWxzZSBpZiAoIWlzVmFsaWRTaW1wbGVPYmplY3QoZ3JhcGhRTENvbmZpZykpIHtcbiAgICAgIGVycm9yTWVzc2FnZXMucHVzaCgnbXVzdCBiZSBhIHZhbGlkIG9iamVjdCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCB7XG4gICAgICAgIGVuYWJsZWRGb3JDbGFzc2VzID0gbnVsbCxcbiAgICAgICAgZGlzYWJsZWRGb3JDbGFzc2VzID0gbnVsbCxcbiAgICAgICAgY2xhc3NDb25maWdzID0gbnVsbCxcbiAgICAgICAgLi4uaW52YWxpZEtleXNcbiAgICAgIH0gPSBncmFwaFFMQ29uZmlnO1xuXG4gICAgICBpZiAoT2JqZWN0LmtleXMoaW52YWxpZEtleXMpLmxlbmd0aCkge1xuICAgICAgICBlcnJvck1lc3NhZ2VzLnB1c2goYGVuY291bnRlcmVkIGludmFsaWQga2V5czogWyR7T2JqZWN0LmtleXMoaW52YWxpZEtleXMpfV1gKTtcbiAgICAgIH1cbiAgICAgIGlmIChlbmFibGVkRm9yQ2xhc3NlcyAhPT0gbnVsbCAmJiAhaXNWYWxpZFN0cmluZ0FycmF5KGVuYWJsZWRGb3JDbGFzc2VzKSkge1xuICAgICAgICBlcnJvck1lc3NhZ2VzLnB1c2goYFwiZW5hYmxlZEZvckNsYXNzZXNcIiBpcyBub3QgYSB2YWxpZCBhcnJheWApO1xuICAgICAgfVxuICAgICAgaWYgKGRpc2FibGVkRm9yQ2xhc3NlcyAhPT0gbnVsbCAmJiAhaXNWYWxpZFN0cmluZ0FycmF5KGRpc2FibGVkRm9yQ2xhc3NlcykpIHtcbiAgICAgICAgZXJyb3JNZXNzYWdlcy5wdXNoKGBcImRpc2FibGVkRm9yQ2xhc3Nlc1wiIGlzIG5vdCBhIHZhbGlkIGFycmF5YCk7XG4gICAgICB9XG4gICAgICBpZiAoY2xhc3NDb25maWdzICE9PSBudWxsKSB7XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGNsYXNzQ29uZmlncykpIHtcbiAgICAgICAgICBjbGFzc0NvbmZpZ3MuZm9yRWFjaChjbGFzc0NvbmZpZyA9PiB7XG4gICAgICAgICAgICBjb25zdCBlcnJvck1lc3NhZ2UgPSB0aGlzLl92YWxpZGF0ZUNsYXNzQ29uZmlnKGNsYXNzQ29uZmlnKTtcbiAgICAgICAgICAgIGlmIChlcnJvck1lc3NhZ2UpIHtcbiAgICAgICAgICAgICAgZXJyb3JNZXNzYWdlcy5wdXNoKFxuICAgICAgICAgICAgICAgIGBjbGFzc0NvbmZpZzoke2NsYXNzQ29uZmlnLmNsYXNzTmFtZX0gaXMgaW52YWxpZCBiZWNhdXNlICR7ZXJyb3JNZXNzYWdlfWBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBlcnJvck1lc3NhZ2VzLnB1c2goYFwiY2xhc3NDb25maWdzXCIgaXMgbm90IGEgdmFsaWQgYXJyYXlgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAoZXJyb3JNZXNzYWdlcy5sZW5ndGgpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBncmFwaFFMQ29uZmlnOiAke2Vycm9yTWVzc2FnZXMuam9pbignOyAnKX1gKTtcbiAgICB9XG4gIH1cblxuICBfdmFsaWRhdGVDbGFzc0NvbmZpZyhjbGFzc0NvbmZpZzogP1BhcnNlR3JhcGhRTENsYXNzQ29uZmlnKTogc3RyaW5nIHwgdm9pZCB7XG4gICAgaWYgKCFpc1ZhbGlkU2ltcGxlT2JqZWN0KGNsYXNzQ29uZmlnKSkge1xuICAgICAgcmV0dXJuICdpdCBtdXN0IGJlIGEgdmFsaWQgb2JqZWN0JztcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgeyBjbGFzc05hbWUsIHR5cGUgPSBudWxsLCBxdWVyeSA9IG51bGwsIG11dGF0aW9uID0gbnVsbCwgLi4uaW52YWxpZEtleXMgfSA9IGNsYXNzQ29uZmlnO1xuICAgICAgaWYgKE9iamVjdC5rZXlzKGludmFsaWRLZXlzKS5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIGBcImludmFsaWRLZXlzXCIgWyR7T2JqZWN0LmtleXMoaW52YWxpZEtleXMpfV0gc2hvdWxkIG5vdCBiZSBwcmVzZW50YDtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2YgY2xhc3NOYW1lICE9PSAnc3RyaW5nJyB8fCAhY2xhc3NOYW1lLnRyaW0oKS5sZW5ndGgpIHtcbiAgICAgICAgLy8gVE9ETyBjb25zaWRlciBjaGVja2luZyBjbGFzcyBleGlzdHMgaW4gc2NoZW1hP1xuICAgICAgICByZXR1cm4gYFwiY2xhc3NOYW1lXCIgbXVzdCBiZSBhIHZhbGlkIHN0cmluZ2A7XG4gICAgICB9XG4gICAgICBpZiAodHlwZSAhPT0gbnVsbCkge1xuICAgICAgICBpZiAoIWlzVmFsaWRTaW1wbGVPYmplY3QodHlwZSkpIHtcbiAgICAgICAgICByZXR1cm4gYFwidHlwZVwiIG11c3QgYmUgYSB2YWxpZCBvYmplY3RgO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHtcbiAgICAgICAgICBpbnB1dEZpZWxkcyA9IG51bGwsXG4gICAgICAgICAgb3V0cHV0RmllbGRzID0gbnVsbCxcbiAgICAgICAgICBjb25zdHJhaW50RmllbGRzID0gbnVsbCxcbiAgICAgICAgICBzb3J0RmllbGRzID0gbnVsbCxcbiAgICAgICAgICAuLi5pbnZhbGlkS2V5c1xuICAgICAgICB9ID0gdHlwZTtcbiAgICAgICAgaWYgKE9iamVjdC5rZXlzKGludmFsaWRLZXlzKS5sZW5ndGgpIHtcbiAgICAgICAgICByZXR1cm4gYFwidHlwZVwiIGNvbnRhaW5zIGludmFsaWQga2V5cywgWyR7T2JqZWN0LmtleXMoaW52YWxpZEtleXMpfV1gO1xuICAgICAgICB9IGVsc2UgaWYgKG91dHB1dEZpZWxkcyAhPT0gbnVsbCAmJiAhaXNWYWxpZFN0cmluZ0FycmF5KG91dHB1dEZpZWxkcykpIHtcbiAgICAgICAgICByZXR1cm4gYFwib3V0cHV0RmllbGRzXCIgbXVzdCBiZSBhIHZhbGlkIHN0cmluZyBhcnJheWA7XG4gICAgICAgIH0gZWxzZSBpZiAoY29uc3RyYWludEZpZWxkcyAhPT0gbnVsbCAmJiAhaXNWYWxpZFN0cmluZ0FycmF5KGNvbnN0cmFpbnRGaWVsZHMpKSB7XG4gICAgICAgICAgcmV0dXJuIGBcImNvbnN0cmFpbnRGaWVsZHNcIiBtdXN0IGJlIGEgdmFsaWQgc3RyaW5nIGFycmF5YDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoc29ydEZpZWxkcyAhPT0gbnVsbCkge1xuICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHNvcnRGaWVsZHMpKSB7XG4gICAgICAgICAgICBsZXQgZXJyb3JNZXNzYWdlO1xuICAgICAgICAgICAgc29ydEZpZWxkcy5ldmVyeSgoc29ydEZpZWxkLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgICBpZiAoIWlzVmFsaWRTaW1wbGVPYmplY3Qoc29ydEZpZWxkKSkge1xuICAgICAgICAgICAgICAgIGVycm9yTWVzc2FnZSA9IGBcInNvcnRGaWVsZFwiIGF0IGluZGV4ICR7aW5kZXh9IGlzIG5vdCBhIHZhbGlkIG9iamVjdGA7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnN0IHsgZmllbGQsIGFzYywgZGVzYywgLi4uaW52YWxpZEtleXMgfSA9IHNvcnRGaWVsZDtcbiAgICAgICAgICAgICAgICBpZiAoT2JqZWN0LmtleXMoaW52YWxpZEtleXMpLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgZXJyb3JNZXNzYWdlID0gYFwic29ydEZpZWxkXCIgYXQgaW5kZXggJHtpbmRleH0gY29udGFpbnMgaW52YWxpZCBrZXlzLCBbJHtPYmplY3Qua2V5cyhcbiAgICAgICAgICAgICAgICAgICAgaW52YWxpZEtleXNcbiAgICAgICAgICAgICAgICAgICl9XWA7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgZmllbGQgIT09ICdzdHJpbmcnIHx8IGZpZWxkLnRyaW0oKS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgZXJyb3JNZXNzYWdlID0gYFwic29ydEZpZWxkXCIgYXQgaW5kZXggJHtpbmRleH0gZGlkIG5vdCBwcm92aWRlIHRoZSBcImZpZWxkXCIgYXMgYSBzdHJpbmdgO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBhc2MgIT09ICdib29sZWFuJyB8fCB0eXBlb2YgZGVzYyAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICAgICAgICAgIGVycm9yTWVzc2FnZSA9IGBcInNvcnRGaWVsZFwiIGF0IGluZGV4ICR7aW5kZXh9IGRpZCBub3QgcHJvdmlkZSBcImFzY1wiIG9yIFwiZGVzY1wiIGFzIGJvb2xlYW5zYDtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgaWYgKGVycm9yTWVzc2FnZSkge1xuICAgICAgICAgICAgICByZXR1cm4gZXJyb3JNZXNzYWdlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gYFwic29ydEZpZWxkc1wiIG11c3QgYmUgYSB2YWxpZCBhcnJheS5gO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoaW5wdXRGaWVsZHMgIT09IG51bGwpIHtcbiAgICAgICAgICBpZiAoaXNWYWxpZFNpbXBsZU9iamVjdChpbnB1dEZpZWxkcykpIHtcbiAgICAgICAgICAgIGNvbnN0IHsgY3JlYXRlID0gbnVsbCwgdXBkYXRlID0gbnVsbCwgLi4uaW52YWxpZEtleXMgfSA9IGlucHV0RmllbGRzO1xuICAgICAgICAgICAgaWYgKE9iamVjdC5rZXlzKGludmFsaWRLZXlzKS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGBcImlucHV0RmllbGRzXCIgY29udGFpbnMgaW52YWxpZCBrZXlzOiBbJHtPYmplY3Qua2V5cyhpbnZhbGlkS2V5cyl9XWA7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBpZiAodXBkYXRlICE9PSBudWxsICYmICFpc1ZhbGlkU3RyaW5nQXJyYXkodXBkYXRlKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBgXCJpbnB1dEZpZWxkcy51cGRhdGVcIiBtdXN0IGJlIGEgdmFsaWQgc3RyaW5nIGFycmF5YDtcbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChjcmVhdGUgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWlzVmFsaWRTdHJpbmdBcnJheShjcmVhdGUpKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gYFwiaW5wdXRGaWVsZHMuY3JlYXRlXCIgbXVzdCBiZSBhIHZhbGlkIHN0cmluZyBhcnJheWA7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgICAgICAgICAgICAgIGlmICghY3JlYXRlLmluY2x1ZGVzKCd1c2VybmFtZScpIHx8ICFjcmVhdGUuaW5jbHVkZXMoJ3Bhc3N3b3JkJykpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGBcImlucHV0RmllbGRzLmNyZWF0ZVwiIG11c3QgaW5jbHVkZSByZXF1aXJlZCBmaWVsZHMsIHVzZXJuYW1lIGFuZCBwYXNzd29yZGA7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJpbnB1dEZpZWxkc1wiIG11c3QgYmUgYSB2YWxpZCBvYmplY3RgO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHF1ZXJ5ICE9PSBudWxsKSB7XG4gICAgICAgIGlmIChpc1ZhbGlkU2ltcGxlT2JqZWN0KHF1ZXJ5KSkge1xuICAgICAgICAgIGNvbnN0IHtcbiAgICAgICAgICAgIGZpbmQgPSBudWxsLFxuICAgICAgICAgICAgZ2V0ID0gbnVsbCxcbiAgICAgICAgICAgIGZpbmRBbGlhcyA9IG51bGwsXG4gICAgICAgICAgICBnZXRBbGlhcyA9IG51bGwsXG4gICAgICAgICAgICAuLi5pbnZhbGlkS2V5c1xuICAgICAgICAgIH0gPSBxdWVyeTtcbiAgICAgICAgICBpZiAoT2JqZWN0LmtleXMoaW52YWxpZEtleXMpLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuIGBcInF1ZXJ5XCIgY29udGFpbnMgaW52YWxpZCBrZXlzLCBbJHtPYmplY3Qua2V5cyhpbnZhbGlkS2V5cyl9XWA7XG4gICAgICAgICAgfSBlbHNlIGlmIChmaW5kICE9PSBudWxsICYmIHR5cGVvZiBmaW5kICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJxdWVyeS5maW5kXCIgbXVzdCBiZSBhIGJvb2xlYW5gO1xuICAgICAgICAgIH0gZWxzZSBpZiAoZ2V0ICE9PSBudWxsICYmIHR5cGVvZiBnZXQgIT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgcmV0dXJuIGBcInF1ZXJ5LmdldFwiIG11c3QgYmUgYSBib29sZWFuYDtcbiAgICAgICAgICB9IGVsc2UgaWYgKGZpbmRBbGlhcyAhPT0gbnVsbCAmJiB0eXBlb2YgZmluZEFsaWFzICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgcmV0dXJuIGBcInF1ZXJ5LmZpbmRBbGlhc1wiIG11c3QgYmUgYSBzdHJpbmdgO1xuICAgICAgICAgIH0gZWxzZSBpZiAoZ2V0QWxpYXMgIT09IG51bGwgJiYgdHlwZW9mIGdldEFsaWFzICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgcmV0dXJuIGBcInF1ZXJ5LmdldEFsaWFzXCIgbXVzdCBiZSBhIHN0cmluZ2A7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBgXCJxdWVyeVwiIG11c3QgYmUgYSB2YWxpZCBvYmplY3RgO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAobXV0YXRpb24gIT09IG51bGwpIHtcbiAgICAgICAgaWYgKGlzVmFsaWRTaW1wbGVPYmplY3QobXV0YXRpb24pKSB7XG4gICAgICAgICAgY29uc3Qge1xuICAgICAgICAgICAgY3JlYXRlID0gbnVsbCxcbiAgICAgICAgICAgIHVwZGF0ZSA9IG51bGwsXG4gICAgICAgICAgICBkZXN0cm95ID0gbnVsbCxcbiAgICAgICAgICAgIGNyZWF0ZUFsaWFzID0gbnVsbCxcbiAgICAgICAgICAgIHVwZGF0ZUFsaWFzID0gbnVsbCxcbiAgICAgICAgICAgIGRlc3Ryb3lBbGlhcyA9IG51bGwsXG4gICAgICAgICAgICAuLi5pbnZhbGlkS2V5c1xuICAgICAgICAgIH0gPSBtdXRhdGlvbjtcbiAgICAgICAgICBpZiAoT2JqZWN0LmtleXMoaW52YWxpZEtleXMpLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuIGBcIm11dGF0aW9uXCIgY29udGFpbnMgaW52YWxpZCBrZXlzLCBbJHtPYmplY3Qua2V5cyhpbnZhbGlkS2V5cyl9XWA7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChjcmVhdGUgIT09IG51bGwgJiYgdHlwZW9mIGNyZWF0ZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwibXV0YXRpb24uY3JlYXRlXCIgbXVzdCBiZSBhIGJvb2xlYW5gO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAodXBkYXRlICE9PSBudWxsICYmIHR5cGVvZiB1cGRhdGUgIT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgcmV0dXJuIGBcIm11dGF0aW9uLnVwZGF0ZVwiIG11c3QgYmUgYSBib29sZWFuYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGRlc3Ryb3kgIT09IG51bGwgJiYgdHlwZW9mIGRlc3Ryb3kgIT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgcmV0dXJuIGBcIm11dGF0aW9uLmRlc3Ryb3lcIiBtdXN0IGJlIGEgYm9vbGVhbmA7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChjcmVhdGVBbGlhcyAhPT0gbnVsbCAmJiB0eXBlb2YgY3JlYXRlQWxpYXMgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwibXV0YXRpb24uY3JlYXRlQWxpYXNcIiBtdXN0IGJlIGEgc3RyaW5nYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHVwZGF0ZUFsaWFzICE9PSBudWxsICYmIHR5cGVvZiB1cGRhdGVBbGlhcyAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJtdXRhdGlvbi51cGRhdGVBbGlhc1wiIG11c3QgYmUgYSBzdHJpbmdgO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZGVzdHJveUFsaWFzICE9PSBudWxsICYmIHR5cGVvZiBkZXN0cm95QWxpYXMgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwibXV0YXRpb24uZGVzdHJveUFsaWFzXCIgbXVzdCBiZSBhIHN0cmluZ2A7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBgXCJtdXRhdGlvblwiIG11c3QgYmUgYSB2YWxpZCBvYmplY3RgO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmNvbnN0IGlzVmFsaWRTdHJpbmdBcnJheSA9IGZ1bmN0aW9uIChhcnJheSk6IGJvb2xlYW4ge1xuICByZXR1cm4gQXJyYXkuaXNBcnJheShhcnJheSlcbiAgICA/ICFhcnJheS5zb21lKHMgPT4gdHlwZW9mIHMgIT09ICdzdHJpbmcnIHx8IHMudHJpbSgpLmxlbmd0aCA8IDEpXG4gICAgOiBmYWxzZTtcbn07XG4vKipcbiAqIEVuc3VyZXMgdGhlIG9iaiBpcyBhIHNpbXBsZSBKU09OL3t9XG4gKiBvYmplY3QsIGkuZS4gbm90IGFuIGFycmF5LCBudWxsLCBkYXRlXG4gKiBldGMuXG4gKi9cbmNvbnN0IGlzVmFsaWRTaW1wbGVPYmplY3QgPSBmdW5jdGlvbiAob2JqKTogYm9vbGVhbiB7XG4gIHJldHVybiAoXG4gICAgdHlwZW9mIG9iaiA9PT0gJ29iamVjdCcgJiZcbiAgICAhQXJyYXkuaXNBcnJheShvYmopICYmXG4gICAgb2JqICE9PSBudWxsICYmXG4gICAgb2JqIGluc3RhbmNlb2YgRGF0ZSAhPT0gdHJ1ZSAmJlxuICAgIG9iaiBpbnN0YW5jZW9mIFByb21pc2UgIT09IHRydWVcbiAgKTtcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgUGFyc2VHcmFwaFFMQ29uZmlnIHtcbiAgZW5hYmxlZEZvckNsYXNzZXM/OiBzdHJpbmdbXTtcbiAgZGlzYWJsZWRGb3JDbGFzc2VzPzogc3RyaW5nW107XG4gIGNsYXNzQ29uZmlncz86IFBhcnNlR3JhcGhRTENsYXNzQ29uZmlnW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUGFyc2VHcmFwaFFMQ2xhc3NDb25maWcge1xuICBjbGFzc05hbWU6IHN0cmluZztcbiAgLyogVGhlIGB0eXBlYCBvYmplY3QgY29udGFpbnMgb3B0aW9ucyBmb3IgaG93IHRoZSBjbGFzcyB0eXBlcyBhcmUgZ2VuZXJhdGVkICovXG4gIHR5cGU6ID97XG4gICAgLyogRmllbGRzIHRoYXQgYXJlIGFsbG93ZWQgd2hlbiBjcmVhdGluZyBvciB1cGRhdGluZyBhbiBvYmplY3QuICovXG4gICAgaW5wdXRGaWVsZHM6ID97XG4gICAgICAvKiBMZWF2ZSBibGFuayB0byBhbGxvdyBhbGwgYXZhaWxhYmxlIGZpZWxkcyBpbiB0aGUgc2NoZW1hLiAqL1xuICAgICAgY3JlYXRlPzogc3RyaW5nW10sXG4gICAgICB1cGRhdGU/OiBzdHJpbmdbXSxcbiAgICB9LFxuICAgIC8qIEZpZWxkcyBvbiB0aGUgZWRnZXMgdGhhdCBjYW4gYmUgcmVzb2x2ZWQgZnJvbSBhIHF1ZXJ5LCBpLmUuIHRoZSBSZXN1bHQgVHlwZS4gKi9cbiAgICBvdXRwdXRGaWVsZHM6ID8oc3RyaW5nW10pLFxuICAgIC8qIEZpZWxkcyBieSB3aGljaCBhIHF1ZXJ5IGNhbiBiZSBmaWx0ZXJlZCwgaS5lLiB0aGUgYHdoZXJlYCBvYmplY3QuICovXG4gICAgY29uc3RyYWludEZpZWxkczogPyhzdHJpbmdbXSksXG4gICAgLyogRmllbGRzIGJ5IHdoaWNoIGEgcXVlcnkgY2FuIGJlIHNvcnRlZDsgKi9cbiAgICBzb3J0RmllbGRzOiA/KHtcbiAgICAgIGZpZWxkOiBzdHJpbmcsXG4gICAgICBhc2M6IGJvb2xlYW4sXG4gICAgICBkZXNjOiBib29sZWFuLFxuICAgIH1bXSksXG4gIH07XG4gIC8qIFRoZSBgcXVlcnlgIG9iamVjdCBjb250YWlucyBvcHRpb25zIGZvciB3aGljaCBjbGFzcyBxdWVyaWVzIGFyZSBnZW5lcmF0ZWQgKi9cbiAgcXVlcnk6ID97XG4gICAgZ2V0OiA/Ym9vbGVhbixcbiAgICBmaW5kOiA/Ym9vbGVhbixcbiAgICBmaW5kQWxpYXM6ID9TdHJpbmcsXG4gICAgZ2V0QWxpYXM6ID9TdHJpbmcsXG4gIH07XG4gIC8qIFRoZSBgbXV0YXRpb25gIG9iamVjdCBjb250YWlucyBvcHRpb25zIGZvciB3aGljaCBjbGFzcyBtdXRhdGlvbnMgYXJlIGdlbmVyYXRlZCAqL1xuICBtdXRhdGlvbjogP3tcbiAgICBjcmVhdGU6ID9ib29sZWFuLFxuICAgIHVwZGF0ZTogP2Jvb2xlYW4sXG4gICAgLy8gZGVsZXRlIGlzIGEgcmVzZXJ2ZWQga2V5IHdvcmQgaW4ganNcbiAgICBkZXN0cm95OiA/Ym9vbGVhbixcbiAgICBjcmVhdGVBbGlhczogP1N0cmluZyxcbiAgICB1cGRhdGVBbGlhczogP1N0cmluZyxcbiAgICBkZXN0cm95QWxpYXM6ID9TdHJpbmcsXG4gIH07XG59XG5cbmV4cG9ydCBkZWZhdWx0IFBhcnNlR3JhcGhRTENvbnRyb2xsZXI7XG5leHBvcnQgeyBHcmFwaFFMQ29uZmlnQ2xhc3NOYW1lLCBHcmFwaFFMQ29uZmlnSWQsIEdyYXBoUUxDb25maWdLZXkgfTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUE7QUFDQTtBQUNBO0FBQWdEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFFaEQsTUFBTUEsc0JBQXNCLEdBQUcsZ0JBQWdCO0FBQUM7QUFDaEQsTUFBTUMsZUFBZSxHQUFHLEdBQUc7QUFBQztBQUM1QixNQUFNQyxnQkFBZ0IsR0FBRyxRQUFRO0FBQUM7QUFFbEMsTUFBTUMsc0JBQXNCLENBQUM7RUFNM0JDLFdBQVcsQ0FDVEMsTUFHQyxHQUFHLENBQUMsQ0FBQyxFQUNOO0lBQ0EsSUFBSSxDQUFDQyxrQkFBa0IsR0FDckJELE1BQU0sQ0FBQ0Msa0JBQWtCLElBQ3pCLElBQUFDLDBCQUFpQixFQUNkLDRF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