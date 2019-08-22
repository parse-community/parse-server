/**
 GridFSBucketAdapter
 Stores files in Mongo using GridStore
 Requires the database adapter to be based on mongoclient

 @flow weak
 */

// @flow-disable-next
import { MongoClient, GridFSBucket, Db } from 'mongodb';
import { FilesAdapter } from './FilesAdapter';
import defaults from '../../defaults';

export class GridFSBucketAdapter extends FilesAdapter {
  _databaseURI: string;
  _connectionPromise: Promise<Db>;
  _mongoOptions: Object;

  constructor(mongoDatabaseURI = defaults.DefaultMongoURI, mongoOptions = {}) {
    super();
    this._databaseURI = mongoDatabaseURI;

    const defaultMongoOptions = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    };
    this._mongoOptions = Object.assign(defaultMongoOptions, mongoOptions);
  }

  _connect() {
    if (!this._connectionPromise) {
      this._connectionPromise = MongoClient.connect(
        this._databaseURI,
        this._mongoOptions
      ).then(client => {
        this._client = client;
        return client.db(client.s.options.dbName);
      });
    }
    return this._connectionPromise;
  }

  _getBucket() {
    return this._connect().then(database => new GridFSBucket(database));
  }

  // For a given config object, filename, and data, store a file
  // Returns a promise
  async createFile(filename: string, data) {
    const bucket = await this._getBucket();
    const stream = await bucket.openUploadStream(filename);
    await stream.write(data);
    stream.end();
    return new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }

  async deleteFile(filename: string) {
    const bucket = await this._getBucket();
    const documents = await bucket.find({ filename: filename }).toArray();
    if (documents.length === 0) {
      throw new Error('FileNotFound');
    }
    return Promise.all(
      documents.map(doc => {
        return bucket.delete(doc._id);
      })
    );
  }

  async getFileData(filename: string) {
    const stream = await this.getDownloadStream(filename);
    stream.read();
    return new Promise((resolve, reject) => {
      const chunks = [];
      stream.on('data', data => {
        chunks.push(data);
      });
      stream.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      stream.on('error', err => {
        reject(err);
      });
    });
  }

  getFileLocation(config, filename) {
    return (
      config.mount +
      '/files/' +
      config.applicationId +
      '/' +
      encodeURIComponent(filename)
    );
  }

  async getDownloadStream(filename: string) {
    const bucket = await this._getBucket();
    return bucket.openDownloadStreamByName(filename);
  }

  handleShutdown() {
    if (!this._client) {
      return Promise.resolve();
    }
    return this._client.close(false);
  }
}

export default GridFSBucketAdapter;
