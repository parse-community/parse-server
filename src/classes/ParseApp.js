var DatabaseProvider = require('./DatabaseProvider');

function ParseApp(args) {
    if (!args.appId || !args.masterKey) {
      throw 'You must provide an appId and masterKey!';
    }

    this.appId = args.appId;
    this.masterKey = args.masterKey;
    this.collectionPrefix = args.collectionPrefix || '';
    this.clientKey = args.clientKey || '';
    this.javascriptKey = args.javascriptKey || '';
    this.dotNetKey = args.dotNetKey || '';
    this.restAPIKey = args.restAPIKey || '';
    this.fileKey = args.fileKey || 'invalid-file-key';
    this.facebookAppIds = args.facebookAppIds || [];
    this.databaseURI = args.databaseURI;

    // To maintain compatibility. TODO: Remove in v2.1
    if (process.env.FACEBOOK_APP_ID) {
      this['facebookAppIds'].push(process.env.FACEBOOK_APP_ID);
    }

    // Register with the database provider if we have an app specific database URI
    if (this.databaseURI) {
      DatabaseProvider.registerAppDatabaseURI(this.appId, this.databaseURI);
    }
}

exports = module.exports = ParseApp;