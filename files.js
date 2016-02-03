// files.js

var bodyParser = require('body-parser'),
    Config = require('./Config'),
    express = require('express'),
    FilesAdapter = require('./FilesAdapter'),
    middlewares = require('./middlewares.js'),
    mime = require('mime'),
    Parse = require('parse/node').Parse,
    rack = require('hat').rack();

var router = express.Router();

var processCreate = function(req, res, next) {
  if (!req.body || !req.body.length) {
    next(new Parse.Error(Parse.Error.FILE_SAVE_ERROR,
         'Invalid file upload.'));
    return;
  }

  if (req.params.filename.length > 128) {
    next(new Parse.Error(Parse.Error.INVALID_FILE_NAME,
         'Filename too long.'));
    return;
  }

  if (!req.params.filename.match(/^[_a-zA-Z0-9][a-zA-Z0-9@\.\ ~_-]*$/)) {
    next(new Parse.Error(Parse.Error.INVALID_FILE_NAME,
         'Filename contains invalid characters.'));
    return;
  }

  // If a content-type is included, we'll add an extension so we can
  // return the same content-type.
  var extension = '';
  var hasExtension = req.params.filename.indexOf('.') > 0;
  var contentType = req.get('Content-type');
  if (!hasExtension && contentType && mime.extension(contentType)) {
    extension = '.' + mime.extension(contentType);
  }

  var filename = rack() + '_' + req.params.filename + extension;
  FilesAdapter.getAdapter().create(req.config, filename, req.body)
  .then(() => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "*");
    res.header("Access-Control-Allow-Headers", "*");
    res.status(201);
    var location = FilesAdapter.getAdapter().location(req.config, req, filename);
    res.set('Location', location);
    res.json({ url: location, name: filename });
  }).catch((error) => {
    next(new Parse.Error(Parse.Error.FILE_SAVE_ERROR,
                         'Could not store file.'));
  });
};

var processGet = function(req, res) {
  var config = new Config(req.params.appId);
  FilesAdapter.getAdapter().get(config, req.params.filename)
  .then((data) => {
    res.status(200);
    var contentType = mime.lookup(req.params.filename);
    res.set('Content-type', contentType);
    res.end(data);
  }).catch((error) => {
    res.status(404);
    res.set('Content-type', 'text/plain');
    res.end('File not found.');
  });
};

router.get('/files/:appId/:filename', processGet);

router.post('/files', function(req, res, next) {
  next(new Parse.Error(Parse.Error.INVALID_FILE_NAME,
                       'Filename not provided.'));
});

router.post('/files/:filename',
            middlewares.allowCrossDomain,
            bodyParser.raw({type: '*/*', limit: '20mb'}),
            middlewares.handleParseHeaders,
            processCreate);

module.exports = {
  router: router
};
