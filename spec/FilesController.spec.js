var FilesController = require('../src/Controllers/FilesController').FilesController;
var Config = require("../src/Config");

// Small additional tests to improve overall coverage
describe("FilesController",()=>{
  
  it("should properly expand objects", (done) => {
    var config = new Config(Parse.applicationId);
    var filesController = new FilesController();
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
})