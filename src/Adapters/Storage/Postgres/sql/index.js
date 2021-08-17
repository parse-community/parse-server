'use strict';

const QueryFile = require('pg-promise').QueryFile;
const path = require('path');

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

///////////////////////////////////////////////
// Helper for linking to external query files;
function sql(file) {
  const fullPath = path.join(__dirname, file); // generating full path;

  const qf = new QueryFile(fullPath, { minify: true });

  if (qf.error) {
    throw qf.error;
  }

  return qf;
}
