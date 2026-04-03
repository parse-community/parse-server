'use strict';

const Config = require('../lib/Config');

describe('routeAllowList', () => {
  describe('config validation', () => {
    it_id('da6e6e19-a25a-4a4f-87e9-4179ac470bb4')(it)('should accept undefined (feature inactive)', async () => {
      await reconfigureServer({ routeAllowList: undefined });
      expect(Config.get(Parse.applicationId).routeAllowList).toBeUndefined();
    });

    it_id('ae221b65-c0e5-4564-bed3-08e73c07a872')(it)('should accept an empty array', async () => {
      await reconfigureServer({ routeAllowList: [] });
      expect(Config.get(Parse.applicationId).routeAllowList).toEqual([]);
    });

    it_id('4d48aa24-2bc9-48af-9b59-d558c38a1173')(it)('should accept valid regex patterns', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore', 'classes/Chat.*', 'functions/.*'] });
      expect(Config.get(Parse.applicationId).routeAllowList).toEqual(['classes/GameScore', 'classes/Chat.*', 'functions/.*']);
    });

    it_id('136c091e-77e4-4c19-a1dc-a644ce2239eb')(it)('should reject non-array values', async () => {
      for (const value of ['string', 123, true, {}]) {
        await expectAsync(reconfigureServer({ routeAllowList: value })).toBeRejected();
      }
    });

    it_id('7f30d08d-c9db-4a35-bcc0-11cae45f106b')(it)('should reject arrays with non-string elements', async () => {
      await expectAsync(reconfigureServer({ routeAllowList: [123] })).toBeRejected();
      await expectAsync(reconfigureServer({ routeAllowList: [null] })).toBeRejected();
      await expectAsync(reconfigureServer({ routeAllowList: [{}] })).toBeRejected();
    });

    it_id('528d3457-b0d9-4f3f-8ff7-e3b9a24a6d3a')(it)('should reject invalid regex patterns', async () => {
      await expectAsync(reconfigureServer({ routeAllowList: ['classes/[invalid'] })).toBeRejected();
    });

    it_id('94ba256a-a84c-4b29-8c1e-d65bb5100da3')(it)('should compile regex patterns and cache them', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore', 'users'] });
      const config = Config.get(Parse.applicationId);
      expect(config._routeAllowListRegex).toBeDefined();
      expect(config._routeAllowListRegex.length).toBe(2);
      expect(config._routeAllowListRegex[0]).toEqual(jasmine.any(RegExp));
      expect(config._routeAllowListRegex[0].test('classes/GameScore')).toBe(true);
      expect(config._routeAllowListRegex[0].test('classes/Other')).toBe(false);
      expect(config._routeAllowListRegex[1].test('users')).toBe(true);
    });
  });

  describe('middleware', () => {
    it_id('d9fb2eea-7508-4f68-bdbe-a0270595b4bf')(it)('should allow all requests when routeAllowList is undefined', async () => {
      await reconfigureServer({ routeAllowList: undefined });
      const obj = new Parse.Object('GameScore');
      obj.set('score', 100);
      await obj.save();
      const query = new Parse.Query('GameScore');
      const results = await query.find();
      expect(results.length).toBe(1);
    });

    it_id('3dd73684-e7b5-41dc-868b-31a64bdfb307')(it)('should block all external requests when routeAllowList is empty array', async () => {
      await reconfigureServer({ routeAllowList: [] });
      const obj = new Parse.Object('GameScore');
      obj.set('score', 100);
      await expectAsync(obj.save()).toBeRejectedWith(
        jasmine.objectContaining({ code: Parse.Error.OPERATION_FORBIDDEN })
      );
    });

    it_id('be57f97e-8248-44b6-9d03-881a889f0416')(it)('should allow matching class routes', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore'] });
      const obj = new Parse.Object('GameScore');
      obj.set('score', 100);
      await obj.save();
      const query = new Parse.Query('GameScore');
      const results = await query.find();
      expect(results.length).toBe(1);
    });

    it_id('425449e4-72b1-4a91-8053-921c477fefd4')(it)('should block non-matching class routes', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore'] });
      const obj = new Parse.Object('Secret');
      obj.set('data', 'hidden');
      await expectAsync(obj.save()).toBeRejectedWith(
        jasmine.objectContaining({ code: Parse.Error.OPERATION_FORBIDDEN })
      );
    });

    it_id('bb12a497-1187-4234-bdcc-2457d41823af')(it)('should support regex wildcard patterns', async () => {
      await reconfigureServer({ routeAllowList: ['classes/Chat.*'] });
      const obj1 = new Parse.Object('ChatMessage');
      obj1.set('text', 'hello');
      await obj1.save();

      const obj2 = new Parse.Object('ChatRoom');
      obj2.set('name', 'general');
      await obj2.save();

      const obj3 = new Parse.Object('Secret');
      obj3.set('data', 'hidden');
      await expectAsync(obj3.save()).toBeRejectedWith(
        jasmine.objectContaining({ code: Parse.Error.OPERATION_FORBIDDEN })
      );
    });

    it_id('980472ec-9004-40b7-b6dc-9184292e0bba')(it)('should enforce full-match anchoring', async () => {
      await reconfigureServer({ routeAllowList: ['classes/Chat'] });
      const obj = new Parse.Object('ChatRoom');
      obj.set('name', 'general');
      await expectAsync(obj.save()).toBeRejectedWith(
        jasmine.objectContaining({ code: Parse.Error.OPERATION_FORBIDDEN })
      );
    });

    it_id('ca6fedeb-f35f-48ab-baf5-b6379b96e864')(it)('should allow master key requests to bypass', async () => {
      await reconfigureServer({ routeAllowList: [] });
      const obj = new Parse.Object('GameScore');
      obj.set('score', 100);
      await obj.save(null, { useMasterKey: true });
      const query = new Parse.Query('GameScore');
      const results = await query.find({ useMasterKey: true });
      expect(results.length).toBe(1);
    });

    it_id('99bfdf7f-f80e-489d-9880-3d6c81391fd1')(it)('should allow Cloud Code internal calls to bypass', async () => {
      await reconfigureServer({
        routeAllowList: ['functions/testInternal'],
        cloud: () => {
          Parse.Cloud.define('testInternal', async () => {
            const obj = new Parse.Object('BlockedClass');
            obj.set('data', 'from-cloud');
            await obj.save(null, { useMasterKey: true });
            const query = new Parse.Query('BlockedClass');
            const results = await query.find({ useMasterKey: true });
            return { count: results.length };
          });
        },
      });
      const result = await Parse.Cloud.run('testInternal');
      expect(result.count).toBe(1);
    });

    it_id('34ea792f-1dcc-4399-adcf-d2d6cdfc8c6f')(it)('should allow non-class routes like users when matched', async () => {
      await reconfigureServer({ routeAllowList: ['users', 'login'] });
      const user = new Parse.User();
      user.set('username', 'testuser');
      user.set('password', 'testpass');
      await user.signUp();
      expect(user.getSessionToken()).toBeDefined();
    });

    it_id('c3beed92-edd8-4cf1-be54-331a6dfaf077')(it)('should block non-class routes like users when not matched', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore'] });
      const user = new Parse.User();
      user.set('username', 'testuser');
      user.set('password', 'testpass');
      await expectAsync(user.signUp()).toBeRejectedWith(
        jasmine.objectContaining({ code: Parse.Error.OPERATION_FORBIDDEN })
      );
    });

    it_id('618ab39b-84f2-4547-aa27-fe478731c83f')(it)('should return sanitized error message by default', async () => {
      await reconfigureServer({ routeAllowList: [] });
      const obj = new Parse.Object('GameScore');
      obj.set('score', 100);
      try {
        await obj.save();
        fail('should have thrown');
      } catch (e) {
        expect(e.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
        expect(e.message).toBe('Permission denied');
      }
    });

    it_id('51232d42-5c8a-4633-acc2-e0fbc40ea3da')(it)('should return detailed error message when sanitization is disabled', async () => {
      await reconfigureServer({ routeAllowList: [], enableSanitizedErrorResponse: false });
      const obj = new Parse.Object('GameScore');
      obj.set('score', 100);
      try {
        await obj.save();
        fail('should have thrown');
      } catch (e) {
        expect(e.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
        expect(e.message).toContain('routeAllowList');
      }
    });

    it_id('7146a4a8-9175-4a5c-b966-287e6121cb3e')(it)('should allow object get by ID when class pattern includes subpaths', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore.*'] });
      const obj = new Parse.Object('GameScore');
      obj.set('score', 100);
      await obj.save();
      const query = new Parse.Query('GameScore');
      const result = await query.get(obj.id);
      expect(result.get('score')).toBe(100);
    });

    it_id('81156f55-e766-445d-b978-80b92e614696')(it)('should allow queries with where constraints (query string in URL)', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore'] });
      const obj = new Parse.Object('GameScore');
      obj.set('score', 100);
      await obj.save();
      const query = new Parse.Query('GameScore');
      query.equalTo('score', 100);
      const results = await query.find();
      expect(results.length).toBe(1);
    });

    it_id('1160e6e5-c680-4f18-b1d0-ea5699c97eeb')(it)('should allow maintenance key requests to bypass', async () => {
      await reconfigureServer({ routeAllowList: [] });
      const obj = new Parse.Object('GameScore');
      obj.set('score', 100);
      await obj.save(null, { useMasterKey: true });
      const request = require('../lib/request');
      const res = await request({
        headers: {
          'Content-Type': 'application/json',
          'X-Parse-Application-Id': 'test',
          'X-Parse-Maintenance-Key': 'testing',
        },
        method: 'GET',
        url: 'http://localhost:8378/1/classes/GameScore',
      });
      expect(res.data.results.length).toBe(1);
    });

    it_id('9536b2c0-b11e-4f57-92e4-0093a40b6284')(it)('should match multiple patterns independently', async () => {
      await reconfigureServer({
        routeAllowList: ['classes/AllowedA', 'classes/AllowedB', 'functions/.*'],
      });

      const objA = new Parse.Object('AllowedA');
      objA.set('data', 'a');
      await objA.save();

      const objB = new Parse.Object('AllowedB');
      objB.set('data', 'b');
      await objB.save();

      const objC = new Parse.Object('Blocked');
      objC.set('data', 'c');
      await expectAsync(objC.save()).toBeRejectedWith(
        jasmine.objectContaining({ code: Parse.Error.OPERATION_FORBIDDEN })
      );
    });

    it_id('ad700243-ea26-41e7-b237-bd6b6aa99d46')(it)('should block health endpoint when not in allow list', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore'] });
      const request = require('../lib/request');
      try {
        await request({
          method: 'GET',
          url: 'http://localhost:8378/1/health',
        });
        fail('should have thrown');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      }
    });

    it_id('b59dd736-029d-4769-b69d-ac3aed6e4c3f')(it)('should allow health endpoint when in allow list', async () => {
      await reconfigureServer({ routeAllowList: ['health'] });
      const request = require('../lib/request');
      const res = await request({
        method: 'GET',
        url: 'http://localhost:8378/1/health',
      });
      expect(res.data.status).toBe('ok');
    });

    it_id('60466f80-27af-456c-a05d-8f5ceaf95451')(it)('should allow read-only master key requests to bypass', async () => {
      await reconfigureServer({ routeAllowList: [] });
      const request = require('../lib/request');
      const res = await request({
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Master-Key': 'read-only-test',
        },
        method: 'GET',
        url: 'http://localhost:8378/1/classes/GameScore',
      });
      expect(res.data.results).toEqual([]);
    });

    it_id('4fe57cc2-f104-491c-843b-64afc11c6fa3')(it)('should block all routes when routeAllowList is empty array and no key provided', async () => {
      await reconfigureServer({ routeAllowList: [] });
      const request = require('../lib/request');
      try {
        await request({
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
          method: 'GET',
          url: 'http://localhost:8378/1/classes/GameScore',
        });
        fail('should have thrown');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      }
    });

    it_id('f3dd5622-036c-45bf-ab76-c31b59028642')(it)('should block health endpoint even when routeAllowList is empty array', async () => {
      await reconfigureServer({ routeAllowList: [] });
      const request = require('../lib/request');
      try {
        await request({
          method: 'GET',
          url: 'http://localhost:8378/1/health',
        });
        fail('should have thrown');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      }
    });

    it_id('229cab22-dad3-4d08-8de5-64d813658596')(it)('should block all route groups when not in allow list', async () => {
      await reconfigureServer({
        routeAllowList: ['classes/GameScore'],
        cloud: () => {
          Parse.Cloud.define('blockedFn', () => 'should not run');
        },
      });
      const request = require('../lib/request');
      const routes = [
        { method: 'GET', path: 'sessions' },
        { method: 'GET', path: 'roles' },
        { method: 'GET', path: 'installations' },
        { method: 'POST', path: 'push' },
        { method: 'GET', path: 'schemas' },
        { method: 'GET', path: 'config' },
        { method: 'POST', path: 'jobs' },
        { method: 'POST', path: 'batch' },
        { method: 'POST', path: 'events/AppOpened' },
        { method: 'GET', path: 'serverInfo' },
        { method: 'GET', path: 'aggregate/GameScore' },
        { method: 'GET', path: 'push_audiences' },
        { method: 'GET', path: 'security' },
        { method: 'GET', path: 'hooks/functions' },
        { method: 'GET', path: 'cloud_code/jobs' },
        { method: 'GET', path: 'scriptlog' },
        { method: 'DELETE', path: 'purge/GameScore' },
        { method: 'GET', path: 'graphql-config' },
        { method: 'POST', path: 'validate_purchase' },
        { method: 'POST', path: 'logout' },
        { method: 'POST', path: 'loginAs' },
        { method: 'POST', path: 'upgradeToRevocableSession' },
        { method: 'POST', path: 'verificationEmailRequest' },
        { method: 'POST', path: 'verifyPassword' },
        { method: 'POST', path: 'requestPasswordReset' },
        { method: 'POST', path: 'challenge' },
        { method: 'GET', path: 'health' },
        { method: 'POST', path: 'functions/blockedFn' },
      ];
      for (const route of routes) {
        try {
          await request({
            headers: {
              'Content-Type': 'application/json',
              'X-Parse-Application-Id': 'test',
              'X-Parse-REST-API-Key': 'rest',
            },
            method: route.method,
            url: `http://localhost:8378/1/${route.path}`,
            body: route.method === 'POST' ? JSON.stringify({}) : undefined,
          });
          fail(`should have blocked ${route.method} ${route.path}`);
        } catch (e) {
          expect(e.data.code).withContext(`${route.method} ${route.path}`).toBe(Parse.Error.OPERATION_FORBIDDEN);
        }
      }
    });
  });
});
