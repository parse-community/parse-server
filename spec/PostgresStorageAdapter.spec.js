const PostgresStorageAdapter = require('../lib/Adapters/Storage/Postgres/PostgresStorageAdapter')
  .default;
const databaseURI =
  'postgres://localhost:5432/parse_server_postgres_adapter_test_database';

const getColumns = (client, className) => {
  return client.map(
    'SELECT column_name FROM information_schema.columns WHERE table_name = $<className>',
    { className },
    a => a.column_name
  );
};

const dropTable = (client, className) => {
  return client.none('DROP TABLE IF EXISTS $<className:name>', { className });
};

describe_only_db('postgres')('PostgresStorageAdapter', () => {
  const adapter = new PostgresStorageAdapter({ uri: databaseURI });
  beforeEach(() => {
    return adapter.deleteAllClasses();
  });

  it('schemaUpgrade, upgrade the database schema when schema changes', done => {
    const client = adapter._client;
    const className = '_PushStatus';
    const schema = {
      fields: {
        pushTime: { type: 'String' },
        source: { type: 'String' },
        query: { type: 'String' },
      },
    };

    adapter
      .createTable(className, schema)
      .then(() => getColumns(client, className))
      .then(columns => {
        expect(columns).toContain('pushTime');
        expect(columns).toContain('source');
        expect(columns).toContain('query');
        expect(columns).not.toContain('expiration_interval');

        schema.fields.expiration_interval = { type: 'Number' };
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

  it('schemaUpgrade, maintain correct schema', done => {
    const client = adapter._client;
    const className = 'Table';
    const schema = {
      fields: {
        columnA: { type: 'String' },
        columnB: { type: 'String' },
        columnC: { type: 'String' },
      },
    };

    adapter
      .createTable(className, schema)
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
    const client = adapter._client;
    const className = 'EmptyTable';
    dropTable(client, className)
      .then(() => adapter.createTable(className, {}))
      .then(() => getColumns(client, className))
      .then(columns => {
        expect(columns.length).toBe(0);

        const newSchema = {
          fields: {
            columnA: { type: 'String' },
            columnB: { type: 'String' },
          },
        };

        return adapter.schemaUpgrade(className, newSchema);
      })
      .then(() => getColumns(client, className))
      .then(columns => {
        expect(columns.length).toEqual(2);
        expect(columns).toContain('columnA');
        expect(columns).toContain('columnB');
        done();
      })
      .catch(done);
  });
});

describe_only_db('postgres')('PostgresStorageAdapter shutdown', () => {
  it('handleShutdown, close connection', () => {
    const adapter = new PostgresStorageAdapter({ uri: databaseURI });
    expect(adapter._client.$pool.ending).toEqual(false);
    adapter.handleShutdown();
    expect(adapter._client.$pool.ending).toEqual(true);
  });
});
