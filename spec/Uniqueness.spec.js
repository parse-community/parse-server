'use strict';

const Parse = require('parse/node');
const Config = require('../lib/Config');

describe('Uniqueness', function () {
  it('fail when create duplicate value in unique field', done => {
    const obj = new Parse.Object('UniqueField');
    obj.set('unique', 'value');
    obj
      .save()
      .then(() => {
        expect(obj.id).not.toBeUndefined();
        const config = Config.get('test');
        return config.database.adapter.ensureUniqueness(
          'UniqueField',
          { fields: { unique: { __type: 'String' } } },
          ['unique']
        );
      })
      .then(() => {
        const obj = new Parse.Object('UniqueField');
        obj.set('unique', 'value');
        return obj.save();
      })
      .then(
        () => {
          fail('Saving duplicate field should have failed');
          done();
        },
        error => {
          expect(error.code).toEqual(Parse.Error.DUPLICATE_VALUE);
          done();
        }
      );
  });

  it('unique indexing works on pointer fields', done => {
    const obj = new Parse.Object('UniquePointer');
    obj
      .save({ string: 'who cares' })
      .then(() => obj.save({ ptr: obj }))
      .then(() => {
        const config = Config.get('test');
        return config.database.adapter.ensureUniqueness(
          'UniquePointer',
          {
            fields: {
              string: { __type: 'String' },
              ptr: { __type: 'Pointer', targetClass: 'UniquePointer' },
            },
          },
          ['ptr']
        );
      })
      .then(() => {
        const newObj = new Parse.Object('UniquePointer');
        newObj.set('ptr', obj);
        return newObj.save();
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
    const o1 = new Parse.Object('UniqueFail');
    o1.set('key', 'val');
    const o2 = new Parse.Object('UniqueFail');
    o2.set('key', 'val');
    Parse.Object.saveAll([o1, o2])
      .then(() => {
        const config = Config.get('test');
        return config.database.adapter.ensureUniqueness(
          'UniqueFail',
          { fields: { key: { __type: 'String' } } },
          ['key']
        );
      })
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.DUPLICATE_VALUE);
        done();
      });
  });

  it_exclude_dbs(['postgres'])('can do compound uniqueness', done => {
    const config = Config.get('test');
    config.database.adapter
      .ensureUniqueness(
        'CompoundUnique',
        { fields: { k1: { __type: 'String' }, k2: { __type: 'String' } } },
        ['k1', 'k2']
      )
      .then(() => {
        const o1 = new Parse.Object('CompoundUnique');
        o1.set('k1', 'v1');
        o1.set('k2', 'v2');
        return o1.save();
      })
      .then(() => {
        const o2 = new Parse.Object('CompoundUnique');
        o2.set('k1', 'v1');
        o2.set('k2', 'not a dupe');
        return o2.save();
      })
      .then(() => {
        const o3 = new Parse.Object('CompoundUnique');
        o3.set('k1', 'not a dupe');
        o3.set('k2', 'v2');
        return o3.save();
      })
      .then(() => {
        const o4 = new Parse.Object('CompoundUnique');
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
