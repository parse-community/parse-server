const Parse = require('parse/node').Parse;
const PostgresStorageAdapter = require('../lib/Adapters/Storage/Postgres/PostgresStorageAdapter')
  .default;
const postgresURI =
  process.env.PARSE_SERVER_TEST_DATABASE_URI ||
  'postgres://localhost:5432/parse_server_postgres_adapter_test_database';
const ParseServer = require('../lib/index');
const express = require('express');
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

function createParseServer(options) {
  return new Promise((resolve, reject) => {
    const parseServer = new ParseServer.default(
      Object.assign({}, defaultConfiguration, options, {
        serverURL: 'http://localhost:12668/parse',
        serverStartComplete: error => {
          if (error) {
            reject(error);
          } else {
            expect(Parse.applicationId).toEqual('test');
            const app = express();
            app.use('/parse', parseServer.app);

            const server = app.listen(12668);
            Parse.serverURL = 'http://localhost:12668/parse';
            resolve(server);
          }
        },
      })
    );
  });
}

describe_only_db('postgres')('Postgres database init options', () => {
  let server;
  let adapter;

  afterAll(async () => {
    adapter.handleShutdown();
    if (server) {
      Parse.serverURL = 'http://localhost:8378/1';
      await server.close();
    }
  });

  it('should create server with public schema databaseOptions', async () => {
    adapter = new PostgresStorageAdapter({
      uri: postgresURI,
      collectionPrefix: 'test_',
      databaseOptions: databaseOptions1,
    });
    const newServer = await createParseServer({ databaseAdapter: adapter });
    server = newServer;
    const score = new GameScore({
      score: 1337,
      playerName: 'Sean Plott',
      cheatMode: false,
    });
    await score.save();
    await reconfigureServer();
  });

  it('should fail to create server if schema databaseOptions does not exist', async () => {
    adapter = new PostgresStorageAdapter({
      uri: postgresURI,
      collectionPrefix: 'test_',
      databaseOptions: databaseOptions2,
    });
    try {
      await createParseServer({ databaseAdapter: adapter });
      fail("Should have thrown error");
    } catch(error) {
      expect(error).toBeDefined();
    }
  });
});
