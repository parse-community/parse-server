'use strict';

const request = require('../lib/request');

describe('features', () => {
  it('requires the master key to get features', done => {
    request({
      url: 'http://localhost:8378/1/serverInfo',
      json: true,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      },
    }).then(fail, response => {
      expect(response.status).toEqual(403);
      expect(response.data.error).toEqual(
        'unauthorized: master key is required'
      );
      done();
    });
  });
});
