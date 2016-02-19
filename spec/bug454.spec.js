describe("bug #454", () => {
  
  it("should update password with master key", done => {
    const user = new Parse.User();
    user.set("username", "hello");
    user.set("password", "world");
    var userId;
    
    user.save().then(res => {
      userId = res.id;
      ok(userId);
      return Parse.User.logOut();
    }).then((res)=> {
      // Find all users
      const query = new Parse.Query(Parse.User);
      return query.find();
    }).then( (res) => {
      // Should only have one
      expect(res.length).toBe(1);
      const user = res[0];
      expect(user.id).toEqual(userId);
      user.set("password", "bla");
      return user.save(null, {useMasterKey: true});
    }).then((res) => {
      return Parse.User.logIn("hello", "bla")
    }).then((user) => {
      expect(user.id).toEqual(userId);
      ok(user.getSessionToken());
      done();
    }).fail( (err) => {
      console.error(err);
      fail(JSON.stringify(err));
      done();
    });
    
  });
  
})