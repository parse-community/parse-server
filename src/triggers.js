// triggers.js

var Parse = require('parse/node').Parse;

var Types = {
  beforeSave: 'beforeSave',
  afterSave: 'afterSave',
  beforeDelete: 'beforeDelete',
  afterDelete: 'afterDelete'
};

var getTrigger = function(className, triggerType) {
  if (Parse.Cloud.Triggers
    && Parse.Cloud.Triggers[triggerType]
    && Parse.Cloud.Triggers[triggerType][className]) {
    return Parse.Cloud.Triggers[triggerType][className];
  }
  return undefined;
};

var getRequestObject = function(triggerType, auth, parseObject, originalParseObject) {
  var request = {
    triggerName: triggerType,
    object: parseObject,
    master: false
  };
  if (originalParseObject) {
    request.original = originalParseObject;
  }
  if (!auth) {
    return request;
  }
  if (auth.isMaster) {
    request['master'] = true;
  }
  if (auth.user) {
    request['user'] = auth.user;
  }
  // TODO: Add installation to Auth?
  if (auth.installationId) {
    request['installationId'] = auth.installationId;
  }
  return request;
};

// Creates the response object, and uses the request object to pass data
// The API will call this with REST API formatted objects, this will
// transform them to Parse.Object instances expected by Cloud Code.
// Any changes made to the object in a beforeSave will be included.
var getResponseObject = function(request, resolve, reject) {
  return {
    success: function() {
      var response = {};
      if (request.triggerName === Types.beforeSave) {
        response['object'] = request.object.toJSON();
      }
      return resolve(response);
    },
    error: function(error) {
      var scriptError = new Parse.Error(Parse.Error.SCRIPT_FAILED, error);
      return reject(scriptError);
    }
  }
};

// To be used as part of the promise chain when saving/deleting an object
// Will resolve successfully if no trigger is configured
// Resolves to an object, empty or containing an object key. A beforeSave
// trigger will set the object key to the rest format object to save.
// originalParseObject is optional, we only need that for befote/afterSave functions
var maybeRunTrigger = function(triggerType, auth, parseObject, originalParseObject) {
  if (!parseObject) {
    return Promise.resolve({});
  }
  return new Promise(function (resolve, reject) {
    var trigger = getTrigger(parseObject.className, triggerType);
    if (!trigger) return resolve({});
    var request = getRequestObject(triggerType, auth, parseObject, originalParseObject);
    var response = getResponseObject(request, resolve, reject);
    trigger(request, response);
  });
};

// Converts a REST-format object to a Parse.Object
// data is either className or an object
function inflate(data, restObject) {
  var copy = typeof data == 'object' ? data : {className: data};
  for (var key in restObject) {
    copy[key] = restObject[key];
  }
  return Parse.Object.fromJSON(copy);
}

module.exports = {
  getTrigger: getTrigger,
  getRequestObject: getRequestObject,
  inflate: inflate,
  maybeRunTrigger: maybeRunTrigger,
  Types: Types
};
