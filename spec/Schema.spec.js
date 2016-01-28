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
});
