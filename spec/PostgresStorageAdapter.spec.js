const PostgresStorageAdapter = require('../src/Adapters/Storage/Postgres/PostgresStorageAdapter');
const databaseURI = 'postgres://localhost:5432/parse_server_postgres_adapter_test_database';

describe_only_db('postgres')('PostgresStorageAdapter', () => {
  beforeEach(done => {
    const adapter = new PostgresStorageAdapter({ uri: databaseURI })
      .deleteAllClasses()
      .then(() => {
        adapter._pgp.end();
      }, fail)
      .catch(done);
  });

  it('handleShutdown, close connection', (done) => {
    const adapter = new PostgresStorageAdapter({ uri: databaseURI });
    const schema = {
      fields: {
        array: { type: 'Array' },
        object: { type: 'Object' },
        date: { type: 'Date' },
      }
    };

    adapter.handleShutdown();
    adapter.createObject('MyClass', schema, {}).then(() => {
      done.fail('Should be error, becase connection is expected to destroy.');
    }).catch(err => {
      expect(err.message).toEqual('Connection pool of the database object has been destroyed.')
      done();
    })
  });
});
