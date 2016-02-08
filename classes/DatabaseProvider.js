var BaseProvider = require('./BaseProvider');
var util = require('util');
var cache = require('../cache');

// TODO: Make these instance variables?
var dbConnections = {};
var databaseURI = 'mongodb://localhost:27017/parse';
var appDatabaseURIs = {};

// Singleton for the entire server. TODO: Refactor away from singleton paradigm
var instance = null;

// Adapter is actually the adapter constructor. 
// TODO: Refactor so that the provider doesn't have to implement these methods
// TODO: Instantiate the adapter if it's a constructor. 
function DatabaseProvider(adapter) {
    if (instance) {
        return instance;
    }

    instance = this;

    this.adapter = adapter;
};

util.inherits(DatabaseProvider, BaseProvider);

function setDatabaseURI(uri) {
  databaseURI = uri;
};

function setAppDatabaseURI(appId, uri) {
  appDatabaseURIs[appId] = uri;
}

function getDatabaseConnections() {
    return dbConnections;
}

function getDatabaseConnection(appId) {
  if (dbConnections[appId]) {
    return dbConnections[appId];
  }

  var adapterClass = this.getAdapter();

  var dbURI = (appDatabaseURIs[appId] ? appDatabaseURIs[appId] : databaseURI);
  var adapter = new adapterClass(dbURI, {
    collectionPrefix: cache.apps[appId]['collectionPrefix']
  });
  dbConnections[appId] = adapter;
  dbConnections[appId].connect();
  return dbConnections[appId];
}

DatabaseProvider.prototype.setDatabaseURI = setDatabaseURI;
DatabaseProvider.prototype.setAppDatabaseURI = setAppDatabaseURI;
DatabaseProvider.prototype.getDatabaseConnections = getDatabaseConnections;
DatabaseProvider.prototype.getDatabaseConnection = getDatabaseConnection;

module.exports = DatabaseProvider;