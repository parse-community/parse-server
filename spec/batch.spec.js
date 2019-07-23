const batch = require('../lib/batch');
const request = require('../lib/request');

const originalURL = '/parse/batch';
const serverURL = 'http://localhost:1234/parse';
const serverURL1 = 'http://localhost:1234/1';
const serverURLNaked = 'http://localhost:1234/';
const publicServerURL = 'http://domain.com/parse';
const publicServerURLNaked = 'http://domain.com/';

const headers = {
  'Content-Type': 'application/json',
  'X-Parse-Application-Id': 'test',
  'X-Parse-REST-API-Key': 'rest',
  'X-Parse-Installation-Id': 'yolo',
};

describe('batch', () => {
  it('should return the proper url', () => {
    const internalURL = batch.makeBatchRoutingPathFunction(originalURL)(
      '/parse/classes/Object'
    );

    expect(internalURL).toEqual('/classes/Object');
  });

  it('should return the proper url same public/local endpoint', () => {
    const originalURL = '/parse/batch';
    const internalURL = batch.makeBatchRoutingPathFunction(
      originalURL,
      serverURL,
      publicServerURL
    )('/parse/classes/Object');

    expect(internalURL).toEqual('/classes/Object');
  });

  it('should return the proper url with different public/local mount', () => {
    const originalURL = '/parse/batch';
    const internalURL = batch.makeBatchRoutingPathFunction(
      originalURL,
      serverURL1,
      publicServerURL
    )('/parse/classes/Object');

    expect(internalURL).toEqual('/classes/Object');
  });

  it('should return the proper url with naked public', () => {
    const originalURL = '/batch';
    const internalURL = batch.makeBatchRoutingPathFunction(
      originalURL,
      serverURL,
      publicServerURLNaked
    )('/classes/Object');

    expect(internalURL).toEqual('/classes/Object');
  });

  it('should return the proper url with naked local', () => {
    const originalURL = '/parse/batch';
    const internalURL = batch.makeBatchRoutingPathFunction(
      originalURL,
      serverURLNaked,
      publicServerURL
    )('/parse/classes/Object');

    expect(internalURL).toEqual('/classes/Object');
  });

  it('should handle a batch request without transaction', done => {
    request({
      method: 'POST',
      headers: headers,
      url: 'http://localhost:8378/1/batch',
      body: JSON.stringify({
        requests: [
          {
            method: 'POST',
            path: '/1/classes/MyObject',
            body: { key: 'value1' },
          },
          {
            method: 'POST',
            path: '/1/classes/MyObject',
            body: { key: 'value2' },
          },
        ],
      }),
    }).then(response => {
      expect(response.data.length).toEqual(2);
      expect(response.data[0].success.objectId).toBeDefined();
      expect(response.data[0].success.createdAt).toBeDefined();
      expect(response.data[1].success.objectId).toBeDefined();
      expect(response.data[1].success.createdAt).toBeDefined();
      const query = new Parse.Query('MyObject');
      query.find().then(results => {
        expect(results.map(result => result.get('key')).sort()).toEqual([
          'value1',
          'value2',
        ]);
        done();
      });
    });
  });

  it('should handle a batch request with transaction = false', done => {
    request({
      method: 'POST',
      headers: headers,
      url: 'http://localhost:8378/1/batch',
      body: JSON.stringify({
        requests: [
          {
            method: 'POST',
            path: '/1/classes/MyObject',
            body: { key: 'value1' },
          },
          {
            method: 'POST',
            path: '/1/classes/MyObject',
            body: { key: 'value2' },
          },
        ],
        transaction: false,
      }),
    }).then(response => {
      expect(response.data.length).toEqual(2);
      expect(response.data[0].success.objectId).toBeDefined();
      expect(response.data[0].success.createdAt).toBeDefined();
      expect(response.data[1].success.objectId).toBeDefined();
      expect(response.data[1].success.createdAt).toBeDefined();
      const query = new Parse.Query('MyObject');
      query.find().then(results => {
        expect(results.map(result => result.get('key')).sort()).toEqual([
          'value1',
          'value2',
        ]);
        done();
      });
    });
  });

  it('should handle a batch request with transaction = true', done => {
    request({
      method: 'POST',
      headers: headers,
      url: 'http://localhost:8378/1/batch',
      body: JSON.stringify({
        requests: [
          {
            method: 'POST',
            path: '/1/classes/MyObject',
            body: { key: 'value1' },
          },
          {
            method: 'POST',
            path: '/1/classes/MyObject',
            body: { key: 'value2' },
          },
        ],
        transaction: true,
      }),
    }).then(response => {
      expect(response.data.length).toEqual(2);
      expect(response.data[0].success.objectId).toBeDefined();
      expect(response.data[0].success.createdAt).toBeDefined();
      expect(response.data[1].success.objectId).toBeDefined();
      expect(response.data[1].success.createdAt).toBeDefined();
      const query = new Parse.Query('MyObject');
      query.find().then(results => {
        expect(results.map(result => result.get('key')).sort()).toEqual([
          'value1',
          'value2',
        ]);
        done();
      });
    });
  });
});
