// This is a port of the test suite:
// hungry/js/test/parse_file_test.js

"use strict";

var request = require('request');

var str = "Hello World!";
var data = [];
for (var i = 0; i < str.length; i++) {
  data.push(str.charCodeAt(i));
}

describe('Parse.File testing', () => {
  describe('creating files', () => {
    it('works with Content-Type', done => {
      var headers = {
        'Content-Type': 'application/octet-stream',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest'
      };
      request.post({
        headers: headers,
        url: 'http://localhost:8378/1/files/file.txt',
        body: 'argle bargle',
      }, (error, response, body) => {
        expect(error).toBe(null);
        var b = JSON.parse(body);
        expect(b.name).toMatch(/_file.txt$/);
        expect(b.url).toMatch(/^http:\/\/localhost:8378\/1\/files\/test\/.*file.txt$/);
        request.get(b.url, (error, response, body) => {
          expect(error).toBe(null);
          expect(body).toEqual('argle bargle');
          done();
        });
      });
    });


    it('works with _ContentType', done => {

      request.post({
        url: 'http://localhost:8378/1/files/file',
        body: JSON.stringify({
          _ApplicationId: 'test',
          _JavaScriptKey: 'test',
          _ContentType: 'text/html',
          base64: 'PGh0bWw+PC9odG1sPgo='
        })
      }, (error, response, body) => {
        expect(error).toBe(null);
        var b = JSON.parse(body);
        expect(b.name).toMatch(/_file.html/);
        expect(b.url).toMatch(/^http:\/\/localhost:8378\/1\/files\/test\/.*file.html$/);
        request.get(b.url, (error, response, body) => {
          try {
            expect(response.headers['content-type']).toMatch('^text/html');
            expect(error).toBe(null);
            expect(body).toEqual('<html></html>\n');
          } catch(e) {
            jfail(e);
          }
          done();
        });
      });
    });

    it('works without Content-Type', done => {
      var headers = {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest'
      };
      request.post({
        headers: headers,
        url: 'http://localhost:8378/1/files/file.txt',
        body: 'argle bargle',
      }, (error, response, body) => {
        expect(error).toBe(null);
        var b = JSON.parse(body);
        expect(b.name).toMatch(/_file.txt$/);
        expect(b.url).toMatch(/^http:\/\/localhost:8378\/1\/files\/test\/.*file.txt$/);
        request.get(b.url, (error, response, body) => {
          expect(error).toBe(null);
          expect(body).toEqual('argle bargle');
          done();
        });
      });
    });
  });

  it('supports REST end-to-end file create, read, delete, read', done => {
    var headers = {
      'Content-Type': 'image/jpeg',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest'
    };
    request.post({
      headers: headers,
      url: 'http://localhost:8378/1/files/testfile.txt',
      body: 'check one two',
    }, (error, response, body) => {
      expect(error).toBe(null);
      var b = JSON.parse(body);
      expect(b.name).toMatch(/_testfile.txt$/);
      expect(b.url).toMatch(/^http:\/\/localhost:8378\/1\/files\/test\/.*testfile.txt$/);
      request.get(b.url, (error, response, body) => {
        expect(error).toBe(null);
        expect(body).toEqual('check one two');
        request.del({
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
            'X-Parse-Master-Key': 'test'
          },
          url: 'http://localhost:8378/1/files/' + b.name
        }, (error, response) => {
          expect(error).toBe(null);
          expect(response.statusCode).toEqual(200);
          request.get({
            headers: {
              'X-Parse-Application-Id': 'test',
              'X-Parse-REST-API-Key': 'rest'
            },
            url: b.url
          }, (error, response) => {
            expect(error).toBe(null);
            try {
              expect(response.statusCode).toEqual(404);
            } catch(e) {
              jfail(e);
            }
            done();
          });
        });
      });
    });
  });

  it('blocks file deletions with missing or incorrect master-key header', done => {
    var headers = {
      'Content-Type': 'image/jpeg',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest'
    };
    request.post({
      headers: headers,
      url: 'http://localhost:8378/1/files/thefile.jpg',
      body: 'the file body'
    }, (error, response, body) => {
      expect(error).toBe(null);
      var b = JSON.parse(body);
      expect(b.url).toMatch(/^http:\/\/localhost:8378\/1\/files\/test\/.*thefile.jpg$/);
      // missing X-Parse-Master-Key header
      request.del({
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest'
        },
        url: 'http://localhost:8378/1/files/' + b.name
      }, (error, response, body) => {
        expect(error).toBe(null);
        var del_b = JSON.parse(body);
        expect(response.statusCode).toEqual(403);
        expect(del_b.error).toMatch(/unauthorized/);
        // incorrect X-Parse-Master-Key header
        request.del({
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
            'X-Parse-Master-Key': 'tryagain'
          },
          url: 'http://localhost:8378/1/files/' + b.name
        }, (error, response, body) => {
          expect(error).toBe(null);
          var del_b2 = JSON.parse(body);
          expect(response.statusCode).toEqual(403);
          expect(del_b2.error).toMatch(/unauthorized/);
          done();
        });
      });
    });
  });

  it('handles other filetypes', done => {
    var headers = {
      'Content-Type': 'image/jpeg',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest'
    };
    request.post({
      headers: headers,
      url: 'http://localhost:8378/1/files/file.jpg',
      body: 'argle bargle',
    }, (error, response, body) => {
      expect(error).toBe(null);
      var b = JSON.parse(body);
      expect(b.name).toMatch(/_file.jpg$/);
      expect(b.url).toMatch(/^http:\/\/localhost:8378\/1\/files\/.*file.jpg$/);
      request.get(b.url, (error, response, body) => {
        expect(error).toBe(null);
        expect(body).toEqual('argle bargle');
        done();
      });
    });
  });

  it("save file", done => {
    var file = new Parse.File("hello.txt", data, "text/plain");
    ok(!file.url());
    file.save(expectSuccess({
      success: function(result) {
        strictEqual(result, file);
        ok(file.name());
        ok(file.url());
        notEqual(file.name(), "hello.txt");
        done();
      }
    }, done));
  });

  it("save file in object", done => {
    var file = new Parse.File("hello.txt", data, "text/plain");
    ok(!file.url());
    file.save(expectSuccess({
      success: function(result) {
        strictEqual(result, file);
        ok(file.name());
        ok(file.url());
        notEqual(file.name(), "hello.txt");

        var object = new Parse.Object("TestObject");
        object.save({
          file: file
        }, expectSuccess({
          success: function(object) {
            (new Parse.Query("TestObject")).get(object.id, expectSuccess({
              success: function(objectAgain) {
                ok(objectAgain.get("file") instanceof Parse.File);
                done();
              }
            }));
          }
        }, done));
      }
    }, done));
  });

  it("save file in object with escaped characters in filename", done => {
    var file = new Parse.File("hello . txt", data, "text/plain");
    ok(!file.url());
    file.save(expectSuccess({
      success: function(result) {
        strictEqual(result, file);
        ok(file.name());
        ok(file.url());
        notEqual(file.name(), "hello . txt");

        var object = new Parse.Object("TestObject");
        object.save({
          file: file
        }, expectSuccess({
          success: function(object) {
            (new Parse.Query("TestObject")).get(object.id, expectSuccess({
              success: function(objectAgain) {
                ok(objectAgain.get("file") instanceof Parse.File);

                done();
              }
            }));
          }
        }, done));
      }
    }, done));
  });

  it("autosave file in object", done => {
    var file = new Parse.File("hello.txt", data, "text/plain");
    ok(!file.url());
    var object = new Parse.Object("TestObject");
    object.save({
      file: file
    }, expectSuccess({
      success: function(object) {
        (new Parse.Query("TestObject")).get(object.id, expectSuccess({
          success: function(objectAgain) {
            file = objectAgain.get("file");
            ok(file instanceof Parse.File);
            ok(file.name());
            ok(file.url());
            notEqual(file.name(), "hello.txt");
            done();
          }
        }, done));
      }
    }, done));
  });

  it("autosave file in object in object", done => {
    var file = new Parse.File("hello.txt", data, "text/plain");
    ok(!file.url());

    var child = new Parse.Object("Child");
    child.set("file", file);

    var parent = new Parse.Object("Parent");
    parent.set("child", child);

    parent.save(expectSuccess({
      success: function(parent) {
        var query = new Parse.Query("Parent");
        query.include("child");
        query.get(parent.id, expectSuccess({
          success: function(parentAgain) {
            var childAgain = parentAgain.get("child");
            file = childAgain.get("file");
            ok(file instanceof Parse.File);
            ok(file.name());
            ok(file.url());
            notEqual(file.name(), "hello.txt");
            done();
          }
        }, done));
      }
    }, done));
  });

  it("saving an already saved file", done => {
    var file = new Parse.File("hello.txt", data, "text/plain");
    ok(!file.url());
    file.save(expectSuccess({
      success: function(result) {
        strictEqual(result, file);
        ok(file.name());
        ok(file.url());
        notEqual(file.name(), "hello.txt");
        var previousName = file.name();

        file.save(expectSuccess({
          success: function() {
            equal(file.name(), previousName);
            done();
          }
        }, done));
      }
    },  done));
  });

  it("two saves at the same time", done => {
    var file = new Parse.File("hello.txt", data, "text/plain");

    var firstName;
    var secondName;

    var firstSave = file.save().then(function() { firstName = file.name(); });
    var secondSave = file.save().then(function() { secondName = file.name(); });

    Parse.Promise.when(firstSave, secondSave).then(function() {
      equal(firstName, secondName);
      done();
    }, function(error) {
      ok(false, error);
      done();
    });
  });

  it("file toJSON testing", done => {
    var file = new Parse.File("hello.txt", data, "text/plain");
    ok(!file.url());
    var object = new Parse.Object("TestObject");
    object.save({
      file: file
    }, expectSuccess({
      success: function() {
        ok(object.toJSON().file.url);
        done();
      }
    }, done));
  });

  it("content-type used with no extension", done => {
    var headers = {
      'Content-Type': 'text/html',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest'
    };
    request.post({
      headers: headers,
      url: 'http://localhost:8378/1/files/file',
      body: 'fee fi fo',
    }, (error, response, body) => {
      expect(error).toBe(null);
      var b = JSON.parse(body);
      expect(b.name).toMatch(/\.html$/);
      request.get(b.url, (error, response) => {
        if (!response) {
          fail('response should be set');
          return done();
        }
        expect(response.headers['content-type']).toMatch(/^text\/html/);
        done();
      });
    });
  });

  it("filename is url encoded", done => {
    var headers = {
      'Content-Type': 'text/html',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest'
    };
    request.post({
      headers: headers,
      url: 'http://localhost:8378/1/files/hello world.txt',
      body: 'oh emm gee',
    }, (error, response, body) => {
      expect(error).toBe(null);
      var b = JSON.parse(body);
      expect(b.url).toMatch(/hello%20world/);
      done();
    })
  });

  it('supports array of files', done => {
    var file = {
      __type: 'File',
      url: 'http://meep.meep',
      name: 'meep'
    };
    var files = [file, file];
    var obj = new Parse.Object('FilesArrayTest');
    obj.set('files', files);
    obj.save().then(() => {
      var query = new Parse.Query('FilesArrayTest');
      return query.first();
    }).then((result) => {
      var filesAgain = result.get('files');
      expect(filesAgain.length).toEqual(2);
      expect(filesAgain[0].name()).toEqual('meep');
      expect(filesAgain[0].url()).toEqual('http://meep.meep');
      done();
    });
  });

  it('validates filename characters', done => {
    var headers = {
      'Content-Type': 'text/plain',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest'
    };
    request.post({
      headers: headers,
      url: 'http://localhost:8378/1/files/di$avowed.txt',
      body: 'will fail',
    }, (error, response, body) => {
      var b = JSON.parse(body);
      expect(b.code).toEqual(122);
      done();
    });
  });

  it('validates filename length', done => {
    var headers = {
      'Content-Type': 'text/plain',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest'
    };
    var fileName = 'Onceuponamidnightdrearywhileiponderedweak' +
                   'andwearyOveramanyquaintandcuriousvolumeof' +
                   'forgottenloreWhileinoddednearlynappingsud' +
                   'denlytherecameatapping';
    request.post({
      headers: headers,
      url: 'http://localhost:8378/1/files/' + fileName,
      body: 'will fail',
    }, (error, response, body) => {
      var b = JSON.parse(body);
      expect(b.code).toEqual(122);
      done();
    });
  });

  it('supports a dictionary with file', done => {
    var file = {
      __type: 'File',
      url: 'http://meep.meep',
      name: 'meep'
    };
    var dict = {
      file: file
    };
    var obj = new Parse.Object('FileObjTest');
    obj.set('obj', dict);
    obj.save().then(() => {
      var query = new Parse.Query('FileObjTest');
      return query.first();
    }).then((result) => {
      var dictAgain = result.get('obj');
      expect(typeof dictAgain).toEqual('object');
      var fileAgain = dictAgain['file'];
      expect(fileAgain.name()).toEqual('meep');
      expect(fileAgain.url()).toEqual('http://meep.meep');
      done();
    }).catch((e) => {
      jfail(e);
      done();
    });
  });

  it('creates correct url for old files hosted on files.parsetfss.com', done => {
    var file = {
      __type: 'File',
      url: 'http://irrelevant.elephant/',
      name: 'tfss-123.txt'
    };
    var obj = new Parse.Object('OldFileTest');
    obj.set('oldfile', file);
    obj.save().then(() => {
      var query = new Parse.Query('OldFileTest');
      return query.first();
    }).then((result) => {
      var fileAgain = result.get('oldfile');
      expect(fileAgain.url()).toEqual(
        'http://files.parsetfss.com/test/tfss-123.txt'
      );
      done();
    }).catch((e) => {
      jfail(e);
      done();
    });
  });

  it('creates correct url for old files hosted on files.parse.com', done => {
    var file = {
      __type: 'File',
      url: 'http://irrelevant.elephant/',
      name: 'd6e80979-a128-4c57-a167-302f874700dc-123.txt'
    };
    var obj = new Parse.Object('OldFileTest');
    obj.set('oldfile', file);
    obj.save().then(() => {
      var query = new Parse.Query('OldFileTest');
      return query.first();
    }).then((result) => {
      var fileAgain = result.get('oldfile');
      expect(fileAgain.url()).toEqual(
        'http://files.parse.com/test/d6e80979-a128-4c57-a167-302f874700dc-123.txt'
      );
      done();
    }).catch((e) => {
      jfail(e);
      done();
    });
  });

  it('supports files in objects without urls', done => {
    var file = {
      __type: 'File',
      name: '123.txt'
    };
    var obj = new Parse.Object('FileTest');
    obj.set('file', file);
    obj.save().then(() => {
      var query = new Parse.Query('FileTest');
      return query.first();
    }).then(result => {
      const fileAgain = result.get('file');
      expect(fileAgain.url()).toMatch(/123.txt$/);
      done();
    }).catch((e) => {
      jfail(e);
      done();
    });
  });

  it('return with publicServerURL when provided', done => {
    reconfigureServer({
      publicServerURL: 'https://mydomain/parse'
    }).then(() => {
      var file = {
        __type: 'File',
        name: '123.txt'
      };
      var obj = new Parse.Object('FileTest');
      obj.set('file', file);
      return obj.save()
    }).then(() => {
      var query = new Parse.Query('FileTest');
      return query.first();
    }).then(result => {
      const fileAgain = result.get('file');
      expect(fileAgain.url().indexOf('https://mydomain/parse')).toBe(0);
      done();
    }).catch((e) => {
      jfail(e);
      done();
    });
  });

  it('fails to upload an empty file', done => {
    var headers = {
      'Content-Type': 'application/octet-stream',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest'
    };
    request.post({
      headers: headers,
      url: 'http://localhost:8378/1/files/file.txt',
      body: '',
    }, (error, response, body) => {
      expect(error).toBe(null);
      expect(response.statusCode).toBe(400);
      expect(body).toEqual('{"code":130,"error":"Invalid file upload."}');
      done();
    });
  });

  it('fails to upload without a file name', done => {
    var headers = {
      'Content-Type': 'application/octet-stream',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest'
    };
    request.post({
      headers: headers,
      url: 'http://localhost:8378/1/files/',
      body: 'yolo',
    }, (error, response, body) => {
      expect(error).toBe(null);
      expect(response.statusCode).toBe(400);
      expect(body).toEqual('{"code":122,"error":"Filename not provided."}');
      done();
    });
  });

  it('fails to upload without a file name', done => {
    var headers = {
      'Content-Type': 'application/octet-stream',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest'
    };
    request.post({
      headers: headers,
      url: 'http://localhost:8378/1/files/',
      body: 'yolo',
    }, (error, response, body) => {
      expect(error).toBe(null);
      expect(response.statusCode).toBe(400);
      expect(body).toEqual('{"code":122,"error":"Filename not provided."}');
      done();
    });
  });

  it('fails to delete an unkown file', done => {
    var headers = {
      'Content-Type': 'application/octet-stream',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest',
      'X-Parse-Master-Key': 'test'
    };
    request.delete({
      headers: headers,
      url: 'http://localhost:8378/1/files/file.txt',
    }, (error, response, body) => {
      expect(error).toBe(null);
      expect(response.statusCode).toBe(400);
      expect(body).toEqual('{"code":153,"error":"Could not delete file."}');
      done();
    });
  });

  describe_only_db('mongo')('Gridstore Range tests', () => {
    it('supports range requests', done => {
      var headers = {
        'Content-Type': 'application/octet-stream',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest'
      };
      request.post({
        headers: headers,
        url: 'http://localhost:8378/1/files/file.txt',
        body: 'argle bargle',
      }, (error, response, body) => {
        expect(error).toBe(null);
        var b = JSON.parse(body);
        request.get({ url: b.url, headers: {
          'Content-Type': 'application/octet-stream',
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
          'Range': 'bytes=0-5'
        } }, (error, response, body) => {
          expect(error).toBe(null);
          expect(body).toEqual('argle ');
          done();
        });
      });
    });

    it('supports small range requests', done => {
      var headers = {
        'Content-Type': 'application/octet-stream',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest'
      };
      request.post({
        headers: headers,
        url: 'http://localhost:8378/1/files/file.txt',
        body: 'argle bargle',
      }, (error, response, body) => {
        expect(error).toBe(null);
        var b = JSON.parse(body);
        request.get({ url: b.url, headers: {
          'Content-Type': 'application/octet-stream',
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
          'Range': 'bytes=0-2'
        } }, (error, response, body) => {
          expect(error).toBe(null);
          expect(body).toEqual('arg');
          done();
        });
      });
    });

    // See specs https://www.greenbytes.de/tech/webdav/draft-ietf-httpbis-p5-range-latest.html#byte.ranges
    it('supports getting one byte', done => {
      var headers = {
        'Content-Type': 'application/octet-stream',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest'
      };
      request.post({
        headers: headers,
        url: 'http://localhost:8378/1/files/file.txt',
        body: 'argle bargle',
      }, (error, response, body) => {
        expect(error).toBe(null);
        var b = JSON.parse(body);
        request.get({ url: b.url, headers: {
          'Content-Type': 'application/octet-stream',
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
          'Range': 'bytes=2-2'
        } }, (error, response, body) => {
          expect(error).toBe(null);
          expect(body).toEqual('g');
          done();
        });
      });
    });

    it('supports getting last n bytes', done => {
      var headers = {
        'Content-Type': 'application/octet-stream',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest'
      };
      request.post({
        headers: headers,
        url: 'http://localhost:8378/1/files/file.txt',
        body: 'something different',
      }, (error, response, body) => {
        expect(error).toBe(null);
        var b = JSON.parse(body);
        request.get({ url: b.url, headers: {
          'Content-Type': 'application/octet-stream',
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
          'Range': 'bytes=-4'
        } }, (error, response, body) => {
          expect(error).toBe(null);
          expect(body.length).toBe(4);
          expect(body).toEqual('rent');
          done();
        });
      });
    });

    it('supports getting first n bytes', done => {
      var headers = {
        'Content-Type': 'application/octet-stream',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest'
      };
      request.post({
        headers: headers,
        url: 'http://localhost:8378/1/files/file.txt',
        body: 'something different',
      }, (error, response, body) => {
        expect(error).toBe(null);
        var b = JSON.parse(body);
        request.get({ url: b.url, headers: {
          'Content-Type': 'application/octet-stream',
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
          'Range': 'bytes=10-'
        } }, (error, response, body) => {
          expect(error).toBe(null);
          expect(body).toEqual('different');
          done();
        });
      });
    });

    function repeat(string, count) {
      var s = string;
      while (count > 0) {
        s += string;
        count--;
      }
      return s;
    }

    it('supports large range requests', done => {
      var headers = {
        'Content-Type': 'application/octet-stream',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest'
      };
      request.post({
        headers: headers,
        url: 'http://localhost:8378/1/files/file.txt',
        body: repeat('argle bargle', 100)
      }, (error, response, body) => {
        expect(error).toBe(null);
        var b = JSON.parse(body);
        request.get({ url: b.url, headers: {
          'Content-Type': 'application/octet-stream',
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
          'Range': 'bytes=13-240'
        } }, (error, response, body) => {
          expect(error).toBe(null);
          expect(body.length).toEqual(228);
          expect(body.indexOf('rgle barglea')).toBe(0);
          done();
        });
      });
    });

    it('fails to stream unknown file', done => {
      request.get({ url: 'http://localhost:8378/1/files/test/file.txt', headers: {
        'Content-Type': 'application/octet-stream',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
        'Range': 'bytes=13-240'
      } }, (error, response, body) => {
        expect(error).toBe(null);
        expect(response.statusCode).toBe(404);
        expect(body).toEqual('File not found.');
        done();
      });
    });
  });

  // Because GridStore is not loaded on PG, those are perfect
  // for fallback tests
  describe_only_db('postgres')('Default Range tests', () => {
    it('fallback to regular request', done => {
      var headers = {
        'Content-Type': 'application/octet-stream',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest'
      };
      request.post({
        headers: headers,
        url: 'http://localhost:8378/1/files/file.txt',
        body: 'argle bargle',
      }, (error, response, body) => {
        expect(error).toBe(null);
        var b = JSON.parse(body);
        request.get({ url: b.url, headers: {
          'Content-Type': 'application/octet-stream',
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
          'Range': 'bytes=0-5'
        } }, (error, response, body) => {
          expect(error).toBe(null);
          expect(body).toEqual('argle bargle');
          done();
        });
      });
    });
  });
});
