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
import log                 from './logger';
import _                   from 'lodash';

var SchemaController = require('./Controllers/SchemaController');

let dbConnections = {};
let appDatabaseURIs = {};
let appDatabaseOptions = {};
let indexBuildCreationPromises = {};

const requiredUserFields = { fields: { ...SchemaController.defaultColumns._Default, ...SchemaController.defaultColumns._User } };

function setAppDatabaseURI(appId, uri) {
  appDatabaseURIs[appId] = uri;
}

function setAppDatabaseOptions(appId: string, options: Object) {
  appDatabaseOptions[appId] = options;
}

//Used by tests
function clearDatabaseSettings() {
  appDatabaseURIs = {};
  //dbConnections = {};
  appDatabaseOptions = {};
  indexBuildCreationPromises = {};
}

//Used by tests
function destroyAllDataPermanently() {
  if (process.env.TESTING) {
    return Promise.all(Object.values(indexBuildCreationPromises))
    .then(() => Promise.all(Object.values(dbConnections).map(conn => conn.deleteEverything())))
  }
  throw 'Only supported in test environment';
}

//Super janky. Will be removed in a later PR.
function _indexBuildsCompleted(appId) {
  return indexBuildCreationPromises[appId];
}

function getDatabaseConnection(appId: string, collectionPrefix: string) {
  if (dbConnections[appId]) {
    return dbConnections[appId];
  }

  let mongoAdapterOptions = {
    collectionPrefix: collectionPrefix,
    mongoOptions: appDatabaseOptions[appId],
    uri: appDatabaseURIs[appId], //may be undefined if the user didn't supply a URI, in which case the default will be used
  }

  dbConnections[appId] = new DatabaseController(new MongoStorageAdapter(mongoAdapterOptions), {appId: appId});

  // Kick off unique index build in the background (or ensure the unique index already exists)
  // A bit janky, will be fixed in a later PR.
  let p1 = dbConnections[appId].adapter.ensureUniqueness('_User', ['username'], requiredUserFields)
  .catch(error => {
    log.warn('Unable to ensure uniqueness for usernames: ', error);
    return Promise.reject();
  });

  let p2 = dbConnections[appId].adapter.ensureUniqueness('_User', ['email'], requiredUserFields)
  .catch(error => {
    log.warn('Unabled to ensure uniqueness for user email addresses: ', error);
    return Promise.reject();
  })

  indexBuildCreationPromises[appId] = Promise.all([p1, p2])

  return dbConnections[appId];
}

module.exports = {
  getDatabaseConnection: getDatabaseConnection,
  setAppDatabaseOptions: setAppDatabaseOptions,
  setAppDatabaseURI: setAppDatabaseURI,
  clearDatabaseSettings: clearDatabaseSettings,
  destroyAllDataPermanently: destroyAllDataPermanently,
  _indexBuildsCompleted,
};
