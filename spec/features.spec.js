'use strict';

var features = require('../src/features');
const request = require("request");

describe('features', () => {
  it('set and get features', (done) => {
    features.setFeature('users', {
      testOption1: true,
      testOption2: false
    });

    var _features = features.getFeatures();

    var expected = {
      testOption1: true,
      testOption2: false 
    };

    expect(_features.users).toEqual(expected);
    done();
  });

  it('get features that does not exist', (done) => {
    var _features = features.getFeatures();
    expect(_features.test).toBeUndefined();
    done();
  });

  it('requires the master key to get all schemas', done => {
    request.get({
      url: 'http://localhost:8378/1/features',
      json: true,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest'
      }
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(403);
      expect(body.error).toEqual('unauthorized: master key is required');
      done();
    });
  });
});
