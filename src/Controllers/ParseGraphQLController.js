import requiredParameter from '../../lib/requiredParameter';
import DatabaseController from './DatabaseController';
import CacheController from './CacheController';

const GraphQLConfigClassName = '_GraphQLConfig';
const GraphQLConfigId = '1';
const GraphQLConfigKey = 'config';

class ParseGraphQLController {
  databaseController: DatabaseController;
  cacheController: CacheController;
  isMounted: boolean;
  configCacheKey: string;

  constructor(
    params: {
      databaseController: DatabaseController,
      cacheController: CacheController,
    } = {}
  ) {
    this.databaseController =
      params.databaseController ||
      requiredParameter(
        `ParseGraphQLController requires a "databaseController" to be instantiated.`
      );
    this.cacheController = params.cacheController;
    this.isMounted = !!params.mountGraphQL;
    this.configCacheKey = GraphQLConfigKey;
  }

  async getGraphQLConfig(): Promise<ParseGraphQLConfig> {
    if (this.isMounted) {
      const _cachedConfig = await this._getCachedGraphQLConfig();
      if (_cachedConfig) {
        return _cachedConfig;
      }
    }

    const results = await this.databaseController.find(
      GraphQLConfigClassName,
      { objectId: GraphQLConfigId },
      { limit: 1 }
    );

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

  async updateGraphQLConfig(graphQLConfig: ParseGraphQLConfig): Promise<ParseGraphQLConfig> {
    // throws if invalid
    this._validateGraphQLConfig(
      graphQLConfig || requiredParameter('You must provide a graphQLConfig!')
    );

    // Transform in dot notation to make sure it works
    const update = Object.keys(graphQLConfig).reduce(
      (acc, key) => {
        return {
          [GraphQLConfigKey]: {
            ...acc[GraphQLConfigKey],
            [key]: graphQLConfig[key],
          },
        };
      },
      { [GraphQLConfigKey]: {} }
    );

    await this.databaseController.update(
      GraphQLConfigClassName,
      { objectId: GraphQLConfigId },
      update,
      { upsert: true }
    );

    if (this.isMounted) {
      this._putCachedGraphQLConfig(graphQLConfig);
    }

    return { response: { result: true } };
  }

  _getCachedGraphQLConfig() {
    return this.cacheController.graphQL.get(this.configCacheKey);
  }

  _putCachedGraphQLConfig(graphQLConfig: ParseGraphQLConfig) {
    return this.cacheController.graphQL.put(this.configCacheKey, graphQLConfig, 60000);
  }

  _validateGraphQLConfig(graphQLConfig: ?ParseGraphQLConfig): void {
    const errorMessages: string = [];
    if (!graphQLConfig) {
      errorMessages.push('cannot be undefined, null or empty');
    } else if (!isValidSimpleObject(graphQLConfig)) {
      errorMessages.push('must be a valid object');
    } else {
      const {
        enabledForClasses = null,
        disabledForClasses = null,
        classConfigs = null,
        ...invalidKeys
      } = graphQLConfig;

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
              errorMessages.push(
                `classConfig:${classConfig.className} is invalid because ${errorMessage}`
              );
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

  _validateClassConfig(classConfig: ?ParseGraphQLClassConfig): string | void {
    if (!isValidSimpleObject(classConfig)) {
      return 'it must be a valid object';
    } else {
      const { className, type = null, query = null, mutation = null, ...invalidKeys } = classConfig;
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
          sortFields = null,
          ...invalidKeys
        } = type;
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
                const { field, asc, desc, ...invalidKeys } = sortField;
                if (Object.keys(invalidKeys).length) {
                  errorMessage = `"sortField" at index ${index} contains invalid keys, [${Object.keys(
                    invalidKeys
                  )}]`;
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
            const { create = null, update = null, ...invalidKeys } = inputFields;
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
            getAlias = null,
            ...invalidKeys
          } = query;
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
            destroyAlias = null,
            ...invalidKeys
          } = mutation;
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

const isValidStringArray = function (array): boolean {
  return Array.isArray(array)
    ? !array.some(s => typeof s !== 'string' || s.trim().length < 1)
    : false;
};
/**
 * Ensures the obj is a simple JSON/{}
 * object, i.e. not an array, null, date
 * etc.
 */
const isValidSimpleObject = function (obj): boolean {
  return (
    typeof obj === 'object' &&
    !Array.isArray(obj) &&
    obj !== null &&
    obj instanceof Date !== true &&
    obj instanceof Promise !== true
  );
};

export interface ParseGraphQLConfig {
  enabledForClasses?: string[];
  disabledForClasses?: string[];
  classConfigs?: ParseGraphQLClassConfig[];
}

export interface ParseGraphQLClassConfig {
  className: string;
  /* The `type` object contains options for how the class types are generated */
  type: ?{
    /* Fields that are allowed when creating or updating an object. */
    inputFields: ?{
      /* Leave blank to allow all available fields in the schema. */
      create?: string[],
      update?: string[],
    },
    /* Fields on the edges that can be resolved from a query, i.e. the Result Type. */
    outputFields: ?(string[]),
    /* Fields by which a query can be filtered, i.e. the `where` object. */
    constraintFields: ?(string[]),
    /* Fields by which a query can be sorted; */
    sortFields: ?({
      field: string,
      asc: boolean,
      desc: boolean,
    }[]),
  };
  /* The `query` object contains options for which class queries are generated */
  query: ?{
    get: ?boolean,
    find: ?boolean,
    findAlias: ?String,
    getAlias: ?String,
  };
  /* The `mutation` object contains options for which class mutations are generated */
  mutation: ?{
    create: ?boolean,
    update: ?boolean,
    // delete is a reserved key word in js
    destroy: ?boolean,
    createAlias: ?String,
    updateAlias: ?String,
    destroyAlias: ?String,
  };
}

export default ParseGraphQLController;
export { GraphQLConfigClassName, GraphQLConfigId, GraphQLConfigKey };
