const Parse = require("parse/node");
const request = require('request');

describe('Import routers', () => {
  it_exclude_dbs(['postgres'])('import objects from file with array', (done) => {
    const headers = {
      'Content-Type': 'multipart/form-data',
      'X-Parse-Application-Id': 'test',
      'X-Parse-Master-Key': 'test'
    };
    request.post(
      {
        headers: headers,
        url: 'http://localhost:8378/1/import_data/TestObject',
        formData: {
          importFile: {
            value: Buffer.from(JSON.stringify([
              { column1: 'row1Column1', column2: 'row1Column2' },
              { column1: 'row2Column1', column2: 'row2Column2' }
            ])),
            options: {
              filename: 'TestObject.json'
            }
          }
        }
      },
      (err) => {

        expect(err).toBe(null);

        const query = new Parse.Query('TestObject');
        query.ascending('column1');
        query.find().then((results) => {
          expect(results.length).toEqual(2);
          expect(results[0].get('column1')).toEqual('row1Column1');
          expect(results[0].get('column2')).toEqual('row1Column2');
          expect(results[1].get('column1')).toEqual('row2Column1');
          expect(results[1].get('column2')).toEqual('row2Column2');
          done();
        });
      }
    );
  });

  it_exclude_dbs(['postgres'])('import objects from file with results field', (done) => {
    const headers = {
      'Content-Type': 'multipart/form-data',
      'X-Parse-Application-Id': 'test',
      'X-Parse-Master-Key': 'test'
    };
    request.post(
      {
        headers: headers,
        url: 'http://localhost:8378/1/import_data/TestObject',
        formData: {
          importFile: {
            value: Buffer.from(JSON.stringify({
              results: [
                {column1: 'row1Column1', column2: 'row1Column2'},
                {column1: 'row2Column1', column2: 'row2Column2'}
              ]
            })),
            options: {
              filename: 'TestObject.json'
            }
          }
        }
      },
      (err) => {
        expect(err).toBe(null);
        const query = new Parse.Query('TestObject');
        query.ascending('column1');
        query.find().then((results) => {
          expect(results.length).toEqual(2);
          expect(results[0].get('column1')).toEqual('row1Column1');
          expect(results[0].get('column2')).toEqual('row1Column2');
          expect(results[1].get('column1')).toEqual('row2Column1');
          expect(results[1].get('column2')).toEqual('row2Column2');
          done();
        });
      }
    );
  });

  it_exclude_dbs(['postgres'])('import objects with all data types', (done) => {
    const headers = {
      'Content-Type': 'multipart/form-data',
      'X-Parse-Application-Id': 'test',
      'X-Parse-Master-Key': 'test'
    };
    request.post(
      {
        headers: headers,
        url: 'http://localhost:8378/1/import_data/TestObject',
        formData: {
          importFile: {
            value: Buffer.from(JSON.stringify({
              results: [
                {
                  boolColumnTrue: true,
                  boolColumnFalse: false,
                  stringColumn: 'stringColumnValue',
                  numberColumn: 100.1,
                  dateColumn: {
                    '__type': 'Date',
                    'iso': '2016-10-30T12:03:56.848Z'
                  },
                  arrayColumn: [
                    1,
                    2,
                    3
                  ],
                  objectColumn: {
                    'key': 'value'
                  },
                  geoColumn: {
                    '__type': 'GeoPoint',
                    'latitude': 10,
                    'longitude': -10
                  },
                  fileColumn: {
                    '__type': 'File',
                    'name': 'myfile.png'
                  },
                  pointerColumn: {
                    '__type': 'Pointer',
                    'className': '_User',
                    'objectId': 'AAAAAAAAAA'
                  }
                }
              ]
            })),
            options: {
              filename: 'TestObject.json'
            }
          }
        }
      },
      (err) => {
        expect(err).toBe(null);
        const query = new Parse.Query('TestObject');
        query.ascending('column1');
        query.find().then((results) => {
          expect(results.length).toEqual(1);
          expect(results[0].get('boolColumnTrue')).toEqual(true);
          expect(results[0].get('boolColumnFalse')).toEqual(false);
          expect(results[0].get('stringColumn')).toEqual('stringColumnValue');
          expect(results[0].get('numberColumn')).toEqual(100.1);
          expect(results[0].get('dateColumn')).toEqual(new Date('2016-10-30T12:03:56.848Z'));
          expect(results[0].get('arrayColumn')).toEqual([ 1, 2, 3 ]);
          expect(results[0].get('objectColumn')).toEqual({ 'key': 'value' });
          expect(results[0].get('geoColumn').latitude).toEqual(10);
          expect(results[0].get('geoColumn').longitude).toEqual(-10);
          expect(results[0].get('fileColumn').name()).toEqual('myfile.png');
          expect(results[0].get('pointerColumn').id).toEqual('AAAAAAAAAA');
          done();
        });
      }
    );
  });

  it_exclude_dbs(['postgres'])('import objects with object id', (done) => {
    const headers = {
      'Content-Type': 'multipart/form-data',
      'X-Parse-Application-Id': 'test',
      'X-Parse-Master-Key': 'test'
    };
    request.post(
      {
        headers: headers,
        url: 'http://localhost:8378/1/import_data/TestObject',
        formData: {
          importFile: {
            value: Buffer.from(JSON.stringify({
              results: [
                {
                  'objectId': 'aaaaaaaaaa',
                  'data': 'somedataa',
                  'createdAt': '2016-07-25T19:45:33.195Z',
                  'updatedAt': '2016-10-30T12:23:35.635Z'
                },
                {
                  'objectId': 'bbbbbbbbbb',
                  'data': 'somedatab',
                  'createdAt': '2016-07-25T19:45:33.195Z',
                  'updatedAt': '2016-10-30T12:23:35.635Z'
                }
              ]
            })),
            options: {
              filename: 'TestObject.json'
            }
          }
        }
      },
      (err) => {
        expect(err).toBe(null);
        const query = new Parse.Query('TestObject');
        query.ascending('data');
        query.find().then((results) => {
          expect(results.length).toEqual(2);
          expect(results[0].id).toEqual('aaaaaaaaaa');
          expect(results[1].id).toEqual('bbbbbbbbbb');
          done();
        });
      }
    );
  });

  it_exclude_dbs(['postgres'])('update objects with existing object id', (done) => {
    const headers = {
      'Content-Type': 'multipart/form-data',
      'X-Parse-Application-Id': 'test',
      'X-Parse-Master-Key': 'test'
    };
    request.post(
      {
        headers: headers,
        url: 'http://localhost:8378/1/import_data/TestObject',
        formData: {
          importFile: {
            value: Buffer.from(JSON.stringify({
              results: [
                {
                  'objectId': 'aaaaaaaaaa',
                  'data': 'somedataa'
                },
                {
                  'objectId': 'bbbbbbbbbb',
                  'data': 'somedatab'
                }
              ]
            })),
            options: {
              filename: 'TestObject.json'
            }
          }
        }
      },
      (err) => {
        expect(err).toBe(null);
        request.post(
          {
            headers: headers,
            url: 'http://localhost:8378/1/import_data/TestObject',
            formData: {
              importFile: {
                value: Buffer.from(JSON.stringify({
                  results: [
                    {
                      'objectId': 'aaaaaaaaaa',
                      'data': 'somedataa2'
                    }
                  ]
                })),
                options: {
                  filename: 'TestObject.json'
                }
              }
            }
          },
          (err) => {
            expect(err).toBe(null);
            const query = new Parse.Query('TestObject');
            query.ascending('data');
            query.find().then((results) => {
              expect(results.length).toEqual(2);
              expect(results[0].id).toEqual('aaaaaaaaaa');
              expect(results[0].get('data')).toEqual('somedataa2');
              expect(results[1].id).toEqual('bbbbbbbbbb');
              expect(results[1].get('data')).toEqual('somedatab');
              done();
            });
          }
        );
      }
    );
  });

  it_exclude_dbs(['postgres'])('send success import mail', (done) => {
    const emailAdapter = {
      sendMail: ({text, to, subject}) => {
        expect(text).toEqual('We have successfully imported your data to the class TestObject.');
        expect(to).toEqual('my@email.com');
        expect(subject).toEqual('Import completed');
        const query = new Parse.Query('TestObject');
        query.ascending('column1');
        query.find().then((results) => {
          expect(results.length).toEqual(2);
          expect(results[0].get('column1')).toEqual('row1Column1');
          expect(results[0].get('column2')).toEqual('row1Column2');
          expect(results[1].get('column1')).toEqual('row2Column1');
          expect(results[1].get('column2')).toEqual('row2Column2');
          done();
        });
      }
    }
    reconfigureServer({
      emailAdapter: emailAdapter
    }).then(() => {
      const headers = {
        'Content-Type': 'multipart/form-data',
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test'
      };
      request.post(
        {
          headers: headers,
          url: 'http://localhost:8378/1/import_data/TestObject',
          formData: {
            importFile: {
              value: Buffer.from(JSON.stringify({
                results: [
                  {column1: 'row1Column1', column2: 'row1Column2'},
                  {column1: 'row2Column1', column2: 'row2Column2'}
                ],
              })),
              options: {
                filename: 'TestObject.json'
              }
            },
            feedbackEmail: 'my@email.com'
          }
        },
        (err, response, body) => {
          expect(err).toBe(null);
          expect(JSON.parse(body).response).toEqual('We are importing your data. You will be notified by e-mail once it is completed.');
        }
      );
    });
  });

  it_exclude_dbs(['postgres'])('import relations object from file', (done) => {
    const headers = {
      'Content-Type': 'multipart/form-data',
      'X-Parse-Application-Id': 'test',
      'X-Parse-Master-Key': 'test'
    };

    const object = new Parse.Object('TestObjectDad');
    const relatedObject = new Parse.Object('TestObjectChild');
    const ids = {};
    Parse.Object.saveAll([object, relatedObject]).then(() => {
      object.relation('RelationObject').add(relatedObject);
      return object.save();
    })
      .then(() => {
        object.set('Name', 'namea');
        return object.save();
      })
      .then((savedObj) => {
        ids.a = savedObj.id;
        relatedObject.set('Name', 'nameb');
        return relatedObject.save();
      })
      .then((savedObj) => {
        ids.b = savedObj.id;
        request.post(
          {
            headers: headers,
            url: 'http://localhost:8378/1/import_relation_data/TestObjectDad/RelationObject',
            formData: {
              importFile: {
                value: Buffer.from(JSON.stringify({
                  results: [
                    {
                      'owningId': ids.a,
                      'relatedId': ids.b
                    }
                  ]
                })),
                options: {
                  filename: 'TestObject:RelationObject.json'
                }
              }
            }
          },
          (err) => {
            expect(err).toBe(null);
            object.relation('RelationObject').query().find().then((results) => {
              expect(results.length).toEqual(1);
              expect(results[0].id).toEqual(ids.b);
              done();
            });
          }
        )
      });
  });

  it_exclude_dbs(['postgres'])('send success import mail in the import relation', (done) => {
    const object = new Parse.Object('TestObjectDad');
    const relatedObject = new Parse.Object('TestObjectChild');
    const ids = {};
    Parse.Object.saveAll([object, relatedObject]).then(() => {
      object.relation('RelationObject').add(relatedObject);
      return object.save();
    })
      .then(() => {
        object.set('Name', 'namea');
        return object.save();
      })
      .then((savedObj) => {
        ids.a = savedObj.id;
        relatedObject.set('Name', 'nameb');
        return relatedObject.save();
      })
      .then((savedObj) => {
        ids.b = savedObj.id;
        const emailAdapter = {
          sendMail: ({text, to, subject}) => {
            expect(text).toEqual('We have successfully imported your data to the class TestObjectDad, relation RelationObject.');
            expect(to).toEqual('my@email.com');
            expect(subject).toEqual('Import completed');
            object.relation('RelationObject').query().find().then((results) => {
              expect(results.length).toEqual(1);
              expect(results[0].id).toEqual(ids.b);
              done();
            });
          }
        }
        reconfigureServer({
          emailAdapter: emailAdapter
        }).then(() => {
          const headers = {
            'Content-Type': 'multipart/form-data',
            'X-Parse-Application-Id': 'test',
            'X-Parse-Master-Key': 'test'
          };
          request.post(
            {
              headers: headers,
              url: 'http://localhost:8378/1/import_relation_data/TestObjectDad/RelationObject',
              formData: {
                importFile: {
                  value: Buffer.from(JSON.stringify({
                    results: [
                      {
                        'owningId': ids.a,
                        'relatedId': ids.b
                      }
                    ]
                  })),
                  options: {
                    filename: 'TestObject:RelationObject.json'
                  }
                },
                feedbackEmail: 'my@email.com'
              }
            },
            (err, response, body) => {
              expect(err).toBe(null);
              expect(body).toEqual('{"response":"We are importing your data. You will be notified by e-mail once it is completed."}');
            }
          );
        });
      });
  });
});
