'use strict';

var request = require('request');
var Parse = require('parse/node').Parse;
let Config = require('../src/Config');

describe('a GlobalConfig', () => {
  beforeEach(done => {
    let config = new Config('test');
    config.database.adapter.upsertOneObject(
      '_GlobalConfig',
      { fields: {} },
      { objectId: 1 },
      { params: { companies: ['US', 'DK'] } }
    ).then(done);
  });

  it_exclude_dbs(['postgres'])('can be retrieved', (done) => {
    request.get({
      url    : 'http://localhost:8378/1/config',
      json   : true,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key'    : 'test'
      }
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(200);
      expect(body.params.companies).toEqual(['US', 'DK']);
      done();
    });
  });

  it_exclude_dbs(['postgres'])('can be updated when a master key exists', (done) => {
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

  it_exclude_dbs(['postgres'])('properly handles delete op', (done) => {
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
        expect(response.statusCode).toEqual(200);
        expect(body.params.companies).toBeUndefined();
        expect(body.params.foo).toBe('bar');
        expect(Object.keys(body.params).length).toBe(1);
        done();
      });
    });
  });

  it_exclude_dbs(['postgres'])('fail to update if master key is missing', (done) => {
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

  it_exclude_dbs(['postgres'])('failed getting config when it is missing', (done) => {
    let config = new Config('test');
    config.database.adapter.deleteObjectsByQuery(
      '_GlobalConfig',
      { fields: { params: { __type: 'String' } } },
      { objectId: 1 }
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
    });
  });
});
