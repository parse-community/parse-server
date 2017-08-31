"use strict";

// Roles are not accessible without the master key, so they are not intended
// for use by clients.  We can manually test them using the master key.
var RestQuery = require("../src/RestQuery");
var Auth = require("../src/Auth").Auth;
var Config = require("../src/Config");

describe('Parse Role testing', () => {
  it('Do a bunch of basic role testing', done => {
    var user;
    var role;

    createTestUser().then((x) => {
      user = x;
      const acl = new Parse.ACL();
      acl.setPublicReadAccess(true);
      acl.setPublicWriteAccess(false);
      role = new Parse.Object('_Role');
      role.set('name', 'Foos');
      role.setACL(acl);
      var users = role.relation('users');
      users.add(user);
      return role.save({}, { useMasterKey: true });
    }).then(() => {
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
    }).then(() => {
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
    }).then(() => {
      fail('Should not have been able to save.');
    }, (e) => {
      expect(e.code).toEqual(Parse.Error.OBJECT_NOT_FOUND);
      done();
    });

  });

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
  };

  it("should not recursively load the same role multiple times", (done) => {
    var rootRole = "RootRole";
    var roleNames = ["FooRole", "BarRole", "BazRole"];
    var allRoles = [rootRole].concat(roleNames);

    var roleObjs = {};
    var createAllRoles = function(user) {
      var promises = allRoles.map(function(roleName) {
        return createRole(roleName, null, user)
          .then(function(roleObj) {
            roleObjs[roleName] = roleObj;
            return roleObj;
          });
      });
      return Promise.all(promises);
    };

    var restExecute = spyOn(RestQuery.prototype, "execute").and.callThrough();

    var user,
      auth,
      getAllRolesSpy;
    createTestUser().then((newUser) => {
      user = newUser;
      return createAllRoles(user);
    }).then ((roles) => {
      var rootRoleObj = roleObjs[rootRole];
      roles.forEach(function(role, i) {
        // Add all roles to the RootRole
        if (role.id !== rootRoleObj.id) {
          role.relation("roles").add(rootRoleObj);
        }
        // Add all "roleNames" roles to the previous role
        if (i > 0) {
          role.relation("roles").add(roles[i - 1]);
        }
      });

      return Parse.Object.saveAll(roles, { useMasterKey: true });
    }).then(() => {
      auth = new Auth({config: new Config("test"), isMaster: true, user: user});
      getAllRolesSpy = spyOn(auth, "_getAllRolesNamesForRoleIds").and.callThrough();

      return auth._loadRoles();
    }).then ((roles) => {
      expect(roles.length).toEqual(4);

      allRoles.forEach(function(name) {
        expect(roles.indexOf("role:" + name)).not.toBe(-1);
      });

      // 1 Query for the initial setup
      // 1 query for the parent roles
      expect(restExecute.calls.count()).toEqual(2);

      // 1 call for the 1st layer of roles
      // 1 call for the 2nd layer
      expect(getAllRolesSpy.calls.count()).toEqual(2);
      done()
    }).catch(() =>  {
      fail("should succeed");
      done();
    });

  });

  it("should recursively load roles", (done) => {
    var rolesNames = ["FooRole", "BarRole", "BazRole"];
    var roleIds = {};
    createTestUser().then((user) => {
      // Put the user on the 1st role
      return createRole(rolesNames[0], null, user).then((aRole) => {
        roleIds[aRole.get("name")] = aRole.id;
        // set the 1st role as a sibling of the second
        // user will should have 2 role now
        return createRole(rolesNames[1], aRole, null);
      }).then((anotherRole) => {
        roleIds[anotherRole.get("name")] = anotherRole.id;
        // set this role as a sibling of the last
        // the user should now have 3 roles
        return createRole(rolesNames[2], anotherRole, null);
      }).then((lastRole) => {
        roleIds[lastRole.get("name")] = lastRole.id;
        var auth = new Auth({ config: new Config("test"), isMaster: true, user: user });
        return auth._loadRoles();
      })
    }).then((roles) => {
      expect(roles.length).toEqual(3);
      rolesNames.forEach((name) => {
        expect(roles.indexOf('role:' + name)).not.toBe(-1);
      });
      done();
    }, function(){
      fail("should succeed")
      done();
    });
  });

  it("_Role object should not save without name.", (done) => {
    var role = new Parse.Role();
    role.save(null,{useMasterKey:true})
      .then(() => {
        fail("_Role object should not save without name.");
      }, (error) => {
        expect(error.code).toEqual(111);
        role.set('name','testRole');
        role.save(null,{useMasterKey:true})
          .then(()=>{
            fail("_Role object should not save without ACL.");
          }, (error2) =>{
            expect(error2.code).toEqual(111);
            done();
          });
      });
  });

  it("Different _Role objects cannot have the same name.", (done) => {
    const roleName = "MyRole";
    let aUser;
    createTestUser().then((user) => {
      aUser = user;
      return createRole(roleName, null, aUser);
    }).then((firstRole) => {
      expect(firstRole.getName()).toEqual(roleName);
      return createRole(roleName, null, aUser);
    }).then(() => {
      fail("_Role cannot have the same name as another role");
      done();
    }, (error) => {
      expect(error.code).toEqual(137);
      done();
    });
  });

  it("Should properly resolve roles", (done) => {
    const admin = new Parse.Role("Admin", new Parse.ACL());
    const moderator = new Parse.Role("Moderator", new Parse.ACL());
    const superModerator = new Parse.Role("SuperModerator", new Parse.ACL());
    const contentManager = new Parse.Role('ContentManager', new Parse.ACL());
    const superContentManager = new Parse.Role('SuperContentManager', new Parse.ACL());
    Parse.Object.saveAll([admin, moderator, contentManager, superModerator, superContentManager], {useMasterKey: true}).then(() => {
      contentManager.getRoles().add([moderator, superContentManager]);
      moderator.getRoles().add([admin, superModerator]);
      superContentManager.getRoles().add(superModerator);
      return Parse.Object.saveAll([admin, moderator, contentManager, superModerator, superContentManager], {useMasterKey: true});
    }).then(() => {
      var auth = new Auth({ config: new Config("test"), isMaster: true });
      // For each role, fetch their sibling, what they inherit
      // return with result and roleId for later comparison
      const promises = [admin, moderator, contentManager, superModerator].map((role) => {
        return auth._getAllRolesNamesForRoleIds([role.id]).then((result) => {
          return Parse.Promise.as({
            id: role.id,
            name: role.get('name'),
            roleNames: result
          });
        })
      });

      return Parse.Promise.when(promises);
    }).then((results) => {
      results.forEach((result) => {
        const id = result.id;
        const roleNames = result.roleNames;
        if (id == admin.id) {
          expect(roleNames.length).toBe(2);
          expect(roleNames.indexOf("Moderator")).not.toBe(-1);
          expect(roleNames.indexOf("ContentManager")).not.toBe(-1);
        } else if (id == moderator.id) {
          expect(roleNames.length).toBe(1);
          expect(roleNames.indexOf("ContentManager")).toBe(0);
        } else if (id == contentManager.id) {
          expect(roleNames.length).toBe(0);
        } else if (id == superModerator.id) {
          expect(roleNames.length).toBe(3);
          expect(roleNames.indexOf("Moderator")).not.toBe(-1);
          expect(roleNames.indexOf("ContentManager")).not.toBe(-1);
          expect(roleNames.indexOf("SuperContentManager")).not.toBe(-1);
        }
      });
      done();
    }).fail(() => {
      done();
    })

  });

  it('can create role and query empty users', (done)=> {
    var roleACL = new Parse.ACL();
    roleACL.setPublicReadAccess(true);
    var role = new Parse.Role('subscribers', roleACL);
    role.save({}, {useMasterKey : true})
      .then(()=>{
        var query = role.relation('users').query();
        query.find({useMasterKey : true})
          .then(()=>{
            done();
          }, ()=>{
            fail('should not have errors');
            done();
          });
      }, () => {
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
    }).then(() => {
      user3 = new Parse.User();
      return user3.save({ username: 'user3', password: 'omgbbq' });
    }).then(() => {
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
    }, () => {
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
      if (e) {
        expect(e.code).toEqual(101);
      } else {
        fail('should return an error');
      }
      done();
    })
  });

  it('should add multiple users to a role and remove users', (done) => {
    var user, user2, user3;
    var role;
    var obj;

    var prACL = new Parse.ACL();
    prACL.setPublicReadAccess(true);
    prACL.setPublicWriteAccess(true);

    createTestUser().then((x) => {
      user = x;
      user2 = new Parse.User();
      return user2.save({ username: 'user2', password: 'omgbbq' });
    }).then(() => {
      user3 = new Parse.User();
      return user3.save({ username: 'user3', password: 'omgbbq' });
    }).then(() => {
      role = new Parse.Role('sharedRole', prACL);
      var users = role.relation('users');
      users.add(user);
      users.add(user2);
      users.add(user3);
      return role.save({}, { useMasterKey: true });
    }).then(() => {
      // query for saved role and get 3 users
      var query = new Parse.Query('_Role');
      query.equalTo('name', 'sharedRole');
      return query.find({ useMasterKey: true });
    }).then((role) => {
      expect(role.length).toEqual(1);
      var users = role[0].relation('users').query();
      return users.find({ useMasterKey: true });
    }).then((users) => {
      expect(users.length).toEqual(3);
      obj = new Parse.Object('TestObjectRoles');
      obj.set('ACL', prACL);
      return obj.save(null, { useMasterKey: true });
    }).then(() => {
      // Above, the Admin role was added to the Customer role.
      // An object secured by the Customer ACL should be able to be edited by the Admin user.
      obj.set('changedByUsers', true);
      return obj.save(null, { sessionToken: user.getSessionToken() });
    }).then(() => {
      // query for saved role and get 3 users
      var query = new Parse.Query('_Role');
      query.equalTo('name', 'sharedRole');
      return query.find({ useMasterKey: true });
    }).then((role) => {
      expect(role.length).toEqual(1);
      var users = role[0].relation('users');
      users.remove(user);
      users.remove(user3);
      return role[0].save({}, { useMasterKey: true });
    }).then((role) =>{
      var users = role.relation('users').query();
      return users.find({ useMasterKey: true });
    }).then((users) => {
      expect(users.length).toEqual(1);
      expect(users[0].get('username')).toEqual('user2');
      done();
    });
  });

  it('should be secure (#3835)', (done) => {
    const acl = new Parse.ACL();
    acl.getPublicReadAccess(true);
    const role = new Parse.Role('admin', acl);
    role.save().then(() => {
      const user = new Parse.User();
      return user.signUp({username: 'hello', password: 'world'});
    }).then((user) => {
      role.getUsers().add(user)
      return role.save();
    }).then(done.fail, () => {
      const query = role.getUsers().query();
      return query.find({useMasterKey: true});
    }).then((results) => {
      expect(results.length).toBe(0);
      done();
    })
      .catch(done.fail);
  });

  it('should match when matching in users relation', (done) => {
    var user = new Parse.User();
    user
      .save({ username: 'admin', password: 'admin' })
      .then((user) => {
        var aCL = new Parse.ACL();
        aCL.setPublicReadAccess(true);
        aCL.setPublicWriteAccess(true);
        var role = new Parse.Role('admin', aCL);
        var users = role.relation('users');
        users.add(user);
        role
          .save({}, { useMasterKey: true })
          .then(() => {
            var query = new Parse.Query(Parse.Role);
            query.equalTo('name', 'admin');
            query.equalTo('users', user);
            query.find().then(function (roles) {
              expect(roles.length).toEqual(1);
              done();
            });
          });
      });
  });

  it('should not match any entry when not matching in users relation', (done) => {
    var user = new Parse.User();
    user
      .save({ username: 'admin', password: 'admin' })
      .then((user) => {
        var aCL = new Parse.ACL();
        aCL.setPublicReadAccess(true);
        aCL.setPublicWriteAccess(true);
        var role = new Parse.Role('admin', aCL);
        var users = role.relation('users');
        users.add(user);
        role
          .save({}, { useMasterKey: true })
          .then(() => {
            var otherUser = new Parse.User();
            otherUser
              .save({ username: 'otherUser', password: 'otherUser' })
              .then((otherUser) => {
                var query = new Parse.Query(Parse.Role);
                query.equalTo('name', 'admin');
                query.equalTo('users', otherUser);
                query.find().then(function(roles) {
                  expect(roles.length).toEqual(0);
                  done();
                });
              });
          });
      });
  });

  it('should not match any entry when searching for null in users relation', (done) => {
    var user = new Parse.User();
    user
      .save({ username: 'admin', password: 'admin' })
      .then((user) => {
        var aCL = new Parse.ACL();
        aCL.setPublicReadAccess(true);
        aCL.setPublicWriteAccess(true);
        var role = new Parse.Role('admin', aCL);
        var users = role.relation('users');
        users.add(user);
        role
          .save({}, { useMasterKey: true })
          .then(() => {
            var query = new Parse.Query(Parse.Role);
            query.equalTo('name', 'admin');
            query.equalTo('users', null);
            query.find().then(function (roles) {
              expect(roles.length).toEqual(0);
              done();
            });
          });
      });
  });
});
