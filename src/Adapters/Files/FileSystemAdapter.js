// FileSystemAdapter
//
// Stores files in local file system
// Requires write access to the server's file system.

import { FilesAdapter } from './FilesAdapter';
import colors from 'colors';
var fs = require('fs');
var path = require('path');

export class FileSystemAdapter extends FilesAdapter {

  constructor({filesSubDirectory = ''} = {}) {
    super();

    this._filesDir = filesSubDirectory;
    this._mkdir(filesSubDirectory);
  }

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

  /*
    Helpers
   --------------- */

  _getLocalFilePath(config, filename) {
    let filesDir = 'files';
    let applicationDir = filesDir + '/' + this._filesDir;
    if (!fs.existsSync(applicationDir)) {
      this._mkdir(applicationDir);
    }
    return (applicationDir + '/' + encodeURIComponent(filename));
  }

  _mkdir(path, root) {
    // snippet found on -> http://stackoverflow.com/a/10600228
    var dirs = path.split('/'), dir = dirs.shift(), root = (root || '') + dir + '/';

    try {
      fs.mkdirSync(root);
    }
    catch (e) {
      if ( e.code == 'EACCES' ) {
          console.error("");
          console.error(colors.red("ERROR: In order to use the FileSystemAdapter, write access to the server's file system is required"));
          console.error("");
          process.exit(1);
      }
      //dir wasn't made, something went wrong
      if(!fs.statSync(root).isDirectory()) throw new Error(e);
    }
    return !dirs.length || this._mkdir(dirs.join('/'), root);
  }
}

export default FileSystemAdapter;