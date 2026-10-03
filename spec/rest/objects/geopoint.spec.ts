// GeoPoint object lifecycle over REST (save / get / update / type errors).
// Ported from spec/ParseGeoPoint.spec.js (originally hungry/js geo point tests).
import { createObject, getObject, updateObject, find } from '../../helpers/client.ts';
import { geoPoint } from '../../helpers/geo.ts';
import { expectParseError } from '../../helpers/request.ts';
import { ParseError } from '../../helpers/errors.ts';

describe('GeoPoint REST', () => {
  it('geo point roundtrip', async () => {
    const created = await createObject('TestObject', {
      location: geoPoint(44.0, -11.0),
      name: 'Ferndale',
    });
    const result = await getObject('TestObject', created.objectId);
    expect(result.location).toBeTruthy();
    expect(result.location.latitude).toEqual(44.0);
    expect(result.location.longitude).toEqual(-11.0);
  });

  it('update geopoint', async () => {
    const created = await createObject('TestObject', { location: geoPoint(44.0, -11.0) });
    await updateObject('TestObject', created.objectId, { location: geoPoint(24.0, 19.0) });
    const result = await getObject('TestObject', created.objectId);
    expect(result.location.latitude).toEqual(24.0);
    expect(result.location.longitude).toEqual(19.0);
  });

  it('has the correct __type field in the json response', async () => {
    const created = await createObject('TestObject', {
      location: geoPoint(44.0, -11.0),
      name: 'Zhoul',
    });
    const result = await getObject('TestObject', created.objectId);
    expect(result.location.__type).toEqual('GeoPoint');
  });

  it('creating geo point exception two fields', async () => {
    const point = geoPoint(20, 20);
    await expectParseError(
      createObject('TestObject', { locationOne: point, locationTwo: point }),
      ParseError.INCORRECT_TYPE
    );
  });

  // TODO: This should also have support in postgres, or higher level database agnostic support.
  it_exclude_dbs(['postgres'])('updating geo point exception two fields', async () => {
    const point = geoPoint(20, 20);
    const created = await createObject('TestObject', { locationOne: point });
    await expectParseError(
      updateObject('TestObject', created.objectId, { locationTwo: point }),
      ParseError.INCORRECT_TYPE
    );
  });

  it('supports a sub-object with a geo point', async () => {
    await createObject('TestObject', {
      subobject: { location: geoPoint(44.0, -11.0) },
      tag: 'subobject-geo',
    });
    const results = await find('TestObject', { where: { tag: 'subobject-geo' } });
    expect(results.length).toEqual(1);
    const pointAgain = results[0].subobject.location;
    expect(pointAgain).toBeTruthy();
    expect(pointAgain.latitude).toEqual(44.0);
    expect(pointAgain.longitude).toEqual(-11.0);
  });

  it('supports array of geo points', async () => {
    const point1 = geoPoint(44.0, -11.0);
    const point2 = geoPoint(22.0, -55.0);
    await createObject('TestObject', { locations: [point1, point2], tag: 'array-geo' });
    const results = await find('TestObject', { where: { tag: 'array-geo' } });
    expect(results.length).toEqual(1);
    const locations = results[0].locations;
    expect(locations.length).toEqual(2);
    expect(locations[0]).toEqual(point1);
    expect(locations[1]).toEqual(point2);
  });
});
