'use strict';

var path = require('path');
var fs = require('fs');

// Helper to read SQL files
function sql(file) {
  var fullPath = path.join(__dirname, file);
  return fs.readFileSync(fullPath, 'utf8');
}

module.exports = {
  array: {
    add: sql('array/add.sql'),
    addUnique: sql('array/add-unique.sql'),
    contains: sql('array/contains.sql'),
    containsAll: sql('array/contains-all.sql'),
    containsAllRegex: sql('array/contains-all-regex.sql'),
    remove: sql('array/remove.sql'),
  },
  misc: {
    jsonObjectSetKeys: sql('misc/json-object-set-keys.sql'),
  },
};

