'use strict';

const Config = require('../lib/Config');
const Parse = require('parse/node');
const request = require('../lib/request');
let databaseAdapter;

const fullTextHelper = () => {
  const config = Config.get('test');
  databaseAdapter = config.database.adapter;

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

describe('Parse.Query Full Text Search testing', () => {
  it('fullTextSearch: $search', done => {
    fullTextHelper()
      .then(() => {
        const where = {
          subject: {
            $text: {
              $search: {
                $term: 'coffee',
              },
            },
          },
        };
        return request({
          method: 'POST',
          url: 'http://localhost:8378/1/classes/TestObject',
          body: { where, _method: 'GET' },
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

  it('fullTextSearch: $search, sort', done => {
    fullTextHelper()
      .then(() => {
        const where = {
          subject: {
            $text: {
              $search: {
                $term: 'coffee',
              },
            },
          },
        };
        const order = '$score';
        const keys = '$score';
        return request({
          method: 'POST',
          url: 'http://localhost:8378/1/classes/TestObject',
          body: { where, order, keys, _method: 'GET' },
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'test',
            'Content-Type': 'application/json',
          },
        });
      })
      .then(response => {
        const resp = response.data;
        expect(resp.results.length).toBe(3);
        expect(resp.results[0].score);
        expect(resp.results[1].score);
        expect(resp.results[2].score);
        done();
      }, done.fail);
  });

  it('fullTextSearch: $language', done => {
    fullTextHelper()
      .then(() => {
        const where = {
          subject: {
            $text: {
              $search: {
                $term: 'leche',
                $language: 'spanish',
              },
            },
          },
        };
        return request({
          method: 'POST',
          url: 'http://localhost:8378/1/classes/TestObject',
          body: { where, _method: 'GET' },
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'test',
            'Content-Type': 'application/json',
          },
        });
      })
      .then(resp => {
        expect(resp.data.results.length).toBe(2);
        done();
      }, done.fail);
  });

  it('fullTextSearch: $diacriticSensitive', done => {
    fullTextHelper()
      .then(() => {
        const where = {
          subject: {
            $text: {
              $search: {
                $term: 'CAFÉ',
                $diacriticSensitive: true,
              },
            },
          },
        };
        return request({
          method: 'POST',
          url: 'http://localhost:8378/1/classes/TestObject',
          body: { where, _method: 'GET' },
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'test',
            'Content-Type': 'application/json',
          },
        });
      })
      .then(resp => {
        expect(resp.data.results.length).toBe(1);
        done();
      }, done.fail);
  });

  it('fullTextSearch: $search, invalid input', done => {
    fullTextHelper()
      .then(() => {
        const where = {
          subject: {
            $text: {
              $search: true,
            },
          },
        };
        return request({
          method: 'POST',
          url: 'http://localhost:8378/1/classes/TestObject',
          body: { where, _method: 'GET' },
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'test',
            'Content-Type': 'application/json',
          },
        });
      })
      .then(resp => {
        fail(`no request should succeed: ${JSON.stringify(resp)}`);
        done();
      })
      .catch(err => {
        expect(err.data.code).toEqual(Parse.Error.INVALID_JSON);
        done();
      });
  });

  it('fullTextSearch: $language, invalid input', done => {
    fullTextHelper()
      .then(() => {
        const where = {
          subject: {
            $text: {
              $search: {
                $term: 'leche',
                $language: true,
              },
            },
          },
        };
        return request({
          method: 'POST',
          url: 'http://localhost:8378/1/classes/TestObject',
          body: { where, _method: 'GET' },
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'test',
            'Content-Type': 'application/json',
          },
        });
      })
      .then(resp => {
        fail(`no request should succeed: ${JSON.stringify(resp)}`);
        done();
      })
      .catch(err => {
        expect(err.data.code).toEqual(Parse.Error.INVALID_JSON);
        done();
      });
  });

  it('fullTextSearch: $caseSensitive, invalid input', done => {
    fullTextHelper()
      .then(() => {
        const where = {
          subject: {
            $text: {
              $search: {
                $term: 'Coffee',
                $caseSensitive: 'string',
              },
            },
          },
        };
        return request({
          method: 'POST',
          url: 'http://localhost:8378/1/classes/TestObject',
          body: { where, _method: 'GET' },
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'test',
            'Content-Type': 'application/json',
          },
        });
      })
      .then(resp => {
        fail(`no request should succeed: ${JSON.stringify(resp)}`);
        done();
      })
      .catch(err => {
        expect(err.data.code).toEqual(Parse.Error.INVALID_JSON);
        done();
      });
  });

  it('fullTextSearch: $diacriticSensitive, invalid input', done => {
    fullTextHelper()
      .then(() => {
        const where = {
          subject: {
            $text: {
              $search: {
                $term: 'CAFÉ',
                $diacriticSensitive: 'string',
              },
            },
          },
        };
        return request({
          method: 'POST',
          url: 'http://localhost:8378/1/classes/TestObject',
          body: { where, _method: 'GET' },
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'test',
            'Content-Type': 'application/json',
          },
        });
      })
      .then(resp => {
        fail(`no request should succeed: ${JSON.stringify(resp)}`);
        done();
      })
      .catch(err => {
        expect(err.data.code).toEqual(Parse.Error.INVALID_JSON);
        done();
      });
  });
});

describe_only_db('mongo')('[mongodb] Parse.Query Full Text Search testing', () => {
  it('fullTextSearch: does not create text index if compound index exist', done => {
    fullTextHelper()
      .then(() => {
        return databaseAdapter.dropAllIndexes('TestObject');
      })
      .then(() => {
        return databaseAdapter.getIndexes('TestObject');
      })
      .then(indexes => {
        expect(indexes.length).toEqual(1);
        return databaseAdapter.createIndex('TestObject', {
          subject: 'text',
          comment: 'text',
        });
      })
      .then(() => {
        return databaseAdapter.getIndexes('TestObject');
      })
      .then(indexes => {
        expect(indexes.length).toEqual(2);
        const where = {
          subject: {
            $text: {
              $search: {
                $term: 'coffee',
              },
            },
          },
        };
        return request({
          method: 'POST',
          url: 'http://localhost:8378/1/classes/TestObject',
          body: { where, _method: 'GET' },
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'test',
            'Content-Type': 'application/json',
          },
        });
      })
      .then(resp => {
        expect(resp.data.results.length).toEqual(3);
        return databaseAdapter.getIndexes('TestObject');
      })
      .then(indexes => {
        expect(indexes.length).toEqual(2);
        request({
          url: 'http://localhost:8378/1/schemas/TestObject',
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-Master-Key': 'test',
            'Content-Type': 'application/json',
          },
        }).then(response => {
          const body = response.data;
          expect(body.indexes._id_).toBeDefined();
          expect(body.indexes._id_._id).toEqual(1);
          expect(body.indexes.subject_text_comment_text).toBeDefined();
          expect(body.indexes.subject_text_comment_text.subject).toEqual('text');
          expect(body.indexes.subject_text_comment_text.comment).toEqual('text');
          done();
        });
      })
      .catch(done.fail);
  });

  it('fullTextSearch: does not create text index if schema compound index exist', done => {
    fullTextHelper()
      .then(() => {
        return databaseAdapter.dropAllIndexes('TestObject');
      })
      .then(() => {
        return databaseAdapter.getIndexes('TestObject');
      })
      .then(indexes => {
        expect(indexes.length).toEqual(1);
        return request({
          method: 'PUT',
          url: 'http://localhost:8378/1/schemas/TestObject',
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'test',
            'X-Parse-Master-Key': 'test',
            'Content-Type': 'application/json',
          },
          body: {
            indexes: {
              text_test: { subject: 'text', comment: 'text' },
            },
          },
        });
      })
      .then(() => {
        return databaseAdapter.getIndexes('TestObject');
      })
      .then(indexes => {
        expect(indexes.length).toEqual(2);
        const where = {
          subject: {
            $text: {
              $search: {
                $term: 'coffee',
              },
            },
          },
        };
        return request({
          method: 'POST',
          url: 'http://localhost:8378/1/classes/TestObject',
          body: { where, _method: 'GET' },
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'test',
            'Content-Type': 'application/json',
          },
        });
      })
      .then(resp => {
        expect(resp.data.results.length).toEqual(3);
        return databaseAdapter.getIndexes('TestObject');
      })
      .then(indexes => {
        expect(indexes.length).toEqual(2);
        request({
          url: 'http://localhost:8378/1/schemas/TestObject',
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-Master-Key': 'test',
            'Content-Type': 'application/json',
          },
        }).then(response => {
          const body = response.data;
          expect(body.indexes._id_).toBeDefined();
          expect(body.indexes._id_._id).toEqual(1);
          expect(body.indexes.text_test).toBeDefined();
          expect(body.indexes.text_test.subject).toEqual('text');
          expect(body.indexes.text_test.comment).toEqual('text');
          done();
        });
      })
      .catch(done.fail);
  });

  it('fullTextSearch: $diacriticSensitive - false', done => {
    fullTextHelper()
      .then(() => {
        const where = {
          subject: {
            $text: {
              $search: {
                $term: 'CAFÉ',
                $diacriticSensitive: false,
              },
            },
          },
        };
        return request({
          method: 'POST',
          url: 'http://localhost:8378/1/classes/TestObject',
          body: { where, _method: 'GET' },
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'test',
            'Content-Type': 'application/json',
          },
        });
      })
      .then(resp => {
        expect(resp.data.results.length).toBe(2);
        done();
      }, done.fail);
  });

  it('fullTextSearch: $caseSensitive', done => {
    fullTextHelper()
      .then(() => {
        const where = {
          subject: {
            $text: {
              $search: {
                $term: 'Coffee',
                $caseSensitive: true,
              },
            },
          },
        };
        return request({
          method: 'POST',
          url: 'http://localhost:8378/1/classes/TestObject',
          body: { where, _method: 'GET' },
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'test',
            'Content-Type': 'application/json',
          },
        });
      })
      .then(resp => {
        expect(resp.data.results.length).toBe(1);
        done();
      }, done.fail);
  });
});

describe_only_db('postgres')('[postgres] Parse.Query Full Text Search testing', () => {
  it('fullTextSearch: $diacriticSensitive - false', done => {
    fullTextHelper()
      .then(() => {
        const where = {
          subject: {
            $text: {
              $search: {
                $term: 'CAFÉ',
                $diacriticSensitive: false,
              },
            },
          },
        };
        return request({
          method: 'POST',
          url: 'http://localhost:8378/1/classes/TestObject',
          body: { where, _method: 'GET' },
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'test',
            'Content-Type': 'application/json',
          },
        });
      })
      .then(resp => {
        fail(`$diacriticSensitive - false should not supported: ${JSON.stringify(resp)}`);
        done();
      })
      .catch(err => {
        expect(err.data.code).toEqual(Parse.Error.INVALID_JSON);
        done();
      });
  });

  it('fullTextSearch: $caseSensitive', done => {
    fullTextHelper()
      .then(() => {
        const where = {
          subject: {
            $text: {
              $search: {
                $term: 'Coffee',
                $caseSensitive: true,
              },
            },
          },
        };
        return request({
          method: 'POST',
          url: 'http://localhost:8378/1/classes/TestObject',
          body: { where, _method: 'GET' },
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'test',
            'Content-Type': 'application/json',
          },
        });
      })
      .then(resp => {
        fail(`$caseSensitive should not supported: ${JSON.stringify(resp)}`);
        done();
      })
      .catch(err => {
        expect(err.data.code).toEqual(Parse.Error.INVALID_JSON);
        done();
      });
  });
});
