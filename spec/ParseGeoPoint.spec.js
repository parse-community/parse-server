// This is a port of the test suite:
// hungry/js/test/parse_geo_point_test.js

var TestObject = Parse.Object.extend('TestObject');

describe('Parse.GeoPoint testing', () => {
  it('geo point roundtrip', (done) => {
    var point = new Parse.GeoPoint(44.0, -11.0);
    var obj = new TestObject();
    obj.set('location', point);
    obj.set('name', 'Ferndale');
    obj.save(null, {
      success: function() {
        var query = new Parse.Query(TestObject);
        query.find({
          success: function(results) {
            equal(results.length, 1);
            var pointAgain = results[0].get('location');
            ok(pointAgain);
            equal(pointAgain.latitude, 44.0);
            equal(pointAgain.longitude, -11.0);
            done();
          }
        });
      }
    });
  });

  it('geo point exception two fields', (done) => {
    var point = new Parse.GeoPoint(20, 20);
    var obj = new TestObject();
    obj.set('locationOne', point);
    obj.set('locationTwo', point);
    obj.save().then(() => {
      fail('expected error');
    }, (err) => {
      equal(err.code, Parse.Error.INCORRECT_TYPE);
      done();
    });
  });

  it('geo line', (done) => {
    var line = [];
    for (var i = 0; i < 10; ++i) {
      var obj = new TestObject();
      var point = new Parse.GeoPoint(i * 4.0 - 12.0, i * 3.2 - 11.0);
      obj.set('location', point);
      obj.set('construct', 'line');
      obj.set('seq', i);
      line.push(obj);
    }
    Parse.Object.saveAll(line, {
      success: function() {
        var query = new Parse.Query(TestObject);
        var point = new Parse.GeoPoint(24, 19);
        query.equalTo('construct', 'line');
        query.withinMiles('location', point, 10000);
        query.find({
          success: function(results) {
            equal(results.length, 10);
            equal(results[0].get('seq'), 9);
            equal(results[3].get('seq'), 6);
            done();
          }
        });
      }
    });
  });

  it('geo max distance large', (done) => {
    var objects = [];
    [0, 1, 2].map(function(i) {
      var obj = new TestObject();
      var point = new Parse.GeoPoint(0.0, i * 45.0);
      obj.set('location', point);
      obj.set('index', i);
      objects.push(obj);
    });
    Parse.Object.saveAll(objects).then((list) => {
      var query = new Parse.Query(TestObject);
      var point = new Parse.GeoPoint(1.0, -1.0);
      query.withinRadians('location', point, 3.14);
      return query.find();
    }).then((results) => {
      equal(results.length, 3);
      done();
    }, (err) => {
      console.log(err);
      fail();
    });
  });

  it('geo max distance medium', (done) => {
    var objects = [];
    [0, 1, 2].map(function(i) {
      var obj = new TestObject();
      var point = new Parse.GeoPoint(0.0, i * 45.0);
      obj.set('location', point);
      obj.set('index', i);
      objects.push(obj);
    });
    Parse.Object.saveAll(objects, function(list) {
      var query = new Parse.Query(TestObject);
      var point = new Parse.GeoPoint(1.0, -1.0);
      query.withinRadians('location', point, 3.14 * 0.5);
      query.find({
        success: function(results) {
          equal(results.length, 2);
          equal(results[0].get('index'), 0);
          equal(results[1].get('index'), 1);
          done();
        }
      });
    });
  });

  it('geo max distance small', (done) => {
    var objects = [];
    [0, 1, 2].map(function(i) {
      var obj = new TestObject();
      var point = new Parse.GeoPoint(0.0, i * 45.0);
      obj.set('location', point);
      obj.set('index', i);
      objects.push(obj);
    });
    Parse.Object.saveAll(objects, function(list) {
      var query = new Parse.Query(TestObject);
      var point = new Parse.GeoPoint(1.0, -1.0);
      query.withinRadians('location', point, 3.14 * 0.25);
      query.find({
        success: function(results) {
          equal(results.length, 1);
          equal(results[0].get('index'), 0);
          done();
        }
      });
    });
  });

  var makeSomeGeoPoints = function(callback) {
    var sacramento = new TestObject();
    sacramento.set('location', new Parse.GeoPoint(38.52, -121.50));
    sacramento.set('name', 'Sacramento');

    var honolulu = new TestObject();
    honolulu.set('location', new Parse.GeoPoint(21.35, -157.93));
    honolulu.set('name', 'Honolulu');

    var sf = new TestObject();
    sf.set('location', new Parse.GeoPoint(37.75, -122.68));
    sf.set('name', 'San Francisco');

    Parse.Object.saveAll([sacramento, sf, honolulu], callback);
  };

  it('geo max distance in km everywhere', (done) => {
    makeSomeGeoPoints(function(list) {
      var sfo = new Parse.GeoPoint(37.6189722, -122.3748889);
      var query = new Parse.Query(TestObject);
      query.withinKilometers('location', sfo, 4000.0);
      query.find({
        success: function(results) {
          equal(results.length, 3);
          done();
        }
      });
    });
  });

  it('geo max distance in km california', (done) => {
    makeSomeGeoPoints(function(list) {
      var sfo = new Parse.GeoPoint(37.6189722, -122.3748889);
      var query = new Parse.Query(TestObject);
      query.withinKilometers('location', sfo, 3700.0);
      query.find({
        success: function(results) {
          equal(results.length, 2);
          equal(results[0].get('name'), 'San Francisco');
          equal(results[1].get('name'), 'Sacramento');
          done();
        }
      });
    });
  });

  it('geo max distance in km bay area', (done) => {
    makeSomeGeoPoints(function(list) {
      var sfo = new Parse.GeoPoint(37.6189722, -122.3748889);
      var query = new Parse.Query(TestObject);
      query.withinKilometers('location', sfo, 100.0);
      query.find({
        success: function(results) {
          equal(results.length, 1);
          equal(results[0].get('name'), 'San Francisco');
          done();
        }
      });
    });
  });

  it('geo max distance in km mid peninsula', (done) => {
    makeSomeGeoPoints(function(list) {
      var sfo = new Parse.GeoPoint(37.6189722, -122.3748889);
      var query = new Parse.Query(TestObject);
      query.withinKilometers('location', sfo, 10.0);
      query.find({
        success: function(results) {
          equal(results.length, 0);
          done();
        }
      });
    });
  });

  it('geo max distance in miles everywhere', (done) => {
    makeSomeGeoPoints(function(list) {
      var sfo = new Parse.GeoPoint(37.6189722, -122.3748889);
      var query = new Parse.Query(TestObject);
      query.withinMiles('location', sfo, 2500.0);
      query.find({
        success: function(results) {
          equal(results.length, 3);
          done();
        }
      });
    });
  });

  it('geo max distance in miles california', (done) => {
    makeSomeGeoPoints(function(list) {
      var sfo = new Parse.GeoPoint(37.6189722, -122.3748889);
      var query = new Parse.Query(TestObject);
      query.withinMiles('location', sfo, 2200.0);
      query.find({
        success: function(results) {
          equal(results.length, 2);
          equal(results[0].get('name'), 'San Francisco');
          equal(results[1].get('name'), 'Sacramento');
          done();
        }
      });
    });
  });

  it('geo max distance in miles bay area', (done) => {
    makeSomeGeoPoints(function(list) {
      var sfo = new Parse.GeoPoint(37.6189722, -122.3748889);
      var query = new Parse.Query(TestObject);
      query.withinMiles('location', sfo, 75.0);
      query.find({
        success: function(results) {
          equal(results.length, 1);
          equal(results[0].get('name'), 'San Francisco');
          done();
        }
      });
    });
  });

  it('geo max distance in miles mid peninsula', (done) => {
    makeSomeGeoPoints(function(list) {
      var sfo = new Parse.GeoPoint(37.6189722, -122.3748889);
      var query = new Parse.Query(TestObject);
      query.withinMiles('location', sfo, 10.0);
      query.find({
        success: function(results) {
          equal(results.length, 0);
          done();
        }
      });
    });
  });

  it('works with geobox queries', (done) => {
    var inSF = new Parse.GeoPoint(37.75, -122.4);
    var southwestOfSF = new Parse.GeoPoint(37.708813, -122.526398);
    var northeastOfSF = new Parse.GeoPoint(37.822802, -122.373962);

    var object = new TestObject();
    object.set('point', inSF);
    object.save().then(() => {
      var query = new Parse.Query(TestObject);
      query.withinGeoBox('point', southwestOfSF, northeastOfSF);
      return query.find();
    }).then((results) => {
      equal(results.length, 1);
      done();
    });
  });

  it('supports a sub-object with a geo point', done => {
    var point = new Parse.GeoPoint(44.0, -11.0);
    var obj = new TestObject();
    obj.set('subobject', { location: point });
    obj.save(null, {
      success: function() {
        var query = new Parse.Query(TestObject);
        query.find({
          success: function(results) {
            equal(results.length, 1);
            var pointAgain = results[0].get('subobject')['location'];
            ok(pointAgain);
            equal(pointAgain.latitude, 44.0);
            equal(pointAgain.longitude, -11.0);
            done();
          }
        });
      }
    });
  });

  it('supports array of geo points', done => {
    var point1 = new Parse.GeoPoint(44.0, -11.0);
    var point2 = new Parse.GeoPoint(22.0, -55.0);
    var obj = new TestObject();
    obj.set('locations', [ point1, point2 ]);
    obj.save(null, {
      success: function() {
        var query = new Parse.Query(TestObject);
        query.find({
          success: function(results) {
            equal(results.length, 1);
            var locations = results[0].get('locations');
            expect(locations.length).toEqual(2);
            expect(locations[0]).toEqual(point1);
            expect(locations[1]).toEqual(point2);
            done();
          }
        });
      }
    });
  });
});
