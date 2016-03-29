var request = require('request');
var parseServerPackage = require('../package.json');
var MockEmailAdapterWithOptions = require('./MockEmailAdapterWithOptions');
var ParseServer = require("../src/index");
var express = require('express');

describe('server', () => {
  it('requires a master key and app id', done => {
    expect(setServerConfiguration.bind(undefined, {  })).toThrow('You must provide an appId!');
    expect(setServerConfiguration.bind(undefined, { appId: 'myId' })).toThrow('You must provide a masterKey!');
    expect(setServerConfiguration.bind(undefined, { appId: 'myId', masterKey: 'mk' })).toThrow('You must provide a serverURL!');
    done();
  });

  it('fails if database is unreachable', done => {
    setServerConfiguration({
      databaseURI: 'mongodb://fake:fake@ds043605.mongolab.com:43605/drew3',
      serverURL: 'http://localhost:8378/1',
      appId: 'test',
      javascriptKey: 'test',
      dotNetKey: 'windows',
      clientKey: 'client',
      restAPIKey: 'rest',
      masterKey: 'test',
      collectionPrefix: 'test_',
      fileKey: 'test',
    });
    //Need to use rest api because saving via JS SDK results in fail() not getting called
    request.post({
      url: 'http://localhost:8378/1/classes/NewClass',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      },
      body: {},
      json: true,
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(500);
      expect(body.code).toEqual(1);
      expect(body.message).toEqual('Internal server error.');
      done();
    });
  });

  it('can load email adapter via object', done => {
    setServerConfiguration({
      serverURL: 'http://localhost:8378/1',
      appId: 'test',
      appName: 'unused',
      javascriptKey: 'test',
      dotNetKey: 'windows',
      clientKey: 'client',
      restAPIKey: 'rest',
      masterKey: 'test',
      collectionPrefix: 'test_',
      fileKey: 'test',
      verifyUserEmails: true,
      emailAdapter: MockEmailAdapterWithOptions({
        fromAddress: 'parse@example.com',
        apiKey: 'k',
        domain: 'd',
      }),
      publicServerURL: 'http://localhost:8378/1'
    });
    done();
  });

  it('can load email adapter via class', done => {
    setServerConfiguration({
      serverURL: 'http://localhost:8378/1',
      appId: 'test',
      appName: 'unused',
      javascriptKey: 'test',
      dotNetKey: 'windows',
      clientKey: 'client',
      restAPIKey: 'rest',
      masterKey: 'test',
      collectionPrefix: 'test_',
      fileKey: 'test',
      verifyUserEmails: true,
      emailAdapter: {
        class: MockEmailAdapterWithOptions,
        options: {
          fromAddress: 'parse@example.com',
          apiKey: 'k',
          domain: 'd',
        }
      },
      publicServerURL: 'http://localhost:8378/1'
    });
    done();
  });

  it('can load email adapter via module name', done => {
    setServerConfiguration({
      serverURL: 'http://localhost:8378/1',
      appId: 'test',
      appName: 'unused',
      javascriptKey: 'test',
      dotNetKey: 'windows',
      clientKey: 'client',
      restAPIKey: 'rest',
      masterKey: 'test',
      collectionPrefix: 'test_',
      fileKey: 'test',
      verifyUserEmails: true,
      emailAdapter: {
        module: 'parse-server-simple-mailgun-adapter',
        options: {
          fromAddress: 'parse@example.com',
          apiKey: 'k',
          domain: 'd',
        }
      },
      publicServerURL: 'http://localhost:8378/1'
    });
    done();
  });

  it('can load email adapter via only module name', done => {
    expect(() => setServerConfiguration({
      serverURL: 'http://localhost:8378/1',
      appId: 'test',
      appName: 'unused',
      javascriptKey: 'test',
      dotNetKey: 'windows',
      clientKey: 'client',
      restAPIKey: 'rest',
      masterKey: 'test',
      collectionPrefix: 'test_',
      fileKey: 'test',
      verifyUserEmails: true,
      emailAdapter: 'parse-server-simple-mailgun-adapter',
      publicServerURL: 'http://localhost:8378/1'
    })).toThrow('SimpleMailgunAdapter requires an API Key, domain, and fromAddress.');
    done();
  });

  it('throws if you initialize email adapter incorrecly', done => {
    expect(() => setServerConfiguration({
      serverURL: 'http://localhost:8378/1',
      appId: 'test',
      appName: 'unused',
      javascriptKey: 'test',
      dotNetKey: 'windows',
      clientKey: 'client',
      restAPIKey: 'rest',
      masterKey: 'test',
      collectionPrefix: 'test_',
      fileKey: 'test',
      verifyUserEmails: true,
      emailAdapter: {
        module: 'parse-server-simple-mailgun-adapter',
        options: {
          domain: 'd',
        }
      },
      publicServerURL: 'http://localhost:8378/1'
    })).toThrow('SimpleMailgunAdapter requires an API Key, domain, and fromAddress.');
    done();
  });

  it('can report the server version', done => {
    request.get({
      url: 'http://localhost:8378/1/serverInfo',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
      },
      json: true,
    }, (error, response, body) => {
      expect(body.parseServerVersion).toEqual(parseServerPackage.version);
      done();
    })
  });

  it('can create a parse-server', done => {
    var parseServer = new ParseServer.default({
      appId: "aTestApp",
      masterKey: "aTestMasterKey",
      serverURL: "http://localhost:12666/parse",
      databaseURI: 'mongodb://localhost:27017/aTestApp'
    });

    expect(Parse.applicationId).toEqual("aTestApp");
    var app = express();
    app.use('/parse', parseServer.app);

    var server = app.listen(12666);
    var obj  = new Parse.Object("AnObject");
    var objId;
    obj.save().then((obj) => {
      objId = obj.id;
      var q = new Parse.Query("AnObject");
      return q.first();
    }).then((obj) => {
      expect(obj.id).toEqual(objId);
      server.close();
      done();
    }).fail((err) => {
      server.close();
      done();
    })
  });

  it('can create a parse-server', done => {
    var parseServer = ParseServer.ParseServer({
      appId: "anOtherTestApp",
      masterKey: "anOtherTestMasterKey",
      serverURL: "http://localhost:12667/parse",
      databaseURI: 'mongodb://localhost:27017/anotherTstApp'
    });

    expect(Parse.applicationId).toEqual("anOtherTestApp");
    var app = express();
    app.use('/parse', parseServer);

    var server = app.listen(12667);
    var obj  = new Parse.Object("AnObject");
    var objId;
    obj.save().then((obj) => {
      objId = obj.id;
      var q = new Parse.Query("AnObject");
      return q.first();
    }).then((obj) => {
      expect(obj.id).toEqual(objId);
      server.close();
      done();
    }).fail((err) => {
      server.close();
      done();
    })
  });

  it('has createLiveQueryServer', done => {
    // original implementation through the factory
    expect(typeof ParseServer.ParseServer.createLiveQueryServer).toEqual('function');
    // For import calls
    expect(typeof ParseServer.default.createLiveQueryServer).toEqual('function');
    done();
  });

  it('exposes all the "core" adapters', done => {
    expect(ParseServer.S3Adapter).toThrow();
    expect(ParseServer.GCSAdapter).toThrow('GCSAdapter requires an projectId');
    expect(ParseServer.FileSystemAdapter).toThrow();
    done();
  });
});
