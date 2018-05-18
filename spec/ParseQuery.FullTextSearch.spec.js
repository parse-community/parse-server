'use strict';

import MongoStorageAdapter from '../src/Adapters/Storage/Mongo/MongoStorageAdapter';
const mongoURI = 'mongodb://localhost:27017/parseServerMongoAdapterTestDatabase';
import PostgresStorageAdapter from '../src/Adapters/Storage/Postgres/PostgresStorageAdapter';
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
        subject: subjects[i],
        comment: subjects[i],
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
  it('fullTextSearch: does not create text index if compound index exist', (done) => {
    fullTextHelper().then(() => {
      return databaseAdapter.dropAllIndexes('TestObject');
    }).then(() => {
      return databaseAdapter.getIndexes('TestObject');
    }).then((indexes) => {
      expect(indexes.length).toEqual(1);
      return databaseAdapter.createIndex('TestObject', {subject: 'text', comment: 'text'});
    }).then(() => {
      return databaseAdapter.getIndexes('TestObject');
    }).then((indexes) => {
      expect(indexes.length).toEqual(2);
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
      expect(resp.results.length).toEqual(3);
      return databaseAdapter.getIndexes('TestObject');
    }).then((indexes) => {
      expect(indexes.length).toEqual(2);
      rp.get({
        url: 'http://localhost:8378/1/schemas/TestObject',
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Master-Key': 'test',
        },
        json: true,
      }, (error, response, body) => {
        expect(body.indexes._id_).toBeDefined();
        expect(body.indexes._id_._id).toEqual(1);
        expect(body.indexes.subject_text_comment_text).toBeDefined();
        expect(body.indexes.subject_text_comment_text.subject).toEqual('text');
        expect(body.indexes.subject_text_comment_text.comment).toEqual('text');
        done();
      });
    }).catch(done.fail);
  });

  it('fullTextSearch: does not create text index if schema compound index exist', (done) => {
    fullTextHelper().then(() => {
      return databaseAdapter.dropAllIndexes('TestObject');
    }).then(() => {
      return databaseAdapter.getIndexes('TestObject');
    }).then((indexes) => {
      expect(indexes.length).toEqual(1);
      return rp.put({
        url: 'http://localhost:8378/1/schemas/TestObject',
        json: true,
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'test',
          'X-Parse-Master-Key': 'test',
        },
        body: {
          indexes: {
            text_test: { subject: 'text', comment: 'text'},
          },
        },
      });
    }).then(() => {
      return databaseAdapter.getIndexes('TestObject');
    }).then((indexes) => {
      expect(indexes.length).toEqual(2);
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
      expect(resp.results.length).toEqual(3);
      return databaseAdapter.getIndexes('TestObject');
    }).then((indexes) => {
      expect(indexes.length).toEqual(2);
      rp.get({
        url: 'http://localhost:8378/1/schemas/TestObject',
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Master-Key': 'test',
        },
        json: true,
      }, (error, response, body) => {
        expect(body.indexes._id_).toBeDefined();
        expect(body.indexes._id_._id).toEqual(1);
        expect(body.indexes.text_test).toBeDefined();
        expect(body.indexes.text_test.subject).toEqual('text');
        expect(body.indexes.text_test.comment).toEqual('text');
        done();
      });
    }).catch(done.fail);
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
