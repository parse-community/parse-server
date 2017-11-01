// These tests are unit tests designed to only test transform.js.
"use strict";

const transform = require('../src/Adapters/Storage/Mongo/MongoTransform');
const dd = require('deep-diff');
const mongodb = require('mongodb');

describe('parseObjectToMongoObjectForCreate', () => {
  it('a basic number', (done) => {
    var input = {five: 5};
    var output = transform.parseObjectToMongoObjectForCreate(null, input, {
      fields: {five: {type: 'Number'}}
    });
    jequal(input, output);
    done();
  });

  it('an object with null values', (done) => {
    var input = {objectWithNullValues: {isNull: null, notNull: 3}};
    var output = transform.parseObjectToMongoObjectForCreate(null, input, {
      fields: {objectWithNullValues: {type: 'object'}}
    });
    jequal(input, output);
    done();
  });

  it('built-in timestamps', (done) => {
    var input = {
      createdAt: "2015-10-06T21:24:50.332Z",
      updatedAt: "2015-10-06T21:24:50.332Z"
    };
    var output = transform.parseObjectToMongoObjectForCreate(null, input, { fields: {} });
    expect(output._created_at instanceof Date).toBe(true);
    expect(output._updated_at instanceof Date).toBe(true);
    done();
  });

  it('array of pointers', (done) => {
    var pointer = {
      __type: 'Pointer',
      objectId: 'myId',
      className: 'Blah',
    };
    var out = transform.parseObjectToMongoObjectForCreate(null, {pointers: [pointer]},{
      fields: {pointers: {type: 'Array'}}
    });
    jequal([pointer], out.pointers);
    done();
  });

  //TODO: object creation requests shouldn't be seeing __op delete, it makes no sense to
  //have __op delete in a new object. Figure out what this should actually be testing.
  xit('a delete op', (done) => {
    var input = {deleteMe: {__op: 'Delete'}};
    var output = transform.parseObjectToMongoObjectForCreate(null, input, { fields: {} });
    jequal(output, {});
    done();
  });

  it('Doesnt allow ACL, as Parse Server should tranform ACL to _wperm + _rperm', done => {
    var input = {ACL: {'0123': {'read': true, 'write': true}}};
    expect(() => transform.parseObjectToMongoObjectForCreate(null, input, { fields: {} })).toThrow();
    done();
  });

  it('plain', (done) => {
    var geoPoint = {__type: 'GeoPoint', longitude: 180, latitude: -180};
    var out = transform.parseObjectToMongoObjectForCreate(null, {location: geoPoint},{
      fields: {location: {type: 'GeoPoint'}}
    });
    expect(out.location).toEqual([180, -180]);
    done();
  });

  it('in array', (done) => {
    var geoPoint = {__type: 'GeoPoint', longitude: 180, latitude: -180};
    var out = transform.parseObjectToMongoObjectForCreate(null, {locations: [geoPoint, geoPoint]},{
      fields: {locations: {type: 'Array'}}
    });
    expect(out.locations).toEqual([geoPoint, geoPoint]);
    done();
  });

  it('in sub-object', (done) => {
    var geoPoint = {__type: 'GeoPoint', longitude: 180, latitude: -180};
    var out = transform.parseObjectToMongoObjectForCreate(null, { locations: { start: geoPoint }},{
      fields: {locations: {type: 'Object'}}
    });
    expect(out).toEqual({ locations: { start: geoPoint } });
    done();
  });

  it('objectId', (done) => {
    var out = transform.transformWhere(null, {objectId: 'foo'});
    expect(out._id).toEqual('foo');
    done();
  });

  it('objectId in a list', (done) => {
    var input = {
      objectId: {'$in': ['one', 'two', 'three']},
    };
    var output = transform.transformWhere(null, input);
    jequal(input.objectId, output._id);
    done();
  });

  it('built-in timestamps', (done) => {
    var input = {createdAt: new Date(), updatedAt: new Date()};
    var output = transform.mongoObjectToParseObject(null, input, { fields: {} });
    expect(typeof output.createdAt).toEqual('string');
    expect(typeof output.updatedAt).toEqual('string');
    done();
  });

  it('pointer', (done) => {
    var input = {_p_userPointer: '_User$123'};
    var output = transform.mongoObjectToParseObject(null, input, {
      fields: { userPointer: { type: 'Pointer', targetClass: '_User' } },
    });
    expect(typeof output.userPointer).toEqual('object');
    expect(output.userPointer).toEqual(
      {__type: 'Pointer', className: '_User', objectId: '123'}
    );
    done();
  });

  it('null pointer', (done) => {
    var input = {_p_userPointer: null};
    var output = transform.mongoObjectToParseObject(null, input, {
      fields: { userPointer: { type: 'Pointer', targetClass: '_User' } },
    });
    expect(output.userPointer).toBeUndefined();
    done();
  });

  it('file', (done) => {
    var input = {picture: 'pic.jpg'};
    var output = transform.mongoObjectToParseObject(null, input, {
      fields: { picture: { type: 'File' }},
    });
    expect(typeof output.picture).toEqual('object');
    expect(output.picture).toEqual({__type: 'File', name: 'pic.jpg'});
    done();
  });

  it('geopoint', (done) => {
    var input = {location: [45, -45]};
    var output = transform.mongoObjectToParseObject(null, input, {
      fields: { location: { type: 'GeoPoint' }},
    });
    expect(typeof output.location).toEqual('object');
    expect(output.location).toEqual(
      {__type: 'GeoPoint', longitude: 45, latitude: -45}
    );
    done();
  });

  it('polygon', (done) => {
    var input = {location: { type: 'Polygon', coordinates: [[[45, -45],[45, -45]]]}};
    var output = transform.mongoObjectToParseObject(null, input, {
      fields: { location: { type: 'Polygon' }},
    });
    expect(typeof output.location).toEqual('object');
    expect(output.location).toEqual(
      {__type: 'Polygon', coordinates: [[45, -45],[45, -45]]}
    );
    done();
  });

  it('bytes', (done) => {
    var input = {binaryData: "aGVsbG8gd29ybGQ="};
    var output = transform.mongoObjectToParseObject(null, input, {
      fields: { binaryData: { type: 'Bytes' }},
    });
    expect(typeof output.binaryData).toEqual('object');
    expect(output.binaryData).toEqual(
      {__type: 'Bytes', base64: "aGVsbG8gd29ybGQ="}
    );
    done();
  });

  it('nested array', (done) => {
    var input = {arr: [{_testKey: 'testValue' }]};
    var output = transform.mongoObjectToParseObject(null, input, {
      fields: { arr: { type: 'Array' } },
    });
    expect(Array.isArray(output.arr)).toEqual(true);
    expect(output.arr).toEqual([{ _testKey: 'testValue'}]);
    done();
  });

  it('untransforms objects containing nested special keys', done => {
    const input = {array: [{
      _id: "Test ID",
      _hashed_password: "I Don't know why you would name a key this, but if you do it should work",
      _tombstone: {
        _updated_at: "I'm sure people will nest keys like this",
        _acl: 7,
        _id: { someString: "str", someNumber: 7},
        regularKey: { moreContents: [1, 2, 3] },
      },
      regularKey: "some data",
    }]}
    const output = transform.mongoObjectToParseObject(null, input, {
      fields: { array: { type: 'Array' }},
    });
    expect(dd(output, input)).toEqual(undefined);
    done();
  });

  it('changes new pointer key', (done) => {
    var input = {
      somePointer: {__type: 'Pointer', className: 'Micro', objectId: 'oft'}
    };
    var output = transform.parseObjectToMongoObjectForCreate(null, input, {
      fields: {somePointer: {type: 'Pointer'}}
    });
    expect(typeof output._p_somePointer).toEqual('string');
    expect(output._p_somePointer).toEqual('Micro$oft');
    done();
  });

  it('changes existing pointer keys', (done) => {
    var input = {
      userPointer: {__type: 'Pointer', className: '_User', objectId: 'qwerty'}
    };
    var output = transform.parseObjectToMongoObjectForCreate(null, input, {
      fields: {userPointer: {type: 'Pointer'}}
    });
    expect(typeof output._p_userPointer).toEqual('string');
    expect(output._p_userPointer).toEqual('_User$qwerty');
    done();
  });

  it('writes the old ACL format in addition to rperm and wperm on create', (done) => {
    var input = {
      _rperm: ['*'],
      _wperm: ['Kevin'],
    };

    var output = transform.parseObjectToMongoObjectForCreate(null, input, { fields: {} });
    expect(typeof output._acl).toEqual('object');
    expect(output._acl['Kevin'].w).toBeTruthy();
    expect(output._acl['Kevin'].r).toBeUndefined();
    expect(output._rperm).toEqual(input._rperm);
    expect(output._wperm).toEqual(input._wperm);
    done();
  });

  it('removes Relation types', (done) => {
    var input = {
      aRelation: { __type: 'Relation', className: 'Stuff' },
    };
    var output = transform.parseObjectToMongoObjectForCreate(null, input, {
      fields: {
        aRelation: { __type: 'Relation', className: 'Stuff' },
      },
    });
    expect(output).toEqual({});
    done();
  });

  it('writes the old ACL format in addition to rperm and wperm on update', (done) => {
    var input = {
      _rperm: ['*'],
      _wperm: ['Kevin']
    };

    var output = transform.transformUpdate(null, input, { fields: {} });
    var set = output.$set;
    expect(typeof set).toEqual('object');
    expect(typeof set._acl).toEqual('object');
    expect(set._acl['Kevin'].w).toBeTruthy();
    expect(set._acl['Kevin'].r).toBeUndefined();
    expect(set._rperm).toEqual(input._rperm);
    expect(set._wperm).toEqual(input._wperm);
    done();
  });

  it('untransforms from _rperm and _wperm to ACL', (done) => {
    var input = {
      _rperm: ["*"],
      _wperm: ["Kevin"]
    };
    var output = transform.mongoObjectToParseObject(null, input, { fields: {} });
    expect(output._rperm).toEqual(['*']);
    expect(output._wperm).toEqual(['Kevin']);
    expect(output.ACL).toBeUndefined()
    done();
  });

  it('untransforms mongodb number types', (done) => {
    var input = {
      long: mongodb.Long.fromNumber(Number.MAX_SAFE_INTEGER),
      double: new mongodb.Double(Number.MAX_VALUE)
    }
    var output = transform.mongoObjectToParseObject(null, input, {
      fields: {
        long: { type: 'Number' },
        double: { type: 'Number' },
      },
    });
    expect(output.long).toBe(Number.MAX_SAFE_INTEGER);
    expect(output.double).toBe(Number.MAX_VALUE);
    done();
  });

  it('Date object where iso attribute is of type Date', (done) => {
    var input = {
      ts : { __type: 'Date', iso: new Date('2017-01-18T00:00:00.000Z') }
    }
    var output = transform.mongoObjectToParseObject(null, input, {
      fields : {
        ts : { type : 'Date' }
      }
    });
    expect(output.ts.iso).toEqual('2017-01-18T00:00:00.000Z');
    done();
  });

  it('Date object where iso attribute is of type String', (done) => {
    var input = {
      ts : { __type: 'Date', iso: '2017-01-18T00:00:00.000Z' }
    }
    var output = transform.mongoObjectToParseObject(null, input, {
      fields : {
        ts : { type : 'Date' }
      }
    });
    expect(output.ts.iso).toEqual('2017-01-18T00:00:00.000Z');
    done();
  });
});

describe('transformUpdate', () => {
  it('removes Relation types', (done) => {
    var input = {
      aRelation: { __type: 'Relation', className: 'Stuff' },
    };
    var output = transform.transformUpdate(null, input, {
      fields: {
        aRelation: { __type: 'Relation', className: 'Stuff' },
      },
    });
    expect(output).toEqual({});
    done();
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
            }
          }
        });
      }).toThrow();

      expect(() => {
        transform.transformConstraint({
          $ne: {
            ttl: {
              $relativeTime: '12 days ago',
            }
          }
        });
      }).toThrow();

      expect(() => {
        transform.transformConstraint({
          $exists: {
            $relativeTime: '12 days ago',
          }
        });
      }).toThrow();
    });
  })
});

describe('relativeTimeToDate', () => {
  const now = new Date('2017-09-26T13:28:16.617Z');

  describe('In the future', () => {
    it('should parse valid natural time', () => {
      const text = 'in 1 year 2 weeks 12 days 10 hours 24 minutes 30 seconds';
      const { result, status, info } = transform.relativeTimeToDate(text, now);
      expect(result.toISOString()).toBe('2018-10-22T23:52:46.617Z');
      expect(status).toBe('success');
      expect(info).toBe('future');
    });
  });

  describe('In the past', () => {
    it('should parse valid natural time', () => {
      const text = '2 days 12 hours 1 minute 12 seconds ago';
      const { result, status, info } = transform.relativeTimeToDate(text, now);
      expect(result.toISOString()).toBe('2017-09-24T01:27:04.617Z');
      expect(status).toBe('success');
      expect(info).toBe('past');
    });
  });

  describe('From now', () => {
    it('should equal current time', () => {
      const text = 'now';
      const { result, status, info } = transform.relativeTimeToDate(text, now);
      expect(result.toISOString()).toBe('2017-09-26T13:28:16.617Z');
      expect(status).toBe('success');
      expect(info).toBe('present');
    });
  });

  describe('Error cases', () => {
    it('should error if string is completely gibberish', () => {
      expect(transform.relativeTimeToDate('gibberishasdnklasdnjklasndkl123j123')).toEqual({
        status: 'error',
        info: "Time should either start with 'in' or end with 'ago'",
      });
    });

    it('should error if string contains neither `ago` nor `in`', () => {
      expect(transform.relativeTimeToDate('12 hours 1 minute')).toEqual({
        status: 'error',
        info: "Time should either start with 'in' or end with 'ago'",
      });
    });

    it('should error if there are missing units or numbers', () => {
      expect(transform.relativeTimeToDate('in 12 hours 1')).toEqual({
        status: 'error',
        info: 'Invalid time string. Dangling unit or number.',
      });

      expect(transform.relativeTimeToDate('12 hours minute ago')).toEqual({
        status: 'error',
        info: 'Invalid time string. Dangling unit or number.',
      });
    });

    it('should error on floating point numbers', () => {
      expect(transform.relativeTimeToDate('in 12.3 hours')).toEqual({
        status: 'error',
        info: "'12.3' is not an integer.",
      });
    });

    it('should error if numbers are invalid', () => {
      expect(transform.relativeTimeToDate('12 hours 123a minute ago')).toEqual({
        status: 'error',
        info: "'123a' is not an integer.",
      });
    });

    it('should error on invalid interval units', () => {
      expect(transform.relativeTimeToDate('4 score 7 years ago')).toEqual({
        status: 'error',
        info: "Invalid interval: 'score'",
      });
    });

    it("should error when string contains 'ago' and 'in'", () => {
      expect(transform.relativeTimeToDate('in 1 day 2 minutes ago')).toEqual({
        status: 'error',
        info: "Time cannot have both 'in' and 'ago'",
      });
    });
  });
});

