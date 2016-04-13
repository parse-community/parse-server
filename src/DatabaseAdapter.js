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

import DatabaseController  from './Controllers/DatabaseController';
import MongoStorageAdapter from './Adapters/Storage/Mongo/MongoStorageAdapter';

let dbConnections = {};
let appDatabaseURIs = {};
let appDatabaseOptions = {};

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

//Used by tests
function destroyAllDataPermanently() {
  if (process.env.TESTING) {
    var promises = [];
    for (var conn in dbConnections) {
      promises.push(dbConnections[conn].deleteEverything());
    }
    return Promise.all(promises);
  }
  throw 'Only supported in test environment';
}

function getDatabaseConnection(appId: string, collectionPrefix: string) {
  if (dbConnections[appId]) {
    return dbConnections[appId];
  }

  let mongoAdapterOptions = {
    collectionPrefix: collectionPrefix,
    mongoOptions: appDatabaseOptions[appId]
  }
  if (appDatabaseURIs[appId]) {
    mongoAdapterOptions.uri = appDatabaseURIs[appId];
  }

  dbConnections[appId] = new DatabaseController(new MongoStorageAdapter(mongoAdapterOptions));

  return dbConnections[appId];
}

module.exports = {
  getDatabaseConnection: getDatabaseConnection,
  setAppDatabaseOptions: setAppDatabaseOptions,
  setAppDatabaseURI: setAppDatabaseURI,
  clearDatabaseSettings: clearDatabaseSettings,
  destroyAllDataPermanently: destroyAllDataPermanently,
};
