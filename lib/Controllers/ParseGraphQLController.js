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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9QYXJzZUdyYXBoUUxDb250cm9sbGVyLmpzIl0sIm5hbWVzIjpbIkdyYXBoUUxDb25maWdDbGFzc05hbWUiLCJHcmFwaFFMQ29uZmlnSWQiLCJHcmFwaFFMQ29uZmlnS2V5IiwiUGFyc2VHcmFwaFFMQ29udHJvbGxlciIsImNvbnN0cnVjdG9yIiwicGFyYW1zIiwiZGF0YWJhc2VDb250cm9sbGVyIiwiY2FjaGVDb250cm9sbGVyIiwiaXNNb3VudGVkIiwibW91bnRHcmFwaFFMIiwiY29uZmlnQ2FjaGVLZXkiLCJnZXRHcmFwaFFMQ29uZmlnIiwiX2NhY2hlZENvbmZpZyIsIl9nZXRDYWNoZWRHcmFwaFFMQ29uZmlnIiwicmVzdWx0cyIsImZpbmQiLCJvYmplY3RJZCIsImxpbWl0IiwiZ3JhcGhRTENvbmZpZyIsImxlbmd0aCIsIl9wdXRDYWNoZWRHcmFwaFFMQ29uZmlnIiwidXBkYXRlR3JhcGhRTENvbmZpZyIsIl92YWxpZGF0ZUdyYXBoUUxDb25maWciLCJ1cGRhdGUiLCJPYmplY3QiLCJrZXlzIiwicmVkdWNlIiwiYWNjIiwia2V5IiwidXBzZXJ0IiwicmVzcG9uc2UiLCJyZXN1bHQiLCJncmFwaFFMIiwiZ2V0IiwicHV0IiwiZXJyb3JNZXNzYWdlcyIsInB1c2giLCJpc1ZhbGlkU2ltcGxlT2JqZWN0IiwiZW5hYmxlZEZvckNsYXNzZXMiLCJkaXNhYmxlZEZvckNsYXNzZXMiLCJjbGFzc0NvbmZpZ3MiLCJpbnZhbGlkS2V5cyIsImlzVmFsaWRTdHJpbmdBcnJheSIsIkFycmF5IiwiaXNBcnJheSIsImZvckVhY2giLCJjbGFzc0NvbmZpZyIsImVycm9yTWVzc2FnZSIsIl92YWxpZGF0ZUNsYXNzQ29uZmlnIiwiY2xhc3NOYW1lIiwiRXJyb3IiLCJqb2luIiwidHlwZSIsInF1ZXJ5IiwibXV0YXRpb24iLCJ0cmltIiwiaW5wdXRGaWVsZHMiLCJvdXRwdXRGaWVsZHMiLCJjb25zdHJhaW50RmllbGRzIiwic29ydEZpZWxkcyIsImV2ZXJ5Iiwic29ydEZpZWxkIiwiaW5kZXgiLCJmaWVsZCIsImFzYyIsImRlc2MiLCJjcmVhdGUiLCJpbmNsdWRlcyIsImZpbmRBbGlhcyIsImdldEFsaWFzIiwiZGVzdHJveSIsImNyZWF0ZUFsaWFzIiwidXBkYXRlQWxpYXMiLCJkZXN0cm95QWxpYXMiLCJhcnJheSIsInNvbWUiLCJzIiwib2JqIiwiRGF0ZSIsIlByb21pc2UiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7Ozs7Ozs7QUFFQSxNQUFNQSxzQkFBc0IsR0FBRyxnQkFBL0I7O0FBQ0EsTUFBTUMsZUFBZSxHQUFHLEdBQXhCOztBQUNBLE1BQU1DLGdCQUFnQixHQUFHLFFBQXpCOzs7QUFFQSxNQUFNQyxzQkFBTixDQUE2QjtBQU0zQkMsRUFBQUEsV0FBVyxDQUNUQyxNQUdDLEdBQUcsRUFKSyxFQUtUO0FBQ0EsU0FBS0Msa0JBQUwsR0FDRUQsTUFBTSxDQUFDQyxrQkFBUCxJQUNBLGdDQUNHLDRFQURILENBRkY7QUFLQSxTQUFLQyxlQUFMLEdBQXVCRixNQUFNLENBQUNFLGVBQTlCO0FBQ0EsU0FBS0MsU0FBTCxHQUFpQixDQUFDLENBQUNILE1BQU0sQ0FBQ0ksWUFBMUI7QUFDQSxTQUFLQyxjQUFMLEdBQXNCUixnQkFBdEI7QUFDRDs7QUFFRCxRQUFNUyxnQkFBTixHQUFzRDtBQUNwRCxRQUFJLEtBQUtILFNBQVQsRUFBb0I7QUFDbEIsWUFBTUksYUFBYSxHQUFHLE1BQU0sS0FBS0MsdUJBQUwsRUFBNUI7O0FBQ0EsVUFBSUQsYUFBSixFQUFtQjtBQUNqQixlQUFPQSxhQUFQO0FBQ0Q7QUFDRjs7QUFFRCxVQUFNRSxPQUFPLEdBQUcsTUFBTSxLQUFLUixrQkFBTCxDQUF3QlMsSUFBeEIsQ0FDcEJmLHNCQURvQixFQUVwQjtBQUFFZ0IsTUFBQUEsUUFBUSxFQUFFZjtBQUFaLEtBRm9CLEVBR3BCO0FBQUVnQixNQUFBQSxLQUFLLEVBQUU7QUFBVCxLQUhvQixDQUF0QjtBQU1BLFFBQUlDLGFB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QVQsR0FBa0IsQ0FBM0QsQ0FERSxHQUVILEtBRko7QUFHRCxDQUpEO0FBS0E7Ozs7Ozs7QUFLQSxNQUFNa0IsbUJBQW1CLEdBQUcsVUFBU3dDLEdBQVQsRUFBdUI7QUFDakQsU0FDRSxPQUFPQSxHQUFQLEtBQWUsUUFBZixJQUNBLENBQUNsQyxLQUFLLENBQUNDLE9BQU4sQ0FBY2lDLEdBQWQsQ0FERCxJQUVBQSxHQUFHLEtBQUssSUFGUixJQUdBQSxHQUFHLFlBQVlDLElBQWYsS0FBd0IsSUFIeEIsSUFJQUQsR0FBRyxZQUFZRSxPQUFmLEtBQTJCLElBTDdCO0FBT0QsQ0FSRDs7ZUF3RGU1RSxzQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCByZXF1aXJlZFBhcmFtZXRlciBmcm9tICcuLi8uLi9saWIvcmVxdWlyZWRQYXJhbWV0ZXInO1xuaW1wb3J0IERhdGFiYXNlQ29udHJvbGxlciBmcm9tICcuL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgQ2FjaGVDb250cm9sbGVyIGZyb20gJy4vQ2FjaGVDb250cm9sbGVyJztcblxuY29uc3QgR3JhcGhRTENvbmZpZ0NsYXNzTmFtZSA9ICdfR3JhcGhRTENvbmZpZyc7XG5jb25zdCBHcmFwaFFMQ29uZmlnSWQgPSAnMSc7XG5jb25zdCBHcmFwaFFMQ29uZmlnS2V5ID0gJ2NvbmZpZyc7XG5cbmNsYXNzIFBhcnNlR3JhcGhRTENvbnRyb2xsZXIge1xuICBkYXRhYmFzZUNvbnRyb2xsZXI6IERhdGFiYXNlQ29udHJvbGxlcjtcbiAgY2FjaGVDb250cm9sbGVyOiBDYWNoZUNvbnRyb2xsZXI7XG4gIGlzTW91bnRlZDogYm9vbGVhbjtcbiAgY29uZmlnQ2FjaGVLZXk6IHN0cmluZztcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwYXJhbXM6IHtcbiAgICAgIGRhdGFiYXNlQ29udHJvbGxlcjogRGF0YWJhc2VDb250cm9sbGVyLFxuICAgICAgY2FjaGVDb250cm9sbGVyOiBDYWNoZUNvbnRyb2xsZXIsXG4gICAgfSA9IHt9XG4gICkge1xuICAgIHRoaXMuZGF0YWJhc2VDb250cm9sbGVyID1cbiAgICAgIHBhcmFtcy5kYXRhYmFzZUNvbnRyb2xsZXIgfHxcbiAgICAgIHJlcXVpcmVkUGFyYW1ldGVyKFxuICAgICAgICBgUGFyc2VHcmFwaFFMQ29udHJvbGxlciByZXF1aXJlcyBhIFwiZGF0YWJhc2VDb250cm9sbGVyXCIgdG8gYmUgaW5zdGFudGlhdGVkLmBcbiAgICAgICk7XG4gICAgdGhpcy5jYWNoZUNvbnRyb2xsZXIgPSBwYXJhbXMuY2FjaGVDb250cm9sbGVyO1xuICAgIHRoaXMuaXNNb3VudGVkID0gISFwYXJhbXMubW91bnRHcmFwaFFMO1xuICAgIHRoaXMuY29uZmlnQ2FjaGVLZXkgPSBHcmFwaFFMQ29uZmlnS2V5O1xuICB9XG5cbiAgYXN5bmMgZ2V0R3JhcGhRTENvbmZpZygpOiBQcm9taXNlPFBhcnNlR3JhcGhRTENvbmZpZz4ge1xuICAgIGlmICh0aGlzLmlzTW91bnRlZCkge1xuICAgICAgY29uc3QgX2NhY2hlZENvbmZpZyA9IGF3YWl0IHRoaXMuX2dldENhY2hlZEdyYXBoUUxDb25maWcoKTtcbiAgICAgIGlmIChfY2FjaGVkQ29uZmlnKSB7XG4gICAgICAgIHJldHVybiBfY2FjaGVkQ29uZmlnO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmRhdGFiYXNlQ29udHJvbGxlci5maW5kKFxuICAgICAgR3JhcGhRTENvbmZpZ0NsYXNzTmFtZSxcbiAgICAgIHsgb2JqZWN0SWQ6IEdyYXBoUUxDb25maWdJZCB9LFxuICAgICAgeyBsaW1pdDogMSB9XG4gICAgKTtcblxuICAgIGxldCBncmFwaFFMQ29uZmlnO1xuICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAvLyBJZiB0aGVyZSBpcyBubyBjb25maWcgaW4gdGhlIGRhdGFiYXNlIC0gcmV0dXJuIGVtcHR5IGNvbmZpZy5cbiAgICAgIHJldHVybiB7fTtcbiAgICB9IGVsc2Uge1xuICAgICAgZ3JhcGhRTENvbmZpZyA9IHJlc3VsdHNbMF1bR3JhcGhRTENvbmZpZ0tleV07XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuaXNNb3VudGVkKSB7XG4gICAgICB0aGlzLl9wdXRDYWNoZWRHcmFwaFFMQ29uZmlnKGdyYXBoUUxDb25maWcpO1xuICAgIH1cblxuICAgIHJldHVybiBncmFwaFFMQ29uZmlnO1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlR3JhcGhRTENvbmZpZyhcbiAgICBncmFwaFFMQ29uZmlnOiBQYXJzZUdyYXBoUUxDb25maWdcbiAgKTogUHJvbWlzZTxQYXJzZUdyYXBoUUxDb25maWc+IHtcbiAgICAvLyB0aHJvd3MgaWYgaW52YWxpZFxuICAgIHRoaXMuX3ZhbGlkYXRlR3JhcGhRTENvbmZpZyhcbiAgICAgIGdyYXBoUUxDb25maWcgfHwgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBncmFwaFFMQ29uZmlnIScpXG4gICAgKTtcblxuICAgIC8vIFRyYW5zZm9ybSBpbiBkb3Qgbm90YXRpb24gdG8gbWFrZSBzdXJlIGl0IHdvcmtzXG4gICAgY29uc3QgdXBkYXRlID0gT2JqZWN0LmtleXMoZ3JhcGhRTENvbmZpZykucmVkdWNlKFxuICAgICAgKGFjYywga2V5KSA9PiB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgW0dyYXBoUUxDb25maWdLZXldOiB7XG4gICAgICAgICAgICAuLi5hY2NbR3JhcGhRTENvbmZpZ0tleV0sXG4gICAgICAgICAgICBba2V5XTogZ3JhcGhRTENvbmZpZ1trZXldLFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9LFxuICAgICAgeyBbR3JhcGhRTENvbmZpZ0tleV06IHt9IH1cbiAgICApO1xuXG4gICAgYXdhaXQgdGhpcy5kYXRhYmFzZUNvbnRyb2xsZXIudXBkYXRlKFxuICAgICAgR3JhcGhRTENvbmZpZ0NsYXNzTmFtZSxcbiAgICAgIHsgb2JqZWN0SWQ6IEdyYXBoUUxDb25maWdJZCB9LFxuICAgICAgdXBkYXRlLFxuICAgICAgeyB1cHNlcnQ6IHRydWUgfVxuICAgICk7XG5cbiAgICBpZiAodGhpcy5pc01vdW50ZWQpIHtcbiAgICAgIHRoaXMuX3B1dENhY2hlZEdyYXBoUUxDb25maWcoZ3JhcGhRTENvbmZpZyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgcmVzcG9uc2U6IHsgcmVzdWx0OiB0cnVlIH0gfTtcbiAgfVxuXG4gIF9nZXRDYWNoZWRHcmFwaFFMQ29uZmlnKCkge1xuICAgIHJldHVybiB0aGlzLmNhY2hlQ29udHJvbGxlci5ncmFwaFFMLmdldCh0aGlzLmNvbmZpZ0NhY2hlS2V5KTtcbiAgfVxuXG4gIF9wdXRDYWNoZWRHcmFwaFFMQ29uZmlnKGdyYXBoUUxDb25maWc6IFBhcnNlR3JhcGhRTENvbmZpZykge1xuICAgIHJldHVybiB0aGlzLmNhY2hlQ29udHJvbGxlci5ncmFwaFFMLnB1dChcbiAgICAgIHRoaXMuY29uZmlnQ2FjaGVLZXksXG4gICAgICBncmFwaFFMQ29uZmlnLFxuICAgICAgNjAwMDBcbiAgICApO1xuICB9XG5cbiAgX3ZhbGlkYXRlR3JhcGhRTENvbmZpZyhncmFwaFFMQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ29uZmlnKTogdm9pZCB7XG4gICAgY29uc3QgZXJyb3JNZXNzYWdlczogc3RyaW5nID0gW107XG4gICAgaWYgKCFncmFwaFFMQ29uZmlnKSB7XG4gICAgICBlcnJvck1lc3NhZ2VzLnB1c2goJ2Nhbm5vdCBiZSB1bmRlZmluZWQsIG51bGwgb3IgZW1wdHknKTtcbiAgICB9IGVsc2UgaWYgKCFpc1ZhbGlkU2ltcGxlT2JqZWN0KGdyYXBoUUxDb25maWcpKSB7XG4gICAgICBlcnJvck1lc3NhZ2VzLnB1c2goJ211c3QgYmUgYSB2YWxpZCBvYmplY3QnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3Qge1xuICAgICAgICBlbmFibGVkRm9yQ2xhc3NlcyA9IG51bGwsXG4gICAgICAgIGRpc2FibGVkRm9yQ2xhc3NlcyA9IG51bGwsXG4gICAgICAgIGNsYXNzQ29uZmlncyA9IG51bGwsXG4gICAgICAgIC4uLmludmFsaWRLZXlzXG4gICAgICB9ID0gZ3JhcGhRTENvbmZpZztcblxuICAgICAgaWYgKE9iamVjdC5rZXlzKGludmFsaWRLZXlzKS5sZW5ndGgpIHtcbiAgICAgICAgZXJyb3JNZXNzYWdlcy5wdXNoKFxuICAgICAgICAgIGBlbmNvdW50ZXJlZCBpbnZhbGlkIGtleXM6IFske09iamVjdC5rZXlzKGludmFsaWRLZXlzKX1dYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKFxuICAgICAgICBlbmFibGVkRm9yQ2xhc3NlcyAhPT0gbnVsbCAmJlxuICAgICAgICAhaXNWYWxpZFN0cmluZ0FycmF5KGVuYWJsZWRGb3JDbGFzc2VzKVxuICAgICAgKSB7XG4gICAgICAgIGVycm9yTWVzc2FnZXMucHVzaChgXCJlbmFibGVkRm9yQ2xhc3Nlc1wiIGlzIG5vdCBhIHZhbGlkIGFycmF5YCk7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgIGRpc2FibGVkRm9yQ2xhc3NlcyAhPT0gbnVsbCAmJlxuICAgICAgICAhaXNWYWxpZFN0cmluZ0FycmF5KGRpc2FibGVkRm9yQ2xhc3NlcylcbiAgICAgICkge1xuICAgICAgICBlcnJvck1lc3NhZ2VzLnB1c2goYFwiZGlzYWJsZWRGb3JDbGFzc2VzXCIgaXMgbm90IGEgdmFsaWQgYXJyYXlgKTtcbiAgICAgIH1cbiAgICAgIGlmIChjbGFzc0NvbmZpZ3MgIT09IG51bGwpIHtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoY2xhc3NDb25maWdzKSkge1xuICAgICAgICAgIGNsYXNzQ29uZmlncy5mb3JFYWNoKGNsYXNzQ29uZmlnID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGVycm9yTWVzc2FnZSA9IHRoaXMuX3ZhbGlkYXRlQ2xhc3NDb25maWcoY2xhc3NDb25maWcpO1xuICAgICAgICAgICAgaWYgKGVycm9yTWVzc2FnZSkge1xuICAgICAgICAgICAgICBlcnJvck1lc3NhZ2VzLnB1c2goXG4gICAgICAgICAgICAgICAgYGNsYXNzQ29uZmlnOiR7Y2xhc3NDb25maWcuY2xhc3NOYW1lfSBpcyBpbnZhbGlkIGJlY2F1c2UgJHtlcnJvck1lc3NhZ2V9YFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGVycm9yTWVzc2FnZXMucHVzaChgXCJjbGFzc0NvbmZpZ3NcIiBpcyBub3QgYSB2YWxpZCBhcnJheWApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChlcnJvck1lc3NhZ2VzLmxlbmd0aCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIGdyYXBoUUxDb25maWc6ICR7ZXJyb3JNZXNzYWdlcy5qb2luKCc7ICcpfWApO1xuICAgIH1cbiAgfVxuXG4gIF92YWxpZGF0ZUNsYXNzQ29uZmlnKGNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWcpOiBzdHJpbmcgfCB2b2lkIHtcbiAgICBpZiAoIWlzVmFsaWRTaW1wbGVPYmplY3QoY2xhc3NDb25maWcpKSB7XG4gICAgICByZXR1cm4gJ2l0IG11c3QgYmUgYSB2YWxpZCBvYmplY3QnO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCB7XG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgdHlwZSA9IG51bGwsXG4gICAgICAgIHF1ZXJ5ID0gbnVsbCxcbiAgICAgICAgbXV0YXRpb24gPSBudWxsLFxuICAgICAgICAuLi5pbnZhbGlkS2V5c1xuICAgICAgfSA9IGNsYXNzQ29uZmlnO1xuICAgICAgaWYgKE9iamVjdC5rZXlzKGludmFsaWRLZXlzKS5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIGBcImludmFsaWRLZXlzXCIgWyR7T2JqZWN0LmtleXMoXG4gICAgICAgICAgaW52YWxpZEtleXNcbiAgICAgICAgKX1dIHNob3VsZCBub3QgYmUgcHJlc2VudGA7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIGNsYXNzTmFtZSAhPT0gJ3N0cmluZycgfHwgIWNsYXNzTmFtZS50cmltKCkubGVuZ3RoKSB7XG4gICAgICAgIC8vIFRPRE8gY29uc2lkZXIgY2hlY2tpbmcgY2xhc3MgZXhpc3RzIGluIHNjaGVtYT9cbiAgICAgICAgcmV0dXJuIGBcImNsYXNzTmFtZVwiIG11c3QgYmUgYSB2YWxpZCBzdHJpbmdgO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGUgIT09IG51bGwpIHtcbiAgICAgICAgaWYgKCFpc1ZhbGlkU2ltcGxlT2JqZWN0KHR5cGUpKSB7XG4gICAgICAgICAgcmV0dXJuIGBcInR5cGVcIiBtdXN0IGJlIGEgdmFsaWQgb2JqZWN0YDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB7XG4gICAgICAgICAgaW5wdXRGaWVsZHMgPSBudWxsLFxuICAgICAgICAgIG91dHB1dEZpZWxkcyA9IG51bGwsXG4gICAgICAgICAgY29uc3RyYWludEZpZWxkcyA9IG51bGwsXG4gICAgICAgICAgc29ydEZpZWxkcyA9IG51bGwsXG4gICAgICAgICAgLi4uaW52YWxpZEtleXNcbiAgICAgICAgfSA9IHR5cGU7XG4gICAgICAgIGlmIChPYmplY3Qua2V5cyhpbnZhbGlkS2V5cykubGVuZ3RoKSB7XG4gICAgICAgICAgcmV0dXJuIGBcInR5cGVcIiBjb250YWlucyBpbnZhbGlkIGtleXMsIFske09iamVjdC5rZXlzKGludmFsaWRLZXlzKX1dYDtcbiAgICAgICAgfSBlbHNlIGlmIChvdXRwdXRGaWVsZHMgIT09IG51bGwgJiYgIWlzVmFsaWRTdHJpbmdBcnJheShvdXRwdXRGaWVsZHMpKSB7XG4gICAgICAgICAgcmV0dXJuIGBcIm91dHB1dEZpZWxkc1wiIG11c3QgYmUgYSB2YWxpZCBzdHJpbmcgYXJyYXlgO1xuICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgIGNvbnN0cmFpbnRGaWVsZHMgIT09IG51bGwgJiZcbiAgICAgICAgICAhaXNWYWxpZFN0cmluZ0FycmF5KGNvbnN0cmFpbnRGaWVsZHMpXG4gICAgICAgICkge1xuICAgICAgICAgIHJldHVybiBgXCJjb25zdHJhaW50RmllbGRzXCIgbXVzdCBiZSBhIHZhbGlkIHN0cmluZyBhcnJheWA7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNvcnRGaWVsZHMgIT09IG51bGwpIHtcbiAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShzb3J0RmllbGRzKSkge1xuICAgICAgICAgICAgbGV0IGVycm9yTWVzc2FnZTtcbiAgICAgICAgICAgIHNvcnRGaWVsZHMuZXZlcnkoKHNvcnRGaWVsZCwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgICAgaWYgKCFpc1ZhbGlkU2ltcGxlT2JqZWN0KHNvcnRGaWVsZCkpIHtcbiAgICAgICAgICAgICAgICBlcnJvck1lc3NhZ2UgPSBgXCJzb3J0RmllbGRcIiBhdCBpbmRleCAke2luZGV4fSBpcyBub3QgYSB2YWxpZCBvYmplY3RgO1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCB7IGZpZWxkLCBhc2MsIGRlc2MsIC4uLmludmFsaWRLZXlzIH0gPSBzb3J0RmllbGQ7XG4gICAgICAgICAgICAgICAgaWYgKE9iamVjdC5rZXlzKGludmFsaWRLZXlzKS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgIGVycm9yTWVzc2FnZSA9IGBcInNvcnRGaWVsZFwiIGF0IGluZGV4ICR7aW5kZXh9IGNvbnRhaW5zIGludmFsaWQga2V5cywgWyR7T2JqZWN0LmtleXMoXG4gICAgICAgICAgICAgICAgICAgIGludmFsaWRLZXlzXG4gICAgICAgICAgICAgICAgICApfV1gO1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGZpZWxkICE9PSAnc3RyaW5nJyB8fCBmaWVsZC50cmltKCkubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGVycm9yTWVzc2FnZSA9IGBcInNvcnRGaWVsZFwiIGF0IGluZGV4ICR7aW5kZXh9IGRpZCBub3QgcHJvdmlkZSB0aGUgXCJmaWVsZFwiIGFzIGEgc3RyaW5nYDtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICAgICAgICAgICAgdHlwZW9mIGFzYyAhPT0gJ2Jvb2xlYW4nIHx8XG4gICAgICAgICAgICAgICAgICAgIHR5cGVvZiBkZXNjICE9PSAnYm9vbGVhbidcbiAgICAgICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgICAgICBlcnJvck1lc3NhZ2UgPSBgXCJzb3J0RmllbGRcIiBhdCBpbmRleCAke2luZGV4fSBkaWQgbm90IHByb3ZpZGUgXCJhc2NcIiBvciBcImRlc2NcIiBhcyBib29sZWFuc2A7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGlmIChlcnJvck1lc3NhZ2UpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGVycm9yTWVzc2FnZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGBcInNvcnRGaWVsZHNcIiBtdXN0IGJlIGEgdmFsaWQgYXJyYXkuYDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGlucHV0RmllbGRzICE9PSBudWxsKSB7XG4gICAgICAgICAgaWYgKGlzVmFsaWRTaW1wbGVPYmplY3QoaW5wdXRGaWVsZHMpKSB7XG4gICAgICAgICAgICBjb25zdCB7XG4gICAgICAgICAgICAgIGNyZWF0ZSA9IG51bGwsXG4gICAgICAgICAgICAgIHVwZGF0ZSA9IG51bGwsXG4gICAgICAgICAgICAgIC4uLmludmFsaWRLZXlzXG4gICAgICAgICAgICB9ID0gaW5wdXRGaWVsZHM7XG4gICAgICAgICAgICBpZiAoT2JqZWN0LmtleXMoaW52YWxpZEtleXMpLmxlbmd0aCkge1xuICAgICAgICAgICAgICByZXR1cm4gYFwiaW5wdXRGaWVsZHNcIiBjb250YWlucyBpbnZhbGlkIGtleXM6IFske09iamVjdC5rZXlzKFxuICAgICAgICAgICAgICAgIGludmFsaWRLZXlzXG4gICAgICAgICAgICAgICl9XWA7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBpZiAodXBkYXRlICE9PSBudWxsICYmICFpc1ZhbGlkU3RyaW5nQXJyYXkodXBkYXRlKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBgXCJpbnB1dEZpZWxkcy51cGRhdGVcIiBtdXN0IGJlIGEgdmFsaWQgc3RyaW5nIGFycmF5YDtcbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChjcmVhdGUgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWlzVmFsaWRTdHJpbmdBcnJheShjcmVhdGUpKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gYFwiaW5wdXRGaWVsZHMuY3JlYXRlXCIgbXVzdCBiZSBhIHZhbGlkIHN0cmluZyBhcnJheWA7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICAgICAgIWNyZWF0ZS5pbmNsdWRlcygndXNlcm5hbWUnKSB8fFxuICAgICAgICAgICAgICAgICAgICAhY3JlYXRlLmluY2x1ZGVzKCdwYXNzd29yZCcpXG4gICAgICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGBcImlucHV0RmllbGRzLmNyZWF0ZVwiIG11c3QgaW5jbHVkZSByZXF1aXJlZCBmaWVsZHMsIHVzZXJuYW1lIGFuZCBwYXNzd29yZGA7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJpbnB1dEZpZWxkc1wiIG11c3QgYmUgYSB2YWxpZCBvYmplY3RgO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHF1ZXJ5ICE9PSBudWxsKSB7XG4gICAgICAgIGlmIChpc1ZhbGlkU2ltcGxlT2JqZWN0KHF1ZXJ5KSkge1xuICAgICAgICAgIGNvbnN0IHtcbiAgICAgICAgICAgIGZpbmQgPSBudWxsLFxuICAgICAgICAgICAgZ2V0ID0gbnVsbCxcbiAgICAgICAgICAgIGZpbmRBbGlhcyA9IG51bGwsXG4gICAgICAgICAgICBnZXRBbGlhcyA9IG51bGwsXG4gICAgICAgICAgICAuLi5pbnZhbGlkS2V5c1xuICAgICAgICAgIH0gPSBxdWVyeTtcbiAgICAgICAgICBpZiAoT2JqZWN0LmtleXMoaW52YWxpZEtleXMpLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuIGBcInF1ZXJ5XCIgY29udGFpbnMgaW52YWxpZCBrZXlzLCBbJHtPYmplY3Qua2V5cyhcbiAgICAgICAgICAgICAgaW52YWxpZEtleXNcbiAgICAgICAgICAgICl9XWA7XG4gICAgICAgICAgfSBlbHNlIGlmIChmaW5kICE9PSBudWxsICYmIHR5cGVvZiBmaW5kICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJxdWVyeS5maW5kXCIgbXVzdCBiZSBhIGJvb2xlYW5gO1xuICAgICAgICAgIH0gZWxzZSBpZiAoZ2V0ICE9PSBudWxsICYmIHR5cGVvZiBnZXQgIT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgcmV0dXJuIGBcInF1ZXJ5LmdldFwiIG11c3QgYmUgYSBib29sZWFuYDtcbiAgICAgICAgICB9IGVsc2UgaWYgKGZpbmRBbGlhcyAhPT0gbnVsbCAmJiB0eXBlb2YgZmluZEFsaWFzICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgcmV0dXJuIGBcInF1ZXJ5LmZpbmRBbGlhc1wiIG11c3QgYmUgYSBzdHJpbmdgO1xuICAgICAgICAgIH0gZWxzZSBpZiAoZ2V0QWxpYXMgIT09IG51bGwgJiYgdHlwZW9mIGdldEFsaWFzICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgcmV0dXJuIGBcInF1ZXJ5LmdldEFsaWFzXCIgbXVzdCBiZSBhIHN0cmluZ2A7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBgXCJxdWVyeVwiIG11c3QgYmUgYSB2YWxpZCBvYmplY3RgO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAobXV0YXRpb24gIT09IG51bGwpIHtcbiAgICAgICAgaWYgKGlzVmFsaWRTaW1wbGVPYmplY3QobXV0YXRpb24pKSB7XG4gICAgICAgICAgY29uc3Qge1xuICAgICAgICAgICAgY3JlYXRlID0gbnVsbCxcbiAgICAgICAgICAgIHVwZGF0ZSA9IG51bGwsXG4gICAgICAgICAgICBkZXN0cm95ID0gbnVsbCxcbiAgICAgICAgICAgIGNyZWF0ZUFsaWFzID0gbnVsbCxcbiAgICAgICAgICAgIHVwZGF0ZUFsaWFzID0gbnVsbCxcbiAgICAgICAgICAgIGRlc3Ryb3lBbGlhcyA9IG51bGwsXG4gICAgICAgICAgICAuLi5pbnZhbGlkS2V5c1xuICAgICAgICAgIH0gPSBtdXRhdGlvbjtcbiAgICAgICAgICBpZiAoT2JqZWN0LmtleXMoaW52YWxpZEtleXMpLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuIGBcIm11dGF0aW9uXCIgY29udGFpbnMgaW52YWxpZCBrZXlzLCBbJHtPYmplY3Qua2V5cyhcbiAgICAgICAgICAgICAgaW52YWxpZEtleXNcbiAgICAgICAgICAgICl9XWA7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChjcmVhdGUgIT09IG51bGwgJiYgdHlwZW9mIGNyZWF0ZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwibXV0YXRpb24uY3JlYXRlXCIgbXVzdCBiZSBhIGJvb2xlYW5gO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAodXBkYXRlICE9PSBudWxsICYmIHR5cGVvZiB1cGRhdGUgIT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgcmV0dXJuIGBcIm11dGF0aW9uLnVwZGF0ZVwiIG11c3QgYmUgYSBib29sZWFuYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGRlc3Ryb3kgIT09IG51bGwgJiYgdHlwZW9mIGRlc3Ryb3kgIT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgcmV0dXJuIGBcIm11dGF0aW9uLmRlc3Ryb3lcIiBtdXN0IGJlIGEgYm9vbGVhbmA7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChjcmVhdGVBbGlhcyAhPT0gbnVsbCAmJiB0eXBlb2YgY3JlYXRlQWxpYXMgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwibXV0YXRpb24uY3JlYXRlQWxpYXNcIiBtdXN0IGJlIGEgc3RyaW5nYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHVwZGF0ZUFsaWFzICE9PSBudWxsICYmIHR5cGVvZiB1cGRhdGVBbGlhcyAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJtdXRhdGlvbi51cGRhdGVBbGlhc1wiIG11c3QgYmUgYSBzdHJpbmdgO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZGVzdHJveUFsaWFzICE9PSBudWxsICYmIHR5cGVvZiBkZXN0cm95QWxpYXMgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwibXV0YXRpb24uZGVzdHJveUFsaWFzXCIgbXVzdCBiZSBhIHN0cmluZ2A7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBgXCJtdXRhdGlvblwiIG11c3QgYmUgYSB2YWxpZCBvYmplY3RgO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmNvbnN0IGlzVmFsaWRTdHJpbmdBcnJheSA9IGZ1bmN0aW9uKGFycmF5KTogYm9vbGVhbiB7XG4gIHJldHVybiBBcnJheS5pc0FycmF5KGFycmF5KVxuICAgID8gIWFycmF5LnNvbWUocyA9PiB0eXBlb2YgcyAhPT0gJ3N0cmluZycgfHwgcy50cmltKCkubGVuZ3RoIDwgMSlcbiAgICA6IGZhbHNlO1xufTtcbi8qKlxuICogRW5zdXJlcyB0aGUgb2JqIGlzIGEgc2ltcGxlIEpTT04ve31cbiAqIG9iamVjdCwgaS5lLiBub3QgYW4gYXJyYXksIG51bGwsIGRhdGVcbiAqIGV0Yy5cbiAqL1xuY29uc3QgaXNWYWxpZFNpbXBsZU9iamVjdCA9IGZ1bmN0aW9uKG9iaik6IGJvb2xlYW4ge1xuICByZXR1cm4gKFxuICAgIHR5cGVvZiBvYmogPT09ICdvYmplY3QnICYmXG4gICAgIUFycmF5LmlzQXJyYXkob2JqKSAmJlxuICAgIG9iaiAhPT0gbnVsbCAmJlxuICAgIG9iaiBpbnN0YW5jZW9mIERhdGUgIT09IHRydWUgJiZcbiAgICBvYmogaW5zdGFuY2VvZiBQcm9taXNlICE9PSB0cnVlXG4gICk7XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFBhcnNlR3JhcGhRTENvbmZpZyB7XG4gIGVuYWJsZWRGb3JDbGFzc2VzPzogc3RyaW5nW107XG4gIGRpc2FibGVkRm9yQ2xhc3Nlcz86IHN0cmluZ1tdO1xuICBjbGFzc0NvbmZpZ3M/OiBQYXJzZUdyYXBoUUxDbGFzc0NvbmZpZ1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFBhcnNlR3JhcGhRTENsYXNzQ29uZmlnIHtcbiAgY2xhc3NOYW1lOiBzdHJpbmc7XG4gIC8qIFRoZSBgdHlwZWAgb2JqZWN0IGNvbnRhaW5zIG9wdGlvbnMgZm9yIGhvdyB0aGUgY2xhc3MgdHlwZXMgYXJlIGdlbmVyYXRlZCAqL1xuICB0eXBlOiA/e1xuICAgIC8qIEZpZWxkcyB0aGF0IGFyZSBhbGxvd2VkIHdoZW4gY3JlYXRpbmcgb3IgdXBkYXRpbmcgYW4gb2JqZWN0LiAqL1xuICAgIGlucHV0RmllbGRzOiA/e1xuICAgICAgLyogTGVhdmUgYmxhbmsgdG8gYWxsb3cgYWxsIGF2YWlsYWJsZSBmaWVsZHMgaW4gdGhlIHNjaGVtYS4gKi9cbiAgICAgIGNyZWF0ZT86IHN0cmluZ1tdLFxuICAgICAgdXBkYXRlPzogc3RyaW5nW10sXG4gICAgfSxcbiAgICAvKiBGaWVsZHMgb24gdGhlIGVkZ2VzIHRoYXQgY2FuIGJlIHJlc29sdmVkIGZyb20gYSBxdWVyeSwgaS5lLiB0aGUgUmVzdWx0IFR5cGUuICovXG4gICAgb3V0cHV0RmllbGRzOiA/KHN0cmluZ1tdKSxcbiAgICAvKiBGaWVsZHMgYnkgd2hpY2ggYSBxdWVyeSBjYW4gYmUgZmlsdGVyZWQsIGkuZS4gdGhlIGB3aGVyZWAgb2JqZWN0LiAqL1xuICAgIGNvbnN0cmFpbnRGaWVsZHM6ID8oc3RyaW5nW10pLFxuICAgIC8qIEZpZWxkcyBieSB3aGljaCBhIHF1ZXJ5IGNhbiBiZSBzb3J0ZWQ7ICovXG4gICAgc29ydEZpZWxkczogPyh7XG4gICAgICBmaWVsZDogc3RyaW5nLFxuICAgICAgYXNjOiBib29sZWFuLFxuICAgICAgZGVzYzogYm9vbGVhbixcbiAgICB9W10pLFxuICB9O1xuICAvKiBUaGUgYHF1ZXJ5YCBvYmplY3QgY29udGFpbnMgb3B0aW9ucyBmb3Igd2hpY2ggY2xhc3MgcXVlcmllcyBhcmUgZ2VuZXJhdGVkICovXG4gIHF1ZXJ5OiA/e1xuICAgIGdldDogP2Jvb2xlYW4sXG4gICAgZmluZDogP2Jvb2xlYW4sXG4gICAgZmluZEFsaWFzOiA/U3RyaW5nLFxuICAgIGdldEFsaWFzOiA/U3RyaW5nLFxuICB9O1xuICAvKiBUaGUgYG11dGF0aW9uYCBvYmplY3QgY29udGFpbnMgb3B0aW9ucyBmb3Igd2hpY2ggY2xhc3MgbXV0YXRpb25zIGFyZSBnZW5lcmF0ZWQgKi9cbiAgbXV0YXRpb246ID97XG4gICAgY3JlYXRlOiA/Ym9vbGVhbixcbiAgICB1cGRhdGU6ID9ib29sZWFuLFxuICAgIC8vIGRlbGV0ZSBpcyBhIHJlc2VydmVkIGtleSB3b3JkIGluIGpzXG4gICAgZGVzdHJveTogP2Jvb2xlYW4sXG4gICAgY3JlYXRlQWxpYXM6ID9TdHJpbmcsXG4gICAgdXBkYXRlQWxpYXM6ID9TdHJpbmcsXG4gICAgZGVzdHJveUFsaWFzOiA/U3RyaW5nLFxuICB9O1xufVxuXG5leHBvcnQgZGVmYXVsdCBQYXJzZUdyYXBoUUxDb250cm9sbGVyO1xuZXhwb3J0IHsgR3JhcGhRTENvbmZpZ0NsYXNzTmFtZSwgR3JhcGhRTENvbmZpZ0lkLCBHcmFwaFFMQ29uZmlnS2V5IH07XG4iXX0=