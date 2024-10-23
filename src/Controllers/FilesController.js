// FilesController.js
import { randomHexString } from '../cryptoUtils';
import AdaptableController from './AdaptableController';
import { validateFilename, FilesAdapter } from '../Adapters/Files/FilesAdapter';
import path from 'path';
const Parse = require('parse').Parse;

const legacyFilesRegex = new RegExp(
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}-.*'
);

export class FilesController extends AdaptableController {
  getFileData(config, filename) {
    return this.adapter.getFileData(filename);
  }

  async createFile(config, filename, data, contentType, options) {
    const extname = path.extname(filename);

    const hasExtension = extname.length > 0;
    const mime = (await import('mime')).default
    if (!hasExtension && contentType && mime.getExtension(contentType)) {
      filename = filename + '.' + mime.getExtension(contentType);
    } else if (hasExtension && !contentType) {
      contentType = mime.getType(filename);
    }

    if (!this.options.preserveFileName) {
      filename = randomHexString(32) + '_' + filename;
    }

    const location = await this.adapter.getFileLocation(config, filename);
    await this.adapter.createFile(filename, data, contentType, options);
    return {
      url: location,
      name: filename,
    }
  }

  deleteFile(config, filename) {
    return this.adapter.deleteFile(filename);
  }

  getMetadata(filename) {
    if (typeof this.adapter.getMetadata === 'function') {
      return this.adapter.getMetadata(filename);
    }
    return Promise.resolve({});
  }

  /**
   * Find file references in REST-format object and adds the url key
   * with the current mount point and app id.
   * Object may be a single object or list of REST-format objects.
   */
  async expandFilesInObject(config, object) {
    if (object instanceof Array) {
      const promises = object.map(obj => this.expandFilesInObject(config, obj));
      await Promise.all(promises);
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
          fileObject['url'] = await this.adapter.getFileLocation(config, filename);
        } else {
          if (filename.indexOf('tfss-') === 0) {
            fileObject['url'] =
              'http://files.parsetfss.com/' + config.fileKey + '/' + encodeURIComponent(filename);
          } else if (legacyFilesRegex.test(filename)) {
            fileObject['url'] =
              'http://files.parse.com/' + config.fileKey + '/' + encodeURIComponent(filename);
          } else {
            fileObject['url'] = await this.adapter.getFileLocation(config, filename);
          }
        }
      }
    }
  }

  expectedAdapterType() {
    return FilesAdapter;
  }

  handleFileStream(config, filename, req, res, contentType) {
    return this.adapter.handleFileStream(filename, req, res, contentType);
  }

  validateFilename(filename) {
    if (typeof this.adapter.validateFilename === 'function') {
      const error = this.adapter.validateFilename(filename);
      if (typeof error !== 'string') {
        return error;
      }
      return new Parse.Error(Parse.Error.INVALID_FILE_NAME, error);
    }
    return validateFilename(filename);
  }
}

export default FilesController;
