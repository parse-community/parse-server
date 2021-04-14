"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.GraphQLConfigKey = exports.GraphQLConfigId = exports.GraphQLConfigClassName = exports.default = void 0;

var _requiredParameter = _interopRequireDefault(require("../../lib/requiredParameter"));

var _DatabaseController = _interopRequireDefault(require("./DatabaseController"));

var _CacheController = _interopRequireDefault(require("./CacheController"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _objectWithoutProperties(source, excluded) { if (source == null) return {}; var target = _objectWithoutPropertiesLoose(source, excluded); var key, i; if (Object.getOwnPropertySymbols) { var sourceSymbolKeys = Object.getOwnPropertySymbols(source); for (i = 0; i < sourceSymbolKeys.length; i++) { key = sourceSymbolKeys[i]; if (excluded.indexOf(key) >= 0) continue; if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue; target[key] = source[key]; } } return target; }

function _objectWithoutPropertiesLoose(source, excluded) { if (source == null) return {}; var target = {}; var sourceKeys = Object.keys(source); var key, i; for (i = 0; i < sourceKeys.length; i++) { key = sourceKeys[i]; if (excluded.indexOf(key) >= 0) continue; target[key] = source[key]; } return target; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

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
    this._validateGraphQLConfig(graphQLConfig || (0, _requiredParameter.default)('You must provide a graphQLConfig!')); // Transform in dot notation to make sure it works


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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9QYXJzZUdyYXBoUUxDb250cm9sbGVyLmpzIl0sIm5hbWVzIjpbIkdyYXBoUUxDb25maWdDbGFzc05hbWUiLCJHcmFwaFFMQ29uZmlnSWQiLCJHcmFwaFFMQ29uZmlnS2V5IiwiUGFyc2VHcmFwaFFMQ29udHJvbGxlciIsImNvbnN0cnVjdG9yIiwicGFyYW1zIiwiZGF0YWJhc2VDb250cm9sbGVyIiwiY2FjaGVDb250cm9sbGVyIiwiaXNNb3VudGVkIiwibW91bnRHcmFwaFFMIiwiY29uZmlnQ2FjaGVLZXkiLCJnZXRHcmFwaFFMQ29uZmlnIiwiX2NhY2hlZENvbmZpZyIsIl9nZXRDYWNoZWRHcmFwaFFMQ29uZmlnIiwicmVzdWx0cyIsImZpbmQiLCJvYmplY3RJZCIsImxpbWl0IiwiZ3JhcGhRTENvbmZpZyIsImxlbmd0aCIsIl9wdXRDYWNoZWRHcmFwaFFMQ29uZmlnIiwidXBkYXRlR3JhcGhRTENvbmZpZyIsIl92YWxpZGF0ZUdyYXBoUUxDb25maWciLCJ1cGRhdGUiLCJPYmplY3QiLCJrZXlzIiwicmVkdWNlIiwiYWNjIiwia2V5IiwidXBzZXJ0IiwicmVzcG9uc2UiLCJyZXN1bHQiLCJncmFwaFFMIiwiZ2V0IiwicHV0IiwiZXJyb3JNZXNzYWdlcyIsInB1c2giLCJpc1ZhbGlkU2ltcGxlT2JqZWN0IiwiZW5hYmxlZEZvckNsYXNzZXMiLCJkaXNhYmxlZEZvckNsYXNzZXMiLCJjbGFzc0NvbmZpZ3MiLCJpbnZhbGlkS2V5cyIsImlzVmFsaWRTdHJpbmdBcnJheSIsIkFycmF5IiwiaXNBcnJheSIsImZvckVhY2giLCJjbGFzc0NvbmZpZyIsImVycm9yTWVzc2FnZSIsIl92YWxpZGF0ZUNsYXNzQ29uZmlnIiwiY2xhc3NOYW1lIiwiRXJyb3IiLCJqb2luIiwidHlwZSIsInF1ZXJ5IiwibXV0YXRpb24iLCJ0cmltIiwiaW5wdXRGaWVsZHMiLCJvdXRwdXRGaWVsZHMiLCJjb25zdHJhaW50RmllbGRzIiwic29ydEZpZWxkcyIsImV2ZXJ5Iiwic29ydEZpZWxkIiwiaW5kZXgiLCJmaWVsZCIsImFzYyIsImRlc2MiLCJjcmVhdGUiLCJpbmNsdWRlcyIsImZpbmRBbGlhcyIsImdldEFsaWFzIiwiZGVzdHJveSIsImNyZWF0ZUFsaWFzIiwidXBkYXRlQWxpYXMiLCJkZXN0cm95QWxpYXMiLCJhcnJheSIsInNvbWUiLCJzIiwib2JqIiwiRGF0ZSIsIlByb21pc2UiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7Ozs7Ozs7QUFFQSxNQUFNQSxzQkFBc0IsR0FBRyxnQkFBL0I7O0FBQ0EsTUFBTUMsZUFBZSxHQUFHLEdBQXhCOztBQUNBLE1BQU1DLGdCQUFnQixHQUFHLFFBQXpCOzs7QUFFQSxNQUFNQyxzQkFBTixDQUE2QjtBQU0zQkMsRUFBQUEsV0FBVyxDQUNUQyxNQUdDLEdBQUcsRUFKSyxFQUtUO0FBQ0EsU0FBS0Msa0JBQUwsR0FDRUQsTUFBTSxDQUFDQyxrQkFBUCxJQUNBLGdDQUNHLDRFQURILENBRkY7QUFLQSxTQUFLQyxlQUFMLEdBQXVCRixNQUFNLENBQUNFLGVBQTlCO0FBQ0EsU0FBS0MsU0FBTCxHQUFpQixDQUFDLENBQUNILE1BQU0sQ0FBQ0ksWUFBMUI7QUFDQSxTQUFLQyxjQUFMLEdBQXNCUixnQkFBdEI7QUFDRDs7QUFFcUIsUUFBaEJTLGdCQUFnQixHQUFnQztBQUNwRCxRQUFJLEtBQUtILFNBQVQsRUFBb0I7QUFDbEIsWUFBTUksYUFBYSxHQUFHLE1BQU0sS0FBS0MsdUJBQUwsRUFBNUI7O0FBQ0EsVUFBSUQsYUFBSixFQUFtQjtBQUNqQixlQUFPQSxhQUFQO0FBQ0Q7QUFDRjs7QUFFRCxVQUFNRSxPQUFPLEdBQUcsTUFBTSxLQUFLUixrQkFBTCxDQUF3QlMsSUFBeEIsQ0FDcEJmLHNCQURvQixFQUVwQjtBQUFFZ0IsTUFBQUEsUUFBUSxFQUFFZjtBQUFaLEtBRm9CLEVBR3BCO0FBQUVnQixNQUFBQSxLQUFLLEVBQUU7QUFBVCxLQUhvQixDQUF0QjtBQU1BLFFBQUlD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QVAsS0FBYSxRQUFiLElBQXlCQSxDQUFDLENBQUNyQixJQUFGLEdBQVNwQyxNQUFULEdBQWtCLENBQTNELENBREUsR0FFSCxLQUZKO0FBR0QsQ0FKRDtBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQUNBLE1BQU1rQixtQkFBbUIsR0FBRyxVQUFVd0MsR0FBVixFQUF3QjtBQUNsRCxTQUNFLE9BQU9BLEdBQVAsS0FBZSxRQUFmLElBQ0EsQ0FBQ2xDLEtBQUssQ0FBQ0MsT0FBTixDQUFjaUMsR0FBZCxDQURELElBRUFBLEdBQUcsS0FBSyxJQUZSLElBR0FBLEdBQUcsWUFBWUMsSUFBZixLQUF3QixJQUh4QixJQUlBRCxHQUFHLFlBQVlFLE9BQWYsS0FBMkIsSUFMN0I7QUFPRCxDQVJEOztlQXdEZTVFLHNCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHJlcXVpcmVkUGFyYW1ldGVyIGZyb20gJy4uLy4uL2xpYi9yZXF1aXJlZFBhcmFtZXRlcic7XG5pbXBvcnQgRGF0YWJhc2VDb250cm9sbGVyIGZyb20gJy4vRGF0YWJhc2VDb250cm9sbGVyJztcbmltcG9ydCBDYWNoZUNvbnRyb2xsZXIgZnJvbSAnLi9DYWNoZUNvbnRyb2xsZXInO1xuXG5jb25zdCBHcmFwaFFMQ29uZmlnQ2xhc3NOYW1lID0gJ19HcmFwaFFMQ29uZmlnJztcbmNvbnN0IEdyYXBoUUxDb25maWdJZCA9ICcxJztcbmNvbnN0IEdyYXBoUUxDb25maWdLZXkgPSAnY29uZmlnJztcblxuY2xhc3MgUGFyc2VHcmFwaFFMQ29udHJvbGxlciB7XG4gIGRhdGFiYXNlQ29udHJvbGxlcjogRGF0YWJhc2VDb250cm9sbGVyO1xuICBjYWNoZUNvbnRyb2xsZXI6IENhY2hlQ29udHJvbGxlcjtcbiAgaXNNb3VudGVkOiBib29sZWFuO1xuICBjb25maWdDYWNoZUtleTogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHBhcmFtczoge1xuICAgICAgZGF0YWJhc2VDb250cm9sbGVyOiBEYXRhYmFzZUNvbnRyb2xsZXIsXG4gICAgICBjYWNoZUNvbnRyb2xsZXI6IENhY2hlQ29udHJvbGxlcixcbiAgICB9ID0ge31cbiAgKSB7XG4gICAgdGhpcy5kYXRhYmFzZUNvbnRyb2xsZXIgPVxuICAgICAgcGFyYW1zLmRhdGFiYXNlQ29udHJvbGxlciB8fFxuICAgICAgcmVxdWlyZWRQYXJhbWV0ZXIoXG4gICAgICAgIGBQYXJzZUdyYXBoUUxDb250cm9sbGVyIHJlcXVpcmVzIGEgXCJkYXRhYmFzZUNvbnRyb2xsZXJcIiB0byBiZSBpbnN0YW50aWF0ZWQuYFxuICAgICAgKTtcbiAgICB0aGlzLmNhY2hlQ29udHJvbGxlciA9IHBhcmFtcy5jYWNoZUNvbnRyb2xsZXI7XG4gICAgdGhpcy5pc01vdW50ZWQgPSAhIXBhcmFtcy5tb3VudEdyYXBoUUw7XG4gICAgdGhpcy5jb25maWdDYWNoZUtleSA9IEdyYXBoUUxDb25maWdLZXk7XG4gIH1cblxuICBhc3luYyBnZXRHcmFwaFFMQ29uZmlnKCk6IFByb21pc2U8UGFyc2VHcmFwaFFMQ29uZmlnPiB7XG4gICAgaWYgKHRoaXMuaXNNb3VudGVkKSB7XG4gICAgICBjb25zdCBfY2FjaGVkQ29uZmlnID0gYXdhaXQgdGhpcy5fZ2V0Q2FjaGVkR3JhcGhRTENvbmZpZygpO1xuICAgICAgaWYgKF9jYWNoZWRDb25maWcpIHtcbiAgICAgICAgcmV0dXJuIF9jYWNoZWRDb25maWc7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZGF0YWJhc2VDb250cm9sbGVyLmZpbmQoXG4gICAgICBHcmFwaFFMQ29uZmlnQ2xhc3NOYW1lLFxuICAgICAgeyBvYmplY3RJZDogR3JhcGhRTENvbmZpZ0lkIH0sXG4gICAgICB7IGxpbWl0OiAxIH1cbiAgICApO1xuXG4gICAgbGV0IGdyYXBoUUxDb25maWc7XG4gICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9IDEpIHtcbiAgICAgIC8vIElmIHRoZXJlIGlzIG5vIGNvbmZpZyBpbiB0aGUgZGF0YWJhc2UgLSByZXR1cm4gZW1wdHkgY29uZmlnLlxuICAgICAgcmV0dXJuIHt9O1xuICAgIH0gZWxzZSB7XG4gICAgICBncmFwaFFMQ29uZmlnID0gcmVzdWx0c1swXVtHcmFwaFFMQ29uZmlnS2V5XTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5pc01vdW50ZWQpIHtcbiAgICAgIHRoaXMuX3B1dENhY2hlZEdyYXBoUUxDb25maWcoZ3JhcGhRTENvbmZpZyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGdyYXBoUUxDb25maWc7XG4gIH1cblxuICBhc3luYyB1cGRhdGVHcmFwaFFMQ29uZmlnKGdyYXBoUUxDb25maWc6IFBhcnNlR3JhcGhRTENvbmZpZyk6IFByb21pc2U8UGFyc2VHcmFwaFFMQ29uZmlnPiB7XG4gICAgLy8gdGhyb3dzIGlmIGludmFsaWRcbiAgICB0aGlzLl92YWxpZGF0ZUdyYXBoUUxDb25maWcoXG4gICAgICBncmFwaFFMQ29uZmlnIHx8IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgZ3JhcGhRTENvbmZpZyEnKVxuICAgICk7XG5cbiAgICAvLyBUcmFuc2Zvcm0gaW4gZG90IG5vdGF0aW9uIHRvIG1ha2Ugc3VyZSBpdCB3b3Jrc1xuICAgIGNvbnN0IHVwZGF0ZSA9IE9iamVjdC5rZXlzKGdyYXBoUUxDb25maWcpLnJlZHVjZShcbiAgICAgIChhY2MsIGtleSkgPT4ge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIFtHcmFwaFFMQ29uZmlnS2V5XToge1xuICAgICAgICAgICAgLi4uYWNjW0dyYXBoUUxDb25maWdLZXldLFxuICAgICAgICAgICAgW2tleV06IGdyYXBoUUxDb25maWdba2V5XSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSxcbiAgICAgIHsgW0dyYXBoUUxDb25maWdLZXldOiB7fSB9XG4gICAgKTtcblxuICAgIGF3YWl0IHRoaXMuZGF0YWJhc2VDb250cm9sbGVyLnVwZGF0ZShcbiAgICAgIEdyYXBoUUxDb25maWdDbGFzc05hbWUsXG4gICAgICB7IG9iamVjdElkOiBHcmFwaFFMQ29uZmlnSWQgfSxcbiAgICAgIHVwZGF0ZSxcbiAgICAgIHsgdXBzZXJ0OiB0cnVlIH1cbiAgICApO1xuXG4gICAgaWYgKHRoaXMuaXNNb3VudGVkKSB7XG4gICAgICB0aGlzLl9wdXRDYWNoZWRHcmFwaFFMQ29uZmlnKGdyYXBoUUxDb25maWcpO1xuICAgIH1cblxuICAgIHJldHVybiB7IHJlc3BvbnNlOiB7IHJlc3VsdDogdHJ1ZSB9IH07XG4gIH1cblxuICBfZ2V0Q2FjaGVkR3JhcGhRTENvbmZpZygpIHtcbiAgICByZXR1cm4gdGhpcy5jYWNoZUNvbnRyb2xsZXIuZ3JhcGhRTC5nZXQodGhpcy5jb25maWdDYWNoZUtleSk7XG4gIH1cblxuICBfcHV0Q2FjaGVkR3JhcGhRTENvbmZpZyhncmFwaFFMQ29uZmlnOiBQYXJzZUdyYXBoUUxDb25maWcpIHtcbiAgICByZXR1cm4gdGhpcy5jYWNoZUNvbnRyb2xsZXIuZ3JhcGhRTC5wdXQodGhpcy5jb25maWdDYWNoZUtleSwgZ3JhcGhRTENvbmZpZywgNjAwMDApO1xuICB9XG5cbiAgX3ZhbGlkYXRlR3JhcGhRTENvbmZpZyhncmFwaFFMQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ29uZmlnKTogdm9pZCB7XG4gICAgY29uc3QgZXJyb3JNZXNzYWdlczogc3RyaW5nID0gW107XG4gICAgaWYgKCFncmFwaFFMQ29uZmlnKSB7XG4gICAgICBlcnJvck1lc3NhZ2VzLnB1c2goJ2Nhbm5vdCBiZSB1bmRlZmluZWQsIG51bGwgb3IgZW1wdHknKTtcbiAgICB9IGVsc2UgaWYgKCFpc1ZhbGlkU2ltcGxlT2JqZWN0KGdyYXBoUUxDb25maWcpKSB7XG4gICAgICBlcnJvck1lc3NhZ2VzLnB1c2goJ211c3QgYmUgYSB2YWxpZCBvYmplY3QnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3Qge1xuICAgICAgICBlbmFibGVkRm9yQ2xhc3NlcyA9IG51bGwsXG4gICAgICAgIGRpc2FibGVkRm9yQ2xhc3NlcyA9IG51bGwsXG4gICAgICAgIGNsYXNzQ29uZmlncyA9IG51bGwsXG4gICAgICAgIC4uLmludmFsaWRLZXlzXG4gICAgICB9ID0gZ3JhcGhRTENvbmZpZztcblxuICAgICAgaWYgKE9iamVjdC5rZXlzKGludmFsaWRLZXlzKS5sZW5ndGgpIHtcbiAgICAgICAgZXJyb3JNZXNzYWdlcy5wdXNoKGBlbmNvdW50ZXJlZCBpbnZhbGlkIGtleXM6IFske09iamVjdC5rZXlzKGludmFsaWRLZXlzKX1dYCk7XG4gICAgICB9XG4gICAgICBpZiAoZW5hYmxlZEZvckNsYXNzZXMgIT09IG51bGwgJiYgIWlzVmFsaWRTdHJpbmdBcnJheShlbmFibGVkRm9yQ2xhc3NlcykpIHtcbiAgICAgICAgZXJyb3JNZXNzYWdlcy5wdXNoKGBcImVuYWJsZWRGb3JDbGFzc2VzXCIgaXMgbm90IGEgdmFsaWQgYXJyYXlgKTtcbiAgICAgIH1cbiAgICAgIGlmIChkaXNhYmxlZEZvckNsYXNzZXMgIT09IG51bGwgJiYgIWlzVmFsaWRTdHJpbmdBcnJheShkaXNhYmxlZEZvckNsYXNzZXMpKSB7XG4gICAgICAgIGVycm9yTWVzc2FnZXMucHVzaChgXCJkaXNhYmxlZEZvckNsYXNzZXNcIiBpcyBub3QgYSB2YWxpZCBhcnJheWApO1xuICAgICAgfVxuICAgICAgaWYgKGNsYXNzQ29uZmlncyAhPT0gbnVsbCkge1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShjbGFzc0NvbmZpZ3MpKSB7XG4gICAgICAgICAgY2xhc3NDb25maWdzLmZvckVhY2goY2xhc3NDb25maWcgPT4ge1xuICAgICAgICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID0gdGhpcy5fdmFsaWRhdGVDbGFzc0NvbmZpZyhjbGFzc0NvbmZpZyk7XG4gICAgICAgICAgICBpZiAoZXJyb3JNZXNzYWdlKSB7XG4gICAgICAgICAgICAgIGVycm9yTWVzc2FnZXMucHVzaChcbiAgICAgICAgICAgICAgICBgY2xhc3NDb25maWc6JHtjbGFzc0NvbmZpZy5jbGFzc05hbWV9IGlzIGludmFsaWQgYmVjYXVzZSAke2Vycm9yTWVzc2FnZX1gXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZXJyb3JNZXNzYWdlcy5wdXNoKGBcImNsYXNzQ29uZmlnc1wiIGlzIG5vdCBhIHZhbGlkIGFycmF5YCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGVycm9yTWVzc2FnZXMubGVuZ3RoKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgZ3JhcGhRTENvbmZpZzogJHtlcnJvck1lc3NhZ2VzLmpvaW4oJzsgJyl9YCk7XG4gICAgfVxuICB9XG5cbiAgX3ZhbGlkYXRlQ2xhc3NDb25maWcoY2xhc3NDb25maWc6ID9QYXJzZUdyYXBoUUxDbGFzc0NvbmZpZyk6IHN0cmluZyB8IHZvaWQge1xuICAgIGlmICghaXNWYWxpZFNpbXBsZU9iamVjdChjbGFzc0NvbmZpZykpIHtcbiAgICAgIHJldHVybiAnaXQgbXVzdCBiZSBhIHZhbGlkIG9iamVjdCc7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHsgY2xhc3NOYW1lLCB0eXBlID0gbnVsbCwgcXVlcnkgPSBudWxsLCBtdXRhdGlvbiA9IG51bGwsIC4uLmludmFsaWRLZXlzIH0gPSBjbGFzc0NvbmZpZztcbiAgICAgIGlmIChPYmplY3Qua2V5cyhpbnZhbGlkS2V5cykubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiBgXCJpbnZhbGlkS2V5c1wiIFske09iamVjdC5rZXlzKGludmFsaWRLZXlzKX1dIHNob3VsZCBub3QgYmUgcHJlc2VudGA7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIGNsYXNzTmFtZSAhPT0gJ3N0cmluZycgfHwgIWNsYXNzTmFtZS50cmltKCkubGVuZ3RoKSB7XG4gICAgICAgIC8vIFRPRE8gY29uc2lkZXIgY2hlY2tpbmcgY2xhc3MgZXhpc3RzIGluIHNjaGVtYT9cbiAgICAgICAgcmV0dXJuIGBcImNsYXNzTmFtZVwiIG11c3QgYmUgYSB2YWxpZCBzdHJpbmdgO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGUgIT09IG51bGwpIHtcbiAgICAgICAgaWYgKCFpc1ZhbGlkU2ltcGxlT2JqZWN0KHR5cGUpKSB7XG4gICAgICAgICAgcmV0dXJuIGBcInR5cGVcIiBtdXN0IGJlIGEgdmFsaWQgb2JqZWN0YDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB7XG4gICAgICAgICAgaW5wdXRGaWVsZHMgPSBudWxsLFxuICAgICAgICAgIG91dHB1dEZpZWxkcyA9IG51bGwsXG4gICAgICAgICAgY29uc3RyYWludEZpZWxkcyA9IG51bGwsXG4gICAgICAgICAgc29ydEZpZWxkcyA9IG51bGwsXG4gICAgICAgICAgLi4uaW52YWxpZEtleXNcbiAgICAgICAgfSA9IHR5cGU7XG4gICAgICAgIGlmIChPYmplY3Qua2V5cyhpbnZhbGlkS2V5cykubGVuZ3RoKSB7XG4gICAgICAgICAgcmV0dXJuIGBcInR5cGVcIiBjb250YWlucyBpbnZhbGlkIGtleXMsIFske09iamVjdC5rZXlzKGludmFsaWRLZXlzKX1dYDtcbiAgICAgICAgfSBlbHNlIGlmIChvdXRwdXRGaWVsZHMgIT09IG51bGwgJiYgIWlzVmFsaWRTdHJpbmdBcnJheShvdXRwdXRGaWVsZHMpKSB7XG4gICAgICAgICAgcmV0dXJuIGBcIm91dHB1dEZpZWxkc1wiIG11c3QgYmUgYSB2YWxpZCBzdHJpbmcgYXJyYXlgO1xuICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRGaWVsZHMgIT09IG51bGwgJiYgIWlzVmFsaWRTdHJpbmdBcnJheShjb25zdHJhaW50RmllbGRzKSkge1xuICAgICAgICAgIHJldHVybiBgXCJjb25zdHJhaW50RmllbGRzXCIgbXVzdCBiZSBhIHZhbGlkIHN0cmluZyBhcnJheWA7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNvcnRGaWVsZHMgIT09IG51bGwpIHtcbiAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShzb3J0RmllbGRzKSkge1xuICAgICAgICAgICAgbGV0IGVycm9yTWVzc2FnZTtcbiAgICAgICAgICAgIHNvcnRGaWVsZHMuZXZlcnkoKHNvcnRGaWVsZCwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgICAgaWYgKCFpc1ZhbGlkU2ltcGxlT2JqZWN0KHNvcnRGaWVsZCkpIHtcbiAgICAgICAgICAgICAgICBlcnJvck1lc3NhZ2UgPSBgXCJzb3J0RmllbGRcIiBhdCBpbmRleCAke2luZGV4fSBpcyBub3QgYSB2YWxpZCBvYmplY3RgO1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCB7IGZpZWxkLCBhc2MsIGRlc2MsIC4uLmludmFsaWRLZXlzIH0gPSBzb3J0RmllbGQ7XG4gICAgICAgICAgICAgICAgaWYgKE9iamVjdC5rZXlzKGludmFsaWRLZXlzKS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgIGVycm9yTWVzc2FnZSA9IGBcInNvcnRGaWVsZFwiIGF0IGluZGV4ICR7aW5kZXh9IGNvbnRhaW5zIGludmFsaWQga2V5cywgWyR7T2JqZWN0LmtleXMoXG4gICAgICAgICAgICAgICAgICAgIGludmFsaWRLZXlzXG4gICAgICAgICAgICAgICAgICApfV1gO1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGZpZWxkICE9PSAnc3RyaW5nJyB8fCBmaWVsZC50cmltKCkubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGVycm9yTWVzc2FnZSA9IGBcInNvcnRGaWVsZFwiIGF0IGluZGV4ICR7aW5kZXh9IGRpZCBub3QgcHJvdmlkZSB0aGUgXCJmaWVsZFwiIGFzIGEgc3RyaW5nYDtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgYXNjICE9PSAnYm9vbGVhbicgfHwgdHlwZW9mIGRlc2MgIT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgICAgICAgICBlcnJvck1lc3NhZ2UgPSBgXCJzb3J0RmllbGRcIiBhdCBpbmRleCAke2luZGV4fSBkaWQgbm90IHByb3ZpZGUgXCJhc2NcIiBvciBcImRlc2NcIiBhcyBib29sZWFuc2A7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGlmIChlcnJvck1lc3NhZ2UpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGVycm9yTWVzc2FnZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGBcInNvcnRGaWVsZHNcIiBtdXN0IGJlIGEgdmFsaWQgYXJyYXkuYDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGlucHV0RmllbGRzICE9PSBudWxsKSB7XG4gICAgICAgICAgaWYgKGlzVmFsaWRTaW1wbGVPYmplY3QoaW5wdXRGaWVsZHMpKSB7XG4gICAgICAgICAgICBjb25zdCB7IGNyZWF0ZSA9IG51bGwsIHVwZGF0ZSA9IG51bGwsIC4uLmludmFsaWRLZXlzIH0gPSBpbnB1dEZpZWxkcztcbiAgICAgICAgICAgIGlmIChPYmplY3Qua2V5cyhpbnZhbGlkS2V5cykubGVuZ3RoKSB7XG4gICAgICAgICAgICAgIHJldHVybiBgXCJpbnB1dEZpZWxkc1wiIGNvbnRhaW5zIGludmFsaWQga2V5czogWyR7T2JqZWN0LmtleXMoaW52YWxpZEtleXMpfV1gO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgaWYgKHVwZGF0ZSAhPT0gbnVsbCAmJiAhaXNWYWxpZFN0cmluZ0FycmF5KHVwZGF0ZSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYFwiaW5wdXRGaWVsZHMudXBkYXRlXCIgbXVzdCBiZSBhIHZhbGlkIHN0cmluZyBhcnJheWA7XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAoY3JlYXRlICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFpc1ZhbGlkU3RyaW5nQXJyYXkoY3JlYXRlKSkge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIGBcImlucHV0RmllbGRzLmNyZWF0ZVwiIG11c3QgYmUgYSB2YWxpZCBzdHJpbmcgYXJyYXlgO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICAgICAgICAgICAgICBpZiAoIWNyZWF0ZS5pbmNsdWRlcygndXNlcm5hbWUnKSB8fCAhY3JlYXRlLmluY2x1ZGVzKCdwYXNzd29yZCcpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBgXCJpbnB1dEZpZWxkcy5jcmVhdGVcIiBtdXN0IGluY2x1ZGUgcmVxdWlyZWQgZmllbGRzLCB1c2VybmFtZSBhbmQgcGFzc3dvcmRgO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gYFwiaW5wdXRGaWVsZHNcIiBtdXN0IGJlIGEgdmFsaWQgb2JqZWN0YDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChxdWVyeSAhPT0gbnVsbCkge1xuICAgICAgICBpZiAoaXNWYWxpZFNpbXBsZU9iamVjdChxdWVyeSkpIHtcbiAgICAgICAgICBjb25zdCB7XG4gICAgICAgICAgICBmaW5kID0gbnVsbCxcbiAgICAgICAgICAgIGdldCA9IG51bGwsXG4gICAgICAgICAgICBmaW5kQWxpYXMgPSBudWxsLFxuICAgICAgICAgICAgZ2V0QWxpYXMgPSBudWxsLFxuICAgICAgICAgICAgLi4uaW52YWxpZEtleXNcbiAgICAgICAgICB9ID0gcXVlcnk7XG4gICAgICAgICAgaWYgKE9iamVjdC5rZXlzKGludmFsaWRLZXlzKS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJxdWVyeVwiIGNvbnRhaW5zIGludmFsaWQga2V5cywgWyR7T2JqZWN0LmtleXMoaW52YWxpZEtleXMpfV1gO1xuICAgICAgICAgIH0gZWxzZSBpZiAoZmluZCAhPT0gbnVsbCAmJiB0eXBlb2YgZmluZCAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwicXVlcnkuZmluZFwiIG11c3QgYmUgYSBib29sZWFuYDtcbiAgICAgICAgICB9IGVsc2UgaWYgKGdldCAhPT0gbnVsbCAmJiB0eXBlb2YgZ2V0ICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJxdWVyeS5nZXRcIiBtdXN0IGJlIGEgYm9vbGVhbmA7XG4gICAgICAgICAgfSBlbHNlIGlmIChmaW5kQWxpYXMgIT09IG51bGwgJiYgdHlwZW9mIGZpbmRBbGlhcyAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJxdWVyeS5maW5kQWxpYXNcIiBtdXN0IGJlIGEgc3RyaW5nYDtcbiAgICAgICAgICB9IGVsc2UgaWYgKGdldEFsaWFzICE9PSBudWxsICYmIHR5cGVvZiBnZXRBbGlhcyAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJxdWVyeS5nZXRBbGlhc1wiIG11c3QgYmUgYSBzdHJpbmdgO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gYFwicXVlcnlcIiBtdXN0IGJlIGEgdmFsaWQgb2JqZWN0YDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKG11dGF0aW9uICE9PSBudWxsKSB7XG4gICAgICAgIGlmIChpc1ZhbGlkU2ltcGxlT2JqZWN0KG11dGF0aW9uKSkge1xuICAgICAgICAgIGNvbnN0IHtcbiAgICAgICAgICAgIGNyZWF0ZSA9IG51bGwsXG4gICAgICAgICAgICB1cGRhdGUgPSBudWxsLFxuICAgICAgICAgICAgZGVzdHJveSA9IG51bGwsXG4gICAgICAgICAgICBjcmVhdGVBbGlhcyA9IG51bGwsXG4gICAgICAgICAgICB1cGRhdGVBbGlhcyA9IG51bGwsXG4gICAgICAgICAgICBkZXN0cm95QWxpYXMgPSBudWxsLFxuICAgICAgICAgICAgLi4uaW52YWxpZEtleXNcbiAgICAgICAgICB9ID0gbXV0YXRpb247XG4gICAgICAgICAgaWYgKE9iamVjdC5rZXlzKGludmFsaWRLZXlzKS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJtdXRhdGlvblwiIGNvbnRhaW5zIGludmFsaWQga2V5cywgWyR7T2JqZWN0LmtleXMoaW52YWxpZEtleXMpfV1gO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoY3JlYXRlICE9PSBudWxsICYmIHR5cGVvZiBjcmVhdGUgIT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgcmV0dXJuIGBcIm11dGF0aW9uLmNyZWF0ZVwiIG11c3QgYmUgYSBib29sZWFuYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHVwZGF0ZSAhPT0gbnVsbCAmJiB0eXBlb2YgdXBkYXRlICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJtdXRhdGlvbi51cGRhdGVcIiBtdXN0IGJlIGEgYm9vbGVhbmA7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChkZXN0cm95ICE9PSBudWxsICYmIHR5cGVvZiBkZXN0cm95ICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJtdXRhdGlvbi5kZXN0cm95XCIgbXVzdCBiZSBhIGJvb2xlYW5gO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoY3JlYXRlQWxpYXMgIT09IG51bGwgJiYgdHlwZW9mIGNyZWF0ZUFsaWFzICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgcmV0dXJuIGBcIm11dGF0aW9uLmNyZWF0ZUFsaWFzXCIgbXVzdCBiZSBhIHN0cmluZ2A7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh1cGRhdGVBbGlhcyAhPT0gbnVsbCAmJiB0eXBlb2YgdXBkYXRlQWxpYXMgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwibXV0YXRpb24udXBkYXRlQWxpYXNcIiBtdXN0IGJlIGEgc3RyaW5nYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGRlc3Ryb3lBbGlhcyAhPT0gbnVsbCAmJiB0eXBlb2YgZGVzdHJveUFsaWFzICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgcmV0dXJuIGBcIm11dGF0aW9uLmRlc3Ryb3lBbGlhc1wiIG11c3QgYmUgYSBzdHJpbmdgO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gYFwibXV0YXRpb25cIiBtdXN0IGJlIGEgdmFsaWQgb2JqZWN0YDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5jb25zdCBpc1ZhbGlkU3RyaW5nQXJyYXkgPSBmdW5jdGlvbiAoYXJyYXkpOiBib29sZWFuIHtcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkoYXJyYXkpXG4gICAgPyAhYXJyYXkuc29tZShzID0+IHR5cGVvZiBzICE9PSAnc3RyaW5nJyB8fCBzLnRyaW0oKS5sZW5ndGggPCAxKVxuICAgIDogZmFsc2U7XG59O1xuLyoqXG4gKiBFbnN1cmVzIHRoZSBvYmogaXMgYSBzaW1wbGUgSlNPTi97fVxuICogb2JqZWN0LCBpLmUuIG5vdCBhbiBhcnJheSwgbnVsbCwgZGF0ZVxuICogZXRjLlxuICovXG5jb25zdCBpc1ZhbGlkU2ltcGxlT2JqZWN0ID0gZnVuY3Rpb24gKG9iaik6IGJvb2xlYW4ge1xuICByZXR1cm4gKFxuICAgIHR5cGVvZiBvYmogPT09ICdvYmplY3QnICYmXG4gICAgIUFycmF5LmlzQXJyYXkob2JqKSAmJlxuICAgIG9iaiAhPT0gbnVsbCAmJlxuICAgIG9iaiBpbnN0YW5jZW9mIERhdGUgIT09IHRydWUgJiZcbiAgICBvYmogaW5zdGFuY2VvZiBQcm9taXNlICE9PSB0cnVlXG4gICk7XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFBhcnNlR3JhcGhRTENvbmZpZyB7XG4gIGVuYWJsZWRGb3JDbGFzc2VzPzogc3RyaW5nW107XG4gIGRpc2FibGVkRm9yQ2xhc3Nlcz86IHN0cmluZ1tdO1xuICBjbGFzc0NvbmZpZ3M/OiBQYXJzZUdyYXBoUUxDbGFzc0NvbmZpZ1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFBhcnNlR3JhcGhRTENsYXNzQ29uZmlnIHtcbiAgY2xhc3NOYW1lOiBzdHJpbmc7XG4gIC8qIFRoZSBgdHlwZWAgb2JqZWN0IGNvbnRhaW5zIG9wdGlvbnMgZm9yIGhvdyB0aGUgY2xhc3MgdHlwZXMgYXJlIGdlbmVyYXRlZCAqL1xuICB0eXBlOiA/e1xuICAgIC8qIEZpZWxkcyB0aGF0IGFyZSBhbGxvd2VkIHdoZW4gY3JlYXRpbmcgb3IgdXBkYXRpbmcgYW4gb2JqZWN0LiAqL1xuICAgIGlucHV0RmllbGRzOiA/e1xuICAgICAgLyogTGVhdmUgYmxhbmsgdG8gYWxsb3cgYWxsIGF2YWlsYWJsZSBmaWVsZHMgaW4gdGhlIHNjaGVtYS4gKi9cbiAgICAgIGNyZWF0ZT86IHN0cmluZ1tdLFxuICAgICAgdXBkYXRlPzogc3RyaW5nW10sXG4gICAgfSxcbiAgICAvKiBGaWVsZHMgb24gdGhlIGVkZ2VzIHRoYXQgY2FuIGJlIHJlc29sdmVkIGZyb20gYSBxdWVyeSwgaS5lLiB0aGUgUmVzdWx0IFR5cGUuICovXG4gICAgb3V0cHV0RmllbGRzOiA/KHN0cmluZ1tdKSxcbiAgICAvKiBGaWVsZHMgYnkgd2hpY2ggYSBxdWVyeSBjYW4gYmUgZmlsdGVyZWQsIGkuZS4gdGhlIGB3aGVyZWAgb2JqZWN0LiAqL1xuICAgIGNvbnN0cmFpbnRGaWVsZHM6ID8oc3RyaW5nW10pLFxuICAgIC8qIEZpZWxkcyBieSB3aGljaCBhIHF1ZXJ5IGNhbiBiZSBzb3J0ZWQ7ICovXG4gICAgc29ydEZpZWxkczogPyh7XG4gICAgICBmaWVsZDogc3RyaW5nLFxuICAgICAgYXNjOiBib29sZWFuLFxuICAgICAgZGVzYzogYm9vbGVhbixcbiAgICB9W10pLFxuICB9O1xuICAvKiBUaGUgYHF1ZXJ5YCBvYmplY3QgY29udGFpbnMgb3B0aW9ucyBmb3Igd2hpY2ggY2xhc3MgcXVlcmllcyBhcmUgZ2VuZXJhdGVkICovXG4gIHF1ZXJ5OiA/e1xuICAgIGdldDogP2Jvb2xlYW4sXG4gICAgZmluZDogP2Jvb2xlYW4sXG4gICAgZmluZEFsaWFzOiA/U3RyaW5nLFxuICAgIGdldEFsaWFzOiA/U3RyaW5nLFxuICB9O1xuICAvKiBUaGUgYG11dGF0aW9uYCBvYmplY3QgY29udGFpbnMgb3B0aW9ucyBmb3Igd2hpY2ggY2xhc3MgbXV0YXRpb25zIGFyZSBnZW5lcmF0ZWQgKi9cbiAgbXV0YXRpb246ID97XG4gICAgY3JlYXRlOiA/Ym9vbGVhbixcbiAgICB1cGRhdGU6ID9ib29sZWFuLFxuICAgIC8vIGRlbGV0ZSBpcyBhIHJlc2VydmVkIGtleSB3b3JkIGluIGpzXG4gICAgZGVzdHJveTogP2Jvb2xlYW4sXG4gICAgY3JlYXRlQWxpYXM6ID9TdHJpbmcsXG4gICAgdXBkYXRlQWxpYXM6ID9TdHJpbmcsXG4gICAgZGVzdHJveUFsaWFzOiA/U3RyaW5nLFxuICB9O1xufVxuXG5leHBvcnQgZGVmYXVsdCBQYXJzZUdyYXBoUUxDb250cm9sbGVyO1xuZXhwb3J0IHsgR3JhcGhRTENvbmZpZ0NsYXNzTmFtZSwgR3JhcGhRTENvbmZpZ0lkLCBHcmFwaFFMQ29uZmlnS2V5IH07XG4iXX0=