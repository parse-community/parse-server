// FilesController.js

import express from 'express';
import mime from 'mime';
import { Parse } from 'parse/node';
import BodyParser from 'body-parser';
import * as Middlewares from '../middlewares';
import Config from '../Config';
import { randomHexString } from '../cryptoUtils';

export class FilesController {
  constructor(filesAdapter) {
    this._filesAdapter = filesAdapter;
  }

  static getHandler() {
     return (req, res) => {
       let config = new Config(req.params.appId);
       return config.filesController.getHandler()(req, res);
     }
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

  static createHandler() {
     return (req, res, next) => {
       let config = req.config;
       return config.filesController.createHandler()(req, res, next);
     }
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

      const filesController = req.config.filesController;
      // If a content-type is included, we'll add an extension so we can
      // return the same content-type.
      let extension = '';
      let hasExtension = req.params.filename.indexOf('.') > 0;
      let contentType = req.get('Content-type');
      if (!hasExtension && contentType && mime.extension(contentType)) {
        extension = '.' + mime.extension(contentType);
      }

      let filename = randomHexString(32) + '_' + req.params.filename + extension;
      filesController._filesAdapter.createFile(req.config, filename, req.body).then(() => {
        res.status(201);
        var location = filesController._filesAdapter.getFileLocation(req.config, filename);
        res.set('Location', location);
        res.json({ url: location, name: filename });
      }).catch((error) => {
        next(new Parse.Error(Parse.Error.FILE_SAVE_ERROR,
          'Could not store file.'));
      });
    };
  }

  static deleteHandler() {
     return (req, res, next) => {
       let config = req.config;
       return config.filesController.deleteHandler()(req, res, next);
     }
  }

  deleteHandler() {
    return (req, res, next) => {
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

  static getExpressRouter() {
    let router = express.Router();
    router.get('/files/:appId/:filename', FilesController.getHandler());

    router.post('/files', function(req, res, next) {
      next(new Parse.Error(Parse.Error.INVALID_FILE_NAME,
        'Filename not provided.'));
    });

    router.post('/files/:filename',
      Middlewares.allowCrossDomain,
      BodyParser.raw({type: '*/*', limit: '20mb'}),
      Middlewares.handleParseHeaders,
      FilesController.createHandler()
    );

    router.delete('/files/:filename',
      Middlewares.allowCrossDomain,
      Middlewares.handleParseHeaders,
      Middlewares.enforceMasterKeyAccess,
      FilesController.deleteHandler()
    );

    return router;
  }
}

export default FilesController;
