"use strict";

// Standalone package copy of the built SQLite URI parser.

function getDatabaseOptionsFromURI(uri) {
  const options = {};
  if (!uri) {
    options.filename = ':memory:';
    return options;
  }
  if (uri.startsWith('sqlite://')) {
    const rawPath = uri.substring(9);
    const [pathPart, queryPart] = rawPath.split('?');
    if (pathPart === ':memory:' || pathPart === '') {
      options.filename = ':memory:';
    } else {
      options.filename = decodeURIComponent(pathPart);
    }
    if (queryPart) {
      const searchParams = new URLSearchParams(queryPart);
      if (searchParams.has('fileMustExist')) {
        options.fileMustExist = searchParams.get('fileMustExist') === 'true';
      }
      if (searchParams.has('timeout')) {
        options.timeout = parseInt(searchParams.get('timeout') || '5000', 10);
      }
      if (searchParams.has('cacheSizeKb')) {
        options.cacheSizeKb = parseInt(searchParams.get('cacheSizeKb') || '32768', 10);
      }
    }
  } else if (uri.startsWith('file:')) {
    options.filename = uri;
  } else {
    options.filename = uri;
  }
  return options;
}
module.exports = {
  getDatabaseOptionsFromURI
};