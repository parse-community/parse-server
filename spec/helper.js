// Sets up a Parse API server for testing.

jasmine.DEFAULT_TIMEOUT_INTERVAL = 2000;

var cache = require('../src/cache');
var DatabaseAdapter = require('../src/DatabaseAdapter');
var express = require('express');
var facebook = require('../src/oauth/facebook');
var ParseServer = require('../src/index').ParseServer;

var databaseURI = process.env.DATABASE_URI;
var cloudMain = process.env.CLOUD_CODE_MAIN || './cloud/main.js';

// Set up an API server for testing
var api = new ParseServer({
  databaseURI: databaseURI,
  cloud: cloudMain,
  appId: 'test',
  javascriptKey: 'test',
  dotNetKey: 'windows',
  clientKey: 'client',
  restAPIKey: 'rest',
  masterKey: 'test',
  collectionPrefix: 'test_',
  fileKey: 'test',
  oauth: { // Override the facebook provider
    facebook: mockFacebook(),
    myoauth: {
      module: "../spec/myoauth" // relative path as it's run from src
    }
  }
});

var app = express();
app.use('/1', api);
var port = 8378;
var server = app.listen(port);

// Set up a Parse client to talk to our test API server
var Parse = require('parse/node');
Parse.serverURL = 'http://localhost:' + port + '/1';

// This is needed because we ported a bunch of tests from the non-A+ way.
// TODO: update tests to work in an A+ way
Parse.Promise.disableAPlusCompliant();

beforeEach(function(done) {
  Parse.initialize('test', 'test', 'test');
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
