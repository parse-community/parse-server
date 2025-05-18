'use strict';

const request = require('../lib/request');

describe('features', () => {
  it('should return the serverInfo', async () => {
    const response = await request({
      url: 'http://localhost:8378/1/serverInfo',
      json: true,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
        'X-Parse-Master-Key': 'test',
      },
    });
    const data = response.data;
    expect(data).toBeDefined();
    expect(data.features).toBeDefined();
    expect(data.parseServerVersion).toBeDefined();
  });

  it('requires the master key to get features', async done => {
    try {
      await request({
        url: 'http://localhost:8378/1/serverInfo',
        json: true,
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
        },
      });
      done.fail('The serverInfo request should be rejected without the master key');
    } catch (error) {
      expect(error.status).toEqual(403);
      expect(error.data.error).toEqual('unauthorized: master key is required');
      done();
    }
  });
});
