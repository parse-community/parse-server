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
});
