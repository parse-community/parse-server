// FileSystemAdapter
//
// Stores files in local file system
// Requires write access to the server's file system.

import { FilesAdapter } from './FilesAdapter';
var fs = require('fs');

export class FileSystemAdapter extends FilesAdapter {
  // For a given config object, filename, and data, store a file
  // Returns a promise
  createFile(config, filename, data) {
    return new Promise((resolve, reject) => {
      let filepath = this._getLocalFilePath(config, filename);
      fs.writeFile(filepath, data, (err) => {
        if(err !== null) {
          return reject(err);
        }
        resolve(data);
      });
    });
  }

  deleteFile(config, filename) {
    return new Promise((resolve, reject) => {
      let filepath = this._getLocalFilePath(config, filename);
      fs.readFile( filepath , function (err, data) {
        if(err !== null) {
          return reject(err);
        }
        fs.unlink(filepath, (unlinkErr) => {
        if(err !== null) {
            return reject(unlinkErr);
          }
          resolve(data);
        });
      });

    });
  }

  getFileData(config, filename) {
    return new Promise((resolve, reject) => {
      let filepath = this._getLocalFilePath(config, filename);
      fs.readFile( filepath , function (err, data) {
        if(err !== null) {
          return reject(err);
        }
        resolve(data);
      });
    });
  }

  getFileLocation(config, filename) {
    return (config.mount + '/' + this._getLocalFilePath(config, filename));
  }

  _getLocalFilePath(config, filename) {
    let filesDir = 'files';
    if (!fs.existsSync(filesDir)) {
      fs.mkdirSync(filesDir);
    }

    let applicationDir = filesDir + '/' + config.applicationId;
    if (!fs.existsSync(applicationDir)) {
      fs.mkdirSync(applicationDir);
    }
    return (applicationDir + '/' + encodeURIComponent(filename));
  }
}

export default FileSystemAdapter;