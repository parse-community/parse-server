

// Roles are not accessible without the master key, so they are not intended
// for use by clients.  We can manually test them using the master key.

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
      return x.save();
    }).then((x) => {
      fail('Should not have been able to save.');
    }, (e) => {
      done();
    });

  });

});

