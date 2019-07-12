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
    let errorMessage: string;
    if (!graphQLConfig) {
      errorMessage = 'cannot be undefined, null or empty.';
    } else if (typeof graphQLConfig !== 'object') {
      errorMessage = 'must be a valid object.';
    } else {
      const {
        enabledForClasses,
        disabledForClasses,
        classConfigs,
        ...invalidKeys
      } = graphQLConfig;

      if (invalidKeys.length) {
        errorMessage = `encountered invalid keys: ${invalidKeys}`;
      }
      // TODO use more rigirous structural validations
      if (enabledForClasses && !Array.isArray(enabledForClasses)) {
        errorMessage = `"enabledForClasses" is not a valid array.`;
      }
      if (disabledForClasses && !Array.isArray(disabledForClasses)) {
        errorMessage = `"disabledForClasses" is not a valid array.`;
      }
      if (classConfigs && !Array.isArray(classConfigs)) {
        errorMessage = `"classConfigs" is not a valid array.`;
      }
    }
    if (errorMessage) {
      throw new Error(`Invalid graphQLConfig: ${errorMessage}`);
    }
  }
}

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
    inputFields:
      | ?(string[])
      | ?{
          /* Leave blank to allow all available fields in the schema. */
          create?: string[],
          update?: string[],
        },
    /* Fields on the edges that can be resolved from a query, i.e. the Result Type. */
    outputFields: ?(string[]),
    /* Fields by which a query can be filtered, i.e. the `where` object. */
    constraintFields: ?(string[]),
    /* Fields by which a query can be sorted; suffix with _ASC or _DESC to enforce direction. */
    sortFields: ?(string[]),
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
    delete: ?boolean,
  };
}

export default GraphQLController;
