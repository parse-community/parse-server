var request = require('request');
var deepcopy = require('deepcopy');
var Config = require('../src/Config');
var logger = require('../src/logger').default;

var settingsCollectionName = '_ServerSettings';
var configuration;
var settingsCollection;
var parseServerObject;

describe('Persistent Settings', () => {
  beforeEach((done) => {
    configuration = deepcopy(defaultConfiguration);
    configuration.enableConfigChanges = true;
    newServer().then(done);
  });

  describe('Upon Initialization', () => {
    it('should persist settings', (done) => {
      configuration.clientKey = 'local';

      newServer()
        .then(getPersisted)
        .then(persisted => {
          expect(persisted.clientKey).toEqual('local');
        })
        .then(done)
        .catch(done.fail);
    });

    it('should only load mutable settings from database', (done) => {
      configuration.clientKey = 'local'; // defined

      updatePersisted({ logLevel: 'info', clientKey: 'persisted' })
        .then(newServer)
        .then(_ => {
          var config = parseServerObject.config;
          expect(config.logLevel).toEqual('info'); // not locked or defined, so updated
          expect(config.clientKey).toEqual('local'); // configuration defined, therefore not updated
        })
        .then(done)
        .catch(done.fail);
    });

    it('overwrites defined settings if lockDefinedSettings is false', (done) => {
      configuration.clientKey = 'local';
      configuration.lockDefinedSettings = false;

      updatePersisted({ clientKey: 'persisted' })
        .then(newServer)
        .then(_ => {
          var config = parseServerObject.config;
          expect(config.clientKey).toEqual('persisted'); // defined setting was updated
        })
        .then(done)
        .catch(done.fail);
    });
  });

  describe('Settings Router', () => {
    it('should provide error on post if config changes disabled', (done) => {
      configuration.enableConfigChanges = false;
      newServer()
        .then(endpoint.get)
        .then(res => expect(res.res.statusCode).toBe(200))
        .then(_ => endpoint.post({ clientKey: 'causesError' }))
        .then(res => {
          expect(res.res.statusCode).toBe(400);
          expect(res.body.code).toBe(119); //Parse.Error.OPERATION_FORBIDDEN
          expect(res.body.error).toBe('Server config changes are disabled');
        })
        .then(done)
        .catch(done.fail);
    });

    it('should run setting callbacks such as configureLogger', (done) => {
      endpoint.post({ logLevel: 'debug' })
        .then(res => {
          expect(res.res.statusCode).toBe(200);
          expect(res.body.logLevel).toBe('debug');
          expect(logger.transports['parse-server'].level).toBe('debug');
        })
        .then(endpoint.get)
        .then(res => {
          expect(res.res.statusCode).toBe(200);
          expect(res.body.logLevel).toBe('debug');
        })
        .then(done)
        .catch(done.fail);
    });

    it('should not set defined setting', (done) => {
      endpoint.post({ clientKey: 'alreadyDefined' })
        .then(res => {
          expect(res.res.statusCode).toBe(200);
          expect(res.body.clientKey).toBeUndefined();
        })
        .then(endpoint.get)
        .then(res => {
          expect(res.res.statusCode).toBe(200);
          expect(res.body.clientKey).toBe(configuration.clientKey);
        })
        .then(done)
        .catch(done.fail);
    });

    it('should not allow access without masterKey', (done) => {
      var invalidHeaders = {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Master-Key': 'invalid'
      };

      endpoint.post({ logLevel: 'silly' }, invalidHeaders)
        .then(res => {
          expect(res.res.statusCode).toBe(403);
          expect(res.body.error).toBe('unauthorized');
        })
        .then(_ => endpoint.get(invalidHeaders))
        .then(res => {
          expect(res.res.statusCode).toBe(403);
          expect(res.body.error).toBe('unauthorized');
        })
        .then(done)
        .catch(done.fail);
    });

    it('should expose non-existant settings as null', (done) => {
      delete configuration.clientKey;

      settingsCollection.drop()
        .then(newServer)
        .then(endpoint.get)
        .then(res => expect(res.body.clientKey).toBe(null))
        .then(done)
        .catch(done.fail);
    });

    it('should fetch database values', (done) => {
      delete configuration.clientKey;

      settingsCollection.drop()
        .then(newServer)
        .then(endpoint.get)
        .then(res => expect(res.body.clientKey).toBe(null))
        .then(_ => updatePersisted({ clientKey: 'persisted' }))
        .then(endpoint.get)
        .then(res => expect(res.body.clientKey).toBe('persisted'))
        .then(done)
        .catch(done.fail);
    });

    it('should only return modified values', (done) => {
      // info is default log level
      var currentLogLevel;
      endpoint.get()
        .then(res => currentLogLevel = res.body.logLevel)
        .then(_ => endpoint.post({ logLevel: currentLogLevel }))
        .then(res => expect(res.body.logLevel).toBeUndefined)
        .then(done)
        .catch(done.fail);
    });
  });
});

function newServer() {
  parseServerObject = setServerConfiguration(deepcopy(configuration));
  return parseServerObject.config.settingsInitialized
    .then(_ => {
      var config = new Config(configuration.appId);
      return config.database.adapter.adaptiveCollection(settingsCollectionName);
    })
    .then(coll => { settingsCollection = coll; });
}

function updatePersisted(settings) {
  settings.applicationId = configuration.appId;
  return parseServerObject.config.settingsInitialized
    .then(_ => settingsCollection.upsertOne({ applicationId: configuration.appId }, { $set: settings }))
    .then(_ => undefined);
}

function getPersisted() {
  return parseServerObject.config.settingsInitialized
    .then(_ => settingsCollection.find({ applicationId: configuration.appId }))
    .then(results => results && results.length && results[0]);
}

var settingsUrl = 'http://localhost:8378/1/settings';
var defaultHeaders = {
  'X-Parse-Application-Id': 'test',
  'X-Parse-Master-Key': 'test'
};

var req = (method, headers, body) => new Promise((resolve, reject) => {
    request[method]({
      url: settingsUrl,
      json: body,
      headers: headers || defaultHeaders
    }, (err, res, body) => {
      if (err) {
        reject(err);
      } else {
        if (typeof body === 'string') body = JSON.parse(body);
        resolve({
          res: res,
          body: body
        });
      }
    });
  });

var endpoint = {
  get: headers => req('get', headers),
  post: (body, headers) => req('post', headers, body)
}
