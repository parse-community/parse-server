//
// Tests behavior of Parse Sessions
//

"use strict";

describe('Parse.Session', () => {
  it('on query all should retain original sessionTokens with masterKey & sessionToken set', (done) => {
    // sign up a few users
    const user1 = new Parse.User();
    const user2 = new Parse.User();
    const user3 = new Parse.User();

    user1.set("username", "testuser_1");
    user2.set("username", "testuser_2");
    user3.set("username", "testuser_3");

    user1.set("password", "password");
    user2.set("password", "password");
    user3.set("password", "password");

    return user1.signUp().then(() => {
      return user2.signUp();
    }).then(() => {
      return user3.signUp();
    }).then((user) => {
      const query = new Parse.Query(Parse.Session);
      return query.find({
        useMasterKey: true,
        sessionToken: user.get('sessionToken')
      });
    }).then((results) => {
      const foundKeys = [];
      for(const key in results) {
        const sessionToken = results[key].get('sessionToken');
        if(foundKeys[sessionToken]) {
          fail('Duplicate session token present in response');
          break;
        }
        foundKeys[sessionToken] = 1;
      }
      done();
    }).catch((err) => {
      fail(err);
    });
  })

});
