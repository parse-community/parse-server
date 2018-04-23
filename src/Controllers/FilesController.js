// FilesController.js
import { randomHexString } from '../cryptoUtils';
import AdaptableController from './AdaptableController';
import { FilesAdapter } from '../Adapters/Files/FilesAdapter';
import path  from 'path';
import mime from 'mime';

const legacyFilesRegex = new RegExp("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}-.*");

export class FilesController extends AdaptableController {

  getFileData(config, filename) {
    return this.adapter.getFileData(filename);
  }

  createFile(config, filename, data, contentType) {

    const extname = path.extname(filename);

    const hasExtension = extname.length > 0;

    if (!hasExtension && contentType && mime.getExtension(contentType)) {
      filename = filename + '.' + mime.getExtension(contentType);
    } else if (hasExtension && !contentType) {
      contentType = mime.getType(filename);
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
    for (const key in object) {
      const fileObject = object[key];
      if (fileObject && fileObject['__type'] === 'File') {
        if (fileObject['url']) {
          continue;
        }
        const filename = fileObject['name'];
        // all filenames starting with "tfss-" should be from files.parsetfss.com
        // all filenames starting with a "-" seperated UUID should be from files.parse.com
        // all other filenames have been migrated or created from Parse Server
        if (config.fileKey === undefined) {
          fileObject['url'] = this.adapter.getFileLocation(config, filename);
        } else {
          if (filename.indexOf('tfss-') === 0) {
            fileObject['url'] = 'http://files.parsetfss.com/' + config.fileKey + '/' + encodeURIComponent(filename);
          } else if (legacyFilesRegex.test(filename)) {
            fileObject['url'] = 'http://files.parse.com/' + config.fileKey + '/' + encodeURIComponent(filename);
          } else {
            fileObject['url'] = this.adapter.getFileLocation(config, filename);
          }
        }
      }
    }
  }

  expectedAdapterType() {
    return FilesAdapter;
  }

  getFileStream(config, filename) {
    return this.adapter.getFileStream(filename);
  }
}

export default FilesController;
