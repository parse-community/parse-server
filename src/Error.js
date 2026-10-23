import defaultLogger from './logger';

// Flag of an error that is logged where it occurs
const logged = Symbol('logged');

/**
 * Marks an error as logged where it occurs, so that code that catches it does not log it again.
 *
 * @param {Error} error - The logged error
 * @returns {Error} The same error
 */
function markLogged(error) {
  error[logged] = true;
  return error;
}

/**
 * Whether an error is logged where it occurs.
 *
 * @param {any} error - The error
 * @returns {boolean} Whether the error is logged
 */
function isLogged(error) {
  return error?.[logged] === true;
}

/**
 * Creates a sanitized error that hides detailed information from clients
 * while logging the detailed message server-side.
 *
 * @param {number} errorCode - The Parse.Error code (e.g., Parse.Error.OPERATION_FORBIDDEN)
 * @param {string} detailedMessage - The detailed error message to log server-side
 * @param {object} config - Parse Server config with enableSanitizedErrorResponse
 * @param {string} [sanitizedMessage='Permission denied'] - The sanitized message to return to clients
 * @returns {Parse.Error} A Parse.Error with sanitized message
 */
function createSanitizedError(errorCode, detailedMessage, config, sanitizedMessage = 'Permission denied') {
  // On testing we need to add a prefix to the message to allow to find the correct call in the TestUtils.js file
  if (process.env.TESTING) {
    defaultLogger.error('Sanitized error:', detailedMessage);
  } else {
    defaultLogger.error(detailedMessage);
  }

  return markLogged(
    new Parse.Error(
      errorCode,
      config?.enableSanitizedErrorResponse !== false ? sanitizedMessage : detailedMessage
    )
  );
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

export { createSanitizedError, createSanitizedHttpError, markLogged, isLogged };
