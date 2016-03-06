'use strict';

var request = require('request');
var Parse = require('parse/node').Parse;
let cache = require('../src/cache');

describe('a GlobalConfig', () => {
  beforeEach(function(done) {
    let config = cache.apps.get('test');
    config.database.rawCollection('_GlobalConfig')
      .then(coll => coll.updateOne({ '_id': 1}, { $set: { params: { companies: ['US', 'DK'] } } }, { upsert: true }))
      .then(done());
  });

  it('can be retrieved', (done) => {
    request.get({
      url: 'http://localhost:8378/1/config',
      json: true,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
      },
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(200);
      expect(body.params.companies).toEqual(['US', 'DK']);
      done();
    });
  });

  it('can be updated when a master key exists', (done) => {
    request.put({
      url: 'http://localhost:8378/1/config',
      json: true,
      body: { params: { companies: ['US', 'DK', 'SE'] } },
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test'
      },
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(200);
      expect(body.result).toEqual(true);
      done();
    });
  });

  it('fail to update if master key is missing', (done) => {
    request.put({
      url: 'http://localhost:8378/1/config',
      json: true,
      body: { params: { companies: [] } },
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest'
      },
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(403);
      expect(body.error).toEqual('unauthorized: master key is required');
      done();
    });
  });  

  it('failed getting config when it is missing', (done) => {
    let config = cache.apps.get('test');
    config.database.rawCollection('_GlobalConfig')
      .then(coll => coll.deleteOne({ '_id': 1}, {}, {}))
      .then(_ => {
        request.get({
          url: 'http://localhost:8378/1/config',
          json: true,
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-Master-Key': 'test',
          },
        }, (error, response, body) => {
          expect(response.statusCode).toEqual(404);
          expect(body.code).toEqual(Parse.Error.INVALID_KEY_NAME);
          done();
        });
      });
  });

});
