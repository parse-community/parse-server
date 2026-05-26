'use strict';

const GridFSBucketAdapter = require('../lib/Adapters/Files/GridFSBucketAdapter')
  .GridFSBucketAdapter;
const request = require('../lib/request');

const databaseURI = 'mongodb://localhost:27017/parse';

describe_only_db('mongo')('Unicode filename normalization', () => {
  beforeEach(async () => {
    const gfsAdapter = new GridFSBucketAdapter(databaseURI);
    const db = await gfsAdapter._connect();
    await db.dropDatabase();
    await gfsAdapter.handleShutdown();
  });

  it('normalizes each path segment for direct GridFS adapter operations', async () => {
    const gfsAdapter = new GridFSBucketAdapter(databaseURI);
    const decomposedFilename = 'cafe\u0301.txt';
    const normalizedFilename = 'caf\u00e9.txt';
    const storedFilename = `docs/${normalizedFilename}`;

    await gfsAdapter.createFile(`docs/${decomposedFilename}`, 'normalized content', 'text/plain', {
      metadata: {},
    });

    const bucket = await gfsAdapter._getBucket();
    let documents = await bucket.find({ filename: storedFilename }).toArray();
    expect(documents.length).toBe(1);

    const metadata = await gfsAdapter.getMetadata(`docs/${decomposedFilename}`);
    expect(metadata).toEqual({ metadata: {} });

    const data = await gfsAdapter.getFileData(`docs/${decomposedFilename}`);
    expect(data.toString('utf8')).toBe('normalized content');

    await gfsAdapter.deleteFile(`docs/${decomposedFilename}`);
    documents = await bucket.find({ filename: storedFilename }).toArray();
    expect(documents.length).toBe(0);
  });

  it('normalizes filenames across upload, metadata, download, and delete routes', async () => {
    const gfsAdapter = new GridFSBucketAdapter(databaseURI);
    await reconfigureServer({
      filesAdapter: gfsAdapter,
      preserveFileName: true,
    });

    const decomposedFilename = 'cafe\u0301.txt';
    const normalizedFilename = 'caf\u00e9.txt';
    const requestedFilename = encodeURIComponent(decomposedFilename);

    const createResponse = await request({
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
      },
      url: `http://localhost:8378/1/files/${requestedFilename}`,
      body: 'normalized content',
    });
    expect(createResponse.data.name).toBe(normalizedFilename);
    expect(createResponse.data.url).toBe(
      `http://localhost:8378/1/files/test/${encodeURIComponent(normalizedFilename)}`
    );

    const bucket = await gfsAdapter._getBucket();
    let documents = await bucket.find({ filename: normalizedFilename }).toArray();
    expect(documents.length).toBe(1);

    const metadataResponse = await request({
      method: 'GET',
      url: `http://localhost:8378/1/files/test/metadata/${requestedFilename}`,
    });
    expect(metadataResponse.data).toEqual({ metadata: {} });

    const downloadResponse = await request({
      method: 'GET',
      url: `http://localhost:8378/1/files/test/${requestedFilename}`,
    });
    expect(downloadResponse.text).toBe('normalized content');

    const deleteResponse = await request({
      method: 'DELETE',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
      },
      url: `http://localhost:8378/1/files/${requestedFilename}`,
    });
    expect(deleteResponse.status).toBe(200);

    documents = await bucket.find({ filename: normalizedFilename }).toArray();
    expect(documents.length).toBe(0);
  });

  it('rejects path traversal in metadata download routes', async () => {
    const gfsAdapter = new GridFSBucketAdapter(databaseURI);
    await reconfigureServer({
      filesAdapter: gfsAdapter,
      preserveFileName: true,
    });

    try {
      await request({
        method: 'GET',
        url: 'http://localhost:8378/1/files/test/metadata/..%2F..%2F..%2Fetc%2Fpasswd',
      });
      fail('should have rejected path traversal');
    } catch (error) {
      expect(error.status).toBe(400);
      expect(error.data.code).toBe(Parse.Error.INVALID_FILE_NAME);
    }
  });
});
