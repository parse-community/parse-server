
var AdapterLoader = require("../src/Adapters/AdapterLoader").AdapterLoader;
var FilesAdapter = require("../src/Adapters/Files/FilesAdapter").default;

describe("AdaptableController", ()=>{
    
  it("should instantiate an adapter from string in object", (done) => {
    var adapterPath = require('path').resolve("./spec/MockAdapter");

    var adapter = AdapterLoader.load({
      adapter: adapterPath,
      key: "value", 
      foo: "bar"
    });
    
    expect(adapter instanceof Object).toBe(true);
    expect(adapter.options.key).toBe("value");
    expect(adapter.options.foo).toBe("bar");
    done();
  });
  
  it("should instantiate an adapter from string", (done) => {
    var adapterPath = require('path').resolve("./spec/MockAdapter");
    var adapter = AdapterLoader.load(adapterPath);
    
    expect(adapter instanceof Object).toBe(true);
    expect(adapter.options).toBe(adapterPath);
    done();
  });
  
  it("should instantiate an adapter from string that is module", (done) => {
    var adapterPath = require('path').resolve("./src/Adapters/Files/FilesAdapter");
    var adapter = AdapterLoader.load({
      adapter: adapterPath
    });
    
    expect(adapter instanceof FilesAdapter).toBe(true);
    done();
  });
  
  it("should instantiate an adapter from function/Class", (done) => {
    var adapter = AdapterLoader.load({
      adapter: FilesAdapter
    });
    expect(adapter instanceof FilesAdapter).toBe(true);
    done();
  });
  
  it("should instantiate the default adapter from Class", (done) => {
    var adapter = AdapterLoader.load(null, FilesAdapter);
    expect(adapter instanceof FilesAdapter).toBe(true);
    done();
  });
  
  it("should use the default adapter", (done) => {
    var defaultAdapter = new FilesAdapter();
    var adapter = AdapterLoader.load(null, defaultAdapter);
    expect(adapter instanceof FilesAdapter).toBe(true);
    done();
  });
  
  it("should use the provided adapter", (done) => {
    var originalAdapter = new FilesAdapter();
    var adapter = AdapterLoader.load(originalAdapter);
    expect(adapter).toBe(originalAdapter);
    done();
  });
});