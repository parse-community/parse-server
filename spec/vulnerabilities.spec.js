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
  });
});
