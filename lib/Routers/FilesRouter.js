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
      var _extension, _extension$split;
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
        extension = filename.substring(filename.lastIndexOf('.') + 1);
      } else if (contentType && contentType.includes('/')) {
        extension = contentType.split('/')[1];
      }
      extension = (_extension = extension) === null || _extension === void 0 ? void 0 : (_extension$split = _extension.split(' ')) === null || _extension$split === void 0 ? void 0 : _extension$split.join('');
      if (extension && !isValidExtension(extension)) {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZXhwcmVzcyIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX2JvZHlQYXJzZXIiLCJNaWRkbGV3YXJlcyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX25vZGUiLCJfQ29uZmlnIiwiX21pbWUiLCJfbG9nZ2VyIiwiX2dldFJlcXVpcmVXaWxkY2FyZENhY2hlIiwibm9kZUludGVyb3AiLCJXZWFrTWFwIiwiY2FjaGVCYWJlbEludGVyb3AiLCJjYWNoZU5vZGVJbnRlcm9wIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJjYWNoZSIsImhhcyIsImdldCIsIm5ld09iaiIsImhhc1Byb3BlcnR5RGVzY3JpcHRvciIsIk9iamVjdCIsImRlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwia2V5IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiZGVzYyIsInNldCIsInRyaWdnZXJzIiwiaHR0cCIsIlV0aWxzIiwiZG93bmxvYWRGaWxlRnJvbVVSSSIsInVyaSIsIlByb21pc2UiLCJyZXMiLCJyZWoiLCJyZXNwb25zZSIsInNldERlZmF1bHRFbmNvZGluZyIsImJvZHkiLCJoZWFkZXJzIiwib24iLCJkYXRhIiwiZSIsIm1lc3NhZ2UiLCJhZGRGaWxlRGF0YUlmTmVlZGVkIiwiZmlsZSIsIl9zb3VyY2UiLCJmb3JtYXQiLCJiYXNlNjQiLCJfcHJldmlvdXNTYXZlIiwiX2RhdGEiLCJfcmVxdWVzdFRhc2siLCJGaWxlc1JvdXRlciIsImV4cHJlc3NSb3V0ZXIiLCJtYXhVcGxvYWRTaXplIiwicm91dGVyIiwiZXhwcmVzcyIsIlJvdXRlciIsImdldEhhbmRsZXIiLCJtZXRhZGF0YUhhbmRsZXIiLCJwb3N0IiwicmVxIiwibmV4dCIsIlBhcnNlIiwiRXJyb3IiLCJJTlZBTElEX0ZJTEVfTkFNRSIsIkJvZHlQYXJzZXIiLCJyYXciLCJ0eXBlIiwibGltaXQiLCJoYW5kbGVQYXJzZUhlYWRlcnMiLCJoYW5kbGVQYXJzZVNlc3Npb24iLCJjcmVhdGVIYW5kbGVyIiwiZGVsZXRlIiwiZW5mb3JjZU1hc3RlcktleUFjY2VzcyIsImRlbGV0ZUhhbmRsZXIiLCJjb25maWciLCJDb25maWciLCJwYXJhbXMiLCJhcHBJZCIsInN0YXR1cyIsImVyciIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJqc29uIiwiY29kZSIsImVycm9yIiwiZmlsZXNDb250cm9sbGVyIiwiZmlsZW5hbWUiLCJjb250ZW50VHlwZSIsIm1pbWUiLCJnZXRUeXBlIiwiaXNGaWxlU3RyZWFtYWJsZSIsImhhbmRsZUZpbGVTdHJlYW0iLCJjYXRjaCIsImVuZCIsImdldEZpbGVEYXRhIiwidGhlbiIsImxlbmd0aCIsIl9jb25maWckZmlsZVVwbG9hZCIsInVzZXIiLCJhdXRoIiwiaXNNYXN0ZXIiLCJpc0xpbmtlZCIsIkFub255bW91c1V0aWxzIiwiZmlsZVVwbG9hZCIsImVuYWJsZUZvckFub255bW91c1VzZXIiLCJGSUxFX1NBVkVfRVJST1IiLCJlbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciIsImVuYWJsZUZvclB1YmxpYyIsInZhbGlkYXRlRmlsZW5hbWUiLCJmaWxlRXh0ZW5zaW9ucyIsIl9leHRlbnNpb24iLCJfZXh0ZW5zaW9uJHNwbGl0IiwiaXNWYWxpZEV4dGVuc2lvbiIsImV4dGVuc2lvbiIsInNvbWUiLCJleHQiLCJyZWdleCIsIlJlZ0V4cCIsInRlc3QiLCJpbmNsdWRlcyIsInN1YnN0cmluZyIsImxhc3RJbmRleE9mIiwic3BsaXQiLCJqb2luIiwidG9TdHJpbmciLCJGaWxlIiwibWV0YWRhdGEiLCJ0YWdzIiwiZmlsZURhdGEiLCJjaGVja1Byb2hpYml0ZWRLZXl3b3JkcyIsIklOVkFMSURfS0VZX05BTUUiLCJzZXRUYWdzIiwic2V0TWV0YWRhdGEiLCJmaWxlU2l6ZSIsIkJ1ZmZlciIsImJ5dGVMZW5ndGgiLCJmaWxlT2JqZWN0IiwidHJpZ2dlclJlc3VsdCIsIm1heWJlUnVuRmlsZVRyaWdnZXIiLCJUeXBlcyIsImJlZm9yZVNhdmUiLCJzYXZlUmVzdWx0IiwidXJsIiwibmFtZSIsIl9uYW1lIiwiYnVmZmVyRGF0YSIsImZyb20iLCJmaWxlT3B0aW9ucyIsIl9tZXRhZGF0YSIsImZpbGVUYWdzIiwia2V5cyIsIl90YWdzIiwiYXNzaWduIiwiY3JlYXRlRmlsZVJlc3VsdCIsImNyZWF0ZUZpbGUiLCJfdXJsIiwicmVzb2x2ZSIsImFmdGVyU2F2ZSIsImxvZ2dlciIsInJlc29sdmVFcnJvciIsImFkYXB0ZXIiLCJnZXRGaWxlTG9jYXRpb24iLCJiZWZvcmVEZWxldGUiLCJkZWxldGVGaWxlIiwiYWZ0ZXJEZWxldGUiLCJGSUxFX0RFTEVURV9FUlJPUiIsImdldE1ldGFkYXRhIiwiZXhwb3J0cyIsInJhbmdlIiwic3RhcnQiLCJOdW1iZXIiLCJpc05hTiJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0ZpbGVzUm91dGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBleHByZXNzIGZyb20gJ2V4cHJlc3MnO1xuaW1wb3J0IEJvZHlQYXJzZXIgZnJvbSAnYm9keS1wYXJzZXInO1xuaW1wb3J0ICogYXMgTWlkZGxld2FyZXMgZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi9Db25maWcnO1xuaW1wb3J0IG1pbWUgZnJvbSAnbWltZSc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5jb25zdCB0cmlnZ2VycyA9IHJlcXVpcmUoJy4uL3RyaWdnZXJzJyk7XG5jb25zdCBodHRwID0gcmVxdWlyZSgnaHR0cCcpO1xuY29uc3QgVXRpbHMgPSByZXF1aXJlKCcuLi9VdGlscycpO1xuXG5jb25zdCBkb3dubG9hZEZpbGVGcm9tVVJJID0gdXJpID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXMsIHJlaikgPT4ge1xuICAgIGh0dHBcbiAgICAgIC5nZXQodXJpLCByZXNwb25zZSA9PiB7XG4gICAgICAgIHJlc3BvbnNlLnNldERlZmF1bHRFbmNvZGluZygnYmFzZTY0Jyk7XG4gICAgICAgIGxldCBib2R5ID0gYGRhdGE6JHtyZXNwb25zZS5oZWFkZXJzWydjb250ZW50LXR5cGUnXX07YmFzZTY0LGA7XG4gICAgICAgIHJlc3BvbnNlLm9uKCdkYXRhJywgZGF0YSA9PiAoYm9keSArPSBkYXRhKSk7XG4gICAgICAgIHJlc3BvbnNlLm9uKCdlbmQnLCAoKSA9PiByZXMoYm9keSkpO1xuICAgICAgfSlcbiAgICAgIC5vbignZXJyb3InLCBlID0+IHtcbiAgICAgICAgcmVqKGBFcnJvciBkb3dubG9hZGluZyBmaWxlIGZyb20gJHt1cml9OiAke2UubWVzc2FnZX1gKTtcbiAgICAgIH0pO1xuICB9KTtcbn07XG5cbmNvbnN0IGFkZEZpbGVEYXRhSWZOZWVkZWQgPSBhc3luYyBmaWxlID0+IHtcbiAgaWYgKGZpbGUuX3NvdXJjZS5mb3JtYXQgPT09ICd1cmknKSB7XG4gICAgY29uc3QgYmFzZTY0ID0gYXdhaXQgZG93bmxvYWRGaWxlRnJvbVVSSShmaWxlLl9zb3VyY2UudXJpKTtcbiAgICBmaWxlLl9wcmV2aW91c1NhdmUgPSBmaWxlO1xuICAgIGZpbGUuX2RhdGEgPSBiYXNlNjQ7XG4gICAgZmlsZS5fcmVxdWVzdFRhc2sgPSBudWxsO1xuICB9XG4gIHJldHVybiBmaWxlO1xufTtcblxuZXhwb3J0IGNsYXNzIEZpbGVzUm91dGVyIHtcbiAgZXhwcmVzc1JvdXRlcih7IG1heFVwbG9hZFNpemUgPSAnMjBNYicgfSA9IHt9KSB7XG4gICAgdmFyIHJvdXRlciA9IGV4cHJlc3MuUm91dGVyKCk7XG4gICAgcm91dGVyLmdldCgnL2ZpbGVzLzphcHBJZC86ZmlsZW5hbWUnLCB0aGlzLmdldEhhbmRsZXIpO1xuICAgIHJvdXRlci5nZXQoJy9maWxlcy86YXBwSWQvbWV0YWRhdGEvOmZpbGVuYW1lJywgdGhpcy5tZXRhZGF0YUhhbmRsZXIpO1xuXG4gICAgcm91dGVyLnBvc3QoJy9maWxlcycsIGZ1bmN0aW9uIChyZXEsIHJlcywgbmV4dCkge1xuICAgICAgbmV4dChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9GSUxFX05BTUUsICdGaWxlbmFtZSBub3QgcHJvdmlkZWQuJykpO1xuICAgIH0pO1xuXG4gICAgcm91dGVyLnBvc3QoXG4gICAgICAnL2ZpbGVzLzpmaWxlbmFtZScsXG4gICAgICBCb2R5UGFyc2VyLnJhdyh7XG4gICAgICAgIHR5cGU6ICgpID0+IHtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfSxcbiAgICAgICAgbGltaXQ6IG1heFVwbG9hZFNpemUsXG4gICAgICB9KSwgLy8gQWxsb3cgdXBsb2FkcyB3aXRob3V0IENvbnRlbnQtVHlwZSwgb3Igd2l0aCBhbnkgQ29udGVudC1UeXBlLlxuICAgICAgTWlkZGxld2FyZXMuaGFuZGxlUGFyc2VIZWFkZXJzLFxuICAgICAgTWlkZGxld2FyZXMuaGFuZGxlUGFyc2VTZXNzaW9uLFxuICAgICAgdGhpcy5jcmVhdGVIYW5kbGVyXG4gICAgKTtcblxuICAgIHJvdXRlci5kZWxldGUoXG4gICAgICAnL2ZpbGVzLzpmaWxlbmFtZScsXG4gICAgICBNaWRkbGV3YXJlcy5oYW5kbGVQYXJzZUhlYWRlcnMsXG4gICAgICBNaWRkbGV3YXJlcy5oYW5kbGVQYXJzZVNlc3Npb24sXG4gICAgICBNaWRkbGV3YXJlcy5lbmZvcmNlTWFzdGVyS2V5QWNjZXNzLFxuICAgICAgdGhpcy5kZWxldGVIYW5kbGVyXG4gICAgKTtcbiAgICByZXR1cm4gcm91dGVyO1xuICB9XG5cbiAgZ2V0SGFuZGxlcihyZXEsIHJlcykge1xuICAgIGNvbnN0IGNvbmZpZyA9IENvbmZpZy5nZXQocmVxLnBhcmFtcy5hcHBJZCk7XG4gICAgaWYgKCFjb25maWcpIHtcbiAgICAgIHJlcy5zdGF0dXMoNDAzKTtcbiAgICAgIGNvbnN0IGVyciA9IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLCAnSW52YWxpZCBhcHBsaWNhdGlvbiBJRC4nKTtcbiAgICAgIHJlcy5qc29uKHsgY29kZTogZXJyLmNvZGUsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgZmlsZXNDb250cm9sbGVyID0gY29uZmlnLmZpbGVzQ29udHJvbGxlcjtcbiAgICBjb25zdCBmaWxlbmFtZSA9IHJlcS5wYXJhbXMuZmlsZW5hbWU7XG4gICAgY29uc3QgY29udGVudFR5cGUgPSBtaW1lLmdldFR5cGUoZmlsZW5hbWUpO1xuICAgIGlmIChpc0ZpbGVTdHJlYW1hYmxlKHJlcSwgZmlsZXNDb250cm9sbGVyKSkge1xuICAgICAgZmlsZXNDb250cm9sbGVyLmhhbmRsZUZpbGVTdHJlYW0oY29uZmlnLCBmaWxlbmFtZSwgcmVxLCByZXMsIGNvbnRlbnRUeXBlKS5jYXRjaCgoKSA9PiB7XG4gICAgICAgIHJlcy5zdGF0dXMoNDA0KTtcbiAgICAgICAgcmVzLnNldCgnQ29udGVudC1UeXBlJywgJ3RleHQvcGxhaW4nKTtcbiAgICAgICAgcmVzLmVuZCgnRmlsZSBub3QgZm91bmQuJyk7XG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgZmlsZXNDb250cm9sbGVyXG4gICAgICAgIC5nZXRGaWxlRGF0YShjb25maWcsIGZpbGVuYW1lKVxuICAgICAgICAudGhlbihkYXRhID0+IHtcbiAgICAgICAgICByZXMuc3RhdHVzKDIwMCk7XG4gICAgICAgICAgcmVzLnNldCgnQ29udGVudC1UeXBlJywgY29udGVudFR5cGUpO1xuICAgICAgICAgIHJlcy5zZXQoJ0NvbnRlbnQtTGVuZ3RoJywgZGF0YS5sZW5ndGgpO1xuICAgICAgICAgIHJlcy5lbmQoZGF0YSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgcmVzLnN0YXR1cyg0MDQpO1xuICAgICAgICAgIHJlcy5zZXQoJ0NvbnRlbnQtVHlwZScsICd0ZXh0L3BsYWluJyk7XG4gICAgICAgICAgcmVzLmVuZCgnRmlsZSBub3QgZm91bmQuJyk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGNyZWF0ZUhhbmRsZXIocmVxLCByZXMsIG5leHQpIHtcbiAgICBjb25zdCBjb25maWcgPSByZXEuY29uZmlnO1xuICAgIGNvbnN0IHVzZXIgPSByZXEuYXV0aC51c2VyO1xuICAgIGNvbnN0IGlzTWFzdGVyID0gcmVxLmF1dGguaXNNYXN0ZXI7XG4gICAgY29uc3QgaXNMaW5rZWQgPSB1c2VyICYmIFBhcnNlLkFub255bW91c1V0aWxzLmlzTGlua2VkKHVzZXIpO1xuICAgIGlmICghaXNNYXN0ZXIgJiYgIWNvbmZpZy5maWxlVXBsb2FkLmVuYWJsZUZvckFub255bW91c1VzZXIgJiYgaXNMaW5rZWQpIHtcbiAgICAgIG5leHQoXG4gICAgICAgIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsICdGaWxlIHVwbG9hZCBieSBhbm9ueW1vdXMgdXNlciBpcyBkaXNhYmxlZC4nKVxuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKCFpc01hc3RlciAmJiAhY29uZmlnLmZpbGVVcGxvYWQuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIgJiYgIWlzTGlua2VkICYmIHVzZXIpIHtcbiAgICAgIG5leHQoXG4gICAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsXG4gICAgICAgICAgJ0ZpbGUgdXBsb2FkIGJ5IGF1dGhlbnRpY2F0ZWQgdXNlciBpcyBkaXNhYmxlZC4nXG4gICAgICAgIClcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICghaXNNYXN0ZXIgJiYgIWNvbmZpZy5maWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyAmJiAhdXNlcikge1xuICAgICAgbmV4dChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLCAnRmlsZSB1cGxvYWQgYnkgcHVibGljIGlzIGRpc2FibGVkLicpKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgZmlsZXNDb250cm9sbGVyID0gY29uZmlnLmZpbGVzQ29udHJvbGxlcjtcbiAgICBjb25zdCB7IGZpbGVuYW1lIH0gPSByZXEucGFyYW1zO1xuICAgIGNvbnN0IGNvbnRlbnRUeXBlID0gcmVxLmdldCgnQ29udGVudC10eXBlJyk7XG5cbiAgICBpZiAoIXJlcS5ib2R5IHx8ICFyZXEuYm9keS5sZW5ndGgpIHtcbiAgICAgIG5leHQobmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkZJTEVfU0FWRV9FUlJPUiwgJ0ludmFsaWQgZmlsZSB1cGxvYWQuJykpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGVycm9yID0gZmlsZXNDb250cm9sbGVyLnZhbGlkYXRlRmlsZW5hbWUoZmlsZW5hbWUpO1xuICAgIGlmIChlcnJvcikge1xuICAgICAgbmV4dChlcnJvcik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgZmlsZUV4dGVuc2lvbnMgPSBjb25maWcuZmlsZVVwbG9hZD8uZmlsZUV4dGVuc2lvbnM7XG4gICAgaWYgKCFpc01hc3RlciAmJiBmaWxlRXh0ZW5zaW9ucykge1xuICAgICAgY29uc3QgaXNWYWxpZEV4dGVuc2lvbiA9IGV4dGVuc2lvbiA9PiB7XG4gICAgICAgIHJldHVybiBmaWxlRXh0ZW5zaW9ucy5zb21lKGV4dCA9PiB7XG4gICAgICAgICAgaWYgKGV4dCA9PT0gJyonKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKGV4dCk7XG4gICAgICAgICAgaWYgKHJlZ2V4LnRlc3QoZXh0ZW5zaW9uKSkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH07XG4gICAgICBsZXQgZXh0ZW5zaW9uID0gY29udGVudFR5cGU7XG4gICAgICBpZiAoZmlsZW5hbWUgJiYgZmlsZW5hbWUuaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICBleHRlbnNpb24gPSBmaWxlbmFtZS5zdWJzdHJpbmcoZmlsZW5hbWUubGFzdEluZGV4T2YoJy4nKSArIDEpO1xuICAgICAgfSBlbHNlIGlmIChjb250ZW50VHlwZSAmJiBjb250ZW50VHlwZS5pbmNsdWRlcygnLycpKSB7XG4gICAgICAgIGV4dGVuc2lvbiA9IGNvbnRlbnRUeXBlLnNwbGl0KCcvJylbMV07XG4gICAgICB9XG4gICAgICBleHRlbnNpb24gPSBleHRlbnNpb24/LnNwbGl0KCcgJyk/LmpvaW4oJycpO1xuXG4gICAgICBpZiAoZXh0ZW5zaW9uICYmICFpc1ZhbGlkRXh0ZW5zaW9uKGV4dGVuc2lvbikpIHtcbiAgICAgICAgbmV4dChcbiAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsXG4gICAgICAgICAgICBgRmlsZSB1cGxvYWQgb2YgZXh0ZW5zaW9uICR7ZXh0ZW5zaW9ufSBpcyBkaXNhYmxlZC5gXG4gICAgICAgICAgKVxuICAgICAgICApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgYmFzZTY0ID0gcmVxLmJvZHkudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuICAgIGNvbnN0IGZpbGUgPSBuZXcgUGFyc2UuRmlsZShmaWxlbmFtZSwgeyBiYXNlNjQgfSwgY29udGVudFR5cGUpO1xuICAgIGNvbnN0IHsgbWV0YWRhdGEgPSB7fSwgdGFncyA9IHt9IH0gPSByZXEuZmlsZURhdGEgfHwge307XG4gICAgdHJ5IHtcbiAgICAgIC8vIFNjYW4gcmVxdWVzdCBkYXRhIGZvciBkZW5pZWQga2V5d29yZHNcbiAgICAgIFV0aWxzLmNoZWNrUHJvaGliaXRlZEtleXdvcmRzKGNvbmZpZywgbWV0YWRhdGEpO1xuICAgICAgVXRpbHMuY2hlY2tQcm9oaWJpdGVkS2V5d29yZHMoY29uZmlnLCB0YWdzKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbmV4dChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgZXJyb3IpKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZmlsZS5zZXRUYWdzKHRhZ3MpO1xuICAgIGZpbGUuc2V0TWV0YWRhdGEobWV0YWRhdGEpO1xuICAgIGNvbnN0IGZpbGVTaXplID0gQnVmZmVyLmJ5dGVMZW5ndGgocmVxLmJvZHkpO1xuICAgIGNvbnN0IGZpbGVPYmplY3QgPSB7IGZpbGUsIGZpbGVTaXplIH07XG4gICAgdHJ5IHtcbiAgICAgIC8vIHJ1biBiZWZvcmVTYXZlRmlsZSB0cmlnZ2VyXG4gICAgICBjb25zdCB0cmlnZ2VyUmVzdWx0ID0gYXdhaXQgdHJpZ2dlcnMubWF5YmVSdW5GaWxlVHJpZ2dlcihcbiAgICAgICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlU2F2ZSxcbiAgICAgICAgZmlsZU9iamVjdCxcbiAgICAgICAgY29uZmlnLFxuICAgICAgICByZXEuYXV0aFxuICAgICAgKTtcbiAgICAgIGxldCBzYXZlUmVzdWx0O1xuICAgICAgLy8gaWYgYSBuZXcgUGFyc2VGaWxlIGlzIHJldHVybmVkIGNoZWNrIGlmIGl0J3MgYW4gYWxyZWFkeSBzYXZlZCBmaWxlXG4gICAgICBpZiAodHJpZ2dlclJlc3VsdCBpbnN0YW5jZW9mIFBhcnNlLkZpbGUpIHtcbiAgICAgICAgZmlsZU9iamVjdC5maWxlID0gdHJpZ2dlclJlc3VsdDtcbiAgICAgICAgaWYgKHRyaWdnZXJSZXN1bHQudXJsKCkpIHtcbiAgICAgICAgICAvLyBzZXQgZmlsZVNpemUgdG8gbnVsbCBiZWNhdXNlIHdlIHdvbnQga25vdyBob3cgYmlnIGl0IGlzIGhlcmVcbiAgICAgICAgICBmaWxlT2JqZWN0LmZpbGVTaXplID0gbnVsbDtcbiAgICAgICAgICBzYXZlUmVzdWx0ID0ge1xuICAgICAgICAgICAgdXJsOiB0cmlnZ2VyUmVzdWx0LnVybCgpLFxuICAgICAgICAgICAgbmFtZTogdHJpZ2dlclJlc3VsdC5fbmFtZSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBpZiB0aGUgZmlsZSByZXR1cm5lZCBieSB0aGUgdHJpZ2dlciBoYXMgYWxyZWFkeSBiZWVuIHNhdmVkIHNraXAgc2F2aW5nIGFueXRoaW5nXG4gICAgICBpZiAoIXNhdmVSZXN1bHQpIHtcbiAgICAgICAgLy8gaWYgdGhlIFBhcnNlRmlsZSByZXR1cm5lZCBpcyB0eXBlIHVyaSwgZG93bmxvYWQgdGhlIGZpbGUgYmVmb3JlIHNhdmluZyBpdFxuICAgICAgICBhd2FpdCBhZGRGaWxlRGF0YUlmTmVlZGVkKGZpbGVPYmplY3QuZmlsZSk7XG4gICAgICAgIC8vIHVwZGF0ZSBmaWxlU2l6ZVxuICAgICAgICBjb25zdCBidWZmZXJEYXRhID0gQnVmZmVyLmZyb20oZmlsZU9iamVjdC5maWxlLl9kYXRhLCAnYmFzZTY0Jyk7XG4gICAgICAgIGZpbGVPYmplY3QuZmlsZVNpemUgPSBCdWZmZXIuYnl0ZUxlbmd0aChidWZmZXJEYXRhKTtcbiAgICAgICAgLy8gcHJlcGFyZSBmaWxlIG9wdGlvbnNcbiAgICAgICAgY29uc3QgZmlsZU9wdGlvbnMgPSB7XG4gICAgICAgICAgbWV0YWRhdGE6IGZpbGVPYmplY3QuZmlsZS5fbWV0YWRhdGEsXG4gICAgICAgIH07XG4gICAgICAgIC8vIHNvbWUgczMtY29tcGF0aWJsZSBwcm92aWRlcnMgKERpZ2l0YWxPY2VhbiwgTGlub2RlKSBkbyBub3QgYWNjZXB0IHRhZ3NcbiAgICAgICAgLy8gc28gd2UgZG8gbm90IGluY2x1ZGUgdGhlIHRhZ3Mgb3B0aW9uIGlmIGl0IGlzIGVtcHR5LlxuICAgICAgICBjb25zdCBmaWxlVGFncyA9XG4gICAgICAgICAgT2JqZWN0LmtleXMoZmlsZU9iamVjdC5maWxlLl90YWdzKS5sZW5ndGggPiAwID8geyB0YWdzOiBmaWxlT2JqZWN0LmZpbGUuX3RhZ3MgfSA6IHt9O1xuICAgICAgICBPYmplY3QuYXNzaWduKGZpbGVPcHRpb25zLCBmaWxlVGFncyk7XG4gICAgICAgIC8vIHNhdmUgZmlsZVxuICAgICAgICBjb25zdCBjcmVhdGVGaWxlUmVzdWx0ID0gYXdhaXQgZmlsZXNDb250cm9sbGVyLmNyZWF0ZUZpbGUoXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGZpbGVPYmplY3QuZmlsZS5fbmFtZSxcbiAgICAgICAgICBidWZmZXJEYXRhLFxuICAgICAgICAgIGZpbGVPYmplY3QuZmlsZS5fc291cmNlLnR5cGUsXG4gICAgICAgICAgZmlsZU9wdGlvbnNcbiAgICAgICAgKTtcbiAgICAgICAgLy8gdXBkYXRlIGZpbGUgd2l0aCBuZXcgZGF0YVxuICAgICAgICBmaWxlT2JqZWN0LmZpbGUuX25hbWUgPSBjcmVhdGVGaWxlUmVzdWx0Lm5hbWU7XG4gICAgICAgIGZpbGVPYmplY3QuZmlsZS5fdXJsID0gY3JlYXRlRmlsZVJlc3VsdC51cmw7XG4gICAgICAgIGZpbGVPYmplY3QuZmlsZS5fcmVxdWVzdFRhc2sgPSBudWxsO1xuICAgICAgICBmaWxlT2JqZWN0LmZpbGUuX3ByZXZpb3VzU2F2ZSA9IFByb21pc2UucmVzb2x2ZShmaWxlT2JqZWN0LmZpbGUpO1xuICAgICAgICBzYXZlUmVzdWx0ID0ge1xuICAgICAgICAgIHVybDogY3JlYXRlRmlsZVJlc3VsdC51cmwsXG4gICAgICAgICAgbmFtZTogY3JlYXRlRmlsZVJlc3VsdC5uYW1lLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgLy8gcnVuIGFmdGVyU2F2ZUZpbGUgdHJpZ2dlclxuICAgICAgYXdhaXQgdHJpZ2dlcnMubWF5YmVSdW5GaWxlVHJpZ2dlcih0cmlnZ2Vycy5UeXBlcy5hZnRlclNhdmUsIGZpbGVPYmplY3QsIGNvbmZpZywgcmVxLmF1dGgpO1xuICAgICAgcmVzLnN0YXR1cygyMDEpO1xuICAgICAgcmVzLnNldCgnTG9jYXRpb24nLCBzYXZlUmVzdWx0LnVybCk7XG4gICAgICByZXMuanNvbihzYXZlUmVzdWx0KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0Vycm9yIGNyZWF0aW5nIGEgZmlsZTogJywgZSk7XG4gICAgICBjb25zdCBlcnJvciA9IHRyaWdnZXJzLnJlc29sdmVFcnJvcihlLCB7XG4gICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLkZJTEVfU0FWRV9FUlJPUixcbiAgICAgICAgbWVzc2FnZTogYENvdWxkIG5vdCBzdG9yZSBmaWxlOiAke2ZpbGVPYmplY3QuZmlsZS5fbmFtZX0uYCxcbiAgICAgIH0pO1xuICAgICAgbmV4dChlcnJvcik7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgZGVsZXRlSGFuZGxlcihyZXEsIHJlcywgbmV4dCkge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB7IGZpbGVzQ29udHJvbGxlciB9ID0gcmVxLmNvbmZpZztcbiAgICAgIGNvbnN0IHsgZmlsZW5hbWUgfSA9IHJlcS5wYXJhbXM7XG4gICAgICAvLyBydW4gYmVmb3JlRGVsZXRlRmlsZSB0cmlnZ2VyXG4gICAgICBjb25zdCBmaWxlID0gbmV3IFBhcnNlLkZpbGUoZmlsZW5hbWUpO1xuICAgICAgZmlsZS5fdXJsID0gZmlsZXNDb250cm9sbGVyLmFkYXB0ZXIuZ2V0RmlsZUxvY2F0aW9uKHJlcS5jb25maWcsIGZpbGVuYW1lKTtcbiAgICAgIGNvbnN0IGZpbGVPYmplY3QgPSB7IGZpbGUsIGZpbGVTaXplOiBudWxsIH07XG4gICAgICBhd2FpdCB0cmlnZ2Vycy5tYXliZVJ1bkZpbGVUcmlnZ2VyKFxuICAgICAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVEZWxldGUsXG4gICAgICAgIGZpbGVPYmplY3QsXG4gICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgIHJlcS5hdXRoXG4gICAgICApO1xuICAgICAgLy8gZGVsZXRlIGZpbGVcbiAgICAgIGF3YWl0IGZpbGVzQ29udHJvbGxlci5kZWxldGVGaWxlKHJlcS5jb25maWcsIGZpbGVuYW1lKTtcbiAgICAgIC8vIHJ1biBhZnRlckRlbGV0ZUZpbGUgdHJpZ2dlclxuICAgICAgYXdhaXQgdHJpZ2dlcnMubWF5YmVSdW5GaWxlVHJpZ2dlcihcbiAgICAgICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJEZWxldGUsXG4gICAgICAgIGZpbGVPYmplY3QsXG4gICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgIHJlcS5hdXRoXG4gICAgICApO1xuICAgICAgcmVzLnN0YXR1cygyMDApO1xuICAgICAgLy8gVE9ETzogcmV0dXJuIHVzZWZ1bCBKU09OIGhlcmU/XG4gICAgICByZXMuZW5kKCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgbG9nZ2VyLmVycm9yKCdFcnJvciBkZWxldGluZyBhIGZpbGU6ICcsIGUpO1xuICAgICAgY29uc3QgZXJyb3IgPSB0cmlnZ2Vycy5yZXNvbHZlRXJyb3IoZSwge1xuICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5GSUxFX0RFTEVURV9FUlJPUixcbiAgICAgICAgbWVzc2FnZTogJ0NvdWxkIG5vdCBkZWxldGUgZmlsZS4nLFxuICAgICAgfSk7XG4gICAgICBuZXh0KGVycm9yKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBtZXRhZGF0YUhhbmRsZXIocmVxLCByZXMpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChyZXEucGFyYW1zLmFwcElkKTtcbiAgICAgIGNvbnN0IHsgZmlsZXNDb250cm9sbGVyIH0gPSBjb25maWc7XG4gICAgICBjb25zdCB7IGZpbGVuYW1lIH0gPSByZXEucGFyYW1zO1xuICAgICAgY29uc3QgZGF0YSA9IGF3YWl0IGZpbGVzQ29udHJvbGxlci5nZXRNZXRhZGF0YShmaWxlbmFtZSk7XG4gICAgICByZXMuc3RhdHVzKDIwMCk7XG4gICAgICByZXMuanNvbihkYXRhKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByZXMuc3RhdHVzKDIwMCk7XG4gICAgICByZXMuanNvbih7fSk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGlzRmlsZVN0cmVhbWFibGUocmVxLCBmaWxlc0NvbnRyb2xsZXIpIHtcbiAgY29uc3QgcmFuZ2UgPSAocmVxLmdldCgnUmFuZ2UnKSB8fCAnLy0vJykuc3BsaXQoJy0nKTtcbiAgY29uc3Qgc3RhcnQgPSBOdW1iZXIocmFuZ2VbMF0pO1xuICBjb25zdCBlbmQgPSBOdW1iZXIocmFuZ2VbMV0pO1xuICByZXR1cm4gKFxuICAgICghaXNOYU4oc3RhcnQpIHx8ICFpc05hTihlbmQpKSAmJiB0eXBlb2YgZmlsZXNDb250cm9sbGVyLmFkYXB0ZXIuaGFuZGxlRmlsZVN0cmVhbSA9PT0gJ2Z1bmN0aW9uJ1xuICApO1xufVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSxJQUFBQSxRQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxXQUFBLEdBQUFGLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRSxXQUFBLEdBQUFDLHVCQUFBLENBQUFILE9BQUE7QUFDQSxJQUFBSSxLQUFBLEdBQUFMLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBSyxPQUFBLEdBQUFOLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBTSxLQUFBLEdBQUFQLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBTyxPQUFBLEdBQUFSLHNCQUFBLENBQUFDLE9BQUE7QUFBK0IsU0FBQVEseUJBQUFDLFdBQUEsZUFBQUMsT0FBQSxrQ0FBQUMsaUJBQUEsT0FBQUQsT0FBQSxRQUFBRSxnQkFBQSxPQUFBRixPQUFBLFlBQUFGLHdCQUFBLFlBQUFBLENBQUFDLFdBQUEsV0FBQUEsV0FBQSxHQUFBRyxnQkFBQSxHQUFBRCxpQkFBQSxLQUFBRixXQUFBO0FBQUEsU0FBQU4sd0JBQUFVLEdBQUEsRUFBQUosV0FBQSxTQUFBQSxXQUFBLElBQUFJLEdBQUEsSUFBQUEsR0FBQSxDQUFBQyxVQUFBLFdBQUFELEdBQUEsUUFBQUEsR0FBQSxvQkFBQUEsR0FBQSx3QkFBQUEsR0FBQSw0QkFBQUUsT0FBQSxFQUFBRixHQUFBLFVBQUFHLEtBQUEsR0FBQVIsd0JBQUEsQ0FBQUMsV0FBQSxPQUFBTyxLQUFBLElBQUFBLEtBQUEsQ0FBQUMsR0FBQSxDQUFBSixHQUFBLFlBQUFHLEtBQUEsQ0FBQUUsR0FBQSxDQUFBTCxHQUFBLFNBQUFNLE1BQUEsV0FBQUMscUJBQUEsR0FBQUMsTUFBQSxDQUFBQyxjQUFBLElBQUFELE1BQUEsQ0FBQUUsd0JBQUEsV0FBQUMsR0FBQSxJQUFBWCxHQUFBLFFBQUFXLEdBQUEsa0JBQUFILE1BQUEsQ0FBQUksU0FBQSxDQUFBQyxjQUFBLENBQUFDLElBQUEsQ0FBQWQsR0FBQSxFQUFBVyxHQUFBLFNBQUFJLElBQUEsR0FBQVIscUJBQUEsR0FBQUMsTUFBQSxDQUFBRSx3QkFBQSxDQUFBVixHQUFBLEVBQUFXLEdBQUEsY0FBQUksSUFBQSxLQUFBQSxJQUFBLENBQUFWLEdBQUEsSUFBQVUsSUFBQSxDQUFBQyxHQUFBLEtBQUFSLE1BQUEsQ0FBQUMsY0FBQSxDQUFBSCxNQUFBLEVBQUFLLEdBQUEsRUFBQUksSUFBQSxZQUFBVCxNQUFBLENBQUFLLEdBQUEsSUFBQVgsR0FBQSxDQUFBVyxHQUFBLFNBQUFMLE1BQUEsQ0FBQUosT0FBQSxHQUFBRixHQUFBLE1BQUFHLEtBQUEsSUFBQUEsS0FBQSxDQUFBYSxHQUFBLENBQUFoQixHQUFBLEVBQUFNLE1BQUEsWUFBQUEsTUFBQTtBQUFBLFNBQUFwQix1QkFBQWMsR0FBQSxXQUFBQSxHQUFBLElBQUFBLEdBQUEsQ0FBQUMsVUFBQSxHQUFBRCxHQUFBLEtBQUFFLE9BQUEsRUFBQUYsR0FBQTtBQUMvQixNQUFNaUIsUUFBUSxHQUFHOUIsT0FBTyxDQUFDLGFBQWEsQ0FBQztBQUN2QyxNQUFNK0IsSUFBSSxHQUFHL0IsT0FBTyxDQUFDLE1BQU0sQ0FBQztBQUM1QixNQUFNZ0MsS0FBSyxHQUFHaEMsT0FBTyxDQUFDLFVBQVUsQ0FBQztBQUVqQyxNQUFNaUMsbUJBQW1CLEdBQUdDLEdBQUcsSUFBSTtFQUNqQyxPQUFPLElBQUlDLE9BQU8sQ0FBQyxDQUFDQyxHQUFHLEVBQUVDLEdBQUcsS0FBSztJQUMvQk4sSUFBSSxDQUNEYixHQUFHLENBQUNnQixHQUFHLEVBQUVJLFFBQVEsSUFBSTtNQUNwQkEsUUFBUSxDQUFDQyxrQkFBa0IsQ0FBQyxRQUFRLENBQUM7TUFDckMsSUFBSUMsSUFBSSxHQUFJLFFBQU9GLFFBQVEsQ0FBQ0csT0FBTyxDQUFDLGNBQWMsQ0FBRSxVQUFTO01BQzdESCxRQUFRLENBQUNJLEVBQUUsQ0FBQyxNQUFNLEVBQUVDLElBQUksSUFBS0gsSUFBSSxJQUFJRyxJQUFLLENBQUM7TUFDM0NMLFFBQVEsQ0FBQ0ksRUFBRSxDQUFDLEtBQUssRUFBRSxNQUFNTixHQUFHLENBQUNJLElBQUksQ0FBQyxDQUFDO0lBQ3JDLENBQUMsQ0FBQyxDQUNERSxFQUFFLENBQUMsT0FBTyxFQUFFRSxDQUFDLElBQUk7TUFDaEJQLEdBQUcsQ0FBRSwrQkFBOEJILEdBQUksS0FBSVUsQ0FBQyxDQUFDQyxPQUFRLEVBQUMsQ0FBQztJQUN6RCxDQUFDLENBQUM7RUFDTixDQUFDLENBQUM7QUFDSixDQUFDO0FBRUQsTUFBTUMsbUJBQW1CLEdBQUcsTUFBTUMsSUFBSSxJQUFJO0VBQ3hDLElBQUlBLElBQUksQ0FBQ0MsT0FBTyxDQUFDQyxNQUFNLEtBQUssS0FBSyxFQUFFO0lBQ2pDLE1BQU1DLE1BQU0sR0FBRyxNQUFNakIsbUJBQW1CLENBQUNjLElBQUksQ0FBQ0MsT0FBTyxDQUFDZCxHQUFHLENBQUM7SUFDMURhLElBQUksQ0FBQ0ksYUFBYSxHQUFHSixJQUFJO0lBQ3pCQSxJQUFJLENBQUNLLEtBQUssR0FBR0YsTUFBTTtJQUNuQkgsSUFBSSxDQUFDTSxZQUFZLEdBQUcsSUFBSTtFQUMxQjtFQUNBLE9BQU9OLElBQUk7QUFDYixDQUFDO0FBRU0sTUFBTU8sV0FBVyxDQUFDO0VBQ3ZCQyxhQUFhQSxDQUFDO0lBQUVDLGFBQWEsR0FBRztFQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRTtJQUM3QyxJQUFJQyxNQUFNLEdBQUdDLGdCQUFPLENBQUNDLE1BQU0sQ0FBQyxDQUFDO0lBQzdCRixNQUFNLENBQUN2QyxHQUFHLENBQUMseUJBQXlCLEVBQUUsSUFBSSxDQUFDMEMsVUFBVSxDQUFDO0lBQ3RESCxNQUFNLENBQUN2QyxHQUFHLENBQUMsa0NBQWtDLEVBQUUsSUFBSSxDQUFDMkMsZUFBZSxDQUFDO0lBRXBFSixNQUFNLENBQUNLLElBQUksQ0FBQyxRQUFRLEVBQUUsVUFBVUMsR0FBRyxFQUFFM0IsR0FBRyxFQUFFNEIsSUFBSSxFQUFFO01BQzlDQSxJQUFJLENBQUMsSUFBSUMsYUFBSyxDQUFDQyxLQUFLLENBQUNELGFBQUssQ0FBQ0MsS0FBSyxDQUFDQyxpQkFBaUIsRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO0lBQ2hGLENBQUMsQ0FBQztJQUVGVixNQUFNLENBQUNLLElBQUksQ0FDVCxrQkFBa0IsRUFDbEJNLG1CQUFVLENBQUNDLEdBQUcsQ0FBQztNQUNiQyxJQUFJLEVBQUVBLENBQUEsS0FBTTtRQUNWLE9BQU8sSUFBSTtNQUNiLENBQUM7TUFDREMsS0FBSyxFQUFFZjtJQUNULENBQUMsQ0FBQztJQUFFO0lBQ0p0RCxXQUFXLENBQUNzRSxrQkFBa0IsRUFDOUJ0RSxXQUFXLENBQUN1RSxrQkFBa0IsRUFDOUIsSUFBSSxDQUFDQyxhQUNQLENBQUM7SUFFRGpCLE1BQU0sQ0FBQ2tCLE1BQU0sQ0FDWCxrQkFBa0IsRUFDbEJ6RSxXQUFXLENBQUNzRSxrQkFBa0IsRUFDOUJ0RSxXQUFXLENBQUN1RSxrQkFBa0IsRUFDOUJ2RSxXQUFXLENBQUMwRSxzQkFBc0IsRUFDbEMsSUFBSSxDQUFDQyxhQUNQLENBQUM7SUFDRCxPQUFPcEIsTUFBTTtFQUNmO0VBRUFHLFVBQVVBLENBQUNHLEdBQUcsRUFBRTNCLEdBQUcsRUFBRTtJQUNuQixNQUFNMEMsTUFBTSxHQUFHQyxlQUFNLENBQUM3RCxHQUFHLENBQUM2QyxHQUFHLENBQUNpQixNQUFNLENBQUNDLEtBQUssQ0FBQztJQUMzQyxJQUFJLENBQUNILE1BQU0sRUFBRTtNQUNYMUMsR0FBRyxDQUFDOEMsTUFBTSxDQUFDLEdBQUcsQ0FBQztNQUNmLE1BQU1DLEdBQUcsR0FBRyxJQUFJbEIsYUFBSyxDQUFDQyxLQUFLLENBQUNELGFBQUssQ0FBQ0MsS0FBSyxDQUFDa0IsbUJBQW1CLEVBQUUseUJBQXlCLENBQUM7TUFDdkZoRCxHQUFHLENBQUNpRCxJQUFJLENBQUM7UUFBRUMsSUFBSSxFQUFFSCxHQUFHLENBQUNHLElBQUk7UUFBRUMsS0FBSyxFQUFFSixHQUFHLENBQUN0QztNQUFRLENBQUMsQ0FBQztNQUNoRDtJQUNGO0lBQ0EsTUFBTTJDLGVBQWUsR0FBR1YsTUFBTSxDQUFDVSxlQUFlO0lBQzlDLE1BQU1DLFFBQVEsR0FBRzFCLEdBQUcsQ0FBQ2lCLE1BQU0sQ0FBQ1MsUUFBUTtJQUNwQyxNQUFNQyxXQUFXLEdBQUdDLGFBQUksQ0FBQ0MsT0FBTyxDQUFDSCxRQUFRLENBQUM7SUFDMUMsSUFBSUksZ0JBQWdCLENBQUM5QixHQUFHLEVBQUV5QixlQUFlLENBQUMsRUFBRTtNQUMxQ0EsZUFBZSxDQUFDTSxnQkFBZ0IsQ0FBQ2hCLE1BQU0sRUFBRVcsUUFBUSxFQUFFMUIsR0FBRyxFQUFFM0IsR0FBRyxFQUFFc0QsV0FBVyxDQUFDLENBQUNLLEtBQUssQ0FBQyxNQUFNO1FBQ3BGM0QsR0FBRyxDQUFDOEMsTUFBTSxDQUFDLEdBQUcsQ0FBQztRQUNmOUMsR0FBRyxDQUFDUCxHQUFHLENBQUMsY0FBYyxFQUFFLFlBQVksQ0FBQztRQUNyQ08sR0FBRyxDQUFDNEQsR0FBRyxDQUFDLGlCQUFpQixDQUFDO01BQzVCLENBQUMsQ0FBQztJQUNKLENBQUMsTUFBTTtNQUNMUixlQUFlLENBQ1pTLFdBQVcsQ0FBQ25CLE1BQU0sRUFBRVcsUUFBUSxDQUFDLENBQzdCUyxJQUFJLENBQUN2RCxJQUFJLElBQUk7UUFDWlAsR0FBRyxDQUFDOEMsTUFBTSxDQUFDLEdBQUcsQ0FBQztRQUNmOUMsR0FBRyxDQUFDUCxHQUFHLENBQUMsY0FBYyxFQUFFNkQsV0FBVyxDQUFDO1FBQ3BDdEQsR0FBRyxDQUFDUCxHQUFHLENBQUMsZ0JBQWdCLEVBQUVjLElBQUksQ0FBQ3dELE1BQU0sQ0FBQztRQUN0Qy9ELEdBQUcsQ0FBQzRELEdBQUcsQ0FBQ3JELElBQUksQ0FBQztNQUNmLENBQUMsQ0FBQyxDQUNEb0QsS0FBSyxDQUFDLE1BQU07UUFDWDNELEdBQUcsQ0FBQzhDLE1BQU0sQ0FBQyxHQUFHLENBQUM7UUFDZjlDLEdBQUcsQ0FBQ1AsR0FBRyxDQUFDLGNBQWMsRUFBRSxZQUFZLENBQUM7UUFDckNPLEdBQUcsQ0FBQzRELEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQztNQUM1QixDQUFDLENBQUM7SUFDTjtFQUNGO0VBRUEsTUFBTXRCLGFBQWFBLENBQUNYLEdBQUcsRUFBRTNCLEdBQUcsRUFBRTRCLElBQUksRUFBRTtJQUFBLElBQUFvQyxrQkFBQTtJQUNsQyxNQUFNdEIsTUFBTSxHQUFHZixHQUFHLENBQUNlLE1BQU07SUFDekIsTUFBTXVCLElBQUksR0FBR3RDLEdBQUcsQ0FBQ3VDLElBQUksQ0FBQ0QsSUFBSTtJQUMxQixNQUFNRSxRQUFRLEdBQUd4QyxHQUFHLENBQUN1QyxJQUFJLENBQUNDLFFBQVE7SUFDbEMsTUFBTUMsUUFBUSxHQUFHSCxJQUFJLElBQUlwQyxhQUFLLENBQUN3QyxjQUFjLENBQUNELFFBQVEsQ0FBQ0gsSUFBSSxDQUFDO0lBQzVELElBQUksQ0FBQ0UsUUFBUSxJQUFJLENBQUN6QixNQUFNLENBQUM0QixVQUFVLENBQUNDLHNCQUFzQixJQUFJSCxRQUFRLEVBQUU7TUFDdEV4QyxJQUFJLENBQ0YsSUFBSUMsYUFBSyxDQUFDQyxLQUFLLENBQUNELGFBQUssQ0FBQ0MsS0FBSyxDQUFDMEMsZUFBZSxFQUFFLDRDQUE0QyxDQUMzRixDQUFDO01BQ0Q7SUFDRjtJQUNBLElBQUksQ0FBQ0wsUUFBUSxJQUFJLENBQUN6QixNQUFNLENBQUM0QixVQUFVLENBQUNHLDBCQUEwQixJQUFJLENBQUNMLFFBQVEsSUFBSUgsSUFBSSxFQUFFO01BQ25GckMsSUFBSSxDQUNGLElBQUlDLGFBQUssQ0FBQ0MsS0FBSyxDQUNiRCxhQUFLLENBQUNDLEtBQUssQ0FBQzBDLGVBQWUsRUFDM0IsZ0RBQ0YsQ0FDRixDQUFDO01BQ0Q7SUFDRjtJQUNBLElBQUksQ0FBQ0wsUUFBUSxJQUFJLENBQUN6QixNQUFNLENBQUM0QixVQUFVLENBQUNJLGVBQWUsSUFBSSxDQUFDVCxJQUFJLEVBQUU7TUFDNURyQyxJQUFJLENBQUMsSUFBSUMsYUFBSyxDQUFDQyxLQUFLLENBQUNELGFBQUssQ0FBQ0MsS0FBSyxDQUFDMEMsZUFBZSxFQUFFLG9DQUFvQyxDQUFDLENBQUM7TUFDeEY7SUFDRjtJQUNBLE1BQU1wQixlQUFlLEdBQUdWLE1BQU0sQ0FBQ1UsZUFBZTtJQUM5QyxNQUFNO01BQUVDO0lBQVMsQ0FBQyxHQUFHMUIsR0FBRyxDQUFDaUIsTUFBTTtJQUMvQixNQUFNVSxXQUFXLEdBQUczQixHQUFHLENBQUM3QyxHQUFHLENBQUMsY0FBYyxDQUFDO0lBRTNDLElBQUksQ0FBQzZDLEdBQUcsQ0FBQ3ZCLElBQUksSUFBSSxDQUFDdUIsR0FBRyxDQUFDdkIsSUFBSSxDQUFDMkQsTUFBTSxFQUFFO01BQ2pDbkMsSUFBSSxDQUFDLElBQUlDLGFBQUssQ0FBQ0MsS0FBSyxDQUFDRCxhQUFLLENBQUNDLEtBQUssQ0FBQzBDLGVBQWUsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDO01BQzFFO0lBQ0Y7SUFFQSxNQUFNckIsS0FBSyxHQUFHQyxlQUFlLENBQUN1QixnQkFBZ0IsQ0FBQ3RCLFFBQVEsQ0FBQztJQUN4RCxJQUFJRixLQUFLLEVBQUU7TUFDVHZCLElBQUksQ0FBQ3VCLEtBQUssQ0FBQztNQUNYO0lBQ0Y7SUFFQSxNQUFNeUIsY0FBYyxJQUFBWixrQkFBQSxHQUFHdEIsTUFBTSxDQUFDNEIsVUFBVSxjQUFBTixrQkFBQSx1QkFBakJBLGtCQUFBLENBQW1CWSxjQUFjO0lBQ3hELElBQUksQ0FBQ1QsUUFBUSxJQUFJUyxjQUFjLEVBQUU7TUFBQSxJQUFBQyxVQUFBLEVBQUFDLGdCQUFBO01BQy9CLE1BQU1DLGdCQUFnQixHQUFHQyxTQUFTLElBQUk7UUFDcEMsT0FBT0osY0FBYyxDQUFDSyxJQUFJLENBQUNDLEdBQUcsSUFBSTtVQUNoQyxJQUFJQSxHQUFHLEtBQUssR0FBRyxFQUFFO1lBQ2YsT0FBTyxJQUFJO1VBQ2I7VUFDQSxNQUFNQyxLQUFLLEdBQUcsSUFBSUMsTUFBTSxDQUFDRixHQUFHLENBQUM7VUFDN0IsSUFBSUMsS0FBSyxDQUFDRSxJQUFJLENBQUNMLFNBQVMsQ0FBQyxFQUFFO1lBQ3pCLE9BQU8sSUFBSTtVQUNiO1FBQ0YsQ0FBQyxDQUFDO01BQ0osQ0FBQztNQUNELElBQUlBLFNBQVMsR0FBRzFCLFdBQVc7TUFDM0IsSUFBSUQsUUFBUSxJQUFJQSxRQUFRLENBQUNpQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUU7UUFDdENOLFNBQVMsR0FBRzNCLFFBQVEsQ0FBQ2tDLFNBQVMsQ0FBQ2xDLFFBQVEsQ0FBQ21DLFdBQVcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7TUFDL0QsQ0FBQyxNQUFNLElBQUlsQyxXQUFXLElBQUlBLFdBQVcsQ0FBQ2dDLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRTtRQUNuRE4sU0FBUyxHQUFHMUIsV0FBVyxDQUFDbUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztNQUN2QztNQUNBVCxTQUFTLElBQUFILFVBQUEsR0FBR0csU0FBUyxjQUFBSCxVQUFBLHdCQUFBQyxnQkFBQSxHQUFURCxVQUFBLENBQVdZLEtBQUssQ0FBQyxHQUFHLENBQUMsY0FBQVgsZ0JBQUEsdUJBQXJCQSxnQkFBQSxDQUF1QlksSUFBSSxDQUFDLEVBQUUsQ0FBQztNQUUzQyxJQUFJVixTQUFTLElBQUksQ0FBQ0QsZ0JBQWdCLENBQUNDLFNBQVMsQ0FBQyxFQUFFO1FBQzdDcEQsSUFBSSxDQUNGLElBQUlDLGFBQUssQ0FBQ0MsS0FBSyxDQUNiRCxhQUFLLENBQUNDLEtBQUssQ0FBQzBDLGVBQWUsRUFDMUIsNEJBQTJCUSxTQUFVLGVBQ3hDLENBQ0YsQ0FBQztRQUNEO01BQ0Y7SUFDRjtJQUVBLE1BQU1sRSxNQUFNLEdBQUdhLEdBQUcsQ0FBQ3ZCLElBQUksQ0FBQ3VGLFFBQVEsQ0FBQyxRQUFRLENBQUM7SUFDMUMsTUFBTWhGLElBQUksR0FBRyxJQUFJa0IsYUFBSyxDQUFDK0QsSUFBSSxDQUFDdkMsUUFBUSxFQUFFO01BQUV2QztJQUFPLENBQUMsRUFBRXdDLFdBQVcsQ0FBQztJQUM5RCxNQUFNO01BQUV1QyxRQUFRLEdBQUcsQ0FBQyxDQUFDO01BQUVDLElBQUksR0FBRyxDQUFDO0lBQUUsQ0FBQyxHQUFHbkUsR0FBRyxDQUFDb0UsUUFBUSxJQUFJLENBQUMsQ0FBQztJQUN2RCxJQUFJO01BQ0Y7TUFDQW5HLEtBQUssQ0FBQ29HLHVCQUF1QixDQUFDdEQsTUFBTSxFQUFFbUQsUUFBUSxDQUFDO01BQy9DakcsS0FBSyxDQUFDb0csdUJBQXVCLENBQUN0RCxNQUFNLEVBQUVvRCxJQUFJLENBQUM7SUFDN0MsQ0FBQyxDQUFDLE9BQU8zQyxLQUFLLEVBQUU7TUFDZHZCLElBQUksQ0FBQyxJQUFJQyxhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUNtRSxnQkFBZ0IsRUFBRTlDLEtBQUssQ0FBQyxDQUFDO01BQzFEO0lBQ0Y7SUFDQXhDLElBQUksQ0FBQ3VGLE9BQU8sQ0FBQ0osSUFBSSxDQUFDO0lBQ2xCbkYsSUFBSSxDQUFDd0YsV0FBVyxDQUFDTixRQUFRLENBQUM7SUFDMUIsTUFBTU8sUUFBUSxHQUFHQyxNQUFNLENBQUNDLFVBQVUsQ0FBQzNFLEdBQUcsQ0FBQ3ZCLElBQUksQ0FBQztJQUM1QyxNQUFNbUcsVUFBVSxHQUFHO01BQUU1RixJQUFJO01BQUV5RjtJQUFTLENBQUM7SUFDckMsSUFBSTtNQUNGO01BQ0EsTUFBTUksYUFBYSxHQUFHLE1BQU05RyxRQUFRLENBQUMrRyxtQkFBbUIsQ0FDdEQvRyxRQUFRLENBQUNnSCxLQUFLLENBQUNDLFVBQVUsRUFDekJKLFVBQVUsRUFDVjdELE1BQU0sRUFDTmYsR0FBRyxDQUFDdUMsSUFDTixDQUFDO01BQ0QsSUFBSTBDLFVBQVU7TUFDZDtNQUNBLElBQUlKLGFBQWEsWUFBWTNFLGFBQUssQ0FBQytELElBQUksRUFBRTtRQUN2Q1csVUFBVSxDQUFDNUYsSUFBSSxHQUFHNkYsYUFBYTtRQUMvQixJQUFJQSxhQUFhLENBQUNLLEdBQUcsQ0FBQyxDQUFDLEVBQUU7VUFDdkI7VUFDQU4sVUFBVSxDQUFDSCxRQUFRLEdBQUcsSUFBSTtVQUMxQlEsVUFBVSxHQUFHO1lBQ1hDLEdBQUcsRUFBRUwsYUFBYSxDQUFDSyxHQUFHLENBQUMsQ0FBQztZQUN4QkMsSUFBSSxFQUFFTixhQUFhLENBQUNPO1VBQ3RCLENBQUM7UUFDSDtNQUNGO01BQ0E7TUFDQSxJQUFJLENBQUNILFVBQVUsRUFBRTtRQUNmO1FBQ0EsTUFBTWxHLG1CQUFtQixDQUFDNkYsVUFBVSxDQUFDNUYsSUFBSSxDQUFDO1FBQzFDO1FBQ0EsTUFBTXFHLFVBQVUsR0FBR1gsTUFBTSxDQUFDWSxJQUFJLENBQUNWLFVBQVUsQ0FBQzVGLElBQUksQ0FBQ0ssS0FBSyxFQUFFLFFBQVEsQ0FBQztRQUMvRHVGLFVBQVUsQ0FBQ0gsUUFBUSxHQUFHQyxNQUFNLENBQUNDLFVBQVUsQ0FBQ1UsVUFBVSxDQUFDO1FBQ25EO1FBQ0EsTUFBTUUsV0FBVyxHQUFHO1VBQ2xCckIsUUFBUSxFQUFFVSxVQUFVLENBQUM1RixJQUFJLENBQUN3RztRQUM1QixDQUFDO1FBQ0Q7UUFDQTtRQUNBLE1BQU1DLFFBQVEsR0FDWm5JLE1BQU0sQ0FBQ29JLElBQUksQ0FBQ2QsVUFBVSxDQUFDNUYsSUFBSSxDQUFDMkcsS0FBSyxDQUFDLENBQUN2RCxNQUFNLEdBQUcsQ0FBQyxHQUFHO1VBQUUrQixJQUFJLEVBQUVTLFVBQVUsQ0FBQzVGLElBQUksQ0FBQzJHO1FBQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN0RnJJLE1BQU0sQ0FBQ3NJLE1BQU0sQ0FBQ0wsV0FBVyxFQUFFRSxRQUFRLENBQUM7UUFDcEM7UUFDQSxNQUFNSSxnQkFBZ0IsR0FBRyxNQUFNcEUsZUFBZSxDQUFDcUUsVUFBVSxDQUN2RC9FLE1BQU0sRUFDTjZELFVBQVUsQ0FBQzVGLElBQUksQ0FBQ29HLEtBQUssRUFDckJDLFVBQVUsRUFDVlQsVUFBVSxDQUFDNUYsSUFBSSxDQUFDQyxPQUFPLENBQUNzQixJQUFJLEVBQzVCZ0YsV0FDRixDQUFDO1FBQ0Q7UUFDQVgsVUFBVSxDQUFDNUYsSUFBSSxDQUFDb0csS0FBSyxHQUFHUyxnQkFBZ0IsQ0FBQ1YsSUFBSTtRQUM3Q1AsVUFBVSxDQUFDNUYsSUFBSSxDQUFDK0csSUFBSSxHQUFHRixnQkFBZ0IsQ0FBQ1gsR0FBRztRQUMzQ04sVUFBVSxDQUFDNUYsSUFBSSxDQUFDTSxZQUFZLEdBQUcsSUFBSTtRQUNuQ3NGLFVBQVUsQ0FBQzVGLElBQUksQ0FBQ0ksYUFBYSxHQUFHaEIsT0FBTyxDQUFDNEgsT0FBTyxDQUFDcEIsVUFBVSxDQUFDNUYsSUFBSSxDQUFDO1FBQ2hFaUcsVUFBVSxHQUFHO1VBQ1hDLEdBQUcsRUFBRVcsZ0JBQWdCLENBQUNYLEdBQUc7VUFDekJDLElBQUksRUFBRVUsZ0JBQWdCLENBQUNWO1FBQ3pCLENBQUM7TUFDSDtNQUNBO01BQ0EsTUFBTXBILFFBQVEsQ0FBQytHLG1CQUFtQixDQUFDL0csUUFBUSxDQUFDZ0gsS0FBSyxDQUFDa0IsU0FBUyxFQUFFckIsVUFBVSxFQUFFN0QsTUFBTSxFQUFFZixHQUFHLENBQUN1QyxJQUFJLENBQUM7TUFDMUZsRSxHQUFHLENBQUM4QyxNQUFNLENBQUMsR0FBRyxDQUFDO01BQ2Y5QyxHQUFHLENBQUNQLEdBQUcsQ0FBQyxVQUFVLEVBQUVtSCxVQUFVLENBQUNDLEdBQUcsQ0FBQztNQUNuQzdHLEdBQUcsQ0FBQ2lELElBQUksQ0FBQzJELFVBQVUsQ0FBQztJQUN0QixDQUFDLENBQUMsT0FBT3BHLENBQUMsRUFBRTtNQUNWcUgsZUFBTSxDQUFDMUUsS0FBSyxDQUFDLHlCQUF5QixFQUFFM0MsQ0FBQyxDQUFDO01BQzFDLE1BQU0yQyxLQUFLLEdBQUd6RCxRQUFRLENBQUNvSSxZQUFZLENBQUN0SCxDQUFDLEVBQUU7UUFDckMwQyxJQUFJLEVBQUVyQixhQUFLLENBQUNDLEtBQUssQ0FBQzBDLGVBQWU7UUFDakMvRCxPQUFPLEVBQUcseUJBQXdCOEYsVUFBVSxDQUFDNUYsSUFBSSxDQUFDb0csS0FBTTtNQUMxRCxDQUFDLENBQUM7TUFDRm5GLElBQUksQ0FBQ3VCLEtBQUssQ0FBQztJQUNiO0VBQ0Y7RUFFQSxNQUFNVixhQUFhQSxDQUFDZCxHQUFHLEVBQUUzQixHQUFHLEVBQUU0QixJQUFJLEVBQUU7SUFDbEMsSUFBSTtNQUNGLE1BQU07UUFBRXdCO01BQWdCLENBQUMsR0FBR3pCLEdBQUcsQ0FBQ2UsTUFBTTtNQUN0QyxNQUFNO1FBQUVXO01BQVMsQ0FBQyxHQUFHMUIsR0FBRyxDQUFDaUIsTUFBTTtNQUMvQjtNQUNBLE1BQU1qQyxJQUFJLEdBQUcsSUFBSWtCLGFBQUssQ0FBQytELElBQUksQ0FBQ3ZDLFFBQVEsQ0FBQztNQUNyQzFDLElBQUksQ0FBQytHLElBQUksR0FBR3RFLGVBQWUsQ0FBQzJFLE9BQU8sQ0FBQ0MsZUFBZSxDQUFDckcsR0FBRyxDQUFDZSxNQUFNLEVBQUVXLFFBQVEsQ0FBQztNQUN6RSxNQUFNa0QsVUFBVSxHQUFHO1FBQUU1RixJQUFJO1FBQUV5RixRQUFRLEVBQUU7TUFBSyxDQUFDO01BQzNDLE1BQU0xRyxRQUFRLENBQUMrRyxtQkFBbUIsQ0FDaEMvRyxRQUFRLENBQUNnSCxLQUFLLENBQUN1QixZQUFZLEVBQzNCMUIsVUFBVSxFQUNWNUUsR0FBRyxDQUFDZSxNQUFNLEVBQ1ZmLEdBQUcsQ0FBQ3VDLElBQ04sQ0FBQztNQUNEO01BQ0EsTUFBTWQsZUFBZSxDQUFDOEUsVUFBVSxDQUFDdkcsR0FBRyxDQUFDZSxNQUFNLEVBQUVXLFFBQVEsQ0FBQztNQUN0RDtNQUNBLE1BQU0zRCxRQUFRLENBQUMrRyxtQkFBbUIsQ0FDaEMvRyxRQUFRLENBQUNnSCxLQUFLLENBQUN5QixXQUFXLEVBQzFCNUIsVUFBVSxFQUNWNUUsR0FBRyxDQUFDZSxNQUFNLEVBQ1ZmLEdBQUcsQ0FBQ3VDLElBQ04sQ0FBQztNQUNEbEUsR0FBRyxDQUFDOEMsTUFBTSxDQUFDLEdBQUcsQ0FBQztNQUNmO01BQ0E5QyxHQUFHLENBQUM0RCxHQUFHLENBQUMsQ0FBQztJQUNYLENBQUMsQ0FBQyxPQUFPcEQsQ0FBQyxFQUFFO01BQ1ZxSCxlQUFNLENBQUMxRSxLQUFLLENBQUMseUJBQXlCLEVBQUUzQyxDQUFDLENBQUM7TUFDMUMsTUFBTTJDLEtBQUssR0FBR3pELFFBQVEsQ0FBQ29JLFlBQVksQ0FBQ3RILENBQUMsRUFBRTtRQUNyQzBDLElBQUksRUFBRXJCLGFBQUssQ0FBQ0MsS0FBSyxDQUFDc0csaUJBQWlCO1FBQ25DM0gsT0FBTyxFQUFFO01BQ1gsQ0FBQyxDQUFDO01BQ0ZtQixJQUFJLENBQUN1QixLQUFLLENBQUM7SUFDYjtFQUNGO0VBRUEsTUFBTTFCLGVBQWVBLENBQUNFLEdBQUcsRUFBRTNCLEdBQUcsRUFBRTtJQUM5QixJQUFJO01BQ0YsTUFBTTBDLE1BQU0sR0FBR0MsZUFBTSxDQUFDN0QsR0FBRyxDQUFDNkMsR0FBRyxDQUFDaUIsTUFBTSxDQUFDQyxLQUFLLENBQUM7TUFDM0MsTUFBTTtRQUFFTztNQUFnQixDQUFDLEdBQUdWLE1BQU07TUFDbEMsTUFBTTtRQUFFVztNQUFTLENBQUMsR0FBRzFCLEdBQUcsQ0FBQ2lCLE1BQU07TUFDL0IsTUFBTXJDLElBQUksR0FBRyxNQUFNNkMsZUFBZSxDQUFDaUYsV0FBVyxDQUFDaEYsUUFBUSxDQUFDO01BQ3hEckQsR0FBRyxDQUFDOEMsTUFBTSxDQUFDLEdBQUcsQ0FBQztNQUNmOUMsR0FBRyxDQUFDaUQsSUFBSSxDQUFDMUMsSUFBSSxDQUFDO0lBQ2hCLENBQUMsQ0FBQyxPQUFPQyxDQUFDLEVBQUU7TUFDVlIsR0FBRyxDQUFDOEMsTUFBTSxDQUFDLEdBQUcsQ0FBQztNQUNmOUMsR0FBRyxDQUFDaUQsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2Q7RUFDRjtBQUNGO0FBQUNxRixPQUFBLENBQUFwSCxXQUFBLEdBQUFBLFdBQUE7QUFFRCxTQUFTdUMsZ0JBQWdCQSxDQUFDOUIsR0FBRyxFQUFFeUIsZUFBZSxFQUFFO0VBQzlDLE1BQU1tRixLQUFLLEdBQUcsQ0FBQzVHLEdBQUcsQ0FBQzdDLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxLQUFLLEVBQUUyRyxLQUFLLENBQUMsR0FBRyxDQUFDO0VBQ3BELE1BQU0rQyxLQUFLLEdBQUdDLE1BQU0sQ0FBQ0YsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0VBQzlCLE1BQU0zRSxHQUFHLEdBQUc2RSxNQUFNLENBQUNGLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztFQUM1QixPQUNFLENBQUMsQ0FBQ0csS0FBSyxDQUFDRixLQUFLLENBQUMsSUFBSSxDQUFDRSxLQUFLLENBQUM5RSxHQUFHLENBQUMsS0FBSyxPQUFPUixlQUFlLENBQUMyRSxPQUFPLENBQUNyRSxnQkFBZ0IsS0FBSyxVQUFVO0FBRXBHIn0=