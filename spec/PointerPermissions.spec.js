'use strict';
var Config = require('../src/Config');

describe('Pointer Permissions', () => {

  beforeEach(() => {
    new Config(Parse.applicationId).database.schemaCache.clear();
  });

  it('should query on pointer permission enabled column', (done) => {
    const config = new Config(Parse.applicationId);
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
    const config = new Config(Parse.applicationId);
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

  it('should prevent creating pointer permission on missing field', (done) => {
    const config = new Config(Parse.applicationId);
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
    const config = new Config(Parse.applicationId);
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
    const config = new Config(Parse.applicationId);
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

  it('tests CLP / Pointer Perms / ACL write (ACL Locked)', (done) => {
    /*
      tests:
      CLP: update closed ({})
      PointerPerm: "owner"
      ACL: logged in user has access
     */
    const config = new Config(Parse.applicationId);
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

  it('tests CLP / Pointer Perms / ACL read (ACL locked)', (done) => {
    /*
      tests:
      CLP: find/get open ({"*": true})
      PointerPerm: "owner" : read // proper owner
      ACL: logged in user has not access
     */
    const config = new Config(Parse.applicationId);
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
    const config = new Config(Parse.applicationId);
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
    const config = new Config(Parse.applicationId);
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
    const config = new Config(Parse.applicationId);
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
    const config = new Config(Parse.applicationId);
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
    const config = new Config(Parse.applicationId);
    config.database.loadSchema().then((schema) => {
      // Lock the update, and let only owner write
      return schema.addClassIfNotExists('AnObject', {owner: {type: 'Pointer', targetClass: '_User'}}, {delete: {}, writeUserFields: 'owner'});
    }).catch((err) => {
      expect(err.code).toBe(Parse.Error.INVALID_JSON);
      done();
    });
  });

  it('should fail with invalid pointer perms', (done) => {
    const config = new Config(Parse.applicationId);
    config.database.loadSchema().then((schema) => {
      // Lock the update, and let only owner write
      return schema.addClassIfNotExists('AnObject', {owner: {type: 'Pointer', targetClass: '_User'}}, {delete: {}, writeUserFields: ['owner', 'invalid']});
    }).catch((err) => {
      expect(err.code).toBe(Parse.Error.INVALID_JSON);
      done();
    });
  })
});
