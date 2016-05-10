// These tests are unit tests designed to only test transform.js.
"use strict";

let transform = require('../src/Adapters/Storage/Mongo/MongoTransform');
let dd = require('deep-diff');
let mongodb = require('mongodb');

var dummySchema = {
    data: {},
    getExpectedType: function(className, key) {
      if (key == 'userPointer') {
        return { type: 'Pointer', targetClass: '_User' };
      } else if (key == 'picture') {
        return { type: 'File' };
      } else if (key == 'location') {
        return { type: 'GeoPoint' };
      }
      return;
    },
    getRelationFields: function() {
      return {}
    }
};


describe('parseObjectToMongoObjectForCreate', () => {

  it('a basic number', (done) => {
    var input = {five: 5};
    var output = transform.parseObjectToMongoObjectForCreate(dummySchema, null, input, {
      fields: {five: {type: 'Number'}}
    });
    jequal(input, output);
    done();
  });

  it('built-in timestamps', (done) => {
    var input = {
      createdAt: "2015-10-06T21:24:50.332Z",
      updatedAt: "2015-10-06T21:24:50.332Z"
    };
    var output = transform.parseObjectToMongoObjectForCreate(dummySchema, null, input);
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
    var out = transform.parseObjectToMongoObjectForCreate(dummySchema, null, {pointers: [pointer]},{
      fields: {pointers: {type: 'Array'}}
    });
    jequal([pointer], out.pointers);
    done();
  });

  //TODO: object creation requests shouldn't be seeing __op delete, it makes no sense to
  //have __op delete in a new object. Figure out what this should actually be testing.
  notWorking('a delete op', (done) => {
    var input = {deleteMe: {__op: 'Delete'}};
    var output = transform.parseObjectToMongoObjectForCreate(dummySchema, null, input);
    jequal(output, {});
    done();
  });

  it('basic ACL', (done) => {
    var input = {ACL: {'0123': {'read': true, 'write': true}}};
    var output = transform.parseObjectToMongoObjectForCreate(dummySchema, null, input);
    // This just checks that it doesn't crash, but it should check format.
    done();
  });

  describe('GeoPoints', () => {
    it('plain', (done) => {
      var geoPoint = {__type: 'GeoPoint', longitude: 180, latitude: -180};
      var out = transform.parseObjectToMongoObjectForCreate(dummySchema, null, {location: geoPoint},{
        fields: {location: {type: 'GeoPoint'}}
      });
      expect(out.location).toEqual([180, -180]);
      done();
    });

    it('in array', (done) => {
      var geoPoint = {__type: 'GeoPoint', longitude: 180, latitude: -180};
      var out = transform.parseObjectToMongoObjectForCreate(dummySchema, null, {locations: [geoPoint, geoPoint]},{
        fields: {locations: {type: 'Array'}}
      });
      expect(out.locations).toEqual([geoPoint, geoPoint]);
      done();
    });

    it('in sub-object', (done) => {
      var geoPoint = {__type: 'GeoPoint', longitude: 180, latitude: -180};
      var out = transform.parseObjectToMongoObjectForCreate(dummySchema, null, { locations: { start: geoPoint }},{
        fields: {locations: {type: 'Object'}}
      });
      expect(out).toEqual({ locations: { start: geoPoint } });
      done();
    });
  });
});

describe('transformWhere', () => {
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
});

describe('untransformObject', () => {
  it('built-in timestamps', (done) => {
    var input = {createdAt: new Date(), updatedAt: new Date()};
    var output = transform.untransformObject(dummySchema, null, input);
    expect(typeof output.createdAt).toEqual('string');
    expect(typeof output.updatedAt).toEqual('string');
    done();
  });

  it('pointer', (done) => {
    var input = {_p_userPointer: '_User$123'};
    var output = transform.untransformObject(dummySchema, null, input);
    expect(typeof output.userPointer).toEqual('object');
    expect(output.userPointer).toEqual(
      {__type: 'Pointer', className: '_User', objectId: '123'}
    );
    done();
  });

  it('null pointer', (done) => {
    var input = {_p_userPointer: null};
    var output = transform.untransformObject(dummySchema, null, input);
    expect(output.userPointer).toBeUndefined();
    done();
  });

  it('file', (done) => {
    var input = {picture: 'pic.jpg'};
    var output = transform.untransformObject(dummySchema, null, input);
    expect(typeof output.picture).toEqual('object');
    expect(output.picture).toEqual({__type: 'File', name: 'pic.jpg'});
    done();
  });

  it('geopoint', (done) => {
    var input = {location: [180, -180]};
    var output = transform.untransformObject(dummySchema, null, input);
    expect(typeof output.location).toEqual('object');
    expect(output.location).toEqual(
      {__type: 'GeoPoint', longitude: 180, latitude: -180}
    );
    done();
  });

  it('nested array', (done) => {
    var input = {arr: [{_testKey: 'testValue' }]};
    var output = transform.untransformObject(dummySchema, null, input);
    expect(Array.isArray(output.arr)).toEqual(true);
    expect(output.arr).toEqual([{ _testKey: 'testValue'}]);
    done();
  });

  it('untransforms objects containing nested special keys', done => {
    let input = {array: [{
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
    let output = transform.untransformObject(dummySchema, null, input);
    expect(dd(output, input)).toEqual(undefined);
    done();
  });
});

describe('transformKeyValue', () => {
  it('throws out _password', done => {
    expect(() => transform.transformKeyValue(dummySchema, '_User', '_password', null, {validate: true})).toThrow();
    done();
  });
});

describe('transform schema key changes', () => {

  it('changes new pointer key', (done) => {
    var input = {
      somePointer: {__type: 'Pointer', className: 'Micro', objectId: 'oft'}
    };
    var output = transform.parseObjectToMongoObjectForCreate(dummySchema, null, input, {
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
    var output = transform.parseObjectToMongoObjectForCreate(dummySchema, null, input, {
      fields: {userPointer: {type: 'Pointer'}}
    });
    expect(typeof output._p_userPointer).toEqual('string');
    expect(output._p_userPointer).toEqual('_User$qwerty');
    done();
  });

  it('changes ACL storage to _rperm and _wperm', (done) => {
    var input = {
      ACL: {
        "*": { "read": true },
        "Kevin": { "write": true }
      }
    };
    var output = transform.parseObjectToMongoObjectForCreate(dummySchema, null, input);
    expect(typeof output._rperm).toEqual('object');
    expect(typeof output._wperm).toEqual('object');
    expect(output.ACL).toBeUndefined();
    expect(output._rperm[0]).toEqual('*');
    expect(output._wperm[0]).toEqual('Kevin');
    done();
  });

  it('untransforms from _rperm and _wperm to ACL', (done) => {
    var input = {
      _rperm: ["*"],
      _wperm: ["Kevin"]
    };
    var output = transform.untransformObject(dummySchema, null, input);
    expect(typeof output.ACL).toEqual('object');
    expect(output._rperm).toBeUndefined();
    expect(output._wperm).toBeUndefined();
    expect(output.ACL['*']['read']).toEqual(true);
    expect(output.ACL['Kevin']['write']).toEqual(true);
    done();
  });

  it('untransforms mongodb number types', (done) => {
    var input = {
      long: mongodb.Long.fromNumber(Number.MAX_SAFE_INTEGER),
      double: new mongodb.Double(Number.MAX_VALUE)
    }
    var output = transform.untransformObject(dummySchema, null, input);
    expect(output.long).toBe(Number.MAX_SAFE_INTEGER);
    expect(output.double).toBe(Number.MAX_VALUE);
    done();
  });

});
