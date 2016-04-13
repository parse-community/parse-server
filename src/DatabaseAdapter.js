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

const DefaultDatabaseURI = 'mongodb://localhost:27017/parse';

let dbConnections = {};
let databaseURI = DefaultDatabaseURI;
let appDatabaseURIs = {};
let appDatabaseOptions = {};

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

  var dbURI = (appDatabaseURIs[appId] ? appDatabaseURIs[appId] : databaseURI);

  let storageAdapter = new MongoStorageAdapter({
    uri: dbURI,
    collectionPrefix: collectionPrefix,
    mongoOptions: appDatabaseOptions[appId]
  });

  dbConnections[appId] = new DatabaseController(storageAdapter, {
    collectionPrefix: collectionPrefix
  });
  return dbConnections[appId];
}

module.exports = {
  getDatabaseConnection: getDatabaseConnection,
  setDatabaseURI: setDatabaseURI,
  setAppDatabaseOptions: setAppDatabaseOptions,
  setAppDatabaseURI: setAppDatabaseURI,
  clearDatabaseSettings: clearDatabaseSettings,
  destroyAllDataPermanently: destroyAllDataPermanently,
  defaultDatabaseURI: databaseURI
};
