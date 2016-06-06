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

  indexBuildCreationPromises[appId] = p1.then(() => p2)
  .then(() => console.log('index build success'))
  .then(() => {
    let numCreated = 0;
    let numFailed = 0;

    let user1 = new Parse.User();
    user1.setPassword('asdf');
    user1.setUsername('u1');
    user1.setEmail('dupe@dupe.dupe');
    let p1 = user1.signUp();
    p1.then(user => {
      numCreated++;
      console.log(numCreated)
    }, error => {
      numFailed++;
      console.log(error);
      console.log(numFailed)
      console.log(error.code)
    });

    let user2 = new Parse.User();
    user2.setPassword('asdf');
    user2.setUsername('u2');
    user2.setEmail('dupe@dupe.dupe');
    let p2 = user2.signUp();
    p2.then(user => {
      numCreated++;
      console.log(numCreated)
    }, error => {
      numFailed++;
      console.log(error);
      console.log(numFailed)
      console.log(error.code)
    });
  })

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
