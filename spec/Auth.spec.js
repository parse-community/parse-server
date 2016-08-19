describe('Auth', () => {
  var Auth = require('../src/Auth.js').Auth;

  describe('getUserRoles', () => {
    var auth;
    var config;
    var cacheController;
    var currentRoles = null;
    var currentUserId = 'userId';

    beforeEach(() => {
      currentRoles = ['role:userId'];

      config = {
        cacheController: {
          role: {
            get: () => Promise.resolve(currentRoles),
            set: jasmine.createSpy('set')
          }
        }
      }
      spyOn(config.cacheController.role, 'get').and.callThrough();

      auth = new Auth({
        config: config,
        isMaster: false,
        user: {
          id: currentUserId
        },
        installationId: 'installationId'
      });
    });

    it('should get user roles from the cache', (done) => {
      auth.getUserRoles()
        .then((roles) => {
          var firstSet = config.cacheController.role.set.calls.first();
          expect(firstSet).toEqual(undefined);

          var firstGet = config.cacheController.role.get.calls.first();
          expect(firstGet.args[0]).toEqual(currentUserId);
          expect(roles).toEqual(currentRoles);
          done();
        });
    });

    it('should only query the roles once', (done) => {
      var loadRolesSpy = spyOn(auth, '_loadRoles').and.callThrough();
      auth.getUserRoles()
        .then((roles) => {
          expect(roles).toEqual(currentRoles);
          return auth.getUserRoles()
        })
        .then((roles) => auth.getUserRoles())
        .then((roles) => auth.getUserRoles())
        .then((roles) => {
          // Should only call the cache adapter once.
          expect(config.cacheController.role.get.calls.count()).toEqual(1);
          expect(loadRolesSpy.calls.count()).toEqual(1);

          var firstGet = config.cacheController.role.get.calls.first();
          expect(firstGet.args[0]).toEqual(currentUserId);
          expect(roles).toEqual(currentRoles);
          done();
        });
    });

    it('should not have any roles with no user', (done) => {
      auth.user = null
      auth.getUserRoles()
        .then((roles) => expect(roles).toEqual([]))
        .then(() => done());
    });

    it('should not have any user roles with master', (done) => {
      auth.isMaster = true
      auth.getUserRoles()
        .then((roles) => expect(roles).toEqual([]))
        .then(() => done());
    });

    it('should properly handle bcrypt upgrade', (done) => {
      var bcryptOriginal = require('bcrypt-nodejs');
      var bcryptNew = require('bcryptjs');
      bcryptOriginal.hash('my1Long:password', null, null, function(err, res) {
        bcryptNew.compare('my1Long:password', res, function(err, res) {
          expect(res).toBeTruthy();
          done();
        })
      });
    });

  });
});
