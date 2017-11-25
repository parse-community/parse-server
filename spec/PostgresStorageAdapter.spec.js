const PostgresStorageAdapter = require('../src/Adapters/Storage/Postgres/PostgresStorageAdapter');
const databaseURI = 'postgres://localhost:5432/parse_server_postgres_adapter_test_database';

const getColumns = (client, className) => {
  return client.any(`SELECT column_name FROM information_schema.columns WHERE table_name = '${className}'`)
    .then(columns => {
      if (!columns) {
        return [];
      }

      return columns.map(item => item.column_name);
    });
};

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

  it('schemaUpgrade, upgrade the database schema when schema change', done => {
    const adapter = new PostgresStorageAdapter({ uri: databaseURI });
    const client = adapter._client;
    const className = '_PushStatus';
    const schema = {
      fields: {
        "pushTime": { type: 'String' },
        "source": { type: 'String' }, // rest or webui
        "query": { type: 'String' }, // the stringified JSON query
      },
    };

    adapter.createTable(className, schema)
      .then(() => getColumns(client, className))
      .then(columns => {
        expect(columns).toContain('pushTime');
        expect(columns).toContain('source');
        expect(columns).toContain('query');
        expect(columns).not.toContain('expiration_interval');

        schema.fields.expiration_interval = { type:'Number' };
        return adapter.schemaUpgrade(className, schema);
      })
      .then(() => getColumns(client, className))
      .then(columns => {
        expect(columns).toContain('pushTime');
        expect(columns).toContain('source');
        expect(columns).toContain('query');
        expect(columns).toContain('expiration_interval');
        done();
      })
      .catch(error => done.fail(error));
  });
});
