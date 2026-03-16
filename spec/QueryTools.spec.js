const Parse = require('parse/node');

const Id = require('../lib/LiveQuery/Id');
const QueryTools = require('../lib/LiveQuery/QueryTools');
const queryHash = QueryTools.queryHash;
const matchesQuery = QueryTools.matchesQuery;

const Item = Parse.Object.extend('Item');

describe('queryHash', function () {
  it('should always hash a query to the same string', function () {
    const q = new Parse.Query(Item);
    q.equalTo('field', 'value');
    q.exists('name');
    q.ascending('createdAt');
    q.limit(10);
    const firstHash = queryHash(q);
    const secondHash = queryHash(q);
    expect(firstHash).toBe(secondHash);
  });

  it('should return equivalent hashes for equivalent queries', function () {
    let q1 = new Parse.Query(Item);
    q1.equalTo('field', 'value');
    q1.exists('name');
    q1.lessThan('age', 30);
    q1.greaterThan('age', 3);
    q1.ascending('createdAt');
    q1.include(['name', 'age']);
    q1.limit(10);

    let q2 = new Parse.Query(Item);
    q2.limit(10);
    q2.greaterThan('age', 3);
    q2.lessThan('age', 30);
    q2.include(['name', 'age']);
    q2.ascending('createdAt');
    q2.exists('name');
    q2.equalTo('field', 'value');

    let firstHash = queryHash(q1);
    let secondHash = queryHash(q2);
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

  it('should not let fields of different types appear similar', function () {
    let q1 = new Parse.Query(Item);
    q1.lessThan('age', 30);

    const q2 = new Parse.Query(Item);
    q2.equalTo('age', '{$lt:30}');

    expect(queryHash(q1)).not.toBe(queryHash(q2));

    q1 = new Parse.Query(Item);
    q1.equalTo('age', 15);

    q2.equalTo('age', '15');

    expect(queryHash(q1)).not.toBe(queryHash(q2));
  });
});

describe('matchesQuery', function () {
  it('matches blanket queries', function () {
    const obj = {
      id: new Id('Klass', 'O1'),
      value: 12,
    };
    const q = new Parse.Query('Klass');
    expect(matchesQuery(obj, q)).toBe(true);

    obj.id = new Id('Other', 'O1');
    expect(matchesQuery(obj, q)).toBe(false);
  });

  it('matches existence queries', function () {
    const obj = {
      id: new Id('Item', 'O1'),
      count: 15,
    };
    const q = new Parse.Query('Item');
    q.exists('count');
    expect(matchesQuery(obj, q)).toBe(true);
    q.exists('name');
    expect(matchesQuery(obj, q)).toBe(false);
  });

  it('matches queries with doesNotExist constraint', function () {
    const obj = {
      id: new Id('Item', 'O1'),
      count: 15,
    };
    let q = new Parse.Query('Item');
    q.doesNotExist('name');
    expect(matchesQuery(obj, q)).toBe(true);

    q = new Parse.Query('Item');
    q.doesNotExist('count');
    expect(matchesQuery(obj, q)).toBe(false);
  });

  it('matches queries with eq constraint', function () {
    const obj = {
      objectId: 'Person2',
      score: 12,
      name: 'Tom',
    };

    const q1 = {
      objectId: {
        $eq: 'Person2',
      },
    };

    const q2 = {
      score: {
        $eq: 12,
      },
    };

    const q3 = {
      name: {
        $eq: 'Tom',
      },
    };
    expect(matchesQuery(obj, q1)).toBe(true);
    expect(matchesQuery(obj, q2)).toBe(true);
    expect(matchesQuery(obj, q3)).toBe(true);
  });

  it('matches on equality queries', function () {
    const day = new Date();
    const location = new Parse.GeoPoint({
      latitude: 37.484815,
      longitude: -122.148377,
    });
    const obj = {
      id: new Id('Person', 'O1'),
      score: 12,
      name: 'Bill',
      birthday: day,
      lastLocation: location,
    };

    let q = new Parse.Query('Person');
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
    q.equalTo(
      'lastLocation',
      new Parse.GeoPoint({
        latitude: 37.484815,
        longitude: -122.148377,
      })
    );
    expect(matchesQuery(obj, q)).toBe(true);
    q.equalTo(
      'lastLocation',
      new Parse.GeoPoint({
        latitude: 37.4848,
        longitude: -122.1483,
      })
    );
    expect(matchesQuery(obj, q)).toBe(false);

    q.equalTo(
      'lastLocation',
      new Parse.GeoPoint({
        latitude: 37.484815,
        longitude: -122.148377,
      })
    );
    q.equalTo('score', 12);
    q.equalTo('name', 'Bill');
    q.equalTo('birthday', day);
    expect(matchesQuery(obj, q)).toBe(true);

    q.equalTo('name', 'bill');
    expect(matchesQuery(obj, q)).toBe(false);

    let img = {
      id: new Id('Image', 'I1'),
      tags: ['nofilter', 'latergram', 'tbt'],
    };

    q = new Parse.Query('Image');
    q.equalTo('tags', 'selfie');
    expect(matchesQuery(img, q)).toBe(false);
    q.equalTo('tags', 'tbt');
    expect(matchesQuery(img, q)).toBe(true);

    const q2 = new Parse.Query('Image');
    q2.containsAll('tags', ['latergram', 'nofilter']);
    expect(matchesQuery(img, q2)).toBe(true);
    q2.containsAll('tags', ['latergram', 'selfie']);
    expect(matchesQuery(img, q2)).toBe(false);

    const u = new Parse.User();
    u.id = 'U2';
    q = new Parse.Query('Image');
    q.equalTo('owner', u);

    img = {
      className: 'Image',
      objectId: 'I1',
      owner: {
        className: '_User',
        objectId: 'U2',
      },
    };
    expect(matchesQuery(img, q)).toBe(true);

    img.owner.objectId = 'U3';
    expect(matchesQuery(img, q)).toBe(false);

    // pointers in arrays
    q = new Parse.Query('Image');
    q.equalTo('owners', u);

    img = {
      className: 'Image',
      objectId: 'I1',
      owners: [
        {
          className: '_User',
          objectId: 'U2',
        },
      ],
    };
    expect(matchesQuery(img, q)).toBe(true);

    img.owners[0].objectId = 'U3';
    expect(matchesQuery(img, q)).toBe(false);
  });

  it('matches on inequalities', function () {
    const player = {
      id: new Id('Person', 'O1'),
      score: 12,
      name: 'Bill',
      birthday: new Date(1980, 2, 4),
    };
    let q = new Parse.Query('Person');
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

  it('matches an $or query', function () {
    const player = {
      id: new Id('Player', 'P1'),
      name: 'Player 1',
      score: 12,
    };
    const q = new Parse.Query('Player');
    q.equalTo('name', 'Player 1');
    const q2 = new Parse.Query('Player');
    q2.equalTo('name', 'Player 2');
    const orQuery = Parse.Query.or(q, q2);
    expect(matchesQuery(player, q)).toBe(true);
    expect(matchesQuery(player, q2)).toBe(false);
    expect(matchesQuery(player, orQuery)).toBe(true);
  });

  it('does not match $all query when value is missing', () => {
    const player = {
      id: new Id('Player', 'P1'),
      name: 'Player 1',
      score: 12,
    };
    const q = { missing: { $all: [1, 2, 3] } };
    expect(matchesQuery(player, q)).toBe(false);
  });

  it('matches an $and query', () => {
    const player = {
      id: new Id('Player', 'P1'),
      name: 'Player 1',
      score: 12,
    };

    const q = new Parse.Query('Player');
    q.equalTo('name', 'Player 1');
    const q2 = new Parse.Query('Player');
    q2.equalTo('score', 12);
    const q3 = new Parse.Query('Player');
    q3.equalTo('score', 100);
    const andQuery1 = Parse.Query.and(q, q2);
    const andQuery2 = Parse.Query.and(q, q3);
    expect(matchesQuery(player, q)).toBe(true);
    expect(matchesQuery(player, q2)).toBe(true);
    expect(matchesQuery(player, andQuery1)).toBe(true);
    expect(matchesQuery(player, andQuery2)).toBe(false);
  });

  it('matches an $nor query', () => {
    const player = {
      id: new Id('Player', 'P1'),
      name: 'Player 1',
      score: 12,
    };

    const q = new Parse.Query('Player');
    q.equalTo('name', 'Player 1');
    const q2 = new Parse.Query('Player');
    q2.equalTo('name', 'Player 2');
    const q3 = new Parse.Query('Player');
    q3.equalTo('name', 'Player 3');

    const norQuery1 = Parse.Query.nor(q, q2);
    const norQuery2 = Parse.Query.nor(q2, q3);
    expect(matchesQuery(player, q)).toBe(true);
    expect(matchesQuery(player, q2)).toBe(false);
    expect(matchesQuery(player, q3)).toBe(false);
    expect(matchesQuery(player, norQuery1)).toBe(false);
    expect(matchesQuery(player, norQuery2)).toBe(true);
  });

  it('matches $regex queries', function () {
    const player = {
      id: new Id('Player', 'P1'),
      name: 'Player 1',
      score: 12,
    };

    let q = new Parse.Query('Player');
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

  it('rejects $regex with catastrophic backtracking pattern (string)', function () {
    const { setRegexTimeout } = require('../lib/LiveQuery/QueryTools');
    setRegexTimeout(100);
    try {
      const player = {
        id: new Id('Player', 'P1'),
        name: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaac',
      };

      // (a+)+b - classic catastrophic backtracking pattern
      let q = new Parse.Query('Player');
      q._addCondition('name', '$regex', '(a+)+b');
      expect(matchesQuery(player, q)).toBe(false);

      // (a|a)+b - exponential alternation
      q = new Parse.Query('Player');
      q._addCondition('name', '$regex', '(a|a)+b');
      expect(matchesQuery(player, q)).toBe(false);

      // (a+){2,}b - nested quantifiers
      q = new Parse.Query('Player');
      q._addCondition('name', '$regex', '(a+){2,}b');
      expect(matchesQuery(player, q)).toBe(false);
    } finally {
      setRegexTimeout(0);
    }
  });

  it('rejects $regex with catastrophic backtracking pattern (RegExp object)', function () {
    const { setRegexTimeout } = require('../lib/LiveQuery/QueryTools');
    setRegexTimeout(100);
    try {
      const player = {
        id: new Id('Player', 'P1'),
        name: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaac',
      };

      const q = new Parse.Query('Player');
      q.matches('name', /(a+)+b/);
      expect(matchesQuery(player, q)).toBe(false);
    } finally {
      setRegexTimeout(0);
    }
  });

  it('still matches safe $regex patterns with regexTimeout enabled', function () {
    const { setRegexTimeout } = require('../lib/LiveQuery/QueryTools');
    setRegexTimeout(100);
    try {
      const player = {
        id: new Id('Player', 'P1'),
        name: 'Player 1',
      };

      // Safe string regex
      let q = new Parse.Query('Player');
      q.startsWith('name', 'Play');
      expect(matchesQuery(player, q)).toBe(true);

      q = new Parse.Query('Player');
      q.endsWith('name', ' 1');
      expect(matchesQuery(player, q)).toBe(true);

      q = new Parse.Query('Player');
      q.contains('name', 'ayer');
      expect(matchesQuery(player, q)).toBe(true);

      // Safe RegExp object
      q = new Parse.Query('Player');
      q.matches('name', /Play.*/);
      expect(matchesQuery(player, q)).toBe(true);

      // Case-insensitive
      q = new Parse.Query('Player');
      q._addCondition('name', '$regex', 'player');
      q._addCondition('name', '$options', 'i');
      expect(matchesQuery(player, q)).toBe(true);
    } finally {
      setRegexTimeout(0);
    }
  });

  it('matches $regex with backreferences when regexTimeout is enabled', function () {
    const { setRegexTimeout } = require('../lib/LiveQuery/QueryTools');
    setRegexTimeout(100);
    try {
      const player = {
        id: new Id('Player', 'P1'),
        name: 'aa',
      };

      const q = new Parse.Query('Player');
      q._addCondition('name', '$regex', '(a)\\1');
      expect(matchesQuery(player, q)).toBe(true);
    } finally {
      setRegexTimeout(0);
    }
  });

  it('uses native RegExp when regexTimeout is 0 (disabled)', function () {
    const { setRegexTimeout } = require('../lib/LiveQuery/QueryTools');
    setRegexTimeout(0);
    const player = {
      id: new Id('Player', 'P1'),
      name: 'Player 1',
    };

    const q = new Parse.Query('Player');
    q.startsWith('name', 'Play');
    expect(matchesQuery(player, q)).toBe(true);
  });

  it('applies default regexTimeout when liveQuery is configured without explicit regexTimeout', async () => {
    await reconfigureServer({
      liveQuery: { classNames: ['Player'] },
    });
    // Verify the default value is applied by checking the config
    const Config = require('../lib/Config');
    const config = Config.get('test');
    expect(config.liveQuery.regexTimeout).toBe(100);
  });

  it('does not throw on invalid $regex pattern', function () {
    const player = {
      id: new Id('Player', 'P1'),
      name: 'Player 1',
    };

    // Invalid regex syntax should not throw, just return false
    const q = new Parse.Query('Player');
    q._where = { name: { $regex: '[invalid' } };
    expect(() => matchesQuery(player, q)).not.toThrow();
    expect(matchesQuery(player, q)).toBe(false);
  });

  it('does not throw on invalid $regex pattern with regexTimeout enabled', function () {
    const { setRegexTimeout } = require('../lib/LiveQuery/QueryTools');
    setRegexTimeout(100);
    try {
      const player = {
        id: new Id('Player', 'P1'),
        name: 'Player 1',
      };

      const q = new Parse.Query('Player');
      q._where = { name: { $regex: '[invalid' } };
      expect(() => matchesQuery(player, q)).not.toThrow();
      expect(matchesQuery(player, q)).toBe(false);
    } finally {
      setRegexTimeout(0);
    }
  });

  it('does not throw on invalid $regex flags', function () {
    const player = {
      id: new Id('Player', 'P1'),
      name: 'Player 1',
    };

    const q = new Parse.Query('Player');
    q._where = { name: { $regex: 'valid', $options: 'xyz' } };
    expect(() => matchesQuery(player, q)).not.toThrow();
    expect(matchesQuery(player, q)).toBe(false);
  });

  it('matches $nearSphere queries', function () {
    let q = new Parse.Query('Checkin');
    q.near('location', new Parse.GeoPoint(20, 20));
    // With no max distance, any GeoPoint is 'near'
    const pt = {
      id: new Id('Checkin', 'C1'),
      location: new Parse.GeoPoint(40, 40),
    };
    const ptUndefined = {
      id: new Id('Checkin', 'C1'),
    };
    const ptNull = {
      id: new Id('Checkin', 'C1'),
      location: null,
    };
    expect(matchesQuery(pt, q)).toBe(true);
    expect(matchesQuery(ptUndefined, q)).toBe(false);
    expect(matchesQuery(ptNull, q)).toBe(false);

    q = new Parse.Query('Checkin');
    pt.location = new Parse.GeoPoint(40, 40);
    q.withinRadians('location', new Parse.GeoPoint(30, 30), 0.3);
    expect(matchesQuery(pt, q)).toBe(true);

    q.withinRadians('location', new Parse.GeoPoint(30, 30), 0.2);
    expect(matchesQuery(pt, q)).toBe(false);
  });

  it('matches $within queries', function () {
    const caltrainStation = {
      id: new Id('Checkin', 'C1'),
      location: new Parse.GeoPoint(37.776346, -122.394218),
      name: 'Caltrain',
    };

    const santaClara = {
      id: new Id('Checkin', 'C2'),
      location: new Parse.GeoPoint(37.325635, -121.945753),
      name: 'Santa Clara',
    };

    const noLocation = {
      id: new Id('Checkin', 'C2'),
      name: 'Santa Clara',
    };

    const nullLocation = {
      id: new Id('Checkin', 'C2'),
      location: null,
      name: 'Santa Clara',
    };

    let q = new Parse.Query('Checkin').withinGeoBox(
      'location',
      new Parse.GeoPoint(37.708813, -122.526398),
      new Parse.GeoPoint(37.822802, -122.373962)
    );

    expect(matchesQuery(caltrainStation, q)).toBe(true);
    expect(matchesQuery(santaClara, q)).toBe(false);
    expect(matchesQuery(noLocation, q)).toBe(false);
    expect(matchesQuery(nullLocation, q)).toBe(false);
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

  it('matches on subobjects with dot notation', function () {
    const message = {
      id: new Id('Message', 'O1'),
      text: 'content',
      status: { x: 'read', y: 'delivered' },
    };

    let q = new Parse.Query('Message');
    q.equalTo('status.x', 'read');
    expect(matchesQuery(message, q)).toBe(true);

    q = new Parse.Query('Message');
    q.equalTo('status.z', 'read');
    expect(matchesQuery(message, q)).toBe(false);

    q = new Parse.Query('Message');
    q.equalTo('status.x', 'delivered');
    expect(matchesQuery(message, q)).toBe(false);

    q = new Parse.Query('Message');
    q.notEqualTo('status.x', 'read');
    expect(matchesQuery(message, q)).toBe(false);

    q = new Parse.Query('Message');
    q.notEqualTo('status.z', 'read');
    expect(matchesQuery(message, q)).toBe(true);

    q = new Parse.Query('Message');
    q.notEqualTo('status.x', 'delivered');
    expect(matchesQuery(message, q)).toBe(true);

    q = new Parse.Query('Message');
    q.exists('status.x');
    expect(matchesQuery(message, q)).toBe(true);

    q = new Parse.Query('Message');
    q.exists('status.z');
    expect(matchesQuery(message, q)).toBe(false);

    q = new Parse.Query('Message');
    q.exists('nonexistent.x');
    expect(matchesQuery(message, q)).toBe(false);

    q = new Parse.Query('Message');
    q.doesNotExist('status.x');
    expect(matchesQuery(message, q)).toBe(false);

    q = new Parse.Query('Message');
    q.doesNotExist('status.z');
    expect(matchesQuery(message, q)).toBe(true);

    q = new Parse.Query('Message');
    q.doesNotExist('nonexistent.z');
    expect(matchesQuery(message, q)).toBe(true);

    q = new Parse.Query('Message');
    q.equalTo('status.x', 'read');
    q.doesNotExist('status.y');
    expect(matchesQuery(message, q)).toBe(false);
  });

  function pointer(className, objectId) {
    return { __type: 'Pointer', className, objectId };
  }

  it('should support containedIn with pointers', () => {
    const message = {
      id: new Id('Message', 'O1'),
      profile: pointer('Profile', 'abc'),
    };
    let q = new Parse.Query('Message');
    q.containedIn('profile', [
      Parse.Object.fromJSON({ className: 'Profile', objectId: 'abc' }),
      Parse.Object.fromJSON({ className: 'Profile', objectId: 'def' }),
    ]);
    expect(matchesQuery(message, q)).toBe(true);

    q = new Parse.Query('Message');
    q.containedIn('profile', [
      Parse.Object.fromJSON({ className: 'Profile', objectId: 'ghi' }),
      Parse.Object.fromJSON({ className: 'Profile', objectId: 'def' }),
    ]);
    expect(matchesQuery(message, q)).toBe(false);
  });

  it('should support containedIn with array of pointers', () => {
    const message = {
      id: new Id('Message', 'O2'),
      profiles: [pointer('Profile', 'yeahaw'), pointer('Profile', 'yes')],
    };

    let q = new Parse.Query('Message');
    q.containedIn('profiles', [
      Parse.Object.fromJSON({ className: 'Profile', objectId: 'no' }),
      Parse.Object.fromJSON({ className: 'Profile', objectId: 'yes' }),
    ]);

    expect(matchesQuery(message, q)).toBe(true);

    q = new Parse.Query('Message');
    q.containedIn('profiles', [
      Parse.Object.fromJSON({ className: 'Profile', objectId: 'no' }),
      Parse.Object.fromJSON({ className: 'Profile', objectId: 'nope' }),
    ]);

    expect(matchesQuery(message, q)).toBe(false);
  });

  it('should support notContainedIn with pointers', () => {
    let message = {
      id: new Id('Message', 'O1'),
      profile: pointer('Profile', 'abc'),
    };
    let q = new Parse.Query('Message');
    q.notContainedIn('profile', [
      Parse.Object.fromJSON({ className: 'Profile', objectId: 'def' }),
      Parse.Object.fromJSON({ className: 'Profile', objectId: 'ghi' }),
    ]);
    expect(matchesQuery(message, q)).toBe(true);

    message = {
      id: new Id('Message', 'O1'),
      profile: pointer('Profile', 'def'),
    };
    q = new Parse.Query('Message');
    q.notContainedIn('profile', [
      Parse.Object.fromJSON({ className: 'Profile', objectId: 'ghi' }),
      Parse.Object.fromJSON({ className: 'Profile', objectId: 'def' }),
    ]);
    expect(matchesQuery(message, q)).toBe(false);
  });

  it('should support containedIn queries with [objectId]', () => {
    let message = {
      id: new Id('Message', 'O1'),
      profile: pointer('Profile', 'abc'),
    };
    let q = new Parse.Query('Message');
    q.containedIn('profile', ['abc', 'def']);
    expect(matchesQuery(message, q)).toBe(true);

    message = {
      id: new Id('Message', 'O1'),
      profile: pointer('Profile', 'ghi'),
    };
    q = new Parse.Query('Message');
    q.containedIn('profile', ['abc', 'def']);
    expect(matchesQuery(message, q)).toBe(false);
  });

  it('should support notContainedIn queries with [objectId]', () => {
    let message = {
      id: new Id('Message', 'O1'),
      profile: pointer('Profile', 'ghi'),
    };
    let q = new Parse.Query('Message');
    q.notContainedIn('profile', ['abc', 'def']);
    expect(matchesQuery(message, q)).toBe(true);
    message = {
      id: new Id('Message', 'O1'),
      profile: pointer('Profile', 'ghi'),
    };
    q = new Parse.Query('Message');
    q.notContainedIn('profile', ['abc', 'def', 'ghi']);
    expect(matchesQuery(message, q)).toBe(false);
  });

  it('matches on Date', () => {
    // given
    const now = new Date();
    const obj = {
      id: new Id('Person', '01'),
      dateObject: now,
      dateJSON: {
        __type: 'Date',
        iso: now.toISOString(),
      },
    };

    // when, then: Equal
    let q = new Parse.Query('Person');
    q.equalTo('dateObject', now);
    q.equalTo('dateJSON', now);
    expect(matchesQuery(Object.assign({}, obj), q)).toBe(true);

    // when, then: lessThan
    const future = Date(now.getTime() + 1000);
    q = new Parse.Query('Person');
    q.lessThan('dateObject', future);
    q.lessThan('dateJSON', future);
    expect(matchesQuery(Object.assign({}, obj), q)).toBe(true);

    // when, then: lessThanOrEqualTo
    q = new Parse.Query('Person');
    q.lessThanOrEqualTo('dateObject', now);
    q.lessThanOrEqualTo('dateJSON', now);
    expect(matchesQuery(Object.assign({}, obj), q)).toBe(true);

    // when, then: greaterThan
    const past = Date(now.getTime() - 1000);
    q = new Parse.Query('Person');
    q.greaterThan('dateObject', past);
    q.greaterThan('dateJSON', past);
    expect(matchesQuery(Object.assign({}, obj), q)).toBe(true);

    // when, then: greaterThanOrEqualTo
    q = new Parse.Query('Person');
    q.greaterThanOrEqualTo('dateObject', now);
    q.greaterThanOrEqualTo('dateJSON', now);
    expect(matchesQuery(Object.assign({}, obj), q)).toBe(true);
  });

  it('should support containedBy query', () => {
    const obj1 = {
      id: new Id('Numbers', 'N1'),
      numbers: [0, 1, 2],
    };
    const obj2 = {
      id: new Id('Numbers', 'N2'),
      numbers: [2, 0],
    };
    const obj3 = {
      id: new Id('Numbers', 'N3'),
      numbers: [1, 2, 3, 4],
    };

    const q = new Parse.Query('Numbers');
    q.containedBy('numbers', [1, 2, 3, 4, 5]);
    expect(matchesQuery(obj1, q)).toBe(false);
    expect(matchesQuery(obj2, q)).toBe(false);
    expect(matchesQuery(obj3, q)).toBe(true);
  });

  it('should support withinPolygon query', () => {
    const sacramento = {
      id: new Id('Location', 'L1'),
      location: new Parse.GeoPoint(38.52, -121.5),
      name: 'Sacramento',
    };
    const honolulu = {
      id: new Id('Location', 'L2'),
      location: new Parse.GeoPoint(21.35, -157.93),
      name: 'Honolulu',
    };
    const sf = {
      id: new Id('Location', 'L3'),
      location: new Parse.GeoPoint(37.75, -122.68),
      name: 'San Francisco',
    };

    const points = [
      new Parse.GeoPoint(37.85, -122.33),
      new Parse.GeoPoint(37.85, -122.9),
      new Parse.GeoPoint(37.68, -122.9),
      new Parse.GeoPoint(37.68, -122.33),
    ];
    const q = new Parse.Query('Location');
    q.withinPolygon('location', points);

    expect(matchesQuery(sacramento, q)).toBe(false);
    expect(matchesQuery(honolulu, q)).toBe(false);
    expect(matchesQuery(sf, q)).toBe(true);
  });

  it('should support polygonContains query', () => {
    const p1 = [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
    ];
    const p2 = [
      [0, 0],
      [0, 2],
      [2, 2],
      [2, 0],
    ];
    const p3 = [
      [10, 10],
      [10, 15],
      [15, 15],
      [15, 10],
      [10, 10],
    ];

    const obj1 = {
      id: new Id('Bounds', 'B1'),
      polygon: new Parse.Polygon(p1),
    };
    const obj2 = {
      id: new Id('Bounds', 'B2'),
      polygon: new Parse.Polygon(p2),
    };
    const obj3 = {
      id: new Id('Bounds', 'B3'),
      polygon: new Parse.Polygon(p3),
    };

    const point = new Parse.GeoPoint(0.5, 0.5);
    const q = new Parse.Query('Bounds');
    q.polygonContains('polygon', point);

    expect(matchesQuery(obj1, q)).toBe(true);
    expect(matchesQuery(obj2, q)).toBe(true);
    expect(matchesQuery(obj3, q)).toBe(false);
  });

  it('terminates catastrophic backtracking regex within regexTimeout (GHSA-qxh4-6wmx-rhg9)', function () {
    const { setRegexTimeout } = require('../lib/LiveQuery/QueryTools');
    setRegexTimeout(100);
    try {
      const object = {
        id: new Id('Post', 'P1'),
        title: 'aaaaaaaaaaaaaaaaaaaaaaaaaab',
      };

      // (a+)+$ is a classic catastrophic backtracking pattern
      const q = new Parse.Query('Post');
      q._where = { title: { $regex: '(a+)+$' } };

      const start = Date.now();
      // With timeout protection, the regex should be terminated and return false
      const result = matchesQuery(object, q);
      const elapsed = Date.now() - start;

      expect(result).toBe(false);
      // Should complete within a reasonable time (timeout + overhead), not hang
      expect(elapsed).toBeLessThan(5000);
    } finally {
      setRegexTimeout(0);
    }
  });

  it('applies default regexTimeout of 100ms protecting against ReDoS (GHSA-qxh4-6wmx-rhg9)', async () => {
    await reconfigureServer({
      liveQuery: { classNames: ['Post'] },
    });
    const Config = require('../lib/Config');
    const config = Config.get('test');
    // Default regexTimeout is 100ms, providing ReDoS protection out-of-the-box
    expect(config.liveQuery.regexTimeout).toBe(100);
    expect(config.liveQuery.regexTimeout).toBeGreaterThan(0);
  });

  it('does not leak regex context between sequential evaluations with shared vmContext (GHSA-v88r-ghm9-267f)', function () {
    const { setRegexTimeout } = require('../lib/LiveQuery/QueryTools');
    setRegexTimeout(100);
    try {
      // Simulate the scenario from the advisory:
      // Client A subscribes to { secretField: { $regex: "^admin" } }
      // Client B subscribes to { publicField: { $regex: ".*" } }

      // Object with a secretField that should only match Client A's subscription
      const object = {
        id: new Id('Data', 'D1'),
        secretField: 'admin_secret_data',
        publicField: 'public_data',
      };

      // Client A's query: should match because secretField starts with "admin"
      const queryA = new Parse.Query('Data');
      queryA._where = { secretField: { $regex: '^admin' } };

      // Client B's query: should match because publicField matches .*
      const queryB = new Parse.Query('Data');
      queryB._where = { publicField: { $regex: '.*' } };

      // Evaluate both queries sequentially (as the LiveQuery server does)
      const resultA = matchesQuery(object, queryA);
      const resultB = matchesQuery(object, queryB);

      // Both should match correctly — no cross-contamination
      expect(resultA).toBe(true);
      expect(resultB).toBe(true);

      // Now test the inverse: object that should NOT match Client A
      const object2 = {
        id: new Id('Data', 'D2'),
        secretField: 'user_regular_data',
        publicField: 'public_data',
      };

      const resultA2 = matchesQuery(object2, queryA);
      const resultB2 = matchesQuery(object2, queryB);

      // Client A should NOT match (secretField doesn't start with "admin")
      // Client B should still match
      expect(resultA2).toBe(false);
      expect(resultB2).toBe(true);
    } finally {
      setRegexTimeout(0);
    }
  });

  it('does not cross-contaminate regex results across different field evaluations with regexTimeout (GHSA-v88r-ghm9-267f)', function () {
    const { setRegexTimeout } = require('../lib/LiveQuery/QueryTools');
    setRegexTimeout(100);
    try {
      // Multiple subscriptions with different regex patterns evaluated against
      // different objects in rapid succession — the advisory claims the shared
      // vmContext causes pattern/input from one call to leak into another
      const subscriptions = [
        { where: { field: { $regex: '^secret' } }, object: { id: new Id('X', '1'), field: 'secret_value' }, expected: true },
        { where: { field: { $regex: '^public' } }, object: { id: new Id('X', '2'), field: 'public_value' }, expected: true },
        { where: { field: { $regex: '^secret' } }, object: { id: new Id('X', '3'), field: 'public_value' }, expected: false },
        { where: { field: { $regex: '^public' } }, object: { id: new Id('X', '4'), field: 'secret_value' }, expected: false },
        { where: { field: { $regex: '^admin' } }, object: { id: new Id('X', '5'), field: 'admin_panel' }, expected: true },
        { where: { field: { $regex: '^admin' } }, object: { id: new Id('X', '6'), field: 'user_panel' }, expected: false },
      ];

      for (const sub of subscriptions) {
        const q = new Parse.Query('X');
        q._where = sub.where;
        const result = matchesQuery(sub.object, q);
        expect(result).toBe(sub.expected);
      }
    } finally {
      setRegexTimeout(0);
    }
  });
});
