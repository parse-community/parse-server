
var FilesController = require('../src/Controllers/FilesController').FilesController;
var cache = require("../src/cache");

var testAdapter = function(name, adapter) {
  // Small additional tests to improve overall coverage
  
  var config = cache.apps.get(Parse.applicationId);
  var filesController = new FilesController(adapter);

  describe("FilesController with "+name,()=>{
    
    it("should properly expand objects", (done) => {
      
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
    
    it("should properly create, read, delete files", (done) => {
      var filename;
      filesController.createFile(config, "file.txt", "hello world").then( (result) => {
        ok(result.url);
        ok(result.name);
        filename = result.name;
        expect(result.name.match(/file.txt/)).not.toBe(null);
        return filesController.getFileData(config, filename);
      }, (err) => {
        fail("The adapter should create the file");
        console.error(err);
        done();
      }).then((result) => {
        expect(result instanceof Buffer).toBe(true);
        expect(result.toString('utf-8')).toEqual("hello world");
        return filesController.deleteFile(config, filename);
      }, (err) => {
        fail("The adapter should get the file");
        console.error(err);
        done();
      }).then((result) => {
        
        filesController.getFileData(config, filename).then((res) => {
          fail("the file should be deleted");
          done();
        }, (err) => {
          done();  
        });
        
      }, (err) => {
        fail("The adapter should delete the file");
        console.error(err);
        done();
      });
    }, 5000); // longer tests
  });
}

module.exports = {
  testAdapter: testAdapter
}
