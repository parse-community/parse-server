import defaultLogger from './logger';

/**
 * Creates a sanitized security error that hides detailed information from clients
 * while logging the detailed message server-side.
 *
 * @param {number} errorCode - The Parse.Error code (e.g., Parse.Error.OPERATION_FORBIDDEN)
 * @param {string} detailedMessage - The detailed error message to log server-side
 * @param {Object} loggerOrConfig - Optional logger instance or config object (from req.config.loggerController or default)
 * @returns {Parse.Error} A Parse.Error with sanitized message
 */
export function createSanitizedError(errorCode, detailedMessage) {
  // Keep log on server side
  defaultLogger.error('Security error:', detailedMessage);

  return new Parse.Error(errorCode, 'Permission denied');
}

/**
 * Creates a sanitized security error from a regular Error object
 * Used for non-Parse.Error security errors (e.g., Express errors)
 *
 * @param {number} statusCode - HTTP status code (e.g., 403)
 * @param {string} detailedMessage - The detailed error message to log server-side
 * @param {Object} loggerOrConfig - Optional logger instance or config object
 * @returns {Error} An Error with sanitized message
 */
export function createSanitizedHttpError(statusCode, detailedMessage) {
  defaultLogger.error('Security error:', detailedMessage);

  const error = new Error();
  error.status = statusCode;
  error.message = 'Permission denied';
  return error;
}

