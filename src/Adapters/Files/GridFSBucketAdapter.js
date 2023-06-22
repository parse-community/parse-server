/**
 GridFSBucketAdapter
 Stores files in Mongo using GridFS
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
    encryptionKey = undefined
  ) {
    super();
    this._databaseURI = mongoDatabaseURI;
    this._algorithm = 'aes-256-gcm';
    this._encryptionKey =
      encryptionKey !== undefined
        ? crypto
          .createHash('sha256')
          .update(String(encryptionKey))
          .digest('base64')
          .substring(0, 32)
        : null;
    const defaultMongoOptions = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    };
    const _mongoOptions = Object.assign(defaultMongoOptions, mongoOptions);
    for (const key of ['enableSchemaHooks', 'schemaCacheTtl', 'maxTimeMS']) {
      delete _mongoOptions[key];
    }
    this._mongoOptions = _mongoOptions;
  }

  _connect() {
    if (!this._connectionPromise) {
      this._connectionPromise = MongoClient.connect(this._databaseURI, this._mongoOptions).then(
        client => {
          this._client = client;
          return client.db(client.s.options.dbName);
        }
      );
    }
    return this._connectionPromise;
  }

  _getBucket() {
    return this._connect().then(database => new GridFSBucket(database));
  }

  // For a given config object, filename, and data, store a file
  // Returns a promise
  async createFile(filename: string, data, contentType, options = {}) {
    const bucket = await this._getBucket();
    const stream = await bucket.openUploadStream(filename, {
      metadata: options.metadata,
    });
    if (this._encryptionKey !== null) {
      try {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(this._algorithm, this._encryptionKey, iv);
        const encryptedResult = Buffer.concat([
          cipher.update(data),
          cipher.final(),
          iv,
          cipher.getAuthTag(),
        ]);
        await stream.write(encryptedResult);
      } catch (err) {
        return new Promise((resolve, reject) => {
          return reject(err);
        });
      }
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
      documents.map(doc => {
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
      stream.on('data', data => {
        chunks.push(data);
      });
      stream.on('end', () => {
        const data = Buffer.concat(chunks);
        if (this._encryptionKey !== null) {
          try {
            const authTagLocation = data.length - 16;
            const ivLocation = data.length - 32;
            const authTag = data.slice(authTagLocation);
            const iv = data.slice(ivLocation, authTagLocation);
            const encrypted = data.slice(0, ivLocation);
            const decipher = crypto.createDecipheriv(this._algorithm, this._encryptionKey, iv);
            decipher.setAuthTag(authTag);
            const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
            return resolve(decrypted);
          } catch (err) {
            return reject(err);
          }
        }
        resolve(data);
      });
      stream.on('error', err => {
        reject(err);
      });
    });
  }

  async rotateEncryptionKey(options = {}) {
    let fileNames = [];
    let oldKeyFileAdapter = {};
    const bucket = await this._getBucket();
    if (options.oldKey !== undefined) {
      oldKeyFileAdapter = new GridFSBucketAdapter(
        this._databaseURI,
        this._mongoOptions,
        options.oldKey
      );
    } else {
      oldKeyFileAdapter = new GridFSBucketAdapter(this._databaseURI, this._mongoOptions);
    }
    if (options.fileNames !== undefined) {
      fileNames = options.fileNames;
    } else {
      const fileNamesIterator = await bucket.find().toArray();
      fileNamesIterator.forEach(file => {
        fileNames.push(file.filename);
      });
    }
    let fileNamesNotRotated = fileNames;
    const fileNamesRotated = [];
    for (const fileName of fileNames) {
      try {
        const plainTextData = await oldKeyFileAdapter.getFileData(fileName);
        // Overwrite file with data encrypted with new key
        await this.createFile(fileName, plainTextData);
        fileNamesRotated.push(fileName);
        fileNamesNotRotated = fileNamesNotRotated.filter(function (value) {
          return value !== fileName;
        });
      } catch (err) {
        continue;
      }
    }
    return { rotated: fileNamesRotated, notRotated: fileNamesNotRotated };
  }

  getFileLocation(config, filename) {
    return config.mount + '/files/' + config.applicationId + '/' + encodeURIComponent(filename);
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

    const fileLength = files[0].length;
    const fileStart = parseInt(partialstart, 10);
    const fileEnd = partialend ? parseInt(partialend, 10) : fileLength;

    let start = Math.min(fileStart || 0, fileEnd, fileLength);
    let end = Math.max(fileStart || 0, fileEnd) + 1 || fileLength;
    if (isNaN(fileStart)) {
      start = fileLength - end + 1;
      end = fileLength;
    }
    end = Math.min(end, fileLength);
    start = Math.max(start, 0);

    res.status(206);
    res.header('Accept-Ranges', 'bytes');
    res.header('Content-Length', end - start);
    res.header('Content-Range', 'bytes ' + start + '-' + end + '/' + fileLength);
    res.header('Content-Type', contentType);
    const stream = bucket.openDownloadStreamByName(filename);
    stream.start(start);
    if (end) {
      stream.end(end);
    }
    stream.on('data', chunk => {
      res.write(chunk);
    });
    stream.on('error', e => {
      res.status(404);
      res.send(e.message);
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
