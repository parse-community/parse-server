/**
 GridStoreAdapter
 Stores files in Mongo using GridStore
 Requires the database adapter to be based on mongoclient

 @flow weak
 */

import { MongoClient, GridStore, Db} from 'mongodb';
import { FilesAdapter }              from './FilesAdapter';

const DefaultMongoURI = 'mongodb://localhost:27017/parse';

export class GridStoreAdapter extends FilesAdapter {
  _databaseURI: string;
  _connectionPromise: Promise<Db>;

  constructor(mongoDatabaseURI = DefaultMongoURI) {
    super();
    this._databaseURI = mongoDatabaseURI;
    this._connect();
  }

  _connect() {
    if (!this._connectionPromise) {
      this._connectionPromise = MongoClient.connect(this._databaseURI);
    }
    return this._connectionPromise;
  }

  // For a given config object, filename, and data, store a file
  // Returns a promise
  createFile(filename: string, data, contentType) {
    return this._connect().then(database => {
      let gridStore = new GridStore(database, filename, 'w');
      return gridStore.open();
    }).then(gridStore => {
      return gridStore.write(data);
    }).then(gridStore => {
      return gridStore.close();
    });
  }

  deleteFile(filename: string) {
    return this._connect().then(database => {
      let gridStore = new GridStore(database, filename, 'r');
      return gridStore.open();
    }).then((gridStore) => {
      return gridStore.unlink();
    }).then((gridStore) => {
      return gridStore.close();
    });
  }

  getFileData(filename: string) {
    return this._connect().then(database => {
      return GridStore.exist(database, filename)
        .then(() => {
          let gridStore = new GridStore(database, filename, 'r');
          return gridStore.open();
        });
    }).then(gridStore => {
      return gridStore.read();
    });
  }

  getFileLocation(config, filename) {
    return (config.mount + '/files/' + config.applicationId + '/' + encodeURIComponent(filename));
  }

  handleVideoStream(filename, range, res, contentType) {
    return this._connect().then(database => {
      return GridStore.exist(database, filename)
        .then(() => {
          let gridStore = new GridStore(database, filename, 'r');
          gridStore.open((err, gridFile) => {
              if(!gridFile) {
                  res.status(404);
                  res.set('Content-Type', 'text/plain');
                  res.end('File not found.');
                  return;
                }
                streamVideo(gridFile,range, res, contentType);
          });
        });
    });
  }
}

  /**
  * streamVideo is licensed under Creative Commons Attribution 4.0 International License (https://creativecommons.org/licenses/by/4.0/).
  * Author: LEROIB at weightingformypizza.(https://weightingformypizza.wordpress.com/2015/06/24/stream-html5-media-content-like-video-audio-from-mongodb-using-express-and-gridstore/)
  */
function streamVideo(gridFile, range, res, contentType) {
  var buffer_size = 1024 * 1024;//1024Kb
  if (range != null) {
    // Range request, partiall stream the file
    var parts = range.replace(/bytes=/, "").split("-");
    var partialstart = parts[0];
    var partialend = parts[1];
    var start = partialstart ? parseInt(partialstart, 10) : 0;
    var end = partialend ? parseInt(partialend, 10) : gridFile.length - 1;
    var chunksize = (end - start) + 1;

    if(chunksize == 1){
      start = 0;
      partialend = false;
    }

    if(!partialend){
      if(((gridFile.length-1) - start) < (buffer_size)){
          end = gridFile.length - 1;
      }else{
        end = start + (buffer_size);
      }
        chunksize = (end - start) + 1;
    }

    if(start == 0 && end == 2){
      chunksize = 1;
    }

    res.writeHead(206, {
        'Content-Range': 'bytes ' + start + '-' + end + '/' + gridFile.length,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
      });

    gridFile.seek(start, function () {
      // get gridFile stream
              var stream = gridFile.stream(true);
              var ended = false;
              var bufferIdx = 0;
              var bufferAvail = 0;
              var range = (end - start) + 1;
              var totalbyteswanted = (end - start) + 1;
              var totalbyteswritten = 0;
              // write to response
              stream.on('data', function (buff) {
              bufferAvail += buff.length;
              //Ok check if we have enough to cover our range
              if(bufferAvail < range) {
              //Not enough bytes to satisfy our full range
                  if(bufferAvail > 0)
                  {
                  //Write full buffer
                    res.write(buff);
                    totalbyteswritten += buff.length;
                    range -= buff.length;
                    bufferIdx += buff.length;
                    bufferAvail -= buff.length;
                  }
              }
              else{
              //Enough bytes to satisfy our full range!
                  if(bufferAvail > 0) {
                    var buffer = buff.slice(0,range);
                    res.write(buffer);
                    totalbyteswritten += buffer.length;
                    bufferIdx += range;
                    bufferAvail -= range;
                  }
              }
              if(totalbyteswritten >= totalbyteswanted) {
              //  totalbytes = 0;
                gridFile.close();
                res.end();
                this.destroy();
              }
              });
          });
    }else{
          // stream back whole file
        res.header("Accept-Ranges", "bytes");
        res.header('Content-Type', contentType);
        res.header('Content-Length', gridFile.length);
        var stream = gridFile.stream(true).pipe(res);
  }
}

export default GridStoreAdapter;
