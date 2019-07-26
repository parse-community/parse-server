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
    spyOn(databaseAdapter, 'createObject').and.callThrough();

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
        expect(databaseAdapter.createObject.calls.count()).toBe(2);
        expect(databaseAdapter.createObject.calls.argsFor(0)[3]).toEqual(null);
        expect(databaseAdapter.createObject.calls.argsFor(1)[3]).toEqual(null);
        expect(results.map(result => result.get('key')).sort()).toEqual([
          'value1',
          'value2',
        ]);
        done();
      });
    });
  });

  it('should handle a batch request with transaction = false', done => {
    spyOn(databaseAdapter, 'createObject').and.callThrough();

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
        expect(databaseAdapter.createObject.calls.count()).toBe(2);
        expect(databaseAdapter.createObject.calls.argsFor(0)[3]).toEqual(null);
        expect(databaseAdapter.createObject.calls.argsFor(1)[3]).toEqual(null);
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
        spyOn(databaseAdapter, 'createObject').and.callThrough();

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
            expect(databaseAdapter.createObject.calls.count()).toBe(2);
            expect(databaseAdapter.createObject.calls.argsFor(0)[3]).toBe(
              databaseAdapter.createObject.calls.argsFor(1)[3]
            );
            expect(results.map(result => result.get('key')).sort()).toEqual([
              'value1',
              'value2',
            ]);
            done();
          });
        });
      });

      it('should not save anything when one operation fails in a transaction', done => {
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
                body: { key: 10 },
              },
            ],
            transaction: true,
          }),
        }).catch(error => {
          expect(error.data).toBeDefined();
          const query = new Parse.Query('MyObject');
          query.find().then(results => {
            expect(results.length).toBe(0);
            done();
          });
        });
      });

      it('should generate separate session for each call', async () => {
        spyOn(databaseAdapter, 'createObject').and.callThrough();

        let myObjectCalls = 0;
        Parse.Cloud.beforeSave('MyObject', async () => {
          myObjectCalls++;
          if (myObjectCalls === 2) {
            try {
              await request({
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
                      body: { key: 10 },
                    },
                  ],
                  transaction: true,
                }),
              });
              fail('should fail');
            } catch (e) {
              expect(e).toBeDefined();
            }
          }
        });

        let myObject2Calls = 0;
        Parse.Cloud.beforeSave('MyObject2', async () => {
          myObject2Calls++;
          if (myObject2Calls === 2) {
            await request({
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
            });
          }
        });

        const response = await request({
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
        });

        expect(response.data.length).toEqual(2);
        expect(response.data[0].success.objectId).toBeDefined();
        expect(response.data[0].success.createdAt).toBeDefined();
        expect(response.data[1].success.objectId).toBeDefined();
        expect(response.data[1].success.createdAt).toBeDefined();

        const query = new Parse.Query('MyObject');
        const results = await query.find();
        expect(results.map(result => result.get('key')).sort()).toEqual([
          'value1',
          'value2',
        ]);

        const query2 = new Parse.Query('MyObject2');
        const results2 = await query2.find();
        expect(results2.length).toEqual(0);

        const query3 = new Parse.Query('MyObject3');
        const results3 = await query3.find();
        expect(results3.map(result => result.get('key')).sort()).toEqual([
          'value1',
          'value2',
        ]);

        expect(databaseAdapter.createObject.calls.count()).toBe(5);
        let transactionalSession;
        let transactionalSession2;
        let myObjectDBCalls = 0;
        let myObject2DBCalls = 0;
        let myObject3DBCalls = 0;
        for (let i = 0; i < 5; i++) {
          const args = databaseAdapter.createObject.calls.argsFor(i);
          switch (args[0]) {
            case 'MyObject':
              myObjectDBCalls++;
              if (!transactionalSession) {
                transactionalSession = args[3];
              } else {
                expect(transactionalSession).toBe(args[3]);
              }
              if (transactionalSession2) {
                expect(transactionalSession2).not.toBe(args[3]);
              }
              break;
            case 'MyObject2':
              myObject2DBCalls++;
              transactionalSession2 = args[3];
              if (transactionalSession) {
                expect(transactionalSession).not.toBe(args[3]);
              }
              break;
            case 'MyObject3':
              myObject3DBCalls++;
              expect(args[3]).toEqual(null);
              break;
          }
        }
        expect(myObjectDBCalls).toEqual(2);
        expect(myObject2DBCalls).toEqual(1);
        expect(myObject3DBCalls).toEqual(2);
      });
    });
  }
});
