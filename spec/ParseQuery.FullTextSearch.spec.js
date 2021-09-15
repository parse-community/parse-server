'use strict';

const Config = require('../lib/Config');
const Parse = require('parse/node');
const request = require('../lib/request');
let databaseAdapter;

const fullTextHelper = async () => {
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
  await reconfigureServer({
    appId: 'test',
    restAPIKey: 'test',
    publicServerURL: 'http://localhost:8378/1',
    databaseAdapter,
  });
  await Parse.Object.saveAll(
    subjects.map(subject => new Parse.Object('TestObject').set({ subject, comment: subject }))
  );
};

describe('Parse.Query Full Text Search testing', () => {
  it('fullTextSearch: $search', async () => {
    await fullTextHelper();
    const query = new Parse.Query('TestObject');
    query.fullText('subject', 'coffee');
    const results = await query.find();
    expect(results.length).toBe(3);
  });

  it('fullTextSearch: $search, sort', async () => {
    await fullTextHelper();
    const query = new Parse.Query('TestObject');
    query.fullText('subject', 'coffee');
    query.select('$score');
    query.ascending('$score');
    const results = await query.find();
    expect(results.length).toBe(3);
    expect(results[0].get('score'));
    expect(results[1].get('score'));
    expect(results[2].get('score'));
  });

  it('fulltext descending by $score', async () => {
    await fullTextHelper();
    const query = new Parse.Query('TestObject');
    query.fullText('subject', 'coffee');
    query.descending('$score');
    query.select('$score');
    const [first, second, third] = await query.find();
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(third).toBeDefined();
    expect(first.get('score'));
    expect(second.get('score'));
    expect(third.get('score'));
    expect(first.get('score') >= second.get('score')).toBeTrue();
    expect(second.get('score') >= third.get('score')).toBeTrue();
  });

  it('fullTextSearch: $language', async () => {
    await fullTextHelper();
    const query = new Parse.Query('TestObject');
    query.fullText('subject', 'leche', { language: 'spanish' });
    const resp = await query.find();
    expect(resp.length).toBe(2);
  });

  it('fullTextSearch: $diacriticSensitive', async () => {
    await fullTextHelper();
    const query = new Parse.Query('TestObject');
    query.fullText('subject', 'CAFÉ', { diacriticSensitive: true });
    const resp = await query.find();
    expect(resp.length).toBe(1);
  });

  it('fullTextSearch: $search, invalid input', async () => {
    await fullTextHelper();
    const invalidQuery = async () => {
      const where = {
        subject: {
          $text: {
            $search: true,
          },
        },
      };
      try {
        await request({
          method: 'POST',
          url: 'http://localhost:8378/1/classes/TestObject',
          body: { where, _method: 'GET' },
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'test',
            'Content-Type': 'application/json',
          },
        });
      } catch (e) {
        throw new Parse.Error(e.data.code, e.data.error);
      }
    };
    await expectAsync(invalidQuery()).toBeRejectedWith(
      new Parse.Error(Parse.Error.INVALID_JSON, 'bad $text: $search, should be object')
    );
  });

  it('fullTextSearch: $language, invalid input', async () => {
    await fullTextHelper();
    const query = new Parse.Query('TestObject');
    query.fullText('subject', 'leche', { language: true });
    await expectAsync(query.find()).toBeRejectedWith(
      new Parse.Error(Parse.Error.INVALID_JSON, 'bad $text: $language, should be string')
    );
  });

  it('fullTextSearch: $caseSensitive, invalid input', async () => {
    await fullTextHelper();
    const query = new Parse.Query('TestObject');
    query.fullText('subject', 'leche', { caseSensitive: 'string' });
    await expectAsync(query.find()).toBeRejectedWith(
      new Parse.Error(Parse.Error.INVALID_JSON, 'bad $text: $caseSensitive, should be boolean')
    );
  });

  it('fullTextSearch: $diacriticSensitive, invalid input', async () => {
    await fullTextHelper();
    const query = new Parse.Query('TestObject');
    query.fullText('subject', 'leche', { diacriticSensitive: 'string' });
    await expectAsync(query.find()).toBeRejectedWith(
      new Parse.Error(Parse.Error.INVALID_JSON, 'bad $text: $diacriticSensitive, should be boolean')
    );
  });
});

describe_only_db('mongo')('[mongodb] Parse.Query Full Text Search testing', () => {
  it('fullTextSearch: does not create text index if compound index exist', async () => {
    await fullTextHelper();
    await databaseAdapter.dropAllIndexes('TestObject');
    let indexes = await databaseAdapter.getIndexes('TestObject');
    expect(indexes.length).toEqual(1);
    await databaseAdapter.createIndex('TestObject', {
      subject: 'text',
      comment: 'text',
    });
    indexes = await databaseAdapter.getIndexes('TestObject');
    const query = new Parse.Query('TestObject');
    query.fullText('subject', 'coffee');
    query.select('$score');
    query.ascending('$score');
    const results = await query.find();
    expect(results.length).toBe(3);
    expect(results[0].get('score'));
    expect(results[1].get('score'));
    expect(results[2].get('score'));

    indexes = await databaseAdapter.getIndexes('TestObject');
    expect(indexes.length).toEqual(2);

    const schemas = await new Parse.Schema('TestObject').get();
    expect(schemas.indexes._id_).toBeDefined();
    expect(schemas.indexes._id_._id).toEqual(1);
    expect(schemas.indexes.subject_text_comment_text).toBeDefined();
    expect(schemas.indexes.subject_text_comment_text.subject).toEqual('text');
    expect(schemas.indexes.subject_text_comment_text.comment).toEqual('text');
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

  it('fullTextSearch: $diacriticSensitive - false', async () => {
    await fullTextHelper();
    const query = new Parse.Query('TestObject');
    query.fullText('subject', 'CAFÉ', { diacriticSensitive: false });
    const resp = await query.find();
    expect(resp.length).toBe(2);
  });

  it('fullTextSearch: $caseSensitive', async () => {
    await fullTextHelper();
    const query = new Parse.Query('TestObject');
    query.fullText('subject', 'Coffee', { caseSensitive: true });
    const results = await query.find();
    expect(results.length).toBe(1);
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
