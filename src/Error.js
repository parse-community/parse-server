import defaultLogger from './logger';
import Utils from './Utils';

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

  return new Parse.Error(errorCode, config?.enableSanitizedErrorResponse !== false ? sanitizedMessage : detailedMessage);
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

function safeBulkReasonDetailedMessage(reason) {
  if (reason === undefined || reason === null) {
    return 'Internal server error';
  }
  try {
    let detail;
    if (typeof reason.message === 'string') {
      detail = reason.message;
    } else {
      detail = String(reason);
    }
    return typeof detail === 'string' ? detail : 'Internal server error';
  } catch {
    return 'Internal server error';
  }
}

/**
 * `{ code, message }` for GraphQL bulk mutation per-item failures (`ParseGraphQLBulkError`).
 * `Parse.Error` keeps its original code and message; other values are logged and mapped to a generic message when sanitizing.
 *
 * @param {unknown} reason
 * @param {object} config
 * @returns {{ code: number, message: string }}
 */
function bulkErrorPayloadFromReason(reason, config) {
  if (reason instanceof Parse.Error) {
    return { code: reason.code, message: reason.message };
  }
  const detailedMessage = safeBulkReasonDetailedMessage(reason);
  if (process.env.TESTING) {
    defaultLogger.error('Bulk mutation non-Parse error:', detailedMessage);
  } else {
    defaultLogger.error(
      'Bulk mutation non-Parse error:',
      detailedMessage,
      Utils.isNativeError(reason) ? reason.stack : ''
    );
  }
  const message =
    config?.enableSanitizedErrorResponse !== false ? 'Internal server error' : detailedMessage;
  return { code: Parse.Error.INTERNAL_SERVER_ERROR, message };
}

export { createSanitizedError, createSanitizedHttpError, bulkErrorPayloadFromReason };
