"use strict";

var _node = require("parse/node");

var triggers = _interopRequireWildcard(require("../triggers"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

const Config = require('../Config');

function isParseObjectConstructor(object) {
  return typeof object === 'function' && Object.prototype.hasOwnProperty.call(object, 'className');
}

function getClassName(parseClass) {
  if (parseClass && parseClass.className) {
    return parseClass.className;
  }

  return parseClass;
}

function validateValidator(validator) {
  if (!validator || typeof validator === 'function') {
    return;
  }

  const fieldOptions = {
    type: ['Any'],
    constant: [Boolean],
    default: ['Any'],
    options: [Array, 'function', 'Any'],
    required: [Boolean],
    error: [String]
  };
  const allowedKeys = {
    requireUser: [Boolean],
    requireAnyUserRoles: [Array, 'function'],
    requireAllUserRoles: [Array, 'function'],
    requireMaster: [Boolean],
    validateMasterKey: [Boolean],
    skipWithMasterKey: [Boolean],
    requireUserKeys: [Array, Object],
    fields: [Array, Object]
  };

  const getType = fn => {
    if (Array.isArray(fn)) {
      return 'array';
    }

    if (fn === 'Any' || fn === 'function') {
      return fn;
    }

    const type = typeof fn;

    if (typeof fn === 'function') {
      const match = fn && fn.toString().match(/^\s*function (\w+)/);
      return (match ? match[1] : 'function').toLowerCase();
    }

    return type;
  };

  const checkKey = (key, data, validatorParam) => {
    const parameter = data[key];

    if (!parameter) {
      throw `${key} is not a supported parameter for Cloud Function validations.`;
    }

    const types = parameter.map(type => getType(type));
    const type = getType(validatorParam);

    if (!types.includes(type) && !types.includes('Any')) {
      throw `Invalid type for Cloud Function validation key ${key}. Expected ${types.join('|')}, actual ${type}`;
    }
  };

  for (const key in validator) {
    checkKey(key, allowedKeys, validator[key]);

    if (key === 'fields' || key === 'requireUserKeys') {
      const values = validator[key];

      if (Array.isArray(values)) {
        continue;
      }

      for (const value in values) {
        const data = values[value];

        for (const subKey in data) {
          checkKey(subKey, fieldOptions, data[subKey]);
        }
      }
    }
  }
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
  validateValidator(validationHandler);
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
  validateValidator(validationHandler);
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
  validateValidator(validationHandler);
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
  validateValidator(validationHandler);
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
  validateValidator(validationHandler);
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
  validateValidator(validationHandler);
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
  validateValidator(validationHandler);
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
  validateValidator(validationHandler);
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
  validateValidator(validationHandler);
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
  validateValidator(validationHandler);
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
  validateValidator(validationHandler);
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
  validateValidator(validationHandler);
  triggers.addConnectTrigger(triggers.Types.beforeConnect, handler, _node.Parse.applicationId, validationHandler);
};
/**
 * Sends an email through the Parse Server mail adapter.
 *
 * **Available in Cloud Code only.**
 * **Requires a mail adapter to be configured for Parse Server.**
 *
 * ```
 * Parse.Cloud.sendEmail({
 *   from: 'Example <test@example.com>',
 *   to: 'contact@example.com',
 *   subject: 'Test email',
 *   text: 'This email is a test.'
 * });
 *```
 *
 * @method sendEmail
 * @name Parse.Cloud.sendEmail
 * @param {Object} data The object of the mail data to send.
 */


ParseCloud.sendEmail = function (data) {
  const config = Config.get(_node.Parse.applicationId);
  const emailAdapter = config.userController.adapter;

  if (!emailAdapter) {
    config.loggerController.error('Failed to send email because no mail adapter is configured for Parse Server.');
    return;
  }

  return emailAdapter.sendMail(data);
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
  validateValidator(validationHandler);
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
  validateValidator(validationHandler);
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
 * @property {Array<String>|function}requireAnyUserRoles If set, request.user has to be part of at least one roles name to make the request. If set to a function, function must return role names.
 * @property {Array<String>|function}requireAllUserRoles If set, request.user has to be part all roles name to make the request. If set to a function, function must return role names.
 *
 * @property {Object|Array<String>} fields if an array of strings, validator will look for keys in request.params, and throw if not provided. If Object, fields to validate. If the trigger is a cloud function, `request.params` will be validated, otherwise `request.object`.
 * @property {String} fields.field name of field to validate.
 * @property {String} fields.field.type expected type of data for field.
 * @property {Boolean} fields.field.constant whether the field can be modified on the object.
 * @property {Any} fields.field.default default value if field is `null`, or initial value `constant` is `true`.
 * @property {Array|function|Any} fields.field.options array of options that the field can be, function to validate field, or single value. Throw an error if value is invalid.
 * @property {String} fields.field.error custom error message if field is invalid.
 */
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9jbG91ZC1jb2RlL1BhcnNlLkNsb3VkLmpzIl0sIm5hbWVzIjpbIkNvbmZpZyIsInJlcXVpcmUiLCJpc1BhcnNlT2JqZWN0Q29uc3RydWN0b3IiLCJvYmplY3QiLCJPYmplY3QiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJnZXRDbGFzc05hbWUiLCJwYXJzZUNsYXNzIiwiY2xhc3NOYW1lIiwidmFsaWRhdGVWYWxpZGF0b3IiLCJ2YWxpZGF0b3IiLCJmaWVsZE9wdGlvbnMiLCJ0eXBlIiwiY29uc3RhbnQiLCJCb29sZWFuIiwiZGVmYXVsdCIsIm9wdGlvbnMiLCJBcnJheSIsInJlcXVpcmVkIiwiZXJyb3IiLCJTdHJpbmciLCJhbGxvd2VkS2V5cyIsInJlcXVpcmVVc2VyIiwicmVxdWlyZUFueVVzZXJSb2xlcyIsInJlcXVpcmVBbGxVc2VyUm9sZXMiLCJyZXF1aXJlTWFzdGVyIiwidmFsaWRhdGVNYXN0ZXJLZXkiLCJza2lwV2l0aE1hc3RlcktleSIsInJlcXVpcmVVc2VyS2V5cyIsImZpZWxkcyIsImdldFR5cGUiLCJmbiIsImlzQXJyYXkiLCJtYXRjaCIsInRvU3RyaW5nIiwidG9Mb3dlckNhc2UiLCJjaGVja0tleSIsImtleSIsImRhdGEiLCJ2YWxpZGF0b3JQYXJhbSIsInBhcmFtZXRlciIsInR5cGVzIiwibWFwIiwiaW5jbHVkZXMiLCJqb2luIiwidmFsdWVzIiwidmFsdWUiLCJzdWJLZXkiLCJQYXJzZUNsb3VkIiwiZGVmaW5lIiwiZnVuY3Rpb25OYW1lIiwiaGFuZGxlciIsInZhbGlkYXRpb25IYW5kbGVyIiwidHJpZ2dlcnMiLCJhZGRGdW5jdGlvbiIsIlBhcnNlIiwiYXBwbGljYXRpb25JZCIsImpvYiIsImFkZEpvYiIsImJlZm9yZVNhdmUiLCJhZGRUcmlnZ2VyIiwiVHlwZXMiLCJiZWZvcmVEZWxldGUiLCJiZWZvcmVMb2dpbiIsImFyZ3VtZW50cyIsImFmdGVyTG9naW4iLCJhZnRlckxvZ291dCIsImFmdGVyU2F2ZSIsImFmdGVyRGVsZXRlIiwiYmVmb3JlRmluZCIsImFmdGVyRmluZCIsImJlZm9yZVNhdmVGaWxlIiwiYWRkRmlsZVRyaWdnZXIiLCJhZnRlclNhdmVGaWxlIiwiYmVmb3JlRGVsZXRlRmlsZSIsImFmdGVyRGVsZXRlRmlsZSIsImJlZm9yZUNvbm5lY3QiLCJhZGRDb25uZWN0VHJpZ2dlciIsInNlbmRFbWFpbCIsImNvbmZpZyIsImdldCIsImVtYWlsQWRhcHRlciIsInVzZXJDb250cm9sbGVyIiwiYWRhcHRlciIsImxvZ2dlckNvbnRyb2xsZXIiLCJzZW5kTWFpbCIsImJlZm9yZVN1YnNjcmliZSIsIm9uTGl2ZVF1ZXJ5RXZlbnQiLCJhZGRMaXZlUXVlcnlFdmVudEhhbmRsZXIiLCJhZnRlckxpdmVRdWVyeUV2ZW50IiwiYWZ0ZXJFdmVudCIsIl9yZW1vdmVBbGxIb29rcyIsIl91bnJlZ2lzdGVyQWxsIiwidXNlTWFzdGVyS2V5IiwiY29uc29sZSIsIndhcm4iLCJodHRwUmVxdWVzdCIsIm1vZHVsZSIsImV4cG9ydHMiXSwibWFwcGluZ3MiOiI7O0FBQUE7O0FBQ0E7Ozs7OztBQUNBLE1BQU1BLE1BQU0sR0FBR0MsT0FBTyxDQUFDLFdBQUQsQ0FBdEI7O0FBRUEsU0FBU0Msd0JBQVQsQ0FBa0NDLE1BQWxDLEVBQTBDO0FBQ3hDLFNBQU8sT0FBT0EsTUFBUCxLQUFrQixVQUFsQixJQUFnQ0MsTUFBTSxDQUFDQyxTQUFQLENBQWlCQyxjQUFqQixDQUFnQ0MsSUFBaEMsQ0FBcUNKLE1BQXJDLEVBQTZDLFdBQTdDLENBQXZDO0FBQ0Q7O0FBRUQsU0FBU0ssWUFBVCxDQUFzQkMsVUFBdEIsRUFBa0M7QUFDaEMsTUFBSUEsVUFBVSxJQUFJQSxVQUFVLENBQUNDLFNBQTdCLEVBQXdDO0FBQ3RDLFdBQU9ELFVBQVUsQ0FBQ0MsU0FBbEI7QUFDRDs7QUFDRCxTQUFPRCxVQUFQO0FBQ0Q7O0FBRUQsU0FBU0UsaUJBQVQsQ0FBMkJDLFNBQTNCLEVBQXNDO0FBQ3BDLE1BQUksQ0FBQ0EsU0FBRCxJ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aUJsRCxVQUFqQjtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBQYXJzZSB9IGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0ICogYXMgdHJpZ2dlcnMgZnJvbSAnLi4vdHJpZ2dlcnMnO1xuY29uc3QgQ29uZmlnID0gcmVxdWlyZSgnLi4vQ29uZmlnJyk7XG5cbmZ1bmN0aW9uIGlzUGFyc2VPYmplY3RDb25zdHJ1Y3RvcihvYmplY3QpIHtcbiAgcmV0dXJuIHR5cGVvZiBvYmplY3QgPT09ICdmdW5jdGlvbicgJiYgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iamVjdCwgJ2NsYXNzTmFtZScpO1xufVxuXG5mdW5jdGlvbiBnZXRDbGFzc05hbWUocGFyc2VDbGFzcykge1xuICBpZiAocGFyc2VDbGFzcyAmJiBwYXJzZUNsYXNzLmNsYXNzTmFtZSkge1xuICAgIHJldHVybiBwYXJzZUNsYXNzLmNsYXNzTmFtZTtcbiAgfVxuICByZXR1cm4gcGFyc2VDbGFzcztcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVWYWxpZGF0b3IodmFsaWRhdG9yKSB7XG4gIGlmICghdmFsaWRhdG9yIHx8IHR5cGVvZiB2YWxpZGF0b3IgPT09ICdmdW5jdGlvbicpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3QgZmllbGRPcHRpb25zID0ge1xuICAgIHR5cGU6IFsnQW55J10sXG4gICAgY29uc3RhbnQ6IFtCb29sZWFuXSxcbiAgICBkZWZhdWx0OiBbJ0FueSddLFxuICAgIG9wdGlvbnM6IFtBcnJheSwgJ2Z1bmN0aW9uJywgJ0FueSddLFxuICAgIHJlcXVpcmVkOiBbQm9vbGVhbl0sXG4gICAgZXJyb3I6IFtTdHJpbmddLFxuICB9O1xuICBjb25zdCBhbGxvd2VkS2V5cyA9IHtcbiAgICByZXF1aXJlVXNlcjogW0Jvb2xlYW5dLFxuICAgIHJlcXVpcmVBbnlVc2VyUm9sZXM6IFtBcnJheSwgJ2Z1bmN0aW9uJ10sXG4gICAgcmVxdWlyZUFsbFVzZXJSb2xlczogW0FycmF5LCAnZnVuY3Rpb24nXSxcbiAgICByZXF1aXJlTWFzdGVyOiBbQm9vbGVhbl0sXG4gICAgdmFsaWRhdGVNYXN0ZXJLZXk6IFtCb29sZWFuXSxcbiAgICBza2lwV2l0aE1hc3RlcktleTogW0Jvb2xlYW5dLFxuICAgIHJlcXVpcmVVc2VyS2V5czogW0FycmF5LCBPYmplY3RdLFxuICAgIGZpZWxkczogW0FycmF5LCBPYmplY3RdLFxuICB9O1xuICBjb25zdCBnZXRUeXBlID0gZm4gPT4ge1xuICAgIGlmIChBcnJheS5pc0FycmF5KGZuKSkge1xuICAgICAgcmV0dXJuICdhcnJheSc7XG4gICAgfVxuICAgIGlmIChmbiA9PT0gJ0FueScgfHwgZm4gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHJldHVybiBmbjtcbiAgICB9XG4gICAgY29uc3QgdHlwZSA9IHR5cGVvZiBmbjtcbiAgICBpZiAodHlwZW9mIGZuID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBjb25zdCBtYXRjaCA9IGZuICYmIGZuLnRvU3RyaW5nKCkubWF0Y2goL15cXHMqZnVuY3Rpb24gKFxcdyspLyk7XG4gICAgICByZXR1cm4gKG1hdGNoID8gbWF0Y2hbMV0gOiAnZnVuY3Rpb24nKS50b0xvd2VyQ2FzZSgpO1xuICAgIH1cbiAgICByZXR1cm4gdHlwZTtcbiAgfTtcbiAgY29uc3QgY2hlY2tLZXkgPSAoa2V5LCBkYXRhLCB2YWxpZGF0b3JQYXJhbSkgPT4ge1xuICAgIGNvbnN0IHBhcmFtZXRlciA9IGRhdGFba2V5XTtcbiAgICBpZiAoIXBhcmFtZXRlcikge1xuICAgICAgdGhyb3cgYCR7a2V5fSBpcyBub3QgYSBzdXBwb3J0ZWQgcGFyYW1ldGVyIGZvciBDbG91ZCBGdW5jdGlvbiB2YWxpZGF0aW9ucy5gO1xuICAgIH1cbiAgICBjb25zdCB0eXBlcyA9IHBhcmFtZXRlci5tYXAodHlwZSA9PiBnZXRUeXBlKHR5cGUpKTtcbiAgICBjb25zdCB0eXBlID0gZ2V0VHlwZSh2YWxpZGF0b3JQYXJhbSk7XG4gICAgaWYgKCF0eXBlcy5pbmNsdWRlcyh0eXBlKSAmJiAhdHlwZXMuaW5jbHVkZXMoJ0FueScpKSB7XG4gICAgICB0aHJvdyBgSW52YWxpZCB0eXBlIGZvciBDbG91ZCBGdW5jdGlvbiB2YWxpZGF0aW9uIGtleSAke2tleX0uIEV4cGVjdGVkICR7dHlwZXMuam9pbihcbiAgICAgICAgJ3wnXG4gICAgICApfSwgYWN0dWFsICR7dHlwZX1gO1xuICAgIH1cbiAgfTtcbiAgZm9yIChjb25zdCBrZXkgaW4gdmFsaWRhdG9yKSB7XG4gICAgY2hlY2tLZXkoa2V5LCBhbGxvd2VkS2V5cywgdmFsaWRhdG9yW2tleV0pO1xuICAgIGlmIChrZXkgPT09ICdmaWVsZHMnIHx8IGtleSA9PT0gJ3JlcXVpcmVVc2VyS2V5cycpIHtcbiAgICAgIGNvbnN0IHZhbHVlcyA9IHZhbGlkYXRvcltrZXldO1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWVzKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGZvciAoY29uc3QgdmFsdWUgaW4gdmFsdWVzKSB7XG4gICAgICAgIGNvbnN0IGRhdGEgPSB2YWx1ZXNbdmFsdWVdO1xuICAgICAgICBmb3IgKGNvbnN0IHN1YktleSBpbiBkYXRhKSB7XG4gICAgICAgICAgY2hlY2tLZXkoc3ViS2V5LCBmaWVsZE9wdGlvbnMsIGRhdGFbc3ViS2V5XSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cbi8qKiBAbmFtZXNwYWNlXG4gKiBAbmFtZSBQYXJzZVxuICogQGRlc2NyaXB0aW9uIFRoZSBQYXJzZSBTREsuXG4gKiAgc2VlIFthcGkgZG9jc10oaHR0cHM6Ly9kb2NzLnBhcnNlcGxhdGZvcm0ub3JnL2pzL2FwaSkgYW5kIFtndWlkZV0oaHR0cHM6Ly9kb2NzLnBhcnNlcGxhdGZvcm0ub3JnL2pzL2d1aWRlKVxuICovXG5cbi8qKiBAbmFtZXNwYWNlXG4gKiBAbmFtZSBQYXJzZS5DbG91ZFxuICogQG1lbWJlcm9mIFBhcnNlXG4gKiBAZGVzY3JpcHRpb24gVGhlIFBhcnNlIENsb3VkIENvZGUgU0RLLlxuICovXG5cbnZhciBQYXJzZUNsb3VkID0ge307XG4vKipcbiAqIERlZmluZXMgYSBDbG91ZCBGdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmRlZmluZSgnZnVuY3Rpb25OYW1lJywgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuZGVmaW5lKCdmdW5jdGlvbk5hbWUnLCAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KTtcbiAqIGBgYFxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJvZiBQYXJzZS5DbG91ZFxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgVGhlIG5hbWUgb2YgdGhlIENsb3VkIEZ1bmN0aW9uXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBkYXRhIFRoZSBDbG91ZCBGdW5jdGlvbiB0byByZWdpc3Rlci4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuRnVuY3Rpb25SZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuRnVuY3Rpb25SZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5kZWZpbmUgPSBmdW5jdGlvbiAoZnVuY3Rpb25OYW1lLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIHRyaWdnZXJzLmFkZEZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSwgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xufTtcblxuLyoqXG4gKiBEZWZpbmVzIGEgQmFja2dyb3VuZCBKb2IuXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogQG1ldGhvZCBqb2JcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmpvYlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgVGhlIG5hbWUgb2YgdGhlIEJhY2tncm91bmQgSm9iXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBCYWNrZ3JvdW5kIEpvYiB0byByZWdpc3Rlci4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgc2hvdWxkIHRha2UgYSBzaW5nbGUgcGFyYW1ldGVycyBhIHtAbGluayBQYXJzZS5DbG91ZC5Kb2JSZXF1ZXN0fVxuICpcbiAqL1xuUGFyc2VDbG91ZC5qb2IgPSBmdW5jdGlvbiAoZnVuY3Rpb25OYW1lLCBoYW5kbGVyKSB7XG4gIHRyaWdnZXJzLmFkZEpvYihmdW5jdGlvbk5hbWUsIGhhbmRsZXIsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xufTtcblxuLyoqXG4gKlxuICogUmVnaXN0ZXJzIGEgYmVmb3JlIHNhdmUgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogSWYgeW91IHdhbnQgdG8gdXNlIGJlZm9yZVNhdmUgZm9yIGEgcHJlZGVmaW5lZCBjbGFzcyBpbiB0aGUgUGFyc2UgSmF2YVNjcmlwdCBTREsgKGUuZy4ge0BsaW5rIFBhcnNlLlVzZXJ9KSwgeW91IHNob3VsZCBwYXNzIHRoZSBjbGFzcyBpdHNlbGYgYW5kIG5vdCB0aGUgU3RyaW5nIGZvciBhcmcxLlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYmVmb3JlU2F2ZSgnTXlDdXN0b21DbGFzcycsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZVNhdmUoUGFyc2UuVXNlciwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSlcbiAqIGBgYFxuICpcbiAqIEBtZXRob2QgYmVmb3JlU2F2ZVxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlU2F2ZVxuICogQHBhcmFtIHsoU3RyaW5nfFBhcnNlLk9iamVjdCl9IGFyZzEgVGhlIFBhcnNlLk9iamVjdCBzdWJjbGFzcyB0byByZWdpc3RlciB0aGUgYWZ0ZXIgc2F2ZSBmdW5jdGlvbiBmb3IuIFRoaXMgY2FuIGluc3RlYWQgYmUgYSBTdHJpbmcgdGhhdCBpcyB0aGUgY2xhc3NOYW1lIG9mIHRoZSBzdWJjbGFzcy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBiZWZvcmUgYSBzYXZlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH07XG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5iZWZvcmVTYXZlID0gZnVuY3Rpb24gKHBhcnNlQ2xhc3MsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIHZhciBjbGFzc05hbWUgPSBnZXRDbGFzc05hbWUocGFyc2VDbGFzcyk7XG4gIHZhbGlkYXRlVmFsaWRhdG9yKHZhbGlkYXRpb25IYW5kbGVyKTtcbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVTYXZlLFxuICAgIGNsYXNzTmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXJcbiAgKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGEgYmVmb3JlIGRlbGV0ZSBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBJZiB5b3Ugd2FudCB0byB1c2UgYmVmb3JlRGVsZXRlIGZvciBhIHByZWRlZmluZWQgY2xhc3MgaW4gdGhlIFBhcnNlIEphdmFTY3JpcHQgU0RLIChlLmcuIHtAbGluayBQYXJzZS5Vc2VyfSksIHlvdSBzaG91bGQgcGFzcyB0aGUgY2xhc3MgaXRzZWxmIGFuZCBub3QgdGhlIFN0cmluZyBmb3IgYXJnMS5cbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYmVmb3JlRGVsZXRlKCdNeUN1c3RvbUNsYXNzJywgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYmVmb3JlRGVsZXRlKFBhcnNlLlVzZXIsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pXG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYmVmb3JlRGVsZXRlXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5iZWZvcmVEZWxldGVcbiAqIEBwYXJhbSB7KFN0cmluZ3xQYXJzZS5PYmplY3QpfSBhcmcxIFRoZSBQYXJzZS5PYmplY3Qgc3ViY2xhc3MgdG8gcmVnaXN0ZXIgdGhlIGJlZm9yZSBkZWxldGUgZnVuY3Rpb24gZm9yLiBUaGlzIGNhbiBpbnN0ZWFkIGJlIGEgU3RyaW5nIHRoYXQgaXMgdGhlIGNsYXNzTmFtZSBvZiB0aGUgc3ViY2xhc3MuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYmVmb3JlIGEgZGVsZXRlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciwgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYmVmb3JlRGVsZXRlID0gZnVuY3Rpb24gKHBhcnNlQ2xhc3MsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIHZhciBjbGFzc05hbWUgPSBnZXRDbGFzc05hbWUocGFyc2VDbGFzcyk7XG4gIHZhbGlkYXRlVmFsaWRhdG9yKHZhbGlkYXRpb25IYW5kbGVyKTtcbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVEZWxldGUsXG4gICAgY2xhc3NOYW1lLFxuICAgIGhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICB2YWxpZGF0aW9uSGFuZGxlclxuICApO1xufTtcblxuLyoqXG4gKlxuICogUmVnaXN0ZXJzIHRoZSBiZWZvcmUgbG9naW4gZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogVGhpcyBmdW5jdGlvbiBwcm92aWRlcyBmdXJ0aGVyIGNvbnRyb2xcbiAqIGluIHZhbGlkYXRpbmcgYSBsb2dpbiBhdHRlbXB0LiBTcGVjaWZpY2FsbHksXG4gKiBpdCBpcyB0cmlnZ2VyZWQgYWZ0ZXIgYSB1c2VyIGVudGVyc1xuICogY29ycmVjdCBjcmVkZW50aWFscyAob3Igb3RoZXIgdmFsaWQgYXV0aERhdGEpLFxuICogYnV0IHByaW9yIHRvIGEgc2Vzc2lvbiBiZWluZyBnZW5lcmF0ZWQuXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVMb2dpbigocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0pXG4gKlxuICogYGBgXG4gKlxuICogQG1ldGhvZCBiZWZvcmVMb2dpblxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlTG9naW5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBiZWZvcmUgYSBsb2dpbi4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9O1xuICovXG5QYXJzZUNsb3VkLmJlZm9yZUxvZ2luID0gZnVuY3Rpb24gKGhhbmRsZXIpIHtcbiAgbGV0IGNsYXNzTmFtZSA9ICdfVXNlcic7XG4gIGlmICh0eXBlb2YgaGFuZGxlciA9PT0gJ3N0cmluZycgfHwgaXNQYXJzZU9iamVjdENvbnN0cnVjdG9yKGhhbmRsZXIpKSB7XG4gICAgLy8gdmFsaWRhdGlvbiB3aWxsIG9jY3VyIGRvd25zdHJlYW0sIHRoaXMgaXMgdG8gbWFpbnRhaW4gaW50ZXJuYWxcbiAgICAvLyBjb2RlIGNvbnNpc3RlbmN5IHdpdGggdGhlIG90aGVyIGhvb2sgdHlwZXMuXG4gICAgY2xhc3NOYW1lID0gZ2V0Q2xhc3NOYW1lKGhhbmRsZXIpO1xuICAgIGhhbmRsZXIgPSBhcmd1bWVudHNbMV07XG4gIH1cbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcih0cmlnZ2Vycy5UeXBlcy5iZWZvcmVMb2dpbiwgY2xhc3NOYW1lLCBoYW5kbGVyLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbn07XG5cbi8qKlxuICpcbiAqIFJlZ2lzdGVycyB0aGUgYWZ0ZXIgbG9naW4gZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogVGhpcyBmdW5jdGlvbiBpcyB0cmlnZ2VyZWQgYWZ0ZXIgYSB1c2VyIGxvZ3MgaW4gc3VjY2Vzc2Z1bGx5LFxuICogYW5kIGFmdGVyIGEgX1Nlc3Npb24gb2JqZWN0IGhhcyBiZWVuIGNyZWF0ZWQuXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5hZnRlckxvZ2luKChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSk7XG4gKiBgYGBcbiAqXG4gKiBAbWV0aG9kIGFmdGVyTG9naW5cbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmFmdGVyTG9naW5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBhZnRlciBhIGxvZ2luLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH07XG4gKi9cblBhcnNlQ2xvdWQuYWZ0ZXJMb2dpbiA9IGZ1bmN0aW9uIChoYW5kbGVyKSB7XG4gIGxldCBjbGFzc05hbWUgPSAnX1VzZXInO1xuICBpZiAodHlwZW9mIGhhbmRsZXIgPT09ICdzdHJpbmcnIHx8IGlzUGFyc2VPYmplY3RDb25zdHJ1Y3RvcihoYW5kbGVyKSkge1xuICAgIC8vIHZhbGlkYXRpb24gd2lsbCBvY2N1ciBkb3duc3RyZWFtLCB0aGlzIGlzIHRvIG1haW50YWluIGludGVybmFsXG4gICAgLy8gY29kZSBjb25zaXN0ZW5jeSB3aXRoIHRoZSBvdGhlciBob29rIHR5cGVzLlxuICAgIGNsYXNzTmFtZSA9IGdldENsYXNzTmFtZShoYW5kbGVyKTtcbiAgICBoYW5kbGVyID0gYXJndW1lbnRzWzFdO1xuICB9XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIodHJpZ2dlcnMuVHlwZXMuYWZ0ZXJMb2dpbiwgY2xhc3NOYW1lLCBoYW5kbGVyLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbn07XG5cbi8qKlxuICpcbiAqIFJlZ2lzdGVycyB0aGUgYWZ0ZXIgbG9nb3V0IGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIFRoaXMgZnVuY3Rpb24gaXMgdHJpZ2dlcmVkIGFmdGVyIGEgdXNlciBsb2dzIG91dC5cbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmFmdGVyTG9nb3V0KChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSk7XG4gKiBgYGBcbiAqXG4gKiBAbWV0aG9kIGFmdGVyTG9nb3V0XG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5hZnRlckxvZ291dFxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGFmdGVyIGEgbG9nb3V0LiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH07XG4gKi9cblBhcnNlQ2xvdWQuYWZ0ZXJMb2dvdXQgPSBmdW5jdGlvbiAoaGFuZGxlcikge1xuICBsZXQgY2xhc3NOYW1lID0gJ19TZXNzaW9uJztcbiAgaWYgKHR5cGVvZiBoYW5kbGVyID09PSAnc3RyaW5nJyB8fCBpc1BhcnNlT2JqZWN0Q29uc3RydWN0b3IoaGFuZGxlcikpIHtcbiAgICAvLyB2YWxpZGF0aW9uIHdpbGwgb2NjdXIgZG93bnN0cmVhbSwgdGhpcyBpcyB0byBtYWludGFpbiBpbnRlcm5hbFxuICAgIC8vIGNvZGUgY29uc2lzdGVuY3kgd2l0aCB0aGUgb3RoZXIgaG9vayB0eXBlcy5cbiAgICBjbGFzc05hbWUgPSBnZXRDbGFzc05hbWUoaGFuZGxlcik7XG4gICAgaGFuZGxlciA9IGFyZ3VtZW50c1sxXTtcbiAgfVxuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKHRyaWdnZXJzLlR5cGVzLmFmdGVyTG9nb3V0LCBjbGFzc05hbWUsIGhhbmRsZXIsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYW4gYWZ0ZXIgc2F2ZSBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBJZiB5b3Ugd2FudCB0byB1c2UgYWZ0ZXJTYXZlIGZvciBhIHByZWRlZmluZWQgY2xhc3MgaW4gdGhlIFBhcnNlIEphdmFTY3JpcHQgU0RLIChlLmcuIHtAbGluayBQYXJzZS5Vc2VyfSksIHlvdSBzaG91bGQgcGFzcyB0aGUgY2xhc3MgaXRzZWxmIGFuZCBub3QgdGhlIFN0cmluZyBmb3IgYXJnMS5cbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmFmdGVyU2F2ZSgnTXlDdXN0b21DbGFzcycsIGFzeW5jIGZ1bmN0aW9uKHJlcXVlc3QpIHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJTYXZlKFBhcnNlLlVzZXIsIGFzeW5jIGZ1bmN0aW9uKHJlcXVlc3QpIHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKiBgYGBcbiAqXG4gKiBAbWV0aG9kIGFmdGVyU2F2ZVxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYWZ0ZXJTYXZlXG4gKiBAcGFyYW0geyhTdHJpbmd8UGFyc2UuT2JqZWN0KX0gYXJnMSBUaGUgUGFyc2UuT2JqZWN0IHN1YmNsYXNzIHRvIHJlZ2lzdGVyIHRoZSBhZnRlciBzYXZlIGZ1bmN0aW9uIGZvci4gVGhpcyBjYW4gaW5zdGVhZCBiZSBhIFN0cmluZyB0aGF0IGlzIHRoZSBjbGFzc05hbWUgb2YgdGhlIHN1YmNsYXNzLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGFmdGVyIGEgc2F2ZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIGp1c3Qgb25lIHBhcmFtZXRlciwge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmFmdGVyU2F2ZSA9IGZ1bmN0aW9uIChwYXJzZUNsYXNzLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICB2YXIgY2xhc3NOYW1lID0gZ2V0Q2xhc3NOYW1lKHBhcnNlQ2xhc3MpO1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJTYXZlLFxuICAgIGNsYXNzTmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXJcbiAgKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGFuIGFmdGVyIGRlbGV0ZSBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBJZiB5b3Ugd2FudCB0byB1c2UgYWZ0ZXJEZWxldGUgZm9yIGEgcHJlZGVmaW5lZCBjbGFzcyBpbiB0aGUgUGFyc2UgSmF2YVNjcmlwdCBTREsgKGUuZy4ge0BsaW5rIFBhcnNlLlVzZXJ9KSwgeW91IHNob3VsZCBwYXNzIHRoZSBjbGFzcyBpdHNlbGYgYW5kIG5vdCB0aGUgU3RyaW5nIGZvciBhcmcxLlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5hZnRlckRlbGV0ZSgnTXlDdXN0b21DbGFzcycsIGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmFmdGVyRGVsZXRlKFBhcnNlLlVzZXIsIGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGFmdGVyRGVsZXRlXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5hZnRlckRlbGV0ZVxuICogQHBhcmFtIHsoU3RyaW5nfFBhcnNlLk9iamVjdCl9IGFyZzEgVGhlIFBhcnNlLk9iamVjdCBzdWJjbGFzcyB0byByZWdpc3RlciB0aGUgYWZ0ZXIgZGVsZXRlIGZ1bmN0aW9uIGZvci4gVGhpcyBjYW4gaW5zdGVhZCBiZSBhIFN0cmluZyB0aGF0IGlzIHRoZSBjbGFzc05hbWUgb2YgdGhlIHN1YmNsYXNzLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGFmdGVyIGEgZGVsZXRlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2UganVzdCBvbmUgcGFyYW1ldGVyLCB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYWZ0ZXJEZWxldGUgPSBmdW5jdGlvbiAocGFyc2VDbGFzcywgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgdmFyIGNsYXNzTmFtZSA9IGdldENsYXNzTmFtZShwYXJzZUNsYXNzKTtcbiAgdmFsaWRhdGVWYWxpZGF0b3IodmFsaWRhdGlvbkhhbmRsZXIpO1xuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRGVsZXRlLFxuICAgIGNsYXNzTmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXJcbiAgKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGEgYmVmb3JlIGZpbmQgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogSWYgeW91IHdhbnQgdG8gdXNlIGJlZm9yZUZpbmQgZm9yIGEgcHJlZGVmaW5lZCBjbGFzcyBpbiB0aGUgUGFyc2UgSmF2YVNjcmlwdCBTREsgKGUuZy4ge0BsaW5rIFBhcnNlLlVzZXJ9KSwgeW91IHNob3VsZCBwYXNzIHRoZSBjbGFzcyBpdHNlbGYgYW5kIG5vdCB0aGUgU3RyaW5nIGZvciBhcmcxLlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVGaW5kKCdNeUN1c3RvbUNsYXNzJywgYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYmVmb3JlRmluZChQYXJzZS5Vc2VyLCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KTtcbiAqYGBgXG4gKlxuICogQG1ldGhvZCBiZWZvcmVGaW5kXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5iZWZvcmVGaW5kXG4gKiBAcGFyYW0geyhTdHJpbmd8UGFyc2UuT2JqZWN0KX0gYXJnMSBUaGUgUGFyc2UuT2JqZWN0IHN1YmNsYXNzIHRvIHJlZ2lzdGVyIHRoZSBiZWZvcmUgZmluZCBmdW5jdGlvbiBmb3IuIFRoaXMgY2FuIGluc3RlYWQgYmUgYSBTdHJpbmcgdGhhdCBpcyB0aGUgY2xhc3NOYW1lIG9mIHRoZSBzdWJjbGFzcy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBiZWZvcmUgYSBmaW5kLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2UganVzdCBvbmUgcGFyYW1ldGVyLCB7QGxpbmsgUGFyc2UuQ2xvdWQuQmVmb3JlRmluZFJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5CZWZvcmVGaW5kUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYmVmb3JlRmluZCA9IGZ1bmN0aW9uIChwYXJzZUNsYXNzLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICB2YXIgY2xhc3NOYW1lID0gZ2V0Q2xhc3NOYW1lKHBhcnNlQ2xhc3MpO1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlRmluZCxcbiAgICBjbGFzc05hbWUsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgIHZhbGlkYXRpb25IYW5kbGVyXG4gICk7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhbiBhZnRlciBmaW5kIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIElmIHlvdSB3YW50IHRvIHVzZSBhZnRlckZpbmQgZm9yIGEgcHJlZGVmaW5lZCBjbGFzcyBpbiB0aGUgUGFyc2UgSmF2YVNjcmlwdCBTREsgKGUuZy4ge0BsaW5rIFBhcnNlLlVzZXJ9KSwgeW91IHNob3VsZCBwYXNzIHRoZSBjbGFzcyBpdHNlbGYgYW5kIG5vdCB0aGUgU3RyaW5nIGZvciBhcmcxLlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5hZnRlckZpbmQoJ015Q3VzdG9tQ2xhc3MnLCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5hZnRlckZpbmQoUGFyc2UuVXNlciwgYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYWZ0ZXJGaW5kXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5hZnRlckZpbmRcbiAqIEBwYXJhbSB7KFN0cmluZ3xQYXJzZS5PYmplY3QpfSBhcmcxIFRoZSBQYXJzZS5PYmplY3Qgc3ViY2xhc3MgdG8gcmVnaXN0ZXIgdGhlIGFmdGVyIGZpbmQgZnVuY3Rpb24gZm9yLiBUaGlzIGNhbiBpbnN0ZWFkIGJlIGEgU3RyaW5nIHRoYXQgaXMgdGhlIGNsYXNzTmFtZSBvZiB0aGUgc3ViY2xhc3MuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYmVmb3JlIGEgZmluZC4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIGp1c3Qgb25lIHBhcmFtZXRlciwge0BsaW5rIFBhcnNlLkNsb3VkLkFmdGVyRmluZFJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5BZnRlckZpbmRSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5hZnRlckZpbmQgPSBmdW5jdGlvbiAocGFyc2VDbGFzcywgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgY29uc3QgY2xhc3NOYW1lID0gZ2V0Q2xhc3NOYW1lKHBhcnNlQ2xhc3MpO1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJGaW5kLFxuICAgIGNsYXNzTmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXJcbiAgKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGEgYmVmb3JlIHNhdmUgZmlsZSBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZVNhdmVGaWxlKGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZVNhdmVGaWxlKGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGJlZm9yZVNhdmVGaWxlXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5iZWZvcmVTYXZlRmlsZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGJlZm9yZSBzYXZpbmcgYSBmaWxlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2UganVzdCBvbmUgcGFyYW1ldGVyLCB7QGxpbmsgUGFyc2UuQ2xvdWQuRmlsZVRyaWdnZXJSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuRmlsZVRyaWdnZXJSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5iZWZvcmVTYXZlRmlsZSA9IGZ1bmN0aW9uIChoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIHRyaWdnZXJzLmFkZEZpbGVUcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZVNhdmVGaWxlLFxuICAgIGhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICB2YWxpZGF0aW9uSGFuZGxlclxuICApO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYW4gYWZ0ZXIgc2F2ZSBmaWxlIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJTYXZlRmlsZShhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5hZnRlclNhdmVGaWxlKGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYWZ0ZXJTYXZlRmlsZVxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYWZ0ZXJTYXZlRmlsZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGFmdGVyIHNhdmluZyBhIGZpbGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBqdXN0IG9uZSBwYXJhbWV0ZXIsIHtAbGluayBQYXJzZS5DbG91ZC5GaWxlVHJpZ2dlclJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5GaWxlVHJpZ2dlclJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmFmdGVyU2F2ZUZpbGUgPSBmdW5jdGlvbiAoaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgdmFsaWRhdGVWYWxpZGF0b3IodmFsaWRhdGlvbkhhbmRsZXIpO1xuICB0cmlnZ2Vycy5hZGRGaWxlVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlclNhdmVGaWxlLFxuICAgIGhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICB2YWxpZGF0aW9uSGFuZGxlclxuICApO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYSBiZWZvcmUgZGVsZXRlIGZpbGUgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVEZWxldGVGaWxlKGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZURlbGV0ZUZpbGUoYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYmVmb3JlRGVsZXRlRmlsZVxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlRGVsZXRlRmlsZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGJlZm9yZSBkZWxldGluZyBhIGZpbGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBqdXN0IG9uZSBwYXJhbWV0ZXIsIHtAbGluayBQYXJzZS5DbG91ZC5GaWxlVHJpZ2dlclJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5GaWxlVHJpZ2dlclJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmJlZm9yZURlbGV0ZUZpbGUgPSBmdW5jdGlvbiAoaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgdmFsaWRhdGVWYWxpZGF0b3IodmFsaWRhdGlvbkhhbmRsZXIpO1xuICB0cmlnZ2Vycy5hZGRGaWxlVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVEZWxldGVGaWxlLFxuICAgIGhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICB2YWxpZGF0aW9uSGFuZGxlclxuICApO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYW4gYWZ0ZXIgZGVsZXRlIGZpbGUgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5hZnRlckRlbGV0ZUZpbGUoYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJEZWxldGVGaWxlKGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGFmdGVyRGVsZXRlRmlsZVxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYWZ0ZXJEZWxldGVGaWxlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBhZnRlciBiZWZvcmUgZGVsZXRpbmcgYSBmaWxlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2UganVzdCBvbmUgcGFyYW1ldGVyLCB7QGxpbmsgUGFyc2UuQ2xvdWQuRmlsZVRyaWdnZXJSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuRmlsZVRyaWdnZXJSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5hZnRlckRlbGV0ZUZpbGUgPSBmdW5jdGlvbiAoaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgdmFsaWRhdGVWYWxpZGF0b3IodmFsaWRhdGlvbkhhbmRsZXIpO1xuICB0cmlnZ2Vycy5hZGRGaWxlVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlckRlbGV0ZUZpbGUsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgIHZhbGlkYXRpb25IYW5kbGVyXG4gICk7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhIGJlZm9yZSBsaXZlIHF1ZXJ5IHNlcnZlciBjb25uZWN0IGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYmVmb3JlQ29ubmVjdChhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVDb25uZWN0KGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGJlZm9yZUNvbm5lY3RcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmJlZm9yZUNvbm5lY3RcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIGJlZm9yZSBjb25uZWN0aW9uIGlzIG1hZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBqdXN0IG9uZSBwYXJhbWV0ZXIsIHtAbGluayBQYXJzZS5DbG91ZC5Db25uZWN0VHJpZ2dlclJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5Db25uZWN0VHJpZ2dlclJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmJlZm9yZUNvbm5lY3QgPSBmdW5jdGlvbiAoaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgdmFsaWRhdGVWYWxpZGF0b3IodmFsaWRhdGlvbkhhbmRsZXIpO1xuICB0cmlnZ2Vycy5hZGRDb25uZWN0VHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVDb25uZWN0LFxuICAgIGhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICB2YWxpZGF0aW9uSGFuZGxlclxuICApO1xufTtcblxuLyoqXG4gKiBTZW5kcyBhbiBlbWFpbCB0aHJvdWdoIHRoZSBQYXJzZSBTZXJ2ZXIgbWFpbCBhZGFwdGVyLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICogKipSZXF1aXJlcyBhIG1haWwgYWRhcHRlciB0byBiZSBjb25maWd1cmVkIGZvciBQYXJzZSBTZXJ2ZXIuKipcbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLnNlbmRFbWFpbCh7XG4gKiAgIGZyb206ICdFeGFtcGxlIDx0ZXN0QGV4YW1wbGUuY29tPicsXG4gKiAgIHRvOiAnY29udGFjdEBleGFtcGxlLmNvbScsXG4gKiAgIHN1YmplY3Q6ICdUZXN0IGVtYWlsJyxcbiAqICAgdGV4dDogJ1RoaXMgZW1haWwgaXMgYSB0ZXN0LidcbiAqIH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIHNlbmRFbWFpbFxuICogQG5hbWUgUGFyc2UuQ2xvdWQuc2VuZEVtYWlsXG4gKiBAcGFyYW0ge09iamVjdH0gZGF0YSBUaGUgb2JqZWN0IG9mIHRoZSBtYWlsIGRhdGEgdG8gc2VuZC5cbiAqL1xuUGFyc2VDbG91ZC5zZW5kRW1haWwgPSBmdW5jdGlvbiAoZGF0YSkge1xuICBjb25zdCBjb25maWcgPSBDb25maWcuZ2V0KFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICBjb25zdCBlbWFpbEFkYXB0ZXIgPSBjb25maWcudXNlckNvbnRyb2xsZXIuYWRhcHRlcjtcbiAgaWYgKCFlbWFpbEFkYXB0ZXIpIHtcbiAgICBjb25maWcubG9nZ2VyQ29udHJvbGxlci5lcnJvcihcbiAgICAgICdGYWlsZWQgdG8gc2VuZCBlbWFpbCBiZWNhdXNlIG5vIG1haWwgYWRhcHRlciBpcyBjb25maWd1cmVkIGZvciBQYXJzZSBTZXJ2ZXIuJ1xuICAgICk7XG4gICAgcmV0dXJuO1xuICB9XG4gIHJldHVybiBlbWFpbEFkYXB0ZXIuc2VuZE1haWwoZGF0YSk7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhIGJlZm9yZSBsaXZlIHF1ZXJ5IHN1YnNjcmlwdGlvbiBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBJZiB5b3Ugd2FudCB0byB1c2UgYmVmb3JlU3Vic2NyaWJlIGZvciBhIHByZWRlZmluZWQgY2xhc3MgaW4gdGhlIFBhcnNlIEphdmFTY3JpcHQgU0RLIChlLmcuIHtAbGluayBQYXJzZS5Vc2VyfSksIHlvdSBzaG91bGQgcGFzcyB0aGUgY2xhc3MgaXRzZWxmIGFuZCBub3QgdGhlIFN0cmluZyBmb3IgYXJnMS5cbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYmVmb3JlU3Vic2NyaWJlKCdNeUN1c3RvbUNsYXNzJywgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYmVmb3JlU3Vic2NyaWJlKFBhcnNlLlVzZXIsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGJlZm9yZVN1YnNjcmliZVxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlU3Vic2NyaWJlXG4gKiBAcGFyYW0geyhTdHJpbmd8UGFyc2UuT2JqZWN0KX0gYXJnMSBUaGUgUGFyc2UuT2JqZWN0IHN1YmNsYXNzIHRvIHJlZ2lzdGVyIHRoZSBiZWZvcmUgc3Vic2NyaXB0aW9uIGZ1bmN0aW9uIGZvci4gVGhpcyBjYW4gaW5zdGVhZCBiZSBhIFN0cmluZyB0aGF0IGlzIHRoZSBjbGFzc05hbWUgb2YgdGhlIHN1YmNsYXNzLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGJlZm9yZSBhIHN1YnNjcmlwdGlvbi4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIsIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmJlZm9yZVN1YnNjcmliZSA9IGZ1bmN0aW9uIChwYXJzZUNsYXNzLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIHZhciBjbGFzc05hbWUgPSBnZXRDbGFzc05hbWUocGFyc2VDbGFzcyk7XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlU3Vic2NyaWJlLFxuICAgIGNsYXNzTmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXJcbiAgKTtcbn07XG5cblBhcnNlQ2xvdWQub25MaXZlUXVlcnlFdmVudCA9IGZ1bmN0aW9uIChoYW5kbGVyKSB7XG4gIHRyaWdnZXJzLmFkZExpdmVRdWVyeUV2ZW50SGFuZGxlcihoYW5kbGVyLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGFuIGFmdGVyIGxpdmUgcXVlcnkgc2VydmVyIGV2ZW50IGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJMaXZlUXVlcnlFdmVudCgnTXlDdXN0b21DbGFzcycsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmFmdGVyTGl2ZVF1ZXJ5RXZlbnQoJ015Q3VzdG9tQ2xhc3MnLCAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KTtcbiAqYGBgXG4gKlxuICogQG1ldGhvZCBhZnRlckxpdmVRdWVyeUV2ZW50XG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5hZnRlckxpdmVRdWVyeUV2ZW50XG4gKiBAcGFyYW0geyhTdHJpbmd8UGFyc2UuT2JqZWN0KX0gYXJnMSBUaGUgUGFyc2UuT2JqZWN0IHN1YmNsYXNzIHRvIHJlZ2lzdGVyIHRoZSBhZnRlciBsaXZlIHF1ZXJ5IGV2ZW50IGZ1bmN0aW9uIGZvci4gVGhpcyBjYW4gaW5zdGVhZCBiZSBhIFN0cmluZyB0aGF0IGlzIHRoZSBjbGFzc05hbWUgb2YgdGhlIHN1YmNsYXNzLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGFmdGVyIGEgbGl2ZSBxdWVyeSBldmVudC4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIsIGEge0BsaW5rIFBhcnNlLkNsb3VkLkxpdmVRdWVyeUV2ZW50VHJpZ2dlcn0uXG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLkxpdmVRdWVyeUV2ZW50VHJpZ2dlcn0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYWZ0ZXJMaXZlUXVlcnlFdmVudCA9IGZ1bmN0aW9uIChwYXJzZUNsYXNzLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBjb25zdCBjbGFzc05hbWUgPSBnZXRDbGFzc05hbWUocGFyc2VDbGFzcyk7XG4gIHZhbGlkYXRlVmFsaWRhdG9yKHZhbGlkYXRpb25IYW5kbGVyKTtcbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlckV2ZW50LFxuICAgIGNsYXNzTmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXJcbiAgKTtcbn07XG5cblBhcnNlQ2xvdWQuX3JlbW92ZUFsbEhvb2tzID0gKCkgPT4ge1xuICB0cmlnZ2Vycy5fdW5yZWdpc3RlckFsbCgpO1xufTtcblxuUGFyc2VDbG91ZC51c2VNYXN0ZXJLZXkgPSAoKSA9PiB7XG4gIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZVxuICBjb25zb2xlLndhcm4oXG4gICAgJ1BhcnNlLkNsb3VkLnVzZU1hc3RlcktleSBpcyBkZXByZWNhdGVkIChhbmQgaGFzIG5vIGVmZmVjdCBhbnltb3JlKSBvbiBwYXJzZS1zZXJ2ZXIsIHBsZWFzZSByZWZlciB0byB0aGUgY2xvdWQgY29kZSBtaWdyYXRpb24gbm90ZXM6IGh0dHA6Ly9kb2NzLnBhcnNlcGxhdGZvcm0ub3JnL3BhcnNlLXNlcnZlci9ndWlkZS8jbWFzdGVyLWtleS1tdXN0LWJlLXBhc3NlZC1leHBsaWNpdGx5J1xuICApO1xufTtcblxuUGFyc2VDbG91ZC5odHRwUmVxdWVzdCA9IHJlcXVpcmUoJy4vaHR0cFJlcXVlc3QnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBQYXJzZUNsb3VkO1xuXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3RcbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpbnN0YWxsYXRpb25JZCBJZiBzZXQsIHRoZSBpbnN0YWxsYXRpb25JZCB0cmlnZ2VyaW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtCb29sZWFufSBtYXN0ZXIgSWYgdHJ1ZSwgbWVhbnMgdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4gKiBAcHJvcGVydHkge1BhcnNlLlVzZXJ9IHVzZXIgSWYgc2V0LCB0aGUgdXNlciB0aGF0IG1hZGUgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1BhcnNlLk9iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdHJpZ2dlcmluZyB0aGUgaG9vay5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpcCBUaGUgSVAgYWRkcmVzcyBvZiB0aGUgY2xpZW50IG1ha2luZyB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBoZWFkZXJzIFRoZSBvcmlnaW5hbCBIVFRQIGhlYWRlcnMgZm9yIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtTdHJpbmd9IHRyaWdnZXJOYW1lIFRoZSBuYW1lIG9mIHRoZSB0cmlnZ2VyIChgYmVmb3JlU2F2ZWAsIGBhZnRlclNhdmVgLCAuLi4pXG4gKiBAcHJvcGVydHkge09iamVjdH0gbG9nIFRoZSBjdXJyZW50IGxvZ2dlciBpbnNpZGUgUGFyc2UgU2VydmVyLlxuICogQHByb3BlcnR5IHtQYXJzZS5PYmplY3R9IG9yaWdpbmFsIElmIHNldCwgdGhlIG9iamVjdCwgYXMgY3VycmVudGx5IHN0b3JlZC5cbiAqL1xuXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFyc2UuQ2xvdWQuRmlsZVRyaWdnZXJSZXF1ZXN0XG4gKiBAcHJvcGVydHkge1N0cmluZ30gaW5zdGFsbGF0aW9uSWQgSWYgc2V0LCB0aGUgaW5zdGFsbGF0aW9uSWQgdHJpZ2dlcmluZyB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gbWFzdGVyIElmIHRydWUsIG1lYW5zIHRoZSBtYXN0ZXIga2V5IHdhcyB1c2VkLlxuICogQHByb3BlcnR5IHtQYXJzZS5Vc2VyfSB1c2VyIElmIHNldCwgdGhlIHVzZXIgdGhhdCBtYWRlIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtQYXJzZS5GaWxlfSBmaWxlIFRoZSBmaWxlIHRoYXQgdHJpZ2dlcmVkIHRoZSBob29rLlxuICogQHByb3BlcnR5IHtJbnRlZ2VyfSBmaWxlU2l6ZSBUaGUgc2l6ZSBvZiB0aGUgZmlsZSBpbiBieXRlcy5cbiAqIEBwcm9wZXJ0eSB7SW50ZWdlcn0gY29udGVudExlbmd0aCBUaGUgdmFsdWUgZnJvbSBDb250ZW50LUxlbmd0aCBoZWFkZXJcbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpcCBUaGUgSVAgYWRkcmVzcyBvZiB0aGUgY2xpZW50IG1ha2luZyB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBoZWFkZXJzIFRoZSBvcmlnaW5hbCBIVFRQIGhlYWRlcnMgZm9yIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtTdHJpbmd9IHRyaWdnZXJOYW1lIFRoZSBuYW1lIG9mIHRoZSB0cmlnZ2VyIChgYmVmb3JlU2F2ZUZpbGVgLCBgYWZ0ZXJTYXZlRmlsZWApXG4gKiBAcHJvcGVydHkge09iamVjdH0gbG9nIFRoZSBjdXJyZW50IGxvZ2dlciBpbnNpZGUgUGFyc2UgU2VydmVyLlxuICovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5Db25uZWN0VHJpZ2dlclJlcXVlc3RcbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpbnN0YWxsYXRpb25JZCBJZiBzZXQsIHRoZSBpbnN0YWxsYXRpb25JZCB0cmlnZ2VyaW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtCb29sZWFufSB1c2VNYXN0ZXJLZXkgSWYgdHJ1ZSwgbWVhbnMgdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4gKiBAcHJvcGVydHkge1BhcnNlLlVzZXJ9IHVzZXIgSWYgc2V0LCB0aGUgdXNlciB0aGF0IG1hZGUgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge0ludGVnZXJ9IGNsaWVudHMgVGhlIG51bWJlciBvZiBjbGllbnRzIGNvbm5lY3RlZC5cbiAqIEBwcm9wZXJ0eSB7SW50ZWdlcn0gc3Vic2NyaXB0aW9ucyBUaGUgbnVtYmVyIG9mIHN1YnNjcmlwdGlvbnMgY29ubmVjdGVkLlxuICogQHByb3BlcnR5IHtTdHJpbmd9IHNlc3Npb25Ub2tlbiBJZiBzZXQsIHRoZSBzZXNzaW9uIG9mIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqL1xuXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFyc2UuQ2xvdWQuTGl2ZVF1ZXJ5RXZlbnRUcmlnZ2VyXG4gKiBAcHJvcGVydHkge1N0cmluZ30gaW5zdGFsbGF0aW9uSWQgSWYgc2V0LCB0aGUgaW5zdGFsbGF0aW9uSWQgdHJpZ2dlcmluZyB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gdXNlTWFzdGVyS2V5IElmIHRydWUsIG1lYW5zIHRoZSBtYXN0ZXIga2V5IHdhcyB1c2VkLlxuICogQHByb3BlcnR5IHtQYXJzZS5Vc2VyfSB1c2VyIElmIHNldCwgdGhlIHVzZXIgdGhhdCBtYWRlIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtTdHJpbmd9IHNlc3Npb25Ub2tlbiBJZiBzZXQsIHRoZSBzZXNzaW9uIG9mIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBldmVudCBUaGUgbGl2ZSBxdWVyeSBldmVudCB0aGF0IHRyaWdnZXJlZCB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuT2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0cmlnZ2VyaW5nIHRoZSBob29rLlxuICogQHByb3BlcnR5IHtQYXJzZS5PYmplY3R9IG9yaWdpbmFsIElmIHNldCwgdGhlIG9iamVjdCwgYXMgY3VycmVudGx5IHN0b3JlZC5cbiAqIEBwcm9wZXJ0eSB7SW50ZWdlcn0gY2xpZW50cyBUaGUgbnVtYmVyIG9mIGNsaWVudHMgY29ubmVjdGVkLlxuICogQHByb3BlcnR5IHtJbnRlZ2VyfSBzdWJzY3JpcHRpb25zIFRoZSBudW1iZXIgb2Ygc3Vic2NyaXB0aW9ucyBjb25uZWN0ZWQuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IHNlbmRFdmVudCBJZiB0aGUgTGl2ZVF1ZXJ5IGV2ZW50IHNob3VsZCBiZSBzZW50IHRvIHRoZSBjbGllbnQuIFNldCB0byBmYWxzZSB0byBwcmV2ZW50IExpdmVRdWVyeSBmcm9tIHB1c2hpbmcgdG8gdGhlIGNsaWVudC5cbiAqL1xuXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFyc2UuQ2xvdWQuQmVmb3JlRmluZFJlcXVlc3RcbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpbnN0YWxsYXRpb25JZCBJZiBzZXQsIHRoZSBpbnN0YWxsYXRpb25JZCB0cmlnZ2VyaW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtCb29sZWFufSBtYXN0ZXIgSWYgdHJ1ZSwgbWVhbnMgdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4gKiBAcHJvcGVydHkge1BhcnNlLlVzZXJ9IHVzZXIgSWYgc2V0LCB0aGUgdXNlciB0aGF0IG1hZGUgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1BhcnNlLlF1ZXJ5fSBxdWVyeSBUaGUgcXVlcnkgdHJpZ2dlcmluZyB0aGUgaG9vay5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpcCBUaGUgSVAgYWRkcmVzcyBvZiB0aGUgY2xpZW50IG1ha2luZyB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBoZWFkZXJzIFRoZSBvcmlnaW5hbCBIVFRQIGhlYWRlcnMgZm9yIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtTdHJpbmd9IHRyaWdnZXJOYW1lIFRoZSBuYW1lIG9mIHRoZSB0cmlnZ2VyIChgYmVmb3JlU2F2ZWAsIGBhZnRlclNhdmVgLCAuLi4pXG4gKiBAcHJvcGVydHkge09iamVjdH0gbG9nIFRoZSBjdXJyZW50IGxvZ2dlciBpbnNpZGUgUGFyc2UgU2VydmVyLlxuICogQHByb3BlcnR5IHtCb29sZWFufSBpc0dldCB3ZXRoZXIgdGhlIHF1ZXJ5IGEgYGdldGAgb3IgYSBgZmluZGBcbiAqL1xuXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFyc2UuQ2xvdWQuQWZ0ZXJGaW5kUmVxdWVzdFxuICogQHByb3BlcnR5IHtTdHJpbmd9IGluc3RhbGxhdGlvbklkIElmIHNldCwgdGhlIGluc3RhbGxhdGlvbklkIHRyaWdnZXJpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IG1hc3RlciBJZiB0cnVlLCBtZWFucyB0aGUgbWFzdGVyIGtleSB3YXMgdXNlZC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuVXNlcn0gdXNlciBJZiBzZXQsIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuUXVlcnl9IHF1ZXJ5IFRoZSBxdWVyeSB0cmlnZ2VyaW5nIHRoZSBob29rLlxuICogQHByb3BlcnR5IHtBcnJheTxQYXJzZS5PYmplY3Q+fSByZXN1bHRzIFRoZSByZXN1bHRzIHRoZSBxdWVyeSB5aWVsZGVkLlxuICogQHByb3BlcnR5IHtTdHJpbmd9IGlwIFRoZSBJUCBhZGRyZXNzIG9mIHRoZSBjbGllbnQgbWFraW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtPYmplY3R9IGhlYWRlcnMgVGhlIG9yaWdpbmFsIEhUVFAgaGVhZGVycyBmb3IgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gdHJpZ2dlck5hbWUgVGhlIG5hbWUgb2YgdGhlIHRyaWdnZXIgKGBiZWZvcmVTYXZlYCwgYGFmdGVyU2F2ZWAsIC4uLilcbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBsb2cgVGhlIGN1cnJlbnQgbG9nZ2VyIGluc2lkZSBQYXJzZSBTZXJ2ZXIuXG4gKi9cblxuLyoqXG4gKiBAaW50ZXJmYWNlIFBhcnNlLkNsb3VkLkZ1bmN0aW9uUmVxdWVzdFxuICogQHByb3BlcnR5IHtTdHJpbmd9IGluc3RhbGxhdGlvbklkIElmIHNldCwgdGhlIGluc3RhbGxhdGlvbklkIHRyaWdnZXJpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IG1hc3RlciBJZiB0cnVlLCBtZWFucyB0aGUgbWFzdGVyIGtleSB3YXMgdXNlZC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuVXNlcn0gdXNlciBJZiBzZXQsIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBwYXJhbXMgVGhlIHBhcmFtcyBwYXNzZWQgdG8gdGhlIGNsb3VkIGZ1bmN0aW9uLlxuICovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5Kb2JSZXF1ZXN0XG4gKiBAcHJvcGVydHkge09iamVjdH0gcGFyYW1zIFRoZSBwYXJhbXMgcGFzc2VkIHRvIHRoZSBiYWNrZ3JvdW5kIGpvYi5cbiAqIEBwcm9wZXJ0eSB7ZnVuY3Rpb259IG1lc3NhZ2UgSWYgbWVzc2FnZSBpcyBjYWxsZWQgd2l0aCBhIHN0cmluZyBhcmd1bWVudCwgd2lsbCB1cGRhdGUgdGhlIGN1cnJlbnQgbWVzc2FnZSB0byBiZSBzdG9yZWQgaW4gdGhlIGpvYiBzdGF0dXMuXG4gKi9cblxuLyoqXG4gKiBAaW50ZXJmYWNlIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdFxuICogQHByb3BlcnR5IHtCb29sZWFufSByZXF1aXJlVXNlciB3aGV0aGVyIHRoZSBjbG91ZCB0cmlnZ2VyIHJlcXVpcmVzIGEgdXNlci5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gcmVxdWlyZU1hc3RlciB3aGV0aGVyIHRoZSBjbG91ZCB0cmlnZ2VyIHJlcXVpcmVzIGEgbWFzdGVyIGtleS5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gdmFsaWRhdGVNYXN0ZXJLZXkgd2hldGhlciB0aGUgdmFsaWRhdG9yIHNob3VsZCBydW4gaWYgbWFzdGVyS2V5IGlzIHByb3ZpZGVkLiBEZWZhdWx0cyB0byBmYWxzZS5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gc2tpcFdpdGhNYXN0ZXJLZXkgd2hldGhlciB0aGUgY2xvdWQgY29kZSBmdW5jdGlvbiBzaG91bGQgYmUgaWdub3JlZCB1c2luZyBhIG1hc3RlcktleS5cbiAqXG4gKiBAcHJvcGVydHkge0FycmF5PFN0cmluZz58T2JqZWN0fSByZXF1aXJlVXNlcktleXMgSWYgc2V0LCBrZXlzIHJlcXVpcmVkIG9uIHJlcXVlc3QudXNlciB0byBtYWtlIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtTdHJpbmd9IHJlcXVpcmVVc2VyS2V5cy5maWVsZCBJZiByZXF1aXJlVXNlcktleXMgaXMgYW4gb2JqZWN0LCBuYW1lIG9mIGZpZWxkIHRvIHZhbGlkYXRlIG9uIHJlcXVlc3QgdXNlclxuICogQHByb3BlcnR5IHtBcnJheXxmdW5jdGlvbnxBbnl9IHJlcXVpcmVVc2VyS2V5cy5maWVsZC5vcHRpb25zIGFycmF5IG9mIG9wdGlvbnMgdGhhdCB0aGUgZmllbGQgY2FuIGJlLCBmdW5jdGlvbiB0byB2YWxpZGF0ZSBmaWVsZCwgb3Igc2luZ2xlIHZhbHVlLiBUaHJvdyBhbiBlcnJvciBpZiB2YWx1ZSBpcyBpbnZhbGlkLlxuICogQHByb3BlcnR5IHtTdHJpbmd9IHJlcXVpcmVVc2VyS2V5cy5maWVsZC5lcnJvciBjdXN0b20gZXJyb3IgbWVzc2FnZSBpZiBmaWVsZCBpcyBpbnZhbGlkLlxuICpcbiAqIEBwcm9wZXJ0eSB7QXJyYXk8U3RyaW5nPnxmdW5jdGlvbn1yZXF1aXJlQW55VXNlclJvbGVzIElmIHNldCwgcmVxdWVzdC51c2VyIGhhcyB0byBiZSBwYXJ0IG9mIGF0IGxlYXN0IG9uZSByb2xlcyBuYW1lIHRvIG1ha2UgdGhlIHJlcXVlc3QuIElmIHNldCB0byBhIGZ1bmN0aW9uLCBmdW5jdGlvbiBtdXN0IHJldHVybiByb2xlIG5hbWVzLlxuICogQHByb3BlcnR5IHtBcnJheTxTdHJpbmc+fGZ1bmN0aW9ufXJlcXVpcmVBbGxVc2VyUm9sZXMgSWYgc2V0LCByZXF1ZXN0LnVzZXIgaGFzIHRvIGJlIHBhcnQgYWxsIHJvbGVzIG5hbWUgdG8gbWFrZSB0aGUgcmVxdWVzdC4gSWYgc2V0IHRvIGEgZnVuY3Rpb24sIGZ1bmN0aW9uIG11c3QgcmV0dXJuIHJvbGUgbmFtZXMuXG4gKlxuICogQHByb3BlcnR5IHtPYmplY3R8QXJyYXk8U3RyaW5nPn0gZmllbGRzIGlmIGFuIGFycmF5IG9mIHN0cmluZ3MsIHZhbGlkYXRvciB3aWxsIGxvb2sgZm9yIGtleXMgaW4gcmVxdWVzdC5wYXJhbXMsIGFuZCB0aHJvdyBpZiBub3QgcHJvdmlkZWQuIElmIE9iamVjdCwgZmllbGRzIHRvIHZhbGlkYXRlLiBJZiB0aGUgdHJpZ2dlciBpcyBhIGNsb3VkIGZ1bmN0aW9uLCBgcmVxdWVzdC5wYXJhbXNgIHdpbGwgYmUgdmFsaWRhdGVkLCBvdGhlcndpc2UgYHJlcXVlc3Qub2JqZWN0YC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBmaWVsZHMuZmllbGQgbmFtZSBvZiBmaWVsZCB0byB2YWxpZGF0ZS5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBmaWVsZHMuZmllbGQudHlwZSBleHBlY3RlZCB0eXBlIG9mIGRhdGEgZm9yIGZpZWxkLlxuICogQHByb3BlcnR5IHtCb29sZWFufSBmaWVsZHMuZmllbGQuY29uc3RhbnQgd2hldGhlciB0aGUgZmllbGQgY2FuIGJlIG1vZGlmaWVkIG9uIHRoZSBvYmplY3QuXG4gKiBAcHJvcGVydHkge0FueX0gZmllbGRzLmZpZWxkLmRlZmF1bHQgZGVmYXVsdCB2YWx1ZSBpZiBmaWVsZCBpcyBgbnVsbGAsIG9yIGluaXRpYWwgdmFsdWUgYGNvbnN0YW50YCBpcyBgdHJ1ZWAuXG4gKiBAcHJvcGVydHkge0FycmF5fGZ1bmN0aW9ufEFueX0gZmllbGRzLmZpZWxkLm9wdGlvbnMgYXJyYXkgb2Ygb3B0aW9ucyB0aGF0IHRoZSBmaWVsZCBjYW4gYmUsIGZ1bmN0aW9uIHRvIHZhbGlkYXRlIGZpZWxkLCBvciBzaW5nbGUgdmFsdWUuIFRocm93IGFuIGVycm9yIGlmIHZhbHVlIGlzIGludmFsaWQuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gZmllbGRzLmZpZWxkLmVycm9yIGN1c3RvbSBlcnJvciBtZXNzYWdlIGlmIGZpZWxkIGlzIGludmFsaWQuXG4gKi9cbiJdfQ==