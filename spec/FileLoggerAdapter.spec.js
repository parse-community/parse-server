var FileLoggerAdapter = require('../src/Adapters/Logger/FileLoggerAdapter').FileLoggerAdapter;
var Parse = require('parse/node').Parse;

describe('info logs', () => {

  it("Verify INFO logs", (done) => {
    var fileLoggerAdapter = new FileLoggerAdapter();
    fileLoggerAdapter.info('testing info logs', () => {
      fileLoggerAdapter.query({
        size: 1,
        level: 'info'
      }, (results) => {
        if(results.length == 0) {
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
    var fileLoggerAdapter = new FileLoggerAdapter();
    fileLoggerAdapter.error('testing error logs', () => {
      fileLoggerAdapter.query({
        size: 1,
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
