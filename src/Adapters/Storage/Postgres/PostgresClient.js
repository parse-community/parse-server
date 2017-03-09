
const parser = require('./PostgresConfigParser');

export function createClient(uri, databaseOptions) {
  let dbOptions = {};
  databaseOptions = databaseOptions || {};

  if (uri) {
    dbOptions = parser.getDatabaseOptionsFromURI(uri);
  }

  let pgp = require('pg-promise')(databaseOptions);

  const client = pgp(dbOptions);

  if (dbOptions.pgOptions) {
    for (const key in dbOptions.pgOptions) {
      client.pg.defaults[key] = dbOptions.pgOptions[key];
    }
  }

  return client;
}
