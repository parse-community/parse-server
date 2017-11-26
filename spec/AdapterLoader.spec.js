
var loadAdapter = require("../src/Adapters/AdapterLoader").loadAdapter;
var FilesAdapter = require("@parse/fs-files-adapter").default;
var S3Adapter = require("@parse/s3-files-adapter").default;
var ParsePushAdapter = require("@parse/push-adapter").default;
const Config = require('../src/Config');

describe("AdapterLoader", ()=>{

  it("should instantiate an adapter from string in object", (done) => {
    var adapterPath = require('path').resolve("./spec/MockAdapter");

    var adapter = loadAdapter({
      adapter: adapterPath,
      options: {
        key: "value",
        foo: "bar"
      }
    });

    expect(adapter instanceof Object).toBe(true);
    expect(adapter.options.key).toBe("value");
    expect(adapter.options.foo).toBe("bar");
    done();
  });

  it("should instantiate an adapter from string", (done) => {
    var adapterPath = require('path').resolve("./spec/MockAdapter");
    var adapter = loadAdapter(adapterPath);

    expect(adapter instanceof Object).toBe(true);
    done();
  });

  it("should instantiate an adapter from string that is module", (done) => {
    var adapterPath = require('path').resolve("./src/Adapters/Files/FilesAdapter");
    var adapter = loadAdapter({
      adapter: adapterPath
    });

    expect(typeof adapter).toBe('object');
    expect(typeof adapter.createFile).toBe('function');
    expect(typeof adapter.deleteFile).toBe('function');
    expect(typeof adapter.getFileData).toBe('function');
    expect(typeof adapter.getFileLocation).toBe('function');
    done();
  });

  it("should instantiate an adapter from npm module", (done) => {
    var adapter = loadAdapter({
      module: '@parse/fs-files-adapter'
    });

    expect(typeof adapter).toBe('object');
    expect(typeof adapter.createFile).toBe('function');
    expect(typeof adapter.deleteFile).toBe('function');
    expect(typeof adapter.getFileData).toBe('function');
    expect(typeof adapter.getFileLocation).toBe('function');
    done();
  });

  it("should instantiate an adapter from function/Class", (done) => {
    var adapter = loadAdapter({
      adapter: FilesAdapter
    });
    expect(adapter instanceof FilesAdapter).toBe(true);
    done();
  });

  it("should instantiate the default adapter from Class", (done) => {
    var adapter = loadAdapter(null, FilesAdapter);
    expect(adapter instanceof FilesAdapter).toBe(true);
    done();
  });

  it("should use the default adapter", (done) => {
    var defaultAdapter = new FilesAdapter();
    var adapter = loadAdapter(null, defaultAdapter);
    expect(adapter instanceof FilesAdapter).toBe(true);
    done();
  });

  it("should use the provided adapter", (done) => {
    var originalAdapter = new FilesAdapter();
    var adapter = loadAdapter(originalAdapter);
    expect(adapter).toBe(originalAdapter);
    done();
  });

  it("should fail loading an improperly configured adapter", (done) => {
    var Adapter = function(options) {
      if (!options.foo) {
        throw "foo is required for that adapter";
      }
    }
    var adapterOptions = {
      param: "key",
      doSomething: function() {}
    };

    expect(() => {
      var adapter = loadAdapter(adapterOptions, Adapter);
      expect(adapter).toEqual(adapterOptions);
    }).not.toThrow("foo is required for that adapter");
    done();
  });

  it("should load push adapter from options", (done) => {
    var options = {
      android: {
        senderId: 'yolo',
        apiKey: 'yolo'
      }
    }
    expect(() => {
      var adapter = loadAdapter(undefined, ParsePushAdapter, options);
      expect(adapter.constructor).toBe(ParsePushAdapter);
      expect(adapter).not.toBe(undefined);
    }).not.toThrow();
    done();
  });

  it("should load custom push adapter from string (#3544)", (done) => {
    var adapterPath = require('path').resolve("./spec/MockPushAdapter");
    var options = {
      ios: {
        bundleId: 'bundle.id'
      }
    }
    const pushAdapterOptions = {
      adapter: adapterPath,
      options
    };
    expect(() => {
      reconfigureServer({
        push: pushAdapterOptions,
      }).then(() => {
        const config = Config.get(Parse.applicationId);
        const pushAdapter = config.pushWorker.adapter;
        expect(pushAdapter.getValidPushTypes()).toEqual(['ios']);
        expect(pushAdapter.options).toEqual(pushAdapterOptions);
        done();
      });
    }).not.toThrow();
  });

  it("should load S3Adapter from direct passing", (done) => {
    var s3Adapter = new S3Adapter("key", "secret", "bucket")
    expect(() => {
      var adapter = loadAdapter(s3Adapter, FilesAdapter);
      expect(adapter).toBe(s3Adapter);
    }).not.toThrow();
    done();
  })
});
