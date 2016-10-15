const url = require('url');

function getDatabaseOptionsFromURI(uri) {
  const databaseOptions = {};

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
    queryParams.ssl && queryParams.ssl.toLowerCase() === 'true' ? true : false;
  databaseOptions.binary =
    queryParams.binary && queryParams.binary.toLowerCase() === 'true' ? true : false;

  databaseOptions.client_encoding = queryParams.client_encoding;
  databaseOptions.application_name = queryParams.application_name;
  databaseOptions.fallback_application_name = queryParams.fallback_application_name;

  if (queryParams.poolSize) {
    databaseOptions.poolSize = parseInt(queryParams.poolSize) || 10;
  }

  return databaseOptions;
}

function parseQueryParams(queryString) {
  queryString = queryString || '';

  return queryString
    .split('&')
    .reduce((p, c) => {
      const parts = c.split('=');
      p[decodeURIComponent(parts[0])] =
        parts.length > 1
          ? decodeURIComponent(parts.slice(1).join('='))
          : '';
      return p;
    }, {});
}

module.exports = {
  parseQueryParams: parseQueryParams,
  getDatabaseOptionsFromURI: getDatabaseOptionsFromURI
};
