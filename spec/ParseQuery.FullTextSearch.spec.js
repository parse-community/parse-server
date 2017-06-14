'use strict';

const MongoStorageAdapter = require('../src/Adapters/Storage/Mongo/MongoStorageAdapter');
const mongoURI = 'mongodb://localhost:27017/parseServerMongoAdapterTestDatabase';
const PostgresStorageAdapter = require('../src/Adapters/Storage/Postgres/PostgresStorageAdapter');
const postgresURI = 'postgres://localhost:5432/parse_server_postgres_adapter_test_database';
const Parse = require('parse/node');
const rp = require('request-promise');
let databaseAdapter;

const fullTextHelper = () => {
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
      method: "POST",
      body: {
        subject: subjects[i]
      },
      path: "/1/classes/TestObject"
    };
    requests.push(request);
  }
  return reconfigureServer({
    appId: 'test',
    restAPIKey: 'test',
    publicServerURL: 'http://localhost:8378/1',
    databaseAdapter
  }).then(() => {
    if (process.env.PARSE_SERVER_TEST_DB === 'postgres') {
      return Parse.Promise.as();
    }
    return databaseAdapter.createIndex('TestObject', {subject: 'text'});
  }).then(() => {
    return rp.post({
      url: 'http://localhost:8378/1/batch',
      body: {
        requests
      },
      json: true,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'test'
      }
    });
  });
}

describe('Parse.Query Full Text Search testing', () => {
  it('fullTextSearch: $search', (done) => {
    fullTextHelper().then(() => {
      const where = {
        subject: {
          $text: {
            $search: {
              $term: 'coffee'
            }
          }
        }
      };
      return rp.post({
        url: 'http://localhost:8378/1/classes/TestObject',
        json: { where, '_method': 'GET' },
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'test'
        }
      });
    }).then((resp) => {
      expect(resp.results.length).toBe(3);
      done();
    }, done.fail);
  });

  it('fullTextSearch: $search, sort', (done) => {
    fullTextHelper().then(() => {
      const where = {
        subject: {
          $text: {
            $search: {
              $term: 'coffee'
            }
          }
        }
      };
      const order = '$score';
      const keys = '$score';
      return rp.post({
        url: 'http://localhost:8378/1/classes/TestObject',
        json: { where, order, keys, '_method': 'GET' },
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'test'
        }
      });
    }).then((resp) => {
      expect(resp.results.length).toBe(3);
      expect(resp.results[0].score);
      expect(resp.results[1].score);
      expect(resp.results[2].score);
      done();
    }, done.fail);
  });

  it('fullTextSearch: $language', (done) => {
    fullTextHelper().then(() => {
      const where = {
        subject: {
          $text: {
            $search: {
              $term: 'leche',
              $language: 'spanish'
            }
          }
        }
      };
      return rp.post({
        url: 'http://localhost:8378/1/classes/TestObject',
        json: { where, '_method': 'GET' },
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'test'
        }
      });
    }).then((resp) => {
      expect(resp.results.length).toBe(2);
      done();
    }, done.fail);
  });

  it('fullTextSearch: $diacriticSensitive', (done) => {
    fullTextHelper().then(() => {
      const where = {
        subject: {
          $text: {
            $search: {
              $term: 'CAFÉ',
              $diacriticSensitive: true
            }
          }
        }
      };
      return rp.post({
        url: 'http://localhost:8378/1/classes/TestObject',
        json: { where, '_method': 'GET' },
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'test'
        }
      });
    }).then((resp) => {
      expect(resp.results.length).toBe(1);
      done();
    }, done.fail);
  });

  it('fullTextSearch: $search, invalid input', (done) => {
    fullTextHelper().then(() => {
      const where = {
        subject: {
          $text: {
            $search: true
          }
        }
      };
      return rp.post({
        url: 'http://localhost:8378/1/classes/TestObject',
        json: { where, '_method': 'GET' },
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'test'
        }
      });
    }).then((resp) => {
      fail(`no request should succeed: ${JSON.stringify(resp)}`);
      done();
    }).catch((err) => {
      expect(err.error.code).toEqual(Parse.Error.INVALID_JSON);
      done();
    });
  });

  it('fullTextSearch: $language, invalid input', (done) => {
    fullTextHelper().then(() => {
      const where = {
        subject: {
          $text: {
            $search: {
              $term: 'leche',
              $language: true
            }
          }
        }
      };
      return rp.post({
        url: 'http://localhost:8378/1/classes/TestObject',
        json: { where, '_method': 'GET' },
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'test'
        }
      });
    }).then((resp) => {
      fail(`no request should succeed: ${JSON.stringify(resp)}`);
      done();
    }).catch((err) => {
      expect(err.error.code).toEqual(Parse.Error.INVALID_JSON);
      done();
    });
  });

  it('fullTextSearch: $caseSensitive, invalid input', (done) => {
    fullTextHelper().then(() => {
      const where = {
        subject: {
          $text: {
            $search: {
              $term: 'Coffee',
              $caseSensitive: 'string'
            }
          }
        }
      };
      return rp.post({
        url: 'http://localhost:8378/1/classes/TestObject',
        json: { where, '_method': 'GET' },
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'test'
        }
      });
    }).then((resp) => {
      fail(`no request should succeed: ${JSON.stringify(resp)}`);
      done();
    }).catch((err) => {
      expect(err.error.code).toEqual(Parse.Error.INVALID_JSON);
      done();
    });
  });

  it('fullTextSearch: $diacriticSensitive, invalid input', (done) => {
    fullTextHelper().then(() => {
      const where = {
        subject: {
          $text: {
            $search: {
              $term: 'CAFÉ',
              $diacriticSensitive: 'string'
            }
          }
        }
      };
      return rp.post({
        url: 'http://localhost:8378/1/classes/TestObject',
        json: { where, '_method': 'GET' },
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'test'
        }
      });
    }).then((resp) => {
      fail(`no request should succeed: ${JSON.stringify(resp)}`);
      done();
    }).catch((err) => {
      expect(err.error.code).toEqual(Parse.Error.INVALID_JSON);
      done();
    });
  });
});

describe_only_db('mongo')('Parse.Query Full Text Search testing', () => {
  it('fullTextSearch: $search, index not exist', (done) => {
    return reconfigureServer({
      appId: 'test',
      restAPIKey: 'test',
      publicServerURL: 'http://localhost:8378/1',
      databaseAdapter: new MongoStorageAdapter({ uri: mongoURI })
    }).then(() => {
      return rp.post({
        url: 'http://localhost:8378/1/batch',
        body: {
          requests: [
            {
              method: "POST",
              body: {
                subject: "coffee is java"
              },
              path: "/1/classes/TestObject"
            },
            {
              method: "POST",
              body: {
                subject: "java is coffee"
              },
              path: "/1/classes/TestObject"
            }
          ]
        },
        json: true,
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'test'
        }
      });
    }).then(() => {
      const where = {
        subject: {
          $text: {
            $search: {
              $term: 'coffee'
            }
          }
        }
      };
      return rp.post({
        url: 'http://localhost:8378/1/classes/TestObject',
        json: { where, '_method': 'GET' },
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'test'
        }
      });
    }).then((resp) => {
      fail(`Text Index should not exist: ${JSON.stringify(resp)}`);
      done();
    }).catch((err) => {
      expect(err.error.code).toEqual(Parse.Error.INTERNAL_SERVER_ERROR);
      done();
    });
  });

  it('fullTextSearch: $diacriticSensitive - false', (done) => {
    fullTextHelper().then(() => {
      const where = {
        subject: {
          $text: {
            $search: {
              $term: 'CAFÉ',
              $diacriticSensitive: false
            }
          }
        }
      };
      return rp.post({
        url: 'http://localhost:8378/1/classes/TestObject',
        json: { where, '_method': 'GET' },
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'test'
        }
      });
    }).then((resp) => {
      expect(resp.results.length).toBe(2);
      done();
    }, done.fail);
  });

  it('fullTextSearch: $caseSensitive', (done) => {
    fullTextHelper().then(() => {
      const where = {
        subject: {
          $text: {
            $search: {
              $term: 'Coffee',
              $caseSensitive: true
            }
          }
        }
      };
      return rp.post({
        url: 'http://localhost:8378/1/classes/TestObject',
        json: { where, '_method': 'GET' },
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'test'
        }
      });
    }).then((resp) => {
      expect(resp.results.length).toBe(1);
      done();
    }, done.fail);
  });
});

describe_only_db('postgres')('Parse.Query Full Text Search testing', () => {
  it('fullTextSearch: $diacriticSensitive - false', (done) => {
    fullTextHelper().then(() => {
      const where = {
        subject: {
          $text: {
            $search: {
              $term: 'CAFÉ',
              $diacriticSensitive: false
            }
          }
        }
      };
      return rp.post({
        url: 'http://localhost:8378/1/classes/TestObject',
        json: { where, '_method': 'GET' },
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'test'
        }
      });
    }).then((resp) => {
      fail(`$diacriticSensitive - false should not supported: ${JSON.stringify(resp)}`);
      done();
    }).catch((err) => {
      expect(err.error.code).toEqual(Parse.Error.INVALID_JSON);
      done();
    });
  });

  it('fullTextSearch: $caseSensitive', (done) => {
    fullTextHelper().then(() => {
      const where = {
        subject: {
          $text: {
            $search: {
              $term: 'Coffee',
              $caseSensitive: true
            }
          }
        }
      };
      return rp.post({
        url: 'http://localhost:8378/1/classes/TestObject',
        json: { where, '_method': 'GET' },
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'test'
        }
      });
    }).then((resp) => {
      fail(`$caseSensitive should not supported: ${JSON.stringify(resp)}`);
      done();
    }).catch((err) => {
      expect(err.error.code).toEqual(Parse.Error.INVALID_JSON);
      done();
    });
  });
});
