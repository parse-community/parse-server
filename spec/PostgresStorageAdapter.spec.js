const PostgresStorageAdapter = require('../src/Adapters/Storage/Postgres/PostgresStorageAdapter');
const databaseURI = 'postgres://localhost:5432/parse_server_postgres_adapter_test_database';

describe_only_db('postgres')('PostgresStorageAdapter', () => {
  beforeEach(done => {
    const adapter = new PostgresStorageAdapter({ uri: databaseURI })
      .deleteAllClasses()
      .then(() => {
        adapter.handleShutdown();
      }, fail)
      .catch(done);
  });

  it('handleShutdown, close connection', (done) => {
    const adapter = new PostgresStorageAdapter({ uri: databaseURI });

    expect(adapter._client.$pool.ending).toEqual(false);
    adapter.handleShutdown();
    expect(adapter._client.$pool.ending).toEqual(true);
    done();
  });
});
