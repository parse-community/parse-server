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

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class FilesRouter {
  expressRouter({
    maxUploadSize = '20Mb'
  } = {}) {
    var router = _express.default.Router();

    router.get('/files/:appId/:filename', this.getHandler);
    router.post('/files', function (req, res, next) {
      next(new _node.default.Error(_node.default.Error.INVALID_FILE_NAME, 'Filename not provided.'));
    });
    router.post('/files/:filename', _bodyParser.default.raw({
      type: () => {
        return true;
      },
      limit: maxUploadSize
    }), // Allow uploads without Content-Type, or with any Content-Type.
    Middlewares.handleParseHeaders, this.createHandler);
    router.delete('/files/:filename', Middlewares.handleParseHeaders, Middlewares.enforceMasterKeyAccess, this.deleteHandler);
    return router;
  }

  getHandler(req, res) {
    const config = _Config.default.get(req.params.appId);

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

  createHandler(req, res, next) {
    const config = req.config;
    const filesController = config.filesController;
    const filename = req.params.filename;
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

    filesController.createFile(config, filename, req.body, contentType).then(result => {
      res.status(201);
      res.set('Location', result.url);
      res.json(result);
    }).catch(e => {
      _logger.default.error('Error creating a file: ', e);

      next(new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, `Could not store file: ${filename}.`));
    });
  }

  deleteHandler(req, res, next) {
    const filesController = req.config.filesController;
    filesController.deleteFile(req.config, req.params.filename).then(() => {
      res.status(200); // TODO: return useful JSON here?

      res.end();
    }).catch(() => {
      next(new _node.default.Error(_node.default.Error.FILE_DELETE_ERROR, 'Could not delete file.'));
    });
  }

}

exports.FilesRouter = FilesRouter;

function isFileStreamable(req, filesController) {
  return req.get('Range') && typeof filesController.adapter.handleFileStream === 'function';
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0ZpbGVzUm91dGVyLmpzIl0sIm5hbWVzIjpbIkZpbGVzUm91dGVyIiwiZXhwcmVzc1JvdXRlciIsIm1heFVwbG9hZFNpemUiLCJyb3V0ZXIiLCJleHByZXNzIiwiUm91dGVyIiwiZ2V0IiwiZ2V0SGFuZGxlciIsInBvc3QiLCJyZXEiLCJyZXMiLCJuZXh0IiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfRklMRV9OQU1FIiwiQm9keVBhcnNlciIsInJhdyIsInR5cGUiLCJsaW1pdCIsIk1pZGRsZXdhcmVzIiwiaGFuZGxlUGFyc2VIZWFkZXJzIiwiY3JlYXRlSGFuZGxlciIsImRlbGV0ZSIsImVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MiLCJkZWxldGVIYW5kbGVyIiwiY29uZmlnIiwiQ29uZmlnIiwicGFyYW1zIiwiYXBwSWQiLCJmaWxlc0NvbnRyb2xsZXIiLCJmaWxlbmFtZSIsImNvbnRlbnRUeXBlIiwibWltZSIsImdldFR5cGUiLCJpc0ZpbGVTdHJlYW1hYmxlIiwiaGFuZGxlRmlsZVN0cmVhbSIsImNhdGNoIiwic3RhdHVzIiwic2V0IiwiZW5kIiwiZ2V0RmlsZURhdGEiLCJ0aGVuIiwiZGF0YSIsImxlbmd0aCIsImJvZHkiLCJGSUxFX1NBVkVfRVJST1IiLCJlcnJvciIsInZhbGlkYXRlRmlsZW5hbWUiLCJjcmVhdGVGaWxlIiwicmVzdWx0IiwidXJsIiwianNvbiIsImUiLCJsb2dnZXIiLCJkZWxldGVGaWxlIiwiRklMRV9ERUxFVEVfRVJST1IiLCJhZGFwdGVyIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBRU8sTUFBTUEsV0FBTixDQUFrQjtBQUN2QkMsRUFBQUEsYUFBYSxDQUFDO0FBQUVDLElBQUFBLGFBQWEsR0FBRztBQUFsQixNQUE2QixFQUE5QixFQUFrQztBQUM3QyxRQUFJQyxNQUFNLEdBQUdDLGlCQUFRQyxNQUFSLEVBQWI7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TixFQUFXQyxJQUFYLEVBQWlCO0FBQzVCLFVBQU1rQixlQUFlLEdBQUdwQixHQUFHLENBQUNnQixNQUFKLENBQVdJLGVBQW5DO0FBQ0FBLElBQUFBLGVBQWUsQ0FDWnlCLFVBREgsQ0FDYzdDLEdBQUcsQ0FBQ2dCLE1BRGxCLEVBQzBCaEIsR0FBRyxDQUFDa0IsTUFBSixDQUFXRyxRQURyQyxFQUVHVyxJQUZILENBRVEsTUFBTTtBQUNWL0IsTUFBQUEsR0FBRyxDQUFDMkIsTUFBSixDQUFXLEdBQVgsRUFEVSxDQUVWOztBQUNBM0IsTUFBQUEsR0FBRyxDQUFDNkIsR0FBSjtBQUNELEtBTkgsRUFPR0gsS0FQSCxDQU9TLE1BQU07QUFDWHpCLE1BQUFBLElBQUksQ0FDRixJQUFJQyxjQUFNQyxLQUFWLENBQ0VELGNBQU1DLEtBQU4sQ0FBWTBDLGlCQURkLEVBRUUsd0JBRkYsQ0FERSxDQUFKO0FBTUQsS0FkSDtBQWVEOztBQXBIc0I7Ozs7QUF1SHpCLFNBQVNyQixnQkFBVCxDQUEwQnpCLEdBQTFCLEVBQStCb0IsZUFBL0IsRUFBZ0Q7QUFDOUMsU0FDRXBCLEdBQUcsQ0FBQ0gsR0FBSixDQUFRLE9BQVIsS0FDQSxPQUFPdUIsZUFBZSxDQUFDMkIsT0FBaEIsQ0FBd0JyQixnQkFBL0IsS0FBb0QsVUFGdEQ7QUFJRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBleHByZXNzIGZyb20gJ2V4cHJlc3MnO1xuaW1wb3J0IEJvZHlQYXJzZXIgZnJvbSAnYm9keS1wYXJzZXInO1xuaW1wb3J0ICogYXMgTWlkZGxld2FyZXMgZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi9Db25maWcnO1xuaW1wb3J0IG1pbWUgZnJvbSAnbWltZSc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5cbmV4cG9ydCBjbGFzcyBGaWxlc1JvdXRlciB7XG4gIGV4cHJlc3NSb3V0ZXIoeyBtYXhVcGxvYWRTaXplID0gJzIwTWInIH0gPSB7fSkge1xuICAgIHZhciByb3V0ZXIgPSBleHByZXNzLlJvdXRlcigpO1xuICAgIHJvdXRlci5nZXQoJy9maWxlcy86YXBwSWQvOmZpbGVuYW1lJywgdGhpcy5nZXRIYW5kbGVyKTtcblxuICAgIHJvdXRlci5wb3N0KCcvZmlsZXMnLCBmdW5jdGlvbihyZXEsIHJlcywgbmV4dCkge1xuICAgICAgbmV4dChcbiAgICAgICAgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfRklMRV9OQU1FLCAnRmlsZW5hbWUgbm90IHByb3ZpZGVkLicpXG4gICAgICApO1xuICAgIH0pO1xuXG4gICAgcm91dGVyLnBvc3QoXG4gICAgICAnL2ZpbGVzLzpmaWxlbmFtZScsXG4gICAgICBCb2R5UGFyc2VyLnJhdyh7XG4gICAgICAgIHR5cGU6ICgpID0+IHtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfSxcbiAgICAgICAgbGltaXQ6IG1heFVwbG9hZFNpemUsXG4gICAgICB9KSwgLy8gQWxsb3cgdXBsb2FkcyB3aXRob3V0IENvbnRlbnQtVHlwZSwgb3Igd2l0aCBhbnkgQ29udGVudC1UeXBlLlxuICAgICAgTWlkZGxld2FyZXMuaGFuZGxlUGFyc2VIZWFkZXJzLFxuICAgICAgdGhpcy5jcmVhdGVIYW5kbGVyXG4gICAgKTtcblxuICAgIHJvdXRlci5kZWxldGUoXG4gICAgICAnL2ZpbGVzLzpmaWxlbmFtZScsXG4gICAgICBNaWRkbGV3YXJlcy5oYW5kbGVQYXJzZUhlYWRlcnMsXG4gICAgICBNaWRkbGV3YXJlcy5lbmZvcmNlTWFzdGVyS2V5QWNjZXNzLFxuICAgICAgdGhpcy5kZWxldGVIYW5kbGVyXG4gICAgKTtcbiAgICByZXR1cm4gcm91dGVyO1xuICB9XG5cbiAgZ2V0SGFuZGxlcihyZXEsIHJlcykge1xuICAgIGNvbnN0IGNvbmZpZyA9IENvbmZpZy5nZXQocmVxLnBhcmFtcy5hcHBJZCk7XG4gICAgY29uc3QgZmlsZXNDb250cm9sbGVyID0gY29uZmlnLmZpbGVzQ29udHJvbGxlcjtcbiAgICBjb25zdCBmaWxlbmFtZSA9IHJlcS5wYXJhbXMuZmlsZW5hbWU7XG4gICAgY29uc3QgY29udGVudFR5cGUgPSBtaW1lLmdldFR5cGUoZmlsZW5hbWUpO1xuICAgIGlmIChpc0ZpbGVTdHJlYW1hYmxlKHJlcSwgZmlsZXNDb250cm9sbGVyKSkge1xuICAgICAgZmlsZXNDb250cm9sbGVyXG4gICAgICAgIC5oYW5kbGVGaWxlU3RyZWFtKGNvbmZpZywgZmlsZW5hbWUsIHJlcSwgcmVzLCBjb250ZW50VHlwZSlcbiAgICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICByZXMuc3RhdHVzKDQwNCk7XG4gICAgICAgICAgcmVzLnNldCgnQ29udGVudC1UeXBlJywgJ3RleHQvcGxhaW4nKTtcbiAgICAgICAgICByZXMuZW5kKCdGaWxlIG5vdCBmb3VuZC4nKTtcbiAgICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGZpbGVzQ29udHJvbGxlclxuICAgICAgICAuZ2V0RmlsZURhdGEoY29uZmlnLCBmaWxlbmFtZSlcbiAgICAgICAgLnRoZW4oZGF0YSA9PiB7XG4gICAgICAgICAgcmVzLnN0YXR1cygyMDApO1xuICAgICAgICAgIHJlcy5zZXQoJ0NvbnRlbnQtVHlwZScsIGNvbnRlbnRUeXBlKTtcbiAgICAgICAgICByZXMuc2V0KCdDb250ZW50LUxlbmd0aCcsIGRhdGEubGVuZ3RoKTtcbiAgICAgICAgICByZXMuZW5kKGRhdGEpO1xuICAgICAgICB9KVxuICAgICAgICAuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgIHJlcy5zdGF0dXMoNDA0KTtcbiAgICAgICAgICByZXMuc2V0KCdDb250ZW50LVR5cGUnLCAndGV4dC9wbGFpbicpO1xuICAgICAgICAgIHJlcy5lbmQoJ0ZpbGUgbm90IGZvdW5kLicpO1xuICAgICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBjcmVhdGVIYW5kbGVyKHJlcSwgcmVzLCBuZXh0KSB7XG4gICAgY29uc3QgY29uZmlnID0gcmVxLmNvbmZpZztcbiAgICBjb25zdCBmaWxlc0NvbnRyb2xsZXIgPSBjb25maWcuZmlsZXNDb250cm9sbGVyO1xuICAgIGNvbnN0IGZpbGVuYW1lID0gcmVxLnBhcmFtcy5maWxlbmFtZTtcbiAgICBjb25zdCBjb250ZW50VHlwZSA9IHJlcS5nZXQoJ0NvbnRlbnQtdHlwZScpO1xuXG4gICAgaWYgKCFyZXEuYm9keSB8fCAhcmVxLmJvZHkubGVuZ3RoKSB7XG4gICAgICBuZXh0KFxuICAgICAgICBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLCAnSW52YWxpZCBmaWxlIHVwbG9hZC4nKVxuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBlcnJvciA9IGZpbGVzQ29udHJvbGxlci52YWxpZGF0ZUZpbGVuYW1lKGZpbGVuYW1lKTtcbiAgICBpZiAoZXJyb3IpIHtcbiAgICAgIG5leHQoZXJyb3IpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGZpbGVzQ29udHJvbGxlclxuICAgICAgLmNyZWF0ZUZpbGUoY29uZmlnLCBmaWxlbmFtZSwgcmVxLmJvZHksIGNvbnRlbnRUeXBlKVxuICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgcmVzLnN0YXR1cygyMDEpO1xuICAgICAgICByZXMuc2V0KCdMb2NhdGlvbicsIHJlc3VsdC51cmwpO1xuICAgICAgICByZXMuanNvbihyZXN1bHQpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlID0+IHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCdFcnJvciBjcmVhdGluZyBhIGZpbGU6ICcsIGUpO1xuICAgICAgICBuZXh0KFxuICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkZJTEVfU0FWRV9FUlJPUixcbiAgICAgICAgICAgIGBDb3VsZCBub3Qgc3RvcmUgZmlsZTogJHtmaWxlbmFtZX0uYFxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgZGVsZXRlSGFuZGxlcihyZXEsIHJlcywgbmV4dCkge1xuICAgIGNvbnN0IGZpbGVzQ29udHJvbGxlciA9IHJlcS5jb25maWcuZmlsZXNDb250cm9sbGVyO1xuICAgIGZpbGVzQ29udHJvbGxlclxuICAgICAgLmRlbGV0ZUZpbGUocmVxLmNvbmZpZywgcmVxLnBhcmFtcy5maWxlbmFtZSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmVzLnN0YXR1cygyMDApO1xuICAgICAgICAvLyBUT0RPOiByZXR1cm4gdXNlZnVsIEpTT04gaGVyZT9cbiAgICAgICAgcmVzLmVuZCgpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgIG5leHQoXG4gICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRklMRV9ERUxFVEVfRVJST1IsXG4gICAgICAgICAgICAnQ291bGQgbm90IGRlbGV0ZSBmaWxlLidcbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICB9KTtcbiAgfVxufVxuXG5mdW5jdGlvbiBpc0ZpbGVTdHJlYW1hYmxlKHJlcSwgZmlsZXNDb250cm9sbGVyKSB7XG4gIHJldHVybiAoXG4gICAgcmVxLmdldCgnUmFuZ2UnKSAmJlxuICAgIHR5cGVvZiBmaWxlc0NvbnRyb2xsZXIuYWRhcHRlci5oYW5kbGVGaWxlU3RyZWFtID09PSAnZnVuY3Rpb24nXG4gICk7XG59XG4iXX0=