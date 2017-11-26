'use strict';
/* Tests for ParseServer.js */
const express = require('express');
import MongoStorageAdapter from '../src/Adapters/Storage/Mongo/MongoStorageAdapter';
import PostgresStorageAdapter from '../src/Adapters/Storage/Postgres/PostgresStorageAdapter';
import ParseServer from '../src/ParseServer';

describe('Server Url Checks', () => {

  const app = express();
  app.get('/health', function(req, res){
    res.json({
      status: 'ok'
    });
  });
  app.listen(13376);

  it('validate good server url', (done) => {
    Parse.serverURL = 'http://localhost:13376';
    ParseServer.verifyServerUrl(function(result) {
      if(!result) {
        done.fail('Did not pass valid url');
      }
      done();
    });
  });

  it('mark bad server url', (done) => {
    Parse.serverURL = 'notavalidurl';
    ParseServer.verifyServerUrl(function(result) {
      if(result) {
        done.fail('Did not mark invalid url');
      }
      done();
    });
  });

  it('handleShutdown, close connection', (done) => {
    const mongoURI = 'mongodb://localhost:27017/parseServerMongoAdapterTestDatabase';
    const postgresURI = 'postgres://localhost:5432/parse_server_postgres_adapter_test_database';
    let databaseAdapter;
    if (process.env.PARSE_SERVER_TEST_DB === 'postgres') {
      databaseAdapter = new PostgresStorageAdapter({
        uri: process.env.PARSE_SERVER_TEST_DATABASE_URI || postgresURI,
        collectionPrefix: 'test_',
      });
    } else {
      databaseAdapter = new MongoStorageAdapter({
        uri: mongoURI,
        collectionPrefix: 'test_',
      });
    }
    const newConfiguration = Object.assign({}, defaultConfiguration, { databaseAdapter });
    const parseServer = ParseServer.start(newConfiguration, () => {
      parseServer.handleShutdown();
      parseServer.server.close((err) => {
        if (err) {
          done.fail('Close Server Error')
        }
        reconfigureServer({}).then(() => {
          done();
        });
      });
    });
  });
});
