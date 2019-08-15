const { GraphQLObjectType } = require('graphql');
const defaultLogger = require('../lib/logger').default;
const { ParseGraphQLSchema } = require('../lib/GraphQL/ParseGraphQLSchema');

describe('ParseGraphQLSchema', () => {
  let parseServer;
  let databaseController;
  let parseGraphQLController;
  let parseGraphQLSchema;

  beforeAll(async () => {
    parseServer = await global.reconfigureServer({
      schemaCacheTTL: 100,
    });
    databaseController = parseServer.config.databaseController;
    parseGraphQLController = parseServer.config.parseGraphQLController;
    parseGraphQLSchema = new ParseGraphQLSchema({
      databaseController,
      parseGraphQLController,
      log: defaultLogger,
    });
  });

  describe('constructor', () => {
    it('should require a parseGraphQLController, databaseController and a log instance', () => {
      expect(() => new ParseGraphQLSchema()).toThrow(
        'You must provide a parseGraphQLController instance!'
      );
      expect(
        () => new ParseGraphQLSchema({ parseGraphQLController: {} })
      ).toThrow('You must provide a databaseController instance!');
      expect(
        () =>
          new ParseGraphQLSchema({
            parseGraphQLController: {},
            databaseController: {},
          })
      ).toThrow('You must provide a log instance!');
    });
  });

  describe('load', () => {
    it('should cache schema', async () => {
      const graphQLSchema = await parseGraphQLSchema.load();
      const updatedGraphQLSchema = await parseGraphQLSchema.load();
      expect(graphQLSchema).toBe(updatedGraphQLSchema);
      await new Promise(resolve => setTimeout(resolve, 200));
      expect(graphQLSchema).toBe(await parseGraphQLSchema.load());
    });

    it('should load a brand new GraphQL Schema if Parse Schema changes', async () => {
      await parseGraphQLSchema.load();
      const parseClasses = parseGraphQLSchema.parseClasses;
      const parseClassesString = parseGraphQLSchema.parseClassesString;
      const parseClassTypes = parseGraphQLSchema.parseClassTypes;
      const graphQLSchema = parseGraphQLSchema.graphQLSchema;
      const graphQLTypes = parseGraphQLSchema.graphQLTypes;
      const graphQLQueries = parseGraphQLSchema.graphQLQueries;
      const graphQLMutations = parseGraphQLSchema.graphQLMutations;
      const graphQLSubscriptions = parseGraphQLSchema.graphQLSubscriptions;
      const newClassObject = new Parse.Object('NewClass');
      await newClassObject.save();
      await databaseController.schemaCache.clear();
      await new Promise(resolve => setTimeout(resolve, 200));
      await parseGraphQLSchema.load();
      expect(parseClasses).not.toBe(parseGraphQLSchema.parseClasses);
      expect(parseClassesString).not.toBe(
        parseGraphQLSchema.parseClassesString
      );
      expect(parseClassTypes).not.toBe(parseGraphQLSchema.parseClassTypes);
      expect(graphQLSchema).not.toBe(parseGraphQLSchema.graphQLSchema);
      expect(graphQLTypes).not.toBe(parseGraphQLSchema.graphQLTypes);
      expect(graphQLQueries).not.toBe(parseGraphQLSchema.graphQLQueries);
      expect(graphQLMutations).not.toBe(parseGraphQLSchema.graphQLMutations);
      expect(graphQLSubscriptions).not.toBe(
        parseGraphQLSchema.graphQLSubscriptions
      );
    });

    it('should load a brand new GraphQL Schema if graphQLConfig changes', async () => {
      const parseGraphQLController = {
        graphQLConfig: { enabledForClasses: [] },
        getGraphQLConfig() {
          return this.graphQLConfig;
        },
      };
      const parseGraphQLSchema = new ParseGraphQLSchema({
        databaseController,
        parseGraphQLController,
        log: defaultLogger,
      });
      await parseGraphQLSchema.load();
      const parseClasses = parseGraphQLSchema.parseClasses;
      const parseClassesString = parseGraphQLSchema.parseClassesString;
      const parseClassTypes = parseGraphQLSchema.parseClassTypes;
      const graphQLSchema = parseGraphQLSchema.graphQLSchema;
      const graphQLTypes = parseGraphQLSchema.graphQLTypes;
      const graphQLQueries = parseGraphQLSchema.graphQLQueries;
      const graphQLMutations = parseGraphQLSchema.graphQLMutations;
      const graphQLSubscriptions = parseGraphQLSchema.graphQLSubscriptions;

      parseGraphQLController.graphQLConfig = {
        enabledForClasses: ['_User'],
      };

      await new Promise(resolve => setTimeout(resolve, 200));
      await parseGraphQLSchema.load();
      expect(parseClasses).not.toBe(parseGraphQLSchema.parseClasses);
      expect(parseClassesString).not.toBe(
        parseGraphQLSchema.parseClassesString
      );
      expect(parseClassTypes).not.toBe(parseGraphQLSchema.parseClassTypes);
      expect(graphQLSchema).not.toBe(parseGraphQLSchema.graphQLSchema);
      expect(graphQLTypes).not.toBe(parseGraphQLSchema.graphQLTypes);
      expect(graphQLQueries).not.toBe(parseGraphQLSchema.graphQLQueries);
      expect(graphQLMutations).not.toBe(parseGraphQLSchema.graphQLMutations);
      expect(graphQLSubscriptions).not.toBe(
        parseGraphQLSchema.graphQLSubscriptions
      );
    });
  });

  describe('addGraphQLType', () => {
    it('should not load and warn duplicated types', async () => {
      let logged = false;
      const parseGraphQLSchema = new ParseGraphQLSchema({
        databaseController,
        parseGraphQLController,
        log: {
          warn: message => {
            logged = true;
            expect(message).toEqual(
              'Type SomeClass could not be added to the auto schema because it collided with an existing type.'
            );
          },
        },
      });
      await parseGraphQLSchema.load();
      const type = new GraphQLObjectType({ name: 'SomeClass' });
      expect(parseGraphQLSchema.addGraphQLType(type)).toBe(type);
      expect(parseGraphQLSchema.graphQLTypes).toContain(type);
      expect(
        parseGraphQLSchema.addGraphQLType(
          new GraphQLObjectType({ name: 'SomeClass' })
        )
      ).toBeUndefined();
      expect(logged).toBeTruthy();
    });

    it('should throw error when required', async () => {
      const parseGraphQLSchema = new ParseGraphQLSchema({
        databaseController,
        parseGraphQLController,
        log: {
          warn: () => {
            fail('Should not warn');
          },
        },
      });
      await parseGraphQLSchema.load();
      const type = new GraphQLObjectType({ name: 'SomeClass' });
      expect(parseGraphQLSchema.addGraphQLType(type, true)).toBe(type);
      expect(parseGraphQLSchema.graphQLTypes).toContain(type);
      expect(() =>
        parseGraphQLSchema.addGraphQLType(
          new GraphQLObjectType({ name: 'SomeClass' }),
          true
        )
      ).toThrowError(
        'Type SomeClass could not be added to the auto schema because it collided with an existing type.'
      );
    });

    it('should warn reserved name collision', async () => {
      let logged = false;
      const parseGraphQLSchema = new ParseGraphQLSchema({
        databaseController,
        parseGraphQLController,
        log: {
          warn: message => {
            logged = true;
            expect(message).toEqual(
              'Type String could not be added to the auto schema because it collided with an existing type.'
            );
          },
        },
      });
      await parseGraphQLSchema.load();
      expect(
        parseGraphQLSchema.addGraphQLType(
          new GraphQLObjectType({ name: 'String' })
        )
      ).toBeUndefined();
      expect(logged).toBeTruthy();
    });

    it('should ignore collision when necessary', async () => {
      const parseGraphQLSchema = new ParseGraphQLSchema({
        databaseController,
        parseGraphQLController,
        log: {
          warn: () => {
            fail('Should not warn');
          },
        },
      });
      await parseGraphQLSchema.load();
      const type = new GraphQLObjectType({ name: 'String' });
      expect(parseGraphQLSchema.addGraphQLType(type, true, true)).toBe(type);
      expect(parseGraphQLSchema.graphQLTypes).toContain(type);
    });
  });

  describe('addGraphQLObjectQuery', () => {
    it('should not load and warn duplicated queries', async () => {
      let logged = false;
      const parseGraphQLSchema = new ParseGraphQLSchema({
        databaseController,
        parseGraphQLController,
        log: {
          warn: message => {
            logged = true;
            expect(message).toEqual(
              'Object query someClasses could not be added to the auto schema because it collided with an existing field.'
            );
          },
        },
      });
      await parseGraphQLSchema.load();
      const field = {};
      expect(
        parseGraphQLSchema.addGraphQLObjectQuery('someClasses', field)
      ).toBe(field);
      expect(parseGraphQLSchema.graphQLObjectsQueries['someClasses']).toBe(
        field
      );
      expect(
        parseGraphQLSchema.addGraphQLObjectQuery('someClasses', {})
      ).toBeUndefined();
      expect(logged).toBeTruthy();
    });

    it('should throw error when required', async () => {
      const parseGraphQLSchema = new ParseGraphQLSchema({
        databaseController,
        parseGraphQLController,
        log: {
          warn: () => {
            fail('Should not warn');
          },
        },
      });
      await parseGraphQLSchema.load();
      const field = {};
      expect(
        parseGraphQLSchema.addGraphQLObjectQuery('someClasses', field)
      ).toBe(field);
      expect(parseGraphQLSchema.graphQLObjectsQueries['someClasses']).toBe(
        field
      );
      expect(() =>
        parseGraphQLSchema.addGraphQLObjectQuery('someClasses', {}, true)
      ).toThrowError(
        'Object query someClasses could not be added to the auto schema because it collided with an existing field.'
      );
    });

    it('should warn reserved name collision', async () => {
      let logged = false;
      const parseGraphQLSchema = new ParseGraphQLSchema({
        databaseController,
        parseGraphQLController,
        log: {
          warn: message => {
            logged = true;
            expect(message).toEqual(
              'Object query get could not be added to the auto schema because it collided with an existing field.'
            );
          },
        },
      });
      await parseGraphQLSchema.load();
      expect(
        parseGraphQLSchema.addGraphQLObjectQuery('get', {})
      ).toBeUndefined();
      expect(logged).toBeTruthy();
    });

    it('should ignore collision when necessary', async () => {
      const parseGraphQLSchema = new ParseGraphQLSchema({
        databaseController,
        parseGraphQLController,
        log: {
          warn: () => {
            fail('Should not warn');
          },
        },
      });
      await parseGraphQLSchema.load();
      delete parseGraphQLSchema.graphQLObjectsQueries.get;
      const field = {};
      expect(
        parseGraphQLSchema.addGraphQLObjectQuery('get', field, true, true)
      ).toBe(field);
      expect(parseGraphQLSchema.graphQLObjectsQueries['get']).toBe(field);
    });
  });

  describe('addGraphQLObjectMutation', () => {
    it('should not load and warn duplicated mutations', async () => {
      let logged = false;
      const parseGraphQLSchema = new ParseGraphQLSchema({
        databaseController,
        parseGraphQLController,
        log: {
          warn: message => {
            logged = true;
            expect(message).toEqual(
              'Object mutation createSomeClass could not be added to the auto schema because it collided with an existing field.'
            );
          },
        },
      });
      await parseGraphQLSchema.load();
      const field = {};
      expect(
        parseGraphQLSchema.addGraphQLObjectMutation('createSomeClass', field)
      ).toBe(field);
      expect(
        parseGraphQLSchema.graphQLObjectsMutations['createSomeClass']
      ).toBe(field);
      expect(
        parseGraphQLSchema.addGraphQLObjectMutation('createSomeClass', {})
      ).toBeUndefined();
      expect(logged).toBeTruthy();
    });

    it('should throw error when required', async () => {
      const parseGraphQLSchema = new ParseGraphQLSchema({
        databaseController,
        parseGraphQLController,
        log: {
          warn: () => {
            fail('Should not warn');
          },
        },
      });
      await parseGraphQLSchema.load();
      const field = {};
      expect(
        parseGraphQLSchema.addGraphQLObjectMutation('createSomeClass', field)
      ).toBe(field);
      expect(
        parseGraphQLSchema.graphQLObjectsMutations['createSomeClass']
      ).toBe(field);
      expect(() =>
        parseGraphQLSchema.addGraphQLObjectMutation('createSomeClass', {}, true)
      ).toThrowError(
        'Object mutation createSomeClass could not be added to the auto schema because it collided with an existing field.'
      );
    });

    it('should warn reserved name collision', async () => {
      let logged = false;
      const parseGraphQLSchema = new ParseGraphQLSchema({
        databaseController,
        parseGraphQLController,
        log: {
          warn: message => {
            logged = true;
            expect(message).toEqual(
              'Object mutation create could not be added to the auto schema because it collided with an existing field.'
            );
          },
        },
      });
      await parseGraphQLSchema.load();
      expect(
        parseGraphQLSchema.addGraphQLObjectMutation('create', {})
      ).toBeUndefined();
      expect(logged).toBeTruthy();
    });

    it('should ignore collision when necessary', async () => {
      const parseGraphQLSchema = new ParseGraphQLSchema({
        databaseController,
        parseGraphQLController,
        log: {
          warn: () => {
            fail('Should not warn');
          },
        },
      });
      await parseGraphQLSchema.load();
      delete parseGraphQLSchema.graphQLObjectsMutations.create;
      const field = {};
      expect(
        parseGraphQLSchema.addGraphQLObjectMutation('create', field, true, true)
      ).toBe(field);
      expect(parseGraphQLSchema.graphQLObjectsMutations['create']).toBe(field);
    });
  });

  describe('_getParseClassesWithConfig', () => {
    it('should sort classes', () => {
      const parseGraphQLSchema = new ParseGraphQLSchema({
        databaseController,
        parseGraphQLController,
        log: {
          warn: () => {
            fail('Should not warn');
          },
        },
      });
      expect(
        parseGraphQLSchema
          ._getParseClassesWithConfig(
            [
              { className: 'b' },
              { className: '_b' },
              { className: 'B' },
              { className: '_B' },
              { className: 'a' },
              { className: '_a' },
              { className: 'A' },
              { className: '_A' },
            ],
            {
              classConfigs: [],
            }
          )
          .map(item => item[0])
      ).toEqual([
        { className: '_A' },
        { className: '_B' },
        { className: '_a' },
        { className: '_b' },
        { className: 'A' },
        { className: 'B' },
        { className: 'a' },
        { className: 'b' },
      ]);
    });
  });
});
