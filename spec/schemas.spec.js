'use strict';

var Parse = require('parse/node').Parse;
var request = require('request');
var dd = require('deep-diff');
var Config = require('../src/Config');

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
      expect(response.statusCode).toEqual(403);
      expect(body.error).toEqual('unauthorized: master key is required');
      done();
    });
  });

  it('asks for the master key if you use the rest key', (done) => {
    request.get({
      url: 'http://localhost:8378/1/schemas',
      json: true,
      headers: restKeyHeaders,
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(403);
      expect(body.error).toEqual('unauthorized: master key is required');
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
          error: 'Class HASALLPOD does not exist.',
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
      expect(response.statusCode).toEqual(403);
      expect(body.error).toEqual('unauthorized: master key is required');
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
        error: 'Class name mismatch between B and A.',
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
        error: 'POST /schemas needs a class name.',
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
          error: 'Class A already exists.'
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

  it('requires the master key to modify schemas', done => {
    request.post({
      url: 'http://localhost:8378/1/schemas/NewClass',
      headers: masterKeyHeaders,
      json: true,
      body: {},
    }, (error, response, body) => {
      request.put({
        url: 'http://localhost:8378/1/schemas/NewClass',
        headers: noAuthHeaders,
        json: true,
        body: {},
      }, (error, response, body) => {
        expect(response.statusCode).toEqual(403);
        expect(body.error).toEqual('unauthorized');
        done();
      });
    });
  });

  it('rejects class name mis-matches in put', done => {
    request.put({
      url: 'http://localhost:8378/1/schemas/NewClass',
      headers: masterKeyHeaders,
      json: true,
      body: {className: 'WrongClassName'}
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(400);
      expect(body.code).toEqual(Parse.Error.INVALID_CLASS_NAME);
      expect(body.error).toEqual('Class name mismatch between WrongClassName and NewClass.');
      done();
    });
  });

  it('refuses to add fields to non-existent classes', done => {
    request.put({
      url: 'http://localhost:8378/1/schemas/NoClass',
      headers: masterKeyHeaders,
      json: true,
      body: {
        fields: {
            newField: {type: 'String'}
        }
      }
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(400);
      expect(body.code).toEqual(Parse.Error.INVALID_CLASS_NAME);
      expect(body.error).toEqual('Class NoClass does not exist.');
      done();
    });
  });

  it('refuses to put to existing fields, even if it would not be a change', done => {
    var obj = hasAllPODobject();
    obj.save()
    .then(() => {
      request.put({
        url: 'http://localhost:8378/1/schemas/HasAllPOD',
        headers: masterKeyHeaders,
        json: true,
        body: {
          fields: {
            aString: {type: 'String'}
          }
        }
      }, (error, response, body) => {
        expect(response.statusCode).toEqual(400);
        expect(body.code).toEqual(255);
        expect(body.error).toEqual('Field aString exists, cannot update.');
        done();
      });
    })
  });

  it('refuses to delete non-existent fields', done => {
    var obj = hasAllPODobject();
    obj.save()
    .then(() => {
      request.put({
        url: 'http://localhost:8378/1/schemas/HasAllPOD',
        headers: masterKeyHeaders,
        json: true,
        body: {
          fields: {
            nonExistentKey: {__op: "Delete"},
          }
        }
      }, (error, response, body) => {
        expect(response.statusCode).toEqual(400);
        expect(body.code).toEqual(255);
        expect(body.error).toEqual('Field nonExistentKey does not exist, cannot delete.');
        done();
      });
    });
  });

  it('refuses to add a geopoint to a class that already has one', done => {
    var obj = hasAllPODobject();
    obj.save()
    .then(() => {
      request.put({
        url: 'http://localhost:8378/1/schemas/HasAllPOD',
        headers: masterKeyHeaders,
        json: true,
        body: {
          fields: {
            newGeo: {type: 'GeoPoint'}
          }
        }
      }, (error, response, body) => {
        expect(response.statusCode).toEqual(400);
        expect(body.code).toEqual(Parse.Error.INCORRECT_TYPE);
        expect(body.error).toEqual('currently, only one GeoPoint field may exist in an object. Adding newGeo when aGeoPoint already exists.');
        done();
      });
    });
  });

  it('refuses to add two geopoints', done => {
    var obj = new Parse.Object('NewClass');
    obj.set('aString', 'aString');
    obj.save()
    .then(() => {
      request.put({
        url: 'http://localhost:8378/1/schemas/NewClass',
        headers: masterKeyHeaders,
        json: true,
        body: {
          fields: {
            newGeo1: {type: 'GeoPoint'},
            newGeo2: {type: 'GeoPoint'},
          }
        }
      }, (error, response, body) => {
        expect(response.statusCode).toEqual(400);
        expect(body.code).toEqual(Parse.Error.INCORRECT_TYPE);
        expect(body.error).toEqual('currently, only one GeoPoint field may exist in an object. Adding newGeo2 when newGeo1 already exists.');
        done();
      });
    });
  });

  it('allows you to delete and add a geopoint in the same request', done => {
    var obj = new Parse.Object('NewClass');
    obj.set('geo1', new Parse.GeoPoint({latitude: 0, longitude: 0}));
    obj.save()
    .then(() => {
      request.put({
        url: 'http://localhost:8378/1/schemas/NewClass',
        headers: masterKeyHeaders,
        json: true,
        body: {
          fields: {
            geo2: {type: 'GeoPoint'},
            geo1: {__op: 'Delete'}
          }
        }
      }, (error, response, body) => {
        expect(dd(body, {
          "className": "NewClass",
          "fields": {
            "ACL": {"type": "ACL"},
            "createdAt": {"type": "Date"},
            "objectId": {"type": "String"},
            "updatedAt": {"type": "Date"},
            "geo2": {"type": "GeoPoint"},
          }
        })).toEqual(undefined);
        done();
      });
    })
  });

  it('put with no modifications returns all fields', done => {
    var obj = hasAllPODobject();
    obj.save()
    .then(() => {
      request.put({
        url: 'http://localhost:8378/1/schemas/HasAllPOD',
        headers: masterKeyHeaders,
        json: true,
        body: {},
      }, (error, response, body) => {
        expect(body).toEqual(plainOldDataSchema);
        done();
      });
    })
  });

  it('lets you add fields', done => {
    request.post({
      url: 'http://localhost:8378/1/schemas/NewClass',
      headers: masterKeyHeaders,
      json: true,
      body: {},
    }, (error, response, body) => {
      request.put({
        url: 'http://localhost:8378/1/schemas/NewClass',
        headers: masterKeyHeaders,
        json: true,
        body: {
          fields: {
            newField: {type: 'String'}
          }
        }
      }, (error, response, body) => {
        expect(dd(body, {
          className: 'NewClass',
          fields: {
            "ACL": {"type": "ACL"},
            "createdAt": {"type": "Date"},
            "objectId": {"type": "String"},
            "updatedAt": {"type": "Date"},
            "newField": {"type": "String"},
          },
        })).toEqual(undefined);
        request.get({
          url: 'http://localhost:8378/1/schemas/NewClass',
          headers: masterKeyHeaders,
          json: true,
        }, (error, response, body) => {
          expect(body).toEqual({
            className: 'NewClass',
            fields: {
              ACL: {type: 'ACL'},
              createdAt: {type: 'Date'},
              updatedAt: {type: 'Date'},
              objectId: {type: 'String'},
              newField: {type: 'String'},
            }
          });
          done();
        });
      });
    })
  });

  it('lets you add fields to system schema', done => {
    request.post({
      url: 'http://localhost:8378/1/schemas/_User',
      headers: masterKeyHeaders,
      json: true
    }, (error, response, body) => {
      request.put({
        url: 'http://localhost:8378/1/schemas/_User',
        headers: masterKeyHeaders,
        json: true,
        body: {
          fields: {
            newField: {type: 'String'}
          }
        }
      }, (error, response, body) => {
        expect(body).toEqual({
          className: '_User',
          fields: {
            objectId: {type: 'String'},
            updatedAt: {type: 'Date'},
            createdAt: {type: 'Date'},
            username: {type: 'String'},
            password: {type: 'String'},
            authData: {type: 'Object'},
            email: {type: 'String'},
            emailVerified: {type: 'Boolean'},
            newField: {type: 'String'},
            ACL: {type: 'ACL'}
          }
        });
        request.get({
          url: 'http://localhost:8378/1/schemas/_User',
          headers: masterKeyHeaders,
          json: true
        }, (error, response, body) => {
          expect(body).toEqual({
            className: '_User',
            fields: {
              objectId: {type: 'String'},
              updatedAt: {type: 'Date'},
              createdAt: {type: 'Date'},
              username: {type: 'String'},
              password: {type: 'String'},
              authData: {type: 'Object'},
              email: {type: 'String'},
              emailVerified: {type: 'Boolean'},
              newField: {type: 'String'},
              ACL: {type: 'ACL'}
            }
          });
          done();
        });
      });
    })
  });

  it('lets you delete multiple fields and add fields', done => {
    var obj1 = hasAllPODobject();
    obj1.save()
    .then(() => {
      request.put({
        url: 'http://localhost:8378/1/schemas/HasAllPOD',
        headers: masterKeyHeaders,
        json: true,
        body: {
          fields: {
            aString: {__op: 'Delete'},
            aNumber: {__op: 'Delete'},
            aNewString: {type: 'String'},
            aNewNumber: {type: 'Number'},
            aNewRelation: {type: 'Relation', targetClass: 'HasAllPOD'},
            aNewPointer: {type: 'Pointer', targetClass: 'HasAllPOD'},
          }
        }
      }, (error, response, body) => {
        expect(body).toEqual({
          className: 'HasAllPOD',
          fields: {
            //Default fields
            ACL: {type: 'ACL'},
            createdAt: {type: 'Date'},
            updatedAt: {type: 'Date'},
            objectId: {type: 'String'},
            //Custom fields
            aBool: {type: 'Boolean'},
            aDate: {type: 'Date'},
            aObject: {type: 'Object'},
            aArray: {type: 'Array'},
            aGeoPoint: {type: 'GeoPoint'},
            aFile: {type: 'File'},
            aNewNumber: {type: 'Number'},
            aNewString: {type: 'String'},
            aNewPointer: {type: 'Pointer', targetClass: 'HasAllPOD'},
            aNewRelation: {type: 'Relation', targetClass: 'HasAllPOD'},
          }
        });
        var obj2 = new Parse.Object('HasAllPOD');
        obj2.set('aNewPointer', obj1);
        var relation = obj2.relation('aNewRelation');
        relation.add(obj1);
        obj2.save().then(done); //Just need to make sure saving works on the new object.
      });
    });
  });

  it('will not delete any fields if the additions are invalid', done => {
    var obj = hasAllPODobject();
    obj.save()
    .then(() => {
      request.put({
        url: 'http://localhost:8378/1/schemas/HasAllPOD',
        headers: masterKeyHeaders,
        json: true,
        body: {
          fields: {
            fakeNewField: {type: 'fake type'},
            aString: {__op: 'Delete'}
          }
        }
      }, (error, response, body) => {
        expect(body.code).toEqual(Parse.Error.INCORRECT_TYPE);
        expect(body.error).toEqual('invalid field type: fake type');
        request.get({
          url: 'http://localhost:8378/1/schemas/HasAllPOD',
          headers: masterKeyHeaders,
          json: true,
        }, (error, response, body) => {
          expect(response.body).toEqual(plainOldDataSchema);
          done();
        });
      });
    });
  });

  it('requires the master key to delete schemas', done => {
    request.del({
      url: 'http://localhost:8378/1/schemas/DoesntMatter',
      headers: noAuthHeaders,
      json: true,
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(403);
      expect(body.error).toEqual('unauthorized');
      done();
    });
  });

  it('refuses to delete non-empty collection', done => {
    var obj = hasAllPODobject();
    obj.save()
    .then(() => {
      request.del({
        url: 'http://localhost:8378/1/schemas/HasAllPOD',
        headers: masterKeyHeaders,
        json: true,
      }, (error, response, body) => {
        expect(response.statusCode).toEqual(400);
        expect(body.code).toEqual(255);
        expect(body.error).toMatch(/HasAllPOD/);
        expect(body.error).toMatch(/contains 1/);
        done();
      });
    });
  });

  it('fails when deleting collections with invalid class names', done => {
    request.del({
      url: 'http://localhost:8378/1/schemas/_GlobalConfig',
      headers: masterKeyHeaders,
      json: true,
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(400);
      expect(body.code).toEqual(Parse.Error.INVALID_CLASS_NAME);
      expect(body.error).toEqual('Invalid classname: _GlobalConfig, classnames can only have alphanumeric characters and _, and must start with an alpha character ');
      done();
    })
  });

  it('does not fail when deleting nonexistant collections', done => {
    request.del({
      url: 'http://localhost:8378/1/schemas/Missing',
      headers: masterKeyHeaders,
      json: true,
    }, (error, response, body) => {
      expect(response.statusCode).toEqual(200);
      expect(body).toEqual({});
      done();
    });
  });

  it('deletes collections including join tables', done => {
    var obj = new Parse.Object('MyClass');
    obj.set('data', 'data');
    obj.save()
    .then(() => {
      var obj2 = new Parse.Object('MyOtherClass');
      var relation = obj2.relation('aRelation');
      relation.add(obj);
      return obj2.save();
    })
    .then(obj2 => obj2.destroy())
    .then(() => {
      request.del({
        url: 'http://localhost:8378/1/schemas/MyOtherClass',
        headers: masterKeyHeaders,
        json: true,
      }, (error, response, body) => {
        expect(response.statusCode).toEqual(200);
        expect(response.body).toEqual({});
        config.database.collectionExists('_Join:aRelation:MyOtherClass').then(exists => {
          if (exists) {
            fail('Relation collection should be deleted.');
            done();
          }
          return config.database.collectionExists('MyOtherClass');
        }).then(exists => {
          if (exists) {
            fail('Class collection should be deleted.');
            done();
          }
        }).then(() => {
          request.get({
            url: 'http://localhost:8378/1/schemas/MyOtherClass',
            headers: masterKeyHeaders,
            json: true,
          }, (error, response, body) => {
            //Expect _SCHEMA entry to be gone.
            expect(response.statusCode).toEqual(400);
            expect(body.code).toEqual(Parse.Error.INVALID_CLASS_NAME);
            expect(body.error).toEqual('Class MyOtherClass does not exist.');
            done();
          });
        });
      });
    }).then(() => {
    }, error => {
      fail(error);
      done();
    });
  });

  it('deletes schema when actual collection does not exist', done => {
    request.post({
      url: 'http://localhost:8378/1/schemas/NewClassForDelete',
      headers: masterKeyHeaders,
      json: true,
      body: {
        className: 'NewClassForDelete'
      }
    }, (error, response, body) => {
      expect(error).toEqual(null);
      expect(response.body.className).toEqual('NewClassForDelete');
      request.del({
        url: 'http://localhost:8378/1/schemas/NewClassForDelete',
        headers: masterKeyHeaders,
        json: true,
      }, (error, response, body) => {
        expect(response.statusCode).toEqual(200);
        expect(response.body).toEqual({});
        config.database.loadSchema().then(schema => {
          schema.hasClass('NewClassForDelete').then(exist => {
            expect(exist).toEqual(false);
            done();
          });
        })
      });
    });
  });

  it('deletes schema when actual collection exists', done => {
    request.post({
      url: 'http://localhost:8378/1/schemas/NewClassForDelete',
      headers: masterKeyHeaders,
      json: true,
      body: {
        className: 'NewClassForDelete'
      }
    }, (error, response, body) => {
      expect(error).toEqual(null);
      expect(response.body.className).toEqual('NewClassForDelete');
      request.post({
        url: 'http://localhost:8378/1/classes/NewClassForDelete',
        headers: restKeyHeaders,
        json: true
      }, (error, response, body) => {
        expect(error).toEqual(null);
        expect(typeof response.body.objectId).toEqual('string');
        request.del({
          url: 'http://localhost:8378/1/classes/NewClassForDelete/' + response.body.objectId,
          headers: restKeyHeaders,
          json: true,
        }, (error, response, body) => {
          expect(error).toEqual(null);
          request.del({
            url: 'http://localhost:8378/1/schemas/NewClassForDelete',
            headers: masterKeyHeaders,
            json: true,
          }, (error, response, body) => {
            expect(response.statusCode).toEqual(200);
            expect(response.body).toEqual({});
            config.database.loadSchema().then(schema => {
              schema.hasClass('NewClassForDelete').then(exist => {
                expect(exist).toEqual(false);
                done();
              });
            });
          });
        });
      });
    });
  });

  it('should set/get schema permissions', done => {

    let object = new Parse.Object('AClass');
    object.save().then(() => {
      request.put({
        url: 'http://localhost:8378/1/schemas/AClass/permissions',
        headers: masterKeyHeaders,
        json: true,
        body: {
          find: {
            '*': true
          },
          create: {
            'role:admin': true
          }
        }
      }, (error, response, body) => {
        expect(error).toEqual(null);
        request.get({
          url: 'http://localhost:8378/1/schemas/AClass/permissions',
          headers: masterKeyHeaders,
          json: true,
        }, (error, response, body) => {
          expect(response.statusCode).toEqual(200);
          expect(response.body).toEqual({
            find: {
              '*': true
            },
            create: {
              'role:admin': true
            }
          });
          done();
        });
      });
    });
  });

  it('should fail setting schema permissions with invalid key', done => {

    let object = new Parse.Object('AClass');
    object.save().then(() => {
      request.put({
        url: 'http://localhost:8378/1/schemas/AClass/permissions',
        headers: masterKeyHeaders,
        json: true,
        body: {
          find: {
            '*': true
          },
          create: {
            'role:admin': true
          },
          dummy: {
            'some': true
          }
        }
      }, (error, response, body) => {
        expect(error).toEqual(null);
        expect(body.code).toEqual(107);
        expect(body.error).toEqual('dummy is not a valid operation for class level permissions');
        done();
      });
    });
  });
});
