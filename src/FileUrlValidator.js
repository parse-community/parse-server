const Parse = require('parse/node').Parse;

/**
 * Validates whether a File URL is allowed based on the configured allowed domains.
 * @param {string} fileUrl - The URL to validate.
 * @param {Object} config - The Parse Server config object.
 * @throws {Parse.Error} If the URL is not allowed.
 */
function validateFileUrl(fileUrl, config) {
  if (fileUrl == null || fileUrl === '') {
    return;
  }

  const domains = config?.fileUpload?.allowedFileUrlDomains;
  if (!Array.isArray(domains) || domains.includes('*')) {
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(fileUrl);
  } catch {
    throw new Parse.Error(Parse.Error.FILE_SAVE_ERROR, `Invalid file URL.`);
  }

  const fileHostname = parsedUrl.hostname.toLowerCase();
  for (const domain of domains) {
    const d = domain.toLowerCase();
    if (fileHostname === d) {
      return;
    }
    if (d.startsWith('*.') && fileHostname.endsWith(d.slice(1))) {
      return;
    }
  }

  throw new Parse.Error(Parse.Error.FILE_SAVE_ERROR, `File URL domain '${parsedUrl.hostname}' is not allowed.`);
}

/**
 * Recursively scans an object for File type fields and validates their URLs.
 * @param {any} obj - The object to scan.
 * @param {Object} config - The Parse Server config object.
 * @throws {Parse.Error} If any File URL is not allowed.
 */
function validateFileUrlsInObject(obj, config) {
  if (obj == null || typeof obj !== 'object') {
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      validateFileUrlsInObject(item, config);
    }
    return;
  }
  if (obj.__type === 'File' && obj.url) {
    validateFileUrl(obj.url, config);
    return;
  }
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value && typeof value === 'object') {
      validateFileUrlsInObject(value, config);
    }
  }
}

module.exports = { validateFileUrl, validateFileUrlsInObject };
