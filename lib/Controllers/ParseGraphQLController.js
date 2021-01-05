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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9QYXJzZUdyYXBoUUxDb250cm9sbGVyLmpzIl0sIm5hbWVzIjpbIkdyYXBoUUxDb25maWdDbGFzc05hbWUiLCJHcmFwaFFMQ29uZmlnSWQiLCJHcmFwaFFMQ29uZmlnS2V5IiwiUGFyc2VHcmFwaFFMQ29udHJvbGxlciIsImNvbnN0cnVjdG9yIiwicGFyYW1zIiwiZGF0YWJhc2VDb250cm9sbGVyIiwiY2FjaGVDb250cm9sbGVyIiwiaXNNb3VudGVkIiwibW91bnRHcmFwaFFMIiwiY29uZmlnQ2FjaGVLZXkiLCJnZXRHcmFwaFFMQ29uZmlnIiwiX2NhY2hlZENvbmZpZyIsIl9nZXRDYWNoZWRHcmFwaFFMQ29uZmlnIiwicmVzdWx0cyIsImZpbmQiLCJvYmplY3RJZCIsImxpbWl0IiwiZ3JhcGhRTENvbmZpZyIsImxlbmd0aCIsIl9wdXRDYWNoZWRHcmFwaFFMQ29uZmlnIiwidXBkYXRlR3JhcGhRTENvbmZpZyIsIl92YWxpZGF0ZUdyYXBoUUxDb25maWciLCJ1cGRhdGUiLCJPYmplY3QiLCJrZXlzIiwicmVkdWNlIiwiYWNjIiwia2V5IiwidXBzZXJ0IiwicmVzcG9uc2UiLCJyZXN1bHQiLCJncmFwaFFMIiwiZ2V0IiwicHV0IiwiZXJyb3JNZXNzYWdlcyIsInB1c2giLCJpc1ZhbGlkU2ltcGxlT2JqZWN0IiwiZW5hYmxlZEZvckNsYXNzZXMiLCJkaXNhYmxlZEZvckNsYXNzZXMiLCJjbGFzc0NvbmZpZ3MiLCJpbnZhbGlkS2V5cyIsImlzVmFsaWRTdHJpbmdBcnJheSIsIkFycmF5IiwiaXNBcnJheSIsImZvckVhY2giLCJjbGFzc0NvbmZpZyIsImVycm9yTWVzc2FnZSIsIl92YWxpZGF0ZUNsYXNzQ29uZmlnIiwiY2xhc3NOYW1lIiwiRXJyb3IiLCJqb2luIiwidHlwZSIsInF1ZXJ5IiwibXV0YXRpb24iLCJ0cmltIiwiaW5wdXRGaWVsZHMiLCJvdXRwdXRGaWVsZHMiLCJjb25zdHJhaW50RmllbGRzIiwic29ydEZpZWxkcyIsImV2ZXJ5Iiwic29ydEZpZWxkIiwiaW5kZXgiLCJmaWVsZCIsImFzYyIsImRlc2MiLCJjcmVhdGUiLCJpbmNsdWRlcyIsImZpbmRBbGlhcyIsImdldEFsaWFzIiwiZGVzdHJveSIsImNyZWF0ZUFsaWFzIiwidXBkYXRlQWxpYXMiLCJkZXN0cm95QWxpYXMiLCJhcnJheSIsInNvbWUiLCJzIiwib2JqIiwiRGF0ZSIsIlByb21pc2UiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7Ozs7Ozs7QUFFQSxNQUFNQSxzQkFBc0IsR0FBRyxnQkFBL0I7O0FBQ0EsTUFBTUMsZUFBZSxHQUFHLEdBQXhCOztBQUNBLE1BQU1DLGdCQUFnQixHQUFHLFFBQXpCOzs7QUFFQSxNQUFNQyxzQkFBTixDQUE2QjtBQU0zQkMsRUFBQUEsV0FBVyxDQUNUQyxNQUdDLEdBQUcsRUFKSyxFQUtUO0FBQ0EsU0FBS0Msa0JBQUwsR0FDRUQsTUFBTSxDQUFDQyxrQkFBUCxJQUNBLGdDQUNHLDRFQURILENBRkY7QUFLQSxTQUFLQyxlQUFMLEdBQXVCRixNQUFNLENBQUNFLGVBQTlCO0FBQ0EsU0FBS0MsU0FBTCxHQUFpQixDQUFDLENBQUNILE1BQU0sQ0FBQ0ksWUFBMUI7QUFDQSxTQUFLQyxjQUFMLEdBQXNCUixnQkFBdEI7QUFDRDs7QUFFRCxRQUFNUyxnQkFBTixHQUFzRDtBQUNwRCxRQUFJLEtBQUtILFNBQVQsRUFBb0I7QUFDbEIsWUFBTUksYUFBYSxHQUFHLE1BQU0sS0FBS0MsdUJBQUwsRUFBNUI7O0FBQ0EsVUFBSUQsYUFBSixFQUFtQjtBQUNqQixlQUFPQSxhQUFQO0FBQ0Q7QUFDRjs7QUFFRCxVQUFNRSxPQUFPLEdBQUcsTUFBTSxLQUFLUixrQkFBTCxDQUF3QlMsSUFBeEIsQ0FDcEJmLHNCQURvQixFQUVwQjtBQUFFZ0IsTUFBQUEsUUFBUSxFQUFFZjtBQUFaLEtBRm9CLEVBR3BCO0FBQUVnQixNQUFBQSxLQUFLLEVBQUU7QUFBVCxLQUhvQixDQUF0QjtBQU1BLFFBQUlDLGFB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QUFhLFFBQWIsSUFBeUJBLENBQUMsQ0FBQ3JCLElBQUYsR0FBU3BDLE1BQVQsR0FBa0IsQ0FBM0QsQ0FERSxHQUVILEtBRko7QUFHRCxDQUpEO0FBS0E7Ozs7Ozs7QUFLQSxNQUFNa0IsbUJBQW1CLEdBQUcsVUFBVXdDLEdBQVYsRUFBd0I7QUFDbEQsU0FDRSxPQUFPQSxHQUFQLEtBQWUsUUFBZixJQUNBLENBQUNsQyxLQUFLLENBQUNDLE9BQU4sQ0FBY2lDLEdBQWQsQ0FERCxJQUVBQSxHQUFHLEtBQUssSUFGUixJQUdBQSxHQUFHLFlBQVlDLElBQWYsS0FBd0IsSUFIeEIsSUFJQUQsR0FBRyxZQUFZRSxPQUFmLEtBQTJCLElBTDdCO0FBT0QsQ0FSRDs7ZUF3RGU1RSxzQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCByZXF1aXJlZFBhcmFtZXRlciBmcm9tICcuLi8uLi9saWIvcmVxdWlyZWRQYXJhbWV0ZXInO1xuaW1wb3J0IERhdGFiYXNlQ29udHJvbGxlciBmcm9tICcuL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgQ2FjaGVDb250cm9sbGVyIGZyb20gJy4vQ2FjaGVDb250cm9sbGVyJztcblxuY29uc3QgR3JhcGhRTENvbmZpZ0NsYXNzTmFtZSA9ICdfR3JhcGhRTENvbmZpZyc7XG5jb25zdCBHcmFwaFFMQ29uZmlnSWQgPSAnMSc7XG5jb25zdCBHcmFwaFFMQ29uZmlnS2V5ID0gJ2NvbmZpZyc7XG5cbmNsYXNzIFBhcnNlR3JhcGhRTENvbnRyb2xsZXIge1xuICBkYXRhYmFzZUNvbnRyb2xsZXI6IERhdGFiYXNlQ29udHJvbGxlcjtcbiAgY2FjaGVDb250cm9sbGVyOiBDYWNoZUNvbnRyb2xsZXI7XG4gIGlzTW91bnRlZDogYm9vbGVhbjtcbiAgY29uZmlnQ2FjaGVLZXk6IHN0cmluZztcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwYXJhbXM6IHtcbiAgICAgIGRhdGFiYXNlQ29udHJvbGxlcjogRGF0YWJhc2VDb250cm9sbGVyLFxuICAgICAgY2FjaGVDb250cm9sbGVyOiBDYWNoZUNvbnRyb2xsZXIsXG4gICAgfSA9IHt9XG4gICkge1xuICAgIHRoaXMuZGF0YWJhc2VDb250cm9sbGVyID1cbiAgICAgIHBhcmFtcy5kYXRhYmFzZUNvbnRyb2xsZXIgfHxcbiAgICAgIHJlcXVpcmVkUGFyYW1ldGVyKFxuICAgICAgICBgUGFyc2VHcmFwaFFMQ29udHJvbGxlciByZXF1aXJlcyBhIFwiZGF0YWJhc2VDb250cm9sbGVyXCIgdG8gYmUgaW5zdGFudGlhdGVkLmBcbiAgICAgICk7XG4gICAgdGhpcy5jYWNoZUNvbnRyb2xsZXIgPSBwYXJhbXMuY2FjaGVDb250cm9sbGVyO1xuICAgIHRoaXMuaXNNb3VudGVkID0gISFwYXJhbXMubW91bnRHcmFwaFFMO1xuICAgIHRoaXMuY29uZmlnQ2FjaGVLZXkgPSBHcmFwaFFMQ29uZmlnS2V5O1xuICB9XG5cbiAgYXN5bmMgZ2V0R3JhcGhRTENvbmZpZygpOiBQcm9taXNlPFBhcnNlR3JhcGhRTENvbmZpZz4ge1xuICAgIGlmICh0aGlzLmlzTW91bnRlZCkge1xuICAgICAgY29uc3QgX2NhY2hlZENvbmZpZyA9IGF3YWl0IHRoaXMuX2dldENhY2hlZEdyYXBoUUxDb25maWcoKTtcbiAgICAgIGlmIChfY2FjaGVkQ29uZmlnKSB7XG4gICAgICAgIHJldHVybiBfY2FjaGVkQ29uZmlnO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmRhdGFiYXNlQ29udHJvbGxlci5maW5kKFxuICAgICAgR3JhcGhRTENvbmZpZ0NsYXNzTmFtZSxcbiAgICAgIHsgb2JqZWN0SWQ6IEdyYXBoUUxDb25maWdJZCB9LFxuICAgICAgeyBsaW1pdDogMSB9XG4gICAgKTtcblxuICAgIGxldCBncmFwaFFMQ29uZmlnO1xuICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAvLyBJZiB0aGVyZSBpcyBubyBjb25maWcgaW4gdGhlIGRhdGFiYXNlIC0gcmV0dXJuIGVtcHR5IGNvbmZpZy5cbiAgICAgIHJldHVybiB7fTtcbiAgICB9IGVsc2Uge1xuICAgICAgZ3JhcGhRTENvbmZpZyA9IHJlc3VsdHNbMF1bR3JhcGhRTENvbmZpZ0tleV07XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuaXNNb3VudGVkKSB7XG4gICAgICB0aGlzLl9wdXRDYWNoZWRHcmFwaFFMQ29uZmlnKGdyYXBoUUxDb25maWcpO1xuICAgIH1cblxuICAgIHJldHVybiBncmFwaFFMQ29uZmlnO1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlR3JhcGhRTENvbmZpZyhncmFwaFFMQ29uZmlnOiBQYXJzZUdyYXBoUUxDb25maWcpOiBQcm9taXNlPFBhcnNlR3JhcGhRTENvbmZpZz4ge1xuICAgIC8vIHRocm93cyBpZiBpbnZhbGlkXG4gICAgdGhpcy5fdmFsaWRhdGVHcmFwaFFMQ29uZmlnKFxuICAgICAgZ3JhcGhRTENvbmZpZyB8fCByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIGdyYXBoUUxDb25maWchJylcbiAgICApO1xuXG4gICAgLy8gVHJhbnNmb3JtIGluIGRvdCBub3RhdGlvbiB0byBtYWtlIHN1cmUgaXQgd29ya3NcbiAgICBjb25zdCB1cGRhdGUgPSBPYmplY3Qua2V5cyhncmFwaFFMQ29uZmlnKS5yZWR1Y2UoXG4gICAgICAoYWNjLCBrZXkpID0+IHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBbR3JhcGhRTENvbmZpZ0tleV06IHtcbiAgICAgICAgICAgIC4uLmFjY1tHcmFwaFFMQ29uZmlnS2V5XSxcbiAgICAgICAgICAgIFtrZXldOiBncmFwaFFMQ29uZmlnW2tleV0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH0sXG4gICAgICB7IFtHcmFwaFFMQ29uZmlnS2V5XToge30gfVxuICAgICk7XG5cbiAgICBhd2FpdCB0aGlzLmRhdGFiYXNlQ29udHJvbGxlci51cGRhdGUoXG4gICAgICBHcmFwaFFMQ29uZmlnQ2xhc3NOYW1lLFxuICAgICAgeyBvYmplY3RJZDogR3JhcGhRTENvbmZpZ0lkIH0sXG4gICAgICB1cGRhdGUsXG4gICAgICB7IHVwc2VydDogdHJ1ZSB9XG4gICAgKTtcblxuICAgIGlmICh0aGlzLmlzTW91bnRlZCkge1xuICAgICAgdGhpcy5fcHV0Q2FjaGVkR3JhcGhRTENvbmZpZyhncmFwaFFMQ29uZmlnKTtcbiAgICB9XG5cbiAgICByZXR1cm4geyByZXNwb25zZTogeyByZXN1bHQ6IHRydWUgfSB9O1xuICB9XG5cbiAgX2dldENhY2hlZEdyYXBoUUxDb25maWcoKSB7XG4gICAgcmV0dXJuIHRoaXMuY2FjaGVDb250cm9sbGVyLmdyYXBoUUwuZ2V0KHRoaXMuY29uZmlnQ2FjaGVLZXkpO1xuICB9XG5cbiAgX3B1dENhY2hlZEdyYXBoUUxDb25maWcoZ3JhcGhRTENvbmZpZzogUGFyc2VHcmFwaFFMQ29uZmlnKSB7XG4gICAgcmV0dXJuIHRoaXMuY2FjaGVDb250cm9sbGVyLmdyYXBoUUwucHV0KHRoaXMuY29uZmlnQ2FjaGVLZXksIGdyYXBoUUxDb25maWcsIDYwMDAwKTtcbiAgfVxuXG4gIF92YWxpZGF0ZUdyYXBoUUxDb25maWcoZ3JhcGhRTENvbmZpZzogP1BhcnNlR3JhcGhRTENvbmZpZyk6IHZvaWQge1xuICAgIGNvbnN0IGVycm9yTWVzc2FnZXM6IHN0cmluZyA9IFtdO1xuICAgIGlmICghZ3JhcGhRTENvbmZpZykge1xuICAgICAgZXJyb3JNZXNzYWdlcy5wdXNoKCdjYW5ub3QgYmUgdW5kZWZpbmVkLCBudWxsIG9yIGVtcHR5Jyk7XG4gICAgfSBlbHNlIGlmICghaXNWYWxpZFNpbXBsZU9iamVjdChncmFwaFFMQ29uZmlnKSkge1xuICAgICAgZXJyb3JNZXNzYWdlcy5wdXNoKCdtdXN0IGJlIGEgdmFsaWQgb2JqZWN0Jyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHtcbiAgICAgICAgZW5hYmxlZEZvckNsYXNzZXMgPSBudWxsLFxuICAgICAgICBkaXNhYmxlZEZvckNsYXNzZXMgPSBudWxsLFxuICAgICAgICBjbGFzc0NvbmZpZ3MgPSBudWxsLFxuICAgICAgICAuLi5pbnZhbGlkS2V5c1xuICAgICAgfSA9IGdyYXBoUUxDb25maWc7XG5cbiAgICAgIGlmIChPYmplY3Qua2V5cyhpbnZhbGlkS2V5cykubGVuZ3RoKSB7XG4gICAgICAgIGVycm9yTWVzc2FnZXMucHVzaChgZW5jb3VudGVyZWQgaW52YWxpZCBrZXlzOiBbJHtPYmplY3Qua2V5cyhpbnZhbGlkS2V5cyl9XWApO1xuICAgICAgfVxuICAgICAgaWYgKGVuYWJsZWRGb3JDbGFzc2VzICE9PSBudWxsICYmICFpc1ZhbGlkU3RyaW5nQXJyYXkoZW5hYmxlZEZvckNsYXNzZXMpKSB7XG4gICAgICAgIGVycm9yTWVzc2FnZXMucHVzaChgXCJlbmFibGVkRm9yQ2xhc3Nlc1wiIGlzIG5vdCBhIHZhbGlkIGFycmF5YCk7XG4gICAgICB9XG4gICAgICBpZiAoZGlzYWJsZWRGb3JDbGFzc2VzICE9PSBudWxsICYmICFpc1ZhbGlkU3RyaW5nQXJyYXkoZGlzYWJsZWRGb3JDbGFzc2VzKSkge1xuICAgICAgICBlcnJvck1lc3NhZ2VzLnB1c2goYFwiZGlzYWJsZWRGb3JDbGFzc2VzXCIgaXMgbm90IGEgdmFsaWQgYXJyYXlgKTtcbiAgICAgIH1cbiAgICAgIGlmIChjbGFzc0NvbmZpZ3MgIT09IG51bGwpIHtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoY2xhc3NDb25maWdzKSkge1xuICAgICAgICAgIGNsYXNzQ29uZmlncy5mb3JFYWNoKGNsYXNzQ29uZmlnID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGVycm9yTWVzc2FnZSA9IHRoaXMuX3ZhbGlkYXRlQ2xhc3NDb25maWcoY2xhc3NDb25maWcpO1xuICAgICAgICAgICAgaWYgKGVycm9yTWVzc2FnZSkge1xuICAgICAgICAgICAgICBlcnJvck1lc3NhZ2VzLnB1c2goXG4gICAgICAgICAgICAgICAgYGNsYXNzQ29uZmlnOiR7Y2xhc3NDb25maWcuY2xhc3NOYW1lfSBpcyBpbnZhbGlkIGJlY2F1c2UgJHtlcnJvck1lc3NhZ2V9YFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGVycm9yTWVzc2FnZXMucHVzaChgXCJjbGFzc0NvbmZpZ3NcIiBpcyBub3QgYSB2YWxpZCBhcnJheWApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChlcnJvck1lc3NhZ2VzLmxlbmd0aCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIGdyYXBoUUxDb25maWc6ICR7ZXJyb3JNZXNzYWdlcy5qb2luKCc7ICcpfWApO1xuICAgIH1cbiAgfVxuXG4gIF92YWxpZGF0ZUNsYXNzQ29uZmlnKGNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWcpOiBzdHJpbmcgfCB2b2lkIHtcbiAgICBpZiAoIWlzVmFsaWRTaW1wbGVPYmplY3QoY2xhc3NDb25maWcpKSB7XG4gICAgICByZXR1cm4gJ2l0IG11c3QgYmUgYSB2YWxpZCBvYmplY3QnO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCB7IGNsYXNzTmFtZSwgdHlwZSA9IG51bGwsIHF1ZXJ5ID0gbnVsbCwgbXV0YXRpb24gPSBudWxsLCAuLi5pbnZhbGlkS2V5cyB9ID0gY2xhc3NDb25maWc7XG4gICAgICBpZiAoT2JqZWN0LmtleXMoaW52YWxpZEtleXMpLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gYFwiaW52YWxpZEtleXNcIiBbJHtPYmplY3Qua2V5cyhpbnZhbGlkS2V5cyl9XSBzaG91bGQgbm90IGJlIHByZXNlbnRgO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiBjbGFzc05hbWUgIT09ICdzdHJpbmcnIHx8ICFjbGFzc05hbWUudHJpbSgpLmxlbmd0aCkge1xuICAgICAgICAvLyBUT0RPIGNvbnNpZGVyIGNoZWNraW5nIGNsYXNzIGV4aXN0cyBpbiBzY2hlbWE/XG4gICAgICAgIHJldHVybiBgXCJjbGFzc05hbWVcIiBtdXN0IGJlIGEgdmFsaWQgc3RyaW5nYDtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlICE9PSBudWxsKSB7XG4gICAgICAgIGlmICghaXNWYWxpZFNpbXBsZU9iamVjdCh0eXBlKSkge1xuICAgICAgICAgIHJldHVybiBgXCJ0eXBlXCIgbXVzdCBiZSBhIHZhbGlkIG9iamVjdGA7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qge1xuICAgICAgICAgIGlucHV0RmllbGRzID0gbnVsbCxcbiAgICAgICAgICBvdXRwdXRGaWVsZHMgPSBudWxsLFxuICAgICAgICAgIGNvbnN0cmFpbnRGaWVsZHMgPSBudWxsLFxuICAgICAgICAgIHNvcnRGaWVsZHMgPSBudWxsLFxuICAgICAgICAgIC4uLmludmFsaWRLZXlzXG4gICAgICAgIH0gPSB0eXBlO1xuICAgICAgICBpZiAoT2JqZWN0LmtleXMoaW52YWxpZEtleXMpLmxlbmd0aCkge1xuICAgICAgICAgIHJldHVybiBgXCJ0eXBlXCIgY29udGFpbnMgaW52YWxpZCBrZXlzLCBbJHtPYmplY3Qua2V5cyhpbnZhbGlkS2V5cyl9XWA7XG4gICAgICAgIH0gZWxzZSBpZiAob3V0cHV0RmllbGRzICE9PSBudWxsICYmICFpc1ZhbGlkU3RyaW5nQXJyYXkob3V0cHV0RmllbGRzKSkge1xuICAgICAgICAgIHJldHVybiBgXCJvdXRwdXRGaWVsZHNcIiBtdXN0IGJlIGEgdmFsaWQgc3RyaW5nIGFycmF5YDtcbiAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50RmllbGRzICE9PSBudWxsICYmICFpc1ZhbGlkU3RyaW5nQXJyYXkoY29uc3RyYWludEZpZWxkcykpIHtcbiAgICAgICAgICByZXR1cm4gYFwiY29uc3RyYWludEZpZWxkc1wiIG11c3QgYmUgYSB2YWxpZCBzdHJpbmcgYXJyYXlgO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzb3J0RmllbGRzICE9PSBudWxsKSB7XG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoc29ydEZpZWxkcykpIHtcbiAgICAgICAgICAgIGxldCBlcnJvck1lc3NhZ2U7XG4gICAgICAgICAgICBzb3J0RmllbGRzLmV2ZXJ5KChzb3J0RmllbGQsIGluZGV4KSA9PiB7XG4gICAgICAgICAgICAgIGlmICghaXNWYWxpZFNpbXBsZU9iamVjdChzb3J0RmllbGQpKSB7XG4gICAgICAgICAgICAgICAgZXJyb3JNZXNzYWdlID0gYFwic29ydEZpZWxkXCIgYXQgaW5kZXggJHtpbmRleH0gaXMgbm90IGEgdmFsaWQgb2JqZWN0YDtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3QgeyBmaWVsZCwgYXNjLCBkZXNjLCAuLi5pbnZhbGlkS2V5cyB9ID0gc29ydEZpZWxkO1xuICAgICAgICAgICAgICAgIGlmIChPYmplY3Qua2V5cyhpbnZhbGlkS2V5cykubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICBlcnJvck1lc3NhZ2UgPSBgXCJzb3J0RmllbGRcIiBhdCBpbmRleCAke2luZGV4fSBjb250YWlucyBpbnZhbGlkIGtleXMsIFske09iamVjdC5rZXlzKFxuICAgICAgICAgICAgICAgICAgICBpbnZhbGlkS2V5c1xuICAgICAgICAgICAgICAgICAgKX1dYDtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBmaWVsZCAhPT0gJ3N0cmluZycgfHwgZmllbGQudHJpbSgpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICBlcnJvck1lc3NhZ2UgPSBgXCJzb3J0RmllbGRcIiBhdCBpbmRleCAke2luZGV4fSBkaWQgbm90IHByb3ZpZGUgdGhlIFwiZmllbGRcIiBhcyBhIHN0cmluZ2A7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGFzYyAhPT0gJ2Jvb2xlYW4nIHx8IHR5cGVvZiBkZXNjICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgICAgICAgICAgZXJyb3JNZXNzYWdlID0gYFwic29ydEZpZWxkXCIgYXQgaW5kZXggJHtpbmRleH0gZGlkIG5vdCBwcm92aWRlIFwiYXNjXCIgb3IgXCJkZXNjXCIgYXMgYm9vbGVhbnNgO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpZiAoZXJyb3JNZXNzYWdlKSB7XG4gICAgICAgICAgICAgIHJldHVybiBlcnJvck1lc3NhZ2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJzb3J0RmllbGRzXCIgbXVzdCBiZSBhIHZhbGlkIGFycmF5LmA7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChpbnB1dEZpZWxkcyAhPT0gbnVsbCkge1xuICAgICAgICAgIGlmIChpc1ZhbGlkU2ltcGxlT2JqZWN0KGlucHV0RmllbGRzKSkge1xuICAgICAgICAgICAgY29uc3QgeyBjcmVhdGUgPSBudWxsLCB1cGRhdGUgPSBudWxsLCAuLi5pbnZhbGlkS2V5cyB9ID0gaW5wdXRGaWVsZHM7XG4gICAgICAgICAgICBpZiAoT2JqZWN0LmtleXMoaW52YWxpZEtleXMpLmxlbmd0aCkge1xuICAgICAgICAgICAgICByZXR1cm4gYFwiaW5wdXRGaWVsZHNcIiBjb250YWlucyBpbnZhbGlkIGtleXM6IFske09iamVjdC5rZXlzKGludmFsaWRLZXlzKX1dYDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGlmICh1cGRhdGUgIT09IG51bGwgJiYgIWlzVmFsaWRTdHJpbmdBcnJheSh1cGRhdGUpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGBcImlucHV0RmllbGRzLnVwZGF0ZVwiIG11c3QgYmUgYSB2YWxpZCBzdHJpbmcgYXJyYXlgO1xuICAgICAgICAgICAgICB9IGVsc2UgaWYgKGNyZWF0ZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGlmICghaXNWYWxpZFN0cmluZ0FycmF5KGNyZWF0ZSkpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBgXCJpbnB1dEZpZWxkcy5jcmVhdGVcIiBtdXN0IGJlIGEgdmFsaWQgc3RyaW5nIGFycmF5YDtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgICAgICAgICAgICAgaWYgKCFjcmVhdGUuaW5jbHVkZXMoJ3VzZXJuYW1lJykgfHwgIWNyZWF0ZS5pbmNsdWRlcygncGFzc3dvcmQnKSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYFwiaW5wdXRGaWVsZHMuY3JlYXRlXCIgbXVzdCBpbmNsdWRlIHJlcXVpcmVkIGZpZWxkcywgdXNlcm5hbWUgYW5kIHBhc3N3b3JkYDtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGBcImlucHV0RmllbGRzXCIgbXVzdCBiZSBhIHZhbGlkIG9iamVjdGA7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAocXVlcnkgIT09IG51bGwpIHtcbiAgICAgICAgaWYgKGlzVmFsaWRTaW1wbGVPYmplY3QocXVlcnkpKSB7XG4gICAgICAgICAgY29uc3Qge1xuICAgICAgICAgICAgZmluZCA9IG51bGwsXG4gICAgICAgICAgICBnZXQgPSBudWxsLFxuICAgICAgICAgICAgZmluZEFsaWFzID0gbnVsbCxcbiAgICAgICAgICAgIGdldEFsaWFzID0gbnVsbCxcbiAgICAgICAgICAgIC4uLmludmFsaWRLZXlzXG4gICAgICAgICAgfSA9IHF1ZXJ5O1xuICAgICAgICAgIGlmIChPYmplY3Qua2V5cyhpbnZhbGlkS2V5cykubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwicXVlcnlcIiBjb250YWlucyBpbnZhbGlkIGtleXMsIFske09iamVjdC5rZXlzKGludmFsaWRLZXlzKX1dYDtcbiAgICAgICAgICB9IGVsc2UgaWYgKGZpbmQgIT09IG51bGwgJiYgdHlwZW9mIGZpbmQgIT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgcmV0dXJuIGBcInF1ZXJ5LmZpbmRcIiBtdXN0IGJlIGEgYm9vbGVhbmA7XG4gICAgICAgICAgfSBlbHNlIGlmIChnZXQgIT09IG51bGwgJiYgdHlwZW9mIGdldCAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwicXVlcnkuZ2V0XCIgbXVzdCBiZSBhIGJvb2xlYW5gO1xuICAgICAgICAgIH0gZWxzZSBpZiAoZmluZEFsaWFzICE9PSBudWxsICYmIHR5cGVvZiBmaW5kQWxpYXMgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwicXVlcnkuZmluZEFsaWFzXCIgbXVzdCBiZSBhIHN0cmluZ2A7XG4gICAgICAgICAgfSBlbHNlIGlmIChnZXRBbGlhcyAhPT0gbnVsbCAmJiB0eXBlb2YgZ2V0QWxpYXMgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwicXVlcnkuZ2V0QWxpYXNcIiBtdXN0IGJlIGEgc3RyaW5nYDtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIGBcInF1ZXJ5XCIgbXVzdCBiZSBhIHZhbGlkIG9iamVjdGA7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChtdXRhdGlvbiAhPT0gbnVsbCkge1xuICAgICAgICBpZiAoaXNWYWxpZFNpbXBsZU9iamVjdChtdXRhdGlvbikpIHtcbiAgICAgICAgICBjb25zdCB7XG4gICAgICAgICAgICBjcmVhdGUgPSBudWxsLFxuICAgICAgICAgICAgdXBkYXRlID0gbnVsbCxcbiAgICAgICAgICAgIGRlc3Ryb3kgPSBudWxsLFxuICAgICAgICAgICAgY3JlYXRlQWxpYXMgPSBudWxsLFxuICAgICAgICAgICAgdXBkYXRlQWxpYXMgPSBudWxsLFxuICAgICAgICAgICAgZGVzdHJveUFsaWFzID0gbnVsbCxcbiAgICAgICAgICAgIC4uLmludmFsaWRLZXlzXG4gICAgICAgICAgfSA9IG11dGF0aW9uO1xuICAgICAgICAgIGlmIChPYmplY3Qua2V5cyhpbnZhbGlkS2V5cykubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwibXV0YXRpb25cIiBjb250YWlucyBpbnZhbGlkIGtleXMsIFske09iamVjdC5rZXlzKGludmFsaWRLZXlzKX1dYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGNyZWF0ZSAhPT0gbnVsbCAmJiB0eXBlb2YgY3JlYXRlICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJtdXRhdGlvbi5jcmVhdGVcIiBtdXN0IGJlIGEgYm9vbGVhbmA7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh1cGRhdGUgIT09IG51bGwgJiYgdHlwZW9mIHVwZGF0ZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwibXV0YXRpb24udXBkYXRlXCIgbXVzdCBiZSBhIGJvb2xlYW5gO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZGVzdHJveSAhPT0gbnVsbCAmJiB0eXBlb2YgZGVzdHJveSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwibXV0YXRpb24uZGVzdHJveVwiIG11c3QgYmUgYSBib29sZWFuYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGNyZWF0ZUFsaWFzICE9PSBudWxsICYmIHR5cGVvZiBjcmVhdGVBbGlhcyAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJtdXRhdGlvbi5jcmVhdGVBbGlhc1wiIG11c3QgYmUgYSBzdHJpbmdgO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAodXBkYXRlQWxpYXMgIT09IG51bGwgJiYgdHlwZW9mIHVwZGF0ZUFsaWFzICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgcmV0dXJuIGBcIm11dGF0aW9uLnVwZGF0ZUFsaWFzXCIgbXVzdCBiZSBhIHN0cmluZ2A7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChkZXN0cm95QWxpYXMgIT09IG51bGwgJiYgdHlwZW9mIGRlc3Ryb3lBbGlhcyAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJtdXRhdGlvbi5kZXN0cm95QWxpYXNcIiBtdXN0IGJlIGEgc3RyaW5nYDtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIGBcIm11dGF0aW9uXCIgbXVzdCBiZSBhIHZhbGlkIG9iamVjdGA7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuY29uc3QgaXNWYWxpZFN0cmluZ0FycmF5ID0gZnVuY3Rpb24gKGFycmF5KTogYm9vbGVhbiB7XG4gIHJldHVybiBBcnJheS5pc0FycmF5KGFycmF5KVxuICAgID8gIWFycmF5LnNvbWUocyA9PiB0eXBlb2YgcyAhPT0gJ3N0cmluZycgfHwgcy50cmltKCkubGVuZ3RoIDwgMSlcbiAgICA6IGZhbHNlO1xufTtcbi8qKlxuICogRW5zdXJlcyB0aGUgb2JqIGlzIGEgc2ltcGxlIEpTT04ve31cbiAqIG9iamVjdCwgaS5lLiBub3QgYW4gYXJyYXksIG51bGwsIGRhdGVcbiAqIGV0Yy5cbiAqL1xuY29uc3QgaXNWYWxpZFNpbXBsZU9iamVjdCA9IGZ1bmN0aW9uIChvYmopOiBib29sZWFuIHtcbiAgcmV0dXJuIChcbiAgICB0eXBlb2Ygb2JqID09PSAnb2JqZWN0JyAmJlxuICAgICFBcnJheS5pc0FycmF5KG9iaikgJiZcbiAgICBvYmogIT09IG51bGwgJiZcbiAgICBvYmogaW5zdGFuY2VvZiBEYXRlICE9PSB0cnVlICYmXG4gICAgb2JqIGluc3RhbmNlb2YgUHJvbWlzZSAhPT0gdHJ1ZVxuICApO1xufTtcblxuZXhwb3J0IGludGVyZmFjZSBQYXJzZUdyYXBoUUxDb25maWcge1xuICBlbmFibGVkRm9yQ2xhc3Nlcz86IHN0cmluZ1tdO1xuICBkaXNhYmxlZEZvckNsYXNzZXM/OiBzdHJpbmdbXTtcbiAgY2xhc3NDb25maWdzPzogUGFyc2VHcmFwaFFMQ2xhc3NDb25maWdbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQYXJzZUdyYXBoUUxDbGFzc0NvbmZpZyB7XG4gIGNsYXNzTmFtZTogc3RyaW5nO1xuICAvKiBUaGUgYHR5cGVgIG9iamVjdCBjb250YWlucyBvcHRpb25zIGZvciBob3cgdGhlIGNsYXNzIHR5cGVzIGFyZSBnZW5lcmF0ZWQgKi9cbiAgdHlwZTogP3tcbiAgICAvKiBGaWVsZHMgdGhhdCBhcmUgYWxsb3dlZCB3aGVuIGNyZWF0aW5nIG9yIHVwZGF0aW5nIGFuIG9iamVjdC4gKi9cbiAgICBpbnB1dEZpZWxkczogP3tcbiAgICAgIC8qIExlYXZlIGJsYW5rIHRvIGFsbG93IGFsbCBhdmFpbGFibGUgZmllbGRzIGluIHRoZSBzY2hlbWEuICovXG4gICAgICBjcmVhdGU/OiBzdHJpbmdbXSxcbiAgICAgIHVwZGF0ZT86IHN0cmluZ1tdLFxuICAgIH0sXG4gICAgLyogRmllbGRzIG9uIHRoZSBlZGdlcyB0aGF0IGNhbiBiZSByZXNvbHZlZCBmcm9tIGEgcXVlcnksIGkuZS4gdGhlIFJlc3VsdCBUeXBlLiAqL1xuICAgIG91dHB1dEZpZWxkczogPyhzdHJpbmdbXSksXG4gICAgLyogRmllbGRzIGJ5IHdoaWNoIGEgcXVlcnkgY2FuIGJlIGZpbHRlcmVkLCBpLmUuIHRoZSBgd2hlcmVgIG9iamVjdC4gKi9cbiAgICBjb25zdHJhaW50RmllbGRzOiA/KHN0cmluZ1tdKSxcbiAgICAvKiBGaWVsZHMgYnkgd2hpY2ggYSBxdWVyeSBjYW4gYmUgc29ydGVkOyAqL1xuICAgIHNvcnRGaWVsZHM6ID8oe1xuICAgICAgZmllbGQ6IHN0cmluZyxcbiAgICAgIGFzYzogYm9vbGVhbixcbiAgICAgIGRlc2M6IGJvb2xlYW4sXG4gICAgfVtdKSxcbiAgfTtcbiAgLyogVGhlIGBxdWVyeWAgb2JqZWN0IGNvbnRhaW5zIG9wdGlvbnMgZm9yIHdoaWNoIGNsYXNzIHF1ZXJpZXMgYXJlIGdlbmVyYXRlZCAqL1xuICBxdWVyeTogP3tcbiAgICBnZXQ6ID9ib29sZWFuLFxuICAgIGZpbmQ6ID9ib29sZWFuLFxuICAgIGZpbmRBbGlhczogP1N0cmluZyxcbiAgICBnZXRBbGlhczogP1N0cmluZyxcbiAgfTtcbiAgLyogVGhlIGBtdXRhdGlvbmAgb2JqZWN0IGNvbnRhaW5zIG9wdGlvbnMgZm9yIHdoaWNoIGNsYXNzIG11dGF0aW9ucyBhcmUgZ2VuZXJhdGVkICovXG4gIG11dGF0aW9uOiA/e1xuICAgIGNyZWF0ZTogP2Jvb2xlYW4sXG4gICAgdXBkYXRlOiA/Ym9vbGVhbixcbiAgICAvLyBkZWxldGUgaXMgYSByZXNlcnZlZCBrZXkgd29yZCBpbiBqc1xuICAgIGRlc3Ryb3k6ID9ib29sZWFuLFxuICAgIGNyZWF0ZUFsaWFzOiA/U3RyaW5nLFxuICAgIHVwZGF0ZUFsaWFzOiA/U3RyaW5nLFxuICAgIGRlc3Ryb3lBbGlhczogP1N0cmluZyxcbiAgfTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgUGFyc2VHcmFwaFFMQ29udHJvbGxlcjtcbmV4cG9ydCB7IEdyYXBoUUxDb25maWdDbGFzc05hbWUsIEdyYXBoUUxDb25maWdJZCwgR3JhcGhRTENvbmZpZ0tleSB9O1xuIl19