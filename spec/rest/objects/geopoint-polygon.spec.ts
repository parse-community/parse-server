// withinPolygon ($geoWithin / $polygon) queries and their validation errors.
// Ported from spec/ParseGeoPoint.spec.js.
import { createObject, createObjects, find } from '../../helpers/client.ts';
import { geoPoint, withinPolygon } from '../../helpers/geo.ts';
import { expectParseError } from '../../helpers/request.ts';
import { ParseError } from '../../helpers/errors.ts';

function seedPolygonPoints() {
  return createObjects('Polygon', [
    { location: geoPoint(1.5, 1.5) }, // inbound
    { location: geoPoint(10, 10) }, // onbound
    { location: geoPoint(20, 20) }, // outbound
  ]);
}

describe('withinPolygon REST', () => {
  it_id('d9fbc5c6-f767-47d6-bb44-3858eb9df15a')(it)('supports withinPolygon open path', async () => {
    await seedPolygonPoints();
    const results = await find('Polygon', {
      where: {
        location: withinPolygon([
          geoPoint(0, 0),
          geoPoint(0, 10),
          geoPoint(10, 10),
          geoPoint(10, 0),
        ]),
      },
    });
    expect(results.length).toEqual(2);
  });

  it_id('3ec537bd-839a-4c93-a48b-b4a249820074')(it)('supports withinPolygon closed path', async () => {
    await seedPolygonPoints();
    const results = await find('Polygon', {
      where: {
        location: withinPolygon([
          geoPoint(0, 0),
          geoPoint(0, 10),
          geoPoint(10, 10),
          geoPoint(10, 0),
          geoPoint(0, 0),
        ]),
      },
    });
    expect(results.length).toEqual(2);
  });

  it_id('0a248e11-3598-480a-9ab5-8a0b259258e4')(it)('supports withinPolygon Polygon object', async () => {
    await seedPolygonPoints();
    const polygon = {
      __type: 'Polygon',
      coordinates: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
    };
    const results = await find('Polygon', { where: { location: withinPolygon(polygon) } });
    expect(results.length).toEqual(2);
  });

  it('invalid Polygon object withinPolygon', async () => {
    await createObject('Polygon', { location: geoPoint(1.5, 1.5) });
    const polygon = { __type: 'Polygon', coordinates: [[0, 0], [10, 0]] };
    await expectParseError(
      find('Polygon', { where: { location: withinPolygon(polygon) } }),
      ParseError.INVALID_JSON
    );
  });

  it('out of bounds Polygon object withinPolygon', async () => {
    await createObject('Polygon', { location: geoPoint(1.5, 1.5) });
    const polygon = { __type: 'Polygon', coordinates: [[0, 0], [181, 0], [0, 10]] };
    await expectParseError(
      find('Polygon', { where: { location: withinPolygon(polygon) } }),
      ParseError.INTERNAL_SERVER_ERROR
    );
  });

  it('invalid input withinPolygon', async () => {
    await createObject('Polygon', { location: geoPoint(1.5, 1.5) });
    await expectParseError(
      find('Polygon', { where: { location: withinPolygon(1234) } }),
      ParseError.INVALID_JSON
    );
  });

  it('invalid geoPoint withinPolygon', async () => {
    await createObject('Polygon', { location: geoPoint(1.5, 1.5) });
    await expectParseError(
      find('Polygon', { where: { location: withinPolygon([{}]) } }),
      ParseError.INVALID_JSON
    );
  });

  it('invalid latitude withinPolygon', async () => {
    await createObject('Polygon', { location: geoPoint(1.5, 1.5) });
    await expectParseError(
      find('Polygon', {
        where: { location: withinPolygon([geoPoint(0, 0), geoPoint(181, 0), geoPoint(0, 0)]) },
      }),
      ParseError.INTERNAL_SERVER_ERROR
    );
  });

  it('invalid longitude withinPolygon', async () => {
    await createObject('Polygon', { location: geoPoint(1.5, 1.5) });
    await expectParseError(
      find('Polygon', {
        where: { location: withinPolygon([geoPoint(0, 0), geoPoint(0, 181), geoPoint(0, 0)]) },
      }),
      ParseError.INTERNAL_SERVER_ERROR
    );
  });

  it('minimum 3 points withinPolygon', async () => {
    await createObject('Polygon', { location: geoPoint(1.5, 1.5) });
    await expectParseError(
      find('Polygon', { where: { location: withinPolygon([]) } }),
      ParseError.INVALID_JSON
    );
  });
});
