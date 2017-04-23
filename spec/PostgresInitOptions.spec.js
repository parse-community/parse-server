const Parse = require('parse/node').Parse;
const PostgresStorageAdapter = require('../src/Adapters/Storage/Postgres/PostgresStorageAdapter');
const postgresURI = 'postgres://localhost:5432/parse_server_postgres_adapter_test_database';

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

describe('Postgres database init options', () => {
  it('should create server with public schema databaseOptions', (done) => {
    reconfigureServer({
      databaseAdapter: new PostgresStorageAdapter({
        uri: postgresURI, collectionPrefix: 'test_',
        databaseOptions: databaseOptions1
      })
    }).then(done, fail);
  });

  it("save new GameScore in public schema", function (done) {
    var score = new GameScore({ "score": 1337, "playerName": "Sean Plott", "cheatMode": false });
    score.save().then(done, fail);
  });

  it('should fail to create server if schema databaseOptions does not exist', (done) => {
    reconfigureServer({
      databaseAdapter: new PostgresStorageAdapter({
        uri: postgresURI, collectionPrefix: 'test_',
        databaseOptions: databaseOptions2
      })
    }).then(() => {
      done();
    })
      .catch(error => {
        expect(error.code).toEqual('42P01');
        done();
      });
  });
});
