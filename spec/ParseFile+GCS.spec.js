// This is a port of the test suite:
// hungry/js/test/parse_file_test.js

"use strict";

var request = require('request');
var GCSAdapter = require('../src/index').GCSAdapter;

var str = "Hello World!";
var data = [];
for (var i = 0; i < str.length; i++) {
  data.push(str.charCodeAt(i));
}

// Make sure that you fill these in, otherwise the tests won't run!!!
var GCP_PROJECT_ID = "<gcp_project_id>";
var GCP_KEYFILE_PATH = "<path/to/keyfile>";
var GCS_BUCKET_NAME = "<gcs_bucket_name>";

// Note the 'xdescribe', make sure to delete the 'x' once the above vars
// are filled in to run the test suite
xdescribe('Parse.File GCS testing', () => {
  describe('GCS directAccess: false', () => {
    beforeEach(function(done){
      var port = 8378;
      var GCSConfiguration = {
        databaseURI: process.env.DATABASE_URI,
        serverURL: 'http://localhost:' + port + '/1',
        appId: 'test',
        javascriptKey: 'test',
        restAPIKey: 'rest',
        masterKey: 'test',
        fileKey: 'test',
        filesAdapter: new GCSAdapter(
          GCP_PROJECT_ID,
          GCP_KEYFILE_PATH,
          GCS_BUCKET_NAME,
          {
            bucketPrefix: 'private/',
            directAccess: false
          }
        )
      };
      setServerConfiguration(GCSConfiguration);
      done();
    });

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
          }, (error, response, body) => {
            expect(error).toBe(null);
            expect(response.statusCode).toEqual(200);
            request.get({
              headers: {
                'X-Parse-Application-Id': 'test',
                'X-Parse-REST-API-Key': 'rest'
              },
              url: b.url
            }, (error, response, body) => {
              expect(error).toBe(null);
              expect(response.statusCode).toEqual(404);
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
  });

  describe('GCS directAccess: true', () => {
    beforeEach(function(done){
      var port = 8378;
      var GCSConfiguration = {
        databaseURI: process.env.DATABASE_URI,
        serverURL: 'http://localhost:' + port + '/1',
        appId: 'test',
        javascriptKey: 'test',
        restAPIKey: 'rest',
        masterKey: 'test',
        fileKey: 'test',
        filesAdapter: new GCSAdapter(
          GCP_PROJECT_ID,
          GCP_KEYFILE_PATH,
          GCS_BUCKET_NAME,
          {
            bucketPrefix: 'public/',
            directAccess: true
          }
        )
      };
      setServerConfiguration(GCSConfiguration);
      done();
    });

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
        var gcsRegex = new RegExp("https:\/\/" + GCS_BUCKET_NAME + ".storage.googleapis.com\/public\/.*file.txt")
        expect(b.url).toMatch(gcsRegex);
        request.get(b.url, (error, response, body) => {
          expect(error).toBe(null);
          expect(body).toEqual('argle bargle');
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
        var gcsRegex = new RegExp("https:\/\/" + GCS_BUCKET_NAME + ".storage.googleapis.com\/public\/.*file.txt")
        expect(b.url).toMatch(gcsRegex);
        request.get(b.url, (error, response, body) => {
          expect(error).toBe(null);
          expect(body).toEqual('argle bargle');
          done();
        });
      });
    });

    it('supports REST end-to-end file create, read, delete, read', done => {
      var headers = {
        'Content-Type': 'image/jpeg',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest'
      };
      // Create the file
      request.post({
        headers: headers,
        url: 'http://localhost:8378/1/files/testfile.txt',
        body: 'check one two',
      }, (error, response, body) => {
        expect(error).toBe(null);
        var b = JSON.parse(body);
        expect(b.name).toMatch(/_testfile.txt$/);
        var gcsRegex = new RegExp("https:\/\/" + GCS_BUCKET_NAME + ".storage.googleapis.com\/public\/.*testfile.txt")
        expect(b.url).toMatch(gcsRegex);
        // Read the file the first time
        request.get(b.url, (error, response, body) => {
          expect(error).toBe(null);
          expect(body).toEqual('check one two');
          // Delete the file
          request.del({
            headers: {
              'X-Parse-Application-Id': 'test',
              'X-Parse-REST-API-Key': 'rest',
              'X-Parse-Master-Key': 'test'
            },
            url: 'http://localhost:8378/1/files/' + b.name
          }, (error, response, body) => {
            expect(error).toBe(null);
            expect(response.statusCode).toEqual(200);
            // Read the file the second time--expect it to be gone
            // Note that we're reading from the public cloud storage URL
            // This is different from the above test since it's assumed
            // users are reading from the public URL
            request.get({
              headers: {
                'X-Parse-Application-Id': 'test',
                'X-Parse-REST-API-Key': 'rest'
              },
              url: "https://" + GCS_BUCKET_NAME + ".storage.googleapis.com/public/.*testfile.txt"
            }, (error, response, body) => {
              expect(error).toBe(null);
              expect(response.statusCode).toEqual(404);
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
        var gcsRegex = new RegExp("https:\/\/" + GCS_BUCKET_NAME + ".storage.googleapis.com\/public\/.*thefile.jpg")
        expect(b.url).toMatch(gcsRegex);
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
        var gcsRegex = new RegExp("https:\/\/" + GCS_BUCKET_NAME + ".storage.googleapis.com\/public\/.*file.jpg")
        expect(b.url).toMatch(gcsRegex);
        request.get(b.url, (error, response, body) => {
          expect(error).toBe(null);
          expect(body).toEqual('argle bargle');
          done();
        });
      });
    });
  });
});
