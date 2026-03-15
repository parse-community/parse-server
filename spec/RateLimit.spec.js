const RedisCacheAdapter = require('../lib/Adapters/Cache/RedisCacheAdapter').default;
const request = require('../lib/request');

const headers = {
  'Content-Type': 'application/json',
  'X-Parse-Application-Id': 'test',
  'X-Parse-REST-API-Key': 'rest',
};

describe('rate limit', () => {
  it('can limit cloud functions', async () => {
    Parse.Cloud.define('test', () => 'Abc');
    await reconfigureServer({
      rateLimit: [
        {
          requestPath: '/functions/*path',
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
          requestPath: '/functions/*path',
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
        requestPath: '/*path',
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
          requestPath: '/functions/*path',
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
          requestPath: '/functions/*path',
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
          requestPath: '/classes/*path',
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
          requestPath: '/classes/*path',
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
          requestPath: '/classes/Test/*path',
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
          requestPath: '/functions/*path',
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

  it('does not limit internal calls', async () => {
    await reconfigureServer({
      rateLimit: [
        {
          requestPath: '/functions/*path',
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

  describe('zone', () => {
    const middlewares = require('../lib/middlewares');
    it('can use global zone', async () => {
      await reconfigureServer({
        rateLimit: {
          requestPath: '*path',
          requestTimeWindow: 10000,
          requestCount: 1,
          errorResponseMessage: 'Too many requests',
          includeInternalRequests: true,
          zone: Parse.Server.RateLimitZone.global,
        },
      });
      const fakeReq = {
        originalUrl: 'http://example.com/parse/',
        url: 'http://example.com/',
        body: {
          _ApplicationId: 'test',
        },
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
        },
        get: key => {
          return fakeReq.headers[key];
        },
      };
      fakeReq.ip = '127.0.0.1';
      let fakeRes = jasmine.createSpyObj('fakeRes', ['end', 'status', 'setHeader', 'json']);
      await new Promise(resolve => middlewares.handleParseHeaders(fakeReq, fakeRes, resolve));
      fakeReq.ip = '127.0.0.2';
      fakeRes = jasmine.createSpyObj('fakeRes', ['end', 'status', 'setHeader']);
      let resolvingPromise;
      const promise = new Promise(resolve => {
        resolvingPromise = resolve;
      });
      fakeRes.json = jasmine.createSpy('json').and.callFake(resolvingPromise);
      middlewares.handleParseHeaders(fakeReq, fakeRes, () => {
        throw new Error('Should not call next');
      });
      await promise;
      expect(fakeRes.status).toHaveBeenCalledWith(429);
      expect(fakeRes.json).toHaveBeenCalledWith({
        code: Parse.Error.CONNECTION_FAILED,
        error: 'Too many requests',
      });
    });

    it('can use session zone', async () => {
      await reconfigureServer({
        rateLimit: {
          requestPath: '/functions/*path',
          requestTimeWindow: 10000,
          requestCount: 1,
          errorResponseMessage: 'Too many requests',
          includeInternalRequests: true,
          zone: Parse.Server.RateLimitZone.session,
        },
      });
      Parse.Cloud.define('test', () => 'Abc');
      await Parse.User.signUp('username', 'password');
      await Parse.Cloud.run('test');
      await expectAsync(Parse.Cloud.run('test')).toBeRejectedWith(
        new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
      );
      await Parse.User.logIn('username', 'password');
      await Parse.Cloud.run('test');
    });

    it('can use user zone', async () => {
      await reconfigureServer({
        rateLimit: {
          requestPath: '/functions/*path',
          requestTimeWindow: 10000,
          requestCount: 1,
          errorResponseMessage: 'Too many requests',
          includeInternalRequests: true,
          zone: Parse.Server.RateLimitZone.user,
        },
      });
      Parse.Cloud.define('test', () => 'Abc');
      await Parse.User.signUp('username', 'password');
      await Parse.Cloud.run('test');
      await expectAsync(Parse.Cloud.run('test')).toBeRejectedWith(
        new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
      );
      await Parse.User.logIn('username', 'password');
      await expectAsync(Parse.Cloud.run('test')).toBeRejectedWith(
        new Parse.Error(Parse.Error.CONNECTION_FAILED, 'Too many requests')
      );
    });

    it('should rate limit per user independently with user zone', async () => {
      await reconfigureServer({
        rateLimit: {
          requestPath: '/functions/*path',
          requestTimeWindow: 10000,
          requestCount: 1,
          errorResponseMessage: 'Too many requests',
          includeInternalRequests: true,
          zone: Parse.Server.RateLimitZone.user,
        },
      });
      Parse.Cloud.define('test', () => 'Abc');
      // Sign up two different users using REST API to avoid destroying sessions
      const res1 = await request({
        method: 'POST',
        headers: headers,
        url: 'http://localhost:8378/1/users',
        body: JSON.stringify({ username: 'user1', password: 'password' }),
      });
      const sessionToken1 = res1.data.sessionToken;
      const res2 = await request({
        method: 'POST',
        headers: headers,
        url: 'http://localhost:8378/1/users',
        body: JSON.stringify({ username: 'user2', password: 'password' }),
      });
      const sessionToken2 = res2.data.sessionToken;
      // User 1 makes a request — should succeed
      const result1 = await request({
        method: 'POST',
        headers: { ...headers, 'X-Parse-Session-Token': sessionToken1 },
        url: 'http://localhost:8378/1/functions/test',
        body: JSON.stringify({}),
      });
      expect(result1.data.result).toBe('Abc');
      // User 2 makes a request — should also succeed (independent rate limit per user)
      const result2 = await request({
        method: 'POST',
        headers: { ...headers, 'X-Parse-Session-Token': sessionToken2 },
        url: 'http://localhost:8378/1/functions/test',
        body: JSON.stringify({}),
      });
      expect(result2.data.result).toBe('Abc');
      // User 1 makes another request — should be rate limited
      const result3 = await request({
        method: 'POST',
        headers: { ...headers, 'X-Parse-Session-Token': sessionToken1 },
        url: 'http://localhost:8378/1/functions/test',
        body: JSON.stringify({}),
      }).catch(e => e);
      expect(result3.data).toEqual({
        code: Parse.Error.CONNECTION_FAILED,
        error: 'Too many requests',
      });
      // User 2 makes another request — should also be rate limited
      const result4 = await request({
        method: 'POST',
        headers: { ...headers, 'X-Parse-Session-Token': sessionToken2 },
        url: 'http://localhost:8378/1/functions/test',
        body: JSON.stringify({}),
      }).catch(e => e);
      expect(result4.data).toEqual({
        code: Parse.Error.CONNECTION_FAILED,
        error: 'Too many requests',
      });
    });
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
        rateLimit: [{ requestPath: 'a', requestTimeWindow: 1000, requestCount: 3, zone: 'abc' }],
      })
    ).toThrow('rateLimit.zone must be one of global, session, user, or ip');
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
  describe('batch', () => {
    it('should reject batch request when sub-requests exceed rate limit for a path', async () => {
      await reconfigureServer({
        rateLimit: [
          {
            requestPath: '/classes/*path',
            requestTimeWindow: 10000,
            requestCount: 2,
            errorResponseMessage: 'Too many requests',
            includeInternalRequests: true,
          },
        ],
      });
      const response = await request({
        method: 'POST',
        headers: headers,
        url: 'http://localhost:8378/1/batch',
        body: JSON.stringify({
          requests: [
            { method: 'POST', path: '/1/classes/MyObject', body: { key: 'value1' } },
            { method: 'POST', path: '/1/classes/MyObject', body: { key: 'value2' } },
            { method: 'POST', path: '/1/classes/MyObject', body: { key: 'value3' } },
          ],
        }),
      }).catch(e => e);
      expect(response.data).toEqual({
        code: Parse.Error.CONNECTION_FAILED,
        error: 'Too many requests',
      });
    });

    it('should allow batch request when sub-requests are within rate limit', async () => {
      await reconfigureServer({
        rateLimit: [
          {
            requestPath: '/classes/*path',
            requestTimeWindow: 10000,
            requestCount: 5,
            errorResponseMessage: 'Too many requests',
            includeInternalRequests: true,
          },
        ],
      });
      const response = await request({
        method: 'POST',
        headers: headers,
        url: 'http://localhost:8378/1/batch',
        body: JSON.stringify({
          requests: [
            { method: 'POST', path: '/1/classes/MyObject', body: { key: 'value1' } },
            { method: 'POST', path: '/1/classes/MyObject', body: { key: 'value2' } },
            { method: 'POST', path: '/1/classes/MyObject', body: { key: 'value3' } },
          ],
        }),
      });
      expect(response.data.length).toBe(3);
      expect(response.data[0].success).toBeDefined();
    });

    it('should reject batch when sub-requests for one rate-limited path exceed limit among mixed paths', async () => {
      await reconfigureServer({
        rateLimit: [
          {
            requestPath: '/login',
            requestTimeWindow: 10000,
            requestCount: 1,
            errorResponseMessage: 'Too many login requests',
            includeInternalRequests: true,
          },
        ],
      });
      await Parse.User.signUp('testuser', 'password');
      const response = await request({
        method: 'POST',
        headers: headers,
        url: 'http://localhost:8378/1/batch',
        body: JSON.stringify({
          requests: [
            { method: 'POST', path: '/1/classes/MyObject', body: { key: 'value1' } },
            { method: 'POST', path: '/1/login', body: { username: 'testuser', password: 'password' } },
            { method: 'POST', path: '/1/login', body: { username: 'testuser', password: 'wrong' } },
          ],
        }),
      }).catch(e => e);
      expect(response.data).toEqual({
        code: Parse.Error.CONNECTION_FAILED,
        error: 'Too many login requests',
      });
    });

    it('should not count sub-requests whose method does not match requestMethods', async () => {
      await reconfigureServer({
        rateLimit: [
          {
            requestPath: '/classes/*path',
            requestTimeWindow: 10000,
            requestCount: 1,
            requestMethods: 'GET',
            errorResponseMessage: 'Too many requests',
            includeInternalRequests: true,
          },
        ],
      });
      // 3 POST sub-requests should NOT be counted against a GET-only rate limit
      const response = await request({
        method: 'POST',
        headers: headers,
        url: 'http://localhost:8378/1/batch',
        body: JSON.stringify({
          requests: [
            { method: 'POST', path: '/1/classes/MyObject', body: { key: 'value1' } },
            { method: 'POST', path: '/1/classes/MyObject', body: { key: 'value2' } },
            { method: 'POST', path: '/1/classes/MyObject', body: { key: 'value3' } },
          ],
        }),
      });
      expect(response.data.length).toBe(3);
      expect(response.data[0].success).toBeDefined();
    });

    it('should skip batch rate limit check for master key requests when includeMasterKey is false', async () => {
      await reconfigureServer({
        rateLimit: [
          {
            requestPath: '/classes/*path',
            requestTimeWindow: 10000,
            requestCount: 1,
            errorResponseMessage: 'Too many requests',
            includeInternalRequests: true,
          },
        ],
      });
      // Master key requests should bypass rate limit (includeMasterKey defaults to false)
      const masterHeaders = {
        'Content-Type': 'application/json',
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
      };
      const response = await request({
        method: 'POST',
        headers: masterHeaders,
        url: 'http://localhost:8378/1/batch',
        body: JSON.stringify({
          requests: [
            { method: 'POST', path: '/1/classes/MyObject', body: { key: 'value1' } },
            { method: 'POST', path: '/1/classes/MyObject', body: { key: 'value2' } },
            { method: 'POST', path: '/1/classes/MyObject', body: { key: 'value3' } },
          ],
        }),
      });
      expect(response.data.length).toBe(3);
      expect(response.data[0].success).toBeDefined();
    });

    it('should use configured errorResponseMessage when rejecting batch', async () => {
      await reconfigureServer({
        rateLimit: [
          {
            requestPath: '/classes/*path',
            requestTimeWindow: 10000,
            requestCount: 1,
            errorResponseMessage: 'Custom rate limit message',
            includeInternalRequests: true,
          },
        ],
      });
      const response = await request({
        method: 'POST',
        headers: headers,
        url: 'http://localhost:8378/1/batch',
        body: JSON.stringify({
          requests: [
            { method: 'POST', path: '/1/classes/MyObject', body: { key: 'value1' } },
            { method: 'POST', path: '/1/classes/MyObject', body: { key: 'value2' } },
            { method: 'POST', path: '/1/classes/MyObject', body: { key: 'value3' } },
          ],
        }),
      }).catch(e => e);
      expect(response.data).toEqual({
        code: Parse.Error.CONNECTION_FAILED,
        error: 'Custom rate limit message',
      });
    });

    it('should enforce rate limit across direct requests and batch sub-requests', async () => {
      await reconfigureServer({
        rateLimit: [
          {
            requestPath: '/classes/*path',
            requestTimeWindow: 10000,
            requestCount: 2,
            errorResponseMessage: 'Too many requests',
            includeInternalRequests: true,
          },
        ],
      });
      // First direct request — should succeed (count: 1)
      const obj = new Parse.Object('MyObject');
      await obj.save();
      // Batch with 1 sub-request — should succeed (count: 2)
      const response1 = await request({
        method: 'POST',
        headers: headers,
        url: 'http://localhost:8378/1/batch',
        body: JSON.stringify({
          requests: [
            { method: 'POST', path: '/1/classes/MyObject', body: { key: 'value1' } },
          ],
        }),
      });
      expect(response1.data.length).toBe(1);
      expect(response1.data[0].success).toBeDefined();
      // Another batch with 1 sub-request — should be rate limited (count would be 3)
      const response2 = await request({
        method: 'POST',
        headers: headers,
        url: 'http://localhost:8378/1/batch',
        body: JSON.stringify({
          requests: [
            { method: 'POST', path: '/1/classes/MyObject', body: { key: 'value2' } },
          ],
        }),
      }).catch(e => e);
      expect(response2.data).toEqual({
        code: Parse.Error.CONNECTION_FAILED,
        error: 'Too many requests',
      });
    });

    it('should enforce rate limit for multiple batch requests in same window', async () => {
      await reconfigureServer({
        rateLimit: [
          {
            requestPath: '/classes/*path',
            requestTimeWindow: 10000,
            requestCount: 2,
            errorResponseMessage: 'Too many requests',
            includeInternalRequests: true,
          },
        ],
      });
      // First batch with 2 sub-requests — should succeed (count: 2)
      const response1 = await request({
        method: 'POST',
        headers: headers,
        url: 'http://localhost:8378/1/batch',
        body: JSON.stringify({
          requests: [
            { method: 'POST', path: '/1/classes/MyObject', body: { key: 'value1' } },
            { method: 'POST', path: '/1/classes/MyObject', body: { key: 'value2' } },
          ],
        }),
      });
      expect(response1.data.length).toBe(2);
      expect(response1.data[0].success).toBeDefined();
      // Second batch with 1 sub-request — should be rate limited (count would be 3)
      const response2 = await request({
        method: 'POST',
        headers: headers,
        url: 'http://localhost:8378/1/batch',
        body: JSON.stringify({
          requests: [
            { method: 'POST', path: '/1/classes/MyObject', body: { key: 'value3' } },
          ],
        }),
      }).catch(e => e);
      expect(response2.data).toEqual({
        code: Parse.Error.CONNECTION_FAILED,
        error: 'Too many requests',
      });
    });

    it('should not reject batch when sub-requests target non-rate-limited paths', async () => {
      await reconfigureServer({
        rateLimit: [
          {
            requestPath: '/login',
            requestTimeWindow: 10000,
            requestCount: 1,
            errorResponseMessage: 'Too many login requests',
            includeInternalRequests: true,
          },
        ],
      });
      const response = await request({
        method: 'POST',
        headers: headers,
        url: 'http://localhost:8378/1/batch',
        body: JSON.stringify({
          requests: [
            { method: 'POST', path: '/1/classes/MyObject', body: { key: 'value1' } },
            { method: 'POST', path: '/1/classes/MyObject', body: { key: 'value2' } },
            { method: 'POST', path: '/1/classes/MyObject', body: { key: 'value3' } },
          ],
        }),
      });
      expect(response.data.length).toBe(3);
      expect(response.data[0].success).toBeDefined();
    });
  });

  describe_only(() => {
    return process.env.PARSE_SERVER_TEST_CACHE === 'redis';
  })('with RedisCache', function () {
    it('does work with cache', async () => {
      await reconfigureServer({
        rateLimit: [
          {
            requestPath: '/classes/*path',
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
