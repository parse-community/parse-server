// FilesController.js
import { Parse } from 'parse/node';
import { randomHexString } from '../cryptoUtils';

export class FilesController {
  constructor(filesAdapter) {
    this._filesAdapter = filesAdapter;
  }

  getFileData(config, filename) {
    return this._filesAdapter.getFileData(config, filename);
  }

  createFile(config, filename, data) {
    filename = randomHexString(32) + '_' + filename;
    var location = this._filesAdapter.getFileLocation(config, filename);
    return this._filesAdapter.createFile(config, filename, data).then(() => {
      return Promise.resolve({
        url: location,
        name: filename
      });
    });
  } 

  deleteFile(config, filename) {
    return this._filesAdapter.deleteFile(config, filename);
  }

  /**
   * Find file references in REST-format object and adds the url key
   * with the current mount point and app id.
   * Object may be a single object or list of REST-format objects.
   */
  expandFilesInObject(config, object) {
    if (object instanceof Array) {
      object.map((obj) => this.expandFilesInObject(config, obj));
      return;
    }
    if (typeof object !== 'object') {
      return;
    }
    for (let key in object) {
      let fileObject = object[key];
      if (fileObject && fileObject['__type'] === 'File') {
        if (fileObject['url']) {
          continue;
        }
        let filename = fileObject['name'];
        if (filename.indexOf('tfss-') === 0) {
          fileObject['url'] = 'http://files.parsetfss.com/' + config.fileKey + '/' + encodeURIComponent(filename);
        } else {
          fileObject['url'] = this._filesAdapter.getFileLocation(config, filename);
        }
      }
    }
  }
}

export default FilesController;
