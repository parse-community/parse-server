// FilesController.js
import { Parse } from 'parse/node';
import { randomHexString } from '../cryptoUtils';
import AdaptableController from './AdaptableController';
import { FilesAdapter } from '../Adapters/Files/FilesAdapter';
import path  from 'path';
import mime from 'mime';

export class FilesController extends AdaptableController {

  getFileData(config, filename) {
    return this.adapter.getFileData(filename);
  }

  createFile(config, filename, data, contentType) {

    let extname = path.extname(filename);

    const hasExtension = extname.length > 0;

    if (!hasExtension && contentType && mime.extension(contentType)) {
      filename = filename + '.' + mime.extension(contentType);
    } else if (hasExtension && !contentType) {
      contentType = mime.lookup(filename);
    }

    filename = randomHexString(32) + '_' + filename;

    var location = this.adapter.getFileLocation(config, filename);
    return this.adapter.createFile(filename, data, contentType).then(() => {
      return Promise.resolve({
        url: location,
        name: filename
      });
    });
  }

  deleteFile(config, filename) {
    return this.adapter.deleteFile(filename);
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
          fileObject['url'] = this.adapter.getFileLocation(config, filename);
        }
      }
    }
  }

  expectedAdapterType() {
    return FilesAdapter;
  }
}

export default FilesController;
