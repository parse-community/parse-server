// FileSystemAdapter
//
// Stores files in local file system
// Requires write access to the server's file system.

import { FilesAdapter } from './FilesAdapter';
import colors from 'colors';
var fs = require('fs');
var path = require('path');
var pathSep = require('path').sep;

export class FileSystemAdapter extends FilesAdapter {

  constructor({filesSubDirectory = ''} = {}) {
    super();

    this._filesDir = filesSubDirectory;
    this._mkdir(this._getApplicationDir());
    if (!this._applicationDirExist()) {
      throw "Files directory doesn't exist.";
    }
  }

  // For a given config object, filename, and data, store a file
  // Returns a promise
  createFile(config, filename, data) {
    return new Promise((resolve, reject) => {
      let filepath = this._getLocalFilePath(filename);
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
      let filepath = this._getLocalFilePath(filename);
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
      let filepath = this._getLocalFilePath(filename);
      fs.readFile( filepath , function (err, data) {
        if(err !== null) {
          return reject(err);
        }
        resolve(data);
      });
    });
  }

  getFileLocation(config, filename) {
    return (config.mount + '/' + this._getLocalFilePath(filename));
  }

  /*
    Helpers
   --------------- */
   _getApplicationDir() {
    if (this._filesDir) {
      return path.join('files', this._filesDir);
    } else {
      return 'files';
    }
   }

  _applicationDirExist() {
    return fs.existsSync(this._getApplicationDir());
  }

  _getLocalFilePath(filename) {
    let applicationDir = this._getApplicationDir();
    if (!fs.existsSync(applicationDir)) {
      this._mkdir(applicationDir);
    }
    return path.join(applicationDir, encodeURIComponent(filename));
  }

  _mkdir(path) {
    // snippet found on -> https://gist.github.com/danherbert-epam/3960169
    var dirs = path.split(pathSep);
    var root = "";

    while (dirs.length > 0) {
      var dir = dirs.shift();
      if (dir === "") { // If directory starts with a /, the first path will be an empty string.
        root = pathSep;
      }
      if (!fs.existsSync(root + dir)) {
        try {
          fs.mkdirSync(root + dir);
        } 
        catch (e) {
          if ( e.code == 'EACCES' ) {
              console.error("");
              console.error(colors.red("ERROR: In order to use the FileSystemAdapter, write access to the server's file system is required"));
              console.error("");
          }
        }
      }
      root += dir + pathSep;
    }
  }
}

export default FileSystemAdapter;