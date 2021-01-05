"use strict";

var _node = require("parse/node");

var triggers = _interopRequireWildcard(require("../triggers"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function isParseObjectConstructor(object) {
  return typeof object === 'function' && Object.prototype.hasOwnProperty.call(object, 'className');
}

function getClassName(parseClass) {
  if (parseClass && parseClass.className) {
    return parseClass.className;
  }

  return parseClass;
}
/** @namespace
 * @name Parse
 * @description The Parse SDK.
 *  see [api docs](https://docs.parseplatform.org/js/api) and [guide](https://docs.parseplatform.org/js/guide)
 */

/** @namespace
 * @name Parse.Cloud
 * @memberof Parse
 * @description The Parse Cloud Code SDK.
 */


var ParseCloud = {};
/**
 * Defines a Cloud Function.
 *
 * **Available in Cloud Code only.**
 *
 * ```
 * Parse.Cloud.define('functionName', (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.define('functionName', (request) => {
 *   // code here
 * }, { ...validationObject });
 * ```
 *
 * @static
 * @memberof Parse.Cloud
 * @param {String} name The name of the Cloud Function
 * @param {Function} data The Cloud Function to register. This function can be an async function and should take one parameter a {@link Parse.Cloud.FunctionRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.FunctionRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */

ParseCloud.define = function (functionName, handler, validationHandler) {
  triggers.addFunction(functionName, handler, validationHandler, _node.Parse.applicationId);
};
/**
 * Defines a Background Job.
 *
 * **Available in Cloud Code only.**
 *
 * @method job
 * @name Parse.Cloud.job
 * @param {String} name The name of the Background Job
 * @param {Function} func The Background Job to register. This function can be async should take a single parameters a {@link Parse.Cloud.JobRequest}
 *
 */


ParseCloud.job = function (functionName, handler) {
  triggers.addJob(functionName, handler, _node.Parse.applicationId);
};
/**
 *
 * Registers a before save function.
 *
 * **Available in Cloud Code only.**
 *
 * If you want to use beforeSave for a predefined class in the Parse JavaScript SDK (e.g. {@link Parse.User}), you should pass the class itself and not the String for arg1.
 *
 * ```
 * Parse.Cloud.beforeSave('MyCustomClass', (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.beforeSave(Parse.User, (request) => {
 *   // code here
 * }, { ...validationObject })
 * ```
 *
 * @method beforeSave
 * @name Parse.Cloud.beforeSave
 * @param {(String|Parse.Object)} arg1 The Parse.Object subclass to register the after save function for. This can instead be a String that is the className of the subclass.
 * @param {Function} func The function to run before a save. This function can be async and should take one parameter a {@link Parse.Cloud.TriggerRequest};
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.TriggerRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */


ParseCloud.beforeSave = function (parseClass, handler, validationHandler) {
  var className = getClassName(parseClass);
  triggers.addTrigger(triggers.Types.beforeSave, className, handler, _node.Parse.applicationId, validationHandler);
};
/**
 * Registers a before delete function.
 *
 * **Available in Cloud Code only.**
 *
 * If you want to use beforeDelete for a predefined class in the Parse JavaScript SDK (e.g. {@link Parse.User}), you should pass the class itself and not the String for arg1.
 * ```
 * Parse.Cloud.beforeDelete('MyCustomClass', (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.beforeDelete(Parse.User, (request) => {
 *   // code here
 * }, { ...validationObject })
 *```
 *
 * @method beforeDelete
 * @name Parse.Cloud.beforeDelete
 * @param {(String|Parse.Object)} arg1 The Parse.Object subclass to register the before delete function for. This can instead be a String that is the className of the subclass.
 * @param {Function} func The function to run before a delete. This function can be async and should take one parameter, a {@link Parse.Cloud.TriggerRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.TriggerRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */


ParseCloud.beforeDelete = function (parseClass, handler, validationHandler) {
  var className = getClassName(parseClass);
  triggers.addTrigger(triggers.Types.beforeDelete, className, handler, _node.Parse.applicationId, validationHandler);
};
/**
 *
 * Registers the before login function.
 *
 * **Available in Cloud Code only.**
 *
 * This function provides further control
 * in validating a login attempt. Specifically,
 * it is triggered after a user enters
 * correct credentials (or other valid authData),
 * but prior to a session being generated.
 *
 * ```
 * Parse.Cloud.beforeLogin((request) => {
 *   // code here
 * })
 *
 * ```
 *
 * @method beforeLogin
 * @name Parse.Cloud.beforeLogin
 * @param {Function} func The function to run before a login. This function can be async and should take one parameter a {@link Parse.Cloud.TriggerRequest};
 */


ParseCloud.beforeLogin = function (handler) {
  let className = '_User';

  if (typeof handler === 'string' || isParseObjectConstructor(handler)) {
    // validation will occur downstream, this is to maintain internal
    // code consistency with the other hook types.
    className = getClassName(handler);
    handler = arguments[1];
  }

  triggers.addTrigger(triggers.Types.beforeLogin, className, handler, _node.Parse.applicationId);
};
/**
 *
 * Registers the after login function.
 *
 * **Available in Cloud Code only.**
 *
 * This function is triggered after a user logs in successfully,
 * and after a _Session object has been created.
 *
 * ```
 * Parse.Cloud.afterLogin((request) => {
 *   // code here
 * });
 * ```
 *
 * @method afterLogin
 * @name Parse.Cloud.afterLogin
 * @param {Function} func The function to run after a login. This function can be async and should take one parameter a {@link Parse.Cloud.TriggerRequest};
 */


ParseCloud.afterLogin = function (handler) {
  let className = '_User';

  if (typeof handler === 'string' || isParseObjectConstructor(handler)) {
    // validation will occur downstream, this is to maintain internal
    // code consistency with the other hook types.
    className = getClassName(handler);
    handler = arguments[1];
  }

  triggers.addTrigger(triggers.Types.afterLogin, className, handler, _node.Parse.applicationId);
};
/**
 *
 * Registers the after logout function.
 *
 * **Available in Cloud Code only.**
 *
 * This function is triggered after a user logs out.
 *
 * ```
 * Parse.Cloud.afterLogout((request) => {
 *   // code here
 * });
 * ```
 *
 * @method afterLogout
 * @name Parse.Cloud.afterLogout
 * @param {Function} func The function to run after a logout. This function can be async and should take one parameter a {@link Parse.Cloud.TriggerRequest};
 */


ParseCloud.afterLogout = function (handler) {
  let className = '_Session';

  if (typeof handler === 'string' || isParseObjectConstructor(handler)) {
    // validation will occur downstream, this is to maintain internal
    // code consistency with the other hook types.
    className = getClassName(handler);
    handler = arguments[1];
  }

  triggers.addTrigger(triggers.Types.afterLogout, className, handler, _node.Parse.applicationId);
};
/**
 * Registers an after save function.
 *
 * **Available in Cloud Code only.**
 *
 * If you want to use afterSave for a predefined class in the Parse JavaScript SDK (e.g. {@link Parse.User}), you should pass the class itself and not the String for arg1.
 *
 * ```
 * Parse.Cloud.afterSave('MyCustomClass', async function(request) {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.afterSave(Parse.User, async function(request) {
 *   // code here
 * }, { ...validationObject });
 * ```
 *
 * @method afterSave
 * @name Parse.Cloud.afterSave
 * @param {(String|Parse.Object)} arg1 The Parse.Object subclass to register the after save function for. This can instead be a String that is the className of the subclass.
 * @param {Function} func The function to run after a save. This function can be an async function and should take just one parameter, {@link Parse.Cloud.TriggerRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.TriggerRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */


ParseCloud.afterSave = function (parseClass, handler, validationHandler) {
  var className = getClassName(parseClass);
  triggers.addTrigger(triggers.Types.afterSave, className, handler, _node.Parse.applicationId, validationHandler);
};
/**
 * Registers an after delete function.
 *
 * **Available in Cloud Code only.**
 *
 * If you want to use afterDelete for a predefined class in the Parse JavaScript SDK (e.g. {@link Parse.User}), you should pass the class itself and not the String for arg1.
 * ```
 * Parse.Cloud.afterDelete('MyCustomClass', async (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.afterDelete(Parse.User, async (request) => {
 *   // code here
 * }, { ...validationObject });
 *```
 *
 * @method afterDelete
 * @name Parse.Cloud.afterDelete
 * @param {(String|Parse.Object)} arg1 The Parse.Object subclass to register the after delete function for. This can instead be a String that is the className of the subclass.
 * @param {Function} func The function to run after a delete. This function can be async and should take just one parameter, {@link Parse.Cloud.TriggerRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.TriggerRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */


ParseCloud.afterDelete = function (parseClass, handler, validationHandler) {
  var className = getClassName(parseClass);
  triggers.addTrigger(triggers.Types.afterDelete, className, handler, _node.Parse.applicationId, validationHandler);
};
/**
 * Registers a before find function.
 *
 * **Available in Cloud Code only.**
 *
 * If you want to use beforeFind for a predefined class in the Parse JavaScript SDK (e.g. {@link Parse.User}), you should pass the class itself and not the String for arg1.
 * ```
 * Parse.Cloud.beforeFind('MyCustomClass', async (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.beforeFind(Parse.User, async (request) => {
 *   // code here
 * }, { ...validationObject });
 *```
 *
 * @method beforeFind
 * @name Parse.Cloud.beforeFind
 * @param {(String|Parse.Object)} arg1 The Parse.Object subclass to register the before find function for. This can instead be a String that is the className of the subclass.
 * @param {Function} func The function to run before a find. This function can be async and should take just one parameter, {@link Parse.Cloud.BeforeFindRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.BeforeFindRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */


ParseCloud.beforeFind = function (parseClass, handler, validationHandler) {
  var className = getClassName(parseClass);
  triggers.addTrigger(triggers.Types.beforeFind, className, handler, _node.Parse.applicationId, validationHandler);
};
/**
 * Registers an after find function.
 *
 * **Available in Cloud Code only.**
 *
 * If you want to use afterFind for a predefined class in the Parse JavaScript SDK (e.g. {@link Parse.User}), you should pass the class itself and not the String for arg1.
 * ```
 * Parse.Cloud.afterFind('MyCustomClass', async (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.afterFind(Parse.User, async (request) => {
 *   // code here
 * }, { ...validationObject });
 *```
 *
 * @method afterFind
 * @name Parse.Cloud.afterFind
 * @param {(String|Parse.Object)} arg1 The Parse.Object subclass to register the after find function for. This can instead be a String that is the className of the subclass.
 * @param {Function} func The function to run before a find. This function can be async and should take just one parameter, {@link Parse.Cloud.AfterFindRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.AfterFindRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */


ParseCloud.afterFind = function (parseClass, handler, validationHandler) {
  const className = getClassName(parseClass);
  triggers.addTrigger(triggers.Types.afterFind, className, handler, _node.Parse.applicationId, validationHandler);
};
/**
 * Registers a before save file function.
 *
 * **Available in Cloud Code only.**
 *
 * ```
 * Parse.Cloud.beforeSaveFile(async (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.beforeSaveFile(async (request) => {
 *   // code here
 * }, { ...validationObject });
 *```
 *
 * @method beforeSaveFile
 * @name Parse.Cloud.beforeSaveFile
 * @param {Function} func The function to run before saving a file. This function can be async and should take just one parameter, {@link Parse.Cloud.FileTriggerRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.FileTriggerRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */


ParseCloud.beforeSaveFile = function (handler, validationHandler) {
  triggers.addFileTrigger(triggers.Types.beforeSaveFile, handler, _node.Parse.applicationId, validationHandler);
};
/**
 * Registers an after save file function.
 *
 * **Available in Cloud Code only.**
 *
 * ```
 * Parse.Cloud.afterSaveFile(async (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.afterSaveFile(async (request) => {
 *  // code here
 * }, { ...validationObject });
 *```
 *
 * @method afterSaveFile
 * @name Parse.Cloud.afterSaveFile
 * @param {Function} func The function to run after saving a file. This function can be async and should take just one parameter, {@link Parse.Cloud.FileTriggerRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.FileTriggerRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */


ParseCloud.afterSaveFile = function (handler, validationHandler) {
  triggers.addFileTrigger(triggers.Types.afterSaveFile, handler, _node.Parse.applicationId, validationHandler);
};
/**
 * Registers a before delete file function.
 *
 * **Available in Cloud Code only.**
 *
 * ```
 * Parse.Cloud.beforeDeleteFile(async (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.beforeDeleteFile(async (request) => {
 *   // code here
 * }, { ...validationObject });
 *```
 *
 * @method beforeDeleteFile
 * @name Parse.Cloud.beforeDeleteFile
 * @param {Function} func The function to run before deleting a file. This function can be async and should take just one parameter, {@link Parse.Cloud.FileTriggerRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.FileTriggerRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */


ParseCloud.beforeDeleteFile = function (handler, validationHandler) {
  triggers.addFileTrigger(triggers.Types.beforeDeleteFile, handler, _node.Parse.applicationId, validationHandler);
};
/**
 * Registers an after delete file function.
 *
 * **Available in Cloud Code only.**
 *
 * ```
 * Parse.Cloud.afterDeleteFile(async (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.afterDeleteFile(async (request) => {
 *   // code here
 * }, { ...validationObject });
 *```
 *
 * @method afterDeleteFile
 * @name Parse.Cloud.afterDeleteFile
 * @param {Function} func The function to after before deleting a file. This function can be async and should take just one parameter, {@link Parse.Cloud.FileTriggerRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.FileTriggerRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */


ParseCloud.afterDeleteFile = function (handler, validationHandler) {
  triggers.addFileTrigger(triggers.Types.afterDeleteFile, handler, _node.Parse.applicationId, validationHandler);
};
/**
 * Registers a before live query server connect function.
 *
 * **Available in Cloud Code only.**
 *
 * ```
 * Parse.Cloud.beforeConnect(async (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.beforeConnect(async (request) => {
 *   // code here
 * }, { ...validationObject });
 *```
 *
 * @method beforeConnect
 * @name Parse.Cloud.beforeConnect
 * @param {Function} func The function to before connection is made. This function can be async and should take just one parameter, {@link Parse.Cloud.ConnectTriggerRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.ConnectTriggerRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */


ParseCloud.beforeConnect = function (handler, validationHandler) {
  triggers.addConnectTrigger(triggers.Types.beforeConnect, handler, _node.Parse.applicationId, validationHandler);
};
/**
 * Registers a before live query subscription function.
 *
 * **Available in Cloud Code only.**
 *
 * If you want to use beforeSubscribe for a predefined class in the Parse JavaScript SDK (e.g. {@link Parse.User}), you should pass the class itself and not the String for arg1.
 * ```
 * Parse.Cloud.beforeSubscribe('MyCustomClass', (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.beforeSubscribe(Parse.User, (request) => {
 *   // code here
 * }, { ...validationObject });
 *```
 *
 * @method beforeSubscribe
 * @name Parse.Cloud.beforeSubscribe
 * @param {(String|Parse.Object)} arg1 The Parse.Object subclass to register the before subscription function for. This can instead be a String that is the className of the subclass.
 * @param {Function} func The function to run before a subscription. This function can be async and should take one parameter, a {@link Parse.Cloud.TriggerRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.TriggerRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */


ParseCloud.beforeSubscribe = function (parseClass, handler, validationHandler) {
  var className = getClassName(parseClass);
  triggers.addTrigger(triggers.Types.beforeSubscribe, className, handler, _node.Parse.applicationId, validationHandler);
};

ParseCloud.onLiveQueryEvent = function (handler) {
  triggers.addLiveQueryEventHandler(handler, _node.Parse.applicationId);
};
/**
 * Registers an after live query server event function.
 *
 * **Available in Cloud Code only.**
 *
 * ```
 * Parse.Cloud.afterLiveQueryEvent('MyCustomClass', (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.afterLiveQueryEvent('MyCustomClass', (request) => {
 *   // code here
 * }, { ...validationObject });
 *```
 *
 * @method afterLiveQueryEvent
 * @name Parse.Cloud.afterLiveQueryEvent
 * @param {(String|Parse.Object)} arg1 The Parse.Object subclass to register the after live query event function for. This can instead be a String that is the className of the subclass.
 * @param {Function} func The function to run after a live query event. This function can be async and should take one parameter, a {@link Parse.Cloud.LiveQueryEventTrigger}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.LiveQueryEventTrigger}, or a {@link Parse.Cloud.ValidatorObject}.
 */


ParseCloud.afterLiveQueryEvent = function (parseClass, handler, validationHandler) {
  const className = getClassName(parseClass);
  triggers.addTrigger(triggers.Types.afterEvent, className, handler, _node.Parse.applicationId, validationHandler);
};

ParseCloud._removeAllHooks = () => {
  triggers._unregisterAll();
};

ParseCloud.useMasterKey = () => {
  // eslint-disable-next-line
  console.warn('Parse.Cloud.useMasterKey is deprecated (and has no effect anymore) on parse-server, please refer to the cloud code migration notes: http://docs.parseplatform.org/parse-server/guide/#master-key-must-be-passed-explicitly');
};

ParseCloud.httpRequest = require('./httpRequest');
module.exports = ParseCloud;
/**
 * @interface Parse.Cloud.TriggerRequest
 * @property {String} installationId If set, the installationId triggering the request.
 * @property {Boolean} master If true, means the master key was used.
 * @property {Parse.User} user If set, the user that made the request.
 * @property {Parse.Object} object The object triggering the hook.
 * @property {String} ip The IP address of the client making the request.
 * @property {Object} headers The original HTTP headers for the request.
 * @property {String} triggerName The name of the trigger (`beforeSave`, `afterSave`, ...)
 * @property {Object} log The current logger inside Parse Server.
 * @property {Parse.Object} original If set, the object, as currently stored.
 */

/**
 * @interface Parse.Cloud.FileTriggerRequest
 * @property {String} installationId If set, the installationId triggering the request.
 * @property {Boolean} master If true, means the master key was used.
 * @property {Parse.User} user If set, the user that made the request.
 * @property {Parse.File} file The file that triggered the hook.
 * @property {Integer} fileSize The size of the file in bytes.
 * @property {Integer} contentLength The value from Content-Length header
 * @property {String} ip The IP address of the client making the request.
 * @property {Object} headers The original HTTP headers for the request.
 * @property {String} triggerName The name of the trigger (`beforeSaveFile`, `afterSaveFile`)
 * @property {Object} log The current logger inside Parse Server.
 */

/**
 * @interface Parse.Cloud.ConnectTriggerRequest
 * @property {String} installationId If set, the installationId triggering the request.
 * @property {Boolean} useMasterKey If true, means the master key was used.
 * @property {Parse.User} user If set, the user that made the request.
 * @property {Integer} clients The number of clients connected.
 * @property {Integer} subscriptions The number of subscriptions connected.
 * @property {String} sessionToken If set, the session of the user that made the request.
 */

/**
 * @interface Parse.Cloud.LiveQueryEventTrigger
 * @property {String} installationId If set, the installationId triggering the request.
 * @property {Boolean} useMasterKey If true, means the master key was used.
 * @property {Parse.User} user If set, the user that made the request.
 * @property {String} sessionToken If set, the session of the user that made the request.
 * @property {String} event The live query event that triggered the request.
 * @property {Parse.Object} object The object triggering the hook.
 * @property {Parse.Object} original If set, the object, as currently stored.
 * @property {Integer} clients The number of clients connected.
 * @property {Integer} subscriptions The number of subscriptions connected.
 * @property {Boolean} sendEvent If the LiveQuery event should be sent to the client. Set to false to prevent LiveQuery from pushing to the client.
 */

/**
 * @interface Parse.Cloud.BeforeFindRequest
 * @property {String} installationId If set, the installationId triggering the request.
 * @property {Boolean} master If true, means the master key was used.
 * @property {Parse.User} user If set, the user that made the request.
 * @property {Parse.Query} query The query triggering the hook.
 * @property {String} ip The IP address of the client making the request.
 * @property {Object} headers The original HTTP headers for the request.
 * @property {String} triggerName The name of the trigger (`beforeSave`, `afterSave`, ...)
 * @property {Object} log The current logger inside Parse Server.
 * @property {Boolean} isGet wether the query a `get` or a `find`
 */

/**
 * @interface Parse.Cloud.AfterFindRequest
 * @property {String} installationId If set, the installationId triggering the request.
 * @property {Boolean} master If true, means the master key was used.
 * @property {Parse.User} user If set, the user that made the request.
 * @property {Parse.Query} query The query triggering the hook.
 * @property {Array<Parse.Object>} results The results the query yielded.
 * @property {String} ip The IP address of the client making the request.
 * @property {Object} headers The original HTTP headers for the request.
 * @property {String} triggerName The name of the trigger (`beforeSave`, `afterSave`, ...)
 * @property {Object} log The current logger inside Parse Server.
 */

/**
 * @interface Parse.Cloud.FunctionRequest
 * @property {String} installationId If set, the installationId triggering the request.
 * @property {Boolean} master If true, means the master key was used.
 * @property {Parse.User} user If set, the user that made the request.
 * @property {Object} params The params passed to the cloud function.
 */

/**
 * @interface Parse.Cloud.JobRequest
 * @property {Object} params The params passed to the background job.
 * @property {function} message If message is called with a string argument, will update the current message to be stored in the job status.
 */

/**
 * @interface Parse.Cloud.ValidatorObject
 * @property {Boolean} requireUser whether the cloud trigger requires a user.
 * @property {Boolean} requireMaster whether the cloud trigger requires a master key.
 * @property {Boolean} validateMasterKey whether the validator should run if masterKey is provided. Defaults to false.
 * @property {Boolean} skipWithMasterKey whether the cloud code function should be ignored using a masterKey.
 *
 * @property {Array<String>|Object} requireUserKeys If set, keys required on request.user to make the request.
 * @property {String} requireUserKeys.field If requireUserKeys is an object, name of field to validate on request user
 * @property {Array|function|Any} requireUserKeys.field.options array of options that the field can be, function to validate field, or single value. Throw an error if value is invalid.
 * @property {String} requireUserKeys.field.error custom error message if field is invalid.
 *
 * @property {Object|Array<String>} fields if an array of strings, validator will look for keys in request.params, and throw if not provided. If Object, fields to validate. If the trigger is a cloud function, `request.params` will be validated, otherwise `request.object`.
 * @property {String} fields.field name of field to validate.
 * @property {String} fields.field.type expected type of data for field.
 * @property {Boolean} fields.field.constant whether the field can be modified on the object.
 * @property {Any} fields.field.default default value if field is `null`, or initial value `constant` is `true`.
 * @property {Array|function|Any} fields.field.options array of options that the field can be, function to validate field, or single value. Throw an error if value is invalid.
 * @property {String} fields.field.error custom error message if field is invalid.
 */
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9jbG91ZC1jb2RlL1BhcnNlLkNsb3VkLmpzIl0sIm5hbWVzIjpbImlzUGFyc2VPYmplY3RDb25zdHJ1Y3RvciIsIm9iamVjdCIsIk9iamVjdCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImdldENsYXNzTmFtZSIsInBhcnNlQ2xhc3MiLCJjbGFzc05hbWUiLCJQYXJzZUNsb3VkIiwiZGVmaW5lIiwiZnVuY3Rpb25OYW1lIiwiaGFuZGxlciIsInZhbGlkYXRpb25IYW5kbGVyIiwidHJpZ2dlcnMiLCJhZGRGdW5jdGlvbiIsIlBhcnNlIiwiYXBwbGljYXRpb25JZCIsImpvYiIsImFkZEpvYiIsImJlZm9yZVNhdmUiLCJhZGRUcmlnZ2VyIiwiVHlwZXMiLCJiZWZvcmVEZWxldGUiLCJiZWZvcmVMb2dpbiIsImFyZ3VtZW50cyIsImFmdGVyTG9naW4iLCJhZnRlckxvZ291dCIsImFmdGVyU2F2ZSIsImFmdGVyRGVsZXRlIiwiYmVmb3JlRmluZCIsImFmdGVyRmluZCIsImJlZm9yZVNhdmVGaWxlIiwiYWRkRmlsZVRyaWdnZXIiLCJhZnRlclNhdmVGaWxlIiwiYmVmb3JlRGVsZXRlRmlsZSIsImFmdGVyRGVsZXRlRmlsZSIsImJlZm9yZUNvbm5lY3QiLCJhZGRDb25uZWN0VHJpZ2dlciIsImJlZm9yZVN1YnNjcmliZSIsIm9uTGl2ZVF1ZXJ5RXZlbnQiLCJhZGRMaXZlUXVlcnlFdmVudEhhbmRsZXIiLCJhZnRlckxpdmVRdWVyeUV2ZW50IiwiYWZ0ZXJFdmVudCIsIl9yZW1vdmVBbGxIb29rcyIsIl91bnJlZ2lzdGVyQWxsIiwidXNlTWFzdGVyS2V5IiwiY29uc29sZSIsIndhcm4iLCJodHRwUmVxdWVzdCIsInJlcXVpcmUiLCJtb2R1bGUiLCJleHBvcnRzIl0sIm1hcHBpbmdzIjoiOztBQUFBOztBQUNBOzs7Ozs7QUFFQSxTQUFTQSx3QkFBVCxDQUFrQ0MsTUFBbEMsRUFBMEM7QUFDeEMsU0FBTyxPQUFPQSxNQUFQLEtB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QUMsTUFBTSxDQUFDQyxPQUFQLEdBQWlCM0MsVUFBakI7QUFFQTs7Ozs7Ozs7Ozs7OztBQWFBOzs7Ozs7Ozs7Ozs7OztBQWNBOzs7Ozs7Ozs7O0FBVUE7Ozs7Ozs7Ozs7Ozs7O0FBY0E7Ozs7Ozs7Ozs7Ozs7QUFhQTs7Ozs7Ozs7Ozs7OztBQWFBOzs7Ozs7OztBQVFBOzs7Ozs7QUFNQSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFBhcnNlIH0gZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgKiBhcyB0cmlnZ2VycyBmcm9tICcuLi90cmlnZ2Vycyc7XG5cbmZ1bmN0aW9uIGlzUGFyc2VPYmplY3RDb25zdHJ1Y3RvcihvYmplY3QpIHtcbiAgcmV0dXJuIHR5cGVvZiBvYmplY3QgPT09ICdmdW5jdGlvbicgJiYgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iamVjdCwgJ2NsYXNzTmFtZScpO1xufVxuXG5mdW5jdGlvbiBnZXRDbGFzc05hbWUocGFyc2VDbGFzcykge1xuICBpZiAocGFyc2VDbGFzcyAmJiBwYXJzZUNsYXNzLmNsYXNzTmFtZSkge1xuICAgIHJldHVybiBwYXJzZUNsYXNzLmNsYXNzTmFtZTtcbiAgfVxuICByZXR1cm4gcGFyc2VDbGFzcztcbn1cblxuLyoqIEBuYW1lc3BhY2VcbiAqIEBuYW1lIFBhcnNlXG4gKiBAZGVzY3JpcHRpb24gVGhlIFBhcnNlIFNESy5cbiAqICBzZWUgW2FwaSBkb2NzXShodHRwczovL2RvY3MucGFyc2VwbGF0Zm9ybS5vcmcvanMvYXBpKSBhbmQgW2d1aWRlXShodHRwczovL2RvY3MucGFyc2VwbGF0Zm9ybS5vcmcvanMvZ3VpZGUpXG4gKi9cblxuLyoqIEBuYW1lc3BhY2VcbiAqIEBuYW1lIFBhcnNlLkNsb3VkXG4gKiBAbWVtYmVyb2YgUGFyc2VcbiAqIEBkZXNjcmlwdGlvbiBUaGUgUGFyc2UgQ2xvdWQgQ29kZSBTREsuXG4gKi9cblxudmFyIFBhcnNlQ2xvdWQgPSB7fTtcbi8qKlxuICogRGVmaW5lcyBhIENsb3VkIEZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuZGVmaW5lKCdmdW5jdGlvbk5hbWUnLCAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5kZWZpbmUoJ2Z1bmN0aW9uTmFtZScsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICogYGBgXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlcm9mIFBhcnNlLkNsb3VkXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZSBUaGUgbmFtZSBvZiB0aGUgQ2xvdWQgRnVuY3Rpb25cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGRhdGEgVGhlIENsb3VkIEZ1bmN0aW9uIHRvIHJlZ2lzdGVyLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5GdW5jdGlvblJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5GdW5jdGlvblJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmRlZmluZSA9IGZ1bmN0aW9uIChmdW5jdGlvbk5hbWUsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIHRyaWdnZXJzLmFkZEZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSwgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xufTtcblxuLyoqXG4gKiBEZWZpbmVzIGEgQmFja2dyb3VuZCBKb2IuXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogQG1ldGhvZCBqb2JcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmpvYlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgVGhlIG5hbWUgb2YgdGhlIEJhY2tncm91bmQgSm9iXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBCYWNrZ3JvdW5kIEpvYiB0byByZWdpc3Rlci4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgc2hvdWxkIHRha2UgYSBzaW5nbGUgcGFyYW1ldGVycyBhIHtAbGluayBQYXJzZS5DbG91ZC5Kb2JSZXF1ZXN0fVxuICpcbiAqL1xuUGFyc2VDbG91ZC5qb2IgPSBmdW5jdGlvbiAoZnVuY3Rpb25OYW1lLCBoYW5kbGVyKSB7XG4gIHRyaWdnZXJzLmFkZEpvYihmdW5jdGlvbk5hbWUsIGhhbmRsZXIsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xufTtcblxuLyoqXG4gKlxuICogUmVnaXN0ZXJzIGEgYmVmb3JlIHNhdmUgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogSWYgeW91IHdhbnQgdG8gdXNlIGJlZm9yZVNhdmUgZm9yIGEgcHJlZGVmaW5lZCBjbGFzcyBpbiB0aGUgUGFyc2UgSmF2YVNjcmlwdCBTREsgKGUuZy4ge0BsaW5rIFBhcnNlLlVzZXJ9KSwgeW91IHNob3VsZCBwYXNzIHRoZSBjbGFzcyBpdHNlbGYgYW5kIG5vdCB0aGUgU3RyaW5nIGZvciBhcmcxLlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYmVmb3JlU2F2ZSgnTXlDdXN0b21DbGFzcycsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZVNhdmUoUGFyc2UuVXNlciwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSlcbiAqIGBgYFxuICpcbiAqIEBtZXRob2QgYmVmb3JlU2F2ZVxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlU2F2ZVxuICogQHBhcmFtIHsoU3RyaW5nfFBhcnNlLk9iamVjdCl9IGFyZzEgVGhlIFBhcnNlLk9iamVjdCBzdWJjbGFzcyB0byByZWdpc3RlciB0aGUgYWZ0ZXIgc2F2ZSBmdW5jdGlvbiBmb3IuIFRoaXMgY2FuIGluc3RlYWQgYmUgYSBTdHJpbmcgdGhhdCBpcyB0aGUgY2xhc3NOYW1lIG9mIHRoZSBzdWJjbGFzcy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBiZWZvcmUgYSBzYXZlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH07XG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5iZWZvcmVTYXZlID0gZnVuY3Rpb24gKHBhcnNlQ2xhc3MsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIHZhciBjbGFzc05hbWUgPSBnZXRDbGFzc05hbWUocGFyc2VDbGFzcyk7XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlU2F2ZSxcbiAgICBjbGFzc05hbWUsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgIHZhbGlkYXRpb25IYW5kbGVyXG4gICk7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhIGJlZm9yZSBkZWxldGUgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogSWYgeW91IHdhbnQgdG8gdXNlIGJlZm9yZURlbGV0ZSBmb3IgYSBwcmVkZWZpbmVkIGNsYXNzIGluIHRoZSBQYXJzZSBKYXZhU2NyaXB0IFNESyAoZS5nLiB7QGxpbmsgUGFyc2UuVXNlcn0pLCB5b3Ugc2hvdWxkIHBhc3MgdGhlIGNsYXNzIGl0c2VsZiBhbmQgbm90IHRoZSBTdHJpbmcgZm9yIGFyZzEuXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZURlbGV0ZSgnTXlDdXN0b21DbGFzcycsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZURlbGV0ZShQYXJzZS5Vc2VyLCAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KVxuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGJlZm9yZURlbGV0ZVxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlRGVsZXRlXG4gKiBAcGFyYW0geyhTdHJpbmd8UGFyc2UuT2JqZWN0KX0gYXJnMSBUaGUgUGFyc2UuT2JqZWN0IHN1YmNsYXNzIHRvIHJlZ2lzdGVyIHRoZSBiZWZvcmUgZGVsZXRlIGZ1bmN0aW9uIGZvci4gVGhpcyBjYW4gaW5zdGVhZCBiZSBhIFN0cmluZyB0aGF0IGlzIHRoZSBjbGFzc05hbWUgb2YgdGhlIHN1YmNsYXNzLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGJlZm9yZSBhIGRlbGV0ZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIsIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmJlZm9yZURlbGV0ZSA9IGZ1bmN0aW9uIChwYXJzZUNsYXNzLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICB2YXIgY2xhc3NOYW1lID0gZ2V0Q2xhc3NOYW1lKHBhcnNlQ2xhc3MpO1xuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZURlbGV0ZSxcbiAgICBjbGFzc05hbWUsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgIHZhbGlkYXRpb25IYW5kbGVyXG4gICk7XG59O1xuXG4vKipcbiAqXG4gKiBSZWdpc3RlcnMgdGhlIGJlZm9yZSBsb2dpbiBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBUaGlzIGZ1bmN0aW9uIHByb3ZpZGVzIGZ1cnRoZXIgY29udHJvbFxuICogaW4gdmFsaWRhdGluZyBhIGxvZ2luIGF0dGVtcHQuIFNwZWNpZmljYWxseSxcbiAqIGl0IGlzIHRyaWdnZXJlZCBhZnRlciBhIHVzZXIgZW50ZXJzXG4gKiBjb3JyZWN0IGNyZWRlbnRpYWxzIChvciBvdGhlciB2YWxpZCBhdXRoRGF0YSksXG4gKiBidXQgcHJpb3IgdG8gYSBzZXNzaW9uIGJlaW5nIGdlbmVyYXRlZC5cbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZUxvZ2luKChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSlcbiAqXG4gKiBgYGBcbiAqXG4gKiBAbWV0aG9kIGJlZm9yZUxvZ2luXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5iZWZvcmVMb2dpblxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGJlZm9yZSBhIGxvZ2luLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH07XG4gKi9cblBhcnNlQ2xvdWQuYmVmb3JlTG9naW4gPSBmdW5jdGlvbiAoaGFuZGxlcikge1xuICBsZXQgY2xhc3NOYW1lID0gJ19Vc2VyJztcbiAgaWYgKHR5cGVvZiBoYW5kbGVyID09PSAnc3RyaW5nJyB8fCBpc1BhcnNlT2JqZWN0Q29uc3RydWN0b3IoaGFuZGxlcikpIHtcbiAgICAvLyB2YWxpZGF0aW9uIHdpbGwgb2NjdXIgZG93bnN0cmVhbSwgdGhpcyBpcyB0byBtYWludGFpbiBpbnRlcm5hbFxuICAgIC8vIGNvZGUgY29uc2lzdGVuY3kgd2l0aCB0aGUgb3RoZXIgaG9vayB0eXBlcy5cbiAgICBjbGFzc05hbWUgPSBnZXRDbGFzc05hbWUoaGFuZGxlcik7XG4gICAgaGFuZGxlciA9IGFyZ3VtZW50c1sxXTtcbiAgfVxuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKHRyaWdnZXJzLlR5cGVzLmJlZm9yZUxvZ2luLCBjbGFzc05hbWUsIGhhbmRsZXIsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xufTtcblxuLyoqXG4gKlxuICogUmVnaXN0ZXJzIHRoZSBhZnRlciBsb2dpbiBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBUaGlzIGZ1bmN0aW9uIGlzIHRyaWdnZXJlZCBhZnRlciBhIHVzZXIgbG9ncyBpbiBzdWNjZXNzZnVsbHksXG4gKiBhbmQgYWZ0ZXIgYSBfU2Vzc2lvbiBvYmplY3QgaGFzIGJlZW4gY3JlYXRlZC5cbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmFmdGVyTG9naW4oKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9KTtcbiAqIGBgYFxuICpcbiAqIEBtZXRob2QgYWZ0ZXJMb2dpblxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYWZ0ZXJMb2dpblxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGFmdGVyIGEgbG9naW4uIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fTtcbiAqL1xuUGFyc2VDbG91ZC5hZnRlckxvZ2luID0gZnVuY3Rpb24gKGhhbmRsZXIpIHtcbiAgbGV0IGNsYXNzTmFtZSA9ICdfVXNlcic7XG4gIGlmICh0eXBlb2YgaGFuZGxlciA9PT0gJ3N0cmluZycgfHwgaXNQYXJzZU9iamVjdENvbnN0cnVjdG9yKGhhbmRsZXIpKSB7XG4gICAgLy8gdmFsaWRhdGlvbiB3aWxsIG9jY3VyIGRvd25zdHJlYW0sIHRoaXMgaXMgdG8gbWFpbnRhaW4gaW50ZXJuYWxcbiAgICAvLyBjb2RlIGNvbnNpc3RlbmN5IHdpdGggdGhlIG90aGVyIGhvb2sgdHlwZXMuXG4gICAgY2xhc3NOYW1lID0gZ2V0Q2xhc3NOYW1lKGhhbmRsZXIpO1xuICAgIGhhbmRsZXIgPSBhcmd1bWVudHNbMV07XG4gIH1cbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcih0cmlnZ2Vycy5UeXBlcy5hZnRlckxvZ2luLCBjbGFzc05hbWUsIGhhbmRsZXIsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xufTtcblxuLyoqXG4gKlxuICogUmVnaXN0ZXJzIHRoZSBhZnRlciBsb2dvdXQgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogVGhpcyBmdW5jdGlvbiBpcyB0cmlnZ2VyZWQgYWZ0ZXIgYSB1c2VyIGxvZ3Mgb3V0LlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJMb2dvdXQoKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9KTtcbiAqIGBgYFxuICpcbiAqIEBtZXRob2QgYWZ0ZXJMb2dvdXRcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmFmdGVyTG9nb3V0XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYWZ0ZXIgYSBsb2dvdXQuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fTtcbiAqL1xuUGFyc2VDbG91ZC5hZnRlckxvZ291dCA9IGZ1bmN0aW9uIChoYW5kbGVyKSB7XG4gIGxldCBjbGFzc05hbWUgPSAnX1Nlc3Npb24nO1xuICBpZiAodHlwZW9mIGhhbmRsZXIgPT09ICdzdHJpbmcnIHx8IGlzUGFyc2VPYmplY3RDb25zdHJ1Y3RvcihoYW5kbGVyKSkge1xuICAgIC8vIHZhbGlkYXRpb24gd2lsbCBvY2N1ciBkb3duc3RyZWFtLCB0aGlzIGlzIHRvIG1haW50YWluIGludGVybmFsXG4gICAgLy8gY29kZSBjb25zaXN0ZW5jeSB3aXRoIHRoZSBvdGhlciBob29rIHR5cGVzLlxuICAgIGNsYXNzTmFtZSA9IGdldENsYXNzTmFtZShoYW5kbGVyKTtcbiAgICBoYW5kbGVyID0gYXJndW1lbnRzWzFdO1xuICB9XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIodHJpZ2dlcnMuVHlwZXMuYWZ0ZXJMb2dvdXQsIGNsYXNzTmFtZSwgaGFuZGxlciwgUGFyc2UuYXBwbGljYXRpb25JZCk7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhbiBhZnRlciBzYXZlIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIElmIHlvdSB3YW50IHRvIHVzZSBhZnRlclNhdmUgZm9yIGEgcHJlZGVmaW5lZCBjbGFzcyBpbiB0aGUgUGFyc2UgSmF2YVNjcmlwdCBTREsgKGUuZy4ge0BsaW5rIFBhcnNlLlVzZXJ9KSwgeW91IHNob3VsZCBwYXNzIHRoZSBjbGFzcyBpdHNlbGYgYW5kIG5vdCB0aGUgU3RyaW5nIGZvciBhcmcxLlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJTYXZlKCdNeUN1c3RvbUNsYXNzJywgYXN5bmMgZnVuY3Rpb24ocmVxdWVzdCkge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5hZnRlclNhdmUoUGFyc2UuVXNlciwgYXN5bmMgZnVuY3Rpb24ocmVxdWVzdCkge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KTtcbiAqIGBgYFxuICpcbiAqIEBtZXRob2QgYWZ0ZXJTYXZlXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5hZnRlclNhdmVcbiAqIEBwYXJhbSB7KFN0cmluZ3xQYXJzZS5PYmplY3QpfSBhcmcxIFRoZSBQYXJzZS5PYmplY3Qgc3ViY2xhc3MgdG8gcmVnaXN0ZXIgdGhlIGFmdGVyIHNhdmUgZnVuY3Rpb24gZm9yLiBUaGlzIGNhbiBpbnN0ZWFkIGJlIGEgU3RyaW5nIHRoYXQgaXMgdGhlIGNsYXNzTmFtZSBvZiB0aGUgc3ViY2xhc3MuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYWZ0ZXIgYSBzYXZlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2UganVzdCBvbmUgcGFyYW1ldGVyLCB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYWZ0ZXJTYXZlID0gZnVuY3Rpb24gKHBhcnNlQ2xhc3MsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIHZhciBjbGFzc05hbWUgPSBnZXRDbGFzc05hbWUocGFyc2VDbGFzcyk7XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJTYXZlLFxuICAgIGNsYXNzTmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXJcbiAgKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGFuIGFmdGVyIGRlbGV0ZSBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBJZiB5b3Ugd2FudCB0byB1c2UgYWZ0ZXJEZWxldGUgZm9yIGEgcHJlZGVmaW5lZCBjbGFzcyBpbiB0aGUgUGFyc2UgSmF2YVNjcmlwdCBTREsgKGUuZy4ge0BsaW5rIFBhcnNlLlVzZXJ9KSwgeW91IHNob3VsZCBwYXNzIHRoZSBjbGFzcyBpdHNlbGYgYW5kIG5vdCB0aGUgU3RyaW5nIGZvciBhcmcxLlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5hZnRlckRlbGV0ZSgnTXlDdXN0b21DbGFzcycsIGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmFmdGVyRGVsZXRlKFBhcnNlLlVzZXIsIGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGFmdGVyRGVsZXRlXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5hZnRlckRlbGV0ZVxuICogQHBhcmFtIHsoU3RyaW5nfFBhcnNlLk9iamVjdCl9IGFyZzEgVGhlIFBhcnNlLk9iamVjdCBzdWJjbGFzcyB0byByZWdpc3RlciB0aGUgYWZ0ZXIgZGVsZXRlIGZ1bmN0aW9uIGZvci4gVGhpcyBjYW4gaW5zdGVhZCBiZSBhIFN0cmluZyB0aGF0IGlzIHRoZSBjbGFzc05hbWUgb2YgdGhlIHN1YmNsYXNzLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGFmdGVyIGEgZGVsZXRlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2UganVzdCBvbmUgcGFyYW1ldGVyLCB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYWZ0ZXJEZWxldGUgPSBmdW5jdGlvbiAocGFyc2VDbGFzcywgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgdmFyIGNsYXNzTmFtZSA9IGdldENsYXNzTmFtZShwYXJzZUNsYXNzKTtcbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlckRlbGV0ZSxcbiAgICBjbGFzc05hbWUsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgIHZhbGlkYXRpb25IYW5kbGVyXG4gICk7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhIGJlZm9yZSBmaW5kIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIElmIHlvdSB3YW50IHRvIHVzZSBiZWZvcmVGaW5kIGZvciBhIHByZWRlZmluZWQgY2xhc3MgaW4gdGhlIFBhcnNlIEphdmFTY3JpcHQgU0RLIChlLmcuIHtAbGluayBQYXJzZS5Vc2VyfSksIHlvdSBzaG91bGQgcGFzcyB0aGUgY2xhc3MgaXRzZWxmIGFuZCBub3QgdGhlIFN0cmluZyBmb3IgYXJnMS5cbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYmVmb3JlRmluZCgnTXlDdXN0b21DbGFzcycsIGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZUZpbmQoUGFyc2UuVXNlciwgYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYmVmb3JlRmluZFxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlRmluZFxuICogQHBhcmFtIHsoU3RyaW5nfFBhcnNlLk9iamVjdCl9IGFyZzEgVGhlIFBhcnNlLk9iamVjdCBzdWJjbGFzcyB0byByZWdpc3RlciB0aGUgYmVmb3JlIGZpbmQgZnVuY3Rpb24gZm9yLiBUaGlzIGNhbiBpbnN0ZWFkIGJlIGEgU3RyaW5nIHRoYXQgaXMgdGhlIGNsYXNzTmFtZSBvZiB0aGUgc3ViY2xhc3MuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYmVmb3JlIGEgZmluZC4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIGp1c3Qgb25lIHBhcmFtZXRlciwge0BsaW5rIFBhcnNlLkNsb3VkLkJlZm9yZUZpbmRSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuQmVmb3JlRmluZFJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmJlZm9yZUZpbmQgPSBmdW5jdGlvbiAocGFyc2VDbGFzcywgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgdmFyIGNsYXNzTmFtZSA9IGdldENsYXNzTmFtZShwYXJzZUNsYXNzKTtcbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVGaW5kLFxuICAgIGNsYXNzTmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXJcbiAgKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGFuIGFmdGVyIGZpbmQgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogSWYgeW91IHdhbnQgdG8gdXNlIGFmdGVyRmluZCBmb3IgYSBwcmVkZWZpbmVkIGNsYXNzIGluIHRoZSBQYXJzZSBKYXZhU2NyaXB0IFNESyAoZS5nLiB7QGxpbmsgUGFyc2UuVXNlcn0pLCB5b3Ugc2hvdWxkIHBhc3MgdGhlIGNsYXNzIGl0c2VsZiBhbmQgbm90IHRoZSBTdHJpbmcgZm9yIGFyZzEuXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmFmdGVyRmluZCgnTXlDdXN0b21DbGFzcycsIGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmFmdGVyRmluZChQYXJzZS5Vc2VyLCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KTtcbiAqYGBgXG4gKlxuICogQG1ldGhvZCBhZnRlckZpbmRcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmFmdGVyRmluZFxuICogQHBhcmFtIHsoU3RyaW5nfFBhcnNlLk9iamVjdCl9IGFyZzEgVGhlIFBhcnNlLk9iamVjdCBzdWJjbGFzcyB0byByZWdpc3RlciB0aGUgYWZ0ZXIgZmluZCBmdW5jdGlvbiBmb3IuIFRoaXMgY2FuIGluc3RlYWQgYmUgYSBTdHJpbmcgdGhhdCBpcyB0aGUgY2xhc3NOYW1lIG9mIHRoZSBzdWJjbGFzcy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBiZWZvcmUgYSBmaW5kLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2UganVzdCBvbmUgcGFyYW1ldGVyLCB7QGxpbmsgUGFyc2UuQ2xvdWQuQWZ0ZXJGaW5kUmVxdWVzdH0uXG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLkFmdGVyRmluZFJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmFmdGVyRmluZCA9IGZ1bmN0aW9uIChwYXJzZUNsYXNzLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBjb25zdCBjbGFzc05hbWUgPSBnZXRDbGFzc05hbWUocGFyc2VDbGFzcyk7XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJGaW5kLFxuICAgIGNsYXNzTmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXJcbiAgKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGEgYmVmb3JlIHNhdmUgZmlsZSBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZVNhdmVGaWxlKGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZVNhdmVGaWxlKGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGJlZm9yZVNhdmVGaWxlXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5iZWZvcmVTYXZlRmlsZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGJlZm9yZSBzYXZpbmcgYSBmaWxlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2UganVzdCBvbmUgcGFyYW1ldGVyLCB7QGxpbmsgUGFyc2UuQ2xvdWQuRmlsZVRyaWdnZXJSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuRmlsZVRyaWdnZXJSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5iZWZvcmVTYXZlRmlsZSA9IGZ1bmN0aW9uIChoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICB0cmlnZ2Vycy5hZGRGaWxlVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVTYXZlRmlsZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXJcbiAgKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGFuIGFmdGVyIHNhdmUgZmlsZSBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmFmdGVyU2F2ZUZpbGUoYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJTYXZlRmlsZShhc3luYyAocmVxdWVzdCkgPT4ge1xuICogIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGFmdGVyU2F2ZUZpbGVcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmFmdGVyU2F2ZUZpbGVcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBhZnRlciBzYXZpbmcgYSBmaWxlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2UganVzdCBvbmUgcGFyYW1ldGVyLCB7QGxpbmsgUGFyc2UuQ2xvdWQuRmlsZVRyaWdnZXJSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuRmlsZVRyaWdnZXJSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5hZnRlclNhdmVGaWxlID0gZnVuY3Rpb24gKGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIHRyaWdnZXJzLmFkZEZpbGVUcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyU2F2ZUZpbGUsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgIHZhbGlkYXRpb25IYW5kbGVyXG4gICk7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhIGJlZm9yZSBkZWxldGUgZmlsZSBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZURlbGV0ZUZpbGUoYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYmVmb3JlRGVsZXRlRmlsZShhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KTtcbiAqYGBgXG4gKlxuICogQG1ldGhvZCBiZWZvcmVEZWxldGVGaWxlXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5iZWZvcmVEZWxldGVGaWxlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYmVmb3JlIGRlbGV0aW5nIGEgZmlsZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIGp1c3Qgb25lIHBhcmFtZXRlciwge0BsaW5rIFBhcnNlLkNsb3VkLkZpbGVUcmlnZ2VyUmVxdWVzdH0uXG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLkZpbGVUcmlnZ2VyUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYmVmb3JlRGVsZXRlRmlsZSA9IGZ1bmN0aW9uIChoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICB0cmlnZ2Vycy5hZGRGaWxlVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVEZWxldGVGaWxlLFxuICAgIGhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICB2YWxpZGF0aW9uSGFuZGxlclxuICApO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYW4gYWZ0ZXIgZGVsZXRlIGZpbGUgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5hZnRlckRlbGV0ZUZpbGUoYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJEZWxldGVGaWxlKGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGFmdGVyRGVsZXRlRmlsZVxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYWZ0ZXJEZWxldGVGaWxlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBhZnRlciBiZWZvcmUgZGVsZXRpbmcgYSBmaWxlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2UganVzdCBvbmUgcGFyYW1ldGVyLCB7QGxpbmsgUGFyc2UuQ2xvdWQuRmlsZVRyaWdnZXJSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuRmlsZVRyaWdnZXJSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5hZnRlckRlbGV0ZUZpbGUgPSBmdW5jdGlvbiAoaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgdHJpZ2dlcnMuYWRkRmlsZVRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJEZWxldGVGaWxlLFxuICAgIGhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICB2YWxpZGF0aW9uSGFuZGxlclxuICApO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYSBiZWZvcmUgbGl2ZSBxdWVyeSBzZXJ2ZXIgY29ubmVjdCBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZUNvbm5lY3QoYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYmVmb3JlQ29ubmVjdChhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KTtcbiAqYGBgXG4gKlxuICogQG1ldGhvZCBiZWZvcmVDb25uZWN0XG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5iZWZvcmVDb25uZWN0XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBiZWZvcmUgY29ubmVjdGlvbiBpcyBtYWRlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2UganVzdCBvbmUgcGFyYW1ldGVyLCB7QGxpbmsgUGFyc2UuQ2xvdWQuQ29ubmVjdFRyaWdnZXJSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuQ29ubmVjdFRyaWdnZXJSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5iZWZvcmVDb25uZWN0ID0gZnVuY3Rpb24gKGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIHRyaWdnZXJzLmFkZENvbm5lY3RUcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZUNvbm5lY3QsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgIHZhbGlkYXRpb25IYW5kbGVyXG4gICk7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhIGJlZm9yZSBsaXZlIHF1ZXJ5IHN1YnNjcmlwdGlvbiBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBJZiB5b3Ugd2FudCB0byB1c2UgYmVmb3JlU3Vic2NyaWJlIGZvciBhIHByZWRlZmluZWQgY2xhc3MgaW4gdGhlIFBhcnNlIEphdmFTY3JpcHQgU0RLIChlLmcuIHtAbGluayBQYXJzZS5Vc2VyfSksIHlvdSBzaG91bGQgcGFzcyB0aGUgY2xhc3MgaXRzZWxmIGFuZCBub3QgdGhlIFN0cmluZyBmb3IgYXJnMS5cbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYmVmb3JlU3Vic2NyaWJlKCdNeUN1c3RvbUNsYXNzJywgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYmVmb3JlU3Vic2NyaWJlKFBhcnNlLlVzZXIsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGJlZm9yZVN1YnNjcmliZVxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlU3Vic2NyaWJlXG4gKiBAcGFyYW0geyhTdHJpbmd8UGFyc2UuT2JqZWN0KX0gYXJnMSBUaGUgUGFyc2UuT2JqZWN0IHN1YmNsYXNzIHRvIHJlZ2lzdGVyIHRoZSBiZWZvcmUgc3Vic2NyaXB0aW9uIGZ1bmN0aW9uIGZvci4gVGhpcyBjYW4gaW5zdGVhZCBiZSBhIFN0cmluZyB0aGF0IGlzIHRoZSBjbGFzc05hbWUgb2YgdGhlIHN1YmNsYXNzLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGJlZm9yZSBhIHN1YnNjcmlwdGlvbi4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIsIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmJlZm9yZVN1YnNjcmliZSA9IGZ1bmN0aW9uIChwYXJzZUNsYXNzLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICB2YXIgY2xhc3NOYW1lID0gZ2V0Q2xhc3NOYW1lKHBhcnNlQ2xhc3MpO1xuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZVN1YnNjcmliZSxcbiAgICBjbGFzc05hbWUsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgIHZhbGlkYXRpb25IYW5kbGVyXG4gICk7XG59O1xuXG5QYXJzZUNsb3VkLm9uTGl2ZVF1ZXJ5RXZlbnQgPSBmdW5jdGlvbiAoaGFuZGxlcikge1xuICB0cmlnZ2Vycy5hZGRMaXZlUXVlcnlFdmVudEhhbmRsZXIoaGFuZGxlciwgUGFyc2UuYXBwbGljYXRpb25JZCk7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhbiBhZnRlciBsaXZlIHF1ZXJ5IHNlcnZlciBldmVudCBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmFmdGVyTGl2ZVF1ZXJ5RXZlbnQoJ015Q3VzdG9tQ2xhc3MnLCAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5hZnRlckxpdmVRdWVyeUV2ZW50KCdNeUN1c3RvbUNsYXNzJywgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYWZ0ZXJMaXZlUXVlcnlFdmVudFxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYWZ0ZXJMaXZlUXVlcnlFdmVudFxuICogQHBhcmFtIHsoU3RyaW5nfFBhcnNlLk9iamVjdCl9IGFyZzEgVGhlIFBhcnNlLk9iamVjdCBzdWJjbGFzcyB0byByZWdpc3RlciB0aGUgYWZ0ZXIgbGl2ZSBxdWVyeSBldmVudCBmdW5jdGlvbiBmb3IuIFRoaXMgY2FuIGluc3RlYWQgYmUgYSBTdHJpbmcgdGhhdCBpcyB0aGUgY2xhc3NOYW1lIG9mIHRoZSBzdWJjbGFzcy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBhZnRlciBhIGxpdmUgcXVlcnkgZXZlbnQuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyLCBhIHtAbGluayBQYXJzZS5DbG91ZC5MaXZlUXVlcnlFdmVudFRyaWdnZXJ9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5MaXZlUXVlcnlFdmVudFRyaWdnZXJ9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmFmdGVyTGl2ZVF1ZXJ5RXZlbnQgPSBmdW5jdGlvbiAocGFyc2VDbGFzcywgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgY29uc3QgY2xhc3NOYW1lID0gZ2V0Q2xhc3NOYW1lKHBhcnNlQ2xhc3MpO1xuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRXZlbnQsXG4gICAgY2xhc3NOYW1lLFxuICAgIGhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICB2YWxpZGF0aW9uSGFuZGxlclxuICApO1xufTtcblxuUGFyc2VDbG91ZC5fcmVtb3ZlQWxsSG9va3MgPSAoKSA9PiB7XG4gIHRyaWdnZXJzLl91bnJlZ2lzdGVyQWxsKCk7XG59O1xuXG5QYXJzZUNsb3VkLnVzZU1hc3RlcktleSA9ICgpID0+IHtcbiAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lXG4gIGNvbnNvbGUud2FybihcbiAgICAnUGFyc2UuQ2xvdWQudXNlTWFzdGVyS2V5IGlzIGRlcHJlY2F0ZWQgKGFuZCBoYXMgbm8gZWZmZWN0IGFueW1vcmUpIG9uIHBhcnNlLXNlcnZlciwgcGxlYXNlIHJlZmVyIHRvIHRoZSBjbG91ZCBjb2RlIG1pZ3JhdGlvbiBub3RlczogaHR0cDovL2RvY3MucGFyc2VwbGF0Zm9ybS5vcmcvcGFyc2Utc2VydmVyL2d1aWRlLyNtYXN0ZXIta2V5LW11c3QtYmUtcGFzc2VkLWV4cGxpY2l0bHknXG4gICk7XG59O1xuXG5QYXJzZUNsb3VkLmh0dHBSZXF1ZXN0ID0gcmVxdWlyZSgnLi9odHRwUmVxdWVzdCcpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFBhcnNlQ2xvdWQ7XG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdFxuICogQHByb3BlcnR5IHtTdHJpbmd9IGluc3RhbGxhdGlvbklkIElmIHNldCwgdGhlIGluc3RhbGxhdGlvbklkIHRyaWdnZXJpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IG1hc3RlciBJZiB0cnVlLCBtZWFucyB0aGUgbWFzdGVyIGtleSB3YXMgdXNlZC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuVXNlcn0gdXNlciBJZiBzZXQsIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuT2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0cmlnZ2VyaW5nIHRoZSBob29rLlxuICogQHByb3BlcnR5IHtTdHJpbmd9IGlwIFRoZSBJUCBhZGRyZXNzIG9mIHRoZSBjbGllbnQgbWFraW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtPYmplY3R9IGhlYWRlcnMgVGhlIG9yaWdpbmFsIEhUVFAgaGVhZGVycyBmb3IgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gdHJpZ2dlck5hbWUgVGhlIG5hbWUgb2YgdGhlIHRyaWdnZXIgKGBiZWZvcmVTYXZlYCwgYGFmdGVyU2F2ZWAsIC4uLilcbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBsb2cgVGhlIGN1cnJlbnQgbG9nZ2VyIGluc2lkZSBQYXJzZSBTZXJ2ZXIuXG4gKiBAcHJvcGVydHkge1BhcnNlLk9iamVjdH0gb3JpZ2luYWwgSWYgc2V0LCB0aGUgb2JqZWN0LCBhcyBjdXJyZW50bHkgc3RvcmVkLlxuICovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5GaWxlVHJpZ2dlclJlcXVlc3RcbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpbnN0YWxsYXRpb25JZCBJZiBzZXQsIHRoZSBpbnN0YWxsYXRpb25JZCB0cmlnZ2VyaW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtCb29sZWFufSBtYXN0ZXIgSWYgdHJ1ZSwgbWVhbnMgdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4gKiBAcHJvcGVydHkge1BhcnNlLlVzZXJ9IHVzZXIgSWYgc2V0LCB0aGUgdXNlciB0aGF0IG1hZGUgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1BhcnNlLkZpbGV9IGZpbGUgVGhlIGZpbGUgdGhhdCB0cmlnZ2VyZWQgdGhlIGhvb2suXG4gKiBAcHJvcGVydHkge0ludGVnZXJ9IGZpbGVTaXplIFRoZSBzaXplIG9mIHRoZSBmaWxlIGluIGJ5dGVzLlxuICogQHByb3BlcnR5IHtJbnRlZ2VyfSBjb250ZW50TGVuZ3RoIFRoZSB2YWx1ZSBmcm9tIENvbnRlbnQtTGVuZ3RoIGhlYWRlclxuICogQHByb3BlcnR5IHtTdHJpbmd9IGlwIFRoZSBJUCBhZGRyZXNzIG9mIHRoZSBjbGllbnQgbWFraW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtPYmplY3R9IGhlYWRlcnMgVGhlIG9yaWdpbmFsIEhUVFAgaGVhZGVycyBmb3IgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gdHJpZ2dlck5hbWUgVGhlIG5hbWUgb2YgdGhlIHRyaWdnZXIgKGBiZWZvcmVTYXZlRmlsZWAsIGBhZnRlclNhdmVGaWxlYClcbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBsb2cgVGhlIGN1cnJlbnQgbG9nZ2VyIGluc2lkZSBQYXJzZSBTZXJ2ZXIuXG4gKi9cblxuLyoqXG4gKiBAaW50ZXJmYWNlIFBhcnNlLkNsb3VkLkNvbm5lY3RUcmlnZ2VyUmVxdWVzdFxuICogQHByb3BlcnR5IHtTdHJpbmd9IGluc3RhbGxhdGlvbklkIElmIHNldCwgdGhlIGluc3RhbGxhdGlvbklkIHRyaWdnZXJpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IHVzZU1hc3RlcktleSBJZiB0cnVlLCBtZWFucyB0aGUgbWFzdGVyIGtleSB3YXMgdXNlZC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuVXNlcn0gdXNlciBJZiBzZXQsIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7SW50ZWdlcn0gY2xpZW50cyBUaGUgbnVtYmVyIG9mIGNsaWVudHMgY29ubmVjdGVkLlxuICogQHByb3BlcnR5IHtJbnRlZ2VyfSBzdWJzY3JpcHRpb25zIFRoZSBudW1iZXIgb2Ygc3Vic2NyaXB0aW9ucyBjb25uZWN0ZWQuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gc2Vzc2lvblRva2VuIElmIHNldCwgdGhlIHNlc3Npb24gb2YgdGhlIHVzZXIgdGhhdCBtYWRlIHRoZSByZXF1ZXN0LlxuICovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5MaXZlUXVlcnlFdmVudFRyaWdnZXJcbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpbnN0YWxsYXRpb25JZCBJZiBzZXQsIHRoZSBpbnN0YWxsYXRpb25JZCB0cmlnZ2VyaW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtCb29sZWFufSB1c2VNYXN0ZXJLZXkgSWYgdHJ1ZSwgbWVhbnMgdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4gKiBAcHJvcGVydHkge1BhcnNlLlVzZXJ9IHVzZXIgSWYgc2V0LCB0aGUgdXNlciB0aGF0IG1hZGUgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gc2Vzc2lvblRva2VuIElmIHNldCwgdGhlIHNlc3Npb24gb2YgdGhlIHVzZXIgdGhhdCBtYWRlIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtTdHJpbmd9IGV2ZW50IFRoZSBsaXZlIHF1ZXJ5IGV2ZW50IHRoYXQgdHJpZ2dlcmVkIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtQYXJzZS5PYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRyaWdnZXJpbmcgdGhlIGhvb2suXG4gKiBAcHJvcGVydHkge1BhcnNlLk9iamVjdH0gb3JpZ2luYWwgSWYgc2V0LCB0aGUgb2JqZWN0LCBhcyBjdXJyZW50bHkgc3RvcmVkLlxuICogQHByb3BlcnR5IHtJbnRlZ2VyfSBjbGllbnRzIFRoZSBudW1iZXIgb2YgY2xpZW50cyBjb25uZWN0ZWQuXG4gKiBAcHJvcGVydHkge0ludGVnZXJ9IHN1YnNjcmlwdGlvbnMgVGhlIG51bWJlciBvZiBzdWJzY3JpcHRpb25zIGNvbm5lY3RlZC5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gc2VuZEV2ZW50IElmIHRoZSBMaXZlUXVlcnkgZXZlbnQgc2hvdWxkIGJlIHNlbnQgdG8gdGhlIGNsaWVudC4gU2V0IHRvIGZhbHNlIHRvIHByZXZlbnQgTGl2ZVF1ZXJ5IGZyb20gcHVzaGluZyB0byB0aGUgY2xpZW50LlxuICovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5CZWZvcmVGaW5kUmVxdWVzdFxuICogQHByb3BlcnR5IHtTdHJpbmd9IGluc3RhbGxhdGlvbklkIElmIHNldCwgdGhlIGluc3RhbGxhdGlvbklkIHRyaWdnZXJpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IG1hc3RlciBJZiB0cnVlLCBtZWFucyB0aGUgbWFzdGVyIGtleSB3YXMgdXNlZC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuVXNlcn0gdXNlciBJZiBzZXQsIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuUXVlcnl9IHF1ZXJ5IFRoZSBxdWVyeSB0cmlnZ2VyaW5nIHRoZSBob29rLlxuICogQHByb3BlcnR5IHtTdHJpbmd9IGlwIFRoZSBJUCBhZGRyZXNzIG9mIHRoZSBjbGllbnQgbWFraW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtPYmplY3R9IGhlYWRlcnMgVGhlIG9yaWdpbmFsIEhUVFAgaGVhZGVycyBmb3IgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gdHJpZ2dlck5hbWUgVGhlIG5hbWUgb2YgdGhlIHRyaWdnZXIgKGBiZWZvcmVTYXZlYCwgYGFmdGVyU2F2ZWAsIC4uLilcbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBsb2cgVGhlIGN1cnJlbnQgbG9nZ2VyIGluc2lkZSBQYXJzZSBTZXJ2ZXIuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IGlzR2V0IHdldGhlciB0aGUgcXVlcnkgYSBgZ2V0YCBvciBhIGBmaW5kYFxuICovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5BZnRlckZpbmRSZXF1ZXN0XG4gKiBAcHJvcGVydHkge1N0cmluZ30gaW5zdGFsbGF0aW9uSWQgSWYgc2V0LCB0aGUgaW5zdGFsbGF0aW9uSWQgdHJpZ2dlcmluZyB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gbWFzdGVyIElmIHRydWUsIG1lYW5zIHRoZSBtYXN0ZXIga2V5IHdhcyB1c2VkLlxuICogQHByb3BlcnR5IHtQYXJzZS5Vc2VyfSB1c2VyIElmIHNldCwgdGhlIHVzZXIgdGhhdCBtYWRlIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtQYXJzZS5RdWVyeX0gcXVlcnkgVGhlIHF1ZXJ5IHRyaWdnZXJpbmcgdGhlIGhvb2suXG4gKiBAcHJvcGVydHkge0FycmF5PFBhcnNlLk9iamVjdD59IHJlc3VsdHMgVGhlIHJlc3VsdHMgdGhlIHF1ZXJ5IHlpZWxkZWQuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gaXAgVGhlIElQIGFkZHJlc3Mgb2YgdGhlIGNsaWVudCBtYWtpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge09iamVjdH0gaGVhZGVycyBUaGUgb3JpZ2luYWwgSFRUUCBoZWFkZXJzIGZvciB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSB0cmlnZ2VyTmFtZSBUaGUgbmFtZSBvZiB0aGUgdHJpZ2dlciAoYGJlZm9yZVNhdmVgLCBgYWZ0ZXJTYXZlYCwgLi4uKVxuICogQHByb3BlcnR5IHtPYmplY3R9IGxvZyBUaGUgY3VycmVudCBsb2dnZXIgaW5zaWRlIFBhcnNlIFNlcnZlci5cbiAqL1xuXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFyc2UuQ2xvdWQuRnVuY3Rpb25SZXF1ZXN0XG4gKiBAcHJvcGVydHkge1N0cmluZ30gaW5zdGFsbGF0aW9uSWQgSWYgc2V0LCB0aGUgaW5zdGFsbGF0aW9uSWQgdHJpZ2dlcmluZyB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gbWFzdGVyIElmIHRydWUsIG1lYW5zIHRoZSBtYXN0ZXIga2V5IHdhcyB1c2VkLlxuICogQHByb3BlcnR5IHtQYXJzZS5Vc2VyfSB1c2VyIElmIHNldCwgdGhlIHVzZXIgdGhhdCBtYWRlIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtPYmplY3R9IHBhcmFtcyBUaGUgcGFyYW1zIHBhc3NlZCB0byB0aGUgY2xvdWQgZnVuY3Rpb24uXG4gKi9cblxuLyoqXG4gKiBAaW50ZXJmYWNlIFBhcnNlLkNsb3VkLkpvYlJlcXVlc3RcbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBwYXJhbXMgVGhlIHBhcmFtcyBwYXNzZWQgdG8gdGhlIGJhY2tncm91bmQgam9iLlxuICogQHByb3BlcnR5IHtmdW5jdGlvbn0gbWVzc2FnZSBJZiBtZXNzYWdlIGlzIGNhbGxlZCB3aXRoIGEgc3RyaW5nIGFyZ3VtZW50LCB3aWxsIHVwZGF0ZSB0aGUgY3VycmVudCBtZXNzYWdlIHRvIGJlIHN0b3JlZCBpbiB0aGUgam9iIHN0YXR1cy5cbiAqL1xuXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0XG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IHJlcXVpcmVVc2VyIHdoZXRoZXIgdGhlIGNsb3VkIHRyaWdnZXIgcmVxdWlyZXMgYSB1c2VyLlxuICogQHByb3BlcnR5IHtCb29sZWFufSByZXF1aXJlTWFzdGVyIHdoZXRoZXIgdGhlIGNsb3VkIHRyaWdnZXIgcmVxdWlyZXMgYSBtYXN0ZXIga2V5LlxuICogQHByb3BlcnR5IHtCb29sZWFufSB2YWxpZGF0ZU1hc3RlcktleSB3aGV0aGVyIHRoZSB2YWxpZGF0b3Igc2hvdWxkIHJ1biBpZiBtYXN0ZXJLZXkgaXMgcHJvdmlkZWQuIERlZmF1bHRzIHRvIGZhbHNlLlxuICogQHByb3BlcnR5IHtCb29sZWFufSBza2lwV2l0aE1hc3RlcktleSB3aGV0aGVyIHRoZSBjbG91ZCBjb2RlIGZ1bmN0aW9uIHNob3VsZCBiZSBpZ25vcmVkIHVzaW5nIGEgbWFzdGVyS2V5LlxuICpcbiAqIEBwcm9wZXJ0eSB7QXJyYXk8U3RyaW5nPnxPYmplY3R9IHJlcXVpcmVVc2VyS2V5cyBJZiBzZXQsIGtleXMgcmVxdWlyZWQgb24gcmVxdWVzdC51c2VyIHRvIG1ha2UgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gcmVxdWlyZVVzZXJLZXlzLmZpZWxkIElmIHJlcXVpcmVVc2VyS2V5cyBpcyBhbiBvYmplY3QsIG5hbWUgb2YgZmllbGQgdG8gdmFsaWRhdGUgb24gcmVxdWVzdCB1c2VyXG4gKiBAcHJvcGVydHkge0FycmF5fGZ1bmN0aW9ufEFueX0gcmVxdWlyZVVzZXJLZXlzLmZpZWxkLm9wdGlvbnMgYXJyYXkgb2Ygb3B0aW9ucyB0aGF0IHRoZSBmaWVsZCBjYW4gYmUsIGZ1bmN0aW9uIHRvIHZhbGlkYXRlIGZpZWxkLCBvciBzaW5nbGUgdmFsdWUuIFRocm93IGFuIGVycm9yIGlmIHZhbHVlIGlzIGludmFsaWQuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gcmVxdWlyZVVzZXJLZXlzLmZpZWxkLmVycm9yIGN1c3RvbSBlcnJvciBtZXNzYWdlIGlmIGZpZWxkIGlzIGludmFsaWQuXG4gKlxuICogQHByb3BlcnR5IHtPYmplY3R8QXJyYXk8U3RyaW5nPn0gZmllbGRzIGlmIGFuIGFycmF5IG9mIHN0cmluZ3MsIHZhbGlkYXRvciB3aWxsIGxvb2sgZm9yIGtleXMgaW4gcmVxdWVzdC5wYXJhbXMsIGFuZCB0aHJvdyBpZiBub3QgcHJvdmlkZWQuIElmIE9iamVjdCwgZmllbGRzIHRvIHZhbGlkYXRlLiBJZiB0aGUgdHJpZ2dlciBpcyBhIGNsb3VkIGZ1bmN0aW9uLCBgcmVxdWVzdC5wYXJhbXNgIHdpbGwgYmUgdmFsaWRhdGVkLCBvdGhlcndpc2UgYHJlcXVlc3Qub2JqZWN0YC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBmaWVsZHMuZmllbGQgbmFtZSBvZiBmaWVsZCB0byB2YWxpZGF0ZS5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBmaWVsZHMuZmllbGQudHlwZSBleHBlY3RlZCB0eXBlIG9mIGRhdGEgZm9yIGZpZWxkLlxuICogQHByb3BlcnR5IHtCb29sZWFufSBmaWVsZHMuZmllbGQuY29uc3RhbnQgd2hldGhlciB0aGUgZmllbGQgY2FuIGJlIG1vZGlmaWVkIG9uIHRoZSBvYmplY3QuXG4gKiBAcHJvcGVydHkge0FueX0gZmllbGRzLmZpZWxkLmRlZmF1bHQgZGVmYXVsdCB2YWx1ZSBpZiBmaWVsZCBpcyBgbnVsbGAsIG9yIGluaXRpYWwgdmFsdWUgYGNvbnN0YW50YCBpcyBgdHJ1ZWAuXG4gKiBAcHJvcGVydHkge0FycmF5fGZ1bmN0aW9ufEFueX0gZmllbGRzLmZpZWxkLm9wdGlvbnMgYXJyYXkgb2Ygb3B0aW9ucyB0aGF0IHRoZSBmaWVsZCBjYW4gYmUsIGZ1bmN0aW9uIHRvIHZhbGlkYXRlIGZpZWxkLCBvciBzaW5nbGUgdmFsdWUuIFRocm93IGFuIGVycm9yIGlmIHZhbHVlIGlzIGludmFsaWQuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gZmllbGRzLmZpZWxkLmVycm9yIGN1c3RvbSBlcnJvciBtZXNzYWdlIGlmIGZpZWxkIGlzIGludmFsaWQuXG4gKi9cbiJdfQ==