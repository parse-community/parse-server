'use strict';

var request = require('request');
var Parse = require('parse/node').Parse;
let Config = require('../src/Config');

describe('a GlobalConfig', () => {
  beforeEach(done => {
    let config = new Config('test');
    config.database.adaptiveCollection('_GlobalConfig')
      .then(coll => coll.upsertOne({ '_id': 1 }, { $set: { params: { companies: ['US', 'DK'] } } }))
      .then(() => { done(); });
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
      expect(response.statusCode).toEqual(200);
      expect(body.params.companies).toEqual(['US', 'DK']);
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
    let config = new Config('test');
    config.database.adaptiveCollection('_GlobalConfig')
      .then(coll => coll.deleteOne({ '_id': 1 }))
      .then(() => {
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
