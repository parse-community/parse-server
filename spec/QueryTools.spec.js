var Parse = require('parse/node');

var Id = require('../src/LiveQuery/Id');
var QueryTools = require('../src/LiveQuery/QueryTools');
var queryHash = QueryTools.queryHash;
var matchesQuery = QueryTools.matchesQuery;

var Item = Parse.Object.extend('Item');

describe('queryHash', function() {

  it('should always hash a query to the same string', function() {
    var q = new Parse.Query(Item);
    q.equalTo('field', 'value');
    q.exists('name');
    q.ascending('createdAt');
    q.limit(10);
    var firstHash = queryHash(q);
    var secondHash = queryHash(q);
    expect(firstHash).toBe(secondHash);
  });

  it('should return equivalent hashes for equivalent queries', function() {
    var q1 = new Parse.Query(Item);
    q1.equalTo('field', 'value');
    q1.exists('name');
    q1.lessThan('age', 30);
    q1.greaterThan('age', 3);
    q1.ascending('createdAt');
    q1.include(['name', 'age']);
    q1.limit(10);

    var q2 = new Parse.Query(Item);
    q2.limit(10);
    q2.greaterThan('age', 3);
    q2.lessThan('age', 30);
    q2.include(['name', 'age']);
    q2.ascending('createdAt');
    q2.exists('name');
    q2.equalTo('field', 'value');

    var firstHash = queryHash(q1);
    var secondHash = queryHash(q2);
    expect(firstHash).toBe(secondHash);

    q1.containedIn('fruit', ['apple', 'banana', 'cherry']);
    firstHash = queryHash(q1);
    expect(firstHash).not.toBe(secondHash);

    q2.containedIn('fruit', ['banana', 'cherry', 'apple']);
    secondHash = queryHash(q2);
    expect(secondHash).toBe(firstHash);

    q1.containedIn('fruit', ['coconut']);
    firstHash = queryHash(q1);
    expect(firstHash).not.toBe(secondHash);

    q1 = new Parse.Query(Item);
    q1.equalTo('field', 'value');
    q1.lessThan('age', 30);
    q1.exists('name');

    q2 = new Parse.Query(Item);
    q2.equalTo('name', 'person');
    q2.equalTo('field', 'other');

    firstHash = queryHash(Parse.Query.or(q1, q2));
    secondHash = queryHash(Parse.Query.or(q2, q1));
    expect(firstHash).toBe(secondHash);
  });

  it('should not let fields of different types appear similar', function() {
    var q1 = new Parse.Query(Item);
    q1.lessThan('age', 30);

    var q2 = new Parse.Query(Item);
    q2.equalTo('age', '{$lt:30}');

    expect(queryHash(q1)).not.toBe(queryHash(q2));

    q1 = new Parse.Query(Item);
    q1.equalTo('age', 15);

    q2.equalTo('age', '15');

    expect(queryHash(q1)).not.toBe(queryHash(q2));
  });
});

describe('matchesQuery', function() {
  it('matches blanket queries', function() {
    var obj = {
      id: new Id('Klass', 'O1'),
      value: 12
    };
    var q = new Parse.Query('Klass');
    expect(matchesQuery(obj, q)).toBe(true);

    obj.id = new Id('Other', 'O1');
    expect(matchesQuery(obj, q)).toBe(false);
  });

  it('matches existence queries', function() {
    var obj = {
      id: new Id('Item', 'O1'),
      count: 15
    };
    var q = new Parse.Query('Item');
    q.exists('count');
    expect(matchesQuery(obj, q)).toBe(true);
    q.exists('name');
    expect(matchesQuery(obj, q)).toBe(false);
  });

  it('matches on equality queries', function() {
    var day = new Date();
    var location = new Parse.GeoPoint({
      latitude: 37.484815,
      longitude: -122.148377
    });
    var obj = {
      id: new Id('Person', 'O1'),
      score: 12,
      name: 'Bill',
      birthday: day,
      lastLocation: location
    };

    var q = new Parse.Query('Person');
    q.equalTo('score', 12);
    expect(matchesQuery(obj, q)).toBe(true);

    q = new Parse.Query('Person');
    q.equalTo('name', 'Bill');
    expect(matchesQuery(obj, q)).toBe(true);
    q.equalTo('name', 'Jeff');
    expect(matchesQuery(obj, q)).toBe(false);

    q = new Parse.Query('Person');
    q.containedIn('name', ['Adam', 'Ben', 'Charles']);
    expect(matchesQuery(obj, q)).toBe(false);
    q.containedIn('name', ['Adam', 'Bill', 'Charles']);
    expect(matchesQuery(obj, q)).toBe(true);

    q = new Parse.Query('Person');
    q.notContainedIn('name', ['Adam', 'Bill', 'Charles']);
    expect(matchesQuery(obj, q)).toBe(false);
    q.notContainedIn('name', ['Adam', 'Ben', 'Charles']);
    expect(matchesQuery(obj, q)).toBe(true);

    q = new Parse.Query('Person');
    q.equalTo('birthday', day);
    expect(matchesQuery(obj, q)).toBe(true);
    q.equalTo('birthday', new Date(1990, 1));
    expect(matchesQuery(obj, q)).toBe(false);

    q = new Parse.Query('Person');
    q.equalTo('lastLocation', new Parse.GeoPoint({
      latitude: 37.484815,
      longitude: -122.148377
    }));
    expect(matchesQuery(obj, q)).toBe(true);
    q.equalTo('lastLocation', new Parse.GeoPoint({
      latitude: 37.4848,
      longitude: -122.1483
    }));
    expect(matchesQuery(obj, q)).toBe(false);

    q.equalTo('lastLocation', new Parse.GeoPoint({
      latitude: 37.484815,
      longitude: -122.148377
    }));
    q.equalTo('score', 12);
    q.equalTo('name', 'Bill');
    q.equalTo('birthday', day);
    expect(matchesQuery(obj, q)).toBe(true);

    q.equalTo('name', 'bill');
    expect(matchesQuery(obj, q)).toBe(false);

    var img = {
      id: new Id('Image', 'I1'),
      tags: ['nofilter', 'latergram', 'tbt']
    };

    q = new Parse.Query('Image');
    q.equalTo('tags', 'selfie');
    expect(matchesQuery(img, q)).toBe(false);
    q.equalTo('tags', 'tbt');
    expect(matchesQuery(img, q)).toBe(true);

    var q2 = new Parse.Query('Image');
    q2.containsAll('tags', ['latergram', 'nofilter']);
    expect(matchesQuery(img, q2)).toBe(true);
    q2.containsAll('tags', ['latergram', 'selfie']);
    expect(matchesQuery(img, q2)).toBe(false);

    var u = new Parse.User();
    u.id = 'U2';
    q = new Parse.Query('Image');
    q.equalTo('owner', u);

    img = {
      className: 'Image',
      objectId: 'I1',
      owner: {
        className: '_User',
        objectId: 'U2'
      }
    };
    expect(matchesQuery(img, q)).toBe(true);

    img.owner.objectId = 'U3';
    expect(matchesQuery(img, q)).toBe(false);
  });

  it('matches on inequalities', function() {
    var player = {
      id: new Id('Person', 'O1'),
      score: 12,
      name: 'Bill',
      birthday: new Date(1980, 2, 4),
    };
    var q = new Parse.Query('Person');
    q.lessThan('score', 15);
    expect(matchesQuery(player, q)).toBe(true);
    q.lessThan('score', 10);
    expect(matchesQuery(player, q)).toBe(false);

    q = new Parse.Query('Person');
    q.lessThanOrEqualTo('score', 15);
    expect(matchesQuery(player, q)).toBe(true);
    q.lessThanOrEqualTo('score', 12);
    expect(matchesQuery(player, q)).toBe(true);
    q.lessThanOrEqualTo('score', 10);
    expect(matchesQuery(player, q)).toBe(false);

    q = new Parse.Query('Person');
    q.greaterThan('score', 15);
    expect(matchesQuery(player, q)).toBe(false);
    q.greaterThan('score', 10);
    expect(matchesQuery(player, q)).toBe(true);

    q = new Parse.Query('Person');
    q.greaterThanOrEqualTo('score', 15);
    expect(matchesQuery(player, q)).toBe(false);
    q.greaterThanOrEqualTo('score', 12);
    expect(matchesQuery(player, q)).toBe(true);
    q.greaterThanOrEqualTo('score', 10);
    expect(matchesQuery(player, q)).toBe(true);

    q = new Parse.Query('Person');
    q.notEqualTo('score', 12);
    expect(matchesQuery(player, q)).toBe(false);
    q.notEqualTo('score', 40);
    expect(matchesQuery(player, q)).toBe(true);
  });

  it('matches an $or query', function() {
    var player = {
      id: new Id('Player', 'P1'),
      name: 'Player 1',
      score: 12
    };
    var q = new Parse.Query('Player');
    q.equalTo('name', 'Player 1');
    var q2 = new Parse.Query('Player');
    q2.equalTo('name', 'Player 2');
    var orQuery = Parse.Query.or(q, q2);
    expect(matchesQuery(player, q)).toBe(true);
    expect(matchesQuery(player, q2)).toBe(false);
    expect(matchesQuery(player, orQuery)).toBe(true);
  });

  it('matches $regex queries', function() {
    var player = {
      id: new Id('Player', 'P1'),
      name: 'Player 1',
      score: 12
    };

    var q = new Parse.Query('Player');
    q.startsWith('name', 'Play');
    expect(matchesQuery(player, q)).toBe(true);
    q.startsWith('name', 'Ploy');
    expect(matchesQuery(player, q)).toBe(false);

    q = new Parse.Query('Player');
    q.endsWith('name', ' 1');
    expect(matchesQuery(player, q)).toBe(true);
    q.endsWith('name', ' 2');
    expect(matchesQuery(player, q)).toBe(false);

    // Check that special characters are escaped
    player.name = 'Android-7';
    q = new Parse.Query('Player');
    q.contains('name', 'd-7');
    expect(matchesQuery(player, q)).toBe(true);

    q = new Parse.Query('Player');
    q.matches('name', /A.d/);
    expect(matchesQuery(player, q)).toBe(true);

    q.matches('name', /A[^n]d/);
    expect(matchesQuery(player, q)).toBe(false);

    // Check that the string \\E is returned to normal
    player.name = 'Slash \\E';
    q = new Parse.Query('Player');
    q.endsWith('name', 'h \\E');
    expect(matchesQuery(player, q)).toBe(true);

    q.endsWith('name', 'h \\Ee');
    expect(matchesQuery(player, q)).toBe(false);

    player.name = 'Slash \\Q and more';
    q = new Parse.Query('Player');
    q.contains('name', 'h \\Q and');
    expect(matchesQuery(player, q)).toBe(true);
    q.contains('name', 'h \\Q or');
    expect(matchesQuery(player, q)).toBe(false);
  });

  it('matches $nearSphere queries', function() {
    var q = new Parse.Query('Checkin');
    q.near('location', new Parse.GeoPoint(20, 20));
    // With no max distance, any GeoPoint is 'near'
    var pt = {
      id: new Id('Checkin', 'C1'),
      location: new Parse.GeoPoint(40, 40)
    };
    expect(matchesQuery(pt, q)).toBe(true);

    q = new Parse.Query('Checkin');
    pt.location = new Parse.GeoPoint(40, 40);
    q.withinRadians('location', new Parse.GeoPoint(30, 30), 0.3);
    expect(matchesQuery(pt, q)).toBe(true);

    q.withinRadians('location', new Parse.GeoPoint(30, 30), 0.2);
    expect(matchesQuery(pt, q)).toBe(false);
  });

  it('matches $within queries', function() {
    var caltrainStation = {
      id: new Id('Checkin', 'C1'),
      location: new Parse.GeoPoint(37.776346, -122.394218),
      name: 'Caltrain'
    };

    var santaClara = {
      id: new Id('Checkin', 'C2'),
      location: new Parse.GeoPoint(37.325635, -121.945753),
      name: 'Santa Clara'
    };

    var q = new Parse.Query('Checkin').withinGeoBox(
      'location',
      new Parse.GeoPoint(37.708813, -122.526398),
      new Parse.GeoPoint(37.822802, -122.373962)
    );

    expect(matchesQuery(caltrainStation, q)).toBe(true);
    expect(matchesQuery(santaClara, q)).toBe(false);

    // Invalid rectangles
    q = new Parse.Query('Checkin').withinGeoBox(
      'location',
      new Parse.GeoPoint(37.822802, -122.373962),
      new Parse.GeoPoint(37.708813, -122.526398)
    );

    expect(matchesQuery(caltrainStation, q)).toBe(false);
    expect(matchesQuery(santaClara, q)).toBe(false);

    q = new Parse.Query('Checkin').withinGeoBox(
      'location',
      new Parse.GeoPoint(37.708813, -122.373962),
      new Parse.GeoPoint(37.822802, -122.526398)
    );

    expect(matchesQuery(caltrainStation, q)).toBe(false);
    expect(matchesQuery(santaClara, q)).toBe(false);
  });
});
