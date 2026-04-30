import Parse from 'parse/node';
import logger from './logger';

const CLASS_NAME = '_Installation';

function logResult(action, count, err) {
  if (err && err.code === Parse.Error.OBJECT_NOT_FOUND) {
    logger.verbose(`Installation dedup ${action} matched no rows; nothing to do.`);
    return;
  }
  if (err && err.code === Parse.Error.OPERATION_FORBIDDEN) {
    logger.warn(
      `Installation dedup ${action} skipped: caller has no permission to ${action} the conflicting row(s). The conflicting row remains.`
    );
    return;
  }
  if (err) {
    logger.error(`Installation dedup ${action} failed: ${err.message || err}`);
    return;
  }
  logger.verbose(
    `Installation dedup ${action} applied to ${count == null ? 'matching' : count} conflicting row(s).`
  );
}

async function performAction({
  database,
  query,
  action,
  fieldToClear,
  runOptions,
  many,
  validSchemaController,
}) {
  if (action === 'delete') {
    return database.destroy(CLASS_NAME, query, runOptions, validSchemaController);
  }
  if (action === 'update') {
    return database.update(
      CLASS_NAME,
      query,
      { [fieldToClear]: { __op: 'Delete' } },
      { ...runOptions, many },
      false,
      false,
      validSchemaController
    );
  }
  throw new Error(`Unknown installation dedup action: ${action}`);
}

/**
 * Removes or updates `_Installation` rows that hold a `deviceToken` matching the query,
 * allowing the caller to claim that `deviceToken` exclusively. Used when a new or updated
 * install collides with one or more existing rows on `deviceToken`.
 *
 * @param {Object} options
 * @param {DatabaseController} options.database
 * @param {Object} options.query e.g. { deviceToken: 'X', installationId: { $ne: 'I' } }
 * @param {'delete'|'update'} options.action
 * @param {boolean} options.enforceAuth
 * @param {Object} options.runOptions RestWrite.runOptions
 * @param {SchemaController} options.validSchemaController
 */
export async function removeConflictingDeviceToken({
  database,
  query,
  action,
  enforceAuth,
  runOptions,
  validSchemaController,
}) {
  const opts = enforceAuth ? runOptions : {};
  try {
    await performAction({
      database,
      query,
      action,
      fieldToClear: 'deviceToken',
      runOptions: opts,
      many: true,
      validSchemaController,
    });
    logResult(action, null, null);
  } catch (err) {
    if (err && err.code === Parse.Error.OBJECT_NOT_FOUND) {
      logResult(action, 0, err);
      return;
    }
    if (err && err.code === Parse.Error.OPERATION_FORBIDDEN) {
      logResult(action, null, err);
      return;
    }
    logResult(action, null, err);
    throw err;
  }
}

/**
 * Resolves a merge conflict between two `_Installation` rows that together represent the
 * same install: one matched by `installationId`/`objectId` (`idMatch`), and another holding
 * the same `deviceToken` but no `installationId` (`deviceTokenMatch`). The `mergePriority`
 * determines which row survives; the loser receives the configured `action`. Returns the
 * survivor's `objectId` so the save flow can target it.
 *
 * @param {Object} options
 * @param {DatabaseController} options.database
 * @param {{ objectId: string, installationId?: string, deviceToken?: string }} options.idMatch
 * @param {{ objectId: string, deviceToken?: string }} options.deviceTokenMatch
 * @param {'delete'|'update'} options.action
 * @param {'deviceToken'|'installationId'} options.mergePriority
 * @param {boolean} options.enforceAuth
 * @param {Object} options.runOptions
 * @param {SchemaController} options.validSchemaController
 * @returns {Promise<string>} survivor's objectId
 */
export async function applyDuplicateDeviceTokenMerge({
  database,
  idMatch,
  deviceTokenMatch,
  action,
  mergePriority,
  enforceAuth,
  runOptions,
  validSchemaController,
}) {
  // Self-merge guard: when both matches resolve to the same row, there's
  // nothing to clean up. Skip the action so we don't destroy/update the row
  // we're about to return as the survivor.
  if (idMatch.objectId === deviceTokenMatch.objectId) {
    return idMatch.objectId;
  }
  const opts = enforceAuth ? runOptions : {};
  let loser;
  let survivorId;
  let fieldToClear;
  if (mergePriority === 'deviceToken') {
    loser = idMatch;
    survivorId = deviceTokenMatch.objectId;
    fieldToClear = 'installationId';
  } else if (mergePriority === 'installationId') {
    loser = deviceTokenMatch;
    survivorId = idMatch.objectId;
    fieldToClear = 'deviceToken';
  } else {
    throw new Error(`Unknown installation dedup mergePriority: ${mergePriority}`);
  }

  try {
    await performAction({
      database,
      query: { objectId: loser.objectId },
      action,
      fieldToClear,
      runOptions: opts,
      many: false,
      validSchemaController,
    });
    logResult(action, 1, null);
  } catch (err) {
    if (err && err.code === Parse.Error.OBJECT_NOT_FOUND) {
      logResult(action, 0, err);
    } else if (err && err.code === Parse.Error.OPERATION_FORBIDDEN) {
      logResult(action, null, err);
    } else {
      logResult(action, null, err);
      throw err;
    }
  }
  return survivorId;
}

export default {
  removeConflictingDeviceToken,
  applyDuplicateDeviceTokenMerge,
};
