const defaultLogger = require('../lib/logger').default;
const { ParseGraphQLSchema } = require('../lib/GraphQL/ParseGraphQLSchema');

describe('ParseGraphQLSchema', () => {
  let parseServer;
  let databaseController;
  let parseGraphQLSchema;

  beforeAll(async () => {
    parseServer = await global.reconfigureServer({
      schemaCacheTTL: 100,
    });
    databaseController = parseServer.config.databaseController;
    parseGraphQLSchema = new ParseGraphQLSchema(
      databaseController,
      defaultLogger
    );
  });

  describe('constructor', () => {
    it('should require a databaseController and a log instance', () => {
      expect(() => new ParseGraphQLSchema()).toThrow(
        'You must provide a databaseController instance!'
      );
      expect(() => new ParseGraphQLSchema({})).toThrow(
        'You must provide a log instance!'
      );
      expect(() => new ParseGraphQLSchema({}, {})).not.toThrow();
    });
  });

  describe('load', () => {
    it('should cache schema', async () => {
      const graphQLSchema = await parseGraphQLSchema.load();
      expect(graphQLSchema).toBe(await parseGraphQLSchema.load());
      await new Promise(resolve => setTimeout(resolve, 200));
      expect(graphQLSchema).toBe(await parseGraphQLSchema.load());
    });

    it('should load a brand new GraphQL Schema if Parse Schema changes', async () => {
      await parseGraphQLSchema.load();
      const parseClasses = parseGraphQLSchema.parseClasses;
      const parseClassesString = parseGraphQLSchema.parseClasses;
      const parseClassTypes = parseGraphQLSchema.parseClasses;
      const graphQLSchema = parseGraphQLSchema.parseClasses;
      const graphQLTypes = parseGraphQLSchema.parseClasses;
      const graphQLQueries = parseGraphQLSchema.parseClasses;
      const graphQLMutations = parseGraphQLSchema.parseClasses;
      const graphQLSubscriptions = parseGraphQLSchema.parseClasses;
      const newClassObject = new Parse.Object('NewClass');
      await newClassObject.save();
      await databaseController.schemaCache.clear();
      await new Promise(resolve => setTimeout(resolve, 200));
      await parseGraphQLSchema.load();
      expect(parseClasses).not.toBe(parseGraphQLSchema.parseClasses);
      expect(parseClassesString).not.toBe(parseGraphQLSchema.parseClasses);
      expect(parseClassTypes).not.toBe(parseGraphQLSchema.parseClasses);
      expect(graphQLSchema).not.toBe(parseGraphQLSchema.parseClasses);
      expect(graphQLTypes).not.toBe(parseGraphQLSchema.parseClasses);
      expect(graphQLQueries).not.toBe(parseGraphQLSchema.parseClasses);
      expect(graphQLMutations).not.toBe(parseGraphQLSchema.parseClasses);
      expect(graphQLSubscriptions).not.toBe(parseGraphQLSchema.parseClasses);
    });
  });
});
