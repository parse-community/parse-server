const batch = require('../lib/batch');
const request = require('../lib/request');
const TestUtils = require('../lib/TestUtils');

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
    let calls = 0;
    Parse.Cloud.beforeSave('MyObject', ({ database }) => {
      calls++;
      expect(database._transactionalSession).toEqual(null);
    });

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
        expect(calls).toBe(2);
        expect(results.map(result => result.get('key')).sort()).toEqual([
          'value1',
          'value2',
        ]);
        done();
      });
    });
  });

  it('should handle a batch request with transaction = false', done => {
    let calls = 0;
    Parse.Cloud.beforeSave('MyObject', ({ database }) => {
      calls++;
      expect(database._transactionalSession).toEqual(null);
    });

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
        expect(calls).toBe(2);
        expect(results.map(result => result.get('key')).sort()).toEqual([
          'value1',
          'value2',
        ]);
        done();
      });
    });
  });

  if (process.env.PARSE_SERVER_TEST_DATABASE_URI_TRANSACTIONS) {
    describe('transactions', () => {
      beforeAll(async () => {
        await reconfigureServer({
          databaseAdapter: undefined,
          databaseURI: process.env.PARSE_SERVER_TEST_DATABASE_URI_TRANSACTIONS,
        });
      });

      beforeEach(async () => {
        await TestUtils.destroyAllDataPermanently(true);
      });

      it('should handle a batch request with transaction = true', done => {
        let calls = 0;
        let transactionalSession = null;
        Parse.Cloud.beforeSave('MyObject', ({ database }) => {
          calls++;
          expect(database._transactionalSession).not.toEqual(null);
          if (transactionalSession) {
            expect(database._transactionalSession).toBe(transactionalSession);
          } else {
            transactionalSession = database._transactionalSession;
          }
        });

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
            expect(calls).toBe(2);
            expect(results.map(result => result.get('key')).sort()).toEqual([
              'value1',
              'value2',
            ]);
            done();
          });
        });
      });

      it('should generate separate session for each call', done => {
        let myObjectCalls = 0;
        //let myObjectTransactionalSession = null;

        Parse.Cloud.afterSave('MyObject', () => {
          console.log(1);
        });
        Parse.Cloud.afterSave('MyObject2', () => {
          console.log(2);
        });
        Parse.Cloud.afterSave('MyObject3', () => {
          console.log(3);
        });

        Parse.Cloud.beforeSave('MyObject', (/*{ database }*/) => {
          myObjectCalls++;
          // expect(database._transactionalSession).not.toEqual(null);
          // if (myObjectTransactionalSession) {
          //   expect(database._transactionalSession).toBe(
          //     myObjectTransactionalSession
          //   );
          // } else {
          //   myObjectTransactionalSession =
          //     database._transactionalSession;
          // }

          if (myObjectCalls === 1) {
            return request({
              method: 'POST',
              headers: headers,
              url: 'http://localhost:8378/1/batch',
              body: JSON.stringify({
                requests: [
                  {
                    method: 'POST',
                    path: '/1/classes/MyObject2',
                    body: { key: 'value1' },
                  },
                  {
                    method: 'POST',
                    path: '/1/classes/MyObject2',
                    body: { key: 'value2' },
                  },
                ],
                transaction: false,
              }),
            }).then(response => {
              console.log(response.data[0].error);
              return Promise.resolve();
            });
          }
        });

        let myObject2Calls = 0;
        //let myObject2TransactionalSession = null;
        Parse.Cloud.beforeSave('MyObject2', (/*{ database }*/) => {
          myObject2Calls++;
          // expect(database._transactionalSession).not.toEqual(null);
          // if (myObject2TransactionalSession) {
          //   expect(database._transactionalSession).toBe(
          //     myObject2TransactionalSession
          //   );
          // } else {
          //   myObject2TransactionalSession =
          //     database._transactionalSession;
          // }
          if (myObject2Calls === 1) {
            return request({
              method: 'POST',
              headers: headers,
              url: 'http://localhost:8378/1/batch',
              body: JSON.stringify({
                requests: [
                  {
                    method: 'POST',
                    path: '/1/classes/MyObject3',
                    body: { key: 'value1' },
                  },
                  {
                    method: 'POST',
                    path: '/1/classes/MyObject3',
                    body: { key: 'value2' },
                  },
                ],
              }),
            }).then(response => {
              console.log(response.data);
              return Promise.resolve();
            });
          }
        });

        let myObject3Calls = 0;
        Parse.Cloud.beforeSave('MyObject3', ({ database }) => {
          myObject3Calls++;
          expect(database._transactionalSession).toEqual(null);
        });

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
          console.log(response.data);
          const query = new Parse.Query('MyObject');
          query.find().then(results => {
            expect(myObjectCalls).toBe(2);
            expect(results.map(result => result.get('key')).sort()).toEqual([
              'value1',
              'value2',
            ]);
            const query = new Parse.Query('MyObject2');
            query.find().then(results => {
              expect(myObject2Calls).toBe(2);
              expect(results.map(result => result.get('key')).sort()).toEqual([
                'value1',
                'value2',
              ]);
              const query = new Parse.Query('MyObject3');
              query.find().then(results => {
                expect(myObject3Calls).toBe(2);
                expect(results.map(result => result.get('key')).sort()).toEqual(
                  ['value1', 'value2']
                );
                done();
              });
            });
          });
        });
      });
    });
  }
});
