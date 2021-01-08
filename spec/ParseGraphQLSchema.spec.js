const { GraphQLObjectType } = require('graphql');
const defaultLogger = require('../lib/logger').default;
const { ParseGraphQLSchema } = require('../lib/GraphQL/ParseGraphQLSchema');

describe('ParseGraphQLSchema', () => {
  let parseServer;
  let databaseController;
  let parseGraphQLController;
  let parseGraphQLSchema;
  const appId = 'test';

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
      appId,
    });
  });

  describe('constructor', () => {
    it('should require a parseGraphQLController, databaseController, a log instance, and the appId', () => {
      expect(() => new ParseGraphQLSchema()).toThrow(
        'You must provide a parseGraphQLController instance!'
      );
      expect(() => new ParseGraphQLSchema({ parseGraphQLController: {} })).toThrow(
        'You must provide a databaseController instance!'
      );
      expect(
        () =>
          new ParseGraphQLSchema({
            parseGraphQLController: {},
            databaseController: {},
          })
      ).toThrow('You must provide a log instance!');
      expect(
        () =>
          new ParseGraphQLSchema({
            parseGraphQLController: {},
            databaseController: {},
            log: {},
          })
      ).toThrow('You must provide the appId!');
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
      expect(parseClassesString).not.toBe(parseGraphQLSchema.parseClassesString);
      expect(parseClassTypes).not.toBe(parseGraphQLSchema.parseClassTypes);
      expect(graphQLSchema).not.toBe(parseGraphQLSchema.graphQLSchema);
      expect(graphQLTypes).not.toBe(parseGraphQLSchema.graphQLTypes);
      expect(graphQLQueries).not.toBe(parseGraphQLSchema.graphQLQueries);
      expect(graphQLMutations).not.toBe(parseGraphQLSchema.graphQLMutations);
      expect(graphQLSubscriptions).not.toBe(parseGraphQLSchema.graphQLSubscriptions);
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
        appId,
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
      expect(parseClassesString).not.toBe(parseGraphQLSchema.parseClassesString);
      expect(parseClassTypes).not.toBe(parseGraphQLSchema.parseClassTypes);
      expect(graphQLSchema).not.toBe(parseGraphQLSchema.graphQLSchema);
      expect(graphQLTypes).not.toBe(parseGraphQLSchema.graphQLTypes);
      expect(graphQLQueries).not.toBe(parseGraphQLSchema.graphQLQueries);
      expect(graphQLMutations).not.toBe(parseGraphQLSchema.graphQLMutations);
      expect(graphQLSubscriptions).not.toBe(parseGraphQLSchema.graphQLSubscriptions);
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
        appId,
      });
      await parseGraphQLSchema.load();
      const type = new GraphQLObjectType({ name: 'SomeClass' });
      expect(parseGraphQLSchema.addGraphQLType(type)).toBe(type);
      expect(parseGraphQLSchema.graphQLTypes).toContain(type);
      expect(
        parseGraphQLSchema.addGraphQLType(new GraphQLObjectType({ name: 'SomeClass' }))
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
        appId,
      });
      await parseGraphQLSchema.load();
      const type = new GraphQLObjectType({ name: 'SomeClass' });
      expect(parseGraphQLSchema.addGraphQLType(type, true)).toBe(type);
      expect(parseGraphQLSchema.graphQLTypes).toContain(type);
      expect(() =>
        parseGraphQLSchema.addGraphQLType(new GraphQLObjectType({ name: 'SomeClass' }), true)
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
        appId,
      });
      await parseGraphQLSchema.load();
      expect(
        parseGraphQLSchema.addGraphQLType(new GraphQLObjectType({ name: 'String' }))
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
        appId,
      });
      await parseGraphQLSchema.load();
      const type = new GraphQLObjectType({ name: 'String' });
      expect(parseGraphQLSchema.addGraphQLType(type, true, true)).toBe(type);
      expect(parseGraphQLSchema.graphQLTypes).toContain(type);
    });
  });

  describe('addGraphQLQuery', () => {
    it('should not load and warn duplicated queries', async () => {
      let logged = false;
      const parseGraphQLSchema = new ParseGraphQLSchema({
        databaseController,
        parseGraphQLController,
        log: {
          warn: message => {
            logged = true;
            expect(message).toEqual(
              'Query someClasses could not be added to the auto schema because it collided with an existing field.'
            );
          },
        },
        appId,
      });
      await parseGraphQLSchema.load();
      const field = {};
      expect(parseGraphQLSchema.addGraphQLQuery('someClasses', field)).toBe(field);
      expect(parseGraphQLSchema.graphQLQueries['someClasses']).toBe(field);
      expect(parseGraphQLSchema.addGraphQLQuery('someClasses', {})).toBeUndefined();
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
        appId,
      });
      await parseGraphQLSchema.load();
      const field = {};
      expect(parseGraphQLSchema.addGraphQLQuery('someClasses', field)).toBe(field);
      expect(parseGraphQLSchema.graphQLQueries['someClasses']).toBe(field);
      expect(() => parseGraphQLSchema.addGraphQLQuery('someClasses', {}, true)).toThrowError(
        'Query someClasses could not be added to the auto schema because it collided with an existing field.'
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
              'Query viewer could not be added to the auto schema because it collided with an existing field.'
            );
          },
        },
        appId,
      });
      await parseGraphQLSchema.load();
      expect(parseGraphQLSchema.addGraphQLQuery('viewer', {})).toBeUndefined();
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
        appId,
      });
      await parseGraphQLSchema.load();
      delete parseGraphQLSchema.graphQLQueries.viewer;
      const field = {};
      expect(parseGraphQLSchema.addGraphQLQuery('viewer', field, true, true)).toBe(field);
      expect(parseGraphQLSchema.graphQLQueries['viewer']).toBe(field);
    });
  });

  describe('addGraphQLMutation', () => {
    it('should not load and warn duplicated mutations', async () => {
      let logged = false;
      const parseGraphQLSchema = new ParseGraphQLSchema({
        databaseController,
        parseGraphQLController,
        log: {
          warn: message => {
            logged = true;
            expect(message).toEqual(
              'Mutation createSomeClass could not be added to the auto schema because it collided with an existing field.'
            );
          },
        },
        appId,
      });
      await parseGraphQLSchema.load();
      const field = {};
      expect(parseGraphQLSchema.addGraphQLMutation('createSomeClass', field)).toBe(field);
      expect(parseGraphQLSchema.graphQLMutations['createSomeClass']).toBe(field);
      expect(parseGraphQLSchema.addGraphQLMutation('createSomeClass', {})).toBeUndefined();
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
        appId,
      });
      await parseGraphQLSchema.load();
      const field = {};
      expect(parseGraphQLSchema.addGraphQLMutation('createSomeClass', field)).toBe(field);
      expect(parseGraphQLSchema.graphQLMutations['createSomeClass']).toBe(field);
      expect(() => parseGraphQLSchema.addGraphQLMutation('createSomeClass', {}, true)).toThrowError(
        'Mutation createSomeClass could not be added to the auto schema because it collided with an existing field.'
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
              'Mutation signUp could not be added to the auto schema because it collided with an existing field.'
            );
          },
        },
        appId,
      });
      await parseGraphQLSchema.load();
      expect(parseGraphQLSchema.addGraphQLMutation('signUp', {})).toBeUndefined();
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
        appId,
      });
      await parseGraphQLSchema.load();
      delete parseGraphQLSchema.graphQLMutations.signUp;
      const field = {};
      expect(parseGraphQLSchema.addGraphQLMutation('signUp', field, true, true)).toBe(field);
      expect(parseGraphQLSchema.graphQLMutations['signUp']).toBe(field);
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
        appId,
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

  describe('name collision', () => {
    it('should not generate duplicate types when colliding to default classes', async () => {
      const parseGraphQLSchema = new ParseGraphQLSchema({
        databaseController,
        parseGraphQLController,
        log: defaultLogger,
        appId,
      });
      await parseGraphQLSchema.databaseController.schemaCache.clear();
      const schema1 = await parseGraphQLSchema.load();
      const types1 = parseGraphQLSchema.graphQLTypes;
      const queries1 = parseGraphQLSchema.graphQLQueries;
      const mutations1 = parseGraphQLSchema.graphQLMutations;
      const user = new Parse.Object('User');
      await user.save();
      await parseGraphQLSchema.databaseController.schemaCache.clear();
      const schema2 = await parseGraphQLSchema.load();
      const types2 = parseGraphQLSchema.graphQLTypes;
      const queries2 = parseGraphQLSchema.graphQLQueries;
      const mutations2 = parseGraphQLSchema.graphQLMutations;
      expect(schema1).not.toBe(schema2);
      expect(types1).not.toBe(types2);
      expect(types1.map(type => type.name).sort()).toEqual(types2.map(type => type.name).sort());
      expect(queries1).not.toBe(queries2);
      expect(Object.keys(queries1).sort()).toEqual(Object.keys(queries2).sort());
      expect(mutations1).not.toBe(mutations2);
      expect(Object.keys(mutations1).sort()).toEqual(Object.keys(mutations2).sort());
    });

    it('should not generate duplicate types when colliding the same name', async () => {
      const parseGraphQLSchema = new ParseGraphQLSchema({
        databaseController,
        parseGraphQLController,
        log: defaultLogger,
        appId,
      });
      const car1 = new Parse.Object('Car');
      await car1.save();
      await parseGraphQLSchema.databaseController.schemaCache.clear();
      const schema1 = await parseGraphQLSchema.load();
      const types1 = parseGraphQLSchema.graphQLTypes;
      const queries1 = parseGraphQLSchema.graphQLQueries;
      const mutations1 = parseGraphQLSchema.graphQLMutations;
      const car2 = new Parse.Object('car');
      await car2.save();
      await parseGraphQLSchema.databaseController.schemaCache.clear();
      const schema2 = await parseGraphQLSchema.load();
      const types2 = parseGraphQLSchema.graphQLTypes;
      const queries2 = parseGraphQLSchema.graphQLQueries;
      const mutations2 = parseGraphQLSchema.graphQLMutations;
      expect(schema1).not.toBe(schema2);
      expect(types1).not.toBe(types2);
      expect(types1.map(type => type.name).sort()).toEqual(types2.map(type => type.name).sort());
      expect(queries1).not.toBe(queries2);
      expect(Object.keys(queries1).sort()).toEqual(Object.keys(queries2).sort());
      expect(mutations1).not.toBe(mutations2);
      expect(Object.keys(mutations1).sort()).toEqual(Object.keys(mutations2).sort());
    });

    it('should not generate duplicate queries when query name collide', async () => {
      const parseGraphQLSchema = new ParseGraphQLSchema({
        databaseController,
        parseGraphQLController,
        log: defaultLogger,
        appId,
      });
      const car = new Parse.Object('Car');
      await car.save();
      await parseGraphQLSchema.databaseController.schemaCache.clear();
      const schema1 = await parseGraphQLSchema.load();
      const queries1 = parseGraphQLSchema.graphQLQueries;
      const mutations1 = parseGraphQLSchema.graphQLMutations;
      const cars = new Parse.Object('cars');
      await cars.save();
      await parseGraphQLSchema.databaseController.schemaCache.clear();
      const schema2 = await parseGraphQLSchema.load();
      const queries2 = parseGraphQLSchema.graphQLQueries;
      const mutations2 = parseGraphQLSchema.graphQLMutations;
      expect(schema1).not.toBe(schema2);
      expect(queries1).not.toBe(queries2);
      expect(Object.keys(queries1).sort()).toEqual(Object.keys(queries2).sort());
      expect(mutations1).not.toBe(mutations2);
      expect(
        Object.keys(mutations1).concat('createCars', 'updateCars', 'deleteCars').sort()
      ).toEqual(Object.keys(mutations2).sort());
    });
  });
  describe('alias', () => {
    it('Should be able to define alias for get and find query', async () => {
      const parseGraphQLSchema = new ParseGraphQLSchema({
        databaseController,
        parseGraphQLController,
        log: defaultLogger,
        appId,
      });

      await parseGraphQLSchema.parseGraphQLController.updateGraphQLConfig({
        classConfigs: [
          {
            className: 'Data',
            query: {
              get: true,
              getAlias: 'precious_data',
              find: true,
              findAlias: 'data_results',
            },
          },
        ],
      });

      const data = new Parse.Object('Data');

      await data.save();

      await parseGraphQLSchema.databaseController.schemaCache.clear();
      await parseGraphQLSchema.load();

      const queries1 = parseGraphQLSchema.graphQLQueries;

      expect(Object.keys(queries1)).toContain('data_results');
      expect(Object.keys(queries1)).toContain('precious_data');
    });

    it('Should be able to define alias for mutation', async () => {
      const parseGraphQLSchema = new ParseGraphQLSchema({
        databaseController,
        parseGraphQLController,
        log: defaultLogger,
        appId,
      });

      await parseGraphQLSchema.parseGraphQLController.updateGraphQLConfig({
        classConfigs: [
          {
            className: 'Track',
            mutation: {
              create: true,
              createAlias: 'addTrack',
              update: true,
              updateAlias: 'modifyTrack',
              destroy: true,
              destroyAlias: 'eraseTrack',
            },
          },
        ],
      });

      const data = new Parse.Object('Track');

      await data.save();

      await parseGraphQLSchema.databaseController.schemaCache.clear();
      await parseGraphQLSchema.load();

      const mutations = parseGraphQLSchema.graphQLMutations;

      expect(Object.keys(mutations)).toContain('addTrack');
      expect(Object.keys(mutations)).toContain('modifyTrack');
      expect(Object.keys(mutations)).toContain('eraseTrack');
    });
  });
});
