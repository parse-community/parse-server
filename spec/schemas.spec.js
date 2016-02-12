var Parse = require('parse/node').Parse;
var request = require('request');
var dd = require('deep-diff');

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

var plainOldDataSchema = {
  className: 'HasAllPOD',
  fields: {
    //Default fields
    ACL: {type: 'ACL'},
    createdAt: {type: 'Date'},
    updatedAt: {type: 'Date'},
    objectId: {type: 'String'},
    //Custom fields
    aNumber: {type: 'Number'},
    aString: {type: 'String'},
    aBool: {type: 'Boolean'},
    aDate: {type: 'Date'},
    aObject: {type: 'Object'},
    aArray: {type: 'Array'},
    aGeoPoint: {type: 'GeoPoint'},
    aFile: {type: 'File'}
  }
};

var pointersAndRelationsSchema = {
  className: 'HasPointersAndRelations',
  fields: {
    //Default fields
    ACL: {type: 'ACL'},
    createdAt: {type: 'Date'},
    updatedAt: {type: 'Date'},
    objectId: {type: 'String'},
    //Custom fields
    aPointer: {
      type: 'Pointer',
      targetClass: 'HasAllPOD',
    },
    aRelation: {
      type: 'Relation',
      targetClass: 'HasAllPOD',
    },
  },
}

var noAuthHeaders = {
  'X-Parse-Application-Id': 'test',
};

var restKeyHeaders = {
  'X-Parse-Application-Id': 'test',
  'X-Parse-REST-API-Key': 'rest',
};

var masterKeyHeaders = {
  'X-Parse-Application-Id': 'test',
  'X-Parse-Master-Key': 'test',
};

describe('schemas', () => {
  it('requires the master key to get all schemas', (done) => {
    request.get({
      url: 'http://localhost:8378/1/schemas',
      json: true,
      headers: noAuthHeaders,
    }, (error, response, body) => {
      //api.parse.com uses status code 401, but due to the lack of keys
      //being necessary in parse-server, 403 makes more sense
      expect(response.statusCode).toEqual(403);
      expect(body.error).toEqual('unauthorized');
      done();
    });
  });

  it('requires the master key to get one schema', (done) => {
    request.get({
      url: 'http://localhost:8378/1/schemas/SomeSchema',
      json: true,
      headers: restKeyHeaders,
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(401);
      expect(body.error).toEqual('unauthorized');
      done();
    });
  });

  it('asks for the master key if you use the rest key', (done) => {
    request.get({
      url: 'http://localhost:8378/1/schemas',
      json: true,
      headers: restKeyHeaders,
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(401);
      expect(body.error).toEqual('master key not specified');
      done();
    });
  });

  it('responds with empty list when there are no schemas', done => {
    request.get({
      url: 'http://localhost:8378/1/schemas',
      json: true,
      headers: masterKeyHeaders,
    }, (error, response, body) => {
      expect(body.results).toEqual([]);
      done();
    });
  });

  it('responds with a list of schemas after creating objects', done => {
    var obj1 = hasAllPODobject();
    obj1.save().then(savedObj1 => {
      var obj2 = new Parse.Object('HasPointersAndRelations');
      obj2.set('aPointer', savedObj1);
      var relation = obj2.relation('aRelation');
      relation.add(obj1);
      return obj2.save();
    }).then(() => {
      request.get({
        url: 'http://localhost:8378/1/schemas',
        json: true,
        headers: masterKeyHeaders,
      }, (error, response, body) => {
        var expected = {
          results: [plainOldDataSchema,pointersAndRelationsSchema]
        };
        expect(body).toEqual(expected);
        done();
      })
    });
  });

  it('responds with a single schema', done => {
    var obj = hasAllPODobject();
    obj.save().then(() => {
      request.get({
        url: 'http://localhost:8378/1/schemas/HasAllPOD',
        json: true,
        headers: masterKeyHeaders,
      }, (error, response, body) => {
        expect(body).toEqual(plainOldDataSchema);
        done();
      });
    });
  });

  it('treats class names case sensitively', done => {
    var obj = hasAllPODobject();
    obj.save().then(() => {
      request.get({
        url: 'http://localhost:8378/1/schemas/HASALLPOD',
        json: true,
        headers: masterKeyHeaders,
      }, (error, response, body) => {
        expect(response.statusCode).toEqual(400);
        expect(body).toEqual({
          code: 103,
          error: 'class HASALLPOD does not exist',
        });
        done();
      });
    });
  });

  it('requires the master key to create a schema', done => {
    request.post({
      url: 'http://localhost:8378/1/schemas',
      json: true,
      headers: noAuthHeaders,
      body: {
        className: 'MyClass',
      }
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(403);
      expect(body.error).toEqual('unauthorized');
      done();
    });
  });

  it('asks for the master key if you use the rest key', done => {
    request.post({
      url: 'http://localhost:8378/1/schemas',
      json: true,
      headers: restKeyHeaders,
      body: {
        className: 'MyClass',
      },
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(401);
      expect(body.error).toEqual('master key not specified');
      done();
    });
  });

  it('sends an error if you use mismatching class names', done => {
    request.post({
      url: 'http://localhost:8378/1/schemas/A',
      headers: masterKeyHeaders,
      json: true,
      body: {
        className: 'B',
      }
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(400);
      expect(body).toEqual({
        code: Parse.Error.INVALID_CLASS_NAME,
        error: 'class name mismatch between B and A',
      });
      done();
    });
  });

  it('sends an error if you use no class name', done => {
    request.post({
      url: 'http://localhost:8378/1/schemas',
      headers: masterKeyHeaders,
      json: true,
      body: {},
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(400);
      expect(body).toEqual({
        code: 135,
        error: 'POST /schemas needs class name',
      });
      done();
    })
  });

  it('sends an error if you try to create the same class twice', done => {
    request.post({
      url: 'http://localhost:8378/1/schemas',
      headers: masterKeyHeaders,
      json: true,
      body: {
        className: 'A',
      },
    }, (error, response, body) => {
      expect(error).toEqual(null);
      request.post({
        url: 'http://localhost:8378/1/schemas',
        headers: masterKeyHeaders,
        json: true,
        body: {
          className: 'A',
        }
      }, (error, response, body) => {
        expect(response.statusCode).toEqual(400);
        expect(body).toEqual({
          code: Parse.Error.INVALID_CLASS_NAME,
          error: 'class A already exists',
        });
        done();
      });
    });
  });

  it('responds with all fields when you create a class', done => {
    request.post({
      url: 'http://localhost:8378/1/schemas',
      headers: masterKeyHeaders,
      json: true,
      body: {
        className: "NewClass",
        fields: {
          foo: {type: 'Number'},
          ptr: {type: 'Pointer', targetClass: 'SomeClass'}
        }
      }
    }, (error, response, body) => {
      expect(body).toEqual({
        className: 'NewClass',
        fields: {
          ACL: {type: 'ACL'},
          createdAt: {type: 'Date'},
          updatedAt: {type: 'Date'},
          objectId: {type: 'String'},
          foo: {type: 'Number'},
          ptr: {type: 'Pointer', targetClass: 'SomeClass'},
        }
      });
      done();
    });
  });

  it('lets you specify class name in both places', done => {
    request.post({
      url: 'http://localhost:8378/1/schemas/NewClass',
      headers: masterKeyHeaders,
      json: true,
      body: {
        className: "NewClass",
      }
    }, (error, response, body) => {
      expect(body).toEqual({
        className: 'NewClass',
        fields: {
          ACL: {type: 'ACL'},
          createdAt: {type: 'Date'},
          updatedAt: {type: 'Date'},
          objectId: {type: 'String'},
        }
      });
      done();
    });
  });
});
