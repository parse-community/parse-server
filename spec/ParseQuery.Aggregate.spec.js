'use strict';
const Parse = require('parse/node');
const rp = require('request-promise');

const masterKeyHeaders = {
  'X-Parse-Application-Id': 'test',
  'X-Parse-Rest-API-Key': 'test',
  'X-Parse-Master-Key': 'test'
}

const masterKeyOptions = {
  headers: masterKeyHeaders,
  json: true
}

const loadTestData = () => {
  const data1 = {score: 10, name: 'foo', sender: {group: 'A'}, size: ['S', 'M']};
  const data2 = {score: 10, name: 'foo', sender: {group: 'A'}, size: ['M', 'L']};
  const data3 = {score: 10, name: 'bar', sender: {group: 'B'}, size: ['S']};
  const data4 = {score: 20, name: 'dpl', sender: {group: 'B'}, size: ['S']};
  const obj1 = new TestObject(data1);
  const obj2 = new TestObject(data2);
  const obj3 = new TestObject(data3);
  const obj4 = new TestObject(data4);
  return Parse.Object.saveAll([obj1, obj2, obj3, obj4]);
}

describe('Parse.Query Aggregate testing', () => {
  beforeEach((done) => {
    loadTestData().then(done, done);
  });

  it('should only query aggregate with master key', (done) => {
    Parse._request('GET', `aggregate/someClass`, {})
      .then(() => {}, (error) => {
        expect(error.message).toEqual('unauthorized: master key is required');
        done();
      });
  });

  it('invalid query invalid key', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        unknown: {},
      }
    });
    rp.get(Parse.serverURL + '/aggregate/TestObject', options)
      .catch((error) => {
        expect(error.error.code).toEqual(Parse.Error.INVALID_QUERY);
        done();
      });
  });

  it('invalid query group _id', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        group: { _id: null },
      }
    });
    rp.get(Parse.serverURL + '/aggregate/TestObject', options)
      .catch((error) => {
        expect(error.error.code).toEqual(Parse.Error.INVALID_QUERY);
        done();
      });
  });

  it('invalid query group objectId required', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        group: {},
      }
    });
    rp.get(Parse.serverURL + '/aggregate/TestObject', options)
      .catch((error) => {
        expect(error.error.code).toEqual(Parse.Error.INVALID_QUERY);
        done();
      });
  });

  it('group by field', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        group: { objectId: '$name' },
      }
    });
    rp.get(Parse.serverURL + '/aggregate/TestObject', options)
      .then((resp) => {
        expect(resp.results.length).toBe(3);
        expect(resp.results[0].hasOwnProperty('objectId')).toBe(true);
        expect(resp.results[1].hasOwnProperty('objectId')).toBe(true);
        expect(resp.results[2].hasOwnProperty('objectId')).toBe(true);
        expect(resp.results[0].objectId).not.toBe(undefined);
        expect(resp.results[1].objectId).not.toBe(undefined);
        expect(resp.results[2].objectId).not.toBe(undefined);
        done();
      }).catch(done.fail);
  });

  it('group by pointer', (done) => {
    const pointer1 = new TestObject();
    const pointer2 = new TestObject();
    const obj1 = new TestObject({ pointer: pointer1 });
    const obj2 = new TestObject({ pointer: pointer2 });
    const obj3 = new TestObject({ pointer: pointer1 });
    const pipeline = [
      { group: { objectId: '$pointer' } }
    ];
    Parse.Object.saveAll([pointer1, pointer2, obj1, obj2, obj3]).then(() => {
      const query = new Parse.Query(TestObject);
      return query.aggregate(pipeline);
    }).then((results) => {
      expect(results.length).toEqual(3);
      expect(results.some(result => result.objectId === pointer1.id)).toEqual(true);
      expect(results.some(result => result.objectId === pointer2.id)).toEqual(true);
      expect(results.some(result => result.objectId === null)).toEqual(true);
      done();
    });
  });

  it('group sum query', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        group: { objectId: null, total: { $sum: '$score' } },
      }
    });
    rp.get(Parse.serverURL + '/aggregate/TestObject', options)
      .then((resp) => {
        expect(resp.results[0].hasOwnProperty('objectId')).toBe(true);
        expect(resp.results[0].objectId).toBe(null);
        expect(resp.results[0].total).toBe(50);
        done();
      }).catch(done.fail);
  });

  it('group count query', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        group: { objectId: null, total: { $sum: 1 } },
      }
    });
    rp.get(Parse.serverURL + '/aggregate/TestObject', options)
      .then((resp) => {
        expect(resp.results[0].hasOwnProperty('objectId')).toBe(true);
        expect(resp.results[0].objectId).toBe(null);
        expect(resp.results[0].total).toBe(4);
        done();
      }).catch(done.fail);
  });

  it('group min query', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        group: { objectId: null, minScore: { $min: '$score' } },
      }
    });
    rp.get(Parse.serverURL + '/aggregate/TestObject', options)
      .then((resp) => {
        expect(resp.results[0].hasOwnProperty('objectId')).toBe(true);
        expect(resp.results[0].objectId).toBe(null);
        expect(resp.results[0].minScore).toBe(10);
        done();
      }).catch(done.fail);
  });

  it('group max query', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        group: { objectId: null, maxScore: { $max: '$score' } },
      }
    });
    rp.get(Parse.serverURL + '/aggregate/TestObject', options)
      .then((resp) => {
        expect(resp.results[0].hasOwnProperty('objectId')).toBe(true);
        expect(resp.results[0].objectId).toBe(null);
        expect(resp.results[0].maxScore).toBe(20);
        done();
      }).catch(done.fail);
  });

  it('group avg query', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        group: { objectId: null, avgScore: { $avg: '$score' } },
      }
    });
    rp.get(Parse.serverURL + '/aggregate/TestObject', options)
      .then((resp) => {
        expect(resp.results[0].hasOwnProperty('objectId')).toBe(true);
        expect(resp.results[0].objectId).toBe(null);
        expect(resp.results[0].avgScore).toBe(12.5);
        done();
      }).catch(done.fail);
  });

  it('limit query', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        limit: 2,
      }
    });
    rp.get(Parse.serverURL + '/aggregate/TestObject', options)
      .then((resp) => {
        expect(resp.results.length).toBe(2);
        done();
      }).catch(done.fail);
  });

  it('sort ascending query', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        sort: { name: 1 },
      }
    });
    rp.get(Parse.serverURL + '/aggregate/TestObject', options)
      .then((resp) => {
        expect(resp.results.length).toBe(4);
        expect(resp.results[0].name).toBe('bar');
        expect(resp.results[1].name).toBe('dpl');
        expect(resp.results[2].name).toBe('foo');
        expect(resp.results[3].name).toBe('foo');
        done();
      }).catch(done.fail);
  });

  it('sort decending query', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        sort: { name: -1 },
      }
    });
    rp.get(Parse.serverURL + '/aggregate/TestObject', options)
      .then((resp) => {
        expect(resp.results.length).toBe(4);
        expect(resp.results[0].name).toBe('foo');
        expect(resp.results[1].name).toBe('foo');
        expect(resp.results[2].name).toBe('dpl');
        expect(resp.results[3].name).toBe('bar');
        done();
      }).catch(done.fail);
  });

  it('skip query', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        skip: 2,
      }
    });
    rp.get(Parse.serverURL + '/aggregate/TestObject', options)
      .then((resp) => {
        expect(resp.results.length).toBe(2);
        done();
      }).catch(done.fail);
  });

  it('match query', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        match: { score: { $gt: 15 }},
      }
    });
    rp.get(Parse.serverURL + '/aggregate/TestObject', options)
      .then((resp) => {
        expect(resp.results.length).toBe(1);
        expect(resp.results[0].score).toBe(20);
        done();
      }).catch(done.fail);
  });

  it('project query', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        project: { name: 1 },
      }
    });
    rp.get(Parse.serverURL + '/aggregate/TestObject', options)
      .then((resp) => {
        resp.results.forEach((result) => {
          expect(result.objectId).not.toBe(undefined);
          expect(result.name).not.toBe(undefined);
          expect(result.sender).toBe(undefined);
          expect(result.size).toBe(undefined);
          expect(result.score).toBe(undefined);
        });
        done();
      }).catch(done.fail);
  });

  it('multiple project query', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        project: { name: 1, score: 1, sender: 1 },
      }
    });
    rp.get(Parse.serverURL + '/aggregate/TestObject', options)
      .then((resp) => {
        resp.results.forEach((result) => {
          expect(result.objectId).not.toBe(undefined);
          expect(result.name).not.toBe(undefined);
          expect(result.score).not.toBe(undefined);
          expect(result.sender).not.toBe(undefined);
          expect(result.size).toBe(undefined);
        });
        done();
      }).catch(done.fail);
  });

  it('project with group query', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        project: { score: 1 },
        group: { objectId: '$score', score: { $sum: '$score' } },
      }
    });
    rp.get(Parse.serverURL + '/aggregate/TestObject', options)
      .then((resp) => {
        expect(resp.results.length).toBe(2);
        resp.results.forEach((result) => {
          expect(result.hasOwnProperty('objectId')).toBe(true);
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
      }).catch(done.fail);
  });

  it('class does not exist return empty', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        group: { objectId: null, total: { $sum: '$score' } },
      }
    });
    rp.get(Parse.serverURL + '/aggregate/UnknownClass', options)
      .then((resp) => {
        expect(resp.results.length).toBe(0);
        done();
      }).catch(done.fail);
  });

  it('field does not exist return empty', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        group: { objectId: null, total: { $sum: '$unknownfield' } },
      }
    });
    rp.get(Parse.serverURL + '/aggregate/UnknownClass', options)
      .then((resp) => {
        expect(resp.results.length).toBe(0);
        done();
      }).catch(done.fail);
  });

  it('distinct query', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: { distinct: 'score' }
    });
    rp.get(Parse.serverURL + '/aggregate/TestObject', options)
      .then((resp) => {
        expect(resp.results.length).toBe(2);
        expect(resp.results.includes(10)).toBe(true);
        expect(resp.results.includes(20)).toBe(true);
        done();
      }).catch(done.fail);
  });

  it('distinct query with where', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        distinct: 'score',
        where: {
          name: 'bar'
        }
      }
    });
    rp.get(Parse.serverURL + '/aggregate/TestObject', options)
      .then((resp) => {
        expect(resp.results[0]).toBe(10);
        done();
      }).catch(done.fail);
  });

  it('distinct query with where string', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        distinct: 'score',
        where: JSON.stringify({name:'bar'}),
      }
    });
    rp.get(Parse.serverURL + '/aggregate/TestObject', options)
      .then((resp) => {
        expect(resp.results[0]).toBe(10);
        done();
      }).catch(done.fail);
  });

  it('distinct nested', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: { distinct: 'sender.group' }
    });
    rp.get(Parse.serverURL + '/aggregate/TestObject', options)
      .then((resp) => {
        expect(resp.results.length).toBe(2);
        expect(resp.results.includes('A')).toBe(true);
        expect(resp.results.includes('B')).toBe(true);
        done();
      }).catch(done.fail);
  });

  it('distinct pointer', (done) => {
    const pointer1 = new TestObject();
    const pointer2 = new TestObject();
    const obj1 = new TestObject({ pointer: pointer1 });
    const obj2 = new TestObject({ pointer: pointer2 });
    const obj3 = new TestObject({ pointer: pointer1 });
    Parse.Object.saveAll([pointer1, pointer2, obj1, obj2, obj3]).then(() => {
      const query = new Parse.Query(TestObject);
      return query.distinct('pointer');
    }).then((results) => {
      expect(results.length).toEqual(2);
      expect(results.some(result => result.objectId === pointer1.id)).toEqual(true);
      expect(results.some(result => result.objectId === pointer2.id)).toEqual(true);
      done();
    });
  });

  it('distinct class does not exist return empty', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: { distinct: 'unknown' }
    });
    rp.get(Parse.serverURL + '/aggregate/UnknownClass', options)
      .then((resp) => {
        expect(resp.results.length).toBe(0);
        done();
      }).catch(done.fail);
  });

  it('distinct field does not exist return empty', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: { distinct: 'unknown' }
    });
    const obj = new TestObject();
    obj.save().then(() => {
      return rp.get(Parse.serverURL + '/aggregate/TestObject', options);
    }).then((resp) => {
      expect(resp.results.length).toBe(0);
      done();
    }).catch(done.fail);
  });

  it('distinct array', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: { distinct: 'size' }
    });
    rp.get(Parse.serverURL + '/aggregate/TestObject', options)
      .then((resp) => {
        expect(resp.results.length).toBe(3);
        expect(resp.results.includes('S')).toBe(true);
        expect(resp.results.includes('M')).toBe(true);
        expect(resp.results.includes('L')).toBe(true);
        done();
      }).catch(done.fail);
  });

  it('does not return sensitive hidden properties', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        match: {
          score: {
            $gt: 5
          }
        },
      }
    });

    const username = 'leaky_user';
    const score = 10;

    const user = new Parse.User();
    user.setUsername(username);
    user.setPassword('password');
    user.set('score', score);
    user.signUp().then(function() {
      return rp.get(Parse.serverURL + '/aggregate/_User', options);
    }).then(function(resp) {
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
    }).catch(function(err) {
      fail(err);
    });
  });
});
