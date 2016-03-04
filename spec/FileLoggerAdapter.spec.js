var FileLoggerAdapter = require('../src/Adapters/Logger/FileLoggerAdapter').FileLoggerAdapter;
var fs = require('fs');

var LOGS_FOLDER = './test_logs/';

var deleteFolderRecursive = function(path) {
  if ( fs.existsSync(path) ) {
    fs.readdirSync(path).forEach(function(file){
      var curPath = path + "/" + file;
      if (fs.lstatSync(curPath).isDirectory()) { // recurse
        deleteFolderRecursive(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(path);
  }
};

describe('info logs', () => {

  afterEach((done) => {
    deleteFolderRecursive(LOGS_FOLDER);
    done();
  });

  it("Verify INFO logs", (done) => {
    var fileLoggerAdapter = new FileLoggerAdapter({
      logsFolder: LOGS_FOLDER
    });
    fileLoggerAdapter.info('testing info logs', () => {
      fileLoggerAdapter.query({
        size: 1,
        level: 'info'
      }, (results) => {
        expect(results[0].message).toEqual('testing info logs');
        done();
      });
    });
  });
});

describe('error logs', () => {

  afterEach((done) => {
    deleteFolderRecursive(LOGS_FOLDER);
    done();
  });

  it("Verify ERROR logs", (done) => {
    var fileLoggerAdapter = new FileLoggerAdapter();
    fileLoggerAdapter.error('testing error logs', () => {
      fileLoggerAdapter.query({
        size: 1,
        level: 'error'
      }, (results) => {
        expect(results[0].message).toEqual('testing error logs');
        done();
      });
    });
  });
});
