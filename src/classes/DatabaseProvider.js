import { default as BaseProvider } from './BaseProvider';
import { default as CacheProvider } from './CacheProvider';

const DEFAULT_URI = "mongodb://localhost:27017/parse";

export class DatabaseProvider extends BaseProvider {
  constructor() {
    super(...arguments);
    this.DEFAULT_ADAPTER = '../ExportAdapter';
  }

  setup(config = {}) {
    this.dbConnections = config.dbConnections || this.dbConnections || {};
    this.databaseURI = config.defaultURI || DEFAULT_URI;
    this.appDatabaseURIs = config.appDatabaseURIs || {};

    super.setup(...arguments);
  }

  // TODO: Reimplement this whenever @Flovilmart finishes running CloudCode in subprocesses
  registerAppDatabaseURI(appId, uri) {
    this.appDatabaseURIs[appId] = uri;
  }

  getDatabaseConnections() {
    return this.dbConnections;
  }

  getDatabaseConnection(appId) {
    if (this.dbConnections[appId]) {
      return this.dbConnections[appId];
    }

    const cache = CacheProvider.getAdapter();
    const app = cache.get(appId);

    if (!app) {
      throw new Error('Application ID provided is not a registered application.');
    }

    const adapterClass = this.getAdapter();
    const dbURI = this.appDatabaseURIs[appId] || this.databaseURI;
    const options = { collectionPrefix: app.collectionPrefix };

    this.dbConnections[appId] = new adapterClass(dbURI, options);
    this.dbConnections[appId].connect();
    return this.dbConnections[appId];
  }

  // Overriding resolveAdapter to prevent instantiation
  resolveAdapter(adapter, options) {
      // Support passing in adapter paths
      if (typeof adapter === 'string') {
          adapter = require(adapter);

          // TODO: Figure out a better way to deal with this
          if (adapter && adapter.default) 
            adapter = adapter.default;
      }

      return adapter;
  }
}

export default new DatabaseProvider();