const Parse = require('parse/node').Parse;
const PostgresStorageAdapter = require('../lib/Adapters/Storage/Postgres/PostgresStorageAdapter')
  .default;
const postgresURI =
  process.env.PARSE_SERVER_TEST_DATABASE_URI ||
  'postgres://localhost:5432/parse_server_postgres_adapter_test_database';

//public schema
const databaseOptions1 = {
  initOptions: {
    schema: 'public',
  },
};

//not exists schema
const databaseOptions2 = {
  initOptions: {
    schema: 'not_exists_schema',
  },
};

const GameScore = Parse.Object.extend({
  className: 'GameScore',
});

describe_only_db('postgres')('Postgres database init options', () => {
  it('should create server with public schema databaseOptions', async () => {
    const adapter = new PostgresStorageAdapter({
      uri: postgresURI,
      collectionPrefix: 'test_',
      databaseOptions: databaseOptions1,
    });
    await reconfigureServer({
      databaseAdapter: adapter,
    });
    const score = new GameScore({
      score: 1337,
      playerName: 'Sean Plott',
      cheatMode: false,
    });
    await score.save();
  });

  it('should create server using postgresql uri with public schema databaseOptions', async () => {
    const postgresURI2 = new URL(postgresURI);
    postgresURI2.protocol = 'postgresql:';
    const adapter = new PostgresStorageAdapter({
      uri: postgresURI2.toString(),
      collectionPrefix: 'test_',
      databaseOptions: databaseOptions1,
    });
    await reconfigureServer({
      databaseAdapter: adapter,
    });
    const score = new GameScore({
      score: 1337,
      playerName: 'Sean Plott',
      cheatMode: false,
    });
    await score.save();
  });

  it('should fail to create server if schema databaseOptions does not exist', async () => {
    const adapter = new PostgresStorageAdapter({
      uri: postgresURI,
      collectionPrefix: 'test_',
      databaseOptions: databaseOptions2,
    });
    try {
      await reconfigureServer({
        databaseAdapter: adapter,
      });
      fail('Should have thrown error');
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});
