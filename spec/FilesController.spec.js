const LoggerController = require('../lib/Controllers/LoggerController').LoggerController;
const WinstonLoggerAdapter = require('../lib/Adapters/Logger/WinstonLoggerAdapter')
  .WinstonLoggerAdapter;
const GridFSBucketAdapter = require('../lib/Adapters/Files/GridFSBucketAdapter')
  .GridFSBucketAdapter;
const Config = require('../lib/Config');
const FilesController = require('../lib/Controllers/FilesController').default;
const {
  normalizeFilename,
  validateFilename,
  validateFilepath,
} = require('../lib/Adapters/Files/FilesAdapter');
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
  it('should properly expand objects with sync getFileLocation', async () => {
    const config = Config.get(Parse.applicationId);
    const gridFSAdapter = new GridFSBucketAdapter('mongodb://localhost:27017/parse');
    gridFSAdapter.getFileLocation = (config, filename) => {
      return config.mount + '/files/' + config.applicationId + '/' + encodeURIComponent(filename);
    }
    const filesController = new FilesController(gridFSAdapter);
    const result = await filesController.expandFilesInObject(config, function () { });

    expect(result).toBeUndefined();

    const fullFile = {
      type: '__type',
      url: 'http://an.url',
    };

    const anObject = {
      aFile: fullFile,
    };
    await filesController.expandFilesInObject(config, anObject);
    expect(anObject.aFile.url).toEqual('http://an.url');
  });

  it('should properly expand objects with async getFileLocation', async () => {
    const config = Config.get(Parse.applicationId);
    const gridFSAdapter = new GridFSBucketAdapter('mongodb://localhost:27017/parse');
    gridFSAdapter.getFileLocation = async (config, filename) => {
      await Promise.resolve();
      return config.mount + '/files/' + config.applicationId + '/' + encodeURIComponent(filename);
    }
    const filesController = new FilesController(gridFSAdapter);
    const result = await filesController.expandFilesInObject(config, function () { });

    expect(result).toBeUndefined();

    const fullFile = {
      type: '__type',
      url: 'http://an.url',
    };

    const anObject = {
      aFile: fullFile,
    };
    await filesController.expandFilesInObject(config, anObject);
    expect(anObject.aFile.url).toEqual('http://an.url');
  });

  it('should call getFileLocation when config.fileKey is undefined', async () => {
    const config = {};
    const gridFSAdapter = new GridFSBucketAdapter('mongodb://localhost:27017/parse');

    const fullFile = {
      name: 'mock-name',
      __type: 'File',
    };
    gridFSAdapter.getFileLocation = jasmine.createSpy('getFileLocation').and.returnValue(Promise.resolve('mock-url'));
    const filesController = new FilesController(gridFSAdapter);

    const anObject = { aFile: fullFile };
    await filesController.expandFilesInObject(config, anObject);
    expect(gridFSAdapter.getFileLocation).toHaveBeenCalledWith(config, fullFile.name);
    expect(anObject.aFile.url).toEqual('mock-url');
  });

  it('should call getFileLocation when config.fileKey is defined', async () => {
    const config = { fileKey: 'mock-key' };
    const gridFSAdapter = new GridFSBucketAdapter('mongodb://localhost:27017/parse');

    const fullFile = {
      name: 'mock-name',
      __type: 'File',
    };
    gridFSAdapter.getFileLocation = jasmine.createSpy('getFileLocation').and.returnValue(Promise.resolve('mock-url'));
    const filesController = new FilesController(gridFSAdapter);

    const anObject = { aFile: fullFile };
    await filesController.expandFilesInObject(config, anObject);
    expect(gridFSAdapter.getFileLocation).toHaveBeenCalledWith(config, fullFile.name);
    expect(anObject.aFile.url).toEqual('mock-url');
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
    const error = filesController.validateFilename('test.txt');
    expect(typeof error).toBe('object');
    expect(error.message.indexOf('biscuit')).toBe(13);
    expect(error.code).toBe(Parse.Error.INVALID_FILE_NAME);
    mockAdapter.validateFilename = () => {
      return null;
    };
    done();
  });

  it('should add a unique hash to the file name when the preserveFileName option is false', async () => {
    const config = Config.get(Parse.applicationId);
    const gridFSAdapter = new GridFSBucketAdapter('mongodb://localhost:27017/parse');
    spyOn(gridFSAdapter, 'createFile');
    gridFSAdapter.createFile.and.returnValue(Promise.resolve());
    const fileName = 'randomFileName.pdf';
    const regexEscapedFileName = fileName.replace(/\./g, '\\$&');
    const filesController = new FilesController(gridFSAdapter, null, {
      preserveFileName: false,
    });

    await filesController.createFile(config, fileName);

    expect(gridFSAdapter.createFile).toHaveBeenCalledTimes(1);
    expect(gridFSAdapter.createFile.calls.mostRecent().args[0]).toMatch(
      `^.{32}_${regexEscapedFileName}$`
    );
  });

  it('should not add a unique hash to the file name when the preserveFileName option is true', async () => {
    const config = Config.get(Parse.applicationId);
    const gridFSAdapter = new GridFSBucketAdapter('mongodb://localhost:27017/parse');
    spyOn(gridFSAdapter, 'createFile');
    gridFSAdapter.createFile.and.returnValue(Promise.resolve());
    const fileName = 'randomFileName.pdf';
    const filesController = new FilesController(gridFSAdapter, null, {
      preserveFileName: true,
    });

    await filesController.createFile(config, fileName);

    expect(gridFSAdapter.createFile).toHaveBeenCalledTimes(1);
    expect(gridFSAdapter.createFile.calls.mostRecent().args[0]).toEqual(fileName);
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

  it('should allow accented characters in file names', done => {
    const gridFSAdapter = new GridFSBucketAdapter('mongodb://localhost:27017/parse');
    const fileName = 'café.txt';
    expect(gridFSAdapter.validateFilename(fileName)).toBe(null);
    done();
  });

  it('rejects non-string filenames without throwing', () => {
    for (const bad of [null, undefined, 42, {}, '']) {
      const error = validateFilename(bad);
      expect(error).not.toBeNull();
      expect(error.code).toBe(Parse.Error.INVALID_FILE_NAME);
      expect(error.message).toMatch(/string/i);
    }
  });

  describe('validateFilepath', () => {
    const expectRejected = (filepath, messagePart) => {
      const error = validateFilepath(filepath);
      expect(error).not.toBeNull();
      expect(error.code).toBe(Parse.Error.INVALID_FILE_NAME);
      if (messagePart) {
        expect(error.message).toContain(messagePart);
      }
    };

    it('accepts valid single- and multi-segment paths', () => {
      for (const valid of [
        'file.txt',
        'docs/file.txt',
        'docs/caf\u00e9.txt',
        'docs/cafe\u0301.txt',
        'a..b.txt',
        'docs/a..b.txt',
        'docs/metadata/file.txt',
      ]) {
        expect(validateFilepath(valid)).toBeNull();
      }
    });

    it('rejects non-string filepaths without throwing', () => {
      for (const bad of [null, undefined, 42, {}, '']) {
        expectRejected(bad, 'string');
      }
    });

    it('rejects path traversal segments', () => {
      for (const bad of ['..', 'foo/../bar', '../bar', 'foo/..']) {
        expectRejected(bad, '..');
      }
    });

    it('rejects leading or trailing slashes', () => {
      for (const bad of ['/foo', 'foo/', '/foo/bar', 'foo/bar/']) {
        expectRejected(bad, 'start or end');
      }
    });

    it('rejects consecutive slashes', () => {
      expectRejected('foo//bar', 'consecutive slashes');
    });

    it('rejects reserved first segments only', () => {
      expectRejected('metadata', 'reserved segment');
      expectRejected('metadata/evil.txt', 'reserved segment');
      expect(validateFilepath('docs/metadata/evil.txt')).toBeNull();
    });

    it('rejects invalid nested filename segments', () => {
      expectRejected('docs/bad?.txt', 'invalid characters');
      expectRejected(`docs/_${'a'.repeat(128)}`, 'too long');
      expectRejected('docs/..', '..');
    });
  });

  it('rejects non-string filenames from FilesController without throwing', () => {
    const filesController = new FilesController(mockAdapter);
    const error = filesController.validateFilename();
    expect(typeof error).toBe('object');
    expect(error.code).toBe(Parse.Error.INVALID_FILE_NAME);
    expect(error.message).toMatch(/string/i);
  });

  it('accepts NFC and NFD accented filenames after normalization', () => {
    expect(validateFilename('caf\u00e9.txt')).toBeNull();
    expect(validateFilename('cafe\u0301.txt')).toBeNull();
  });

  it('rejects path traversal filenames and non-decimal number characters', () => {
    const dotDotError = validateFilename('..');
    expect(dotDotError).not.toBeNull();
    expect(dotDotError.message).toContain('..');

    for (const bad of ['\u2160.txt', '\u00bd.txt']) {
      const error = validateFilename(bad);
      expect(error).not.toBeNull();
      expect(error.message).toContain('invalid characters');
    }
    expect(validateFilename('123.txt')).toBeNull();
  });


  it('returns non-string filenames unchanged from normalizeFilename', () => {
    expect(normalizeFilename(null)).toBeNull();
    expect(normalizeFilename(42)).toBe(42);
  });

  it('rejects invalid filename segments', () => {
    const tooLongError = validateFilename(`_${'a'.repeat(128)}`);
    expect(tooLongError).not.toBeNull();
    expect(tooLongError.message).toContain('too long');

    const invalidCharsError = validateFilename('bad?.txt');
    expect(invalidCharsError).not.toBeNull();
    expect(invalidCharsError.message).toContain('invalid characters');
  });
});
