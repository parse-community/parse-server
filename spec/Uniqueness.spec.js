'use strict';

var DatabaseAdapter = require('../src/DatabaseAdapter');
var request = require('request');
const Parse = require("parse/node");
let Config = require('../src/Config');

describe('Uniqueness', function() {
  it('fail when create duplicate value in unique field', done => {
    let obj = new Parse.Object('UniqueField');
    obj.set('unique', 'value');
    obj.save().then(() => {
      expect(obj.id).not.toBeUndefined();
      let config = new Config('test');
      return config.database.adapter.ensureUniqueness('UniqueField', ['unique'], { fields: { unique: { __type: 'String' } } })
    })
    .then(() => {
      let obj = new Parse.Object('UniqueField');
      obj.set('unique', 'value');
      return obj.save()
    }).then(() => {
      fail('Saving duplicate field should have failed');
      done();
    }, error => {
      expect(error.code).toEqual(Parse.Error.DUPLICATE_VALUE);
      done();
    });
  });

  it('unique indexing works on pointer fields', done => {
    let obj = new Parse.Object('UniquePointer');
    obj.save({ string: 'who cares' })
    .then(() => obj.save({ ptr: obj }))
    .then(() => {
      let config = new Config('test');
      return config.database.adapter.ensureUniqueness('UniquePointer', ['ptr'], { fields: {
        string: { __type: 'String' },
        ptr: { __type: 'Pointer', targetClass: 'UniquePointer' }
      } });
    })
    .then(() => {
      let newObj = new Parse.Object('UniquePointer')
      newObj.set('ptr', obj)
      return newObj.save()
    })
    .then(() => {
      fail('save should have failed due to duplicate value');
      done();
    })
    .catch(error => {
      expect(error.code).toEqual(Parse.Error.DUPLICATE_VALUE);
      done();
    });
  });

  it('fails when attempting to ensure uniqueness of fields that are not currently unique', done => {
    let o1 = new Parse.Object('UniqueFail');
    o1.set('key', 'val');
    let o2 = new Parse.Object('UniqueFail');
    o2.set('key', 'val');
    Parse.Object.saveAll([o1, o2])
    .then(() => {
      let config = new Config('test');
      return config.database.adapter.ensureUniqueness('UniqueFail', ['key'], { fields: { key: { __type: 'String' } } });
    })
    .catch(error => {
      expect(error.code).toEqual(Parse.Error.DUPLICATE_VALUE);
      done();
    });
  });

  it('can do compound uniqueness', done => {
    let config = new Config('test');
    config.database.adapter.ensureUniqueness('CompoundUnique', ['k1', 'k2'], { fields: { k1: { __type: 'String' }, k2: { __type: 'String' } } })
    .then(() => {
      let o1 = new Parse.Object('CompoundUnique');
      o1.set('k1', 'v1');
      o1.set('k2', 'v2');
      return o1.save();
    })
    .then(() => {
      let o2 = new Parse.Object('CompoundUnique');
      o2.set('k1', 'v1');
      o2.set('k2', 'not a dupe');
      return o2.save();
    })
    .then(() => {
      let o3 = new Parse.Object('CompoundUnique');
      o3.set('k1', 'not a dupe');
      o3.set('k2', 'v2');
      return o3.save();
    })
    .then(() => {
      let o4 = new Parse.Object('CompoundUnique');
      o4.set('k1', 'v1');
      o4.set('k2', 'v2');
      return o4.save();
    })
    .catch(error => {
      expect(error.code).toEqual(Parse.Error.DUPLICATE_VALUE);
      done();
    });
  });
});
