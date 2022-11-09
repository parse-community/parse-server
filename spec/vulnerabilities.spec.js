const request = require('../lib/request');

describe('Vulnerabilities', () => {
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

  describe('Request denylist', () => {
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
      await expectAsync(new Parse.Object('TestObject').save()).toBeRejectedWith(
        new Parse.Error(
          Parse.Error.INVALID_KEY_NAME,
          'Prohibited keyword in request data: {"key":"constructor"}.'
        )
      );
    });

    it('denies creating a hook with polluted data', async () => {
      const express = require('express');
      const bodyParser = require('body-parser');
      const port = 34567;
      const hookServerURL = 'http://localhost:' + port;
      const app = express();
      app.use(bodyParser.json({ type: '*/*' }));
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
      await expectAsync(new Parse.Object('TestObject').save()).toBeRejectedWith(
        new Parse.Error(
          Parse.Error.INVALID_KEY_NAME,
          'Prohibited keyword in request data: {"key":"constructor"}.'
        )
      );
      await new Promise(resolve => server.close(resolve));
    });

    it('allows BSON type code data in write request with custom denylist', async () => {
      await reconfigureServer({
        requestKeywordDenylist: [],
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
            _bsontype: 'Code',
            code: 'delete Object.prototype.evalFunctions',
          },
        }),
      };
      const response = await request(params).catch(e => e);
      expect(response.status).toBe(201);
      const text = JSON.parse(response.text);
      expect(text.objectId).toBeDefined();
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
