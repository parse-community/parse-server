// These tests are unit tests designed to only test transform.js.
'use strict';

const transform = require('../lib/Adapters/Storage/Mongo/MongoTransform');
const dd = require('deep-diff');
const mongodb = require('mongodb');
const Utils = require('../lib/Utils');

describe('parseObjectToMongoObjectForCreate', () => {
  it('a basic number', done => {
    const input = { five: 5 };
    const output = transform.parseObjectToMongoObjectForCreate(null, input, {
      fields: { five: { type: 'Number' } },
    });
    jequal(input, output);
    done();
  });

  it('an object with null values', done => {
    const input = { objectWithNullValues: { isNull: null, notNull: 3 } };
    const output = transform.parseObjectToMongoObjectForCreate(null, input, {
      fields: { objectWithNullValues: { type: 'object' } },
    });
    jequal(input, output);
    done();
  });

  it('nested Bytes transform to mongodb.Binary', () => {
    const bytes = { __type: 'Bytes', base64: Buffer.from('hello').toString('base64') };
    const output = transform.parseObjectToMongoObjectForCreate(null, { arr: [bytes] }, {
      fields: { arr: { type: 'Array' } },
    });
    expect(output.arr[0] instanceof mongodb.Binary).toBe(true);
    expect(Buffer.from(output.arr[0].buffer).toString()).toBe('hello');
  });

  it('built-in timestamps with date', done => {
    const input = {
      createdAt: '2015-10-06T21:24:50.332Z',
      updatedAt: '2015-10-06T21:24:50.332Z',
    };
    const output = transform.parseObjectToMongoObjectForCreate(null, input, {
      fields: {},
    });
    expect(Utils.isDate(output._created_at)).toBe(true);
    expect(Utils.isDate(output._updated_at)).toBe(true);
    done();
  });

  it('array of pointers', done => {
    const pointer = {
      __type: 'Pointer',
      objectId: 'myId',
      className: 'Blah',
    };
    const out = transform.parseObjectToMongoObjectForCreate(
      null,
      { pointers: [pointer] },
      {
        fields: { pointers: { type: 'Array' } },
      }
    );
    jequal([pointer], out.pointers);
    done();
  });

  //TODO: object creation requests shouldn't be seeing __op delete, it makes no sense to
  //have __op delete in a new object. Figure out what this should actually be testing.
  xit('a delete op', done => {
    const input = { deleteMe: { __op: 'Delete' } };
    const output = transform.parseObjectToMongoObjectForCreate(null, input, {
      fields: {},
    });
    jequal(output, {});
    done();
  });

  it('Doesnt allow ACL, as Parse Server should tranform ACL to _wperm + _rperm', done => {
    const input = { ACL: { '0123': { read: true, write: true } } };
    expect(() =>
      transform.parseObjectToMongoObjectForCreate(null, input, { fields: {} })
    ).toThrow();
    done();
  });

  it('parse geopoint to mongo', done => {
    const lat = -45;
    const lng = 45;
    const geoPoint = { __type: 'GeoPoint', latitude: lat, longitude: lng };
    const out = transform.parseObjectToMongoObjectForCreate(
      null,
      { location: geoPoint },
      {
        fields: { location: { type: 'GeoPoint' } },
      }
    );
    expect(out.location).toEqual([lng, lat]);
    done();
  });

  it('parse polygon to mongo', done => {
    const lat1 = -45;
    const lng1 = 45;
    const lat2 = -55;
    const lng2 = 55;
    const lat3 = -65;
    const lng3 = 65;
    const polygon = {
      __type: 'Polygon',
      coordinates: [
        [lat1, lng1],
        [lat2, lng2],
        [lat3, lng3],
      ],
    };
    const out = transform.parseObjectToMongoObjectForCreate(
      null,
      { location: polygon },
      {
        fields: { location: { type: 'Polygon' } },
      }
    );
    expect(out.location.coordinates).toEqual([
      [
        [lng1, lat1],
        [lng2, lat2],
        [lng3, lat3],
        [lng1, lat1],
      ],
    ]);
    done();
  });

  it('in array', done => {
    const geoPoint = { __type: 'GeoPoint', longitude: 180, latitude: -180 };
    const out = transform.parseObjectToMongoObjectForCreate(
      null,
      { locations: [geoPoint, geoPoint] },
      {
        fields: { locations: { type: 'Array' } },
      }
    );
    expect(out.locations).toEqual([geoPoint, geoPoint]);
    done();
  });

  it('in sub-object', done => {
    const geoPoint = { __type: 'GeoPoint', longitude: 180, latitude: -180 };
    const out = transform.parseObjectToMongoObjectForCreate(
      null,
      { locations: { start: geoPoint } },
      {
        fields: { locations: { type: 'Object' } },
      }
    );
    expect(out).toEqual({ locations: { start: geoPoint } });
    done();
  });

  it('objectId', done => {
    const out = transform.transformWhere(null, { objectId: 'foo' });
    expect(out._id).toEqual('foo');
    done();
  });

  it('objectId in a list', done => {
    const input = {
      objectId: { $in: ['one', 'two', 'three'] },
    };
    const output = transform.transformWhere(null, input);
    jequal(input.objectId, output._id);
    done();
  });

  it('built-in timestamps', done => {
    const input = { createdAt: new Date(), updatedAt: new Date() };
    const output = transform.mongoObjectToParseObject(null, input, {
      fields: {},
    });
    expect(typeof output.createdAt).toEqual('string');
    expect(typeof output.updatedAt).toEqual('string');
    done();
  });

  it('pointer', done => {
    const input = { _p_userPointer: '_User$123' };
    const output = transform.mongoObjectToParseObject(null, input, {
      fields: { userPointer: { type: 'Pointer', targetClass: '_User' } },
    });
    expect(typeof output.userPointer).toEqual('object');
    expect(output.userPointer).toEqual({
      __type: 'Pointer',
      className: '_User',
      objectId: '123',
    });
    done();
  });

  it('null pointer', done => {
    const input = { _p_userPointer: null };
    const output = transform.mongoObjectToParseObject(null, input, {
      fields: { userPointer: { type: 'Pointer', targetClass: '_User' } },
    });
    expect(output.userPointer).toBeUndefined();
    done();
  });

  it('file', done => {
    const input = { picture: 'pic.jpg' };
    const output = transform.mongoObjectToParseObject(null, input, {
      fields: { picture: { type: 'File' } },
    });
    expect(typeof output.picture).toEqual('object');
    expect(output.picture).toEqual({ __type: 'File', name: 'pic.jpg' });
    done();
  });

  it('mongo geopoint to parse', done => {
    const lat = -45;
    const lng = 45;
    const input = { location: [lng, lat] };
    const output = transform.mongoObjectToParseObject(null, input, {
      fields: { location: { type: 'GeoPoint' } },
    });
    expect(typeof output.location).toEqual('object');
    expect(output.location).toEqual({
      __type: 'GeoPoint',
      latitude: lat,
      longitude: lng,
    });
    done();
  });

  it('mongo polygon to parse', done => {
    const lat = -45;
    const lng = 45;
    // Mongo stores polygon in WGS84 lng/lat
    const input = {
      location: {
        type: 'Polygon',
        coordinates: [
          [
            [lat, lng],
            [lat, lng],
          ],
        ],
      },
    };
    const output = transform.mongoObjectToParseObject(null, input, {
      fields: { location: { type: 'Polygon' } },
    });
    expect(typeof output.location).toEqual('object');
    expect(output.location).toEqual({
      __type: 'Polygon',
      coordinates: [
        [lng, lat],
        [lng, lat],
      ],
    });
    done();
  });

  it('bytes', done => {
    const input = { binaryData: 'aGVsbG8gd29ybGQ=' };
    const output = transform.mongoObjectToParseObject(null, input, {
      fields: { binaryData: { type: 'Bytes' } },
    });
    expect(typeof output.binaryData).toEqual('object');
    expect(output.binaryData).toEqual({
      __type: 'Bytes',
      base64: 'aGVsbG8gd29ybGQ=',
    });
    done();
  });

  it('nested array', done => {
    const input = { arr: [{ _testKey: 'testValue' }] };
    const output = transform.mongoObjectToParseObject(null, input, {
      fields: { arr: { type: 'Array' } },
    });
    expect(Array.isArray(output.arr)).toEqual(true);
    expect(output.arr).toEqual([{ _testKey: 'testValue' }]);
    done();
  });

  it('untransforms objects containing nested special keys', done => {
    const input = {
      array: [
        {
          _id: 'Test ID',
          _hashed_password:
            "I Don't know why you would name a key this, but if you do it should work",
          _tombstone: {
            _updated_at: "I'm sure people will nest keys like this",
            _acl: 7,
            _id: { someString: 'str', someNumber: 7 },
            regularKey: { moreContents: [1, 2, 3] },
          },
          regularKey: 'some data',
        },
      ],
    };
    const output = transform.mongoObjectToParseObject(null, input, {
      fields: { array: { type: 'Array' } },
    });
    expect(dd(output, input)).toEqual(undefined);
    done();
  });

  it('changes new pointer key', done => {
    const input = {
      somePointer: { __type: 'Pointer', className: 'Micro', objectId: 'oft' },
    };
    const output = transform.parseObjectToMongoObjectForCreate(null, input, {
      fields: { somePointer: { type: 'Pointer' } },
    });
    expect(typeof output._p_somePointer).toEqual('string');
    expect(output._p_somePointer).toEqual('Micro$oft');
    done();
  });

  it('changes existing pointer keys', done => {
    const input = {
      userPointer: {
        __type: 'Pointer',
        className: '_User',
        objectId: 'qwerty',
      },
    };
    const output = transform.parseObjectToMongoObjectForCreate(null, input, {
      fields: { userPointer: { type: 'Pointer' } },
    });
    expect(typeof output._p_userPointer).toEqual('string');
    expect(output._p_userPointer).toEqual('_User$qwerty');
    done();
  });

  it('writes the old ACL format in addition to rperm and wperm on create', done => {
    const input = {
      _rperm: ['*'],
      _wperm: ['Kevin'],
    };

    const output = transform.parseObjectToMongoObjectForCreate(null, input, {
      fields: {},
    });
    expect(typeof output._acl).toEqual('object');
    expect(output._acl['Kevin'].w).toBeTruthy();
    expect(output._acl['Kevin'].r).toBeUndefined();
    expect(output._rperm).toEqual(input._rperm);
    expect(output._wperm).toEqual(input._wperm);
    done();
  });

  it('removes Relation types', done => {
    const input = {
      aRelation: { __type: 'Relation', className: 'Stuff' },
    };
    const output = transform.parseObjectToMongoObjectForCreate(null, input, {
      fields: {
        aRelation: { __type: 'Relation', className: 'Stuff' },
      },
    });
    expect(output).toEqual({});
    done();
  });

  it('writes the old ACL format in addition to rperm and wperm on update', done => {
    const input = {
      _rperm: ['*'],
      _wperm: ['Kevin'],
    };

    const output = transform.transformUpdate(null, input, { fields: {} });
    const set = output.$set;
    expect(typeof set).toEqual('object');
    expect(typeof set._acl).toEqual('object');
    expect(set._acl['Kevin'].w).toBeTruthy();
    expect(set._acl['Kevin'].r).toBeUndefined();
    expect(set._rperm).toEqual(input._rperm);
    expect(set._wperm).toEqual(input._wperm);
    done();
  });

  it('untransforms from _rperm and _wperm to ACL', done => {
    const input = {
      _rperm: ['*'],
      _wperm: ['Kevin'],
    };
    const output = transform.mongoObjectToParseObject(null, input, {
      fields: {},
    });
    expect(output._rperm).toEqual(['*']);
    expect(output._wperm).toEqual(['Kevin']);
    expect(output.ACL).toBeUndefined();
    done();
  });

  it('untransforms mongodb number types', done => {
    const input = {
      long: mongodb.Long.fromNumber(Number.MAX_SAFE_INTEGER),
      double: new mongodb.Double(Number.MAX_VALUE),
    };
    const output = transform.mongoObjectToParseObject(null, input, {
      fields: {
        long: { type: 'Number' },
        double: { type: 'Number' },
      },
    });
    expect(output.long).toBe(Number.MAX_SAFE_INTEGER);
    expect(output.double).toBe(Number.MAX_VALUE);
    done();
  });

  it('Date object where iso attribute is of type Date', done => {
    const input = {
      ts: { __type: 'Date', iso: new Date('2017-01-18T00:00:00.000Z') },
    };
    const output = transform.mongoObjectToParseObject(null, input, {
      fields: {
        ts: { type: 'Date' },
      },
    });
    expect(output.ts.iso).toEqual('2017-01-18T00:00:00.000Z');
    done();
  });

  it('Date object where iso attribute is of type String', done => {
    const input = {
      ts: { __type: 'Date', iso: '2017-01-18T00:00:00.000Z' },
    };
    const output = transform.mongoObjectToParseObject(null, input, {
      fields: {
        ts: { type: 'Date' },
      },
    });
    expect(output.ts.iso).toEqual('2017-01-18T00:00:00.000Z');
    done();
  });

  it('object with undefined nested values', () => {
    const input = {
      _id: 'vQHyinCW1l',
      urls: { firstUrl: 'https://', secondUrl: undefined },
    };
    const output = transform.mongoObjectToParseObject(null, input, {
      fields: {
        urls: { type: 'Object' },
      },
    });
    expect(output.urls).toEqual({
      firstUrl: 'https://',
      secondUrl: undefined,
    });
  });

  it('undefined objects', () => {
    const input = {
      _id: 'vQHyinCW1l',
      urls: undefined,
    };
    const output = transform.mongoObjectToParseObject(null, input, {
      fields: {
        urls: { type: 'Object' },
      },
    });
    expect(output.urls).toBeUndefined();
  });

  it('$regex in $all list', done => {
    const input = {
      arrayField: {
        $all: [{ $regex: '^\\Qone\\E' }, { $regex: '^\\Qtwo\\E' }, { $regex: '^\\Qthree\\E' }],
      },
    };
    const outputValue = {
      arrayField: { $all: [/^\Qone\E/, /^\Qtwo\E/, /^\Qthree\E/] },
    };

    const output = transform.transformWhere(null, input);
    jequal(outputValue.arrayField, output.arrayField);
    done();
  });

  it('$regex in $all list must be { $regex: "string" }', done => {
    const input = {
      arrayField: { $all: [{ $regex: 1 }] },
    };

    expect(() => {
      transform.transformWhere(null, input);
    }).toThrow();
    done();
  });

  it('all values in $all must be $regex (start with string) or non $regex (start with string)', done => {
    const input = {
      arrayField: {
        $all: [{ $regex: '^\\Qone\\E' }, { $unknown: '^\\Qtwo\\E' }],
      },
    };

    expect(() => {
      transform.transformWhere(null, input);
    }).toThrow();
    done();
  });

  it('ignores User authData field in DB so it can be synthesized in code', done => {
    const input = {
      _id: '123',
      _auth_data_acme: { id: 'abc' },
      authData: null,
    };
    const output = transform.mongoObjectToParseObject('_User', input, {
      fields: {},
    });
    expect(output.authData.acme.id).toBe('abc');
    done();
  });

  it('can set authData when not User class', done => {
    const input = {
      _id: '123',
      authData: 'random',
    };
    const output = transform.mongoObjectToParseObject('TestObject', input, {
      fields: {},
    });
    expect(output.authData).toBe('random');
    done();
  });

  it('should only transform authData.provider.id for _User class', () => {
    // Test that for _User class, authData.facebook.id is transformed
    const userInput = {
      'authData.facebook.id': '10000000000000001',
    };
    const userOutput = transform.transformWhere('_User', userInput, { fields: {} });
    expect(userOutput['_auth_data_facebook.id']).toBe('10000000000000001');

    // Test that for non-User classes, authData.facebook.id is NOT transformed
    const customInput = {
      'authData.facebook.id': '10000000000000001',
    };
    const customOutput = transform.transformWhere('SpamAlerts', customInput, { fields: {} });
    expect(customOutput['authData.facebook.id']).toBe('10000000000000001');
    expect(customOutput['_auth_data_facebook.id']).toBeUndefined();
  });
});

it('cannot have a custom field name beginning with underscore', done => {
  const input = {
    _id: '123',
    _thisFieldNameIs: 'invalid',
  };
  try {
    transform.mongoObjectToParseObject('TestObject', input, {
      fields: {},
    });
  } catch (e) {
    expect(e).toBeDefined();
  }
  done();
});

describe('transformUpdate', () => {
  it('removes Relation types', done => {
    const input = {
      aRelation: { __type: 'Relation', className: 'Stuff' },
    };
    const output = transform.transformUpdate(null, input, {
      fields: {
        aRelation: { __type: 'Relation', className: 'Stuff' },
      },
    });
    expect(output).toEqual({});
    done();
  });

  it('transforms nested Bytes to mongodb.Binary', () => {
    const bytes = { __type: 'Bytes', base64: Buffer.from('hello').toString('base64') };
    const output = transform.transformUpdate(
      null,
      { arr: [bytes], obj: { b: bytes } },
      { fields: { arr: { type: 'Array' }, obj: { type: 'Object' } } }
    );
    expect(output.$set.arr[0] instanceof mongodb.Binary).toBe(true);
    expect(Buffer.from(output.$set.arr[0].buffer).toString()).toBe('hello');
    expect(output.$set.obj.b instanceof mongodb.Binary).toBe(true);
  });
});

describe('transformConstraint', () => {
  describe('$relativeTime', () => {
    it('should error on $eq, $ne, and $exists', () => {
      expect(() => {
        transform.transformConstraint({
          $eq: {
            ttl: {
              $relativeTime: '12 days ago',
            },
          },
        });
      }).toThrow();

      expect(() => {
        transform.transformConstraint({
          $ne: {
            ttl: {
              $relativeTime: '12 days ago',
            },
          },
        });
      }).toThrow();

      expect(() => {
        transform.transformConstraint({
          $exists: {
            $relativeTime: '12 days ago',
          },
        });
      }).toThrow();
    });
  });
});

describe('relativeTimeToDate', () => {
  const now = new Date('2017-09-26T13:28:16.617Z');

  describe('In the future', () => {
    it('should parse valid natural time', () => {
      const text = 'in 1 year 2 weeks 12 days 10 hours 24 minutes 30 seconds';
      const { result, status, info } = Utils.relativeTimeToDate(text, now);
      expect(result.toISOString()).toBe('2018-10-22T23:52:46.617Z');
      expect(status).toBe('success');
      expect(info).toBe('future');
    });
  });

  describe('In the past', () => {
    it('should parse valid natural time', () => {
      const text = '2 days 12 hours 1 minute 12 seconds ago';
      const { result, status, info } = Utils.relativeTimeToDate(text, now);
      expect(result.toISOString()).toBe('2017-09-24T01:27:04.617Z');
      expect(status).toBe('success');
      expect(info).toBe('past');
    });
  });

  describe('From now', () => {
    it('should equal current time', () => {
      const text = 'now';
      const { result, status, info } = Utils.relativeTimeToDate(text, now);
      expect(result.toISOString()).toBe('2017-09-26T13:28:16.617Z');
      expect(status).toBe('success');
      expect(info).toBe('present');
    });
  });

  describe('Error cases', () => {
    it('should error if string is completely gibberish', () => {
      expect(Utils.relativeTimeToDate('gibberishasdnklasdnjklasndkl123j123')).toEqual({
        status: 'error',
        info: "Time should either start with 'in' or end with 'ago'",
      });
    });

    it('should error if string contains neither `ago` nor `in`', () => {
      expect(Utils.relativeTimeToDate('12 hours 1 minute')).toEqual({
        status: 'error',
        info: "Time should either start with 'in' or end with 'ago'",
      });
    });

    it('should error if there are missing units or numbers', () => {
      expect(Utils.relativeTimeToDate('in 12 hours 1')).toEqual({
        status: 'error',
        info: 'Invalid time string. Dangling unit or number.',
      });

      expect(Utils.relativeTimeToDate('12 hours minute ago')).toEqual({
        status: 'error',
        info: 'Invalid time string. Dangling unit or number.',
      });
    });

    it('should error on floating point numbers', () => {
      expect(Utils.relativeTimeToDate('in 12.3 hours')).toEqual({
        status: 'error',
        info: "'12.3' is not an integer.",
      });
    });

    it('should error if numbers are invalid', () => {
      expect(Utils.relativeTimeToDate('12 hours 123a minute ago')).toEqual({
        status: 'error',
        info: "'123a' is not an integer.",
      });
    });

    it('should error on invalid interval units', () => {
      expect(Utils.relativeTimeToDate('4 score 7 years ago')).toEqual({
        status: 'error',
        info: "Invalid interval: 'score'",
      });
    });

    it("should error when string contains 'ago' and 'in'", () => {
      expect(Utils.relativeTimeToDate('in 1 day 2 minutes ago')).toEqual({
        status: 'error',
        info: "Time cannot have both 'in' and 'ago'",
      });
    });
  });

});

describe('MongoTransform built-in keys and date coercion', () => {
  const Parse = require('parse/node').Parse;
  const emptySchema = { fields: {} };
  const iso = '2015-10-06T21:24:50.332Z';
  const asDate = new Date(iso);

  it('transformKey maps auth session built-in fields', () => {
    expect(transform.transformKey(null, 'sessionToken', emptySchema)).toBe('_session_token');
    expect(transform.transformKey(null, 'lastUsed', emptySchema)).toBe('_last_used');
    expect(transform.transformKey(null, 'timesUsed', emptySchema)).toBe('times_used');
  });

  it('transformUpdate coerces objectId to an int for config classes', () => {
    expect(transform.transformUpdate('_GlobalConfig', { objectId: '5' }, emptySchema)).toEqual({
      $set: { objectId: 5 },
    });
  });

  [
    ['createdAt', '_created_at'],
    ['updatedAt', '_updated_at'],
    ['expiresAt', 'expiresAt'],
    ['_email_verify_token_expires_at', '_email_verify_token_expires_at'],
    ['_account_lockout_expires_at', '_account_lockout_expires_at'],
    ['_perishable_token_expires_at', '_perishable_token_expires_at'],
    ['_password_changed_at', '_password_changed_at'],
    ['lastUsed', '_last_used'],
  ].forEach(([restKey, mongoKey]) => {
    it(`transformWhere coerces a string ${restKey} to a Date`, () => {
      const out = transform.transformWhere(null, { [restKey]: iso }, emptySchema);
      expect(out[mongoKey]).toEqual(asDate);
    });
  });

  it('transformWhere accepts a Date instance for createdAt', () => {
    expect(transform.transformWhere(null, { createdAt: asDate }, emptySchema)).toEqual({ _created_at: asDate });
  });

  it('transformWhere passes non-date constraints through for date keys', () => {
    expect(transform.transformWhere(null, { updatedAt: { $exists: true } }, emptySchema)).toEqual({
      _updated_at: { $exists: true },
    });
    expect(transform.transformWhere(null, { expiresAt: { $exists: true } }, emptySchema)).toEqual({
      expiresAt: { $exists: true },
    });
  });

  ['_account_lockout_expires_at', '_perishable_token_expires_at'].forEach(key => {
    it(`parseObjectToMongoObjectForCreate coerces a string ${key} to a Date`, () => {
      const out = transform.parseObjectToMongoObjectForCreate(null, { [key]: iso }, { fields: {} });
      expect(out[key]).toEqual(asDate);
    });
  });

  it('parseObjectToMongoObjectForCreate rejects querying an authData id', () => {
    expect(() =>
      transform.parseObjectToMongoObjectForCreate(null, { 'authData.facebook.id': 'abc' }, { fields: {} })
    ).toThrowMatching(e => e.code === Parse.Error.INVALID_KEY_NAME);
  });
});

describe('MongoTransform transformConstraint edge cases', () => {
  const Parse = require('parse/node').Parse;
  const throwsInvalidJSON = fn => expect(fn).toThrowMatching(e => e.code === Parse.Error.INVALID_JSON);

  it('throws on a non-transformable atom in a comparison', () => {
    throwsInvalidJSON(() => transform.transformConstraint({ $gt: { foo: 'bar' } }, undefined, 'plainKey', false));
  });

  it('throws when $relativeTime is used with an equality operator', () => {
    throwsInvalidJSON(() =>
      transform.transformConstraint(
        { $eq: { $relativeTime: '12 days ago' } },
        { type: 'Date' },
        'someDateField',
        false
      )
    );
  });

  it('throws on a non-array $all', () => {
    throwsInvalidJSON(() => transform.transformConstraint({ $all: 'notAnArray' }, undefined, 'arrayField', false));
  });

  it('throws on a non-string $regex', () => {
    throwsInvalidJSON(() => transform.transformConstraint({ $regex: 123 }, undefined, 'someKey', false));
  });

  it('throws on a non-string $text $term', () => {
    throwsInvalidJSON(() =>
      transform.transformConstraint({ $text: { $search: { $term: 123 } } }, undefined, 'someKey', false)
    );
  });

  it('throws on a function value in a nested-key constraint', () => {
    throwsInvalidJSON(() => transform.transformConstraint({ $eq: function () {} }, undefined, 'foo.bar', false));
  });

  it('transforms Bytes inside a $all array', () => {
    const out = transform.transformWhere(
      null,
      { arrayField: { $all: [{ __type: 'Bytes', base64: 'aGVsbG8=' }] } },
      { fields: { arrayField: { type: 'Array' } } }
    );
    expect(out.arrayField.$all[0]).toEqual(jasmine.any(mongodb.Binary));
  });

  it('converts the $maxDistance unit variants', () => {
    expect(transform.transformConstraint({ $maxDistanceInRadians: 2 }, undefined, 'location', false)).toEqual({
      $maxDistance: 2,
    });
    expect(transform.transformConstraint({ $maxDistanceInMiles: 3959 }, undefined, 'location', false)).toEqual({
      $maxDistance: 1,
    });
    expect(transform.transformConstraint({ $maxDistanceInKilometers: 6371 }, undefined, 'location', false)).toEqual({
      $maxDistance: 1,
    });
  });

  it('throws COMMAND_UNAVAILABLE for $select', () => {
    expect(() => transform.transformConstraint({ $select: {} }, undefined, 'someKey', false)).toThrowMatching(
      e => e.code === Parse.Error.COMMAND_UNAVAILABLE
    );
  });

  it('throws on a malformatted $within box', () => {
    throwsInvalidJSON(() =>
      transform.transformConstraint({ $within: { $box: [{ latitude: 1, longitude: 2 }] } }, undefined, 'someKey', false)
    );
  });

  it('throws on bad $geoWithin polygon points', () => {
    throwsInvalidJSON(() =>
      transform.transformConstraint(
        {
          $geoWithin: {
            $polygon: [
              { latitude: 1, longitude: 2 },
              { latitude: 3, longitude: 4 },
              { latitude: 5, longitude: 6 },
            ],
          },
        },
        undefined,
        'location',
        false
      )
    );
  });

  it('throws on a bad $geoIntersects point', () => {
    throwsInvalidJSON(() =>
      transform.transformConstraint(
        { $geoIntersects: { $point: { latitude: 1, longitude: 2 } } },
        undefined,
        'location',
        false
      )
    );
  });
});

describe('MongoTransform atom and update-operator edge cases', () => {
  const Parse = require('parse/node').Parse;

  it('throws on a function value (top-level atom)', () => {
    expect(() => transform.transformUpdate(null, { foo: function () {} }, { fields: {} })).toThrowMatching(
      e => e.code === Parse.Error.INVALID_JSON
    );
  });

  it('throws INTERNAL_SERVER_ERROR on a bigint value (top-level atom)', () => {
    expect(() => transform.transformUpdate(null, { foo: BigInt(10) }, { fields: {} })).toThrowMatching(
      e => e.code === Parse.Error.INTERNAL_SERVER_ERROR
    );
  });

  it('throws when Add objects is not an array', () => {
    expect(() =>
      transform.transformUpdate(null, { arr: { __op: 'Add', objects: 'notArray' } }, { fields: { arr: { type: 'Array' } } })
    ).toThrowMatching(e => e.code === Parse.Error.INVALID_JSON);
  });

  it('throws when Remove objects is not an array', () => {
    expect(() =>
      transform.transformUpdate(null, { arr: { __op: 'Remove', objects: 'notArray' } }, { fields: { arr: { type: 'Array' } } })
    ).toThrowMatching(e => e.code === Parse.Error.INVALID_JSON);
  });

  it('throws COMMAND_UNAVAILABLE for an unknown __op', () => {
    expect(() => transform.transformUpdate(null, { foo: { __op: 'Bogus' } }, { fields: {} })).toThrowMatching(
      e => e.code === Parse.Error.COMMAND_UNAVAILABLE
    );
  });
});

describe('MongoTransform mongoObjectToParseObject edge cases', () => {
  it('throws on a function nested value', () => {
    expect(() => transform.mongoObjectToParseObject(null, { someKey: function () {} }, { fields: {} })).toThrowMatching(
      e => e === 'bad value in nestedMongoObjectToNestedParseObject'
    );
  });

  it('decodes Binary inside a nested array', () => {
    const out = transform.mongoObjectToParseObject(
      null,
      { arr: [new mongodb.Binary(Buffer.from('hello world'))] },
      { fields: { arr: { type: 'Array' } } }
    );
    expect(out.arr[0]).toEqual({ __type: 'Bytes', base64: 'aGVsbG8gd29ybGQ=' });
  });

  it('throws on a bigint nested value', () => {
    expect(() => transform.mongoObjectToParseObject(null, { someKey: BigInt(10) }, { fields: {} })).toThrowMatching(
      e => e === 'unknown js type'
    );
  });

  it('throws on a function top-level value', () => {
    expect(() => transform.mongoObjectToParseObject(null, function () {}, { fields: {} })).toThrowMatching(
      e => e === 'bad value in mongoObjectToParseObject'
    );
  });

  it('returns an array passed as the top-level object', () => {
    expect(transform.mongoObjectToParseObject(null, [{ foo: 'bar' }], { fields: {} })).toEqual([{ foo: 'bar' }]);
  });

  it('converts a top-level Long', () => {
    expect(transform.mongoObjectToParseObject(null, mongodb.Long.fromNumber(42), { fields: {} })).toBe(42);
  });

  it('converts a top-level Double', () => {
    expect(transform.mongoObjectToParseObject(null, new mongodb.Double(3.14), { fields: {} })).toBe(3.14);
  });

  it('decodes a top-level Binary', () => {
    expect(transform.mongoObjectToParseObject(null, new mongodb.Binary(Buffer.from('hello')), { fields: {} })).toEqual({
      __type: 'Bytes',
      base64: 'aGVsbG8=',
    });
  });

  it('throws on a bigint top-level value', () => {
    expect(() => transform.mongoObjectToParseObject(null, BigInt(10), { fields: {} })).toThrowMatching(
      e => e === 'unknown js type'
    );
  });

  it('drops a pointer field missing from the schema', () => {
    expect(transform.mongoObjectToParseObject('SomeClass', { _p_missingField: 'Foo$1' }, { fields: {} })).toEqual({});
  });

  it('drops a _p_ field whose schema type is not Pointer', () => {
    expect(
      transform.mongoObjectToParseObject('SomeClass', { _p_notAPointer: 'Foo$1' }, { fields: { notAPointer: { type: 'String' } } })
    ).toEqual({});
  });

  it('passes through an object that is not a valid Polygon (wrong type)', () => {
    const input = { location: { type: 'NotPolygon', coordinates: [[[1, 2], [3, 4], [5, 6]]] } };
    expect(transform.mongoObjectToParseObject(null, input, { fields: { location: { type: 'Polygon' } } })).toEqual(input);
  });

  it('passes through a Polygon with an invalid point', () => {
    const input = { location: { type: 'Polygon', coordinates: [[[1, 2], [3, 4], 'bad']] } };
    expect(transform.mongoObjectToParseObject(null, input, { fields: { location: { type: 'Polygon' } } })).toEqual(input);
  });
});

describe('MongoTransform transformPointerString', () => {
  it('throws when the pointer className does not match the schema', () => {
    expect(() =>
      transform.transformPointerString(
        { fields: { userPointer: { type: 'Pointer', targetClass: '_User' } } },
        'userPointer',
        'WrongClass$123'
      )
    ).toThrowMatching(e => e === 'pointer to incorrect className');
  });
});
