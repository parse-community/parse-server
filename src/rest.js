// This file contains helpers for running operations in REST format.
// The goal is that handlers that explicitly handle an express route
// should just be shallow wrappers around things in this file, but
// these functions should not explicitly depend on the request
// object.
// This means that one of these handlers can support multiple
// routes. That's useful for the routes that do really similar
// things.

var Parse = require('parse/node').Parse;

var RestQuery = require('./RestQuery');
var RestWrite = require('./RestWrite');
var triggers = require('./triggers');
const { enforceRoleSecurity } = require('./SharedRest');

function checkTriggers(className, config, types) {
  return types.some(triggerType => {
    return triggers.getTrigger(className, triggers.Types[triggerType], config.applicationId);
  });
}

function checkLiveQuery(className, config) {
  return config.liveQueryController && config.liveQueryController.hasLiveQuery(className);
}
async function runFindTriggers(
  config,
  auth,
  className,
  restWhere,
  restOptions,
  clientSDK,
  context,
  options = {}
) {
  const { isGet } = options;

  if (restOptions && restOptions.explain && !auth.isMaster) {
    const allowPublicExplain = config.databaseOptions?.allowPublicExplain ?? true;

    if (!allowPublicExplain) {
      throw new Parse.Error(
        Parse.Error.INVALID_QUERY,
        'Using the explain query parameter requires the master key'
      );
    }
  }

  // Run beforeFind trigger - may modify query or return objects directly
  const result = await triggers.maybeRunQueryTrigger(
    triggers.Types.beforeFind,
    className,
    restWhere,
    restOptions,
    config,
    auth,
    context,
    isGet
  );

  restWhere = result.restWhere || restWhere;
  restOptions = result.restOptions || restOptions;

  // Short-circuit path: beforeFind returned objects directly
  // Security risk: These objects may have been fetched with master privileges
  if (result?.objects) {
    const objectsFromBeforeFind = result.objects;

    let objectsForAfterFind = objectsFromBeforeFind;

    // Security check: Re-filter objects if not master to ensure ACL/CLP compliance
    if (!auth?.isMaster && !auth?.isMaintenance) {
      const ids = (Array.isArray(objectsFromBeforeFind) ? objectsFromBeforeFind : [objectsFromBeforeFind])
        .map(o => (o && (o.id || o.objectId)) || null)
        .filter(Boolean);

      // Objects without IDs are(normally) unsaved objects
      // For unsaved objects, the ACL security does not apply, so no need to redo the query.
      // For saved objects, we need to re-query to ensure proper ACL/CLP enforcement
      if (ids.length > 0) {
        const refilterWhere = isGet ? { objectId: ids[0] } : { objectId: { $in: ids } };

        // Re-query with proper security: no triggers to avoid infinite loops
        const refilterQuery = await RestQuery({
          method: isGet ? RestQuery.Method.get : RestQuery.Method.find,
          config,
          auth,
          className,
          restWhere: refilterWhere,
          restOptions,
          clientSDK,
          context,
          runBeforeFind: false,
          runAfterFind: false,
        });

        const refiltered = await refilterQuery.execute();
        objectsForAfterFind = (refiltered && refiltered.results) || [];
      }
    }

    // Run afterFind trigger on security-filtered objects
    const afterFindProcessedObjects = await triggers.maybeRunAfterFindTrigger(
      triggers.Types.afterFind,
      auth,
      className,
      objectsForAfterFind,
      config,
      new Parse.Query(className).withJSON({ where: restWhere, ...restOptions }),
      context,
      isGet
    );

    return {
      results: afterFindProcessedObjects,
    };
  }

  // Normal path: execute database query with modified conditions
  const query = await RestQuery({
    method: isGet ? RestQuery.Method.get : RestQuery.Method.find,
    config,
    auth,
    className,
    restWhere,
    restOptions,
    clientSDK,
    context,
    runBeforeFind: false,
  });

  return query.execute();
}

// Returns a promise for an object with optional keys 'results' and 'count'.
const find = async (config, auth, className, restWhere, restOptions, clientSDK, context) => {
  enforceRoleSecurity('find', className, auth);
  return runFindTriggers(
    config,
    auth,
    className,
    restWhere,
    restOptions,
    clientSDK,
    context,
    { isGet: false }
  );
};

// get is just like find but only queries an objectId.
const get = async (config, auth, className, objectId, restOptions, clientSDK, context) => {
  enforceRoleSecurity('get', className, auth);
  return runFindTriggers(
    config,
    auth,
    className,
    { objectId },
    restOptions,
    clientSDK,
    context,
    { isGet: true }
  );
};

// Returns a promise that doesn't resolve to any useful value.
function del(config, auth, className, objectId, context) {
  if (typeof objectId !== 'string') {
    throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad objectId');
  }

  if (className === '_User' && auth.isUnauthenticated()) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, 'Insufficient auth to delete user');
  }

  enforceRoleSecurity('delete', className, auth);

  let inflatedObject;
  let schemaController;

  return Promise.resolve()
    .then(async () => {
      const hasTriggers = checkTriggers(className, config, ['beforeDelete', 'afterDelete']);
      const hasLiveQuery = checkLiveQuery(className, config);
      if (hasTriggers || hasLiveQuery || className == '_Session') {
        const query = await RestQuery({
          method: RestQuery.Method.get,
          config,
          auth,
          className,
          restWhere: { objectId },
        });
        return query.execute({ op: 'delete' }).then(response => {
          if (response && response.results && response.results.length) {
            const firstResult = response.results[0];
            firstResult.className = className;
            if (className === '_Session' && !auth.isMaster && !auth.isMaintenance) {
              if (!auth.user || firstResult.user.objectId !== auth.user.id) {
                throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
              }
            }
            var cacheAdapter = config.cacheController;
            cacheAdapter.user.del(firstResult.sessionToken);
            inflatedObject = Parse.Object.fromJSON(firstResult);
            return triggers.maybeRunTrigger(
              triggers.Types.beforeDelete,
              auth,
              inflatedObject,
              null,
              config,
              context
            );
          }
          throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found for delete.');
        });
      }
      return Promise.resolve({});
    })
    .then(() => {
      if (!auth.isMaster && !auth.isMaintenance) {
        return auth.getUserRoles();
      } else {
        return;
      }
    })
    .then(() => config.database.loadSchema())
    .then(s => {
      schemaController = s;
      const options = {};
      if (!auth.isMaster && !auth.isMaintenance) {
        options.acl = ['*'];
        if (auth.user) {
          options.acl.push(auth.user.id);
          options.acl = options.acl.concat(auth.userRoles);
        }
      }

      return config.database.destroy(
        className,
        {
          objectId: objectId,
        },
        options,
        schemaController
      );
    })
    .then(() => {
      // Notify LiveQuery server if possible
      const perms = schemaController.getClassLevelPermissions(className);
      config.liveQueryController.onAfterDelete(className, inflatedObject, null, perms);
      return triggers.maybeRunTrigger(
        triggers.Types.afterDelete,
        auth,
        inflatedObject,
        null,
        config,
        context
      );
    })
    .catch(error => {
      handleSessionMissingError(error, className, auth);
    });
}

// Returns a promise for a {response, status, location} object.
function create(config, auth, className, restObject, clientSDK, context) {
  enforceRoleSecurity('create', className, auth);
  var write = new RestWrite(config, auth, className, null, restObject, null, clientSDK, context);
  return write.execute();
}

// Returns a promise that contains the fields of the update that the
// REST API is supposed to return.
// Usually, this is just updatedAt.
function update(config, auth, className, restWhere, restObject, clientSDK, context) {
  enforceRoleSecurity('update', className, auth);

  return Promise.resolve()
    .then(async () => {
      const hasTriggers = checkTriggers(className, config, ['beforeSave', 'afterSave']);
      const hasLiveQuery = checkLiveQuery(className, config);
      if (hasTriggers || hasLiveQuery) {
        // Do not use find, as it runs the before finds
        const query = await RestQuery({
          method: RestQuery.Method.get,
          config,
          auth,
          className,
          restWhere,
          runAfterFind: false,
          runBeforeFind: false,
          context,
        });
        return query.execute({
          op: 'update',
        });
      }
      return Promise.resolve({});
    })
    .then(({ results }) => {
      var originalRestObject;
      if (results && results.length) {
        originalRestObject = results[0];
      }
      return new RestWrite(
        config,
        auth,
        className,
        restWhere,
        restObject,
        originalRestObject,
        clientSDK,
        context,
        'update'
      ).execute();
    })
    .catch(error => {
      handleSessionMissingError(error, className, auth);
    });
}

function handleSessionMissingError(error, className, auth) {
  // If we're trying to update a user without / with bad session token
  if (
    className === '_User' &&
    error.code === Parse.Error.OBJECT_NOT_FOUND &&
    !auth.isMaster &&
    !auth.isMaintenance
  ) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, 'Insufficient auth.');
  }
  throw error;
}

module.exports = {
  create,
  del,
  find,
  get,
  update,
};
