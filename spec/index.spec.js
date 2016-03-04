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
        module: './Email/SimpleMailgunAdapter',
        options: {
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
      emailAdapter: './Email/SimpleMailgunAdapter',
      publicServerURL: 'http://localhost:8378/1'
    })).toThrow('SimpleMailgunAdapter requires an API Key and domain.');
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
        module: './Email/SimpleMailgunAdapter',
        options: {
          domain: 'd',
        }
      },
      publicServerURL: 'http://localhost:8378/1'
    })).toThrow('SimpleMailgunAdapter requires an API Key and domain.');
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

    var server = new ParseServer({
      appId: "aTestApp",
      masterKey: "aTestMasterKey",
      serverURL: "http://localhost:12666/parse"
    });
    
    expect(Parse.applicationId).toEqual("aTestApp");
    var app = express();
    app.use('/parse', server.app);
    
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
});
