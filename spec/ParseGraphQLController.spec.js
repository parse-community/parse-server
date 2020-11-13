const {
  default: ParseGraphQLController,
  GraphQLConfigClassName,
  GraphQLConfigId,
  GraphQLConfigKey,
} = require('../lib/Controllers/ParseGraphQLController');
const { isEqual } = require('lodash');

describe('ParseGraphQLController', () => {
  let parseServer;
  let databaseController;
  let cacheController;
  let databaseUpdateArgs;

  // Holds the graphQLConfig in memory instead of using the db
  let graphQLConfigRecord;

  const setConfigOnDb = graphQLConfigData => {
    graphQLConfigRecord = {
      objectId: GraphQLConfigId,
      [GraphQLConfigKey]: graphQLConfigData,
    };
  };
  const removeConfigFromDb = () => {
    graphQLConfigRecord = null;
  };
  const getConfigFromDb = () => {
    return graphQLConfigRecord;
  };

  beforeAll(async () => {
    parseServer = await global.reconfigureServer({
      schemaCacheTTL: 100,
    });
    databaseController = parseServer.config.databaseController;
    cacheController = parseServer.config.cacheController;

    const defaultFind = databaseController.find.bind(databaseController);
    databaseController.find = async (className, query, ...args) => {
      if (className === GraphQLConfigClassName && isEqual(query, { objectId: GraphQLConfigId })) {
        const graphQLConfigRecord = getConfigFromDb();
        return graphQLConfigRecord ? [graphQLConfigRecord] : [];
      } else {
        return defaultFind(className, query, ...args);
      }
    };

    const defaultUpdate = databaseController.update.bind(databaseController);
    databaseController.update = async (className, query, update, fullQueryOptions) => {
      databaseUpdateArgs = [className, query, update, fullQueryOptions];
      if (
        className === GraphQLConfigClassName &&
        isEqual(query, { objectId: GraphQLConfigId }) &&
        update &&
        !!update[GraphQLConfigKey] &&
        fullQueryOptions &&
        isEqual(fullQueryOptions, { upsert: true })
      ) {
        setConfigOnDb(update[GraphQLConfigKey]);
      } else {
        return defaultUpdate(...databaseUpdateArgs);
      }
    };
  });

  beforeEach(() => {
    databaseUpdateArgs = null;
  });

  describe('constructor', () => {
    it('should require a databaseController', () => {
      expect(() => new ParseGraphQLController()).toThrow(
        'ParseGraphQLController requires a "databaseController" to be instantiated.'
      );
      expect(() => new ParseGraphQLController({ cacheController })).toThrow(
        'ParseGraphQLController requires a "databaseController" to be instantiated.'
      );
      expect(
        () =>
          new ParseGraphQLController({
            cacheController,
            mountGraphQL: false,
          })
      ).toThrow('ParseGraphQLController requires a "databaseController" to be instantiated.');
    });
    it('should construct without a cacheController', () => {
      expect(
        () =>
          new ParseGraphQLController({
            databaseController,
          })
      ).not.toThrow();
      expect(
        () =>
          new ParseGraphQLController({
            databaseController,
            mountGraphQL: true,
          })
      ).not.toThrow();
    });
    it('should set isMounted to true if config.mountGraphQL is true', () => {
      const mountedController = new ParseGraphQLController({
        databaseController,
        mountGraphQL: true,
      });
      expect(mountedController.isMounted).toBe(true);
      const unmountedController = new ParseGraphQLController({
        databaseController,
        mountGraphQL: false,
      });
      expect(unmountedController.isMounted).toBe(false);
      const unmountedController2 = new ParseGraphQLController({
        databaseController,
      });
      expect(unmountedController2.isMounted).toBe(false);
    });
  });

  describe('getGraphQLConfig', () => {
    it('should return an empty graphQLConfig if collection has none', async () => {
      removeConfigFromDb();

      const parseGraphQLController = new ParseGraphQLController({
        databaseController,
        mountGraphQL: false,
      });

      const graphQLConfig = await parseGraphQLController.getGraphQLConfig();
      expect(graphQLConfig).toEqual({});
    });
    it('should return an existing graphQLConfig', async () => {
      setConfigOnDb({ enabledForClasses: ['_User'] });

      const parseGraphQLController = new ParseGraphQLController({
        databaseController,
        mountGraphQL: false,
      });
      const graphQLConfig = await parseGraphQLController.getGraphQLConfig();
      expect(graphQLConfig).toEqual({ enabledForClasses: ['_User'] });
    });
    it('should use the cache if mounted, and return the stored graphQLConfig', async () => {
      removeConfigFromDb();
      cacheController.graphQL.clear();
      const parseGraphQLController = new ParseGraphQLController({
        databaseController,
        cacheController,
        mountGraphQL: true,
      });
      cacheController.graphQL.put(parseGraphQLController.configCacheKey, {
        enabledForClasses: ['SuperCar'],
      });

      const graphQLConfig = await parseGraphQLController.getGraphQLConfig();
      expect(graphQLConfig).toEqual({ enabledForClasses: ['SuperCar'] });
    });
    it('should use the database when mounted and cache is empty', async () => {
      setConfigOnDb({ disabledForClasses: ['SuperCar'] });
      cacheController.graphQL.clear();
      const parseGraphQLController = new ParseGraphQLController({
        databaseController,
        cacheController,
        mountGraphQL: true,
      });
      const graphQLConfig = await parseGraphQLController.getGraphQLConfig();
      expect(graphQLConfig).toEqual({ disabledForClasses: ['SuperCar'] });
    });
    it('should store the graphQLConfig in cache if mounted', async () => {
      setConfigOnDb({ enabledForClasses: ['SuperCar'] });
      cacheController.graphQL.clear();
      const parseGraphQLController = new ParseGraphQLController({
        databaseController,
        cacheController,
        mountGraphQL: true,
      });
      const cachedValueBefore = await cacheController.graphQL.get(
        parseGraphQLController.configCacheKey
      );
      expect(cachedValueBefore).toBeNull();
      await parseGraphQLController.getGraphQLConfig();
      const cachedValueAfter = await cacheController.graphQL.get(
        parseGraphQLController.configCacheKey
      );
      expect(cachedValueAfter).toEqual({ enabledForClasses: ['SuperCar'] });
    });
  });

  describe('updateGraphQLConfig', () => {
    const successfulUpdateResponse = { response: { result: true } };

    it('should throw if graphQLConfig is not provided', async function () {
      const parseGraphQLController = new ParseGraphQLController({
        databaseController,
      });
      expectAsync(parseGraphQLController.updateGraphQLConfig()).toBeRejectedWith(
        'You must provide a graphQLConfig!'
      );
    });

    it('should correct update the graphQLConfig object using the databaseController', async () => {
      const parseGraphQLController = new ParseGraphQLController({
        databaseController,
      });
      const graphQLConfig = {
        enabledForClasses: ['ClassA', 'ClassB'],
        disabledForClasses: [],
        classConfigs: [
          { className: 'ClassA', query: { get: false } },
          { className: 'ClassB', mutation: { destroy: false }, type: {} },
        ],
      };

      await parseGraphQLController.updateGraphQLConfig(graphQLConfig);

      expect(databaseUpdateArgs).toBeTruthy();
      const [className, query, update, op] = databaseUpdateArgs;
      expect(className).toBe(GraphQLConfigClassName);
      expect(query).toEqual({ objectId: GraphQLConfigId });
      expect(update).toEqual({
        [GraphQLConfigKey]: graphQLConfig,
      });
      expect(op).toEqual({ upsert: true });
    });

    it('should throw if graphQLConfig is not an object', async () => {
      const parseGraphQLController = new ParseGraphQLController({
        databaseController,
      });
      expectAsync(parseGraphQLController.updateGraphQLConfig([])).toBeRejected();
      expectAsync(parseGraphQLController.updateGraphQLConfig(function () {})).toBeRejected();
      expectAsync(parseGraphQLController.updateGraphQLConfig(Promise.resolve({}))).toBeRejected();
      expectAsync(parseGraphQLController.updateGraphQLConfig('')).toBeRejected();
      expectAsync(parseGraphQLController.updateGraphQLConfig({})).toBeResolvedTo(
        successfulUpdateResponse
      );
    });
    it('should throw if graphQLConfig has an invalid root key', async () => {
      const parseGraphQLController = new ParseGraphQLController({
        databaseController,
      });
      expectAsync(parseGraphQLController.updateGraphQLConfig({ invalidKey: true })).toBeRejected();
      expectAsync(parseGraphQLController.updateGraphQLConfig({})).toBeResolvedTo(
        successfulUpdateResponse
      );
    });
    it('should throw if graphQLConfig has invalid class filters', async () => {
      const parseGraphQLController = new ParseGraphQLController({
        databaseController,
      });
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({ enabledForClasses: {} })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          enabledForClasses: [undefined],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          disabledForClasses: [null],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          enabledForClasses: ['_User', null],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({ disabledForClasses: [''] })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          enabledForClasses: [],
          disabledForClasses: ['_User'],
        })
      ).toBeResolvedTo(successfulUpdateResponse);
    });
    it('should throw if classConfigs array is invalid', async () => {
      const parseGraphQLController = new ParseGraphQLController({
        databaseController,
      });
      expectAsync(parseGraphQLController.updateGraphQLConfig({ classConfigs: {} })).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({ classConfigs: [null] })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [undefined],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [{ className: 'ValidClass' }, null],
        })
      ).toBeRejected();
      expectAsync(parseGraphQLController.updateGraphQLConfig({ classConfigs: [] })).toBeResolvedTo(
        successfulUpdateResponse
      );
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
            },
          ],
        })
      ).toBeResolvedTo(successfulUpdateResponse);
    });
    it('should throw if a classConfig has invalid type settings', async () => {
      const parseGraphQLController = new ParseGraphQLController({
        databaseController,
      });
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              type: [],
            },
          ],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              type: {
                invalidKey: true,
              },
            },
          ],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              type: {},
            },
          ],
        })
      ).toBeResolvedTo(successfulUpdateResponse);
    });
    it('should throw if a classConfig has invalid type.inputFields settings', async () => {
      const parseGraphQLController = new ParseGraphQLController({
        databaseController,
      });
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: 'SuperCar',
              type: {
                inputFields: [],
              },
            },
          ],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: 'SuperCar',
              type: {
                inputFields: {
                  invalidKey: true,
                },
              },
            },
          ],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: 'SuperCar',
              type: {
                inputFields: {
                  create: {},
                },
              },
            },
          ],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: 'SuperCar',
              type: {
                inputFields: {
                  update: [null],
                },
              },
            },
          ],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: 'SuperCar',
              type: {
                inputFields: {
                  create: [],
                  update: [],
                },
              },
            },
          ],
        })
      ).toBeResolvedTo(successfulUpdateResponse);
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: 'SuperCar',
              type: {
                inputFields: {
                  create: ['make', 'model'],
                  update: [],
                },
              },
            },
          ],
        })
      ).toBeResolvedTo(successfulUpdateResponse);
    });
    it('should throw if a classConfig has invalid type.outputFields settings', async () => {
      const parseGraphQLController = new ParseGraphQLController({
        databaseController,
      });
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              type: {
                outputFields: {},
              },
            },
          ],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              type: {
                outputFields: [null],
              },
            },
          ],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              type: {
                outputFields: ['name', undefined],
              },
            },
          ],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              type: {
                outputFields: [''],
              },
            },
          ],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              type: {
                outputFields: [],
              },
            },
          ],
        })
      ).toBeResolvedTo(successfulUpdateResponse);
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              type: {
                outputFields: ['name'],
              },
            },
          ],
        })
      ).toBeResolvedTo(successfulUpdateResponse);
    });
    it('should throw if a classConfig has invalid type.constraintFields settings', async () => {
      const parseGraphQLController = new ParseGraphQLController({
        databaseController,
      });
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              type: {
                constraintFields: {},
              },
            },
          ],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              type: {
                constraintFields: [null],
              },
            },
          ],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              type: {
                constraintFields: ['name', undefined],
              },
            },
          ],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              type: {
                constraintFields: [''],
              },
            },
          ],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              type: {
                constraintFields: [],
              },
            },
          ],
        })
      ).toBeResolvedTo(successfulUpdateResponse);
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              type: {
                constraintFields: ['name'],
              },
            },
          ],
        })
      ).toBeResolvedTo(successfulUpdateResponse);
    });
    it('should throw if a classConfig has invalid type.sortFields settings', async () => {
      const parseGraphQLController = new ParseGraphQLController({
        databaseController,
      });
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              type: {
                sortFields: {},
              },
            },
          ],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              type: {
                sortFields: [null],
              },
            },
          ],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              type: {
                sortFields: [
                  {
                    field: undefined,
                    asc: true,
                    desc: true,
                  },
                ],
              },
            },
          ],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              type: {
                sortFields: [
                  {
                    field: '',
                    asc: true,
                    desc: false,
                  },
                ],
              },
            },
          ],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              type: {
                sortFields: [
                  {
                    field: 'name',
                    asc: true,
                    desc: 'false',
                  },
                ],
              },
            },
          ],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              type: {
                sortFields: [
                  {
                    field: 'name',
                    asc: true,
                    desc: true,
                  },
                  null,
                ],
              },
            },
          ],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              type: {
                sortFields: [],
              },
            },
          ],
        })
      ).toBeResolvedTo(successfulUpdateResponse);
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              type: {
                sortFields: [
                  {
                    field: 'name',
                    asc: true,
                    desc: true,
                  },
                ],
              },
            },
          ],
        })
      ).toBeResolvedTo(successfulUpdateResponse);
    });
    it('should throw if a classConfig has invalid query params', async () => {
      const parseGraphQLController = new ParseGraphQLController({
        databaseController,
      });
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              query: [],
            },
          ],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              query: {
                invalidKey: true,
              },
            },
          ],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              query: {
                get: 1,
              },
            },
          ],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              query: {
                find: 'true',
              },
            },
          ],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              query: {
                get: false,
                find: true,
              },
            },
          ],
        })
      ).toBeResolvedTo(successfulUpdateResponse);
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              query: {},
            },
          ],
        })
      ).toBeResolvedTo(successfulUpdateResponse);
    });
    it('should throw if a classConfig has invalid mutation params', async () => {
      const parseGraphQLController = new ParseGraphQLController({
        databaseController,
      });
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              mutation: [],
            },
          ],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              mutation: {
                invalidKey: true,
              },
            },
          ],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              mutation: {
                destroy: 1,
              },
            },
          ],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              mutation: {
                update: 'true',
              },
            },
          ],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              mutation: {},
            },
          ],
        })
      ).toBeResolvedTo(successfulUpdateResponse);
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              mutation: {
                create: true,
                update: true,
                destroy: false,
              },
            },
          ],
        })
      ).toBeResolvedTo(successfulUpdateResponse);
    });

    it('should throw if _User create fields is missing username or password', async () => {
      const parseGraphQLController = new ParseGraphQLController({
        databaseController,
      });
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              type: {
                inputFields: {
                  create: ['username', 'no-password'],
                },
              },
            },
          ],
        })
      ).toBeRejected();
      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className: '_User',
              type: {
                inputFields: {
                  create: ['username', 'password'],
                },
              },
            },
          ],
        })
      ).toBeResolved(successfulUpdateResponse);
    });
    it('should update the cache if mounted', async () => {
      removeConfigFromDb();
      cacheController.graphQL.clear();
      const mountedController = new ParseGraphQLController({
        databaseController,
        cacheController,
        mountGraphQL: true,
      });
      const unmountedController = new ParseGraphQLController({
        databaseController,
        cacheController,
        mountGraphQL: false,
      });

      let cacheBeforeValue;
      let cacheAfterValue;

      cacheBeforeValue = await cacheController.graphQL.get(mountedController.configCacheKey);
      expect(cacheBeforeValue).toBeNull();

      await mountedController.updateGraphQLConfig({
        enabledForClasses: ['SuperCar'],
      });
      cacheAfterValue = await cacheController.graphQL.get(mountedController.configCacheKey);
      expect(cacheAfterValue).toEqual({ enabledForClasses: ['SuperCar'] });

      // reset
      removeConfigFromDb();
      cacheController.graphQL.clear();

      cacheBeforeValue = await cacheController.graphQL.get(unmountedController.configCacheKey);
      expect(cacheBeforeValue).toBeNull();

      await unmountedController.updateGraphQLConfig({
        enabledForClasses: ['SuperCar'],
      });
      cacheAfterValue = await cacheController.graphQL.get(unmountedController.configCacheKey);
      expect(cacheAfterValue).toBeNull();
    });
  });

  describe('alias', () => {
    it('should fail if query alias is not a string', async () => {
      const parseGraphQLController = new ParseGraphQLController({
        databaseController,
      });

      const className = 'Bar';

      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className,
              query: {
                get: true,
                getAlias: 1,
              },
            },
          ],
        })
      ).toBeRejected(
        `Invalid graphQLConfig: classConfig:${className} is invalid because "query.getAlias" must be a string`
      );

      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className,
              query: {
                find: true,
                findAlias: { not: 'valid' },
              },
            },
          ],
        })
      ).toBeRejected(
        `Invalid graphQLConfig: classConfig:${className} is invalid because "query.findAlias" must be a string`
      );
    });

    it('should fail if mutation alias is not a string', async () => {
      const parseGraphQLController = new ParseGraphQLController({
        databaseController,
      });

      const className = 'Bar';

      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className,
              mutation: {
                create: true,
                createAlias: true,
              },
            },
          ],
        })
      ).toBeRejected(
        `Invalid graphQLConfig: classConfig:${className} is invalid because "mutation.createAlias" must be a string`
      );

      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className,
              mutation: {
                update: true,
                updateAlias: 1,
              },
            },
          ],
        })
      ).toBeRejected(
        `Invalid graphQLConfig: classConfig:${className} is invalid because "mutation.updateAlias" must be a string`
      );

      expectAsync(
        parseGraphQLController.updateGraphQLConfig({
          classConfigs: [
            {
              className,
              mutation: {
                destroy: true,
                destroyAlias: { not: 'valid' },
              },
            },
          ],
        })
      ).toBeRejected(
        `Invalid graphQLConfig: classConfig:${className} is invalid because "mutation.destroyAlias" must be a string`
      );
    });
  });
});
