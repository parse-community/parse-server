'use strict';
const request = require('../lib/request');
const parseServerPackage = require('../package.json');
const MockEmailAdapterWithOptions = require('./support/MockEmailAdapterWithOptions');
const ParseServer = require('../lib/index');
const Config = require('../lib/Config');
const express = require('express');

const MongoStorageAdapter = require('../lib/Adapters/Storage/Mongo/MongoStorageAdapter').default;

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

  it('show warning if any reserved characters in appId', done => {
    spyOn(console, 'warn').and.callFake(() => {});
    reconfigureServer({ appId: 'test!-^' }).then(() => {
      expect(console.warn).toHaveBeenCalled();
      return done();
    });
  });

  it('support http basic authentication with masterkey', done => {
    reconfigureServer({ appId: 'test' }).then(() => {
      request({
        url: 'http://localhost:8378/1/classes/TestObject',
        headers: {
          Authorization: 'Basic ' + Buffer.from('test:' + 'test').toString('base64'),
        },
      }).then(response => {
        expect(response.status).toEqual(200);
        done();
      });
    });
  });

  it('support http basic authentication with javascriptKey', done => {
    reconfigureServer({ appId: 'test' }).then(() => {
      request({
        url: 'http://localhost:8378/1/classes/TestObject',
        headers: {
          Authorization: 'Basic ' + Buffer.from('test:javascript-key=' + 'test').toString('base64'),
        },
      }).then(response => {
        expect(response.status).toEqual(200);
        done();
      });
    });
  });

  it('fails if database is unreachable', async () => {
    const server = new ParseServer.default({
      ...defaultConfiguration,
      databaseAdapter: new MongoStorageAdapter({
        uri: 'mongodb://fake:fake@localhost:43605/drew3',
        mongoOptions: {
          serverSelectionTimeoutMS: 2000,
        },
      }),
    });
    const error = await server.start().catch(e => e);
    expect(`${error}`.includes('MongoServerSelectionError')).toBeTrue();
    await reconfigureServer();
  });

  describe('mail adapter', () => {
    it('can load email adapter via object', done => {
      reconfigureServer({
        appName: 'unused',
        verifyUserEmails: true,
        emailAdapter: MockEmailAdapterWithOptions({
          fromAddress: 'parse@example.com',
          apiKey: 'k',
          domain: 'd',
        }),
        publicServerURL: 'http://localhost:8378/1',
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
          },
        },
        publicServerURL: 'http://localhost:8378/1',
      }).then(done, fail);
    });

    it('can load email adapter via module name', async () => {
      const options = {
        appName: 'unused',
        verifyUserEmails: true,
        emailAdapter: {
          module: 'mock-mail-adapter',
          options: {},
        },
        publicServerURL: 'http://localhost:8378/1',
      };
      await reconfigureServer(options);
      const config = Config.get('test');
      const mailAdapter = config.userController.adapter;
      expect(mailAdapter.sendMail).toBeDefined();
    });

    it('can load email adapter via only module name', async () => {
      const options = {
        appName: 'unused',
        verifyUserEmails: true,
        emailAdapter: 'mock-mail-adapter',
        publicServerURL: 'http://localhost:8378/1',
      };
      await reconfigureServer(options);
      const config = Config.get('test');
      const mailAdapter = config.userController.adapter;
      expect(mailAdapter.sendMail).toBeDefined();
    });

    it('throws if you initialize email adapter incorrectly', async () => {
      const options = {
        appName: 'unused',
        verifyUserEmails: true,
        emailAdapter: {
          module: 'mock-mail-adapter',
          options: { throw: true },
        },
        publicServerURL: 'http://localhost:8378/1',
      };
      expectAsync(reconfigureServer(options)).toBeRejected('MockMailAdapterConstructor');
    });
  });

  it('can report the server version', async done => {
    await reconfigureServer();
    request({
      url: 'http://localhost:8378/1/serverInfo',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
      },
    }).then(response => {
      const body = response.data;
      expect(body.parseServerVersion).toEqual(parseServerPackage.version);
      done();
    });
  });

  it('can properly sets the push support', async done => {
    await reconfigureServer();
    // default config passes push options
    const config = Config.get('test');
    expect(config.hasPushSupport).toEqual(true);
    expect(config.hasPushScheduledSupport).toEqual(false);
    request({
      url: 'http://localhost:8378/1/serverInfo',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
      },
      json: true,
    }).then(response => {
      const body = response.data;
      expect(body.features.push.immediatePush).toEqual(true);
      expect(body.features.push.scheduledPush).toEqual(false);
      done();
    });
  });

  it('can properly sets the push support when not configured', done => {
    reconfigureServer({
      push: undefined, // force no config
    })
      .then(() => {
        const config = Config.get('test');
        expect(config.hasPushSupport).toEqual(false);
        expect(config.hasPushScheduledSupport).toEqual(false);
        request({
          url: 'http://localhost:8378/1/serverInfo',
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-Master-Key': 'test',
          },
          json: true,
        }).then(response => {
          const body = response.data;
          expect(body.features.push.immediatePush).toEqual(false);
          expect(body.features.push.scheduledPush).toEqual(false);
          done();
        });
      })
      .catch(done.fail);
  });

  it('can properly sets the push support ', done => {
    reconfigureServer({
      push: {
        adapter: {
          send() {},
          getValidPushTypes() {},
        },
      },
    })
      .then(() => {
        const config = Config.get('test');
        expect(config.hasPushSupport).toEqual(true);
        expect(config.hasPushScheduledSupport).toEqual(false);
        request({
          url: 'http://localhost:8378/1/serverInfo',
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-Master-Key': 'test',
          },
          json: true,
        }).then(response => {
          const body = response.data;
          expect(body.features.push.immediatePush).toEqual(true);
          expect(body.features.push.scheduledPush).toEqual(false);
          done();
        });
      })
      .catch(done.fail);
  });

  it('can properly sets the push schedule support', done => {
    reconfigureServer({
      push: {
        adapter: {
          send() {},
          getValidPushTypes() {},
        },
      },
      scheduledPush: true,
    })
      .then(() => {
        const config = Config.get('test');
        expect(config.hasPushSupport).toEqual(true);
        expect(config.hasPushScheduledSupport).toEqual(true);
        request({
          url: 'http://localhost:8378/1/serverInfo',
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-Master-Key': 'test',
          },
          json: true,
        }).then(response => {
          const body = response.data;
          expect(body.features.push.immediatePush).toEqual(true);
          expect(body.features.push.scheduledPush).toEqual(true);
          done();
        });
      })
      .catch(done.fail);
  });

  it('can respond 200 on path health', done => {
    request({
      url: 'http://localhost:8378/1/health',
    }).then(response => {
      expect(response.status).toBe(200);
      done();
    });
  });

  it('can create a parse-server v1', async () => {
    await reconfigureServer({ appId: 'aTestApp' });
    const parseServer = new ParseServer.default(
      Object.assign({}, defaultConfiguration, {
        appId: 'aTestApp',
        masterKey: 'aTestMasterKey',
        serverURL: 'http://localhost:12666/parse',
      })
    );
    await parseServer.start();
    expect(Parse.applicationId).toEqual('aTestApp');
    const app = express();
    app.use('/parse', parseServer.app);
    const server = app.listen(12666);
    const obj = new Parse.Object('AnObject');
    await obj.save();
    const query = await new Parse.Query('AnObject').first();
    expect(obj.id).toEqual(query.id);
    await new Promise(resolve => server.close(resolve));
  });

  it('can create a parse-server v2', async () => {
    await reconfigureServer({ appId: 'anOtherTestApp' });
    const parseServer = ParseServer.ParseServer(
      Object.assign({}, defaultConfiguration, {
        appId: 'anOtherTestApp',
        masterKey: 'anOtherTestMasterKey',
        serverURL: 'http://localhost:12667/parse',
      })
    );

    expect(Parse.applicationId).toEqual('anOtherTestApp');
    await parseServer.start();
    const app = express();
    app.use('/parse', parseServer.app);
    const server = app.listen(12667);
    const obj = new Parse.Object('AnObject');
    await obj.save();
    const q = await new Parse.Query('AnObject').first();
    expect(obj.id).toEqual(q.id);
    await new Promise(resolve => server.close(resolve));
  });

  it('has createLiveQueryServer', done => {
    // original implementation through the factory
    expect(typeof ParseServer.ParseServer.createLiveQueryServer).toEqual('function');
    // For import calls
    expect(typeof ParseServer.default.createLiveQueryServer).toEqual('function');
    done();
  });

  it('exposes correct adapters', done => {
    expect(ParseServer.S3Adapter).toThrow(
      'S3Adapter is not provided by parse-server anymore; please install @parse/s3-files-adapter'
    );
    expect(ParseServer.GCSAdapter).toThrow(
      'GCSAdapter is not provided by parse-server anymore; please install @parse/gcs-files-adapter'
    );
    expect(ParseServer.FileSystemAdapter).toThrow();
    expect(ParseServer.InMemoryCacheAdapter).toThrow();
    expect(ParseServer.NullCacheAdapter).toThrow();
    done();
  });

  it('properly gives publicServerURL when set', done => {
    reconfigureServer({ publicServerURL: 'https://myserver.com/1' }).then(() => {
      const config = Config.get('test', 'http://localhost:8378/1');
      expect(config.mount).toEqual('https://myserver.com/1');
      done();
    });
  });

  it('properly removes trailing slash in mount', done => {
    reconfigureServer({}).then(() => {
      const config = Config.get('test', 'http://localhost:8378/1/');
      expect(config.mount).toEqual('http://localhost:8378/1');
      done();
    });
  });

  it('should throw when getting invalid mount', done => {
    reconfigureServer({ publicServerURL: 'blabla:/some' }).catch(error => {
      expect(error).toEqual('publicServerURL should be a valid HTTPS URL starting with https://');
      done();
    });
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
        return reconfigureServer({ sessionLength: '0' });
      })
      .catch(error => {
        expect(error).toEqual('Session length must be a value greater than 0.');
        done();
      });
  });

  it('ignores the session length when expireInactiveSessions set to false', done => {
    reconfigureServer({
      sessionLength: '-33',
      expireInactiveSessions: false,
    })
      .then(() =>
        reconfigureServer({
          sessionLength: '0',
          expireInactiveSessions: false,
        })
      )
      .then(done);
  });

  it('fails if default limit is negative', async () => {
    await expectAsync(reconfigureServer({ defaultLimit: -1 })).toBeRejectedWith(
      'Default limit must be a value greater than 0.'
    );
  });

  it('fails if default limit is wrong type', async () => {
    for (const value of ['invalid', {}, [], true]) {
      await expectAsync(reconfigureServer({ defaultLimit: value })).toBeRejectedWith(
        'Default limit must be a number.'
      );
    }
  });

  it('fails if default limit is zero', async () => {
    await expectAsync(reconfigureServer({ defaultLimit: 0 })).toBeRejectedWith(
      'Default limit must be a value greater than 0.'
    );
  });

  it('fails if maxLimit is negative', done => {
    reconfigureServer({ maxLimit: -100 }).catch(error => {
      expect(error).toEqual('Max limit must be a value greater than 0.');
      done();
    });
  });

  it('fails if you try to set revokeSessionOnPasswordReset to non-boolean', done => {
    reconfigureServer({ revokeSessionOnPasswordReset: 'non-bool' }).catch(done);
  });

  it('fails if you provides invalid ip in masterKeyIps', done => {
    reconfigureServer({ masterKeyIps: ['invalidIp', '1.2.3.4'] }).catch(error => {
      expect(error).toEqual(
        'The Parse Server option "masterKeyIps" contains an invalid IP address "invalidIp".'
      );
      done();
    });
  });

  it('should succeed if you provide valid ip in masterKeyIps', done => {
    reconfigureServer({
      masterKeyIps: ['1.2.3.4', '2001:0db8:0000:0042:0000:8a2e:0370:7334'],
    }).then(done);
  });

  it('should set default masterKeyIps for IPv4 and IPv6 localhost', () => {
    const definitions = require('../lib/Options/Definitions.js');
    expect(definitions.ParseServerOptions.masterKeyIps.default).toEqual(['127.0.0.1', '::1']);
  });

  it('should load a middleware', done => {
    const obj = {
      middleware: function (req, res, next) {
        next();
      },
    };
    const spy = spyOn(obj, 'middleware').and.callThrough();
    reconfigureServer({
      middleware: obj.middleware,
    })
      .then(() => {
        const query = new Parse.Query('AnObject');
        return query.find();
      })
      .then(() => {
        expect(spy).toHaveBeenCalled();
        done();
      })
      .catch(done.fail);
  });

  it('should allow direct access', async () => {
    const RESTController = Parse.CoreManager.getRESTController();
    const spy = spyOn(Parse.CoreManager, 'setRESTController').and.callThrough();
    await reconfigureServer({
      directAccess: true,
    });
    expect(spy).toHaveBeenCalledTimes(2);
    Parse.CoreManager.setRESTController(RESTController);
  });

  it('should load a middleware from string', done => {
    reconfigureServer({
      middleware: 'spec/support/CustomMiddleware',
    })
      .then(() => {
        return request({ url: 'http://localhost:8378/1' }).then(fail, res => {
          // Just check that the middleware set the header
          expect(res.headers['x-yolo']).toBe('1');
          done();
        });
      })
      .catch(done.fail);
  });

  it('can call start', async () => {
    await reconfigureServer({ appId: 'aTestApp' });
    const config = {
      ...defaultConfiguration,
      appId: 'aTestApp',
      masterKey: 'aTestMasterKey',
      serverURL: 'http://localhost:12701/parse',
    };
    const parseServer = new ParseServer.ParseServer(config);
    await parseServer.start();
    expect(Parse.applicationId).toEqual('aTestApp');
    expect(Parse.serverURL).toEqual('http://localhost:12701/parse');
    const app = express();
    app.use('/parse', parseServer.app);
    const server = app.listen(12701);
    const testObject = new Parse.Object('TestObject');
    await expectAsync(testObject.save()).toBeResolved();
    await new Promise(resolve => server.close(resolve));
  });

  it('start is required to mount', async () => {
    await reconfigureServer({ appId: 'aTestApp' });
    const config = {
      ...defaultConfiguration,
      appId: 'aTestApp',
      masterKey: 'aTestMasterKey',
      serverURL: 'http://localhost:12701/parse',
    };
    const parseServer = new ParseServer.ParseServer(config);
    expect(Parse.applicationId).toEqual('aTestApp');
    expect(Parse.serverURL).toEqual('http://localhost:12701/parse');
    const app = express();
    app.use('/parse', parseServer.app);
    const server = app.listen(12701);
    const response = await request({
      headers: {
        'X-Parse-Application-Id': 'aTestApp',
      },
      method: 'POST',
      url: 'http://localhost:12701/parse/classes/TestObject',
    }).catch(e => new Parse.Error(e.data.code, e.data.error));
    expect(response).toEqual(
      new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'Invalid server state: initialized')
    );
    const health = await request({
      url: 'http://localhost:12701/parse/health',
    }).catch(e => e);
    spyOn(console, 'warn').and.callFake(() => {});
    const verify = await ParseServer.default.verifyServerUrl();
    expect(verify).not.toBeTrue();
    expect(console.warn).toHaveBeenCalledWith(
      `\nWARNING, Unable to connect to 'http://localhost:12701/parse'. Cloud code and push notifications may be unavailable!\n`
    );
    expect(health.data.status).toBe('initialized');
    expect(health.status).toBe(503);
    await new Promise(resolve => server.close(resolve));
  });

  it('can get starting state', async () => {
    await reconfigureServer({ appId: 'test2', silent: false });
    const parseServer = new ParseServer.ParseServer({
      ...defaultConfiguration,
      appId: 'test2',
      masterKey: 'abc',
      serverURL: 'http://localhost:12668/parse',
      async cloud() {
        await new Promise(resolve => setTimeout(resolve, 2000));
      },
    });
    const express = require('express');
    const app = express();
    app.use('/parse', parseServer.app);
    const server = app.listen(12668);
    const startingPromise = parseServer.start();
    const health = await request({
      url: 'http://localhost:12668/parse/health',
    }).catch(e => e);
    expect(health.data.status).toBe('starting');
    expect(health.status).toBe(503);
    expect(health.headers['retry-after']).toBe('1');
    const response = await ParseServer.default.verifyServerUrl();
    expect(response).toBeTrue();
    await startingPromise;
    await new Promise(resolve => server.close(resolve));
  });

  it('should not fail when Google signin is introduced without the optional clientId', done => {
    const jwt = require('jsonwebtoken');
    const authUtils = require('../lib/Adapters/Auth/utils');

    reconfigureServer({
      auth: { google: {} },
    })
      .then(() => {
        const fakeClaim = {
          iss: 'https://accounts.google.com',
          aud: 'secret',
          exp: Date.now(),
          sub: 'the_user_id',
        };
        const fakeDecodedToken = { header: { kid: '123', alg: 'RS256' } };
        spyOn(authUtils, 'getHeaderFromToken').and.callFake(() => fakeDecodedToken);
        spyOn(jwt, 'verify').and.callFake(() => fakeClaim);
        const user = new Parse.User();
        user
          .linkWith('google', {
            authData: { id: 'the_user_id', id_token: 'the_token' },
          })
          .then(done);
      })
      .catch(done.fail);
  });
});
