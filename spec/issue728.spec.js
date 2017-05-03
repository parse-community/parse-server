describe("problem ", () => {
  it('shoud work', (done) => {
    var newUser = new Parse.User();
    newUser.set('username', 'test');
    newUser.set('password', '123');

    newUser.signUp(null, { useMasterKey: true })
    .then(function(user) {
        var acl = new Parse.ACL();
        acl.setReadAccess(user.id, true);
        acl.setWriteAccess(user.id, true);
        acl.setPublicReadAccess(false);
        user.setACL(acl);
        return user.save();
    }, function(err) {
        console.log(err);
    }).then((user) => {
      expect(user.getACL().getPublicReadAccess()).toBe(false);
      return user.fetch()
    }).then((user) => {
      expect(user.getACL().getPublicReadAccess()).toBe(false);
      done();
    })
  })
})