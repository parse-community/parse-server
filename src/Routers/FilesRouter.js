import express from 'express';
import * as Middlewares from '../middlewares';
import Parse from 'parse/node';
import Config from '../Config';
import logger from '../logger';
const triggers = require('../triggers');
const Utils = require('../Utils');
import { Readable } from 'stream';
import { createSanitizedHttpError } from '../Error';

/**
 * Wraps a readable stream in a Readable that enforces a byte size limit.
 * Data flow is lazy: the source is not read until a consumer starts reading
 * from the returned stream (via pipe or 'data' listener). This ensures the
 * consumer's error listener is attached before any data (or error) is emitted.
 */
export function createSizeLimitedStream(source, maxBytes) {
  let totalBytes = 0;
  let started = false;
  let sourceEnded = false;
  let onData, onEnd, onError;

  const output = new Readable({
    read() {
      if (!started) {
        started = true;

        onData = (chunk) => {
          totalBytes += chunk.length;
          if (totalBytes > maxBytes) {
            output.destroy(
              new Parse.Error(
                Parse.Error.FILE_SAVE_ERROR,
                `File size exceeds maximum allowed: ${maxBytes} bytes.`
              )
            );
            return;
          }
          if (!output.push(chunk)) {
            source.pause();
          }
        };

        onEnd = () => {
          sourceEnded = true;
          output.push(null);
        };

        onError = (err) => output.destroy(err);

        source.on('data', onData);
        source.on('end', onEnd);
        source.on('error', onError);
      }

      // Resume source in case it was paused due to backpressure
      if (!sourceEnded) {
        source.resume();
      }
    },
    destroy(err, callback) {
      if (onData) {
        source.removeListener('data', onData);
      }
      if (onEnd) {
        source.removeListener('end', onEnd);
      }
      if (onError) {
        source.removeListener('error', onError);
      }
      // Suppress errors emitted during drain (e.g. client disconnect)
      source.on('error', () => {});
      if (!sourceEnded) {
        source.resume();
      }
      callback(err);
    }
  });

  return output;
}

// Segments that conflict with sub-routes under GET /files/:appId/*. If a file
// directory starts with one of these, its URL would match the wrong route
// handler. Update this list when adding new sub-routes to expressRouter().
export const RESERVED_DIRECTORY_SEGMENTS = ['metadata'];

export class FilesRouter {
  expressRouter({ maxUploadSize = '20Mb' } = {}) {
    var router = express.Router();
    // Metadata route must come before the catch-all GET route
    router.get('/files/:appId/metadata/*filepath', this.metadataHandler);
    router.get('/files/:appId/*filepath', this.getHandler);

    router.post('/files', function (req, res, next) {
      next(new Parse.Error(Parse.Error.INVALID_FILE_NAME, 'Filename not provided.'));
    });

    router.post(
      '/files/:filename',
      this._earlyHeadersMiddleware(),
      this._bodyParsingMiddleware(maxUploadSize),
      Middlewares.handleParseHeaders,
      Middlewares.handleParseSession,
      this.createHandler.bind(this)
    );

    router.delete(
      '/files/*filepath',
      Middlewares.handleParseHeaders,
      Middlewares.handleParseSession,
      Middlewares.enforceMasterKeyAccess,
      this.deleteHandler
    );
    return router;
  }

  static _getFilenameFromParams(req) {
    const parts = req.params.filepath;
    return Array.isArray(parts) ? parts.join('/') : parts;
  }

  static validateDirectory(directory) {
    if (typeof directory !== 'string') {
      return new Parse.Error(Parse.Error.INVALID_FILE_NAME, 'Directory must be a string.');
    }
    if (directory.length === 0) {
      return new Parse.Error(Parse.Error.INVALID_FILE_NAME, 'Directory must not be empty.');
    }
    if (directory.length > 256) {
      return new Parse.Error(Parse.Error.INVALID_FILE_NAME, 'Directory path is too long.');
    }
    if (directory.includes('..')) {
      return new Parse.Error(Parse.Error.INVALID_FILE_NAME, 'Directory must not contain "..".');
    }
    if (directory.startsWith('/') || directory.endsWith('/')) {
      return new Parse.Error(
        Parse.Error.INVALID_FILE_NAME,
        'Directory must not start or end with "/".'
      );
    }
    if (directory.includes('//')) {
      return new Parse.Error(
        Parse.Error.INVALID_FILE_NAME,
        'Directory must not contain consecutive slashes.'
      );
    }
    const firstSegment = directory.split('/')[0];
    if (RESERVED_DIRECTORY_SEGMENTS.includes(firstSegment)) {
      return new Parse.Error(
        Parse.Error.INVALID_FILE_NAME,
        `Directory must not start with reserved segment "${firstSegment}".`
      );
    }
    const dirRegex = /^[a-zA-Z0-9][a-zA-Z0-9_\-/]*$/;
    if (!dirRegex.test(directory)) {
      return new Parse.Error(
        Parse.Error.INVALID_FILE_NAME,
        'Directory contains invalid characters.'
      );
    }
    return null;
  }

  async getHandler(req, res) {
    const config = Config.get(req.params.appId);
    if (!config) {
      const error = createSanitizedHttpError(403, 'Invalid application ID.', config);
      res.status(error.status);
      res.json({ error: error.message });
      return;
    }

    let filename = FilesRouter._getFilenameFromParams(req);
    try {
      const filesController = config.filesController;
      const mime = (await import('mime')).default;
      let contentType = mime.getType(filename);
      let file = new Parse.File(filename, { base64: '' }, contentType);
      const triggerResult = await triggers.maybeRunFileTrigger(
        triggers.Types.beforeFind,
        { file },
        config,
        req.auth
      );
      if (triggerResult?.file?._name) {
        filename = triggerResult?.file?._name;
        contentType = mime.getType(filename);
      }

      const defaultResponseHeaders = { 'X-Content-Type-Options': 'nosniff' };

      if (isFileStreamable(req, filesController)) {
        for (const [key, value] of Object.entries(defaultResponseHeaders)) {
          res.set(key, value);
        }
        filesController.handleFileStream(config, filename, req, res, contentType).catch(() => {
          res.status(404);
          res.set('Content-Type', 'text/plain');
          res.end('File not found.');
        });
        return;
      }

      let data = await filesController.getFileData(config, filename).catch(() => {
        res.status(404);
        res.set('Content-Type', 'text/plain');
        res.end('File not found.');
      });
      if (!data) {
        return;
      }
      file = new Parse.File(filename, { base64: data.toString('base64') }, contentType);
      const afterFind = await triggers.maybeRunFileTrigger(
        triggers.Types.afterFind,
        { file, forceDownload: false, responseHeaders: { ...defaultResponseHeaders } },
        config,
        req.auth
      );

      if (afterFind?.file) {
        contentType = mime.getType(afterFind.file._name);
        data = Buffer.from(afterFind.file._data, 'base64');
      }

      res.status(200);
      res.set('Content-Type', contentType);
      res.set('Content-Length', data.length);
      if (afterFind.forceDownload) {
        res.set('Content-Disposition', `attachment;filename=${afterFind.file._name}`);
      }
      if (afterFind.responseHeaders) {
        for (const [key, value] of Object.entries(afterFind.responseHeaders)) {
          res.set(key, value);
        }
      }
      res.end(data);
    } catch (e) {
      const err = triggers.resolveError(e, {
        code: Parse.Error.SCRIPT_FAILED,
        message: `Could not find file: ${filename}.`,
      });
      res.status(403);
      res.json({ code: err.code, error: err.message });
    }
  }

  /**
   * Middleware that runs before body parsing to handle headers that must be
   * resolved before the request body is consumed. Currently supports:
   *
   * - `X-Parse-File-Max-Upload-Size`: Overrides the server-wide `maxUploadSize`
   *   for this request. Requires the master key. The value uses the same format
   *   as the server option (e.g. `'50mb'`, `'1gb'`). Sets `req._maxUploadSizeOverride`
   *   (in bytes) for `_bodyParsingMiddleware` to use.
   */
  _earlyHeadersMiddleware() {
    return async (req, res, next) => {
      const maxUploadSizeOverride = req.get('X-Parse-File-Max-Upload-Size');
      if (!maxUploadSizeOverride) {
        return next();
      }
      const appId = req.get('X-Parse-Application-Id');
      const config = Config.get(appId);
      if (!config) {
        const error = createSanitizedHttpError(403, 'Invalid application ID.', undefined);
        res.status(error.status);
        res.json({ error: error.message });
        return;
      }
      const masterKey = await config.loadMasterKey();
      if (req.get('X-Parse-Master-Key') !== masterKey) {
        const error = createSanitizedHttpError(403, 'unauthorized: master key is required', config);
        res.status(error.status);
        res.json({ error: error.message });
        return;
      }
      if (config.masterKeyIps?.length && !Middlewares.checkIp(req.ip, config.masterKeyIps, config.masterKeyIpsStore)) {
        const error = createSanitizedHttpError(403, 'unauthorized: master key is required', config);
        res.status(error.status);
        res.json({ error: error.message });
        return;
      }
      let parsedBytes;
      try {
        parsedBytes = Utils.parseSizeToBytes(maxUploadSizeOverride);
      } catch {
        return next(
          new Parse.Error(
            Parse.Error.FILE_SAVE_ERROR,
            `Invalid maxUploadSize override value: ${maxUploadSizeOverride}`
          )
        );
      }
      req._maxUploadSizeOverride = parsedBytes;
      next();
    };
  }

  _bodyParsingMiddleware(maxUploadSize) {
    const defaultMaxBytes = Utils.parseSizeToBytes(maxUploadSize);
    return (req, res, next) => {
      if (req.get('X-Parse-Upload-Mode') === 'stream') {
        req._maxUploadSizeBytes = req._maxUploadSizeOverride ?? defaultMaxBytes;
        return next();
      }
      const limit = req._maxUploadSizeOverride ?? maxUploadSize;
      return express.raw({ type: () => true, limit })(req, res, next);
    };
  }

  async createHandler(req, res, next) {
    if (req.auth.isReadOnly) {
      const error = createSanitizedHttpError(403, "read-only masterKey isn't allowed to create a file.", req.config);
      res.status(error.status);
      res.end(`{"error":"${error.message}"}`);
      return;
    }
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
    const filesController = config.filesController;
    const { filename } = req.params;
    const contentType = req.get('Content-type');

    const error = filesController.validateFilename(filename);
    if (error) {
      next(error);
      return;
    }

    const fileExtensions = config.fileUpload?.fileExtensions;
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
        extension = filename.substring(filename.lastIndexOf('.') + 1);
      } else if (contentType && contentType.includes('/')) {
        extension = contentType.split('/')[1];
      }
      extension = extension?.split(' ')?.join('');

      if (extension && !isValidExtension(extension)) {
        next(
          new Parse.Error(
            Parse.Error.FILE_SAVE_ERROR,
            `File upload of extension ${extension} is disabled.`
          )
        );
        return;
      }
    }

    // For streaming uploads, read file data from headers since the body is the raw stream
    if (req.get('X-Parse-Upload-Mode') === 'stream') {
      req.fileData = {};
      if (req.get('X-Parse-File-Directory')) {
        req.fileData.directory = req.get('X-Parse-File-Directory');
      }
      if (req.get('X-Parse-File-Metadata')) {
        try {
          const parsed = JSON.parse(req.get('X-Parse-File-Metadata'));
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error();
          }
          req.fileData.metadata = parsed;
        } catch {
          next(new Parse.Error(Parse.Error.INVALID_JSON, 'Invalid JSON in X-Parse-File-Metadata header.'));
          return;
        }
      }
      if (req.get('X-Parse-File-Tags')) {
        try {
          const parsed = JSON.parse(req.get('X-Parse-File-Tags'));
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error();
          }
          req.fileData.tags = parsed;
        } catch {
          next(new Parse.Error(Parse.Error.INVALID_JSON, 'Invalid JSON in X-Parse-File-Tags header.'));
          return;
        }
      }
    }

    // Validate directory option (requires master key)
    const directory = req.fileData?.directory;
    if (directory !== undefined) {
      if (!isMaster) {
        next(
          new Parse.Error(
            Parse.Error.OPERATION_FORBIDDEN,
            'Directory can only be set using the Master Key.'
          )
        );
        return;
      }
      const directoryError = FilesRouter.validateDirectory(directory);
      if (directoryError) {
        next(directoryError);
        return;
      }
    }

    // Dispatch to the appropriate handler based on whether the body was buffered
    if (req.body instanceof Buffer) {
      return this._handleBufferedUpload(req, res, next);
    }
    return this._handleStreamUpload(req, res, next);
  }

  async _handleBufferedUpload(req, res, next) {
    const config = req.config;
    const filesController = config.filesController;
    const { filename } = req.params;
    const contentType = req.get('Content-type');

    if (!req.body || !req.body.length) {
      next(new Parse.Error(Parse.Error.FILE_SAVE_ERROR, 'Invalid file upload.'));
      return;
    }

    const base64 = req.body.toString('base64');
    const file = new Parse.File(filename, { base64 }, contentType);
    const { metadata = {}, tags = {}, directory } = req.fileData || {};
    try {
      // Scan request data for denied keywords
      Utils.checkProhibitedKeywords(config, metadata);
      Utils.checkProhibitedKeywords(config, tags);
    } catch (error) {
      next(new Parse.Error(Parse.Error.INVALID_KEY_NAME, error));
      return;
    }
    file.setTags(tags);
    file.setMetadata(metadata);
    if (directory) {
      file.setDirectory(directory);
    }
    const fileSize = Buffer.byteLength(req.body);
    const fileObject = { file, fileSize };
    try {
      // run beforeSaveFile trigger
      const triggerResult = await triggers.maybeRunFileTrigger(
        triggers.Types.beforeSave,
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
        // update fileSize
        let bufferData;
        if (fileObject.file._source?.format === 'buffer') {
          bufferData = fileObject.file._source.buffer;
        } else {
          bufferData = Buffer.from(fileObject.file._data, 'base64');
        }
        fileObject.fileSize = Buffer.byteLength(bufferData);
        // prepare file options
        const fileOptions = {
          metadata: fileObject.file._metadata,
        };
        // some s3-compatible providers (DigitalOcean, Linode) do not accept tags
        // so we do not include the tags option if it is empty.
        const fileTags =
          Object.keys(fileObject.file._tags).length > 0 ? { tags: fileObject.file._tags } : {};
        Object.assign(fileOptions, fileTags);
        // include directory if set (from client request or beforeSaveFile trigger)
        if (fileObject.file._directory) {
          fileOptions.directory = fileObject.file._directory;
        }
        // save file
        const createFileResult = await filesController.createFile(
          config,
          fileObject.file._name,
          bufferData,
          fileObject.file._source.type,
          fileOptions
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
      // run afterSaveFile trigger
      await triggers.maybeRunFileTrigger(triggers.Types.afterSave, fileObject, config, req.auth);
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

  async _handleStreamUpload(req, res, next) {
    const config = req.config;
    const filesController = config.filesController;
    const { filename } = req.params;
    let contentType = req.get('Content-Type');
    const maxBytes = req._maxUploadSizeBytes;
    let stream;

    try {
      // Early rejection via Content-Length header
      const contentLength = req.get('Content-Length');
      if (contentLength && parseInt(contentLength, 10) > maxBytes) {
        req.resume();
        next(new Parse.Error(
          Parse.Error.FILE_SAVE_ERROR,
          `File size exceeds maximum allowed: ${maxBytes} bytes.`
        ));
        return;
      }

      const mime = (await import('mime')).default;

      // Infer content type from extension or add extension from content type
      const hasExtension = filename && filename.includes('.');
      if (hasExtension && !contentType) {
        contentType = mime.getType(filename);
      } else if (!hasExtension && contentType) {
        // extension will be added by filesController.createFile
      }

      // Create size-limited stream wrapping the request
      stream = createSizeLimitedStream(req, maxBytes);

      // Build a Parse.File with no _data (streaming mode)
      const file = new Parse.File(filename, { base64: '' }, contentType);
      const { metadata = {}, tags = {}, directory } = req.fileData || {};

      // Validate metadata and tags for prohibited keywords
      try {
        Utils.checkProhibitedKeywords(config, metadata);
        Utils.checkProhibitedKeywords(config, tags);
      } catch (error) {
        stream.destroy();
        next(new Parse.Error(Parse.Error.INVALID_KEY_NAME, error));
        return;
      }

      file.setTags(tags);
      file.setMetadata(metadata);
      if (directory) {
        file.setDirectory(directory);
      }

      const fileSize = req.get('Content-Length')
        ? parseInt(req.get('Content-Length'), 10)
        : null;
      const fileObject = { file, fileSize, stream: true };

      // Run beforeSaveFile trigger
      const triggerResult = await triggers.maybeRunFileTrigger(
        triggers.Types.beforeSave,
        fileObject,
        config,
        req.auth
      );

      let saveResult;
      // If a new ParseFile is returned, check if it's an already saved file
      if (triggerResult instanceof Parse.File) {
        fileObject.file = triggerResult;
        if (triggerResult.url()) {
          fileObject.fileSize = null;
          saveResult = {
            url: triggerResult.url(),
            name: triggerResult._name,
          };
          // Destroy stream to remove listeners and drain request
          stream.destroy();
        }
      }

      // If the file returned by the trigger has already been saved, skip saving
      if (!saveResult) {
        // Prepare file options
        const fileOptions = {
          metadata: fileObject.file._metadata,
        };
        const fileTags =
          Object.keys(fileObject.file._tags).length > 0 ? { tags: fileObject.file._tags } : {};
        Object.assign(fileOptions, fileTags);
        // include directory if set (from client request or beforeSaveFile trigger)
        if (fileObject.file._directory) {
          fileOptions.directory = fileObject.file._directory;
        }

        // Pass stream directly to filesController — it will buffer if adapter doesn't support streaming
        const sourceType = fileObject.file._source?.type || contentType;
        const createFileResult = await filesController.createFile(
          config,
          fileObject.file._name,
          stream,
          sourceType,
          fileOptions
        );

        // Update file with new data
        fileObject.file._name = createFileResult.name;
        fileObject.file._url = createFileResult.url;
        fileObject.file._requestTask = null;
        fileObject.file._previousSave = Promise.resolve(fileObject.file);
        saveResult = {
          url: createFileResult.url,
          name: createFileResult.name,
        };
      }

      // Run afterSaveFile trigger
      await triggers.maybeRunFileTrigger(triggers.Types.afterSave, fileObject, config, req.auth);
      res.status(201);
      res.set('Location', saveResult.url);
      res.json(saveResult);
    } catch (e) {
      // Destroy stream to remove listeners and drain request, or resume directly
      if (stream) {
        stream.destroy();
      } else {
        req.resume();
      }
      logger.error('Error creating a file: ', e);
      const error = triggers.resolveError(e, {
        code: Parse.Error.FILE_SAVE_ERROR,
        message: `Could not store file: ${filename}.`,
      });
      next(error);
    }
  }

  async deleteHandler(req, res, next) {
    if (req.auth.isReadOnly) {
      const error = createSanitizedHttpError(403, "read-only masterKey isn't allowed to delete a file.", req.config);
      res.status(error.status);
      res.end(`{"error":"${error.message}"}`);
      return;
    }
    try {
      const { filesController } = req.config;
      const filename = FilesRouter._getFilenameFromParams(req);
      // run beforeDeleteFile trigger
      const file = new Parse.File(filename);
      file._url = await filesController.adapter.getFileLocation(req.config, filename);
      const fileObject = { file, fileSize: null };
      await triggers.maybeRunFileTrigger(
        triggers.Types.beforeDelete,
        fileObject,
        req.config,
        req.auth
      );
      // delete file
      await filesController.deleteFile(req.config, filename);
      // run afterDeleteFile trigger
      await triggers.maybeRunFileTrigger(
        triggers.Types.afterDelete,
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
    try {
      const config = Config.get(req.params.appId);
      if (!config) {
        res.status(200);
        res.json({});
        return;
      }
      const { filesController } = config;
      let filename = FilesRouter._getFilenameFromParams(req);
      const file = new Parse.File(filename, { base64: '' });
      const triggerResult = await triggers.maybeRunFileTrigger(
        triggers.Types.beforeFind,
        { file },
        config,
        req.auth
      );
      if (triggerResult?.file?._name) {
        filename = triggerResult.file._name;
      }
      const data = await filesController.getMetadata(filename).catch(() => {
        res.status(200);
        res.json({});
      });
      if (!data) {
        return;
      }
      await triggers.maybeRunFileTrigger(
        triggers.Types.afterFind,
        { file },
        config,
        req.auth
      );
      res.status(200);
      res.json(data);
    } catch (e) {
      const err = triggers.resolveError(e, {
        code: Parse.Error.SCRIPT_FAILED,
        message: 'Could not get file metadata.',
      });
      res.status(403);
      res.json({ code: err.code, error: err.message });
    }
  }
}

function isFileStreamable(req, filesController) {
  const range = (req.get('Range') || '/-/').split('-');
  const start = Number(range[0]);
  const end = Number(range[1]);
  return (
    (!isNaN(start) || !isNaN(end)) && typeof filesController.adapter.handleFileStream === 'function'
  );
}
