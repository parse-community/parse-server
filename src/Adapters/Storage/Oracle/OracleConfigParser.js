const fs = require('fs');
function getDatabaseOptionsFromURI(uri) {
  const databaseOptions = {};

  const parsedURI = new URL(uri);
  const queryParams = parseQueryParams(parsedURI.searchParams.toString());

  databaseOptions.host = parsedURI.hostname || 'localhost';
  databaseOptions.port = parsedURI.port ? parseInt(parsedURI.port) : 1521;
  databaseOptions.database = parsedURI.pathname ? parsedURI.pathname.substr(1) : undefined;
  // Oracle uses service name or SID
  if (queryParams.serviceName) {
    databaseOptions.serviceName = queryParams.serviceName;
  } else if (queryParams.sid) {
    databaseOptions.sid = queryParams.sid;
  } else if (databaseOptions.database) {
    databaseOptions.serviceName = databaseOptions.database;
  }

  databaseOptions.user = parsedURI.username;
  databaseOptions.password = parsedURI.password;

  // Oracle connection options
  if (queryParams.connectString) {
    databaseOptions.connectString = queryParams.connectString;
  }

  if (queryParams.externalAuth && queryParams.externalAuth.toLowerCase() === 'true') {
    databaseOptions.externalAuth = true;
  }

  if (queryParams.poolMin) {
    databaseOptions.poolMin = parseInt(queryParams.poolMin) || 0;
  }
  if (queryParams.poolMax) {
    databaseOptions.poolMax = parseInt(queryParams.poolMax) || 4;
  }
  if (queryParams.poolIncrement) {
    databaseOptions.poolIncrement = parseInt(queryParams.poolIncrement) || 1;
  }
  if (queryParams.poolTimeout) {
    databaseOptions.poolTimeout = parseInt(queryParams.poolTimeout) || 60;
  }
  if (queryParams.stmtCacheSize) {
    databaseOptions.stmtCacheSize = parseInt(queryParams.stmtCacheSize) || 30;
  }

  // SSL/TLS options
  if (queryParams.ssl && queryParams.ssl.toLowerCase() === 'true') {
    databaseOptions.ssl = true;
  }

  if (
    queryParams.ca ||
    queryParams.cert ||
    queryParams.key ||
    queryParams.passphrase ||
    queryParams.rejectUnauthorized
  ) {
    databaseOptions.ssl = databaseOptions.ssl || {};
    if (queryParams.ca) {
      databaseOptions.ssl.ca = fs.readFileSync(queryParams.ca).toString();
    }
    if (queryParams.cert) {
      databaseOptions.ssl.cert = fs.readFileSync(queryParams.cert).toString();
    }
    if (queryParams.key) {
      databaseOptions.ssl.key = fs.readFileSync(queryParams.key).toString();
    }
    if (queryParams.passphrase) {
      databaseOptions.ssl.passphrase = queryParams.passphrase;
    }
    if (queryParams.rejectUnauthorized) {
      databaseOptions.ssl.rejectUnauthorized =
        queryParams.rejectUnauthorized.toLowerCase() === 'true' ? true : false;
    }
  }

  return databaseOptions;
}

function parseQueryParams(queryString) {
  queryString = queryString || '';

  return queryString.split('&').reduce((p, c) => {
    const parts = c.split('=');
    p[decodeURIComponent(parts[0])] =
      parts.length > 1 ? decodeURIComponent(parts.slice(1).join('=')) : '';
    return p;
  }, {});
}

module.exports = {
  parseQueryParams: parseQueryParams,
  getDatabaseOptionsFromURI: getDatabaseOptionsFromURI,
};

