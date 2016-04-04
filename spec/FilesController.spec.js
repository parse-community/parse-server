var GridStoreAdapter = require("../src/Adapters/Files/GridStoreAdapter").GridStoreAdapter;
var Config = require("../src/Config");
var FilesController = require('../src/Controllers/FilesController').default;


// Small additional tests to improve overall coverage
describe("FilesController",() =>{
  it("should properly expand objects", (done) => {

    var config = new Config(Parse.applicationId);
    var gridStoreAdapter = new GridStoreAdapter('mongodb://localhost:27017/parse');
    var filesController = new FilesController(gridStoreAdapter)
    var result = filesController.expandFilesInObject(config, function(){});

    expect(result).toBeUndefined();

    var fullFile = {
      type: '__type',
      url: "http://an.url"
    }

    var anObject = {
      aFile: fullFile
    }
    filesController.expandFilesInObject(config, anObject);
    expect(anObject.aFile.url).toEqual("http://an.url");

    done();
  })
});
