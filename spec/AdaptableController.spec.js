
var AdaptableController = require("../src/Controllers/AdaptableController").AdaptableController;
var FilesAdapter = require("../src/Adapters/Files/FilesAdapter").default;

describe("AdaptableController", ()=>{
    
  it("should instantiate an adapter from string in object", (done) => {
    var adapterPath = require('path').resolve("./spec/MockAdapter");
    var controller = new AdaptableController({
      adapter: adapterPath,
      key: "value", 
      foo: "bar"
    });
    
    expect(controller.adapter instanceof Object).toBe(true);
    expect(controller.options.key).toBe("value");
    expect(controller.options.foo).toBe("bar");
    expect(controller.adapter.options.key).toBe("value");
    expect(controller.adapter.options.foo).toBe("bar");
    done();
  });
  
  it("should instantiate an adapter from string", (done) => {
    var adapterPath = require('path').resolve("./spec/MockAdapter");
    var controller = new AdaptableController(adapterPath);
    
    expect(controller.adapter instanceof Object).toBe(true);
    done();
  });
  
  it("should instantiate an adapter from string that is module", (done) => {
    var adapterPath = require('path').resolve("./src/Adapters/Files/FilesAdapter");
    var controller = new AdaptableController({
      adapter: adapterPath
    });
    
    expect(controller.adapter instanceof FilesAdapter).toBe(true);
    done();
  });
  
  it("should instantiate an adapter from function/Class", (done) => {
    var controller = new AdaptableController({
      adapter: FilesAdapter
    });
    expect(controller.adapter instanceof FilesAdapter).toBe(true);
    done();
  });
  
  it("should instantiate the default adapter from Class", (done) => {
    var controller = new AdaptableController(null, FilesAdapter);
    expect(controller.adapter instanceof FilesAdapter).toBe(true);
    done();
  });
  
  it("should use the default adapter", (done) => {
    var adapter = new FilesAdapter();
    var controller = new AdaptableController(null, adapter);
    expect(controller.adapter).toBe(adapter);
    done();
  });
  
  it("should use the provided adapter", (done) => {
    var adapter = new FilesAdapter();
    var controller = new AdaptableController(adapter);
    expect(controller.adapter).toBe(adapter);
    done();
  });
});