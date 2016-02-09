var BaseProvider = require('./BaseProvider');
var CacheProvider = require('./CacheProvider');
var util = require('util');

var DefaultDatabaseAdapter = require('../ExportAdapter');
var defaultURI = "mongodb://localhost:27017/parse";

function DatabaseProvider(adapter) {
    DatabaseProvider.super_.call(this)
};

function setup(config) {
    config = config || {};
    config.adapter = config.adapter || DefaultDatabaseAdapter;
    this.dbConnections = config.dbConnections || this.dbConnections || {};
    this.databaseURI = config.defaultURI || defaultURI;
    this.appDatabaseURIs = config.appDatabaseURIs || {};

    var adapter = this.resolveAdapter(config.adapter, config.options);
    this.setAdapter(adapter);
}

// TODO: Reimplement this whenever @Flovilmart finishes running CloudCode in subprocesses
function registerAppDatabaseURI(appId, uri) {
  this.appDatabaseURIs[appId] = uri;
}

function getDatabaseConnections() {
    return this.dbConnections;
}

function getDatabaseConnection(appId) {
  if (this.dbConnections[appId]) {
    return this.dbConnections[appId];
  }

  var cache = CacheProvider.getAdapter();
  var app = cache.get(appId);

  if (!app) {
    throw new Error('Application ID provided is not a registered application.');
  }

  var adapterFn = this.getAdapter();
  var dbURI = this.appDatabaseURIs[appId] || this.databaseURI;
  var options = { collectionPrefix: app.collectionPrefix };

  this.dbConnections[appId] = new adapterFn(dbURI, options);
  this.dbConnections[appId].connect();
  return this.dbConnections[appId];
}

// Overriding resolveAdapter to return the class, rather than an instance
function resolveAdapter(adapter, options) {
    // Support passing in adapter paths
    if (typeof adapter === 'string') {
        adapter = require(adapter);
    }

    return adapter;
}

util.inherits(DatabaseProvider, BaseProvider);

DatabaseProvider.prototype.setup = setup;
DatabaseProvider.prototype.registerAppDatabaseURI = registerAppDatabaseURI;
DatabaseProvider.prototype.getDatabaseConnections = getDatabaseConnections;
DatabaseProvider.prototype.getDatabaseConnection = getDatabaseConnection;
DatabaseProvider.prototype.resolveAdapter = resolveAdapter;
DatabaseProvider.prototype.DatabaseProvider = DatabaseProvider;

exports = module.exports = new DatabaseProvider();