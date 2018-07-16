"use strict";

// Roles are not accessible without the master key, so they are not intended
// for use by clients.  We can manually test them using the master key.
const Auth = require("../lib/Auth").Auth;
const Config = require("../lib/Config");

describe('Parse Role testing', () => {
  it('Do a bunch of basic role testing', done => {
    let user;
    let role;

    createTestUser().then((x) => {
      user = x;
      const acl = new Parse.ACL();
      acl.setPublicReadAccess(true);
      acl.setPublicWriteAccess(false);
      role = new Parse.Object('_Role');
      role.set('name', 'Foos');
      role.setACL(acl);
      const users = role.relation('users');
      users.add(user);
      return role.save({}, { useMasterKey: true });
    }).then(() => {
      const query = new Parse.Query('_Role');
      return query.find({ useMasterKey: true });
    }).then((x) => {
      expect(x.length).toEqual(1);
      const relation = x[0].relation('users').query();
      return relation.first({ useMasterKey: true });
    }).then((x) => {
      expect(x.id).toEqual(user.id);
      // Here we've got a valid role and a user assigned.
      // Lets create an object only the role can read/write and test
      // the different scenarios.
      const obj = new Parse.Object('TestObject');
      const acl = new Parse.ACL();
      acl.setPublicReadAccess(false);
      acl.setPublicWriteAccess(false);
      acl.setRoleReadAccess('Foos', true);
      acl.setRoleWriteAccess('Foos', true);
      obj.setACL(acl);
      return obj.save();
    }).then(() => {
      const query = new Parse.Query('TestObject');
      return query.find({ sessionToken: user.getSessionToken() });
    }).then((x) => {
      expect(x.length).toEqual(1);
      const objAgain = x[0];
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

  const createRole = function(name, sibling, user) {
    // role needs to follow acl
    const ACL = new Parse.ACL()
    ACL.setRoleReadAccess(name, true)
    const role = new Parse.Role(name, ACL);
    if (user) {
      const users = role.relation('users');
      users.add(user);
    }
    if (sibling) {
      role.relation('roles').add(sibling);
    }
    return role.save({}, { useMasterKey: true });
  };

  // Create an ACL for the target Role
  // ACL should give the role 'Read' access to it self.
  const createSelfAcl = function(roleName){
    const acl = new Parse.ACL()
    acl.setRoleReadAccess(roleName, true)
    return acl
  }

  function testLoadRoles(config, done) {
    const rolesNames = ["FooRole", "BarRole", "BazRole"];
    const roleIds = {};
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
        const auth = new Auth({ config, isMaster: true, user: user });
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
  }

  it("should recursively load roles", (done) => {
    testLoadRoles(Config.get('test'), done);
  });

  it("should recursively load roles without config", (done) => {
    testLoadRoles(undefined, done);
  });

  it("_Role object should not save without name.", (done) => {
    const role = new Parse.Role();
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
    const admin = new Parse.Role("Admin", createSelfAcl("Admin"));
    const moderator = new Parse.Role("Moderator", createSelfAcl("Moderator"));
    const superModerator = new Parse.Role("SuperModerator",createSelfAcl("SuperModerator"));
    const contentManager = new Parse.Role('ContentManager', createSelfAcl("ContentManager"));
    const superContentManager = new Parse.Role('SuperContentManager', createSelfAcl("SuperContentManager"));
    Parse.Object.saveAll([admin, moderator, contentManager, superModerator, superContentManager], {useMasterKey: true}).then(() => {
      contentManager.getRoles().add([moderator, superContentManager]);
      moderator.getRoles().add([admin, superModerator]);
      superContentManager.getRoles().add(superModerator);
      return Parse.Object.saveAll([admin, moderator, contentManager, superModerator, superContentManager], {useMasterKey: true});
    }).then(() => {
      const auth = new Auth({ config: Config.get("test"), isMaster: false });
      // For each role, create a user that
      // For each role, fetch their sibling, what they inherit
      // return with result and roleId for later comparison
      const promises = [admin, moderator, contentManager, superModerator].map((role) => {
        const authRoles = auth.getAuthRoles()
        authRoles.toCompute = [ role.id ]
        return authRoles.findRolesOfRolesRecursively().then(() => {
          const roleNames = []
          for (const key in authRoles.manifest) {
            if (authRoles.manifest.hasOwnProperty(key)) {
              roleNames.push(authRoles.manifest[key].name)
            }
          }
          return Parse.Promise.as({
            id: role.id,
            name: role.get('name'),
            roleNames: roleNames
          });
        })
      });

      return Promise.all(promises);
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
    }).catch(() => {
      done();
    })

  });

  it('can create role and query empty users', (done)=> {
    const roleACL = new Parse.ACL();
    roleACL.setPublicReadAccess(true);
    const role = new Parse.Role('subscribers', roleACL);
    role.save({}, {useMasterKey : true})
      .then(()=>{
        const query = role.relation('users').query();
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
    let user, user2, user3;
    let role, role2, role3;
    let obj, obj2;

    const prACL = new Parse.ACL();
    prACL.setPublicReadAccess(true);
    let adminACL, superACL, customerACL;

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

      const query = new Parse.Query('_Role');
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
    let user, user2, user3;
    let role;
    let obj;

    const prACL = new Parse.ACL();
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
      const users = role.relation('users');
      users.add(user);
      users.add(user2);
      users.add(user3);
      return role.save({}, { useMasterKey: true });
    }).then(() => {
      // query for saved role and get 3 users
      const query = new Parse.Query('_Role');
      query.equalTo('name', 'sharedRole');
      return query.find({ useMasterKey: true });
    }).then((role) => {
      expect(role.length).toEqual(1);
      const users = role[0].relation('users').query();
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
      const query = new Parse.Query('_Role');
      query.equalTo('name', 'sharedRole');
      return query.find({ useMasterKey: true });
    }).then((role) => {
      expect(role.length).toEqual(1);
      const users = role[0].relation('users');
      users.remove(user);
      users.remove(user3);
      return role[0].save({}, { useMasterKey: true });
    }).then((role) =>{
      const users = role.relation('users').query();
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
    const user = new Parse.User();
    user
      .save({ username: 'admin', password: 'admin' })
      .then((user) => {
        const aCL = new Parse.ACL();
        aCL.setPublicReadAccess(true);
        aCL.setPublicWriteAccess(true);
        const role = new Parse.Role('admin', aCL);
        const users = role.relation('users');
        users.add(user);
        role
          .save({}, { useMasterKey: true })
          .then(() => {
            const query = new Parse.Query(Parse.Role);
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
    const user = new Parse.User();
    user
      .save({ username: 'admin', password: 'admin' })
      .then((user) => {
        const aCL = new Parse.ACL();
        aCL.setPublicReadAccess(true);
        aCL.setPublicWriteAccess(true);
        const role = new Parse.Role('admin', aCL);
        const users = role.relation('users');
        users.add(user);
        role
          .save({}, { useMasterKey: true })
          .then(() => {
            const otherUser = new Parse.User();
            otherUser
              .save({ username: 'otherUser', password: 'otherUser' })
              .then((otherUser) => {
                const query = new Parse.Query(Parse.Role);
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
    const user = new Parse.User();
    user
      .save({ username: 'admin', password: 'admin' })
      .then((user) => {
        const aCL = new Parse.ACL();
        aCL.setPublicReadAccess(true);
        aCL.setPublicWriteAccess(true);
        const role = new Parse.Role('admin', aCL);
        const users = role.relation('users');
        users.add(user);
        role
          .save({}, { useMasterKey: true })
          .then(() => {
            const query = new Parse.Query(Parse.Role);
            query.equalTo('name', 'admin');
            query.equalTo('users', null);
            query.find().then(function (roles) {
              expect(roles.length).toEqual(0);
              done();
            });
          });
      });
  });

  it('Roles should follow ACL properly', (done) => {
    const r1ACL = createSelfAcl("r1")
    const r1 = new Parse.Role("r1", r1ACL);
    const r2ACL = createSelfAcl("r2")
    const r2 = new Parse.Role("r2", r2ACL);
    const r3ACL = createSelfAcl("r3")
    const r3 = new Parse.Role("r3", r3ACL);
    const r4ACL = createSelfAcl("r4")
    const r4 = new Parse.Role("r4", r4ACL);
    let user1;
    let user2;
    Parse.Object.saveAll([r1, r2, r3, r4], {useMasterKey: true})
      .then(() => createUser("1"))
      .then((u) => {
        user1 = u
        return createUser("2")
      })
      .then((u) => {
        user2 = u
        r1.getUsers().add([user1, user2])
        r2.getRoles().add(r1)
        r3.getRoles().add(r2)
        r4.getUsers().add(user2)
        return Parse.Object.saveAll([r1, r2, r3, r4], {useMasterKey: true})
      })
      .then(() => {
        const auth = new Auth({ config: Config.get("test"), user: user1 });
        // all roles should be accessed
        // R1[ok] -> R2[ok] -> R3[ok]
        return auth.getUserRoles()
      })
      .then((roles) => {
        expect(roles.length).toBe(3);
        expect(roles.indexOf("role:r1")).not.toBe(-1);
        expect(roles.indexOf("role:r2")).not.toBe(-1);
        expect(roles.indexOf("role:r3")).not.toBe(-1);
        expect(roles.indexOf("role:r4")).not.toBe(1);

        // Revoke Access to R2
        // Only R1 should be accessed.
        r2.setACL(new Parse.ACL())
        return r2.save({}, { useMasterKey: true })
      })

      .then(() => {
        const auth = new Auth({ config: Config.get("test"), user: user1 });
        // only R1 should be accessed
        // R1[ok] -> R2[x] -> R3[x because of R2]
        return auth.getUserRoles()
      })
      .then((roles) => {
        expect(roles.length).toBe(1);
        expect(roles.indexOf("role:r1")).not.toBe(-1);
        expect(roles.indexOf("role:r4")).not.toBe(1);

        // R2 access is restored for user1 explicitly
        // All roles should be accessed by user1
        const ACL = new Parse.ACL()
        ACL.setReadAccess(user1, true)
        r2.setACL(ACL)
        return r2.save({}, { useMasterKey: true })
      })

      .then(() => {
        // all roles should be accessed by user1
        // R1[ok] -> R2[ok(user1 explicit access)] -> R3[ok]
        // Only R1 & R4 should be accessed by user2
        const auth1 = new Auth({ config: Config.get("test"), user: user1 });
        const auth2 = new Auth({ config: Config.get("test"), user: user2 });
        return Promise.all([auth1.getUserRoles(), auth2.getUserRoles()])
      })
      .then(([roles1, roles2]) => {
        expect(roles1.length).toBe(3);
        expect(roles1.indexOf("role:r1")).not.toBe(-1);
        expect(roles1.indexOf("role:r2")).not.toBe(-1);
        expect(roles1.indexOf("role:r3")).not.toBe(-1);
        expect(roles1.indexOf("role:r4")).not.toBe(1);
        expect(roles2.length).toBe(2);
        expect(roles2.indexOf("role:r1")).not.toBe(-1);
        expect(roles2.indexOf("role:r4")).not.toBe(-1);

        // reject access to r2
        // give access to r3
        // only r1 should be accessed since the path to r3 is broken
        r2.setACL(new Parse.ACL())
        const r3ACL = new Parse.ACL()
        r3ACL.setReadAccess(user1, true)
        return Parse.Object.saveAll([r2, r3], {useMasterKey: true})
      })

      .then(() => {
        const auth = new Auth({ config: Config.get("test"), user: user1 });
        // only r1 should be accessed
        // R1[ok] -> R2[x] -> R3[x(eaven if user has direct access)]
        return auth.getUserRoles()
      })
      .then((roles) => {
        expect(roles.length).toBe(1);
        expect(roles.indexOf("role:r1")).not.toBe(-1);

        done()
      })
      .catch(error => fail(error))
  })

  it('Roles should handle multiple paths properly using ACL', (done) => {
    /**
     * R1 -> R2 -> R3 -> R4
     * R5 -> R6 -> R3
     * R7 -> R8 -> R3
     */
    const r1ACL = createSelfAcl("r1")
    const r1 = new Parse.Role("r1", r1ACL);
    const r2ACL = createSelfAcl("r2")
    const r2 = new Parse.Role("r2", r2ACL);
    const r3ACL = createSelfAcl("r3")
    const r3 = new Parse.Role("r3", r3ACL);
    const r4ACL = createSelfAcl("r4")
    const r4 = new Parse.Role("r4", r4ACL);
    const r5ACL = createSelfAcl("r5")
    const r5 = new Parse.Role("r5", r5ACL);
    const r6ACL = createSelfAcl("r6")
    const r6 = new Parse.Role("r6", r6ACL);
    const r7ACL = createSelfAcl("r7")
    const r7 = new Parse.Role("r7", r7ACL);
    const r8ACL = createSelfAcl("r8")
    const r8 = new Parse.Role("r8", r8ACL);
    let user;
    Parse.Object.saveAll([r1, r2, r3, r4, r5, r6, r7, r8], {useMasterKey: true})
      .then(() => createTestUser())
      .then((u) => {
        user = u
        // direct roles
        r1.getUsers().add(user)
        r5.getUsers().add(user)
        r7.getUsers().add(user)
        // indirect
        r2.getRoles().add(r1)
        r6.getRoles().add(r5)
        r8.getRoles().add(r7)

        r3.getRoles().add([r2,r6,r8]) // multy paths to get to r3
        r4.getRoles().add(r3) // r4 relies on r3
        return Parse.Object.saveAll([r1, r2, r3, r4, r5, r6, r7, r8], {useMasterKey: true})
      })
      .then(() => {
        const auth = new Auth({ config: Config.get("test"), user });
        // all roles should be accessed
        return auth.getUserRoles()
      })
      .then((roles) => {
        expect(roles.length).toBe(8);
        expect(roles.indexOf("role:r1")).not.toBe(-1);
        expect(roles.indexOf("role:r2")).not.toBe(-1);
        expect(roles.indexOf("role:r3")).not.toBe(-1);
        expect(roles.indexOf("role:r4")).not.toBe(-1);
        expect(roles.indexOf("role:r5")).not.toBe(-1);
        expect(roles.indexOf("role:r6")).not.toBe(-1);
        expect(roles.indexOf("role:r7")).not.toBe(-1);
        expect(roles.indexOf("role:r8")).not.toBe(-1);

        // disable any path, r3 should still be accessible
        const acl = createSelfAcl("test")
        r2.setACL(acl)
        r6.setACL(acl)
        return Parse.Object.saveAll([r2, r6], {useMasterKey: true})
      })
      .then(() => {
        const auth = new Auth({ config: Config.get("test"), user });
        // all roles should be accessed
        return auth.getUserRoles()
      })
      .then((roles) => {
        expect(roles.length).toBe(6);
        expect(roles.indexOf("role:r1")).not.toBe(-1);
        expect(roles.indexOf("role:r2")).toBe(-1);
        expect(roles.indexOf("role:r3")).not.toBe(-1);
        expect(roles.indexOf("role:r4")).not.toBe(-1);
        expect(roles.indexOf("role:r5")).not.toBe(-1);
        expect(roles.indexOf("role:r6")).toBe(-1);
        expect(roles.indexOf("role:r7")).not.toBe(-1);
        expect(roles.indexOf("role:r8")).not.toBe(-1);

        done()
      })
      .catch(error => fail(error))
  })

  it('Roles should handle circular properly using ACL', (done) => {
    /**
     * R1 -> R2 -> R3 -> R4 -> R3
     */
    const r1ACL = createSelfAcl("r1")
    const r1 = new Parse.Role("r1", r1ACL);
    const r2ACL = createSelfAcl("r2")
    const r2 = new Parse.Role("r2", r2ACL);
    const r3ACL = createSelfAcl("r3")
    const r3 = new Parse.Role("r3", r3ACL);
    const r4ACL = createSelfAcl("r4")
    const r4 = new Parse.Role("r4", r4ACL);
    let user;
    Parse.Object.saveAll([r1, r2, r3, r4], {useMasterKey: true})
      .then(() => createTestUser())
      .then((u) => {
        user = u
        // direct roles
        r1.getUsers().add(user)
        // indirect
        r2.getRoles().add(r1)
        r3.getRoles().add(r2)
        r4.getRoles().add(r3)
        r3.getRoles().add(r4)
        return Parse.Object.saveAll([r1, r2, r3, r4], {useMasterKey: true})
      })
      .then(() => {
        const auth = new Auth({ config: Config.get("test"), user });
        // all roles should be accessed
        return auth.getUserRoles()
      })
      .then((roles) => {
        expect(roles.length).toBe(4);
        expect(roles.indexOf("role:r1")).not.toBe(-1);
        expect(roles.indexOf("role:r2")).not.toBe(-1);
        expect(roles.indexOf("role:r3")).not.toBe(-1);
        expect(roles.indexOf("role:r4")).not.toBe(-1);

        done()
      })
      .catch(error => fail(error))
  })

  it('Roles security for objects should follow ACL properly', (done) => {
    const r1ACL = createSelfAcl("r1")
    const r1 = new Parse.Role("r1", r1ACL);
    const r2ACL = createSelfAcl("r2")
    const r2 = new Parse.Role("r2", r2ACL);
    const r3ACL = createSelfAcl("r3")
    const r3 = new Parse.Role("r3", r3ACL);
    let user;
    Parse.Object.saveAll([r1, r2, r3], {useMasterKey: true})
      .then(() => createTestUser())
      .then((u) => {
        user = u
        r1.getUsers().add(user)
        r2.getRoles().add(r1)
        r3.getRoles().add(r2)
        return Parse.Object.saveAll([r1, r2, r3], {useMasterKey: true})
      })
      .then(() => {
        const objACL = new Parse.ACL();
        objACL.setRoleReadAccess(r3, true)

        // object only accessed by R3
        const obj = new Parse.Object('TestObjectRoles');
        obj.setACL(objACL);
        return obj.save(null, { useMasterKey: true });
      })
      .then(() => {
        const query = new Parse.Query("TestObjectRoles");
        return query.find()
      })
      .then((objects) => {
        expect(objects.length).toBe(1);

        r2.setACL(new Parse.ACL())
        return r2.save({}, { useMasterKey: true })
      })
      .then(() => {
        const query = new Parse.Query("TestObjectRoles");
        return query.find()
      })
      .then((objects) => {
        expect(objects.length).toBe(0);

        const ACL = new Parse.ACL()
        ACL.setReadAccess(user, true)
        r2.setACL(ACL)
        return r2.save({}, { useMasterKey: true })
      })
      .then(() => {
        const query = new Parse.Query("TestObjectRoles");
        return query.find()
      })
      .then((objects) => {
        expect(objects.length).toBe(1);

        r2.setACL(new Parse.ACL())
        const r3ACL = new Parse.ACL()
        r3ACL.setReadAccess(user, true)
        return Parse.Object.saveAll([r2, r3], {useMasterKey: true})
      })
      .then(() => {
        const query = new Parse.Query("TestObjectRoles");
        return query.find()
      })
      .then((objects) => {
        expect(objects.length).toBe(0);

        done()
      })
      .catch(error => fail(error))
  })
});
