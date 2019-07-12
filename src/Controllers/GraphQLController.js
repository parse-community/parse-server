import requiredParameter from '../../lib/requiredParameter';
import DatabaseController from './DatabaseController';
import CacheController from './CacheController';

const GraphQLConfigClass = '_GraphQLConfig';
const GraphQLConfigId = '1';
const GraphQLConfigKey = 'config';

class GraphQLController {
  databaseController: DatabaseController;
  cacheController: CacheController;
  isMounted: boolean;

  constructor(params: {
    databaseController: DatabaseController,
    cacheController: CacheController,
  }) {
    this.databaseController =
      params.databaseController ||
      requiredParameter(
        `GraphQLController requires a "databaseController" to be instantiated.`
      );
    this.cacheController = params.cacheController;
    this.isMounted = !!params.mountGraphQL;
  }

  async getGraphQLConfig(): Promise<ParseGraphQLConfig> {
    if (this.isMounted) {
      const _cachedConfig = await this._getCachedGraphQLConfig();
      if (_cachedConfig) {
        return _cachedConfig;
      }
    }

    const results = await this.databaseController.find(
      GraphQLConfigClass,
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

  async updateGraphQLConfig(
    graphQLConfig: ParseGraphQLConfig
  ): Promise<ParseGraphQLConfig> {
    // throws if invalid
    this._validateGraphQLConfig(graphQLConfig);

    // Transform in dot notation to make sure it works
    const update = Object.keys(graphQLConfig).reduce((acc, key) => {
      acc[`${GraphQLConfigKey}.${key}`] = graphQLConfig[key];
      return acc;
    }, {});

    await this.databaseController.update(
      GraphQLConfigClass,
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
    return this.cacheController.graphQL.get(GraphQLConfigKey);
  }

  _putCachedGraphQLConfig(graphQLConfig: ParseGraphQLConfig) {
    return this.cacheController.graphQL.put(
      GraphQLConfigKey,
      graphQLConfig,
      60000
    );
  }

  _validateGraphQLConfig(graphQLConfig: ?ParseGraphQLConfig): void {
    const errorMessages: string = [];
    if (!graphQLConfig) {
      errorMessages.push('cannot be undefined, null or empty');
    } else if (typeof graphQLConfig !== 'object') {
      errorMessages.push('must be a valid object');
    } else {
      const {
        enabledForClasses,
        disabledForClasses,
        classConfigs,
        ...invalidKeys
      } = graphQLConfig;

      if (invalidKeys.length) {
        errorMessages.push(`encountered invalid keys: ${invalidKeys}`);
      }
      if (enabledForClasses && !Array.isArray(enabledForClasses)) {
        errorMessages.push(`"enabledForClasses" is not a valid array`);
      }
      if (disabledForClasses && !Array.isArray(disabledForClasses)) {
        errorMessages.push(`"disabledForClasses" is not a valid array`);
      }
      if (classConfigs) {
        if (Array.isArray(classConfigs)) {
          classConfigs.forEach(classConfig => {
            const errorMessage = this._validateClassConfig(classConfig);
            if (errorMessage) {
              errorMessages.push(
                `config for ${classConfig.className} is invalid: ${errorMessage}`
              );
            }
          });
        } else {
          errorMessages.push(`"classConfigs" is not a valid array`);
        }
      }
    }
    if (errorMessages.length) {
      throw new Error(`Invalid graphQLConfig: ${errorMessages.join(';')}`);
    }
  }

  _validateClassConfig(
    classConfig: ?ParseGraphQLClassConfig
  ): string | undefined {
    let errorMessage: string;
    if (classConfig === null || typeof classConfig !== 'object') {
      errorMessage = 'must be a valid object';
    } else {
      const {
        className,
        type = null,
        query = null,
        mutation = null,
      } = classConfig;
      if (typeof className !== 'string' || !className.length) {
        // TODO consider checking class exists in schema?
        errorMessage = `"className" must be a valid string`;
      } else if (type !== null) {
        if (typeof type !== 'object') {
          errorMessage = `"type" must be a valid object`;
        }
        const {
          inputFields = null,
          outputFields = null,
          constraintFields = null,
          sortFields = null,
          ...invalidKeys
        } = type;
        if (invalidKeys.length) {
          errorMessage = `"type" contains invalid keys: ${invalidKeys}`;
        } else if (outputFields !== null && !isValidStringArray(outputFields)) {
          errorMessage = `"outputFields" must be a valid string array`;
        } else if (
          constraintFields !== null &&
          !isValidStringArray(constraintFields)
        ) {
          errorMessage = `"constraintFields" must be a valid string array`;
        } else if (sortFields !== null) {
          if (Array.isArray(sortFields)) {
            sortFields.every((sortField, index) => {
              if (sortField === null || typeof sortField !== 'object') {
                errorMessage = `"sortField" at index ${index} is not a valid object`;
                return false;
              } else {
                const { field, asc, desc, ...invalidKeys } = sortField;
                if (invalidKeys.length) {
                  errorMessage = `"sortField" at index ${index} contains invalid keys: ${invalidKeys}`;
                  return false;
                } else {
                  if (typeof field !== 'string') {
                    errorMessage = `"sortField" at index ${index} did not provide the "field" as a string`;
                    return false;
                  } else if (
                    typeof asc !== 'boolean' ||
                    typeof desc !== 'boolean'
                  ) {
                    errorMessage = `"sortField" at index ${index} did not provide "asc" or "desc" as booleans`;
                    return false;
                  }
                }
              }
            });
          } else {
            errorMessage = `"sortFields" must be a valid array.`;
          }
        } else if (inputFields !== null) {
          if (typeof inputFields !== 'object') {
            const {
              create = null,
              update = null,
              ...invalidKeys
            } = inputFields;
            if (invalidKeys.length) {
              errorMessage = `"inputFields" contains invalid keys: ${invalidKeys}`;
            } else {
              if (update !== null && !isValidStringArray(update)) {
                errorMessage = `"inputFields.update" must be a valid string array`;
              } else if (create !== null) {
                if (!isValidStringArray(create)) {
                  errorMessage = `"inputFields.create" must be a valid string array`;
                } else if (className === '_User') {
                  if (
                    !create.includes('username') ||
                    !create.includes('password')
                  ) {
                    errorMessage = `"inputFields.create" must include required fields, username and password`;
                  }
                }
              }
            }
          } else {
            errorMessage = `"inputFields" must be a valid object.`;
          }
        }
      } else if (query !== null) {
        if (typeof query !== 'object') {
          const { find = null, get = null, ...invalidKeys } = query;
          if (invalidKeys.length) {
            errorMessage = `"query" contains invalid keys: ${invalidKeys}`;
          } else if (find !== null && typeof find !== 'boolean') {
            errorMessage = `"query.find" must be a boolean`;
          } else if (get !== null && typeof get !== 'boolean') {
            errorMessage = `"query.get" must be a boolean`;
          }
        } else {
          errorMessage = `"query" must be a valid object`;
        }
      } else if (mutation !== null) {
        if (typeof mutation !== 'object') {
          const {
            create = null,
            update = null,
            destroy = null,
            ...invalidKeys
          } = mutation;
          if (invalidKeys.length) {
            errorMessage = `"query" contains invalid keys: ${invalidKeys}`;
          } else if (create !== null && typeof create !== 'boolean') {
            errorMessage = `"query.create" must be a boolean`;
          } else if (update !== null && typeof update !== 'boolean') {
            errorMessage = `"query.update" must be a boolean`;
          } else if (destroy !== null && typeof destroy !== 'boolean') {
            errorMessage = `"query.destroy" must be a boolean`;
          }
        } else {
          errorMessage = `"mutation" must be a valid object`;
        }
      }
    }

    return errorMessage;
  }
}

const isValidStringArray = function(array): boolean {
  return Array.isArray(array) ? !array.some(s => typeof s !== 'string') : false;
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
  };
  /* The `mutation` object contains options for which class mutations are generated */
  mutation: ?{
    create: ?boolean,
    update: ?boolean,
    // delete is a reserved key word in js
    destroy: ?boolean,
  };
}

export default GraphQLController;
