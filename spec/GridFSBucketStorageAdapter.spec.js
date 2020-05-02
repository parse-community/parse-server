const GridStoreAdapter = require('../lib/Adapters/Files/GridStoreAdapter')
  .GridStoreAdapter;
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
