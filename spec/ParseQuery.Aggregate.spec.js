'use strict';
const Parse = require('parse/node');
const request = require('../lib/request');
const Config = require('../lib/Config');

const masterKeyHeaders = {
  'X-Parse-Application-Id': 'test',
  'X-Parse-Rest-API-Key': 'test',
  'X-Parse-Master-Key': 'test',
  'Content-Type': 'application/json',
};

const masterKeyOptions = {
  headers: masterKeyHeaders,
  json: true,
};

const PointerObject = Parse.Object.extend({
  className: 'PointerObject',
});

const loadTestData = () => {
  const data1 = {
    score: 10,
    name: 'foo',
    sender: { group: 'A' },
    views: 900,
    size: ['S', 'M'],
  };
  const data2 = {
    score: 10,
    name: 'foo',
    sender: { group: 'A' },
    views: 800,
    size: ['M', 'L'],
  };
  const data3 = {
    score: 10,
    name: 'bar',
    sender: { group: 'B' },
    views: 700,
    size: ['S'],
  };
  const data4 = {
    score: 20,
    name: 'dpl',
    sender: { group: 'B' },
    views: 700,
    size: ['S'],
  };
  const obj1 = new TestObject(data1);
  const obj2 = new TestObject(data2);
  const obj3 = new TestObject(data3);
  const obj4 = new TestObject(data4);
  return Parse.Object.saveAll([obj1, obj2, obj3, obj4]);
};

const get = function (url, options) {
  options.qs = options.body;
  delete options.body;
  Object.keys(options.qs).forEach(key => {
    options.qs[key] = JSON.stringify(options.qs[key]);
  });
  return request(Object.assign({}, { url }, options))
    .then(response => response.data)
    .catch(response => {
      throw { error: response.data };
    });
};

describe('Parse.Query Aggregate testing', () => {
  beforeEach(done => {
    loadTestData().then(done, done);
  });

  it('should only query aggregate with master key', done => {
    Parse._request('GET', `aggregate/someClass`, {}).then(
      () => {},
      error => {
        expect(error.message).toEqual('unauthorized: master key is required');
        done();
      }
    );
  });

  it('invalid query invalid key', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        unknown: {},
      },
    });
    get(Parse.serverURL + '/aggregate/TestObject', options).catch(error => {
      expect(error.error.code).toEqual(Parse.Error.INVALID_QUERY);
      done();
    });
  });

  it('invalid query group _id', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        group: { _id: null },
      },
    });
    get(Parse.serverURL + '/aggregate/TestObject', options).catch(error => {
      expect(error.error.code).toEqual(Parse.Error.INVALID_QUERY);
      done();
    });
  });

  it('invalid query group objectId required', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        group: {},
      },
    });
    get(Parse.serverURL + '/aggregate/TestObject', options).catch(error => {
      expect(error.error.code).toEqual(Parse.Error.INVALID_QUERY);
      done();
    });
  });

  it('group by field', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        group: { objectId: '$name' },
      },
    });
    get(Parse.serverURL + '/aggregate/TestObject', options)
      .then(resp => {
        expect(resp.results.length).toBe(3);
        expect(Object.prototype.hasOwnProperty.call(resp.results[0], 'objectId')).toBe(true);
        expect(Object.prototype.hasOwnProperty.call(resp.results[1], 'objectId')).toBe(true);
        expect(Object.prototype.hasOwnProperty.call(resp.results[2], 'objectId')).toBe(true);
        expect(resp.results[0].objectId).not.toBe(undefined);
        expect(resp.results[1].objectId).not.toBe(undefined);
        expect(resp.results[2].objectId).not.toBe(undefined);
        done();
      })
      .catch(done.fail);
  });

  it('group by pipeline operator', async () => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        pipeline: {
          group: { objectId: '$name' },
        },
      },
    });
    const resp = await get(Parse.serverURL + '/aggregate/TestObject', options);
    expect(resp.results.length).toBe(3);
    expect(Object.prototype.hasOwnProperty.call(resp.results[0], 'objectId')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(resp.results[1], 'objectId')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(resp.results[2], 'objectId')).toBe(true);
    expect(resp.results[0].objectId).not.toBe(undefined);
    expect(resp.results[1].objectId).not.toBe(undefined);
    expect(resp.results[2].objectId).not.toBe(undefined);
  });

  it('group by empty object', done => {
    const obj = new TestObject();
    const pipeline = [
      {
        group: { objectId: {} },
      },
    ];
    obj
      .save()
      .then(() => {
        const query = new Parse.Query(TestObject);
        return query.aggregate(pipeline);
      })
      .then(results => {
        expect(results[0].objectId).toEqual(null);
        done();
      });
  });

  it('group by empty string', done => {
    const obj = new TestObject();
    const pipeline = [
      {
        group: { objectId: '' },
      },
    ];
    obj
      .save()
      .then(() => {
        const query = new Parse.Query(TestObject);
        return query.aggregate(pipeline);
      })
      .then(results => {
        expect(results[0].objectId).toEqual(null);
        done();
      });
  });

  it('group by empty array', done => {
    const obj = new TestObject();
    const pipeline = [
      {
        group: { objectId: [] },
      },
    ];
    obj
      .save()
      .then(() => {
        const query = new Parse.Query(TestObject);
        return query.aggregate(pipeline);
      })
      .then(results => {
        expect(results[0].objectId).toEqual(null);
        done();
      });
  });

  it('group by multiple columns ', done => {
    const obj1 = new TestObject();
    const obj2 = new TestObject();
    const obj3 = new TestObject();
    const pipeline = [
      {
        group: {
          objectId: {
            score: '$score',
            views: '$views',
          },
          count: { $sum: 1 },
        },
      },
    ];
    Parse.Object.saveAll([obj1, obj2, obj3])
      .then(() => {
        const query = new Parse.Query(TestObject);
        return query.aggregate(pipeline);
      })
      .then(results => {
        expect(results.length).toEqual(5);
        done();
      });
  });

  it('group by date object', done => {
    const obj1 = new TestObject();
    const obj2 = new TestObject();
    const obj3 = new TestObject();
    const pipeline = [
      {
        group: {
          objectId: {
            day: { $dayOfMonth: '$_updated_at' },
            month: { $month: '$_created_at' },
            year: { $year: '$_created_at' },
          },
          count: { $sum: 1 },
        },
      },
    ];
    Parse.Object.saveAll([obj1, obj2, obj3])
      .then(() => {
        const query = new Parse.Query(TestObject);
        return query.aggregate(pipeline);
      })
      .then(results => {
        const createdAt = new Date(obj1.createdAt);
        expect(results[0].objectId.day).toEqual(createdAt.getUTCDate());
        expect(results[0].objectId.month).toEqual(createdAt.getUTCMonth() + 1);
        expect(results[0].objectId.year).toEqual(createdAt.getUTCFullYear());
        done();
      });
  });

  it('group by date object transform', done => {
    const obj1 = new TestObject();
    const obj2 = new TestObject();
    const obj3 = new TestObject();
    const pipeline = [
      {
        group: {
          objectId: {
            day: { $dayOfMonth: '$updatedAt' },
            month: { $month: '$createdAt' },
            year: { $year: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
    ];
    Parse.Object.saveAll([obj1, obj2, obj3])
      .then(() => {
        const query = new Parse.Query(TestObject);
        return query.aggregate(pipeline);
      })
      .then(results => {
        const createdAt = new Date(obj1.createdAt);
        expect(results[0].objectId.day).toEqual(createdAt.getUTCDate());
        expect(results[0].objectId.month).toEqual(createdAt.getUTCMonth() + 1);
        expect(results[0].objectId.year).toEqual(createdAt.getUTCFullYear());
        done();
      });
  });

  it('group by number', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        group: { objectId: '$score' },
      },
    });
    get(Parse.serverURL + '/aggregate/TestObject', options)
      .then(resp => {
        expect(resp.results.length).toBe(2);
        expect(Object.prototype.hasOwnProperty.call(resp.results[0], 'objectId')).toBe(true);
        expect(Object.prototype.hasOwnProperty.call(resp.results[1], 'objectId')).toBe(true);
        expect(resp.results.sort((a, b) => (a.objectId > b.objectId ? 1 : -1))).toEqual([
          { objectId: 10 },
          { objectId: 20 },
        ]);
        done();
      })
      .catch(done.fail);
  });

  it_exclude_dbs(['postgres'])('group and multiply transform', done => {
    const obj1 = new TestObject({ name: 'item a', quantity: 2, price: 10 });
    const obj2 = new TestObject({ name: 'item b', quantity: 5, price: 5 });
    const pipeline = [
      {
        group: {
          objectId: null,
          total: { $sum: { $multiply: ['$quantity', '$price'] } },
        },
      },
    ];
    Parse.Object.saveAll([obj1, obj2])
      .then(() => {
        const query = new Parse.Query(TestObject);
        return query.aggregate(pipeline);
      })
      .then(results => {
        expect(results.length).toEqual(1);
        expect(results[0].total).toEqual(45);
        done();
      });
  });

  it_exclude_dbs(['postgres'])('project and multiply transform', done => {
    const obj1 = new TestObject({ name: 'item a', quantity: 2, price: 10 });
    const obj2 = new TestObject({ name: 'item b', quantity: 5, price: 5 });
    const pipeline = [
      {
        match: { quantity: { $exists: true } },
      },
      {
        project: {
          name: 1,
          total: { $multiply: ['$quantity', '$price'] },
        },
      },
    ];
    Parse.Object.saveAll([obj1, obj2])
      .then(() => {
        const query = new Parse.Query(TestObject);
        return query.aggregate(pipeline);
      })
      .then(results => {
        expect(results.length).toEqual(2);
        if (results[0].name === 'item a') {
          expect(results[0].total).toEqual(20);
          expect(results[1].total).toEqual(25);
        } else {
          expect(results[0].total).toEqual(25);
          expect(results[1].total).toEqual(20);
        }
        done();
      });
  });

  it_exclude_dbs(['postgres'])('project without objectId transform', done => {
    const obj1 = new TestObject({ name: 'item a', quantity: 2, price: 10 });
    const obj2 = new TestObject({ name: 'item b', quantity: 5, price: 5 });
    const pipeline = [
      {
        match: { quantity: { $exists: true } },
      },
      {
        project: {
          objectId: 0,
          total: { $multiply: ['$quantity', '$price'] },
        },
      },
      {
        sort: { total: 1 },
      },
    ];
    Parse.Object.saveAll([obj1, obj2])
      .then(() => {
        const query = new Parse.Query(TestObject);
        return query.aggregate(pipeline);
      })
      .then(results => {
        expect(results.length).toEqual(2);
        expect(results[0].total).toEqual(20);
        expect(results[0].objectId).toEqual(undefined);
        expect(results[1].total).toEqual(25);
        expect(results[1].objectId).toEqual(undefined);
        done();
      });
  });

  it_exclude_dbs(['postgres'])('project updatedAt only transform', done => {
    const pipeline = [
      {
        project: { objectId: 0, updatedAt: 1 },
      },
    ];
    const query = new Parse.Query(TestObject);
    query.aggregate(pipeline).then(results => {
      expect(results.length).toEqual(4);
      for (let i = 0; i < results.length; i++) {
        const item = results[i];
        expect(Object.prototype.hasOwnProperty.call(item, 'updatedAt')).toEqual(true);
        expect(Object.prototype.hasOwnProperty.call(item, 'objectId')).toEqual(false);
      }
      done();
    });
  });

  it_exclude_dbs(['postgres'])(
    'can group by any date field (it does not work if you have dirty data)', // rows in your collection with non date data in the field that is supposed to be a date
    done => {
      const obj1 = new TestObject({ dateField2019: new Date(1990, 11, 1) });
      const obj2 = new TestObject({ dateField2019: new Date(1990, 5, 1) });
      const obj3 = new TestObject({ dateField2019: new Date(1990, 11, 1) });
      const pipeline = [
        {
          match: {
            dateField2019: { $exists: true },
          },
        },
        {
          group: {
            objectId: {
              day: { $dayOfMonth: '$dateField2019' },
              month: { $month: '$dateField2019' },
              year: { $year: '$dateField2019' },
            },
            count: { $sum: 1 },
          },
        },
      ];
      Parse.Object.saveAll([obj1, obj2, obj3])
        .then(() => {
          const query = new Parse.Query(TestObject);
          return query.aggregate(pipeline);
        })
        .then(results => {
          const counts = results.map(result => result.count);
          expect(counts.length).toBe(2);
          expect(counts.sort()).toEqual([1, 2]);
          done();
        })
        .catch(done.fail);
    }
  );

  it_only_db('postgres')(
    'can group by any date field (it does not work if you have dirty data)', // rows in your collection with non date data in the field that is supposed to be a date
    done => {
      const obj1 = new TestObject({ dateField2019: new Date(1990, 11, 1) });
      const obj2 = new TestObject({ dateField2019: new Date(1990, 5, 1) });
      const obj3 = new TestObject({ dateField2019: new Date(1990, 11, 1) });
      const pipeline = [
        {
          group: {
            objectId: {
              day: { $dayOfMonth: '$dateField2019' },
              month: { $month: '$dateField2019' },
              year: { $year: '$dateField2019' },
            },
            count: { $sum: 1 },
          },
        },
      ];
      Parse.Object.saveAll([obj1, obj2, obj3])
        .then(() => {
          const query = new Parse.Query(TestObject);
          return query.aggregate(pipeline);
        })
        .then(results => {
          const counts = results.map(result => result.count);
          expect(counts.length).toBe(3);
          expect(counts.sort()).toEqual([1, 2, 4]);
          done();
        })
        .catch(done.fail);
    }
  );

  it('group by pointer', done => {
    const pointer1 = new TestObject();
    const pointer2 = new TestObject();
    const obj1 = new TestObject({ pointer: pointer1 });
    const obj2 = new TestObject({ pointer: pointer2 });
    const obj3 = new TestObject({ pointer: pointer1 });
    const pipeline = [{ group: { objectId: '$pointer' } }];
    Parse.Object.saveAll([pointer1, pointer2, obj1, obj2, obj3])
      .then(() => {
        const query = new Parse.Query(TestObject);
        return query.aggregate(pipeline);
      })
      .then(results => {
        expect(results.length).toEqual(3);
        expect(results.some(result => result.objectId === pointer1.id)).toEqual(true);
        expect(results.some(result => result.objectId === pointer2.id)).toEqual(true);
        expect(results.some(result => result.objectId === null)).toEqual(true);
        done();
      });
  });

  it('group sum query', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        group: { objectId: null, total: { $sum: '$score' } },
      },
    });
    get(Parse.serverURL + '/aggregate/TestObject', options)
      .then(resp => {
        expect(Object.prototype.hasOwnProperty.call(resp.results[0], 'objectId')).toBe(true);
        expect(resp.results[0].objectId).toBe(null);
        expect(resp.results[0].total).toBe(50);
        done();
      })
      .catch(done.fail);
  });

  it('group count query', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        group: { objectId: null, total: { $sum: 1 } },
      },
    });
    get(Parse.serverURL + '/aggregate/TestObject', options)
      .then(resp => {
        expect(Object.prototype.hasOwnProperty.call(resp.results[0], 'objectId')).toBe(true);
        expect(resp.results[0].objectId).toBe(null);
        expect(resp.results[0].total).toBe(4);
        done();
      })
      .catch(done.fail);
  });

  it('group min query', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        group: { objectId: null, minScore: { $min: '$score' } },
      },
    });
    get(Parse.serverURL + '/aggregate/TestObject', options)
      .then(resp => {
        expect(Object.prototype.hasOwnProperty.call(resp.results[0], 'objectId')).toBe(true);
        expect(resp.results[0].objectId).toBe(null);
        expect(resp.results[0].minScore).toBe(10);
        done();
      })
      .catch(done.fail);
  });

  it('group max query', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        group: { objectId: null, maxScore: { $max: '$score' } },
      },
    });
    get(Parse.serverURL + '/aggregate/TestObject', options)
      .then(resp => {
        expect(Object.prototype.hasOwnProperty.call(resp.results[0], 'objectId')).toBe(true);
        expect(resp.results[0].objectId).toBe(null);
        expect(resp.results[0].maxScore).toBe(20);
        done();
      })
      .catch(done.fail);
  });

  it('group avg query', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        group: { objectId: null, avgScore: { $avg: '$score' } },
      },
    });
    get(Parse.serverURL + '/aggregate/TestObject', options)
      .then(resp => {
        expect(Object.prototype.hasOwnProperty.call(resp.results[0], 'objectId')).toBe(true);
        expect(resp.results[0].objectId).toBe(null);
        expect(resp.results[0].avgScore).toBe(12.5);
        done();
      })
      .catch(done.fail);
  });

  it('limit query', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        limit: 2,
      },
    });
    get(Parse.serverURL + '/aggregate/TestObject', options)
      .then(resp => {
        expect(resp.results.length).toBe(2);
        done();
      })
      .catch(done.fail);
  });

  it('sort ascending query', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        sort: { name: 1 },
      },
    });
    get(Parse.serverURL + '/aggregate/TestObject', options)
      .then(resp => {
        expect(resp.results.length).toBe(4);
        expect(resp.results[0].name).toBe('bar');
        expect(resp.results[1].name).toBe('dpl');
        expect(resp.results[2].name).toBe('foo');
        expect(resp.results[3].name).toBe('foo');
        done();
      })
      .catch(done.fail);
  });

  it('sort decending query', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        sort: { name: -1 },
      },
    });
    get(Parse.serverURL + '/aggregate/TestObject', options)
      .then(resp => {
        expect(resp.results.length).toBe(4);
        expect(resp.results[0].name).toBe('foo');
        expect(resp.results[1].name).toBe('foo');
        expect(resp.results[2].name).toBe('dpl');
        expect(resp.results[3].name).toBe('bar');
        done();
      })
      .catch(done.fail);
  });

  it('skip query', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        skip: 2,
      },
    });
    get(Parse.serverURL + '/aggregate/TestObject', options)
      .then(resp => {
        expect(resp.results.length).toBe(2);
        done();
      })
      .catch(done.fail);
  });

  it('match comparison date query', done => {
    const today = new Date();
    const yesterday = new Date();
    const tomorrow = new Date();
    yesterday.setDate(today.getDate() - 1);
    tomorrow.setDate(today.getDate() + 1);
    const obj1 = new TestObject({ dateField: yesterday });
    const obj2 = new TestObject({ dateField: today });
    const obj3 = new TestObject({ dateField: tomorrow });
    const pipeline = [{ match: { dateField: { $lt: tomorrow } } }];
    Parse.Object.saveAll([obj1, obj2, obj3])
      .then(() => {
        const query = new Parse.Query(TestObject);
        return query.aggregate(pipeline);
      })
      .then(results => {
        expect(results.length).toBe(2);
        done();
      });
  });

  it('match comparison query', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        match: { score: { $gt: 15 } },
      },
    });
    get(Parse.serverURL + '/aggregate/TestObject', options)
      .then(resp => {
        expect(resp.results.length).toBe(1);
        expect(resp.results[0].score).toBe(20);
        done();
      })
      .catch(done.fail);
  });

  it('match multiple comparison query', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        match: { score: { $gt: 5, $lt: 15 } },
      },
    });
    get(Parse.serverURL + '/aggregate/TestObject', options)
      .then(resp => {
        expect(resp.results.length).toBe(3);
        expect(resp.results[0].score).toBe(10);
        expect(resp.results[1].score).toBe(10);
        expect(resp.results[2].score).toBe(10);
        done();
      })
      .catch(done.fail);
  });

  it('match complex comparison query', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        match: { score: { $gt: 5, $lt: 15 }, views: { $gt: 850, $lt: 1000 } },
      },
    });
    get(Parse.serverURL + '/aggregate/TestObject', options)
      .then(resp => {
        expect(resp.results.length).toBe(1);
        expect(resp.results[0].score).toBe(10);
        expect(resp.results[0].views).toBe(900);
        done();
      })
      .catch(done.fail);
  });

  it('match comparison and equality query', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        match: { score: { $gt: 5, $lt: 15 }, views: 900 },
      },
    });
    get(Parse.serverURL + '/aggregate/TestObject', options)
      .then(resp => {
        expect(resp.results.length).toBe(1);
        expect(resp.results[0].score).toBe(10);
        expect(resp.results[0].views).toBe(900);
        done();
      })
      .catch(done.fail);
  });

  it('match $or query', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        match: {
          $or: [{ score: { $gt: 15, $lt: 25 } }, { views: { $gt: 750, $lt: 850 } }],
        },
      },
    });
    get(Parse.serverURL + '/aggregate/TestObject', options)
      .then(resp => {
        expect(resp.results.length).toBe(2);
        // Match score { $gt: 15, $lt: 25 }
        expect(resp.results.some(result => result.score === 20)).toEqual(true);
        expect(resp.results.some(result => result.views === 700)).toEqual(true);

        // Match view { $gt: 750, $lt: 850 }
        expect(resp.results.some(result => result.score === 10)).toEqual(true);
        expect(resp.results.some(result => result.views === 800)).toEqual(true);
        done();
      })
      .catch(done.fail);
  });

  it('match objectId query', done => {
    const obj1 = new TestObject();
    const obj2 = new TestObject();
    Parse.Object.saveAll([obj1, obj2])
      .then(() => {
        const pipeline = [{ match: { objectId: obj1.id } }];
        const query = new Parse.Query(TestObject);
        return query.aggregate(pipeline);
      })
      .then(results => {
        expect(results.length).toEqual(1);
        expect(results[0].objectId).toEqual(obj1.id);
        done();
      });
  });

  it('match field query', done => {
    const obj1 = new TestObject({ name: 'TestObject1' });
    const obj2 = new TestObject({ name: 'TestObject2' });
    Parse.Object.saveAll([obj1, obj2])
      .then(() => {
        const pipeline = [{ match: { name: 'TestObject1' } }];
        const query = new Parse.Query(TestObject);
        return query.aggregate(pipeline);
      })
      .then(results => {
        expect(results.length).toEqual(1);
        expect(results[0].objectId).toEqual(obj1.id);
        done();
      });
  });

  it('match pointer query', done => {
    const pointer1 = new PointerObject();
    const pointer2 = new PointerObject();
    const obj1 = new TestObject({ pointer: pointer1 });
    const obj2 = new TestObject({ pointer: pointer2 });
    const obj3 = new TestObject({ pointer: pointer1 });

    Parse.Object.saveAll([pointer1, pointer2, obj1, obj2, obj3])
      .then(() => {
        const pipeline = [{ match: { pointer: pointer1.id } }];
        const query = new Parse.Query(TestObject);
        return query.aggregate(pipeline);
      })
      .then(results => {
        expect(results.length).toEqual(2);
        expect(results[0].pointer.objectId).toEqual(pointer1.id);
        expect(results[1].pointer.objectId).toEqual(pointer1.id);
        expect(results.some(result => result.objectId === obj1.id)).toEqual(true);
        expect(results.some(result => result.objectId === obj3.id)).toEqual(true);
        done();
      });
  });

  it_exclude_dbs(['postgres'])('match exists query', done => {
    const pipeline = [{ match: { score: { $exists: true } } }];
    const query = new Parse.Query(TestObject);
    query.aggregate(pipeline).then(results => {
      expect(results.length).toEqual(4);
      done();
    });
  });

  it('match date query - createdAt', done => {
    const obj1 = new TestObject();
    const obj2 = new TestObject();

    Parse.Object.saveAll([obj1, obj2])
      .then(() => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const pipeline = [{ match: { createdAt: { $gte: today } } }];
        const query = new Parse.Query(TestObject);
        return query.aggregate(pipeline);
      })
      .then(results => {
        // Four objects were created initially, we added two more.
        expect(results.length).toEqual(6);
        done();
      });
  });

  it('match date query - updatedAt', done => {
    const obj1 = new TestObject();
    const obj2 = new TestObject();

    Parse.Object.saveAll([obj1, obj2])
      .then(() => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const pipeline = [{ match: { updatedAt: { $gte: today } } }];
        const query = new Parse.Query(TestObject);
        return query.aggregate(pipeline);
      })
      .then(results => {
        // Four objects were added initially, we added two more.
        expect(results.length).toEqual(6);
        done();
      });
  });

  it('match date query - empty', done => {
    const obj1 = new TestObject();
    const obj2 = new TestObject();

    Parse.Object.saveAll([obj1, obj2])
      .then(() => {
        const now = new Date();
        const future = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
        const pipeline = [{ match: { createdAt: future } }];
        const query = new Parse.Query(TestObject);
        return query.aggregate(pipeline);
      })
      .then(results => {
        expect(results.length).toEqual(0);
        done();
      });
  });

  it_exclude_dbs(['postgres'])('match pointer with operator query', done => {
    const pointer = new PointerObject();

    const obj1 = new TestObject({ pointer });
    const obj2 = new TestObject({ pointer });
    const obj3 = new TestObject();

    Parse.Object.saveAll([pointer, obj1, obj2, obj3])
      .then(() => {
        const pipeline = [{ match: { pointer: { $exists: true } } }];
        const query = new Parse.Query(TestObject);
        return query.aggregate(pipeline);
      })
      .then(results => {
        expect(results.length).toEqual(2);
        expect(results[0].pointer.objectId).toEqual(pointer.id);
        expect(results[1].pointer.objectId).toEqual(pointer.id);
        expect(results.some(result => result.objectId === obj1.id)).toEqual(true);
        expect(results.some(result => result.objectId === obj2.id)).toEqual(true);
        done();
      });
  });

  it_exclude_dbs(['postgres'])('match null values', async () => {
    const obj1 = new Parse.Object('MyCollection');
    obj1.set('language', 'en');
    obj1.set('otherField', 1);
    const obj2 = new Parse.Object('MyCollection');
    obj2.set('language', 'en');
    obj2.set('otherField', 2);
    const obj3 = new Parse.Object('MyCollection');
    obj3.set('language', null);
    obj3.set('otherField', 3);
    const obj4 = new Parse.Object('MyCollection');
    obj4.set('language', null);
    obj4.set('otherField', 4);
    const obj5 = new Parse.Object('MyCollection');
    obj5.set('language', 'pt');
    obj5.set('otherField', 5);
    const obj6 = new Parse.Object('MyCollection');
    obj6.set('language', 'pt');
    obj6.set('otherField', 6);
    await Parse.Object.saveAll([obj1, obj2, obj3, obj4, obj5, obj6]);

    expect(
      (
        await new Parse.Query('MyCollection').aggregate([
          {
            match: {
              language: { $in: [null, 'en'] },
            },
          },
        ])
      )
        .map(value => value.otherField)
        .sort()
    ).toEqual([1, 2, 3, 4]);

    expect(
      (
        await new Parse.Query('MyCollection').aggregate([
          {
            match: {
              $or: [{ language: 'en' }, { language: null }],
            },
          },
        ])
      )
        .map(value => value.otherField)
        .sort()
    ).toEqual([1, 2, 3, 4]);
  });

  it('project query', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        project: { name: 1 },
      },
    });
    get(Parse.serverURL + '/aggregate/TestObject', options)
      .then(resp => {
        resp.results.forEach(result => {
          expect(result.objectId).not.toBe(undefined);
          expect(result.name).not.toBe(undefined);
          expect(result.sender).toBe(undefined);
          expect(result.size).toBe(undefined);
          expect(result.score).toBe(undefined);
        });
        done();
      })
      .catch(done.fail);
  });

  it('multiple project query', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        project: { name: 1, score: 1, sender: 1 },
      },
    });
    get(Parse.serverURL + '/aggregate/TestObject', options)
      .then(resp => {
        resp.results.forEach(result => {
          expect(result.objectId).not.toBe(undefined);
          expect(result.name).not.toBe(undefined);
          expect(result.score).not.toBe(undefined);
          expect(result.sender).not.toBe(undefined);
          expect(result.size).toBe(undefined);
        });
        done();
      })
      .catch(done.fail);
  });

  it('project pointer query', done => {
    const pointer = new PointerObject();
    const obj = new TestObject({ pointer, name: 'hello' });

    obj
      .save()
      .then(() => {
        const pipeline = [
          { match: { objectId: obj.id } },
          { project: { pointer: 1, name: 1, createdAt: 1 } },
        ];
        const query = new Parse.Query(TestObject);
        return query.aggregate(pipeline);
      })
      .then(results => {
        expect(results.length).toEqual(1);
        expect(results[0].name).toEqual('hello');
        expect(results[0].createdAt).not.toBe(undefined);
        expect(results[0].pointer.objectId).toEqual(pointer.id);
        done();
      });
  });

  it('project with group query', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        project: { score: 1 },
        group: { objectId: '$score', score: { $sum: '$score' } },
      },
    });
    get(Parse.serverURL + '/aggregate/TestObject', options)
      .then(resp => {
        expect(resp.results.length).toBe(2);
        resp.results.forEach(result => {
          expect(Object.prototype.hasOwnProperty.call(result, 'objectId')).toBe(true);
          expect(result.name).toBe(undefined);
          expect(result.sender).toBe(undefined);
          expect(result.size).toBe(undefined);
          expect(result.score).not.toBe(undefined);
          if (result.objectId === 10) {
            expect(result.score).toBe(30);
          }
          if (result.objectId === 20) {
            expect(result.score).toBe(20);
          }
        });
        done();
      })
      .catch(done.fail);
  });

  it('class does not exist return empty', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        group: { objectId: null, total: { $sum: '$score' } },
      },
    });
    get(Parse.serverURL + '/aggregate/UnknownClass', options)
      .then(resp => {
        expect(resp.results.length).toBe(0);
        done();
      })
      .catch(done.fail);
  });

  it('field does not exist return empty', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        group: { objectId: null, total: { $sum: '$unknownfield' } },
      },
    });
    get(Parse.serverURL + '/aggregate/UnknownClass', options)
      .then(resp => {
        expect(resp.results.length).toBe(0);
        done();
      })
      .catch(done.fail);
  });

  it('distinct query', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: { distinct: 'score' },
    });
    get(Parse.serverURL + '/aggregate/TestObject', options)
      .then(resp => {
        expect(resp.results.length).toBe(2);
        expect(resp.results.includes(10)).toBe(true);
        expect(resp.results.includes(20)).toBe(true);
        done();
      })
      .catch(done.fail);
  });

  it('distinct query with where', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        distinct: 'score',
        where: {
          name: 'bar',
        },
      },
    });
    get(Parse.serverURL + '/aggregate/TestObject', options)
      .then(resp => {
        expect(resp.results[0]).toBe(10);
        done();
      })
      .catch(done.fail);
  });

  it('distinct query with where string', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        distinct: 'score',
        where: JSON.stringify({ name: 'bar' }),
      },
    });
    get(Parse.serverURL + '/aggregate/TestObject', options)
      .then(resp => {
        expect(resp.results[0]).toBe(10);
        done();
      })
      .catch(done.fail);
  });

  it('distinct nested', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: { distinct: 'sender.group' },
    });
    get(Parse.serverURL + '/aggregate/TestObject', options)
      .then(resp => {
        expect(resp.results.length).toBe(2);
        expect(resp.results.includes('A')).toBe(true);
        expect(resp.results.includes('B')).toBe(true);
        done();
      })
      .catch(done.fail);
  });

  it('distinct pointer', done => {
    const pointer1 = new PointerObject();
    const pointer2 = new PointerObject();
    const obj1 = new TestObject({ pointer: pointer1 });
    const obj2 = new TestObject({ pointer: pointer2 });
    const obj3 = new TestObject({ pointer: pointer1 });
    Parse.Object.saveAll([pointer1, pointer2, obj1, obj2, obj3])
      .then(() => {
        const query = new Parse.Query(TestObject);
        return query.distinct('pointer');
      })
      .then(results => {
        expect(results.length).toEqual(2);
        expect(results.some(result => result.objectId === pointer1.id)).toEqual(true);
        expect(results.some(result => result.objectId === pointer2.id)).toEqual(true);
        done();
      });
  });

  it('distinct class does not exist return empty', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: { distinct: 'unknown' },
    });
    get(Parse.serverURL + '/aggregate/UnknownClass', options)
      .then(resp => {
        expect(resp.results.length).toBe(0);
        done();
      })
      .catch(done.fail);
  });

  it('distinct field does not exist return empty', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: { distinct: 'unknown' },
    });
    const obj = new TestObject();
    obj
      .save()
      .then(() => {
        return get(Parse.serverURL + '/aggregate/TestObject', options);
      })
      .then(resp => {
        expect(resp.results.length).toBe(0);
        done();
      })
      .catch(done.fail);
  });

  it('distinct array', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: { distinct: 'size' },
    });
    get(Parse.serverURL + '/aggregate/TestObject', options)
      .then(resp => {
        expect(resp.results.length).toBe(3);
        expect(resp.results.includes('S')).toBe(true);
        expect(resp.results.includes('M')).toBe(true);
        expect(resp.results.includes('L')).toBe(true);
        done();
      })
      .catch(done.fail);
  });

  it('distinct objectId', async () => {
    const query = new Parse.Query(TestObject);
    const results = await query.distinct('objectId');
    expect(results.length).toBe(4);
  });

  it('distinct createdAt', async () => {
    const object1 = new TestObject({ createdAt_test: true });
    await object1.save();
    const object2 = new TestObject({ createdAt_test: true });
    await object2.save();
    const query = new Parse.Query(TestObject);
    query.equalTo('createdAt_test', true);
    const results = await query.distinct('createdAt');
    expect(results.length).toBe(2);
  });

  it('distinct updatedAt', async () => {
    const object1 = new TestObject({ updatedAt_test: true });
    await object1.save();
    const object2 = new TestObject();
    await object2.save();
    object2.set('updatedAt_test', true);
    await object2.save();
    const query = new Parse.Query(TestObject);
    query.equalTo('updatedAt_test', true);
    const results = await query.distinct('updatedAt');
    expect(results.length).toBe(2);
  });

  it('distinct null field', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: { distinct: 'distinctField' },
    });
    const user1 = new Parse.User();
    user1.setUsername('distinct_1');
    user1.setPassword('password');
    user1.set('distinctField', 'one');

    const user2 = new Parse.User();
    user2.setUsername('distinct_2');
    user2.setPassword('password');
    user2.set('distinctField', null);
    user1
      .signUp()
      .then(() => {
        return user2.signUp();
      })
      .then(() => {
        return get(Parse.serverURL + '/aggregate/_User', options);
      })
      .then(resp => {
        expect(resp.results.length).toEqual(1);
        expect(resp.results).toEqual(['one']);
        done();
      })
      .catch(done.fail);
  });

  it('does not return sensitive hidden properties', done => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        match: {
          score: {
            $gt: 5,
          },
        },
      },
    });

    const username = 'leaky_user';
    const score = 10;

    const user = new Parse.User();
    user.setUsername(username);
    user.setPassword('password');
    user.set('score', score);
    user
      .signUp()
      .then(function () {
        return get(Parse.serverURL + '/aggregate/_User', options);
      })
      .then(function (resp) {
        expect(resp.results.length).toBe(1);
        const result = resp.results[0];

        // verify server-side keys are not present...
        expect(result._hashed_password).toBe(undefined);
        expect(result._wperm).toBe(undefined);
        expect(result._rperm).toBe(undefined);
        expect(result._acl).toBe(undefined);
        expect(result._created_at).toBe(undefined);
        expect(result._updated_at).toBe(undefined);

        // verify createdAt, updatedAt and others are present
        expect(result.createdAt).not.toBe(undefined);
        expect(result.updatedAt).not.toBe(undefined);
        expect(result.objectId).not.toBe(undefined);
        expect(result.username).toBe(username);
        expect(result.score).toBe(score);

        done();
      })
      .catch(function (err) {
        fail(err);
      });
  });

  it_exclude_dbs(['postgres'])('aggregate allow multiple of same stage', done => {
    const pointer1 = new TestObject({ value: 1 });
    const pointer2 = new TestObject({ value: 2 });
    const pointer3 = new TestObject({ value: 3 });

    const obj1 = new TestObject({ pointer: pointer1, name: 'Hello' });
    const obj2 = new TestObject({ pointer: pointer2, name: 'Hello' });
    const obj3 = new TestObject({ pointer: pointer3, name: 'World' });

    const options = Object.assign({}, masterKeyOptions, {
      body: {
        pipeline: [
          {
            match: { name: 'Hello' },
          },
          {
            // Transform className$objectId to objectId and store in new field tempPointer
            project: {
              tempPointer: { $substr: ['$_p_pointer', 11, -1] }, // Remove TestObject$
            },
          },
          {
            // Left Join, replace objectId stored in tempPointer with an actual object
            lookup: {
              from: 'test_TestObject',
              localField: 'tempPointer',
              foreignField: '_id',
              as: 'tempPointer',
            },
          },
          {
            // lookup returns an array, Deconstructs an array field to objects
            unwind: {
              path: '$tempPointer',
            },
          },
          {
            match: { 'tempPointer.value': 2 },
          },
        ],
      },
    });
    Parse.Object.saveAll([pointer1, pointer2, pointer3, obj1, obj2, obj3])
      .then(() => {
        return get(Parse.serverURL + '/aggregate/TestObject', options);
      })
      .then(resp => {
        expect(resp.results.length).toEqual(1);
        expect(resp.results[0].tempPointer.value).toEqual(2);
        done();
      });
  });

  it_only_db('mongo')('aggregate geoNear with location query', async () => {
    // Create geo index which is required for `geoNear` query
    const database = Config.get(Parse.applicationId).database;
    const schema = await new Parse.Schema('GeoObject').save();
    await database.adapter.ensureIndex('GeoObject', schema, ['location'], undefined, false, {
      indexType: '2dsphere',
    });
    // Create objects
    const GeoObject = Parse.Object.extend('GeoObject');
    const obj1 = new GeoObject({
      value: 1,
      location: new Parse.GeoPoint(1, 1),
      date: new Date(1),
    });
    const obj2 = new GeoObject({
      value: 2,
      location: new Parse.GeoPoint(2, 1),
      date: new Date(2),
    });
    const obj3 = new GeoObject({
      value: 3,
      location: new Parse.GeoPoint(3, 1),
      date: new Date(3),
    });
    await Parse.Object.saveAll([obj1, obj2, obj3]);
    // Create query
    const pipeline = [
      {
        geoNear: {
          near: {
            type: 'Point',
            coordinates: [1, 1],
          },
          key: 'location',
          spherical: true,
          distanceField: 'dist',
          query: {
            date: {
              $gte: new Date(2),
            },
          },
        },
      },
    ];
    const query = new Parse.Query(GeoObject);
    const results = await query.aggregate(pipeline);
    // Check results
    expect(results.length).toEqual(2);
    expect(results[0].value).toEqual(2);
    expect(results[1].value).toEqual(3);
  });

  it_only_db('mongo')('aggregate geoNear with near GeoJSON point', async () => {
    // Create geo index which is required for `geoNear` query
    const database = Config.get(Parse.applicationId).database;
    const schema = await new Parse.Schema('GeoObject').save();
    await database.adapter.ensureIndex(
      'GeoObject',
      schema,
      ['location'],
      undefined,
      false,
      '2dsphere'
    );
    // Create objects
    const GeoObject = Parse.Object.extend('GeoObject');
    const obj1 = new GeoObject({
      value: 1,
      location: new Parse.GeoPoint(1, 1),
      date: new Date(1),
    });
    const obj2 = new GeoObject({
      value: 2,
      location: new Parse.GeoPoint(2, 1),
      date: new Date(2),
    });
    const obj3 = new GeoObject({
      value: 3,
      location: new Parse.GeoPoint(3, 1),
      date: new Date(3),
    });
    await Parse.Object.saveAll([obj1, obj2, obj3]);
    // Create query
    const pipeline = [
      {
        geoNear: {
          near: {
            type: 'Point',
            coordinates: [1, 1],
          },
          key: 'location',
          spherical: true,
          distanceField: 'dist',
        },
      },
    ];
    const query = new Parse.Query(GeoObject);
    const results = await query.aggregate(pipeline);
    // Check results
    expect(results.length).toEqual(3);
  });

  it_only_db('mongo')('aggregate geoNear with near legacy coordinate pair', async () => {
    // Create geo index which is required for `geoNear` query
    const database = Config.get(Parse.applicationId).database;
    const schema = await new Parse.Schema('GeoObject').save();
    await database.adapter.ensureIndex(
      'GeoObject',
      schema,
      ['location'],
      undefined,
      false,
      '2dsphere'
    );
    // Create objects
    const GeoObject = Parse.Object.extend('GeoObject');
    const obj1 = new GeoObject({
      value: 1,
      location: new Parse.GeoPoint(1, 1),
      date: new Date(1),
    });
    const obj2 = new GeoObject({
      value: 2,
      location: new Parse.GeoPoint(2, 1),
      date: new Date(2),
    });
    const obj3 = new GeoObject({
      value: 3,
      location: new Parse.GeoPoint(3, 1),
      date: new Date(3),
    });
    await Parse.Object.saveAll([obj1, obj2, obj3]);
    // Create query
    const pipeline = [
      {
        geoNear: {
          near: [1, 1],
          key: 'location',
          spherical: true,
          distanceField: 'dist',
        },
      },
    ];
    const query = new Parse.Query(GeoObject);
    const results = await query.aggregate(pipeline);
    // Check results
    expect(results.length).toEqual(3);
  });
});
