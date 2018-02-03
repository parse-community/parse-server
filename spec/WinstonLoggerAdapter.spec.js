'use strict';

var WinstonLoggerAdapter = require('../src/Adapters/Logger/WinstonLoggerAdapter').WinstonLoggerAdapter;
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
        } else {
          expect(results[0].message).toEqual('testing info logs');
        }
        // Check the error log
        // Regression #2639
        winstonLoggerAdapter.query({
          from: new Date(Date.now() - 500),
          size: 100,
          level: 'error'
        }, (results) => {
          expect(results.length).toEqual(0);
          done();
        });
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
        const winstonLoggerAdapter = new WinstonLoggerAdapter();
        return winstonLoggerAdapter.query({
          from: new Date(Date.now() - 500),
          size: 100,
          level: 'verbose'
        });
      }).then((results) => {
        const logString = JSON.stringify(results);
        expect(logString.match(/\*\*\*\*\*\*\*\*/g).length).not.toBe(0);
        expect(logString.match(/moon-y/g)).toBe(null);

        var headers = {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest'
        };
        request.get({
          headers: headers,
          url: 'http://localhost:8378/1/login?username=test&password=moon-y'
        }, () => {
          const winstonLoggerAdapter = new WinstonLoggerAdapter();
          return winstonLoggerAdapter.query({
            from: new Date(Date.now() - 500),
            size: 100,
            level: 'verbose'
          }).then((results) => {
            const logString = JSON.stringify(results);
            expect(logString.match(/\*\*\*\*\*\*\*\*/g).length).not.toBe(0);
            expect(logString.match(/moon-y/g)).toBe(null);
            done();
          });
        });
      }).catch((err) => {
        fail(JSON.stringify(err));
        done();
      })
  });
});
