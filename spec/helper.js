// Sets up a Parse API server for testing.

jasmine.DEFAULT_TIMEOUT_INTERVAL = 2000;

var cache = require('../src/cache').default;
var DatabaseAdapter = require('../src/DatabaseAdapter');
var express = require('express');
var facebook = require('../src/authDataManager/facebook');
var ParseServer = require('../src/index').ParseServer;
var path = require('path');

var databaseURI = process.env.DATABASE_URI;
var cloudMain = process.env.CLOUD_CODE_MAIN || '../spec/cloud/main.js';
var port = 8378;

// Default server configuration for tests.
var defaultConfiguration = {
  databaseURI: databaseURI,
  cloud: cloudMain,
  serverURL: 'http://localhost:' + port + '/1',
  appId: 'test',
  javascriptKey: 'test',
  dotNetKey: 'windows',
  clientKey: 'client',
  restAPIKey: 'rest',
  masterKey: 'test',
  collectionPrefix: 'test_',
  fileKey: 'test',
  push: {
    'ios': {
      cert: 'prodCert.pem',
      key: 'prodKey.pem',
      production: true,
      bundleId: 'bundleId'
    }
  },
  oauth: { // Override the facebook provider
    facebook: mockFacebook(),
    myoauth: {
      module: path.resolve(__dirname, "myoauth") // relative path as it's run from src
    }
  }
};

// Set up a default API server for testing with default configuration.
var api = new ParseServer(defaultConfiguration);
var app = express();
app.use('/1', api);
var server = app.listen(port);

// Prevent reinitializing the server from clobbering Cloud Code
delete defaultConfiguration.cloud;

var currentConfiguration;
// Allows testing specific configurations of Parse Server
var setServerConfiguration = configuration => {
  // the configuration hasn't changed
  if (configuration === currentConfiguration) {
    return;
  }
  DatabaseAdapter.clearDatabaseSettings();
  currentConfiguration = configuration;
  server.close();
  cache.clearCache();
  app = express();
  api = new ParseServer(configuration);
  app.use('/1', api);
  server = app.listen(port);
};

var restoreServerConfiguration = () => setServerConfiguration(defaultConfiguration);

// Set up a Parse client to talk to our test API server
var Parse = require('parse/node');
Parse.serverURL = 'http://localhost:' + port + '/1';

// This is needed because we ported a bunch of tests from the non-A+ way.
// TODO: update tests to work in an A+ way
Parse.Promise.disableAPlusCompliant();

beforeEach(function(done) {
  restoreServerConfiguration();
  Parse.initialize('test', 'test', 'test');
  Parse.serverURL = 'http://localhost:' + port + '/1';
  Parse.User.enableUnsafeCurrentUser();
  done();
});

afterEach(function(done) {
  Parse.User.logOut().then(() => {
    return clearData();
  }).then(() => {
    done();
  }, (error) => {
    console.log('error in clearData', error);
    done();
  });
});

var TestObject = Parse.Object.extend({
  className: "TestObject"
});
var Item = Parse.Object.extend({
  className: "Item"
});
var Container = Parse.Object.extend({
  className: "Container"
});

// Convenience method to create a new TestObject with a callback
function create(options, callback) {
  var t = new TestObject(options);
  t.save(null, { success: callback });
}

function createTestUser(success, error) {
  var user = new Parse.User();
  user.set('username', 'test');
  user.set('password', 'moon-y');
  var promise = user.signUp();
  if (success || error) {
    promise.then(function(user) {
      if (success) {
        success(user);
      }
    }, function(err) {
      if (error) {
        error(err);
      }
    });
  } else {
    return promise;
  }
}

// Mark the tests that are known to not work.
function notWorking() {}

// Shims for compatibility with the old qunit tests.
function ok(bool, message) {
  expect(bool).toBeTruthy(message);
}
function equal(a, b, message) {
  expect(a).toEqual(b, message);
}
function strictEqual(a, b, message) {
  expect(a).toBe(b, message);
}
function notEqual(a, b, message) {
  expect(a).not.toEqual(b, message);
}
function expectSuccess(params) {
  return {
    success: params.success,
    error: function(e) {
      console.log('got error', e);
      fail('failure happened in expectSuccess');
    },
  }
}
function expectError(errorCode, callback) {
  return {
    success: function(result) {
      console.log('got result', result);
      fail('expected error but got success');
    },
    error: function(obj, e) {
      // Some methods provide 2 parameters.
      e = e || obj;
      if (!e) {
        fail('expected a specific error but got a blank error');
        return;
      }
      expect(e.code).toEqual(errorCode, e.message);
      if (callback) {
        callback(e);
      }
    },
  }
}

// Because node doesn't have Parse._.contains
function arrayContains(arr, item) {
  return -1 != arr.indexOf(item);
}

// Normalizes a JSON object.
function normalize(obj) {
  if (typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (obj instanceof Array) {
    return '[' + obj.map(normalize).join(', ') + ']';
  }
  var answer = '{';
  for (var key of Object.keys(obj).sort()) {
    answer += key + ': ';
    answer += normalize(obj[key]);
    answer += ', ';
  }
  answer += '}';
  return answer;
}

// Asserts two json structures are equal.
function jequal(o1, o2) {
  expect(normalize(o1)).toEqual(normalize(o2));
}

function range(n) {
  var answer = [];
  for (var i = 0; i < n; i++) {
    answer.push(i);
  }
  return answer;
}

function mockFacebook() {
  var facebook = {};
  facebook.validateAuthData = function(authData) {
    if (authData.id === '8675309' && authData.access_token === 'jenny') {
      return Promise.resolve();
    }
    return Promise.reject();
  };
  facebook.validateAppId = function(appId, authData) {
    if (authData.access_token === 'jenny') {
      return Promise.resolve();
    }
    return Promise.reject();
  };
  return facebook;
}

function clearData() {
  var promises = [];
  for (var conn in DatabaseAdapter.dbConnections) {
    promises.push(DatabaseAdapter.dbConnections[conn].deleteEverything());
  }
  return Promise.all(promises);
}

// This is polluting, but, it makes it way easier to directly port old tests.
global.Parse = Parse;
global.TestObject = TestObject;
global.Item = Item;
global.Container = Container;
global.create = create;
global.createTestUser = createTestUser;
global.notWorking = notWorking;
global.ok = ok;
global.equal = equal;
global.strictEqual = strictEqual;
global.notEqual = notEqual;
global.expectSuccess = expectSuccess;
global.expectError = expectError;
global.arrayContains = arrayContains;
global.jequal = jequal;
global.range = range;
global.setServerConfiguration = setServerConfiguration;
global.defaultConfiguration = defaultConfiguration;

// LiveQuery test setting
require('../src/LiveQuery/PLog').logLevel = 'NONE';
var libraryCache = {};
jasmine.mockLibrary = function(library, name, mock) {
  var original = require(library)[name];
  if (!libraryCache[library]) {
    libraryCache[library] = {};
  }
  require(library)[name] = mock;
  libraryCache[library][name] = original;
}

jasmine.restoreLibrary = function(library, name) {
  if (!libraryCache[library] || !libraryCache[library][name]) {
    throw 'Can not find library ' + library + ' ' + name;
  }
  require(library)[name] = libraryCache[library][name];
}
