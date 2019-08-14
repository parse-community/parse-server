const LoggerController = require('../lib/Controllers/LoggerController')
  .LoggerController;
const WinstonLoggerAdapter = require('../lib/Adapters/Logger/WinstonLoggerAdapter')
  .WinstonLoggerAdapter;
const GridFSBucketAdapter = require('../lib/Adapters/Files/GridFSBucketAdapter')
  .GridFSBucketAdapter;
const Config = require('../lib/Config');
const FilesController = require('../lib/Controllers/FilesController').default;

const mockAdapter = {
  createFile: () => {
    return Promise.reject(new Error('it failed with xyz'));
  },
  deleteFile: () => {},
  getFileData: () => {},
  getFileLocation: () => 'xyz',
};

// Small additional tests to improve overall coverage
describe('FilesController', () => {
  it('should properly expand objects', done => {
    const config = Config.get(Parse.applicationId);
    const gridStoreAdapter = new GridFSBucketAdapter(
      'mongodb://localhost:27017/parse'
    );
    const filesController = new FilesController(gridStoreAdapter);
    const result = filesController.expandFilesInObject(config, function() {});

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

  it('should create a server log on failure', done => {
    const logController = new LoggerController(new WinstonLoggerAdapter());

    reconfigureServer({ filesAdapter: mockAdapter })
      .then(() => new Parse.File('yolo.txt', [1, 2, 3], 'text/plain').save())
      .then(
        () => done.fail('should not succeed'),
        () => setImmediate(() => Promise.resolve('done'))
      )
      .then(() => new Promise(resolve => setTimeout(resolve, 200)))
      .then(() =>
        logController.getLogs({ from: Date.now() - 1000, size: 1000 })
      )
      .then(logs => {
        // we get two logs here: 1. the source of the failure to save the file
        // and 2 the message that will be sent back to the client.

        const log1 = logs.find(
          x => x.message === 'Error creating a file: it failed with xyz'
        );
        expect(log1.level).toBe('error');

        const log2 = logs.find(
          x => x.message === 'Could not store file: yolo.txt.'
        );
        expect(log2.level).toBe('error');
        expect(log2.code).toBe(130);

        done();
      });
  });

  it('should add a unique hash to the file name when the preserveFileName option is false', done => {
    const config = Config.get(Parse.applicationId);
    const gridStoreAdapter = new GridFSBucketAdapter(
      'mongodb://localhost:27017/parse'
    );
    spyOn(gridStoreAdapter, 'createFile');
    gridStoreAdapter.createFile.and.returnValue(Promise.resolve());
    const fileName = 'randomFileName.pdf';
    const regexEscapedFileName = fileName.replace(/\./g, '\\$&');
    const filesController = new FilesController(gridStoreAdapter, null, {
      preserveFileName: false,
    });

    filesController.createFile(config, fileName);

    expect(gridStoreAdapter.createFile).toHaveBeenCalledTimes(1);
    expect(gridStoreAdapter.createFile.calls.mostRecent().args[0]).toMatch(
      `^.{32}_${regexEscapedFileName}$`
    );

    done();
  });

  it('should not add a unique hash to the file name when the preserveFileName option is true', done => {
    const config = Config.get(Parse.applicationId);
    const gridStoreAdapter = new GridFSBucketAdapter(
      'mongodb://localhost:27017/parse'
    );
    spyOn(gridStoreAdapter, 'createFile');
    gridStoreAdapter.createFile.and.returnValue(Promise.resolve());
    const fileName = 'randomFileName.pdf';
    const filesController = new FilesController(gridStoreAdapter, null, {
      preserveFileName: true,
    });

    filesController.createFile(config, fileName);

    expect(gridStoreAdapter.createFile).toHaveBeenCalledTimes(1);
    expect(gridStoreAdapter.createFile.calls.mostRecent().args[0]).toEqual(
      fileName
    );

    done();
  });
});
