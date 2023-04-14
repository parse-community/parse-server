const RedisCacheAdapter = require('../lib/Adapters/Cache/RedisCacheAdapter').default;
describe('rate limit', () => {
  it('can limit cloud functions', async () => {
    Parse.Cloud.define('test', () => 'Abc');
    await reconfigureServer({
      rateLimit: [
        {
          requestPath: '/functions/*',
          requestTimeWindow: 10000,
          requestCount: 1,
          errorResponseMessage: 'Too many requests',
          includeInternalRequests: true,
        },
      ],
    });
    const response1 = await Parse.Cloud.run('test');
    expect(response1).toBe('Abc');
    await expectAsync(Parse.Cloud.run('test')).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
  });

  it('can limit cloud functions with user session token', async () => {
    await Parse.User.signUp('myUser', 'password');
    Parse.Cloud.define('test', () => 'Abc');
    await reconfigureServer({
      rateLimit: [
        {
          requestPath: '/functions/*',
          requestTimeWindow: 10000,
          requestCount: 1,
          errorResponseMessage: 'Too many requests',
          includeInternalRequests: true,
        },
      ],
    });
    const response1 = await Parse.Cloud.run('test');
    expect(response1).toBe('Abc');
    await expectAsync(Parse.Cloud.run('test')).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
  });

  it('can add global limit', async () => {
    Parse.Cloud.define('test', () => 'Abc');
    await reconfigureServer({
      rateLimit: {
        requestPath: '*',
        requestTimeWindow: 10000,
        requestCount: 1,
        errorResponseMessage: 'Too many requests',
        includeInternalRequests: true,
      },
    });
    const response1 = await Parse.Cloud.run('test');
    expect(response1).toBe('Abc');
    await expectAsync(Parse.Cloud.run('test')).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
    await expectAsync(new Parse.Object('Test').save()).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
  });

  it('can limit cloud with validator', async () => {
    Parse.Cloud.define('test', () => 'Abc', {
      rateLimit: {
        requestTimeWindow: 10000,
        requestCount: 1,
        errorResponseMessage: 'Too many requests',
        includeInternalRequests: true,
      },
    });
    const response1 = await Parse.Cloud.run('test');
    expect(response1).toBe('Abc');
    await expectAsync(Parse.Cloud.run('test')).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
  });

  it('can skip with masterKey', async () => {
    Parse.Cloud.define('test', () => 'Abc');
    await reconfigureServer({
      rateLimit: [
        {
          requestPath: '/functions/*',
          requestTimeWindow: 10000,
          requestCount: 1,
          errorResponseMessage: 'Too many requests',
          includeInternalRequests: true,
        },
      ],
    });
    const response1 = await Parse.Cloud.run('test', null, { useMasterKey: true });
    expect(response1).toBe('Abc');
    const response2 = await Parse.Cloud.run('test', null, { useMasterKey: true });
    expect(response2).toBe('Abc');
  });

  it('should run with masterKey', async () => {
    Parse.Cloud.define('test', () => 'Abc');
    await reconfigureServer({
      rateLimit: [
        {
          requestPath: '/functions/*',
          requestTimeWindow: 10000,
          requestCount: 1,
          includeMasterKey: true,
          errorResponseMessage: 'Too many requests',
          includeInternalRequests: true,
        },
      ],
    });
    const response1 = await Parse.Cloud.run('test', null, { useMasterKey: true });
    expect(response1).toBe('Abc');
    await expectAsync(Parse.Cloud.run('test')).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
  });

  it('can limit saving objects', async () => {
    await reconfigureServer({
      rateLimit: [
        {
          requestPath: '/classes/*',
          requestTimeWindow: 10000,
          requestCount: 1,
          errorResponseMessage: 'Too many requests',
          includeInternalRequests: true,
        },
      ],
    });
    const obj = new Parse.Object('Test');
    await obj.save();
    await expectAsync(obj.save()).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
  });

  it('can set method to post', async () => {
    await reconfigureServer({
      rateLimit: [
        {
          requestPath: '/classes/*',
          requestTimeWindow: 10000,
          requestCount: 1,
          requestMethods: 'POST',
          errorResponseMessage: 'Too many requests',
          includeInternalRequests: true,
        },
      ],
    });
    const obj = new Parse.Object('Test');
    await obj.save();
    await obj.save();
    const obj2 = new Parse.Object('Test');
    await expectAsync(obj2.save()).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
  });

  it('can use a validator for post', async () => {
    Parse.Cloud.beforeSave('Test', () => {}, {
      rateLimit: {
        requestTimeWindow: 10000,
        requestCount: 1,
        errorResponseMessage: 'Too many requests',
        includeInternalRequests: true,
      },
    });
    const obj = new Parse.Object('Test');
    await obj.save();
    await expectAsync(obj.save()).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
  });

  it('can use a validator for file', async () => {
    Parse.Cloud.beforeSave(Parse.File, () => {}, {
      rateLimit: {
        requestTimeWindow: 10000,
        requestCount: 1,
        errorResponseMessage: 'Too many requests',
        includeInternalRequests: true,
      },
    });
    const file = new Parse.File('yolo.txt', [1, 2, 3], 'text/plain');
    await file.save();
    const file2 = new Parse.File('yolo.txt', [1, 2, 3], 'text/plain');
    await expectAsync(file2.save()).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
  });

  it('can set method to get', async () => {
    await reconfigureServer({
      rateLimit: [
        {
          requestPath: '/classes/Test',
          requestTimeWindow: 10000,
          requestCount: 1,
          requestMethods: 'GET',
          errorResponseMessage: 'Too many requests',
          includeInternalRequests: true,
        },
      ],
    });
    const obj = new Parse.Object('Test');
    await obj.save();
    await obj.save();
    await new Parse.Query('Test').first();
    await expectAsync(new Parse.Query('Test').first()).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
  });

  it('can use a validator', async () => {
    await reconfigureServer({ silent: false });
    Parse.Cloud.beforeFind('TestObject', () => {}, {
      rateLimit: {
        requestTimeWindow: 10000,
        requestCount: 1,
        errorResponseMessage: 'Too many requests',
        includeInternalRequests: true,
      },
    });
    const obj = new Parse.Object('TestObject');
    await obj.save();
    await obj.save();
    await new Parse.Query('TestObject').first();
    await expectAsync(new Parse.Query('TestObject').first()).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
    await expectAsync(new Parse.Query('TestObject').get('abc')).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
  });

  it('can set method to delete', async () => {
    await reconfigureServer({
      rateLimit: [
        {
          requestPath: '/classes/Test/*',
          requestTimeWindow: 10000,
          requestCount: 1,
          requestMethods: 'DELETE',
          errorResponseMessage: 'Too many requests',
          includeInternalRequests: true,
        },
      ],
    });
    const obj = new Parse.Object('Test');
    await obj.save();
    await obj.destroy();
    await expectAsync(obj.destroy()).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
  });

  it('can set beforeDelete', async () => {
    const obj = new Parse.Object('TestDelete');
    await obj.save();
    Parse.Cloud.beforeDelete('TestDelete', () => {}, {
      rateLimit: {
        requestTimeWindow: 10000,
        requestCount: 1,
        errorResponseMessage: 'Too many requests',
        includeInternalRequests: true,
      },
    });
    await obj.destroy();
    await expectAsync(obj.destroy()).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
  });

  it('can set beforeLogin', async () => {
    Parse.Cloud.beforeLogin(() => {}, {
      rateLimit: {
        requestTimeWindow: 10000,
        requestCount: 1,
        errorResponseMessage: 'Too many requests',
        includeInternalRequests: true,
      },
    });
    await Parse.User.signUp('myUser', 'password');
    await Parse.User.logIn('myUser', 'password');
    await expectAsync(Parse.User.logIn('myUser', 'password')).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
  });

  it('can define limits via rateLimit and define', async () => {
    await reconfigureServer({
      rateLimit: [
        {
          requestPath: '/functions/*',
          requestTimeWindow: 10000,
          requestCount: 100,
          errorResponseMessage: 'Too many requests',
          includeInternalRequests: true,
        },
      ],
    });
    Parse.Cloud.define('test', () => 'Abc', {
      rateLimit: {
        requestTimeWindow: 10000,
        requestCount: 1,
        includeInternalRequests: true,
      },
    });
    const response1 = await Parse.Cloud.run('test');
    expect(response1).toBe('Abc');
    await expectAsync(Parse.Cloud.run('test')).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests.')
    );
  });

  fit('can define default rateLimit', async () => {
    const rateLimit = require('../lib/Options/Definitions.js').ParseServerOptions.rateLimit.default;
    const emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: () => {},
      sendMail: () => {},
    };
    await reconfigureServer({
      rateLimit: rateLimit.map(limit => {
        limit.includeInternalRequests = true;
        return limit;
      }),

      appName: 'passwordPolicy',
      emailAdapter: emailAdapter,
      publicServerURL: 'http://localhost:8378/1',
    });

    await Promise.all([
      Parse.User.signUp('username', 'pass'),
      Parse.User.signUp('username2', 'pass'),
    ]);
    await expectAsync(Parse.User.signUp('username3', 'pass')).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );

    const failedLogin = async () => {
      try {
        await Parse.User.logIn('user', 'pass');
      } catch (e) {
        if (e.code !== Parse.Error.OBJECT_NOT_FOUND) {
          throw e;
        }
      }
    };

    await Promise.all([failedLogin(), failedLogin()]);
    await expectAsync(failedLogin()).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );

    await expectAsync(Parse.User.verifyPassword('username', 'password')).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );

    const mockUser = new Parse.User();
    mockUser.set('email', 'test@example.com');
    mockUser.set('username', 'test');
    mockUser.set('password', 'password');
    await mockUser.signUp(null, { useMasterKey: true });

    await Promise.all([
      Parse.User.requestPasswordReset('test@example.com'),
      Parse.User.requestPasswordReset('test@example.com'),
    ]);
    await expectAsync(Parse.User.requestPasswordReset('test@example.com')).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
    await expectAsync(Parse.User.requestEmailVerification('test@example.com')).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );

    const getMe = async () => {
      const headers = {
        'Content-Type': 'application/json',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
        'X-Parse-Session-Token': 'abc',
      };
      const request = require('../lib/request');
      const res = await request({
        headers,
        url: 'http://localhost:8378/1/sessions/me',
      }).catch(e => e);
      if (res.data.code === Parse.Error.CONNECTION_FAILED) {
        throw new Parse.Error(res.data.code, res.data.error);
      }
    };

    await Promise.all([getMe(), getMe()]);
    await expectAsync(getMe()).toBeRejectedWith(
      new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
    );
  });

  it('does not limit internal calls', async () => {
    await reconfigureServer({
      rateLimit: [
        {
          requestPath: '/functions/*',
          requestTimeWindow: 10000,
          requestCount: 1,
          errorResponseMessage: 'Too many requests',
        },
      ],
    });
    Parse.Cloud.define('test1', () => 'Abc');
    Parse.Cloud.define('test2', async () => {
      await Parse.Cloud.run('test1');
      await Parse.Cloud.run('test1');
    });
    await Parse.Cloud.run('test2');
  });

  it('can validate rateLimit', async () => {
    const Config = require('../lib/Config');
    const validateRateLimit = ({ rateLimit }) => Config.validateRateLimit(rateLimit);
    expect(() =>
      validateRateLimit({ rateLimit: 'a', requestTimeWindow: 1000, requestCount: 3 })
    ).toThrow('rateLimit must be an array or object');
    expect(() => validateRateLimit({ rateLimit: ['a'] })).toThrow(
      'rateLimit must be an array of objects'
    );
    expect(() => validateRateLimit({ rateLimit: [{ requestPath: [] }] })).toThrow(
      'rateLimit.requestPath must be a string'
    );
    expect(() =>
      validateRateLimit({ rateLimit: [{ requestTimeWindow: [], requestPath: 'a' }] })
    ).toThrow('rateLimit.requestTimeWindow must be a number');
    expect(() =>
      validateRateLimit({
        rateLimit: [
          {
            includeInternalRequests: [],
            requestTimeWindow: 1000,
            requestCount: 3,
            requestPath: 'a',
          },
        ],
      })
    ).toThrow('rateLimit.includeInternalRequests must be a boolean');
    expect(() =>
      validateRateLimit({
        rateLimit: [{ requestCount: [], requestTimeWindow: 1000, requestPath: 'a' }],
      })
    ).toThrow('rateLimit.requestCount must be a number');
    expect(() =>
      validateRateLimit({
        rateLimit: [
          { errorResponseMessage: [], requestTimeWindow: 1000, requestCount: 3, requestPath: 'a' },
        ],
      })
    ).toThrow('rateLimit.errorResponseMessage must be a string');
    expect(() =>
      validateRateLimit({ rateLimit: [{ requestCount: 3, requestPath: 'abc' }] })
    ).toThrow('rateLimit.requestTimeWindow must be defined');
    expect(() =>
      validateRateLimit({ rateLimit: [{ requestTimeWindow: 3, requestPath: 'abc' }] })
    ).toThrow('rateLimit.requestCount must be defined');
    expect(() =>
      validateRateLimit({ rateLimit: [{ requestTimeWindow: 3, requestCount: 'abc' }] })
    ).toThrow('rateLimit.requestPath must be defined');
    await expectAsync(
      reconfigureServer({
        rateLimit: [{ requestTimeWindow: 3, requestCount: 1, path: 'abc', requestPath: 'a' }],
      })
    ).toBeRejectedWith(`Invalid rate limit option "path"`);
  });
  describe_only(() => {
    return process.env.PARSE_SERVER_TEST_CACHE === 'redis';
  })('with RedisCache', function () {
    it('does work with cache', async () => {
      await reconfigureServer({
        rateLimit: [
          {
            requestPath: '/classes/*',
            requestTimeWindow: 10000,
            requestCount: 1,
            errorResponseMessage: 'Too many requests',
            includeInternalRequests: true,
            redisUrl: 'redis://localhost:6379',
          },
        ],
      });
      const obj = new Parse.Object('Test');
      await obj.save();
      await expectAsync(obj.save()).toBeRejectedWith(
        new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
      );
      const cache = new RedisCacheAdapter();
      await cache.connect();
      const value = await cache.get('rl:127.0.0.1');
      expect(value).toEqual(2);
      const ttl = await cache.client.ttl('rl:127.0.0.1');
      expect(ttl).toEqual(10);
    });
  });
});
