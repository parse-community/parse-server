'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createClient = createClient;
var pgp = require('pg-promise')();
var parser = require('./PostgresConfigParser');

function createClient(uri, databaseOptions) {
  var dbOptions = {};
  databaseOptions = databaseOptions || {};

  if (uri) {
    dbOptions = parser.getDatabaseOptionsFromURI(uri);
  }

  for (var key in databaseOptions) {
    dbOptions[key] = databaseOptions[key];
  }

  var client = pgp(dbOptions);

  if (dbOptions.pgOptions) {
    for (var _key in dbOptions.pgOptions) {
      client.pg.defaults[_key] = dbOptions.pgOptions[_key];
    }
  }

  return client;
}