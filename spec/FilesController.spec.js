var FilesController = require('../src/Controllers/FilesController').FilesController;
var GridStoreAdapter = require("../src/Adapters/Files/GridStoreAdapter").GridStoreAdapter;
var S3Adapter = require("../src/Adapters/Files/S3Adapter").S3Adapter;

var FCTestFactory = require("./FilesControllerTestFactory");


// Small additional tests to improve overall coverage
describe("FilesController",()=>{
  
  // Test the grid store adapter
  var gridStoreAdapter = new GridStoreAdapter('mongodb://localhost:27017/parse');
  FCTestFactory.testAdapter("GridStoreAdapter", gridStoreAdapter);
  
  if (process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY) {
    
    // Test the S3 Adapter
    var s3Adapter = new S3Adapter(process.env.S3_ACCESS_KEY, process.env.S3_SECRET_KEY, 'parse.server.tests');
    
    FCTestFactory.testAdapter("S3Adapter",s3Adapter);
    
    // Test S3 with direct access
    var s3DirectAccessAdapter = new S3Adapter(process.env.S3_ACCESS_KEY, process.env.S3_SECRET_KEY, 'parse.server.tests', {
      directAccess: true
    });
    
    FCTestFactory.testAdapter("S3AdapterDirect", s3DirectAccessAdapter);
    
  } else if (!process.env.TRAVIS) {
    console.log("set S3_ACCESS_KEY and S3_SECRET_KEY to test S3Adapter")
  }
});
