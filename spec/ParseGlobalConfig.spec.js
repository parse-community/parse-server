'use strict';

var request = require('request');
const Config = require('../src/Config');

describe('a GlobalConfig', () => {
  beforeEach(done => {
    const config = Config.get('test');
    const query = on_db('mongo', () => {
      // Legacy is with an int...
      return { objectId: 1 };
    }, () => {
      return { objectId: "1" }
    })
    config.database.adapter.upsertOneObject(
      '_GlobalConfig',
      { fields: { objectId: { type: 'Number' }, params: {type: 'Object'}} },
      query,
      { params: { companies: ['US', 'DK'] } }
    ).then(done, (err) => {
      jfail(err);
      done();
    });
  });

  it('can be retrieved', (done) => {
    request.get({
      url    : 'http://localhost:8378/1/config',
      json   : true,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key'    : 'test'
      }
    }, (error, response, body) => {
      try {
        expect(response.statusCode).toEqual(200);
        expect(body.params.companies).toEqual(['US', 'DK']);
      } catch(e) { jfail(e); }
      done();
    });
  });

  it('can be updated when a master key exists', (done) => {
    request.put({
      url    : 'http://localhost:8378/1/config',
      json   : true,
      body   : { params: { companies: ['US', 'DK', 'SE'] } },
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key'    : 'test'
      }
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(200);
      expect(body.result).toEqual(true);
      done();
    });
  });

  it('can add and retrive files', (done) => {
    request.put({
      url    : 'http://localhost:8378/1/config',
      json   : true,
      body   : { params: { file: { __type: 'File', name: 'name', url: 'http://url' } } },
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key'    : 'test'
      }
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(200);
      expect(body.result).toEqual(true);
      Parse.Config.get().then((res) => {
        const file = res.get('file');
        expect(file.name()).toBe('name');
        expect(file.url()).toBe('http://url');
        done();
      });
    });
  });

  it('can add and retrive Geopoints', (done) => {
    const geopoint = new Parse.GeoPoint(10,-20);
    request.put({
      url    : 'http://localhost:8378/1/config',
      json   : true,
      body   : { params: { point: geopoint.toJSON() } },
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key'    : 'test'
      }
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(200);
      expect(body.result).toEqual(true);
      Parse.Config.get().then((res) => {
        const point = res.get('point');
        expect(point.latitude).toBe(10);
        expect(point.longitude).toBe(-20);
        done();
      });
    });
  });

  it('properly handles delete op', (done) => {
    request.put({
      url    : 'http://localhost:8378/1/config',
      json   : true,
      body   : { params: { companies: {__op: 'Delete'}, foo: 'bar' } },
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key'    : 'test'
      }
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(200);
      expect(body.result).toEqual(true);
      request.get({
        url    : 'http://localhost:8378/1/config',
        json   : true,
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Master-Key'    : 'test'
        }
      }, (error, response, body) => {
        try {
          expect(response.statusCode).toEqual(200);
          expect(body.params.companies).toBeUndefined();
          expect(body.params.foo).toBe('bar');
          expect(Object.keys(body.params).length).toBe(1);
        } catch(e) { jfail(e); }
        done();
      });
    });
  });

  it('fail to update if master key is missing', (done) => {
    request.put({
      url    : 'http://localhost:8378/1/config',
      json   : true,
      body   : { params: { companies: [] } },
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key'  : 'rest'
      }
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(403);
      expect(body.error).toEqual('unauthorized: master key is required');
      done();
    });
  });

  it('failed getting config when it is missing', (done) => {
    const config = Config.get('test');
    config.database.adapter.deleteObjectsByQuery(
      '_GlobalConfig',
      { fields: { params: { __type: 'String' } } },
      { objectId: "1" }
    ).then(() => {
      request.get({
        url    : 'http://localhost:8378/1/config',
        json   : true,
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Master-Key'    : 'test'
        }
      }, (error, response, body) => {
        expect(response.statusCode).toEqual(200);
        expect(body.params).toEqual({});
        done();
      });
    }).catch((e) => {
      jfail(e);
      done();
    });
  });
});
