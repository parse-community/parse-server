'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FilesRouter = undefined;

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _bodyParser = require('body-parser');

var _bodyParser2 = _interopRequireDefault(_bodyParser);

var _middlewares = require('../middlewares');

var Middlewares = _interopRequireWildcard(_middlewares);

var _node = require('parse/node');

var _node2 = _interopRequireDefault(_node);

var _Config = require('../Config');

var _Config2 = _interopRequireDefault(_Config);

var _mime = require('mime');

var _mime2 = _interopRequireDefault(_mime);

var _logger = require('../logger');

var _logger2 = _interopRequireDefault(_logger);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class FilesRouter {

  expressRouter({ maxUploadSize = '20Mb' } = {}) {
    var router = _express2.default.Router();
    router.get('/files/:appId/:filename', this.getHandler);

    router.post('/files', function (req, res, next) {
      next(new _node2.default.Error(_node2.default.Error.INVALID_FILE_NAME, 'Filename not provided.'));
    });

    router.post('/files/:filename', Middlewares.allowCrossDomain, _bodyParser2.default.raw({ type: () => {
        return true;
      }, limit: maxUploadSize }), // Allow uploads without Content-Type, or with any Content-Type.
    Middlewares.handleParseHeaders, this.createHandler);

    router.delete('/files/:filename', Middlewares.allowCrossDomain, Middlewares.handleParseHeaders, Middlewares.enforceMasterKeyAccess, this.deleteHandler);
    return router;
  }

  getHandler(req, res) {
    const config = _Config2.default.get(req.params.appId);
    const filesController = config.filesController;
    const filename = req.params.filename;
    const contentType = _mime2.default.getType(filename);
    if (isFileStreamable(req, filesController)) {
      filesController.getFileStream(config, filename).then(stream => {
        handleFileStream(stream, req, res, contentType);
      }).catch(() => {
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
    if (!req.body || !req.body.length) {
      next(new _node2.default.Error(_node2.default.Error.FILE_SAVE_ERROR, 'Invalid file upload.'));
      return;
    }

    if (req.params.filename.length > 128) {
      next(new _node2.default.Error(_node2.default.Error.INVALID_FILE_NAME, 'Filename too long.'));
      return;
    }

    if (!req.params.filename.match(/^[_a-zA-Z0-9][a-zA-Z0-9@\.\ ~_-]*$/)) {
      next(new _node2.default.Error(_node2.default.Error.INVALID_FILE_NAME, 'Filename contains invalid characters.'));
      return;
    }

    const filename = req.params.filename;
    const contentType = req.get('Content-type');
    const config = req.config;
    const filesController = config.filesController;

    filesController.createFile(config, filename, req.body, contentType).then(result => {
      res.status(201);
      res.set('Location', result.url);
      res.json(result);
    }).catch(e => {
      _logger2.default.error(e.message, e);
      next(new _node2.default.Error(_node2.default.Error.FILE_SAVE_ERROR, 'Could not store file.'));
    });
  }

  deleteHandler(req, res, next) {
    const filesController = req.config.filesController;
    filesController.deleteFile(req.config, req.params.filename).then(() => {
      res.status(200);
      // TODO: return useful JSON here?
      res.end();
    }).catch(() => {
      next(new _node2.default.Error(_node2.default.Error.FILE_DELETE_ERROR, 'Could not delete file.'));
    });
  }
}

exports.FilesRouter = FilesRouter;
function isFileStreamable(req, filesController) {
  return req.get('Range') && typeof filesController.adapter.getFileStream === 'function';
}

function getRange(req) {
  const parts = req.get('Range').replace(/bytes=/, "").split("-");
  return { start: parseInt(parts[0], 10), end: parseInt(parts[1], 10) };
}

// handleFileStream is licenced under Creative Commons Attribution 4.0 International License (https://creativecommons.org/licenses/by/4.0/).
// Author: LEROIB at weightingformypizza (https://weightingformypizza.wordpress.com/2015/06/24/stream-html5-media-content-like-video-audio-from-mongodb-using-express-and-gridstore/).
function handleFileStream(stream, req, res, contentType) {
  const buffer_size = 1024 * 1024; //1024Kb
  // Range request, partiall stream the file
  let {
    start, end
  } = getRange(req);

  const notEnded = !end && end !== 0;
  const notStarted = !start && start !== 0;
  // No end provided, we want all bytes
  if (notEnded) {
    end = stream.length - 1;
  }
  // No start provided, we're reading backwards
  if (notStarted) {
    start = stream.length - end;
    end = start + end - 1;
  }

  // Data exceeds the buffer_size, cap
  if (end - start >= buffer_size) {
    end = start + buffer_size - 1;
  }

  const contentLength = end - start + 1;

  res.writeHead(206, {
    'Content-Range': 'bytes ' + start + '-' + end + '/' + stream.length,
    'Accept-Ranges': 'bytes',
    'Content-Length': contentLength,
    'Content-Type': contentType
  });

  stream.seek(start, function () {
    // get gridFile stream
    const gridFileStream = stream.stream(true);
    let bufferAvail = 0;
    let remainingBytesToWrite = contentLength;
    let totalBytesWritten = 0;
    // write to response
    gridFileStream.on('data', function (data) {
      bufferAvail += data.length;
      if (bufferAvail > 0) {
        // slice returns the same buffer if overflowing
        // safe to call in any case
        const buffer = data.slice(0, remainingBytesToWrite);
        // write the buffer
        res.write(buffer);
        // increment total
        totalBytesWritten += buffer.length;
        // decrement remaining
        remainingBytesToWrite -= data.length;
        // decrement the avaialbe buffer
        bufferAvail -= buffer.length;
      }
      // in case of small slices, all values will be good at that point
      // we've written enough, end...
      if (totalBytesWritten >= contentLength) {
        stream.close();
        res.end();
        this.destroy();
      }
    });
  });
}