const PostgresStorageAdapter = require('../lib/Adapters/Storage/Postgres/PostgresStorageAdapter')
  .default;
const databaseURI =
  'postgres://localhost:5432/parse_server_postgres_adapter_test_database';
const Config = require('../lib/Config');

const getColumns = (client, className) => {
  return client.map(
    'SELECT column_name FROM information_schema.columns WHERE table_name = $<className>',
    { className },
    a => a.column_name
  );
};

const createExplainableQuery = (client, query) => {
  return 'EXPLAIN (ANALYZE, FORMAT JSON) ' + query;
};

const dropTable = (client, className) => {
  return client.none('DROP TABLE IF EXISTS $<className:name>', { className });
};

describe_only_db('postgres')('PostgresStorageAdapter', () => {
  let adapter;
  beforeEach(() => {
    const config = Config.get('test');
    adapter = config.database.adapter;
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

  it('getClass if exists', async () => {
    const schema = {
      fields: {
        array: { type: 'Array' },
        object: { type: 'Object' },
        date: { type: 'Date' },
      },
    };
    await adapter.createClass('MyClass', schema);
    const myClassSchema = await adapter.getClass('MyClass');
    expect(myClassSchema).toBeDefined();
  });

  it('getClass if not exists', async () => {
    const schema = {
      fields: {
        array: { type: 'Array' },
        object: { type: 'Object' },
        date: { type: 'Date' },
      },
    };
    await adapter.createClass('MyClass', schema);
    await expectAsync(adapter.getClass('UnknownClass')).toBeRejectedWith(
      undefined
    );
  });

  it('should use index for caseInsensitive query', async () => {

    const tableName = 'MyCaseSensitiveTable';
    const schema = {
      fields: {
        columnA: { type: 'String' },
        columnB: { type: 'String' },
        columnC: { type: 'String' },
      },
    };

    await adapter.createTable(tableName, schema);
    const client = adapter._client;

    client.none('INSERT INTO $1:name ($2:name, $3:name) VALUES ($4, $5)', [tableName, 'columnA', 'columnB', 'Bugs', 'Bunny'])
      .then(() => {
      //Postgres won't take advantage of the index until it has a lot of records because sequential is faster for small db's
        client.none(
          'INSERT INTO $1:name ($2:name, $3:name) SELECT MD5(random()::text), MD5(random()::text) FROM generate_series(1,11000)', [tableName, 'columnA' , 'columnB']
        )
          .then(() => {
            const caseInsensitiveData = 'bugs';
            const qs =  createExplainableQuery(client, 'SELECT * FROM $1:name WHERE lower($2:name)=lower($3)');
            client.one(qs, [tableName, 'columnA', caseInsensitiveData])
              .then(explained => {
                //expect(1).toBe(1);
                //expect(explained['QUERY PLAN']).toBe('Seq Scan');
                const test = explained['QUERY PLAN'];
                const test2 = test.Plan;
                expect(test).toEqual(test2);
                /*adapter.ensureIndex(
                tableName,
                schema,
                ['columnB'],
                'test_case_insensitive_column',
                true
                ).then(() => {
                client.one(qs, [tableName, 'columnA', caseInsensitiveData]).then(explained => {
                  expect(explained.Plan['Node Type']).not.toContain('Seq Scan');
                  //Delete generated data in postgres
                  client.none('DELETE FROM $1:name WHERE $2:name is null', [tableName, 'columnC']);
                })
                });*/
              });
          });
      });
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
