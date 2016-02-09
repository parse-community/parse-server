import { default as BaseProvider } from './BaseProvider';
import { default as CacheProvider } from './CacheProvider';

export class DatabaseProvider extends BaseProvider {

  setup(config = {}, defaultConfig = {}) {
    super.setup(...arguments);
    this.dbConnections = this.dbConnections || {};
    this.appDatabaseURIs = this.appDatabaseURIs || {};
    this.databaseURI = this.config.databaseURI || this.databaseURI;
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