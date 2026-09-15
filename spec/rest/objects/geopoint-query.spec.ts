// GeoPoint proximity / distance / equality queries over REST.
// Ported from spec/ParseGeoPoint.spec.js.
import { createObject, createObjects, find, count } from '../../helpers/client.ts';
import {
  geoPoint,
  near,
  withinRadians,
  withinMiles,
  withinKilometers,
  withinGeoBox,
  notEqualTo,
} from '../../helpers/geo.ts';

// Three well-known cities used across the distance assertions.
function makeSomeGeoPoints() {
  return createObjects('TestObject', [
    { location: geoPoint(38.52, -121.5), name: 'Sacramento' },
    { location: geoPoint(37.75, -122.68), name: 'San Francisco' },
    { location: geoPoint(21.35, -157.93), name: 'Honolulu' },
  ]);
}

const SFO = geoPoint(37.6189722, -122.3748889);

describe('GeoPoint query REST', () => {
  it_id('bbd9e2f6-7f61-458f-98f2-4a563586cd8d')(it)('geo line', async () => {
    const objects = [];
    for (let i = 0; i < 10; ++i) {
      objects.push({ location: geoPoint(i * 4.0 - 12.0, i * 3.2 - 11.0), construct: 'line', seq: i });
    }
    await createObjects('TestObject', objects);
    const results = await find('TestObject', {
      where: { construct: 'line', location: withinMiles(geoPoint(24, 19), 10000) },
    });
    expect(results.length).toEqual(10);
    expect(results[0].seq).toEqual(9);
    expect(results[3].seq).toEqual(6);
  });

  it('geo max distance large', async () => {
    await createObjects('TestObject', [0, 1, 2].map(i => ({ location: geoPoint(0.0, i * 45.0), index: i })));
    const results = await find('TestObject', {
      where: { location: withinRadians(geoPoint(1.0, -1.0), 3.14) },
    });
    expect(results.length).toEqual(3);
  });

  it_id('e1e86b38-b8a4-4109-8330-a324fe628e0c')(it)('geo max distance medium', async () => {
    await createObjects('TestObject', [0, 1, 2].map(i => ({ location: geoPoint(0.0, i * 45.0), index: i })));
    const results = await find('TestObject', {
      where: { location: withinRadians(geoPoint(1.0, -1.0), 3.14 * 0.5) },
    });
    expect(results.length).toEqual(2);
    expect(results[0].index).toEqual(0);
    expect(results[1].index).toEqual(1);
  });

  it('geo max distance small', async () => {
    await createObjects('TestObject', [0, 1, 2].map(i => ({ location: geoPoint(0.0, i * 45.0), index: i })));
    const results = await find('TestObject', {
      where: { location: withinRadians(geoPoint(1.0, -1.0), 3.14 * 0.25) },
    });
    expect(results.length).toEqual(1);
    expect(results[0].index).toEqual(0);
  });

  it('geo max distance in km everywhere', async () => {
    await makeSomeGeoPoints();
    // Honolulu is ~4300 km from SFO on a sphere.
    const results = await find('TestObject', { where: { location: withinKilometers(SFO, 4800.0) } });
    expect(results.length).toEqual(3);
  });

  it_id('05f1a454-56b1-4f2e-908e-408a9222cbae')(it)('geo max distance in km california', async () => {
    await makeSomeGeoPoints();
    const results = await find('TestObject', { where: { location: withinKilometers(SFO, 3700.0) } });
    expect(results.length).toEqual(2);
    expect(results[0].name).toEqual('San Francisco');
    expect(results[1].name).toEqual('Sacramento');
  });

  it('geo max distance in km bay area', async () => {
    await makeSomeGeoPoints();
    const results = await find('TestObject', { where: { location: withinKilometers(SFO, 100.0) } });
    expect(results.length).toEqual(1);
    expect(results[0].name).toEqual('San Francisco');
  });

  it('geo max distance in km mid peninsula', async () => {
    await makeSomeGeoPoints();
    const results = await find('TestObject', { where: { location: withinKilometers(SFO, 10.0) } });
    expect(results.length).toEqual(0);
  });

  it('geo max distance in miles everywhere', async () => {
    await makeSomeGeoPoints();
    const results = await find('TestObject', { where: { location: withinMiles(SFO, 2600.0) } });
    expect(results.length).toEqual(3);
  });

  it_id('9ee376ad-dd6c-4c17-ad28-c7899a4411f1')(it)('geo max distance in miles california', async () => {
    await makeSomeGeoPoints();
    const results = await find('TestObject', { where: { location: withinMiles(SFO, 2200.0) } });
    expect(results.length).toEqual(2);
    expect(results[0].name).toEqual('San Francisco');
    expect(results[1].name).toEqual('Sacramento');
  });

  it('geo max distance in miles bay area', async () => {
    await makeSomeGeoPoints();
    const results = await find('TestObject', { where: { location: withinMiles(SFO, 62.0) } });
    expect(results.length).toEqual(1);
    expect(results[0].name).toEqual('San Francisco');
  });

  it('geo max distance in miles mid peninsula', async () => {
    await makeSomeGeoPoints();
    const results = await find('TestObject', { where: { location: withinMiles(SFO, 10.0) } });
    expect(results.length).toEqual(0);
  });

  it_id('9e35a89e-bc2c-4ec5-b25a-8d1890a55233')(it)('returns nearest location', async () => {
    await makeSomeGeoPoints();
    const results = await find('TestObject', { where: { location: near(SFO) } });
    expect(results[0].name).toEqual('San Francisco');
    expect(results[1].name).toEqual('Sacramento');
  });

  it_id('6df434b0-142d-4302-bbc6-a6ec5a9d9c68')(it)('works with geobox queries', async () => {
    await createObjects('TestObject', [
      { location: geoPoint(1.5, 1.5) },
      { location: geoPoint(10, 10) },
      { location: geoPoint(20, 20) },
    ]);
    const results = await find('TestObject', {
      where: { location: withinGeoBox(geoPoint(0, 0), geoPoint(10, 10)) },
    });
    expect(results.length).toEqual(2);
  });

  it('equalTo geopoint', async () => {
    const point = geoPoint(44.0, -11.0);
    await createObject('TestObject', { location: point });
    const results = await find('TestObject', { where: { location: point } });
    expect(results.length).toEqual(1);
    expect(results[0].location.latitude).toEqual(44.0);
    expect(results[0].location.longitude).toEqual(-11.0);
  });

  it('withinKilometers supports count', async () => {
    const inside = geoPoint(10, 10);
    await createObjects('TestObject', [{ location: inside }, { location: geoPoint(20, 20) }]);
    const total = await count('TestObject', { where: { location: withinKilometers(inside, 5) } });
    expect(total).toEqual(1);
  });

  it_id('0b073d31-0d41-41e7-bd60-f636ffb759dc')(it)('withinKilometers complex supports count', async () => {
    const inside = geoPoint(10, 10);
    const middle = geoPoint(20, 20);
    await createObjects('TestObject', [
      { location: inside },
      { location: middle },
      { location: geoPoint(30, 30) },
    ]);
    const total = await count('TestObject', {
      where: {
        $or: [
          { location: withinKilometers(inside, 5) },
          { location: withinKilometers(middle, 5) },
        ],
      },
    });
    expect(total).toEqual(2);
  });

  it_id('26c9a13d-3d71-452e-a91c-9a4589be021c')(it)(
    'fails to fetch geopoints that are specifically not at (0,0)',
    async () => {
      await createObjects('TestObject', [
        { location: geoPoint(0, 0) },
        { location: geoPoint(49.2577142, -123.1941149) },
      ]);
      const results = await find('TestObject', {
        where: { location: notEqualTo(geoPoint(0, 0)) },
      });
      expect(results.length).toEqual(1);
    }
  );
});
