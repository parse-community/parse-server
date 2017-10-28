'use strict';
var Config = require('../src/Config');

describe('Pointer Permissions', () => {

  beforeEach(() => {
    Config.get(Parse.applicationId).database.schemaCache.clear();
  });

  it('should work with find', (done) => {
    const config = Config.get(Parse.applicationId);
    const user = new Parse.User();
    const user2 = new Parse.User();
    user.set({
      username: 'user1',
      password: 'password'
    });
    user2.set({
      username: 'user2',
      password: 'password'
    });
    const obj = new Parse.Object('AnObject');
    const obj2 = new Parse.Object('AnObject');

    Parse.Object.saveAll([user, user2]).then(() => {
      obj.set('owner', user);
      obj2.set('owner', user2);
      return Parse.Object.saveAll([obj, obj2]);
    }).then(() => {
      return config.database.loadSchema().then((schema) => {
        return schema.updateClass('AnObject', {}, {readUserFields: ['owner']})
      });
    }).then(() => {
      return Parse.User.logIn('user1', 'password');
    }).then(() => {
      const q = new Parse.Query('AnObject');
      return q.find();
    }).then((res) => {
      expect(res.length).toBe(1);
      expect(res[0].id).toBe(obj.id);
      done();
    }).catch(error => {
      fail(JSON.stringify(error));
      done();
    });
  });


  it('should work with write', (done) => {
    const config = Config.get(Parse.applicationId);
    const user = new Parse.User();
    const user2 = new Parse.User();
    user.set({
      username: 'user1',
      password: 'password'
    });
    user2.set({
      username: 'user2',
      password: 'password'
    });
    const obj = new Parse.Object('AnObject');
    const obj2 = new Parse.Object('AnObject');

    Parse.Object.saveAll([user, user2]).then(() => {
      obj.set('owner', user);
      obj.set('reader', user2);
      obj2.set('owner', user2);
      obj2.set('reader', user);
      return Parse.Object.saveAll([obj, obj2]);
    }).then(() => {
      return config.database.loadSchema().then((schema) => {
        return schema.updateClass('AnObject', {}, {writeUserFields: ['owner'], readUserFields: ['reader', 'owner']});
      });
    }).then(() => {
      return Parse.User.logIn('user1', 'password');
    }).then(() => {
      obj2.set('hello', 'world');
      return obj2.save();
    }).then(() => {
      fail('User should not be able to update obj2');
    }, (err) => {
      // User 1 should not be able to update obj2
      expect(err.code).toBe(101);
      return Promise.resolve();
    }).then(()=> {
      obj.set('hello', 'world');
      return obj.save();
    }).then(() => {
      return Parse.User.logIn('user2', 'password');
    }, () => {
      fail('User should be able to update');
      return Promise.resolve();
    }).then(() => {
      const q = new Parse.Query('AnObject');
      return q.find();
    }, () => {
      fail('should login with user 2');
    }).then((res) => {
      expect(res.length).toBe(2);
      res.forEach((result) => {
        if (result.id == obj.id) {
          expect(result.get('hello')).toBe('world');
        } else {
          expect(result.id).toBe(obj2.id);
        }
      })
      done();
    }, () =>  {
      fail("failed");
      done();
    })
  });

  it('should let a proper user find', (done) => {
    const config = Config.get(Parse.applicationId);
    const user = new Parse.User();
    const user2 = new Parse.User();
    user.set({
      username: 'user1',
      password: 'password'
    });
    user2.set({
      username: 'user2',
      password: 'password'
    });
    const obj = new Parse.Object('AnObject');
    const obj2 = new Parse.Object('AnObject');
    user.signUp().then(() => {
      return user2.signUp()
    }).then(() => {
      Parse.User.logOut();
    }).then(() => {
      obj.set('owner', user);
      return Parse.Object.saveAll([obj, obj2]);
    }).then(() => {
      return config.database.loadSchema().then((schema) => {
        return schema.updateClass('AnObject', {}, {find: {}, get:{}, readUserFields: ['owner']})
      });
    }).then(() => {
      const q = new Parse.Query('AnObject');
      return q.find();
    }).then((res) => {
      expect(res.length).toBe(0);
    }).then(() => {
      return Parse.User.logIn('user2', 'password');
    }).then(() => {
      const q = new Parse.Query('AnObject');
      return q.find();
    }).then((res) => {
      expect(res.length).toBe(0);
      const q = new Parse.Query('AnObject');
      return q.get(obj.id);
    }).then(() => {
      fail('User 2 should not get the obj1 object');
    }, (err) => {
      expect(err.code).toBe(101);
      expect(err.message).toBe('Object not found.');
      return Promise.resolve();
    }).then(() => {
      return Parse.User.logIn('user1', 'password');
    }).then(() => {
      const q = new Parse.Query('AnObject');
      return q.find();
    }).then((res) => {
      expect(res.length).toBe(1);
      done();
    }).catch((err) => {
      jfail(err);
      fail('should not fail');
      done();
    })
  });

  it('should query on pointer permission enabled column', (done) => {
    const config = Config.get(Parse.applicationId);
    const user = new Parse.User();
    const user2 = new Parse.User();
    user.set({
      username: 'user1',
      password: 'password'
    });
    user2.set({
      username: 'user2',
      password: 'password'
    });
    const obj = new Parse.Object('AnObject');
    const obj2 = new Parse.Object('AnObject');
    user.signUp().then(() => {
      return user2.signUp()
    }).then(() => {
      Parse.User.logOut();
    }).then(() => {
      obj.set('owner', user);
      return Parse.Object.saveAll([obj, obj2]);
    }).then(() => {
      return config.database.loadSchema().then((schema) => {
        return schema.updateClass('AnObject', {}, {find: {}, get:{}, readUserFields: ['owner']})
      });
    }).then(() => {
      return Parse.User.logIn('user1', 'password');
    }).then(() => {
      const q = new Parse.Query('AnObject');
      q.equalTo('owner', user2);
      return q.find();
    }).then((res) => {
      expect(res.length).toBe(0);
      done();
    }).catch((err) => {
      jfail(err);
      fail('should not fail');
      done();
    })
  });

  it('should not allow creating objects', (done) => {
    const config = Config.get(Parse.applicationId);
    const user = new Parse.User();
    user.set({
      username: 'user1',
      password: 'password'
    });
    const obj = new Parse.Object('AnObject');
    user.save().then(() => {
      return config.database.loadSchema().then((schema) => {
        return schema.addClassIfNotExists('AnObject', {owner: {type:'Pointer', targetClass: '_User'}}, {create: {}, writeUserFields: ['owner'], readUserFields: ['owner']});
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

  it('should handle multiple writeUserFields', done => {
    const config = Config.get(Parse.applicationId);
    const user = new Parse.User();
    const user2 = new Parse.User();
    user.set({
      username: 'user1',
      password: 'password'
    });
    user2.set({
      username: 'user2',
      password: 'password'
    });
    const obj = new Parse.Object('AnObject');
    Parse.Object.saveAll([user, user2])
      .then(() => {
        obj.set('owner', user);
        obj.set('otherOwner', user2);
        return obj.save();
      })
      .then(() => config.database.loadSchema())
      .then(schema => schema.updateClass('AnObject', {}, {find: {"*": true},writeUserFields: ['owner', 'otherOwner']}))
      .then(() => Parse.User.logIn('user1', 'password'))
      .then(() => obj.save({hello: 'fromUser1'}))
      .then(() => Parse.User.logIn('user2', 'password'))
      .then(() => obj.save({hello: 'fromUser2'}))
      .then(() => Parse.User.logOut())
      .then(() => {
        const q = new Parse.Query('AnObject');
        return q.first();
      })
      .then(result => {
        expect(result.get('hello')).toBe('fromUser2');
        done();
      }).catch(() => {
        fail('should not fail');
        done();
      })
  });

  it('should prevent creating pointer permission on missing field', (done) => {
    const config = Config.get(Parse.applicationId);
    config.database.loadSchema().then((schema) => {
      return schema.addClassIfNotExists('AnObject', {}, {create: {}, writeUserFields: ['owner'], readUserFields: ['owner']});
    }).then(() => {
      fail('should not succeed');
    }).catch((err) => {
      expect(err.code).toBe(107);
      expect(err.message).toBe("'owner' is not a valid column for class level pointer permissions writeUserFields");
      done();
    })
  });

  it('should prevent creating pointer permission on bad field', (done) => {
    const config = Config.get(Parse.applicationId);
    config.database.loadSchema().then((schema) => {
      return schema.addClassIfNotExists('AnObject', {owner: {type: 'String'}}, {create: {}, writeUserFields: ['owner'], readUserFields: ['owner']});
    }).then(() => {
      fail('should not succeed');
    }).catch((err) => {
      expect(err.code).toBe(107);
      expect(err.message).toBe("'owner' is not a valid column for class level pointer permissions writeUserFields");
      done();
    })
  });

  it('should prevent creating pointer permission on bad field', (done) => {
    const config = Config.get(Parse.applicationId);
    const object = new Parse.Object('AnObject');
    object.set('owner', 'value');
    object.save().then(() => {
      return config.database.loadSchema();
    }).then((schema) => {
      return schema.updateClass('AnObject', {}, {create: {}, writeUserFields: ['owner'], readUserFields: ['owner']});
    }).then(() => {
      fail('should not succeed');
    }).catch((err) => {
      expect(err.code).toBe(107);
      expect(err.message).toBe("'owner' is not a valid column for class level pointer permissions writeUserFields");
      done();
    })
  });

  it('tests CLP / Pointer Perms / ACL write (PP Locked)', (done) => {
    /*
      tests:
      CLP: update closed ({})
      PointerPerm: "owner"
      ACL: logged in user has access

      The owner is another user than the ACL
     */
    const config = Config.get(Parse.applicationId);
    const user = new Parse.User();
    const user2 = new Parse.User();
    user.set({
      username: 'user1',
      password: 'password'
    });
    user2.set({
      username: 'user2',
      password: 'password'
    });
    const obj = new Parse.Object('AnObject');
    Parse.Object.saveAll([user, user2]).then(() => {
      const ACL = new Parse.ACL();
      ACL.setReadAccess(user, true);
      ACL.setWriteAccess(user, true);
      obj.setACL(ACL);
      obj.set('owner', user2);
      return obj.save();
    }).then(() => {
      return config.database.loadSchema().then((schema) => {
        // Lock the update, and let only owner write
        return schema.updateClass('AnObject', {}, {update: {}, writeUserFields: ['owner']});
      });
    }).then(() => {
      return Parse.User.logIn('user1', 'password');
    }).then(() => {
      // user1 has ACL read/write but should be blocked by PP
      return obj.save({key: 'value'});
    }).then(() => {
      fail('Should not succeed saving');
      done();
    }, (err) => {
      expect(err.code).toBe(101);
      done();
    });
  });

  it('tests CLP / Pointer Perms / ACL write (ACL Locked)', (done) => {
    /*
      tests:
      CLP: update closed ({})
      PointerPerm: "owner"
      ACL: logged in user has access
     */
    const config = Config.get(Parse.applicationId);
    const user = new Parse.User();
    const user2 = new Parse.User();
    user.set({
      username: 'user1',
      password: 'password'
    });
    user2.set({
      username: 'user2',
      password: 'password'
    });
    const obj = new Parse.Object('AnObject');
    Parse.Object.saveAll([user, user2]).then(() => {
      const ACL = new Parse.ACL();
      ACL.setReadAccess(user, true);
      ACL.setWriteAccess(user, true);
      obj.setACL(ACL);
      obj.set('owner', user2);
      return obj.save();
    }).then(() => {
      return config.database.loadSchema().then((schema) => {
        // Lock the update, and let only owner write
        return schema.updateClass('AnObject', {}, {update: {}, writeUserFields: ['owner']});
      });
    }).then(() => {
      return Parse.User.logIn('user2', 'password');
    }).then(() => {
      // user1 has ACL read/write but should be blocked by ACL
      return obj.save({key: 'value'});
    }).then(() => {
      fail('Should not succeed saving');
      done();
    }, (err) => {
      expect(err.code).toBe(101);
      done();
    });
  });

  it('tests CLP / Pointer Perms / ACL write (ACL/PP OK)', (done) => {
    /*
      tests:
      CLP: update closed ({})
      PointerPerm: "owner"
      ACL: logged in user has access
     */
    const config = Config.get(Parse.applicationId);
    const user = new Parse.User();
    const user2 = new Parse.User();
    user.set({
      username: 'user1',
      password: 'password'
    });
    user2.set({
      username: 'user2',
      password: 'password'
    });
    const obj = new Parse.Object('AnObject');
    Parse.Object.saveAll([user, user2]).then(() => {
      const ACL = new Parse.ACL();
      ACL.setWriteAccess(user, true);
      ACL.setWriteAccess(user2, true);
      obj.setACL(ACL);
      obj.set('owner', user2);
      return obj.save();
    }).then(() => {
      return config.database.loadSchema().then((schema) => {
        // Lock the update, and let only owner write
        return schema.updateClass('AnObject', {}, {update: {}, writeUserFields: ['owner']});
      });
    }).then(() => {
      return Parse.User.logIn('user2', 'password');
    }).then(() => {
      // user1 has ACL read/write but should be blocked by ACL
      return obj.save({key: 'value'});
    }).then((objAgain) => {
      expect(objAgain.get('key')).toBe('value');
      done();
    }, () => {
      fail('Should not fail saving');
      done();
    });
  });

  it('tests CLP / Pointer Perms / ACL read (PP locked)', (done) => {
    /*
      tests:
      CLP: find/get open ({})
      PointerPerm: "owner" : read
      ACL: logged in user has access

      The owner is another user than the ACL
     */
    const config = Config.get(Parse.applicationId);
    const user = new Parse.User();
    const user2 = new Parse.User();
    user.set({
      username: 'user1',
      password: 'password'
    });
    user2.set({
      username: 'user2',
      password: 'password'
    });
    const obj = new Parse.Object('AnObject');
    Parse.Object.saveAll([user, user2]).then(() => {
      const ACL = new Parse.ACL();
      ACL.setReadAccess(user, true);
      ACL.setWriteAccess(user, true);
      obj.setACL(ACL);
      obj.set('owner', user2);
      return obj.save();
    }).then(() => {
      return config.database.loadSchema().then((schema) => {
        // Lock the update, and let only owner write
        return schema.updateClass('AnObject', {}, {find: {}, get: {}, readUserFields: ['owner']});
      });
    }).then(() => {
      return Parse.User.logIn('user1', 'password');
    }).then(() => {
      // user1 has ACL read/write but should be block
      return obj.fetch();
    }).then(() => {
      fail('Should not succeed saving');
      done();
    }, (err) => {
      expect(err.code).toBe(101);
      done();
    });
  });

  it('tests CLP / Pointer Perms / ACL read (PP/ACL OK)', (done) => {
    /*
      tests:
      CLP: find/get open ({"*": true})
      PointerPerm: "owner" : read
      ACL: logged in user has access
     */
    const config = Config.get(Parse.applicationId);
    const user = new Parse.User();
    const user2 = new Parse.User();
    user.set({
      username: 'user1',
      password: 'password'
    });
    user2.set({
      username: 'user2',
      password: 'password'
    });
    const obj = new Parse.Object('AnObject');
    Parse.Object.saveAll([user, user2]).then(() => {
      const ACL = new Parse.ACL();
      ACL.setReadAccess(user, true);
      ACL.setWriteAccess(user, true);
      ACL.setReadAccess(user2, true);
      ACL.setWriteAccess(user2, true);
      obj.setACL(ACL);
      obj.set('owner', user2);
      return obj.save();
    }).then(() => {
      return config.database.loadSchema().then((schema) => {
        // Lock the update, and let only owner write
        return schema.updateClass('AnObject', {}, {find: {"*": true}, get: {"*": true}, readUserFields: ['owner']});
      });
    }).then(() => {
      return Parse.User.logIn('user2', 'password');
    }).then(() => {
      // user1 has ACL read/write but should be block
      return obj.fetch();
    }).then((objAgain) => {
      expect(objAgain.id).toBe(obj.id);
      done();
    }, () => {
      fail('Should not fail fetching');
      done();
    });
  });

  it('tests CLP / Pointer Perms / ACL read (ACL locked)', (done) => {
    /*
      tests:
      CLP: find/get open ({"*": true})
      PointerPerm: "owner" : read // proper owner
      ACL: logged in user has not access
     */
    const config = Config.get(Parse.applicationId);
    const user = new Parse.User();
    const user2 = new Parse.User();
    user.set({
      username: 'user1',
      password: 'password'
    });
    user2.set({
      username: 'user2',
      password: 'password'
    });
    const obj = new Parse.Object('AnObject');
    Parse.Object.saveAll([user, user2]).then(() => {
      const ACL = new Parse.ACL();
      ACL.setReadAccess(user, true);
      ACL.setWriteAccess(user, true);
      obj.setACL(ACL);
      obj.set('owner', user2);
      return obj.save();
    }).then(() => {
      return config.database.loadSchema().then((schema) => {
        // Lock the update, and let only owner write
        return schema.updateClass('AnObject', {}, {find: {"*": true}, get: {"*": true}, readUserFields: ['owner']});
      });
    }).then(() => {
      return Parse.User.logIn('user2', 'password');
    }).then(() => {
      // user2 has ACL read/write but should be block by ACL
      return obj.fetch();
    }).then(() => {
      fail('Should not succeed saving');
      done();
    }, (err) => {
      expect(err.code).toBe(101);
      done();
    });
  });

  it('should let master key find objects', (done) => {
    const config = Config.get(Parse.applicationId);
    const object = new Parse.Object('AnObject');
    object.set('hello', 'world');
    return object.save().then(() => {
      return config.database.loadSchema().then((schema) => {
        // Lock the update, and let only owner write
        return schema.updateClass('AnObject', {owner: {type: 'Pointer', targetClass: '_User'}}, {find: {}, get: {}, readUserFields: ['owner']});
      });
    }).then(() => {
      const q = new Parse.Query('AnObject');
      return q.find();
    }).then(() => {

    }, (err) => {
      expect(err.code).toBe(101);
      return Promise.resolve();
    }).then(() => {
      const q = new Parse.Query('AnObject');
      return q.find({useMasterKey: true});
    }).then((objects) => {
      expect(objects.length).toBe(1);
      done();
    }, () => {
      fail('master key should find the object');
      done();
    })
  });

  it('should let master key get objects', (done) => {
    const config = Config.get(Parse.applicationId);
    const object = new Parse.Object('AnObject');
    object.set('hello', 'world');
    return object.save().then(() => {
      return config.database.loadSchema().then((schema) => {
        // Lock the update, and let only owner write
        return schema.updateClass('AnObject', {owner: {type: 'Pointer', targetClass: '_User'}}, {find: {}, get: {}, readUserFields: ['owner']});
      });
    }).then(() => {
      const q = new Parse.Query('AnObject');
      return q.get(object.id);
    }).then(() => {

    }, (err) => {
      expect(err.code).toBe(101);
      return Promise.resolve();
    }).then(() => {
      const q = new Parse.Query('AnObject');
      return q.get(object.id, {useMasterKey: true});
    }).then((objectAgain) => {
      expect(objectAgain).not.toBeUndefined();
      expect(objectAgain.id).toBe(object.id);
      done();
    }, () => {
      fail('master key should find the object');
      done();
    })
  });


  it('should let master key update objects', (done) => {
    const config = Config.get(Parse.applicationId);
    const object = new Parse.Object('AnObject');
    object.set('hello', 'world');
    return object.save().then(() => {
      return config.database.loadSchema().then((schema) => {
        // Lock the update, and let only owner write
        return schema.updateClass('AnObject', {owner: {type: 'Pointer', targetClass: '_User'}}, {update: {}, writeUserFields: ['owner']});
      });
    }).then(() => {
      return object.save({'hello': 'bar'});
    }).then(() => {

    }, (err) => {
      expect(err.code).toBe(101);
      return Promise.resolve();
    }).then(() => {
      return object.save({'hello': 'baz'}, {useMasterKey: true});
    }).then((objectAgain) => {
      expect(objectAgain.get('hello')).toBe('baz');
      done();
    }, () => {
      fail('master key should save the object');
      done();
    })
  });

  it('should let master key delete objects', (done) => {
    const config = Config.get(Parse.applicationId);
    const object = new Parse.Object('AnObject');
    object.set('hello', 'world');
    return object.save().then(() => {
      return config.database.loadSchema().then((schema) => {
        // Lock the update, and let only owner write
        return schema.updateClass('AnObject', {owner: {type: 'Pointer', targetClass: '_User'}}, {delete: {}, writeUserFields: ['owner']});
      });
    }).then(() => {
      return object.destroy();
    }).then(() => {
      fail();
    }, (err) => {
      expect(err.code).toBe(101);
      return Promise.resolve();
    }).then(() => {
      return object.destroy({useMasterKey: true});
    }).then(() => {
      done();
    }, () => {
      fail('master key should destroy the object');
      done();
    })
  });

  it('should fail with invalid pointer perms', (done) => {
    const config = Config.get(Parse.applicationId);
    config.database.loadSchema().then((schema) => {
      // Lock the update, and let only owner write
      return schema.addClassIfNotExists('AnObject', {owner: {type: 'Pointer', targetClass: '_User'}}, {delete: {}, writeUserFields: 'owner'});
    }).catch((err) => {
      expect(err.code).toBe(Parse.Error.INVALID_JSON);
      done();
    });
  });

  it('should fail with invalid pointer perms', (done) => {
    const config = Config.get(Parse.applicationId);
    config.database.loadSchema().then((schema) => {
      // Lock the update, and let only owner write
      return schema.addClassIfNotExists('AnObject', {owner: {type: 'Pointer', targetClass: '_User'}}, {delete: {}, writeUserFields: ['owner', 'invalid']});
    }).catch((err) => {
      expect(err.code).toBe(Parse.Error.INVALID_JSON);
      done();
    });
  })
});
