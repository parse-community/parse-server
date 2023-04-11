// FilesController.js
import { randomHexString } from '../cryptoUtils';
import AdaptableController from './AdaptableController';
import { validateFilename, FilesAdapter } from '../Adapters/Files/FilesAdapter';
import path from 'path';
import mime from 'mime';
import { Parse } from 'parse/node';
import RestQuery from '../RestQuery';
import { randomString } from '../cryptoUtils';

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

  /**
   * Find file references in REST-format object and adds the url key
   * with the current mount point and app id.
   * Object may be a single object or list of REST-format objects.
   */
  async expandFilesInObject(config, object, className, auth, op) {
    if (object instanceof Array) {
      return Promise.all(
        object.map(obj => this.expandFilesInObject(config, obj, className, auth, op))
      );
    }
    if (typeof object !== 'object') {
      return;
    }
    await Promise.all(
      Object.keys(object).map(async key => {
        const fileObject = object[key];
        if (fileObject && fileObject['__type'] === 'File') {
          const filename = fileObject['name'];
          if (!fileObject.url) {
            fileObject.url = this.adapter.getFileLocation(config, filename);
          }
          if (className.charAt(0) !== '_' && op !== 'delete') {
            const file = new Parse.File(filename);
            file._url = fileObject.url;
            const files = await new RestQuery(
              config,
              auth,
              '_FileObject',
              { file: file.toJSON() },
              { limit: 1 }
            ).execute();
            if (files.results.length === 0 && !config.fileUpload.enableLegacyAccess) {
              delete object[key];
              return;
            }
            const [token] = await Promise.all([
              this.createFileSession(config, auth, files.results[0].objectId),
              (async () => {
                try {
                  const refFile = Parse.Object.extend('_FileObject').createWithoutData(
                    files.results[0].objectId
                  );
                  const reference = await new Parse.Query('_FileReference')
                    .equalTo({
                      file: refFile,
                      referenceId: object.objectId,
                      referenceClass: className,
                    })
                    .first({ useMasterKey: true });
                  if (!reference) {
                    const fileReference = new Parse.Object('_FileReference');
                    fileReference.set({
                      file: Parse.Object.extend('_FileObject').createWithoutData(
                        files.results[0].objectId
                      ),
                      referenceId: object.objectId,
                      referenceClass: className,
                    });
                    await fileReference.save(null, { useMasterKey: true });
                  }
                } catch (e) {
                  /* */
                }
              })(),
            ]);
            fileObject['url'] = `${fileObject['url']}?token=${token}`;
          }
        }
      })
    );
  }

  async createFileSession(config, auth, objectId) {
    const fileObj = Parse.Object.extend('_FileObject').createWithoutData(objectId);
    const token = randomString(32);
    const expiry = new Date();
    expiry.setTime(expiry.getTime() + config.fileUpload.tokenValidityDuration * 1000);
    const fileSession = new Parse.Object('_FileSession');
    fileSession.set({
      file: fileObj,
      token,
      expiry,
      master: auth?.isMaster,
      sessionToken: auth?.user?.getSessionToken(),
      installationId: auth?.installationId,
    });
    await fileSession.save(null, { useMasterKey: true });

    clearTimeout(this.clearExpiredFileSessions);
    this.clearExpiredFileSessions = setTimeout(() => {
      new Parse.Query('_FileSession')
        .lessThan('expiry', new Date())
        .each(session => session.destroy({ useMasterKey: true }), { useMasterKey: true });
    }, 5000);

    return token;
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
