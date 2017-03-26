const Parse = require('parse/node').Parse;
const PostgresStorageAdapter = require('../src/Adapters/Storage/Postgres/PostgresStorageAdapter');
const postgresURI = 'postgres://username:password@localhost:5432/db-name';

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
  it('create server with public schema databaseOptions,shoud be ok', (done) => {
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

  it('create server with not exists schema databaseOptions,shoud be fail', (done) => {
    reconfigureServer({
      databaseAdapter: new PostgresStorageAdapter({
        uri: postgresURI, collectionPrefix: 'test_',
        databaseOptions: databaseOptions2
      })
    }).catch(error => {
      expect(error.code).toEqual('3F000');
      done();
    });
  });
});
