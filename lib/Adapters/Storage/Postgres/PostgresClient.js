'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createClient = createClient;

const parser = require('./PostgresConfigParser');

function createClient(uri, databaseOptions) {
  let dbOptions = {};
  databaseOptions = databaseOptions || {};

  if (uri) {
    dbOptions = parser.getDatabaseOptionsFromURI(uri);
  }

  for (const key in databaseOptions) {
    dbOptions[key] = databaseOptions[key];
  }

  const initOptions = dbOptions.initOptions || {};
  const pgp = require('pg-promise')(initOptions);
  const client = pgp(dbOptions);

  if (dbOptions.pgOptions) {
    for (const key in dbOptions.pgOptions) {
      pgp.pg.defaults[key] = dbOptions.pgOptions[key];
    }
  }

  return { client, pgp };
}