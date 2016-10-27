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

// Returns a promise for an object with optional keys 'results' and 'count'.
function find(config, auth, className, restWhere, restOptions, clientSDK) {
  enforceRoleSecurity('find', className, auth);
  return triggers.maybeRunQueryTrigger(triggers.Types.beforeFind, className, restWhere, restOptions, config, auth).then((result) => {
    restWhere = result.restWhere || restWhere;
    restOptions = result.restOptions || restOptions;
    let query = new RestQuery(config, auth, className, restWhere, restOptions, clientSDK);
    return query.execute();
  });
}

// get is just like find but only queries an objectId.
const get = (config, auth, className, objectId, restOptions, clientSDK) => {
  enforceRoleSecurity('get', className, auth);
  let query = new RestQuery(config, auth, className, { objectId }, restOptions, clientSDK);
  return query.execute();
}

// Returns a promise that doesn't resolve to any useful value.
function del(config, auth, className, objectId, clientSDK) {
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
    if (triggers.getTrigger(className, triggers.Types.beforeDelete, config.applicationId) ||
        triggers.getTrigger(className, triggers.Types.afterDelete, config.applicationId) ||
        (config.liveQueryController && config.liveQueryController.hasLiveQuery(className)) ||
        className == '_Session') {
      return find(config, Auth.master(config), className, {objectId: objectId})
      .then((response) => {
        if (response && response.results && response.results.length) {
          response.results[0].className = className;

          var cacheAdapter = config.cacheController;
          cacheAdapter.user.del(response.results[0].sessionToken);
          inflatedObject = Parse.Object.fromJSON(response.results[0]);
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
function update(config, auth, className, objectId, restObject, clientSDK) {
  enforceRoleSecurity('update', className, auth);

  return Promise.resolve().then(() => {
    if (triggers.getTrigger(className, triggers.Types.beforeSave, config.applicationId) ||
        triggers.getTrigger(className, triggers.Types.afterSave, config.applicationId) ||
        (config.liveQueryController && config.liveQueryController.hasLiveQuery(className))) {
      return find(config, Auth.master(config), className, {objectId: objectId});
    }
    return Promise.resolve({});
  }).then((response) => {
    var originalRestObject;
    if (response && response.results && response.results.length) {
      originalRestObject = response.results[0];
    }

    var write = new RestWrite(config, auth, className, {objectId: objectId}, restObject, originalRestObject, clientSDK);
    return write.execute();
  });
}

// Disallowing access to the _Role collection except by master key
function enforceRoleSecurity(method, className, auth) {
  if (className === '_Installation' && !auth.isMaster) {
    if (method === 'delete' || method === 'find') {
      let error = `Clients aren't allowed to perform the ${method} operation on the installation collection.`
      throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, error);
    }
  }
}

module.exports = {
  create,
  del,
  find,
  get,
  update
};
