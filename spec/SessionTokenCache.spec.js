var SessionTokenCache = require('../src/LiveQuery/SessionTokenCache').SessionTokenCache;

describe('SessionTokenCache', function() {

  beforeEach(function(done) {
    var Parse = require('parse/node');

    spyOn(Parse, "Query").and.returnValue({
      first: jasmine.createSpy("first").and.returnValue(Parse.Promise.as(new Parse.Object("_Session", {
        user: new Parse.User({id:"userId"})
      }))),
      equalTo: function(){}
    })

    done();
  });

  it('can get undefined userId', function(done) {
    var sessionTokenCache = new SessionTokenCache();

    sessionTokenCache.getUserId(undefined).then(() => {
    }, (error) => {
      expect(error).not.toBeNull();
      done();
    });
  });

  it('can get existing userId', function(done) {
    var sessionTokenCache = new SessionTokenCache();
    var sessionToken = 'sessionToken';
    var userId = 'userId'
    sessionTokenCache.cache.set(sessionToken, userId);

    sessionTokenCache.getUserId(sessionToken).then((userIdFromCache) => {
      expect(userIdFromCache).toBe(userId);
      done();
    });
  });

  it('can get new userId', function(done) {
    var sessionTokenCache = new SessionTokenCache();

    sessionTokenCache.getUserId('sessionToken').then((userIdFromCache) => {
      expect(userIdFromCache).toBe('userId');
      expect(sessionTokenCache.cache.length).toBe(1);
      done();
    });
  });

});
