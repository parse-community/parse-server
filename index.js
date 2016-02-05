// ParseServer - open-source compatible API Server for Parse apps
var DatabaseAdapter = require('./DatabaseAdapter'),
    FilesAdapter = require('./FilesAdapter'),
    S3Adapter = require('./S3Adapter'),
    addParseCloud = require('./addParseCloud'),
    ParseServer = require('./ParseServer');

// Mutate the Parse object to add the Cloud Code handlers
addParseCloud();

module.exports = {
  ParseServer: ParseServer,
  S3Adapter: S3Adapter,
  DatabaseAdapter: DatabaseAdapter,
  FilesAdapter: FilesAdapter
};
