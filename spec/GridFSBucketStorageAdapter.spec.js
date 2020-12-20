const GridStoreAdapter = require('../lib/Adapters/Files/GridStoreAdapter').GridStoreAdapter;
const GridFSBucketAdapter = require('../lib/Adapters/Files/GridFSBucketAdapter')
  .GridFSBucketAdapter;
const { randomString } = require('../lib/cryptoUtils');
const databaseURI = 'mongodb://localhost:27017/parse';
const request = require('../lib/request');
const Config = require('../lib/Config');

async function expectMissingFile(gfsAdapter, name) {
  try {
    await gfsAdapter.getFileData(name);
    fail('should have thrown');
  } catch (e) {
    expect(e.message).toEqual('FileNotFound: file myFileName was not found');
  }
}

describe_only_db('mongo')('GridFSBucket and GridStore interop', () => {
  beforeEach(async () => {
    const gsAdapter = new GridStoreAdapter(databaseURI);
    const db = await gsAdapter._connect();
    await db.dropDatabase();
  });

  it('a file created in GridStore should be available in GridFS', async () => {
    const gsAdapter = new GridStoreAdapter(databaseURI);
    const gfsAdapter = new GridFSBucketAdapter(databaseURI);
    await expectMissingFile(gfsAdapter, 'myFileName');
    const originalString = 'abcdefghi';
    await gsAdapter.createFile('myFileName', originalString);
    const gsResult = await gsAdapter.getFileData('myFileName');
    expect(gsResult.toString('utf8')).toBe(originalString);
    const gfsResult = await gfsAdapter.getFileData('myFileName');
    expect(gfsResult.toString('utf8')).toBe(originalString);
  });

  it('should save an encrypted file that can only be decrypted by a GridFS adapter with the encryptionKey', async () => {
    const unencryptedAdapter = new GridFSBucketAdapter(databaseURI);
    const encryptedAdapter = new GridFSBucketAdapter(
      databaseURI,
      {},
      '89E4AFF1-DFE4-4603-9574-BFA16BB446FD'
    );
    await expectMissingFile(encryptedAdapter, 'myFileName');
    const originalString = 'abcdefghi';
    await encryptedAdapter.createFile('myFileName', originalString);
    const unencryptedResult = await unencryptedAdapter.getFileData('myFileName');
    expect(unencryptedResult.toString('utf8')).not.toBe(originalString);
    const encryptedResult = await encryptedAdapter.getFileData('myFileName');
    expect(encryptedResult.toString('utf8')).toBe(originalString);
  });

  it('should rotate key of all unencrypted GridFS files to encrypted files', async () => {
    const unencryptedAdapter = new GridFSBucketAdapter(databaseURI);
    const encryptedAdapter = new GridFSBucketAdapter(
      databaseURI,
      {},
      '89E4AFF1-DFE4-4603-9574-BFA16BB446FD'
    );
    const fileName1 = 'file1.txt';
    const data1 = 'hello world';
    const fileName2 = 'file2.txt';
    const data2 = 'hello new world';
    //Store unecrypted files
    await unencryptedAdapter.createFile(fileName1, data1);
    const unencryptedResult1 = await unencryptedAdapter.getFileData(fileName1);
    expect(unencryptedResult1.toString('utf8')).toBe(data1);
    await unencryptedAdapter.createFile(fileName2, data2);
    const unencryptedResult2 = await unencryptedAdapter.getFileData(fileName2);
    expect(unencryptedResult2.toString('utf8')).toBe(data2);
    //Check if encrypted adapter can read data and make sure it's not the same as unEncrypted adapter
    const { rotated, notRotated } = await encryptedAdapter.rotateEncryptionKey();
    expect(rotated.length).toEqual(2);
    expect(
      rotated.filter(function (value) {
        return value === fileName1;
      }).length
    ).toEqual(1);
    expect(
      rotated.filter(function (value) {
        return value === fileName2;
      }).length
    ).toEqual(1);
    expect(notRotated.length).toEqual(0);
    let result = await encryptedAdapter.getFileData(fileName1);
    expect(result instanceof Buffer).toBe(true);
    expect(result.toString('utf-8')).toEqual(data1);
    const encryptedData1 = await unencryptedAdapter.getFileData(fileName1);
    expect(encryptedData1.toString('utf-8')).not.toEqual(unencryptedResult1);
    result = await encryptedAdapter.getFileData(fileName2);
    expect(result instanceof Buffer).toBe(true);
    expect(result.toString('utf-8')).toEqual(data2);
    const encryptedData2 = await unencryptedAdapter.getFileData(fileName2);
    expect(encryptedData2.toString('utf-8')).not.toEqual(unencryptedResult2);
  });

  it('should rotate key of all old encrypted GridFS files to encrypted files', async () => {
    const oldEncryptionKey = 'oldKeyThatILoved';
    const oldEncryptedAdapter = new GridFSBucketAdapter(databaseURI, {}, oldEncryptionKey);
    const encryptedAdapter = new GridFSBucketAdapter(databaseURI, {}, 'newKeyThatILove');
    const fileName1 = 'file1.txt';
    const data1 = 'hello world';
    const fileName2 = 'file2.txt';
    const data2 = 'hello new world';
    //Store unecrypted files
    await oldEncryptedAdapter.createFile(fileName1, data1);
    const oldEncryptedResult1 = await oldEncryptedAdapter.getFileData(fileName1);
    expect(oldEncryptedResult1.toString('utf8')).toBe(data1);
    await oldEncryptedAdapter.createFile(fileName2, data2);
    const oldEncryptedResult2 = await oldEncryptedAdapter.getFileData(fileName2);
    expect(oldEncryptedResult2.toString('utf8')).toBe(data2);
    //Check if encrypted adapter can read data and make sure it's not the same as unEncrypted adapter
    const { rotated, notRotated } = await encryptedAdapter.rotateEncryptionKey({
      oldKey: oldEncryptionKey,
    });
    expect(rotated.length).toEqual(2);
    expect(
      rotated.filter(function (value) {
        return value === fileName1;
      }).length
    ).toEqual(1);
    expect(
      rotated.filter(function (value) {
        return value === fileName2;
      }).length
    ).toEqual(1);
    expect(notRotated.length).toEqual(0);
    let result = await encryptedAdapter.getFileData(fileName1);
    expect(result instanceof Buffer).toBe(true);
    expect(result.toString('utf-8')).toEqual(data1);
    let decryptionError1;
    let encryptedData1;
    try {
      encryptedData1 = await oldEncryptedAdapter.getFileData(fileName1);
    } catch (err) {
      decryptionError1 = err;
    }
    expect(decryptionError1).toMatch('Error');
    expect(encryptedData1).toBeUndefined();
    result = await encryptedAdapter.getFileData(fileName2);
    expect(result instanceof Buffer).toBe(true);
    expect(result.toString('utf-8')).toEqual(data2);
    let decryptionError2;
    let encryptedData2;
    try {
      encryptedData2 = await oldEncryptedAdapter.getFileData(fileName2);
    } catch (err) {
      decryptionError2 = err;
    }
    expect(decryptionError2).toMatch('Error');
    expect(encryptedData2).toBeUndefined();
  });

  it('should rotate key of all old encrypted GridFS files to unencrypted files', async () => {
    const oldEncryptionKey = 'oldKeyThatILoved';
    const oldEncryptedAdapter = new GridFSBucketAdapter(databaseURI, {}, oldEncryptionKey);
    const unEncryptedAdapter = new GridFSBucketAdapter(databaseURI);
    const fileName1 = 'file1.txt';
    const data1 = 'hello world';
    const fileName2 = 'file2.txt';
    const data2 = 'hello new world';
    //Store unecrypted files
    await oldEncryptedAdapter.createFile(fileName1, data1);
    const oldEncryptedResult1 = await oldEncryptedAdapter.getFileData(fileName1);
    expect(oldEncryptedResult1.toString('utf8')).toBe(data1);
    await oldEncryptedAdapter.createFile(fileName2, data2);
    const oldEncryptedResult2 = await oldEncryptedAdapter.getFileData(fileName2);
    expect(oldEncryptedResult2.toString('utf8')).toBe(data2);
    //Check if unEncrypted adapter can read data and make sure it's not the same as oldEncrypted adapter
    const { rotated, notRotated } = await unEncryptedAdapter.rotateEncryptionKey({
      oldKey: oldEncryptionKey,
    });
    expect(rotated.length).toEqual(2);
    expect(
      rotated.filter(function (value) {
        return value === fileName1;
      }).length
    ).toEqual(1);
    expect(
      rotated.filter(function (value) {
        return value === fileName2;
      }).length
    ).toEqual(1);
    expect(notRotated.length).toEqual(0);
    let result = await unEncryptedAdapter.getFileData(fileName1);
    expect(result instanceof Buffer).toBe(true);
    expect(result.toString('utf-8')).toEqual(data1);
    let decryptionError1;
    let encryptedData1;
    try {
      encryptedData1 = await oldEncryptedAdapter.getFileData(fileName1);
    } catch (err) {
      decryptionError1 = err;
    }
    expect(decryptionError1).toMatch('Error');
    expect(encryptedData1).toBeUndefined();
    result = await unEncryptedAdapter.getFileData(fileName2);
    expect(result instanceof Buffer).toBe(true);
    expect(result.toString('utf-8')).toEqual(data2);
    let decryptionError2;
    let encryptedData2;
    try {
      encryptedData2 = await oldEncryptedAdapter.getFileData(fileName2);
    } catch (err) {
      decryptionError2 = err;
    }
    expect(decryptionError2).toMatch('Error');
    expect(encryptedData2).toBeUndefined();
  });

  it('should only encrypt specified fileNames', async () => {
    const oldEncryptionKey = 'oldKeyThatILoved';
    const oldEncryptedAdapter = new GridFSBucketAdapter(databaseURI, {}, oldEncryptionKey);
    const encryptedAdapter = new GridFSBucketAdapter(databaseURI, {}, 'newKeyThatILove');
    const unEncryptedAdapter = new GridFSBucketAdapter(databaseURI);
    const fileName1 = 'file1.txt';
    const data1 = 'hello world';
    const fileName2 = 'file2.txt';
    const data2 = 'hello new world';
    //Store unecrypted files
    await oldEncryptedAdapter.createFile(fileName1, data1);
    const oldEncryptedResult1 = await oldEncryptedAdapter.getFileData(fileName1);
    expect(oldEncryptedResult1.toString('utf8')).toBe(data1);
    await oldEncryptedAdapter.createFile(fileName2, data2);
    const oldEncryptedResult2 = await oldEncryptedAdapter.getFileData(fileName2);
    expect(oldEncryptedResult2.toString('utf8')).toBe(data2);
    //Inject unecrypted file to see if causes an issue
    const fileName3 = 'file3.txt';
    const data3 = 'hello past world';
    await unEncryptedAdapter.createFile(fileName3, data3, 'text/utf8');
    //Check if encrypted adapter can read data and make sure it's not the same as unEncrypted adapter
    const { rotated, notRotated } = await encryptedAdapter.rotateEncryptionKey({
      oldKey: oldEncryptionKey,
      fileNames: [fileName1, fileName2],
    });
    expect(rotated.length).toEqual(2);
    expect(
      rotated.filter(function (value) {
        return value === fileName1;
      }).length
    ).toEqual(1);
    expect(
      rotated.filter(function (value) {
        return value === fileName2;
      }).length
    ).toEqual(1);
    expect(notRotated.length).toEqual(0);
    expect(
      rotated.filter(function (value) {
        return value === fileName3;
      }).length
    ).toEqual(0);
    let result = await encryptedAdapter.getFileData(fileName1);
    expect(result instanceof Buffer).toBe(true);
    expect(result.toString('utf-8')).toEqual(data1);
    let decryptionError1;
    let encryptedData1;
    try {
      encryptedData1 = await oldEncryptedAdapter.getFileData(fileName1);
    } catch (err) {
      decryptionError1 = err;
    }
    expect(decryptionError1).toMatch('Error');
    expect(encryptedData1).toBeUndefined();
    result = await encryptedAdapter.getFileData(fileName2);
    expect(result instanceof Buffer).toBe(true);
    expect(result.toString('utf-8')).toEqual(data2);
    let decryptionError2;
    let encryptedData2;
    try {
      encryptedData2 = await oldEncryptedAdapter.getFileData(fileName2);
    } catch (err) {
      decryptionError2 = err;
    }
    expect(decryptionError2).toMatch('Error');
    expect(encryptedData2).toBeUndefined();
  });

  it("should return fileNames of those it can't encrypt with the new key", async () => {
    const oldEncryptionKey = 'oldKeyThatILoved';
    const oldEncryptedAdapter = new GridFSBucketAdapter(databaseURI, {}, oldEncryptionKey);
    const encryptedAdapter = new GridFSBucketAdapter(databaseURI, {}, 'newKeyThatILove');
    const unEncryptedAdapter = new GridFSBucketAdapter(databaseURI);
    const fileName1 = 'file1.txt';
    const data1 = 'hello world';
    const fileName2 = 'file2.txt';
    const data2 = 'hello new world';
    //Store unecrypted files
    await oldEncryptedAdapter.createFile(fileName1, data1);
    const oldEncryptedResult1 = await oldEncryptedAdapter.getFileData(fileName1);
    expect(oldEncryptedResult1.toString('utf8')).toBe(data1);
    await oldEncryptedAdapter.createFile(fileName2, data2);
    const oldEncryptedResult2 = await oldEncryptedAdapter.getFileData(fileName2);
    expect(oldEncryptedResult2.toString('utf8')).toBe(data2);
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
        return value === fileName1;
      }).length
    ).toEqual(1);
    expect(
      rotated.filter(function (value) {
        return value === fileName2;
      }).length
    ).toEqual(1);
    expect(notRotated.length).toEqual(1);
    expect(
      notRotated.filter(function (value) {
        return value === fileName3;
      }).length
    ).toEqual(1);
    let result = await encryptedAdapter.getFileData(fileName1);
    expect(result instanceof Buffer).toBe(true);
    expect(result.toString('utf-8')).toEqual(data1);
    let decryptionError1;
    let encryptedData1;
    try {
      encryptedData1 = await oldEncryptedAdapter.getFileData(fileName1);
    } catch (err) {
      decryptionError1 = err;
    }
    expect(decryptionError1).toMatch('Error');
    expect(encryptedData1).toBeUndefined();
    result = await encryptedAdapter.getFileData(fileName2);
    expect(result instanceof Buffer).toBe(true);
    expect(result.toString('utf-8')).toEqual(data2);
    let decryptionError2;
    let encryptedData2;
    try {
      encryptedData2 = await oldEncryptedAdapter.getFileData(fileName2);
    } catch (err) {
      decryptionError2 = err;
    }
    expect(decryptionError2).toMatch('Error');
    expect(encryptedData2).toBeUndefined();
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
    const config = Config.get('test');
    config.filesController.getMetadata = () => Promise.reject();

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
      expect(e.message).toEqual('topology was destroyed');
    }
  });
});
