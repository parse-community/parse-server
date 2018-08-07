const RoleCache = require('../lib/LiveQuery/RoleCache').RoleCache;

describe('RoleCache', function() {
  beforeEach(function(done) {
    const Parse = require('parse/node');
    const role = new Parse.Role()
    role.setName('cache_test')

    spyOn(Parse, "Query").and.returnValue({
      find: jasmine.createSpy("find").and.returnValue(Parse.Promise.as([role])),
      equalTo: function() {}
    })

    done();
  });

  it('can get undefined userId', function(done) {
    const roleCache = new RoleCache();

    roleCache.getRoles(undefined).then(() => {
      // done();
    }, (error) => {
      expect(error).not.toBeNull();
      done();
    });
  });

  it('can get existing userId', function(done) {
    const roleCache = new RoleCache();
    const role = new Parse.Role()
    role.setName('cache_test')
    const userId = 'userId'
    roleCache.cache.set(userId, [role]);

    roleCache.getRoles(userId).then((rolesFromCache) => {
      expect(rolesFromCache[0].getName()).toBe('cache_test');
      done();
    });
  });

  it('can get new userId', function(done) {
    const roleCache = new RoleCache();

    roleCache.getRoles('userId').then((roles) => {
      expect(roles[0].getName()).toBe('cache_test');
      expect(roleCache.cache.length).toBe(1);
      done();
    });
  });
});
