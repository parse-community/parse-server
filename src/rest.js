// This file contains helpers for running operations in REST format.
// The goal is that handlers that explicitly handle an express route
// should just be shallow wrappers around things in this file, but
// these functions should not explicitly depend on the request
// object.
// This means that one of these handlers can support multiple
// routes. That's useful for the routes that do really similar
// things.

var Parse = require('parse/node').Parse;
import Auth from './Auth';

var RestQuery = require('./RestQuery');
var RestWrite = require('./RestWrite');
var triggers = require('./triggers');

function checkTriggers(className, config, types) {
  return types.some((triggerType) => {
    return triggers.getTrigger(className, triggers.Types[triggerType], config.applicationId);
  });
}

function checkLiveQuery(className, config) {
  return config.liveQueryController && config.liveQueryController.hasLiveQuery(className)
}

// Returns a promise for an object with optional keys 'results' and 'count'.
function find(config, auth, className, restWhere, restOptions, clientSDK) {
  enforceRoleSecurity('find', className, auth);
  return triggers.maybeRunQueryTrigger(triggers.Types.beforeFind, className, restWhere, restOptions, config, auth).then((result) => {
    restWhere = result.restWhere || restWhere;
    restOptions = result.restOptions || restOptions;
    const query = new RestQuery(config, auth, className, restWhere, restOptions, clientSDK);
    return query.execute();
  });
}

// get is just like find but only queries an objectId.
const get = (config, auth, className, objectId, restOptions, clientSDK) => {
  var restWhere = { objectId };
  enforceRoleSecurity('get', className, auth);
  return triggers.maybeRunQueryTrigger(triggers.Types.beforeFind, className, restWhere, restOptions, config, auth, true).then((result) => {
    restWhere = result.restWhere || restWhere;
    restOptions = result.restOptions || restOptions;
    const query = new RestQuery(config, auth, className, restWhere, restOptions, clientSDK);
    return query.execute();
  });
}

// Returns a promise that doesn't resolve to any useful value.
function del(config, auth, className, objectId) {
  if (typeof objectId !== 'string') {
    throw new Parse.Error(Parse.Error.INVALID_JSON,
      'bad objectId');
  }

  if (className === '_User' && !auth.couldUpdateUserId(objectId)) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING,
      'insufficient auth to delete user');
  }

  enforceRoleSecurity('delete', className, auth);

  var inflatedObject;

  return Promise.resolve().then(() => {
    const hasTriggers = checkTriggers(className, config, ['beforeDelete', 'afterDelete']);
    const hasLiveQuery = checkLiveQuery(className, config);
    if (hasTriggers || hasLiveQuery || className == '_Session') {
      return find(config, Auth.master(config), className, {objectId: objectId})
        .then((response) => {
          if (response && response.results && response.results.length) {
            const firstResult = response.results[0];
            firstResult.className = className;
            if (className === '_Session' && !auth.isMaster) {
              if (!auth.user || firstResult.user.objectId !== auth.user.id) {
                throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'invalid session token');
              }
            }
            var cacheAdapter = config.cacheController;
            cacheAdapter.user.del(firstResult.sessionToken);
            inflatedObject = Parse.Object.fromJSON(firstResult);
            // Notify LiveQuery server if possible
            config.liveQueryController.onAfterDelete(inflatedObject.className, inflatedObject);
            return triggers.maybeRunTrigger(triggers.Types.beforeDelete, auth, inflatedObject, null,  config);
          }
          throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND,
            'Object not found for delete.');
        });
    }
    return Promise.resolve({});
  }).then(() => {
    if (!auth.isMaster) {
      return auth.getUserRoles();
    } else {
      return;
    }
  }).then(() => {
    var options = {};
    if (!auth.isMaster) {
      options.acl = ['*'];
      if (auth.user) {
        options.acl.push(auth.user.id);
        options.acl = options.acl.concat(auth.userRoles);
      }
    }

    return config.database.destroy(className, {
      objectId: objectId
    }, options);
  }).then(() => {
    return triggers.maybeRunTrigger(triggers.Types.afterDelete, auth, inflatedObject, null, config);
  });
}

// Returns a promise for a {response, status, location} object.
function create(config, auth, className, restObject, clientSDK) {
  enforceRoleSecurity('create', className, auth);
  var write = new RestWrite(config, auth, className, null, restObject, null, clientSDK);
  return write.execute();
}

// Returns a promise that contains the fields of the update that the
// REST API is supposed to return.
// Usually, this is just updatedAt.
function update(config, auth, className, restWhere, restObject, clientSDK) {
  enforceRoleSecurity('update', className, auth);

  return Promise.resolve().then(() => {
    const hasTriggers = checkTriggers(className, config, ['beforeSave', 'afterSave']);
    const hasLiveQuery = checkLiveQuery(className, config);
    if (hasTriggers || hasLiveQuery) {
      return find(config, Auth.master(config), className, restWhere);
    }
    return Promise.resolve({});
  }).then((response) => {
    var originalRestObject;
    if (response && response.results && response.results.length) {
      originalRestObject = response.results[0];
    }

    var write = new RestWrite(config, auth, className, restWhere, restObject, originalRestObject, clientSDK);
    return write.execute();
  });
}

const classesWithMasterOnlyAccess = ['_JobStatus', '_PushStatus', '_Hooks', '_GlobalConfig', '_JobSchedule'];
// Disallowing access to the _Role collection except by master key
function enforceRoleSecurity(method, className, auth) {
  if (className === '_Installation' && !auth.isMaster) {
    if (method === 'delete' || method === 'find') {
      const error = `Clients aren't allowed to perform the ${method} operation on the installation collection.`
      throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, error);
    }
  }

  //all volatileClasses are masterKey only
  if(classesWithMasterOnlyAccess.indexOf(className) >= 0 && !auth.isMaster){
    const error = `Clients aren't allowed to perform the ${method} operation on the ${className} collection.`
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, error);
  }
}

module.exports = {
  create,
  del,
  find,
  get,
  update
};
