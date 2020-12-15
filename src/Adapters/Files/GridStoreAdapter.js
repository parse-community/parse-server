/**
 GridStoreAdapter
 Stores files in Mongo using GridStore
 Requires the database adapter to be based on mongoclient
 (GridStore is deprecated, Please use GridFSBucket instead)

 @flow weak
 */

// @flow-disable-next
import { MongoClient, GridStore, Db } from 'mongodb';
import { FilesAdapter, validateFilename } from './FilesAdapter';
import defaults from '../../defaults';

export class GridStoreAdapter extends FilesAdapter {
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
      this._connectionPromise = MongoClient.connect(this._databaseURI, this._mongoOptions).then(
        client => {
          this._client = client;
          return client.db(client.s.options.dbName);
        }
      );
    }
    return this._connectionPromise;
  }

  // For a given config object, filename, and data, store a file
  // Returns a promise
  createFile(filename: string, data) {
    return this._connect()
      .then(database => {
        const gridStore = new GridStore(database, filename, 'w');
        return gridStore.open();
      })
      .then(gridStore => {
        return gridStore.write(data);
      })
      .then(gridStore => {
        return gridStore.close();
      });
  }

  deleteFile(filename: string) {
    return this._connect()
      .then(database => {
        const gridStore = new GridStore(database, filename, 'r');
        return gridStore.open();
      })
      .then(gridStore => {
        return gridStore.unlink();
      })
      .then(gridStore => {
        return gridStore.close();
      });
  }

  getFileData(filename: string) {
    return this._connect()
      .then(database => {
        return GridStore.exist(database, filename).then(() => {
          const gridStore = new GridStore(database, filename, 'r');
          return gridStore.open();
        });
      })
      .then(gridStore => {
        return gridStore.read();
      });
  }

  getFileLocation(config, filename) {
    return config.mount + '/files/' + config.applicationId + '/' + encodeURIComponent(filename);
  }

  async handleFileStream(filename: string, req, res, contentType) {
    const stream = await this._connect().then(database => {
      return GridStore.exist(database, filename).then(() => {
        const gridStore = new GridStore(database, filename, 'r');
        return gridStore.open();
      });
    });
    handleRangeRequest(stream, req, res, contentType);
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

// handleRangeRequest is licensed under Creative Commons Attribution 4.0 International License (https://creativecommons.org/licenses/by/4.0/).
// Author: LEROIB at weightingformypizza (https://weightingformypizza.wordpress.com/2015/06/24/stream-html5-media-content-like-video-audio-from-mongodb-using-express-and-gridstore/).
function handleRangeRequest(stream, req, res, contentType) {
  const buffer_size = 1024 * 1024; //1024Kb
  // Range request, partial stream the file
  const parts = req
    .get('Range')
    .replace(/bytes=/, '')
    .split('-');
  let [start, end] = parts;
  const notEnded = !end && end !== 0;
  const notStarted = !start && start !== 0;
  // No end provided, we want all bytes
  if (notEnded) {
    end = stream.length - 1;
  }
  // No start provided, we're reading backwards
  if (notStarted) {
    start = stream.length - end;
    end = start + end - 1;
  }

  // Data exceeds the buffer_size, cap
  if (end - start >= buffer_size) {
    end = start + buffer_size - 1;
  }

  const contentLength = end - start + 1;

  res.writeHead(206, {
    'Content-Range': 'bytes ' + start + '-' + end + '/' + stream.length,
    'Accept-Ranges': 'bytes',
    'Content-Length': contentLength,
    'Content-Type': contentType,
  });

  stream.seek(start, function () {
    // Get gridFile stream
    const gridFileStream = stream.stream(true);
    let bufferAvail = 0;
    let remainingBytesToWrite = contentLength;
    let totalBytesWritten = 0;
    // Write to response
    gridFileStream.on('data', function (data) {
      bufferAvail += data.length;
      if (bufferAvail > 0) {
        // slice returns the same buffer if overflowing
        // safe to call in any case
        const buffer = data.slice(0, remainingBytesToWrite);
        // Write the buffer
        res.write(buffer);
        // Increment total
        totalBytesWritten += buffer.length;
        // Decrement remaining
        remainingBytesToWrite -= data.length;
        // Decrement the available buffer
        bufferAvail -= buffer.length;
      }
      // In case of small slices, all values will be good at that point
      // we've written enough, end...
      if (totalBytesWritten >= contentLength) {
        stream.close();
        res.end();
        this.destroy();
      }
    });
  });
}

export default GridStoreAdapter;
