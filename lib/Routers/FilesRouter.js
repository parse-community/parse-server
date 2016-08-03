'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FilesRouter = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _bodyParser = require('body-parser');

var _bodyParser2 = _interopRequireDefault(_bodyParser);

var _middlewares = require('../middlewares');

var Middlewares = _interopRequireWildcard(_middlewares);

var _cryptoUtils = require('../cryptoUtils');

var _Config = require('../Config');

var _Config2 = _interopRequireDefault(_Config);

var _mime = require('mime');

var _mime2 = _interopRequireDefault(_mime);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var FilesRouter = exports.FilesRouter = function () {
  function FilesRouter() {
    _classCallCheck(this, FilesRouter);
  }

  _createClass(FilesRouter, [{
    key: 'getExpressRouter',
    value: function getExpressRouter() {
      var options = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

      var router = _express2.default.Router();
      router.get('/files/:appId/:filename', this.getHandler);

      router.post('/files', function (req, res, next) {
        next(new Parse.Error(Parse.Error.INVALID_FILE_NAME, 'Filename not provided.'));
      });

      router.post('/files/:filename', Middlewares.allowCrossDomain, _bodyParser2.default.raw({ type: function type() {
          return true;
        }, limit: options.maxUploadSize || '20mb' }), // Allow uploads without Content-Type, or with any Content-Type.
      Middlewares.handleParseHeaders, this.createHandler);

      router.delete('/files/:filename', Middlewares.allowCrossDomain, Middlewares.handleParseHeaders, Middlewares.enforceMasterKeyAccess, this.deleteHandler);
      return router;
    }
  }, {
    key: 'getHandler',
    value: function getHandler(req, res) {
      var config = new _Config2.default(req.params.appId);
      var filesController = config.filesController;
      var filename = req.params.filename;
      filesController.getFileData(config, filename).then(function (data) {
        res.status(200);
        var contentType = _mime2.default.lookup(filename);
        res.set('Content-Type', contentType);
        res.end(data);
      }).catch(function (err) {
        res.status(404);
        res.set('Content-Type', 'text/plain');
        res.end('File not found.');
      });
    }
  }, {
    key: 'createHandler',
    value: function createHandler(req, res, next) {
      if (!req.body || !req.body.length) {
        next(new Parse.Error(Parse.Error.FILE_SAVE_ERROR, 'Invalid file upload.'));
        return;
      }

      if (req.params.filename.length > 128) {
        next(new Parse.Error(Parse.Error.INVALID_FILE_NAME, 'Filename too long.'));
        return;
      }

      if (!req.params.filename.match(/^[_a-zA-Z0-9][a-zA-Z0-9@\.\ ~_-]*$/)) {
        next(new Parse.Error(Parse.Error.INVALID_FILE_NAME, 'Filename contains invalid characters.'));
        return;
      }

      var filename = req.params.filename;
      var contentType = req.get('Content-type');
      var config = req.config;
      var filesController = config.filesController;

      filesController.createFile(config, filename, req.body, contentType).then(function (result) {
        res.status(201);
        res.set('Location', result.url);
        res.json(result);
      }).catch(function (err) {
        next(new Parse.Error(Parse.Error.FILE_SAVE_ERROR, 'Could not store file.'));
      });
    }
  }, {
    key: 'deleteHandler',
    value: function deleteHandler(req, res, next) {
      var filesController = req.config.filesController;
      filesController.deleteFile(req.config, req.params.filename).then(function () {
        res.status(200);
        // TODO: return useful JSON here?
        res.end();
      }).catch(function (error) {
        next(new Parse.Error(Parse.Error.FILE_DELETE_ERROR, 'Could not delete file.'));
      });
    }
  }]);

  return FilesRouter;
}();