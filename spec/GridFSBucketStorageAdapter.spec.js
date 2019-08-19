const GridStoreAdapter = require('../lib/Adapters/Files/GridStoreAdapter')
  .GridStoreAdapter;
const GridFSBucketAdapter = require('../lib/Adapters/Files/GridFSBucketAdapter')
  .GridFSBucketAdapter;
const { randomString } = require('../lib/cryptoUtils');
const databaseURI = 'mongodb://localhost:27017/parse';

async function expectMissingFile(gfsAdapter, name) {
  try {
    await gfsAdapter.getFileData(name);
    fail('should have thrown');
  } catch (e) {
    expect(e.message).toEqual('FileNotFound: file myFileName was not found');
  }
}

describe('GridFSBucket and GridStore interop', () => {
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

  it('handleShutdown, close connection', done => {
    const databaseURI = 'mongodb://localhost:27017/parse';
    const gfsAdapter = new GridFSBucketAdapter(databaseURI);

    gfsAdapter._connect().then(db => {
      expect(db.serverConfig.connections().length > 0).toEqual(true);
      expect(db.serverConfig.s.connected).toEqual(true);
      gfsAdapter.handleShutdown().then(() => {
        expect(db.serverConfig.connections().length > 0).toEqual(false);
        expect(db.serverConfig.s.connected).toEqual(false);
        done();
      });
    });
  });
});
