// These tests check that the Schema operates correctly.
var Config = require('../Config');
var Schema = require('../Schema');

var config = new Config('test');

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
        createdAt: 'string'
      })
      done();
    });
  });

  it('will fail to create a class if that class was already created by an object', done => {
    config.database.loadSchema()
    .then(schema => {
      schema.validateObject('NewClass', {foo: 7})
      .then(() => {
        schema.addClassIfNotExists('NewClass', {
          foo: {type: 'String'}
        }).catch(error => {
          expect(error.code).toEqual(Parse.Error.INVALID_CLASS_NAME)
          expect(error.error).toEqual('class NewClass already exists');
          done();
        });
      });
    })
  });

  it('will resolve class creation races appropriately', done => {
    // If two callers race to create the same schema, the response to the
    // loser should be the same as if they hadn't been racing. Furthermore,
    // The caller that wins the race should resolve it's promise before the
    // caller that loses the race.
    config.database.loadSchema()
    .then(schema => {
      var p1 = schema.addClassIfNotExists('NewClass', {foo: {type: 'String'}});
      var p2 = schema.addClassIfNotExists('NewClass', {foo: {type: 'String'}});
      var raceWinnerHasSucceeded = false;
      var raceLoserHasFailed = false;
      Promise.race([p1, p2]) //Use race because we expect the first completed promise to be the successful one
      .then(response => {
        raceWinnerHasSucceeded = true;
        expect(raceLoserHasFailed).toEqual(false);
        expect(response).toEqual({
          _id: 'NewClass',
          objectId: 'string',
          updatedAt: 'string',
          createdAt: 'string'
        });
      });
      Promise.all([p1,p2])
      .catch(error => {
        expect(raceWinnerHasSucceeded).toEqual(true);
        expect(error.code).toEqual(Parse.Error.INVALID_CLASS_NAME);
        expect(error.error).toEqual('class NewClass already exists');
        done();
        raceLoserHasFailed = true;
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

  it('refuses to explicitly create the default fields', done => {
    config.database.loadSchema()
    .then(schema => schema.addClassIfNotExists('_Installation', {localeIdentifier: {type: 'String'}}))
    .catch(error => {
      expect(error.code).toEqual(136);
      expect(error.error).toEqual('field localeIdentifier cannot be added');
      done();
    });
  });
});
