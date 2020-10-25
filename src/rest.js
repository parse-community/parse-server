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

function checkTriggers(className, config, types) {
  return types.some(triggerType => {
    return triggers.getTrigger(className, triggers.Types[triggerType], config.applicationId);
  });
}

function checkLiveQuery(className, config) {
  return config.liveQueryController && config.liveQueryController.hasLiveQuery(className);
}

// Returns a promise for an object with optional keys 'results' and 'count'.
function find(config, auth, className, restWhere, restOptions, clientSDK, context) {
  enforceRoleSecurity('find', className, auth);
  return triggers
    .maybeRunQueryTrigger(
      triggers.Types.beforeFind,
      className,
      restWhere,
      restOptions,
      config,
      auth,
      context
    )
    .then(result => {
      restWhere = result.restWhere || restWhere;
      restOptions = result.restOptions || restOptions;
      const query = new RestQuery(config, auth, className, restWhere, restOptions, clientSDK);
      return query.execute();
    });
}

// get is just like find but only queries an objectId.
const get = (config, auth, className, objectId, restOptions, clientSDK, context) => {
  var restWhere = { objectId };
  enforceRoleSecurity('get', className, auth);
  return triggers
    .maybeRunQueryTrigger(
      triggers.Types.beforeFind,
      className,
      restWhere,
      restOptions,
      config,
      auth,
      context,
      true
    )
    .then(result => {
      restWhere = result.restWhere || restWhere;
      restOptions = result.restOptions || restOptions;
      const query = new RestQuery(config, auth, className, restWhere, restOptions, clientSDK);
      return query.execute();
    });
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
    .then(() => {
      const hasTriggers = checkTriggers(className, config, ['beforeDelete', 'afterDelete']);
      const hasLiveQuery = checkLiveQuery(className, config);
      if (hasTriggers || hasLiveQuery || className == '_Session') {
        return new RestQuery(config, auth, className, { objectId })
          .execute({ op: 'delete' })
          .then(response => {
            if (response && response.results && response.results.length) {
              const firstResult = response.results[0];
              firstResult.className = className;
              if (className === '_Session' && !auth.isMaster) {
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
      if (!auth.isMaster) {
        return auth.getUserRoles();
      } else {
        return;
      }
    })
    .then(() => config.database.loadSchema())
    .then(s => {
      schemaController = s;
      const options = {};
      if (!auth.isMaster) {
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
    .then(() => {
      const hasTriggers = checkTriggers(className, config, ['beforeSave', 'afterSave']);
      const hasLiveQuery = checkLiveQuery(className, config);
      if (hasTriggers || hasLiveQuery) {
        // Do not use find, as it runs the before finds
        return new RestQuery(
          config,
          auth,
          className,
          restWhere,
          undefined,
          undefined,
          false
        ).execute({
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
  if (className === '_User' && error.code === Parse.Error.OBJECT_NOT_FOUND && !auth.isMaster) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, 'Insufficient auth.');
  }
  throw error;
}

const classesWithMasterOnlyAccess = [
  '_JobStatus',
  '_PushStatus',
  '_Hooks',
  '_GlobalConfig',
  '_JobSchedule',
  '_Idempotency',
];
// Disallowing access to the _Role collection except by master key
function enforceRoleSecurity(method, className, auth) {
  if (className === '_Installation' && !auth.isMaster) {
    if (method === 'delete' || method === 'find') {
      const error = `Clients aren't allowed to perform the ${method} operation on the installation collection.`;
      throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, error);
    }
  }

  //all volatileClasses are masterKey only
  if (classesWithMasterOnlyAccess.indexOf(className) >= 0 && !auth.isMaster) {
    const error = `Clients aren't allowed to perform the ${method} operation on the ${className} collection.`;
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, error);
  }

  // readOnly masterKey is not allowed
  if (auth.isReadOnly && (method === 'delete' || method === 'create' || method === 'update')) {
    const error = `read-only masterKey isn't allowed to perform the ${method} operation.`;
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, error);
  }
}

module.exports = {
  create,
  del,
  find,
  get,
  update,
};
