/**
 GridFSBucketAdapter
 Stores files in Mongo using GridStore
 Requires the database adapter to be based on mongoclient

 @flow weak
 */

// @flow-disable-next
import { MongoClient, GridFSBucket, Db } from 'mongodb';
import { FilesAdapter, validateFilename } from './FilesAdapter';
import defaults from '../../defaults';
const crypto = require('crypto');

export class GridFSBucketAdapter extends FilesAdapter {
  _databaseURI: string;
  _connectionPromise: Promise<Db>;
  _mongoOptions: Object;
  _algorithm: string;

  constructor(
    mongoDatabaseURI = defaults.DefaultMongoURI,
    mongoOptions = {},
    fileKey = undefined
  ) {
    super();
    this._databaseURI = mongoDatabaseURI;
    this._algorithm = 'aes-256-gcm';
    this._fileKey =
      fileKey !== undefined
        ? crypto
          .createHash('sha256')
          .update(String(fileKey))
          .digest('base64')
          .substr(0, 32)
        : null;
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
      ).then((client) => {
        this._client = client;
        return client.db(client.s.options.dbName);
      });
    }
    return this._connectionPromise;
  }

  _getBucket() {
    return this._connect().then((database) => new GridFSBucket(database));
  }

  // For a given config object, filename, and data, store a file
  // Returns a promise
  async createFile(filename: string, data, contentType, options = {}) {
    const bucket = await this._getBucket();
    const stream = await bucket.openUploadStream(filename, {
      metadata: options.metadata,
    });
    if (this._fileKey !== null) {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this._algorithm, this._fileKey, iv);
      const encryptedResult = Buffer.concat([
        cipher.update(data),
        cipher.final(),
        iv,
        cipher.getAuthTag(),
      ]);
      await stream.write(encryptedResult);
    } else {
      await stream.write(data);
    }
    stream.end();
    return new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }

  async deleteFile(filename: string) {
    const bucket = await this._getBucket();
    const documents = await bucket.find({ filename }).toArray();
    if (documents.length === 0) {
      throw new Error('FileNotFound');
    }
    return Promise.all(
      documents.map((doc) => {
        return bucket.delete(doc._id);
      })
    );
  }

  async getFileData(filename: string) {
    const bucket = await this._getBucket();
    const stream = bucket.openDownloadStreamByName(filename);
    stream.read();
    return new Promise((resolve, reject) => {
      const chunks = [];
      stream.on('data', (data) => {
        chunks.push(data);
      });
      stream.on('end', () => {
        const data = Buffer.concat(chunks);
        if (this._fileKey !== null) {
          const authTagLocation = data.length - 16;
          const ivLocation = data.length - 32;
          const authTag = data.slice(authTagLocation);
          const iv = data.slice(ivLocation, authTagLocation);
          const encrypted = data.slice(0, ivLocation);
          const decipher = crypto.createDecipheriv(
            this._algorithm,
            this._fileKey,
            iv
          );
          decipher.setAuthTag(authTag);
          return resolve(
            Buffer.concat([decipher.update(encrypted), decipher.final()])
          );
        }
        resolve(data);
      });
      stream.on('error', (err) => {
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

  async getMetadata(filename) {
    const bucket = await this._getBucket();
    const files = await bucket.find({ filename }).toArray();
    if (files.length === 0) {
      return {};
    }
    const { metadata } = files[0];
    return { metadata };
  }

  async handleFileStream(filename: string, req, res, contentType) {
    const bucket = await this._getBucket();
    const files = await bucket.find({ filename }).toArray();
    if (files.length === 0) {
      throw new Error('FileNotFound');
    }
    const parts = req
      .get('Range')
      .replace(/bytes=/, '')
      .split('-');
    const partialstart = parts[0];
    const partialend = parts[1];

    const start = parseInt(partialstart, 10);
    const end = partialend ? parseInt(partialend, 10) : files[0].length - 1;

    res.writeHead(206, {
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Range': 'bytes ' + start + '-' + end + '/' + files[0].length,
      'Content-Type': contentType,
    });
    const stream = bucket.openDownloadStreamByName(filename);
    stream.start(start);
    stream.on('data', (chunk) => {
      res.write(chunk);
    });
    stream.on('error', () => {
      res.sendStatus(404);
    });
    stream.on('end', () => {
      res.end();
    });
  }

  handleShutdown() {
    if (!this._client) {
      return Promise.resolve();
    }
    return this._client.close(false);
  }

  validateFilename(filename) {
    return validateFilename(filename);
  }
}

export default GridFSBucketAdapter;
