"use strict"
var request = require('request');
var parseServerPackage = require('../package.json');
var MockEmailAdapterWithOptions = require('./MockEmailAdapterWithOptions');
var ParseServer = require("../src/index");
var Config = require('../src/Config');
var express = require('express');

import MongoStorageAdapter from '../src/Adapters/Storage/Mongo/MongoStorageAdapter';

describe('server', () => {
  it('requires a master key and app id', done => {
    reconfigureServer({ appId: undefined })
      .catch(error => {
        expect(error).toEqual('You must provide an appId!');
        return reconfigureServer({ masterKey: undefined });
      })
      .catch(error => {
        expect(error).toEqual('You must provide a masterKey!');
        return reconfigureServer({ serverURL: undefined });
      })
      .catch(error => {
        expect(error).toEqual('You must provide a serverURL!');
        done();
      });
  });

  it('support http basic authentication with masterkey', done => {
    reconfigureServer({ appId: 'test' }).then(() => {
      request.get({
        url: 'http://localhost:8378/1/classes/TestObject',
        headers: {
          'Authorization': 'Basic ' + new Buffer('test:' + 'test').toString('base64')
        }
      }, (error, response) => {
        expect(response.statusCode).toEqual(200);
        done();
      });
    })
  });

  it('support http basic authentication with javascriptKey', done => {
    reconfigureServer({ appId: 'test' }).then(() => {
      request.get({
        url: 'http://localhost:8378/1/classes/TestObject',
        headers: {
          'Authorization': 'Basic ' + new Buffer('test:javascript-key=' + 'test').toString('base64')
        }
      }, (error, response) => {
        expect(response.statusCode).toEqual(200);
        done();
      });
    })
  });

  it('fails if database is unreachable', done => {
    reconfigureServer({ databaseAdapter: new MongoStorageAdapter({ uri: 'mongodb://fake:fake@localhost:43605/drew3' }) })
      .catch(() => {
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
          reconfigureServer().then(done, done);
        });
      });
  });

  it('can load email adapter via object', done => {
    reconfigureServer({
      appName: 'unused',
      verifyUserEmails: true,
      emailAdapter: MockEmailAdapterWithOptions({
        fromAddress: 'parse@example.com',
        apiKey: 'k',
        domain: 'd',
      }),
      publicServerURL: 'http://localhost:8378/1'
    }).then(done, fail);
  });

  it('can load email adapter via class', done => {
    reconfigureServer({
      appName: 'unused',
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
    }).then(done, fail);
  });

  it('can load email adapter via module name', done => {
    reconfigureServer({
      appName: 'unused',
      verifyUserEmails: true,
      emailAdapter: {
        module: '@parse/simple-mailgun-adapter',
        options: {
          fromAddress: 'parse@example.com',
          apiKey: 'k',
          domain: 'd',
        }
      },
      publicServerURL: 'http://localhost:8378/1'
    }).then(done, fail);
  });

  it('can load email adapter via only module name', done => {
    reconfigureServer({
      appName: 'unused',
      verifyUserEmails: true,
      emailAdapter: '@parse/simple-mailgun-adapter',
      publicServerURL: 'http://localhost:8378/1'
    })
      .catch(error => {
        expect(error).toEqual('SimpleMailgunAdapter requires an API Key, domain, and fromAddress.');
        done();
      });
  });

  it('throws if you initialize email adapter incorrectly', done => {
    reconfigureServer({
      appName: 'unused',
      verifyUserEmails: true,
      emailAdapter: {
        module: '@parse/simple-mailgun-adapter',
        options: {
          domain: 'd',
        }
      },
      publicServerURL: 'http://localhost:8378/1'
    })
      .catch(error => {
        expect(error).toEqual('SimpleMailgunAdapter requires an API Key, domain, and fromAddress.');
        done();
      });
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

  it('can properly sets the push support', done => {
    // default config passes push options
    const config = Config.get('test');
    expect(config.hasPushSupport).toEqual(true);
    expect(config.hasPushScheduledSupport).toEqual(false);
    request.get({
      url: 'http://localhost:8378/1/serverInfo',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
      },
      json: true,
    }, (error, response, body) => {
      expect(body.features.push.immediatePush).toEqual(true);
      expect(body.features.push.scheduledPush).toEqual(false);
      done();
    })
  });

  it('can properly sets the push support when not configured', done => {
    reconfigureServer({
      push: undefined // force no config
    }).then(() => {
      const config = Config.get('test');
      expect(config.hasPushSupport).toEqual(false);
      expect(config.hasPushScheduledSupport).toEqual(false);
      request.get({
        url: 'http://localhost:8378/1/serverInfo',
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Master-Key': 'test',
        },
        json: true,
      }, (error, response, body) => {
        expect(body.features.push.immediatePush).toEqual(false);
        expect(body.features.push.scheduledPush).toEqual(false);
        done();
      })
    }).catch(done.fail);
  });

  it('can properly sets the push support ', done => {
    reconfigureServer({
      push: {
        adapter: {
          send() {},
          getValidPushTypes() {}
        }
      }
    }).then(() => {
      const config = Config.get('test');
      expect(config.hasPushSupport).toEqual(true);
      expect(config.hasPushScheduledSupport).toEqual(false);
      request.get({
        url: 'http://localhost:8378/1/serverInfo',
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Master-Key': 'test',
        },
        json: true,
      }, (error, response, body) => {
        expect(body.features.push.immediatePush).toEqual(true);
        expect(body.features.push.scheduledPush).toEqual(false);
        done();
      })
    }).catch(done.fail);
  });

  it('can properly sets the push schedule support', done => {
    reconfigureServer({
      push: {
        adapter: {
          send() {},
          getValidPushTypes() {}
        }
      },
      scheduledPush: true,
    }).then(() => {
      const config = Config.get('test');
      expect(config.hasPushSupport).toEqual(true);
      expect(config.hasPushScheduledSupport).toEqual(true);
      request.get({
        url: 'http://localhost:8378/1/serverInfo',
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Master-Key': 'test',
        },
        json: true,
      }, (error, response, body) => {
        expect(body.features.push.immediatePush).toEqual(true);
        expect(body.features.push.scheduledPush).toEqual(true);
        done();
      })
    }).catch(done.fail);
  });

  it('can respond 200 on path health', done => {
    request.get({
      url: 'http://localhost:8378/1/health',
    }, (error, response) => {
      expect(response.statusCode).toBe(200);
      done();
    });
  });

  it('can create a parse-server v1', done => {
    var parseServer = new ParseServer.default(Object.assign({},
      defaultConfiguration, {
        appId: "aTestApp",
        masterKey: "aTestMasterKey",
        serverURL: "http://localhost:12666/parse",
        __indexBuildCompletionCallbackForTests: promise => {
          promise
            .then(() => {
              expect(Parse.applicationId).toEqual("aTestApp");
              var app = express();
              app.use('/parse', parseServer.app);

              var server = app.listen(12666);
              var obj  = new Parse.Object("AnObject");
              var objId;
              obj.save().then((obj) => {
                objId = obj.id;
                var q = new Parse.Query("AnObject");
                return q.first();
              }).then((obj) => {
                expect(obj.id).toEqual(objId);
                server.close(done);
              }).fail(() => {
                server.close(done);
              })
            });
        }})
    );
  });

  it('can create a parse-server v2', done => {
    let objId;
    let server
    const parseServer = ParseServer.ParseServer(Object.assign({},
      defaultConfiguration, {
        appId: "anOtherTestApp",
        masterKey: "anOtherTestMasterKey",
        serverURL: "http://localhost:12667/parse",
        __indexBuildCompletionCallbackForTests: promise => {
          promise
            .then(() => {
              expect(Parse.applicationId).toEqual("anOtherTestApp");
              const app = express();
              app.use('/parse', parseServer);

              server = app.listen(12667);
              const obj = new Parse.Object("AnObject");
              return obj.save()
            })
            .then(obj => {
              objId = obj.id;
              const q = new Parse.Query("AnObject");
              return q.first();
            })
            .then(obj => {
              expect(obj.id).toEqual(objId);
              server.close(done);
            })
            .catch(error => {
              fail(JSON.stringify(error))
              if (server) {
                server.close(done);
              } else {
                done();
              }
            });
        }}
    ));
  });

  it('has createLiveQueryServer', done => {
    // original implementation through the factory
    expect(typeof ParseServer.ParseServer.createLiveQueryServer).toEqual('function');
    // For import calls
    expect(typeof ParseServer.default.createLiveQueryServer).toEqual('function');
    done();
  });

  it('exposes correct adapters', done => {
    expect(ParseServer.S3Adapter).toThrow();
    expect(ParseServer.GCSAdapter).toThrow('GCSAdapter is not provided by parse-server anymore; please install @parse/gcs-files-adapter');
    expect(ParseServer.FileSystemAdapter).toThrow();
    expect(ParseServer.InMemoryCacheAdapter).toThrow();
    expect(ParseServer.NullCacheAdapter).toThrow();
    done();
  });

  it('properly gives publicServerURL when set', done => {
    reconfigureServer({ publicServerURL: 'https://myserver.com/1' })
      .then(() => {
        var config = Config.get('test', 'http://localhost:8378/1');
        expect(config.mount).toEqual('https://myserver.com/1');
        done();
      });
  });

  it('properly removes trailing slash in mount', done => {
    reconfigureServer({})
      .then(() => {
        var config = Config.get('test', 'http://localhost:8378/1/');
        expect(config.mount).toEqual('http://localhost:8378/1');
        done();
      });
  });

  it('should throw when getting invalid mount', done => {
    reconfigureServer({ publicServerURL: 'blabla:/some' })
      .catch(error => {
        expect(error).toEqual('publicServerURL should be a valid HTTPS URL starting with https://')
        done();
      })
  });

  it('fails if the session length is not a number', done => {
    reconfigureServer({ sessionLength: 'test' })
      .then(done.fail)
      .catch(error => {
        expect(error).toEqual('Session length must be a valid number.');
        done();
      });
  });

  it('fails if the session length is less than or equal to 0', done => {
    reconfigureServer({ sessionLength: '-33' })
      .then(done.fail)
      .catch(error => {
        expect(error).toEqual('Session length must be a value greater than 0.');
        return reconfigureServer({ sessionLength: '0' })
      })
      .catch(error => {
        expect(error).toEqual('Session length must be a value greater than 0.');
        done();
      });
  });

  it('ignores the session length when expireInactiveSessions set to false', (done) => {
    reconfigureServer({
      sessionLength: '-33',
      expireInactiveSessions: false
    })
      .then(() => reconfigureServer({
        sessionLength: '0',
        expireInactiveSessions: false
      }))
      .then(done);
  })

  it('fails if maxLimit is negative', (done) => {
    reconfigureServer({ maxLimit: -100 })
      .catch(error => {
        expect(error).toEqual('Max limit must be a value greater than 0.');
        done();
      });
  });

  it('fails if you try to set revokeSessionOnPasswordReset to non-boolean', done => {
    reconfigureServer({ revokeSessionOnPasswordReset: 'non-bool' })
      .catch(done);
  });

  it('fails if you provides invalid ip in masterKeyIps', done => {
    reconfigureServer({ masterKeyIps: ['invalidIp','1.2.3.4'] })
      .catch(error => {
        expect(error).toEqual('Invalid ip in masterKeyIps: invalidIp');
        done();
      })
  });

  it('should succeed if you provide valid ip in masterKeyIps', done => {
    reconfigureServer({ masterKeyIps: ['1.2.3.4','2001:0db8:0000:0042:0000:8a2e:0370:7334'] })
      .then(done)
  });

  it('should load a middleware', (done) => {
    const obj = {
      middleware: function(req, res, next) {
        next();
      }
    }
    const spy = spyOn(obj, 'middleware').and.callThrough();
    reconfigureServer({
      middleware: obj.middleware
    }).then(() => {
      const query = new Parse.Query('AnObject');
      return query.find();
    }).then(() => {
      expect(spy).toHaveBeenCalled();
      done();
    }).catch(done.fail);
  });

  it('should load a middleware from string', (done) => {
    reconfigureServer({
      middleware: 'spec/support/CustomMiddleware'
    }).then(() => {
      return request.get('http://localhost:8378/1', (err, res) => {
        // Just check that the middleware set the header
        expect(res.headers['x-yolo']).toBe('1');
        done();
      });
    }).catch(done.fail);
  });
});
