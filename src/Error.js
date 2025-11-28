import defaultLogger from './logger';

/**
 * Creates a sanitized error that hides detailed information from clients
 * while logging the detailed message server-side.
 *
 * @param {number} errorCode - The Parse.Error code (e.g., Parse.Error.OPERATION_FORBIDDEN)
 * @param {string} detailedMessage - The detailed error message to log server-side
 * @returns {Parse.Error} A Parse.Error with sanitized message
 */
function createSanitizedError(errorCode, detailedMessage, config) {
  // On testing we need to add a prefix to the message to allow to find the correct call in the TestUtils.js file
  if (process.env.TESTING) {
    defaultLogger.error('Sanitized error:', detailedMessage);
  } else {
    defaultLogger.error(detailedMessage);
  }

  return new Parse.Error(errorCode, config?.enableSanitizedErrorResponse !== false ? 'Permission denied' : detailedMessage);
}

/**
 * Creates a sanitized error from a regular Error object
 * Used for non-Parse.Error errors (e.g., Express errors)
 *
 * @param {number} statusCode - HTTP status code (e.g., 403)
 * @param {string} detailedMessage - The detailed error message to log server-side
 * @returns {Error} An Error with sanitized message
 */
function createSanitizedHttpError(statusCode, detailedMessage, config) {
  // On testing we need to add a prefix to the message to allow to find the correct call in the TestUtils.js file
  if (process.env.TESTING) {
    defaultLogger.error('Sanitized error:', detailedMessage);
  } else {
    defaultLogger.error(detailedMessage);
  }

  const error = new Error();
  error.status = statusCode;
  error.message = config?.enableSanitizedErrorResponse !== false ? 'Permission denied' : detailedMessage;
  return error;
}

export { createSanitizedError, createSanitizedHttpError };
