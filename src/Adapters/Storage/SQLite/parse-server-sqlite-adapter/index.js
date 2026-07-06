"use strict";

const adapterModule = require("./SQLiteStorageAdapter");
const SQLiteStorageAdapter =
  adapterModule.default || adapterModule.SQLiteStorageAdapter || adapterModule;

module.exports = SQLiteStorageAdapter;
module.exports.default = SQLiteStorageAdapter;
module.exports.SQLiteStorageAdapter = SQLiteStorageAdapter;
