const pgp = require('pg-promise')();
const parser = require('./PostgresConfigParser');

export function createClient(uri, databaseOptions) {
  let client;
  let dbOptions = {};
  databaseOptions = databaseOptions || {};

  try {
    if (uri) {
      dbOptions = parser.getDatabaseOptionsFromURI(uri);
    }

    for (const key in databaseOptions){
      dbOptions[key] = databaseOptions[key];
    }

    client = pgp(dbOptions);

    if (dbOptions.pgOptions) {
      for (const key in dbOptions.pgOptions) {
        client.pg.defaults[key] = dbOptions.pgOptions[key]; 
      }
    }

  } catch (e) { 
    throw e;
  }

  return client;
}
