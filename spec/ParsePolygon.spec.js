const TestObject = Parse.Object.extend('TestObject');
const MongoStorageAdapter = require('../lib/Adapters/Storage/Mongo/MongoStorageAdapter').default;
const mongoURI = 'mongodb://localhost:27017/parseServerMongoAdapterTestDatabase';
const request = require('../lib/request');
const defaultHeaders = {
  'X-Parse-Application-Id': 'test',
  'X-Parse-Rest-API-Key': 'rest',
  'Content-Type': 'application/json',
};

describe('Parse.Polygon testing', () => {
  beforeAll(() => require('../lib/TestUtils').destroyAllDataPermanently());

  it('polygon save open path', done => {
    const coords = [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
    ];
    const closed = [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ];
    const obj = new TestObject();
    obj.set('polygon', new Parse.Polygon(coords));
    return obj
      .save()
      .then(() => {
        const query = new Parse.Query(TestObject);
        return query.get(obj.id);
      })
      .then(result => {
        const polygon = result.get('polygon');
        equal(polygon instanceof Parse.Polygon, true);
        equal(polygon.coordinates, closed);
        done();
      }, done.fail);
  });

  it('polygon save closed path', done => {
    const coords = [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ];
    const obj = new TestObject();
    obj.set('polygon', new Parse.Polygon(coords));
    return obj
      .save()
      .then(() => {
        const query = new Parse.Query(TestObject);
        return query.get(obj.id);
      })
      .then(result => {
        const polygon = result.get('polygon');
        equal(polygon instanceof Parse.Polygon, true);
        equal(polygon.coordinates, coords);
        done();
      }, done.fail);
  });

  it('polygon equalTo (open/closed) path', done => {
    const openPoints = [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
    ];
    const closedPoints = [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ];
    const openPolygon = new Parse.Polygon(openPoints);
    const closedPolygon = new Parse.Polygon(closedPoints);
    const obj = new TestObject();
    obj.set('polygon', openPolygon);
    return obj
      .save()
      .then(() => {
        const query = new Parse.Query(TestObject);
        query.equalTo('polygon', openPolygon);
        return query.find();
      })
      .then(results => {
        const polygon = results[0].get('polygon');
        equal(polygon instanceof Parse.Polygon, true);
        equal(polygon.coordinates, closedPoints);
        const query = new Parse.Query(TestObject);
        query.equalTo('polygon', closedPolygon);
        return query.find();
      })
      .then(results => {
        const polygon = results[0].get('polygon');
        equal(polygon instanceof Parse.Polygon, true);
        equal(polygon.coordinates, closedPoints);
        done();
      }, done.fail);
  });

  it('polygon update', done => {
    const oldCoords = [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
    ];
    const oldPolygon = new Parse.Polygon(oldCoords);
    const newCoords = [
      [2, 2],
      [2, 3],
      [3, 3],
      [3, 2],
    ];
    const newPolygon = new Parse.Polygon(newCoords);
    const obj = new TestObject();
    obj.set('polygon', oldPolygon);
    return obj
      .save()
      .then(() => {
        obj.set('polygon', newPolygon);
        return obj.save();
      })
      .then(() => {
        const query = new Parse.Query(TestObject);
        return query.get(obj.id);
      })
      .then(result => {
        const polygon = result.get('polygon');
        newCoords.push(newCoords[0]);
        equal(polygon instanceof Parse.Polygon, true);
        equal(polygon.coordinates, newCoords);
        done();
      }, done.fail);
  });

  it('polygon invalid value', done => {
    const coords = [
      ['foo', 'bar'],
      [0, 1],
      [1, 0],
      [1, 1],
      [0, 0],
    ];
    const obj = new TestObject();
    obj.set('polygon', { __type: 'Polygon', coordinates: coords });
    return obj
      .save()
      .then(() => {
        const query = new Parse.Query(TestObject);
        return query.get(obj.id);
      })
      .then(done.fail, () => done());
  });

  it('polygon three points minimum', done => {
    const coords = [[0, 0]];
    const obj = new TestObject();
    // use raw so we test the server validates properly
    obj.set('polygon', { __type: 'Polygon', coordinates: coords });
    obj.save().then(done.fail, () => done());
  });

  it('polygon three different points minimum', done => {
    const coords = [
      [0, 0],
      [0, 1],
      [0, 0],
    ];
    const obj = new TestObject();
    obj.set('polygon', new Parse.Polygon(coords));
    obj.save().then(done.fail, () => done());
  });

  it('polygon counterclockwise', done => {
    const coords = [
      [1, 1],
      [0, 1],
      [0, 0],
      [1, 0],
    ];
    const closed = [
      [1, 1],
      [0, 1],
      [0, 0],
      [1, 0],
      [1, 1],
    ];
    const obj = new TestObject();
    obj.set('polygon', new Parse.Polygon(coords));
    obj
      .save()
      .then(() => {
        const query = new Parse.Query(TestObject);
        return query.get(obj.id);
      })
      .then(result => {
        const polygon = result.get('polygon');
        equal(polygon instanceof Parse.Polygon, true);
        equal(polygon.coordinates, closed);
        done();
      }, done.fail);
  });

  describe('with location', () => {
    beforeAll(() => require('../lib/TestUtils').destroyAllDataPermanently());

    it('polygonContain query', done => {
      const points1 = [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 0],
      ];
      const points2 = [
        [0, 0],
        [0, 2],
        [2, 2],
        [2, 0],
      ];
      const points3 = [
        [10, 10],
        [10, 15],
        [15, 15],
        [15, 10],
        [10, 10],
      ];
      const polygon1 = new Parse.Polygon(points1);
      const polygon2 = new Parse.Polygon(points2);
      const polygon3 = new Parse.Polygon(points3);
      const obj1 = new TestObject({ location: polygon1 });
      const obj2 = new TestObject({ location: polygon2 });
      const obj3 = new TestObject({ location: polygon3 });
      Parse.Object.saveAll([obj1, obj2, obj3])
        .then(() => {
          const where = {
            location: {
              $geoIntersects: {
                $point: { __type: 'GeoPoint', latitude: 0.5, longitude: 0.5 },
              },
            },
          };
          return request({
            method: 'POST',
            url: Parse.serverURL + '/classes/TestObject',
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

    it('polygonContain query no reverse input (Regression test for #4608)', done => {
      const points1 = [
        [0.25, 0],
        [0.25, 1.25],
        [0.75, 1.25],
        [0.75, 0],
      ];
      const points2 = [
        [0, 0],
        [0, 2],
        [2, 2],
        [2, 0],
      ];
      const points3 = [
        [10, 10],
        [10, 15],
        [15, 15],
        [15, 10],
        [10, 10],
      ];
      const polygon1 = new Parse.Polygon(points1);
      const polygon2 = new Parse.Polygon(points2);
      const polygon3 = new Parse.Polygon(points3);
      const obj1 = new TestObject({ location: polygon1 });
      const obj2 = new TestObject({ location: polygon2 });
      const obj3 = new TestObject({ location: polygon3 });
      Parse.Object.saveAll([obj1, obj2, obj3])
        .then(() => {
          const where = {
            location: {
              $geoIntersects: {
                $point: { __type: 'GeoPoint', latitude: 0.5, longitude: 1.0 },
              },
            },
          };
          return request({
            method: 'POST',
            url: Parse.serverURL + '/classes/TestObject',
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

    it('polygonContain query real data (Regression test for #4608)', done => {
      const detroit = [
        [42.631655189280224, -83.78406753121705],
        [42.633047793854814, -83.75333640366955],
        [42.61625254348911, -83.75149921669944],
        [42.61526926650296, -83.78161794858735],
        [42.631655189280224, -83.78406753121705],
      ];
      const polygon = new Parse.Polygon(detroit);
      const obj = new TestObject({ location: polygon });
      obj
        .save()
        .then(() => {
          const where = {
            location: {
              $geoIntersects: {
                $point: {
                  __type: 'GeoPoint',
                  latitude: 42.624599,
                  longitude: -83.770162,
                },
              },
            },
          };
          return request({
            method: 'POST',
            url: Parse.serverURL + '/classes/TestObject',
            body: { where, _method: 'GET' },
            headers: {
              'X-Parse-Application-Id': Parse.applicationId,
              'X-Parse-Javascript-Key': Parse.javaScriptKey,
              'Content-Type': 'application/json',
            },
          });
        })
        .then(resp => {
          expect(resp.data.results.length).toBe(1);
          done();
        }, done.fail);
    });

    it('polygonContain invalid input', done => {
      const points = [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 0],
      ];
      const polygon = new Parse.Polygon(points);
      const obj = new TestObject({ location: polygon });
      obj
        .save()
        .then(() => {
          const where = {
            location: {
              $geoIntersects: {
                $point: { __type: 'GeoPoint', latitude: 181, longitude: 181 },
              },
            },
          };
          return request({
            method: 'POST',
            url: Parse.serverURL + '/classes/TestObject',
            body: { where, _method: 'GET' },
            headers: {
              'X-Parse-Application-Id': Parse.applicationId,
              'X-Parse-Javascript-Key': Parse.javaScriptKey,
            },
          });
        })
        .then(done.fail, () => done());
    });

    it('polygonContain invalid geoPoint', done => {
      const points = [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 0],
      ];
      const polygon = new Parse.Polygon(points);
      const obj = new TestObject({ location: polygon });
      obj
        .save()
        .then(() => {
          const where = {
            location: {
              $geoIntersects: {
                $point: [],
              },
            },
          };
          return request({
            method: 'POST',
            url: Parse.serverURL + '/classes/TestObject',
            body: { where, _method: 'GET' },
            headers: {
              'X-Parse-Application-Id': Parse.applicationId,
              'X-Parse-Javascript-Key': Parse.javaScriptKey,
            },
          });
        })
        .then(done.fail, () => done());
    });
  });
});

describe_only_db('mongo')('Parse.Polygon testing', () => {
  beforeEach(() => require('../lib/TestUtils').destroyAllDataPermanently());
  it('support 2d and 2dsphere', done => {
    const coords = [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ];
    // testings against REST API, use raw formats
    const polygon = { __type: 'Polygon', coordinates: coords };
    const location = { __type: 'GeoPoint', latitude: 10, longitude: 10 };
    const databaseAdapter = new MongoStorageAdapter({ uri: mongoURI });
    return reconfigureServer({
      appId: 'test',
      restAPIKey: 'rest',
      publicServerURL: 'http://localhost:8378/1',
      databaseAdapter,
    })
      .then(() => {
        return databaseAdapter.createIndex('TestObject', { location: '2d' });
      })
      .then(() => {
        return databaseAdapter.createIndex('TestObject', {
          polygon: '2dsphere',
        });
      })
      .then(() => {
        return request({
          method: 'POST',
          url: 'http://localhost:8378/1/classes/TestObject',
          body: {
            _method: 'POST',
            location,
            polygon,
            polygon2: polygon,
          },
          headers: defaultHeaders,
        });
      })
      .then(resp => {
        return request({
          method: 'POST',
          url: `http://localhost:8378/1/classes/TestObject/${resp.data.objectId}`,
          body: { _method: 'GET' },
          headers: defaultHeaders,
        });
      })
      .then(resp => {
        equal(resp.data.location, location);
        equal(resp.data.polygon, polygon);
        equal(resp.data.polygon2, polygon);
        return databaseAdapter.getIndexes('TestObject');
      })
      .then(indexes => {
        equal(indexes.length, 4);
        equal(indexes[0].key, { _id: 1 });
        equal(indexes[1].key, { location: '2d' });
        equal(indexes[2].key, { polygon: '2dsphere' });
        equal(indexes[3].key, { polygon2: '2dsphere' });
        done();
      }, done.fail);
  });

  it('polygon coordinates reverse input', done => {
    const Config = require('../lib/Config');
    const config = Config.get('test');

    // When stored the first point should be the last point
    const input = [
      [12, 11],
      [14, 13],
      [16, 15],
      [18, 17],
    ];
    const output = [
      [
        [11, 12],
        [13, 14],
        [15, 16],
        [17, 18],
        [11, 12],
      ],
    ];
    const obj = new TestObject();
    obj.set('polygon', new Parse.Polygon(input));
    obj
      .save()
      .then(() => {
        return config.database.adapter._rawFind('TestObject', { _id: obj.id });
      })
      .then(results => {
        expect(results.length).toBe(1);
        expect(results[0].polygon.coordinates).toEqual(output);
        done();
      });
  });

  it('polygon loop is not valid', done => {
    const coords = [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ];
    const obj = new TestObject();
    obj.set('polygon', new Parse.Polygon(coords));
    obj.save().then(done.fail, () => done());
  });
});
