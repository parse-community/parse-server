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
}

var expectedResponseForHasAllPOD = {
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
  },
};

var expectedResponseforHasPointersAndRelations = {
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

describe('schemas', () => {
  it('requires the master key to get all schemas', (done) => {
    request.get({
      url: 'http://localhost:8378/1/schemas',
      json: true,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      },
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(401);
      expect(body.error).toEqual('unauthorized');
      done();
    });
  });

  it('requires the master key to get one schema', (done) => {
    request.get({
      url: 'http://localhost:8378/1/schemas/SomeSchema',
      json: true,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      },
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(401);
      expect(body.error).toEqual('unauthorized');
      done();
    });
  });

  it('responds with empty list when there are no schemas', done => {
    request.get({
      url: 'http://localhost:8378/1/schemas',
      json: true,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
      },
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
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Master-Key': 'test',
        },
      }, (error, response, body) => {
        var expected = {
          results: [expectedResponseForHasAllPOD,expectedResponseforHasPointersAndRelations]
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
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Master-Key': 'test',
        },
      }, (error, response, body) => {
        expect(body).toEqual(expectedResponseForHasAllPOD);
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
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Master-Key': 'test',
        },
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
});
