'use strict';
var Schema = require('../src/Controllers/SchemaController');

var Config = require('../src/Config');

describe('Pointer Permissions', () => {
  it('should work with find', (done) => {
    let config = new Config(Parse.applicationId);
    let user = new Parse.User();
    let user2 = new Parse.User();
    user.set({
      username: 'user1',
      password: 'password'
    });
    user2.set({
      username: 'user2',
      password: 'password'
    });
    let obj = new Parse.Object('AnObject');
    let obj2 = new Parse.Object('AnObject');

    Parse.Object.saveAll([user, user2]).then(() => {
      obj.set('owner', user);
      obj2.set('owner', user2);
      return Parse.Object.saveAll([obj, obj2]);
    }).then(() => {
      return config.database.loadSchema().then((schema) => {
        return schema.updateClass('AnObject', {}, {readUserFields: ['owner']})
      });
    }).then(() => {
       return Parse.User.logIn('user1', 'password');
    }).then(() => {
      let q = new Parse.Query('AnObject');
      return q.find();
    }).then((res) => {
      expect(res.length).toBe(1);
      expect(res[0].id).toBe(obj.id);
      done();
    }).catch((err) => {
      fail('Should not fail');
      done();
    });
  });
  
  
  it('should work with write', (done) => {
    let config = new Config(Parse.applicationId);
    let user = new Parse.User();
    let user2 = new Parse.User();
    user.set({
      username: 'user1',
      password: 'password'
    });
    user2.set({
      username: 'user2',
      password: 'password'
    });
    let obj = new Parse.Object('AnObject');
    let obj2 = new Parse.Object('AnObject');

    Parse.Object.saveAll([user, user2]).then(() => {
      obj.set('owner', user);
      obj.set('reader', user2);
      obj2.set('owner', user2);
      obj2.set('reader', user);
      return Parse.Object.saveAll([obj, obj2]);
    }).then(() => {
      return config.database.loadSchema().then((schema) => {
        return schema.updateClass('AnObject', {}, {writeUserFields: ['owner'], readUserFields: ['reader', 'owner']});
      });
    }).then(() => {
       return Parse.User.logIn('user1', 'password');
    }).then(() => {
      obj2.set('hello', 'world');
      return obj2.save();
    }).then((res) => {
      fail('User should not be able to update obj2');
    }, (err) => {
      // User 1 should not be able to update obj2
      expect(err.code).toBe(101);
      return Promise.resolve();
    }).then(()=> {
      obj.set('hello', 'world');
      return obj.save();
    }).then(() => {
      return Parse.User.logIn('user2', 'password');
    }, (err) => {
      fail('User should be able to update');
      return Promise.resolve();
    }).then(() => {
      let q = new Parse.Query('AnObject');
      return q.find();
    }, (err) => {
      fail('should login with user 2');
    }).then((res) => {
      expect(res.length).toBe(2);
      res.forEach((result) => {
        if (result.id == obj.id) {
          expect(result.get('hello')).toBe('world');
        } else {
          expect(result.id).toBe(obj2.id);
        }
      })
      done();
    }, (err) =>  {
      fail("failed");
      done();
    })
  });
  
  it('should let a proper user find', (done) => {
    let config = new Config(Parse.applicationId);
    let user = new Parse.User();
    let user2 = new Parse.User();
    user.set({
      username: 'user1',
      password: 'password'
    });
    user2.set({
      username: 'user2',
      password: 'password'
    });
    let obj = new Parse.Object('AnObject');
    let obj2 = new Parse.Object('AnObject');
    user.signUp().then(() => {
      return user2.signUp()
    }).then(() => {
      Parse.User.logOut();
    }).then(() => {
      obj.set('owner', user);
      return Parse.Object.saveAll([obj, obj2]);
    }).then(() => {
      return config.database.loadSchema().then((schema) => {
        return schema.updateClass('AnObject', {}, {find: {}, get:{}, readUserFields: ['owner']})
      });
    }).then(() => {
      let q = new Parse.Query('AnObject');
      return q.find();
    }).then((res) => {
      expect(res.length).toBe(0);     
    }).then(() => {
      return Parse.User.logIn('user2', 'password');
    }).then(() => {
      let q = new Parse.Query('AnObject');
      return q.find();
    }).then((res) => {
      expect(res.length).toBe(0);
      let q = new Parse.Query('AnObject');
      return q.get(obj.id);
    }).then(() => {
      fail('User 2 should not get the obj1 object');
    }, (err) => {
      expect(err.code).toBe(101);
      expect(err.message).toBe('Object not found.');
      return Promise.resolve();
    }).then(() => {
      return Parse.User.logIn('user1', 'password');
    }).then(() => {
      let q = new Parse.Query('AnObject');
      return q.find();
    }).then((res) => {
      expect(res.length).toBe(1);
      done();
    }).catch((err) => {
      console.error(err);
      fail('should not fail');
      done();
    })
  });
  
  it('should not allow creating objects', (done) => {
    let config = new Config(Parse.applicationId);
    let user = new Parse.User();
    user.set({
      username: 'user1',
      password: 'password'
    });
    let obj = new Parse.Object('AnObject');
    user.save().then(() => {
      return config.database.loadSchema().then((schema) => {
        return schema.addClassIfNotExists('AnObject', {}, {create: {}, writeUserFields: ['owner'], readUserFields: ['owner']});
      });
    }).then(() => {
       return Parse.User.logIn('user1', 'password');
    }).then(() => {
      obj.set('owner', user);
      return obj.save();
    }).then(() => {
       fail('should not succeed');
       done();
    }, (err) => {
      expect(err.code).toBe(119);
      done();
    })
  });
  
  it('should handle multiple writeUserFields', (done) => {
    let config = new Config(Parse.applicationId);
    let user = new Parse.User();
    let user2 = new Parse.User();
    user.set({
      username: 'user1',
      password: 'password'
    });
    user2.set({
      username: 'user2',
      password: 'password'
    });
    let obj = new Parse.Object('AnObject');
    Parse.Object.saveAll([user, user2]).then(() => {
      obj.set('owner', user);
      obj.set('otherOwner', user2);
      return obj.save();
    }).then(() => {
      return config.database.loadSchema().then((schema) => {
        return schema.updateClass('AnObject', {}, {find: {"*": true},writeUserFields: ['owner', 'otherOwner']});
      });
    }).then(() => {
      return Parse.User.logIn('user1', 'password');
    }).then(() => {
      return obj.save({hello: 'fromUser1'});
    }).then(() => {
      return Parse.User.logIn('user2', 'password');
    }).then(() => {
      return obj.save({hello: 'fromUser2'});
    }).then(() => {
      Parse.User.logOut();
      let q = new Parse.Query('AnObject');
      return q.first();
    }).then((result) => {
      expect(result.get('hello')).toBe('fromUser2');
      done();
    }).catch(err => {
      fail('should not fail');
      done();
    })
  });
});