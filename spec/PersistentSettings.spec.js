var request = require('request');
var deepcopy = require('deepcopy');
var DatabaseAdapter = require('../src/DatabaseAdapter');
var database = DatabaseAdapter.getDatabaseConnection('test', 'test_');
var settingsCollection = '_ServerSettings';
var logger = require('../src/logger').default;

var configuration;

describe('Persistent Settings', () => {
  beforeEach((done) => {
    configuration = deepcopy(defaultConfiguration);
    configuration.verbose = true;
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
          expect(res.res.statusCode).toBe(403);
          expect(res.body.error).toBe('Server config changes are disabled');
        })
        .then(done)
        .catch(done.fail);
    });

    it('should run setting callbacks such as configureLogger', (done) => {
      endpoint.post({ logLevel: 'silly' })
        .then(res => {
          expect(res.res.statusCode).toBe(200);
          expect(res.body.logLevel).toBe('silly');
          expect(logger.transports['parse-server'].level).toBe('silly');
        })
        .then(endpoint.get)
        .then(res => {
          expect(res.res.statusCode).toBe(200);
          expect(res.body.logLevel).toBe('silly');
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

      database.deleteEverything()
        .then(newServer)
        .then(endpoint.get)
        .then(res => expect(res.body.clientKey).toBe(null))
        .then(done)
        .catch(done.fail);
    });

    it('should fetch database values', (done) => {
      delete configuration.clientKey;

      database.deleteEverything()
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
  setServerConfiguration(deepcopy(configuration));
  return parseServerObject.config.settingsInitialized;
}

function updatePersisted(settings) {
  settings.applicationId = configuration.appId;
  return parseServerObject.config.settingsInitialized
    .then(_ => database.adaptiveCollection(settingsCollection))
    .then(coll => coll.upsertOne({ applicationId: configuration.appId }, { $set: settings }))
    .then(_ => undefined);
}

function getPersisted() {
  return parseServerObject.config.settingsInitialized
    .then(_ => database.mongoFind(settingsCollection, {}, {}))
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
