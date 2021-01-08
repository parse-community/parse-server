const url = require('url');
const fs = require('fs');
function getDatabaseOptionsFromURI(uri) {
  const databaseOptions = {};

  const parsedURI = url.parse(uri);
  const queryParams = parseQueryParams(parsedURI.query);
  const authParts = parsedURI.auth ? parsedURI.auth.split(':') : [];

  databaseOptions.host = parsedURI.hostname || 'localhost';
  databaseOptions.port = parsedURI.port ? parseInt(parsedURI.port) : 5432;
  databaseOptions.database = parsedURI.pathname ? parsedURI.pathname.substr(1) : undefined;

  databaseOptions.user = authParts.length > 0 ? authParts[0] : '';
  databaseOptions.password = authParts.length > 1 ? authParts[1] : '';

  if (queryParams.ssl && queryParams.ssl.toLowerCase() === 'true') {
    databaseOptions.ssl = true;
  }

  if (
    queryParams.ca ||
    queryParams.pfx ||
    queryParams.cert ||
    queryParams.key ||
    queryParams.passphrase ||
    queryParams.rejectUnauthorized ||
    queryParams.secureOptions
  ) {
    databaseOptions.ssl = {};
    if (queryParams.ca) {
      databaseOptions.ssl.ca = fs.readFileSync(queryParams.ca).toString();
    }
    if (queryParams.pfx) {
      databaseOptions.ssl.pfx = fs.readFileSync(queryParams.pfx).toString();
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
    if (queryParams.secureOptions) {
      databaseOptions.ssl.secureOptions = parseInt(queryParams.secureOptions);
    }
  }

  databaseOptions.binary =
    queryParams.binary && queryParams.binary.toLowerCase() === 'true' ? true : false;

  databaseOptions.client_encoding = queryParams.client_encoding;
  databaseOptions.application_name = queryParams.application_name;
  databaseOptions.fallback_application_name = queryParams.fallback_application_name;

  if (queryParams.poolSize) {
    databaseOptions.poolSize = parseInt(queryParams.poolSize) || 10;
  }
  if (queryParams.max) {
    databaseOptions.max = parseInt(queryParams.max) || 10;
  }
  if (queryParams.query_timeout) {
    databaseOptions.query_timeout = parseInt(queryParams.query_timeout);
  }
  if (queryParams.idleTimeoutMillis) {
    databaseOptions.idleTimeoutMillis = parseInt(queryParams.idleTimeoutMillis);
  }
  if (queryParams.keepAlive) {
    databaseOptions.keepAlive = queryParams.keepAlive.toLowerCase() === 'true' ? true : false;
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
