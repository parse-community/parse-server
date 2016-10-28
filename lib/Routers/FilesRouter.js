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
    key: 'expressRouter',
    value: function expressRouter() {
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
      var contentType = _mime2.default.lookup(filename);
      if (isFileStreamable(req, filesController)) {
        filesController.getFileStream(config, filename).then(function (stream) {
          handleFileStream(stream, req, res, contentType);
        }).catch(function (err) {
          res.status(404);
          res.set('Content-Type', 'text/plain');
          res.end('File not found.');
        });
      } else {
        filesController.getFileData(config, filename).then(function (data) {
          res.status(200);
          res.set('Content-Type', contentType);
          res.set('Content-Length', data.length);
          res.end(data);
        }).catch(function (err) {
          res.status(404);
          res.set('Content-Type', 'text/plain');
          res.end('File not found.');
        });
      }
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

function isFileStreamable(req, filesController) {
  if (req.get('Range')) {
    if (!(typeof filesController.adapter.getFileStream === 'function')) {
      return false;
    }
    if (typeof filesController.adapter.constructor.name !== 'undefined') {
      if (filesController.adapter.constructor.name == 'GridStoreAdapter') {
        return true;
      }
    }
  }
  return false;
}

// handleFileStream is licenced under Creative Commons Attribution 4.0 International License (https://creativecommons.org/licenses/by/4.0/).
// Author: LEROIB at weightingformypizza (https://weightingformypizza.wordpress.com/2015/06/24/stream-html5-media-content-like-video-audio-from-mongodb-using-express-and-gridstore/).
function handleFileStream(stream, req, res, contentType) {
  var buffer_size = 1024 * 1024; //1024Kb
  // Range request, partiall stream the file
  var parts = req.get('Range').replace(/bytes=/, "").split("-");
  var partialstart = parts[0];
  var partialend = parts[1];
  var start = partialstart ? parseInt(partialstart, 10) : 0;
  var end = partialend ? parseInt(partialend, 10) : stream.length - 1;
  var chunksize = end - start + 1;

  if (chunksize == 1) {
    start = 0;
    partialend = false;
  }

  if (!partialend) {
    if (stream.length - 1 - start < buffer_size) {
      end = stream.length - 1;
    } else {
      end = start + buffer_size;
    }
    chunksize = end - start + 1;
  }

  if (start == 0 && end == 2) {
    chunksize = 1;
  }

  res.writeHead(206, {
    'Content-Range': 'bytes ' + start + '-' + end + '/' + stream.length,
    'Accept-Ranges': 'bytes',
    'Content-Length': chunksize,
    'Content-Type': contentType
  });

  stream.seek(start, function () {
    // get gridFile stream
    var gridFileStream = stream.stream(true);
    var ended = false;
    var bufferIdx = 0;
    var bufferAvail = 0;
    var range = end - start + 1;
    var totalbyteswanted = end - start + 1;
    var totalbyteswritten = 0;
    // write to response
    gridFileStream.on('data', function (buff) {
      bufferAvail += buff.length;
      //Ok check if we have enough to cover our range
      if (bufferAvail < range) {
        //Not enough bytes to satisfy our full range
        if (bufferAvail > 0) {
          //Write full buffer
          res.write(buff);
          totalbyteswritten += buff.length;
          range -= buff.length;
          bufferIdx += buff.length;
          bufferAvail -= buff.length;
        }
      } else {
        //Enough bytes to satisfy our full range!
        if (bufferAvail > 0) {
          var buffer = buff.slice(0, range);
          res.write(buffer);
          totalbyteswritten += buffer.length;
          bufferIdx += range;
          bufferAvail -= range;
        }
      }
      if (totalbyteswritten >= totalbyteswanted) {
        //totalbytes = 0;
        stream.close();
        res.end();
        this.destroy();
      }
    });
  });
}