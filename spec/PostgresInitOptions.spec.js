const Parse = require('parse/node').Parse;
const PostgresStorageAdapter = require('../src/Adapters/Storage/Postgres/PostgresStorageAdapter');
const postgresURI = 'postgres://localhost:5432/parse_server_postgres_adapter_test_database';
const Config = require('../src/Config');
//public schema
const databaseOptions1 = {
  initOptions: {
    connect: function (client, dc, isFresh) {
      if (isFresh) {
        client.query('SET search_path = public');
      }
    }
  }
};

//not exists schema
const databaseOptions2 = {
  initOptions: {
    connect: function (client, dc, isFresh) {
      if (isFresh) {
        client.query('SET search_path = not_exists_schema');
      }
    }
  }
};

const GameScore = Parse.Object.extend({
  className: "GameScore"
});

describe_only_db('postgres')('Postgres database init options', () => {
  afterEach(() => {
    defaultConfiguration.databaseAdapter = new PostgresStorageAdapter({
      uri: process.env.PARSE_SERVER_TEST_DATABASE_URI || postgresURI,
      collectionPrefix: 'test_',
    });
  });

  it('should create server with public schema databaseOptions', (done) => {
    const config = new Config('test');
    // Close the current DB before continueing
    config.database.adapter._pgp.end();
    reconfigureServer({
      databaseAdapter: new PostgresStorageAdapter({
        uri: postgresURI, collectionPrefix: 'test_',
        databaseOptions: databaseOptions1
      })
    })
      .then(() => {
        var score = new GameScore({ "score": 1337, "playerName": "Sean Plott", "cheatMode": false });
        return score.save();
      })
      .then(done, done.fail);
  });

  it('should fail to create server if schema databaseOptions does not exist', (done) => {
    const config = new Config('test');
    // Close the current DB before continueing
    config.database.adapter._pgp.end();
    reconfigureServer({
      databaseAdapter: new PostgresStorageAdapter({
        uri: postgresURI, collectionPrefix: 'test_',
        databaseOptions: databaseOptions2
      })
    }).then(() => {
      done.fail('Should not succeed');
    }, error => {
      // INVALID_SCHEMA error 3F000
      // https://www.postgresql.org/docs/9.5/static/errcodes-appendix.html
      expect(error.code).toEqual('3F000');
      done();
    });
  });
});
