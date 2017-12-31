const Parse = require('parse/node').Parse;
import PostgresStorageAdapter from '../src/Adapters/Storage/Postgres/PostgresStorageAdapter';
const postgresURI = 'postgres://localhost:5432/parse_server_postgres_adapter_test_database';
const ParseServer = require("../src/index");
const express = require('express');
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

function createParseServer(options) {
  return new Promise((resolve, reject) => {
    const parseServer = new ParseServer.default(Object.assign({},
      defaultConfiguration, options, {
        serverURL: "http://localhost:12666/parse",
        __indexBuildCompletionCallbackForTests: promise => {
          promise
            .then(() => {
              expect(Parse.applicationId).toEqual("test");
              var app = express();
              app.use('/parse', parseServer.app);

              const server = app.listen(12666);
              Parse.serverURL = "http://localhost:12666/parse";
              resolve(server);
            }, reject);
        }}));
  });
}

describe_only_db('postgres')('Postgres database init options', () => {
  let server;

  afterEach(() => {
    if (server) {
      server.close();
    }
  })

  it('should create server with public schema databaseOptions', (done) => {
    const adapter = new PostgresStorageAdapter({
      uri: postgresURI, collectionPrefix: 'test_',
      databaseOptions: databaseOptions1
    })

    createParseServer({ databaseAdapter: adapter }).then((newServer) => {
      server = newServer;
      var score = new GameScore({ "score": 1337, "playerName": "Sean Plott", "cheatMode": false });
      return score.save();
    }).then(done, done.fail);
  });

  it('should fail to create server if schema databaseOptions does not exist', (done) => {
    const adapter = new PostgresStorageAdapter({
      uri: postgresURI, collectionPrefix: 'test_',
      databaseOptions: databaseOptions2
    })

    createParseServer({ databaseAdapter: adapter }).then(done.fail, done);
  });
});
