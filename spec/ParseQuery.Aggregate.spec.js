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

  it('group sum query', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        group: { _id: null, total: { $sum: '$score' } },
      }
    });
    rp.get(Parse.serverURL + '/aggregate/TestObject', options)
      .then((resp) => {
        expect(resp.results[0].total).toBe(50);
        done();
      }).catch(done.fail);
  });

  it('group min query', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        group: { _id: null, minScore: { $min: '$score' } },
      }
    });
    rp.get(Parse.serverURL + '/aggregate/TestObject', options)
      .then((resp) => {
        expect(resp.results[0].minScore).toBe(10);
        done();
      }).catch(done.fail);
  });

  it('group max query', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        group: { _id: null, maxScore: { $max: '$score' } },
      }
    });
    rp.get(Parse.serverURL + '/aggregate/TestObject', options)
      .then((resp) => {
        expect(resp.results[0].maxScore).toBe(20);
        done();
      }).catch(done.fail);
  });

  it('group avg query', (done) => {
    const options = Object.assign({}, masterKeyOptions, {
      body: {
        group: { _id: null, avgScore: { $avg: '$score' } },
      }
    });
    rp.get(Parse.serverURL + '/aggregate/TestObject', options)
      .then((resp) => {
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

  it('sort query', (done) => {
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
        expect(resp.results[0].name).toBe('dpl');
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
        expect(resp.results.indexOf(10) > -1).toBe(true);
        expect(resp.results.indexOf(20) > -1).toBe(true);
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
        expect(resp.results.indexOf('A') > -1).toBe(true);
        expect(resp.results.indexOf('B') > -1).toBe(true);
        done();
      }).catch(done.fail);
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
        expect(resp.results.indexOf('S') > -1).toBe(true);
        expect(resp.results.indexOf('M') > -1).toBe(true);
        expect(resp.results.indexOf('L') > -1).toBe(true);
        done();
      }).catch(done.fail);
  });
});
