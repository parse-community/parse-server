"use strict";

// Roles are not accessible without the master key, so they are not intended
// for use by clients.  We can manually test them using the master key.
var Auth = require("../src/Auth").Auth;
var Config = require("../src/Config");

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

    var createRole = function(name, sibling, user) {
      var role = new Parse.Role(name, new Parse.ACL());
      if (user) {
        var users = role.relation('users');
        users.add(user);
      }
      if (sibling) {
        role.relation('roles').add(sibling);
      }
      return role.save({}, { useMasterKey: true });
    }
    var roleIds = {};
     createTestUser().then( (user) => {
       // Put the user on the 1st role
       return createRole(rolesNames[0], null, user).then( (aRole) => {
         roleIds[aRole.get("name")] = aRole.id;
         // set the 1st role as a sibling of the second
         // user will should have 2 role now
          return createRole(rolesNames[1], aRole, null);
       }).then( (anotherRole) => {
         roleIds[anotherRole.get("name")] = anotherRole.id;
         // set this role as a sibling of the last
         // the user should now have 3 roles
         return createRole(rolesNames[2], anotherRole, null);
       }).then( (lastRole) => {
         roleIds[lastRole.get("name")] = lastRole.id;
         var auth = new Auth({ config: new Config("test"), isMaster: true, user: user });
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
  
  it("Should properly resolve roles", (done) => {
    let admin = new Parse.Role("Admin", new Parse.ACL());
    let moderator = new Parse.Role("Moderator", new Parse.ACL());
    let superModerator = new Parse.Role("SuperModerator", new Parse.ACL());
    let contentManager = new Parse.Role('ContentManager', new Parse.ACL());
    let superContentManager = new Parse.Role('SuperContentManager', new Parse.ACL());
    Parse.Object.saveAll([admin, moderator, contentManager, superModerator, superContentManager], {useMasterKey: true}).then(() => {
      contentManager.getRoles().add([moderator, superContentManager]);
      moderator.getRoles().add([admin, superModerator]);
      superContentManager.getRoles().add(superModerator);
      return Parse.Object.saveAll([admin, moderator, contentManager, superModerator, superContentManager], {useMasterKey: true});
    }).then(() => { 
      var auth = new Auth({ config: new Config("test"), isMaster: true });
      // For each role, fetch their sibling, what they inherit
      // return with result and roleId for later comparison
      let promises = [admin, moderator, contentManager, superModerator].map((role) => {
        return auth._getAllRoleNamesForId(role.id).then((result) => {
          return Parse.Promise.as({
            id: role.id,
            name: role.get('name'),
            roleIds: result
          });
        })
      });
      
      return Parse.Promise.when(promises);
    }).then((results) => {
      results.forEach((result) => {
        let id = result.id;
        let roleIds = result.roleIds;
        if (id == admin.id) {
          expect(roleIds.length).toBe(2);
          expect(roleIds.indexOf(moderator.id)).not.toBe(-1);
          expect(roleIds.indexOf(contentManager.id)).not.toBe(-1);
        } else if (id == moderator.id) {
          expect(roleIds.length).toBe(1);
          expect(roleIds.indexOf(contentManager.id)).toBe(0);
        } else if (id == contentManager.id) {
          expect(roleIds.length).toBe(0);
        } else if (id == superModerator.id) {
          expect(roleIds.length).toBe(3);
          expect(roleIds.indexOf(moderator.id)).not.toBe(-1);
          expect(roleIds.indexOf(contentManager.id)).not.toBe(-1);
          expect(roleIds.indexOf(superContentManager.id)).not.toBe(-1);
        }
      });
      done();
    }).fail((err) => {
      console.error(err);
      done();
    })
    
  });

  it('can create role and query empty users', (done)=> {
    var roleACL = new Parse.ACL();
    roleACL.setPublicReadAccess(true);
    var role = new Parse.Role('subscribers', roleACL);
    role.save({}, {useMasterKey : true})
      .then((x)=>{
        var query = role.relation('users').query();
        query.find({useMasterKey : true})
          .then((users)=>{
            done();
          }, (e)=>{
            fail('should not have errors');
            done();
          });
      }, (e) => {
        console.log(e);
        fail('should not have errored');
      });
  });

  // Based on various scenarios described in issues #827 and #683,
  it('should properly handle role permissions on objects', (done) => {
    var user, user2, user3;
    var role, role2, role3;
    var obj, obj2;

    var prACL = new Parse.ACL();
    prACL.setPublicReadAccess(true);
    var adminACL, superACL, customerACL;

    createTestUser().then((x) => {
      user = x;
      user2 = new Parse.User();
      return user2.save({ username: 'user2', password: 'omgbbq' });
    }).then((x) => {
      user3 = new Parse.User();
      return user3.save({ username: 'user3', password: 'omgbbq' });
    }).then((x) => {
      role = new Parse.Role('Admin', prACL);
      role.getUsers().add(user);
      return role.save({}, { useMasterKey: true });
    }).then(() => {
      adminACL = new Parse.ACL();
      adminACL.setRoleReadAccess("Admin", true);
      adminACL.setRoleWriteAccess("Admin", true);

      role2 = new Parse.Role('Super', prACL);
      role2.getUsers().add(user2);
      return role2.save({}, { useMasterKey: true });
    }).then(() => {
      superACL = new Parse.ACL();
      superACL.setRoleReadAccess("Super", true);
      superACL.setRoleWriteAccess("Super", true);

      role.getRoles().add(role2);
      return role.save({}, { useMasterKey: true });
    }).then(() => {
      role3 = new Parse.Role('Customer', prACL);
      role3.getUsers().add(user3);
      role3.getRoles().add(role);
      return role3.save({}, { useMasterKey: true });
    }).then(() => {
      customerACL = new Parse.ACL();
      customerACL.setRoleReadAccess("Customer", true);
      customerACL.setRoleWriteAccess("Customer", true);

      var query = new Parse.Query('_Role');
      return query.find({ useMasterKey: true });
    }).then((x) => {
      expect(x.length).toEqual(3);

      obj = new Parse.Object('TestObjectRoles');
      obj.set('ACL', customerACL);
      return obj.save(null, { useMasterKey: true });
    }).then(() => {
      // Above, the Admin role was added to the Customer role.
      // An object secured by the Customer ACL should be able to be edited by the Admin user.
      obj.set('changedByAdmin', true);
      return obj.save(null, { sessionToken: user.getSessionToken() });
    }).then(() => {
      obj2 = new Parse.Object('TestObjectRoles');
      obj2.set('ACL', adminACL);
      return obj2.save(null, { useMasterKey: true });
    }, (e) => {
      fail('Admin user should have been able to save.');
      done();
    }).then(() => {
      // An object secured by the Admin ACL should not be able to be edited by a Customer role user.
      obj2.set('changedByCustomer', true);
      return obj2.save(null, { sessionToken: user3.getSessionToken() });
    }).then(() => {
      fail('Customer user should not have been able to save.');
      done();
    }, (e) => {
      expect(e.code).toEqual(101);
      done();
    })
  });

});

