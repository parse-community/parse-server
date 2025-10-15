import express from 'express';
import * as Middlewares from '../middlewares';
import Parse from 'parse/node';
import Config from '../Config';
import logger from '../logger';
const triggers = require('../triggers');
const http = require('http');
const https = require('https');
const url = require('url');
const dns = require('dns');
const { promisify } = require('util');
const { BlockList, isIPv4 } = require('net');
const Utils = require('../Utils');

const dnsLookup = promisify(dns.lookup);

/**
 * Creates a BlockList from an array of IP ranges
 * @param {string[]} ipRangeList - Array of IP addresses or CIDR notations
 * @returns {Object} - Object with blockList and flags for allowing all IPs
 */
const createBlockList = (ipRangeList) => {
  const blockList = new BlockList();
  const flags = {
    allowAllIpv4: false,
    allowAllIpv6: false,
  };

  ipRangeList.forEach(fullIp => {
    if (fullIp === '::/0' || fullIp === '::0') {
      flags.allowAllIpv6 = true;
      return;
    }
    if (fullIp === '0.0.0.0/0' || fullIp === '0.0.0.0') {
      flags.allowAllIpv4 = true;
      return;
    }
    const [ip, mask] = fullIp.split('/');
    if (!mask) {
      blockList.addAddress(ip, isIPv4(ip) ? 'ipv4' : 'ipv6');
    } else {
      blockList.addSubnet(ip, Number(mask), isIPv4(ip) ? 'ipv4' : 'ipv6');
    }
  });

  return { blockList, ...flags };
};

/**
 * Checks if an IP matches any CIDR in the list
 * @param {string} ip - The IP address to check
 * @param {string[]} ipRangeList - Array of CIDR notations
 * @returns {boolean} - True if IP matches any CIDR
 */
const checkIpInList = (ip, ipRangeList) => {
  if (!ipRangeList || ipRangeList.length === 0) {
    return false;
  }

  const incomingIpIsV4 = isIPv4(ip);
  const { blockList, allowAllIpv4, allowAllIpv6 } = createBlockList(ipRangeList);

  if (allowAllIpv4 && incomingIpIsV4) {
    return true;
  }
  if (allowAllIpv6 && !incomingIpIsV4) {
    return true;
  }

  return blockList.check(ip, incomingIpIsV4 ? 'ipv4' : 'ipv6');
};

/**
 * Downloads a file from a URI with security validation
 * @param {string} uri - The URI to download from
 * @param {Object} config - Parse Server configuration
 * @returns {Promise<string>} - Base64 encoded file data
 */
const downloadFileFromURI = async (uri, config) => {
  const fileUploadConfig = config.fileUpload;

  // Check if URI source is enabled
  if (fileUploadConfig.uriSourceEnabled === false) {
    throw new Parse.Error(
      Parse.Error.FILE_SAVE_ERROR,
      'File upload from URI is disabled.'
    );
  }

  // Validate URI against regex pattern
  const regex = new RegExp(fileUploadConfig.uriSourceRegex);
  if (!regex.test(uri)) {
    throw new Parse.Error(
      Parse.Error.FILE_SAVE_ERROR,
      `URI does not match allowed pattern.`
    );
  }

  // Parse the URI
  let parsedUrl;
  try {
    parsedUrl = new url.URL(uri);
  } catch (e) {
    throw new Parse.Error(
      Parse.Error.FILE_SAVE_ERROR,
      `Invalid URI format: ${e.message}`
    );
  }

  // Only allow HTTP and HTTPS protocols
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Parse.Error(
      Parse.Error.FILE_SAVE_ERROR,
      'Only HTTP and HTTPS protocols are allowed for URI uploads.'
    );
  }

  // Resolve hostname to IP address
  // Note: parsedUrl.hostname includes brackets for IPv6 (e.g., [::1])
  // but dns.lookup doesn't accept brackets, so we need to strip them
  let hostname = parsedUrl.hostname;
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    hostname = hostname.slice(1, -1);
  }

  let ipAddress;
  try {
    const result = await dnsLookup(hostname);
    ipAddress = result.address;
  } catch (e) {
    throw new Parse.Error(
      Parse.Error.FILE_SAVE_ERROR,
      `Failed to resolve hostname: ${e.message}`
    );
  }

  // Check IP against denied list (takes precedence)
  if (fileUploadConfig.uriSourceIpsDenied.length > 0 && checkIpInList(ipAddress, fileUploadConfig.uriSourceIpsDenied)) {
    throw new Parse.Error(
      Parse.Error.FILE_SAVE_ERROR,
      'URI resolves to a denied IP address.'
    );
  }

  // Check IP against allowed list
  if (!checkIpInList(ipAddress, fileUploadConfig.uriSourceIpsAllowed)) {
    throw new Parse.Error(
      Parse.Error.FILE_SAVE_ERROR,
      'URI resolves to a non-allowed IP address.'
    );
  }

  // Get timeout from config (already has default applied)
  const timeout = fileUploadConfig.uriSourceTimeout;

  return new Promise((res, rej) => {
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    const request = protocol.get(uri, { timeout }, response => {
      // Node.js http.get does not follow redirects automatically
      // Any redirect (3xx) response will be rejected as non-200
      if (response.statusCode !== 200) {
        rej(new Parse.Error(
          Parse.Error.FILE_SAVE_ERROR,
          `Failed to download file: HTTP ${response.statusCode}`
        ));
        return;
      }

      response.setDefaultEncoding('base64');
      let body = `data:${response.headers['content-type']};base64,`;
      response.on('data', data => (body += data));
      response.on('end', () => res(body));
      response.on('error', e => {
        rej(new Parse.Error(
          Parse.Error.FILE_SAVE_ERROR,
          `Error downloading file from ${uri}: ${e.message}`
        ));
      });
    });

    request.on('timeout', () => {
      request.destroy();
      rej(new Parse.Error(
        Parse.Error.FILE_SAVE_ERROR,
        `Download timeout after ${timeout}ms`
      ));
    });

    request.on('error', e => {
      rej(new Parse.Error(
        Parse.Error.FILE_SAVE_ERROR,
        `Error downloading file from ${uri}: ${e.message}`
      ));
    });
  });
};

const addFileDataIfNeeded = async (file, config) => {
  if (file._source.format === 'uri') {
    const base64 = await downloadFileFromURI(file._source.uri, config);
    file._previousSave = file;
    file._data = base64;
    file._requestTask = null;
  }
  return file;
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
      express.raw({
        type: () => {
          return true;
        },
        limit: maxUploadSize,
      }), // Allow uploads without Content-Type, or with any Content-Type.
      Middlewares.handleParseHeaders,
      Middlewares.handleParseSession,
      this.createHandler
    );

    router.delete(
      '/files/:filename',
      Middlewares.handleParseHeaders,
      Middlewares.handleParseSession,
      Middlewares.enforceMasterKeyAccess,
      this.deleteHandler
    );
    return router;
  }

  async getHandler(req, res) {
    const config = Config.get(req.params.appId);
    if (!config) {
      res.status(403);
      const err = new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Invalid application ID.');
      res.json({ code: err.code, error: err.message });
      return;
    }

    let filename = req.params.filename;
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

      if (isFileStreamable(req, filesController)) {
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
        { file, forceDownload: false },
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

    const base64 = req.body.toString('base64');
    const file = new Parse.File(filename, { base64 }, contentType);
    const { metadata = {}, tags = {} } = req.fileData || {};
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
        // if the ParseFile returned is type uri, download the file before saving it
        await addFileDataIfNeeded(fileObject.file, config);
        // update fileSize
        const bufferData = Buffer.from(fileObject.file._data, 'base64');
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

  async deleteHandler(req, res, next) {
    try {
      const { filesController } = req.config;
      const { filename } = req.params;
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
      const { filesController } = config;
      const { filename } = req.params;
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
  const range = (req.get('Range') || '/-/').split('-');
  const start = Number(range[0]);
  const end = Number(range[1]);
  return (
    (!isNaN(start) || !isNaN(end)) && typeof filesController.adapter.handleFileStream === 'function'
  );
}
