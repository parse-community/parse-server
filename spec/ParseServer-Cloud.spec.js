var configuration = require("./support/parse-server-config.json");
var Parse = require("parse/node");
var apps = configuration.applications;
var configLoader = require("../bin/config");
var Server = require("../src/cloud-code");
var jsonCacheDir =  "./.cache";
var express = require("express");
var databaseURI = process.env.DATABASE_URI;
var ParseServer = require('../src/index').ParseServer;


var port = 8379;
var serverURL = 'http://localhost:' + port + '/1';

var app = express();
var server = app.listen(port);

// Set up an API server for testing
var api = new ParseServer(configuration);
app.use('/1', api);

function createEchoHook() {
  return Parse.Cloud.define("echoParseKeys",  (req, res) => {
    res.success({ applicationId: Parse.applicationId, 
                  javascriptKey: Parse.javascriptKey,
                  masterKey: Parse.masterKey });
  });
}

function createBeforeSaveHook() {
  return Parse.Cloud.beforeSave("InjectAppId",  (req, res) => {
    req.object.set('applicationId', Parse.applicationId);
    req.object.set('javascriptKey', Parse.javascriptKey);
    req.object.set('masterKey', Parse.masterKey);
    res.success();
  });
}

describe('Multi Server Testing', () => {
  beforeEach((done) => {
    // Set the proper Pare serverURL
    Parse.initialize("test2", "test2", "test2");
    Parse.serverURL = serverURL;
    done();
  })
  it('first app should have hello', done => {
    Parse.initialize(apps[0].appId, apps[0].javascriptKey, apps[0].masterKey);
    Parse.Cloud.run('hello', {},  (result, error) =>  {
      expect(result).toEqual('Hello world!');
      done();
    });
  });

  it('second app should have hello', done => {
    Parse.initialize(apps[1].appId, apps[1].javascriptKey, apps[1].masterKey);
    Parse.Cloud.run('hello', {},  (result, error) =>  {
      expect(result).toEqual('Hello world');
      done();
    });
  });

  it('should echo the right applicatio ID', done => {
    Parse.initialize(apps[1].appId, apps[1].javascriptKey, apps[1].masterKey);
    createEchoHook();
    Parse.Cloud.run('echoParseKeys', {},  (result, error) =>  {
      expect(result.applicationId).toEqual(apps[1].appId);
      expect(result.javascriptKey).toEqual(apps[1].javascriptKey);
      expect(result.masterKey).toEqual(apps[1].masterKey);
      Parse.Cloud._removeHook("Functions", 'echoParseKeys', null, apps[1].appId);
      done();
    });

    Parse.initialize(apps[0].appId, apps[0].javascriptKey, apps[0].masterKey);
    createEchoHook();
    Parse.Cloud.run('echoParseKeys', {},  (result, error) =>  {
      expect(result.applicationId).toEqual(apps[0].appId);
      expect(result.javascriptKey).toEqual(apps[0].javascriptKey);
      expect(result.masterKey).toEqual(apps[0].masterKey);
      Parse.Cloud._removeHook("Functions", 'echoParseKeys', null, apps[0].appId);
      done();
    });
  });

  it('should delete the proper hook and not leak', done => {
    
    Parse.initialize(apps[1].appId, apps[1].javascriptKey, apps[1].masterKey);
    createEchoHook();
    
    Parse.Cloud.run('echoParseKeys', {}).then( (result) =>  {
      expect(result.applicationId).toEqual(apps[1].appId);
      expect(result.javascriptKey).toEqual(apps[1].javascriptKey);
      expect(result.masterKey).toEqual(apps[1].masterKey);
      Parse.Cloud._removeHook("Functions", 'echoParseKeys');
      return Parse.Promise.as();
    }).then( () => {
      Parse.initialize(apps[0].appId, apps[0].javascriptKey, apps[0].masterKey);
      return Parse.Cloud.run('echoParseKeys', {});
    }).then( (res) => {
      fail("this call should not succeed");
      done();
    }).fail( (err) => {
      expect(err.code).toEqual(141);
      done();
    });

  });

  it('should create the proper beforeSave and set the proper app ID', done => {
    
    Parse.initialize(apps[1].appId, apps[1].javascriptKey, apps[1].masterKey);
    createBeforeSaveHook();
    var obj = new Parse.Object('InjectAppId');
    obj.save().then( () =>  {
      var query = new Parse.Query('InjectAppId');
      query.get(obj.id).then( (objAgain) =>  {
        expect(objAgain.get('applicationId')).toEqual(apps[1].appId);
        expect(objAgain.get('javascriptKey')).toEqual(apps[1].javascriptKey);
        expect(objAgain.get('masterKey')).toEqual(apps[1].masterKey);
        Parse.Cloud._removeHook("Triggers", 'beforeSave', 'InjectAppId');
        done();
      },  (error) =>  {
        fail(error);
        Parse.Cloud._removeHook("Triggers", 'beforeSave', 'InjectAppId');
        done();
      });
    },  (error) =>  {
      fail(error);
      Parse.Cloud._removeHook("Triggers", 'beforeSave', 'InjectAppId');
      done();
    });

  });

  it('should create an object in the proper DB (and not the other)', done => {

    Parse.initialize(apps[1].appId, apps[1].javascriptKey, apps[1].masterKey);
    var obj = new Parse.Object('SomeObject');
    obj.save().then( () => {
      var query = new Parse.Query('SomeObject');
      return query.get(obj.id);
    }, (error) =>  {
      fail(error);
      done();
    }).then( (objAgain) =>  {

      expect(objAgain).not.toBeUndefined();
      expect(objAgain.id).toEqual(obj.id);
      
      // Check if the data exists in another app
      Parse.initialize(apps[0].appId, apps[0].javascriptKey, apps[0].masterKey);
      var q = new Parse.Query('SomeObject');
      return q.find();
    
    },  (error) =>  {
      fail(error);
      done();
    }).then( (result) => {
      expect(result.constructor).toBe(Array.prototype.constructor);
      expect(result.length).toBe(0);
      done();
    }, (error) =>  {
      fail(error);
      done();
    });

  });

  it('should create a proper cloud code server for an existing parse APP', done => {
    // Start a cloud code server for APP 1.
    var config = {
      applicationId: apps[1].appId,
      javascriptKey: apps[1].javascriptKey,
      masterKey: apps[1].masterKey,
      port: 12345,
      main: "../cloud/main-2.js",
      serverURL: Parse.serverURL,
      hooksCreationStrategy: "always"
    };
    var server = new Server(config);
    Parse.initialize(config.applicationId, config.javascriptKey, config.masterKey);
    Parse.serverURL = config.serverURL;
    Parse.Cloud.define("myCloud",  (req, res) => {
      res.success("code!");
    }).then( () => {
      Parse.Cloud.run("myCloud", {},  (result, error) =>  {
        if (error) {
          fail(error);
        }
        expect(result).toEqual('code!');
        server.close();
        done();
      });
    },  (err) => {
      fail(err);
      server.close();
      done();
    });

  });

  it('test beforeSave on custom Cloud Code (create update)', (done) => {

    // Start a cloud code server for APP 1.
    var config = {
      applicationId: apps[1].appId,
      javascriptKey: apps[1].javascriptKey,
      masterKey: apps[1].masterKey,
      port: 12345,
      main: "../cloud/main.js",
      serverURL: Parse.serverURL,
      hooksCreationStrategy: "always"
    };
    var server = new Server(config);

    var triggerTime = 0;
    Parse.initialize(config.applicationId, config.javascriptKey, config.masterKey);
    Parse.serverURL = config.serverURL;
    // Register a mock beforeSave hook
    Parse.Cloud.beforeSave('GameScore', (req, res) => {
      var object = req.object;
      // TODO: The Parse objects are different in CC execution
      // Because it comes from parse-cloud-express
      // expect(object instanceof Parse.Object).toBeTruthy();
      expect(object.get('fooAgain')).toEqual('barAgain');
      expect(object.id).not.toBeUndefined();
      expect(object.createdAt).not.toBeUndefined();
      expect(object.updatedAt).not.toBeUndefined();
      if (triggerTime == 0) {
        // Create
        expect(object.get('foo')).toEqual('bar');
      } else if (triggerTime == 1) {
        // Update
        expect(object.get('foo')).toEqual('baz');
      } else {
        res.error();
      }
      triggerTime++;
      res.success();
    }).then( () => {
      var obj = new Parse.Object('GameScore');
      obj.set('foo', 'bar');
      obj.set('fooAgain', 'barAgain');
      obj.save().then( () => {
        // We only update foo
        obj.set('foo', 'baz');
        return obj.save();
      }).then( () => {
        // Make sure the checking has been triggered
        expect(triggerTime).toBe(2);
        // Clear mock beforeSave
        if (Parse.Cloud._removeHook) {
          Parse.Cloud._removeHook("Triggers", "beforeSave", "GameScore");
        };
        server.close();
        done();
      }, (error) => {
        fail(error);
        server.close();
        done();
      });
    }, (err) => {
      fail(err);
      server.close();
      done();
    });
    
  });
  
  it('should not create the hook',  (done) =>  {

    // Start a cloud code server for APP 1.
    var config = {
      applicationId: apps[1].appId,
      javascriptKey: apps[1].javascriptKey,
      masterKey: apps[1].masterKey,
      port: 12345,
      main: "../cloud/main.js",
      serverURL: Parse.serverURL,
      hooksCreationStrategy: "always"
    };
    var server = new Server(config);
    Parse.initialize(config.applicationId, config.javascriptKey, config.masterKey);
    Parse.serverURL = config.serverURL;
    
    Parse.Cloud.define("hello_world", (req, res) => {
      
      fail("This shoud not be called!");
      res.success("Hello!");
      
    }, "never")
    .then( res => {
      
      expect(res).toBeUndefined();
      return Parse.Cloud.run("hello_world", {});
      
    }).then( (res) => {
      
      expect(res).toBeUndefined();
      fail("Should not be defined");
      server.close();
      done();
      
    }, (err) => {
      
      expect(err).not.toBeUndefined();
      expect(err.code).toBe(141);
      expect(err.message).toBe('Invalid function.');
      server.close();
      done();
      
    });
  });
});
