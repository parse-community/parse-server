// FilesController.js
import { randomHexString } from '../cryptoUtils';
import AdaptableController from './AdaptableController';
import { validateFilename, FilesAdapter } from '../Adapters/Files/FilesAdapter';
import path from 'path';
import mime from 'mime';
import { randomString } from '../cryptoUtils';
import { Parse } from 'parse/node';
import { getAuthForSessionToken } from '../Auth';

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
  async canViewFile(config, fileObject, user) {
    const acl = new Parse.ACL(fileObject.ACL);
    if (!acl || acl.getPublicReadAccess()) {
      return true;
    }
    if (!user) {
      return false;
    }
    if (acl.getReadAccess(user.id)) {
      return true;
    }
    const auth = getAuthForSessionToken({
      config,
      sessionToken: user.getSessionToken(),
    });

    // Check if the user has any roles that match the ACL
    return Promise.resolve()
      .then(async () => {
        // Resolve false right away if the acl doesn't have any roles
        const acl_has_roles = Object.keys(acl.permissionsById).some(key => key.startsWith('role:'));
        if (!acl_has_roles) {
          return false;
        }

        const roleNames = await auth.getUserRoles();
        // Finally, see if any of the user's roles allow them read access
        for (const role of roleNames) {
          // We use getReadAccess as `role` is in the form `role:roleName`
          if (acl.getReadAccess(role)) {
            return true;
          }
        }
        return false;
      })
      .catch(() => {
        return false;
      });
  }
  getMetadata(filename) {
    if (typeof this.adapter.getMetadata === 'function') {
      return this.adapter.getMetadata(filename);
    }
    return Promise.resolve({});
  }
  async updateReferences(data, originalData, className) {
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
    const fileData = await fileQuery.find({ useMasterKey: true });
    const filesToSave = [];
    for (const fileObject of fileData) {
      const { _name } = fileObject.get('file');
      if (referencesToAdd.includes(_name)) {
        fileObject.addUnique('references', {
          objectId: data.objectId,
          className,
        });
      } else {
        fileObject.remove('references', { objectId: data.objectId, className });
      }
      filesToSave.push(fileObject);
    }
    await Parse.Object.saveAll(filesToSave, { useMasterKey: true });
  }
  async getAuthForFile(config, file, auth, object, className) {
    if (className === '_File') {
      return;
    }
    const [fileObject] = await config.database.find('_File', {
      file,
    });
    if (!fileObject) {
      return;
    }
    let toSave = false;
    const tokens = fileObject.tokens || [];
    const allowed = await this.canViewFile(config, fileObject, auth.user);
    if (allowed) {
      const url = file.url.split('?');
      let appendToken = '';
      if (url.length > 1) {
        appendToken = `${url[1]}&`;
      }
      const token = randomString(25);
      appendToken += `token=${token}`;
      file.url = `${url[0]}?${appendToken}`;
      const expiry = new Date(new Date().getTime() + 30 * 60000);
      tokens.push({
        token,
        expiry,
        user: auth.user,
      });
      toSave = true;
    }
    const references = fileObject.references || [];
    if (!references.includes({ objectId: object.objectId, className })) {
      references.push({ objectId: object.objectId, className });
      toSave = true;
    }
    for (var i = tokens.length - 1; i >= 0; i--) {
      const token = tokens[i];
      const expiry = token.expiry;
      if (!expiry || expiry < new Date()) {
        tokens.splice(i, 1);
        toSave = true;
      }
    }
    if (toSave) {
      fileObject.tokens = tokens;
      await this.config.database.update('_File', { file }, fileObject);
    }
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
          await this.getAuthForFile(config, fileObject, auth, object, className);
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
        await this.getAuthForFile(config, fileObject, auth, object, className);
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
