// FilesController.js
import { randomHexString } from '../cryptoUtils';
import AdaptableController from './AdaptableController';
import { validateFilename, FilesAdapter } from '../Adapters/Files/FilesAdapter';
import path from 'path';
import mime from 'mime';
import { randomString } from '../cryptoUtils';
import { Parse } from 'parse/node';

const legacyFilesRegex = new RegExp(
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}-.*'
);

export class FilesController extends AdaptableController {
  getFileData(config, filename) {
    return this.adapter.getFileData(filename);
  }

  createFile(config, filename, data, contentType, options) {
    const extname = path.extname(filename);

    const hasExtension = extname.length > 0;

    if (!hasExtension && contentType && mime.getExtension(contentType)) {
      filename = filename + '.' + mime.getExtension(contentType);
    } else if (hasExtension && !contentType) {
      contentType = mime.getType(filename);
    }

    if (!this.options.preserveFileName) {
      filename = randomHexString(32) + '_' + filename;
    }

    const location = this.adapter.getFileLocation(config, filename);
    return this.adapter.createFile(filename, data, contentType, options).then(() => {
      return Promise.resolve({
        url: location,
        name: filename,
      });
    });
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
  async updateReferences(data, originalData, className) {
    if (className === '_File' || className === '_FileToken') {
      return;
    }
    const referencesToAdd = [];
    const referencesToRemove = [];
    const searchForSubfiles = (keyData, keyOriginalData) => {
      if (typeof keyData !== 'object') {
        return;
      }
      if (!keyOriginalData) {
        keyOriginalData = {};
      }
      for (const key in keyData) {
        const val = keyData[key] || {};
        const original = keyOriginalData[key] || {};
        if (typeof val !== 'object') {
          continue;
        }
        const { __type, name } = val;
        if (__type === 'File' || original.__type == 'File') {
          if (name === original.name) {
            continue;
          }
          if (name && original.name == null) {
            referencesToAdd.push(name);
          }
          if (original.name && name == null) {
            referencesToRemove.push(name);
          }
          continue;
        }
        searchForSubfiles(val, original);
      }
    };
    searchForSubfiles(data, originalData);
    const allFiles = referencesToAdd.concat(referencesToRemove);
    if (allFiles.length == 0) {
      return;
    }
    const filesToFind = allFiles.map(val => new Parse.File(val).toJSON());
    const fileQuery = new Parse.Query('_File');
    fileQuery.containedIn('file', filesToFind);

    const refFileQuery = new Parse.Query('_FileReference');
    refFileQuery.equalTo('reference', data.objectId);
    refFileQuery.equalTo('class', className);

    const promises = await Promise.all([
      fileQuery.find({ useMasterKey: true }),
      refFileQuery.first({ useMasterKey: true }),
    ]);
    const fileData = promises[0];
    let fileReference = promises[1];
    if (!fileReference) {
      fileReference = new Parse.Object('_FileReference');
      fileReference.set('reference', data.objectId);
      fileReference.set('class', className);
      await fileReference.save(null, { useMasterKey: true });
    }
    const filesToSave = [];
    for (const fileObject of fileData) {
      const { _name } = fileObject.get('file');
      const relation = fileObject.get('references');

      if (referencesToAdd.includes(_name)) {
        relation.add(fileReference);
      } else {
        relation.remove(fileReference);
      }
      filesToSave.push(fileObject);
    }
    await Parse.Object.saveAll(filesToSave, { useMasterKey: true });
  }
  async getAuthForFile(file, auth, object, className) {
    if (className === '_File') {
      return;
    }
    const fileQuery = new Parse.Query('_File');
    fileQuery.equalTo('file', file);
    const getFileData = {};
    if (auth && auth.user && auth.user.getSessionToken()) {
      getFileData.sessionToken = auth.user.getSessionToken();
    }
    if (auth && auth.master) {
      getFileData.useMasterKey = true;
    }
    let fileObject;
    try {
      fileObject = await fileQuery.first(getFileData);
    } catch (e) {
      console.log(e);
      return;
    }
    if (!fileObject) {
      return;
    }
    const toSave = [];
    const url = file.url.split('?');
    let appendToken = '';
    if (url.length > 1) {
      appendToken = `${url[1]}&`;
    }
    const token = randomString(25);
    appendToken += `token=${token}`;
    file.url = `${url[0]}?${appendToken}`;
    const expiry = new Date(new Date().getTime() + 30 * 60000);

    const fileToken = new Parse.Object('_FileToken');
    fileToken.set('fileObject', fileObject);
    fileToken.set('file', file);
    fileToken.set('token', token);
    fileToken.set('expiry', expiry);
    if (auth && auth.user) {
      fileToken.set('user', auth.user);
    }
    if (auth && auth.master) {
      fileToken.set('master', true);
    }
    toSave.push(fileToken);

    const relation = fileObject.relation('references');
    const refQuery = relation.query();
    refQuery.equalTo('reference', object.objectId);
    refQuery.equalTo('class', className);

    const refFileQuery = new Parse.Query('_FileReference');
    refFileQuery.equalTo('reference', object.objectId);
    refFileQuery.equalTo('class', className);

    const promises = await Promise.all([
      refQuery.first({ useMasterKey: true }),
      refFileQuery.first({ useMasterKey: true }),
    ]);
    const isAdded = promises[0];
    let fileReference = promises[1];
    if (!isAdded) {
      if (!fileReference) {
        fileReference = new Parse.Object('_FileReference');
        fileReference.set('reference', object.objectId);
        fileReference.set('class', className);
        await fileReference.save(null, { useMasterKey: true });
      }
      relation.add(fileReference);
      toSave.push(fileObject);
    }

    if (toSave.length == 0) {
      return;
    }
    await Parse.Object.saveAll(toSave, { useMasterKey: true });
  }
  /**
   * Find file references in REST-format object and adds the url key
   * with the current mount point and app id.
   * Object may be a single object or list of REST-format objects.
   */
  async expandFilesInObject(config, object, auth, className) {
    const promises = [];
    if (object instanceof Array) {
      object.map(obj => promises.push(this.expandFilesInObject(config, obj, auth, className)));
    }
    if (promises.length != 0) {
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
          await this.getAuthForFile(fileObject, auth, object, className);
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
            fileObject['url'] =
              'http://files.parsetfss.com/' + config.fileKey + '/' + encodeURIComponent(filename);
          } else if (legacyFilesRegex.test(filename)) {
            fileObject['url'] =
              'http://files.parse.com/' + config.fileKey + '/' + encodeURIComponent(filename);
          } else {
            fileObject['url'] = this.adapter.getFileLocation(config, filename);
          }
        }
        await this.getAuthForFile(fileObject, auth, object, className);
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
