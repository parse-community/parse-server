var request = require('request');
var dd = require('deep-diff');

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
      var obj1 = new Parse.Object('HasAllPOD');
      obj1.set('aNumber', 5);
      obj1.set('aString', 'string');
      obj1.set('aBool', true);
      obj1.set('aDate', new Date());
      obj1.set('aObject', {k1: 'value', k2: true, k3: 5});
      obj1.set('aArray', ['contents', true, 5]);
      obj1.set('aGeoPoint', new Parse.GeoPoint({latitude: 0, longitude: 0}));
      obj1.set('aFile', new Parse.File('f.txt', { base64: 'V29ya2luZyBhdCBQYXJzZSBpcyBncmVhdCE=' }));
      var obj1ACL = new Parse.ACL();
      obj1ACL.setPublicWriteAccess(false);
      obj1.setACL(obj1ACL);

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
            results: [
              {
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
              },
              {
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
            ]
          };
          expect(body).toEqual(expected);
          done();
        })
      });
  });
});
