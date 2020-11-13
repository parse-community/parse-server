'use strict';
const Config = require('../lib/Config');

describe('Pointer Permissions', () => {
  beforeEach(() => {
    Config.get(Parse.applicationId).database.schemaCache.clear();
  });

  describe('using single user-pointers', () => {
    it('should work with find', done => {
      const config = Config.get(Parse.applicationId);
      const user = new Parse.User();
      const user2 = new Parse.User();
      user.set({
        username: 'user1',
        password: 'password',
      });
      user2.set({
        username: 'user2',
        password: 'password',
      });
      const obj = new Parse.Object('AnObject');
      const obj2 = new Parse.Object('AnObject');

      Parse.Object.saveAll([user, user2])
        .then(() => {
          obj.set('owner', user);
          obj2.set('owner', user2);
          return Parse.Object.saveAll([obj, obj2]);
        })
        .then(() => {
          return config.database.loadSchema().then(schema => {
            return schema.updateClass('AnObject', {}, { readUserFields: ['owner'] });
          });
        })
        .then(() => {
          return Parse.User.logIn('user1', 'password');
        })
        .then(() => {
          const q = new Parse.Query('AnObject');
          return q.find();
        })
        .then(res => {
          expect(res.length).toBe(1);
          expect(res[0].id).toBe(obj.id);
          done();
        })
        .catch(error => {
          fail(JSON.stringify(error));
          done();
        });
    });

    it('should work with write', done => {
      const config = Config.get(Parse.applicationId);
      const user = new Parse.User();
      const user2 = new Parse.User();
      user.set({
        username: 'user1',
        password: 'password',
      });
      user2.set({
        username: 'user2',
        password: 'password',
      });
      const obj = new Parse.Object('AnObject');
      const obj2 = new Parse.Object('AnObject');

      Parse.Object.saveAll([user, user2])
        .then(() => {
          obj.set('owner', user);
          obj.set('reader', user2);
          obj2.set('owner', user2);
          obj2.set('reader', user);
          return Parse.Object.saveAll([obj, obj2]);
        })
        .then(() => {
          return config.database.loadSchema().then(schema => {
            return schema.updateClass(
              'AnObject',
              {},
              {
                writeUserFields: ['owner'],
                readUserFields: ['reader', 'owner'],
              }
            );
          });
        })
        .then(() => {
          return Parse.User.logIn('user1', 'password');
        })
        .then(() => {
          obj2.set('hello', 'world');
          return obj2.save();
        })
        .then(
          () => {
            fail('User should not be able to update obj2');
          },
          err => {
            // User 1 should not be able to update obj2
            expect(err.code).toBe(101);
            return Promise.resolve();
          }
        )
        .then(() => {
          obj.set('hello', 'world');
          return obj.save();
        })
        .then(
          () => {
            return Parse.User.logIn('user2', 'password');
          },
          () => {
            fail('User should be able to update');
            return Promise.resolve();
          }
        )
        .then(
          () => {
            const q = new Parse.Query('AnObject');
            return q.find();
          },
          () => {
            fail('should login with user 2');
          }
        )
        .then(
          res => {
            expect(res.length).toBe(2);
            res.forEach(result => {
              if (result.id == obj.id) {
                expect(result.get('hello')).toBe('world');
              } else {
                expect(result.id).toBe(obj2.id);
              }
            });
            done();
          },
          () => {
            fail('failed');
            done();
          }
        );
    });

    it('should let a proper user find', done => {
      const config = Config.get(Parse.applicationId);
      const user = new Parse.User();
      const user2 = new Parse.User();
      user.set({
        username: 'user1',
        password: 'password',
      });
      user2.set({
        username: 'user2',
        password: 'password',
      });
      const obj = new Parse.Object('AnObject');
      const obj2 = new Parse.Object('AnObject');
      user
        .signUp()
        .then(() => {
          return user2.signUp();
        })
        .then(() => {
          Parse.User.logOut();
        })
        .then(() => {
          obj.set('owner', user);
          return Parse.Object.saveAll([obj, obj2]);
        })
        .then(() => {
          return config.database.loadSchema().then(schema => {
            return schema.updateClass(
              'AnObject',
              {},
              { find: {}, get: {}, readUserFields: ['owner'] }
            );
          });
        })
        .then(() => {
          const q = new Parse.Query('AnObject');
          return q.find();
        })
        .then(res => {
          expect(res.length).toBe(0);
        })
        .then(() => {
          return Parse.User.logIn('user2', 'password');
        })
        .then(() => {
          const q = new Parse.Query('AnObject');
          return q.find();
        })
        .then(res => {
          expect(res.length).toBe(0);
          const q = new Parse.Query('AnObject');
          return q.get(obj.id);
        })
        .then(
          () => {
            fail('User 2 should not get the obj1 object');
          },
          err => {
            expect(err.code).toBe(101);
            expect(err.message).toBe('Object not found.');
            return Promise.resolve();
          }
        )
        .then(() => {
          return Parse.User.logIn('user1', 'password');
        })
        .then(() => {
          const q = new Parse.Query('AnObject');
          return q.find();
        })
        .then(res => {
          expect(res.length).toBe(1);
          done();
        })
        .catch(err => {
          jfail(err);
          fail('should not fail');
          done();
        });
    });

    it('should query on pointer permission enabled column', done => {
      const config = Config.get(Parse.applicationId);
      const user = new Parse.User();
      const user2 = new Parse.User();
      user.set({
        username: 'user1',
        password: 'password',
      });
      user2.set({
        username: 'user2',
        password: 'password',
      });
      const obj = new Parse.Object('AnObject');
      const obj2 = new Parse.Object('AnObject');
      user
        .signUp()
        .then(() => {
          return user2.signUp();
        })
        .then(() => {
          Parse.User.logOut();
        })
        .then(() => {
          obj.set('owner', user);
          return Parse.Object.saveAll([obj, obj2]);
        })
        .then(() => {
          return config.database.loadSchema().then(schema => {
            return schema.updateClass(
              'AnObject',
              {},
              { find: {}, get: {}, readUserFields: ['owner'] }
            );
          });
        })
        .then(() => {
          return Parse.User.logIn('user1', 'password');
        })
        .then(() => {
          const q = new Parse.Query('AnObject');
          q.equalTo('owner', user2);
          return q.find();
        })
        .then(res => {
          expect(res.length).toBe(0);
          done();
        })
        .catch(err => {
          jfail(err);
          fail('should not fail');
          done();
        });
    });

    it('should not allow creating objects', done => {
      const config = Config.get(Parse.applicationId);
      const user = new Parse.User();
      user.set({
        username: 'user1',
        password: 'password',
      });
      const obj = new Parse.Object('AnObject');
      user
        .save()
        .then(() => {
          return config.database.loadSchema().then(schema => {
            return schema.addClassIfNotExists(
              'AnObject',
              { owner: { type: 'Pointer', targetClass: '_User' } },
              {
                create: {},
                writeUserFields: ['owner'],
                readUserFields: ['owner'],
              }
            );
          });
        })
        .then(() => {
          return Parse.User.logIn('user1', 'password');
        })
        .then(() => {
          obj.set('owner', user);
          return obj.save();
        })
        .then(
          () => {
            fail('should not succeed');
            done();
          },
          err => {
            expect(err.code).toBe(119);
            done();
          }
        );
    });

    it('should handle multiple writeUserFields', done => {
      const config = Config.get(Parse.applicationId);
      const user = new Parse.User();
      const user2 = new Parse.User();
      user.set({
        username: 'user1',
        password: 'password',
      });
      user2.set({
        username: 'user2',
        password: 'password',
      });
      const obj = new Parse.Object('AnObject');
      Parse.Object.saveAll([user, user2])
        .then(() => {
          obj.set('owner', user);
          obj.set('otherOwner', user2);
          return obj.save();
        })
        .then(() => config.database.loadSchema())
        .then(schema =>
          schema.updateClass(
            'AnObject',
            {},
            { find: { '*': true }, writeUserFields: ['owner', 'otherOwner'] }
          )
        )
        .then(() => Parse.User.logIn('user1', 'password'))
        .then(() => obj.save({ hello: 'fromUser1' }))
        .then(() => Parse.User.logIn('user2', 'password'))
        .then(() => obj.save({ hello: 'fromUser2' }))
        .then(() => Parse.User.logOut())
        .then(() => {
          const q = new Parse.Query('AnObject');
          return q.first();
        })
        .then(result => {
          expect(result.get('hello')).toBe('fromUser2');
          done();
        })
        .catch(() => {
          fail('should not fail');
          done();
        });
    });

    it('should prevent creating pointer permission on missing field', done => {
      const config = Config.get(Parse.applicationId);
      config.database
        .loadSchema()
        .then(schema => {
          return schema.addClassIfNotExists(
            'AnObject',
            {},
            {
              create: {},
              writeUserFields: ['owner'],
              readUserFields: ['owner'],
            }
          );
        })
        .then(() => {
          fail('should not succeed');
        })
        .catch(err => {
          expect(err.code).toBe(107);
          expect(err.message).toBe(
            "'owner' is not a valid column for class level pointer permissions writeUserFields"
          );
          done();
        });
    });

    it('should prevent creating pointer permission on bad field (of wrong type)', done => {
      const config = Config.get(Parse.applicationId);
      config.database
        .loadSchema()
        .then(schema => {
          return schema.addClassIfNotExists(
            'AnObject',
            { owner: { type: 'String' } },
            {
              create: {},
              writeUserFields: ['owner'],
              readUserFields: ['owner'],
            }
          );
        })
        .then(() => {
          fail('should not succeed');
        })
        .catch(err => {
          expect(err.code).toBe(107);
          expect(err.message).toBe(
            "'owner' is not a valid column for class level pointer permissions writeUserFields"
          );
          done();
        });
    });

    it('should prevent creating pointer permission on bad field (non-user pointer)', done => {
      const config = Config.get(Parse.applicationId);
      config.database
        .loadSchema()
        .then(schema => {
          return schema.addClassIfNotExists(
            'AnObject',
            { owner: { type: 'Pointer', targetClass: '_Session' } },
            {
              create: {},
              writeUserFields: ['owner'],
              readUserFields: ['owner'],
            }
          );
        })
        .then(() => {
          fail('should not succeed');
        })
        .catch(err => {
          expect(err.code).toBe(107);
          expect(err.message).toBe(
            "'owner' is not a valid column for class level pointer permissions writeUserFields"
          );
          done();
        });
    });

    it('should prevent creating pointer permission on bad field (non-existing)', done => {
      const config = Config.get(Parse.applicationId);
      const object = new Parse.Object('AnObject');
      object.set('owner', 'value');
      object
        .save()
        .then(() => {
          return config.database.loadSchema();
        })
        .then(schema => {
          return schema.updateClass(
            'AnObject',
            {},
            {
              create: {},
              writeUserFields: ['owner'],
              readUserFields: ['owner'],
            }
          );
        })
        .then(() => {
          fail('should not succeed');
        })
        .catch(err => {
          expect(err.code).toBe(107);
          expect(err.message).toBe(
            "'owner' is not a valid column for class level pointer permissions writeUserFields"
          );
          done();
        });
    });

    it('tests CLP / Pointer Perms / ACL write (PP Locked)', done => {
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
        password: 'password',
      });
      user2.set({
        username: 'user2',
        password: 'password',
      });
      const obj = new Parse.Object('AnObject');
      Parse.Object.saveAll([user, user2])
        .then(() => {
          const ACL = new Parse.ACL();
          ACL.setReadAccess(user, true);
          ACL.setWriteAccess(user, true);
          obj.setACL(ACL);
          obj.set('owner', user2);
          return obj.save();
        })
        .then(() => {
          return config.database.loadSchema().then(schema => {
            // Lock the update, and let only owner write
            return schema.updateClass('AnObject', {}, { update: {}, writeUserFields: ['owner'] });
          });
        })
        .then(() => {
          return Parse.User.logIn('user1', 'password');
        })
        .then(() => {
          // user1 has ACL read/write but should be blocked by PP
          return obj.save({ key: 'value' });
        })
        .then(
          () => {
            fail('Should not succeed saving');
            done();
          },
          err => {
            expect(err.code).toBe(101);
            done();
          }
        );
    });

    it('tests CLP / Pointer Perms / ACL write (ACL Locked)', done => {
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
        password: 'password',
      });
      user2.set({
        username: 'user2',
        password: 'password',
      });
      const obj = new Parse.Object('AnObject');
      Parse.Object.saveAll([user, user2])
        .then(() => {
          const ACL = new Parse.ACL();
          ACL.setReadAccess(user, true);
          ACL.setWriteAccess(user, true);
          obj.setACL(ACL);
          obj.set('owner', user2);
          return obj.save();
        })
        .then(() => {
          return config.database.loadSchema().then(schema => {
            // Lock the update, and let only owner write
            return schema.updateClass('AnObject', {}, { update: {}, writeUserFields: ['owner'] });
          });
        })
        .then(() => {
          return Parse.User.logIn('user2', 'password');
        })
        .then(() => {
          // user1 has ACL read/write but should be blocked by ACL
          return obj.save({ key: 'value' });
        })
        .then(
          () => {
            fail('Should not succeed saving');
            done();
          },
          err => {
            expect(err.code).toBe(101);
            done();
          }
        );
    });

    it('tests CLP / Pointer Perms / ACL write (ACL/PP OK)', done => {
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
        password: 'password',
      });
      user2.set({
        username: 'user2',
        password: 'password',
      });
      const obj = new Parse.Object('AnObject');
      Parse.Object.saveAll([user, user2])
        .then(() => {
          const ACL = new Parse.ACL();
          ACL.setWriteAccess(user, true);
          ACL.setWriteAccess(user2, true);
          obj.setACL(ACL);
          obj.set('owner', user2);
          return obj.save();
        })
        .then(() => {
          return config.database.loadSchema().then(schema => {
            // Lock the update, and let only owner write
            return schema.updateClass('AnObject', {}, { update: {}, writeUserFields: ['owner'] });
          });
        })
        .then(() => {
          return Parse.User.logIn('user2', 'password');
        })
        .then(() => {
          // user1 has ACL read/write but should be blocked by ACL
          return obj.save({ key: 'value' });
        })
        .then(
          objAgain => {
            expect(objAgain.get('key')).toBe('value');
            done();
          },
          () => {
            fail('Should not fail saving');
            done();
          }
        );
    });

    it('tests CLP / Pointer Perms / ACL read (PP locked)', done => {
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
        password: 'password',
      });
      user2.set({
        username: 'user2',
        password: 'password',
      });
      const obj = new Parse.Object('AnObject');
      Parse.Object.saveAll([user, user2])
        .then(() => {
          const ACL = new Parse.ACL();
          ACL.setReadAccess(user, true);
          ACL.setWriteAccess(user, true);
          obj.setACL(ACL);
          obj.set('owner', user2);
          return obj.save();
        })
        .then(() => {
          return config.database.loadSchema().then(schema => {
            // Lock the update, and let only owner write
            return schema.updateClass(
              'AnObject',
              {},
              { find: {}, get: {}, readUserFields: ['owner'] }
            );
          });
        })
        .then(() => {
          return Parse.User.logIn('user1', 'password');
        })
        .then(() => {
          // user1 has ACL read/write but should be block
          return obj.fetch();
        })
        .then(
          () => {
            fail('Should not succeed saving');
            done();
          },
          err => {
            expect(err.code).toBe(101);
            done();
          }
        );
    });

    it('tests CLP / Pointer Perms / ACL read (PP/ACL OK)', done => {
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
        password: 'password',
      });
      user2.set({
        username: 'user2',
        password: 'password',
      });
      const obj = new Parse.Object('AnObject');
      Parse.Object.saveAll([user, user2])
        .then(() => {
          const ACL = new Parse.ACL();
          ACL.setReadAccess(user, true);
          ACL.setWriteAccess(user, true);
          ACL.setReadAccess(user2, true);
          ACL.setWriteAccess(user2, true);
          obj.setACL(ACL);
          obj.set('owner', user2);
          return obj.save();
        })
        .then(() => {
          return config.database.loadSchema().then(schema => {
            // Lock the update, and let only owner write
            return schema.updateClass(
              'AnObject',
              {},
              {
                find: { '*': true },
                get: { '*': true },
                readUserFields: ['owner'],
              }
            );
          });
        })
        .then(() => {
          return Parse.User.logIn('user2', 'password');
        })
        .then(() => {
          // user1 has ACL read/write but should be block
          return obj.fetch();
        })
        .then(
          objAgain => {
            expect(objAgain.id).toBe(obj.id);
            done();
          },
          () => {
            fail('Should not fail fetching');
            done();
          }
        );
    });

    it('tests CLP / Pointer Perms / ACL read (ACL locked)', done => {
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
        password: 'password',
      });
      user2.set({
        username: 'user2',
        password: 'password',
      });
      const obj = new Parse.Object('AnObject');
      Parse.Object.saveAll([user, user2])
        .then(() => {
          const ACL = new Parse.ACL();
          ACL.setReadAccess(user, true);
          ACL.setWriteAccess(user, true);
          obj.setACL(ACL);
          obj.set('owner', user2);
          return obj.save();
        })
        .then(() => {
          return config.database.loadSchema().then(schema => {
            // Lock the update, and let only owner write
            return schema.updateClass(
              'AnObject',
              {},
              {
                find: { '*': true },
                get: { '*': true },
                readUserFields: ['owner'],
              }
            );
          });
        })
        .then(() => {
          return Parse.User.logIn('user2', 'password');
        })
        .then(() => {
          // user2 has ACL read/write but should be block by ACL
          return obj.fetch();
        })
        .then(
          () => {
            fail('Should not succeed saving');
            done();
          },
          err => {
            expect(err.code).toBe(101);
            done();
          }
        );
    });

    it('should let master key find objects', done => {
      const config = Config.get(Parse.applicationId);
      const object = new Parse.Object('AnObject');
      object.set('hello', 'world');
      return object
        .save()
        .then(() => {
          return config.database.loadSchema().then(schema => {
            // Lock the update, and let only owner write
            return schema.updateClass(
              'AnObject',
              { owner: { type: 'Pointer', targetClass: '_User' } },
              { find: {}, get: {}, readUserFields: ['owner'] }
            );
          });
        })
        .then(() => {
          const q = new Parse.Query('AnObject');
          return q.find();
        })
        .then(
          () => {},
          err => {
            expect(err.code).toBe(101);
            return Promise.resolve();
          }
        )
        .then(() => {
          const q = new Parse.Query('AnObject');
          return q.find({ useMasterKey: true });
        })
        .then(
          objects => {
            expect(objects.length).toBe(1);
            done();
          },
          () => {
            fail('master key should find the object');
            done();
          }
        );
    });

    it('should let master key get objects', done => {
      const config = Config.get(Parse.applicationId);
      const object = new Parse.Object('AnObject');
      object.set('hello', 'world');
      return object
        .save()
        .then(() => {
          return config.database.loadSchema().then(schema => {
            // Lock the update, and let only owner write
            return schema.updateClass(
              'AnObject',
              { owner: { type: 'Pointer', targetClass: '_User' } },
              { find: {}, get: {}, readUserFields: ['owner'] }
            );
          });
        })
        .then(() => {
          const q = new Parse.Query('AnObject');
          return q.get(object.id);
        })
        .then(
          () => {},
          err => {
            expect(err.code).toBe(101);
            return Promise.resolve();
          }
        )
        .then(() => {
          const q = new Parse.Query('AnObject');
          return q.get(object.id, { useMasterKey: true });
        })
        .then(
          objectAgain => {
            expect(objectAgain).not.toBeUndefined();
            expect(objectAgain.id).toBe(object.id);
            done();
          },
          () => {
            fail('master key should find the object');
            done();
          }
        );
    });

    it('should let master key update objects', done => {
      const config = Config.get(Parse.applicationId);
      const object = new Parse.Object('AnObject');
      object.set('hello', 'world');
      return object
        .save()
        .then(() => {
          return config.database.loadSchema().then(schema => {
            // Lock the update, and let only owner write
            return schema.updateClass(
              'AnObject',
              { owner: { type: 'Pointer', targetClass: '_User' } },
              { update: {}, writeUserFields: ['owner'] }
            );
          });
        })
        .then(() => {
          return object.save({ hello: 'bar' });
        })
        .then(
          () => {},
          err => {
            expect(err.code).toBe(101);
            return Promise.resolve();
          }
        )
        .then(() => {
          return object.save({ hello: 'baz' }, { useMasterKey: true });
        })
        .then(
          objectAgain => {
            expect(objectAgain.get('hello')).toBe('baz');
            done();
          },
          () => {
            fail('master key should save the object');
            done();
          }
        );
    });

    it('should let master key delete objects', done => {
      const config = Config.get(Parse.applicationId);
      const object = new Parse.Object('AnObject');
      object.set('hello', 'world');
      return object
        .save()
        .then(() => {
          return config.database.loadSchema().then(schema => {
            // Lock the update, and let only owner write
            return schema.updateClass(
              'AnObject',
              { owner: { type: 'Pointer', targetClass: '_User' } },
              { delete: {}, writeUserFields: ['owner'] }
            );
          });
        })
        .then(() => {
          return object.destroy();
        })
        .then(
          () => {
            fail();
          },
          err => {
            expect(err.code).toBe(101);
            return Promise.resolve();
          }
        )
        .then(() => {
          return object.destroy({ useMasterKey: true });
        })
        .then(
          () => {
            done();
          },
          () => {
            fail('master key should destroy the object');
            done();
          }
        );
    });

    it('should fail with invalid pointer perms (not array)', done => {
      const config = Config.get(Parse.applicationId);
      config.database
        .loadSchema()
        .then(schema => {
          // Lock the update, and let only owner write
          return schema.addClassIfNotExists(
            'AnObject',
            { owner: { type: 'Pointer', targetClass: '_User' } },
            { delete: {}, writeUserFields: 'owner' }
          );
        })
        .catch(err => {
          expect(err.code).toBe(Parse.Error.INVALID_JSON);
          done();
        });
    });

    it('should fail with invalid pointer perms (non-existing field)', done => {
      const config = Config.get(Parse.applicationId);
      config.database
        .loadSchema()
        .then(schema => {
          // Lock the update, and let only owner write
          return schema.addClassIfNotExists(
            'AnObject',
            { owner: { type: 'Pointer', targetClass: '_User' } },
            { delete: {}, writeUserFields: ['owner', 'invalid'] }
          );
        })
        .catch(err => {
          expect(err.code).toBe(Parse.Error.INVALID_JSON);
          done();
        });
    });
  });

  describe('using arrays of user-pointers', () => {
    it('should work with find', async done => {
      const config = Config.get(Parse.applicationId);
      const user = new Parse.User();
      const user2 = new Parse.User();
      user.set({
        username: 'user1',
        password: 'password',
      });
      user2.set({
        username: 'user2',
        password: 'password',
      });
      const obj = new Parse.Object('AnObject');
      const obj2 = new Parse.Object('AnObject');

      await Parse.Object.saveAll([user, user2]);

      obj.set('owners', [user]);
      obj2.set('owners', [user2]);
      await Parse.Object.saveAll([obj, obj2]);

      const schema = await config.database.loadSchema();
      await schema.updateClass('AnObject', {}, { readUserFields: ['owners'] });

      await Parse.User.logIn('user1', 'password');

      try {
        const q = new Parse.Query('AnObject');
        const res = await q.find();
        expect(res.length).toBe(1);
        expect(res[0].id).toBe(obj.id);
        done();
      } catch (err) {
        done.fail(JSON.stringify(err));
      }
    });

    it('should work with write', async done => {
      const config = Config.get(Parse.applicationId);
      const user = new Parse.User();
      const user2 = new Parse.User();
      user.set({
        username: 'user1',
        password: 'password',
      });
      user2.set({
        username: 'user2',
        password: 'password',
      });
      const obj = new Parse.Object('AnObject');
      const obj2 = new Parse.Object('AnObject');

      await Parse.Object.saveAll([user, user2]);

      obj.set('owner', user);
      obj.set('readers', [user2]);
      obj2.set('owner', user2);
      obj2.set('readers', [user]);
      await Parse.Object.saveAll([obj, obj2]);

      const schema = await config.database.loadSchema();
      await schema.updateClass(
        'AnObject',
        {},
        {
          writeUserFields: ['owner'],
          readUserFields: ['readers', 'owner'],
        }
      );

      await Parse.User.logIn('user1', 'password');

      obj2.set('hello', 'world');
      try {
        await obj2.save();
        done.fail('User should not be able to update obj2');
      } catch (err) {
        // User 1 should not be able to update obj2
        expect(err.code).toBe(101);
      }

      obj.set('hello', 'world');
      try {
        await obj.save();
      } catch (err) {
        done.fail('User should be able to update');
      }

      await Parse.User.logIn('user2', 'password');

      try {
        const q = new Parse.Query('AnObject');
        const res = await q.find();
        expect(res.length).toBe(2);
        res.forEach(result => {
          if (result.id == obj.id) {
            expect(result.get('hello')).toBe('world');
          } else {
            expect(result.id).toBe(obj2.id);
          }
        });
        done();
      } catch (err) {
        done.fail('failed');
      }
    });

    it('should let a proper user find', async done => {
      const config = Config.get(Parse.applicationId);
      const user = new Parse.User();
      const user2 = new Parse.User();
      const user3 = new Parse.User();
      user.set({
        username: 'user1',
        password: 'password',
      });
      user2.set({
        username: 'user2',
        password: 'password',
      });
      user3.set({
        username: 'user3',
        password: 'password',
      });
      const obj = new Parse.Object('AnObject');
      const obj2 = new Parse.Object('AnObject');

      await user.signUp();
      await user2.signUp();
      await user3.signUp();
      await Parse.User.logOut();

      obj.set('owners', [user, user2]);
      await Parse.Object.saveAll([obj, obj2]);

      const schema = await config.database.loadSchema();
      await schema.updateClass('AnObject', {}, { find: {}, get: {}, readUserFields: ['owners'] });

      let q = new Parse.Query('AnObject');
      let result = await q.find();
      expect(result.length).toBe(0);

      Parse.User.logIn('user3', 'password');
      q = new Parse.Query('AnObject');
      result = await q.find();

      expect(result.length).toBe(0);
      q = new Parse.Query('AnObject');

      try {
        await q.get(obj.id);
        done.fail('User 3 should not get the obj1 object');
      } catch (err) {
        expect(err.code).toBe(101);
        expect(err.message).toBe('Object not found.');
      }

      for (const owner of ['user1', 'user2']) {
        await Parse.User.logIn(owner, 'password');
        try {
          const q = new Parse.Query('AnObject');
          result = await q.find();
          expect(result.length).toBe(1);
        } catch (err) {
          done.fail('should not fail');
        }
      }
      done();
    });

    it('should query on pointer permission enabled column', async done => {
      const config = Config.get(Parse.applicationId);
      const user = new Parse.User();
      const user2 = new Parse.User();
      const user3 = new Parse.User();
      user.set({
        username: 'user1',
        password: 'password',
      });
      user2.set({
        username: 'user2',
        password: 'password',
      });
      user3.set({
        username: 'user3',
        password: 'password',
      });
      const obj = new Parse.Object('AnObject');
      const obj2 = new Parse.Object('AnObject');

      await user.signUp();
      await user2.signUp();
      await user3.signUp();
      await Parse.User.logOut();

      obj.set('owners', [user, user2]);
      await Parse.Object.saveAll([obj, obj2]);

      const schema = await config.database.loadSchema();
      await schema.updateClass('AnObject', {}, { find: {}, get: {}, readUserFields: ['owners'] });

      for (const owner of ['user1', 'user2']) {
        await Parse.User.logIn(owner, 'password');
        try {
          const q = new Parse.Query('AnObject');
          q.equalTo('owners', user3);
          const result = await q.find();
          expect(result.length).toBe(0);
        } catch (err) {
          done.fail('should not fail');
        }
      }
      done();
    });

    it('should not query using arrays on pointer permission enabled column', async done => {
      const config = Config.get(Parse.applicationId);
      const user = new Parse.User();
      const user2 = new Parse.User();
      const user3 = new Parse.User();
      user.set({
        username: 'user1',
        password: 'password',
      });
      user2.set({
        username: 'user2',
        password: 'password',
      });
      user3.set({
        username: 'user3',
        password: 'password',
      });
      const obj = new Parse.Object('AnObject');
      const obj2 = new Parse.Object('AnObject');

      await user.signUp();
      await user2.signUp();
      await user3.signUp();
      await Parse.User.logOut();

      obj.set('owners', [user, user2]);
      await Parse.Object.saveAll([obj, obj2]);

      const schema = await config.database.loadSchema();
      await schema.updateClass('AnObject', {}, { find: {}, get: {}, readUserFields: ['owners'] });

      for (const owner of ['user1', 'user2']) {
        try {
          await Parse.User.logIn(owner, 'password');
          // Since querying for arrays is not supported this should throw an error
          const q = new Parse.Query('AnObject');
          q.equalTo('owners', [user3]);
          await q.find();
          done.fail('should fail');
          // eslint-disable-next-line no-empty
        } catch (error) {}
      }
      done();
    });

    it('should not allow creating objects', async done => {
      const config = Config.get(Parse.applicationId);
      const user = new Parse.User();
      const user2 = new Parse.User();
      user.set({
        username: 'user1',
        password: 'password',
      });
      user2.set({
        username: 'user2',
        password: 'password',
      });
      const obj = new Parse.Object('AnObject');
      await Parse.Object.saveAll([user, user2]);

      const schema = await config.database.loadSchema();
      await schema.addClassIfNotExists(
        'AnObject',
        { owners: { type: 'Array' } },
        {
          create: {},
          writeUserFields: ['owners'],
          readUserFields: ['owners'],
        }
      );

      for (const owner of ['user1', 'user2']) {
        await Parse.User.logIn(owner, 'password');
        try {
          obj.set('owners', [user, user2]);
          await obj.save();
          done.fail('should not succeed');
        } catch (err) {
          expect(err.code).toBe(119);
        }
      }
      done();
    });

    it('should handle multiple writeUserFields', async done => {
      const config = Config.get(Parse.applicationId);
      const user = new Parse.User();
      const user2 = new Parse.User();
      user.set({
        username: 'user1',
        password: 'password',
      });
      user2.set({
        username: 'user2',
        password: 'password',
      });
      const obj = new Parse.Object('AnObject');

      await Parse.Object.saveAll([user, user2]);
      obj.set('owners', [user]);
      obj.set('otherOwners', [user2]);
      await obj.save();

      const schema = await config.database.loadSchema();
      await schema.updateClass(
        'AnObject',
        {},
        { find: { '*': true }, writeUserFields: ['owners', 'otherOwners'] }
      );

      await Parse.User.logIn('user1', 'password');
      await obj.save({ hello: 'fromUser1' });
      await Parse.User.logIn('user2', 'password');
      await obj.save({ hello: 'fromUser2' });
      await Parse.User.logOut();

      try {
        const q = new Parse.Query('AnObject');
        const result = await q.first();
        expect(result.get('hello')).toBe('fromUser2');
        done();
      } catch (err) {
        done.fail('should not fail');
      }
    });

    it('should prevent creating pointer permission on missing field', async done => {
      const config = Config.get(Parse.applicationId);
      const schema = await config.database.loadSchema();
      try {
        await schema.addClassIfNotExists(
          'AnObject',
          {},
          {
            create: {},
            writeUserFields: ['owners'],
            readUserFields: ['owners'],
          }
        );
        done.fail('should not succeed');
      } catch (err) {
        expect(err.code).toBe(107);
        expect(err.message).toBe(
          "'owners' is not a valid column for class level pointer permissions writeUserFields"
        );
        done();
      }
    });

    it('should prevent creating pointer permission on bad field (of wrong type)', async done => {
      const config = Config.get(Parse.applicationId);
      const schema = await config.database.loadSchema();
      try {
        await schema.addClassIfNotExists(
          'AnObject',
          { owners: { type: 'String' } },
          {
            create: {},
            writeUserFields: ['owners'],
            readUserFields: ['owners'],
          }
        );
        done.fail('should not succeed');
      } catch (err) {
        expect(err.code).toBe(107);
        expect(err.message).toBe(
          "'owners' is not a valid column for class level pointer permissions writeUserFields"
        );
        done();
      }
    });

    it('should prevent creating pointer permission on bad field (non-existing)', async done => {
      const config = Config.get(Parse.applicationId);
      const object = new Parse.Object('AnObject');
      object.set('owners', 'value');
      await object.save();

      const schema = await config.database.loadSchema();
      try {
        await schema.updateClass(
          'AnObject',
          {},
          {
            create: {},
            writeUserFields: ['owners'],
            readUserFields: ['owners'],
          }
        );
        done.fail('should not succeed');
      } catch (err) {
        expect(err.code).toBe(107);
        expect(err.message).toBe(
          "'owners' is not a valid column for class level pointer permissions writeUserFields"
        );
        done();
      }
    });

    it('should work with arrays containing valid & invalid elements', async done => {
      /* Since there is no way to check the validity of objects in arrays before querying invalid
         elements in arrays should be ignored. */
      const config = Config.get(Parse.applicationId);
      const user = new Parse.User();
      const user2 = new Parse.User();
      user.set({
        username: 'user1',
        password: 'password',
      });
      user2.set({
        username: 'user2',
        password: 'password',
      });
      const obj = new Parse.Object('AnObject');

      await Parse.Object.saveAll([user, user2]);

      obj.set('owners', [user, '', -1, true, [], { invalid: -1 }]);
      await Parse.Object.saveAll([obj]);

      const schema = await config.database.loadSchema();
      await schema.updateClass('AnObject', {}, { readUserFields: ['owners'] });

      await Parse.User.logIn('user1', 'password');

      try {
        const q = new Parse.Query('AnObject');
        const res = await q.find();
        expect(res.length).toBe(1);
        expect(res[0].id).toBe(obj.id);
      } catch (err) {
        done.fail(JSON.stringify(err));
      }

      await Parse.User.logOut();
      await Parse.User.logIn('user2', 'password');

      try {
        const q = new Parse.Query('AnObject');
        const res = await q.find();
        expect(res.length).toBe(0);
        done();
      } catch (err) {
        done.fail(JSON.stringify(err));
      }
    });

    it('tests CLP / Pointer Perms / ACL write (PP Locked)', async done => {
      /*
        tests:
        CLP: update closed ({})
        PointerPerm: "owners"
        ACL: logged in user has access

        The owner is another user than the ACL
       */
      const config = Config.get(Parse.applicationId);
      const user = new Parse.User();
      const user2 = new Parse.User();
      const user3 = new Parse.User();
      user.set({
        username: 'user1',
        password: 'password',
      });
      user2.set({
        username: 'user2',
        password: 'password',
      });
      user3.set({
        username: 'user3',
        password: 'password',
      });
      const obj = new Parse.Object('AnObject');

      await Parse.Object.saveAll([user, user2, user3]);

      const ACL = new Parse.ACL();
      ACL.setReadAccess(user, true);
      ACL.setWriteAccess(user, true);
      obj.setACL(ACL);
      obj.set('owners', [user2, user3]);
      await obj.save();

      const schema = await config.database.loadSchema();
      // Lock the update, and let only owners write
      await schema.updateClass('AnObject', {}, { update: {}, writeUserFields: ['owners'] });

      await Parse.User.logIn('user1', 'password');
      try {
        // user1 has ACL read/write but should be blocked by PP
        await obj.save({ key: 'value' });
        done.fail('Should not succeed saving');
      } catch (err) {
        expect(err.code).toBe(101);
        done();
      }
    });

    it('tests CLP / Pointer Perms / ACL write (ACL Locked)', async done => {
      /*
        tests:
        CLP: update closed ({})
        PointerPerm: "owners"
        ACL: logged in user has access
       */
      const config = Config.get(Parse.applicationId);
      const user = new Parse.User();
      const user2 = new Parse.User();
      const user3 = new Parse.User();
      user.set({
        username: 'user1',
        password: 'password',
      });
      user2.set({
        username: 'user2',
        password: 'password',
      });
      user3.set({
        username: 'user3',
        password: 'password',
      });
      const obj = new Parse.Object('AnObject');

      await Parse.Object.saveAll([user, user2, user3]);

      const ACL = new Parse.ACL();
      ACL.setReadAccess(user, true);
      ACL.setWriteAccess(user, true);
      obj.setACL(ACL);
      obj.set('owners', [user2, user3]);
      await obj.save();

      const schema = await config.database.loadSchema();
      // Lock the update, and let only owners write
      await schema.updateClass('AnObject', {}, { update: {}, writeUserFields: ['owners'] });

      for (const owner of ['user2', 'user3']) {
        await Parse.User.logIn(owner, 'password');
        try {
          await obj.save({ key: 'value' });
          done.fail('Should not succeed saving');
        } catch (err) {
          expect(err.code).toBe(101);
        }
      }
      done();
    });

    it('tests CLP / Pointer Perms / ACL write (ACL/PP OK)', async done => {
      /*
        tests:
        CLP: update closed ({})
        PointerPerm: "owners"
        ACL: logged in user has access
       */
      const config = Config.get(Parse.applicationId);
      const user = new Parse.User();
      const user2 = new Parse.User();
      const user3 = new Parse.User();
      user.set({
        username: 'user1',
        password: 'password',
      });
      user2.set({
        username: 'user2',
        password: 'password',
      });
      user3.set({
        username: 'user3',
        password: 'password',
      });
      const obj = new Parse.Object('AnObject');

      await Parse.Object.saveAll([user, user2, user3]);
      const ACL = new Parse.ACL();
      ACL.setWriteAccess(user, true);
      ACL.setWriteAccess(user2, true);
      ACL.setWriteAccess(user3, true);
      obj.setACL(ACL);
      obj.set('owners', [user2, user3]);
      await obj.save();

      const schema = await config.database.loadSchema();
      // Lock the update, and let only owners write
      await schema.updateClass('AnObject', {}, { update: {}, writeUserFields: ['owners'] });

      for (const owner of ['user2', 'user3']) {
        await Parse.User.logIn(owner, 'password');
        try {
          const objectAgain = await obj.save({ key: 'value' });
          expect(objectAgain.get('key')).toBe('value');
        } catch (err) {
          done.fail('Should not fail saving');
        }
      }
      done();
    });

    it('tests CLP / Pointer Perms / ACL read (PP locked)', async done => {
      /*
        tests:
        CLP: find/get open ({})
        PointerPerm: "owners" : read
        ACL: logged in user has access

        The owner is another user than the ACL
       */
      const config = Config.get(Parse.applicationId);
      const user = new Parse.User();
      const user2 = new Parse.User();
      const user3 = new Parse.User();
      user.set({
        username: 'user1',
        password: 'password',
      });
      user2.set({
        username: 'user2',
        password: 'password',
      });
      user3.set({
        username: 'user3',
        password: 'password',
      });
      const obj = new Parse.Object('AnObject');

      await Parse.Object.saveAll([user, user2, user3]);

      const ACL = new Parse.ACL();
      ACL.setReadAccess(user, true);
      ACL.setWriteAccess(user, true);
      obj.setACL(ACL);
      obj.set('owners', [user2, user3]);
      await obj.save();

      const schema = await config.database.loadSchema();
      // Lock reading, and let only owners read
      await schema.updateClass('AnObject', {}, { find: {}, get: {}, readUserFields: ['owners'] });

      await Parse.User.logIn('user1', 'password');
      try {
        // user1 has ACL read/write but should be blocked
        await obj.fetch();
        done.fail('Should not succeed fetching');
      } catch (err) {
        expect(err.code).toBe(101);
        done();
      }
      done();
    });

    it('tests CLP / Pointer Perms / ACL read (PP/ACL OK)', async done => {
      /*
        tests:
        CLP: find/get open ({"*": true})
        PointerPerm: "owners" : read
        ACL: logged in user has access
       */
      const config = Config.get(Parse.applicationId);
      const user = new Parse.User();
      const user2 = new Parse.User();
      const user3 = new Parse.User();
      user.set({
        username: 'user1',
        password: 'password',
      });
      user2.set({
        username: 'user2',
        password: 'password',
      });
      user3.set({
        username: 'user3',
        password: 'password',
      });
      const obj = new Parse.Object('AnObject');

      await Parse.Object.saveAll([user, user2, user3]);

      const ACL = new Parse.ACL();
      ACL.setReadAccess(user, true);
      ACL.setWriteAccess(user, true);
      ACL.setReadAccess(user2, true);
      ACL.setWriteAccess(user2, true);
      ACL.setReadAccess(user3, true);
      ACL.setWriteAccess(user3, true);
      obj.setACL(ACL);
      obj.set('owners', [user2, user3]);
      await obj.save();

      const schema = await config.database.loadSchema();
      // Allow public and owners read
      await schema.updateClass(
        'AnObject',
        {},
        {
          find: { '*': true },
          get: { '*': true },
          readUserFields: ['owners'],
        }
      );

      for (const owner of ['user2', 'user3']) {
        await Parse.User.logIn(owner, 'password');
        try {
          const objectAgain = await obj.fetch();
          expect(objectAgain.id).toBe(obj.id);
        } catch (err) {
          done.fail('Should not fail fetching');
        }
      }
      done();
    });

    it('tests CLP / Pointer Perms / ACL read (ACL locked)', async done => {
      /*
        tests:
        CLP: find/get open ({"*": true})
        PointerPerm: "owners" : read // proper owner
        ACL: logged in user has not access
       */
      const config = Config.get(Parse.applicationId);
      const user = new Parse.User();
      const user2 = new Parse.User();
      const user3 = new Parse.User();
      user.set({
        username: 'user1',
        password: 'password',
      });
      user2.set({
        username: 'user2',
        password: 'password',
      });
      user3.set({
        username: 'user3',
        password: 'password',
      });
      const obj = new Parse.Object('AnObject');
      await Parse.Object.saveAll([user, user2, user3]);

      const ACL = new Parse.ACL();
      ACL.setReadAccess(user, true);
      ACL.setWriteAccess(user, true);
      obj.setACL(ACL);
      obj.set('owners', [user2, user3]);
      await obj.save();

      const schema = await config.database.loadSchema();
      // Allow public and owners read
      await schema.updateClass(
        'AnObject',
        {},
        {
          find: { '*': true },
          get: { '*': true },
          readUserFields: ['owners'],
        }
      );

      for (const owner of ['user2', 'user3']) {
        await Parse.User.logIn(owner, 'password');
        try {
          await obj.fetch();
          done.fail('Should not succeed fetching');
        } catch (err) {
          expect(err.code).toBe(101);
        }
      }
      done();
    });

    it('should let master key find objects', async done => {
      const config = Config.get(Parse.applicationId);
      const object = new Parse.Object('AnObject');
      object.set('hello', 'world');
      await object.save();

      const schema = await config.database.loadSchema();
      // Lock the find/get, and let only owners read
      await schema.updateClass(
        'AnObject',
        { owners: { type: 'Array' } },
        { find: {}, get: {}, readUserFields: ['owners'] }
      );

      const q = new Parse.Query('AnObject');
      const objects = await q.find();
      expect(objects.length).toBe(0);

      try {
        const objects = await q.find({ useMasterKey: true });
        expect(objects.length).toBe(1);
        done();
      } catch (err) {
        done.fail('master key should find the object');
      }
    });

    it('should let master key get objects', async done => {
      const config = Config.get(Parse.applicationId);
      const object = new Parse.Object('AnObject');
      object.set('hello', 'world');

      await object.save();
      const schema = await config.database.loadSchema();
      // Lock the find/get, and let only owners read
      await schema.updateClass(
        'AnObject',
        { owners: { type: 'Array' } },
        { find: {}, get: {}, readUserFields: ['owners'] }
      );

      const q = new Parse.Query('AnObject');
      try {
        await q.get(object.id);
        done.fail();
      } catch (err) {
        expect(err.code).toBe(101);
      }

      try {
        const objectAgain = await q.get(object.id, { useMasterKey: true });
        expect(objectAgain).not.toBeUndefined();
        expect(objectAgain.id).toBe(object.id);
        done();
      } catch (err) {
        done.fail('master key should get the object');
      }
    });

    it('should let master key update objects', async done => {
      const config = Config.get(Parse.applicationId);
      const object = new Parse.Object('AnObject');
      object.set('hello', 'world');
      await object.save();

      const schema = await config.database.loadSchema();
      // Lock the update, and let only owners write
      await schema.updateClass(
        'AnObject',
        { owners: { type: 'Array' } },
        { update: {}, writeUserFields: ['owners'] }
      );

      try {
        await object.save({ hello: 'bar' });
        done.fail();
      } catch (err) {
        expect(err.code).toBe(101);
      }

      try {
        const objectAgain = await object.save({ hello: 'baz' }, { useMasterKey: true });
        expect(objectAgain.get('hello')).toBe('baz');
        done();
      } catch (err) {
        done.fail('master key should save the object');
      }
    });

    it('should let master key delete objects', async done => {
      const config = Config.get(Parse.applicationId);

      const object = new Parse.Object('AnObject');
      object.set('hello', 'world');
      await object.save();

      const schema = await config.database.loadSchema();
      // Lock the delete, and let only owners write
      await schema.updateClass(
        'AnObject',
        { owners: { type: 'Array' } },
        { delete: {}, writeUserFields: ['owners'] }
      );

      try {
        await object.destroy();
        done.fail();
      } catch (err) {
        expect(err.code).toBe(101);
      }
      try {
        await object.destroy({ useMasterKey: true });
        done();
      } catch (err) {
        done.fail('master key should destroy the object');
      }
    });

    it('should fail with invalid pointer perms (not array)', async done => {
      const config = Config.get(Parse.applicationId);
      const schema = await config.database.loadSchema();
      try {
        // Lock the delete, and let only owners write
        await schema.addClassIfNotExists(
          'AnObject',
          { owners: { type: 'Array' } },
          { delete: {}, writeUserFields: 'owners' }
        );
      } catch (err) {
        expect(err.code).toBe(Parse.Error.INVALID_JSON);
        done();
      }
    });

    it('should fail with invalid pointer perms (non-existing field)', async done => {
      const config = Config.get(Parse.applicationId);
      const schema = await config.database.loadSchema();
      try {
        // Lock the delete, and let only owners write
        await schema.addClassIfNotExists(
          'AnObject',
          { owners: { type: 'Array' } },
          { delete: {}, writeUserFields: ['owners', 'invalid'] }
        );
      } catch (err) {
        expect(err.code).toBe(Parse.Error.INVALID_JSON);
        done();
      }
    });
  });

  describe('Granular ', () => {
    const className = 'AnObject';

    const actionGet = id => new Parse.Query(className).get(id);
    const actionFind = () => new Parse.Query(className).find();
    const actionCount = () => new Parse.Query(className).count();
    const actionCreate = () => new Parse.Object(className).save();
    const actionUpdate = obj => obj.save({ revision: 2 });
    const actionDelete = obj => obj.destroy();
    const actionAddFieldOnCreate = () =>
      new Parse.Object(className, { ['extra' + Date.now()]: 'field' }).save();
    const actionAddFieldOnUpdate = obj => obj.save({ ['another' + Date.now()]: 'field' });

    const OBJECT_NOT_FOUND = new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
    const PERMISSION_DENIED = jasmine.stringMatching('Permission denied');

    async function createUser(username, password = 'password') {
      const user = new Parse.User({
        username: username + Date.now(),
        password,
      });

      await user.save();

      return user;
    }

    async function logIn(userObject) {
      return await Parse.User.logIn(userObject.getUsername(), 'password');
    }

    async function updateCLP(clp) {
      const config = Config.get(Parse.applicationId);
      const schemaController = await config.database.loadSchema();

      await schemaController.updateClass(className, {}, clp);
    }

    describe('on single-pointer fields', () => {
      /** owns: **obj1** */
      let user1;

      /** owns: **obj2** */
      let user2;

      /** owned by: **user1** */
      let obj1;

      /** owned by: **user2** */
      let obj2;

      async function initialize() {
        await Config.get(Parse.applicationId).database.schemaCache.clear();

        [user1, user2] = await Promise.all([createUser('user1'), createUser('user2')]);

        obj1 = new Parse.Object(className, {
          owner: user1,
          revision: 0,
        });

        obj2 = new Parse.Object(className, {
          owner: user2,
          revision: 0,
        });

        await Parse.Object.saveAll([obj1, obj2], {
          useMasterKey: true,
        });
      }

      beforeEach(async () => {
        await initialize();
      });

      describe('get action', () => {
        it('should be allowed', async done => {
          await updateCLP({
            get: {
              pointerFields: ['owner'],
            },
          });

          await logIn(user1);

          const result = await actionGet(obj1.id);
          expect(result).toBeDefined();
          done();
        });

        it('should fail for user not listed', async done => {
          await updateCLP({
            get: {
              pointerFields: ['owner'],
            },
          });

          await logIn(user2);

          await expectAsync(actionGet(obj1.id)).toBeRejectedWith(OBJECT_NOT_FOUND);
          done();
        });

        it('should not allow other actions', async done => {
          await updateCLP({
            get: {
              pointerFields: ['owner'],
            },
          });

          await logIn(user1);

          await Promise.all(
            [
              actionFind(),
              actionCount(),
              actionCreate(),
              actionUpdate(obj1),
              actionAddFieldOnCreate(),
              actionDelete(obj1),
            ].map(async p => {
              await expectAsync(p).toBeRejectedWith(PERMISSION_DENIED);
            })
          );
          done();
        });
      });

      describe('find action', () => {
        it('should be allowed', async done => {
          await updateCLP({
            find: {
              pointerFields: ['owner'],
            },
          });

          await logIn(user1);

          await expectAsync(actionFind()).toBeResolved();
          done();
        });

        it('should be limited to objects where user is listed in field', async done => {
          await updateCLP({
            find: {
              pointerFields: ['owner'],
            },
          });

          await logIn(user2);

          const results = await actionFind();
          expect(results.length).toBe(1);
          done();
        });

        it('should not allow other actions', async done => {
          await updateCLP({
            find: {
              pointerFields: ['owner'],
            },
          });

          await logIn(user1);

          await Promise.all(
            [
              actionGet(obj1.id),
              actionCount(),
              actionCreate(),
              actionUpdate(obj1),
              actionAddFieldOnCreate(),
              actionDelete(obj1),
            ].map(async p => {
              await expectAsync(p).toBeRejectedWith(PERMISSION_DENIED);
            })
          );
          done();
        });
      });

      describe('count action', () => {
        it('should be allowed', async done => {
          await updateCLP({
            count: {
              pointerFields: ['owner'],
            },
          });

          await logIn(user1);

          const count = await actionCount();
          expect(count).toBe(1);
          done();
        });

        it('should be limited to objects where user is listed in field', async done => {
          await updateCLP({
            count: {
              pointerFields: ['owner'],
            },
          });

          const user3 = await createUser('user3');
          await logIn(user3);

          const p = await actionCount();
          expect(p).toBe(0);

          done();
        });

        it('should not allow other actions', async done => {
          await updateCLP({
            count: {
              pointerFields: ['owner'],
            },
          });

          await logIn(user1);

          await Promise.all(
            [
              actionGet(obj1.id),
              actionFind(),
              actionCreate(),
              actionUpdate(obj1),
              actionAddFieldOnCreate(),
              actionDelete(obj1),
            ].map(async p => {
              await expectAsync(p).toBeRejectedWith(PERMISSION_DENIED);
            })
          );
          done();
        });
      });

      describe('update action', () => {
        it('should be allowed', async done => {
          await updateCLP({
            update: {
              pointerFields: ['owner'],
            },
          });

          await logIn(user1);
          await expectAsync(actionUpdate(obj1)).toBeResolved();
          done();
        });

        it('should fail for user not listed', async done => {
          await updateCLP({
            update: {
              pointerFields: ['owner'],
            },
          });

          await logIn(user2);

          await expectAsync(actionUpdate(obj1)).toBeRejectedWith(OBJECT_NOT_FOUND);
          done();
        });

        it('should not allow other actions', async done => {
          await updateCLP({
            update: {
              pointerFields: ['owner'],
            },
          });

          await logIn(user1);

          await Promise.all(
            [
              actionGet(obj1.id),
              actionFind(),
              actionCount(),
              actionCreate(),
              actionAddFieldOnCreate(),
              actionDelete(obj1),
            ].map(async p => {
              await expectAsync(p).toBeRejectedWith(PERMISSION_DENIED);
            })
          );
          done();
        });
      });

      describe('delete action', () => {
        it('should be allowed', async done => {
          await updateCLP({
            delete: {
              pointerFields: ['owner'],
            },
          });

          await logIn(user1);

          await expectAsync(actionDelete(obj1)).toBeResolved();
          done();
        });

        it('should fail for user not listed', async done => {
          await updateCLP({
            delete: {
              pointerFields: ['owner'],
            },
          });

          await logIn(user2);

          await expectAsync(actionDelete(obj1)).toBeRejectedWith(OBJECT_NOT_FOUND);
          done();
        });

        it('should not allow other actions', async done => {
          await updateCLP({
            delete: {
              pointerFields: ['owner'],
            },
          });

          await logIn(user1);

          await Promise.all(
            [
              actionGet(obj1.id),
              actionFind(),
              actionCount(),
              actionCreate(),
              actionUpdate(obj1),
              actionAddFieldOnCreate(),
            ].map(async p => {
              await expectAsync(p).toBeRejectedWith(PERMISSION_DENIED);
            })
          );
          done();
        });
      });

      describe('create action', () => {
        // For Pointer permissions create is different from other operations
        // since there's no object holding the pointer before created
        it('should be denied (writelock) when no other permissions on class', async done => {
          await updateCLP({
            create: {
              pointerFields: ['owner'],
            },
          });

          await logIn(user1);
          await expectAsync(actionCreate()).toBeRejectedWith(PERMISSION_DENIED);
          done();
        });
      });

      describe('addField action', () => {
        xit('should have no effect when creating object (and allowed by explicit userid permission)', async done => {
          await updateCLP({
            create: {
              '*': true,
            },
            addField: {
              [user1.id]: true,
              pointerFields: ['owner'],
            },
          });

          await logIn(user1);

          await expectAsync(actionAddFieldOnCreate()).toBeResolved();
          done();
        });

        xit('should be denied when creating object (and no explicit permission)', async done => {
          await updateCLP({
            create: {
              '*': true,
            },
            addField: {
              pointerFields: ['owner'],
            },
          });

          await logIn(user1);

          const newObject = new Parse.Object(className, {
            owner: user1,
            extra: 'field',
          });
          await expectAsync(newObject.save()).toBeRejectedWith(PERMISSION_DENIED);
          done();
        });

        it('should be allowed when updating object', async done => {
          await updateCLP({
            update: {
              '*': true,
            },
            addField: {
              pointerFields: ['owner'],
            },
          });

          await logIn(user1);

          await expectAsync(actionAddFieldOnUpdate(obj1)).toBeResolved();

          done();
        });

        it('should be denied when updating object for user without addField permission', async done => {
          await updateCLP({
            update: {
              '*': true,
            },
            addField: {
              pointerFields: ['owner'],
            },
          });

          await logIn(user2);

          await expectAsync(actionAddFieldOnUpdate(obj1)).toBeRejectedWith(OBJECT_NOT_FOUND);

          done();
        });
      });
    });

    describe('on array of pointers', () => {
      /**
       * owns: **obj1**
       *
       * moderates: **obj1** */
      let user1;

      /**
       * owns: **obj2**
       *
       * moderates: **obj1, obj2** */
      let user2;

      /**
       * owns: **obj3**
       *
       * moderates: **obj1, obj2, obj3 ** */
      let user3;

      /**
       * owned by: **user1**
       *
       * moderated by: **user1, user2, user3** */
      let obj1;

      /**
       * owned by: **user2**
       *
       * moderated by: **user2, user3** */
      let obj2;

      /**
       * owned by: **user3**
       *
       * moderated by: **user3** */
      let obj3;

      /**
       * owned by: **noboody**
       *
       * moderated by: **nobody** */
      let objNobody;

      async function initialize() {
        await Config.get(Parse.applicationId).database.schemaCache.clear();

        [user1, user2, user3] = await Promise.all([
          createUser('user1'),
          createUser('user2'),
          createUser('user3'),
        ]);

        obj1 = new Parse.Object(className);
        obj2 = new Parse.Object(className);
        obj3 = new Parse.Object(className);
        objNobody = new Parse.Object(className);

        obj1.set({
          owners: [user1],
          moderators: [user3, user2, user1],
          revision: 0,
        });

        obj2.set({
          owners: [user2],
          moderators: [user3, user2],
          revision: 0,
        });

        obj3.set({
          owners: [user3],
          moderators: [user3],
          revision: 0,
        });

        objNobody.set({
          owners: [],
          moderators: [],
          revision: 0,
        });

        await Parse.Object.saveAll([obj1, obj2, obj3, objNobody], {
          useMasterKey: true,
        });
      }

      beforeEach(async () => {
        await initialize();
      });

      describe('get action', () => {
        it('should be allowed (1 user in array)', async done => {
          await updateCLP({
            get: {
              pointerFields: ['owners'],
            },
          });

          await logIn(user1);

          const result = await actionGet(obj1.id);
          expect(result).toBeDefined();
          done();
        });

        it('should be allowed (multiple users in array)', async done => {
          await updateCLP({
            get: {
              pointerFields: ['moderators'],
            },
          });

          await logIn(user2);

          const result = await actionGet(obj1.id);
          expect(result).toBeDefined();
          done();
        });

        it('should fail for user not listed', async done => {
          await updateCLP({
            get: {
              pointerFields: ['moderators'],
            },
          });

          await logIn(user1);

          await expectAsync(actionGet(obj3.id)).toBeRejectedWith(OBJECT_NOT_FOUND);
          done();
        });

        it('should not allow other actions', async done => {
          await updateCLP({
            get: {
              pointerFields: ['owners'],
            },
          });

          await logIn(user1);

          await Promise.all(
            [
              actionFind(),
              actionCount(),
              actionCreate(),
              actionUpdate(obj2),
              actionAddFieldOnCreate(),
              actionAddFieldOnUpdate(obj2),
              actionDelete(obj2),
            ].map(async p => {
              await expectAsync(p).toBeRejectedWith(PERMISSION_DENIED);
            })
          );
          done();
        });
      });

      describe('find action', () => {
        it('should be allowed (1 user in array)', async done => {
          await updateCLP({
            find: {
              pointerFields: ['owners'],
            },
          });

          await logIn(user1);

          const results = await actionFind();
          expect(results.length).toBe(1);
          done();
        });

        it('should be allowed (multiple users in array)', async done => {
          await updateCLP({
            find: {
              pointerFields: ['moderators'],
            },
          });

          await logIn(user2);

          const results = await actionFind();
          expect(results.length).toBe(2);
          done();
        });

        it('should be limited to objects where user is listed in field', async done => {
          await updateCLP({
            find: {
              pointerFields: ['moderators'],
            },
          });

          await logIn(user1);

          const results = await actionFind();
          expect(results.length).toBe(1);
          done();
        });

        it('should not allow other actions', async done => {
          await updateCLP({
            find: {
              pointerFields: ['moderators'],
            },
          });

          await logIn(user1);

          await Promise.all(
            [
              actionGet(obj1.id),
              actionCount(),
              actionCreate(),
              actionUpdate(obj1),
              actionAddFieldOnCreate(),
              actionAddFieldOnUpdate(obj1),
              actionDelete(obj1),
            ].map(async p => {
              await expectAsync(p).toBeRejectedWith(PERMISSION_DENIED);
            })
          );
          done();
        });
      });

      describe('count action', () => {
        beforeEach(async () => {
          await updateCLP({
            count: {
              pointerFields: ['moderators'],
            },
          });
        });

        it('should be allowed', async done => {
          await logIn(user1);

          const count = await actionCount();
          expect(count).toBe(1);
          done();
        });

        it('should be limited to objects where user is listed in field', async done => {
          await logIn(user2);

          const count = await actionCount();
          expect(count).toBe(2);

          done();
        });

        it('should not allow other actions', async done => {
          await logIn(user1);

          await Promise.all(
            [
              actionGet(obj1.id),
              actionFind(),
              actionCreate(),
              actionUpdate(obj1),
              actionAddFieldOnCreate(),
              actionAddFieldOnUpdate(obj1),
              actionDelete(obj1),
            ].map(async p => {
              await expectAsync(p).toBeRejectedWith(PERMISSION_DENIED);
            })
          );
          done();
        });
      });

      describe('update action', () => {
        it('should be allowed (1 user in array)', async done => {
          await updateCLP({
            update: {
              pointerFields: ['owners'],
            },
          });

          await logIn(user1);

          await expectAsync(actionUpdate(obj1)).toBeResolved();
          done();
        });

        it('should be allowed (multiple users in array)', async done => {
          await updateCLP({
            update: {
              pointerFields: ['moderators'],
            },
          });

          await logIn(user2);

          await expectAsync(actionUpdate(obj1)).toBeResolved();
          done();
        });

        it('should fail for user not listed', async done => {
          await updateCLP({
            update: {
              pointerFields: ['moderators'],
            },
          });

          await logIn(user2);

          await expectAsync(actionUpdate(obj3)).toBeRejectedWith(OBJECT_NOT_FOUND);
          done();
        });

        it('should not allow other actions', async done => {
          await updateCLP({
            update: {
              pointerFields: ['moderators'],
            },
          });

          await logIn(user1);

          await Promise.all(
            [
              actionGet(obj1.id),
              actionFind(),
              actionCount(),
              actionCreate(),
              actionAddFieldOnCreate(),
              actionAddFieldOnUpdate(obj1),
              actionDelete(obj1),
            ].map(async p => {
              await expectAsync(p).toBeRejectedWith(PERMISSION_DENIED);
            })
          );
          done();
        });
      });

      describe('delete action', () => {
        it('should be allowed (1 user in array)', async done => {
          await updateCLP({
            delete: {
              pointerFields: ['owners'],
            },
          });

          await logIn(user1);

          await expectAsync(actionDelete(obj1)).toBeResolved();
          done();
        });

        it('should be allowed (multiple users in array)', async done => {
          await updateCLP({
            delete: {
              pointerFields: ['moderators'],
            },
          });

          await logIn(user3);

          await expectAsync(actionDelete(obj2)).toBeResolved();
          done();
        });

        it('should fail for user not listed', async done => {
          await updateCLP({
            delete: {
              pointerFields: ['owners'],
            },
          });

          await logIn(user1);

          await expectAsync(actionDelete(obj3)).toBeRejectedWith(OBJECT_NOT_FOUND);
          done();
        });

        it('should not allow other actions', async done => {
          await updateCLP({
            delete: {
              pointerFields: ['moderators'],
            },
          });

          await logIn(user1);

          await Promise.all(
            [
              actionGet(obj1.id),
              actionFind(),
              actionCount(),
              actionCreate(),
              actionUpdate(obj1),
              actionAddFieldOnCreate(),
              actionAddFieldOnUpdate(obj1),
            ].map(async p => {
              await expectAsync(p).toBeRejectedWith(PERMISSION_DENIED);
            })
          );
          done();
        });
      });

      describe('create action', () => {
        /* For Pointer permissions 'create' is different from other operations
         since there's no object holding the pointer before created */
        it('should be denied (writelock) when no other permissions on class', async done => {
          await updateCLP({
            create: {
              pointerFields: ['moderators'],
            },
          });

          await logIn(user1);
          await expectAsync(actionCreate()).toBeRejectedWith(PERMISSION_DENIED);
          done();
        });
      });

      describe('addField action', () => {
        it('should have no effect on create (allowed by explicit userid)', async done => {
          await updateCLP({
            create: {
              '*': true,
            },
            addField: {
              [user1.id]: true,
              pointerFields: ['moderators'],
            },
          });

          await logIn(user1);

          await expectAsync(actionAddFieldOnCreate()).toBeResolved();
          done();
        });

        it('should be denied when creating object (and no explicit permission)', async done => {
          await updateCLP({
            create: {
              '*': true,
            },
            addField: {
              pointerFields: ['moderators'],
            },
          });

          await logIn(user1);

          const newObject = new Parse.Object(className, {
            moderators: user1,
            extra: 'field',
          });
          await expectAsync(newObject.save()).toBeRejectedWith(PERMISSION_DENIED);
          done();
        });

        it('should be allowed when updating object', async done => {
          await updateCLP({
            update: {
              '*': true,
            },
            addField: {
              pointerFields: ['moderators'],
            },
          });

          await logIn(user2);

          await expectAsync(actionAddFieldOnUpdate(obj1)).toBeResolved();

          done();
        });

        it('should be restricted when updating object without addField permission', async done => {
          await updateCLP({
            update: {
              '*': true,
            },
            addField: {
              pointerFields: ['moderators'],
            },
          });

          await logIn(user1);

          await expectAsync(actionAddFieldOnUpdate(obj2)).toBeRejectedWith(OBJECT_NOT_FOUND);

          done();
        });
      });
    });

    describe('combined with grouped', () => {
      /**
       * owns: **obj1**
       *
       * moderates: **obj2** */
      let user1;

      /**
       * owns: **obj2**
       *
       * moderates: **obj1, obj2** */
      let user2;

      /**
       * owned by: **user1**
       *
       * moderated by: **user2** */
      let obj1;

      /**
       * owned by: **user2**
       *
       * moderated by: **user1, user2** */
      let obj2;

      async function initialize() {
        await Config.get(Parse.applicationId).database.schemaCache.clear();

        [user1, user2] = await Promise.all([createUser('user1'), createUser('user2')]);

        // User1 owns object1
        // User2 owns object2
        obj1 = new Parse.Object(className, {
          owner: user1,
          moderators: [user2],
          revision: 0,
        });

        obj2 = new Parse.Object(className, {
          owner: user2,
          moderators: [user1, user2],
          revision: 0,
        });

        await Parse.Object.saveAll([obj1, obj2], {
          useMasterKey: true,
        });
      }

      beforeEach(async () => {
        await initialize();
      });

      it('should not limit the scope of grouped read permissions', async done => {
        await updateCLP({
          get: {
            pointerFields: ['owner'],
          },
          readUserFields: ['moderators'],
        });

        await logIn(user2);

        await expectAsync(actionGet(obj1.id)).toBeResolved();

        const found = await actionFind();
        expect(found.length).toBe(2);

        const counted = await actionCount();
        expect(counted).toBe(2);

        done();
      });

      it('should not limit the scope of grouped write permissions', async done => {
        await updateCLP({
          update: {
            pointerFields: ['owner'],
          },
          writeUserFields: ['moderators'],
        });

        await logIn(user2);

        await expectAsync(actionUpdate(obj1)).toBeResolved();
        await expectAsync(actionAddFieldOnUpdate(obj1)).toBeResolved();
        await expectAsync(actionDelete(obj1)).toBeResolved();
        // [create] and [addField on create] can't be enabled with pointer by design

        done();
      });

      it('should not inherit scope of grouped read permissions from another field', async done => {
        await updateCLP({
          get: {
            pointerFields: ['owner'],
          },
          readUserFields: ['moderators'],
        });

        await logIn(user1);

        const found = await actionFind();
        expect(found.length).toBe(1);

        const counted = await actionCount();
        expect(counted).toBe(1);

        done();
      });

      it('should not inherit scope of grouped write permissions from another field', async done => {
        await updateCLP({
          update: {
            pointerFields: ['moderators'],
          },
          writeUserFields: ['owner'],
        });

        await logIn(user1);

        await expectAsync(actionDelete(obj2)).toBeRejectedWith(OBJECT_NOT_FOUND);

        done();
      });
    });

    describe('using pointer-fields and queries with keys projection', () => {
      let user1;
      /**
       * owner: user1
       *
       * testers: [user1]
       */
      let obj;

      /**
       * Clear cache, create user and object, login user
       */
      async function initialize() {
        await Config.get(Parse.applicationId).database.schemaCache.clear();

        user1 = await createUser('user1');
        user1 = await logIn(user1);

        obj = new Parse.Object(className);

        obj.set('owner', user1);
        obj.set('field', 'field');
        obj.set('test', 'test');

        await Parse.Object.saveAll([obj], { useMasterKey: true });

        await obj.fetch();
      }

      beforeEach(async () => {
        await initialize();
      });

      it('should be enforced regardless of pointer-field being included in keys (select)', async done => {
        await updateCLP({
          get: { '*': true },
          find: { pointerFields: ['owner'] },
          update: { pointerFields: ['owner'] },
        });

        const query = new Parse.Query('AnObject');
        query.select('field', 'test');

        const [object] = await query.find({ objectId: obj.id });
        expect(object.get('field')).toBe('field');
        expect(object.get('test')).toBe('test');
        done();
      });
    });
  });
});
