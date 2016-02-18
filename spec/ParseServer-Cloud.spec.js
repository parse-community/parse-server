var configuration = require("./support/parse-server-config.json");
var Parse = require("parse/node");
var apps = configuration.applications;
var configLoader = require("../bin/config");
var Server = require("../src/cloud-code");
var ParseCloud = require("../src/cloud-code/Parse.Cloud");
Parse.Hooks = require("../src/cloud-code/Parse.Hooks");
var jsonCacheDir =  "./.cache";
var express = require("express");
var databaseURI = process.env.DATABASE_URI;
var ParseServer = require('../src/index').ParseServer;


var port = 8379;
var serverURL = 'http://localhost:' + port + '/1';

for(var i in configuration.applications) {
  configuration.applications[i].serverURL = serverURL;
}

var app = express();
var server = app.listen(port);

// Set up an API server for testing
var api = new ParseServer(configuration);
app.use('/1', api);

function use(app) {
  Parse.initialize(app.appId || app.applicationId, app.javascriptKey, app.masterKey);
  Parse.serverURL = app.serverURL;
}

var shouldWait = process.env.WAIT_FOR_SERVER;

describe('Multi Server Testing', () => {
  beforeEach((done) => {
    // Set the proper Pare serverURL
    use(apps[0]);
    if (shouldWait) {
      shouldWait = false;
      setTimeout(() => {
        done();
      }, 500);
    } else {
      done();
    }
  })
  it('first app should have hello', done => {
   	Parse.initialize(apps[0].appId, apps[0].javascriptKey, apps[0].masterKey);
    Parse.Cloud.run('hello', {},  (result, error) =>  {
      expect(result).toEqual('Hello world!');
      done();
    });
  });

  it('second app should have hello', done => {
   	use(apps[1]);
    Parse.Cloud.run('hello', {},  (result, error) =>  {
      expect(result).toEqual('Hello world');
      console.error(error);
      done();
    });
  });

  it('should echo the right application ID', done => {
    var hit = 0;
    function doneIfNeeded() {
      hit++;
      if (hit != 2) {
        return;
      }
      done();
    }
    use(apps[1]);
    Parse.Cloud.run('echoParseKeys', {}).then((result) =>  {
      expect(result.applicationId).toEqual(apps[1].appId);
      expect(result.javascriptKey).toEqual(apps[1].javascriptKey);
      expect(result.masterKey).toEqual(apps[1].masterKey);
      use(apps[1]);
      doneIfNeeded();
    }, (error) => {
      console.error(error);
      fail(JSON.stringify(error));
      doneIfNeeded();
    });

    use(apps[0]);
    Parse.Cloud.run('echoParseKeys', {}).then((result) =>  {
      fail("This function should not be defined");
      doneIfNeeded();
    }, (error) => {
      
      doneIfNeeded();
    });
  });

  it('should delete the proper hook and not leak', done => {
    
    use(apps[1]);
    
    Parse.Cloud.run('echoParseKeys', {}).then( (result) =>  {
      expect(result.applicationId).toEqual(apps[1].appId);
      expect(result.javascriptKey).toEqual(apps[1].javascriptKey);
      expect(result.masterKey).toEqual(apps[1].masterKey);
      done();
    }).fail( (err) => {
      expect(err.code).toEqual(141);
      done();
    });

  });

  it('should create the proper beforeSave and set the proper app ID', done => {
    
    use(apps[1]);
    var obj = new Parse.Object('InjectAppId');
    return obj.save().then( () =>  {
      var query = new Parse.Query('InjectAppId');
      query.get(obj.id).then( (objAgain) =>  {
        expect(objAgain.get('applicationId')).toEqual(apps[1].appId);
        expect(objAgain.get('javascriptKey')).toEqual(apps[1].javascriptKey);
        expect(objAgain.get('masterKey')).toEqual(apps[1].masterKey);
        done();
      },  (error) =>  {
        fail("Failed getting object");
        fail(JSON.stringify(error));
        done();
      });
    },  (error) =>  {
      fail("Failed saving obj");
      fail(JSON.stringify(error));
      done();
    });

  });

  it('should create an object in the proper DB (and not the other)', done => {

    use(apps[1]);
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
      port: 12355,
      main: "../cloud/main-2.js",
      serverURL: serverURL,
      hooksCreationStrategy: "always"
    };

    var server = new Server(config);
    
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
      port: 12346,
      main: "../cloud/main.js",
      serverURL: serverURL,
      hooksCreationStrategy: "always"
    };
    var server = new Server(config);

    var triggerTime = 0;
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
        Parse.Hooks.deleteTrigger('GameScore', 'beforeSave');
        server.close();
        done();
      }, (error) => {
        fail(error);
        server.close();
        done();
      });
    }, (err) => {
      fail(JSON.strngify(err));
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
      port: 12347,
      main: "../cloud/main.js",
      serverURL: serverURL,
      hooksCreationStrategy: "always"
    };
    var server = new Server(config);

    Parse.Cloud.define("hello_world", (req, res) => {
      
      fail("This shoud not be called!");
      res.success("Hello!");
      
    }, "never")
    .then( res => {
      
      expect(res).toBeUndefined();
      return Parse.Cloud.run("hello_world", {});
      
    }, function(err){
      fail(err);
      server.close();
      done();
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
