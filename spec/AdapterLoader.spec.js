const { loadAdapter, loadModule } = require('../lib/Adapters/AdapterLoader');
const FilesAdapter = require('@parse/fs-files-adapter').default;
const MockFilesAdapter = require('mock-files-adapter');
const Config = require('../lib/Config');

describe('AdapterLoader', () => {
  it('should instantiate an adapter from string in object', done => {
    const adapterPath = require('path').resolve('./spec/support/MockAdapter');

    const adapter = loadAdapter({
      adapter: adapterPath,
      options: {
        key: 'value',
        foo: 'bar',
      },
    });

    expect(adapter instanceof Object).toBe(true);
    expect(adapter.options.key).toBe('value');
    expect(adapter.options.foo).toBe('bar');
    done();
  });

  it('should instantiate an adapter from string', done => {
    const adapterPath = require('path').resolve('./spec/support/MockAdapter');
    const adapter = loadAdapter(adapterPath);

    expect(adapter instanceof Object).toBe(true);
    done();
  });

  it('should instantiate an adapter from string that is module', done => {
    const adapterPath = require('path').resolve('./lib/Adapters/Files/FilesAdapter');
    const adapter = loadAdapter({
      adapter: adapterPath,
    });

    expect(typeof adapter).toBe('object');
    expect(typeof adapter.createFile).toBe('function');
    expect(typeof adapter.deleteFile).toBe('function');
    expect(typeof adapter.getFileData).toBe('function');
    expect(typeof adapter.getFileLocation).toBe('function');
    done();
  });

  it('should instantiate an adapter from npm module', done => {
    const adapter = loadAdapter({
      module: '@parse/fs-files-adapter',
    });

    expect(typeof adapter).toBe('object');
    expect(typeof adapter.createFile).toBe('function');
    expect(typeof adapter.deleteFile).toBe('function');
    expect(typeof adapter.getFileData).toBe('function');
    expect(typeof adapter.getFileLocation).toBe('function');
    done();
  });

  it('should instantiate an adapter from function/Class', done => {
    const adapter = loadAdapter({
      adapter: FilesAdapter,
    });
    expect(adapter instanceof FilesAdapter).toBe(true);
    done();
  });

  it('should instantiate the default adapter from Class', done => {
    const adapter = loadAdapter(null, FilesAdapter);
    expect(adapter instanceof FilesAdapter).toBe(true);
    done();
  });

  it('should use the default adapter', done => {
    const defaultAdapter = new FilesAdapter();
    const adapter = loadAdapter(null, defaultAdapter);
    expect(adapter instanceof FilesAdapter).toBe(true);
    done();
  });

  it('should use the provided adapter', done => {
    const originalAdapter = new FilesAdapter();
    const adapter = loadAdapter(originalAdapter);
    expect(adapter).toBe(originalAdapter);
    done();
  });

  it('should fail loading an improperly configured adapter', done => {
    const Adapter = function (options) {
      if (!options.foo) {
        throw 'foo is required for that adapter';
      }
    };
    const adapterOptions = {
      param: 'key',
      doSomething: function () {},
    };

    expect(() => {
      const adapter = loadAdapter(adapterOptions, Adapter);
      expect(adapter).toEqual(adapterOptions);
    }).not.toThrow('foo is required for that adapter');
    done();
  });

  it('should load push adapter from options', async () => {
    const options = {
      android: {
        firebaseServiceAccount: {
          "type": "service_account",
          "project_id": "example-xxxx",
          "private_key_id": "xxxx",
          "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCxFcVMD9L2xJWW\nEMi4w/XIBPvX5bTStIEdt4GY+yfrmCHspaVdgpTcHlTLA60sAGTFdorPprOwAm6f\njaTG4j86zfW25GF6AlFO/8vE2B0tjreuQQtcP9gkWJmsTp8yzXDirDQ43Kv93Kbc\nUPmsyAN5WB8XiFjjWLnFCeDiOVdd8sHfG0HYldNzyYwXrOTLE5kOjASYSJDzdrfI\nwN9PzZC7+cCy/DDzTRKQCqfz9pEZmxqJk4Id5HLVNkGKgji3C3b6o3MXWPS+1+zD\nGheKC9WLDZnCVycAnNHFiPpsp7R82lLKC3Dth37b6qzJO+HwfTmzCb0/xCVJ0/mZ\nC4Mxih/bAgMBAAECggEACbL1DvDw75Yd0U3TCJenDxEC0DTjHgVH6x5BaWUcLyGy\nffkmoQQFbjb1Evd9FSNiYZRYDv6E6feAIpoJ8+CxcOGV+zHwCtQ0qtyExx/FHVkr\nQ06JtkBC8N6vcAoQWyJ4c9nVtGWVv/5FX1zKCAYedpd2gH31zGHwLtQXLpzQZbNO\nO/0rcggg4unGSUIyw5437XiyckJ3QdneSEPe9HvY2wxLn/f1PjMpRYiNLBSuaFBJ\n+MYXr//Vh7cMInQk5/pMFbGxugNb7dtjgvm3LKRssKnubEOyrKldo8DVJmAvjhP4\nWboOOBVEo2ZhXgnBjeMvI8btXlJ85h9lZ7xwqfWsjQKBgQDkrrLpA3Mm21rsP1Ar\nMLEnYTdMZ7k+FTm5pJffPOsC7wiLWdRLwwrtb0V3kC3jr2K4SZY/OEV8IAWHfut/\n8mP8cPQPJiFp92iOgde4Xq/Ycwx4ZAXUj7mHHgywFi2K0xATzgc9sgX3NCVl9utR\nIU/FbEDCLxyD4T3Jb5gL3xFdhwKBgQDGPS46AiHuYmV7OG4gEOsNdczTppBJCgTt\nKGSJOxZg8sQodNJeWTPP2iQr4yJ4EY57NQmH7WSogLrGj8tmorEaL7I2kYlHJzGm\nniwApWEZlFc00xgXwV5d8ATfmAf8W1ZSZ6THbHesDUGjXSoL95k3KKXhnztjUT6I\n8d5qkCygDQKBgFN7p1rDZKVZzO6UCntJ8lJS/jIJZ6nPa9xmxv67KXxPsQnWSFdE\nI9gcF/sXCnmlTF/ElXIM4+j1c69MWULDRVciESb6n5YkuOnVYuAuyPk2vuWwdiRs\nN6mpAa7C2etlM+hW/XO7aswdIE4B/1QF2i5TX6zEMB/A+aJw98vVqmw/AoGADOm9\nUiADb9DPBXjGi6YueYD756mI6okRixU/f0TvDz+hEXWSonyzCE4QXx97hlC2dEYf\nKdCH5wYDpJ2HRVdBrBABTtaqF41xCYZyHVSof48PIyzA/AMnj3zsBFiV5JVaiSGh\nNTBWl0mBxg9yhrcJLvOh4pGJv81yAl+m+lAL6B0CgYEArtqtQ1YVLIUn4Pb/HDn8\nN8o7WbhloWQnG34iSsAG8yNtzbbxdugFrEm5ejPSgZ+dbzSzi/hizOFS/+/fwEdl\nay9jqY1fngoqSrS8eddUsY1/WAcmd6wPWEamsSjazA4uxQERruuFOi94E4b895KA\nqYe0A3xb0JL2ieAOZsn8XNA=\n-----END PRIVATE KEY-----\n",
          "client_email": "test@example.com",
          "client_id": "1",
          "auth_uri": "https://example.com",
          "token_uri": "https://example.com",
          "auth_provider_x509_cert_url": "https://example.com",
          "client_x509_cert_url": "https://example.com",
          "universe_domain": "example.com"
        }
      },
    };
    const ParsePushAdapter = await loadModule('@parse/push-adapter');
    expect(() => {
      const adapter = loadAdapter(undefined, ParsePushAdapter, options);
      expect(adapter.constructor).toBe(ParsePushAdapter);
      expect(adapter).not.toBe(undefined);
    }).not.toThrow();
  });

  it('should load custom push adapter from string (#3544)', done => {
    const adapterPath = require('path').resolve('./spec/support/MockPushAdapter');
    const options = {
      ios: {
        bundleId: 'bundle.id',
      },
    };
    const pushAdapterOptions = {
      adapter: adapterPath,
      options,
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

  it('should load custom database adapter from config', done => {
    const adapterPath = require('path').resolve('./spec/support/MockDatabaseAdapter');
    const options = {
      databaseURI: 'oracledb://user:password@localhost:1521/freepdb1',
      collectionPrefix: '',
    };
    const databaseAdapterOptions = {
      adapter: adapterPath,
      options,
    };
    expect(() => {
      const databaseAdapter = loadAdapter(databaseAdapterOptions);
      expect(databaseAdapter).not.toBe(undefined);
      expect(databaseAdapter.options).toEqual(options);
      expect(databaseAdapter.getDatabaseURI()).toEqual(options.databaseURI);
    }).not.toThrow();
    done();
  });

  it('should load file adapter from direct passing', done => {
    spyOn(console, 'warn').and.callFake(() => {});
    const mockFilesAdapter = new MockFilesAdapter('key', 'secret', 'bucket');
    expect(() => {
      const adapter = loadAdapter(mockFilesAdapter, FilesAdapter);
      expect(adapter).toBe(mockFilesAdapter);
    }).not.toThrow();
    done();
  });
});
