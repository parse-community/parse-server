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
    let contentCreator = new Parse.Role('ContentManager', new Parse.ACL());
    
    Parse.Object.saveAll([admin, moderator, contentCreator], {useMasterKey: true}).then(() => {
      contentCreator.getRoles().add(moderator);
      moderator.getRoles().add(admin);
      return Parse.Object.saveAll([admin, moderator, contentCreator], {useMasterKey: true});
    }).then(() => { 
      var auth = new Auth({ config: new Config("test"), isMaster: true });
      // For each role, fetch their sibling, what they inherit
      // return with result and roleId for later comparison
      let promises = [admin, moderator, contentCreator].map((role) => {
        return auth._getAllRoleNamesForId(role.id).then((result) => {
          return Parse.Promise.as({
            id: role.id,
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
          expect(roleIds.indexOf(contentCreator.id)).not.toBe(-1);
        } else if (id == moderator.id) {
          expect(roleIds.length).toBe(1);
          expect(roleIds.indexOf(contentCreator.id)).toBe(0);
        } else if (id == contentCreator.id) {
          expect(roleIds.length).toBe(0);
        }
      });
      done();
    }).fail((err) => {
      console.error(err);
      done();
    })
    
  });

});

