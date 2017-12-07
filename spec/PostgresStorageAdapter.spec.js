const PostgresStorageAdapter = require('../src/Adapters/Storage/Postgres/PostgresStorageAdapter');
const databaseURI = 'postgres://localhost:5432/parse_server_postgres_adapter_test_database';

const getColumns = (client, className) => {
  return client.any('SELECT column_name FROM information_schema.columns WHERE table_name = $<className>', { className })
    .then(columns => {
      if (!columns.length) {
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
        "source": { type: 'String' },
        "query": { type: 'String' },
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

  it('schemaUpgrade, matain correct schema', done => {
    const adapter = new PostgresStorageAdapter({ uri: databaseURI });
    const client = adapter._client;
    const className = 'Table';
    const schema = {
      fields: {
        "columnA": { type: 'String' },
        "columnB": { type: 'String' },
        "columnC": { type: 'String' },
      },
    };

    adapter.createTable(className, schema)
      .then(() => getColumns(client, className))
      .then(columns => {
        expect(columns).toContain('columnA');
        expect(columns).toContain('columnB');
        expect(columns).toContain('columnC');

        return adapter.schemaUpgrade(className, schema);
      })
      .then(() => getColumns(client, className))
      .then(columns => {
        expect(columns.length).toEqual(3);
        expect(columns).toContain('columnA');
        expect(columns).toContain('columnB');
        expect(columns).toContain('columnC');
        done();
      })
      .catch(error => done.fail(error));
  });

  it('Create a table without columns and upgrade with columns', done => {
    const adapter = new PostgresStorageAdapter({ uri: databaseURI });
    const client = adapter._client;
    const className = 'EmptyTable';
    let schema = {};

    adapter.createTable(className, schema)
      .then(() => getColumns(client, className))
      .then(columns => {
        expect(columns.length).toBe(0);

        schema = {
          fields: {
            "columnA": { type: 'String' },
            "columnB": { type: 'String' }
          },
        };

        return adapter.schemaUpgrade(className, schema);
      })
      .then(() => getColumns(client, className))
      .then(columns => {
        expect(columns.length).toEqual(2);
        expect(columns).toContain('columnA');
        expect(columns).toContain('columnB');
        done();
      })
      .catch(error => done.fail(error));
  })
});
