// Polygon storage internals on MongoDB: GeoJSON coordinate order and 2d/2dsphere
// index support. Ported from spec/ParsePolygon.spec.js. Objects are created over
// REST, but the assertions reach into the database adapter (raw stored documents
// and index metadata) because those have no REST surface.
import { createObject, getObject } from '../../helpers/client.ts';
import { geoPoint, polygon } from '../../helpers/geo.ts';
import { expectParseError } from '../../helpers/request.ts';

const Config = require('../../../lib/Config');

describe_only_db('mongo')('Polygon storage (MongoDB) REST', () => {
  let config: any;

  beforeEach(() => {
    config = Config.get('test');
    config.schemaCache.clear();
  });

  it('supports 2d and 2dsphere indexes', async () => {
    const coords = [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ];
    const location = geoPoint(10, 10);
    // Dedicated class so the index set is deterministic and not polluted by the
    // 2dsphere indexes other polygon tests auto-create on a shared class.
    const className = 'PolygonIndexTest';
    const databaseAdapter = config.database.adapter;
    await databaseAdapter.createIndex(className, { location: '2d' });
    await databaseAdapter.createIndex(className, { polygon: '2dsphere' });

    const created = await createObject(className, {
      location,
      polygon: polygon(coords),
      polygon2: polygon(coords),
    });
    const result = await getObject(className, created.objectId);
    expect(result.location).toEqual(location);
    expect(result.polygon).toEqual({ __type: 'Polygon', coordinates: coords });
    expect(result.polygon2).toEqual({ __type: 'Polygon', coordinates: coords });

    // location -> 2d, polygon -> 2dsphere (explicit), polygon2 -> 2dsphere
    // (auto-created on save). Assert presence rather than enumeration order.
    const indexes = await databaseAdapter.getIndexes(className);
    const keys = indexes.map((i: any) => i.key);
    expect(indexes.length).toEqual(4);
    expect(keys).toContain({ _id: 1 });
    expect(keys).toContain({ location: '2d' });
    expect(keys).toContain({ polygon: '2dsphere' });
    expect(keys).toContain({ polygon2: '2dsphere' });
  });

  it('stores coordinates as GeoJSON (longitude, latitude) closed rings', async () => {
    const input = [
      [12, 11],
      [14, 13],
      [16, 15],
      [18, 17],
    ];
    const expected = [
      [
        [11, 12],
        [13, 14],
        [15, 16],
        [17, 18],
        [11, 12],
      ],
    ];
    const created = await createObject('TestObject', { polygon: polygon(input) });
    const raw = await config.database.adapter._rawFind('TestObject', { _id: created.objectId });
    expect(raw.length).toEqual(1);
    expect(raw[0].polygon.coordinates).toEqual(expected);
  });

  it('rejects a self-intersecting polygon', async () => {
    const coords = [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ];
    await expectParseError(createObject('TestObject', { polygon: polygon(coords) }));
  });
});
