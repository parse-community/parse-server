const PostgresStorageAdapter = require('../lib/Adapters/Storage/Postgres/PostgresStorageAdapter')
  .default;
const databaseURI =
  process.env.PARSE_SERVER_TEST_DATABASE_URI ||
  'postgres://localhost:5432/parse_server_postgres_adapter_test_database';
const Config = require('../lib/Config');

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
    await expectAsync(adapter.getClass('UnknownClass')).toBeRejectedWith(undefined);
  });

  it('should use index for caseInsensitive query using Postgres', async () => {
    const tableName = '_User';
    const schema = {
      fields: {
        objectId: { type: 'String' },
        username: { type: 'String' },
        email: { type: 'String' },
      },
    };
    const client = adapter._client;
    await adapter.createTable(tableName, schema);
    await client.none('INSERT INTO $1:name ($2:name, $3:name) VALUES ($4, $5)', [
      tableName,
      'objectId',
      'username',
      'Bugs',
      'Bunny',
    ]);
    //Postgres won't take advantage of the index until it has a lot of records because sequential is faster for small db's
    await client.none(
      'INSERT INTO $1:name ($2:name, $3:name) SELECT MD5(random()::text), MD5(random()::text) FROM generate_series(1,5000)',
      [tableName, 'objectId', 'username']
    );
    const caseInsensitiveData = 'bugs';
    const originalQuery = 'SELECT * FROM $1:name WHERE lower($2:name)=lower($3)';
    const analyzedExplainQuery = adapter.createExplainableQuery(originalQuery, true);
    await client
      .one(analyzedExplainQuery, [tableName, 'objectId', caseInsensitiveData])
      .then(explained => {
        const preIndexPlan = explained;

        preIndexPlan['QUERY PLAN'].forEach(element => {
          //Make sure search returned with only 1 result
          expect(element.Plan['Actual Rows']).toBe(1);
          expect(element.Plan['Node Type']).toBe('Seq Scan');
        });
        const indexName = 'test_case_insensitive_column';

        adapter.ensureIndex(tableName, schema, ['objectId'], indexName, true).then(() => {
          client
            .one(analyzedExplainQuery, [tableName, 'objectId', caseInsensitiveData])
            .then(explained => {
              const postIndexPlan = explained;

              postIndexPlan['QUERY PLAN'].forEach(element => {
                //Make sure search returned with only 1 result
                expect(element.Plan['Actual Rows']).toBe(1);
                //Should not be a sequential scan
                expect(element.Plan['Node Type']).not.toContain('Seq Scan');

                //Should be using the index created for this
                element.Plan.Plans.forEach(innerElement => {
                  expect(innerElement['Index Name']).toBe(indexName);
                });
              });

              //These are the same query so should be the same size
              for (let i = 0; i < preIndexPlan['QUERY PLAN'].length; i++) {
                //Sequential should take more time to execute than indexed
                expect(preIndexPlan['QUERY PLAN'][i]['Execution Time']).toBeGreaterThan(
                  postIndexPlan['QUERY PLAN'][i]['Execution Time']
                );
              }

              //Test explaining without analyzing
              const basicExplainQuery = adapter.createExplainableQuery(originalQuery);
              client
                .one(basicExplainQuery, [tableName, 'objectId', caseInsensitiveData])
                .then(explained => {
                  explained['QUERY PLAN'].forEach(element => {
                    //Check that basic query plans isn't a sequential scan
                    expect(element.Plan['Node Type']).not.toContain('Seq Scan');

                    //Basic query plans shouldn't have an execution time
                    expect(element['Execution Time']).toBeUndefined();
                  });
                });
            });
        });
      })
      .catch(error => {
        // Query on non existing table, don't crash
        if (error.code !== '42P01') {
          throw error;
        }
        return [];
      });
  });

  it('should use index for caseInsensitive query', async () => {
    const tableName = '_User';
    const user = new Parse.User();
    user.set('username', 'Bugs');
    user.set('password', 'Bunny');
    await user.signUp();
    const database = Config.get(Parse.applicationId).database;

    //Postgres won't take advantage of the index until it has a lot of records because sequential is faster for small db's
    const client = adapter._client;
    await client.none(
      'INSERT INTO $1:name ($2:name, $3:name) SELECT MD5(random()::text), MD5(random()::text) FROM generate_series(1,5000)',
      [tableName, 'objectId', 'username']
    );
    const caseInsensitiveData = 'bugs';
    const fieldToSearch = 'username';
    //Check using find method for Parse
    const preIndexPlan = await database.find(
      tableName,
      { username: caseInsensitiveData },
      { caseInsensitive: true, explain: true }
    );

    preIndexPlan.forEach(element => {
      element['QUERY PLAN'].forEach(innerElement => {
        //Check that basic query plans isn't a sequential scan, be careful as find uses "any" to query
        expect(innerElement.Plan['Node Type']).toBe('Seq Scan');
        //Basic query plans shouldn't have an execution time
        expect(innerElement['Execution Time']).toBeUndefined();
      });
    });

    const indexName = 'test_case_insensitive_column';
    const schema = await new Parse.Schema('_User').get();
    await adapter.ensureIndex(tableName, schema, [fieldToSearch], indexName, true);

    //Check using find method for Parse
    const postIndexPlan = await database.find(
      tableName,
      { username: caseInsensitiveData },
      { caseInsensitive: true, explain: true }
    );

    postIndexPlan.forEach(element => {
      element['QUERY PLAN'].forEach(innerElement => {
        //Check that basic query plans isn't a sequential scan
        expect(innerElement.Plan['Node Type']).not.toContain('Seq Scan');

        //Basic query plans shouldn't have an execution time
        expect(innerElement['Execution Time']).toBeUndefined();
      });
    });
  });

  it('should use index for caseInsensitive query using default indexname', async () => {
    const tableName = '_User';
    const user = new Parse.User();
    user.set('username', 'Bugs');
    user.set('password', 'Bunny');
    await user.signUp();
    const database = Config.get(Parse.applicationId).database;
    const fieldToSearch = 'username';
    //Create index before data is inserted
    const schema = await new Parse.Schema('_User').get();
    await adapter.ensureIndex(tableName, schema, [fieldToSearch], null, true);

    //Postgres won't take advantage of the index until it has a lot of records because sequential is faster for small db's
    const client = adapter._client;
    await client.none(
      'INSERT INTO $1:name ($2:name, $3:name) SELECT MD5(random()::text), MD5(random()::text) FROM generate_series(1,5000)',
      [tableName, 'objectId', 'username']
    );

    const caseInsensitiveData = 'buGs';
    //Check using find method for Parse
    const indexPlan = await database.find(
      tableName,
      { username: caseInsensitiveData },
      { caseInsensitive: true, explain: true }
    );
    indexPlan.forEach(element => {
      element['QUERY PLAN'].forEach(innerElement => {
        expect(innerElement.Plan['Node Type']).not.toContain('Seq Scan');
        expect(innerElement.Plan['Index Name']).toContain('parse_default');
      });
    });
  });

  it('should allow multiple unique indexes for same field name and different class', async () => {
    const firstTableName = 'Test1';
    const firstTableSchema = new Parse.Schema(firstTableName);
    const uniqueField = 'uuid';
    firstTableSchema.addString(uniqueField);
    await firstTableSchema.save();
    await firstTableSchema.get();

    const secondTableName = 'Test2';
    const secondTableSchema = new Parse.Schema(secondTableName);
    secondTableSchema.addString(uniqueField);
    await secondTableSchema.save();
    await secondTableSchema.get();

    const database = Config.get(Parse.applicationId).database;

    //Create index before data is inserted
    await adapter.ensureUniqueness(firstTableName, firstTableSchema, [uniqueField]);
    await adapter.ensureUniqueness(secondTableName, secondTableSchema, [uniqueField]);

    //Postgres won't take advantage of the index until it has a lot of records because sequential is faster for small db's
    const client = adapter._client;
    await client.none(
      'INSERT INTO $1:name ($2:name, $3:name) SELECT MD5(random()::text), MD5(random()::text) FROM generate_series(1,5000)',
      [firstTableName, 'objectId', uniqueField]
    );
    await client.none(
      'INSERT INTO $1:name ($2:name, $3:name) SELECT MD5(random()::text), MD5(random()::text) FROM generate_series(1,5000)',
      [secondTableName, 'objectId', uniqueField]
    );

    //Check using find method for Parse
    const indexPlan = await database.find(
      firstTableName,
      { uuid: '1234' },
      { caseInsensitive: false, explain: true }
    );
    indexPlan.forEach(element => {
      element['QUERY PLAN'].forEach(innerElement => {
        expect(innerElement.Plan['Node Type']).not.toContain('Seq Scan');
        expect(innerElement.Plan['Index Name']).toContain(uniqueField);
      });
    });
    const indexPlan2 = await database.find(
      secondTableName,
      { uuid: '1234' },
      { caseInsensitive: false, explain: true }
    );
    indexPlan2.forEach(element => {
      element['QUERY PLAN'].forEach(innerElement => {
        expect(innerElement.Plan['Node Type']).not.toContain('Seq Scan');
        expect(innerElement.Plan['Index Name']).toContain(uniqueField);
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
