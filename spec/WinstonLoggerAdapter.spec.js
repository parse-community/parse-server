'use strict';

var WinstonLoggerAdapter = require('../src/Adapters/Logger/WinstonLoggerAdapter').WinstonLoggerAdapter;
var Parse = require('parse/node').Parse;
var request = require('request');

describe('info logs', () => {

  it("Verify INFO logs", (done) => {
      var winstonLoggerAdapter = new WinstonLoggerAdapter();
      winstonLoggerAdapter.log('info', 'testing info logs', () => {
        winstonLoggerAdapter.query({
          from: new Date(Date.now() - 500),
          size: 100,
          level: 'info'
        }, (results) => {
          if (results.length == 0) {
            fail('The adapter should return non-empty results');
            done();
          } else {
            expect(results[0].message).toEqual('testing info logs');
            done();
          }
        });
      });
    });
});

describe('error logs', () => {
  it("Verify ERROR logs", (done) => {
    var winstonLoggerAdapter = new WinstonLoggerAdapter();
    winstonLoggerAdapter.log('error', 'testing error logs', () => {
      winstonLoggerAdapter.query({
        from: new Date(Date.now() - 500),
        size: 100,
        level: 'error'
      }, (results) => {
        if(results.length == 0) {
          fail('The adapter should return non-empty results');
          done();
        }
        else {
          expect(results[0].message).toEqual('testing error logs');
          done();
        }
      });
    });
  });
});

describe('verbose logs', () => {
  it("mask sensitive information in _User class", (done) => {
    reconfigureServer({ verbose: true })
    .then(() => createTestUser())
    .then(() => {
      let winstonLoggerAdapter = new WinstonLoggerAdapter();
      return winstonLoggerAdapter.query({
        from: new Date(Date.now() - 500),
        size: 100,
        level: 'verbose'
      });
    }).then((results) => {
      let logString = JSON.stringify(results);
      expect(logString.match(/\*\*\*\*\*\*\*\*/g).length).not.toBe(0);
      expect(logString.match(/moon-y/g)).toBe(null);

      var headers = {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest'
      };
      request.get({
        headers: headers,
        url: 'http://localhost:8378/1/login?username=test&password=moon-y'
      }, (error, response, body) => {
        let winstonLoggerAdapter = new WinstonLoggerAdapter();
        return winstonLoggerAdapter.query({
          from: new Date(Date.now() - 500),
          size: 100,
          level: 'verbose'
        }).then((results) => {
          let logString = JSON.stringify(results);
          expect(logString.match(/\*\*\*\*\*\*\*\*/g).length).not.toBe(0);
          expect(logString.match(/moon-y/g)).toBe(null);
          done();
        });
      });
    }).catch((err) => {
      fail(JSON.stringify(err));
      done();
    })
  });

  it("should not mask information in non _User class", (done) => {
    let obj = new Parse.Object('users');
    obj.set('password', 'pw');
    obj.save().then(() => {
      let winstonLoggerAdapter = new WinstonLoggerAdapter();
      return winstonLoggerAdapter.query({
        from: new Date(Date.now() - 500),
        size: 100,
        level: 'verbose'
      });
    }).then((results) => {
      expect(results[1].body.password).toEqual("pw");
      done();
    });
  });
});
