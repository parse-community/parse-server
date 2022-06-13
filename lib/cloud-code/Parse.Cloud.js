"use strict";

var _node = require("parse/node");

var triggers = _interopRequireWildcard(require("../triggers"));

var _Deprecator = _interopRequireDefault(require("../Deprecator/Deprecator"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

const Config = require('../Config');

function isParseObjectConstructor(object) {
  return typeof object === 'function' && Object.prototype.hasOwnProperty.call(object, 'className');
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
 * If you want to use beforeSave for a predefined class in the Parse JavaScript SDK (e.g. {@link Parse.User} or {@link Parse.File}), you should pass the class itself and not the String for arg1.
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
  const className = triggers.getClassName(parseClass);
  validateValidator(validationHandler);
  triggers.addTrigger(triggers.Types.beforeSave, className, handler, _node.Parse.applicationId, validationHandler);
};
/**
 * Registers a before delete function.
 *
 * **Available in Cloud Code only.**
 *
 * If you want to use beforeDelete for a predefined class in the Parse JavaScript SDK (e.g. {@link Parse.User} or {@link Parse.File}), you should pass the class itself and not the String for arg1.
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
  const className = triggers.getClassName(parseClass);
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
    className = triggers.getClassName(handler);
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
    className = triggers.getClassName(handler);
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
    className = triggers.getClassName(handler);
    handler = arguments[1];
  }

  triggers.addTrigger(triggers.Types.afterLogout, className, handler, _node.Parse.applicationId);
};
/**
 * Registers an after save function.
 *
 * **Available in Cloud Code only.**
 *
 * If you want to use afterSave for a predefined class in the Parse JavaScript SDK (e.g. {@link Parse.User} or {@link Parse.File}), you should pass the class itself and not the String for arg1.
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
  const className = triggers.getClassName(parseClass);
  validateValidator(validationHandler);
  triggers.addTrigger(triggers.Types.afterSave, className, handler, _node.Parse.applicationId, validationHandler);
};
/**
 * Registers an after delete function.
 *
 * **Available in Cloud Code only.**
 *
 * If you want to use afterDelete for a predefined class in the Parse JavaScript SDK (e.g. {@link Parse.User} or {@link Parse.File}), you should pass the class itself and not the String for arg1.
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
  const className = triggers.getClassName(parseClass);
  validateValidator(validationHandler);
  triggers.addTrigger(triggers.Types.afterDelete, className, handler, _node.Parse.applicationId, validationHandler);
};
/**
 * Registers a before find function.
 *
 * **Available in Cloud Code only.**
 *
 * If you want to use beforeFind for a predefined class in the Parse JavaScript SDK (e.g. {@link Parse.User} or {@link Parse.File}), you should pass the class itself and not the String for arg1.
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
  const className = triggers.getClassName(parseClass);
  validateValidator(validationHandler);
  triggers.addTrigger(triggers.Types.beforeFind, className, handler, _node.Parse.applicationId, validationHandler);
};
/**
 * Registers an after find function.
 *
 * **Available in Cloud Code only.**
 *
 * If you want to use afterFind for a predefined class in the Parse JavaScript SDK (e.g. {@link Parse.User} or {@link Parse.File}), you should pass the class itself and not the String for arg1.
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
  const className = triggers.getClassName(parseClass);
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
 * @deprecated
 * @name Parse.Cloud.beforeSaveFile
 * @param {Function} func The function to run before saving a file. This function can be async and should take just one parameter, {@link Parse.Cloud.FileTriggerRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.FileTriggerRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */


ParseCloud.beforeSaveFile = function (handler, validationHandler) {
  _Deprecator.default.logRuntimeDeprecation({
    usage: 'Parse.Cloud.beforeSaveFile',
    solution: 'Use Parse.Cloud.beforeSave(Parse.File, (request) => {})'
  });

  ParseCloud.beforeSave(_node.Parse.File, handler, validationHandler);
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
 * @deprecated
 * @name Parse.Cloud.afterSaveFile
 * @param {Function} func The function to run after saving a file. This function can be async and should take just one parameter, {@link Parse.Cloud.FileTriggerRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.FileTriggerRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */


ParseCloud.afterSaveFile = function (handler, validationHandler) {
  _Deprecator.default.logRuntimeDeprecation({
    usage: 'Parse.Cloud.afterSaveFile',
    solution: 'Use Parse.Cloud.afterSave(Parse.File, (request) => {})'
  });

  ParseCloud.afterSave(_node.Parse.File, handler, validationHandler);
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
 * @deprecated
 * @name Parse.Cloud.beforeDeleteFile
 * @param {Function} func The function to run before deleting a file. This function can be async and should take just one parameter, {@link Parse.Cloud.FileTriggerRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.FileTriggerRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */


ParseCloud.beforeDeleteFile = function (handler, validationHandler) {
  _Deprecator.default.logRuntimeDeprecation({
    usage: 'Parse.Cloud.beforeDeleteFile',
    solution: 'Use Parse.Cloud.beforeDelete(Parse.File, (request) => {})'
  });

  ParseCloud.beforeDelete(_node.Parse.File, handler, validationHandler);
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
 * @deprecated
 * @name Parse.Cloud.afterDeleteFile
 * @param {Function} func The function to after before deleting a file. This function can be async and should take just one parameter, {@link Parse.Cloud.FileTriggerRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.FileTriggerRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */


ParseCloud.afterDeleteFile = function (handler, validationHandler) {
  _Deprecator.default.logRuntimeDeprecation({
    usage: 'Parse.Cloud.afterDeleteFile',
    solution: 'Use Parse.Cloud.afterDelete(Parse.File, (request) => {})'
  });

  ParseCloud.afterDelete(_node.Parse.File, handler, validationHandler);
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
 * If you want to use beforeSubscribe for a predefined class in the Parse JavaScript SDK (e.g. {@link Parse.User} or {@link Parse.File}), you should pass the class itself and not the String for arg1.
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
  const className = triggers.getClassName(parseClass);
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
  const className = triggers.getClassName(parseClass);
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

const request = require('./httpRequest');

ParseCloud.httpRequest = opts => {
  _Deprecator.default.logRuntimeDeprecation({
    usage: 'Parse.Cloud.httpRequest',
    solution: 'Use a http request library instead.'
  });

  return request(opts);
};

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9jbG91ZC1jb2RlL1BhcnNlLkNsb3VkLmpzIl0sIm5hbWVzIjpbIkNvbmZpZyIsInJlcXVpcmUiLCJpc1BhcnNlT2JqZWN0Q29uc3RydWN0b3IiLCJvYmplY3QiLCJPYmplY3QiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJ2YWxpZGF0ZVZhbGlkYXRvciIsInZhbGlkYXRvciIsImZpZWxkT3B0aW9ucyIsInR5cGUiLCJjb25zdGFudCIsIkJvb2xlYW4iLCJkZWZhdWx0Iiwib3B0aW9ucyIsIkFycmF5IiwicmVxdWlyZWQiLCJlcnJvciIsIlN0cmluZyIsImFsbG93ZWRLZXlzIiwicmVxdWlyZVVzZXIiLCJyZXF1aXJlQW55VXNlclJvbGVzIiwicmVxdWlyZUFsbFVzZXJSb2xlcyIsInJlcXVpcmVNYXN0ZXIiLCJ2YWxpZGF0ZU1hc3RlcktleSIsInNraXBXaXRoTWFzdGVyS2V5IiwicmVxdWlyZVVzZXJLZXlzIiwiZmllbGRzIiwiZ2V0VHlwZSIsImZuIiwiaXNBcnJheSIsIm1hdGNoIiwidG9TdHJpbmciLCJ0b0xvd2VyQ2FzZSIsImNoZWNrS2V5Iiwia2V5IiwiZGF0YSIsInZhbGlkYXRvclBhcmFtIiwicGFyYW1ldGVyIiwidHlwZXMiLCJtYXAiLCJpbmNsdWRlcyIsImpvaW4iLCJ2YWx1ZXMiLCJ2YWx1ZSIsInN1YktleSIsIlBhcnNlQ2xvdWQiLCJkZWZpbmUiLCJmdW5jdGlvbk5hbWUiLCJoYW5kbGVyIiwidmFsaWRhdGlvbkhhbmRsZXIiLCJ0cmlnZ2VycyIsImFkZEZ1bmN0aW9uIiwiUGFyc2UiLCJhcHBsaWNhdGlvbklkIiwiam9iIiwiYWRkSm9iIiwiYmVmb3JlU2F2ZSIsInBhcnNlQ2xhc3MiLCJjbGFzc05hbWUiLCJnZXRDbGFzc05hbWUiLCJhZGRUcmlnZ2VyIiwiVHlwZXMiLCJiZWZvcmVEZWxldGUiLCJiZWZvcmVMb2dpbiIsImFyZ3VtZW50cyIsImFmdGVyTG9naW4iLCJhZnRlckxvZ291dCIsImFmdGVyU2F2ZSIsImFmdGVyRGVsZXRlIiwiYmVmb3JlRmluZCIsImFmdGVyRmluZCIsImJlZm9yZVNhdmVGaWxlIiwiRGVwcmVjYXRvciIsImxvZ1J1bnRpbWVEZXByZWNhdGlvbiIsInVzYWdlIiwic29sdXRpb24iLCJGaWxlIiwiYWZ0ZXJTYXZlRmlsZSIsImJlZm9yZURlbGV0ZUZpbGUiLCJhZnRlckRlbGV0ZUZpbGUiLCJiZWZvcmVDb25uZWN0IiwiYWRkQ29ubmVjdFRyaWdnZXIiLCJzZW5kRW1haWwiLCJjb25maWciLCJnZXQiLCJlbWFpbEFkYXB0ZXIiLCJ1c2VyQ29udHJvbGxlciIsImFkYXB0ZXIiLCJsb2dnZXJDb250cm9sbGVyIiwic2VuZE1haWwiLCJiZWZvcmVTdWJzY3JpYmUiLCJvbkxpdmVRdWVyeUV2ZW50IiwiYWRkTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVyIiwiYWZ0ZXJMaXZlUXVlcnlFdmVudCIsImFmdGVyRXZlbnQiLCJfcmVtb3ZlQWxsSG9va3MiLCJfdW5yZWdpc3RlckFsbCIsInVzZU1hc3RlcktleSIsImNvbnNvbGUiLCJ3YXJuIiwicmVxdWVzdCIsImh0dHBSZXF1ZXN0Iiwib3B0cyIsIm1vZHVsZSIsImV4cG9ydHMiXSwibWFwcGluZ3MiOiI7O0FBQUE7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBQ0EsTUFBTUEsTUFBTSxHQUFHQyxPQUFPLENBQUMsV0FBRCxDQUF0Qjs7QUFFQSxTQUFTQyx3QkFBVCxDQUFrQ0MsTUFBbEMsRUFBMEM7QUFDeEMsU0FBTyxPQUFPQSxNQUFQLEtBQWtCLFVBQWxCLElBQWdDQyxNQUFNLENBQUNDLFNBQVAsQ0FBaUJDLGNBQWpCLENBQWdDQyxJQUFoQyxDQUFxQ0osTUFBckMsRUFBNkMsV0FBN0MsQ0FBdkM7QUFDRDs7QUFFRCxTQUFTSyxpQkFBVCxDQUEyQkMsU0FBM0IsRUFBc0M7QUFDcEMsTUFBSSxDQUFDQSxTQUFELElBQWMsT0FBT0EsU0FBUCxLQUFxQixVQUF2QyxFQUFtRDtBQUNqRDtBQUNEOztBQUNELFFBQU1DLFlBQVksR0FBRztB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IHsgUGFyc2UgfSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCAqIGFzIHRyaWdnZXJzIGZyb20gJy4uL3RyaWdnZXJzJztcbmltcG9ydCBEZXByZWNhdG9yIGZyb20gJy4uL0RlcHJlY2F0b3IvRGVwcmVjYXRvcic7XG5jb25zdCBDb25maWcgPSByZXF1aXJlKCcuLi9Db25maWcnKTtcblxuZnVuY3Rpb24gaXNQYXJzZU9iamVjdENvbnN0cnVjdG9yKG9iamVjdCkge1xuICByZXR1cm4gdHlwZW9mIG9iamVjdCA9PT0gJ2Z1bmN0aW9uJyAmJiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqZWN0LCAnY2xhc3NOYW1lJyk7XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlVmFsaWRhdG9yKHZhbGlkYXRvcikge1xuICBpZiAoIXZhbGlkYXRvciB8fCB0eXBlb2YgdmFsaWRhdG9yID09PSAnZnVuY3Rpb24nKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IGZpZWxkT3B0aW9ucyA9IHtcbiAgICB0eXBlOiBbJ0FueSddLFxuICAgIGNvbnN0YW50OiBbQm9vbGVhbl0sXG4gICAgZGVmYXVsdDogWydBbnknXSxcbiAgICBvcHRpb25zOiBbQXJyYXksICdmdW5jdGlvbicsICdBbnknXSxcbiAgICByZXF1aXJlZDogW0Jvb2xlYW5dLFxuICAgIGVycm9yOiBbU3RyaW5nXSxcbiAgfTtcbiAgY29uc3QgYWxsb3dlZEtleXMgPSB7XG4gICAgcmVxdWlyZVVzZXI6IFtCb29sZWFuXSxcbiAgICByZXF1aXJlQW55VXNlclJvbGVzOiBbQXJyYXksICdmdW5jdGlvbiddLFxuICAgIHJlcXVpcmVBbGxVc2VyUm9sZXM6IFtBcnJheSwgJ2Z1bmN0aW9uJ10sXG4gICAgcmVxdWlyZU1hc3RlcjogW0Jvb2xlYW5dLFxuICAgIHZhbGlkYXRlTWFzdGVyS2V5OiBbQm9vbGVhbl0sXG4gICAgc2tpcFdpdGhNYXN0ZXJLZXk6IFtCb29sZWFuXSxcbiAgICByZXF1aXJlVXNlcktleXM6IFtBcnJheSwgT2JqZWN0XSxcbiAgICBmaWVsZHM6IFtBcnJheSwgT2JqZWN0XSxcbiAgfTtcbiAgY29uc3QgZ2V0VHlwZSA9IGZuID0+IHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShmbikpIHtcbiAgICAgIHJldHVybiAnYXJyYXknO1xuICAgIH1cbiAgICBpZiAoZm4gPT09ICdBbnknIHx8IGZuID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICByZXR1cm4gZm47XG4gICAgfVxuICAgIGNvbnN0IHR5cGUgPSB0eXBlb2YgZm47XG4gICAgaWYgKHR5cGVvZiBmbiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgY29uc3QgbWF0Y2ggPSBmbiAmJiBmbi50b1N0cmluZygpLm1hdGNoKC9eXFxzKmZ1bmN0aW9uIChcXHcrKS8pO1xuICAgICAgcmV0dXJuIChtYXRjaCA/IG1hdGNoWzFdIDogJ2Z1bmN0aW9uJykudG9Mb3dlckNhc2UoKTtcbiAgICB9XG4gICAgcmV0dXJuIHR5cGU7XG4gIH07XG4gIGNvbnN0IGNoZWNrS2V5ID0gKGtleSwgZGF0YSwgdmFsaWRhdG9yUGFyYW0pID0+IHtcbiAgICBjb25zdCBwYXJhbWV0ZXIgPSBkYXRhW2tleV07XG4gICAgaWYgKCFwYXJhbWV0ZXIpIHtcbiAgICAgIHRocm93IGAke2tleX0gaXMgbm90IGEgc3VwcG9ydGVkIHBhcmFtZXRlciBmb3IgQ2xvdWQgRnVuY3Rpb24gdmFsaWRhdGlvbnMuYDtcbiAgICB9XG4gICAgY29uc3QgdHlwZXMgPSBwYXJhbWV0ZXIubWFwKHR5cGUgPT4gZ2V0VHlwZSh0eXBlKSk7XG4gICAgY29uc3QgdHlwZSA9IGdldFR5cGUodmFsaWRhdG9yUGFyYW0pO1xuICAgIGlmICghdHlwZXMuaW5jbHVkZXModHlwZSkgJiYgIXR5cGVzLmluY2x1ZGVzKCdBbnknKSkge1xuICAgICAgdGhyb3cgYEludmFsaWQgdHlwZSBmb3IgQ2xvdWQgRnVuY3Rpb24gdmFsaWRhdGlvbiBrZXkgJHtrZXl9LiBFeHBlY3RlZCAke3R5cGVzLmpvaW4oXG4gICAgICAgICd8J1xuICAgICAgKX0sIGFjdHVhbCAke3R5cGV9YDtcbiAgICB9XG4gIH07XG4gIGZvciAoY29uc3Qga2V5IGluIHZhbGlkYXRvcikge1xuICAgIGNoZWNrS2V5KGtleSwgYWxsb3dlZEtleXMsIHZhbGlkYXRvcltrZXldKTtcbiAgICBpZiAoa2V5ID09PSAnZmllbGRzJyB8fCBrZXkgPT09ICdyZXF1aXJlVXNlcktleXMnKSB7XG4gICAgICBjb25zdCB2YWx1ZXMgPSB2YWxpZGF0b3Jba2V5XTtcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlcykpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBmb3IgKGNvbnN0IHZhbHVlIGluIHZhbHVlcykge1xuICAgICAgICBjb25zdCBkYXRhID0gdmFsdWVzW3ZhbHVlXTtcbiAgICAgICAgZm9yIChjb25zdCBzdWJLZXkgaW4gZGF0YSkge1xuICAgICAgICAgIGNoZWNrS2V5KHN1YktleSwgZmllbGRPcHRpb25zLCBkYXRhW3N1YktleV0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG59XG4vKiogQG5hbWVzcGFjZVxuICogQG5hbWUgUGFyc2VcbiAqIEBkZXNjcmlwdGlvbiBUaGUgUGFyc2UgU0RLLlxuICogIHNlZSBbYXBpIGRvY3NdKGh0dHBzOi8vZG9jcy5wYXJzZXBsYXRmb3JtLm9yZy9qcy9hcGkpIGFuZCBbZ3VpZGVdKGh0dHBzOi8vZG9jcy5wYXJzZXBsYXRmb3JtLm9yZy9qcy9ndWlkZSlcbiAqL1xuXG4vKiogQG5hbWVzcGFjZVxuICogQG5hbWUgUGFyc2UuQ2xvdWRcbiAqIEBtZW1iZXJvZiBQYXJzZVxuICogQGRlc2NyaXB0aW9uIFRoZSBQYXJzZSBDbG91ZCBDb2RlIFNESy5cbiAqL1xuXG52YXIgUGFyc2VDbG91ZCA9IHt9O1xuLyoqXG4gKiBEZWZpbmVzIGEgQ2xvdWQgRnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5kZWZpbmUoJ2Z1bmN0aW9uTmFtZScsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmRlZmluZSgnZnVuY3Rpb25OYW1lJywgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKiBgYGBcbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyb2YgUGFyc2UuQ2xvdWRcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIFRoZSBuYW1lIG9mIHRoZSBDbG91ZCBGdW5jdGlvblxuICogQHBhcmFtIHtGdW5jdGlvbn0gZGF0YSBUaGUgQ2xvdWQgRnVuY3Rpb24gdG8gcmVnaXN0ZXIuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLkZ1bmN0aW9uUmVxdWVzdH0uXG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLkZ1bmN0aW9uUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuZGVmaW5lID0gZnVuY3Rpb24gKGZ1bmN0aW9uTmFtZSwgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgdmFsaWRhdGVWYWxpZGF0b3IodmFsaWRhdGlvbkhhbmRsZXIpO1xuICB0cmlnZ2Vycy5hZGRGdW5jdGlvbihmdW5jdGlvbk5hbWUsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbn07XG5cbi8qKlxuICogRGVmaW5lcyBhIEJhY2tncm91bmQgSm9iLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIEBtZXRob2Qgam9iXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5qb2JcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIFRoZSBuYW1lIG9mIHRoZSBCYWNrZ3JvdW5kIEpvYlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgQmFja2dyb3VuZCBKb2IgdG8gcmVnaXN0ZXIuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIHNob3VsZCB0YWtlIGEgc2luZ2xlIHBhcmFtZXRlcnMgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuSm9iUmVxdWVzdH1cbiAqXG4gKi9cblBhcnNlQ2xvdWQuam9iID0gZnVuY3Rpb24gKGZ1bmN0aW9uTmFtZSwgaGFuZGxlcikge1xuICB0cmlnZ2Vycy5hZGRKb2IoZnVuY3Rpb25OYW1lLCBoYW5kbGVyLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbn07XG5cbi8qKlxuICpcbiAqIFJlZ2lzdGVycyBhIGJlZm9yZSBzYXZlIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIElmIHlvdSB3YW50IHRvIHVzZSBiZWZvcmVTYXZlIGZvciBhIHByZWRlZmluZWQgY2xhc3MgaW4gdGhlIFBhcnNlIEphdmFTY3JpcHQgU0RLIChlLmcuIHtAbGluayBQYXJzZS5Vc2VyfSBvciB7QGxpbmsgUGFyc2UuRmlsZX0pLCB5b3Ugc2hvdWxkIHBhc3MgdGhlIGNsYXNzIGl0c2VsZiBhbmQgbm90IHRoZSBTdHJpbmcgZm9yIGFyZzEuXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVTYXZlKCdNeUN1c3RvbUNsYXNzJywgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYmVmb3JlU2F2ZShQYXJzZS5Vc2VyLCAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KVxuICogYGBgXG4gKlxuICogQG1ldGhvZCBiZWZvcmVTYXZlXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5iZWZvcmVTYXZlXG4gKiBAcGFyYW0geyhTdHJpbmd8UGFyc2UuT2JqZWN0KX0gYXJnMSBUaGUgUGFyc2UuT2JqZWN0IHN1YmNsYXNzIHRvIHJlZ2lzdGVyIHRoZSBhZnRlciBzYXZlIGZ1bmN0aW9uIGZvci4gVGhpcyBjYW4gaW5zdGVhZCBiZSBhIFN0cmluZyB0aGF0IGlzIHRoZSBjbGFzc05hbWUgb2YgdGhlIHN1YmNsYXNzLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGJlZm9yZSBhIHNhdmUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fTtcbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmJlZm9yZVNhdmUgPSBmdW5jdGlvbiAocGFyc2VDbGFzcywgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgY29uc3QgY2xhc3NOYW1lID0gdHJpZ2dlcnMuZ2V0Q2xhc3NOYW1lKHBhcnNlQ2xhc3MpO1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlU2F2ZSxcbiAgICBjbGFzc05hbWUsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgIHZhbGlkYXRpb25IYW5kbGVyXG4gICk7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhIGJlZm9yZSBkZWxldGUgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogSWYgeW91IHdhbnQgdG8gdXNlIGJlZm9yZURlbGV0ZSBmb3IgYSBwcmVkZWZpbmVkIGNsYXNzIGluIHRoZSBQYXJzZSBKYXZhU2NyaXB0IFNESyAoZS5nLiB7QGxpbmsgUGFyc2UuVXNlcn0gb3Ige0BsaW5rIFBhcnNlLkZpbGV9KSwgeW91IHNob3VsZCBwYXNzIHRoZSBjbGFzcyBpdHNlbGYgYW5kIG5vdCB0aGUgU3RyaW5nIGZvciBhcmcxLlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVEZWxldGUoJ015Q3VzdG9tQ2xhc3MnLCAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVEZWxldGUoUGFyc2UuVXNlciwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSlcbiAqYGBgXG4gKlxuICogQG1ldGhvZCBiZWZvcmVEZWxldGVcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmJlZm9yZURlbGV0ZVxuICogQHBhcmFtIHsoU3RyaW5nfFBhcnNlLk9iamVjdCl9IGFyZzEgVGhlIFBhcnNlLk9iamVjdCBzdWJjbGFzcyB0byByZWdpc3RlciB0aGUgYmVmb3JlIGRlbGV0ZSBmdW5jdGlvbiBmb3IuIFRoaXMgY2FuIGluc3RlYWQgYmUgYSBTdHJpbmcgdGhhdCBpcyB0aGUgY2xhc3NOYW1lIG9mIHRoZSBzdWJjbGFzcy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBiZWZvcmUgYSBkZWxldGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyLCBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0uXG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5iZWZvcmVEZWxldGUgPSBmdW5jdGlvbiAocGFyc2VDbGFzcywgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgY29uc3QgY2xhc3NOYW1lID0gdHJpZ2dlcnMuZ2V0Q2xhc3NOYW1lKHBhcnNlQ2xhc3MpO1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlRGVsZXRlLFxuICAgIGNsYXNzTmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXJcbiAgKTtcbn07XG5cbi8qKlxuICpcbiAqIFJlZ2lzdGVycyB0aGUgYmVmb3JlIGxvZ2luIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIFRoaXMgZnVuY3Rpb24gcHJvdmlkZXMgZnVydGhlciBjb250cm9sXG4gKiBpbiB2YWxpZGF0aW5nIGEgbG9naW4gYXR0ZW1wdC4gU3BlY2lmaWNhbGx5LFxuICogaXQgaXMgdHJpZ2dlcmVkIGFmdGVyIGEgdXNlciBlbnRlcnNcbiAqIGNvcnJlY3QgY3JlZGVudGlhbHMgKG9yIG90aGVyIHZhbGlkIGF1dGhEYXRhKSxcbiAqIGJ1dCBwcmlvciB0byBhIHNlc3Npb24gYmVpbmcgZ2VuZXJhdGVkLlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYmVmb3JlTG9naW4oKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9KVxuICpcbiAqIGBgYFxuICpcbiAqIEBtZXRob2QgYmVmb3JlTG9naW5cbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmJlZm9yZUxvZ2luXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYmVmb3JlIGEgbG9naW4uIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fTtcbiAqL1xuUGFyc2VDbG91ZC5iZWZvcmVMb2dpbiA9IGZ1bmN0aW9uIChoYW5kbGVyKSB7XG4gIGxldCBjbGFzc05hbWUgPSAnX1VzZXInO1xuICBpZiAodHlwZW9mIGhhbmRsZXIgPT09ICdzdHJpbmcnIHx8IGlzUGFyc2VPYmplY3RDb25zdHJ1Y3RvcihoYW5kbGVyKSkge1xuICAgIC8vIHZhbGlkYXRpb24gd2lsbCBvY2N1ciBkb3duc3RyZWFtLCB0aGlzIGlzIHRvIG1haW50YWluIGludGVybmFsXG4gICAgLy8gY29kZSBjb25zaXN0ZW5jeSB3aXRoIHRoZSBvdGhlciBob29rIHR5cGVzLlxuICAgIGNsYXNzTmFtZSA9IHRyaWdnZXJzLmdldENsYXNzTmFtZShoYW5kbGVyKTtcbiAgICBoYW5kbGVyID0gYXJndW1lbnRzWzFdO1xuICB9XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIodHJpZ2dlcnMuVHlwZXMuYmVmb3JlTG9naW4sIGNsYXNzTmFtZSwgaGFuZGxlciwgUGFyc2UuYXBwbGljYXRpb25JZCk7XG59O1xuXG4vKipcbiAqXG4gKiBSZWdpc3RlcnMgdGhlIGFmdGVyIGxvZ2luIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIFRoaXMgZnVuY3Rpb24gaXMgdHJpZ2dlcmVkIGFmdGVyIGEgdXNlciBsb2dzIGluIHN1Y2Nlc3NmdWxseSxcbiAqIGFuZCBhZnRlciBhIF9TZXNzaW9uIG9iamVjdCBoYXMgYmVlbiBjcmVhdGVkLlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJMb2dpbigocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0pO1xuICogYGBgXG4gKlxuICogQG1ldGhvZCBhZnRlckxvZ2luXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5hZnRlckxvZ2luXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYWZ0ZXIgYSBsb2dpbi4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9O1xuICovXG5QYXJzZUNsb3VkLmFmdGVyTG9naW4gPSBmdW5jdGlvbiAoaGFuZGxlcikge1xuICBsZXQgY2xhc3NOYW1lID0gJ19Vc2VyJztcbiAgaWYgKHR5cGVvZiBoYW5kbGVyID09PSAnc3RyaW5nJyB8fCBpc1BhcnNlT2JqZWN0Q29uc3RydWN0b3IoaGFuZGxlcikpIHtcbiAgICAvLyB2YWxpZGF0aW9uIHdpbGwgb2NjdXIgZG93bnN0cmVhbSwgdGhpcyBpcyB0byBtYWludGFpbiBpbnRlcm5hbFxuICAgIC8vIGNvZGUgY29uc2lzdGVuY3kgd2l0aCB0aGUgb3RoZXIgaG9vayB0eXBlcy5cbiAgICBjbGFzc05hbWUgPSB0cmlnZ2Vycy5nZXRDbGFzc05hbWUoaGFuZGxlcik7XG4gICAgaGFuZGxlciA9IGFyZ3VtZW50c1sxXTtcbiAgfVxuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKHRyaWdnZXJzLlR5cGVzLmFmdGVyTG9naW4sIGNsYXNzTmFtZSwgaGFuZGxlciwgUGFyc2UuYXBwbGljYXRpb25JZCk7XG59O1xuXG4vKipcbiAqXG4gKiBSZWdpc3RlcnMgdGhlIGFmdGVyIGxvZ291dCBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBUaGlzIGZ1bmN0aW9uIGlzIHRyaWdnZXJlZCBhZnRlciBhIHVzZXIgbG9ncyBvdXQuXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5hZnRlckxvZ291dCgocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0pO1xuICogYGBgXG4gKlxuICogQG1ldGhvZCBhZnRlckxvZ291dFxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYWZ0ZXJMb2dvdXRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBhZnRlciBhIGxvZ291dC4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9O1xuICovXG5QYXJzZUNsb3VkLmFmdGVyTG9nb3V0ID0gZnVuY3Rpb24gKGhhbmRsZXIpIHtcbiAgbGV0IGNsYXNzTmFtZSA9ICdfU2Vzc2lvbic7XG4gIGlmICh0eXBlb2YgaGFuZGxlciA9PT0gJ3N0cmluZycgfHwgaXNQYXJzZU9iamVjdENvbnN0cnVjdG9yKGhhbmRsZXIpKSB7XG4gICAgLy8gdmFsaWRhdGlvbiB3aWxsIG9jY3VyIGRvd25zdHJlYW0sIHRoaXMgaXMgdG8gbWFpbnRhaW4gaW50ZXJuYWxcbiAgICAvLyBjb2RlIGNvbnNpc3RlbmN5IHdpdGggdGhlIG90aGVyIGhvb2sgdHlwZXMuXG4gICAgY2xhc3NOYW1lID0gdHJpZ2dlcnMuZ2V0Q2xhc3NOYW1lKGhhbmRsZXIpO1xuICAgIGhhbmRsZXIgPSBhcmd1bWVudHNbMV07XG4gIH1cbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcih0cmlnZ2Vycy5UeXBlcy5hZnRlckxvZ291dCwgY2xhc3NOYW1lLCBoYW5kbGVyLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGFuIGFmdGVyIHNhdmUgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogSWYgeW91IHdhbnQgdG8gdXNlIGFmdGVyU2F2ZSBmb3IgYSBwcmVkZWZpbmVkIGNsYXNzIGluIHRoZSBQYXJzZSBKYXZhU2NyaXB0IFNESyAoZS5nLiB7QGxpbmsgUGFyc2UuVXNlcn0gb3Ige0BsaW5rIFBhcnNlLkZpbGV9KSwgeW91IHNob3VsZCBwYXNzIHRoZSBjbGFzcyBpdHNlbGYgYW5kIG5vdCB0aGUgU3RyaW5nIGZvciBhcmcxLlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJTYXZlKCdNeUN1c3RvbUNsYXNzJywgYXN5bmMgZnVuY3Rpb24ocmVxdWVzdCkge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5hZnRlclNhdmUoUGFyc2UuVXNlciwgYXN5bmMgZnVuY3Rpb24ocmVxdWVzdCkge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KTtcbiAqIGBgYFxuICpcbiAqIEBtZXRob2QgYWZ0ZXJTYXZlXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5hZnRlclNhdmVcbiAqIEBwYXJhbSB7KFN0cmluZ3xQYXJzZS5PYmplY3QpfSBhcmcxIFRoZSBQYXJzZS5PYmplY3Qgc3ViY2xhc3MgdG8gcmVnaXN0ZXIgdGhlIGFmdGVyIHNhdmUgZnVuY3Rpb24gZm9yLiBUaGlzIGNhbiBpbnN0ZWFkIGJlIGEgU3RyaW5nIHRoYXQgaXMgdGhlIGNsYXNzTmFtZSBvZiB0aGUgc3ViY2xhc3MuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYWZ0ZXIgYSBzYXZlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2UganVzdCBvbmUgcGFyYW1ldGVyLCB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYWZ0ZXJTYXZlID0gZnVuY3Rpb24gKHBhcnNlQ2xhc3MsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHRyaWdnZXJzLmdldENsYXNzTmFtZShwYXJzZUNsYXNzKTtcbiAgdmFsaWRhdGVWYWxpZGF0b3IodmFsaWRhdGlvbkhhbmRsZXIpO1xuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyU2F2ZSxcbiAgICBjbGFzc05hbWUsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgIHZhbGlkYXRpb25IYW5kbGVyXG4gICk7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhbiBhZnRlciBkZWxldGUgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogSWYgeW91IHdhbnQgdG8gdXNlIGFmdGVyRGVsZXRlIGZvciBhIHByZWRlZmluZWQgY2xhc3MgaW4gdGhlIFBhcnNlIEphdmFTY3JpcHQgU0RLIChlLmcuIHtAbGluayBQYXJzZS5Vc2VyfSBvciB7QGxpbmsgUGFyc2UuRmlsZX0pLCB5b3Ugc2hvdWxkIHBhc3MgdGhlIGNsYXNzIGl0c2VsZiBhbmQgbm90IHRoZSBTdHJpbmcgZm9yIGFyZzEuXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmFmdGVyRGVsZXRlKCdNeUN1c3RvbUNsYXNzJywgYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJEZWxldGUoUGFyc2UuVXNlciwgYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYWZ0ZXJEZWxldGVcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmFmdGVyRGVsZXRlXG4gKiBAcGFyYW0geyhTdHJpbmd8UGFyc2UuT2JqZWN0KX0gYXJnMSBUaGUgUGFyc2UuT2JqZWN0IHN1YmNsYXNzIHRvIHJlZ2lzdGVyIHRoZSBhZnRlciBkZWxldGUgZnVuY3Rpb24gZm9yLiBUaGlzIGNhbiBpbnN0ZWFkIGJlIGEgU3RyaW5nIHRoYXQgaXMgdGhlIGNsYXNzTmFtZSBvZiB0aGUgc3ViY2xhc3MuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYWZ0ZXIgYSBkZWxldGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBqdXN0IG9uZSBwYXJhbWV0ZXIsIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0uXG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5hZnRlckRlbGV0ZSA9IGZ1bmN0aW9uIChwYXJzZUNsYXNzLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBjb25zdCBjbGFzc05hbWUgPSB0cmlnZ2Vycy5nZXRDbGFzc05hbWUocGFyc2VDbGFzcyk7XG4gIHZhbGlkYXRlVmFsaWRhdG9yKHZhbGlkYXRpb25IYW5kbGVyKTtcbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlckRlbGV0ZSxcbiAgICBjbGFzc05hbWUsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgIHZhbGlkYXRpb25IYW5kbGVyXG4gICk7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhIGJlZm9yZSBmaW5kIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIElmIHlvdSB3YW50IHRvIHVzZSBiZWZvcmVGaW5kIGZvciBhIHByZWRlZmluZWQgY2xhc3MgaW4gdGhlIFBhcnNlIEphdmFTY3JpcHQgU0RLIChlLmcuIHtAbGluayBQYXJzZS5Vc2VyfSBvciB7QGxpbmsgUGFyc2UuRmlsZX0pLCB5b3Ugc2hvdWxkIHBhc3MgdGhlIGNsYXNzIGl0c2VsZiBhbmQgbm90IHRoZSBTdHJpbmcgZm9yIGFyZzEuXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZUZpbmQoJ015Q3VzdG9tQ2xhc3MnLCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVGaW5kKFBhcnNlLlVzZXIsIGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGJlZm9yZUZpbmRcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmJlZm9yZUZpbmRcbiAqIEBwYXJhbSB7KFN0cmluZ3xQYXJzZS5PYmplY3QpfSBhcmcxIFRoZSBQYXJzZS5PYmplY3Qgc3ViY2xhc3MgdG8gcmVnaXN0ZXIgdGhlIGJlZm9yZSBmaW5kIGZ1bmN0aW9uIGZvci4gVGhpcyBjYW4gaW5zdGVhZCBiZSBhIFN0cmluZyB0aGF0IGlzIHRoZSBjbGFzc05hbWUgb2YgdGhlIHN1YmNsYXNzLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGJlZm9yZSBhIGZpbmQuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBqdXN0IG9uZSBwYXJhbWV0ZXIsIHtAbGluayBQYXJzZS5DbG91ZC5CZWZvcmVGaW5kUmVxdWVzdH0uXG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLkJlZm9yZUZpbmRSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5iZWZvcmVGaW5kID0gZnVuY3Rpb24gKHBhcnNlQ2xhc3MsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHRyaWdnZXJzLmdldENsYXNzTmFtZShwYXJzZUNsYXNzKTtcbiAgdmFsaWRhdGVWYWxpZGF0b3IodmFsaWRhdGlvbkhhbmRsZXIpO1xuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZUZpbmQsXG4gICAgY2xhc3NOYW1lLFxuICAgIGhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICB2YWxpZGF0aW9uSGFuZGxlclxuICApO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYW4gYWZ0ZXIgZmluZCBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBJZiB5b3Ugd2FudCB0byB1c2UgYWZ0ZXJGaW5kIGZvciBhIHByZWRlZmluZWQgY2xhc3MgaW4gdGhlIFBhcnNlIEphdmFTY3JpcHQgU0RLIChlLmcuIHtAbGluayBQYXJzZS5Vc2VyfSBvciB7QGxpbmsgUGFyc2UuRmlsZX0pLCB5b3Ugc2hvdWxkIHBhc3MgdGhlIGNsYXNzIGl0c2VsZiBhbmQgbm90IHRoZSBTdHJpbmcgZm9yIGFyZzEuXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmFmdGVyRmluZCgnTXlDdXN0b21DbGFzcycsIGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmFmdGVyRmluZChQYXJzZS5Vc2VyLCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KTtcbiAqYGBgXG4gKlxuICogQG1ldGhvZCBhZnRlckZpbmRcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmFmdGVyRmluZFxuICogQHBhcmFtIHsoU3RyaW5nfFBhcnNlLk9iamVjdCl9IGFyZzEgVGhlIFBhcnNlLk9iamVjdCBzdWJjbGFzcyB0byByZWdpc3RlciB0aGUgYWZ0ZXIgZmluZCBmdW5jdGlvbiBmb3IuIFRoaXMgY2FuIGluc3RlYWQgYmUgYSBTdHJpbmcgdGhhdCBpcyB0aGUgY2xhc3NOYW1lIG9mIHRoZSBzdWJjbGFzcy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBiZWZvcmUgYSBmaW5kLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2UganVzdCBvbmUgcGFyYW1ldGVyLCB7QGxpbmsgUGFyc2UuQ2xvdWQuQWZ0ZXJGaW5kUmVxdWVzdH0uXG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLkFmdGVyRmluZFJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmFmdGVyRmluZCA9IGZ1bmN0aW9uIChwYXJzZUNsYXNzLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBjb25zdCBjbGFzc05hbWUgPSB0cmlnZ2Vycy5nZXRDbGFzc05hbWUocGFyc2VDbGFzcyk7XG4gIHZhbGlkYXRlVmFsaWRhdG9yKHZhbGlkYXRpb25IYW5kbGVyKTtcbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlckZpbmQsXG4gICAgY2xhc3NOYW1lLFxuICAgIGhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICB2YWxpZGF0aW9uSGFuZGxlclxuICApO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYSBiZWZvcmUgc2F2ZSBmaWxlIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYmVmb3JlU2F2ZUZpbGUoYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYmVmb3JlU2F2ZUZpbGUoYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYmVmb3JlU2F2ZUZpbGVcbiAqIEBkZXByZWNhdGVkXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5iZWZvcmVTYXZlRmlsZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGJlZm9yZSBzYXZpbmcgYSBmaWxlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2UganVzdCBvbmUgcGFyYW1ldGVyLCB7QGxpbmsgUGFyc2UuQ2xvdWQuRmlsZVRyaWdnZXJSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuRmlsZVRyaWdnZXJSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5iZWZvcmVTYXZlRmlsZSA9IGZ1bmN0aW9uIChoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBEZXByZWNhdG9yLmxvZ1J1bnRpbWVEZXByZWNhdGlvbih7XG4gICAgdXNhZ2U6ICdQYXJzZS5DbG91ZC5iZWZvcmVTYXZlRmlsZScsXG4gICAgc29sdXRpb246ICdVc2UgUGFyc2UuQ2xvdWQuYmVmb3JlU2F2ZShQYXJzZS5GaWxlLCAocmVxdWVzdCkgPT4ge30pJyxcbiAgfSk7XG4gIFBhcnNlQ2xvdWQuYmVmb3JlU2F2ZShQYXJzZS5GaWxlLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcik7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhbiBhZnRlciBzYXZlIGZpbGUgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5hZnRlclNhdmVGaWxlKGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmFmdGVyU2F2ZUZpbGUoYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KTtcbiAqYGBgXG4gKlxuICogQG1ldGhvZCBhZnRlclNhdmVGaWxlXG4gKiBAZGVwcmVjYXRlZFxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYWZ0ZXJTYXZlRmlsZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGFmdGVyIHNhdmluZyBhIGZpbGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBqdXN0IG9uZSBwYXJhbWV0ZXIsIHtAbGluayBQYXJzZS5DbG91ZC5GaWxlVHJpZ2dlclJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5GaWxlVHJpZ2dlclJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmFmdGVyU2F2ZUZpbGUgPSBmdW5jdGlvbiAoaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgRGVwcmVjYXRvci5sb2dSdW50aW1lRGVwcmVjYXRpb24oe1xuICAgIHVzYWdlOiAnUGFyc2UuQ2xvdWQuYWZ0ZXJTYXZlRmlsZScsXG4gICAgc29sdXRpb246ICdVc2UgUGFyc2UuQ2xvdWQuYWZ0ZXJTYXZlKFBhcnNlLkZpbGUsIChyZXF1ZXN0KSA9PiB7fSknLFxuICB9KTtcbiAgUGFyc2VDbG91ZC5hZnRlclNhdmUoUGFyc2UuRmlsZSwgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYSBiZWZvcmUgZGVsZXRlIGZpbGUgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVEZWxldGVGaWxlKGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZURlbGV0ZUZpbGUoYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYmVmb3JlRGVsZXRlRmlsZVxuICogQGRlcHJlY2F0ZWRcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmJlZm9yZURlbGV0ZUZpbGVcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBiZWZvcmUgZGVsZXRpbmcgYSBmaWxlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2UganVzdCBvbmUgcGFyYW1ldGVyLCB7QGxpbmsgUGFyc2UuQ2xvdWQuRmlsZVRyaWdnZXJSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuRmlsZVRyaWdnZXJSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5iZWZvcmVEZWxldGVGaWxlID0gZnVuY3Rpb24gKGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIERlcHJlY2F0b3IubG9nUnVudGltZURlcHJlY2F0aW9uKHtcbiAgICB1c2FnZTogJ1BhcnNlLkNsb3VkLmJlZm9yZURlbGV0ZUZpbGUnLFxuICAgIHNvbHV0aW9uOiAnVXNlIFBhcnNlLkNsb3VkLmJlZm9yZURlbGV0ZShQYXJzZS5GaWxlLCAocmVxdWVzdCkgPT4ge30pJyxcbiAgfSk7XG4gIFBhcnNlQ2xvdWQuYmVmb3JlRGVsZXRlKFBhcnNlLkZpbGUsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGFuIGFmdGVyIGRlbGV0ZSBmaWxlIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJEZWxldGVGaWxlKGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmFmdGVyRGVsZXRlRmlsZShhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KTtcbiAqYGBgXG4gKlxuICogQG1ldGhvZCBhZnRlckRlbGV0ZUZpbGVcbiAqIEBkZXByZWNhdGVkXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5hZnRlckRlbGV0ZUZpbGVcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIGFmdGVyIGJlZm9yZSBkZWxldGluZyBhIGZpbGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBqdXN0IG9uZSBwYXJhbWV0ZXIsIHtAbGluayBQYXJzZS5DbG91ZC5GaWxlVHJpZ2dlclJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5GaWxlVHJpZ2dlclJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmFmdGVyRGVsZXRlRmlsZSA9IGZ1bmN0aW9uIChoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBEZXByZWNhdG9yLmxvZ1J1bnRpbWVEZXByZWNhdGlvbih7XG4gICAgdXNhZ2U6ICdQYXJzZS5DbG91ZC5hZnRlckRlbGV0ZUZpbGUnLFxuICAgIHNvbHV0aW9uOiAnVXNlIFBhcnNlLkNsb3VkLmFmdGVyRGVsZXRlKFBhcnNlLkZpbGUsIChyZXF1ZXN0KSA9PiB7fSknLFxuICB9KTtcbiAgUGFyc2VDbG91ZC5hZnRlckRlbGV0ZShQYXJzZS5GaWxlLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcik7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhIGJlZm9yZSBsaXZlIHF1ZXJ5IHNlcnZlciBjb25uZWN0IGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYmVmb3JlQ29ubmVjdChhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVDb25uZWN0KGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGJlZm9yZUNvbm5lY3RcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmJlZm9yZUNvbm5lY3RcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIGJlZm9yZSBjb25uZWN0aW9uIGlzIG1hZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBqdXN0IG9uZSBwYXJhbWV0ZXIsIHtAbGluayBQYXJzZS5DbG91ZC5Db25uZWN0VHJpZ2dlclJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5Db25uZWN0VHJpZ2dlclJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmJlZm9yZUNvbm5lY3QgPSBmdW5jdGlvbiAoaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgdmFsaWRhdGVWYWxpZGF0b3IodmFsaWRhdGlvbkhhbmRsZXIpO1xuICB0cmlnZ2Vycy5hZGRDb25uZWN0VHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVDb25uZWN0LFxuICAgIGhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICB2YWxpZGF0aW9uSGFuZGxlclxuICApO1xufTtcblxuLyoqXG4gKiBTZW5kcyBhbiBlbWFpbCB0aHJvdWdoIHRoZSBQYXJzZSBTZXJ2ZXIgbWFpbCBhZGFwdGVyLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICogKipSZXF1aXJlcyBhIG1haWwgYWRhcHRlciB0byBiZSBjb25maWd1cmVkIGZvciBQYXJzZSBTZXJ2ZXIuKipcbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLnNlbmRFbWFpbCh7XG4gKiAgIGZyb206ICdFeGFtcGxlIDx0ZXN0QGV4YW1wbGUuY29tPicsXG4gKiAgIHRvOiAnY29udGFjdEBleGFtcGxlLmNvbScsXG4gKiAgIHN1YmplY3Q6ICdUZXN0IGVtYWlsJyxcbiAqICAgdGV4dDogJ1RoaXMgZW1haWwgaXMgYSB0ZXN0LidcbiAqIH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIHNlbmRFbWFpbFxuICogQG5hbWUgUGFyc2UuQ2xvdWQuc2VuZEVtYWlsXG4gKiBAcGFyYW0ge09iamVjdH0gZGF0YSBUaGUgb2JqZWN0IG9mIHRoZSBtYWlsIGRhdGEgdG8gc2VuZC5cbiAqL1xuUGFyc2VDbG91ZC5zZW5kRW1haWwgPSBmdW5jdGlvbiAoZGF0YSkge1xuICBjb25zdCBjb25maWcgPSBDb25maWcuZ2V0KFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICBjb25zdCBlbWFpbEFkYXB0ZXIgPSBjb25maWcudXNlckNvbnRyb2xsZXIuYWRhcHRlcjtcbiAgaWYgKCFlbWFpbEFkYXB0ZXIpIHtcbiAgICBjb25maWcubG9nZ2VyQ29udHJvbGxlci5lcnJvcihcbiAgICAgICdGYWlsZWQgdG8gc2VuZCBlbWFpbCBiZWNhdXNlIG5vIG1haWwgYWRhcHRlciBpcyBjb25maWd1cmVkIGZvciBQYXJzZSBTZXJ2ZXIuJ1xuICAgICk7XG4gICAgcmV0dXJuO1xuICB9XG4gIHJldHVybiBlbWFpbEFkYXB0ZXIuc2VuZE1haWwoZGF0YSk7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhIGJlZm9yZSBsaXZlIHF1ZXJ5IHN1YnNjcmlwdGlvbiBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBJZiB5b3Ugd2FudCB0byB1c2UgYmVmb3JlU3Vic2NyaWJlIGZvciBhIHByZWRlZmluZWQgY2xhc3MgaW4gdGhlIFBhcnNlIEphdmFTY3JpcHQgU0RLIChlLmcuIHtAbGluayBQYXJzZS5Vc2VyfSBvciB7QGxpbmsgUGFyc2UuRmlsZX0pLCB5b3Ugc2hvdWxkIHBhc3MgdGhlIGNsYXNzIGl0c2VsZiBhbmQgbm90IHRoZSBTdHJpbmcgZm9yIGFyZzEuXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZVN1YnNjcmliZSgnTXlDdXN0b21DbGFzcycsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZVN1YnNjcmliZShQYXJzZS5Vc2VyLCAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KTtcbiAqYGBgXG4gKlxuICogQG1ldGhvZCBiZWZvcmVTdWJzY3JpYmVcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmJlZm9yZVN1YnNjcmliZVxuICogQHBhcmFtIHsoU3RyaW5nfFBhcnNlLk9iamVjdCl9IGFyZzEgVGhlIFBhcnNlLk9iamVjdCBzdWJjbGFzcyB0byByZWdpc3RlciB0aGUgYmVmb3JlIHN1YnNjcmlwdGlvbiBmdW5jdGlvbiBmb3IuIFRoaXMgY2FuIGluc3RlYWQgYmUgYSBTdHJpbmcgdGhhdCBpcyB0aGUgY2xhc3NOYW1lIG9mIHRoZSBzdWJjbGFzcy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBiZWZvcmUgYSBzdWJzY3JpcHRpb24uIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyLCBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0uXG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5iZWZvcmVTdWJzY3JpYmUgPSBmdW5jdGlvbiAocGFyc2VDbGFzcywgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgdmFsaWRhdGVWYWxpZGF0b3IodmFsaWRhdGlvbkhhbmRsZXIpO1xuICBjb25zdCBjbGFzc05hbWUgPSB0cmlnZ2Vycy5nZXRDbGFzc05hbWUocGFyc2VDbGFzcyk7XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlU3Vic2NyaWJlLFxuICAgIGNsYXNzTmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXJcbiAgKTtcbn07XG5cblBhcnNlQ2xvdWQub25MaXZlUXVlcnlFdmVudCA9IGZ1bmN0aW9uIChoYW5kbGVyKSB7XG4gIHRyaWdnZXJzLmFkZExpdmVRdWVyeUV2ZW50SGFuZGxlcihoYW5kbGVyLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGFuIGFmdGVyIGxpdmUgcXVlcnkgc2VydmVyIGV2ZW50IGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJMaXZlUXVlcnlFdmVudCgnTXlDdXN0b21DbGFzcycsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmFmdGVyTGl2ZVF1ZXJ5RXZlbnQoJ015Q3VzdG9tQ2xhc3MnLCAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KTtcbiAqYGBgXG4gKlxuICogQG1ldGhvZCBhZnRlckxpdmVRdWVyeUV2ZW50XG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5hZnRlckxpdmVRdWVyeUV2ZW50XG4gKiBAcGFyYW0geyhTdHJpbmd8UGFyc2UuT2JqZWN0KX0gYXJnMSBUaGUgUGFyc2UuT2JqZWN0IHN1YmNsYXNzIHRvIHJlZ2lzdGVyIHRoZSBhZnRlciBsaXZlIHF1ZXJ5IGV2ZW50IGZ1bmN0aW9uIGZvci4gVGhpcyBjYW4gaW5zdGVhZCBiZSBhIFN0cmluZyB0aGF0IGlzIHRoZSBjbGFzc05hbWUgb2YgdGhlIHN1YmNsYXNzLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGFmdGVyIGEgbGl2ZSBxdWVyeSBldmVudC4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIsIGEge0BsaW5rIFBhcnNlLkNsb3VkLkxpdmVRdWVyeUV2ZW50VHJpZ2dlcn0uXG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLkxpdmVRdWVyeUV2ZW50VHJpZ2dlcn0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYWZ0ZXJMaXZlUXVlcnlFdmVudCA9IGZ1bmN0aW9uIChwYXJzZUNsYXNzLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBjb25zdCBjbGFzc05hbWUgPSB0cmlnZ2Vycy5nZXRDbGFzc05hbWUocGFyc2VDbGFzcyk7XG4gIHZhbGlkYXRlVmFsaWRhdG9yKHZhbGlkYXRpb25IYW5kbGVyKTtcbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlckV2ZW50LFxuICAgIGNsYXNzTmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXJcbiAgKTtcbn07XG5cblBhcnNlQ2xvdWQuX3JlbW92ZUFsbEhvb2tzID0gKCkgPT4ge1xuICB0cmlnZ2Vycy5fdW5yZWdpc3RlckFsbCgpO1xufTtcblxuUGFyc2VDbG91ZC51c2VNYXN0ZXJLZXkgPSAoKSA9PiB7XG4gIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZVxuICBjb25zb2xlLndhcm4oXG4gICAgJ1BhcnNlLkNsb3VkLnVzZU1hc3RlcktleSBpcyBkZXByZWNhdGVkIChhbmQgaGFzIG5vIGVmZmVjdCBhbnltb3JlKSBvbiBwYXJzZS1zZXJ2ZXIsIHBsZWFzZSByZWZlciB0byB0aGUgY2xvdWQgY29kZSBtaWdyYXRpb24gbm90ZXM6IGh0dHA6Ly9kb2NzLnBhcnNlcGxhdGZvcm0ub3JnL3BhcnNlLXNlcnZlci9ndWlkZS8jbWFzdGVyLWtleS1tdXN0LWJlLXBhc3NlZC1leHBsaWNpdGx5J1xuICApO1xufTtcblxuY29uc3QgcmVxdWVzdCA9IHJlcXVpcmUoJy4vaHR0cFJlcXVlc3QnKTtcblBhcnNlQ2xvdWQuaHR0cFJlcXVlc3QgPSBvcHRzID0+IHtcbiAgRGVwcmVjYXRvci5sb2dSdW50aW1lRGVwcmVjYXRpb24oe1xuICAgIHVzYWdlOiAnUGFyc2UuQ2xvdWQuaHR0cFJlcXVlc3QnLFxuICAgIHNvbHV0aW9uOiAnVXNlIGEgaHR0cCByZXF1ZXN0IGxpYnJhcnkgaW5zdGVhZC4nLFxuICB9KTtcbiAgcmV0dXJuIHJlcXVlc3Qob3B0cyk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFBhcnNlQ2xvdWQ7XG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdFxuICogQHByb3BlcnR5IHtTdHJpbmd9IGluc3RhbGxhdGlvbklkIElmIHNldCwgdGhlIGluc3RhbGxhdGlvbklkIHRyaWdnZXJpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IG1hc3RlciBJZiB0cnVlLCBtZWFucyB0aGUgbWFzdGVyIGtleSB3YXMgdXNlZC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuVXNlcn0gdXNlciBJZiBzZXQsIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuT2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0cmlnZ2VyaW5nIHRoZSBob29rLlxuICogQHByb3BlcnR5IHtTdHJpbmd9IGlwIFRoZSBJUCBhZGRyZXNzIG9mIHRoZSBjbGllbnQgbWFraW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtPYmplY3R9IGhlYWRlcnMgVGhlIG9yaWdpbmFsIEhUVFAgaGVhZGVycyBmb3IgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gdHJpZ2dlck5hbWUgVGhlIG5hbWUgb2YgdGhlIHRyaWdnZXIgKGBiZWZvcmVTYXZlYCwgYGFmdGVyU2F2ZWAsIC4uLilcbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBsb2cgVGhlIGN1cnJlbnQgbG9nZ2VyIGluc2lkZSBQYXJzZSBTZXJ2ZXIuXG4gKiBAcHJvcGVydHkge1BhcnNlLk9iamVjdH0gb3JpZ2luYWwgSWYgc2V0LCB0aGUgb2JqZWN0LCBhcyBjdXJyZW50bHkgc3RvcmVkLlxuICovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5GaWxlVHJpZ2dlclJlcXVlc3RcbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpbnN0YWxsYXRpb25JZCBJZiBzZXQsIHRoZSBpbnN0YWxsYXRpb25JZCB0cmlnZ2VyaW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtCb29sZWFufSBtYXN0ZXIgSWYgdHJ1ZSwgbWVhbnMgdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4gKiBAcHJvcGVydHkge1BhcnNlLlVzZXJ9IHVzZXIgSWYgc2V0LCB0aGUgdXNlciB0aGF0IG1hZGUgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1BhcnNlLkZpbGV9IGZpbGUgVGhlIGZpbGUgdGhhdCB0cmlnZ2VyZWQgdGhlIGhvb2suXG4gKiBAcHJvcGVydHkge0ludGVnZXJ9IGZpbGVTaXplIFRoZSBzaXplIG9mIHRoZSBmaWxlIGluIGJ5dGVzLlxuICogQHByb3BlcnR5IHtJbnRlZ2VyfSBjb250ZW50TGVuZ3RoIFRoZSB2YWx1ZSBmcm9tIENvbnRlbnQtTGVuZ3RoIGhlYWRlclxuICogQHByb3BlcnR5IHtTdHJpbmd9IGlwIFRoZSBJUCBhZGRyZXNzIG9mIHRoZSBjbGllbnQgbWFraW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtPYmplY3R9IGhlYWRlcnMgVGhlIG9yaWdpbmFsIEhUVFAgaGVhZGVycyBmb3IgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gdHJpZ2dlck5hbWUgVGhlIG5hbWUgb2YgdGhlIHRyaWdnZXIgKGBiZWZvcmVTYXZlRmlsZWAsIGBhZnRlclNhdmVGaWxlYClcbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBsb2cgVGhlIGN1cnJlbnQgbG9nZ2VyIGluc2lkZSBQYXJzZSBTZXJ2ZXIuXG4gKi9cblxuLyoqXG4gKiBAaW50ZXJmYWNlIFBhcnNlLkNsb3VkLkNvbm5lY3RUcmlnZ2VyUmVxdWVzdFxuICogQHByb3BlcnR5IHtTdHJpbmd9IGluc3RhbGxhdGlvbklkIElmIHNldCwgdGhlIGluc3RhbGxhdGlvbklkIHRyaWdnZXJpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IHVzZU1hc3RlcktleSBJZiB0cnVlLCBtZWFucyB0aGUgbWFzdGVyIGtleSB3YXMgdXNlZC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuVXNlcn0gdXNlciBJZiBzZXQsIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7SW50ZWdlcn0gY2xpZW50cyBUaGUgbnVtYmVyIG9mIGNsaWVudHMgY29ubmVjdGVkLlxuICogQHByb3BlcnR5IHtJbnRlZ2VyfSBzdWJzY3JpcHRpb25zIFRoZSBudW1iZXIgb2Ygc3Vic2NyaXB0aW9ucyBjb25uZWN0ZWQuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gc2Vzc2lvblRva2VuIElmIHNldCwgdGhlIHNlc3Npb24gb2YgdGhlIHVzZXIgdGhhdCBtYWRlIHRoZSByZXF1ZXN0LlxuICovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5MaXZlUXVlcnlFdmVudFRyaWdnZXJcbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpbnN0YWxsYXRpb25JZCBJZiBzZXQsIHRoZSBpbnN0YWxsYXRpb25JZCB0cmlnZ2VyaW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtCb29sZWFufSB1c2VNYXN0ZXJLZXkgSWYgdHJ1ZSwgbWVhbnMgdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4gKiBAcHJvcGVydHkge1BhcnNlLlVzZXJ9IHVzZXIgSWYgc2V0LCB0aGUgdXNlciB0aGF0IG1hZGUgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gc2Vzc2lvblRva2VuIElmIHNldCwgdGhlIHNlc3Npb24gb2YgdGhlIHVzZXIgdGhhdCBtYWRlIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtTdHJpbmd9IGV2ZW50IFRoZSBsaXZlIHF1ZXJ5IGV2ZW50IHRoYXQgdHJpZ2dlcmVkIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtQYXJzZS5PYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRyaWdnZXJpbmcgdGhlIGhvb2suXG4gKiBAcHJvcGVydHkge1BhcnNlLk9iamVjdH0gb3JpZ2luYWwgSWYgc2V0LCB0aGUgb2JqZWN0LCBhcyBjdXJyZW50bHkgc3RvcmVkLlxuICogQHByb3BlcnR5IHtJbnRlZ2VyfSBjbGllbnRzIFRoZSBudW1iZXIgb2YgY2xpZW50cyBjb25uZWN0ZWQuXG4gKiBAcHJvcGVydHkge0ludGVnZXJ9IHN1YnNjcmlwdGlvbnMgVGhlIG51bWJlciBvZiBzdWJzY3JpcHRpb25zIGNvbm5lY3RlZC5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gc2VuZEV2ZW50IElmIHRoZSBMaXZlUXVlcnkgZXZlbnQgc2hvdWxkIGJlIHNlbnQgdG8gdGhlIGNsaWVudC4gU2V0IHRvIGZhbHNlIHRvIHByZXZlbnQgTGl2ZVF1ZXJ5IGZyb20gcHVzaGluZyB0byB0aGUgY2xpZW50LlxuICovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5CZWZvcmVGaW5kUmVxdWVzdFxuICogQHByb3BlcnR5IHtTdHJpbmd9IGluc3RhbGxhdGlvbklkIElmIHNldCwgdGhlIGluc3RhbGxhdGlvbklkIHRyaWdnZXJpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IG1hc3RlciBJZiB0cnVlLCBtZWFucyB0aGUgbWFzdGVyIGtleSB3YXMgdXNlZC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuVXNlcn0gdXNlciBJZiBzZXQsIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuUXVlcnl9IHF1ZXJ5IFRoZSBxdWVyeSB0cmlnZ2VyaW5nIHRoZSBob29rLlxuICogQHByb3BlcnR5IHtTdHJpbmd9IGlwIFRoZSBJUCBhZGRyZXNzIG9mIHRoZSBjbGllbnQgbWFraW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtPYmplY3R9IGhlYWRlcnMgVGhlIG9yaWdpbmFsIEhUVFAgaGVhZGVycyBmb3IgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gdHJpZ2dlck5hbWUgVGhlIG5hbWUgb2YgdGhlIHRyaWdnZXIgKGBiZWZvcmVTYXZlYCwgYGFmdGVyU2F2ZWAsIC4uLilcbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBsb2cgVGhlIGN1cnJlbnQgbG9nZ2VyIGluc2lkZSBQYXJzZSBTZXJ2ZXIuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IGlzR2V0IHdldGhlciB0aGUgcXVlcnkgYSBgZ2V0YCBvciBhIGBmaW5kYFxuICovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5BZnRlckZpbmRSZXF1ZXN0XG4gKiBAcHJvcGVydHkge1N0cmluZ30gaW5zdGFsbGF0aW9uSWQgSWYgc2V0LCB0aGUgaW5zdGFsbGF0aW9uSWQgdHJpZ2dlcmluZyB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gbWFzdGVyIElmIHRydWUsIG1lYW5zIHRoZSBtYXN0ZXIga2V5IHdhcyB1c2VkLlxuICogQHByb3BlcnR5IHtQYXJzZS5Vc2VyfSB1c2VyIElmIHNldCwgdGhlIHVzZXIgdGhhdCBtYWRlIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtQYXJzZS5RdWVyeX0gcXVlcnkgVGhlIHF1ZXJ5IHRyaWdnZXJpbmcgdGhlIGhvb2suXG4gKiBAcHJvcGVydHkge0FycmF5PFBhcnNlLk9iamVjdD59IHJlc3VsdHMgVGhlIHJlc3VsdHMgdGhlIHF1ZXJ5IHlpZWxkZWQuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gaXAgVGhlIElQIGFkZHJlc3Mgb2YgdGhlIGNsaWVudCBtYWtpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge09iamVjdH0gaGVhZGVycyBUaGUgb3JpZ2luYWwgSFRUUCBoZWFkZXJzIGZvciB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSB0cmlnZ2VyTmFtZSBUaGUgbmFtZSBvZiB0aGUgdHJpZ2dlciAoYGJlZm9yZVNhdmVgLCBgYWZ0ZXJTYXZlYCwgLi4uKVxuICogQHByb3BlcnR5IHtPYmplY3R9IGxvZyBUaGUgY3VycmVudCBsb2dnZXIgaW5zaWRlIFBhcnNlIFNlcnZlci5cbiAqL1xuXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFyc2UuQ2xvdWQuRnVuY3Rpb25SZXF1ZXN0XG4gKiBAcHJvcGVydHkge1N0cmluZ30gaW5zdGFsbGF0aW9uSWQgSWYgc2V0LCB0aGUgaW5zdGFsbGF0aW9uSWQgdHJpZ2dlcmluZyB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gbWFzdGVyIElmIHRydWUsIG1lYW5zIHRoZSBtYXN0ZXIga2V5IHdhcyB1c2VkLlxuICogQHByb3BlcnR5IHtQYXJzZS5Vc2VyfSB1c2VyIElmIHNldCwgdGhlIHVzZXIgdGhhdCBtYWRlIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtPYmplY3R9IHBhcmFtcyBUaGUgcGFyYW1zIHBhc3NlZCB0byB0aGUgY2xvdWQgZnVuY3Rpb24uXG4gKi9cblxuLyoqXG4gKiBAaW50ZXJmYWNlIFBhcnNlLkNsb3VkLkpvYlJlcXVlc3RcbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBwYXJhbXMgVGhlIHBhcmFtcyBwYXNzZWQgdG8gdGhlIGJhY2tncm91bmQgam9iLlxuICogQHByb3BlcnR5IHtmdW5jdGlvbn0gbWVzc2FnZSBJZiBtZXNzYWdlIGlzIGNhbGxlZCB3aXRoIGEgc3RyaW5nIGFyZ3VtZW50LCB3aWxsIHVwZGF0ZSB0aGUgY3VycmVudCBtZXNzYWdlIHRvIGJlIHN0b3JlZCBpbiB0aGUgam9iIHN0YXR1cy5cbiAqL1xuXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0XG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IHJlcXVpcmVVc2VyIHdoZXRoZXIgdGhlIGNsb3VkIHRyaWdnZXIgcmVxdWlyZXMgYSB1c2VyLlxuICogQHByb3BlcnR5IHtCb29sZWFufSByZXF1aXJlTWFzdGVyIHdoZXRoZXIgdGhlIGNsb3VkIHRyaWdnZXIgcmVxdWlyZXMgYSBtYXN0ZXIga2V5LlxuICogQHByb3BlcnR5IHtCb29sZWFufSB2YWxpZGF0ZU1hc3RlcktleSB3aGV0aGVyIHRoZSB2YWxpZGF0b3Igc2hvdWxkIHJ1biBpZiBtYXN0ZXJLZXkgaXMgcHJvdmlkZWQuIERlZmF1bHRzIHRvIGZhbHNlLlxuICogQHByb3BlcnR5IHtCb29sZWFufSBza2lwV2l0aE1hc3RlcktleSB3aGV0aGVyIHRoZSBjbG91ZCBjb2RlIGZ1bmN0aW9uIHNob3VsZCBiZSBpZ25vcmVkIHVzaW5nIGEgbWFzdGVyS2V5LlxuICpcbiAqIEBwcm9wZXJ0eSB7QXJyYXk8U3RyaW5nPnxPYmplY3R9IHJlcXVpcmVVc2VyS2V5cyBJZiBzZXQsIGtleXMgcmVxdWlyZWQgb24gcmVxdWVzdC51c2VyIHRvIG1ha2UgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gcmVxdWlyZVVzZXJLZXlzLmZpZWxkIElmIHJlcXVpcmVVc2VyS2V5cyBpcyBhbiBvYmplY3QsIG5hbWUgb2YgZmllbGQgdG8gdmFsaWRhdGUgb24gcmVxdWVzdCB1c2VyXG4gKiBAcHJvcGVydHkge0FycmF5fGZ1bmN0aW9ufEFueX0gcmVxdWlyZVVzZXJLZXlzLmZpZWxkLm9wdGlvbnMgYXJyYXkgb2Ygb3B0aW9ucyB0aGF0IHRoZSBmaWVsZCBjYW4gYmUsIGZ1bmN0aW9uIHRvIHZhbGlkYXRlIGZpZWxkLCBvciBzaW5nbGUgdmFsdWUuIFRocm93IGFuIGVycm9yIGlmIHZhbHVlIGlzIGludmFsaWQuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gcmVxdWlyZVVzZXJLZXlzLmZpZWxkLmVycm9yIGN1c3RvbSBlcnJvciBtZXNzYWdlIGlmIGZpZWxkIGlzIGludmFsaWQuXG4gKlxuICogQHByb3BlcnR5IHtBcnJheTxTdHJpbmc+fGZ1bmN0aW9ufXJlcXVpcmVBbnlVc2VyUm9sZXMgSWYgc2V0LCByZXF1ZXN0LnVzZXIgaGFzIHRvIGJlIHBhcnQgb2YgYXQgbGVhc3Qgb25lIHJvbGVzIG5hbWUgdG8gbWFrZSB0aGUgcmVxdWVzdC4gSWYgc2V0IHRvIGEgZnVuY3Rpb24sIGZ1bmN0aW9uIG11c3QgcmV0dXJuIHJvbGUgbmFtZXMuXG4gKiBAcHJvcGVydHkge0FycmF5PFN0cmluZz58ZnVuY3Rpb259cmVxdWlyZUFsbFVzZXJSb2xlcyBJZiBzZXQsIHJlcXVlc3QudXNlciBoYXMgdG8gYmUgcGFydCBhbGwgcm9sZXMgbmFtZSB0byBtYWtlIHRoZSByZXF1ZXN0LiBJZiBzZXQgdG8gYSBmdW5jdGlvbiwgZnVuY3Rpb24gbXVzdCByZXR1cm4gcm9sZSBuYW1lcy5cbiAqXG4gKiBAcHJvcGVydHkge09iamVjdHxBcnJheTxTdHJpbmc+fSBmaWVsZHMgaWYgYW4gYXJyYXkgb2Ygc3RyaW5ncywgdmFsaWRhdG9yIHdpbGwgbG9vayBmb3Iga2V5cyBpbiByZXF1ZXN0LnBhcmFtcywgYW5kIHRocm93IGlmIG5vdCBwcm92aWRlZC4gSWYgT2JqZWN0LCBmaWVsZHMgdG8gdmFsaWRhdGUuIElmIHRoZSB0cmlnZ2VyIGlzIGEgY2xvdWQgZnVuY3Rpb24sIGByZXF1ZXN0LnBhcmFtc2Agd2lsbCBiZSB2YWxpZGF0ZWQsIG90aGVyd2lzZSBgcmVxdWVzdC5vYmplY3RgLlxuICogQHByb3BlcnR5IHtTdHJpbmd9IGZpZWxkcy5maWVsZCBuYW1lIG9mIGZpZWxkIHRvIHZhbGlkYXRlLlxuICogQHByb3BlcnR5IHtTdHJpbmd9IGZpZWxkcy5maWVsZC50eXBlIGV4cGVjdGVkIHR5cGUgb2YgZGF0YSBmb3IgZmllbGQuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IGZpZWxkcy5maWVsZC5jb25zdGFudCB3aGV0aGVyIHRoZSBmaWVsZCBjYW4gYmUgbW9kaWZpZWQgb24gdGhlIG9iamVjdC5cbiAqIEBwcm9wZXJ0eSB7QW55fSBmaWVsZHMuZmllbGQuZGVmYXVsdCBkZWZhdWx0IHZhbHVlIGlmIGZpZWxkIGlzIGBudWxsYCwgb3IgaW5pdGlhbCB2YWx1ZSBgY29uc3RhbnRgIGlzIGB0cnVlYC5cbiAqIEBwcm9wZXJ0eSB7QXJyYXl8ZnVuY3Rpb258QW55fSBmaWVsZHMuZmllbGQub3B0aW9ucyBhcnJheSBvZiBvcHRpb25zIHRoYXQgdGhlIGZpZWxkIGNhbiBiZSwgZnVuY3Rpb24gdG8gdmFsaWRhdGUgZmllbGQsIG9yIHNpbmdsZSB2YWx1ZS4gVGhyb3cgYW4gZXJyb3IgaWYgdmFsdWUgaXMgaW52YWxpZC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBmaWVsZHMuZmllbGQuZXJyb3IgY3VzdG9tIGVycm9yIG1lc3NhZ2UgaWYgZmllbGQgaXMgaW52YWxpZC5cbiAqL1xuIl19