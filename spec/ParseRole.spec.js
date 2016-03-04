

// Roles are not accessible without the master key, so they are not intended
// for use by clients.  We can manually test them using the master key.
var Auth = require("../src/Auth").Auth;
var cache = require("../src/cache");

describe('Parse Role testing', () => {

  it('Do a bunch of basic role testing', (done) => {

    var user;
    var role;

    createTestUser().then((x) => {
      user = x;
      role = new Parse.Object('_Role');
      role.set('name', 'Foos');
      var users = role.relation('users');
      users.add(user);
      return role.save({}, { useMasterKey: true });
    }).then((x) => {
      var query = new Parse.Query('_Role');
      return query.find({ useMasterKey: true });
    }).then((x) => {
      expect(x.length).toEqual(1);
      var relation = x[0].relation('users').query();
      return relation.first({ useMasterKey: true });
    }).then((x) => {
      expect(x.id).toEqual(user.id);
      // Here we've got a valid role and a user assigned.
      // Lets create an object only the role can read/write and test
      // the different scenarios.
      var obj = new Parse.Object('TestObject');
      var acl = new Parse.ACL();
      acl.setPublicReadAccess(false);
      acl.setPublicWriteAccess(false);
      acl.setRoleReadAccess('Foos', true);
      acl.setRoleWriteAccess('Foos', true);
      obj.setACL(acl);
      return obj.save();
    }).then((x) => {
      var query = new Parse.Query('TestObject');
      return query.find({ sessionToken: user.getSessionToken() });
    }).then((x) => {
      expect(x.length).toEqual(1);
      var objAgain = x[0];
      objAgain.set('foo', 'bar');
      // This should succeed:
      return objAgain.save({}, {sessionToken: user.getSessionToken()});
    }).then((x) => {
      x.set('foo', 'baz');
      // This should fail:
      return x.save({},{sessionToken: ""});
    }).then((x) => {
      fail('Should not have been able to save.');
    }, (e) => {
      done();
    });

  });

  it("should recursively load roles", (done) => {

    var rolesNames = ["FooRole", "BarRole", "BazRole"];

    var createRole = function(name, parent, user) {
      var role = new Parse.Role(name, new Parse.ACL());
      if (user) {
        var users = role.relation('users');
        users.add(user);
      }
      if (parent) {
        role.relation('roles').add(parent);
      }
      return role.save({}, { useMasterKey: true });
    }
    var roleIds = {};
     createTestUser().then( (user) => {

       return createRole(rolesNames[0], null, null).then( (aRole) => {
         roleIds[aRole.get("name")] = aRole.id;
          return createRole(rolesNames[1], aRole, null);
       }).then( (anotherRole) => {
         roleIds[anotherRole.get("name")] = anotherRole.id;
         return createRole(rolesNames[2], anotherRole, user);
       }).then( (lastRole) => {
         roleIds[lastRole.get("name")] = lastRole.id;
         var auth = new Auth({ config: cache.apps.get("test"), isMaster: true, user: user });
         return auth._loadRoles();
       })
     }).then( (roles) => {
       expect(roles.length).toEqual(3);
       rolesNames.forEach( (name) => {
        expect(roles.indexOf('role:'+name)).not.toBe(-1);
       })
       done();
     }, function(err){
       fail("should succeed")
       done();
     });
  });

  it("_Role object should not save without name.", (done) => {
    var role = new Parse.Role();
    role.save(null,{useMasterKey:true})
    .then((r) => {
      fail("_Role object should not save without name.");
    }, (error) => {
      expect(error.code).toEqual(111);
      role.set('name','testRole');
      role.save(null,{useMasterKey:true})
      .then((r2)=>{
        fail("_Role object should not save without ACL.");
      }, (error2) =>{
        expect(error2.code).toEqual(111);
        done();
      });
    });
  });

});

