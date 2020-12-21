import express from 'express';
import BodyParser from 'body-parser';
import * as Middlewares from '../middlewares';
import Parse from 'parse/node';
import Config from '../Config';
import mime from 'mime';
import logger from '../logger';
import { randomString } from '../cryptoUtils';
const triggers = require('../triggers');
const http = require('http');

const downloadFileFromURI = uri => {
  return new Promise((res, rej) => {
    http
      .get(uri, response => {
        response.setDefaultEncoding('base64');
        let body = `data:${response.headers['content-type']};base64,`;
        response.on('data', data => (body += data));
        response.on('end', () => res(body));
      })
      .on('error', e => {
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

const createFileData = async (fileObject, auth) => {
  const fileData = new Parse.Object('_File');
  fileData.set('file', fileObject.file);
  fileData.set('ACL', fileObject._ACL || { '*': { read: true } });

  const url = fileObject.file._url.split('?');
  let appendToken = '';
  if (url.length > 1) {
    appendToken = `${url[1]}&`;
  }
  const token = randomString(25);
  appendToken += `token=${token}`;
  const fileURL = `${url[0]}?${appendToken}`;
  fileObject.file._url = fileURL;
  const expiry = new Date(new Date().getTime() + 30 * 60000);

  const fileToken = new Parse.Object('_FileToken');
  fileToken.set('fileObject', fileData);
  fileToken.set('file', fileObject.file);
  fileToken.set('token', token);
  fileToken.set('expiry', expiry);
  if (auth && auth.user) {
    fileToken.set('user', auth.user);
  }
  if (auth && auth.master) {
    fileToken.set('master', true);
  }
  await Parse.Object.saveAll([fileData, fileToken], { useMasterKey: true });
  return fileURL;
};

export class FilesRouter {
  expressRouter({ maxUploadSize = '20Mb' } = {}) {
    var router = express.Router();
    router.get('/files/:appId/:filename', this.getHandler);
    router.get('/files/:appId/metadata/:filename', this.metadataHandler);

    router.post('/files', function (req, res, next) {
      next(new Parse.Error(Parse.Error.INVALID_FILE_NAME, 'Filename not provided.'));
    });

    router.post(
      '/files/:filename',
      BodyParser.raw({
        type: () => {
          return true;
        },
        limit: maxUploadSize,
      }), // Allow uploads without Content-Type, or with any Content-Type.
      Middlewares.handleParseHeaders,
      this.createHandler
    );

    router.delete(
      '/files/:filename',
      Middlewares.handleParseHeaders,
      Middlewares.enforceMasterKeyAccess,
      this.deleteHandler
    );
    return router;
  }

  async getHandler(req, res) {
    const config = Config.get(req.params.appId);
    const filesController = config.filesController;
    let filename = req.params.filename;
    const file = new Parse.File(filename);
    file._url = filesController.adapter.getFileLocation(config, filename);

    const fileQuery = new Parse.Query('_FileToken');
    fileQuery.equalTo('file', file);
    fileQuery.equalTo('token', req.query.token);
    fileQuery.greaterThan('expiry', new Date());
    fileQuery.include('user');
    const fileToken = await fileQuery.first({ useMasterKey: true });
    if (!fileToken || !fileToken.get('fileObject')) {
      // token does not exist or has expired.
      res.status(404);
      res.set('Content-Type', 'text/plain');
      res.end('File not found.');
      return;
    }
    const user = fileToken.get('user');
    let fileObject = fileToken.get('fileObject');
    try {
      const fetchData = {};
      if (user && user.getSessionToken()) {
        fetchData.sessionToken = user.getSessionToken();
      }
      if (fileToken.get('master')) {
        fetchData.useMasterKey = true;
      }
      fileObject = await fileToken.get('fileObject').fetch(fetchData);
    } catch (e) {
      // if not found, you cannot view the file.
      res.status(404);
      res.set('Content-Type', 'text/plain');
      res.end('File not found.');
      return;
    }
    if (!fileObject) {
      fileObject = {
        ACL: { '*': { read: true } },
        references: [],
        file: {
          __type: 'File',
          name: filename,
        },
        tokens: [],
      };
    }
    const contentType = mime.getType(filename);
    if (isFileStreamable(req, filesController)) {
      filesController.handleFileStream(config, filename, req, res, contentType).catch(() => {
        res.status(404);
        res.set('Content-Type', 'text/plain');
        res.end('File not found.');
      });
    } else {
      try {
        const request = { user };
        if (fileToken.get('master')) {
          request.master = true;
        }
        const triggerResult = await triggers.maybeRunFileTrigger(
          triggers.Types.beforeFind,
          { file },
          config,
          request
        );
        let data;
        if (triggerResult instanceof Parse.File) {
          if (triggerResult._data) {
            data = Buffer.from(triggerResult._data, 'base64');
          } else if (triggerResult._name) {
            filename = triggerResult._name;
          }
        }
        if (!data) {
          data = await filesController.getFileData(config, filename);
        }
        res.status(200);
        res.set('Content-Type', contentType);
        res.set('Content-Length', data.length);
        res.end(data);
        try {
          await triggers.maybeRunFileTrigger(triggers.Types.afterFind, { file }, config, { user });
        } catch (e) {
          /* */
        }
      } catch (e) {
        res.status(404);
        res.set('Content-Type', 'text/plain');
        res.end((e && e.message) || e || 'File not found.');
      }
    }
  }

  async createHandler(req, res, next) {
    const config = req.config;
    const user = req.auth.user;
    const isMaster = req.auth.isMaster;
    const isLinked = user && Parse.AnonymousUtils.isLinked(user);
    if (!isMaster && !config.fileUpload.enableForAnonymousUser && isLinked) {
      next(
        new Parse.Error(Parse.Error.FILE_SAVE_ERROR, 'File upload by anonymous user is disabled.')
      );
      return;
    }
    if (!isMaster && !config.fileUpload.enableForAuthenticatedUser && !isLinked && user) {
      next(
        new Parse.Error(
          Parse.Error.FILE_SAVE_ERROR,
          'File upload by authenticated user is disabled.'
        )
      );
      return;
    }
    if (!isMaster && !config.fileUpload.enableForPublic && !user) {
      next(new Parse.Error(Parse.Error.FILE_SAVE_ERROR, 'File upload by public is disabled.'));
      return;
    }

    const schema = await config.database.loadSchema();
    // CLP for _File always returns {}, even though I thought I set default CLP in SchemaController.js line 694
    const schemaPerms = schema.testPermissionsForClassName(
      '_File',
      [req.auth.user && req.auth.user.id],
      'create'
    );
    if (!schemaPerms) {
      next(
        new Parse.Error(Parse.Error.FILE_SAVE_ERROR, 'You are not authorized to upload a file.')
      );
      return;
    }
    const filesController = config.filesController;
    const { filename } = req.params;
    const contentType = req.get('Content-type');

    if (!req.body || !req.body.length) {
      next(new Parse.Error(Parse.Error.FILE_SAVE_ERROR, 'Invalid file upload.'));
      return;
    }
    const error = filesController.validateFilename(filename);
    if (error) {
      next(error);
      return;
    }
    const base64 = req.body.toString('base64');
    const file = new Parse.File(filename, { base64 }, contentType);
    const { metadata = {}, tags = {} } = req.fileData || {};
    const acl = tags.acl;
    delete tags.acl;
    file.setTags(tags);
    file.setMetadata(metadata);
    const fileSize = Buffer.byteLength(req.body);
    const fileObject = { file, fileSize };
    try {
      // run beforeSaveFile trigger
      const triggerResult = await triggers.maybeRunFileTrigger(
        triggers.Types.beforeSaveFile,
        fileObject,
        config,
        req.auth
      );
      let saveResult;
      // if a new ParseFile is returned check if it's an already saved file
      if (triggerResult instanceof Parse.File) {
        fileObject.file = triggerResult;
        if (triggerResult.url()) {
          // set fileSize to null because we wont know how big it is here
          fileObject.fileSize = null;
          saveResult = {
            url: triggerResult.url(),
            name: triggerResult._name,
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
        // save file
        const createFileResult = await filesController.createFile(
          config,
          fileObject.file._name,
          bufferData,
          fileObject.file._source.type,
          {
            tags: fileObject.file._tags,
            metadata: fileObject.file._metadata,
          }
        );
        // update file with new data
        fileObject.file._name = createFileResult.name;
        fileObject.file._url = createFileResult.url;
        fileObject.file._requestTask = null;
        fileObject.file._previousSave = Promise.resolve(fileObject.file);
        saveResult = {
          url: createFileResult.url,
          name: createFileResult.name,
        };
      }
      fileObject._ACL = acl;
      try {
        const fileTokenURL = await createFileData(fileObject, req.auth);
        saveResult.url = fileTokenURL;
      } catch (e) {
        /* */
      }
      await triggers.maybeRunFileTrigger(
        triggers.Types.afterSaveFile,
        fileObject,
        config,
        req.auth
      );
      res.status(201);
      res.set('Location', saveResult.url);
      res.json(saveResult);
    } catch (e) {
      logger.error('Error creating a file: ', e);
      const error = triggers.resolveError(e, {
        code: Parse.Error.FILE_SAVE_ERROR,
        message: `Could not store file: ${fileObject.file._name}.`,
      });
      next(error);
    }
  }
  async deleteHandler(req, res, next) {
    try {
      const { filesController, database } = req.config;
      const { filename } = req.params;
      // run beforeDeleteFile trigger
      const file = new Parse.File(filename);
      file._url = filesController.adapter.getFileLocation(req.config, filename);
      const fileObject = { file, fileSize: null };
      await triggers.maybeRunFileTrigger(
        triggers.Types.beforeDeleteFile,
        fileObject,
        req.config,
        req.auth
      );
      // delete file
      await filesController.deleteFile(req.config, filename);
      try {
        await database.destroy('_File', {
          file: file.toJSON(),
        });
      } catch (e) {
        /**/
      }
      // run afterDeleteFile trigger
      await triggers.maybeRunFileTrigger(
        triggers.Types.afterDeleteFile,
        fileObject,
        req.config,
        req.auth
      );
      res.status(200);
      // TODO: return useful JSON here?
      res.end();
    } catch (e) {
      logger.error('Error deleting a file: ', e);
      const error = triggers.resolveError(e, {
        code: Parse.Error.FILE_DELETE_ERROR,
        message: 'Could not delete file.',
      });
      next(error);
    }
  }

  async metadataHandler(req, res) {
    const config = Config.get(req.params.appId);
    const { filesController } = config;
    const { filename } = req.params;
    try {
      const data = await filesController.getMetadata(filename);
      res.status(200);
      res.json(data);
    } catch (e) {
      res.status(200);
      res.json({});
    }
  }
}

function isFileStreamable(req, filesController) {
  return req.get('Range') && typeof filesController.adapter.handleFileStream === 'function';
}
