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
        serverURL: 'http://localhost:12666/parse',
        serverStartComplete: error => {
          if (error) {
            reject(error);
          } else {
            expect(Parse.applicationId).toEqual('test');
            const app = express();
            app.use('/parse', parseServer.app);

            const server = app.listen(12666);
            Parse.serverURL = 'http://localhost:12666/parse';
            resolve(server);
          }
        },
      })
    );
  });
}

describe_only_db('postgres')('Postgres database init options', () => {
  let server;

  afterEach(() => {
    if (server) {
      server.close();
    }
  });

  it('should create server with public schema databaseOptions', done => {
    const adapter = new PostgresStorageAdapter({
      uri: postgresURI,
      collectionPrefix: 'test_',
      databaseOptions: databaseOptions1,
    });

    createParseServer({ databaseAdapter: adapter })
      .then(newServer => {
        server = newServer;
        const score = new GameScore({
          score: 1337,
          playerName: 'Sean Plott',
          cheatMode: false,
        });
        return score.save();
      })
      .then(done, done.fail);
  });

  it('should fail to create server if schema databaseOptions does not exist', done => {
    const adapter = new PostgresStorageAdapter({
      uri: postgresURI,
      collectionPrefix: 'test_',
      databaseOptions: databaseOptions2,
    });

    createParseServer({ databaseAdapter: adapter }).then(done.fail, () => done());
  });
});
