'use strict';

const request = require("request");

describe('features', () => {
  it('requires the master key to get features', done => {
    request.get({
      url: 'http://localhost:8378/1/serverInfo',
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
