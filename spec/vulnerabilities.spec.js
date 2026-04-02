const http = require('http');
const express = require('express');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const ws = require('ws');
const request = require('../lib/request');
const Config = require('../lib/Config');
const { ParseGraphQLServer } = require('../lib/GraphQL/ParseGraphQLServer');

describe('Vulnerabilities', () => {
  describe('(GHSA-8xq9-g7ch-35hg) Custom object ID allows to acquire role privilege', () => {
    beforeAll(async () => {
      await reconfigureServer({ allowCustomObjectId: true });
      Parse.allowCustomObjectId = true;
    });

    afterAll(async () => {
      await reconfigureServer({ allowCustomObjectId: false });
      Parse.allowCustomObjectId = false;
    });

    it('denies user creation with poisoned object ID', async () => {
      const logger = require('../lib/logger').default;
      const loggerErrorSpy = spyOn(logger, 'error').and.callThrough();
      loggerErrorSpy.calls.reset();
      await expectAsync(
        new Parse.User({ id: 'role:a', username: 'a', password: '123' }).save()
      ).toBeRejectedWith(new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Permission denied'));
      expect(loggerErrorSpy).toHaveBeenCalledWith('Sanitized error:', jasmine.stringContaining("Invalid object ID."));
    });

    describe('existing sessions for users with poisoned object ID', () => {
      /** @type {Parse.User} */
      let poisonedUser;
      /** @type {Parse.User} */
      let innocentUser;

      beforeAll(async () => {
        const parseServer = await global.reconfigureServer();
        const databaseController = parseServer.config.databaseController;
        [poisonedUser, innocentUser] = await Promise.all(
          ['role:abc', 'abc'].map(async id => {
            // Create the users directly on the db to bypass the user creation check
            await databaseController.create('_User', { objectId: id });
            // Use the master key to create a session for them to bypass the session check
            return Parse.User.loginAs(id);
          })
        );
      });

      it('refuses session token of user with poisoned object ID', async () => {
        await expectAsync(
          new Parse.Query(Parse.User).find({ sessionToken: poisonedUser.getSessionToken() })
        ).toBeRejectedWith(new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'Invalid object ID.'));
        await new Parse.Query(Parse.User).find({ sessionToken: innocentUser.getSessionToken() });
      });

    });

    describe('legacy session upgrade for user with poisoned object ID', () => {
      // Legacy session tokens (_session_token on _User) are a MongoDB-only legacy feature
      it_only_db('mongo')('refuses legacy session upgrade for user with poisoned object ID', async () => {
        const parseServer = await global.reconfigureServer();
        const databaseController = parseServer.config.databaseController;
        const poisonedId = 'role:legacy';
        const legacyToken = 'legacy-poisoned-token';
        // Create user with poisoned ID and legacy session token directly in DB
        await databaseController.create('_User', {
          objectId: poisonedId,
          _session_token: legacyToken,
        });
        await expectAsync(
          request({
            method: 'POST',
            url: 'http://localhost:8378/1/upgradeToRevocableSession',
            headers: {
              'Content-Type': 'application/json',
              'X-Parse-Application-Id': 'test',
              'X-Parse-REST-API-Key': 'rest',
              'X-Parse-Session-Token': legacyToken,
            },
            body: JSON.stringify({}),
          })
        ).toBeRejected();
      });
    });
  });

  describe('Object prototype pollution', () => {
    it('denies object prototype to be polluted with keyword "constructor"', async () => {
      const headers = {
        'Content-Type': 'application/json',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      };
      const response = await request({
        headers: headers,
        method: 'POST',
        url: 'http://localhost:8378/1/classes/PP',
        body: JSON.stringify({
          obj: {
            constructor: {
              prototype: {
                dummy: 0,
              },
            },
          },
        }),
      }).catch(e => e);
      expect(response.status).toBe(400);
      const text = JSON.parse(response.text);
      expect(text.code).toBe(Parse.Error.INVALID_KEY_NAME);
      expect(text.error).toBe('Prohibited keyword in request data: {"key":"constructor"}.');
      expect(Object.prototype.dummy).toBeUndefined();
    });

    it('denies object prototype to be polluted with keypath string "constructor"', async () => {
      const headers = {
        'Content-Type': 'application/json',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      };
      const objResponse = await request({
        headers: headers,
        method: 'POST',
        url: 'http://localhost:8378/1/classes/PP',
        body: JSON.stringify({
          obj: {},
        }),
      }).catch(e => e);
      const pollResponse = await request({
        headers: headers,
        method: 'PUT',
        url: `http://localhost:8378/1/classes/PP/${objResponse.data.objectId}`,
        body: JSON.stringify({
          'obj.constructor.prototype.dummy': {
            __op: 'Increment',
            amount: 1,
          },
        }),
      }).catch(e => e);
      expect(Object.prototype.dummy).toBeUndefined();
      expect(pollResponse.status).toBe(400);
      const text = JSON.parse(pollResponse.text);
      expect(text.code).toBe(Parse.Error.INVALID_KEY_NAME);
      expect(text.error).toBe('Prohibited keyword in request data: {"key":"constructor"}.');
      expect(Object.prototype.dummy).toBeUndefined();
    });

    it('denies object prototype to be polluted with keyword "__proto__"', async () => {
      const headers = {
        'Content-Type': 'application/json',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      };
      const response = await request({
        headers: headers,
        method: 'POST',
        url: 'http://localhost:8378/1/classes/PP',
        body: JSON.stringify({ 'obj.__proto__.dummy': 0 }),
      }).catch(e => e);
      expect(response.status).toBe(400);
      const text = JSON.parse(response.text);
      expect(text.code).toBe(Parse.Error.INVALID_KEY_NAME);
      expect(text.error).toBe('Prohibited keyword in request data: {"key":"__proto__"}.');
      expect(Object.prototype.dummy).toBeUndefined();
    });
  });

  describe('(GHSA-5j86-7r7m-p8h6) Cloud function name prototype chain bypass', () => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest',
    };

    it('rejects "constructor" as cloud function name', async () => {
      const response = await request({
        headers,
        method: 'POST',
        url: 'http://localhost:8378/1/functions/constructor',
        body: JSON.stringify({}),
      }).catch(e => e);
      expect(response.status).toBe(400);
      const text = JSON.parse(response.text);
      expect(text.code).toBe(Parse.Error.SCRIPT_FAILED);
      expect(text.error).toContain('Invalid function');
    });

    it('rejects "toString" as cloud function name', async () => {
      const response = await request({
        headers,
        method: 'POST',
        url: 'http://localhost:8378/1/functions/toString',
        body: JSON.stringify({}),
      }).catch(e => e);
      expect(response.status).toBe(400);
      const text = JSON.parse(response.text);
      expect(text.code).toBe(Parse.Error.SCRIPT_FAILED);
      expect(text.error).toContain('Invalid function');
    });

    it('rejects "valueOf" as cloud function name', async () => {
      const response = await request({
        headers,
        method: 'POST',
        url: 'http://localhost:8378/1/functions/valueOf',
        body: JSON.stringify({}),
      }).catch(e => e);
      expect(response.status).toBe(400);
      const text = JSON.parse(response.text);
      expect(text.code).toBe(Parse.Error.SCRIPT_FAILED);
      expect(text.error).toContain('Invalid function');
    });

    it('rejects "hasOwnProperty" as cloud function name', async () => {
      const response = await request({
        headers,
        method: 'POST',
        url: 'http://localhost:8378/1/functions/hasOwnProperty',
        body: JSON.stringify({}),
      }).catch(e => e);
      expect(response.status).toBe(400);
      const text = JSON.parse(response.text);
      expect(text.code).toBe(Parse.Error.SCRIPT_FAILED);
      expect(text.error).toContain('Invalid function');
    });

    it('rejects "__proto__.toString" as cloud function name', async () => {
      const response = await request({
        headers,
        method: 'POST',
        url: 'http://localhost:8378/1/functions/__proto__.toString',
        body: JSON.stringify({}),
      }).catch(e => e);
      expect(response.status).toBe(400);
      const text = JSON.parse(response.text);
      expect(text.code).toBe(Parse.Error.SCRIPT_FAILED);
      expect(text.error).toContain('Invalid function');
    });

    it('still executes a legitimately defined cloud function', async () => {
      Parse.Cloud.define('legitimateFunction', () => 'hello');
      const response = await request({
        headers,
        method: 'POST',
        url: 'http://localhost:8378/1/functions/legitimateFunction',
        body: JSON.stringify({}),
      });
      expect(response.status).toBe(200);
      expect(JSON.parse(response.text).result).toBe('hello');
    });
  });

  describe('(GHSA-4263-jgmp-7pf4) Cloud function prototype chain dispatch via registered function', () => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest',
    };

    beforeEach(() => {
      Parse.Cloud.define('legitimateFunction', () => 'ok');
    });

    it('rejects prototype chain traversal from a registered function name', async () => {
      const response = await request({
        headers,
        method: 'POST',
        url: 'http://localhost:8378/1/functions/legitimateFunction.__proto__.__proto__.constructor',
        body: JSON.stringify({}),
      }).catch(e => e);
      expect(response.status).toBe(400);
      const text = JSON.parse(response.text);
      expect(text.code).toBe(Parse.Error.SCRIPT_FAILED);
      expect(text.error).toContain('Invalid function');
    });

    it('rejects prototype chain traversal via single __proto__ from a registered function', async () => {
      const response = await request({
        headers,
        method: 'POST',
        url: 'http://localhost:8378/1/functions/legitimateFunction.__proto__.constructor',
        body: JSON.stringify({}),
      }).catch(e => e);
      expect(response.status).toBe(400);
      const text = JSON.parse(response.text);
      expect(text.code).toBe(Parse.Error.SCRIPT_FAILED);
      expect(text.error).toContain('Invalid function');
    });

    it('does not crash the server when prototype chain traversal is attempted', async () => {
      const maliciousNames = [
        'legitimateFunction.__proto__.__proto__.constructor',
        'legitimateFunction.__proto__.constructor',
        'legitimateFunction.constructor',
        'legitimateFunction.__proto__',
      ];
      for (const name of maliciousNames) {
        const response = await request({
          headers,
          method: 'POST',
          url: `http://localhost:8378/1/functions/${encodeURIComponent(name)}`,
          body: JSON.stringify({}),
        }).catch(e => e);
        expect(response.status).toBe(400);
      }
      // Verify server is still responsive after all attempts
      const healthResponse = await request({
        headers,
        method: 'POST',
        url: 'http://localhost:8378/1/functions/legitimateFunction',
        body: JSON.stringify({}),
      });
      expect(healthResponse.status).toBe(200);
      expect(JSON.parse(healthResponse.text).result).toBe('ok');
    });
  });

  describe('(GHSA-vpj2-qq7w-5qq6) Cloud function validator bypass via prototype.constructor traversal', () => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest',
    };

    it('rejects prototype.constructor traversal on function keyword handler', async () => {
      Parse.Cloud.define('protectedFn', function () { return 'secret'; }, { requireUser: true });
      const response = await request({
        headers,
        method: 'POST',
        url: 'http://localhost:8378/1/functions/protectedFn.prototype.constructor',
        body: JSON.stringify({}),
      }).catch(e => e);
      expect(response.status).toBe(400);
      const text = JSON.parse(response.text);
      expect(text.code).toBe(Parse.Error.SCRIPT_FAILED);
      expect(text.error).toContain('Invalid function');
    });

    it('rejects prototype traversal without constructor suffix', async () => {
      Parse.Cloud.define('protectedFn2', function () { return 'secret'; }, { requireUser: true });
      const response = await request({
        headers,
        method: 'POST',
        url: 'http://localhost:8378/1/functions/protectedFn2.prototype',
        body: JSON.stringify({}),
      }).catch(e => e);
      expect(response.status).toBe(400);
      const text = JSON.parse(response.text);
      expect(text.code).toBe(Parse.Error.SCRIPT_FAILED);
      expect(text.error).toContain('Invalid function');
    });

    it('enforces validator when calling function normally', async () => {
      Parse.Cloud.define('protectedFn3', function () { return 'secret'; }, { requireUser: true });
      const response = await request({
        headers,
        method: 'POST',
        url: 'http://localhost:8378/1/functions/protectedFn3',
        body: JSON.stringify({}),
      }).catch(e => e);
      expect(response.status).toBe(400);
      const text = JSON.parse(response.text);
      expect(text.code).toBe(Parse.Error.VALIDATION_ERROR);
    });

    it('enforces requireMaster validator against prototype.constructor bypass', async () => {
      Parse.Cloud.define('masterOnlyFn', function () { return 'admin data'; }, { requireMaster: true });
      const response = await request({
        headers,
        method: 'POST',
        url: 'http://localhost:8378/1/functions/masterOnlyFn.prototype.constructor',
        body: JSON.stringify({}),
      }).catch(e => e);
      expect(response.status).toBe(400);
      const text = JSON.parse(response.text);
      expect(text.code).toBe(Parse.Error.SCRIPT_FAILED);
      expect(text.error).toContain('Invalid function');
    });
  });

  describe('(GHSA-3v4q-4q9g-x83q) Prototype pollution via application ID in trigger store', () => {
    const prototypeProperties = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__'];

    for (const prop of prototypeProperties) {
      it(`rejects "${prop}" as application ID in cloud function call`, async () => {
        const response = await request({
          headers: {
            'Content-Type': 'application/json',
            'X-Parse-Application-Id': prop,
            'X-Parse-REST-API-Key': 'rest',
          },
          method: 'POST',
          url: 'http://localhost:8378/1/functions/testFunction',
          body: JSON.stringify({}),
        }).catch(e => e);
        expect(response.status).toBe(403);
      });

      it(`rejects "${prop}" as application ID with arbitrary API key in cloud function call`, async () => {
        const response = await request({
          headers: {
            'Content-Type': 'application/json',
            'X-Parse-Application-Id': prop,
            'X-Parse-REST-API-Key': 'ANY_KEY',
          },
          method: 'POST',
          url: 'http://localhost:8378/1/functions/testFunction',
          body: JSON.stringify({}),
        }).catch(e => e);
        expect(response.status).toBe(403);
      });

      it(`rejects "${prop}" as application ID in class query`, async () => {
        const response = await request({
          headers: {
            'Content-Type': 'application/json',
            'X-Parse-Application-Id': prop,
            'X-Parse-REST-API-Key': 'rest',
          },
          method: 'GET',
          url: 'http://localhost:8378/1/classes/TestClass',
        }).catch(e => e);
        expect(response.status).toBe(403);
      });
    }
  });

  describe('Request denylist', () => {
    describe('(GHSA-q342-9w2p-57fp) Denylist bypass via sibling nested objects', () => {
      it('denies _bsontype:Code after a sibling nested object', async () => {
        const headers = {
          'Content-Type': 'application/json',
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
        };
        const response = await request({
          headers,
          method: 'POST',
          url: 'http://localhost:8378/1/classes/Bypass',
          body: JSON.stringify({
            obj: {
              metadata: {},
              _bsontype: 'Code',
              code: 'malicious',
            },
          }),
        }).catch(e => e);
        expect(response.status).toBe(400);
        const text = JSON.parse(response.text);
        expect(text.code).toBe(Parse.Error.INVALID_KEY_NAME);
        expect(text.error).toBe(
          'Prohibited keyword in request data: {"key":"_bsontype","value":"Code"}.'
        );
      });

      it('denies _bsontype:Code after a sibling nested array', async () => {
        const headers = {
          'Content-Type': 'application/json',
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
        };
        const response = await request({
          headers,
          method: 'POST',
          url: 'http://localhost:8378/1/classes/Bypass',
          body: JSON.stringify({
            obj: {
              tags: ['safe'],
              _bsontype: 'Code',
              code: 'malicious',
            },
          }),
        }).catch(e => e);
        expect(response.status).toBe(400);
        const text = JSON.parse(response.text);
        expect(text.code).toBe(Parse.Error.INVALID_KEY_NAME);
        expect(text.error).toBe(
          'Prohibited keyword in request data: {"key":"_bsontype","value":"Code"}.'
        );
      });

      it('denies __proto__ after a sibling nested object', async () => {
        const headers = {
          'Content-Type': 'application/json',
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
        };
        const response = await request({
          headers,
          method: 'POST',
          url: 'http://localhost:8378/1/classes/PP',
          body: JSON.stringify(
            JSON.parse('{"profile": {"name": "alice"}, "__proto__": {"isAdmin": true}}')
          ),
        }).catch(e => e);
        expect(response.status).toBe(400);
        const text = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        expect(text.code).toBe(Parse.Error.INVALID_KEY_NAME);
        expect(text.error).toContain('__proto__');
      });

      it('denies constructor after a sibling nested object', async () => {
        const headers = {
          'Content-Type': 'application/json',
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
        };
        const response = await request({
          headers,
          method: 'POST',
          url: 'http://localhost:8378/1/classes/Bypass',
          body: JSON.stringify({
            obj: {
              data: {},
              constructor: { prototype: { polluted: true } },
            },
          }),
        }).catch(e => e);
        expect(response.status).toBe(400);
        const text = JSON.parse(response.text);
        expect(text.code).toBe(Parse.Error.INVALID_KEY_NAME);
        expect(text.error).toBe(
          'Prohibited keyword in request data: {"key":"constructor"}.'
        );
      });

      it('denies _bsontype:Code nested inside a second sibling object', async () => {
        const headers = {
          'Content-Type': 'application/json',
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
        };
        const response = await request({
          headers,
          method: 'POST',
          url: 'http://localhost:8378/1/classes/Bypass',
          body: JSON.stringify({
            field1: { safe: true },
            field2: { _bsontype: 'Code', code: 'malicious' },
          }),
        }).catch(e => e);
        expect(response.status).toBe(400);
        const text = JSON.parse(response.text);
        expect(text.code).toBe(Parse.Error.INVALID_KEY_NAME);
        expect(text.error).toBe(
          'Prohibited keyword in request data: {"key":"_bsontype","value":"Code"}.'
        );
      });

      it('handles circular references without infinite loop', () => {
        const Utils = require('../lib/Utils');
        const obj = { name: 'test', nested: { value: 1 } };
        obj.nested.self = obj;
        expect(Utils.objectContainsKeyValue(obj, 'nonexistent', undefined)).toBe(false);
      });

      it('denies _bsontype:Code in file metadata after a sibling nested object', async () => {
        const str = 'Hello World!';
        const data = [];
        for (let i = 0; i < str.length; i++) {
          data.push(str.charCodeAt(i));
        }
        const file = new Parse.File('hello.txt', data, 'text/plain');
        file.addMetadata('nested', { safe: true });
        file.addMetadata('_bsontype', 'Code');
        file.addMetadata('code', 'malicious');
        await expectAsync(file.save()).toBeRejectedWith(
          new Parse.Error(
            Parse.Error.INVALID_KEY_NAME,
            'Prohibited keyword in request data: {"key":"_bsontype","value":"Code"}.'
          )
        );
      });
    });

    it('denies BSON type code data in write request by default', async () => {
      const headers = {
        'Content-Type': 'application/json',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      };
      const params = {
        headers: headers,
        method: 'POST',
        url: 'http://localhost:8378/1/classes/RCE',
        body: JSON.stringify({
          obj: {
            _bsontype: 'Code',
            code: 'delete Object.prototype.evalFunctions',
          },
        }),
      };
      const response = await request(params).catch(e => e);
      expect(response.status).toBe(400);
      const text = JSON.parse(response.text);
      expect(text.code).toBe(Parse.Error.INVALID_KEY_NAME);
      expect(text.error).toBe(
        'Prohibited keyword in request data: {"key":"_bsontype","value":"Code"}.'
      );
    });

    it('denies expanding existing object with polluted keys', async () => {
      const obj = await new Parse.Object('RCE', { a: { foo: [] } }).save();
      await reconfigureServer({
        requestKeywordDenylist: ['foo'],
      });
      obj.addUnique('a.foo', 'abc');
      await expectAsync(obj.save()).toBeRejectedWith(
        new Parse.Error(Parse.Error.INVALID_KEY_NAME, `Prohibited keyword in request data: "foo".`)
      );
    });

    it('denies creating a cloud trigger with polluted data', async () => {
      Parse.Cloud.beforeSave('TestObject', ({ object }) => {
        object.set('obj', {
          constructor: {
            prototype: {
              dummy: 0,
            },
          },
        });
      });
      // The new Parse SDK handles prototype pollution prevention in .set()
      // so no error is thrown, but the object prototype should not be polluted
      await new Parse.Object('TestObject').save();
      expect(Object.prototype.dummy).toBeUndefined();
    });

    it('denies creating global config with polluted data', async () => {
      const headers = {
        'Content-Type': 'application/json',
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
      };
      const params = {
        method: 'PUT',
        url: 'http://localhost:8378/1/config',
        json: true,
        body: {
          params: {
            welcomeMesssage: 'Welcome to Parse',
            foo: { _bsontype: 'Code', code: 'shell' },
          },
        },
        headers,
      };
      const response = await request(params).catch(e => e);
      expect(response.status).toBe(400);
      const text = JSON.parse(response.text);
      expect(text.code).toBe(Parse.Error.INVALID_KEY_NAME);
      expect(text.error).toBe(
        'Prohibited keyword in request data: {"key":"_bsontype","value":"Code"}.'
      );
    });

    it('denies direct database write wih prohibited keys', async () => {
      const Config = require('../lib/Config');
      const config = Config.get(Parse.applicationId);
      const user = {
        objectId: '1234567890',
        username: 'hello',
        password: 'pass',
        _session_token: 'abc',
        foo: { _bsontype: 'Code', code: 'shell' },
      };
      await expectAsync(config.database.create('_User', user)).toBeRejectedWith(
        new Parse.Error(
          Parse.Error.INVALID_KEY_NAME,
          'Prohibited keyword in request data: {"key":"_bsontype","value":"Code"}.'
        )
      );
    });

    it('denies direct database update wih prohibited keys', async () => {
      const Config = require('../lib/Config');
      const config = Config.get(Parse.applicationId);
      const user = {
        objectId: '1234567890',
        username: 'hello',
        password: 'pass',
        _session_token: 'abc',
        foo: { _bsontype: 'Code', code: 'shell' },
      };
      await expectAsync(
        config.database.update('_User', { _id: user.objectId }, user)
      ).toBeRejectedWith(
        new Parse.Error(
          Parse.Error.INVALID_KEY_NAME,
          'Prohibited keyword in request data: {"key":"_bsontype","value":"Code"}.'
        )
      );
    });

    it_id('e8b5f1e1-8326-4c70-b5f4-1e8678dfff8d')(it)('denies creating a hook with polluted data', async () => {
      const express = require('express');
      const port = 34567;
      const hookServerURL = 'http://localhost:' + port;
      const app = express();
      app.use(express.json({ type: '*/*' }));
      const server = await new Promise(resolve => {
        const res = app.listen(port, undefined, () => resolve(res));
      });
      app.post('/BeforeSave', function (req, res) {
        const object = Parse.Object.fromJSON(req.body.object);
        object.set('hello', 'world');
        object.set('obj', {
          constructor: {
            prototype: {
              dummy: 0,
            },
          },
        });
        res.json({ success: object });
      });
      await Parse.Hooks.createTrigger('TestObject', 'beforeSave', hookServerURL + '/BeforeSave');
      // The new Parse SDK handles prototype pollution prevention in .set()
      // so no error is thrown, but the object prototype should not be polluted
      await new Parse.Object('TestObject').save();
      expect(Object.prototype.dummy).toBeUndefined();
      await new Promise(resolve => server.close(resolve));
    });

    it('denies write request with custom denylist of key/value', async () => {
      await reconfigureServer({
        requestKeywordDenylist: [{ key: 'a[K]ey', value: 'aValue[123]*' }],
      });
      const headers = {
        'Content-Type': 'application/json',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      };
      const params = {
        headers: headers,
        method: 'POST',
        url: 'http://localhost:8378/1/classes/RCE',
        body: JSON.stringify({
          obj: {
            aKey: 'aValue321',
            code: 'delete Object.prototype.evalFunctions',
          },
        }),
      };
      const response = await request(params).catch(e => e);
      expect(response.status).toBe(400);
      const text = JSON.parse(response.text);
      expect(text.code).toBe(Parse.Error.INVALID_KEY_NAME);
      expect(text.error).toBe(
        'Prohibited keyword in request data: {"key":"a[K]ey","value":"aValue[123]*"}.'
      );
    });

    it('denies write request with custom denylist of nested key/value', async () => {
      await reconfigureServer({
        requestKeywordDenylist: [{ key: 'a[K]ey', value: 'aValue[123]*' }],
      });
      const headers = {
        'Content-Type': 'application/json',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      };
      const params = {
        headers: headers,
        method: 'POST',
        url: 'http://localhost:8378/1/classes/RCE',
        body: JSON.stringify({
          obj: {
            nested: {
              aKey: 'aValue321',
              code: 'delete Object.prototype.evalFunctions',
            },
          },
        }),
      };
      const response = await request(params).catch(e => e);
      expect(response.status).toBe(400);
      const text = JSON.parse(response.text);
      expect(text.code).toBe(Parse.Error.INVALID_KEY_NAME);
      expect(text.error).toBe(
        'Prohibited keyword in request data: {"key":"a[K]ey","value":"aValue[123]*"}.'
      );
    });

    it('denies write request with custom denylist of key/value in array', async () => {
      await reconfigureServer({
        requestKeywordDenylist: [{ key: 'a[K]ey', value: 'aValue[123]*' }],
      });
      const headers = {
        'Content-Type': 'application/json',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      };
      const params = {
        headers: headers,
        method: 'POST',
        url: 'http://localhost:8378/1/classes/RCE',
        body: JSON.stringify({
          obj: [
            {
              aKey: 'aValue321',
              code: 'delete Object.prototype.evalFunctions',
            },
          ],
        }),
      };
      const response = await request(params).catch(e => e);
      expect(response.status).toBe(400);
      const text = JSON.parse(response.text);
      expect(text.code).toBe(Parse.Error.INVALID_KEY_NAME);
      expect(text.error).toBe(
        'Prohibited keyword in request data: {"key":"a[K]ey","value":"aValue[123]*"}.'
      );
    });

    it('denies write request with custom denylist of key', async () => {
      await reconfigureServer({
        requestKeywordDenylist: [{ key: 'a[K]ey' }],
      });
      const headers = {
        'Content-Type': 'application/json',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      };
      const params = {
        headers: headers,
        method: 'POST',
        url: 'http://localhost:8378/1/classes/RCE',
        body: JSON.stringify({
          obj: {
            aKey: 'aValue321',
            code: 'delete Object.prototype.evalFunctions',
          },
        }),
      };
      const response = await request(params).catch(e => e);
      expect(response.status).toBe(400);
      const text = JSON.parse(response.text);
      expect(text.code).toBe(Parse.Error.INVALID_KEY_NAME);
      expect(text.error).toBe('Prohibited keyword in request data: {"key":"a[K]ey"}.');
    });

    it('denies write request with custom denylist of value', async () => {
      await reconfigureServer({
        requestKeywordDenylist: [{ value: 'aValue[123]*' }],
      });
      const headers = {
        'Content-Type': 'application/json',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      };
      const params = {
        headers: headers,
        method: 'POST',
        url: 'http://localhost:8378/1/classes/RCE',
        body: JSON.stringify({
          obj: {
            aKey: 'aValue321',
            code: 'delete Object.prototype.evalFunctions',
          },
        }),
      };
      const response = await request(params).catch(e => e);
      expect(response.status).toBe(400);
      const text = JSON.parse(response.text);
      expect(text.code).toBe(Parse.Error.INVALID_KEY_NAME);
      expect(text.error).toBe('Prohibited keyword in request data: {"value":"aValue[123]*"}.');
    });

    it('denies BSON type code data in file metadata', async () => {
      const str = 'Hello World!';
      const data = [];
      for (let i = 0; i < str.length; i++) {
        data.push(str.charCodeAt(i));
      }
      const file = new Parse.File('hello.txt', data, 'text/plain');
      file.addMetadata('obj', {
        _bsontype: 'Code',
        code: 'delete Object.prototype.evalFunctions',
      });
      await expectAsync(file.save()).toBeRejectedWith(
        new Parse.Error(
          Parse.Error.INVALID_KEY_NAME,
          `Prohibited keyword in request data: {"key":"_bsontype","value":"Code"}.`
        )
      );
    });

    it('denies BSON type code data in file tags', async () => {
      const str = 'Hello World!';
      const data = [];
      for (let i = 0; i < str.length; i++) {
        data.push(str.charCodeAt(i));
      }
      const file = new Parse.File('hello.txt', data, 'text/plain');
      file.addTag('obj', {
        _bsontype: 'Code',
        code: 'delete Object.prototype.evalFunctions',
      });
      await expectAsync(file.save()).toBeRejectedWith(
        new Parse.Error(
          Parse.Error.INVALID_KEY_NAME,
          `Prohibited keyword in request data: {"key":"_bsontype","value":"Code"}.`
        )
      );
    });
  });

  describe('Ignore non-matches', () => {
    it('ignores write request that contains only fraction of denied keyword', async () => {
      await reconfigureServer({
        requestKeywordDenylist: [{ key: 'abc' }],
      });
      // Initially saving an object executes the keyword detection in RestWrite.js
      const obj = new TestObject({ a: { b: { c: 0 } } });
      await expectAsync(obj.save()).toBeResolved();
      // Modifying a nested key executes the keyword detection in DatabaseController.js
      obj.increment('a.b.c');
      await expectAsync(obj.save()).toBeResolved();
    });
  });

  describe('(GHSA-mmg8-87c5-jrc2) LiveQuery protected-field guard bypass via array-like $or/$and/$nor', () => {
    const { sleep } = require('../lib/TestUtils');
    let obj;

    beforeEach(async () => {
      Parse.CoreManager.getLiveQueryController().setDefaultLiveQueryClient(null);
      await reconfigureServer({
        liveQuery: { classNames: ['SecretClass'] },
        startLiveQueryServer: true,
        verbose: false,
        silent: true,
      });
      const config = Config.get(Parse.applicationId);
      const schemaController = await config.database.loadSchema();
      await schemaController.addClassIfNotExists(
        'SecretClass',
        { secretObj: { type: 'Object' }, publicField: { type: 'String' } },
      );
      await schemaController.updateClass(
        'SecretClass',
        {},
        {
          find: { '*': true },
          get: { '*': true },
          create: { '*': true },
          update: { '*': true },
          delete: { '*': true },
          addField: {},
          protectedFields: { '*': ['secretObj'] },
        }
      );

      obj = new Parse.Object('SecretClass');
      obj.set('secretObj', { apiKey: 'SENSITIVE_KEY_123', score: 42 });
      obj.set('publicField', 'visible');
      await obj.save(null, { useMasterKey: true });
    });

    afterEach(async () => {
      const client = await Parse.CoreManager.getLiveQueryController().getDefaultLiveQueryClient();
      if (client) {
        await client.close();
      }
    });

    it('should reject subscription with array-like $or containing protected field', async () => {
      const query = new Parse.Query('SecretClass');
      query._where = {
        $or: { '0': { 'secretObj.apiKey': 'SENSITIVE_KEY_123' }, length: 1 },
      };
      await expectAsync(query.subscribe()).toBeRejectedWith(
        jasmine.objectContaining({ code: Parse.Error.INVALID_QUERY })
      );
    });

    it('should reject subscription with array-like $and containing protected field', async () => {
      const query = new Parse.Query('SecretClass');
      query._where = {
        $and: { '0': { 'secretObj.apiKey': 'SENSITIVE_KEY_123' }, '1': { publicField: 'visible' }, length: 2 },
      };
      await expectAsync(query.subscribe()).toBeRejectedWith(
        jasmine.objectContaining({ code: Parse.Error.INVALID_QUERY })
      );
    });

    it('should reject subscription with array-like $nor containing protected field', async () => {
      const query = new Parse.Query('SecretClass');
      query._where = {
        $nor: { '0': { 'secretObj.apiKey': 'SENSITIVE_KEY_123' }, length: 1 },
      };
      await expectAsync(query.subscribe()).toBeRejectedWith(
        jasmine.objectContaining({ code: Parse.Error.INVALID_QUERY })
      );
    });

    it('should reject subscription with array-like $or even on non-protected fields', async () => {
      const query = new Parse.Query('SecretClass');
      query._where = {
        $or: { '0': { publicField: 'visible' }, length: 1 },
      };
      await expectAsync(query.subscribe()).toBeRejectedWith(
        jasmine.objectContaining({ code: Parse.Error.INVALID_QUERY })
      );
    });

    it('should not create oracle via array-like $or bypass on protected fields', async () => {
      const query = new Parse.Query('SecretClass');
      query._where = {
        $or: { '0': { 'secretObj.apiKey': 'SENSITIVE_KEY_123' }, length: 1 },
      };

      // Subscription must be rejected; no event oracle should be possible
      let subscriptionError;
      let subscription;
      try {
        subscription = await query.subscribe();
      } catch (e) {
        subscriptionError = e;
      }

      if (!subscriptionError) {
        const updateSpy = jasmine.createSpy('update');
        subscription.on('create', updateSpy);
        subscription.on('update', updateSpy);

        // Trigger an object change
        obj.set('publicField', 'changed');
        await obj.save(null, { useMasterKey: true });
        await sleep(500);

        // If subscription somehow accepted, verify no events fired (evaluator defense)
        expect(updateSpy).not.toHaveBeenCalled();
        fail('Expected subscription to be rejected');
      }
      expect(subscriptionError).toEqual(
        jasmine.objectContaining({ code: Parse.Error.INVALID_QUERY })
      );
    });
  });

  describe('Malformed $regex information disclosure', () => {
    it('should not leak database error internals for invalid regex pattern in class query', async () => {
      const logger = require('../lib/logger').default;
      const loggerErrorSpy = spyOn(logger, 'error').and.callThrough();
      const obj = new Parse.Object('TestObject');
      await obj.save({ field: 'value' });

      try {
        await request({
          method: 'GET',
          url: `http://localhost:8378/1/classes/TestObject`,
          headers: {
            'Content-Type': 'application/json',
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
          qs: {
            where: JSON.stringify({ field: { $regex: '[abc' } }),
          },
        });
        fail('Request should have failed');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.INTERNAL_SERVER_ERROR);
        expect(e.data.error).toBe('An internal server error occurred');
        expect(typeof e.data.error).toBe('string');
        expect(JSON.stringify(e.data)).not.toContain('errmsg');
        expect(JSON.stringify(e.data)).not.toContain('codeName');
        expect(JSON.stringify(e.data)).not.toContain('errorResponse');
        expect(loggerErrorSpy).toHaveBeenCalledWith(
          'Sanitized error:',
          jasmine.stringMatching(/[Rr]egular expression/i)
        );
      }
    });

    it('should not leak database error internals for invalid regex pattern in role query', async () => {
      const logger = require('../lib/logger').default;
      const loggerErrorSpy = spyOn(logger, 'error').and.callThrough();
      const role = new Parse.Role('testrole', new Parse.ACL());
      await role.save(null, { useMasterKey: true });
      try {
        await request({
          method: 'GET',
          url: `http://localhost:8378/1/roles`,
          headers: {
            'Content-Type': 'application/json',
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
          qs: {
            where: JSON.stringify({ name: { $regex: '[abc' } }),
          },
        });
        fail('Request should have failed');
      } catch (e) {
        expect(e.data.code).toBe(Parse.Error.INTERNAL_SERVER_ERROR);
        expect(e.data.error).toBe('An internal server error occurred');
        expect(typeof e.data.error).toBe('string');
        expect(JSON.stringify(e.data)).not.toContain('errmsg');
        expect(JSON.stringify(e.data)).not.toContain('codeName');
        expect(JSON.stringify(e.data)).not.toContain('errorResponse');
        expect(loggerErrorSpy).toHaveBeenCalledWith(
          'Sanitized error:',
          jasmine.stringMatching(/[Rr]egular expression/i)
        );
      }
    });
  });

  describe('Postgres regex sanitizater', () => {
    it('sanitizes the regex correctly to prevent Injection', async () => {
      const user = new Parse.User();
      user.set('username', 'username');
      user.set('password', 'password');
      user.set('email', 'email@example.com');
      await user.signUp();

      const response = await request({
        method: 'GET',
        url:
          "http://localhost:8378/1/classes/_User?where[username][$regex]=A'B'%3BSELECT+PG_SLEEP(3)%3B--",
        headers: {
          'Content-Type': 'application/json',
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.results).toEqual(jasmine.any(Array));
      expect(response.data.results.length).toBe(0);
    });
  });

  describe('(GHSA-mf3j-86qx-cq5j) ReDoS via $regex in LiveQuery subscription', () => {
    it('does not block event loop with catastrophic backtracking regex in LiveQuery', async () => {
      await reconfigureServer({
        liveQuery: { classNames: ['TestObject'] },
        startLiveQueryServer: true,
      });
      const client = new Parse.LiveQueryClient({
        applicationId: 'test',
        serverURL: 'ws://localhost:1337',
        javascriptKey: 'test',
      });
      client.open();
      const query = new Parse.Query('TestObject');
      // Set a catastrophic backtracking regex pattern directly
      query._addCondition('field', '$regex', '(a+)+b');
      const subscription = await client.subscribe(query);
      // Create an object that would trigger regex evaluation
      const obj = new Parse.Object('TestObject');
      // With 30 'a's followed by 'c', an unprotected regex would hang for seconds
      obj.set('field', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaac');
      // Set a timeout to detect if the event loop is blocked
      const timeout = 5000;
      const start = Date.now();
      const savePromise = obj.save();
      const eventPromise = new Promise(resolve => {
        subscription.on('create', () => resolve('matched'));
        setTimeout(() => resolve('timeout'), timeout);
      });
      await savePromise;
      const result = await eventPromise;
      const elapsed = Date.now() - start;
      // The regex should be rejected (not match), and the operation should complete quickly
      expect(result).toBe('timeout');
      expect(elapsed).toBeLessThan(timeout + 1000);
      client.close();
    });
  });

  describe('(GHSA-qpr4-jrj4-6f27) SQL Injection via sort dot-notation field name', () => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest',
    };

    it_only_db('postgres')('does not execute injected SQL via sort order dot-notation', async () => {
      const obj = new Parse.Object('InjectionTest');
      obj.set('data', { key: 'value' });
      obj.set('name', 'original');
      await obj.save();

      // This payload would execute a stacked query if single quotes are not escaped
      await request({
        method: 'GET',
        url: 'http://localhost:8378/1/classes/InjectionTest',
        headers,
        qs: {
          order: "data.x' ASC; UPDATE \"InjectionTest\" SET name = 'hacked' WHERE true--",
        },
      }).catch(() => {});

      // Verify the data was not modified by injected SQL
      const verify = await new Parse.Query('InjectionTest').get(obj.id);
      expect(verify.get('name')).toBe('original');
    });

    it_only_db('postgres')('does not execute injected SQL via sort order with pg_sleep', async () => {
      const obj = new Parse.Object('InjectionTest');
      obj.set('data', { key: 'value' });
      await obj.save();

      const start = Date.now();
      await request({
        method: 'GET',
        url: 'http://localhost:8378/1/classes/InjectionTest',
        headers,
        qs: {
          order: "data.x' ASC; SELECT pg_sleep(3)--",
        },
      }).catch(() => {});
      const elapsed = Date.now() - start;

      // If injection succeeded, query would take >= 3 seconds
      expect(elapsed).toBeLessThan(3000);
    });

    it_only_db('postgres')('does not execute injection via dollar-sign quoting bypass', async () => {
      // PostgreSQL supports $$string$$ as alternative to 'string'
      const obj = new Parse.Object('InjectionTest');
      obj.set('data', { key: 'value' });
      obj.set('name', 'original');
      await obj.save();

      await request({
        method: 'GET',
        url: 'http://localhost:8378/1/classes/InjectionTest',
        headers,
        qs: {
          order: "data.x' ASC; UPDATE \"InjectionTest\" SET name = $$hacked$$ WHERE true--",
        },
      }).catch(() => {});

      const verify = await new Parse.Query('InjectionTest').get(obj.id);
      expect(verify.get('name')).toBe('original');
    });

    it_only_db('postgres')('does not execute injection via tagged dollar quoting bypass', async () => {
      // PostgreSQL supports $tag$string$tag$ as alternative to 'string'
      const obj = new Parse.Object('InjectionTest');
      obj.set('data', { key: 'value' });
      obj.set('name', 'original');
      await obj.save();

      await request({
        method: 'GET',
        url: 'http://localhost:8378/1/classes/InjectionTest',
        headers,
        qs: {
          order: "data.x' ASC; UPDATE \"InjectionTest\" SET name = $t$hacked$t$ WHERE true--",
        },
      }).catch(() => {});

      const verify = await new Parse.Query('InjectionTest').get(obj.id);
      expect(verify.get('name')).toBe('original');
    });

    it_only_db('postgres')('does not execute injection via CHR() concatenation bypass', async () => {
      // CHR(104)||CHR(97)||... builds 'hacked' without quotes
      const obj = new Parse.Object('InjectionTest');
      obj.set('data', { key: 'value' });
      obj.set('name', 'original');
      await obj.save();

      await request({
        method: 'GET',
        url: 'http://localhost:8378/1/classes/InjectionTest',
        headers,
        qs: {
          order: "data.x' ASC; UPDATE \"InjectionTest\" SET name = CHR(104)||CHR(97)||CHR(99)||CHR(107) WHERE true--",
        },
      }).catch(() => {});

      const verify = await new Parse.Query('InjectionTest').get(obj.id);
      expect(verify.get('name')).toBe('original');
    });

    it_only_db('postgres')('does not execute injection via backslash escape bypass', async () => {
      // Backslash before quote could interact with '' escaping in some configurations
      const obj = new Parse.Object('InjectionTest');
      obj.set('data', { key: 'value' });
      obj.set('name', 'original');
      await obj.save();

      await request({
        method: 'GET',
        url: 'http://localhost:8378/1/classes/InjectionTest',
        headers,
        qs: {
          order: "data.x\\' ASC; UPDATE \"InjectionTest\" SET name = 'hacked' WHERE true--",
        },
      }).catch(() => {});

      const verify = await new Parse.Query('InjectionTest').get(obj.id);
      expect(verify.get('name')).toBe('original');
    });

    it('allows valid dot-notation sort on object field', async () => {
      const obj = new Parse.Object('InjectionTest');
      obj.set('data', { key: 'value' });
      await obj.save();

      const response = await request({
        method: 'GET',
        url: 'http://localhost:8378/1/classes/InjectionTest',
        headers,
        qs: {
          order: 'data.key',
        },
      });
      expect(response.status).toBe(200);
    });

    it('allows valid dot-notation with special characters in sub-field', async () => {
      const obj = new Parse.Object('InjectionTest');
      obj.set('data', { 'my-field': 'value' });
      await obj.save();

      const response = await request({
        method: 'GET',
        url: 'http://localhost:8378/1/classes/InjectionTest',
        headers,
        qs: {
          order: 'data.my-field',
        },
      });
      expect(response.status).toBe(200);
    });
  });

  describe('(GHSA-v5hf-f4c3-m5rv) Stored XSS via .svgz, .xht, .xml, .xsl, .xslt file upload', () => {
    const headers = {
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest',
    };

    beforeEach(async () => {
      await reconfigureServer({
        fileUpload: {
          enableForPublic: true,
        },
      });
    });

    it('blocks .svgz file upload by default', async () => {
      const svgContent = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
      ).toString('base64');
      for (const extension of ['svgz', 'SVGZ', 'Svgz']) {
        await expectAsync(
          request({
            method: 'POST',
            headers,
            url: `http://localhost:8378/1/files/malicious.${extension}`,
            body: JSON.stringify({
              _ApplicationId: 'test',
              _JavaScriptKey: 'test',
              _ContentType: 'image/svg+xml',
              base64: svgContent,
            }),
          }).catch(e => {
            throw new Error(e.data.error);
          })
        ).toBeRejectedWith(
          new Parse.Error(
            Parse.Error.FILE_SAVE_ERROR,
            `File upload of extension ${extension} is disabled.`
          )
        );
      }
    });

    it('blocks .xht file upload by default', async () => {
      const xhtContent = Buffer.from(
        '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><script>alert(1)</script></body></html>'
      ).toString('base64');
      for (const extension of ['xht', 'XHT', 'Xht']) {
        await expectAsync(
          request({
            method: 'POST',
            headers,
            url: `http://localhost:8378/1/files/malicious.${extension}`,
            body: JSON.stringify({
              _ApplicationId: 'test',
              _JavaScriptKey: 'test',
              _ContentType: 'application/xhtml+xml',
              base64: xhtContent,
            }),
          }).catch(e => {
            throw new Error(e.data.error);
          })
        ).toBeRejectedWith(
          new Parse.Error(
            Parse.Error.FILE_SAVE_ERROR,
            `File upload of extension ${extension} is disabled.`
          )
        );
      }
    });

    it('blocks .xml file upload by default', async () => {
      const xmlContent = Buffer.from(
        '<?xml version="1.0"?><root><data>test</data></root>'
      ).toString('base64');
      for (const extension of ['xml', 'XML', 'Xml']) {
        await expectAsync(
          request({
            method: 'POST',
            headers,
            url: `http://localhost:8378/1/files/malicious.${extension}`,
            body: JSON.stringify({
              _ApplicationId: 'test',
              _JavaScriptKey: 'test',
              _ContentType: 'application/xml',
              base64: xmlContent,
            }),
          }).catch(e => {
            throw new Error(e.data.error);
          })
        ).toBeRejectedWith(
          new Parse.Error(
            Parse.Error.FILE_SAVE_ERROR,
            `File upload of extension ${extension} is disabled.`
          )
        );
      }
    });

    it('blocks .xsl file upload by default', async () => {
      const xslContent = Buffer.from(
        '<?xml version="1.0"?><xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform" version="1.0"></xsl:stylesheet>'
      ).toString('base64');
      for (const extension of ['xsl', 'XSL', 'Xsl']) {
        await expectAsync(
          request({
            method: 'POST',
            headers,
            url: `http://localhost:8378/1/files/malicious.${extension}`,
            body: JSON.stringify({
              _ApplicationId: 'test',
              _JavaScriptKey: 'test',
              _ContentType: 'application/xml',
              base64: xslContent,
            }),
          }).catch(e => {
            throw new Error(e.data.error);
          })
        ).toBeRejectedWith(
          new Parse.Error(
            Parse.Error.FILE_SAVE_ERROR,
            `File upload of extension ${extension} is disabled.`
          )
        );
      }
    });

    it('blocks .xslt file upload by default', async () => {
      const xsltContent = Buffer.from(
        '<?xml version="1.0"?><xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform" version="1.0"></xsl:stylesheet>'
      ).toString('base64');
      for (const extension of ['xslt', 'XSLT', 'Xslt']) {
        await expectAsync(
          request({
            method: 'POST',
            headers,
            url: `http://localhost:8378/1/files/malicious.${extension}`,
            body: JSON.stringify({
              _ApplicationId: 'test',
              _JavaScriptKey: 'test',
              _ContentType: 'application/xslt+xml',
              base64: xsltContent,
            }),
          }).catch(e => {
            throw new Error(e.data.error);
          })
        ).toBeRejectedWith(
          new Parse.Error(
            Parse.Error.FILE_SAVE_ERROR,
            `File upload of extension ${extension} is disabled.`
          )
        );
      }
    });

    // Headers are intentionally omitted below so that the middleware parses _ContentType
    // from the JSON body and sets it as the content-type header. When X-Parse-Application-Id
    // is sent as a header, the middleware skips body parsing and _ContentType is ignored.
    it('blocks extensionless upload with application/xhtml+xml content type', async () => {
      const xhtContent = Buffer.from(
        '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><script>alert(1)</script></body></html>'
      ).toString('base64');
      await expectAsync(
        request({
          method: 'POST',
          url: 'http://localhost:8378/1/files/payload',
          body: JSON.stringify({
            _ApplicationId: 'test',
            _JavaScriptKey: 'test',
            _ContentType: 'application/xhtml+xml',
            base64: xhtContent,
          }),
        }).catch(e => {
          throw new Error(e.data.error);
        })
      ).toBeRejectedWith(
        new Parse.Error(
          Parse.Error.FILE_SAVE_ERROR,
          'File upload of extension xhtml+xml is disabled.'
        )
      );
    });

    it('blocks extensionless upload with application/xslt+xml content type', async () => {
      const xsltContent = Buffer.from(
        '<?xml version="1.0"?><xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform" version="1.0"></xsl:stylesheet>'
      ).toString('base64');
      await expectAsync(
        request({
          method: 'POST',
          url: 'http://localhost:8378/1/files/payload',
          body: JSON.stringify({
            _ApplicationId: 'test',
            _JavaScriptKey: 'test',
            _ContentType: 'application/xslt+xml',
            base64: xsltContent,
          }),
        }).catch(e => {
          throw new Error(e.data.error);
        })
      ).toBeRejectedWith(
        new Parse.Error(
          Parse.Error.FILE_SAVE_ERROR,
          'File upload of extension xslt+xml is disabled.'
        )
      );
    });

    it('still allows common file types', async () => {
      for (const type of ['txt', 'png', 'jpg', 'gif', 'pdf', 'doc']) {
        const file = new Parse.File(`file.${type}`, { base64: 'ParseA==' });
        await file.save();
      }
    });
  });

  describe('(GHSA-42ph-pf9q-cr72) Stored XSS filter bypass via parameterized Content-Type and additional XML extensions', () => {
    const headers = {
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest',
    };

    beforeEach(async () => {
      await reconfigureServer({
        fileUpload: {
          enableForPublic: true,
        },
      });
    });

    for (const { ext, contentType } of [
      { ext: 'xsd', contentType: 'application/xml' },
      { ext: 'rng', contentType: 'application/xml' },
      { ext: 'rdf', contentType: 'application/rdf+xml' },
      { ext: 'owl', contentType: 'application/rdf+xml' },
      { ext: 'mathml', contentType: 'application/mathml+xml' },
    ]) {
      it(`blocks .${ext} file upload by default`, async () => {
        const content = Buffer.from(
          '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><script>alert(1)</script></body></html>'
        ).toString('base64');
        for (const extension of [ext, ext.toUpperCase(), ext[0].toUpperCase() + ext.slice(1)]) {
          await expectAsync(
            request({
              method: 'POST',
              headers,
              url: `http://localhost:8378/1/files/malicious.${extension}`,
              body: JSON.stringify({
                _ApplicationId: 'test',
                _JavaScriptKey: 'test',
                _ContentType: contentType,
                base64: content,
              }),
            }).catch(e => {
              throw new Error(e.data.error);
            })
          ).toBeRejectedWith(
            new Parse.Error(
              Parse.Error.FILE_SAVE_ERROR,
              `File upload of extension ${extension} is disabled.`
            )
          );
        }
      });
    }

    it('blocks extensionless upload with parameterized Content-Type that bypasses regex', async () => {
      const content = Buffer.from(
        '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><script>alert(1)</script></body></html>'
      ).toString('base64');
      // MIME parameters like ;charset=utf-8 should not bypass the extension filter
      const dangerousContentTypes = [
        'application/xhtml+xml;charset=utf-8',
        'application/xhtml+xml; charset=utf-8',
        'application/xhtml+xml\t;charset=utf-8',
        'image/svg+xml;charset=utf-8',
        'application/xml;charset=utf-8',
        'text/html;charset=utf-8',
        'application/xslt+xml;charset=utf-8',
        'application/rdf+xml;charset=utf-8',
        'application/mathml+xml;charset=utf-8',
      ];
      for (const contentType of dangerousContentTypes) {
        await expectAsync(
          request({
            method: 'POST',
            url: 'http://localhost:8378/1/files/payload',
            body: JSON.stringify({
              _ApplicationId: 'test',
              _JavaScriptKey: 'test',
              _ContentType: contentType,
              base64: content,
            }),
          }).catch(e => {
            throw new Error(e.data.error);
          })
        ).toBeRejectedWith(jasmine.objectContaining({
          message: jasmine.stringMatching(/File upload of extension .+ is disabled/),
        }));
      }
    });
  });

  describe('(GHSA-3jmq-rrxf-gqrg) Stored XSS via file serving', () => {
    it('sets X-Content-Type-Options: nosniff on file GET response', async () => {
      const file = new Parse.File('hello.txt', [1, 2, 3], 'text/plain');
      await file.save({ useMasterKey: true });
      const response = await request({
        url: file.url(),
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
        },
      });
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('sets X-Content-Type-Options: nosniff on streaming file GET response', async () => {
      const file = new Parse.File('hello.txt', [1, 2, 3], 'text/plain');
      await file.save({ useMasterKey: true });
      const response = await request({
        url: file.url(),
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
          'Range': 'bytes=0-2',
        },
      });
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('(GHSA-vr5f-2r24-w5hc) Stored XSS via Content-Type and file extension mismatch', () => {
    const headers = {
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest',
    };

    it('overrides mismatched Content-Type with extension-derived MIME type on buffered upload', async () => {
      const adapter = Config.get('test').filesController.adapter;
      const spy = spyOn(adapter, 'createFile').and.callThrough();
      const content = Buffer.from('<script>alert(1)</script>').toString('base64');
      await request({
        method: 'POST',
        url: 'http://localhost:8378/1/files/evil.txt',
        body: JSON.stringify({
          _ApplicationId: 'test',
          _JavaScriptKey: 'test',
          _ContentType: 'text/html',
          base64: content,
        }),
        headers,
      });
      expect(spy).toHaveBeenCalled();
      const contentTypeArg = spy.calls.mostRecent().args[2];
      expect(contentTypeArg).toBe('text/plain');
    });

    it('overrides mismatched Content-Type with extension-derived MIME type on stream upload', async () => {
      const adapter = Config.get('test').filesController.adapter;
      const spy = spyOn(adapter, 'createFile').and.callThrough();
      const body = '<script>alert(1)</script>';
      await request({
        method: 'POST',
        url: 'http://localhost:8378/1/files/evil.txt',
        headers: {
          ...headers,
          'Content-Type': 'text/html',
          'X-Parse-Upload-Mode': 'stream',
        },
        body,
      });
      expect(spy).toHaveBeenCalled();
      const contentTypeArg = spy.calls.mostRecent().args[2];
      expect(contentTypeArg).toBe('text/plain');
    });

    it('preserves Content-Type when no file extension is present', async () => {
      const adapter = Config.get('test').filesController.adapter;
      const spy = spyOn(adapter, 'createFile').and.callThrough();
      await request({
        method: 'POST',
        url: 'http://localhost:8378/1/files/noextension',
        headers: {
          ...headers,
          'Content-Type': 'image/png',
        },
        body: Buffer.from('fake png content'),
      });
      expect(spy).toHaveBeenCalled();
      const contentTypeArg = spy.calls.mostRecent().args[2];
      expect(contentTypeArg).toBe('image/png');
    });

    it('infers Content-Type from extension when none is provided', async () => {
      const adapter = Config.get('test').filesController.adapter;
      const spy = spyOn(adapter, 'createFile').and.callThrough();
      const content = Buffer.from('test content').toString('base64');
      await request({
        method: 'POST',
        url: 'http://localhost:8378/1/files/data.txt',
        body: JSON.stringify({
          _ApplicationId: 'test',
          _JavaScriptKey: 'test',
          base64: content,
        }),
        headers,
      });
      expect(spy).toHaveBeenCalled();
      const contentTypeArg = spy.calls.mostRecent().args[2];
      expect(contentTypeArg).toBe('text/plain');
    });
  });

  describe('(GHSA-q3vj-96h2-gwvg) SQL Injection via Increment amount on nested Object field', () => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest',
    };

    it('rejects non-number Increment amount on nested object field', async () => {
      const obj = new Parse.Object('IncrTest');
      obj.set('stats', { counter: 0 });
      await obj.save();

      const response = await request({
        method: 'PUT',
        url: `http://localhost:8378/1/classes/IncrTest/${obj.id}`,
        headers,
        body: JSON.stringify({
          'stats.counter': { __op: 'Increment', amount: '1' },
        }),
      }).catch(e => e);

      expect(response.status).toBe(400);
      const text = JSON.parse(response.text);
      expect(text.code).toBe(Parse.Error.INVALID_JSON);
    });

    it_only_db('postgres')('does not execute injected SQL via Increment amount with pg_sleep', async () => {
      const obj = new Parse.Object('IncrTest');
      obj.set('stats', { counter: 0 });
      await obj.save();

      const start = Date.now();
      await request({
        method: 'PUT',
        url: `http://localhost:8378/1/classes/IncrTest/${obj.id}`,
        headers,
        body: JSON.stringify({
          'stats.counter': { __op: 'Increment', amount: '0+(SELECT 1 FROM pg_sleep(3))' },
        }),
      }).catch(() => {});
      const elapsed = Date.now() - start;

      // If injection succeeded, query would take >= 3 seconds
      expect(elapsed).toBeLessThan(3000);
    });

    it_only_db('postgres')('does not execute injected SQL via Increment amount for data exfiltration', async () => {
      const obj = new Parse.Object('IncrTest');
      obj.set('stats', { counter: 0 });
      await obj.save();

      await request({
        method: 'PUT',
        url: `http://localhost:8378/1/classes/IncrTest/${obj.id}`,
        headers,
        body: JSON.stringify({
          'stats.counter': {
            __op: 'Increment',
            amount: '0+(SELECT ascii(substr(current_database(),1,1)))',
          },
        }),
      }).catch(() => {});

      // Verify counter was not modified by injected SQL
      const verify = await new Parse.Query('IncrTest').get(obj.id);
      expect(verify.get('stats').counter).toBe(0);
    });

    it('allows valid numeric Increment on nested object field', async () => {
      const obj = new Parse.Object('IncrTest');
      obj.set('stats', { counter: 5 });
      await obj.save();

      const response = await request({
        method: 'PUT',
        url: `http://localhost:8378/1/classes/IncrTest/${obj.id}`,
        headers,
        body: JSON.stringify({
          'stats.counter': { __op: 'Increment', amount: 3 },
        }),
      });

      expect(response.status).toBe(200);
      const verify = await new Parse.Query('IncrTest').get(obj.id);
      expect(verify.get('stats').counter).toBe(8);
    });
  });

  describe('(GHSA-gqpp-xgvh-9h7h) SQL Injection via dot-notation sub-key name in Increment operation', () => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest',
    };

    it_only_db('postgres')('does not execute injected SQL via single quote in sub-key name', async () => {
      const obj = new Parse.Object('SubKeyTest');
      obj.set('stats', { counter: 0 });
      await obj.save();

      const start = Date.now();
      await request({
        method: 'PUT',
        url: `http://localhost:8378/1/classes/SubKeyTest/${obj.id}`,
        headers,
        body: JSON.stringify({
          "stats.x' || (SELECT pg_sleep(3))::text || '": { __op: 'Increment', amount: 1 },
        }),
      }).catch(() => {});
      const elapsed = Date.now() - start;

      // If injection succeeded, query would take >= 3 seconds
      expect(elapsed).toBeLessThan(3000);
      // The escaped payload becomes a harmless literal key; original data is untouched
      const verify = await new Parse.Query('SubKeyTest').get(obj.id);
      expect(verify.get('stats').counter).toBe(0);
    });

    it_only_db('postgres')('does not execute injected SQL via double quote in sub-key name', async () => {
      const obj = new Parse.Object('SubKeyTest');
      obj.set('stats', { counter: 0 });
      await obj.save();

      const start = Date.now();
      await request({
        method: 'PUT',
        url: `http://localhost:8378/1/classes/SubKeyTest/${obj.id}`,
        headers,
        body: JSON.stringify({
          'stats.x" || (SELECT pg_sleep(3))::text || "': { __op: 'Increment', amount: 1 },
        }),
      }).catch(() => {});
      const elapsed = Date.now() - start;

      // Double quotes are escaped in the JSON context, producing a harmless literal key
      // name. No SQL injection occurs. If injection succeeded, the query would take
      // >= 3 seconds due to pg_sleep.
      expect(elapsed).toBeLessThan(3000);
      const verify = await new Parse.Query('SubKeyTest').get(obj.id);
      // Original counter is untouched
      expect(verify.get('stats').counter).toBe(0);
    });

    it_only_db('postgres')('does not inject additional JSONB keys via double quote crafted as valid JSONB in sub-key name', async () => {
      const obj = new Parse.Object('SubKeyTest');
      obj.set('stats', { counter: 0 });
      await obj.save();

      // This payload attempts to craft a sub-key that produces valid JSONB with
      // injected keys (e.g. '{"x":0,"evil":1}'). Double quotes are escaped in the
      // JSON context, so the payload becomes a harmless literal key name instead.
      await request({
        method: 'PUT',
        url: `http://localhost:8378/1/classes/SubKeyTest/${obj.id}`,
        headers,
        body: JSON.stringify({
          'stats.x":0,"pg_sleep(3)': { __op: 'Increment', amount: 1 },
        }),
      }).catch(() => {});

      const verify = await new Parse.Query('SubKeyTest').get(obj.id);
      // Original counter is untouched
      expect(verify.get('stats').counter).toBe(0);
      // No injected key exists — the payload is treated as a single literal key name
      expect(verify.get('stats')['pg_sleep(3)']).toBeUndefined();
    });

    it_only_db('postgres')('allows valid Increment on nested object field with normal sub-key', async () => {
      const obj = new Parse.Object('SubKeyTest');
      obj.set('stats', { counter: 5 });
      await obj.save();

      const response = await request({
        method: 'PUT',
        url: `http://localhost:8378/1/classes/SubKeyTest/${obj.id}`,
        headers,
        body: JSON.stringify({
          'stats.counter': { __op: 'Increment', amount: 2 },
        }),
      });

      expect(response.status).toBe(200);
      const verify = await new Parse.Query('SubKeyTest').get(obj.id);
      expect(verify.get('stats').counter).toBe(7);
    });
  });

  describe('(GHSA-r2m8-pxm9-9c4g) Protected fields WHERE clause bypass via dot-notation on object-type fields', () => {
    let obj;

    beforeEach(async () => {
      const schema = new Parse.Schema('SecretClass');
      schema.addObject('secretObj');
      schema.addString('publicField');
      schema.setCLP({
        find: { '*': true },
        get: { '*': true },
        create: { '*': true },
        update: { '*': true },
        delete: { '*': true },
        addField: {},
        protectedFields: { '*': ['secretObj'] },
      });
      await schema.save();

      obj = new Parse.Object('SecretClass');
      obj.set('secretObj', { apiKey: 'SENSITIVE_KEY_123', score: 42 });
      obj.set('publicField', 'visible');
      await obj.save(null, { useMasterKey: true });
    });

    it('should deny query with dot-notation on protected field in where clause', async () => {
      const res = await request({
        method: 'GET',
        url: `${Parse.serverURL}/classes/SecretClass`,
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-REST-API-Key': 'rest',
        },
        qs: { where: JSON.stringify({ 'secretObj.apiKey': 'SENSITIVE_KEY_123' }) },
      }).catch(e => e);
      expect(res.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      expect(res.data.error).toBe('Permission denied');
    });

    it('should deny query with dot-notation on protected field in $or', async () => {
      const res = await request({
        method: 'GET',
        url: `${Parse.serverURL}/classes/SecretClass`,
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-REST-API-Key': 'rest',
        },
        qs: {
          where: JSON.stringify({
            $or: [{ 'secretObj.apiKey': 'SENSITIVE_KEY_123' }, { 'secretObj.apiKey': 'other' }],
          }),
        },
      }).catch(e => e);
      expect(res.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      expect(res.data.error).toBe('Permission denied');
    });

    it('should deny query with dot-notation on protected field in $and', async () => {
      const res = await request({
        method: 'GET',
        url: `${Parse.serverURL}/classes/SecretClass`,
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-REST-API-Key': 'rest',
        },
        qs: {
          where: JSON.stringify({
            $and: [{ 'secretObj.apiKey': 'SENSITIVE_KEY_123' }, { publicField: 'visible' }],
          }),
        },
      }).catch(e => e);
      expect(res.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      expect(res.data.error).toBe('Permission denied');
    });

    it('should deny query with dot-notation on protected field in $nor', async () => {
      const res = await request({
        method: 'GET',
        url: `${Parse.serverURL}/classes/SecretClass`,
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-REST-API-Key': 'rest',
        },
        qs: {
          where: JSON.stringify({
            $nor: [{ 'secretObj.apiKey': 'WRONG' }],
          }),
        },
      }).catch(e => e);
      expect(res.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      expect(res.data.error).toBe('Permission denied');
    });

    it('should deny query with deeply nested dot-notation on protected field', async () => {
      const res = await request({
        method: 'GET',
        url: `${Parse.serverURL}/classes/SecretClass`,
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-REST-API-Key': 'rest',
        },
        qs: { where: JSON.stringify({ 'secretObj.nested.deep.key': 'value' }) },
      }).catch(e => e);
      expect(res.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      expect(res.data.error).toBe('Permission denied');
    });

    it('should deny sort on protected field via dot-notation', async () => {
      const res = await request({
        method: 'GET',
        url: `${Parse.serverURL}/classes/SecretClass`,
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-REST-API-Key': 'rest',
        },
        qs: { order: 'secretObj.score' },
      }).catch(e => e);
      expect(res.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      expect(res.data.error).toBe('Permission denied');
    });

    it('should deny sort on protected field directly', async () => {
      const res = await request({
        method: 'GET',
        url: `${Parse.serverURL}/classes/SecretClass`,
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-REST-API-Key': 'rest',
        },
        qs: { order: 'secretObj' },
      }).catch(e => e);
      expect(res.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      expect(res.data.error).toBe('Permission denied');
    });

    it('should deny descending sort on protected field via dot-notation', async () => {
      const res = await request({
        method: 'GET',
        url: `${Parse.serverURL}/classes/SecretClass`,
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-REST-API-Key': 'rest',
        },
        qs: { order: '-secretObj.score' },
      }).catch(e => e);
      expect(res.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      expect(res.data.error).toBe('Permission denied');
    });

    it('should still allow queries on non-protected fields', async () => {
      const response = await request({
        method: 'GET',
        url: `${Parse.serverURL}/classes/SecretClass`,
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-REST-API-Key': 'rest',
        },
        qs: { where: JSON.stringify({ publicField: 'visible' }) },
      });
      expect(response.data.results.length).toBe(1);
      expect(response.data.results[0].publicField).toBe('visible');
      expect(response.data.results[0].secretObj).toBeUndefined();
    });

    it('should still allow sort on non-protected fields', async () => {
      const response = await request({
        method: 'GET',
        url: `${Parse.serverURL}/classes/SecretClass`,
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-REST-API-Key': 'rest',
        },
        qs: { order: 'publicField' },
      });
      expect(response.data.results.length).toBe(1);
    });

    it('should still allow master key to query protected fields with dot-notation', async () => {
      const response = await request({
        method: 'GET',
        url: `${Parse.serverURL}/classes/SecretClass`,
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-Master-Key': Parse.masterKey,
        },
        qs: { where: JSON.stringify({ 'secretObj.apiKey': 'SENSITIVE_KEY_123' }) },
      });
      expect(response.data.results.length).toBe(1);
    });

    it('should still block direct query on protected field (existing behavior)', async () => {
      const res = await request({
        method: 'GET',
        url: `${Parse.serverURL}/classes/SecretClass`,
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-REST-API-Key': 'rest',
        },
        qs: { where: JSON.stringify({ secretObj: { apiKey: 'SENSITIVE_KEY_123' } }) },
      }).catch(e => e);
      expect(res.status).toBe(400);
    });
  });

  describe('(GHSA-j7mm-f4rv-6q6q) Protected fields bypass via LiveQuery dot-notation WHERE', () => {
    let obj;

    beforeEach(async () => {
      Parse.CoreManager.getLiveQueryController().setDefaultLiveQueryClient(null);
      await reconfigureServer({
        liveQuery: { classNames: ['SecretClass'] },
        startLiveQueryServer: true,
        verbose: false,
        silent: true,
      });
      const config = Config.get(Parse.applicationId);
      const schemaController = await config.database.loadSchema();
      await schemaController.addClassIfNotExists(
        'SecretClass',
        { secretObj: { type: 'Object' }, publicField: { type: 'String' } },
      );
      await schemaController.updateClass(
        'SecretClass',
        {},
        {
          find: { '*': true },
          get: { '*': true },
          create: { '*': true },
          update: { '*': true },
          delete: { '*': true },
          addField: {},
          protectedFields: { '*': ['secretObj'] },
        }
      );

      obj = new Parse.Object('SecretClass');
      obj.set('secretObj', { apiKey: 'SENSITIVE_KEY_123', score: 42 });
      obj.set('publicField', 'visible');
      await obj.save(null, { useMasterKey: true });
    });

    afterEach(async () => {
      const client = await Parse.CoreManager.getLiveQueryController().getDefaultLiveQueryClient();
      if (client) {
        await client.close();
      }
    });

    it('should reject LiveQuery subscription with dot-notation on protected field in where clause', async () => {
      const query = new Parse.Query('SecretClass');
      query._addCondition('secretObj.apiKey', '$eq', 'SENSITIVE_KEY_123');
      await expectAsync(query.subscribe()).toBeRejectedWith(
        new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Permission denied')
      );
    });

    it('should reject LiveQuery subscription with protected field directly in where clause', async () => {
      const query = new Parse.Query('SecretClass');
      query.exists('secretObj');
      await expectAsync(query.subscribe()).toBeRejectedWith(
        new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Permission denied')
      );
    });

    it('should reject LiveQuery subscription with protected field in $or', async () => {
      const q1 = new Parse.Query('SecretClass');
      q1._addCondition('secretObj.apiKey', '$eq', 'SENSITIVE_KEY_123');
      const q2 = new Parse.Query('SecretClass');
      q2._addCondition('secretObj.apiKey', '$eq', 'other');
      const query = Parse.Query.or(q1, q2);
      await expectAsync(query.subscribe()).toBeRejectedWith(
        new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Permission denied')
      );
    });

    it('should reject LiveQuery subscription with protected field in $and', async () => {
      // Build $and manually since Parse SDK doesn't expose it directly
      const query = new Parse.Query('SecretClass');
      query._where = { $and: [{ 'secretObj.apiKey': 'SENSITIVE_KEY_123' }, { publicField: 'visible' }] };
      await expectAsync(query.subscribe()).toBeRejectedWith(
        new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Permission denied')
      );
    });

    it('should reject LiveQuery subscription with protected field in $nor', async () => {
      // Build $nor manually since Parse SDK doesn't expose it directly
      const query = new Parse.Query('SecretClass');
      query._where = { $nor: [{ 'secretObj.apiKey': 'SENSITIVE_KEY_123' }] };
      await expectAsync(query.subscribe()).toBeRejectedWith(
        new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Permission denied')
      );
    });

    it('should reject LiveQuery subscription with $regex on protected field (boolean oracle)', async () => {
      const query = new Parse.Query('SecretClass');
      query._addCondition('secretObj.apiKey', '$regex', '^S');
      await expectAsync(query.subscribe()).toBeRejectedWith(
        new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Permission denied')
      );
    });

    it('should reject LiveQuery subscription with deeply nested dot-notation on protected field', async () => {
      const query = new Parse.Query('SecretClass');
      query._addCondition('secretObj.nested.deep.key', '$eq', 'value');
      await expectAsync(query.subscribe()).toBeRejectedWith(
        new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Permission denied')
      );
    });

    it('should allow LiveQuery subscription on non-protected fields and strip protected fields from response', async () => {
      const query = new Parse.Query('SecretClass');
      query.exists('publicField');
      const subscription = await query.subscribe();
      await Promise.all([
        new Promise(resolve => {
          subscription.on('update', object => {
            expect(object.get('secretObj')).toBeUndefined();
            expect(object.get('publicField')).toBe('updated');
            resolve();
          });
        }),
        obj.save({ publicField: 'updated' }, { useMasterKey: true }),
      ]);
    });

    it('should reject admin user querying protected field when both * and role protect it', async () => {
      // Common case: protectedFields has both '*' and 'role:admin' entries.
      // Even without resolving user roles, the '*' protection applies and blocks the query.
      // This validates that role-based exemptions are irrelevant when '*' covers the field.
      const config = Config.get(Parse.applicationId);
      const schemaController = await config.database.loadSchema();
      await schemaController.updateClass(
        'SecretClass',
        {},
        {
          find: { '*': true },
          get: { '*': true },
          create: { '*': true },
          update: { '*': true },
          delete: { '*': true },
          addField: {},
          protectedFields: { '*': ['secretObj'], 'role:admin': ['secretObj'] },
        }
      );

      const user = new Parse.User();
      user.setUsername('adminuser');
      user.setPassword('password');
      await user.signUp();

      const roleACL = new Parse.ACL();
      roleACL.setPublicReadAccess(true);
      const role = new Parse.Role('admin', roleACL);
      role.getUsers().add(user);
      await role.save(null, { useMasterKey: true });

      const query = new Parse.Query('SecretClass');
      query._addCondition('secretObj.apiKey', '$eq', 'SENSITIVE_KEY_123');
      await expectAsync(query.subscribe(user.getSessionToken())).toBeRejectedWith(
        new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Permission denied')
      );
    });

    it('should not reject when role-only protection exists without * entry', async () => {
      // Edge case: protectedFields only has a role entry, no '*'.
      // Without resolving roles, the protection set is empty, so the subscription is allowed.
      // This is a correctness gap, not a security issue: the role entry means "protect this
      // field FROM role members" (i.e. admins should not see it). Not resolving roles means
      // the admin loses their own restriction — they see data meant to be hidden from them.
      // This does not allow unprivileged users to access protected data.
      const config = Config.get(Parse.applicationId);
      const schemaController = await config.database.loadSchema();
      await schemaController.updateClass(
        'SecretClass',
        {},
        {
          find: { '*': true },
          get: { '*': true },
          create: { '*': true },
          update: { '*': true },
          delete: { '*': true },
          addField: {},
          protectedFields: { 'role:admin': ['secretObj'] },
        }
      );

      const user = new Parse.User();
      user.setUsername('adminuser2');
      user.setPassword('password');
      await user.signUp();

      const roleACL = new Parse.ACL();
      roleACL.setPublicReadAccess(true);
      const role = new Parse.Role('admin', roleACL);
      role.getUsers().add(user);
      await role.save(null, { useMasterKey: true });

      // This subscribes successfully because without '*' entry, no fields are protected
      // for purposes of WHERE clause validation. The role-only config means "hide secretObj
      // from admins" — a restriction ON the privileged user, not a security boundary.
      const query = new Parse.Query('SecretClass');
      query._addCondition('secretObj.apiKey', '$eq', 'SENSITIVE_KEY_123');
      const subscription = await query.subscribe(user.getSessionToken());
      expect(subscription).toBeDefined();
    });

    // Note: master key bypass is inherently tested by the `!client.hasMasterKey` guard
    // in the implementation. Testing master key LiveQuery requires configuring keyPairs
    // in the LiveQuery server config, which is not part of the default test setup.
  });

  describe('(GHSA-w54v-hf9p-8856) User enumeration via email verification endpoint', () => {
    let sendVerificationEmail;

    async function createTestUsers() {
      const user = new Parse.User();
      user.setUsername('testuser');
      user.setPassword('password123');
      user.set('email', 'unverified@example.com');
      await user.signUp();

      const user2 = new Parse.User();
      user2.setUsername('verifieduser');
      user2.setPassword('password123');
      user2.set('email', 'verified@example.com');
      await user2.signUp();
      const config = Config.get(Parse.applicationId);
      await config.database.update(
        '_User',
        { username: 'verifieduser' },
        { emailVerified: true }
      );
    }

    describe('default (emailVerifySuccessOnInvalidEmail: true)', () => {
      beforeEach(async () => {
        sendVerificationEmail = jasmine.createSpy('sendVerificationEmail');
        await reconfigureServer({
          appName: 'test',
          publicServerURL: 'http://localhost:8378/1',
          verifyUserEmails: true,
          emailAdapter: {
            sendVerificationEmail,
            sendPasswordResetEmail: () => Promise.resolve(),
            sendMail: () => {},
          },
        });
        await createTestUsers();
      });
      it('returns success for non-existent email', async () => {
        const response = await request({
          url: 'http://localhost:8378/1/verificationEmailRequest',
          method: 'POST',
          body: { email: 'nonexistent@example.com' },
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
            'Content-Type': 'application/json',
          },
        });
        expect(response.status).toBe(200);
        expect(response.data).toEqual({});
      });

      it('returns success for already verified email', async () => {
        const response = await request({
          url: 'http://localhost:8378/1/verificationEmailRequest',
          method: 'POST',
          body: { email: 'verified@example.com' },
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
            'Content-Type': 'application/json',
          },
        });
        expect(response.status).toBe(200);
        expect(response.data).toEqual({});
      });

      it('returns success for unverified email', async () => {
        sendVerificationEmail.calls.reset();
        const response = await request({
          url: 'http://localhost:8378/1/verificationEmailRequest',
          method: 'POST',
          body: { email: 'unverified@example.com' },
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
            'Content-Type': 'application/json',
          },
        });
        expect(response.status).toBe(200);
        expect(response.data).toEqual({});
        await jasmine.timeout();
        expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
      });

      it('does not send verification email for non-existent email', async () => {
        sendVerificationEmail.calls.reset();
        await request({
          url: 'http://localhost:8378/1/verificationEmailRequest',
          method: 'POST',
          body: { email: 'nonexistent@example.com' },
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
            'Content-Type': 'application/json',
          },
        });
        expect(sendVerificationEmail).not.toHaveBeenCalled();
      });

      it('does not send verification email for already verified email', async () => {
        sendVerificationEmail.calls.reset();
        await request({
          url: 'http://localhost:8378/1/verificationEmailRequest',
          method: 'POST',
          body: { email: 'verified@example.com' },
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
            'Content-Type': 'application/json',
          },
        });
        expect(sendVerificationEmail).not.toHaveBeenCalled();
      });
    });

    describe('opt-out (emailVerifySuccessOnInvalidEmail: false)', () => {
      beforeEach(async () => {
        sendVerificationEmail = jasmine.createSpy('sendVerificationEmail');
        await reconfigureServer({
          appName: 'test',
          publicServerURL: 'http://localhost:8378/1',
          verifyUserEmails: true,
          emailVerifySuccessOnInvalidEmail: false,
          emailAdapter: {
            sendVerificationEmail,
            sendPasswordResetEmail: () => Promise.resolve(),
            sendMail: () => {},
          },
        });
        await createTestUsers();
      });

      it('returns error for non-existent email', async () => {
        const response = await request({
          url: 'http://localhost:8378/1/verificationEmailRequest',
          method: 'POST',
          body: { email: 'nonexistent@example.com' },
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
            'Content-Type': 'application/json',
          },
        }).catch(e => e);
        expect(response.data.code).toBe(Parse.Error.EMAIL_NOT_FOUND);
      });

      it('returns error for already verified email', async () => {
        const response = await request({
          url: 'http://localhost:8378/1/verificationEmailRequest',
          method: 'POST',
          body: { email: 'verified@example.com' },
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
            'Content-Type': 'application/json',
          },
        }).catch(e => e);
        expect(response.data.code).toBe(Parse.Error.OTHER_CAUSE);
        expect(response.data.error).toBe('Email verified@example.com is already verified.');
      });

      it('sends verification email for unverified email', async () => {
        sendVerificationEmail.calls.reset();
        await request({
          url: 'http://localhost:8378/1/verificationEmailRequest',
          method: 'POST',
          body: { email: 'unverified@example.com' },
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
            'Content-Type': 'application/json',
          },
        });
        await jasmine.timeout();
        expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
      });
    });

    it('rejects invalid emailVerifySuccessOnInvalidEmail values', async () => {
      const invalidValues = [[], {}, 0, 1, '', 'string'];
      for (const value of invalidValues) {
        await expectAsync(
          reconfigureServer({
            appName: 'test',
            publicServerURL: 'http://localhost:8378/1',
            verifyUserEmails: true,
            emailVerifySuccessOnInvalidEmail: value,
            emailAdapter: {
              sendVerificationEmail: () => {},
              sendPasswordResetEmail: () => Promise.resolve(),
              sendMail: () => {},
            },
          })
        ).toBeRejectedWith('emailVerifySuccessOnInvalidEmail must be a boolean value');
      }
    });
  });

  describe('(GHSA-4m9m-p9j9-5hjw) User enumeration via signup endpoint', () => {
    async function updateCLP(permissions) {
      const response = await fetch(Parse.serverURL + '/schemas/_User', {
        method: 'PUT',
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-Master-Key': Parse.masterKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ classLevelPermissions: permissions }),
      });
      const body = await response.json();
      if (body.error) {
        throw body;
      }
    }

    it('does not reveal existing username when public create CLP is disabled', async () => {
      const user = new Parse.User();
      user.setUsername('existingUser');
      user.setPassword('password123');
      await user.signUp();
      await Parse.User.logOut();

      await updateCLP({
        get: { '*': true },
        find: { '*': true },
        create: {},
        update: { '*': true },
        delete: { '*': true },
        addField: {},
      });

      const response = await request({
        url: 'http://localhost:8378/1/classes/_User',
        method: 'POST',
        body: { username: 'existingUser', password: 'otherpassword' },
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-REST-API-Key': 'rest',
          'Content-Type': 'application/json',
        },
      }).catch(e => e);
      expect(response.data.code).not.toBe(Parse.Error.USERNAME_TAKEN);
      expect(response.data.error).not.toContain('Account already exists');
      expect(response.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
    });

    it('does not reveal existing email when public create CLP is disabled', async () => {
      const user = new Parse.User();
      user.setUsername('emailUser');
      user.setPassword('password123');
      user.setEmail('existing@example.com');
      await user.signUp();
      await Parse.User.logOut();

      await updateCLP({
        get: { '*': true },
        find: { '*': true },
        create: {},
        update: { '*': true },
        delete: { '*': true },
        addField: {},
      });

      const response = await request({
        url: 'http://localhost:8378/1/classes/_User',
        method: 'POST',
        body: { username: 'newUser', password: 'otherpassword', email: 'existing@example.com' },
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-REST-API-Key': 'rest',
          'Content-Type': 'application/json',
        },
      }).catch(e => e);
      expect(response.data.code).not.toBe(Parse.Error.EMAIL_TAKEN);
      expect(response.data.error).not.toContain('Account already exists');
      expect(response.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
    });

    it('still returns username taken error when public create CLP is enabled', async () => {
      const user = new Parse.User();
      user.setUsername('existingUser');
      user.setPassword('password123');
      await user.signUp();
      await Parse.User.logOut();

      const response = await request({
        url: 'http://localhost:8378/1/classes/_User',
        method: 'POST',
        body: { username: 'existingUser', password: 'otherpassword' },
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-REST-API-Key': 'rest',
          'Content-Type': 'application/json',
        },
      }).catch(e => e);
      expect(response.data.code).toBe(Parse.Error.USERNAME_TAKEN);
    });
  });

  describe('(GHSA-c442-97qw-j6c6) SQL Injection via $regex query operator field name in PostgreSQL adapter', () => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest',
      'X-Parse-Master-Key': 'test',
    };
    const serverURL = 'http://localhost:8378/1';

    beforeEach(async () => {
      const obj = new Parse.Object('TestClass');
      obj.set('playerName', 'Alice');
      obj.set('score', 100);
      await obj.save(null, { useMasterKey: true });
    });

    it('rejects field names containing double quotes in $regex query with master key', async () => {
      const maliciousField = 'playerName" OR 1=1 --';
      const response = await request({
        method: 'GET',
        url: `${serverURL}/classes/TestClass`,
        headers,
        qs: {
          where: JSON.stringify({
            [maliciousField]: { $regex: 'x' },
          }),
        },
      }).catch(e => e);
      expect(response.data.code).toBe(Parse.Error.INVALID_KEY_NAME);
    });

    it('rejects field names containing single quotes in $regex query with master key', async () => {
      const maliciousField = "playerName' OR '1'='1";
      const response = await request({
        method: 'GET',
        url: `${serverURL}/classes/TestClass`,
        headers,
        qs: {
          where: JSON.stringify({
            [maliciousField]: { $regex: 'x' },
          }),
        },
      }).catch(e => e);
      expect(response.data.code).toBe(Parse.Error.INVALID_KEY_NAME);
    });

    it('rejects field names containing semicolons in $regex query with master key', async () => {
      const maliciousField = 'playerName; DROP TABLE "TestClass" --';
      const response = await request({
        method: 'GET',
        url: `${serverURL}/classes/TestClass`,
        headers,
        qs: {
          where: JSON.stringify({
            [maliciousField]: { $regex: 'x' },
          }),
        },
      }).catch(e => e);
      expect(response.data.code).toBe(Parse.Error.INVALID_KEY_NAME);
    });

    it('rejects field names containing parentheses in $regex query with master key', async () => {
      const maliciousField = 'playerName" ~ \'x\' OR (SELECT 1) --';
      const response = await request({
        method: 'GET',
        url: `${serverURL}/classes/TestClass`,
        headers,
        qs: {
          where: JSON.stringify({
            [maliciousField]: { $regex: 'x' },
          }),
        },
      }).catch(e => e);
      expect(response.data.code).toBe(Parse.Error.INVALID_KEY_NAME);
    });

    it('allows legitimate $regex query with master key', async () => {
      const response = await request({
        method: 'GET',
        url: `${serverURL}/classes/TestClass`,
        headers,
        qs: {
          where: JSON.stringify({
            playerName: { $regex: 'Ali' },
          }),
        },
      });
      expect(response.data.results.length).toBe(1);
      expect(response.data.results[0].playerName).toBe('Alice');
    });

    it('allows legitimate $regex query with dot notation and master key', async () => {
      const obj = new Parse.Object('TestClass');
      obj.set('metadata', { tag: 'hello-world' });
      await obj.save(null, { useMasterKey: true });
      const response = await request({
        method: 'GET',
        url: `${serverURL}/classes/TestClass`,
        headers,
        qs: {
          where: JSON.stringify({
            'metadata.tag': { $regex: 'hello' },
          }),
        },
      });
      expect(response.data.results.length).toBe(1);
      expect(response.data.results[0].metadata.tag).toBe('hello-world');
    });

    it('allows legitimate $regex query without master key', async () => {
      const response = await request({
        method: 'GET',
        url: `${serverURL}/classes/TestClass`,
        headers: {
          'Content-Type': 'application/json',
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
        },
        qs: {
          where: JSON.stringify({
            playerName: { $regex: 'Ali' },
          }),
        },
      });
      expect(response.data.results.length).toBe(1);
      expect(response.data.results[0].playerName).toBe('Alice');
    });

    it('rejects field names with SQL injection via non-$regex operators with master key', async () => {
      const maliciousField = 'playerName" OR 1=1 --';
      const response = await request({
        method: 'GET',
        url: `${serverURL}/classes/TestClass`,
        headers,
        qs: {
          where: JSON.stringify({
            [maliciousField]: { $exists: true },
          }),
        },
      }).catch(e => e);
      expect(response.data.code).toBe(Parse.Error.INVALID_KEY_NAME);
    });

    describe('validateQuery key name enforcement', () => {
      const maliciousField = 'field"; DROP TABLE test --';
      const noMasterHeaders = {
        'Content-Type': 'application/json',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      };

      it('rejects malicious field name in find without master key', async () => {
        const response = await request({
          method: 'GET',
          url: `${serverURL}/classes/TestClass`,
          headers: noMasterHeaders,
          qs: {
            where: JSON.stringify({ [maliciousField]: 'value' }),
          },
        }).catch(e => e);
        expect(response.data.code).toBe(Parse.Error.INVALID_KEY_NAME);
      });

      it('rejects malicious field name in find with master key', async () => {
        const response = await request({
          method: 'GET',
          url: `${serverURL}/classes/TestClass`,
          headers,
          qs: {
            where: JSON.stringify({ [maliciousField]: 'value' }),
          },
        }).catch(e => e);
        expect(response.data.code).toBe(Parse.Error.INVALID_KEY_NAME);
      });

      it('allows master key to query whitelisted internal field _email_verify_token', async () => {
        await reconfigureServer({
          verifyUserEmails: true,
          emailAdapter: {
            sendVerificationEmail: () => Promise.resolve(),
            sendPasswordResetEmail: () => Promise.resolve(),
            sendMail: () => {},
          },
          appName: 'test',
          publicServerURL: 'http://localhost:8378/1',
        });
        const user = new Parse.User();
        user.setUsername('testuser');
        user.setPassword('testpass');
        user.setEmail('test@example.com');
        await user.signUp();
        const response = await request({
          method: 'GET',
          url: `${serverURL}/classes/_User`,
          headers,
          qs: {
            where: JSON.stringify({ _email_verify_token: { $exists: true } }),
          },
        });
        expect(response.data.results.length).toBeGreaterThan(0);
      });

      it('rejects non-master key querying internal field _email_verify_token', async () => {
        const response = await request({
          method: 'GET',
          url: `${serverURL}/classes/_User`,
          headers: noMasterHeaders,
          qs: {
            where: JSON.stringify({ _email_verify_token: { $exists: true } }),
          },
        }).catch(e => e);
        expect(response.data.code).toBe(Parse.Error.INVALID_KEY_NAME);
      });

      describe('non-master key cannot update internal fields', () => {
        const internalFields = [
          '_rperm',
          '_wperm',
          '_hashed_password',
          '_email_verify_token',
          '_perishable_token',
          '_perishable_token_expires_at',
          '_email_verify_token_expires_at',
          '_failed_login_count',
          '_account_lockout_expires_at',
          '_password_changed_at',
          '_password_history',
          '_tombstone',
          '_session_token',
        ];

        for (const field of internalFields) {
          it(`rejects non-master key updating ${field}`, async () => {
            const user = new Parse.User();
            user.setUsername(`updatetest_${field}`);
            user.setPassword('password123');
            await user.signUp();
            const response = await request({
              method: 'PUT',
              url: `${serverURL}/classes/_User/${user.id}`,
              headers: {
                'Content-Type': 'application/json',
                'X-Parse-Application-Id': 'test',
                'X-Parse-REST-API-Key': 'rest',
                'X-Parse-Session-Token': user.getSessionToken(),
              },
              body: JSON.stringify({ [field]: 'malicious_value' }),
            }).catch(e => e);
            expect(response.data.code).toBe(Parse.Error.INVALID_KEY_NAME);
          });
        }
      });
    });

    describe('(GHSA-2cjm-2gwv-m892) OAuth2 adapter singleton shares mutable state across providers', () => {
      it('should return isolated adapter instances for different OAuth2 providers', () => {
        const { loadAuthAdapter } = require('../lib/Adapters/Auth/index');

        const authOptions = {
          providerA: {
            oauth2: true,
            tokenIntrospectionEndpointUrl: 'https://a.example.com/introspect',
            useridField: 'sub',
            appidField: 'aud',
            appIds: ['appA'],
          },
          providerB: {
            oauth2: true,
            tokenIntrospectionEndpointUrl: 'https://b.example.com/introspect',
            useridField: 'sub',
            appidField: 'aud',
            appIds: ['appB'],
          },
        };

        const resultA = loadAuthAdapter('providerA', authOptions);
        const resultB = loadAuthAdapter('providerB', authOptions);

        // Adapters must be different instances to prevent cross-contamination
        expect(resultA.adapter).not.toBe(resultB.adapter);

        // After loading providerB, providerA's config must still be intact
        expect(resultA.adapter.tokenIntrospectionEndpointUrl).toBe('https://a.example.com/introspect');
        expect(resultA.adapter.appIds).toEqual(['appA']);
        expect(resultB.adapter.tokenIntrospectionEndpointUrl).toBe('https://b.example.com/introspect');
        expect(resultB.adapter.appIds).toEqual(['appB']);
      });

      it('should not allow concurrent OAuth2 auth requests to cross-contaminate provider config', async () => {
        await reconfigureServer({
          auth: {
            oauthProviderA: {
              oauth2: true,
              tokenIntrospectionEndpointUrl: 'https://a.example.com/introspect',
              useridField: 'sub',
              appidField: 'aud',
              appIds: ['appA'],
            },
            oauthProviderB: {
              oauth2: true,
              tokenIntrospectionEndpointUrl: 'https://b.example.com/introspect',
              useridField: 'sub',
              appidField: 'aud',
              appIds: ['appB'],
            },
          },
        });

        // Provider A: valid token with appA audience
        // Provider B: valid token with appB audience
        mockFetch([
          {
            url: 'https://a.example.com/introspect',
            method: 'POST',
            response: {
              ok: true,
              json: () => Promise.resolve({ active: true, sub: 'user1', aud: 'appA' }),
            },
          },
          {
            url: 'https://b.example.com/introspect',
            method: 'POST',
            response: {
              ok: true,
              json: () => Promise.resolve({ active: true, sub: 'user2', aud: 'appB' }),
            },
          },
        ]);

        // Both providers should authenticate independently without cross-contamination
        const [userA, userB] = await Promise.all([
          Parse.User.logInWith('oauthProviderA', {
            authData: { id: 'user1', access_token: 'tokenA' },
          }),
          Parse.User.logInWith('oauthProviderB', {
            authData: { id: 'user2', access_token: 'tokenB' },
          }),
        ]);

        expect(userA.id).toBeDefined();
        expect(userB.id).toBeDefined();
      });
    });

    describe('(GHSA-p2x3-8689-cwpg) GraphQL WebSocket middleware bypass', () => {
      let httpServer;
      const gqlPort = 13399;

      const gqlHeaders = {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Javascript-Key': 'test',
        'Content-Type': 'application/json',
      };

      async function setupGraphQLServer(serverOptions = {}, graphQLOptions = {}) {
        if (httpServer) {
          await new Promise(resolve => httpServer.close(resolve));
        }
        const server = await reconfigureServer(serverOptions);
        const expressApp = express();
        httpServer = http.createServer(expressApp);
        expressApp.use('/parse', server.app);
        const parseGraphQLServer = new ParseGraphQLServer(server, {
          graphQLPath: '/graphql',
          ...graphQLOptions,
        });
        parseGraphQLServer.applyGraphQL(expressApp);
        await new Promise(resolve => httpServer.listen({ port: gqlPort }, resolve));
        return parseGraphQLServer;
      }

      async function gqlRequest(query, headers = gqlHeaders) {
        const response = await fetch(`http://localhost:${gqlPort}/graphql`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ query }),
        });
        return { status: response.status, body: await response.json().catch(() => null) };
      }

      afterEach(async () => {
        if (httpServer) {
          await new Promise(resolve => httpServer.close(resolve));
          httpServer = null;
        }
      });

      it('should not have createSubscriptions method', async () => {
        const pgServer = await setupGraphQLServer();
        expect(pgServer.createSubscriptions).toBeUndefined();
      });

      it('should not accept WebSocket connections on /subscriptions path', async () => {
        await setupGraphQLServer();
        const connectionResult = await new Promise((resolve) => {
          const socket = new ws(`ws://localhost:${gqlPort}/subscriptions`);
          socket.on('open', () => {
            socket.close();
            resolve('connected');
          });
          socket.on('error', () => {
            resolve('refused');
          });
          setTimeout(() => {
            socket.close();
            resolve('timeout');
          }, 2000);
        });
        expect(connectionResult).not.toBe('connected');
      });

      it('HTTP GraphQL should still work with API key', async () => {
        await setupGraphQLServer();
        const result = await gqlRequest('{ health }');
        expect(result.status).toBe(200);
        expect(result.body?.data?.health).toBeTruthy();
      });

      it('HTTP GraphQL should still reject requests without API key', async () => {
        await setupGraphQLServer();
        const result = await gqlRequest('{ health }', { 'Content-Type': 'application/json' });
        expect(result.status).toBe(403);
      });

      it('HTTP introspection control should still work', async () => {
        await setupGraphQLServer({}, { graphQLPublicIntrospection: false });
        const result = await gqlRequest('{ __schema { types { name } } }');
        expect(result.body?.errors).toBeDefined();
        expect(result.body.errors[0].message).toContain('Introspection is not allowed');
      });

      it('HTTP complexity limits should still work', async () => {
        await setupGraphQLServer({ requestComplexity: { graphQLFields: 5 } });
        const fields = Array.from({ length: 10 }, (_, i) => `f${i}: health`).join(' ');
        const result = await gqlRequest(`{ ${fields} }`);
        expect(result.body?.errors).toBeDefined();
        expect(result.body.errors[0].message).toMatch(/exceeds maximum allowed/);
      });
    });

    describe('(GHSA-9ccr-fpp6-78qf) Schema poisoning via __proto__ bypassing requestKeywordDenylist and addField CLP', () => {
      const headers = {
        'Content-Type': 'application/json',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      };

      it('rejects __proto__ in request body via HTTP', async () => {
        const response = await request({
          headers,
          method: 'POST',
          url: 'http://localhost:8378/1/classes/ProtoTest',
          body: JSON.stringify(JSON.parse('{"name":"test","__proto__":{"injected":"value"}}')),
        }).catch(e => e);
        expect(response.status).toBe(400);
        const text = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        expect(text.code).toBe(Parse.Error.INVALID_KEY_NAME);
        expect(text.error).toContain('__proto__');
      });

      it('does not add fields to a locked schema via __proto__', async () => {
        const schema = new Parse.Schema('LockedSchema');
        schema.addString('name');
        schema.setCLP({
          find: { '*': true },
          get: { '*': true },
          create: { '*': true },
          update: { '*': true },
          delete: { '*': true },
          addField: {},
        });
        await schema.save();

        // Attempt to inject a field via __proto__
        const response = await request({
          headers,
          method: 'POST',
          url: 'http://localhost:8378/1/classes/LockedSchema',
          body: JSON.stringify(JSON.parse('{"name":"test","__proto__":{"newField":"bypassed"}}')),
        }).catch(e => e);

        // Should be rejected by denylist
        expect(response.status).toBe(400);

        // Verify schema was not modified
        const schemaResponse = await request({
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-Master-Key': 'test',
          },
          method: 'GET',
          url: 'http://localhost:8378/1/schemas/LockedSchema',
        });
        const fields = schemaResponse.data.fields;
        expect(fields.newField).toBeUndefined();
      });

      it('does not cause schema type conflict via __proto__', async () => {
        const schema = new Parse.Schema('TypeConflict');
        schema.addString('name');
        schema.addString('score');
        schema.setCLP({
          find: { '*': true },
          get: { '*': true },
          create: { '*': true },
          update: { '*': true },
          delete: { '*': true },
          addField: {},
        });
        await schema.save();

        // Attempt to inject 'score' as Number via __proto__
        const response = await request({
          headers,
          method: 'POST',
          url: 'http://localhost:8378/1/classes/TypeConflict',
          body: JSON.stringify(JSON.parse('{"name":"test","__proto__":{"score":42}}')),
        }).catch(e => e);

        // Should be rejected by denylist
        expect(response.status).toBe(400);

        // Verify 'score' field is still String type
        const obj = new Parse.Object('TypeConflict');
        obj.set('name', 'valid');
        obj.set('score', 'string-value');
        await obj.save();
        expect(obj.get('score')).toBe('string-value');
      });
    });
  });

  describe('(GHSA-9xp9-j92r-p88v) Stack overflow process crash via deeply nested query operators', () => {
    it('rejects deeply nested $or query when queryDepth is set', async () => {
      await reconfigureServer({
        requestComplexity: { queryDepth: 10 },
      });
      const auth = require('../lib/Auth');
      const rest = require('../lib/rest');
      const config = Config.get('test');
      let where = { username: 'test' };
      for (let i = 0; i < 15; i++) {
        where = { $or: [where, { username: 'test' }] };
      }
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', where)
      ).toBeRejectedWith(
        jasmine.objectContaining({
          message: jasmine.stringMatching(/Query condition nesting depth exceeds maximum allowed depth/),
        })
      );
    });

    it('rejects deeply nested query before transform pipeline processes it', async () => {
      await reconfigureServer({
        requestComplexity: { queryDepth: 10 },
      });
      const auth = require('../lib/Auth');
      const rest = require('../lib/rest');
      const config = Config.get('test');
      // Depth 50 bypasses the fix because RestQuery.js transform pipeline
      // recursively traverses the structure before validateQuery() is reached
      let where = { username: 'test' };
      for (let i = 0; i < 50; i++) {
        where = { $and: [where] };
      }
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', where)
      ).toBeRejectedWith(
        jasmine.objectContaining({
          message: jasmine.stringMatching(/Query condition nesting depth exceeds maximum allowed depth/),
        })
      );
    });

    it('rejects deeply nested query via REST API without authentication', async () => {
      await reconfigureServer({
        requestComplexity: { queryDepth: 10 },
      });
      let where = { username: 'test' };
      for (let i = 0; i < 50; i++) {
        where = { $or: [where] };
      }
      await expectAsync(
        request({
          method: 'GET',
          url: `${Parse.serverURL}/classes/_User`,
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
          },
          qs: { where: JSON.stringify(where) },
        })
      ).toBeRejectedWith(
        jasmine.objectContaining({
          data: jasmine.objectContaining({
            code: Parse.Error.INVALID_QUERY,
          }),
        })
      );
    });

    it('rejects deeply nested $nor query before transform pipeline', async () => {
      await reconfigureServer({
        requestComplexity: { queryDepth: 10 },
      });
      const auth = require('../lib/Auth');
      const rest = require('../lib/rest');
      const config = Config.get('test');
      let where = { username: 'test' };
      for (let i = 0; i < 50; i++) {
        where = { $nor: [where] };
      }
      await expectAsync(
        rest.find(config, auth.nobody(config), '_User', where)
      ).toBeRejectedWith(
        jasmine.objectContaining({
          message: jasmine.stringMatching(/Query condition nesting depth exceeds maximum allowed depth/),
        })
      );
    });

    it('allows queries within the depth limit', async () => {
      await reconfigureServer({
        requestComplexity: { queryDepth: 10 },
      });
      const auth = require('../lib/Auth');
      const rest = require('../lib/rest');
      const config = Config.get('test');
      let where = { username: 'test' };
      for (let i = 0; i < 5; i++) {
        where = { $or: [where] };
      }
      const result = await rest.find(config, auth.nobody(config), '_User', where);
      expect(result.results).toBeDefined();
    });
  });

  describe('(GHSA-fjxm-vhvc-gcmj) LiveQuery Operator Type Confusion', () => {
    const matchesQuery = require('../lib/LiveQuery/QueryTools').matchesQuery;

    // Unit tests: matchesQuery receives the raw where clause (not {className, where})
    // just as _matchesSubscription passes subscription.query (the where clause)
    describe('matchesQuery with type-confused operators', () => {
      it('$in with object instead of array throws', () => {
        const object = { className: 'TestObject', objectId: 'obj1', name: 'abc' };
        const where = { name: { $in: { x: 1 } } };
        expect(() => matchesQuery(object, where)).toThrow();
      });

      it('$nin with object instead of array throws', () => {
        const object = { className: 'TestObject', objectId: 'obj1', name: 'abc' };
        const where = { name: { $nin: { x: 1 } } };
        expect(() => matchesQuery(object, where)).toThrow();
      });

      it('$containedBy with object instead of array throws', () => {
        const object = { className: 'TestObject', objectId: 'obj1', name: ['abc'] };
        const where = { name: { $containedBy: { x: 1 } } };
        expect(() => matchesQuery(object, where)).toThrow();
      });

      it('$containedBy with missing field throws', () => {
        const object = { className: 'TestObject', objectId: 'obj1' };
        const where = { name: { $containedBy: ['abc', 'xyz'] } };
        expect(() => matchesQuery(object, where)).toThrow();
      });

      it('$all with object field value throws', () => {
        const object = { className: 'TestObject', objectId: 'obj1', name: { x: 1 } };
        const where = { name: { $all: ['abc'] } };
        expect(() => matchesQuery(object, where)).toThrow();
      });

      it('$in with valid array does not throw', () => {
        const object = { className: 'TestObject', objectId: 'obj1', name: 'abc' };
        const where = { name: { $in: ['abc', 'xyz'] } };
        expect(() => matchesQuery(object, where)).not.toThrow();
        expect(matchesQuery(object, where)).toBe(true);
      });
    });

    // Integration test: verify that a LiveQuery subscription with type-confused
    // operators does not crash the server and other subscriptions continue working
    describe('LiveQuery integration', () => {
      beforeEach(async () => {
        Parse.CoreManager.getLiveQueryController().setDefaultLiveQueryClient(null);
        await reconfigureServer({
          liveQuery: { classNames: ['TestObject'] },
          startLiveQueryServer: true,
          verbose: false,
          silent: true,
        });
      });

      afterEach(async () => {
        const client = await Parse.CoreManager.getLiveQueryController().getDefaultLiveQueryClient();
        if (client) {
          await client.close();
        }
      });

      it('server does not crash and other subscriptions work when type-confused subscription exists', async () => {
        // First subscribe with a malformed query via manual client
        const malClient = new Parse.LiveQueryClient({
          applicationId: 'test',
          serverURL: 'ws://localhost:1337',
          javascriptKey: 'test',
        });
        malClient.open();
        const malformedQuery = new Parse.Query('TestObject');
        malformedQuery._where = { name: { $in: { x: 1 } } };
        await malClient.subscribe(malformedQuery);

        // Then subscribe with a valid query using the default client
        const validQuery = new Parse.Query('TestObject');
        validQuery.equalTo('name', 'test');
        const validSubscription = await validQuery.subscribe();

        try {
          const createPromise = new Promise(resolve => {
            validSubscription.on('create', object => {
              expect(object.get('name')).toBe('test');
              resolve();
            });
          });

          const obj = new Parse.Object('TestObject');
          obj.set('name', 'test');
          await obj.save();
          await createPromise;
        } finally {
          malClient.close();
        }
      });
    });

    describe('(GHSA-wjqw-r9x4-j59v) Empty authData session issuance bypass', () => {
      const signupHeaders = {
        'Content-Type': 'application/json',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      };

      it('rejects signup with empty authData and no credentials', async () => {
        await reconfigureServer({ enableAnonymousUsers: false });
        const res = await request({
          method: 'POST',
          url: 'http://localhost:8378/1/users',
          headers: signupHeaders,
          body: JSON.stringify({ authData: {} }),
        }).catch(e => e);
        expect(res.status).toBe(400);
        expect(res.data.code).toBe(Parse.Error.USERNAME_MISSING);
      });

      it('rejects signup with empty authData and no credentials when anonymous users enabled', async () => {
        await reconfigureServer({ enableAnonymousUsers: true });
        const res = await request({
          method: 'POST',
          url: 'http://localhost:8378/1/users',
          headers: signupHeaders,
          body: JSON.stringify({ authData: {} }),
        }).catch(e => e);
        expect(res.status).toBe(400);
        expect(res.data.code).toBe(Parse.Error.USERNAME_MISSING);
      });

      it('rejects signup with authData containing only empty provider data and no credentials', async () => {
        const res = await request({
          method: 'POST',
          url: 'http://localhost:8378/1/users',
          headers: signupHeaders,
          body: JSON.stringify({ authData: { bogus: {} } }),
        }).catch(e => e);
        expect(res.status).toBe(400);
        expect(res.data.code).toBe(Parse.Error.USERNAME_MISSING);
      });

      it('rejects signup with authData containing null provider data and no credentials', async () => {
        const res = await request({
          method: 'POST',
          url: 'http://localhost:8378/1/users',
          headers: signupHeaders,
          body: JSON.stringify({ authData: { bogus: null } }),
        }).catch(e => e);
        expect(res.status).toBe(400);
        expect(res.data.code).toBe(Parse.Error.USERNAME_MISSING);
      });

      it('rejects signup with non-object authData provider value even when credentials are provided', async () => {
        const res = await request({
          method: 'POST',
          url: 'http://localhost:8378/1/users',
          headers: signupHeaders,
          body: JSON.stringify({ username: 'bogusauth', password: 'pass1234', authData: { bogus: 'x' } }),
        }).catch(e => e);
        expect(res.status).toBe(400);
        expect(res.data.code).toBe(Parse.Error.UNSUPPORTED_SERVICE);
      });

      it('allows signup with empty authData when username and password are provided', async () => {
        const res = await request({
          method: 'POST',
          url: 'http://localhost:8378/1/users',
          headers: signupHeaders,
          body: JSON.stringify({ username: 'emptyauth', password: 'pass1234', authData: {} }),
        });
        expect(res.data.objectId).toBeDefined();
        expect(res.data.sessionToken).toBeDefined();
      });
    });

    describe('(GHSA-r3xq-68wh-gwvh) Password reset single-use token bypass via concurrent requests', () => {
      let sendPasswordResetEmail;

      beforeAll(async () => {
        sendPasswordResetEmail = jasmine.createSpy('sendPasswordResetEmail');
        await reconfigureServer({
          appName: 'test',
          publicServerURL: 'http://localhost:8378/1',
          emailAdapter: {
            sendVerificationEmail: () => Promise.resolve(),
            sendPasswordResetEmail,
            sendMail: () => {},
          },
        });
      });

      it('rejects concurrent password resets using the same token', async () => {
        const user = new Parse.User();
        user.setUsername('resetuser');
        user.setPassword('originalPass1!');
        user.setEmail('resetuser@example.com');
        await user.signUp();

        await Parse.User.requestPasswordReset('resetuser@example.com');

        // Get the perishable token directly from the database
        const config = Config.get('test');
        const results = await config.database.adapter.find(
          '_User',
          { fields: {} },
          { username: 'resetuser' },
          { limit: 1 }
        );
        const token = results[0]._perishable_token;
        expect(token).toBeDefined();

        // Send two concurrent password reset requests with different passwords
        const resetRequest = password =>
          request({
            method: 'POST',
            url: 'http://localhost:8378/1/apps/test/request_password_reset',
            body: `new_password=${encodeURIComponent(password)}&token=${encodeURIComponent(token)}`,
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-Requested-With': 'XMLHttpRequest',
            },
            followRedirects: false,
          });

        const [resultA, resultB] = await Promise.allSettled([
          resetRequest('PasswordA1!'),
          resetRequest('PasswordB1!'),
        ]);

        // Exactly one request should succeed and one should fail
        const succeeded = [resultA, resultB].filter(r => r.status === 'fulfilled');
        const failed = [resultA, resultB].filter(r => r.status === 'rejected');
        expect(succeeded.length).toBe(1);
        expect(failed.length).toBe(1);

        // The failed request should indicate invalid token
        expect(failed[0].reason.text).toContain(
          'Failed to reset password: username / email / token is invalid'
        );

        // The token should be consumed
        const afterResults = await config.database.adapter.find(
          '_User',
          { fields: {} },
          { username: 'resetuser' },
          { limit: 1 }
        );
        expect(afterResults[0]._perishable_token).toBeUndefined();

        // Verify login works with the winning password
        const winningPassword =
          succeeded[0] === resultA ? 'PasswordA1!' : 'PasswordB1!';
        const loggedIn = await Parse.User.logIn('resetuser', winningPassword);
        expect(loggedIn.getUsername()).toBe('resetuser');
      });
    });
  });

  describe('(GHSA-5hmj-jcgp-6hff) Protected fields leak via LiveQuery afterEvent trigger', () => {
    let obj;

    beforeEach(async () => {
      Parse.CoreManager.getLiveQueryController().setDefaultLiveQueryClient(null);
      await reconfigureServer({
        liveQuery: { classNames: ['SecretClass'] },
        startLiveQueryServer: true,
        verbose: false,
        silent: true,
      });
      Parse.Cloud.afterLiveQueryEvent('SecretClass', () => {});
      const config = Config.get(Parse.applicationId);
      const schemaController = await config.database.loadSchema();
      await schemaController.addClassIfNotExists('SecretClass', {
        secretField: { type: 'String' },
        publicField: { type: 'String' },
      });
      await schemaController.updateClass(
        'SecretClass',
        {},
        {
          find: { '*': true },
          get: { '*': true },
          create: { '*': true },
          update: { '*': true },
          delete: { '*': true },
          addField: {},
          protectedFields: { '*': ['secretField'] },
        }
      );
      obj = new Parse.Object('SecretClass');
      obj.set('secretField', 'SENSITIVE_DATA');
      obj.set('publicField', 'visible');
      await obj.save(null, { useMasterKey: true });
    });

    afterEach(async () => {
      const client = await Parse.CoreManager.getLiveQueryController().getDefaultLiveQueryClient();
      if (client) {
        await client.close();
      }
    });

    it('should not leak protected fields on update event when afterEvent trigger is registered', async () => {
      const query = new Parse.Query('SecretClass');
      const subscription = await query.subscribe();
      await Promise.all([
        new Promise(resolve => {
          subscription.on('update', (object, original) => {
            expect(object.get('secretField')).toBeUndefined();
            expect(object.get('publicField')).toBe('updated');
            expect(original.get('secretField')).toBeUndefined();
            expect(original.get('publicField')).toBe('visible');
            resolve();
          });
        }),
        obj.save({ publicField: 'updated' }, { useMasterKey: true }),
      ]);
    });

    it('should not leak protected fields on create event when afterEvent trigger is registered', async () => {
      const query = new Parse.Query('SecretClass');
      const subscription = await query.subscribe();
      await Promise.all([
        new Promise(resolve => {
          subscription.on('create', object => {
            expect(object.get('secretField')).toBeUndefined();
            expect(object.get('publicField')).toBe('new');
            resolve();
          });
        }),
        new Parse.Object('SecretClass').save(
          { secretField: 'SECRET', publicField: 'new' },
          { useMasterKey: true }
        ),
      ]);
    });

    it('should not leak protected fields on delete event when afterEvent trigger is registered', async () => {
      const query = new Parse.Query('SecretClass');
      const subscription = await query.subscribe();
      await Promise.all([
        new Promise(resolve => {
          subscription.on('delete', object => {
            expect(object.get('secretField')).toBeUndefined();
            expect(object.get('publicField')).toBe('visible');
            resolve();
          });
        }),
        obj.destroy({ useMasterKey: true }),
      ]);
    });

    it('should not leak protected fields on enter event when afterEvent trigger is registered', async () => {
      const query = new Parse.Query('SecretClass');
      query.equalTo('publicField', 'match');
      const subscription = await query.subscribe();
      await Promise.all([
        new Promise(resolve => {
          subscription.on('enter', (object, original) => {
            expect(object.get('secretField')).toBeUndefined();
            expect(object.get('publicField')).toBe('match');
            expect(original.get('secretField')).toBeUndefined();
            resolve();
          });
        }),
        obj.save({ publicField: 'match' }, { useMasterKey: true }),
      ]);
    });

    it('should not leak protected fields on leave event when afterEvent trigger is registered', async () => {
      const query = new Parse.Query('SecretClass');
      query.equalTo('publicField', 'visible');
      const subscription = await query.subscribe();
      await Promise.all([
        new Promise(resolve => {
          subscription.on('leave', (object, original) => {
            expect(object.get('secretField')).toBeUndefined();
            expect(object.get('publicField')).toBe('changed');
            expect(original.get('secretField')).toBeUndefined();
            expect(original.get('publicField')).toBe('visible');
            resolve();
          });
        }),
        obj.save({ publicField: 'changed' }, { useMasterKey: true }),
      ]);
    });

    describe('(GHSA-m983-v2ff-wq65) LiveQuery shared mutable state race across concurrent subscribers', () => {
      // Helper: create a LiveQuery client, wait for open, subscribe, wait for subscription ACK
      async function createSubscribedClient({ className, masterKey, installationId }) {
        const opts = {
          applicationId: 'test',
          serverURL: 'ws://localhost:8378',
          javascriptKey: 'test',
        };
        if (masterKey) {
          opts.masterKey = 'test';
        }
        if (installationId) {
          opts.installationId = installationId;
        }
        const client = new Parse.LiveQueryClient(opts);
        client.open();
        const query = new Parse.Query(className);
        const sub = client.subscribe(query);
        await new Promise(resolve => sub.on('open', resolve));
        return { client, sub };
      }

      async function setupProtectedClass(className) {
        const config = Config.get(Parse.applicationId);
        const schemaController = await config.database.loadSchema();
        await schemaController.addClassIfNotExists(className, {
          secretField: { type: 'String' },
          publicField: { type: 'String' },
        });
        await schemaController.updateClass(
          className,
          {},
          {
            find: { '*': true },
            get: { '*': true },
            create: { '*': true },
            update: { '*': true },
            delete: { '*': true },
            addField: {},
            protectedFields: { '*': ['secretField'] },
          }
        );
      }

      it('should deliver protected fields to master key LiveQuery client', async () => {
        const className = 'MasterKeyProtectedClass';
        Parse.CoreManager.getLiveQueryController().setDefaultLiveQueryClient(null);
        await reconfigureServer({
          liveQuery: { classNames: [className] },
          liveQueryServerOptions: {
            keyPairs: { masterKey: 'test', javascriptKey: 'test' },
          },
          verbose: false,
          silent: true,
        });
        Parse.Cloud.afterLiveQueryEvent(className, () => {});
        await setupProtectedClass(className);

        const { client: masterClient, sub: masterSub } = await createSubscribedClient({
          className,
          masterKey: true,
        });

        try {
          const result = new Promise(resolve => {
            masterSub.on('create', object => {
              resolve({
                secretField: object.get('secretField'),
                publicField: object.get('publicField'),
              });
            });
          });

          const obj = new Parse.Object(className);
          obj.set('secretField', 'MASTER_VISIBLE');
          obj.set('publicField', 'public');
          await obj.save(null, { useMasterKey: true });

          const received = await result;

          // Master key client must see protected fields
          expect(received.secretField).toBe('MASTER_VISIBLE');
          expect(received.publicField).toBe('public');
        } finally {
          masterClient.close();
        }
      });

      it('should not leak protected fields to regular client when master key client subscribes concurrently on update', async () => {
        const className = 'RaceUpdateClass';
        Parse.CoreManager.getLiveQueryController().setDefaultLiveQueryClient(null);
        await reconfigureServer({
          liveQuery: { classNames: [className] },
          liveQueryServerOptions: {
            keyPairs: { masterKey: 'test', javascriptKey: 'test' },
          },
          verbose: false,
          silent: true,
        });
        Parse.Cloud.afterLiveQueryEvent(className, () => {});
        await setupProtectedClass(className);

        const { client: masterClient, sub: masterSub } = await createSubscribedClient({
          className,
          masterKey: true,
        });
        const { client: regularClient, sub: regularSub } = await createSubscribedClient({
          className,
          masterKey: false,
        });

        try {
          const obj = new Parse.Object(className);
          obj.set('secretField', 'TOP_SECRET');
          obj.set('publicField', 'visible');
          await obj.save(null, { useMasterKey: true });

          const masterResult = new Promise(resolve => {
            masterSub.on('update', object => {
              resolve({
                secretField: object.get('secretField'),
                publicField: object.get('publicField'),
              });
            });
          });
          const regularResult = new Promise(resolve => {
            regularSub.on('update', object => {
              resolve({
                secretField: object.get('secretField'),
                publicField: object.get('publicField'),
              });
            });
          });

          await obj.save({ publicField: 'updated' }, { useMasterKey: true });
          const [master, regular] = await Promise.all([masterResult, regularResult]);
          // Regular client must NOT see the secret field
          expect(regular.secretField).toBeUndefined();
          expect(regular.publicField).toBe('updated');
          // Master client must see the secret field
          expect(master.secretField).toBe('TOP_SECRET');
          expect(master.publicField).toBe('updated');
        } finally {
          masterClient.close();
          regularClient.close();
        }
      });

      it('should not leak protected fields to regular client when master key client subscribes concurrently on create', async () => {
        const className = 'RaceCreateClass';
        Parse.CoreManager.getLiveQueryController().setDefaultLiveQueryClient(null);
        await reconfigureServer({
          liveQuery: { classNames: [className] },
          liveQueryServerOptions: {
            keyPairs: { masterKey: 'test', javascriptKey: 'test' },
          },
          verbose: false,
          silent: true,
        });
        Parse.Cloud.afterLiveQueryEvent(className, () => {});
        await setupProtectedClass(className);

        const { client: masterClient, sub: masterSub } = await createSubscribedClient({
          className,
          masterKey: true,
        });
        const { client: regularClient, sub: regularSub } = await createSubscribedClient({
          className,
          masterKey: false,
        });

        try {
          const masterResult = new Promise(resolve => {
            masterSub.on('create', object => {
              resolve({
                secretField: object.get('secretField'),
                publicField: object.get('publicField'),
              });
            });
          });
          const regularResult = new Promise(resolve => {
            regularSub.on('create', object => {
              resolve({
                secretField: object.get('secretField'),
                publicField: object.get('publicField'),
              });
            });
          });

          const newObj = new Parse.Object(className);
          newObj.set('secretField', 'SECRET');
          newObj.set('publicField', 'public');
          await newObj.save(null, { useMasterKey: true });

          const [master, regular] = await Promise.all([masterResult, regularResult]);

          expect(regular.secretField).toBeUndefined();
          expect(regular.publicField).toBe('public');
          expect(master.secretField).toBe('SECRET');
          expect(master.publicField).toBe('public');
        } finally {
          masterClient.close();
          regularClient.close();
        }
      });

      it('should not leak protected fields to regular client when master key client subscribes concurrently on delete', async () => {
        const className = 'RaceDeleteClass';
        Parse.CoreManager.getLiveQueryController().setDefaultLiveQueryClient(null);
        await reconfigureServer({
          liveQuery: { classNames: [className] },
          liveQueryServerOptions: {
            keyPairs: { masterKey: 'test', javascriptKey: 'test' },
          },
          verbose: false,
          silent: true,
        });
        Parse.Cloud.afterLiveQueryEvent(className, () => {});
        await setupProtectedClass(className);

        const { client: masterClient, sub: masterSub } = await createSubscribedClient({
          className,
          masterKey: true,
        });
        const { client: regularClient, sub: regularSub } = await createSubscribedClient({
          className,
          masterKey: false,
        });

        try {
          const obj = new Parse.Object(className);
          obj.set('secretField', 'SECRET');
          obj.set('publicField', 'public');
          await obj.save(null, { useMasterKey: true });

          const masterResult = new Promise(resolve => {
            masterSub.on('delete', object => {
              resolve({
                secretField: object.get('secretField'),
                publicField: object.get('publicField'),
              });
            });
          });
          const regularResult = new Promise(resolve => {
            regularSub.on('delete', object => {
              resolve({
                secretField: object.get('secretField'),
                publicField: object.get('publicField'),
              });
            });
          });

          await obj.destroy({ useMasterKey: true });
          const [master, regular] = await Promise.all([masterResult, regularResult]);

          expect(regular.secretField).toBeUndefined();
          expect(regular.publicField).toBe('public');
          expect(master.secretField).toBe('SECRET');
          expect(master.publicField).toBe('public');
        } finally {
          masterClient.close();
          regularClient.close();
        }
      });

      it('should not corrupt object when afterEvent trigger modifies res.object for one client', async () => {
        const className = 'TriggerRaceClass';
        Parse.CoreManager.getLiveQueryController().setDefaultLiveQueryClient(null);
        await reconfigureServer({
          liveQuery: { classNames: [className] },
          startLiveQueryServer: true,
          verbose: false,
          silent: true,
        });
        Parse.Cloud.afterLiveQueryEvent(className, req => {
          if (req.object) {
            req.object.set('injected', `for-${req.installationId}`);
          }
        });
        const config = Config.get(Parse.applicationId);
        const schemaController = await config.database.loadSchema();
        await schemaController.addClassIfNotExists(className, {
          data: { type: 'String' },
          injected: { type: 'String' },
        });

        const { client: client1, sub: sub1 } = await createSubscribedClient({
          className,
          masterKey: false,
          installationId: 'client-1',
        });
        const { client: client2, sub: sub2 } = await createSubscribedClient({
          className,
          masterKey: false,
          installationId: 'client-2',
        });

        try {
          const result1 = new Promise(resolve => {
            sub1.on('create', object => {
              resolve({ data: object.get('data'), injected: object.get('injected') });
            });
          });
          const result2 = new Promise(resolve => {
            sub2.on('create', object => {
              resolve({ data: object.get('data'), injected: object.get('injected') });
            });
          });

          const newObj = new Parse.Object(className);
          newObj.set('data', 'value');
          await newObj.save(null, { useMasterKey: true });

          const [r1, r2] = await Promise.all([result1, result2]);

          expect(r1.data).toBe('value');
          expect(r2.data).toBe('value');
          expect(r1.injected).toBe('for-client-1');
          expect(r2.injected).toBe('for-client-2');
          expect(r1.injected).not.toBe(r2.injected);
        } finally {
          client1.close();
          client2.close();
        }
      });
    });

    describe('(GHSA-pfj7-wv7c-22pr) AuthData subset validation bypass with allowExpiredAuthDataToken', () => {
      let validatorSpy;

      const testAdapter = {
        validateAppId: () => Promise.resolve(),
        validateAuthData: () => Promise.resolve(),
      };

      beforeEach(async () => {
        validatorSpy = spyOn(testAdapter, 'validateAuthData').and.resolveTo({});
        await reconfigureServer({
          auth: { testAdapter },
          allowExpiredAuthDataToken: true,
        });
      });

      it('validates authData on login when incoming data is a strict subset of stored data', async () => {
        // Sign up a user with full authData (id + access_token)
        const user = new Parse.User();
        await user.save({
          authData: { testAdapter: { id: 'user123', access_token: 'valid_token' } },
        });
        validatorSpy.calls.reset();

        // Attempt to log in with only the id field (subset of stored data)
        const res = await request({
          method: 'POST',
          url: 'http://localhost:8378/1/users',
          headers: {
            'Content-Type': 'application/json',
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
          body: JSON.stringify({
            authData: { testAdapter: { id: 'user123' } },
          }),
        });
        expect(res.data.objectId).toBe(user.id);
        // The adapter MUST be called to validate the login attempt
        expect(validatorSpy).toHaveBeenCalled();
      });

      it('prevents account takeover via partial authData when allowExpiredAuthDataToken is enabled', async () => {
        // Sign up a user with full authData
        const user = new Parse.User();
        await user.save({
          authData: { testAdapter: { id: 'victim123', access_token: 'secret_token' } },
        });
        validatorSpy.calls.reset();

        // Simulate an attacker sending only the provider ID (no access_token)
        // The adapter should reject this because the token is missing
        validatorSpy.and.rejectWith(
          new Parse.Error(Parse.Error.SCRIPT_FAILED, 'Invalid credentials')
        );

        const res = await request({
          method: 'POST',
          url: 'http://localhost:8378/1/users',
          headers: {
            'Content-Type': 'application/json',
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
          body: JSON.stringify({
            authData: { testAdapter: { id: 'victim123' } },
          }),
        }).catch(e => e);

        // Login must be rejected — adapter validation must not be skipped
        expect(res.status).toBe(400);
        expect(validatorSpy).toHaveBeenCalled();
      });

      it('validates authData on login even when authData is identical', async () => {
        // Sign up with full authData
        const user = new Parse.User();
        await user.save({
          authData: { testAdapter: { id: 'user456', access_token: 'expired_token' } },
        });
        validatorSpy.calls.reset();

        // Log in with the exact same authData (all keys present, same values)
        const res = await request({
          method: 'POST',
          url: 'http://localhost:8378/1/users',
          headers: {
            'Content-Type': 'application/json',
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
          body: JSON.stringify({
            authData: { testAdapter: { id: 'user456', access_token: 'expired_token' } },
          }),
        });
        expect(res.data.objectId).toBe(user.id);
        // Auth providers are always validated on login regardless of allowExpiredAuthDataToken
        expect(validatorSpy).toHaveBeenCalled();
      });

      it('rejects login with identical but expired authData when adapter rejects', async () => {
        // Sign up with authData that is initially valid
        const user = new Parse.User();
        await user.save({
          authData: { testAdapter: { id: 'user_expired', access_token: 'token_now_expired' } },
        });
        validatorSpy.calls.reset();

        // Simulate the token expiring on the provider side: the adapter now
        // rejects the same token that was valid at signup time
        validatorSpy.and.rejectWith(
          new Parse.Error(Parse.Error.SCRIPT_FAILED, 'Token expired')
        );

        // Attempt login with the exact same (now-expired) authData
        const res = await request({
          method: 'POST',
          url: 'http://localhost:8378/1/users',
          headers: {
            'Content-Type': 'application/json',
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
          body: JSON.stringify({
            authData: { testAdapter: { id: 'user_expired', access_token: 'token_now_expired' } },
          }),
        }).catch(e => e);

        // Login must be rejected even though authData is identical to what's stored
        expect(res.status).toBe(400);
        expect(validatorSpy).toHaveBeenCalled();
      });

      it('skips validation on update when authData is a subset of stored data', async () => {
        // Sign up with full authData
        const user = new Parse.User();
        await user.save({
          authData: { testAdapter: { id: 'user789', access_token: 'valid_token' } },
        });
        validatorSpy.calls.reset();

        // Update the user with a subset of authData (simulates afterFind stripping fields)
        await request({
          method: 'PUT',
          url: `http://localhost:8378/1/users/${user.id}`,
          headers: {
            'Content-Type': 'application/json',
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
            'X-Parse-Session-Token': user.getSessionToken(),
          },
          body: JSON.stringify({
            authData: { testAdapter: { id: 'user789' } },
          }),
        });
        // On update with allowExpiredAuthDataToken: true, subset data skips validation
        expect(validatorSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('(GHSA-fph2-r4qg-9576) LiveQuery bypasses CLP pointer permission enforcement', () => {
    const { sleep } = require('../lib/TestUtils');

    beforeEach(() => {
      Parse.CoreManager.getLiveQueryController().setDefaultLiveQueryClient(null);
    });

    afterEach(async () => {
      try {
        const client = await Parse.CoreManager.getLiveQueryController().getDefaultLiveQueryClient();
        if (client) {
          await client.close();
        }
      } catch (e) {
        // Ignore cleanup errors when client is not initialized
      }
    });

    async function updateCLP(className, permissions) {
      const response = await fetch(Parse.serverURL + '/schemas/' + className, {
        method: 'PUT',
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-Master-Key': Parse.masterKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ classLevelPermissions: permissions }),
      });
      const body = await response.json();
      if (body.error) {
        throw body;
      }
      return body;
    }

    it('should not deliver LiveQuery events to user not in readUserFields pointer', async () => {
      await reconfigureServer({
        liveQuery: { classNames: ['PrivateMessage'] },
        startLiveQueryServer: true,
        verbose: false,
        silent: true,
      });

      // Create users using master key to avoid session management issues
      const userA = new Parse.User();
      userA.setUsername('userA_pointer');
      userA.setPassword('password123');
      await userA.signUp();
      await Parse.User.logOut();

      // User B stays logged in for the subscription
      const userB = new Parse.User();
      userB.setUsername('userB_pointer');
      userB.setPassword('password456');
      await userB.signUp();

      // Create schema by saving an object with owner pointer, then set CLP
      const seed = new Parse.Object('PrivateMessage');
      seed.set('owner', userA);
      await seed.save(null, { useMasterKey: true });
      await seed.destroy({ useMasterKey: true });

      await updateCLP('PrivateMessage', {
        create: { '*': true },
        find: {},
        get: {},
        readUserFields: ['owner'],
      });

      // User B subscribes — should NOT receive events for User A's objects
      const query = new Parse.Query('PrivateMessage');
      const subscription = await query.subscribe(userB.getSessionToken());

      const createSpy = jasmine.createSpy('create');
      const enterSpy = jasmine.createSpy('enter');
      subscription.on('create', createSpy);
      subscription.on('enter', enterSpy);

      // Create a message owned by User A
      const msg = new Parse.Object('PrivateMessage');
      msg.set('content', 'secret message');
      msg.set('owner', userA);
      await msg.save(null, { useMasterKey: true });

      await sleep(500);

      // User B should NOT have received the create event
      expect(createSpy).not.toHaveBeenCalled();
      expect(enterSpy).not.toHaveBeenCalled();
    });

    it('should deliver LiveQuery events to user in readUserFields pointer', async () => {
      await reconfigureServer({
        liveQuery: { classNames: ['PrivateMessage2'] },
        startLiveQueryServer: true,
        verbose: false,
        silent: true,
      });

      // User A stays logged in for the subscription
      const userA = new Parse.User();
      userA.setUsername('userA_owner');
      userA.setPassword('password123');
      await userA.signUp();

      // Create schema by saving an object with owner pointer
      const seed = new Parse.Object('PrivateMessage2');
      seed.set('owner', userA);
      await seed.save(null, { useMasterKey: true });
      await seed.destroy({ useMasterKey: true });

      await updateCLP('PrivateMessage2', {
        create: { '*': true },
        find: {},
        get: {},
        readUserFields: ['owner'],
      });

      // User A subscribes — SHOULD receive events for their own objects
      const query = new Parse.Query('PrivateMessage2');
      const subscription = await query.subscribe(userA.getSessionToken());

      const createSpy = jasmine.createSpy('create');
      subscription.on('create', createSpy);

      // Create a message owned by User A
      const msg = new Parse.Object('PrivateMessage2');
      msg.set('content', 'my own message');
      msg.set('owner', userA);
      await msg.save(null, { useMasterKey: true });

      await sleep(500);

      // User A SHOULD have received the create event
      expect(createSpy).toHaveBeenCalledTimes(1);
    });

    it('should not deliver LiveQuery events when find uses pointerFields', async () => {
      await reconfigureServer({
        liveQuery: { classNames: ['PrivateDoc'] },
        startLiveQueryServer: true,
        verbose: false,
        silent: true,
      });

      const userA = new Parse.User();
      userA.setUsername('userA_doc');
      userA.setPassword('password123');
      await userA.signUp();
      await Parse.User.logOut();

      // User B stays logged in for the subscription
      const userB = new Parse.User();
      userB.setUsername('userB_doc');
      userB.setPassword('password456');
      await userB.signUp();

      // Create schema by saving an object with recipient pointer
      const seed = new Parse.Object('PrivateDoc');
      seed.set('recipient', userA);
      await seed.save(null, { useMasterKey: true });
      await seed.destroy({ useMasterKey: true });

      // Set CLP with pointerFields instead of readUserFields
      await updateCLP('PrivateDoc', {
        create: { '*': true },
        find: { pointerFields: ['recipient'] },
        get: { pointerFields: ['recipient'] },
      });

      // User B subscribes
      const query = new Parse.Query('PrivateDoc');
      const subscription = await query.subscribe(userB.getSessionToken());

      const createSpy = jasmine.createSpy('create');
      subscription.on('create', createSpy);

      // Create doc with recipient = User A (not User B)
      const doc = new Parse.Object('PrivateDoc');
      doc.set('title', 'confidential');
      doc.set('recipient', userA);
      await doc.save(null, { useMasterKey: true });

      await sleep(500);

      // User B should NOT receive events for User A's document
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('should not deliver LiveQuery events to unauthenticated users for pointer-protected classes', async () => {
      await reconfigureServer({
        liveQuery: { classNames: ['SecureItem'] },
        startLiveQueryServer: true,
        verbose: false,
        silent: true,
      });

      const userA = new Parse.User();
      userA.setUsername('userA_secure');
      userA.setPassword('password123');
      await userA.signUp();
      await Parse.User.logOut();

      // Create schema
      const seed = new Parse.Object('SecureItem');
      seed.set('owner', userA);
      await seed.save(null, { useMasterKey: true });
      await seed.destroy({ useMasterKey: true });

      await updateCLP('SecureItem', {
        create: { '*': true },
        find: {},
        get: {},
        readUserFields: ['owner'],
      });

      // Unauthenticated subscription
      const query = new Parse.Query('SecureItem');
      const subscription = await query.subscribe();

      const createSpy = jasmine.createSpy('create');
      subscription.on('create', createSpy);

      const item = new Parse.Object('SecureItem');
      item.set('data', 'private');
      item.set('owner', userA);
      await item.save(null, { useMasterKey: true });

      await sleep(500);

      expect(createSpy).not.toHaveBeenCalled();
    });

    it('should handle readUserFields with array of pointers', async () => {
      await reconfigureServer({
        liveQuery: { classNames: ['SharedDoc'] },
        startLiveQueryServer: true,
        verbose: false,
        silent: true,
      });

      const userA = new Parse.User();
      userA.setUsername('userA_shared');
      userA.setPassword('password123');
      await userA.signUp();
      await Parse.User.logOut();

      // User B — don't log out, session must remain valid
      const userB = new Parse.User();
      userB.setUsername('userB_shared');
      userB.setPassword('password456');
      await userB.signUp();
      const userBSessionToken = userB.getSessionToken();

      // User C — signUp changes current user to C, but B's session stays valid
      const userC = new Parse.User();
      userC.setUsername('userC_shared');
      userC.setPassword('password789');
      await userC.signUp();
      const userCSessionToken = userC.getSessionToken();

      // Create schema with array field
      const seed = new Parse.Object('SharedDoc');
      seed.set('collaborators', [userA]);
      await seed.save(null, { useMasterKey: true });
      await seed.destroy({ useMasterKey: true });

      await updateCLP('SharedDoc', {
        create: { '*': true },
        find: {},
        get: {},
        readUserFields: ['collaborators'],
      });

      // User B subscribes — is in the collaborators array
      const queryB = new Parse.Query('SharedDoc');
      const subscriptionB = await queryB.subscribe(userBSessionToken);
      const createSpyB = jasmine.createSpy('createB');
      subscriptionB.on('create', createSpyB);

      // User C subscribes — is NOT in the collaborators array
      const queryC = new Parse.Query('SharedDoc');
      const subscriptionC = await queryC.subscribe(userCSessionToken);
      const createSpyC = jasmine.createSpy('createC');
      subscriptionC.on('create', createSpyC);

      // Create doc with collaborators = [userA, userB] (not userC)
      const doc = new Parse.Object('SharedDoc');
      doc.set('title', 'team doc');
      doc.set('collaborators', [userA, userB]);
      await doc.save(null, { useMasterKey: true });

      await sleep(500);

      // User B SHOULD receive the event (in collaborators array)
      expect(createSpyB).toHaveBeenCalledTimes(1);
      // User C should NOT receive the event
      expect(createSpyC).not.toHaveBeenCalled();
    });
  });

  describe('(GHSA-qpc3-fg4j-8hgm) Protected field change detection oracle via LiveQuery watch parameter', () => {
    const { sleep } = require('../lib/TestUtils');
    let obj;

    beforeEach(async () => {
      Parse.CoreManager.getLiveQueryController().setDefaultLiveQueryClient(null);
      await reconfigureServer({
        liveQuery: { classNames: ['SecretClass'] },
        startLiveQueryServer: true,
        verbose: false,
        silent: true,
      });
      const config = Config.get(Parse.applicationId);
      const schemaController = await config.database.loadSchema();
      await schemaController.addClassIfNotExists('SecretClass', {
        secretObj: { type: 'Object' },
        publicField: { type: 'String' },
      });
      await schemaController.updateClass(
        'SecretClass',
        {},
        {
          find: { '*': true },
          get: { '*': true },
          create: { '*': true },
          update: { '*': true },
          delete: { '*': true },
          addField: {},
          protectedFields: { '*': ['secretObj'] },
        }
      );

      obj = new Parse.Object('SecretClass');
      obj.set('secretObj', { apiKey: 'SENSITIVE_KEY_123', score: 42 });
      obj.set('publicField', 'visible');
      await obj.save(null, { useMasterKey: true });
    });

    afterEach(async () => {
      const client = await Parse.CoreManager.getLiveQueryController().getDefaultLiveQueryClient();
      if (client) {
        await client.close();
      }
    });

    it('should reject LiveQuery subscription with protected field in watch', async () => {
      const query = new Parse.Query('SecretClass');
      query.watch('secretObj');
      await expectAsync(query.subscribe()).toBeRejectedWith(
        new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Permission denied')
      );
    });

    it('should reject LiveQuery subscription with dot-notation on protected field in watch', async () => {
      const query = new Parse.Query('SecretClass');
      query.watch('secretObj.apiKey');
      await expectAsync(query.subscribe()).toBeRejectedWith(
        new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Permission denied')
      );
    });

    it('should reject LiveQuery subscription with deeply nested dot-notation on protected field in watch', async () => {
      const query = new Parse.Query('SecretClass');
      query.watch('secretObj.nested.deep.key');
      await expectAsync(query.subscribe()).toBeRejectedWith(
        new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Permission denied')
      );
    });

    it('should allow LiveQuery subscription with non-protected field in watch', async () => {
      const query = new Parse.Query('SecretClass');
      query.watch('publicField');
      const subscription = await query.subscribe();
      await Promise.all([
        new Promise(resolve => {
          subscription.on('update', object => {
            expect(object.get('secretObj')).toBeUndefined();
            expect(object.get('publicField')).toBe('updated');
            resolve();
          });
        }),
        obj.save({ publicField: 'updated' }, { useMasterKey: true }),
      ]);
    });

    it('should not deliver update event when only non-watched field changes', async () => {
      const query = new Parse.Query('SecretClass');
      query.watch('publicField');
      const subscription = await query.subscribe();
      const updateSpy = jasmine.createSpy('update');
      subscription.on('update', updateSpy);

      // Change a field that is NOT in the watch list
      obj.set('secretObj', { apiKey: 'ROTATED_KEY', score: 99 });
      await obj.save(null, { useMasterKey: true });
      await sleep(500);
      expect(updateSpy).not.toHaveBeenCalled();
    });

    describe('(GHSA-8pjv-59c8-44p8) SSRF via Webhook URL requires master key', () => {
      const expectMasterKeyRequired = async promise => {
        try {
          await promise;
          fail('Expected request to be rejected');
        } catch (error) {
          expect(error.status).toBe(403);
        }
      };

      it('rejects registering a webhook function with internal URL without master key', async () => {
        await expectMasterKeyRequired(
          request({
            method: 'POST',
            url: Parse.serverURL + '/hooks/functions',
            headers: {
              'X-Parse-Application-Id': Parse.applicationId,
              'X-Parse-REST-API-Key': 'rest',
            },
            body: JSON.stringify({
              functionName: 'ssrf_probe',
              url: 'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
            }),
          })
        );
      });

      it('rejects updating a webhook function URL to internal address without master key', async () => {
        // Seed a legitimate webhook first so the PUT hits auth, not "not found"
        await request({
          method: 'POST',
          url: Parse.serverURL + '/hooks/functions',
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-Master-Key': Parse.masterKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            functionName: 'ssrf_probe',
            url: 'https://example.com/webhook',
          }),
        });
        await expectMasterKeyRequired(
          request({
            method: 'PUT',
            url: Parse.serverURL + '/hooks/functions/ssrf_probe',
            headers: {
              'X-Parse-Application-Id': Parse.applicationId,
              'X-Parse-REST-API-Key': 'rest',
            },
            body: JSON.stringify({
              url: 'http://169.254.169.254/latest/meta-data/',
            }),
          })
        );
      });

      it('rejects registering a webhook trigger with internal URL without master key', async () => {
        await expectMasterKeyRequired(
          request({
            method: 'POST',
            url: Parse.serverURL + '/hooks/triggers',
            headers: {
              'X-Parse-Application-Id': Parse.applicationId,
              'X-Parse-REST-API-Key': 'rest',
            },
            body: JSON.stringify({
              className: 'TestClass',
              triggerName: 'beforeSave',
              url: 'http://127.0.0.1:8080/admin/status',
            }),
          })
        );
      });

      it('rejects registering a webhook with internal URL using JavaScript key', async () => {
        await expectMasterKeyRequired(
          request({
            method: 'POST',
            url: Parse.serverURL + '/hooks/functions',
            headers: {
              'X-Parse-Application-Id': Parse.applicationId,
              'X-Parse-JavaScript-Key': 'test',
            },
            body: JSON.stringify({
              functionName: 'ssrf_probe',
              url: 'http://10.0.0.1:3000/internal-api',
            }),
          })
        );
      });
    });

  });

  describe('(GHSA-6qh5-m6g3-xhq6) LiveQuery query depth DoS via deeply nested subscription', () => {
    afterEach(async () => {
      const client = await Parse.CoreManager.getLiveQueryController().getDefaultLiveQueryClient();
      if (client) {
        await client.close();
      }
    });

    it('should reject LiveQuery subscription with deeply nested $or when queryDepth is set', async () => {
      Parse.CoreManager.getLiveQueryController().setDefaultLiveQueryClient(null);
      await reconfigureServer({
        liveQuery: { classNames: ['TestClass'] },
        startLiveQueryServer: true,
        verbose: false,
        silent: true,
        requestComplexity: { queryDepth: 10 },
      });
      const query = new Parse.Query('TestClass');
      let where = { field: 'value' };
      for (let i = 0; i < 15; i++) {
        where = { $or: [where] };
      }
      query._where = where;
      await expectAsync(query.subscribe()).toBeRejectedWith(
        jasmine.objectContaining({
          code: Parse.Error.INVALID_QUERY,
          message: jasmine.stringMatching(/Query condition nesting depth exceeds maximum allowed depth/),
        })
      );
    });

    it('should reject LiveQuery subscription with deeply nested $and when queryDepth is set', async () => {
      Parse.CoreManager.getLiveQueryController().setDefaultLiveQueryClient(null);
      await reconfigureServer({
        liveQuery: { classNames: ['TestClass'] },
        startLiveQueryServer: true,
        verbose: false,
        silent: true,
        requestComplexity: { queryDepth: 10 },
      });
      const query = new Parse.Query('TestClass');
      let where = { field: 'value' };
      for (let i = 0; i < 50; i++) {
        where = { $and: [where] };
      }
      query._where = where;
      await expectAsync(query.subscribe()).toBeRejectedWith(
        jasmine.objectContaining({
          code: Parse.Error.INVALID_QUERY,
          message: jasmine.stringMatching(/Query condition nesting depth exceeds maximum allowed depth/),
        })
      );
    });

    it('should reject LiveQuery subscription with deeply nested $nor when queryDepth is set', async () => {
      Parse.CoreManager.getLiveQueryController().setDefaultLiveQueryClient(null);
      await reconfigureServer({
        liveQuery: { classNames: ['TestClass'] },
        startLiveQueryServer: true,
        verbose: false,
        silent: true,
        requestComplexity: { queryDepth: 10 },
      });
      const query = new Parse.Query('TestClass');
      let where = { field: 'value' };
      for (let i = 0; i < 50; i++) {
        where = { $nor: [where] };
      }
      query._where = where;
      await expectAsync(query.subscribe()).toBeRejectedWith(
        jasmine.objectContaining({
          code: Parse.Error.INVALID_QUERY,
          message: jasmine.stringMatching(/Query condition nesting depth exceeds maximum allowed depth/),
        })
      );
    });

    it('should allow LiveQuery subscription within the depth limit', async () => {
      Parse.CoreManager.getLiveQueryController().setDefaultLiveQueryClient(null);
      await reconfigureServer({
        liveQuery: { classNames: ['TestClass'] },
        startLiveQueryServer: true,
        verbose: false,
        silent: true,
        requestComplexity: { queryDepth: 10 },
      });
      const query = new Parse.Query('TestClass');
      let where = { field: 'value' };
      for (let i = 0; i < 5; i++) {
        where = { $or: [where] };
      }
      query._where = where;
      const subscription = await query.subscribe();
      expect(subscription).toBeDefined();
    });

    it('should allow LiveQuery subscription when queryDepth is disabled', async () => {
      Parse.CoreManager.getLiveQueryController().setDefaultLiveQueryClient(null);
      await reconfigureServer({
        liveQuery: { classNames: ['TestClass'] },
        startLiveQueryServer: true,
        verbose: false,
        silent: true,
        requestComplexity: { queryDepth: -1 },
      });
      const query = new Parse.Query('TestClass');
      let where = { field: 'value' };
      for (let i = 0; i < 15; i++) {
        where = { $or: [where] };
      }
      query._where = where;
      const subscription = await query.subscribe();
      expect(subscription).toBeDefined();
    });
  });

  describe('(GHSA-g4cf-xj29-wqqr) DoS via unindexed database query for unconfigured auth providers', () => {
    it('should not query database for unconfigured auth provider on signup', async () => {
      const databaseAdapter = Config.get(Parse.applicationId).database.adapter;
      const spy = spyOn(databaseAdapter, 'find').and.callThrough();
      await expectAsync(
        new Parse.User().save({ authData: { nonExistentProvider: { id: 'test123' } } })
      ).toBeRejectedWith(
        new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.')
      );
      const authDataQueries = spy.calls.all().filter(call => {
        const query = call.args[2];
        return query?.$or?.some(q => q['authData.nonExistentProvider.id']);
      });
      expect(authDataQueries.length).toBe(0);
    });

    it('should not query database for unconfigured auth provider on challenge', async () => {
      const databaseAdapter = Config.get(Parse.applicationId).database.adapter;
      const spy = spyOn(databaseAdapter, 'find').and.callThrough();
      await expectAsync(
        request({
          method: 'POST',
          url: Parse.serverURL + '/challenge',
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            authData: { nonExistentProvider: { id: 'test123' } },
            challengeData: { nonExistentProvider: { token: 'abc' } },
          }),
        })
      ).toBeRejected();
      const authDataQueries = spy.calls.all().filter(call => {
        const query = call.args[2];
        return query?.$or?.some(q => q['authData.nonExistentProvider.id']);
      });
      expect(authDataQueries.length).toBe(0);
    });

    it('should still query database for configured auth provider', async () => {
      await reconfigureServer({
        auth: {
          myConfiguredProvider: {
            module: {
              validateAppId: () => Promise.resolve(),
              validateAuthData: () => Promise.resolve(),
            },
          },
        },
      });
      const databaseAdapter = Config.get(Parse.applicationId).database.adapter;
      const spy = spyOn(databaseAdapter, 'find').and.callThrough();
      const user = new Parse.User();
      await user.save({ authData: { myConfiguredProvider: { id: 'validId', token: 'validToken' } } });
      const authDataQueries = spy.calls.all().filter(call => {
        const query = call.args[2];
        return query?.$or?.some(q => q['authData.myConfiguredProvider.id']);
      });
      expect(authDataQueries.length).toBeGreaterThan(0);
    });
  });

  describe('(GHSA-2299-ghjr-6vjp) MFA recovery code reuse via concurrent requests', () => {
    const mfaHeaders = {
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest',
      'Content-Type': 'application/json',
    };

    beforeEach(async () => {
      await reconfigureServer({
        auth: {
          mfa: {
            enabled: true,
            options: ['TOTP'],
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
          },
        },
      });
    });

    it('rejects concurrent logins using the same MFA recovery code', async () => {
      const OTPAuth = require('otpauth');
      const user = await Parse.User.signUp('mfauser', 'password123');
      const secret = new OTPAuth.Secret();
      const totp = new OTPAuth.TOTP({
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret,
      });
      const token = totp.generate();
      await user.save(
        { authData: { mfa: { secret: secret.base32, token } } },
        { sessionToken: user.getSessionToken() }
      );

      // Get recovery codes from stored auth data
      await user.fetch({ useMasterKey: true });
      const recoveryCode = user.get('authData').mfa.recovery[0];
      expect(recoveryCode).toBeDefined();

      // Send concurrent login requests with the same recovery code
      const loginWithRecovery = () =>
        request({
          method: 'POST',
          url: 'http://localhost:8378/1/login',
          headers: mfaHeaders,
          body: JSON.stringify({
            username: 'mfauser',
            password: 'password123',
            authData: {
              mfa: {
                token: recoveryCode,
              },
            },
          }),
        });

      const results = await Promise.allSettled(Array(10).fill().map(() => loginWithRecovery()));

      const succeeded = results.filter(r => r.status === 'fulfilled');
      const failed = results.filter(r => r.status === 'rejected');

      // Exactly one request should succeed; all others should fail
      expect(succeeded.length).toBe(1);
      expect(failed.length).toBe(9);

      // Verify the recovery code has been consumed
      await user.fetch({ useMasterKey: true });
      const remainingRecovery = user.get('authData').mfa.recovery;
      expect(remainingRecovery).not.toContain(recoveryCode);
    });
  });

  describe('(GHSA-w73w-g5xw-rwhf) MFA recovery code reuse via concurrent authData-only login', () => {
    const mfaHeaders = {
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest',
      'Content-Type': 'application/json',
    };

    let fakeProvider;

    beforeEach(async () => {
      fakeProvider = {
        validateAppId: () => Promise.resolve(),
        validateAuthData: () => Promise.resolve(),
      };
      await reconfigureServer({
        auth: {
          fakeProvider,
          mfa: {
            enabled: true,
            options: ['TOTP'],
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
          },
        },
      });
    });

    it('rejects concurrent authData-only logins using the same MFA recovery code', async () => {
      const OTPAuth = require('otpauth');

      // Create user via authData login with fake provider
      const user = await Parse.User.logInWith('fakeProvider', {
        authData: { id: 'user1', token: 'fakeToken' },
      });

      // Enable MFA for this user
      const secret = new OTPAuth.Secret();
      const totp = new OTPAuth.TOTP({
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret,
      });
      const token = totp.generate();
      await user.save(
        { authData: { mfa: { secret: secret.base32, token } } },
        { sessionToken: user.getSessionToken() }
      );

      // Get recovery codes from stored auth data
      await user.fetch({ useMasterKey: true });
      const recoveryCode = user.get('authData').mfa.recovery[0];
      expect(recoveryCode).toBeDefined();

      // Send concurrent authData-only login requests with the same recovery code
      const loginWithRecovery = () =>
        request({
          method: 'POST',
          url: 'http://localhost:8378/1/users',
          headers: mfaHeaders,
          body: JSON.stringify({
            authData: {
              fakeProvider: { id: 'user1', token: 'fakeToken' },
              mfa: { token: recoveryCode },
            },
          }),
        });

      const results = await Promise.allSettled(Array(10).fill().map(() => loginWithRecovery()));

      const succeeded = results.filter(r => r.status === 'fulfilled');
      const failed = results.filter(r => r.status === 'rejected');

      // Exactly one request should succeed; all others should fail
      expect(succeeded.length).toBe(1);
      expect(failed.length).toBe(9);

      // Verify the recovery code has been consumed
      await user.fetch({ useMasterKey: true });
      const remainingRecovery = user.get('authData').mfa.recovery;
      expect(remainingRecovery).not.toContain(recoveryCode);
    });
  });

  describe('(GHSA-p2w6-rmh7-w8q3) SQL Injection via aggregate and distinct field names in PostgreSQL adapter', () => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest',
      'X-Parse-Master-Key': 'test',
    };
    const serverURL = 'http://localhost:8378/1';

    beforeEach(async () => {
      const obj = new Parse.Object('TestClass');
      obj.set('playerName', 'Alice');
      obj.set('score', 100);
      obj.set('metadata', { tag: 'hello' });
      await obj.save(null, { useMasterKey: true });
    });

    describe('aggregate $group._id SQL injection', () => {
      it_only_db('postgres')('rejects $group._id field value containing double quotes', async () => {
        const response = await request({
          method: 'GET',
          url: `${serverURL}/aggregate/TestClass`,
          headers,
          qs: {
            pipeline: JSON.stringify([
              {
                $group: {
                  _id: {
                    alias: '$playerName" OR 1=1 --',
                  },
                },
              },
            ]),
          },
        }).catch(e => e);
        expect(response.data?.code).toBe(Parse.Error.INVALID_KEY_NAME);
      });

      it_only_db('postgres')('rejects $group._id field value containing semicolons', async () => {
        const response = await request({
          method: 'GET',
          url: `${serverURL}/aggregate/TestClass`,
          headers,
          qs: {
            pipeline: JSON.stringify([
              {
                $group: {
                  _id: {
                    alias: '$playerName"; DROP TABLE "TestClass" --',
                  },
                },
              },
            ]),
          },
        }).catch(e => e);
        expect(response.data?.code).toBe(Parse.Error.INVALID_KEY_NAME);
      });

      it_only_db('postgres')('rejects $group._id date operation field value containing double quotes', async () => {
        const response = await request({
          method: 'GET',
          url: `${serverURL}/aggregate/TestClass`,
          headers,
          qs: {
            pipeline: JSON.stringify([
              {
                $group: {
                  _id: {
                    day: { $dayOfMonth: '$createdAt" OR 1=1 --' },
                  },
                },
              },
            ]),
          },
        }).catch(e => e);
        expect(response.data?.code).toBe(Parse.Error.INVALID_KEY_NAME);
      });

      it_only_db('postgres')('allows legitimate $group._id with field reference', async () => {
        const response = await request({
          method: 'GET',
          url: `${serverURL}/aggregate/TestClass`,
          headers,
          qs: {
            pipeline: JSON.stringify([
              {
                $group: {
                  _id: {
                    name: '$playerName',
                  },
                  count: { $sum: 1 },
                },
              },
            ]),
          },
        });
        expect(response.data?.results?.length).toBeGreaterThan(0);
      });

      it_only_db('postgres')('allows legitimate $group._id with date extraction', async () => {
        const response = await request({
          method: 'GET',
          url: `${serverURL}/aggregate/TestClass`,
          headers,
          qs: {
            pipeline: JSON.stringify([
              {
                $group: {
                  _id: {
                    day: { $dayOfMonth: '$_created_at' },
                  },
                  count: { $sum: 1 },
                },
              },
            ]),
          },
        });
        expect(response.data?.results?.length).toBeGreaterThan(0);
      });
    });

    describe('distinct dot-notation SQL injection', () => {
      it_only_db('postgres')('rejects distinct field name containing double quotes in dot notation', async () => {
        const response = await request({
          method: 'GET',
          url: `${serverURL}/aggregate/TestClass`,
          headers,
          qs: {
            distinct: 'metadata" FROM pg_tables; --.tag',
          },
        }).catch(e => e);
        expect(response.data?.code).toBe(Parse.Error.INVALID_KEY_NAME);
      });

      it_only_db('postgres')('rejects distinct field name containing semicolons in dot notation', async () => {
        const response = await request({
          method: 'GET',
          url: `${serverURL}/aggregate/TestClass`,
          headers,
          qs: {
            distinct: 'metadata; DROP TABLE "TestClass" --.tag',
          },
        }).catch(e => e);
        expect(response.data?.code).toBe(Parse.Error.INVALID_KEY_NAME);
      });

      it_only_db('postgres')('rejects distinct field name containing single quotes in dot notation', async () => {
        const response = await request({
          method: 'GET',
          url: `${serverURL}/aggregate/TestClass`,
          headers,
          qs: {
            distinct: "metadata' OR '1'='1.tag",
          },
        }).catch(e => e);
        expect(response.data?.code).toBe(Parse.Error.INVALID_KEY_NAME);
      });

      it_only_db('postgres')('allows legitimate distinct with dot notation', async () => {
        const response = await request({
          method: 'GET',
          url: `${serverURL}/aggregate/TestClass`,
          headers,
          qs: {
            distinct: 'metadata.tag',
          },
        });
        expect(response.data?.results).toEqual(['hello']);
      });

      it_only_db('postgres')('allows legitimate distinct without dot notation', async () => {
        const response = await request({
          method: 'GET',
          url: `${serverURL}/aggregate/TestClass`,
          headers,
          qs: {
            distinct: 'playerName',
          },
        });
        expect(response.data?.results).toEqual(['Alice']);
      });
    });

    describe('(GHSA-37mj-c2wf-cx96) /users/me leaks raw authData via master context', () => {
      const headers = {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
        'Content-Type': 'application/json',
      };

      it('does not leak raw MFA authData via /users/me', async () => {
        await reconfigureServer({
          auth: {
            mfa: {
              enabled: true,
              options: ['TOTP'],
              algorithm: 'SHA1',
              digits: 6,
              period: 30,
            },
          },
        });
        const user = await Parse.User.signUp('username', 'password');
        const sessionToken = user.getSessionToken();
        const OTPAuth = require('otpauth');
        const secret = new OTPAuth.Secret();
        const totp = new OTPAuth.TOTP({
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          secret,
        });
        const token = totp.generate();
        // Enable MFA
        await user.save(
          { authData: { mfa: { secret: secret.base32, token } } },
          { sessionToken }
        );
        // Verify MFA data is stored (master key)
        await user.fetch({ useMasterKey: true });
        expect(user.get('authData').mfa.secret).toBe(secret.base32);
        expect(user.get('authData').mfa.recovery).toBeDefined();
        // GET /users/me should NOT include raw MFA data
        const response = await request({
          headers: {
            ...headers,
            'X-Parse-Session-Token': sessionToken,
          },
          method: 'GET',
          url: 'http://localhost:8378/1/users/me',
        });
        expect(response.data.authData?.mfa?.secret).toBeUndefined();
        expect(response.data.authData?.mfa?.recovery).toBeUndefined();
        expect(response.data.authData?.mfa).toEqual({ status: 'enabled' });
      });

      it('returns same authData from /users/me and /users/:id', async () => {
        await reconfigureServer({
          auth: {
            mfa: {
              enabled: true,
              options: ['TOTP'],
              algorithm: 'SHA1',
              digits: 6,
              period: 30,
            },
          },
        });
        const user = await Parse.User.signUp('username', 'password');
        const sessionToken = user.getSessionToken();
        const OTPAuth = require('otpauth');
        const secret = new OTPAuth.Secret();
        const totp = new OTPAuth.TOTP({
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          secret,
        });
        await user.save(
          { authData: { mfa: { secret: secret.base32, token: totp.generate() } } },
          { sessionToken }
        );
        // Fetch via /users/me
        const meResponse = await request({
          headers: {
            ...headers,
            'X-Parse-Session-Token': sessionToken,
          },
          method: 'GET',
          url: 'http://localhost:8378/1/users/me',
        });
        // Fetch via /users/:id
        const idResponse = await request({
          headers: {
            ...headers,
            'X-Parse-Session-Token': sessionToken,
          },
          method: 'GET',
          url: `http://localhost:8378/1/users/${user.id}`,
        });
        // Both should return the same sanitized authData
        expect(meResponse.data.authData).toEqual(idResponse.data.authData);
        expect(meResponse.data.authData?.mfa).toEqual({ status: 'enabled' });
      });
    });

    describe('(GHSA-wp76-gg32-8258) /verifyPassword leaks raw authData via missing afterFind', () => {
      const headers = {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
        'Content-Type': 'application/json',
      };

      it('does not leak raw MFA authData via /verifyPassword', async () => {
        await reconfigureServer({
          auth: {
            mfa: {
              enabled: true,
              options: ['TOTP'],
              algorithm: 'SHA1',
              digits: 6,
              period: 30,
            },
          },
          verifyUserEmails: false,
        });
        const user = await Parse.User.signUp('username', 'password');
        const sessionToken = user.getSessionToken();
        const OTPAuth = require('otpauth');
        const secret = new OTPAuth.Secret();
        const totp = new OTPAuth.TOTP({
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          secret,
        });
        const token = totp.generate();
        // Enable MFA
        await user.save(
          { authData: { mfa: { secret: secret.base32, token } } },
          { sessionToken }
        );
        // Verify MFA data is stored (master key)
        await user.fetch({ useMasterKey: true });
        expect(user.get('authData').mfa.secret).toBe(secret.base32);
        expect(user.get('authData').mfa.recovery).toBeDefined();
        // POST /verifyPassword should NOT include raw MFA data
        const response = await request({
          headers,
          method: 'POST',
          url: 'http://localhost:8378/1/verifyPassword',
          body: JSON.stringify({ username: 'username', password: 'password' }),
        });
        expect(response.data.authData?.mfa?.secret).toBeUndefined();
        expect(response.data.authData?.mfa?.recovery).toBeUndefined();
        expect(response.data.authData?.mfa).toEqual({ status: 'enabled' });
      });

      it('does not leak raw MFA authData via GET /verifyPassword', async () => {
        await reconfigureServer({
          auth: {
            mfa: {
              enabled: true,
              options: ['TOTP'],
              algorithm: 'SHA1',
              digits: 6,
              period: 30,
            },
          },
          verifyUserEmails: false,
        });
        const user = await Parse.User.signUp('username', 'password');
        const sessionToken = user.getSessionToken();
        const OTPAuth = require('otpauth');
        const secret = new OTPAuth.Secret();
        const totp = new OTPAuth.TOTP({
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          secret,
        });
        await user.save(
          { authData: { mfa: { secret: secret.base32, token: totp.generate() } } },
          { sessionToken }
        );
        // GET /verifyPassword should NOT include raw MFA data
        const response = await request({
          headers,
          method: 'GET',
          url: `http://localhost:8378/1/verifyPassword?username=username&password=password`,
        });
        expect(response.data.authData?.mfa?.secret).toBeUndefined();
        expect(response.data.authData?.mfa?.recovery).toBeUndefined();
        expect(response.data.authData?.mfa).toEqual({ status: 'enabled' });
      });
    });

    describe('(GHSA-q3p6-g7c4-829c) GraphQL endpoint ignores allowOrigin server option', () => {
      let httpServer;
      const gqlPort = 13398;

      const gqlHeaders = {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Javascript-Key': 'test',
        'Content-Type': 'application/json',
      };

      async function setupGraphQLServer(serverOptions = {}) {
        if (httpServer) {
          await new Promise(resolve => httpServer.close(resolve));
        }
        const server = await reconfigureServer(serverOptions);
        const expressApp = express();
        httpServer = http.createServer(expressApp);
        expressApp.use('/parse', server.app);
        const parseGraphQLServer = new ParseGraphQLServer(server, {
          graphQLPath: '/graphql',
        });
        parseGraphQLServer.applyGraphQL(expressApp);
        await new Promise(resolve => httpServer.listen({ port: gqlPort }, resolve));
        return parseGraphQLServer;
      }

      afterEach(async () => {
        if (httpServer) {
          await new Promise(resolve => httpServer.close(resolve));
          httpServer = null;
        }
      });

      it('should reflect allowed origin when allowOrigin is configured', async () => {
        await setupGraphQLServer({ allowOrigin: 'https://example.com' });
        const response = await fetch(`http://localhost:${gqlPort}/graphql`, {
          method: 'POST',
          headers: { ...gqlHeaders, Origin: 'https://example.com' },
          body: JSON.stringify({ query: '{ health }' }),
        });
        expect(response.status).toBe(200);
        expect(response.headers.get('access-control-allow-origin')).toBe('https://example.com');
      });

      it('should not reflect unauthorized origin when allowOrigin is configured', async () => {
        await setupGraphQLServer({ allowOrigin: 'https://example.com' });
        const response = await fetch(`http://localhost:${gqlPort}/graphql`, {
          method: 'POST',
          headers: { ...gqlHeaders, Origin: 'https://unauthorized.example.net' },
          body: JSON.stringify({ query: '{ health }' }),
        });
        expect(response.headers.get('access-control-allow-origin')).not.toBe('https://unauthorized.example.net');
        expect(response.headers.get('access-control-allow-origin')).toBe('https://example.com');
      });

      it('should support multiple allowed origins', async () => {
        await setupGraphQLServer({ allowOrigin: ['https://a.example.com', 'https://b.example.com'] });
        const responseA = await fetch(`http://localhost:${gqlPort}/graphql`, {
          method: 'POST',
          headers: { ...gqlHeaders, Origin: 'https://a.example.com' },
          body: JSON.stringify({ query: '{ health }' }),
        });
        expect(responseA.headers.get('access-control-allow-origin')).toBe('https://a.example.com');

        const responseB = await fetch(`http://localhost:${gqlPort}/graphql`, {
          method: 'POST',
          headers: { ...gqlHeaders, Origin: 'https://b.example.com' },
          body: JSON.stringify({ query: '{ health }' }),
        });
        expect(responseB.headers.get('access-control-allow-origin')).toBe('https://b.example.com');

        const responseUnauthorized = await fetch(`http://localhost:${gqlPort}/graphql`, {
          method: 'POST',
          headers: { ...gqlHeaders, Origin: 'https://unauthorized.example.net' },
          body: JSON.stringify({ query: '{ health }' }),
        });
        expect(responseUnauthorized.headers.get('access-control-allow-origin')).not.toBe('https://unauthorized.example.net');
        expect(responseUnauthorized.headers.get('access-control-allow-origin')).toBe('https://a.example.com');
      });

      it('should default to wildcard when allowOrigin is not configured', async () => {
        await setupGraphQLServer();
        const response = await fetch(`http://localhost:${gqlPort}/graphql`, {
          method: 'POST',
          headers: { ...gqlHeaders, Origin: 'https://example.com' },
          body: JSON.stringify({ query: '{ health }' }),
        });
        expect(response.headers.get('access-control-allow-origin')).toBe('*');
      });

      it('should handle OPTIONS preflight with configured allowOrigin', async () => {
        await setupGraphQLServer({ allowOrigin: 'https://example.com' });
        const response = await fetch(`http://localhost:${gqlPort}/graphql`, {
          method: 'OPTIONS',
          headers: {
            Origin: 'https://example.com',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'X-Parse-Application-Id, Content-Type',
          },
        });
        expect(response.status).toBe(200);
        expect(response.headers.get('access-control-allow-origin')).toBe('https://example.com');
      });

      it('should not reflect unauthorized origin in OPTIONS preflight', async () => {
        await setupGraphQLServer({ allowOrigin: 'https://example.com' });
        const response = await fetch(`http://localhost:${gqlPort}/graphql`, {
          method: 'OPTIONS',
          headers: {
            Origin: 'https://unauthorized.example.net',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'X-Parse-Application-Id, Content-Type',
          },
        });
        expect(response.headers.get('access-control-allow-origin')).not.toBe('https://unauthorized.example.net');
        expect(response.headers.get('access-control-allow-origin')).toBe('https://example.com');
      });
    });
  });

  describe('(GHSA-445j-ww4h-339m) Cloud Code trigger context prototype poisoning via X-Parse-Cloud-Context header', () => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest',
    };

    it('accepts __proto__ in X-Parse-Cloud-Context header', async () => {
      // Context is client-controlled metadata for Cloud Code triggers and is not subject
      // to requestKeywordDenylist. The __proto__ key is allowed but must not cause
      // prototype pollution (verified by separate tests below).
      Parse.Cloud.beforeSave('ContextTest', () => {});
      const response = await request({
        headers: {
          ...headers,
          'X-Parse-Cloud-Context': JSON.stringify(
            JSON.parse('{"__proto__": {"isAdmin": true}}')
          ),
        },
        method: 'POST',
        url: 'http://localhost:8378/1/classes/ContextTest',
        body: JSON.stringify({ foo: 'bar' }),
      }).catch(e => e);
      expect(response.status).toBe(201);
    });

    it('accepts constructor in X-Parse-Cloud-Context header', async () => {
      Parse.Cloud.beforeSave('ContextTest', () => {});
      const response = await request({
        headers: {
          ...headers,
          'X-Parse-Cloud-Context': JSON.stringify({ constructor: { prototype: { dummy: 0 } } }),
        },
        method: 'POST',
        url: 'http://localhost:8378/1/classes/ContextTest',
        body: JSON.stringify({ foo: 'bar' }),
      }).catch(e => e);
      expect(response.status).toBe(201);
      expect(Object.prototype.dummy).toBeUndefined();
    });

    it('accepts __proto__ in _context body field', async () => {
      Parse.Cloud.beforeSave('ContextTest', () => {});
      const response = await request({
        method: 'POST',
        url: 'http://localhost:8378/1/classes/ContextTest',
        headers: {
          'X-Parse-REST-API-Key': 'rest',
        },
        body: {
          foo: 'bar',
          _ApplicationId: 'test',
          _context: JSON.stringify(JSON.parse('{"__proto__": {"isAdmin": true}}')),
        },
      }).catch(e => e);
      expect(response.status).toBe(201);
    });

    it('does not pollute request.context prototype via X-Parse-Cloud-Context header', async () => {
      let contextInTrigger;
      Parse.Cloud.beforeSave('ContextTest', req => {
        contextInTrigger = req.context;
      });
      const response = await request({
        headers: {
          ...headers,
          'X-Parse-Cloud-Context': JSON.stringify(
            JSON.parse('{"__proto__": {"isAdmin": true}}')
          ),
        },
        method: 'POST',
        url: 'http://localhost:8378/1/classes/ContextTest',
        body: JSON.stringify({ foo: 'bar' }),
      }).catch(e => e);
      expect(response.status).toBe(201);
      expect(contextInTrigger).toBeDefined();
      expect(contextInTrigger.isAdmin).toBeUndefined();
      expect(Object.getPrototypeOf(contextInTrigger)).not.toEqual(
        jasmine.objectContaining({ isAdmin: true })
      );
    });

    it('does not pollute request.context prototype via _context body field', async () => {
      let contextInTrigger;
      Parse.Cloud.beforeSave('ContextTest', req => {
        contextInTrigger = req.context;
      });
      const response = await request({
        method: 'POST',
        url: 'http://localhost:8378/1/classes/ContextTest',
        headers: {
          'X-Parse-REST-API-Key': 'rest',
        },
        body: {
          foo: 'bar',
          _ApplicationId: 'test',
          _context: JSON.stringify(JSON.parse('{"__proto__": {"isAdmin": true}}')),
        },
      }).catch(e => e);
      expect(response.status).toBe(201);
      expect(contextInTrigger).toBeDefined();
      expect(contextInTrigger.isAdmin).toBeUndefined();
      expect(Object.getPrototypeOf(contextInTrigger)).not.toEqual(
        jasmine.objectContaining({ isAdmin: true })
      );
    });

    it('does not allow prototype-polluted properties to survive deletion in trigger context', async () => {
      // This test verifies that __proto__ pollution cannot bypass context property deletion.
      // When a developer deletes a context property, prototype-polluted properties would
      // survive the deletion (unlike directly set properties), creating a security gap.
      let contextAfterDelete;
      Parse.Cloud.beforeSave('ContextTest', req => {
        delete req.context.isAdmin;
        contextAfterDelete = { isAdmin: req.context.isAdmin };
      });
      const response = await request({
        headers: {
          ...headers,
          'X-Parse-Cloud-Context': JSON.stringify(
            JSON.parse('{"__proto__": {"isAdmin": true}}')
          ),
        },
        method: 'POST',
        url: 'http://localhost:8378/1/classes/ContextTest',
        body: JSON.stringify({ foo: 'bar' }),
      }).catch(e => e);
      expect(response.status).toBe(201);
      expect(contextAfterDelete).toBeDefined();
      expect(contextAfterDelete.isAdmin).toBeUndefined();
    });
  });

  describe('(GHSA-hpm8-9qx6-jvwv) Ranged file download bypasses afterFind(Parse.File) trigger and validators', () => {
    it_only_db('mongo')('enforces afterFind requireUser validator on streaming file download', async () => {
      const file = new Parse.File('secret.txt', [1, 2, 3], 'text/plain');
      await file.save({ useMasterKey: true });
      Parse.Cloud.afterFind(Parse.File, () => {}, { requireUser: true });
      const response = await request({
        url: file.url(),
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
          'Range': 'bytes=0-2',
        },
      }).catch(e => e);
      expect(response.status).toBe(403);
    });

    it('enforces afterFind requireUser validator on non-streaming file download', async () => {
      const file = new Parse.File('secret.txt', [1, 2, 3], 'text/plain');
      await file.save({ useMasterKey: true });
      Parse.Cloud.afterFind(Parse.File, () => {}, { requireUser: true });
      const response = await request({
        url: file.url(),
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
        },
      }).catch(e => e);
      expect(response.status).toBe(403);
    });

    it_only_db('mongo')('allows streaming file download when afterFind requireUser validator passes', async () => {
      const file = new Parse.File('secret.txt', [1, 2, 3], 'text/plain');
      await file.save({ useMasterKey: true });
      const user = await Parse.User.signUp('username', 'password');
      Parse.Cloud.afterFind(Parse.File, () => {}, { requireUser: true });
      const response = await request({
        url: file.url(),
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
          'X-Parse-Session-Token': user.getSessionToken(),
          'Range': 'bytes=0-2',
        },
      }).catch(e => e);
      expect(response.status).toBe(206);
    });

    it_only_db('mongo')('enforces afterFind custom authorization on streaming file download', async () => {
      const file = new Parse.File('secret.txt', [1, 2, 3], 'text/plain');
      await file.save({ useMasterKey: true });
      Parse.Cloud.afterFind(Parse.File, () => {
        throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Access denied');
      });
      const response = await request({
        url: file.url(),
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
          'Range': 'bytes=0-2',
        },
      }).catch(e => e);
      expect(response.status).toBe(403);
    });
  });
});
