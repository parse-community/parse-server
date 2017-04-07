const pgp = require('pg-promise')();
const parser = require('./PostgresConfigParser');

export function createClient(uri, databaseOptions) {
  let dbOptions = {};
  databaseOptions = databaseOptions || {};

  if (uri) {
    dbOptions = parser.getDatabaseOptionsFromURI(uri);
  }

  for (const key in databaseOptions) {
    dbOptions[key] = databaseOptions[key];
  }

  if (dbOptions.pgOptions) {
    for (const key in dbOptions.pgOptions) {
      pgp.pg.defaults[key] = dbOptions.pgOptions[key];
    }
  }

  const client = pgp(dbOptions);

  return client;
}
