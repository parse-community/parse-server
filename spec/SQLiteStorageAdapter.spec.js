const SQLiteStorageAdapter = require('../lib/Adapters/Storage/SQLite/SQLiteStorageAdapter').default;
const Parse = require('parse/node');

describe_only_db('sqlite')('SQLiteStorageAdapter Unit & Security Tests', () => {
  let adapter;
  let collectionPrefixIndex = 0;

  beforeEach(async () => {
    adapter = new SQLiteStorageAdapter({
      uri: 'sqlite://:memory:',
      collectionPrefix: `test_${collectionPrefixIndex++}_`,
      databaseOptions: { enableSchemaHooks: true },
    });
  });

  afterEach(() => {
    adapter.handleShutdown();
  });

  it('creates class and inserts objects', async () => {
    const schema = {
      className: 'TestClass',
      fields: {
        objectId: { type: 'String' },
        name: { type: 'String' },
        age: { type: 'Number' },
      },
    };
    await adapter.createClass('TestClass', schema);
    const exists = await adapter.classExists('TestClass');
    expect(exists).toBe(true);

    await adapter.createObject('TestClass', schema, {
      objectId: 'obj1',
      name: 'Alice',
      age: 30,
    });

    const results = await adapter.find('TestClass', schema, { objectId: 'obj1' });
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Alice');
    expect(results[0].age).toBe(30);
  });

  it('handles transactions commit and abort', async () => {
    const schema = {
      className: 'TxClass',
      fields: {
        objectId: { type: 'String' },
        val: { type: 'String' },
      },
    };
    await adapter.createClass('TxClass', schema);

    const tx = await adapter.createTransactionalSession();
    await adapter.createObject('TxClass', schema, { objectId: 'tx1', val: 'committed' }, tx);
    await adapter.commitTransactionalSession(tx);

    const check1 = await adapter.find('TxClass', schema, { objectId: 'tx1' });
    expect(check1.length).toBe(1);

    const tx2 = await adapter.createTransactionalSession();
    await adapter.createObject('TxClass', schema, { objectId: 'tx2', val: 'rolledback' }, tx2);
    await adapter.abortTransactionalSession(tx2);

    const check2 = await adapter.find('TxClass', schema, { objectId: 'tx2' });
    expect(check2.length).toBe(0);
  });

  it('notifies schema hooks on watch()', done => {
    adapter.watch(() => {
      done();
    });
    adapter.createClass('HookClass', { fields: { objectId: { type: 'String' } } });
  });

  it('supports geospatial queries ($nearSphere, $within)', async () => {
    const schema = {
      className: 'LocationClass',
      fields: {
        objectId: { type: 'String' },
        location: { type: 'GeoPoint' },
      },
    };
    await adapter.createClass('LocationClass', schema);

    await adapter.createObject('LocationClass', schema, {
      objectId: 'p1',
      location: { __type: 'GeoPoint', latitude: 37.7749, longitude: -122.4194 },
    });
    await adapter.createObject('LocationClass', schema, {
      objectId: 'p2',
      location: { __type: 'GeoPoint', latitude: 40.7128, longitude: -74.006 },
    });

    const res = await adapter.find('LocationClass', schema, {
      location: {
        $nearSphere: { __type: 'GeoPoint', latitude: 37.77, longitude: -122.41 },
        $maxDistance: 0.1,
      },
    });

    expect(res.length).toBe(1);
    expect(res[0].objectId).toBe('p1');
  });

  it('normalizes polygon values for storage and equality queries', async () => {
    const schema = {
      className: 'PolygonClass',
      fields: {
        objectId: { type: 'String' },
        boundary: { type: 'Polygon' },
      },
    };
    const openPolygon = {
      __type: 'Polygon',
      coordinates: [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 0],
      ],
    };
    await adapter.createClass('PolygonClass', schema);
    await adapter.createObject('PolygonClass', schema, {
      objectId: 'poly1',
      boundary: openPolygon,
    });

    const findResults = await adapter.find('PolygonClass', schema, { objectId: 'poly1' });
    expect(findResults.length).toBe(1);
    expect(findResults[0].boundary.coordinates).toEqual([
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ]);

    const equalityResults = await adapter.find('PolygonClass', schema, {
      boundary: openPolygon,
    });
    expect(equalityResults.length).toBe(1);
    expect(equalityResults[0].objectId).toBe('poly1');
  });

  it('supports polygon fields with $geoIntersects point queries', async () => {
    const schema = {
      className: 'PolygonIntersectClass',
      fields: {
        objectId: { type: 'String' },
        boundary: { type: 'Polygon' },
      },
    };
    await adapter.createClass('PolygonIntersectClass', schema);
    await adapter.createObject('PolygonIntersectClass', schema, {
      objectId: 'poly1',
      boundary: {
        __type: 'Polygon',
        coordinates: [
          [0, 0],
          [0, 1],
          [1, 1],
          [1, 0],
        ],
      },
    });
    await adapter.createObject('PolygonIntersectClass', schema, {
      objectId: 'poly2',
      boundary: {
        __type: 'Polygon',
        coordinates: [
          [0, 0],
          [0, 2],
          [2, 2],
          [2, 0],
        ],
      },
    });
    await adapter.createObject('PolygonIntersectClass', schema, {
      objectId: 'poly3',
      boundary: {
        __type: 'Polygon',
        coordinates: [
          [10, 10],
          [10, 15],
          [15, 15],
          [15, 10],
        ],
      },
    });

    const results = await adapter.find('PolygonIntersectClass', schema, {
      boundary: {
        $geoIntersects: {
          $point: {
            __type: 'GeoPoint',
            latitude: 0.5,
            longitude: 0.5,
          },
        },
      },
    });

    expect(results.map(result => result.objectId).sort()).toEqual(['poly1', 'poly2']);
  });

  it('supports idempotency index and uniqueness', async () => {
    const schema = {
      className: 'UniqueClass',
      fields: {
        objectId: { type: 'String' },
        code: { type: 'String' },
      },
    };
    await adapter.createClass('UniqueClass', schema);
    await adapter.ensureUniqueness('UniqueClass', schema, ['code']);

    await adapter.createObject('UniqueClass', schema, { objectId: 'u1', code: 'A1' });

    await expectAsync(
      adapter.createObject('UniqueClass', schema, { objectId: 'u2', code: 'A1' })
    ).toBeRejected();
  });

  it('throws object not found when delete query matches no rows', async () => {
    const schema = {
      className: 'DeleteClass',
      fields: {
        objectId: { type: 'String' },
      },
    };
    await adapter.createClass('DeleteClass', schema);

    await expectAsync(
      adapter.deleteObjectsByQuery('DeleteClass', schema, { objectId: 'missing' })
    ).toBeRejectedWith(new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.'));
  });

  it('rejects degenerate polygon loops', async () => {
    const schema = {
      className: 'DegeneratePolygonClass',
      fields: {
        objectId: { type: 'String' },
        boundary: { type: 'Polygon' },
      },
    };
    await adapter.createClass('DegeneratePolygonClass', schema);

    await expectAsync(
      adapter.createObject('DegeneratePolygonClass', schema, {
        objectId: 'degenerate1',
        boundary: {
          __type: 'Polygon',
          coordinates: [
            [0, 0],
            [0, 1],
            [0, 0],
          ],
        },
      })
    ).toBeRejected();
  });

  it('supports nested array updates on dot notation fields', async () => {
    const schema = {
      className: 'NestedArrayClass',
      fields: {
        objectId: { type: 'String' },
        a: { type: 'Object' },
      },
    };
    await adapter.createClass('NestedArrayClass', schema);
    await adapter.createObject('NestedArrayClass', schema, {
      objectId: 'nested1',
      a: { foo: ['a'] },
    });

    await adapter.updateObjectsByQuery(
      'NestedArrayClass',
      schema,
      { objectId: 'nested1' },
      {
        $addUnique: { 'a.foo': ['a', 'b'] },
      }
    );
    await adapter.updateObjectsByQuery(
      'NestedArrayClass',
      schema,
      { objectId: 'nested1' },
      {
        $add: { 'a.foo': ['c'] },
      }
    );
    await adapter.updateObjectsByQuery(
      'NestedArrayClass',
      schema,
      { objectId: 'nested1' },
      {
        $remove: { 'a.foo': ['a'] },
      }
    );

    const results = await adapter.find('NestedArrayClass', schema, { objectId: 'nested1' });
    expect(results.length).toBe(1);
    expect(results[0].a).toEqual({ foo: ['b', 'c'] });
  });

  it('treats array object equality consistently across key order for addUnique/remove', async () => {
    const schema = {
      className: 'CanonicalArrayClass',
      fields: {
        objectId: { type: 'String' },
        values: { type: 'Array' },
      },
    };
    const originalValue = { alpha: 1, beta: 2 };
    const reorderedValue = { beta: 2, alpha: 1 };
    await adapter.createClass('CanonicalArrayClass', schema);
    await adapter.createObject('CanonicalArrayClass', schema, {
      objectId: 'canonical1',
      values: [originalValue],
    });

    await adapter.updateObjectsByQuery(
      'CanonicalArrayClass',
      schema,
      { objectId: 'canonical1' },
      {
        $addUnique: { values: [reorderedValue] },
      }
    );

    let results = await adapter.find('CanonicalArrayClass', schema, { objectId: 'canonical1' });
    expect(results.length).toBe(1);
    expect(results[0].values).toEqual([originalValue]);

    await adapter.updateObjectsByQuery(
      'CanonicalArrayClass',
      schema,
      { objectId: 'canonical1' },
      {
        $remove: { values: [reorderedValue] },
      }
    );

    results = await adapter.find('CanonicalArrayClass', schema, { objectId: 'canonical1' });
    expect(results.length).toBe(1);
    expect(results[0].values).toEqual([]);
  });

  it('matches pointer values inside array fields and ignores invalid elements', async () => {
    const schema = {
      className: 'PointerArrayClass',
      fields: {
        objectId: { type: 'String' },
        collaborators: { type: 'Array' },
      },
    };
    const userA = {
      __type: 'Pointer',
      className: '_User',
      objectId: 'userA',
    };
    const userB = {
      __type: 'Pointer',
      className: '_User',
      objectId: 'userB',
    };
    await adapter.createClass('PointerArrayClass', schema);
    await adapter.createObject('PointerArrayClass', schema, {
      objectId: 'doc1',
      collaborators: [userA, '', -1, true, [], { invalid: -1 }],
    });

    const matchingResults = await adapter.find('PointerArrayClass', schema, {
      collaborators: { $all: [userA] },
    });
    expect(matchingResults.length).toBe(1);
    expect(matchingResults[0].objectId).toBe('doc1');

    const nonMatchingResults = await adapter.find('PointerArrayClass', schema, {
      collaborators: { $all: [userB] },
    });
    expect(nonMatchingResults.length).toBe(0);
  });

  it('matches pointer values on scalar pointer fields', async () => {
    const schema = {
      className: 'PointerFieldClass',
      fields: {
        objectId: { type: 'String' },
        user: { type: 'Pointer', targetClass: '_User' },
      },
    };
    const userPointer = {
      __type: 'Pointer',
      className: '_User',
      objectId: 'userScalar',
    };
    await adapter.createClass('PointerFieldClass', schema);
    await adapter.createObject('PointerFieldClass', schema, {
      objectId: 'row1',
      user: userPointer,
    });

    const results = await adapter.find('PointerFieldClass', schema, {
      user: userPointer,
    });
    expect(results.length).toBe(1);
    expect(results[0].objectId).toBe('row1');
  });

  it('matches nullish pointer coercions on scalar pointer fields', async () => {
    const schema = {
      className: 'NullPointerFieldClass',
      fields: {
        objectId: { type: 'String' },
        user: { type: 'Pointer', targetClass: '_User' },
      },
    };
    const nullishPointer = {
      __type: 'Pointer',
      className: '_User',
    };
    await adapter.createClass('NullPointerFieldClass', schema);
    await adapter.createObject('NullPointerFieldClass', schema, {
      objectId: 'row1',
      user: nullishPointer,
    });

    const results = await adapter.find('NullPointerFieldClass', schema, {
      user: nullishPointer,
    });
    expect(results.length).toBe(1);
    expect(results[0].objectId).toBe('row1');
    expect(results[0].user).toBeNull();
  });

  it('reuses the sqlite memory database across adapter instances', async () => {
    const sharedPrefix = `shared_${collectionPrefixIndex++}_`;
    const firstAdapter = new SQLiteStorageAdapter({
      uri: 'sqlite://:memory:',
      collectionPrefix: sharedPrefix,
    });
    const secondAdapter = new SQLiteStorageAdapter({
      uri: 'sqlite://:memory:',
      collectionPrefix: sharedPrefix,
    });
    const schema = {
      className: 'SharedMemoryClass',
      fields: {
        objectId: { type: 'String' },
        value: { type: 'String' },
      },
    };

    try {
      await firstAdapter.createClass('SharedMemoryClass', schema);
      await firstAdapter.createObject('SharedMemoryClass', schema, {
        objectId: 'shared1',
        value: 'persisted',
      });
      const results = await secondAdapter.find('SharedMemoryClass', schema, {
        objectId: 'shared1',
      });
      expect(results.length).toBe(1);
      expect(results[0].value).toBe('persisted');
    } finally {
      firstAdapter.handleShutdown();
      secondAdapter.handleShutdown();
    }
  });

  it('prevents SQL injection in dot paths and order params', async () => {
    const schema = {
      className: 'InjectionClass',
      fields: {
        objectId: { type: 'String' },
        data: { type: 'Object' },
        name: { type: 'String' },
      },
    };
    await adapter.createClass('InjectionClass', schema);
    await adapter.createObject('InjectionClass', schema, {
      objectId: 'inj1',
      data: { sub: 'val' },
      name: 'safe',
    });

    const maliciousOrder = "data.sub' ASC; DROP TABLE \"test_InjectionClass\";--";
    try {
      await adapter.find('InjectionClass', schema, {}, { sort: { [maliciousOrder]: 1 } });
    } catch {
      /* */
    }

    const exists = await adapter.classExists('InjectionClass');
    expect(exists).toBe(true);
  });
});
