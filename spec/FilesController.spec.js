const LoggerController = require('../lib/Controllers/LoggerController').LoggerController;
const WinstonLoggerAdapter = require('../lib/Adapters/Logger/WinstonLoggerAdapter')
  .WinstonLoggerAdapter;
const GridFSBucketAdapter = require('../lib/Adapters/Files/GridFSBucketAdapter')
  .GridFSBucketAdapter;
const Config = require('../lib/Config');
const FilesController = require('../lib/Controllers/FilesController').default;
const databaseURI = 'mongodb://localhost:27017/parse';

const mockAdapter = {
  createFile: () => {
    return Promise.reject(new Error('it failed with xyz'));
  },
  deleteFile: () => {},
  getFileData: () => {},
  getFileLocation: () => 'xyz',
  validateFilename: () => {
    return null;
  },
};

// Small additional tests to improve overall coverage
describe('FilesController', () => {
  it('should properly expand objects', done => {
    const config = Config.get(Parse.applicationId);
    const gridFSAdapter = new GridFSBucketAdapter('mongodb://localhost:27017/parse');
    const filesController = new FilesController(gridFSAdapter);
    const result = filesController.expandFilesInObject(config, function () {});

    expect(result).toBeUndefined();

    const fullFile = {
      type: '__type',
      url: 'http://an.url',
    };

    const anObject = {
      aFile: fullFile,
    };
    filesController.expandFilesInObject(config, anObject);
    expect(anObject.aFile.url).toEqual('http://an.url');

    done();
  });

  it_only_db('mongo')('should pass databaseOptions to GridFSBucketAdapter', async () => {
    await reconfigureServer({
      databaseURI: 'mongodb://localhost:27017/parse',
      filesAdapter: null,
      databaseAdapter: null,
      databaseOptions: {
        retryWrites: true,
      },
    });
    const config = Config.get(Parse.applicationId);
    expect(config.database.adapter._mongoOptions.retryWrites).toBeTrue();
    expect(config.filesController.adapter._mongoOptions.retryWrites).toBeTrue();
    expect(config.filesController.adapter._mongoOptions.enableSchemaHooks).toBeUndefined();
    expect(config.filesController.adapter._mongoOptions.schemaCacheTtl).toBeUndefined();
  });

  it('should create a server log on failure', done => {
    const logController = new LoggerController(new WinstonLoggerAdapter());

    reconfigureServer({ filesAdapter: mockAdapter })
      .then(() => new Parse.File('yolo.txt', [1, 2, 3], 'text/plain').save())
      .then(
        () => done.fail('should not succeed'),
        () => setImmediate(() => Promise.resolve('done'))
      )
      .then(() => new Promise(resolve => setTimeout(resolve, 200)))
      .then(() => logController.getLogs({ from: Date.now() - 1000, size: 1000 }))
      .then(logs => {
        // we get two logs here: 1. the source of the failure to save the file
        // and 2 the message that will be sent back to the client.

        const log1 = logs.find(x => x.message === 'Error creating a file:  it failed with xyz');
        expect(log1.level).toBe('error');

        const log2 = logs.find(x => x.message === 'it failed with xyz');
        expect(log2.level).toBe('error');
        expect(log2.code).toBe(130);

        done();
      });
  });

  it('should create a parse error when a string is returned', done => {
    const mock2 = mockAdapter;
    mock2.validateFilename = () => {
      return 'Bad file! No biscuit!';
    };
    const filesController = new FilesController(mockAdapter);
    const error = filesController.validateFilename();
    expect(typeof error).toBe('object');
    expect(error.message.indexOf('biscuit')).toBe(13);
    expect(error.code).toBe(Parse.Error.INVALID_FILE_NAME);
    mockAdapter.validateFilename = () => {
      return null;
    };
    done();
  });

  it('should add a unique hash to the file name when the preserveFileName option is false', done => {
    const config = Config.get(Parse.applicationId);
    const gridFSAdapter = new GridFSBucketAdapter('mongodb://localhost:27017/parse');
    spyOn(gridFSAdapter, 'createFile');
    gridFSAdapter.createFile.and.returnValue(Promise.resolve());
    const fileName = 'randomFileName.pdf';
    const regexEscapedFileName = fileName.replace(/\./g, '\\$&');
    const filesController = new FilesController(gridFSAdapter, null, {
      preserveFileName: false,
    });

    filesController.createFile(config, fileName);

    expect(gridFSAdapter.createFile).toHaveBeenCalledTimes(1);
    expect(gridFSAdapter.createFile.calls.mostRecent().args[0]).toMatch(
      `^.{32}_${regexEscapedFileName}$`
    );

    done();
  });

  it('should not add a unique hash to the file name when the preserveFileName option is true', done => {
    const config = Config.get(Parse.applicationId);
    const gridFSAdapter = new GridFSBucketAdapter('mongodb://localhost:27017/parse');
    spyOn(gridFSAdapter, 'createFile');
    gridFSAdapter.createFile.and.returnValue(Promise.resolve());
    const fileName = 'randomFileName.pdf';
    const filesController = new FilesController(gridFSAdapter, null, {
      preserveFileName: true,
    });

    filesController.createFile(config, fileName);

    expect(gridFSAdapter.createFile).toHaveBeenCalledTimes(1);
    expect(gridFSAdapter.createFile.calls.mostRecent().args[0]).toEqual(fileName);

    done();
  });

  it('should handle adapter without getMetadata', async () => {
    const gridFSAdapter = new GridFSBucketAdapter(databaseURI);
    gridFSAdapter.getMetadata = null;
    const filesController = new FilesController(gridFSAdapter);

    const result = await filesController.getMetadata();
    expect(result).toEqual({});
  });

  it('should reject slashes in file names', done => {
    const gridFSAdapter = new GridFSBucketAdapter('mongodb://localhost:27017/parse');
    const fileName = 'foo/randomFileName.pdf';
    expect(gridFSAdapter.validateFilename(fileName)).not.toBe(null);
    done();
  });

  it('should also reject slashes in file names', done => {
    const gridFSAdapter = new GridFSBucketAdapter('mongodb://localhost:27017/parse');
    const fileName = 'foo/randomFileName.pdf';
    expect(gridFSAdapter.validateFilename(fileName)).not.toBe(null);
    done();
  });

  it('should allow Parse.File uploads over and under 512MB', async done => {
    // add required modules
    const fs = require('fs');
    const path = require('path');
    const axios = require('axios');


    const ONE_GB_BYTES = 1024 * 1024 * 1024;
    const V8_STRING_LIMIT_BYTES = 536_870_912;
    // Add 50 MB to test the limit
    const LARGE_FILE_BTYES = V8_STRING_LIMIT_BYTES + 50 * 1024 * 1024;
    const SMALL_FILE_BTYES = 1024 * 1024;

    reconfigureServer({
      // Increase the max upload size to 1GB
      maxUploadSize: ONE_GB_BYTES,
      // Change to an available port to avoid
      // "Uncaught exception: Error: listen EADDRINUSE: address already in use 0.0.0.0:8378"
      port: 8384,
    });


    /**
     * Quick helper function to upload the file to the server via the REST API
     * We do this becuase creating a Parse.File object with a file over 512MB
     * will try to the the Web API FileReader API, which will fail the test
     *
     * @param {string} fileName the name of the file
     * @param {string} filePath the path to the file locally
     * @returns
     */
    const postFile = async (fileName, filePath) => {
      const url = `${Parse.serverURL}/files/${fileName}`;
      const headers = {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Master-Key': Parse.masterKey,
        'Content-Type': 'multipart/form-data',
      };

      // Create a FormData object to send the file
      const formData = new FormData();
      formData.append('file', fs.createReadStream(filePath));

      // Use axios to send the file
      return axios.post(url, formData, { headers })
    };

    // Make a exact 512MB file
    const exactFileRawData = Buffer.alloc(V8_STRING_LIMIT_BYTES);
    const exactFileName = 'exactfile.txt';
    // Write the file to disk locally
    await fs.promises.writeFile(exactFileName, exactFileRawData);
    const exactFilePath = path.resolve(exactFileName);


    // make a large file
    const largeFileRawData = Buffer.alloc(LARGE_FILE_BTYES);
    const largeFileName = 'bigfile.txt';
    // Write the file to disk locally
    await fs.promises.writeFile(largeFileName, largeFileRawData);
    const largeFilePath = path.resolve(largeFileName);

    // Make a 1MB file
    const smallFileRawData = Buffer.alloc(SMALL_FILE_BTYES);
    const smallFileName = 'smallfile.txt';
    // Write the file to disk locally
    await fs.promises.writeFile(smallFileName, smallFileRawData);
    const smallFilePath = path.resolve(smallFileName);

    try {
      // Test a small file
      const smallFileRes = await postFile(smallFileName, smallFilePath);
      expect(smallFileRes.data.url).not.toBe(null);

      // Test a file that is exactly 512MB
      const exactFileRes = await postFile(exactFileName, exactFilePath);
      expect(exactFileRes.data.url).not.toBe(null);

      // Test a large file
      const largeFileRes = await postFile(largeFileName, largeFilePath);
      expect(largeFileRes.data.url).not.toBe(null);

      // Test a normal Parse.File object
      const smallFile = new Parse.File(smallFileName, [...smallFileRawData]);
      const normalSmallFile =  await smallFile.save();
      expect(normalSmallFile.url()).not.toBe(null);

    } catch (error) {
      fail(error);
    } finally {
      done();
    }
  });

});
