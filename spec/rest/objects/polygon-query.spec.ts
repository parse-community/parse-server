// Point-in-polygon ($geoIntersects / $point) queries and their validation errors.
// Ported from spec/ParsePolygon.spec.js ("with location" suite). Regression
// coverage for #4608 (coordinate order must not be reversed on query).
import { createObject, createObjects, find } from '../../helpers/client.ts';
import { geoPoint, polygon, geoIntersects } from '../../helpers/geo.ts';
import { expectParseError } from '../../helpers/request.ts';

describe('Polygon $geoIntersects REST', () => {
  it('finds polygons that contain the point', async () => {
    await createObjects('TestObject', [
      { boundary: polygon([[0, 0], [0, 1], [1, 1], [1, 0]]) },
      { boundary: polygon([[0, 0], [0, 2], [2, 2], [2, 0]]) },
      { boundary: polygon([[10, 10], [10, 15], [15, 15], [15, 10], [10, 10]]) },
    ]);
    const results = await find('TestObject', {
      where: { boundary: geoIntersects(geoPoint(0.5, 0.5)) },
    });
    expect(results.length).toEqual(2);
  });

  it('does not reverse the point coordinates (regression #4608)', async () => {
    await createObjects('TestObject', [
      { boundary: polygon([[0.25, 0], [0.25, 1.25], [0.75, 1.25], [0.75, 0]]) },
      { boundary: polygon([[0, 0], [0, 2], [2, 2], [2, 0]]) },
      { boundary: polygon([[10, 10], [10, 15], [15, 15], [15, 10], [10, 10]]) },
    ]);
    const results = await find('TestObject', {
      where: { boundary: geoIntersects(geoPoint(0.5, 1.0)) },
    });
    expect(results.length).toEqual(2);
  });

  it('matches a real-world polygon (regression #4608)', async () => {
    const detroit = [
      [42.631655189280224, -83.78406753121705],
      [42.633047793854814, -83.75333640366955],
      [42.61625254348911, -83.75149921669944],
      [42.61526926650296, -83.78161794858735],
      [42.631655189280224, -83.78406753121705],
    ];
    await createObject('TestObject', { boundary: polygon(detroit) });
    const results = await find('TestObject', {
      where: { boundary: geoIntersects(geoPoint(42.624599, -83.770162)) },
    });
    expect(results.length).toEqual(1);
  });

  it('rejects an out-of-bounds point', async () => {
    await createObject('TestObject', {
      boundary: polygon([[0, 0], [0, 1], [1, 1], [1, 0]]),
    });
    await expectParseError(
      find('TestObject', { where: { boundary: geoIntersects(geoPoint(181, 181)) } })
    );
  });

  it('rejects a malformed point', async () => {
    await createObject('TestObject', {
      boundary: polygon([[0, 0], [0, 1], [1, 1], [1, 0]]),
    });
    await expectParseError(
      find('TestObject', { where: { boundary: geoIntersects([]) } })
    );
  });
});
