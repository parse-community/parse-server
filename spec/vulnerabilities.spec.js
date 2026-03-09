const request = require('../lib/request');

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
        // Cannot test via HTTP because deepcopy() strips __proto__ before the denylist
        // check runs. Test objectContainsKeyValue directly with a JSON.parse'd object
        // that preserves __proto__ as an own property.
        const Utils = require('../lib/Utils');
        const data = JSON.parse('{"profile": {"name": "alice"}, "__proto__": {"isAdmin": true}}');
        expect(Utils.objectContainsKeyValue(data, '__proto__', undefined)).toBe(true);
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
