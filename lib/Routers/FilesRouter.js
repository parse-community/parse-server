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
          const regex = new RegExp(ext);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJ0cmlnZ2VycyIsInJlcXVpcmUiLCJodHRwIiwiVXRpbHMiLCJkb3dubG9hZEZpbGVGcm9tVVJJIiwidXJpIiwiUHJvbWlzZSIsInJlcyIsInJlaiIsImdldCIsInJlc3BvbnNlIiwic2V0RGVmYXVsdEVuY29kaW5nIiwiYm9keSIsImhlYWRlcnMiLCJvbiIsImRhdGEiLCJlIiwibWVzc2FnZSIsImFkZEZpbGVEYXRhSWZOZWVkZWQiLCJmaWxlIiwiX3NvdXJjZSIsImZvcm1hdCIsImJhc2U2NCIsIl9wcmV2aW91c1NhdmUiLCJfZGF0YSIsIl9yZXF1ZXN0VGFzayIsIkZpbGVzUm91dGVyIiwiZXhwcmVzc1JvdXRlciIsIm1heFVwbG9hZFNpemUiLCJyb3V0ZXIiLCJleHByZXNzIiwiUm91dGVyIiwiZ2V0SGFuZGxlciIsIm1ldGFkYXRhSGFuZGxlciIsInBvc3QiLCJyZXEiLCJuZXh0IiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfRklMRV9OQU1FIiwiQm9keVBhcnNlciIsInJhdyIsInR5cGUiLCJsaW1pdCIsIk1pZGRsZXdhcmVzIiwiaGFuZGxlUGFyc2VIZWFkZXJzIiwiaGFuZGxlUGFyc2VTZXNzaW9uIiwiY3JlYXRlSGFuZGxlciIsImRlbGV0ZSIsImVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MiLCJkZWxldGVIYW5kbGVyIiwiY29uZmlnIiwiQ29uZmlnIiwicGFyYW1zIiwiYXBwSWQiLCJzdGF0dXMiLCJlcnIiLCJPUEVSQVRJT05fRk9SQklEREVOIiwianNvbiIsImNvZGUiLCJlcnJvciIsImZpbGVzQ29udHJvbGxlciIsImZpbGVuYW1lIiwiY29udGVudFR5cGUiLCJtaW1lIiwiZ2V0VHlwZSIsImlzRmlsZVN0cmVhbWFibGUiLCJoYW5kbGVGaWxlU3RyZWFtIiwiY2F0Y2giLCJzZXQiLCJlbmQiLCJnZXRGaWxlRGF0YSIsInRoZW4iLCJsZW5ndGgiLCJ1c2VyIiwiYXV0aCIsImlzTWFzdGVyIiwiaXNMaW5rZWQiLCJBbm9ueW1vdXNVdGlscyIsImZpbGVVcGxvYWQiLCJlbmFibGVGb3JBbm9ueW1vdXNVc2VyIiwiRklMRV9TQVZFX0VSUk9SIiwiZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIiLCJlbmFibGVGb3JQdWJsaWMiLCJ2YWxpZGF0ZUZpbGVuYW1lIiwiZmlsZUV4dGVuc2lvbnMiLCJpc1ZhbGlkRXh0ZW5zaW9uIiwiZXh0ZW5zaW9uIiwic29tZSIsImV4dCIsInJlZ2V4IiwiUmVnRXhwIiwidGVzdCIsImluY2x1ZGVzIiwic3BsaXQiLCJqb2luIiwidG9TdHJpbmciLCJGaWxlIiwibWV0YWRhdGEiLCJ0YWdzIiwiZmlsZURhdGEiLCJjaGVja1Byb2hpYml0ZWRLZXl3b3JkcyIsIklOVkFMSURfS0VZX05BTUUiLCJzZXRUYWdzIiwic2V0TWV0YWRhdGEiLCJmaWxlU2l6ZSIsIkJ1ZmZlciIsImJ5dGVMZW5ndGgiLCJmaWxlT2JqZWN0IiwidHJpZ2dlclJlc3VsdCIsIm1heWJlUnVuRmlsZVRyaWdnZXIiLCJUeXBlcyIsImJlZm9yZVNhdmUiLCJzYXZlUmVzdWx0IiwidXJsIiwibmFtZSIsIl9uYW1lIiwiYnVmZmVyRGF0YSIsImZyb20iLCJmaWxlT3B0aW9ucyIsIl9tZXRhZGF0YSIsImZpbGVUYWdzIiwiT2JqZWN0Iiwia2V5cyIsIl90YWdzIiwiYXNzaWduIiwiY3JlYXRlRmlsZVJlc3VsdCIsImNyZWF0ZUZpbGUiLCJfdXJsIiwicmVzb2x2ZSIsImFmdGVyU2F2ZSIsImxvZ2dlciIsInJlc29sdmVFcnJvciIsImFkYXB0ZXIiLCJnZXRGaWxlTG9jYXRpb24iLCJiZWZvcmVEZWxldGUiLCJkZWxldGVGaWxlIiwiYWZ0ZXJEZWxldGUiLCJGSUxFX0RFTEVURV9FUlJPUiIsImdldE1ldGFkYXRhIiwicmFuZ2UiLCJzdGFydCIsIk51bWJlciIsImlzTmFOIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL1JvdXRlcnMvRmlsZXNSb3V0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGV4cHJlc3MgZnJvbSAnZXhwcmVzcyc7XG5pbXBvcnQgQm9keVBhcnNlciBmcm9tICdib2R5LXBhcnNlcic7XG5pbXBvcnQgKiBhcyBNaWRkbGV3YXJlcyBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4uL0NvbmZpZyc7XG5pbXBvcnQgbWltZSBmcm9tICdtaW1lJztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi4vbG9nZ2VyJztcbmNvbnN0IHRyaWdnZXJzID0gcmVxdWlyZSgnLi4vdHJpZ2dlcnMnKTtcbmNvbnN0IGh0dHAgPSByZXF1aXJlKCdodHRwJyk7XG5jb25zdCBVdGlscyA9IHJlcXVpcmUoJy4uL1V0aWxzJyk7XG5cbmNvbnN0IGRvd25sb2FkRmlsZUZyb21VUkkgPSB1cmkgPT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlcywgcmVqKSA9PiB7XG4gICAgaHR0cFxuICAgICAgLmdldCh1cmksIHJlc3BvbnNlID0+IHtcbiAgICAgICAgcmVzcG9uc2Uuc2V0RGVmYXVsdEVuY29kaW5nKCdiYXNlNjQnKTtcbiAgICAgICAgbGV0IGJvZHkgPSBgZGF0YToke3Jlc3BvbnNlLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddfTtiYXNlNjQsYDtcbiAgICAgICAgcmVzcG9uc2Uub24oJ2RhdGEnLCBkYXRhID0+IChib2R5ICs9IGRhdGEpKTtcbiAgICAgICAgcmVzcG9uc2Uub24oJ2VuZCcsICgpID0+IHJlcyhib2R5KSk7XG4gICAgICB9KVxuICAgICAgLm9uKCdlcnJvcicsIGUgPT4ge1xuICAgICAgICByZWooYEVycm9yIGRvd25sb2FkaW5nIGZpbGUgZnJvbSAke3VyaX06ICR7ZS5tZXNzYWdlfWApO1xuICAgICAgfSk7XG4gIH0pO1xufTtcblxuY29uc3QgYWRkRmlsZURhdGFJZk5lZWRlZCA9IGFzeW5jIGZpbGUgPT4ge1xuICBpZiAoZmlsZS5fc291cmNlLmZvcm1hdCA9PT0gJ3VyaScpIHtcbiAgICBjb25zdCBiYXNlNjQgPSBhd2FpdCBkb3dubG9hZEZpbGVGcm9tVVJJKGZpbGUuX3NvdXJjZS51cmkpO1xuICAgIGZpbGUuX3ByZXZpb3VzU2F2ZSA9IGZpbGU7XG4gICAgZmlsZS5fZGF0YSA9IGJhc2U2NDtcbiAgICBmaWxlLl9yZXF1ZXN0VGFzayA9IG51bGw7XG4gIH1cbiAgcmV0dXJuIGZpbGU7XG59O1xuXG5leHBvcnQgY2xhc3MgRmlsZXNSb3V0ZXIge1xuICBleHByZXNzUm91dGVyKHsgbWF4VXBsb2FkU2l6ZSA9ICcyME1iJyB9ID0ge30pIHtcbiAgICB2YXIgcm91dGVyID0gZXhwcmVzcy5Sb3V0ZXIoKTtcbiAgICByb3V0ZXIuZ2V0KCcvZmlsZXMvOmFwcElkLzpmaWxlbmFtZScsIHRoaXMuZ2V0SGFuZGxlcik7XG4gICAgcm91dGVyLmdldCgnL2ZpbGVzLzphcHBJZC9tZXRhZGF0YS86ZmlsZW5hbWUnLCB0aGlzLm1ldGFkYXRhSGFuZGxlcik7XG5cbiAgICByb3V0ZXIucG9zdCgnL2ZpbGVzJywgZnVuY3Rpb24gKHJlcSwgcmVzLCBuZXh0KSB7XG4gICAgICBuZXh0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0ZJTEVfTkFNRSwgJ0ZpbGVuYW1lIG5vdCBwcm92aWRlZC4nKSk7XG4gICAgfSk7XG5cbiAgICByb3V0ZXIucG9zdChcbiAgICAgICcvZmlsZXMvOmZpbGVuYW1lJyxcbiAgICAgIEJvZHlQYXJzZXIucmF3KHtcbiAgICAgICAgdHlwZTogKCkgPT4ge1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9LFxuICAgICAgICBsaW1pdDogbWF4VXBsb2FkU2l6ZSxcbiAgICAgIH0pLCAvLyBBbGxvdyB1cGxvYWRzIHdpdGhvdXQgQ29udGVudC1UeXBlLCBvciB3aXRoIGFueSBDb250ZW50LVR5cGUuXG4gICAgICBNaWRkbGV3YXJlcy5oYW5kbGVQYXJzZUhlYWRlcnMsXG4gICAgICBNaWRkbGV3YXJlcy5oYW5kbGVQYXJzZVNlc3Npb24sXG4gICAgICB0aGlzLmNyZWF0ZUhhbmRsZXJcbiAgICApO1xuXG4gICAgcm91dGVyLmRlbGV0ZShcbiAgICAgICcvZmlsZXMvOmZpbGVuYW1lJyxcbiAgICAgIE1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlSGVhZGVycyxcbiAgICAgIE1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlU2Vzc2lvbixcbiAgICAgIE1pZGRsZXdhcmVzLmVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsXG4gICAgICB0aGlzLmRlbGV0ZUhhbmRsZXJcbiAgICApO1xuICAgIHJldHVybiByb3V0ZXI7XG4gIH1cblxuICBnZXRIYW5kbGVyKHJlcSwgcmVzKSB7XG4gICAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChyZXEucGFyYW1zLmFwcElkKTtcbiAgICBpZiAoIWNvbmZpZykge1xuICAgICAgcmVzLnN0YXR1cyg0MDMpO1xuICAgICAgY29uc3QgZXJyID0gbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sICdJbnZhbGlkIGFwcGxpY2F0aW9uIElELicpO1xuICAgICAgcmVzLmpzb24oeyBjb2RlOiBlcnIuY29kZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBmaWxlc0NvbnRyb2xsZXIgPSBjb25maWcuZmlsZXNDb250cm9sbGVyO1xuICAgIGNvbnN0IGZpbGVuYW1lID0gcmVxLnBhcmFtcy5maWxlbmFtZTtcbiAgICBjb25zdCBjb250ZW50VHlwZSA9IG1pbWUuZ2V0VHlwZShmaWxlbmFtZSk7XG4gICAgaWYgKGlzRmlsZVN0cmVhbWFibGUocmVxLCBmaWxlc0NvbnRyb2xsZXIpKSB7XG4gICAgICBmaWxlc0NvbnRyb2xsZXIuaGFuZGxlRmlsZVN0cmVhbShjb25maWcsIGZpbGVuYW1lLCByZXEsIHJlcywgY29udGVudFR5cGUpLmNhdGNoKCgpID0+IHtcbiAgICAgICAgcmVzLnN0YXR1cyg0MDQpO1xuICAgICAgICByZXMuc2V0KCdDb250ZW50LVR5cGUnLCAndGV4dC9wbGFpbicpO1xuICAgICAgICByZXMuZW5kKCdGaWxlIG5vdCBmb3VuZC4nKTtcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBmaWxlc0NvbnRyb2xsZXJcbiAgICAgICAgLmdldEZpbGVEYXRhKGNvbmZpZywgZmlsZW5hbWUpXG4gICAgICAgIC50aGVuKGRhdGEgPT4ge1xuICAgICAgICAgIHJlcy5zdGF0dXMoMjAwKTtcbiAgICAgICAgICByZXMuc2V0KCdDb250ZW50LVR5cGUnLCBjb250ZW50VHlwZSk7XG4gICAgICAgICAgcmVzLnNldCgnQ29udGVudC1MZW5ndGgnLCBkYXRhLmxlbmd0aCk7XG4gICAgICAgICAgcmVzLmVuZChkYXRhKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICByZXMuc3RhdHVzKDQwNCk7XG4gICAgICAgICAgcmVzLnNldCgnQ29udGVudC1UeXBlJywgJ3RleHQvcGxhaW4nKTtcbiAgICAgICAgICByZXMuZW5kKCdGaWxlIG5vdCBmb3VuZC4nKTtcbiAgICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgY3JlYXRlSGFuZGxlcihyZXEsIHJlcywgbmV4dCkge1xuICAgIGNvbnN0IGNvbmZpZyA9IHJlcS5jb25maWc7XG4gICAgY29uc3QgdXNlciA9IHJlcS5hdXRoLnVzZXI7XG4gICAgY29uc3QgaXNNYXN0ZXIgPSByZXEuYXV0aC5pc01hc3RlcjtcbiAgICBjb25zdCBpc0xpbmtlZCA9IHVzZXIgJiYgUGFyc2UuQW5vbnltb3VzVXRpbHMuaXNMaW5rZWQodXNlcik7XG4gICAgaWYgKCFpc01hc3RlciAmJiAhY29uZmlnLmZpbGVVcGxvYWQuZW5hYmxlRm9yQW5vbnltb3VzVXNlciAmJiBpc0xpbmtlZCkge1xuICAgICAgbmV4dChcbiAgICAgICAgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkZJTEVfU0FWRV9FUlJPUiwgJ0ZpbGUgdXBsb2FkIGJ5IGFub255bW91cyB1c2VyIGlzIGRpc2FibGVkLicpXG4gICAgICApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIWlzTWFzdGVyICYmICFjb25maWcuZmlsZVVwbG9hZC5lbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciAmJiAhaXNMaW5rZWQgJiYgdXNlcikge1xuICAgICAgbmV4dChcbiAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkZJTEVfU0FWRV9FUlJPUixcbiAgICAgICAgICAnRmlsZSB1cGxvYWQgYnkgYXV0aGVudGljYXRlZCB1c2VyIGlzIGRpc2FibGVkLidcbiAgICAgICAgKVxuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKCFpc01hc3RlciAmJiAhY29uZmlnLmZpbGVVcGxvYWQuZW5hYmxlRm9yUHVibGljICYmICF1c2VyKSB7XG4gICAgICBuZXh0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsICdGaWxlIHVwbG9hZCBieSBwdWJsaWMgaXMgZGlzYWJsZWQuJykpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBmaWxlc0NvbnRyb2xsZXIgPSBjb25maWcuZmlsZXNDb250cm9sbGVyO1xuICAgIGNvbnN0IHsgZmlsZW5hbWUgfSA9IHJlcS5wYXJhbXM7XG4gICAgY29uc3QgY29udGVudFR5cGUgPSByZXEuZ2V0KCdDb250ZW50LXR5cGUnKTtcblxuICAgIGlmICghcmVxLmJvZHkgfHwgIXJlcS5ib2R5Lmxlbmd0aCkge1xuICAgICAgbmV4dChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLCAnSW52YWxpZCBmaWxlIHVwbG9hZC4nKSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgZXJyb3IgPSBmaWxlc0NvbnRyb2xsZXIudmFsaWRhdGVGaWxlbmFtZShmaWxlbmFtZSk7XG4gICAgaWYgKGVycm9yKSB7XG4gICAgICBuZXh0KGVycm9yKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBmaWxlRXh0ZW5zaW9ucyA9IGNvbmZpZy5maWxlVXBsb2FkPy5maWxlRXh0ZW5zaW9ucztcbiAgICBpZiAoIWlzTWFzdGVyICYmIGZpbGVFeHRlbnNpb25zKSB7XG4gICAgICBjb25zdCBpc1ZhbGlkRXh0ZW5zaW9uID0gZXh0ZW5zaW9uID0+IHtcbiAgICAgICAgcmV0dXJuIGZpbGVFeHRlbnNpb25zLnNvbWUoZXh0ID0+IHtcbiAgICAgICAgICBpZiAoZXh0ID09PSAnKicpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCByZWdleCA9IG5ldyBSZWdFeHAoZXh0KTtcbiAgICAgICAgICBpZiAocmVnZXgudGVzdChleHRlbnNpb24pKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfTtcbiAgICAgIGxldCBleHRlbnNpb24gPSBjb250ZW50VHlwZTtcbiAgICAgIGlmIChmaWxlbmFtZSAmJiBmaWxlbmFtZS5pbmNsdWRlcygnLicpKSB7XG4gICAgICAgIGV4dGVuc2lvbiA9IGZpbGVuYW1lLnNwbGl0KCcuJylbMV07XG4gICAgICB9IGVsc2UgaWYgKGNvbnRlbnRUeXBlICYmIGNvbnRlbnRUeXBlLmluY2x1ZGVzKCcvJykpIHtcbiAgICAgICAgZXh0ZW5zaW9uID0gY29udGVudFR5cGUuc3BsaXQoJy8nKVsxXTtcbiAgICAgIH1cbiAgICAgIGV4dGVuc2lvbiA9IGV4dGVuc2lvbi5zcGxpdCgnICcpLmpvaW4oJycpO1xuXG4gICAgICBpZiAoIWlzVmFsaWRFeHRlbnNpb24oZXh0ZW5zaW9uKSkge1xuICAgICAgICBuZXh0KFxuICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkZJTEVfU0FWRV9FUlJPUixcbiAgICAgICAgICAgIGBGaWxlIHVwbG9hZCBvZiBleHRlbnNpb24gJHtleHRlbnNpb259IGlzIGRpc2FibGVkLmBcbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBiYXNlNjQgPSByZXEuYm9keS50b1N0cmluZygnYmFzZTY0Jyk7XG4gICAgY29uc3QgZmlsZSA9IG5ldyBQYXJzZS5GaWxlKGZpbGVuYW1lLCB7IGJhc2U2NCB9LCBjb250ZW50VHlwZSk7XG4gICAgY29uc3QgeyBtZXRhZGF0YSA9IHt9LCB0YWdzID0ge30gfSA9IHJlcS5maWxlRGF0YSB8fCB7fTtcbiAgICB0cnkge1xuICAgICAgLy8gU2NhbiByZXF1ZXN0IGRhdGEgZm9yIGRlbmllZCBrZXl3b3Jkc1xuICAgICAgVXRpbHMuY2hlY2tQcm9oaWJpdGVkS2V5d29yZHMoY29uZmlnLCBtZXRhZGF0YSk7XG4gICAgICBVdGlscy5jaGVja1Byb2hpYml0ZWRLZXl3b3Jkcyhjb25maWcsIHRhZ3MpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBuZXh0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBlcnJvcikpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBmaWxlLnNldFRhZ3ModGFncyk7XG4gICAgZmlsZS5zZXRNZXRhZGF0YShtZXRhZGF0YSk7XG4gICAgY29uc3QgZmlsZVNpemUgPSBCdWZmZXIuYnl0ZUxlbmd0aChyZXEuYm9keSk7XG4gICAgY29uc3QgZmlsZU9iamVjdCA9IHsgZmlsZSwgZmlsZVNpemUgfTtcbiAgICB0cnkge1xuICAgICAgLy8gcnVuIGJlZm9yZVNhdmVGaWxlIHRyaWdnZXJcbiAgICAgIGNvbnN0IHRyaWdnZXJSZXN1bHQgPSBhd2FpdCB0cmlnZ2Vycy5tYXliZVJ1bkZpbGVUcmlnZ2VyKFxuICAgICAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVTYXZlLFxuICAgICAgICBmaWxlT2JqZWN0LFxuICAgICAgICBjb25maWcsXG4gICAgICAgIHJlcS5hdXRoXG4gICAgICApO1xuICAgICAgbGV0IHNhdmVSZXN1bHQ7XG4gICAgICAvLyBpZiBhIG5ldyBQYXJzZUZpbGUgaXMgcmV0dXJuZWQgY2hlY2sgaWYgaXQncyBhbiBhbHJlYWR5IHNhdmVkIGZpbGVcbiAgICAgIGlmICh0cmlnZ2VyUmVzdWx0IGluc3RhbmNlb2YgUGFyc2UuRmlsZSkge1xuICAgICAgICBmaWxlT2JqZWN0LmZpbGUgPSB0cmlnZ2VyUmVzdWx0O1xuICAgICAgICBpZiAodHJpZ2dlclJlc3VsdC51cmwoKSkge1xuICAgICAgICAgIC8vIHNldCBmaWxlU2l6ZSB0byBudWxsIGJlY2F1c2Ugd2Ugd29udCBrbm93IGhvdyBiaWcgaXQgaXMgaGVyZVxuICAgICAgICAgIGZpbGVPYmplY3QuZmlsZVNpemUgPSBudWxsO1xuICAgICAgICAgIHNhdmVSZXN1bHQgPSB7XG4gICAgICAgICAgICB1cmw6IHRyaWdnZXJSZXN1bHQudXJsKCksXG4gICAgICAgICAgICBuYW1lOiB0cmlnZ2VyUmVzdWx0Ll9uYW1lLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIC8vIGlmIHRoZSBmaWxlIHJldHVybmVkIGJ5IHRoZSB0cmlnZ2VyIGhhcyBhbHJlYWR5IGJlZW4gc2F2ZWQgc2tpcCBzYXZpbmcgYW55dGhpbmdcbiAgICAgIGlmICghc2F2ZVJlc3VsdCkge1xuICAgICAgICAvLyBpZiB0aGUgUGFyc2VGaWxlIHJldHVybmVkIGlzIHR5cGUgdXJpLCBkb3dubG9hZCB0aGUgZmlsZSBiZWZvcmUgc2F2aW5nIGl0XG4gICAgICAgIGF3YWl0IGFkZEZpbGVEYXRhSWZOZWVkZWQoZmlsZU9iamVjdC5maWxlKTtcbiAgICAgICAgLy8gdXBkYXRlIGZpbGVTaXplXG4gICAgICAgIGNvbnN0IGJ1ZmZlckRhdGEgPSBCdWZmZXIuZnJvbShmaWxlT2JqZWN0LmZpbGUuX2RhdGEsICdiYXNlNjQnKTtcbiAgICAgICAgZmlsZU9iamVjdC5maWxlU2l6ZSA9IEJ1ZmZlci5ieXRlTGVuZ3RoKGJ1ZmZlckRhdGEpO1xuICAgICAgICAvLyBwcmVwYXJlIGZpbGUgb3B0aW9uc1xuICAgICAgICBjb25zdCBmaWxlT3B0aW9ucyA9IHtcbiAgICAgICAgICBtZXRhZGF0YTogZmlsZU9iamVjdC5maWxlLl9tZXRhZGF0YSxcbiAgICAgICAgfTtcbiAgICAgICAgLy8gc29tZSBzMy1jb21wYXRpYmxlIHByb3ZpZGVycyAoRGlnaXRhbE9jZWFuLCBMaW5vZGUpIGRvIG5vdCBhY2NlcHQgdGFnc1xuICAgICAgICAvLyBzbyB3ZSBkbyBub3QgaW5jbHVkZSB0aGUgdGFncyBvcHRpb24gaWYgaXQgaXMgZW1wdHkuXG4gICAgICAgIGNvbnN0IGZpbGVUYWdzID1cbiAgICAgICAgICBPYmplY3Qua2V5cyhmaWxlT2JqZWN0LmZpbGUuX3RhZ3MpLmxlbmd0aCA+IDAgPyB7IHRhZ3M6IGZpbGVPYmplY3QuZmlsZS5fdGFncyB9IDoge307XG4gICAgICAgIE9iamVjdC5hc3NpZ24oZmlsZU9wdGlvbnMsIGZpbGVUYWdzKTtcbiAgICAgICAgLy8gc2F2ZSBmaWxlXG4gICAgICAgIGNvbnN0IGNyZWF0ZUZpbGVSZXN1bHQgPSBhd2FpdCBmaWxlc0NvbnRyb2xsZXIuY3JlYXRlRmlsZShcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgZmlsZU9iamVjdC5maWxlLl9uYW1lLFxuICAgICAgICAgIGJ1ZmZlckRhdGEsXG4gICAgICAgICAgZmlsZU9iamVjdC5maWxlLl9zb3VyY2UudHlwZSxcbiAgICAgICAgICBmaWxlT3B0aW9uc1xuICAgICAgICApO1xuICAgICAgICAvLyB1cGRhdGUgZmlsZSB3aXRoIG5ldyBkYXRhXG4gICAgICAgIGZpbGVPYmplY3QuZmlsZS5fbmFtZSA9IGNyZWF0ZUZpbGVSZXN1bHQubmFtZTtcbiAgICAgICAgZmlsZU9iamVjdC5maWxlLl91cmwgPSBjcmVhdGVGaWxlUmVzdWx0LnVybDtcbiAgICAgICAgZmlsZU9iamVjdC5maWxlLl9yZXF1ZXN0VGFzayA9IG51bGw7XG4gICAgICAgIGZpbGVPYmplY3QuZmlsZS5fcHJldmlvdXNTYXZlID0gUHJvbWlzZS5yZXNvbHZlKGZpbGVPYmplY3QuZmlsZSk7XG4gICAgICAgIHNhdmVSZXN1bHQgPSB7XG4gICAgICAgICAgdXJsOiBjcmVhdGVGaWxlUmVzdWx0LnVybCxcbiAgICAgICAgICBuYW1lOiBjcmVhdGVGaWxlUmVzdWx0Lm5hbWUsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICAvLyBydW4gYWZ0ZXJTYXZlRmlsZSB0cmlnZ2VyXG4gICAgICBhd2FpdCB0cmlnZ2Vycy5tYXliZVJ1bkZpbGVUcmlnZ2VyKHRyaWdnZXJzLlR5cGVzLmFmdGVyU2F2ZSwgZmlsZU9iamVjdCwgY29uZmlnLCByZXEuYXV0aCk7XG4gICAgICByZXMuc3RhdHVzKDIwMSk7XG4gICAgICByZXMuc2V0KCdMb2NhdGlvbicsIHNhdmVSZXN1bHQudXJsKTtcbiAgICAgIHJlcy5qc29uKHNhdmVSZXN1bHQpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRXJyb3IgY3JlYXRpbmcgYSBmaWxlOiAnLCBlKTtcbiAgICAgIGNvbnN0IGVycm9yID0gdHJpZ2dlcnMucmVzb2x2ZUVycm9yKGUsIHtcbiAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLFxuICAgICAgICBtZXNzYWdlOiBgQ291bGQgbm90IHN0b3JlIGZpbGU6ICR7ZmlsZU9iamVjdC5maWxlLl9uYW1lfS5gLFxuICAgICAgfSk7XG4gICAgICBuZXh0KGVycm9yKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBkZWxldGVIYW5kbGVyKHJlcSwgcmVzLCBuZXh0KSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHsgZmlsZXNDb250cm9sbGVyIH0gPSByZXEuY29uZmlnO1xuICAgICAgY29uc3QgeyBmaWxlbmFtZSB9ID0gcmVxLnBhcmFtcztcbiAgICAgIC8vIHJ1biBiZWZvcmVEZWxldGVGaWxlIHRyaWdnZXJcbiAgICAgIGNvbnN0IGZpbGUgPSBuZXcgUGFyc2UuRmlsZShmaWxlbmFtZSk7XG4gICAgICBmaWxlLl91cmwgPSBmaWxlc0NvbnRyb2xsZXIuYWRhcHRlci5nZXRGaWxlTG9jYXRpb24ocmVxLmNvbmZpZywgZmlsZW5hbWUpO1xuICAgICAgY29uc3QgZmlsZU9iamVjdCA9IHsgZmlsZSwgZmlsZVNpemU6IG51bGwgfTtcbiAgICAgIGF3YWl0IHRyaWdnZXJzLm1heWJlUnVuRmlsZVRyaWdnZXIoXG4gICAgICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZURlbGV0ZSxcbiAgICAgICAgZmlsZU9iamVjdCxcbiAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgcmVxLmF1dGhcbiAgICAgICk7XG4gICAgICAvLyBkZWxldGUgZmlsZVxuICAgICAgYXdhaXQgZmlsZXNDb250cm9sbGVyLmRlbGV0ZUZpbGUocmVxLmNvbmZpZywgZmlsZW5hbWUpO1xuICAgICAgLy8gcnVuIGFmdGVyRGVsZXRlRmlsZSB0cmlnZ2VyXG4gICAgICBhd2FpdCB0cmlnZ2Vycy5tYXliZVJ1bkZpbGVUcmlnZ2VyKFxuICAgICAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlckRlbGV0ZSxcbiAgICAgICAgZmlsZU9iamVjdCxcbiAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgcmVxLmF1dGhcbiAgICAgICk7XG4gICAgICByZXMuc3RhdHVzKDIwMCk7XG4gICAgICAvLyBUT0RPOiByZXR1cm4gdXNlZnVsIEpTT04gaGVyZT9cbiAgICAgIHJlcy5lbmQoKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0Vycm9yIGRlbGV0aW5nIGEgZmlsZTogJywgZSk7XG4gICAgICBjb25zdCBlcnJvciA9IHRyaWdnZXJzLnJlc29sdmVFcnJvcihlLCB7XG4gICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLkZJTEVfREVMRVRFX0VSUk9SLFxuICAgICAgICBtZXNzYWdlOiAnQ291bGQgbm90IGRlbGV0ZSBmaWxlLicsXG4gICAgICB9KTtcbiAgICAgIG5leHQoZXJyb3IpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIG1ldGFkYXRhSGFuZGxlcihyZXEsIHJlcykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBjb25maWcgPSBDb25maWcuZ2V0KHJlcS5wYXJhbXMuYXBwSWQpO1xuICAgICAgY29uc3QgeyBmaWxlc0NvbnRyb2xsZXIgfSA9IGNvbmZpZztcbiAgICAgIGNvbnN0IHsgZmlsZW5hbWUgfSA9IHJlcS5wYXJhbXM7XG4gICAgICBjb25zdCBkYXRhID0gYXdhaXQgZmlsZXNDb250cm9sbGVyLmdldE1ldGFkYXRhKGZpbGVuYW1lKTtcbiAgICAgIHJlcy5zdGF0dXMoMjAwKTtcbiAgICAgIHJlcy5qc29uKGRhdGEpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJlcy5zdGF0dXMoMjAwKTtcbiAgICAgIHJlcy5qc29uKHt9KTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gaXNGaWxlU3RyZWFtYWJsZShyZXEsIGZpbGVzQ29udHJvbGxlcikge1xuICBjb25zdCByYW5nZSA9IChyZXEuZ2V0KCdSYW5nZScpIHx8ICcvLS8nKS5zcGxpdCgnLScpO1xuICBjb25zdCBzdGFydCA9IE51bWJlcihyYW5nZVswXSk7XG4gIGNvbnN0IGVuZCA9IE51bWJlcihyYW5nZVsxXSk7XG4gIHJldHVybiAoXG4gICAgKCFpc05hTihzdGFydCkgfHwgIWlzTmFOKGVuZCkpICYmIHR5cGVvZiBmaWxlc0NvbnRyb2xsZXIuYWRhcHRlci5oYW5kbGVGaWxlU3RyZWFtID09PSAnZnVuY3Rpb24nXG4gICk7XG59XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQStCO0FBQUE7QUFBQTtBQUMvQixNQUFNQSxRQUFRLEdBQUdDLE9BQU8sQ0FBQyxhQUFhLENBQUM7QUFDdkMsTUFBTUMsSUFBSSxHQUFHRCxPQUFPLENBQUMsTUFBTSxDQUFDO0FBQzVCLE1BQU1FLEtBQUssR0FBR0YsT0FBTyxDQUFDLFVBQVUsQ0FBQztBQUVqQyxNQUFNRyxtQkFBbUIsR0FBR0MsR0FBRyxJQUFJO0VB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