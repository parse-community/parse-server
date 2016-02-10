var Config = require('../src/Config');
var Schema = require('../src/Schema');
var dd = require('deep-diff');

var config = new Config('test');

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
  var objACL = new Parse.ACL();
  objACL.setPublicWriteAccess(false);
  obj.setACL(objACL);
  return obj;
};

describe('Schema', () => {
  it('can validate one object', (done) => {
    config.database.loadSchema().then((schema) => {
      return schema.validateObject('TestObject', {a: 1, b: 'yo', c: false});
    }).then((schema) => {
      done();
    }, (error) => {
      fail(error);
      done();
    });
  });

  it('can validate two objects in a row', (done) => {
    config.database.loadSchema().then((schema) => {
      return schema.validateObject('Foo', {x: true, y: 'yyy', z: 0});
    }).then((schema) => {
      return schema.validateObject('Foo', {x: false, y: 'YY', z: 1});
    }).then((schema) => {
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
    }).then((schema) => {
      var query = new Parse.Query('Stuff');
      return query.find();
    }).then((results) => {
      fail('Class permissions should have rejected this query.');
      done();
    }, (e) => {
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
    }).then((schema) => {
      var query = new Parse.Query('Stuff');
      return query.find();
    }).then((results) => {
      done();
    }, (e) => {
      fail('Class permissions should have allowed this query.');
      done();
    });
  });

  it('class-level permissions test get', (done) => {
    var user;
    var obj;
    createTestUser().then((u) => {
      user = u;
      return config.database.loadSchema();
    }).then((schema) => {
      // Just to create a valid class
      return schema.validateObject('Stuff', {foo: 'bar'});
    }).then((schema) => {
      var find = {};
      var get = {};
      get[user.id] = true;
      return schema.setPermissions('Stuff', {
        'find': find,
        'get': get
      });
    }).then((schema) => {
      obj = new Parse.Object('Stuff');
      obj.set('foo', 'bar');
      return obj.save();
    }).then((o) => {
      obj = o;
      var query = new Parse.Query('Stuff');
      return query.find();
    }).then((results) => {
      fail('Class permissions should have rejected this query.');
      done();
    }, (e) => {
      var query = new Parse.Query('Stuff');
      return query.get(obj.id).then((o) => {
        done();
      }, (e) => {
        fail('Class permissions should have allowed this get query');
      });
    });
  });

  it('can add classes without needing an object', done => {
    config.database.loadSchema()
    .then(schema => schema.addClassIfNotExists('NewClass', {
      foo: {type: 'String'}
    }))
    .then(result => {
      expect(result).toEqual({
        _id: 'NewClass',
        objectId: 'string',
        updatedAt: 'string',
        createdAt: 'string',
        foo: 'string',
      })
      done();
    });
  });

  it('will fail to create a class if that class was already created by an object', done => {
    config.database.loadSchema()
    .then(schema => {
      schema.validateObject('NewClass', {foo: 7})
      .then(() => {
        schema.reload()
        .then(schema => schema.addClassIfNotExists('NewClass', {
          foo: {type: 'String'}
        }))
        .catch(error => {
          expect(error.code).toEqual(Parse.Error.INVALID_CLASS_NAME)
          expect(error.error).toEqual('class NewClass already exists');
          done();
        });
      });
    })
  });

  it('will resolve class creation races appropriately', done => {
    // If two callers race to create the same schema, the response to the
    // race loser should be the same as if they hadn't been racing.
    config.database.loadSchema()
    .then(schema => {
      var p1 = schema.addClassIfNotExists('NewClass', {foo: {type: 'String'}});
      var p2 = schema.addClassIfNotExists('NewClass', {foo: {type: 'String'}});
      Promise.race([p1, p2]) //Use race because we expect the first completed promise to be the successful one
      .then(response => {
        expect(response).toEqual({
          _id: 'NewClass',
          objectId: 'string',
          updatedAt: 'string',
          createdAt: 'string',
          foo: 'string',
        });
      });
      Promise.all([p1,p2])
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.INVALID_CLASS_NAME);
        expect(error.error).toEqual('class NewClass already exists');
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
    }))
    .then(mongoObj => {
      expect(mongoObj).toEqual({
        _id: 'NewClass',
        objectId: 'string',
        createdAt: 'string',
        updatedAt: 'string',
        aNumber: 'number',
        aString: 'string',
        aBool: 'boolean',
        aDate: 'date',
        aObject: 'object',
        aArray: 'array',
        aGeoPoint: 'geopoint',
        aFile: 'file',
        aPointer: '*ThisClassDoesNotExistYet',
        aRelation: 'relation<NewClass>',
      });
      done();
    });
  });

  it('creates the default fields for non-custom classes', done => {
    config.database.loadSchema()
    .then(schema => schema.addClassIfNotExists('_Installation', {
      foo: {type: 'Number'},
    }))
    .then(mongoObj => {
      expect(mongoObj).toEqual({
        _id: '_Installation',
        createdAt: 'string',
        updatedAt: 'string',
        objectId: 'string',
        foo: 'number',
        installationId: 'string',
        deviceToken: 'string',
        channels: 'array',
        deviceType: 'string',
        pushType: 'string',
        GCMSenderId: 'string',
        timeZone: 'string',
        localeIdentifier: 'string',
        badge: 'number',
      });
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
        fail(error);
      });
    })
    .catch(error => fail('Couldn\'t load schema'));
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
      expect(error.error).toEqual('field installationId cannot be changed');
      done();
    });
  });

  it('refuses to delete fields from nonexistant classes', done => {
    config.database.loadSchema()
    .then(schema => schema.deleteField('field', 'NoClass'))
    .catch(error => {
      expect(error.code).toEqual(Parse.Error.INVALID_CLASS_NAME);
      expect(error.error).toEqual('class NoClass does not exist');
      done();
    });
  });

  it('refuses to delete fields that dont exist', done => {
    hasAllPODobject().save()
    .then(() => config.database.loadSchema())
    .then(schema => schema.deleteField('missingField', 'HasAllPOD'))
    .fail(error => {
      expect(error.code).toEqual(255);
      expect(error.error).toEqual('field missingField does not exist, cannot delete');
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
    .then(() => {
      config.database.db.collection('test__Join:aRelation:HasPointersAndRelations', { strict: true }, (err, coll) => {
        expect(err).toEqual(null);
        config.database.loadSchema()
        .then(schema => schema.deleteField('aRelation', 'HasPointersAndRelations', config.database.db, 'test_'))
        .then(() => config.database.db.collection('test__Join:aRelation:HasPointersAndRelations', { strict: true }, (err, coll) => {
          expect(err).not.toEqual(null);
          done();
        }))
      });
    })
  });

  it('can delete string fields and resave as number field', done => {
    var obj1 = hasAllPODobject();
    var obj2 = hasAllPODobject();
    var p = Parse.Object.saveAll([obj1, obj2])
    .then(() => config.database.loadSchema())
    .then(schema => schema.deleteField('aString', 'HasAllPOD', config.database.db, 'test_'))
    .then(() => new Parse.Query('HasAllPOD').get(obj1.id))
    .then(obj1 => {
      expect(obj1.get('aString')).toEqual(undefined);
      obj1.set('aString', ['not a string', 'this time']);
      obj1.save()
      .then(obj1 => {
        expect(obj1.get('aString')).toEqual(['not a string', 'this time']);
        return new Parse.Query('HasAllPOD').get(obj2.id);
      })
      .then(obj2 => {
        expect(obj2.get('aString')).toEqual(undefined);
        done();
      });
    })
  });

  it('can delete pointer fields and resave as string', done => {
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
    .then(schema => schema.deleteField('aPointer', 'NewClass', config.database.db, 'test_'))
    .then(() => new Parse.Query('NewClass').get(obj1.id))
    .then(obj1 => {
      expect(obj1.get('aPointer')).toEqual(undefined);
      obj1.set('aPointer', 'Now a string');
      return obj1.save();
    })
    .then(obj1 => {
      expect(obj1.get('aPointer')).toEqual('Now a string');
      done();
    });
  });
});
