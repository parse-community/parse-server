// These tests are unit tests designed to only test transform.js.

var transform = require('../src/transform');

var dummySchema = {
    data: {},
    getExpectedType: function(className, key) {
      if (key == 'userPointer') {
        return '*_User';
      } else if (key == 'picture') {
        return 'file';
      } else if (key == 'location') {
        return 'geopoint';
      }
      return;
    }
};


describe('transformCreate', () => {

  it('a basic number', (done) => {
    var input = {five: 5};
    var output = transform.transformCreate(dummySchema, null, input);
    jequal(input, output);
    done();
  });

  it('built-in timestamps', (done) => {
    var input = {
      createdAt: "2015-10-06T21:24:50.332Z",
      updatedAt: "2015-10-06T21:24:50.332Z"
    };
    var output = transform.transformCreate(dummySchema, null, input);
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
    var out = transform.transformCreate(dummySchema, null, {pointers: [pointer]});
    jequal([pointer], out.pointers);
    done();
  });

  it('a delete op', (done) => {
    var input = {deleteMe: {__op: 'Delete'}};
    var output = transform.transformCreate(dummySchema, null, input);
    jequal(output, {});
    done();
  });

  it('basic ACL', (done) => {
    var input = {ACL: {'0123': {'read': true, 'write': true}}};
    var output = transform.transformCreate(dummySchema, null, input);
    // This just checks that it doesn't crash, but it should check format.
    done();
  });

  describe('GeoPoints', () => {
    it('plain', (done) => {
      var geoPoint = {__type: 'GeoPoint', longitude: 180, latitude: -180};
      var out = transform.transformCreate(dummySchema, null, {location: geoPoint});
      expect(out.location).toEqual([180, -180]);
      done();
    });

    it('in array', (done) => {
      var geoPoint = {__type: 'GeoPoint', longitude: 180, latitude: -180};
      var out = transform.transformCreate(dummySchema, null, {locations: [geoPoint, geoPoint]});
      expect(out.locations).toEqual([geoPoint, geoPoint]);
      done();
    });

    it('in sub-object', (done) => {
      var geoPoint = {__type: 'GeoPoint', longitude: 180, latitude: -180};
      var out = transform.transformCreate(dummySchema, null, { locations: { start: geoPoint }});
      expect(out).toEqual({ locations: { start: geoPoint } });
      done();
    });
  });
});

describe('transformWhere', () => {
  it('objectId', (done) => {
    var out = transform.transformWhere(dummySchema, null, {objectId: 'foo'});
    expect(out._id).toEqual('foo');
    done();
  });

  it('objectId in a list', (done) => {
    var input = {
      objectId: {'$in': ['one', 'two', 'three']},
    };
    var output = transform.transformWhere(dummySchema, null, input);
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

});

describe('transformKey', () => {
  it('throws out _password', (done) => {
    try {
      transform.transformKey(dummySchema, '_User', '_password');
      fail('should have thrown');
    } catch (e) {
      done();
    }
  });
});

describe('transform schema key changes', () => {

  it('changes new pointer key', (done) => {
    var input = {
      somePointer: {__type: 'Pointer', className: 'Micro', objectId: 'oft'}
    };
    var output = transform.transformCreate(dummySchema, null, input);
    expect(typeof output._p_somePointer).toEqual('string');
    expect(output._p_somePointer).toEqual('Micro$oft');
    done();
  });

  it('changes existing pointer keys', (done) => {
    var input = {
      userPointer: {__type: 'Pointer', className: '_User', objectId: 'qwerty'}
    };
    var output = transform.transformCreate(dummySchema, null, input);
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
    var output = transform.transformCreate(dummySchema, null, input);
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

});
