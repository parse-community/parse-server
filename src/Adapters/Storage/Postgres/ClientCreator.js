const pgp = require('pg-promise')();
const url = require('url');

export function createClient(uri, databaseOptions) {
  let client;
  let dbOptions = {};
  databaseOptions = databaseOptions || {};

  try {
    if (uri) {
      dbOptions = getDatabaseOptionsFromURI(uri);
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

function getDatabaseOptionsFromURI(uri){
  const databaseOptions = {};

  try {

    const parsedURI = url.parse(uri);
    const queryParams = parseQueryParams(parsedURI.query);
    const authParts = parsedURI.auth ? parsedURI.auth.split(':') : [];

    databaseOptions.host = parsedURI.hostname || 'localhost';
    databaseOptions.port = parsedURI.port ? parseInt(parsedURI.port) : 5432;
    databaseOptions.database = parsedURI.pathname 
                                ? parsedURI.pathname.substr(1) 
                                : undefined;

    databaseOptions.user = authParts.length > 0 ? authParts[0] : '';
    databaseOptions.password = authParts.length > 1 ? authParts[1] : '';

    databaseOptions.ssl =
      queryParams.ssl && queryParams.ssl.toLowerString() === 'true' ? true : false;
    databaseOptions.binary =
      queryParams.binary && queryParams.binary.toLowerString() === 'true' ? true : false;

    databaseOptions.client_encoding = queryParams.client_encoding;
    databaseOptions.application_name = queryParams.application_name;
    databaseOptions.fallback_application_name = queryParams.fallback_application_name;

    if(queryParams.poolSize){
      databaseOptions.poolSize = parseInt(queryParams.poolSize);
    }

  } catch (e) { 
    throw e;
  }

  return databaseOptions;
}

function parseQueryParams(queryString) {
  queryString = queryString || '';

  return queryString
    .split('&')
    .reduce((p, c)=> {
      const parts = c.split('=');
      p[decodeURIComponent(parts[0])] = parts.length > 1 
                                ? decodeURIComponent(parts.slice(1).join('=')) 
                                : '';
      return p;
    }, {});
}
