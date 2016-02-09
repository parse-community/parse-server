// These tests check the "find" functionality of the REST API.
var auth = require('../src/Auth');
var cache = require('../src/cache');
var Config = require('../src/Config');
var rest = require('../src/rest');

var config = new Config('test');
var nobody = auth.nobody(config);

describe('rest query', () => {
  it('basic query', (done) => {
    rest.create(config, nobody, 'TestObject', {}).then(() => {
      return rest.find(config, nobody, 'TestObject', {});
    }).then((response) => {
      expect(response.results.length).toEqual(1);
      done();
    });
  });

  it('query with limit', (done) => {
    rest.create(config, nobody, 'TestObject', {foo: 'baz'}
    ).then(() => {
      return rest.create(config, nobody,
                         'TestObject', {foo: 'qux'});
    }).then(() => {
      return rest.find(config, nobody,
                       'TestObject', {}, {limit: 1});
    }).then((response) => {
      expect(response.results.length).toEqual(1);
      expect(response.results[0].foo).toBeTruthy();
      done();
    });
  });

  // Created to test a scenario in AnyPic
  it('query with include', (done) => {
    var photo = {
      foo: 'bar'
    };
    var user = {
      username: 'aUsername',
      password: 'aPassword'
    };
    var activity = {
      type: 'comment',
      photo: {
        __type: 'Pointer',
        className: 'TestPhoto',
        objectId: ''
      },
      fromUser: {
        __type: 'Pointer',
        className: '_User',
        objectId: ''
      }
    };
    var queryWhere = {
      photo: {
        __type: 'Pointer',
        className: 'TestPhoto',
        objectId: ''
      },
      type: 'comment'
    };
    var queryOptions = {
      include: 'fromUser',
      order: 'createdAt',
      limit: 30
    };
    rest.create(config, nobody, 'TestPhoto', photo
    ).then((p) => {
      photo = p;
      return rest.create(config, nobody, '_User', user);
    }).then((u) => {
      user = u.response;
      activity.photo.objectId = photo.objectId;
      activity.fromUser.objectId = user.objectId;
      return rest.create(config, nobody,
                         'TestActivity', activity);
    }).then(() => {
      queryWhere.photo.objectId = photo.objectId;
      return rest.find(config, nobody,
                       'TestActivity', queryWhere, queryOptions);
    }).then((response) => {
      var results = response.results;
      expect(results.length).toEqual(1);
      expect(typeof results[0].objectId).toEqual('string');
      expect(typeof results[0].photo).toEqual('object');
      expect(typeof results[0].fromUser).toEqual('object');
      expect(typeof results[0].fromUser.username).toEqual('string');
      done();
    }).catch((error) => { console.log(error); });
  });

});
