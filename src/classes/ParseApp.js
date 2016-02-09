import { default as DatabaseProvider } from './DatabaseProvider';

const defaults = {
  collectionPrefix: '',
  clientKey: '',
  javascriptKey: '',
  dotNetKey: '',
  restAPIKey: '',
  fileKey: '',
  facebookAppIds: []
};

export class ParseApp {
  constructor(args = {}) {
    if (!args.appId || !args.masterKey) {
      throw 'You must provide an appId and masterKey!';
    }

    // Merge defaults and arguments
    Object.assign(this, defaults, args);

    // To maintain compatibility. TODO: Remove in v2.1
    if (process.env.FACEBOOK_APP_ID) {
      this['facebookAppIds'].push(process.env.FACEBOOK_APP_ID);
    }

    // Register with the database provider if we have an app specific database URI
    if (this.databaseURI) {
      DatabaseProvider.registerAppDatabaseURI(this.appId, this.databaseURI);
    }
  }
}

export default ParseApp;