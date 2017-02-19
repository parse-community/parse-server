
var AdaptableController = require("../src/Controllers/AdaptableController").AdaptableController;
var FilesAdapter = require("../src/Adapters/Files/FilesAdapter").default;
var FilesController = require("../src/Controllers/FilesController").FilesController;

var MockController = function(options) {
  AdaptableController.call(this, options);
}
MockController.prototype = Object.create(AdaptableController.prototype);
MockController.prototype.constructor = AdaptableController;

describe("AdaptableController", ()=>{
  it("should use the provided adapter", (done) => {
    var adapter = new FilesAdapter();
    var controller = new FilesController(adapter);
    expect(controller.adapter).toBe(adapter);
    // make sure _adapter is private
    expect(controller._adapter).toBe(undefined);
    // Override _adapter is not doing anything
    controller._adapter = "Hello";
    expect(controller.adapter).toBe(adapter);
    done();
  });

  it("should throw when creating a new mock controller", (done) => {
    var adapter = new FilesAdapter();
    expect(() => {
      new MockController(adapter);
    }).toThrow();
    done();
  });

  it("should fail setting the wrong adapter to the controller", (done) => {
    function WrongAdapter() {}
    var adapter = new FilesAdapter();
    var controller = new FilesController(adapter);
    var otherAdapter = new WrongAdapter();
    expect(() => {
      controller.adapter = otherAdapter;
    }).toThrow();
    done();
  });

  it("should fail to instantiate a controller with wrong adapter", (done) => {
    function WrongAdapter() {}
    var adapter = new WrongAdapter();
    expect(() => {
      new FilesController(adapter);
    }).toThrow();
    done();
  });

  it("should fail to instantiate a controller without an adapter", (done) => {
    expect(() => {
      new FilesController();
    }).toThrow();
    done();
  });

  it("should accept an object adapter", (done) => {
    var adapter = {
      createFile: function() { },
      deleteFile: function() { },
      getFileData: function() { },
      getFileLocation: function() { },
    }
    expect(() => {
      new FilesController(adapter);
    }).not.toThrow();
    done();
  });

  it("should accept an object adapter", (done) => {
    function AGoodAdapter() {}
    AGoodAdapter.prototype.createFile = function() { };
    AGoodAdapter.prototype.deleteFile = function() { };
    AGoodAdapter.prototype.getFileData = function() { };
    AGoodAdapter.prototype.getFileLocation = function() { };

    var adapter = new AGoodAdapter();
    expect(() => {
      new FilesController(adapter);
    }).not.toThrow();
    done();
  });
});
