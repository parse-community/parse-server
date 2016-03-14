/** @flow weak */
// Database Adapter
//
// Allows you to change the underlying database.
//
// Adapter classes must implement the following methods:
// * a constructor with signature (connectionString, optionsObject)
// * connect()
// * loadSchema()
// * create(className, object)
// * find(className, query, options)
// * update(className, query, update, options)
// * destroy(className, query, options)
// * This list is incomplete and the database process is not fully modularized.
//
// Default is MongoStorageAdapter.

import DatabaseController from './Controllers/DatabaseController';
import MongoStorageAdapter from './Adapters/Storage/Mongo/MongoStorageAdapter';

const DefaultDatabaseURI = 'mongodb://localhost:27017/parse';

let adapter = MongoStorageAdapter;
let dbConnections = {};
let databaseURI = DefaultDatabaseURI;
let appDatabaseURIs = {};
let appDatabaseOptions = {};

function setAdapter(databaseAdapter) {
  adapter = databaseAdapter;
}

function setDatabaseURI(uri) {
  databaseURI = uri;
}

function setAppDatabaseURI(appId, uri) {
  appDatabaseURIs[appId] = uri;
}

function setAppDatabaseOptions(appId: string, options: Object) {
  appDatabaseOptions[appId] = options;
}

//Used by tests
function clearDatabaseSettings() {
  appDatabaseURIs = {};
  dbConnections = {};
  appDatabaseOptions = {};
}

function getDatabaseConnection(appId: string, collectionPrefix: string) {
  if (dbConnections[appId]) {
    return dbConnections[appId];
  }

  var dbURI = (appDatabaseURIs[appId] ? appDatabaseURIs[appId] : databaseURI);

  let storageAdapter = new adapter(dbURI, appDatabaseOptions[appId]);
  dbConnections[appId] = new DatabaseController(storageAdapter, {
    collectionPrefix: collectionPrefix
  });
  return dbConnections[appId];
}

module.exports = {
  dbConnections: dbConnections,
  getDatabaseConnection: getDatabaseConnection,
  setAdapter: setAdapter,
  setDatabaseURI: setDatabaseURI,
  setAppDatabaseOptions: setAppDatabaseOptions,
  setAppDatabaseURI: setAppDatabaseURI,
  clearDatabaseSettings: clearDatabaseSettings,
  defaultDatabaseURI: databaseURI
};
