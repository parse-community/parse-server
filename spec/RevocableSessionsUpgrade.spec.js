const Config = require('../src/Config');
const sessionToken = 'legacySessionToken';
const rp = require('request-promise');
const Parse = require('parse/node');

function createUser() {
  const config = new Config(Parse.applicationId);
  const user = {
    objectId: '1234567890',
    username: 'hello',
    password: 'pass',
    _session_token: sessionToken
  }
  return config.database.create('_User', user);
}

describe_only_db('mongo')('revocable sessions', () => {

  beforeEach((done) => {
    // Create 1 user with the legacy
    createUser().then(done);
  });

  it('should upgrade legacy session token', done => {
    const user = Parse.Object.fromJSON({
      className: '_User',
      objectId: '1234567890',
      sessionToken: sessionToken
    });
    user._upgradeToRevocableSession().then((res) => {
      expect(res.getSessionToken().indexOf('r:')).toBe(0);
      const config = new Config(Parse.applicationId);
      // use direct access to the DB to make sure we're not
      // getting the session token stripped
      return config.database.loadSchema().then(schemaController => {
        return schemaController.getOneSchema('_User', true)
      }).then((schema) => {
        return config.database.adapter.find('_User', schema, {objectId: '1234567890'}, {})
      }).then((results) => {
        expect(results.length).toBe(1);
        expect(results[0].sessionToken).toBeUndefined();
      });
    }).then(() => {
      done();
    }, (err) => {
      jfail(err);
      done();
    });
  });

  it('should be able to become with revocable session token', done => {
    const user = Parse.Object.fromJSON({
      className: '_User',
      objectId: '1234567890',
      sessionToken: sessionToken
    });
    user._upgradeToRevocableSession().then((res) => {
      expect(res.getSessionToken().indexOf('r:')).toBe(0);
      return Parse.User.logOut().then(() => {
        return Parse.User.become(res.getSessionToken())
      }).then((user) => {
        expect(user.id).toEqual('1234567890');
      });
    }).then(() => {
      done();
    }, (err) => {
      jfail(err);
      done();
    });
  });

  it('should not upgrade bad legacy session token', done => {
    rp.post({
      url: Parse.serverURL + '/upgradeToRevocableSession',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Rest-API-Key': 'rest',
        'X-Parse-Session-Token': 'badSessionToken'
      },
      json: true
    }).then(() => {
      fail('should not be able to upgrade a bad token');
    }, (response) => {
      expect(response.statusCode).toBe(400);
      expect(response.error).not.toBeUndefined();
      expect(response.error.code).toBe(Parse.Error.INVALID_SESSION_TOKEN);
      expect(response.error.error).toEqual('invalid legacy session token');
    }).then(() => {
      done();
    });
  });

  it('should not crash without session token #2720', done => {
    rp.post({
      url: Parse.serverURL + '/upgradeToRevocableSession',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Rest-API-Key': 'rest'
      },
      json: true
    }).then(() => {
      fail('should not be able to upgrade a bad token');
    }, (response) => {
      expect(response.statusCode).toBe(404);
      expect(response.error).not.toBeUndefined();
      expect(response.error.code).toBe(Parse.Error.OBJECT_NOT_FOUND);
      expect(response.error.error).toEqual('invalid session');
    }).then(() => {
      done();
    });
  });
})
