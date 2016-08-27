'use strict';

var QueryFile = require('pg-promise').QueryFile;
var path = require('path');

// Helper for linking to external query files:
function sql(file) {
  var fullPath = path.join(__dirname, file); // generating full path;
  return new QueryFile(fullPath, {minify: true});
}

module.exports = {
  createFunc: sql('createFunc.sql'),
  createSchema: sql('createSchema.sql'),
  createTable: sql('createTable.sql')
};
