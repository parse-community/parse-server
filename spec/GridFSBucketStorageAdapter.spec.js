const GridFSBucketAdapter = require('../lib/Adapters/Files/GridFSBucketAdapter')
  .GridFSBucketAdapter;
const { randomString } = require('../lib/cryptoUtils');
const databaseURI = 'mongodb://localhost:27017/parse';
const request = require('../lib/request');

async function expectMissingFile(gfsAdapter, name) {
  try {
    await gfsAdapter.getFileData(name);
    fail('should have thrown');
  } catch (e) {
    expect(e.message).toEqual(`FileNotFound: file ${name} was not found`);
  }
}

const TYPES = ['string', 'blob'];

const createData = (type, data) => {
  switch (type) {
    case 'string':
      return data;
    case 'blob':
      return new Blob([data]);
    default:
      throw new Error(`Invalid type: ${type}`);
  }
}

const getDataAsString = async (type, data, encoding = 'utf8') => {
  switch (type) {
    case 'string':
      return data.toString(encoding);
    case 'blob':
      return (typeof Blob !== 'undefined' && data instanceof Blob)
        ? await data.text(encoding) :
        data.toString(encoding);
    default:
      throw new Error(`Invalid type: ${type}`);
  }
}

describe_only_db('mongo')('GridFSBucket', () => {
  beforeEach(async () => {
    const gsAdapter = new GridFSBucketAdapter(databaseURI);
    const db = await gsAdapter._connect();
    await db.dropDatabase();
  });

  it('should connect to mongo with the supported database options', async () => {
    const databaseURI = 'mongodb://localhost:27017/parse';
    const gfsAdapter = new GridFSBucketAdapter(databaseURI, {
      retryWrites: true,
      // these are not supported by the mongo client
      enableSchemaHooks: true,
      schemaCacheTtl: 5000,
      maxTimeMS: 30000,
    });

    const db = await gfsAdapter._connect();
    const status = await db.admin().serverStatus();
    expect(status.connections.current > 0).toEqual(true);
    expect(db.options?.retryWrites).toEqual(true);
  });

  it('should save an encrypted file that can only be decrypted by a GridFS adapter with the encryptionKey', async () => {
    const unencryptedAdapter = new GridFSBucketAdapter(databaseURI);
    const encryptedAdapter = new GridFSBucketAdapter(
      databaseURI,
      {},
      '89E4AFF1-DFE4-4603-9574-BFA16BB446FD'
    );

    for (const type of TYPES) {
      const fileName = `myFileName-${type}`;
      await expectMissingFile(encryptedAdapter, fileName);
      const rawData = 'abcdefghi';

      const originalData = createData(type, rawData);
      await encryptedAdapter.createFile(fileName, originalData);

      const unencryptedResult = await unencryptedAdapter.getFileData(fileName);
      expect(unencryptedResult.toString('utf8')).not.toBe(rawData);

      const encryptedResult = await encryptedAdapter.getFileData(fileName);
      expect(encryptedResult.toString('utf8')).toBe(rawData);
    }
  });

  it('should rotate key of all unencrypted GridFS files to encrypted files', async () => {
    const unencryptedAdapter = new GridFSBucketAdapter(databaseURI);
    const encryptedAdapter = new GridFSBucketAdapter(
      databaseURI,
      {},
      '89E4AFF1-DFE4-4603-9574-BFA16BB446FD'
    );

    for (const type of TYPES) {
      const rawData = [`hello world ${type}`, `hello new world ${type}`];
      const fileNames = ['file1.txt', 'file2.txt'];

      // Store unencrypted files and verify
      for (let i = 0; i < fileNames.length; i++) {
        const data = createData(type, rawData[i]);
        await unencryptedAdapter.createFile(fileNames[i], data);
        const unencryptedResult = await unencryptedAdapter.getFileData(fileNames[i]);
        expect(await getDataAsString(type, unencryptedResult)).toBe(rawData[i]);
      }

      // Rotate encryption key and verify
      const { rotated, notRotated } = await encryptedAdapter.rotateEncryptionKey();
      expect(rotated.length).toEqual(fileNames.length);
      fileNames.forEach(fileName => {
        expect(rotated.includes(fileName)).toBe(true);
      });
      expect(notRotated.length).toEqual(0);

      // clear files for next iteration
      for (let i = 0; i < fileNames.length; i++) {
        await unencryptedAdapter.deleteFile(fileNames[i]);
        expectMissingFile(unencryptedAdapter, fileNames[i]);
      }
    }
  });

  it('should rotate key of all old encrypted GridFS files to encrypted files', async () => {
    const oldEncryptionKey = 'oldKeyThatILoved';
    const oldEncryptedAdapter = new GridFSBucketAdapter(databaseURI, {}, oldEncryptionKey);
    const encryptedAdapter = new GridFSBucketAdapter(databaseURI, {}, 'newKeyThatILove');

    for (const type of TYPES) {
      const rawData = [`hello world ${type}`, `hello new world ${type}`];
      const fileNames = ['file1.txt', 'file2.txt'];

      //Store unecrypted files
      for (let i = 0; i < fileNames.length; i++) {
        await oldEncryptedAdapter.createFile(fileNames[i], createData(type, rawData[i]));
        const oldEncryptedResult = await oldEncryptedAdapter.getFileData(fileNames[i]);
        expect(await getDataAsString(type, oldEncryptedResult)).toBe(rawData[i]);
      }

      //Check if encrypted adapter can read data and make sure it's not the same as unEncrypted adapter
      const { rotated, notRotated } = await encryptedAdapter.rotateEncryptionKey({
        oldKey: oldEncryptionKey,
      });
      expect(rotated.length).toEqual(2);
      expect(
        rotated.filter(function (value) {
          return value === fileNames[0];
        }).length
      ).toEqual(1);
      expect(
        rotated.filter(function (value) {
          return value === fileNames[1];
        }).length
      ).toEqual(1);
      expect(notRotated.length).toEqual(0);

      // make sure old encrypted files can't be decrypted
      for (let i = 0; i < fileNames.length; i++) {
        const result = await encryptedAdapter.getFileData(fileNames[i]);
        expect(result instanceof Buffer).toBe(true);
        expect(await getDataAsString(type, result)).toEqual(rawData[i]);

        let decryptionError;
        let encryptedData;
        try {
          encryptedData = await oldEncryptedAdapter.getFileData(fileNames[i]);
        } catch (err) {
          decryptionError = err;
        }
        expect(decryptionError).toMatch('Error');
        expect(encryptedData).toBeUndefined();

        // clear files for next iteration
        await oldEncryptedAdapter.deleteFile(fileNames[i]);
        expectMissingFile(oldEncryptedAdapter, fileNames[i]);
      }
    }
  });

  it('should rotate key of all old encrypted GridFS files to unencrypted files', async () => {
    const oldEncryptionKey = 'oldKeyThatILoved';
    const oldEncryptedAdapter = new GridFSBucketAdapter(databaseURI, {}, oldEncryptionKey);
    const unEncryptedAdapter = new GridFSBucketAdapter(databaseURI);
    for (const type of TYPES) {
      const rawData = [`hello world ${type}`, `hello new world ${type}`];
      const fileNames = ['file1.txt', 'file2.txt'];

      //Store unecrypted files
      for (let i = 0; i < fileNames.length; i++) {
        await oldEncryptedAdapter.createFile(fileNames[i], createData(type, rawData[i]));
        const oldEncryptedResult = await oldEncryptedAdapter.getFileData(fileNames[i]);
        expect(await getDataAsString(type, oldEncryptedResult)).toBe(rawData[i]);
      }

      //Check if unEncrypted adapter can read data and make sure it's not the same as oldEncrypted adapter
      const { rotated, notRotated } = await unEncryptedAdapter.rotateEncryptionKey({
        oldKey: oldEncryptionKey,
      });
      expect(rotated.length).toEqual(2);
      expect(
        rotated.filter(function (value) {
          return value === fileNames[0];
        }).length
      ).toEqual(1);
      expect(
        rotated.filter(function (value) {
          return value === fileNames[1];
        }).length
      ).toEqual(1);
      expect(notRotated.length).toEqual(0);

      // make sure the files can be decrypted by the new adapter
      for (let i = 0; i < fileNames.length; i++) {
        const result = await unEncryptedAdapter.getFileData(fileNames[i]);
        expect(result instanceof Buffer).toBe(true);
        expect(await getDataAsString(type, result)).toEqual(rawData[i]);
        let decryptionError;
        let encryptedData;
        try {
          encryptedData = await oldEncryptedAdapter.getFileData(fileNames[i]);
        } catch (err) {
          decryptionError = err;
        }
        expect(decryptionError).toMatch('Error');
        expect(encryptedData).toBeUndefined();

        // clear files for next iteration
        await oldEncryptedAdapter.deleteFile(fileNames[i]);
        expectMissingFile(oldEncryptedAdapter, fileNames[i]);
      }

    }
  });

  it('should only encrypt specified fileNames', async () => {
    const oldEncryptionKey = 'oldKeyThatILoved';
    const oldEncryptedAdapter = new GridFSBucketAdapter(databaseURI, {}, oldEncryptionKey);
    const encryptedAdapter = new GridFSBucketAdapter(databaseURI, {}, 'newKeyThatILove');
    const unEncryptedAdapter = new GridFSBucketAdapter(databaseURI);

    for (const type of TYPES) {
      const rawData = [`hello world ${type}`, `hello new world ${type}`];
      const fileNames = ['file1.txt', 'file2.txt'];

      //Store unecrypted files
      for (let i = 0; i < fileNames.length; i++) {
        await oldEncryptedAdapter.createFile(fileNames[i], createData(type, rawData[i]));
        const oldEncryptedResult = await oldEncryptedAdapter.getFileData(fileNames[i]);
        expect(await getDataAsString(type, oldEncryptedResult)).toBe(rawData[i]);
      }


      //Inject unecrypted file to see if causes an issue
      const fileName3 = 'file3.txt';
      const data3 = 'hello past world';
      await unEncryptedAdapter.createFile(fileName3, data3, 'text/utf8');

      //Check if encrypted adapter can read data and make sure it's not the same as unEncrypted adapter
      const { rotated, notRotated } = await encryptedAdapter.rotateEncryptionKey({
        oldKey: oldEncryptionKey,
        fileNames,
      });
      expect(rotated.length).toEqual(2);
      expect(
        rotated.filter(function (value) {
          return value === fileNames[0];
        }).length
      ).toEqual(1);
      expect(
        rotated.filter(function (value) {
          return value === fileNames[1];
        }).length
      ).toEqual(1);
      expect(notRotated.length).toEqual(0);
      expect(
        rotated.filter(function (value) {
          return value === fileName3;
        }).length
      ).toEqual(0);

      for (let i = 0; i < fileNames.length; i++) {
        const result = await encryptedAdapter.getFileData(fileNames[i]);
        expect(result instanceof Buffer).toBe(true);
        expect(await getDataAsString(type, result)).toEqual(rawData[i]);
        let decryptionError;
        let encryptedData;
        try {
          encryptedData = await oldEncryptedAdapter.getFileData(fileNames[i]);
        } catch (err) {
          decryptionError = err;
        }
        expect(decryptionError).toMatch('Error');
        expect(encryptedData).toBeUndefined();

        // clear files for next iteration
        await oldEncryptedAdapter.deleteFile(fileNames[i]);
        expectMissingFile(oldEncryptedAdapter, fileNames[i]);
      }

      // clear file3 for next iteration
      await unEncryptedAdapter.deleteFile(fileName3);
      expectMissingFile(unEncryptedAdapter, fileName3);
    }
  });

  it("should return fileNames of those it can't encrypt with the new key", async () => {
    const oldEncryptionKey = 'oldKeyThatILoved';
    const oldEncryptedAdapter = new GridFSBucketAdapter(databaseURI, {}, oldEncryptionKey);
    const encryptedAdapter = new GridFSBucketAdapter(databaseURI, {}, 'newKeyThatILove');
    const unEncryptedAdapter = new GridFSBucketAdapter(databaseURI);

    for (const type of TYPES) {
      const rawData = [`hello world ${type}`, `hello new world ${type}`];
      const fileNames = ['file1.txt', 'file2.txt'];

      //Store unecrypted files
      for (let i = 0; i < fileNames.length; i++) {
        await oldEncryptedAdapter.createFile(fileNames[i], createData(type, rawData[i]));
        const oldEncryptedResult = await oldEncryptedAdapter.getFileData(fileNames[i]);
        expect(await getDataAsString(type, oldEncryptedResult)).toBe(rawData[i]);
      }

      //Inject unecrypted file to see if causes an issue
      const fileName3 = 'file3.txt';
      const data3 = 'hello past world';
      await unEncryptedAdapter.createFile(fileName3, data3, 'text/utf8');

      //Check if encrypted adapter can read data and make sure it's not the same as unEncrypted adapter
      const { rotated, notRotated } = await encryptedAdapter.rotateEncryptionKey({
        oldKey: oldEncryptionKey,
      });
      expect(rotated.length).toEqual(2);
      expect(
        rotated.filter(function (value) {
          return value === fileNames[0];
        }).length
      ).toEqual(1);
      expect(
        rotated.filter(function (value) {
          return value === fileNames[1];
        }).length
      ).toEqual(1);
      expect(notRotated.length).toEqual(1);
      expect(
        notRotated.filter(function (value) {
          return value === fileName3;
        }).length
      ).toEqual(1);

      // make sure the files can be decrypted by the new adapter
      for (let i = 0; i < fileNames.length; i++) {
        const result = await encryptedAdapter.getFileData(fileNames[i]);
        expect(result instanceof Buffer).toBe(true);
        expect(await getDataAsString(type, result)).toEqual(rawData[i]);
        let decryptionError;
        let encryptedData;
        try {
          encryptedData = await oldEncryptedAdapter.getFileData(fileNames[i]);
        } catch (err) {
          decryptionError = err;
        }
        expect(decryptionError).toMatch('Error');
        expect(encryptedData).toBeUndefined();

        // clear files for next iteration
        await oldEncryptedAdapter.deleteFile(fileNames[i]);
        expectMissingFile(oldEncryptedAdapter, fileNames[i]);

      }
      // clear file3 for next iteration
      await unEncryptedAdapter.deleteFile(fileName3);
      expectMissingFile(unEncryptedAdapter, fileName3);
    }
  });

  it('should save metadata', async () => {
    const gfsAdapter = new GridFSBucketAdapter(databaseURI);
    const originalString = 'abcdefghi';
    const metadata = { hello: 'world' };
    await gfsAdapter.createFile('myFileName', originalString, null, {
      metadata,
    });
    const gfsResult = await gfsAdapter.getFileData('myFileName');
    expect(gfsResult.toString('utf8')).toBe(originalString);
    let gfsMetadata = await gfsAdapter.getMetadata('myFileName');
    expect(gfsMetadata.metadata).toEqual(metadata);

    // Empty json for file not found
    gfsMetadata = await gfsAdapter.getMetadata('myUnknownFile');
    expect(gfsMetadata).toEqual({});

    // now do the same for blob
    const originalBlob = new Blob([originalString]);
    await gfsAdapter.createFile('myFileNameBlob', originalBlob, null, {
      metadata,
    });
    const gfsResultBlob = await gfsAdapter.getFileData('myFileNameBlob');
    expect(await getDataAsString('blob', gfsResultBlob)).toBe(originalString);
    gfsMetadata = await gfsAdapter.getMetadata('myFileNameBlob');
    expect(gfsMetadata.metadata).toEqual(metadata);

    // Empty json for file not found
    gfsMetadata = await gfsAdapter.getMetadata('myUnknownFileBlob');
    expect(gfsMetadata).toEqual({});
  });

  it('should save metadata with file', async () => {
    const gfsAdapter = new GridFSBucketAdapter(databaseURI);
    await reconfigureServer({ filesAdapter: gfsAdapter });
    const str = 'Hello World!';
    const data = [];
    for (let i = 0; i < str.length; i++) {
      data.push(str.charCodeAt(i));
    }
    const metadata = { foo: 'bar' };
    const file = new Parse.File('hello.txt', data, 'text/plain');
    file.addMetadata('foo', 'bar');
    await file.save();
    let fileData = await gfsAdapter.getMetadata(file.name());
    expect(fileData.metadata).toEqual(metadata);

    // Can only add metadata on create
    file.addMetadata('hello', 'world');
    await file.save();
    fileData = await gfsAdapter.getMetadata(file.name());
    expect(fileData.metadata).toEqual(metadata);

    const headers = {
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest',
    };
    const response = await request({
      method: 'GET',
      headers,
      url: `http://localhost:8378/1/files/test/metadata/${file.name()}`,
    });
    fileData = response.data;
    expect(fileData.metadata).toEqual(metadata);
  });

  it('should handle getMetadata error', async () => {
    const gfsAdapter = new GridFSBucketAdapter(databaseURI);
    await reconfigureServer({ filesAdapter: gfsAdapter });
    gfsAdapter.getMetadata = () => Promise.reject();

    const headers = {
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest',
    };
    const response = await request({
      method: 'GET',
      headers,
      url: `http://localhost:8378/1/files/test/metadata/filename.txt`,
    });
    expect(response.data).toEqual({});
  });

  it('properly fetches a large file from GridFS', async () => {
    const gfsAdapter = new GridFSBucketAdapter(databaseURI);
    const twoMegabytesFile = randomString(2048 * 1024);
    await gfsAdapter.createFile('myFileName', twoMegabytesFile);
    const gfsResult = await gfsAdapter.getFileData('myFileName');
    expect(gfsResult.toString('utf8')).toBe(twoMegabytesFile);
  });

  it('properly deletes a file from GridFS', async () => {
    const gfsAdapter = new GridFSBucketAdapter(databaseURI);
    await gfsAdapter.createFile('myFileName', 'a simple file');
    await gfsAdapter.deleteFile('myFileName');
    await expectMissingFile(gfsAdapter, 'myFileName');
  }, 1000000);

  it('properly overrides files', async () => {
    const gfsAdapter = new GridFSBucketAdapter(databaseURI);
    await gfsAdapter.createFile('myFileName', 'a simple file');
    await gfsAdapter.createFile('myFileName', 'an overrided simple file');
    const data = await gfsAdapter.getFileData('myFileName');
    expect(data.toString('utf8')).toBe('an overrided simple file');
    const bucket = await gfsAdapter._getBucket();
    const documents = await bucket.find({ filename: 'myFileName' }).toArray();
    expect(documents.length).toBe(2);
    await gfsAdapter.deleteFile('myFileName');
    await expectMissingFile(gfsAdapter, 'myFileName');
  });


  it('should reject if there is an error in cipher update', async () => {
    const gfsAdapter = new GridFSBucketAdapter(databaseURI, {}, 'encryptionKey');
    const error = new Error('Cipher error');
    const crypto = require('crypto');

    // Mock the createCipheriv method to return a mocked cipher object
    spyOn(crypto, 'createCipheriv').and.returnValue({
      // eslint-disable-next-line no-unused-vars
      update: (_chunk) => {
        throw error;
      },
      final: () => {
        return Buffer.from('encryptedData');
      },
    });

    for (const type of TYPES) {
      try {
        await gfsAdapter.createFile(`testfile-${type}.txt`,  createData(type, 'testdata'));
        fail('Expected error not thrown');
      } catch (err) {
        expect(err).toEqual(jasmine.any(Error));
        expect(err.message).toBe(error.message);
      }
    }
    // Restore the original method
    crypto.createCipheriv.and.callThrough();
  });


  it('should reject if there is an error in cipher final', async () => {
    const gfsAdapter = new GridFSBucketAdapter(databaseURI, {}, 'encryptionKey');
    const error = new Error('Cipher error');
    const crypto = require('crypto');

    // Mock the createCipheriv method to return a mocked cipher object
    spyOn(crypto, 'createCipheriv').and.returnValue({
      // eslint-disable-next-line no-unused-vars
      update: (_chunk) => {
        return Buffer.from('encryptedData');
      },
      final: () => {
        throw error;
      },
    });

    for (const type of TYPES) {
      try {
        await gfsAdapter.createFile(`testfile-${type}.txt`,  createData(type, 'testdata'));
        fail('Expected error not thrown');
      } catch (err) {
        expect(err).toEqual(jasmine.any(Error));
        expect(err.message).toBe(error.message);
      }
    }
    // Restore the original method
    crypto.createCipheriv.and.callThrough();
  });

  it ('should handle error in createFile when _getBucket is called', async () => {
    const error = new Error('Error in createFile');
    const gfsAdapter = new GridFSBucketAdapter(databaseURI);
    spyOn(gfsAdapter, '_getBucket').and.throwError(error);

    for (const type of TYPES) {
      try {
        await gfsAdapter.createFile(`testfile-${type}.txt`, createData(type, 'testdata'));
        fail('Expected error not thrown');
      } catch (err) {
        expect(err).toEqual(jasmine.any(Error));
        expect(err.message).toBe(error.message);
      }
    }
    // Restore the original method
    gfsAdapter._getBucket.and.callThrough();
  });

  it('handleShutdown, close connection', async () => {
    const databaseURI = 'mongodb://localhost:27017/parse';
    const gfsAdapter = new GridFSBucketAdapter(databaseURI);

    const db = await gfsAdapter._connect();
    const status = await db.admin().serverStatus();
    expect(status.connections.current > 0).toEqual(true);

    await gfsAdapter.handleShutdown();
    try {
      await db.admin().serverStatus();
      expect(false).toBe(true);
    } catch (e) {
      expect(e.message).toEqual('Client must be connected before running operations');
    }
  });
});
