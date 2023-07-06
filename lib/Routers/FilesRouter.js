"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FilesRouter = void 0;
var _express = _interopRequireDefault(require("express"));
var _bodyParser = _interopRequireDefault(require("body-parser"));
var Middlewares = _interopRequireWildcard(require("../middlewares"));
var _node = _interopRequireDefault(require("parse/node"));
var _Config = _interopRequireDefault(require("../Config"));
var _mime = _interopRequireDefault(require("mime"));
var _logger = _interopRequireDefault(require("../logger"));
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const triggers = require('../triggers');
const http = require('http');
const Utils = require('../Utils');
const downloadFileFromURI = uri => {
  return new Promise((res, rej) => {
    http.get(uri, response => {
      response.setDefaultEncoding('base64');
      let body = `data:${response.headers['content-type']};base64,`;
      response.on('data', data => body += data);
      response.on('end', () => res(body));
    }).on('error', e => {
      rej(`Error downloading file from ${uri}: ${e.message}`);
    });
  });
};
const addFileDataIfNeeded = async file => {
  if (file._source.format === 'uri') {
    const base64 = await downloadFileFromURI(file._source.uri);
    file._previousSave = file;
    file._data = base64;
    file._requestTask = null;
  }
  return file;
};
class FilesRouter {
  expressRouter({
    maxUploadSize = '20Mb'
  } = {}) {
    var router = _express.default.Router();
    router.get('/files/:appId/:filename', this.getHandler);
    router.get('/files/:appId/metadata/:filename', this.metadataHandler);
    router.post('/files', function (req, res, next) {
      next(new _node.default.Error(_node.default.Error.INVALID_FILE_NAME, 'Filename not provided.'));
    });
    router.post('/files/:filename', _bodyParser.default.raw({
      type: () => {
        return true;
      },
      limit: maxUploadSize
    }),
    // Allow uploads without Content-Type, or with any Content-Type.
    Middlewares.handleParseHeaders, Middlewares.handleParseSession, this.createHandler);
    router.delete('/files/:filename', Middlewares.handleParseHeaders, Middlewares.handleParseSession, Middlewares.enforceMasterKeyAccess, this.deleteHandler);
    return router;
  }
  getHandler(req, res) {
    const config = _Config.default.get(req.params.appId);
    if (!config) {
      res.status(403);
      const err = new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, 'Invalid application ID.');
      res.json({
        code: err.code,
        error: err.message
      });
      return;
    }
    const filesController = config.filesController;
    const filename = req.params.filename;
    const contentType = _mime.default.getType(filename);
    if (isFileStreamable(req, filesController)) {
      filesController.handleFileStream(config, filename, req, res, contentType).catch(() => {
        res.status(404);
        res.set('Content-Type', 'text/plain');
        res.end('File not found.');
      });
    } else {
      filesController.getFileData(config, filename).then(data => {
        res.status(200);
        res.set('Content-Type', contentType);
        res.set('Content-Length', data.length);
        res.end(data);
      }).catch(() => {
        res.status(404);
        res.set('Content-Type', 'text/plain');
        res.end('File not found.');
      });
    }
  }
  async createHandler(req, res, next) {
    var _config$fileUpload;
    const config = req.config;
    const user = req.auth.user;
    const isMaster = req.auth.isMaster;
    const isLinked = user && _node.default.AnonymousUtils.isLinked(user);
    if (!isMaster && !config.fileUpload.enableForAnonymousUser && isLinked) {
      next(new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, 'File upload by anonymous user is disabled.'));
      return;
    }
    if (!isMaster && !config.fileUpload.enableForAuthenticatedUser && !isLinked && user) {
      next(new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, 'File upload by authenticated user is disabled.'));
      return;
    }
    if (!isMaster && !config.fileUpload.enableForPublic && !user) {
      next(new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, 'File upload by public is disabled.'));
      return;
    }
    const filesController = config.filesController;
    const {
      filename
    } = req.params;
    const contentType = req.get('Content-type');
    if (!req.body || !req.body.length) {
      next(new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, 'Invalid file upload.'));
      return;
    }
    const error = filesController.validateFilename(filename);
    if (error) {
      next(error);
      return;
    }
    const fileExtensions = (_config$fileUpload = config.fileUpload) === null || _config$fileUpload === void 0 ? void 0 : _config$fileUpload.fileExtensions;
    if (!isMaster && fileExtensions) {
      const isValidExtension = extension => {
        return fileExtensions.some(ext => {
          if (ext === '*') {
            return true;
          }
          const regex = new RegExp(fileExtensions);
          if (regex.test(extension)) {
            return true;
          }
        });
      };
      let extension = contentType;
      if (filename && filename.includes('.')) {
        extension = filename.split('.')[1];
      } else if (contentType && contentType.includes('/')) {
        extension = contentType.split('/')[1];
      }
      extension = extension.split(' ').join('');
      if (!isValidExtension(extension)) {
        next(new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, `File upload of extension ${extension} is disabled.`));
        return;
      }
    }
    const base64 = req.body.toString('base64');
    const file = new _node.default.File(filename, {
      base64
    }, contentType);
    const {
      metadata = {},
      tags = {}
    } = req.fileData || {};
    try {
      // Scan request data for denied keywords
      Utils.checkProhibitedKeywords(config, metadata);
      Utils.checkProhibitedKeywords(config, tags);
    } catch (error) {
      next(new _node.default.Error(_node.default.Error.INVALID_KEY_NAME, error));
      return;
    }
    file.setTags(tags);
    file.setMetadata(metadata);
    const fileSize = Buffer.byteLength(req.body);
    const fileObject = {
      file,
      fileSize
    };
    try {
      // run beforeSaveFile trigger
      const triggerResult = await triggers.maybeRunFileTrigger(triggers.Types.beforeSave, fileObject, config, req.auth);
      let saveResult;
      // if a new ParseFile is returned check if it's an already saved file
      if (triggerResult instanceof _node.default.File) {
        fileObject.file = triggerResult;
        if (triggerResult.url()) {
          // set fileSize to null because we wont know how big it is here
          fileObject.fileSize = null;
          saveResult = {
            url: triggerResult.url(),
            name: triggerResult._name
          };
        }
      }
      // if the file returned by the trigger has already been saved skip saving anything
      if (!saveResult) {
        // if the ParseFile returned is type uri, download the file before saving it
        await addFileDataIfNeeded(fileObject.file);
        // update fileSize
        const bufferData = Buffer.from(fileObject.file._data, 'base64');
        fileObject.fileSize = Buffer.byteLength(bufferData);
        // prepare file options
        const fileOptions = {
          metadata: fileObject.file._metadata
        };
        // some s3-compatible providers (DigitalOcean, Linode) do not accept tags
        // so we do not include the tags option if it is empty.
        const fileTags = Object.keys(fileObject.file._tags).length > 0 ? {
          tags: fileObject.file._tags
        } : {};
        Object.assign(fileOptions, fileTags);
        // save file
        const createFileResult = await filesController.createFile(config, fileObject.file._name, bufferData, fileObject.file._source.type, fileOptions);
        // update file with new data
        fileObject.file._name = createFileResult.name;
        fileObject.file._url = createFileResult.url;
        fileObject.file._requestTask = null;
        fileObject.file._previousSave = Promise.resolve(fileObject.file);
        saveResult = {
          url: createFileResult.url,
          name: createFileResult.name
        };
      }
      // run afterSaveFile trigger
      await triggers.maybeRunFileTrigger(triggers.Types.afterSave, fileObject, config, req.auth);
      res.status(201);
      res.set('Location', saveResult.url);
      res.json(saveResult);
    } catch (e) {
      _logger.default.error('Error creating a file: ', e);
      const error = triggers.resolveError(e, {
        code: _node.default.Error.FILE_SAVE_ERROR,
        message: `Could not store file: ${fileObject.file._name}.`
      });
      next(error);
    }
  }
  async deleteHandler(req, res, next) {
    try {
      const {
        filesController
      } = req.config;
      const {
        filename
      } = req.params;
      // run beforeDeleteFile trigger
      const file = new _node.default.File(filename);
      file._url = filesController.adapter.getFileLocation(req.config, filename);
      const fileObject = {
        file,
        fileSize: null
      };
      await triggers.maybeRunFileTrigger(triggers.Types.beforeDelete, fileObject, req.config, req.auth);
      // delete file
      await filesController.deleteFile(req.config, filename);
      // run afterDeleteFile trigger
      await triggers.maybeRunFileTrigger(triggers.Types.afterDelete, fileObject, req.config, req.auth);
      res.status(200);
      // TODO: return useful JSON here?
      res.end();
    } catch (e) {
      _logger.default.error('Error deleting a file: ', e);
      const error = triggers.resolveError(e, {
        code: _node.default.Error.FILE_DELETE_ERROR,
        message: 'Could not delete file.'
      });
      next(error);
    }
  }
  async metadataHandler(req, res) {
    try {
      const config = _Config.default.get(req.params.appId);
      const {
        filesController
      } = config;
      const {
        filename
      } = req.params;
      const data = await filesController.getMetadata(filename);
      res.status(200);
      res.json(data);
    } catch (e) {
      res.status(200);
      res.json({});
    }
  }
}
exports.FilesRouter = FilesRouter;
function isFileStreamable(req, filesController) {
  const range = (req.get('Range') || '/-/').split('-');
  const start = Number(range[0]);
  const end = Number(range[1]);
  return (!isNaN(start) || !isNaN(end)) && typeof filesController.adapter.handleFileStream === 'function';
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJ0cmlnZ2VycyIsInJlcXVpcmUiLCJodHRwIiwiVXRpbHMiLCJkb3dubG9hZEZpbGVGcm9tVVJJIiwidXJpIiwiUHJvbWlzZSIsInJlcyIsInJlaiIsImdldCIsInJlc3BvbnNlIiwic2V0RGVmYXVsdEVuY29kaW5nIiwiYm9keSIsImhlYWRlcnMiLCJvbiIsImRhdGEiLCJlIiwibWVzc2FnZSIsImFkZEZpbGVEYXRhSWZOZWVkZWQiLCJmaWxlIiwiX3NvdXJjZSIsImZvcm1hdCIsImJhc2U2NCIsIl9wcmV2aW91c1NhdmUiLCJfZGF0YSIsIl9yZXF1ZXN0VGFzayIsIkZpbGVzUm91dGVyIiwiZXhwcmVzc1JvdXRlciIsIm1heFVwbG9hZFNpemUiLCJyb3V0ZXIiLCJleHByZXNzIiwiUm91dGVyIiwiZ2V0SGFuZGxlciIsIm1ldGFkYXRhSGFuZGxlciIsInBvc3QiLCJyZXEiLCJuZXh0IiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfRklMRV9OQU1FIiwiQm9keVBhcnNlciIsInJhdyIsInR5cGUiLCJsaW1pdCIsIk1pZGRsZXdhcmVzIiwiaGFuZGxlUGFyc2VIZWFkZXJzIiwiaGFuZGxlUGFyc2VTZXNzaW9uIiwiY3JlYXRlSGFuZGxlciIsImRlbGV0ZSIsImVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MiLCJkZWxldGVIYW5kbGVyIiwiY29uZmlnIiwiQ29uZmlnIiwicGFyYW1zIiwiYXBwSWQiLCJzdGF0dXMiLCJlcnIiLCJPUEVSQVRJT05fRk9SQklEREVOIiwianNvbiIsImNvZGUiLCJlcnJvciIsImZpbGVzQ29udHJvbGxlciIsImZpbGVuYW1lIiwiY29udGVudFR5cGUiLCJtaW1lIiwiZ2V0VHlwZSIsImlzRmlsZVN0cmVhbWFibGUiLCJoYW5kbGVGaWxlU3RyZWFtIiwiY2F0Y2giLCJzZXQiLCJlbmQiLCJnZXRGaWxlRGF0YSIsInRoZW4iLCJsZW5ndGgiLCJ1c2VyIiwiYXV0aCIsImlzTWFzdGVyIiwiaXNMaW5rZWQiLCJBbm9ueW1vdXNVdGlscyIsImZpbGVVcGxvYWQiLCJlbmFibGVGb3JBbm9ueW1vdXNVc2VyIiwiRklMRV9TQVZFX0VSUk9SIiwiZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIiLCJlbmFibGVGb3JQdWJsaWMiLCJ2YWxpZGF0ZUZpbGVuYW1lIiwiZmlsZUV4dGVuc2lvbnMiLCJpc1ZhbGlkRXh0ZW5zaW9uIiwiZXh0ZW5zaW9uIiwic29tZSIsImV4dCIsInJlZ2V4IiwiUmVnRXhwIiwidGVzdCIsImluY2x1ZGVzIiwic3BsaXQiLCJqb2luIiwidG9TdHJpbmciLCJGaWxlIiwibWV0YWRhdGEiLCJ0YWdzIiwiZmlsZURhdGEiLCJjaGVja1Byb2hpYml0ZWRLZXl3b3JkcyIsIklOVkFMSURfS0VZX05BTUUiLCJzZXRUYWdzIiwic2V0TWV0YWRhdGEiLCJmaWxlU2l6ZSIsIkJ1ZmZlciIsImJ5dGVMZW5ndGgiLCJmaWxlT2JqZWN0IiwidHJpZ2dlclJlc3VsdCIsIm1heWJlUnVuRmlsZVRyaWdnZXIiLCJUeXBlcyIsImJlZm9yZVNhdmUiLCJzYXZlUmVzdWx0IiwidXJsIiwibmFtZSIsIl9uYW1lIiwiYnVmZmVyRGF0YSIsImZyb20iLCJmaWxlT3B0aW9ucyIsIl9tZXRhZGF0YSIsImZpbGVUYWdzIiwiT2JqZWN0Iiwia2V5cyIsIl90YWdzIiwiYXNzaWduIiwiY3JlYXRlRmlsZVJlc3VsdCIsImNyZWF0ZUZpbGUiLCJfdXJsIiwicmVzb2x2ZSIsImFmdGVyU2F2ZSIsImxvZ2dlciIsInJlc29sdmVFcnJvciIsImFkYXB0ZXIiLCJnZXRGaWxlTG9jYXRpb24iLCJiZWZvcmVEZWxldGUiLCJkZWxldGVGaWxlIiwiYWZ0ZXJEZWxldGUiLCJGSUxFX0RFTEVURV9FUlJPUiIsImdldE1ldGFkYXRhIiwicmFuZ2UiLCJzdGFydCIsIk51bWJlciIsImlzTmFOIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL1JvdXRlcnMvRmlsZXNSb3V0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGV4cHJlc3MgZnJvbSAnZXhwcmVzcyc7XG5pbXBvcnQgQm9keVBhcnNlciBmcm9tICdib2R5LXBhcnNlcic7XG5pbXBvcnQgKiBhcyBNaWRkbGV3YXJlcyBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4uL0NvbmZpZyc7XG5pbXBvcnQgbWltZSBmcm9tICdtaW1lJztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi4vbG9nZ2VyJztcbmNvbnN0IHRyaWdnZXJzID0gcmVxdWlyZSgnLi4vdHJpZ2dlcnMnKTtcbmNvbnN0IGh0dHAgPSByZXF1aXJlKCdodHRwJyk7XG5jb25zdCBVdGlscyA9IHJlcXVpcmUoJy4uL1V0aWxzJyk7XG5cbmNvbnN0IGRvd25sb2FkRmlsZUZyb21VUkkgPSB1cmkgPT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlcywgcmVqKSA9PiB7XG4gICAgaHR0cFxuICAgICAgLmdldCh1cmksIHJlc3BvbnNlID0+IHtcbiAgICAgICAgcmVzcG9uc2Uuc2V0RGVmYXVsdEVuY29kaW5nKCdiYXNlNjQnKTtcbiAgICAgICAgbGV0IGJvZHkgPSBgZGF0YToke3Jlc3BvbnNlLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddfTtiYXNlNjQsYDtcbiAgICAgICAgcmVzcG9uc2Uub24oJ2RhdGEnLCBkYXRhID0+IChib2R5ICs9IGRhdGEpKTtcbiAgICAgICAgcmVzcG9uc2Uub24oJ2VuZCcsICgpID0+IHJlcyhib2R5KSk7XG4gICAgICB9KVxuICAgICAgLm9uKCdlcnJvcicsIGUgPT4ge1xuICAgICAgICByZWooYEVycm9yIGRvd25sb2FkaW5nIGZpbGUgZnJvbSAke3VyaX06ICR7ZS5tZXNzYWdlfWApO1xuICAgICAgfSk7XG4gIH0pO1xufTtcblxuY29uc3QgYWRkRmlsZURhdGFJZk5lZWRlZCA9IGFzeW5jIGZpbGUgPT4ge1xuICBpZiAoZmlsZS5fc291cmNlLmZvcm1hdCA9PT0gJ3VyaScpIHtcbiAgICBjb25zdCBiYXNlNjQgPSBhd2FpdCBkb3dubG9hZEZpbGVGcm9tVVJJKGZpbGUuX3NvdXJjZS51cmkpO1xuICAgIGZpbGUuX3ByZXZpb3VzU2F2ZSA9IGZpbGU7XG4gICAgZmlsZS5fZGF0YSA9IGJhc2U2NDtcbiAgICBmaWxlLl9yZXF1ZXN0VGFzayA9IG51bGw7XG4gIH1cbiAgcmV0dXJuIGZpbGU7XG59O1xuXG5leHBvcnQgY2xhc3MgRmlsZXNSb3V0ZXIge1xuICBleHByZXNzUm91dGVyKHsgbWF4VXBsb2FkU2l6ZSA9ICcyME1iJyB9ID0ge30pIHtcbiAgICB2YXIgcm91dGVyID0gZXhwcmVzcy5Sb3V0ZXIoKTtcbiAgICByb3V0ZXIuZ2V0KCcvZmlsZXMvOmFwcElkLzpmaWxlbmFtZScsIHRoaXMuZ2V0SGFuZGxlcik7XG4gICAgcm91dGVyLmdldCgnL2ZpbGVzLzphcHBJZC9tZXRhZGF0YS86ZmlsZW5hbWUnLCB0aGlzLm1ldGFkYXRhSGFuZGxlcik7XG5cbiAgICByb3V0ZXIucG9zdCgnL2ZpbGVzJywgZnVuY3Rpb24gKHJlcSwgcmVzLCBuZXh0KSB7XG4gICAgICBuZXh0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0ZJTEVfTkFNRSwgJ0ZpbGVuYW1lIG5vdCBwcm92aWRlZC4nKSk7XG4gICAgfSk7XG5cbiAgICByb3V0ZXIucG9zdChcbiAgICAgICcvZmlsZXMvOmZpbGVuYW1lJyxcbiAgICAgIEJvZHlQYXJzZXIucmF3KHtcbiAgICAgICAgdHlwZTogKCkgPT4ge1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9LFxuICAgICAgICBsaW1pdDogbWF4VXBsb2FkU2l6ZSxcbiAgICAgIH0pLCAvLyBBbGxvdyB1cGxvYWRzIHdpdGhvdXQgQ29udGVudC1UeXBlLCBvciB3aXRoIGFueSBDb250ZW50LVR5cGUuXG4gICAgICBNaWRkbGV3YXJlcy5oYW5kbGVQYXJzZUhlYWRlcnMsXG4gICAgICBNaWRkbGV3YXJlcy5oYW5kbGVQYXJzZVNlc3Npb24sXG4gICAgICB0aGlzLmNyZWF0ZUhhbmRsZXJcbiAgICApO1xuXG4gICAgcm91dGVyLmRlbGV0ZShcbiAgICAgICcvZmlsZXMvOmZpbGVuYW1lJyxcbiAgICAgIE1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlSGVhZGVycyxcbiAgICAgIE1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlU2Vzc2lvbixcbiAgICAgIE1pZGRsZXdhcmVzLmVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsXG4gICAgICB0aGlzLmRlbGV0ZUhhbmRsZXJcbiAgICApO1xuICAgIHJldHVybiByb3V0ZXI7XG4gIH1cblxuICBnZXRIYW5kbGVyKHJlcSwgcmVzKSB7XG4gICAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChyZXEucGFyYW1zLmFwcElkKTtcbiAgICBpZiAoIWNvbmZpZykge1xuICAgICAgcmVzLnN0YXR1cyg0MDMpO1xuICAgICAgY29uc3QgZXJyID0gbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sICdJbnZhbGlkIGFwcGxpY2F0aW9uIElELicpO1xuICAgICAgcmVzLmpzb24oeyBjb2RlOiBlcnIuY29kZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBmaWxlc0NvbnRyb2xsZXIgPSBjb25maWcuZmlsZXNDb250cm9sbGVyO1xuICAgIGNvbnN0IGZpbGVuYW1lID0gcmVxLnBhcmFtcy5maWxlbmFtZTtcbiAgICBjb25zdCBjb250ZW50VHlwZSA9IG1pbWUuZ2V0VHlwZShmaWxlbmFtZSk7XG4gICAgaWYgKGlzRmlsZVN0cmVhbWFibGUocmVxLCBmaWxlc0NvbnRyb2xsZXIpKSB7XG4gICAgICBmaWxlc0NvbnRyb2xsZXIuaGFuZGxlRmlsZVN0cmVhbShjb25maWcsIGZpbGVuYW1lLCByZXEsIHJlcywgY29udGVudFR5cGUpLmNhdGNoKCgpID0+IHtcbiAgICAgICAgcmVzLnN0YXR1cyg0MDQpO1xuICAgICAgICByZXMuc2V0KCdDb250ZW50LVR5cGUnLCAndGV4dC9wbGFpbicpO1xuICAgICAgICByZXMuZW5kKCdGaWxlIG5vdCBmb3VuZC4nKTtcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBmaWxlc0NvbnRyb2xsZXJcbiAgICAgICAgLmdldEZpbGVEYXRhKGNvbmZpZywgZmlsZW5hbWUpXG4gICAgICAgIC50aGVuKGRhdGEgPT4ge1xuICAgICAgICAgIHJlcy5zdGF0dXMoMjAwKTtcbiAgICAgICAgICByZXMuc2V0KCdDb250ZW50LVR5cGUnLCBjb250ZW50VHlwZSk7XG4gICAgICAgICAgcmVzLnNldCgnQ29udGVudC1MZW5ndGgnLCBkYXRhLmxlbmd0aCk7XG4gICAgICAgICAgcmVzLmVuZChkYXRhKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICByZXMuc3RhdHVzKDQwNCk7XG4gICAgICAgICAgcmVzLnNldCgnQ29udGVudC1UeXBlJywgJ3RleHQvcGxhaW4nKTtcbiAgICAgICAgICByZXMuZW5kKCdGaWxlIG5vdCBmb3VuZC4nKTtcbiAgICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgY3JlYXRlSGFuZGxlcihyZXEsIHJlcywgbmV4dCkge1xuICAgIGNvbnN0IGNvbmZpZyA9IHJlcS5jb25maWc7XG4gICAgY29uc3QgdXNlciA9IHJlcS5hdXRoLnVzZXI7XG4gICAgY29uc3QgaXNNYXN0ZXIgPSByZXEuYXV0aC5pc01hc3RlcjtcbiAgICBjb25zdCBpc0xpbmtlZCA9IHVzZXIgJiYgUGFyc2UuQW5vbnltb3VzVXRpbHMuaXNMaW5rZWQodXNlcik7XG4gICAgaWYgKCFpc01hc3RlciAmJiAhY29uZmlnLmZpbGVVcGxvYWQuZW5hYmxlRm9yQW5vbnltb3VzVXNlciAmJiBpc0xpbmtlZCkge1xuICAgICAgbmV4dChcbiAgICAgICAgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkZJTEVfU0FWRV9FUlJPUiwgJ0ZpbGUgdXBsb2FkIGJ5IGFub255bW91cyB1c2VyIGlzIGRpc2FibGVkLicpXG4gICAgICApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIWlzTWFzdGVyICYmICFjb25maWcuZmlsZVVwbG9hZC5lbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciAmJiAhaXNMaW5rZWQgJiYgdXNlcikge1xuICAgICAgbmV4dChcbiAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkZJTEVfU0FWRV9FUlJPUixcbiAgICAgICAgICAnRmlsZSB1cGxvYWQgYnkgYXV0aGVudGljYXRlZCB1c2VyIGlzIGRpc2FibGVkLidcbiAgICAgICAgKVxuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKCFpc01hc3RlciAmJiAhY29uZmlnLmZpbGVVcGxvYWQuZW5hYmxlRm9yUHVibGljICYmICF1c2VyKSB7XG4gICAgICBuZXh0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsICdGaWxlIHVwbG9hZCBieSBwdWJsaWMgaXMgZGlzYWJsZWQuJykpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBmaWxlc0NvbnRyb2xsZXIgPSBjb25maWcuZmlsZXNDb250cm9sbGVyO1xuICAgIGNvbnN0IHsgZmlsZW5hbWUgfSA9IHJlcS5wYXJhbXM7XG4gICAgY29uc3QgY29udGVudFR5cGUgPSByZXEuZ2V0KCdDb250ZW50LXR5cGUnKTtcblxuICAgIGlmICghcmVxLmJvZHkgfHwgIXJlcS5ib2R5Lmxlbmd0aCkge1xuICAgICAgbmV4dChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLCAnSW52YWxpZCBmaWxlIHVwbG9hZC4nKSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgZXJyb3IgPSBmaWxlc0NvbnRyb2xsZXIudmFsaWRhdGVGaWxlbmFtZShmaWxlbmFtZSk7XG4gICAgaWYgKGVycm9yKSB7XG4gICAgICBuZXh0KGVycm9yKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBmaWxlRXh0ZW5zaW9ucyA9IGNvbmZpZy5maWxlVXBsb2FkPy5maWxlRXh0ZW5zaW9ucztcbiAgICBpZiAoIWlzTWFzdGVyICYmIGZpbGVFeHRlbnNpb25zKSB7XG4gICAgICBjb25zdCBpc1ZhbGlkRXh0ZW5zaW9uID0gZXh0ZW5zaW9uID0+IHtcbiAgICAgICAgcmV0dXJuIGZpbGVFeHRlbnNpb25zLnNvbWUoZXh0ID0+IHtcbiAgICAgICAgICBpZiAoZXh0ID09PSAnKicpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCByZWdleCA9IG5ldyBSZWdFeHAoZmlsZUV4dGVuc2lvbnMpO1xuICAgICAgICAgIGlmIChyZWdleC50ZXN0KGV4dGVuc2lvbikpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9O1xuICAgICAgbGV0IGV4dGVuc2lvbiA9IGNvbnRlbnRUeXBlO1xuICAgICAgaWYgKGZpbGVuYW1lICYmIGZpbGVuYW1lLmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgZXh0ZW5zaW9uID0gZmlsZW5hbWUuc3BsaXQoJy4nKVsxXTtcbiAgICAgIH0gZWxzZSBpZiAoY29udGVudFR5cGUgJiYgY29udGVudFR5cGUuaW5jbHVkZXMoJy8nKSkge1xuICAgICAgICBleHRlbnNpb24gPSBjb250ZW50VHlwZS5zcGxpdCgnLycpWzFdO1xuICAgICAgfVxuICAgICAgZXh0ZW5zaW9uID0gZXh0ZW5zaW9uLnNwbGl0KCcgJykuam9pbignJyk7XG5cbiAgICAgIGlmICghaXNWYWxpZEV4dGVuc2lvbihleHRlbnNpb24pKSB7XG4gICAgICAgIG5leHQoXG4gICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLFxuICAgICAgICAgICAgYEZpbGUgdXBsb2FkIG9mIGV4dGVuc2lvbiAke2V4dGVuc2lvbn0gaXMgZGlzYWJsZWQuYFxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGJhc2U2NCA9IHJlcS5ib2R5LnRvU3RyaW5nKCdiYXNlNjQnKTtcbiAgICBjb25zdCBmaWxlID0gbmV3IFBhcnNlLkZpbGUoZmlsZW5hbWUsIHsgYmFzZTY0IH0sIGNvbnRlbnRUeXBlKTtcbiAgICBjb25zdCB7IG1ldGFkYXRhID0ge30sIHRhZ3MgPSB7fSB9ID0gcmVxLmZpbGVEYXRhIHx8IHt9O1xuICAgIHRyeSB7XG4gICAgICAvLyBTY2FuIHJlcXVlc3QgZGF0YSBmb3IgZGVuaWVkIGtleXdvcmRzXG4gICAgICBVdGlscy5jaGVja1Byb2hpYml0ZWRLZXl3b3Jkcyhjb25maWcsIG1ldGFkYXRhKTtcbiAgICAgIFV0aWxzLmNoZWNrUHJvaGliaXRlZEtleXdvcmRzKGNvbmZpZywgdGFncyk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIG5leHQobmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGVycm9yKSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGZpbGUuc2V0VGFncyh0YWdzKTtcbiAgICBmaWxlLnNldE1ldGFkYXRhKG1ldGFkYXRhKTtcbiAgICBjb25zdCBmaWxlU2l6ZSA9IEJ1ZmZlci5ieXRlTGVuZ3RoKHJlcS5ib2R5KTtcbiAgICBjb25zdCBmaWxlT2JqZWN0ID0geyBmaWxlLCBmaWxlU2l6ZSB9O1xuICAgIHRyeSB7XG4gICAgICAvLyBydW4gYmVmb3JlU2F2ZUZpbGUgdHJpZ2dlclxuICAgICAgY29uc3QgdHJpZ2dlclJlc3VsdCA9IGF3YWl0IHRyaWdnZXJzLm1heWJlUnVuRmlsZVRyaWdnZXIoXG4gICAgICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZVNhdmUsXG4gICAgICAgIGZpbGVPYmplY3QsXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgcmVxLmF1dGhcbiAgICAgICk7XG4gICAgICBsZXQgc2F2ZVJlc3VsdDtcbiAgICAgIC8vIGlmIGEgbmV3IFBhcnNlRmlsZSBpcyByZXR1cm5lZCBjaGVjayBpZiBpdCdzIGFuIGFscmVhZHkgc2F2ZWQgZmlsZVxuICAgICAgaWYgKHRyaWdnZXJSZXN1bHQgaW5zdGFuY2VvZiBQYXJzZS5GaWxlKSB7XG4gICAgICAgIGZpbGVPYmplY3QuZmlsZSA9IHRyaWdnZXJSZXN1bHQ7XG4gICAgICAgIGlmICh0cmlnZ2VyUmVzdWx0LnVybCgpKSB7XG4gICAgICAgICAgLy8gc2V0IGZpbGVTaXplIHRvIG51bGwgYmVjYXVzZSB3ZSB3b250IGtub3cgaG93IGJpZyBpdCBpcyBoZXJlXG4gICAgICAgICAgZmlsZU9iamVjdC5maWxlU2l6ZSA9IG51bGw7XG4gICAgICAgICAgc2F2ZVJlc3VsdCA9IHtcbiAgICAgICAgICAgIHVybDogdHJpZ2dlclJlc3VsdC51cmwoKSxcbiAgICAgICAgICAgIG5hbWU6IHRyaWdnZXJSZXN1bHQuX25hbWUsXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gaWYgdGhlIGZpbGUgcmV0dXJuZWQgYnkgdGhlIHRyaWdnZXIgaGFzIGFscmVhZHkgYmVlbiBzYXZlZCBza2lwIHNhdmluZyBhbnl0aGluZ1xuICAgICAgaWYgKCFzYXZlUmVzdWx0KSB7XG4gICAgICAgIC8vIGlmIHRoZSBQYXJzZUZpbGUgcmV0dXJuZWQgaXMgdHlwZSB1cmksIGRvd25sb2FkIHRoZSBmaWxlIGJlZm9yZSBzYXZpbmcgaXRcbiAgICAgICAgYXdhaXQgYWRkRmlsZURhdGFJZk5lZWRlZChmaWxlT2JqZWN0LmZpbGUpO1xuICAgICAgICAvLyB1cGRhdGUgZmlsZVNpemVcbiAgICAgICAgY29uc3QgYnVmZmVyRGF0YSA9IEJ1ZmZlci5mcm9tKGZpbGVPYmplY3QuZmlsZS5fZGF0YSwgJ2Jhc2U2NCcpO1xuICAgICAgICBmaWxlT2JqZWN0LmZpbGVTaXplID0gQnVmZmVyLmJ5dGVMZW5ndGgoYnVmZmVyRGF0YSk7XG4gICAgICAgIC8vIHByZXBhcmUgZmlsZSBvcHRpb25zXG4gICAgICAgIGNvbnN0IGZpbGVPcHRpb25zID0ge1xuICAgICAgICAgIG1ldGFkYXRhOiBmaWxlT2JqZWN0LmZpbGUuX21ldGFkYXRhLFxuICAgICAgICB9O1xuICAgICAgICAvLyBzb21lIHMzLWNvbXBhdGlibGUgcHJvdmlkZXJzIChEaWdpdGFsT2NlYW4sIExpbm9kZSkgZG8gbm90IGFjY2VwdCB0YWdzXG4gICAgICAgIC8vIHNvIHdlIGRvIG5vdCBpbmNsdWRlIHRoZSB0YWdzIG9wdGlvbiBpZiBpdCBpcyBlbXB0eS5cbiAgICAgICAgY29uc3QgZmlsZVRhZ3MgPVxuICAgICAgICAgIE9iamVjdC5rZXlzKGZpbGVPYmplY3QuZmlsZS5fdGFncykubGVuZ3RoID4gMCA/IHsgdGFnczogZmlsZU9iamVjdC5maWxlLl90YWdzIH0gOiB7fTtcbiAgICAgICAgT2JqZWN0LmFzc2lnbihmaWxlT3B0aW9ucywgZmlsZVRhZ3MpO1xuICAgICAgICAvLyBzYXZlIGZpbGVcbiAgICAgICAgY29uc3QgY3JlYXRlRmlsZVJlc3VsdCA9IGF3YWl0IGZpbGVzQ29udHJvbGxlci5jcmVhdGVGaWxlKFxuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBmaWxlT2JqZWN0LmZpbGUuX25hbWUsXG4gICAgICAgICAgYnVmZmVyRGF0YSxcbiAgICAgICAgICBmaWxlT2JqZWN0LmZpbGUuX3NvdXJjZS50eXBlLFxuICAgICAgICAgIGZpbGVPcHRpb25zXG4gICAgICAgICk7XG4gICAgICAgIC8vIHVwZGF0ZSBmaWxlIHdpdGggbmV3IGRhdGFcbiAgICAgICAgZmlsZU9iamVjdC5maWxlLl9uYW1lID0gY3JlYXRlRmlsZVJlc3VsdC5uYW1lO1xuICAgICAgICBmaWxlT2JqZWN0LmZpbGUuX3VybCA9IGNyZWF0ZUZpbGVSZXN1bHQudXJsO1xuICAgICAgICBmaWxlT2JqZWN0LmZpbGUuX3JlcXVlc3RUYXNrID0gbnVsbDtcbiAgICAgICAgZmlsZU9iamVjdC5maWxlLl9wcmV2aW91c1NhdmUgPSBQcm9taXNlLnJlc29sdmUoZmlsZU9iamVjdC5maWxlKTtcbiAgICAgICAgc2F2ZVJlc3VsdCA9IHtcbiAgICAgICAgICB1cmw6IGNyZWF0ZUZpbGVSZXN1bHQudXJsLFxuICAgICAgICAgIG5hbWU6IGNyZWF0ZUZpbGVSZXN1bHQubmFtZSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIC8vIHJ1biBhZnRlclNhdmVGaWxlIHRyaWdnZXJcbiAgICAgIGF3YWl0IHRyaWdnZXJzLm1heWJlUnVuRmlsZVRyaWdnZXIodHJpZ2dlcnMuVHlwZXMuYWZ0ZXJTYXZlLCBmaWxlT2JqZWN0LCBjb25maWcsIHJlcS5hdXRoKTtcbiAgICAgIHJlcy5zdGF0dXMoMjAxKTtcbiAgICAgIHJlcy5zZXQoJ0xvY2F0aW9uJywgc2F2ZVJlc3VsdC51cmwpO1xuICAgICAgcmVzLmpzb24oc2F2ZVJlc3VsdCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgbG9nZ2VyLmVycm9yKCdFcnJvciBjcmVhdGluZyBhIGZpbGU6ICcsIGUpO1xuICAgICAgY29uc3QgZXJyb3IgPSB0cmlnZ2Vycy5yZXNvbHZlRXJyb3IoZSwge1xuICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsXG4gICAgICAgIG1lc3NhZ2U6IGBDb3VsZCBub3Qgc3RvcmUgZmlsZTogJHtmaWxlT2JqZWN0LmZpbGUuX25hbWV9LmAsXG4gICAgICB9KTtcbiAgICAgIG5leHQoZXJyb3IpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGRlbGV0ZUhhbmRsZXIocmVxLCByZXMsIG5leHQpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgeyBmaWxlc0NvbnRyb2xsZXIgfSA9IHJlcS5jb25maWc7XG4gICAgICBjb25zdCB7IGZpbGVuYW1lIH0gPSByZXEucGFyYW1zO1xuICAgICAgLy8gcnVuIGJlZm9yZURlbGV0ZUZpbGUgdHJpZ2dlclxuICAgICAgY29uc3QgZmlsZSA9IG5ldyBQYXJzZS5GaWxlKGZpbGVuYW1lKTtcbiAgICAgIGZpbGUuX3VybCA9IGZpbGVzQ29udHJvbGxlci5hZGFwdGVyLmdldEZpbGVMb2NhdGlvbihyZXEuY29uZmlnLCBmaWxlbmFtZSk7XG4gICAgICBjb25zdCBmaWxlT2JqZWN0ID0geyBmaWxlLCBmaWxlU2l6ZTogbnVsbCB9O1xuICAgICAgYXdhaXQgdHJpZ2dlcnMubWF5YmVSdW5GaWxlVHJpZ2dlcihcbiAgICAgICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlRGVsZXRlLFxuICAgICAgICBmaWxlT2JqZWN0LFxuICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICByZXEuYXV0aFxuICAgICAgKTtcbiAgICAgIC8vIGRlbGV0ZSBmaWxlXG4gICAgICBhd2FpdCBmaWxlc0NvbnRyb2xsZXIuZGVsZXRlRmlsZShyZXEuY29uZmlnLCBmaWxlbmFtZSk7XG4gICAgICAvLyBydW4gYWZ0ZXJEZWxldGVGaWxlIHRyaWdnZXJcbiAgICAgIGF3YWl0IHRyaWdnZXJzLm1heWJlUnVuRmlsZVRyaWdnZXIoXG4gICAgICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRGVsZXRlLFxuICAgICAgICBmaWxlT2JqZWN0LFxuICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICByZXEuYXV0aFxuICAgICAgKTtcbiAgICAgIHJlcy5zdGF0dXMoMjAwKTtcbiAgICAgIC8vIFRPRE86IHJldHVybiB1c2VmdWwgSlNPTiBoZXJlP1xuICAgICAgcmVzLmVuZCgpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRXJyb3IgZGVsZXRpbmcgYSBmaWxlOiAnLCBlKTtcbiAgICAgIGNvbnN0IGVycm9yID0gdHJpZ2dlcnMucmVzb2x2ZUVycm9yKGUsIHtcbiAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuRklMRV9ERUxFVEVfRVJST1IsXG4gICAgICAgIG1lc3NhZ2U6ICdDb3VsZCBub3QgZGVsZXRlIGZpbGUuJyxcbiAgICAgIH0pO1xuICAgICAgbmV4dChlcnJvcik7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgbWV0YWRhdGFIYW5kbGVyKHJlcSwgcmVzKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGNvbmZpZyA9IENvbmZpZy5nZXQocmVxLnBhcmFtcy5hcHBJZCk7XG4gICAgICBjb25zdCB7IGZpbGVzQ29udHJvbGxlciB9ID0gY29uZmlnO1xuICAgICAgY29uc3QgeyBmaWxlbmFtZSB9ID0gcmVxLnBhcmFtcztcbiAgICAgIGNvbnN0IGRhdGEgPSBhd2FpdCBmaWxlc0NvbnRyb2xsZXIuZ2V0TWV0YWRhdGEoZmlsZW5hbWUpO1xuICAgICAgcmVzLnN0YXR1cygyMDApO1xuICAgICAgcmVzLmpzb24oZGF0YSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmVzLnN0YXR1cygyMDApO1xuICAgICAgcmVzLmpzb24oe30pO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBpc0ZpbGVTdHJlYW1hYmxlKHJlcSwgZmlsZXNDb250cm9sbGVyKSB7XG4gIGNvbnN0IHJhbmdlID0gKHJlcS5nZXQoJ1JhbmdlJykgfHwgJy8tLycpLnNwbGl0KCctJyk7XG4gIGNvbnN0IHN0YXJ0ID0gTnVtYmVyKHJhbmdlWzBdKTtcbiAgY29uc3QgZW5kID0gTnVtYmVyKHJhbmdlWzFdKTtcbiAgcmV0dXJuIChcbiAgICAoIWlzTmFOKHN0YXJ0KSB8fCAhaXNOYU4oZW5kKSkgJiYgdHlwZW9mIGZpbGVzQ29udHJvbGxlci5hZGFwdGVyLmhhbmRsZUZpbGVTdHJlYW0gPT09ICdmdW5jdGlvbidcbiAgKTtcbn1cbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBK0I7QUFBQTtBQUFBO0FBQy9CLE1BQU1BLFFBQVEsR0FBR0MsT0FBTyxDQUFDLGFBQWEsQ0FBQztBQUN2QyxNQUFNQyxJQUFJLEdBQUdELE9BQU8sQ0FBQyxNQUFNLENBQUM7QUFDNUIsTUFBTUUsS0FBSyxHQUFHRixPQUFPLENBQUMsVUFBVSxDQUFDO0FBRWpDLE1BQU1HLG1CQUFtQixHQUFHQyxH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