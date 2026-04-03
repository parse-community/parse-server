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

    it_id('ac0315e3-a3b1-447d-b61b-2354d0d4bc18')(it)('should block sessions routes', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore'] });
      await expectAsync(
        new Parse.Query('_Session').find()
      ).toBeRejectedWith(jasmine.objectContaining({ code: Parse.Error.OPERATION_FORBIDDEN }));
    });

    it_id('da4120c3-7ab7-4e83-aa62-609f27ae885b')(it)('should block roles routes', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore'] });
      const role = new Parse.Role('TestRole', new Parse.ACL());
      await expectAsync(role.save()).toBeRejectedWith(
        jasmine.objectContaining({ code: Parse.Error.OPERATION_FORBIDDEN })
      );
    });

    it_id('72f36878-f32e-43f7-9713-c8c09e0d182b')(it)('should block installations routes', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore'] });
      await expectAsync(
        new Parse.Query('_Installation').find()
      ).toBeRejectedWith(jasmine.objectContaining({ code: Parse.Error.OPERATION_FORBIDDEN }));
    });

    it_id('a00cc50a-380b-46ff-a254-88db6846c9ba')(it)('should block push route', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore'] });
      const request = require('../lib/request');
      try {
        await request({
          headers: {
            'Content-Type': 'application/json',
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
          method: 'POST',
          url: 'http://localhost:8378/1/push',
          body: JSON.stringify({ where: {}, data: { alert: 'test' } }),
        });
        fail('should have thrown');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      }
    });

    it_id('f6028cf7-b21f-4469-b8f0-0cb5b4091137')(it)('should block schemas routes', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore'] });
      const request = require('../lib/request');
      try {
        await request({
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
          method: 'GET',
          url: 'http://localhost:8378/1/schemas',
        });
        fail('should have thrown');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      }
    });

    it_id('28f8c930-3105-41b5-b5ea-06c3db9f0f59')(it)('should block config route', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore'] });
      const request = require('../lib/request');
      try {
        await request({
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
          method: 'GET',
          url: 'http://localhost:8378/1/config',
        });
        fail('should have thrown');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      }
    });

    it_id('eda6b96a-b6cf-4b33-8d1b-09164fc5ba8e')(it)('should block cloud functions route', async () => {
      await reconfigureServer({
        routeAllowList: ['classes/GameScore'],
        cloud: () => {
          Parse.Cloud.define('blockedFn', () => 'should not run');
        },
      });
      await expectAsync(Parse.Cloud.run('blockedFn')).toBeRejectedWith(
        jasmine.objectContaining({ code: Parse.Error.OPERATION_FORBIDDEN })
      );
    });

    it_id('95b18f73-9dde-4490-8d32-e5e3dab5fe55')(it)('should block jobs route', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore'] });
      const request = require('../lib/request');
      try {
        await request({
          headers: {
            'Content-Type': 'application/json',
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
          method: 'POST',
          url: 'http://localhost:8378/1/jobs',
          body: JSON.stringify({}),
        });
        fail('should have thrown');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      }
    });

    it_id('5b6d4d4c-8586-451b-924d-9bc5dfdcd6e3')(it)('should block batch route', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore'] });
      const request = require('../lib/request');
      try {
        await request({
          headers: {
            'Content-Type': 'application/json',
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
          method: 'POST',
          url: 'http://localhost:8378/1/batch',
          body: JSON.stringify({ requests: [] }),
        });
        fail('should have thrown');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      }
    });

    it_id('15b9499b-30e9-40b7-a11e-b23b94afd46a')(it)('should block events route', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore'] });
      const request = require('../lib/request');
      try {
        await request({
          headers: {
            'Content-Type': 'application/json',
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
          method: 'POST',
          url: 'http://localhost:8378/1/events/AppOpened',
          body: JSON.stringify({}),
        });
        fail('should have thrown');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      }
    });

    it_id('b8fb05d5-cb02-4177-932a-a3216c00752f')(it)('should block serverInfo route', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore'] });
      const request = require('../lib/request');
      try {
        await request({
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
          method: 'GET',
          url: 'http://localhost:8378/1/serverInfo',
        });
        fail('should have thrown');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      }
    });

    it_id('f1e46758-d8d6-41f3-a12d-816ed2db378c')(it)('should block aggregate route', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore'] });
      const request = require('../lib/request');
      try {
        await request({
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
          method: 'GET',
          url: 'http://localhost:8378/1/aggregate/GameScore',
        });
        fail('should have thrown');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      }
    });

    it_id('27076b00-7b83-491b-b9ca-4c17fb792f83')(it)('should block push_audiences route', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore'] });
      const request = require('../lib/request');
      try {
        await request({
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
          method: 'GET',
          url: 'http://localhost:8378/1/push_audiences',
        });
        fail('should have thrown');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      }
    });

    it_id('00c686f5-80d1-4820-b99a-336a969e057f')(it)('should block security route', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore'] });
      const request = require('../lib/request');
      try {
        await request({
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
          method: 'GET',
          url: 'http://localhost:8378/1/security',
        });
        fail('should have thrown');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      }
    });

    it_id('383a1983-4105-4227-be58-715a5440045f')(it)('should block hooks routes', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore'] });
      const request = require('../lib/request');
      try {
        await request({
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
          method: 'GET',
          url: 'http://localhost:8378/1/hooks/functions',
        });
        fail('should have thrown');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      }
    });

    it_id('7be7c4ac-0105-482e-b277-277a1501fa1b')(it)('should block cloud_code routes', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore'] });
      const request = require('../lib/request');
      try {
        await request({
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
          method: 'GET',
          url: 'http://localhost:8378/1/cloud_code/jobs',
        });
        fail('should have thrown');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      }
    });

    it_id('89de4fc5-33d9-4243-b054-243394f5ae15')(it)('should block scriptlog route', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore'] });
      const request = require('../lib/request');
      try {
        await request({
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
          method: 'GET',
          url: 'http://localhost:8378/1/scriptlog',
        });
        fail('should have thrown');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      }
    });

    it_id('82ecee96-3c63-4f48-a69e-7daee345b0e4')(it)('should block purge route', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore'] });
      const request = require('../lib/request');
      try {
        await request({
          headers: {
            'Content-Type': 'application/json',
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
          method: 'DELETE',
          url: 'http://localhost:8378/1/purge/GameScore',
        });
        fail('should have thrown');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      }
    });

    it_id('9cddbf7f-021e-4f67-9a44-2649e41459cf')(it)('should block graphql-config route', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore'] });
      const request = require('../lib/request');
      try {
        await request({
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
          method: 'GET',
          url: 'http://localhost:8378/1/graphql-config',
        });
        fail('should have thrown');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      }
    });

    it_id('92b4d263-b76d-4ffa-9d00-2f49a8bb4238')(it)('should block validate_purchase route', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore'] });
      const request = require('../lib/request');
      try {
        await request({
          headers: {
            'Content-Type': 'application/json',
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
          method: 'POST',
          url: 'http://localhost:8378/1/validate_purchase',
          body: JSON.stringify({}),
        });
        fail('should have thrown');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      }
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

    it_id('ed3797f6-38ee-4bf0-806f-a7242ae14b5c')(it)('should block logout route', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore'] });
      const request = require('../lib/request');
      try {
        await request({
          headers: {
            'Content-Type': 'application/json',
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
          method: 'POST',
          url: 'http://localhost:8378/1/logout',
        });
        fail('should have thrown');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      }
    });

    it_id('2d7ce7cd-7d61-418f-8255-451304e18f11')(it)('should block loginAs route', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore'] });
      const request = require('../lib/request');
      try {
        await request({
          headers: {
            'Content-Type': 'application/json',
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
          method: 'POST',
          url: 'http://localhost:8378/1/loginAs',
          body: JSON.stringify({}),
        });
        fail('should have thrown');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      }
    });

    it_id('808c7f7e-3918-4851-915c-205b1f807965')(it)('should block upgradeToRevocableSession route', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore'] });
      const request = require('../lib/request');
      try {
        await request({
          headers: {
            'Content-Type': 'application/json',
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
          method: 'POST',
          url: 'http://localhost:8378/1/upgradeToRevocableSession',
          body: JSON.stringify({}),
        });
        fail('should have thrown');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      }
    });

    it_id('ad06367e-b220-4f9f-9ee6-8756bea36937')(it)('should block verificationEmailRequest route', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore'] });
      const request = require('../lib/request');
      try {
        await request({
          headers: {
            'Content-Type': 'application/json',
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
          method: 'POST',
          url: 'http://localhost:8378/1/verificationEmailRequest',
          body: JSON.stringify({}),
        });
        fail('should have thrown');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      }
    });

    it_id('a14df8c8-a09a-47fa-a208-74f8e429f060')(it)('should block verifyPassword route', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore'] });
      const request = require('../lib/request');
      try {
        await request({
          headers: {
            'Content-Type': 'application/json',
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
          method: 'POST',
          url: 'http://localhost:8378/1/verifyPassword',
          body: JSON.stringify({}),
        });
        fail('should have thrown');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      }
    });

    it_id('acb37217-ab57-42f5-86b3-f81c61b28003')(it)('should block requestPasswordReset route', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore'] });
      const request = require('../lib/request');
      try {
        await request({
          headers: {
            'Content-Type': 'application/json',
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
          method: 'POST',
          url: 'http://localhost:8378/1/requestPasswordReset',
          body: JSON.stringify({}),
        });
        fail('should have thrown');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      }
    });

    it_id('4b67e9cc-8068-4848-a536-229818d0c0ed')(it)('should block challenge route', async () => {
      await reconfigureServer({ routeAllowList: ['classes/GameScore'] });
      const request = require('../lib/request');
      try {
        await request({
          headers: {
            'Content-Type': 'application/json',
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
          method: 'POST',
          url: 'http://localhost:8378/1/challenge',
          body: JSON.stringify({}),
        });
        fail('should have thrown');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      }
    });
  });
});
