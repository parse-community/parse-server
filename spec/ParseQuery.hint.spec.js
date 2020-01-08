'use strict';

const MongoStorageAdapter = require('../lib/Adapters/Storage/Mongo/MongoStorageAdapter')
  .default;
const mongoURI =
  'mongodb://localhost:27017/parseServerMongoAdapterTestDatabase';
const PostgresStorageAdapter = require('../lib/Adapters/Storage/Postgres/PostgresStorageAdapter')
  .default;
const postgresURI =
  'postgres://localhost:5432/parse_server_postgres_adapter_test_database';
const request = require('../lib/request');
let databaseAdapter;

const hintHelper = () => {
  if (process.env.PARSE_SERVER_TEST_DB === 'postgres') {
    if (!databaseAdapter) {
      databaseAdapter = new PostgresStorageAdapter({ uri: postgresURI });
    }
  } else {
    databaseAdapter = new MongoStorageAdapter({ uri: mongoURI });
  }
  const subjects = [
    'coffee',
    'Coffee Shopping',
    'Baking a cake',
    'baking',
    'Café Con Leche',
    'Сырники',
    'coffee and cream',
    'Cafe con Leche',
  ];
  const requests = [];
  for (const i in subjects) {
    const request = {
      method: 'POST',
      body: {
        subject: subjects[i],
        comment: subjects[i],
      },
      path: '/1/classes/TestObject',
    };
    requests.push(request);
  }
  return reconfigureServer({
    appId: 'test',
    restAPIKey: 'test',
    publicServerURL: 'http://localhost:8378/1',
    databaseAdapter,
  }).then(() => {
    return request({
      method: 'POST',
      url: 'http://localhost:8378/1/batch',
      body: {
        requests,
      },
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'test',
        'Content-Type': 'application/json',
      },
    });
  });
};

describe('Parse.Query hint testing', () => {
  it('should execute query with hint as a string', done => {
    hintHelper()
      .then(() => {
        return request({
          method: 'POST',
          url: 'http://localhost:8378/1/classes/TestObject',
          body: { where: {}, _method: 'GET', hint: '_id_' },
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'test',
            'Content-Type': 'application/json',
          },
        });
      })
      .then(
        resp => {
          expect(resp.data.results.length).toBe(3);
          done();
        },
        e => done.fail(e)
      );
  });

  it('should execute query with hint as object', done => {
    hintHelper()
      .then(() => {
        return request({
          method: 'POST',
          url: 'http://localhost:8378/1/classes/TestObject',
          body: { where: {}, _method: 'GET', hint: { _id_: 1 } },
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'test',
            'Content-Type': 'application/json',
          },
        });
      })
      .then(
        resp => {
          expect(resp.data.results.length).toBe(3);
          done();
        },
        e => done.fail(e)
      );
  });
});
