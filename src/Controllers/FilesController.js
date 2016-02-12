// FilesController.js

import express from 'express';
import mime from 'mime';
import { Parse } from 'parse/node';
import BodyParser from 'body-parser';
import hat from 'hat';
import * as Middlewares from '../middlewares';
import Config from '../Config';

const rack = hat.rack();

export class FilesController {
  constructor(filesAdapter) {
    this._filesAdapter = filesAdapter;
  }

  getHandler() {
    return (req, res) => {
      let config = new Config(req.params.appId);
      let filename = req.params.filename;
      this._filesAdapter.getFileData(config, filename).then((data) => {
        res.status(200);
        var contentType = mime.lookup(filename);
        res.set('Content-type', contentType);
        res.end(data);
      }).catch((error) => {
        res.status(404);
        res.set('Content-type', 'text/plain');
        res.end('File not found.');
      });
    };
  }

  createHandler() {
    return (req, res, next) => {
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
      let extension = '';
      let hasExtension = req.params.filename.indexOf('.') > 0;
      let contentType = req.get('Content-type');
      if (!hasExtension && contentType && mime.extension(contentType)) {
        extension = '.' + mime.extension(contentType);
      }

      let filename = rack() + '_' + req.params.filename + extension;
      this._filesAdapter.createFile(req.config, filename, req.body).then(() => {
        res.status(201);
        var location = this._filesAdapter.getFileLocation(req.config, filename);
        res.set('Location', location);
        res.json({ url: location, name: filename });
      }).catch((error) => {
        next(new Parse.Error(Parse.Error.FILE_SAVE_ERROR,
          'Could not store file.'));
      });
    };
  }

  deleteHandler() {
    return (req, res, next) => {
      // enforce use of master key for file deletions
      if(!req.auth.isMaster){
        next(new Parse.Error(Parse.Error.OPERATION_FORBIDDEN,
          'Master key required for file deletion.'));
        return;
      }

      this._filesAdapter.deleteFile(req.config, req.params.filename).then(() => {
        res.status(200);
        // TODO: return useful JSON here?
        res.end();
      }).catch((error) => {
        next(new Parse.Error(Parse.Error.FILE_DELETE_ERROR,
          'Could not delete file.'));
      });
    };
  }

  /**
   * Find file references in REST-format object and adds the url key
   * with the current mount point and app id.
   * Object may be a single object or list of REST-format objects.
   */
  expandFilesInObject(config, object) {
    if (object instanceof Array) {
      object.map((obj) => this.expandFilesInObject(config, obj));
      return;
    }
    if (typeof object !== 'object') {
      return;
    }
    for (let key in object) {
      let fileObject = object[key];
      if (fileObject && fileObject['__type'] === 'File') {
        if (fileObject['url']) {
          continue;
        }
        let filename = fileObject['name'];
        if (filename.indexOf('tfss-') === 0) {
          fileObject['url'] = 'http://files.parsetfss.com/' + config.fileKey + '/' + encodeURIComponent(filename);
        } else {
          fileObject['url'] = this._filesAdapter.getFileLocation(config, filename);
        }
      }
    }
  }

  getExpressRouter() {
    let router = express.Router();
    router.get('/files/:appId/:filename', this.getHandler());

    router.post('/files', function(req, res, next) {
      next(new Parse.Error(Parse.Error.INVALID_FILE_NAME,
        'Filename not provided.'));
    });

    router.post('/files/:filename',
      Middlewares.allowCrossDomain,
      BodyParser.raw({type: '*/*', limit: '20mb'}),
      Middlewares.handleParseHeaders,
      this.createHandler()
    );

    router.delete('/files/:filename',
      Middlewares.allowCrossDomain,
      Middlewares.handleParseHeaders,
      this.deleteHandler()
    );

    return router;
  }
}

export default FilesController;
