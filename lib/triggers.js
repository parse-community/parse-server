'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Types = undefined;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; }; // triggers.js


exports.addFunction = addFunction;
exports.addTrigger = addTrigger;
exports.removeFunction = removeFunction;
exports.removeTrigger = removeTrigger;
exports._unregister = _unregister;
exports._unregisterAll = _unregisterAll;
exports.getTrigger = getTrigger;
exports.triggerExists = triggerExists;
exports.getFunction = getFunction;
exports.getValidator = getValidator;
exports.getRequestObject = getRequestObject;
exports.getResponseObject = getResponseObject;
exports.maybeRunTrigger = maybeRunTrigger;
exports.inflate = inflate;

var _node = require('parse/node');

var _node2 = _interopRequireDefault(_node);

var _cache = require('./cache');

var _cache2 = _interopRequireDefault(_cache);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var Types = exports.Types = {
  beforeSave: 'beforeSave',
  afterSave: 'afterSave',
  beforeDelete: 'beforeDelete',
  afterDelete: 'afterDelete'
};

var baseStore = function baseStore() {
  var Validators = {};
  var Functions = {};
  var Triggers = Object.keys(Types).reduce(function (base, key) {
    base[key] = {};
    return base;
  }, {});

  return Object.freeze({
    Functions: Functions,
    Validators: Validators,
    Triggers: Triggers
  });
};

var _triggerStore = {};

function addFunction(functionName, handler, validationHandler, applicationId) {
  applicationId = applicationId || _node2.default.applicationId;
  _triggerStore[applicationId] = _triggerStore[applicationId] || baseStore();
  _triggerStore[applicationId].Functions[functionName] = handler;
  _triggerStore[applicationId].Validators[functionName] = validationHandler;
}

function addTrigger(type, className, handler, applicationId) {
  applicationId = applicationId || _node2.default.applicationId;
  _triggerStore[applicationId] = _triggerStore[applicationId] || baseStore();
  _triggerStore[applicationId].Triggers[type][className] = handler;
}

function removeFunction(functionName, applicationId) {
  applicationId = applicationId || _node2.default.applicationId;
  delete _triggerStore[applicationId].Functions[functionName];
}

function removeTrigger(type, className, applicationId) {
  applicationId = applicationId || _node2.default.applicationId;
  delete _triggerStore[applicationId].Triggers[type][className];
}

function _unregister(appId, category, className, type) {
  if (type) {
    removeTrigger(className, type, appId);
    delete _triggerStore[appId][category][className][type];
  } else {
    delete _triggerStore[appId][category][className];
  }
}

function _unregisterAll() {
  Object.keys(_triggerStore).forEach(function (appId) {
    return delete _triggerStore[appId];
  });
}

function getTrigger(className, triggerType, applicationId) {
  if (!applicationId) {
    throw "Missing ApplicationID";
  }
  var manager = _triggerStore[applicationId];
  if (manager && manager.Triggers && manager.Triggers[triggerType] && manager.Triggers[triggerType][className]) {
    return manager.Triggers[triggerType][className];
  }
  return undefined;
};

function triggerExists(className, type, applicationId) {
  return getTrigger(className, type, applicationId) != undefined;
}

function getFunction(functionName, applicationId) {
  var manager = _triggerStore[applicationId];
  if (manager && manager.Functions) {
    return manager.Functions[functionName];
  };
  return undefined;
}

function getValidator(functionName, applicationId) {
  var manager = _triggerStore[applicationId];
  if (manager && manager.Validators) {
    return manager.Validators[functionName];
  };
  return undefined;
}

function getRequestObject(triggerType, auth, parseObject, originalParseObject, config) {
  var request = {
    triggerName: triggerType,
    object: parseObject,
    master: false,
    log: config.loggerController && config.loggerController.adapter
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
  if (auth.installationId) {
    request['installationId'] = auth.installationId;
  }
  return request;
}

// Creates the response object, and uses the request object to pass data
// The API will call this with REST API formatted objects, this will
// transform them to Parse.Object instances expected by Cloud Code.
// Any changes made to the object in a beforeSave will be included.
function getResponseObject(request, resolve, reject) {
  return {
    success: function success(response) {
      // Use the JSON response
      if (response && !request.object.equals(response) && request.triggerName === Types.beforeSave) {
        return resolve(response);
      }
      response = {};
      if (request.triggerName === Types.beforeSave) {
        response['object'] = request.object._getSaveJSON();
      }
      return resolve(response);
    },
    error: function error(code, message) {
      if (!message) {
        message = code;
        code = _node2.default.Error.SCRIPT_FAILED;
      }
      var scriptError = new _node2.default.Error(code, message);
      return reject(scriptError);
    }
  };
};

// To be used as part of the promise chain when saving/deleting an object
// Will resolve successfully if no trigger is configured
// Resolves to an object, empty or containing an object key. A beforeSave
// trigger will set the object key to the rest format object to save.
// originalParseObject is optional, we only need that for befote/afterSave functions
function maybeRunTrigger(triggerType, auth, parseObject, originalParseObject, config) {
  if (!parseObject) {
    return Promise.resolve({});
  }
  return new Promise(function (resolve, reject) {
    var trigger = getTrigger(parseObject.className, triggerType, config.applicationId);
    if (!trigger) return resolve();
    var request = getRequestObject(triggerType, auth, parseObject, originalParseObject, config);
    var response = getResponseObject(request, resolve, reject);
    // Force the current Parse app before the trigger
    _node2.default.applicationId = config.applicationId;
    _node2.default.javascriptKey = config.javascriptKey || '';
    _node2.default.masterKey = config.masterKey;
    trigger(request, response);
  });
};

// Converts a REST-format object to a Parse.Object
// data is either className or an object
function inflate(data, restObject) {
  var copy = (typeof data === 'undefined' ? 'undefined' : _typeof(data)) == 'object' ? data : { className: data };
  for (var key in restObject) {
    copy[key] = restObject[key];
  }
  return _node2.default.Object.fromJSON(copy);
}