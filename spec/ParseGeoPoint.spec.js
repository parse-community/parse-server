// This is a port of the test suite:
// hungry/js/test/parse_geo_point_test.js

const request = require('../lib/request');
const TestObject = Parse.Object.extend('TestObject');

describe('Parse.GeoPoint testing', () => {
  it('geo point roundtrip', async () => {
    const point = new Parse.GeoPoint(44.0, -11.0);
    const obj = new TestObject();
    obj.set('location', point);
    obj.set('name', 'Ferndale');
    await obj.save();
    const result = await new Parse.Query(TestObject).get(obj.id);
    const pointAgain = result.get('location');
    ok(pointAgain);
    equal(pointAgain.latitude, 44.0);
    equal(pointAgain.longitude, -11.0);
  });

  it('update geopoint', done => {
    const oldPoint = new Parse.GeoPoint(44.0, -11.0);
    const newPoint = new Parse.GeoPoint(24.0, 19.0);
    const obj = new TestObject();
    obj.set('location', oldPoint);
    obj
      .save()
      .then(() => {
        obj.set('location', newPoint);
        return obj.save();
      })
      .then(() => {
        const query = new Parse.Query(TestObject);
        return query.get(obj.id);
      })
      .then(result => {
        const point = result.get('location');
        equal(point.latitude, newPoint.latitude);
        equal(point.longitude, newPoint.longitude);
        done();
      });
  });

  it('has the correct __type field in the json response', async done => {
    const point = new Parse.GeoPoint(44.0, -11.0);
    const obj = new TestObject();
    obj.set('location', point);
    obj.set('name', 'Zhoul');
    await obj.save();
    request({
      url: 'http://localhost:8378/1/classes/TestObject/' + obj.id,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
      },
    }).then(response => {
      equal(response.data.location.__type, 'GeoPoint');
      done();
    });
  });

  it('creating geo point exception two fields', done => {
    const point = new Parse.GeoPoint(20, 20);
    const obj = new TestObject();
    obj.set('locationOne', point);
    obj.set('locationTwo', point);
    obj.save().then(
      () => {
        fail('expected error');
      },
      err => {
        equal(err.code, Parse.Error.INCORRECT_TYPE);
        done();
      }
    );
  });

  // TODO: This should also have support in postgres, or higher level database agnostic support.
  it_exclude_dbs(['postgres'])('updating geo point exception two fields', async done => {
    const point = new Parse.GeoPoint(20, 20);
    const obj = new TestObject();
    obj.set('locationOne', point);
    await obj.save();
    obj.set('locationTwo', point);
    obj.save().then(
      () => {
        fail('expected error');
      },
      err => {
        equal(err.code, Parse.Error.INCORRECT_TYPE);
        done();
      }
    );
  });

  it_id('bbd9e2f6-7f61-458f-98f2-4a563586cd8d')(it)('geo line', async done => {
    const line = [];
    for (let i = 0; i < 10; ++i) {
      const obj = new TestObject();
      const point = new Parse.GeoPoint(i * 4.0 - 12.0, i * 3.2 - 11.0);
      obj.set('location', point);
      obj.set('construct', 'line');
      obj.set('seq', i);
      line.push(obj);
    }
    await Parse.Object.saveAll(line);
    const query = new Parse.Query(TestObject);
    const point = new Parse.GeoPoint(24, 19);
    query.equalTo('construct', 'line');
    query.withinMiles('location', point, 10000);
    const results = await query.find();
    equal(results.length, 10);
    equal(results[0].get('seq'), 9);
    equal(results[3].get('seq'), 6);
    done();
  });

  it('geo max distance large', done => {
    const objects = [];
    [0, 1, 2].map(function (i) {
      const obj = new TestObject();
      const point = new Parse.GeoPoint(0.0, i * 45.0);
      obj.set('location', point);
      obj.set('index', i);
      objects.push(obj);
    });
    Parse.Object.saveAll(objects)
      .then(() => {
        const query = new Parse.Query(TestObject);
        const point = new Parse.GeoPoint(1.0, -1.0);
        query.withinRadians('location', point, 3.14);
        return query.find();
      })
      .then(
        results => {
          equal(results.length, 3);
          done();
        },
        err => {
          fail("Couldn't query GeoPoint");
          jfail(err);
        }
      );
  });

  it_id('e1e86b38-b8a4-4109-8330-a324fe628e0c')(it)('geo max distance medium', async () => {
    const objects = [];
    [0, 1, 2].map(function (i) {
      const obj = new TestObject();
      const point = new Parse.GeoPoint(0.0, i * 45.0);
      obj.set('location', point);
      obj.set('index', i);
      objects.push(obj);
    });
    await Parse.Object.saveAll(objects);
    const query = new Parse.Query(TestObject);
    const point = new Parse.GeoPoint(1.0, -1.0);
    query.withinRadians('location', point, 3.14 * 0.5);
    const results = await query.find();
    equal(results.length, 2);
    equal(results[0].get('index'), 0);
    equal(results[1].get('index'), 1);
  });

  it('geo max distance small', async () => {
    const objects = [];
    [0, 1, 2].map(function (i) {
      const obj = new TestObject();
      const point = new Parse.GeoPoint(0.0, i * 45.0);
      obj.set('location', point);
      obj.set('index', i);
      objects.push(obj);
    });
    await Parse.Object.saveAll(objects);
    const query = new Parse.Query(TestObject);
    const point = new Parse.GeoPoint(1.0, -1.0);
    query.withinRadians('location', point, 3.14 * 0.25);
    const results = await query.find();
    equal(results.length, 1);
    equal(results[0].get('index'), 0);
  });

  const makeSomeGeoPoints = function () {
    const sacramento = new TestObject();
    sacramento.set('location', new Parse.GeoPoint(38.52, -121.5));
    sacramento.set('name', 'Sacramento');

    const honolulu = new TestObject();
    honolulu.set('location', new Parse.GeoPoint(21.35, -157.93));
    honolulu.set('name', 'Honolulu');

    const sf = new TestObject();
    sf.set('location', new Parse.GeoPoint(37.75, -122.68));
    sf.set('name', 'San Francisco');

    return Parse.Object.saveAll([sacramento, sf, honolulu]);
  };

  it('geo max distance in km everywhere', async done => {
    await makeSomeGeoPoints();
    const sfo = new Parse.GeoPoint(37.6189722, -122.3748889);
    const query = new Parse.Query(TestObject);
    // Honolulu is 4300 km away from SFO on a sphere ;)
    query.withinKilometers('location', sfo, 4800.0);
    const results = await query.find();
    equal(results.length, 3);
    done();
  });

  it_id('05f1a454-56b1-4f2e-908e-408a9222cbae')(it)('geo max distance in km california', async () => {
    await makeSomeGeoPoints();
    const sfo = new Parse.GeoPoint(37.6189722, -122.3748889);
    const query = new Parse.Query(TestObject);
    query.withinKilometers('location', sfo, 3700.0);
    const results = await query.find();
    equal(results.length, 2);
    equal(results[0].get('name'), 'San Francisco');
    equal(results[1].get('name'), 'Sacramento');
  });

  it('geo max distance in km bay area', async () => {
    await makeSomeGeoPoints();
    const sfo = new Parse.GeoPoint(37.6189722, -122.3748889);
    const query = new Parse.Query(TestObject);
    query.withinKilometers('location', sfo, 100.0);
    const results = await query.find();
    equal(results.length, 1);
    equal(results[0].get('name'), 'San Francisco');
  });

  it('geo max distance in km mid peninsula', async () => {
    await makeSomeGeoPoints();
    const sfo = new Parse.GeoPoint(37.6189722, -122.3748889);
    const query = new Parse.Query(TestObject);
    query.withinKilometers('location', sfo, 10.0);
    const results = await query.find();
    equal(results.length, 0);
  });

  it('geo max distance in miles everywhere', async () => {
    await makeSomeGeoPoints();
    const sfo = new Parse.GeoPoint(37.6189722, -122.3748889);
    const query = new Parse.Query(TestObject);
    query.withinMiles('location', sfo, 2600.0);
    const results = await query.find();
    equal(results.length, 3);
  });

  it_id('9ee376ad-dd6c-4c17-ad28-c7899a4411f1')(it)('geo max distance in miles california', async () => {
    await makeSomeGeoPoints();
    const sfo = new Parse.GeoPoint(37.6189722, -122.3748889);
    const query = new Parse.Query(TestObject);
    query.withinMiles('location', sfo, 2200.0);
    const results = await query.find();
    equal(results.length, 2);
    equal(results[0].get('name'), 'San Francisco');
    equal(results[1].get('name'), 'Sacramento');
  });

  it('geo max distance in miles bay area', async () => {
    await makeSomeGeoPoints();
    const sfo = new Parse.GeoPoint(37.6189722, -122.3748889);
    const query = new Parse.Query(TestObject);
    query.withinMiles('location', sfo, 62.0);
    const results = await query.find();
    equal(results.length, 1);
    equal(results[0].get('name'), 'San Francisco');
  });

  it('geo max distance in miles mid peninsula', async () => {
    await makeSomeGeoPoints();
    const sfo = new Parse.GeoPoint(37.6189722, -122.3748889);
    const query = new Parse.Query(TestObject);
    query.withinMiles('location', sfo, 10.0);
    const results = await query.find();
    equal(results.length, 0);
  });

  it_id('9e35a89e-bc2c-4ec5-b25a-8d1890a55233')(it)('returns nearest location', async () => {
    await makeSomeGeoPoints();
    const sfo = new Parse.GeoPoint(37.6189722, -122.3748889);
    const query = new Parse.Query(TestObject);
    query.near('location', sfo);
    const results = await query.find();
    equal(results[0].get('name'), 'San Francisco');
    equal(results[1].get('name'), 'Sacramento');
  });

  it_id('6df434b0-142d-4302-bbc6-a6ec5a9d9c68')(it)('works with geobox queries', done => {
    const inbound = new Parse.GeoPoint(1.5, 1.5);
    const onbound = new Parse.GeoPoint(10, 10);
    const outbound = new Parse.GeoPoint(20, 20);
    const obj1 = new Parse.Object('TestObject', { location: inbound });
    const obj2 = new Parse.Object('TestObject', { location: onbound });
    const obj3 = new Parse.Object('TestObject', { location: outbound });
    Parse.Object.saveAll([obj1, obj2, obj3])
      .then(() => {
        const sw = new Parse.GeoPoint(0, 0);
        const ne = new Parse.GeoPoint(10, 10);
        const query = new Parse.Query(TestObject);
        query.withinGeoBox('location', sw, ne);
        return query.find();
      })
      .then(results => {
        equal(results.length, 2);
        done();
      });
  });

  it('supports a sub-object with a geo point', async () => {
    const point = new Parse.GeoPoint(44.0, -11.0);
    const obj = new TestObject();
    obj.set('subobject', { location: point });
    await obj.save();
    const query = new Parse.Query(TestObject);
    const results = await query.find();
    equal(results.length, 1);
    const pointAgain = results[0].get('subobject')['location'];
    ok(pointAgain);
    equal(pointAgain.latitude, 44.0);
    equal(pointAgain.longitude, -11.0);
  });

  it('supports array of geo points', async () => {
    const point1 = new Parse.GeoPoint(44.0, -11.0);
    const point2 = new Parse.GeoPoint(22.0, -55.0);
    const obj = new TestObject();
    obj.set('locations', [point1, point2]);
    await obj.save();
    const query = new Parse.Query(TestObject);
    const results = await query.find();
    equal(results.length, 1);
    const locations = results[0].get('locations');
    expect(locations.length).toEqual(2);
    expect(locations[0]).toEqual(point1);
    expect(locations[1]).toEqual(point2);
  });

  it('equalTo geopoint', done => {
    const point = new Parse.GeoPoint(44.0, -11.0);
    const obj = new TestObject();
    obj.set('location', point);
    obj
      .save()
      .then(() => {
        const query = new Parse.Query(TestObject);
        query.equalTo('location', point);
        return query.find();
      })
      .then(results => {
        equal(results.length, 1);
        const loc = results[0].get('location');
        equal(loc.latitude, point.latitude);
        equal(loc.longitude, point.longitude);
        done();
      });
  });

  it_id('d9fbc5c6-f767-47d6-bb44-3858eb9df15a')(it)('supports withinPolygon open path', done => {
    const inbound = new Parse.GeoPoint(1.5, 1.5);
    const onbound = new Parse.GeoPoint(10, 10);
    const outbound = new Parse.GeoPoint(20, 20);
    const obj1 = new Parse.Object('Polygon', { location: inbound });
    const obj2 = new Parse.Object('Polygon', { location: onbound });
    const obj3 = new Parse.Object('Polygon', { location: outbound });
    Parse.Object.saveAll([obj1, obj2, obj3])
      .then(() => {
        const where = {
          location: {
            $geoWithin: {
              $polygon: [
                { __type: 'GeoPoint', latitude: 0, longitude: 0 },
                { __type: 'GeoPoint', latitude: 0, longitude: 10 },
                { __type: 'GeoPoint', latitude: 10, longitude: 10 },
                { __type: 'GeoPoint', latitude: 10, longitude: 0 },
              ],
            },
          },
        };
        return request({
          method: 'POST',
          url: Parse.serverURL + '/classes/Polygon',
          body: { where, _method: 'GET' },
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-Javascript-Key': Parse.javaScriptKey,
            'Content-Type': 'application/json',
          },
        });
      })
      .then(resp => {
        expect(resp.data.results.length).toBe(2);
        done();
      }, done.fail);
  });

  it_id('3ec537bd-839a-4c93-a48b-b4a249820074')(it)('supports withinPolygon closed path', done => {
    const inbound = new Parse.GeoPoint(1.5, 1.5);
    const onbound = new Parse.GeoPoint(10, 10);
    const outbound = new Parse.GeoPoint(20, 20);
    const obj1 = new Parse.Object('Polygon', { location: inbound });
    const obj2 = new Parse.Object('Polygon', { location: onbound });
    const obj3 = new Parse.Object('Polygon', { location: outbound });
    Parse.Object.saveAll([obj1, obj2, obj3])
      .then(() => {
        const where = {
          location: {
            $geoWithin: {
              $polygon: [
                { __type: 'GeoPoint', latitude: 0, longitude: 0 },
                { __type: 'GeoPoint', latitude: 0, longitude: 10 },
                { __type: 'GeoPoint', latitude: 10, longitude: 10 },
                { __type: 'GeoPoint', latitude: 10, longitude: 0 },
                { __type: 'GeoPoint', latitude: 0, longitude: 0 },
              ],
            },
          },
        };
        return request({
          method: 'POST',
          url: Parse.serverURL + '/classes/Polygon',
          body: { where, _method: 'GET' },
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-Javascript-Key': Parse.javaScriptKey,
            'Content-Type': 'application/json',
          },
        });
      })
      .then(resp => {
        expect(resp.data.results.length).toBe(2);
        done();
      }, done.fail);
  });

  it_id('0a248e11-3598-480a-9ab5-8a0b259258e4')(it)('supports withinPolygon Polygon object', done => {
    const inbound = new Parse.GeoPoint(1.5, 1.5);
    const onbound = new Parse.GeoPoint(10, 10);
    const outbound = new Parse.GeoPoint(20, 20);
    const obj1 = new Parse.Object('Polygon', { location: inbound });
    const obj2 = new Parse.Object('Polygon', { location: onbound });
    const obj3 = new Parse.Object('Polygon', { location: outbound });
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
    Parse.Object.saveAll([obj1, obj2, obj3])
      .then(() => {
        const where = {
          location: {
            $geoWithin: {
              $polygon: polygon,
            },
          },
        };
        return request({
          method: 'POST',
          url: Parse.serverURL + '/classes/Polygon',
          body: { where, _method: 'GET' },
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-Javascript-Key': Parse.javaScriptKey,
            'Content-Type': 'application/json',
          },
        });
      })
      .then(resp => {
        expect(resp.data.results.length).toBe(2);
        done();
      }, done.fail);
  });

  it('invalid Polygon object withinPolygon', done => {
    const point = new Parse.GeoPoint(1.5, 1.5);
    const obj = new Parse.Object('Polygon', { location: point });
    const polygon = {
      __type: 'Polygon',
      coordinates: [
        [0, 0],
        [10, 0],
      ],
    };
    obj
      .save()
      .then(() => {
        const where = {
          location: {
            $geoWithin: {
              $polygon: polygon,
            },
          },
        };
        return request({
          method: 'POST',
          url: Parse.serverURL + '/classes/Polygon',
          body: { where, _method: 'GET' },
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-Javascript-Key': Parse.javaScriptKey,
            'Content-Type': 'application/json',
          },
        });
      })
      .then(resp => {
        fail(`no request should succeed: ${JSON.stringify(resp)}`);
        done();
      })
      .catch(err => {
        expect(err.data.code).toEqual(Parse.Error.INVALID_JSON);
        done();
      });
  });

  it('out of bounds Polygon object withinPolygon', done => {
    const point = new Parse.GeoPoint(1.5, 1.5);
    const obj = new Parse.Object('Polygon', { location: point });
    const polygon = {
      __type: 'Polygon',
      coordinates: [
        [0, 0],
        [181, 0],
        [0, 10],
      ],
    };
    obj
      .save()
      .then(() => {
        const where = {
          location: {
            $geoWithin: {
              $polygon: polygon,
            },
          },
        };
        return request({
          method: 'POST',
          url: Parse.serverURL + '/classes/Polygon',
          body: { where, _method: 'GET' },
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-Javascript-Key': Parse.javaScriptKey,
            'Content-Type': 'application/json',
          },
        });
      })
      .then(resp => {
        fail(`no request should succeed: ${JSON.stringify(resp)}`);
        done();
      })
      .catch(err => {
        expect(err.data.code).toEqual(1);
        done();
      });
  });

  it('invalid input withinPolygon', done => {
    const point = new Parse.GeoPoint(1.5, 1.5);
    const obj = new Parse.Object('Polygon', { location: point });
    obj
      .save()
      .then(() => {
        const where = {
          location: {
            $geoWithin: {
              $polygon: 1234,
            },
          },
        };
        return request({
          method: 'POST',
          url: Parse.serverURL + '/classes/Polygon',
          body: { where, _method: 'GET' },
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-Javascript-Key': Parse.javaScriptKey,
            'Content-Type': 'application/json',
          },
        });
      })
      .then(resp => {
        fail(`no request should succeed: ${JSON.stringify(resp)}`);
        done();
      })
      .catch(err => {
        expect(err.data.code).toEqual(Parse.Error.INVALID_JSON);
        done();
      });
  });

  it('invalid geoPoint withinPolygon', done => {
    const point = new Parse.GeoPoint(1.5, 1.5);
    const obj = new Parse.Object('Polygon', { location: point });
    obj
      .save()
      .then(() => {
        const where = {
          location: {
            $geoWithin: {
              $polygon: [{}],
            },
          },
        };
        return request({
          method: 'POST',
          url: Parse.serverURL + '/classes/Polygon',
          body: { where, _method: 'GET' },
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-Javascript-Key': Parse.javaScriptKey,
            'Content-Type': 'application/json',
          },
        });
      })
      .then(resp => {
        fail(`no request should succeed: ${JSON.stringify(resp)}`);
        done();
      })
      .catch(err => {
        expect(err.data.code).toEqual(Parse.Error.INVALID_JSON);
        done();
      });
  });

  it('invalid latitude withinPolygon', done => {
    const point = new Parse.GeoPoint(1.5, 1.5);
    const obj = new Parse.Object('Polygon', { location: point });
    obj
      .save()
      .then(() => {
        const where = {
          location: {
            $geoWithin: {
              $polygon: [
                { __type: 'GeoPoint', latitude: 0, longitude: 0 },
                { __type: 'GeoPoint', latitude: 181, longitude: 0 },
                { __type: 'GeoPoint', latitude: 0, longitude: 0 },
              ],
            },
          },
        };
        return request({
          method: 'POST',
          url: Parse.serverURL + '/classes/Polygon',
          body: { where, _method: 'GET' },
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-Javascript-Key': Parse.javaScriptKey,
            'Content-Type': 'application/json',
          },
        });
      })
      .then(resp => {
        fail(`no request should succeed: ${JSON.stringify(resp)}`);
        done();
      })
      .catch(err => {
        expect(err.data.code).toEqual(1);
        done();
      });
  });

  it('invalid longitude withinPolygon', done => {
    const point = new Parse.GeoPoint(1.5, 1.5);
    const obj = new Parse.Object('Polygon', { location: point });
    obj
      .save()
      .then(() => {
        const where = {
          location: {
            $geoWithin: {
              $polygon: [
                { __type: 'GeoPoint', latitude: 0, longitude: 0 },
                { __type: 'GeoPoint', latitude: 0, longitude: 181 },
                { __type: 'GeoPoint', latitude: 0, longitude: 0 },
              ],
            },
          },
        };
        return request({
          method: 'POST',
          url: Parse.serverURL + '/classes/Polygon',
          body: { where, _method: 'GET' },
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-Javascript-Key': Parse.javaScriptKey,
            'Content-Type': 'application/json',
          },
        });
      })
      .then(resp => {
        fail(`no request should succeed: ${JSON.stringify(resp)}`);
        done();
      })
      .catch(err => {
        expect(err.data.code).toEqual(1);
        done();
      });
  });

  it('minimum 3 points withinPolygon', done => {
    const point = new Parse.GeoPoint(1.5, 1.5);
    const obj = new Parse.Object('Polygon', { location: point });
    obj
      .save()
      .then(() => {
        const where = {
          location: {
            $geoWithin: {
              $polygon: [],
            },
          },
        };
        return request({
          method: 'POST',
          url: Parse.serverURL + '/classes/Polygon',
          body: { where, _method: 'GET' },
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-Javascript-Key': Parse.javaScriptKey,
            'Content-Type': 'application/json',
          },
        });
      })
      .then(resp => {
        fail(`no request should succeed: ${JSON.stringify(resp)}`);
        done();
      })
      .catch(err => {
        expect(err.data.code).toEqual(107);
        done();
      });
  });

  it('withinKilometers supports count', async () => {
    const inside = new Parse.GeoPoint(10, 10);
    const outside = new Parse.GeoPoint(20, 20);

    const obj1 = new Parse.Object('TestObject', { location: inside });
    const obj2 = new Parse.Object('TestObject', { location: outside });

    await Parse.Object.saveAll([obj1, obj2]);

    const q = new Parse.Query(TestObject).withinKilometers('location', inside, 5);
    const count = await q.count();

    equal(count, 1);
  });

  it_id('0b073d31-0d41-41e7-bd60-f636ffb759dc')(it)('withinKilometers complex supports count', async () => {
    const inside = new Parse.GeoPoint(10, 10);
    const middle = new Parse.GeoPoint(20, 20);
    const outside = new Parse.GeoPoint(30, 30);
    const obj1 = new Parse.Object('TestObject', { location: inside });
    const obj2 = new Parse.Object('TestObject', { location: middle });
    const obj3 = new Parse.Object('TestObject', { location: outside });

    await Parse.Object.saveAll([obj1, obj2, obj3]);

    const q1 = new Parse.Query(TestObject).withinKilometers('location', inside, 5);
    const q2 = new Parse.Query(TestObject).withinKilometers('location', middle, 5);
    const query = Parse.Query.or(q1, q2);
    const count = await query.count();

    equal(count, 2);
  });

  it_id('26c9a13d-3d71-452e-a91c-9a4589be021c')(it)('fails to fetch geopoints that are specifically not at (0,0)', async () => {
    const tmp = new TestObject({
      location: new Parse.GeoPoint({ latitude: 0, longitude: 0 }),
    });
    const tmp2 = new TestObject({
      location: new Parse.GeoPoint({
        latitude: 49.2577142,
        longitude: -123.1941149,
      }),
    });
    await Parse.Object.saveAll([tmp, tmp2]);
    const query = new Parse.Query(TestObject);
    query.notEqualTo('location', new Parse.GeoPoint({ latitude: 0, longitude: 0 }));
    const results = await query.find();
    expect(results.length).toEqual(1);
  });
});
