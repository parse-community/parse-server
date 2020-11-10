// FilesController.js
import { randomHexString } from '../cryptoUtils';
import AdaptableController from './AdaptableController';
import { validateFilename, FilesAdapter } from '../Adapters/Files/FilesAdapter';
import path from 'path';
import mime from 'mime';
import { authenticator } from 'otplib';
const Parse = require('parse').Parse;

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
    return this.adapter
      .createFile(filename, data, contentType, options)
      .then(() => {
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
  async getAuthForFile(config, file, auth) {
    const [fileObject] = await config.database.find('_File', {
      file,
    });
    const user = auth.user;
    if (fileObject && fileObject.authACL) {
      const acl = new Parse.ACL(fileObject.authACL);
      if (!acl || acl.getPublicReadAccess() || !user) {
        return;
      }
      const isAllowed = () => {
        if (acl.getReadAccess(user.id)) {
          return true;
        }

        // Check if the user has any roles that match the ACL
        return Promise.resolve()
          .then(async () => {
            // Resolve false right away if the acl doesn't have any roles
            const acl_has_roles = Object.keys(acl.permissionsById).some(key =>
              key.startsWith('role:')
            );
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
      };
      const allowed = await isAllowed();
      if (allowed) {
        const token = authenticator.generate(fileObject.authSecret);
        file.url = file.url + '?token=' + token;
      }
    }
  }
  /**
   * Find file references in REST-format object and adds the url key
   * with the current mount point and app id.
   * Object may be a single object or list of REST-format objects.
   */
  async expandFilesInObject(config, object, auth) {
    if (object instanceof Array) {
      await Promise.all(
        object.map(
          async obj => await this.expandFilesInObject(config, obj, auth)
        )
      );
      return;
    }
    if (typeof object !== 'object') {
      return;
    }
    for (const key in object) {
      const fileObject = object[key];
      if (fileObject && fileObject['__type'] === 'File') {
        if (fileObject['url']) {
          await this.getAuthForFile(config, fileObject, auth);
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
              'http://files.parsetfss.com/' +
              config.fileKey +
              '/' +
              encodeURIComponent(filename);
          } else if (legacyFilesRegex.test(filename)) {
            fileObject['url'] =
              'http://files.parse.com/' +
              config.fileKey +
              '/' +
              encodeURIComponent(filename);
          } else {
            fileObject['url'] = this.adapter.getFileLocation(config, filename);
          }
        }
        await this.getAuthForFile(config, fileObject, auth);
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
