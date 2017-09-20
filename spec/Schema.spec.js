'use strict';

var Config = require('../src/Config');
var SchemaController = require('../src/Controllers/SchemaController');
var dd = require('deep-diff');

var config;

var hasAllPODobject = () => {
  var obj = new Parse.Object('HasAllPOD');
  obj.set('aNumber', 5);
  obj.set('aString', 'string');
  obj.set('aBool', true);
  obj.set('aDate', new Date());
  obj.set('aObject', {k1: 'value', k2: true, k3: 5});
  obj.set('aArray', ['contents', true, 5]);
  obj.set('aGeoPoint', new Parse.GeoPoint({latitude: 0, longitude: 0}));
  obj.set('aFile', new Parse.File('f.txt', { base64: 'V29ya2luZyBhdCBQYXJzZSBpcyBncmVhdCE=' }));
  return obj;
};

describe('SchemaController', () => {
  beforeEach(() => {
    config = new Config('test');
  });

  it('can validate one object', (done) => {
    config.database.loadSchema().then((schema) => {
      return schema.validateObject('TestObject', {a: 1, b: 'yo', c: false});
    }).then(() => {
      done();
    }, (error) => {
      jfail(error);
      done();
    });
  });

  it('can validate one object with dot notation', (done) => {
    config.database.loadSchema().then((schema) => {
      return schema.validateObject('TestObjectWithSubDoc', {x: false, y: 'YY', z: 1, 'aObject.k1': 'newValue'});
    }).then(() => {
      done();
    }, (error) => {
      jfail(error);
      done();
    });
  });

  it('can validate two objects in a row', (done) => {
    config.database.loadSchema().then((schema) => {
      return schema.validateObject('Foo', {x: true, y: 'yyy', z: 0});
    }).then((schema) => {
      return schema.validateObject('Foo', {x: false, y: 'YY', z: 1});
    }).then(() => {
      done();
    });
  });

  it('can validate Relation object', (done) => {
    config.database.loadSchema().then((schema) => {
      return schema.validateObject('Stuff', {aRelation: {__type:'Relation',className:'Stuff'}});
    }).then((schema) => {
      return schema.validateObject('Stuff', {aRelation: {__type:'Pointer',className:'Stuff'}})
        .then(() => {
          fail('expected invalidity');
          done();
        }, done);
    }, (err) => {
      fail(err);
      done();
    });
  });

  it('rejects inconsistent types', (done) => {
    config.database.loadSchema().then((schema) => {
      return schema.validateObject('Stuff', {bacon: 7});
    }).then((schema) => {
      return schema.validateObject('Stuff', {bacon: 'z'});
    }).then(() => {
      fail('expected invalidity');
      done();
    }, done);
  });

  it('updates when new fields are added', (done) => {
    config.database.loadSchema().then((schema) => {
      return schema.validateObject('Stuff', {bacon: 7});
    }).then((schema) => {
      return schema.validateObject('Stuff', {sausage: 8});
    }).then((schema) => {
      return schema.validateObject('Stuff', {sausage: 'ate'});
    }).then(() => {
      fail('expected invalidity');
      done();
    }, done);
  });

  it('class-level permissions test find', (done) => {
    config.database.loadSchema().then((schema) => {
      // Just to create a valid class
      return schema.validateObject('Stuff', {foo: 'bar'});
    }).then((schema) => {
      return schema.setPermissions('Stuff', {
        'find': {}
      });
    }).then(() => {
      var query = new Parse.Query('Stuff');
      return query.find();
    }).then(() => {
      fail('Class permissions should have rejected this query.');
      done();
    }, () => {
      done();
    });
  });

  it('class-level permissions test user', (done) => {
    var user;
    createTestUser().then((u) => {
      user = u;
      return config.database.loadSchema();
    }).then((schema) => {
      // Just to create a valid class
      return schema.validateObject('Stuff', {foo: 'bar'});
    }).then((schema) => {
      var find = {};
      find[user.id] = true;
      return schema.setPermissions('Stuff', {
        'find': find
      });
    }).then(() => {
      var query = new Parse.Query('Stuff');
      return query.find();
    }).then(() => {
      done();
    }, () => {
      fail('Class permissions should have allowed this query.');
      done();
    });
  });

  it('class-level permissions test get', (done) => {
    var obj;
    createTestUser()
      .then(user => {
        return config.database.loadSchema()
        // Create a valid class
          .then(schema => schema.validateObject('Stuff', {foo: 'bar'}))
          .then(schema => {
            var find = {};
            var get = {};
            get[user.id] = true;
            return schema.setPermissions('Stuff', {
              'create': {'*': true},
              'find': find,
              'get': get
            });
          }).then(() => {
            obj = new Parse.Object('Stuff');
            obj.set('foo', 'bar');
            return obj.save();
          }).then((o) => {
            obj = o;
            var query = new Parse.Query('Stuff');
            return query.find();
          }).then(() => {
            fail('Class permissions should have rejected this query.');
            done();
          }, () => {
            var query = new Parse.Query('Stuff');
            return query.get(obj.id).then(() => {
              done();
            }, () => {
              fail('Class permissions should have allowed this get query');
              done();
            });
          });
      });
  });

  it('class-level permissions test count', (done) => {
    var obj;
    return config.database.loadSchema()
      // Create a valid class
      .then(schema => schema.validateObject('Stuff', {foo: 'bar'}))
      .then(schema => {
        var count = {};
        return schema.setPermissions('Stuff', {
          'create': {'*': true},
          'find': {'*': true},
          'count': count
        })
      }).then(() => {
        obj = new Parse.Object('Stuff');
        obj.set('foo', 'bar');
        return obj.save();
      }).then((o) => {
        obj = o;
        var query = new Parse.Query('Stuff');
        return query.find();
      }).then((results) => {
        expect(results.length).toBe(1);
        var query = new Parse.Query('Stuff');
        return query.count();
      }).then(() => {
        fail('Class permissions should have rejected this query.');
      }, (err) => {
        expect(err.message).toEqual('Permission denied for action count on class Stuff.');
        done();
      });
  });

  it('can add classes without needing an object', done => {
    config.database.loadSchema()
      .then(schema => schema.addClassIfNotExists('NewClass', {
        foo: {type: 'String'},
      }))
      .then(actualSchema => {
        const expectedSchema = {
          className: 'NewClass',
          fields: {
            objectId: { type: 'String' },
            updatedAt: { type: 'Date' },
            createdAt: { type: 'Date' },
            ACL: { type: 'ACL' },
            foo: { type: 'String' },
          },
          classLevelPermissions: {
            find: { '*': true },
            get: { '*': true },
            create: { '*': true },
            update: { '*': true },
            delete: { '*': true },
            addField: { '*': true },
          },
        }
        expect(dd(actualSchema, expectedSchema)).toEqual(undefined);
        done();
      })
      .catch(error => {
        fail('Error creating class: ' + JSON.stringify(error));
      });
  });

  it('can update classes without needing an object', done => {
    const levelPermissions = {
      find: { '*': true },
      get: { '*': true },
      create: { '*': true },
      update: { '*': true },
      delete: { '*': true },
      addField: { '*': true },
    };
    config.database.loadSchema()
      .then(schema => {
        schema.validateObject('NewClass', { foo: 2 })
          .then(() => schema.reloadData())
          .then(() => schema.updateClass('NewClass', {
            fooOne: {type: 'Number'},
            fooTwo: {type: 'Array'},
            fooThree: {type: 'Date'},
            fooFour: {type: 'Object'},
            fooFive: {type: 'Relation', targetClass: '_User' },
            fooSix: {type: 'String'},
            fooSeven: {type: 'Object' },
            fooEight: {type: 'String'},
            fooNine: {type: 'String'},
            fooTeen: {type: 'Number' },
            fooEleven: {type: 'String'},
            fooTwelve: {type: 'String'},
            fooThirteen: {type: 'String'},
            fooFourteen: {type: 'String'},
            fooFifteen: {type: 'String'},
            fooSixteen: {type: 'String'},
            fooEighteen: {type: 'String'},
            fooNineteen: {type: 'String'},
          }, levelPermissions, config.database))
          .then(actualSchema => {
            const expectedSchema = {
              className: 'NewClass',
              fields: {
                objectId: { type: 'String' },
                updatedAt: { type: 'Date' },
                createdAt: { type: 'Date' },
                ACL: { type: 'ACL' },
                foo: { type: 'Number' },
                fooOne: {type: 'Number'},
                fooTwo: {type: 'Array'},
                fooThree: {type: 'Date'},
                fooFour: {type: 'Object'},
                fooFive: {type: 'Relation', targetClass: '_User' },
                fooSix: {type: 'String'},
                fooSeven: {type: 'Object' },
                fooEight: {type: 'String'},
                fooNine: {type: 'String'},
                fooTeen: {type: 'Number' },
                fooEleven: {type: 'String'},
                fooTwelve: {type: 'String'},
                fooThirteen: {type: 'String'},
                fooFourteen: {type: 'String'},
                fooFifteen: {type: 'String'},
                fooSixteen: {type: 'String'},
                fooEighteen: {type: 'String'},
                fooNineteen: {type: 'String'},
              },
              classLevelPermissions: { ...levelPermissions },
            };

            expect(dd(actualSchema, expectedSchema)).toEqual(undefined);
            done();
          })
          .catch(error => {
            console.trace(error);
            done();
            fail('Error creating class: ' + JSON.stringify(error));
          });
      });
  });

  it('will fail to create a class if that class was already created by an object', done => {
    config.database.loadSchema()
      .then(schema => {
        schema.validateObject('NewClass', { foo: 7 })
          .then(() => schema.reloadData())
          .then(() => schema.addClassIfNotExists('NewClass', {
            foo: { type: 'String' }
          }))
          .catch(error => {
            expect(error.code).toEqual(Parse.Error.INVALID_CLASS_NAME);
            expect(error.message).toEqual('Class NewClass already exists.');
            done();
          });
      });
  });

  it('will resolve class creation races appropriately', done => {
    // If two callers race to create the same schema, the response to the
    // race loser should be the same as if they hadn't been racing.
    config.database.loadSchema()
      .then(schema => {
        var p1 = schema.addClassIfNotExists('NewClass', {foo: {type: 'String'}});
        var p2 = schema.addClassIfNotExists('NewClass', {foo: {type: 'String'}});
        Promise.race([p1, p2])
          .then(actualSchema => {
            const expectedSchema = {
              className: 'NewClass',
              fields: {
                objectId: { type: 'String' },
                updatedAt: { type: 'Date' },
                createdAt: { type: 'Date' },
                ACL: { type: 'ACL' },
                foo: { type: 'String' },
              },
              classLevelPermissions: {
                find: { '*': true },
                get: { '*': true },
                create: { '*': true },
                update: { '*': true },
                delete: { '*': true },
                addField: { '*': true },
              },
            }
            expect(dd(actualSchema, expectedSchema)).toEqual(undefined);
          });
        Promise.all([p1,p2])
          .catch(error => {
            expect(error.code).toEqual(Parse.Error.INVALID_CLASS_NAME);
            expect(error.message).toEqual('Class NewClass already exists.');
            done();
          });
      });
  });

  it('refuses to create classes with invalid names', done => {
    config.database.loadSchema()
      .then(schema => {
        schema.addClassIfNotExists('_InvalidName', {foo: {type: 'String'}})
          .catch(error => {
            expect(error.error).toEqual(
              'Invalid classname: _InvalidName, classnames can only have alphanumeric characters and _, and must start with an alpha character '
            );
            done();
          });
      });
  });

  it('refuses to add fields with invalid names', done => {
    config.database.loadSchema()
      .then(schema => schema.addClassIfNotExists('NewClass', {'0InvalidName': {type: 'String'}}))
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.INVALID_KEY_NAME);
        expect(error.error).toEqual('invalid field name: 0InvalidName');
        done();
      });
  });

  it('refuses to explicitly create the default fields for custom classes', done => {
    config.database.loadSchema()
      .then(schema => schema.addClassIfNotExists('NewClass', {objectId: {type: 'String'}}))
      .catch(error => {
        expect(error.code).toEqual(136);
        expect(error.error).toEqual('field objectId cannot be added');
        done();
      });
  });

  it('refuses to explicitly create the default fields for non-custom classes', done => {
    config.database.loadSchema()
      .then(schema => schema.addClassIfNotExists('_Installation', {localeIdentifier: {type: 'String'}}))
      .catch(error => {
        expect(error.code).toEqual(136);
        expect(error.error).toEqual('field localeIdentifier cannot be added');
        done();
      });
  });

  it('refuses to add fields with invalid types', done => {
    config.database.loadSchema()
      .then(schema => schema.addClassIfNotExists('NewClass', {
        foo: {type: 7}
      }))
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.INVALID_JSON);
        expect(error.error).toEqual('invalid JSON');
        done();
      });
  });

  it('refuses to add fields with invalid pointer types', done => {
    config.database.loadSchema()
      .then(schema => schema.addClassIfNotExists('NewClass', {
        foo: {type: 'Pointer'}
      }))
      .catch(error => {
        expect(error.code).toEqual(135);
        expect(error.error).toEqual('type Pointer needs a class name');
        done();
      });
  });

  it('refuses to add fields with invalid pointer target', done => {
    config.database.loadSchema()
      .then(schema => schema.addClassIfNotExists('NewClass', {
        foo: {type: 'Pointer', targetClass: 7},
      }))
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.INVALID_JSON);
        expect(error.error).toEqual('invalid JSON');
        done();
      });
  });

  it('refuses to add fields with invalid Relation type', done => {
    config.database.loadSchema()
      .then(schema => schema.addClassIfNotExists('NewClass', {
        foo: {type: 'Relation', uselessKey: 7},
      }))
      .catch(error => {
        expect(error.code).toEqual(135);
        expect(error.error).toEqual('type Relation needs a class name');
        done();
      });
  });

  it('refuses to add fields with invalid relation target', done => {
    config.database.loadSchema()
      .then(schema => schema.addClassIfNotExists('NewClass', {
        foo: {type: 'Relation', targetClass: 7},
      }))
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.INVALID_JSON);
        expect(error.error).toEqual('invalid JSON');
        done();
      });
  });

  it('refuses to add fields with uncreatable pointer target class', done => {
    config.database.loadSchema()
      .then(schema => schema.addClassIfNotExists('NewClass', {
        foo: {type: 'Pointer', targetClass: 'not a valid class name'},
      }))
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.INVALID_CLASS_NAME);
        expect(error.error).toEqual('Invalid classname: not a valid class name, classnames can only have alphanumeric characters and _, and must start with an alpha character ');
        done();
      });
  });

  it('refuses to add fields with uncreatable relation target class', done => {
    config.database.loadSchema()
      .then(schema => schema.addClassIfNotExists('NewClass', {
        foo: {type: 'Relation', targetClass: 'not a valid class name'},
      }))
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.INVALID_CLASS_NAME);
        expect(error.error).toEqual('Invalid classname: not a valid class name, classnames can only have alphanumeric characters and _, and must start with an alpha character ');
        done();
      });
  });

  it('refuses to add fields with unknown types', done => {
    config.database.loadSchema()
      .then(schema => schema.addClassIfNotExists('NewClass', {
        foo: {type: 'Unknown'},
      }))
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.INCORRECT_TYPE);
        expect(error.error).toEqual('invalid field type: Unknown');
        done();
      });
  });

  it('will create classes', done => {
    config.database.loadSchema()
      .then(schema => schema.addClassIfNotExists('NewClass', {
        aNumber: {type: 'Number'},
        aString: {type: 'String'},
        aBool: {type: 'Boolean'},
        aDate: {type: 'Date'},
        aObject: {type: 'Object'},
        aArray: {type: 'Array'},
        aGeoPoint: {type: 'GeoPoint'},
        aFile: {type: 'File'},
        aPointer: {type: 'Pointer', targetClass: 'ThisClassDoesNotExistYet'},
        aRelation: {type: 'Relation', targetClass: 'NewClass'},
        aBytes: {type: 'Bytes'},
        aPolygon: {type: 'Polygon'},
      }))
      .then(actualSchema => {
        const expectedSchema = {
          className: 'NewClass',
          fields: {
            objectId: { type: 'String' },
            updatedAt: { type: 'Date' },
            createdAt: { type: 'Date' },
            ACL: { type: 'ACL' },
            aString: { type: 'String' },
            aNumber: { type: 'Number' },
            aBool: { type: 'Boolean' },
            aDate: { type: 'Date' },
            aObject: { type: 'Object' },
            aArray: { type: 'Array' },
            aGeoPoint: { type: 'GeoPoint' },
            aFile: { type: 'File' },
            aPointer: { type: 'Pointer', targetClass: 'ThisClassDoesNotExistYet' },
            aRelation: { type: 'Relation', targetClass: 'NewClass' },
            aBytes: {type: 'Bytes'},
            aPolygon: {type: 'Polygon'},
          },
          classLevelPermissions: {
            find: { '*': true },
            get: { '*': true },
            create: { '*': true },
            update: { '*': true },
            delete: { '*': true },
            addField: { '*': true },
          },
        }
        expect(dd(actualSchema, expectedSchema)).toEqual(undefined);
        done();
      });
  });

  it('creates the default fields for non-custom classes', done => {
    config.database.loadSchema()
      .then(schema => schema.addClassIfNotExists('_Installation', {
        foo: {type: 'Number'},
      }))
      .then(actualSchema => {
        const expectedSchema = {
          className: '_Installation',
          fields: {
            objectId: { type: 'String' },
            updatedAt: { type: 'Date' },
            createdAt: { type: 'Date' },
            ACL: { type: 'ACL' },
            foo: { type: 'Number' },
            installationId: { type: 'String' },
            deviceToken: { type: 'String' },
            channels: { type: 'Array' },
            deviceType: { type: 'String' },
            pushType: { type: 'String' },
            GCMSenderId: { type: 'String' },
            timeZone: { type: 'String' },
            localeIdentifier: { type: 'String' },
            badge: { type: 'Number' },
            appVersion: { type: 'String' },
            appName: { type: 'String' },
            appIdentifier: { type: 'String' },
            parseVersion: { type: 'String' },
          },
          classLevelPermissions: {
            find: { '*': true },
            get: { '*': true },
            create: { '*': true },
            update: { '*': true },
            delete: { '*': true },
            addField: { '*': true },
          },
        }
        expect(dd(actualSchema, expectedSchema)).toEqual(undefined);
        done();
      });
  });

  it('creates non-custom classes which include relation field', done => {
    config.database.loadSchema()
    //as `_Role` is always created by default, we only get it here
      .then(schema => schema.getOneSchema('_Role'))
      .then(actualSchema => {
        const expectedSchema = {
          className: '_Role',
          fields: {
            objectId: { type: 'String' },
            updatedAt: { type: 'Date' },
            createdAt: { type: 'Date' },
            ACL: { type: 'ACL' },
            name: { type: 'String' },
            users: { type: 'Relation', targetClass: '_User' },
            roles: { type: 'Relation', targetClass: '_Role' },
          },
          classLevelPermissions: {
            find: { '*': true },
            get: { '*': true },
            create: { '*': true },
            update: { '*': true },
            delete: { '*': true },
            addField: { '*': true },
          },
        };
        expect(dd(actualSchema, expectedSchema)).toEqual(undefined);
        done();
      });
  });

  it('creates non-custom classes which include pointer field', done => {
    config.database.loadSchema()
      .then(schema => schema.addClassIfNotExists('_Session', {}))
      .then(actualSchema => {
        const expectedSchema = {
          className: '_Session',
          fields: {
            objectId: { type: 'String' },
            updatedAt: { type: 'Date' },
            createdAt: { type: 'Date' },
            restricted: { type: 'Boolean' },
            user: { type: 'Pointer', targetClass: '_User' },
            installationId: { type: 'String' },
            sessionToken: { type: 'String' },
            expiresAt: { type: 'Date' },
            createdWith: { type: 'Object' },
            ACL: { type: 'ACL' },
          },
          classLevelPermissions: {
            find: { '*': true },
            get: { '*': true },
            create: { '*': true },
            update: { '*': true },
            delete: { '*': true },
            addField: { '*': true },
          },
        };
        expect(dd(actualSchema, expectedSchema)).toEqual(undefined);
        done();
      });
  });

  it('refuses to create two geopoints', done => {
    config.database.loadSchema()
      .then(schema => schema.addClassIfNotExists('NewClass', {
        geo1: {type: 'GeoPoint'},
        geo2: {type: 'GeoPoint'}
      }))
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.INCORRECT_TYPE);
        expect(error.error).toEqual('currently, only one GeoPoint field may exist in an object. Adding geo2 when geo1 already exists.');
        done();
      });
  });

  it('can check if a class exists', done => {
    config.database.loadSchema()
      .then(schema => {
        return schema.addClassIfNotExists('NewClass', {})
          .then(() => {
            schema.hasClass('NewClass')
              .then(hasClass => {
                expect(hasClass).toEqual(true);
                done();
              })
              .catch(fail);

            schema.hasClass('NonexistantClass')
              .then(hasClass => {
                expect(hasClass).toEqual(false);
                done();
              })
              .catch(fail);
          })
          .catch(error => {
            fail('Couldn\'t create class');
            jfail(error);
          });
      })
      .catch(() => fail('Couldn\'t load schema'));
  });

  it('refuses to delete fields from invalid class names', done => {
    config.database.loadSchema()
      .then(schema => schema.deleteField('fieldName', 'invalid class name'))
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.INVALID_CLASS_NAME);
        done();
      });
  });

  it('refuses to delete invalid fields', done => {
    config.database.loadSchema()
      .then(schema => schema.deleteField('invalid field name', 'ValidClassName'))
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.INVALID_KEY_NAME);
        done();
      });
  });

  it('refuses to delete the default fields', done => {
    config.database.loadSchema()
      .then(schema => schema.deleteField('installationId', '_Installation'))
      .catch(error => {
        expect(error.code).toEqual(136);
        expect(error.message).toEqual('field installationId cannot be changed');
        done();
      });
  });

  it('refuses to delete fields from nonexistant classes', done => {
    config.database.loadSchema()
      .then(schema => schema.deleteField('field', 'NoClass'))
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.INVALID_CLASS_NAME);
        expect(error.message).toEqual('Class NoClass does not exist.');
        done();
      });
  });

  it('refuses to delete fields that dont exist', done => {
    hasAllPODobject().save()
      .then(() => config.database.loadSchema())
      .then(schema => schema.deleteField('missingField', 'HasAllPOD'))
      .fail(error => {
        expect(error.code).toEqual(255);
        expect(error.message).toEqual('Field missingField does not exist, cannot delete.');
        done();
      });
  });

  it('drops related collection when deleting relation field', done => {
    var obj1 = hasAllPODobject();
    obj1.save()
      .then(savedObj1 => {
        var obj2 = new Parse.Object('HasPointersAndRelations');
        obj2.set('aPointer', savedObj1);
        var relation = obj2.relation('aRelation');
        relation.add(obj1);
        return obj2.save();
      })
      .then(() => config.database.collectionExists('_Join:aRelation:HasPointersAndRelations'))
      .then(exists => {
        if (!exists) {
          fail('Relation collection ' +
            'should exist after save.');
        }
      })
      .then(() => config.database.loadSchema())
      .then(schema => schema.deleteField('aRelation', 'HasPointersAndRelations', config.database))
      .then(() => config.database.collectionExists('_Join:aRelation:HasPointersAndRelations'))
      .then(exists => {
        if (exists) {
          fail('Relation collection should not exist after deleting relation field.');
        }
        done();
      }, error => {
        jfail(error);
        done();
      });
  });

  it('can delete relation field when related _Join collection not exist', done => {
    config.database.loadSchema()
      .then(schema => {
        schema.addClassIfNotExists('NewClass', {
          relationField: {type: 'Relation', targetClass: '_User'}
        })
          .then(actualSchema => {
            const expectedSchema = {
              className: 'NewClass',
              fields: {
                objectId: { type: 'String' },
                updatedAt: { type: 'Date' },
                createdAt: { type: 'Date' },
                ACL: { type: 'ACL' },
                relationField: { type: 'Relation', targetClass: '_User' },
              },
              classLevelPermissions: {
                find: { '*': true },
                get: { '*': true },
                create: { '*': true },
                update: { '*': true },
                delete: { '*': true },
                addField: { '*': true },
              },
            };
            expect(dd(actualSchema, expectedSchema)).toEqual(undefined);
          })
          .then(() => config.database.collectionExists('_Join:relationField:NewClass'))
          .then(exist => {
            on_db('postgres', () => {
              // We create the table when creating the column
              expect(exist).toEqual(true);
            }, () => {
              expect(exist).toEqual(false);
            });

          })
          .then(() => schema.deleteField('relationField', 'NewClass', config.database))
          .then(() => schema.reloadData())
          .then(() => {
            const expectedSchema = {
              objectId: { type: 'String' },
              updatedAt: { type: 'Date' },
              createdAt: { type: 'Date' },
              ACL: { type: 'ACL' },
            };
            expect(dd(schema.data.NewClass, expectedSchema)).toEqual(undefined);
            done();
          });
      });
  });

  it('can delete string fields and resave as number field', done => {
    Parse.Object.disableSingleInstance();
    var obj1 = hasAllPODobject();
    var obj2 = hasAllPODobject();
    Parse.Object.saveAll([obj1, obj2])
      .then(() => config.database.loadSchema())
      .then(schema => schema.deleteField('aString', 'HasAllPOD', config.database))
      .then(() => new Parse.Query('HasAllPOD').get(obj1.id))
      .then(obj1Reloaded => {
        expect(obj1Reloaded.get('aString')).toEqual(undefined);
        obj1Reloaded.set('aString', ['not a string', 'this time']);
        obj1Reloaded.save()
          .then(obj1reloadedAgain => {
            expect(obj1reloadedAgain.get('aString')).toEqual(['not a string', 'this time']);
            return new Parse.Query('HasAllPOD').get(obj2.id);
          })
          .then(obj2reloaded => {
            expect(obj2reloaded.get('aString')).toEqual(undefined);
            done();
            Parse.Object.enableSingleInstance();
          });
      })
      .catch(error => {
        jfail(error);
        done();
      });
  });

  it('can delete pointer fields and resave as string', done => {
    Parse.Object.disableSingleInstance();
    var obj1 = new Parse.Object('NewClass');
    obj1.save()
      .then(() => {
        obj1.set('aPointer', obj1);
        return obj1.save();
      })
      .then(obj1 => {
        expect(obj1.get('aPointer').id).toEqual(obj1.id);
      })
      .then(() => config.database.loadSchema())
      .then(schema => schema.deleteField('aPointer', 'NewClass', config.database))
      .then(() => new Parse.Query('NewClass').get(obj1.id))
      .then(obj1 => {
        expect(obj1.get('aPointer')).toEqual(undefined);
        obj1.set('aPointer', 'Now a string');
        return obj1.save();
      })
      .then(obj1 => {
        expect(obj1.get('aPointer')).toEqual('Now a string');
        done();
        Parse.Object.enableSingleInstance();
      });
  });

  it('can merge schemas', done => {
    expect(SchemaController.buildMergedSchemaObject({
      _id: 'SomeClass',
      someType: { type: 'Number' }
    }, {
      newType: {type: 'Number'}
    })).toEqual({
      someType: {type: 'Number'},
      newType: {type: 'Number'},
    });
    done();
  });

  it('can merge deletions', done => {
    expect(SchemaController.buildMergedSchemaObject({
      _id: 'SomeClass',
      someType: { type: 'Number' },
      outDatedType: { type: 'String' },
    },{
      newType: {type: 'GeoPoint'},
      outDatedType: {__op: 'Delete'},
    })).toEqual({
      someType: {type: 'Number'},
      newType: {type: 'GeoPoint'},
    });
    done();
  });

  it('ignore default field when merge with system class', done => {
    expect(SchemaController.buildMergedSchemaObject({
      _id: '_User',
      username: { type: 'String' },
      password: { type: 'String' },
      email: { type: 'String' },
      emailVerified: { type: 'Boolean' },
    },{
      emailVerified: { type: 'String' },
      customField: { type: 'String' },
    })).toEqual({
      customField: { type: 'String' }
    });
    done();
  });

  it('yields a proper schema mismatch error (#2661)', done => {
    const anObject = new Parse.Object('AnObject');
    const anotherObject = new Parse.Object('AnotherObject');
    const someObject = new Parse.Object('SomeObject');
    Parse.Object.saveAll([anObject, anotherObject, someObject]).then(() => {
      anObject.set('pointer', anotherObject);
      return anObject.save();
    }).then(() => {
      anObject.set('pointer', someObject);
      return anObject.save();
    }).then(() => {
      fail('shoud not save correctly');
      done();
    }, (err) => {
      expect(err instanceof Parse.Error).toBeTruthy();
      expect(err.message).toEqual('schema mismatch for AnObject.pointer; expected Pointer<AnotherObject> but got Pointer<SomeObject>')
      done();
    });
  });

  it('yields a proper schema mismatch error bis (#2661)', done => {
    const anObject = new Parse.Object('AnObject');
    const someObject = new Parse.Object('SomeObject');
    Parse.Object.saveAll([anObject, someObject]).then(() => {
      anObject.set('number', 1);
      return anObject.save();
    }).then(() => {
      anObject.set('number', someObject);
      return anObject.save();
    }).then(() => {
      fail('shoud not save correctly');
      done();
    }, (err) => {
      expect(err instanceof Parse.Error).toBeTruthy();
      expect(err.message).toEqual('schema mismatch for AnObject.number; expected Number but got Pointer<SomeObject>')
      done();
    });
  });

  it('yields a proper schema mismatch error ter (#2661)', done => {
    const anObject = new Parse.Object('AnObject');
    const someObject = new Parse.Object('SomeObject');
    Parse.Object.saveAll([anObject, someObject]).then(() => {
      anObject.set('pointer', someObject);
      return anObject.save();
    }).then(() => {
      anObject.set('pointer', 1);
      return anObject.save();
    }).then(() => {
      fail('shoud not save correctly');
      done();
    }, (err) => {
      expect(err instanceof Parse.Error).toBeTruthy();
      expect(err.message).toEqual('schema mismatch for AnObject.pointer; expected Pointer<SomeObject> but got Number')
      done();
    });
  });

  it('properly handles volatile _Schemas', done => {
    function validateSchemaStructure(schema) {
      expect(schema.hasOwnProperty('className')).toBe(true);
      expect(schema.hasOwnProperty('fields')).toBe(true);
      expect(schema.hasOwnProperty('classLevelPermissions')).toBe(true);
    }
    function validateSchemaDataStructure(schemaData) {
      Object.keys(schemaData).forEach(className => {
        const schema = schemaData[className];
        // Hooks has className...
        if (className != '_Hooks') {
          expect(schema.hasOwnProperty('className')).toBe(false);
        }
        expect(schema.hasOwnProperty('fields')).toBe(false);
        expect(schema.hasOwnProperty('classLevelPermissions')).toBe(false);
      });
    }
    let schema;
    config.database.loadSchema().then(s => {
      schema = s;
      return schema.getOneSchema('_User', false);
    }).then(userSchema => {
      validateSchemaStructure(userSchema);
      validateSchemaDataStructure(schema.data);
      return schema.getOneSchema('_PushStatus', true);
    }).then(pushStatusSchema => {
      validateSchemaStructure(pushStatusSchema);
      validateSchemaDataStructure(schema.data);
      done();
    });
  });
});

describe('Class Level Permissions for requiredAuth', () => {

  beforeEach(() => {
    config = new Config('test');
  });

  function createUser() {
    const user =  new Parse.User();
    user.set("username", "hello");
    user.set("password", "world");
    return user.signUp(null);
  }

  it('required auth test find', (done) => {
    config.database.loadSchema().then((schema) => {
      // Just to create a valid class
      return schema.validateObject('Stuff', {foo: 'bar'});
    }).then((schema) => {
      return schema.setPermissions('Stuff', {
        'find': {
          'requiresAuthentication': true
        }
      });
    }).then(() => {
      var query = new Parse.Query('Stuff');
      return query.find();
    }).then(() => {
      fail('Class permissions should have rejected this query.');
      done();
    }, (e) => {
      expect(e.message).toEqual('Permission denied, user needs to be authenticated.');
      done();
    });
  });

  it('required auth test find authenticated', (done) => {
    config.database.loadSchema().then((schema) => {
      // Just to create a valid class
      return schema.validateObject('Stuff', {foo: 'bar'});
    }).then((schema) => {
      return schema.setPermissions('Stuff', {
        'find': {
          'requiresAuthentication': true
        }
      });
    }).then(() => {
      return createUser();
    }).then(() => {
      var query = new Parse.Query('Stuff');
      return query.find();
    }).then((results) => {
      expect(results.length).toEqual(0);
      done();
    }, (e) => {
      console.error(e);
      fail("Should not have failed");
      done();
    });
  });

  it('required auth should allow create authenticated', (done) => {
    config.database.loadSchema().then((schema) => {
      // Just to create a valid class
      return schema.validateObject('Stuff', {foo: 'bar'});
    }).then((schema) => {
      return schema.setPermissions('Stuff', {
        'create': {
          'requiresAuthentication': true
        }
      });
    }).then(() => {
      return createUser();
    }).then(() => {
      const stuff = new Parse.Object('Stuff');
      stuff.set('foo', 'bar');
      return stuff.save();
    }).then(() => {
      done();
    }, (e) => {
      console.error(e);
      fail("Should not have failed");
      done();
    });
  });

  it('required auth should reject create when not authenticated', (done) => {
    config.database.loadSchema().then((schema) => {
      // Just to create a valid class
      return schema.validateObject('Stuff', {foo: 'bar'});
    }).then((schema) => {
      return schema.setPermissions('Stuff', {
        'create': {
          'requiresAuthentication': true
        }
      });
    }).then(() => {
      const stuff = new Parse.Object('Stuff');
      stuff.set('foo', 'bar');
      return stuff.save();
    }).then(() => {
      fail('Class permissions should have rejected this query.');
      done();
    }, (e) => {
      expect(e.message).toEqual('Permission denied, user needs to be authenticated.');
      done();
    });
  });

  it('required auth test create/get/update/delete authenticated', (done) => {
    config.database.loadSchema().then((schema) => {
      // Just to create a valid class
      return schema.validateObject('Stuff', {foo: 'bar'});
    }).then((schema) => {
      return schema.setPermissions('Stuff', {
        'create': {
          'requiresAuthentication': true
        },
        'get': {
          'requiresAuthentication': true
        },
        'delete': {
          'requiresAuthentication': true
        },
        'update': {
          'requiresAuthentication': true
        }
      });
    }).then(() => {
      return createUser();
    }).then(() => {
      const stuff = new Parse.Object('Stuff');
      stuff.set('foo', 'bar');
      return stuff.save().then(() => {
        const query = new Parse.Query('Stuff');
        return query.get(stuff.id);
      });
    }).then((gotStuff) => {
      return gotStuff.save({'foo': 'baz'}).then(() => {
        return gotStuff.destroy();
      })
    }).then(() => {
      done();
    }, (e) => {
      console.error(e);
      fail("Should not have failed");
      done();
    });
  });

  it('required auth test create/get/update/delete not authenitcated', (done) => {
    config.database.loadSchema().then((schema) => {
      // Just to create a valid class
      return schema.validateObject('Stuff', {foo: 'bar'});
    }).then((schema) => {
      return schema.setPermissions('Stuff', {
        'get': {
          'requiresAuthentication': true
        },
        'delete': {
          'requiresAuthentication': true
        },
        'update': {
          'requiresAuthentication': true
        },
        'create': {
          '*': true
        }
      });
    }).then(() => {
      const stuff = new Parse.Object('Stuff');
      stuff.set('foo', 'bar');
      return stuff.save().then(() => {
        const query = new Parse.Query('Stuff');
        return query.get(stuff.id);
      });
    }).then(() => {
      fail("Should not succeed!");
      done();
    }, (e) => {
      expect(e.message).toEqual('Permission denied, user needs to be authenticated.');
      done();
    });
  });

  it('required auth test create/get/update/delete not authenitcated', (done) => {
    config.database.loadSchema().then((schema) => {
      // Just to create a valid class
      return schema.validateObject('Stuff', {foo: 'bar'});
    }).then((schema) => {
      return schema.setPermissions('Stuff', {
        'find': {
          'requiresAuthentication': true
        },
        'delete': {
          'requiresAuthentication': true
        },
        'update': {
          'requiresAuthentication': true
        },
        'create': {
          '*': true
        },
        'get': {
          '*': true
        }
      });
    }).then(() => {
      const stuff = new Parse.Object('Stuff');
      stuff.set('foo', 'bar');
      return stuff.save().then(() => {
        const query = new Parse.Query('Stuff');
        return query.get(stuff.id);
      })
    }).then((result) => {
      expect(result.get('foo')).toEqual('bar');
      const query = new Parse.Query('Stuff');
      return query.find();
    }).then(() => {
      fail("Should not succeed!");
      done();
    }, (e) => {
      expect(e.message).toEqual('Permission denied, user needs to be authenticated.');
      done();
    });
  });

  it('required auth test create/get/update/delete with roles (#3753)', (done) => {
    let user;
    config.database.loadSchema().then((schema) => {
      // Just to create a valid class
      return schema.validateObject('Stuff', {foo: 'bar'});
    }).then((schema) => {
      return schema.setPermissions('Stuff', {
        'find': {
          'requiresAuthentication': true,
          'role:admin': true
        },
        'create': { 'role:admin': true },
        'update': { 'role:admin': true },
        'delete': { 'role:admin': true },
        'get': {
          'requiresAuthentication': true,
          'role:admin': true
        }
      });
    }).then(() => {
      const stuff = new Parse.Object('Stuff');
      stuff.set('foo', 'bar');
      return stuff.save(null, {useMasterKey: true}).then(() => {
        const query = new Parse.Query('Stuff');
        return query.get(stuff.id).then(() => {
          done.fail('should not succeed');
        }, () => {
          return new Parse.Query('Stuff').find();
        }).then(() => {
          done.fail('should not succeed');
        }, () => {
          return Promise.resolve();
        });
      }).then(() => {
        return Parse.User.signUp('user', 'password').then((signedUpUser) => {
          user = signedUpUser;
          const query = new Parse.Query('Stuff');
          return query.get(stuff.id, {sessionToken: user.getSessionToken()});
        });
      });
    }).then((result) => {
      expect(result.get('foo')).toEqual('bar');
      const query = new Parse.Query('Stuff');
      return query.find({sessionToken: user.getSessionToken()});
    }).then((results) => {
      expect(results.length).toBe(1);
      done();
    }, (e) => {
      console.error(e);
      done.fail(e);
    });
  });
})
