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

 * @static
 * @memberof Parse.Cloud
 * @param {String} name The name of the Cloud Function
 * @param {Function} data The Cloud Function to register. This function can be an async function and should take one parameter a {@link Parse.Cloud.FunctionRequest}.
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
 * })
 *
 * Parse.Cloud.beforeSave(Parse.User, (request) => {
 *   // code here
 * })
 * ```
 *
 * @method beforeSave
 * @name Parse.Cloud.beforeSave
 * @param {(String|Parse.Object)} arg1 The Parse.Object subclass to register the after save function for. This can instead be a String that is the className of the subclass.
 * @param {Function} func The function to run before a save. This function can be async and should take one parameter a {@link Parse.Cloud.TriggerRequest};
 */


ParseCloud.beforeSave = function (parseClass, handler) {
  var className = getClassName(parseClass);
  triggers.addTrigger(triggers.Types.beforeSave, className, handler, _node.Parse.applicationId);
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
 * })
 *
 * Parse.Cloud.beforeDelete(Parse.User, (request) => {
 *   // code here
 * })
 *```
 *
 * @method beforeDelete
 * @name Parse.Cloud.beforeDelete
 * @param {(String|Parse.Object)} arg1 The Parse.Object subclass to register the before delete function for. This can instead be a String that is the className of the subclass.
 * @param {Function} func The function to run before a delete. This function can be async and should take one parameter, a {@link Parse.Cloud.TriggerRequest}.
 */


ParseCloud.beforeDelete = function (parseClass, handler) {
  var className = getClassName(parseClass);
  triggers.addTrigger(triggers.Types.beforeDelete, className, handler, _node.Parse.applicationId);
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
 * })
 *
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
 * })
 *
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
 * })
 *
 * Parse.Cloud.afterSave(Parse.User, async function(request) {
 *   // code here
 * })
 * ```
 *
 * @method afterSave
 * @name Parse.Cloud.afterSave
 * @param {(String|Parse.Object)} arg1 The Parse.Object subclass to register the after save function for. This can instead be a String that is the className of the subclass.
 * @param {Function} func The function to run after a save. This function can be an async function and should take just one parameter, {@link Parse.Cloud.TriggerRequest}.
 */


ParseCloud.afterSave = function (parseClass, handler) {
  var className = getClassName(parseClass);
  triggers.addTrigger(triggers.Types.afterSave, className, handler, _node.Parse.applicationId);
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
 * })
 *
 * Parse.Cloud.afterDelete(Parse.User, async (request) => {
 *   // code here
 * })
 *```
 *
 * @method afterDelete
 * @name Parse.Cloud.afterDelete
 * @param {(String|Parse.Object)} arg1 The Parse.Object subclass to register the after delete function for. This can instead be a String that is the className of the subclass.
 * @param {Function} func The function to run after a delete. This function can be async and should take just one parameter, {@link Parse.Cloud.TriggerRequest}.
 */


ParseCloud.afterDelete = function (parseClass, handler) {
  var className = getClassName(parseClass);
  triggers.addTrigger(triggers.Types.afterDelete, className, handler, _node.Parse.applicationId);
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
 * })
 *
 * Parse.Cloud.beforeFind(Parse.User, async (request) => {
 *   // code here
 * })
 *```
 *
 * @method beforeFind
 * @name Parse.Cloud.beforeFind
 * @param {(String|Parse.Object)} arg1 The Parse.Object subclass to register the before find function for. This can instead be a String that is the className of the subclass.
 * @param {Function} func The function to run before a find. This function can be async and should take just one parameter, {@link Parse.Cloud.BeforeFindRequest}.
 */


ParseCloud.beforeFind = function (parseClass, handler) {
  var className = getClassName(parseClass);
  triggers.addTrigger(triggers.Types.beforeFind, className, handler, _node.Parse.applicationId);
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
 * })
 *
 * Parse.Cloud.afterFind(Parse.User, async (request) => {
 *   // code here
 * })
 *```
 *
 * @method afterFind
 * @name Parse.Cloud.afterFind
 * @param {(String|Parse.Object)} arg1 The Parse.Object subclass to register the after find function for. This can instead be a String that is the className of the subclass.
 * @param {Function} func The function to run before a find. This function can be async and should take just one parameter, {@link Parse.Cloud.AfterFindRequest}.
 */


ParseCloud.afterFind = function (parseClass, handler) {
  const className = getClassName(parseClass);
  triggers.addTrigger(triggers.Types.afterFind, className, handler, _node.Parse.applicationId);
};
/**
 * Registers a before save file function.
 *
 * **Available in Cloud Code only.**
 *
 * ```
 * Parse.Cloud.beforeSaveFile(async (request) => {
 *   // code here
 * })
 *```
 *
 * @method beforeSaveFile
 * @name Parse.Cloud.beforeSaveFile
 * @param {Function} func The function to run before saving a file. This function can be async and should take just one parameter, {@link Parse.Cloud.FileTriggerRequest}.
 */


ParseCloud.beforeSaveFile = function (handler) {
  triggers.addFileTrigger(triggers.Types.beforeSaveFile, handler, _node.Parse.applicationId);
};
/**
 * Registers an after save file function.
 *
 * **Available in Cloud Code only.**
 *
 * ```
 * Parse.Cloud.afterSaveFile(async (request) => {
 *   // code here
 * })
 *```
 *
 * @method afterSaveFile
 * @name Parse.Cloud.afterSaveFile
 * @param {Function} func The function to run after saving a file. This function can be async and should take just one parameter, {@link Parse.Cloud.FileTriggerRequest}.
 */


ParseCloud.afterSaveFile = function (handler) {
  triggers.addFileTrigger(triggers.Types.afterSaveFile, handler, _node.Parse.applicationId);
};
/**
 * Registers a before delete file function.
 *
 * **Available in Cloud Code only.**
 *
 * ```
 * Parse.Cloud.beforeDeleteFile(async (request) => {
 *   // code here
 * })
 *```
 *
 * @method beforeDeleteFile
 * @name Parse.Cloud.beforeDeleteFile
 * @param {Function} func The function to run before deleting a file. This function can be async and should take just one parameter, {@link Parse.Cloud.FileTriggerRequest}.
 */


ParseCloud.beforeDeleteFile = function (handler) {
  triggers.addFileTrigger(triggers.Types.beforeDeleteFile, handler, _node.Parse.applicationId);
};
/**
 * Registers an after delete file function.
 *
 * **Available in Cloud Code only.**
 *
 * ```
 * Parse.Cloud.afterDeleteFile(async (request) => {
 *   // code here
 * })
 *```
 *
 * @method afterDeleteFile
 * @name Parse.Cloud.afterDeleteFile
 * @param {Function} func The function to after before deleting a file. This function can be async and should take just one parameter, {@link Parse.Cloud.FileTriggerRequest}.
 */


ParseCloud.afterDeleteFile = function (handler) {
  triggers.addFileTrigger(triggers.Types.afterDeleteFile, handler, _node.Parse.applicationId);
};

ParseCloud.onLiveQueryEvent = function (handler) {
  triggers.addLiveQueryEventHandler(handler, _node.Parse.applicationId);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9jbG91ZC1jb2RlL1BhcnNlLkNsb3VkLmpzIl0sIm5hbWVzIjpbImlzUGFyc2VPYmplY3RDb25zdHJ1Y3RvciIsIm9iamVjdCIsIk9iamVjdCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImdldENsYXNzTmFtZSIsInBhcnNlQ2xhc3MiLCJjbGFzc05hbWUiLCJQYXJzZUNsb3VkIiwiZGVmaW5lIiwiZnVuY3Rpb25OYW1lIiwiaGFuZGxlciIsInZhbGlkYXRpb25IYW5kbGVyIiwidHJpZ2dlcnMiLCJhZGRGdW5jdGlvbiIsIlBhcnNlIiwiYXBwbGljYXRpb25JZCIsImpvYiIsImFkZEpvYiIsImJlZm9yZVNhdmUiLCJhZGRUcmlnZ2VyIiwiVHlwZXMiLCJiZWZvcmVEZWxldGUiLCJiZWZvcmVMb2dpbiIsImFyZ3VtZW50cyIsImFmdGVyTG9naW4iLCJhZnRlckxvZ291dCIsImFmdGVyU2F2ZSIsImFmdGVyRGVsZXRlIiwiYmVmb3JlRmluZCIsImFmdGVyRmluZCIsImJlZm9yZVNhdmVGaWxlIiwiYWRkRmlsZVRyaWdnZXIiLCJhZnRlclNhdmVGaWxlIiwiYmVmb3JlRGVsZXRlRmlsZSIsImFmdGVyRGVsZXRlRmlsZSIsIm9uTGl2ZVF1ZXJ5RXZlbnQiLCJhZGRMaXZlUXVlcnlFdmVudEhhbmRsZXIiLCJfcmVtb3ZlQWxsSG9va3MiLCJfdW5yZWdpc3RlckFsbCIsInVzZU1hc3RlcktleSIsImNvbnNvbGUiLCJ3YXJuIiwiaHR0cFJlcXVlc3QiLCJyZXF1aXJlIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJtYXBwaW5ncyI6Ijs7QUFBQTs7QUFDQTs7Ozs7O0FBRUEsU0FBU0Esd0JBQVQsQ0FBa0NDLE1BQWxDLEVBQTBDO0FBQ3hDLFNBQ0UsT0FBT0EsTUFBUCxLQUFrQixVQUFsQixJQUNBQyxNQUFNLENBQUNDLFNBQVAsQ0FBaUJDLGNBQWpCLENBQWdDQyxJQUFoQyxDQUFxQ0osTUFBckMsRUFBNkMsV0FBN0MsQ0FGRjtB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QUFDbUIsY0FBVCxDQUNFbkIsUUFBUSxDQUFDUSxLQUFULENBQWVhLGdCQURqQixFQUVFdkIsT0FGRixFQUdFSSxZQUFNQyxhQUhSO0FBS0QsQ0FORDtBQVFBOzs7Ozs7Ozs7Ozs7Ozs7OztBQWVBUixVQUFVLENBQUMyQixlQUFYLEdBQTZCLFVBQVV4QixPQUFWLEVBQW1CO0FBQzlDRSxFQUFBQSxRQUFRLENBQUNtQixjQUFULENBQ0VuQixRQUFRLENBQUNRLEtBQVQsQ0FBZWMsZUFEakIsRUFFRXhCLE9BRkYsRUFHRUksWUFBTUMsYUFIUjtBQUtELENBTkQ7O0FBUUFSLFVBQVUsQ0FBQzRCLGdCQUFYLEdBQThCLFVBQVV6QixPQUFWLEVBQW1CO0FBQy9DRSxFQUFBQSxRQUFRLENBQUN3Qix3QkFBVCxDQUFrQzFCLE9BQWxDLEVBQTJDSSxZQUFNQyxhQUFqRDtBQUNELENBRkQ7O0FBSUFSLFVBQVUsQ0FBQzhCLGVBQVgsR0FBNkIsTUFBTTtBQUNqQ3pCLEVBQUFBLFFBQVEsQ0FBQzBCLGNBQVQ7QUFDRCxDQUZEOztBQUlBL0IsVUFBVSxDQUFDZ0MsWUFBWCxHQUEwQixNQUFNO0FBQzlCO0FBQ0FDLEVBQUFBLE9BQU8sQ0FBQ0MsSUFBUixDQUNFLDROQURGO0FBR0QsQ0FMRDs7QUFPQWxDLFVBQVUsQ0FBQ21DLFdBQVgsR0FBeUJDLE9BQU8sQ0FBQyxlQUFELENBQWhDO0FBRUFDLE1BQU0sQ0FBQ0MsT0FBUCxHQUFpQnRDLFVBQWpCO0FBRUE7Ozs7Ozs7Ozs7Ozs7QUFhQTs7Ozs7Ozs7Ozs7Ozs7QUFjQTs7Ozs7Ozs7Ozs7OztBQWFBOzs7Ozs7Ozs7Ozs7O0FBYUE7Ozs7Ozs7O0FBUUEiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBQYXJzZSB9IGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0ICogYXMgdHJpZ2dlcnMgZnJvbSAnLi4vdHJpZ2dlcnMnO1xuXG5mdW5jdGlvbiBpc1BhcnNlT2JqZWN0Q29uc3RydWN0b3Iob2JqZWN0KSB7XG4gIHJldHVybiAoXG4gICAgdHlwZW9mIG9iamVjdCA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmplY3QsICdjbGFzc05hbWUnKVxuICApO1xufVxuXG5mdW5jdGlvbiBnZXRDbGFzc05hbWUocGFyc2VDbGFzcykge1xuICBpZiAocGFyc2VDbGFzcyAmJiBwYXJzZUNsYXNzLmNsYXNzTmFtZSkge1xuICAgIHJldHVybiBwYXJzZUNsYXNzLmNsYXNzTmFtZTtcbiAgfVxuICByZXR1cm4gcGFyc2VDbGFzcztcbn1cblxuLyoqIEBuYW1lc3BhY2VcbiAqIEBuYW1lIFBhcnNlXG4gKiBAZGVzY3JpcHRpb24gVGhlIFBhcnNlIFNESy5cbiAqICBzZWUgW2FwaSBkb2NzXShodHRwczovL2RvY3MucGFyc2VwbGF0Zm9ybS5vcmcvanMvYXBpKSBhbmQgW2d1aWRlXShodHRwczovL2RvY3MucGFyc2VwbGF0Zm9ybS5vcmcvanMvZ3VpZGUpXG4gKi9cblxuLyoqIEBuYW1lc3BhY2VcbiAqIEBuYW1lIFBhcnNlLkNsb3VkXG4gKiBAbWVtYmVyb2YgUGFyc2VcbiAqIEBkZXNjcmlwdGlvbiBUaGUgUGFyc2UgQ2xvdWQgQ29kZSBTREsuXG4gKi9cblxudmFyIFBhcnNlQ2xvdWQgPSB7fTtcbi8qKlxuICogRGVmaW5lcyBhIENsb3VkIEZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyb2YgUGFyc2UuQ2xvdWRcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIFRoZSBuYW1lIG9mIHRoZSBDbG91ZCBGdW5jdGlvblxuICogQHBhcmFtIHtGdW5jdGlvbn0gZGF0YSBUaGUgQ2xvdWQgRnVuY3Rpb24gdG8gcmVnaXN0ZXIuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLkZ1bmN0aW9uUmVxdWVzdH0uXG4gKi9cblBhcnNlQ2xvdWQuZGVmaW5lID0gZnVuY3Rpb24gKGZ1bmN0aW9uTmFtZSwgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgdHJpZ2dlcnMuYWRkRnVuY3Rpb24oXG4gICAgZnVuY3Rpb25OYW1lLFxuICAgIGhhbmRsZXIsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZFxuICApO1xufTtcblxuLyoqXG4gKiBEZWZpbmVzIGEgQmFja2dyb3VuZCBKb2IuXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogQG1ldGhvZCBqb2JcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmpvYlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgVGhlIG5hbWUgb2YgdGhlIEJhY2tncm91bmQgSm9iXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBCYWNrZ3JvdW5kIEpvYiB0byByZWdpc3Rlci4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgc2hvdWxkIHRha2UgYSBzaW5nbGUgcGFyYW1ldGVycyBhIHtAbGluayBQYXJzZS5DbG91ZC5Kb2JSZXF1ZXN0fVxuICpcbiAqL1xuUGFyc2VDbG91ZC5qb2IgPSBmdW5jdGlvbiAoZnVuY3Rpb25OYW1lLCBoYW5kbGVyKSB7XG4gIHRyaWdnZXJzLmFkZEpvYihmdW5jdGlvbk5hbWUsIGhhbmRsZXIsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xufTtcblxuLyoqXG4gKlxuICogUmVnaXN0ZXJzIGEgYmVmb3JlIHNhdmUgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogSWYgeW91IHdhbnQgdG8gdXNlIGJlZm9yZVNhdmUgZm9yIGEgcHJlZGVmaW5lZCBjbGFzcyBpbiB0aGUgUGFyc2UgSmF2YVNjcmlwdCBTREsgKGUuZy4ge0BsaW5rIFBhcnNlLlVzZXJ9KSwgeW91IHNob3VsZCBwYXNzIHRoZSBjbGFzcyBpdHNlbGYgYW5kIG5vdCB0aGUgU3RyaW5nIGZvciBhcmcxLlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYmVmb3JlU2F2ZSgnTXlDdXN0b21DbGFzcycsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSlcbiAqXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVTYXZlKFBhcnNlLlVzZXIsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSlcbiAqIGBgYFxuICpcbiAqIEBtZXRob2QgYmVmb3JlU2F2ZVxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlU2F2ZVxuICogQHBhcmFtIHsoU3RyaW5nfFBhcnNlLk9iamVjdCl9IGFyZzEgVGhlIFBhcnNlLk9iamVjdCBzdWJjbGFzcyB0byByZWdpc3RlciB0aGUgYWZ0ZXIgc2F2ZSBmdW5jdGlvbiBmb3IuIFRoaXMgY2FuIGluc3RlYWQgYmUgYSBTdHJpbmcgdGhhdCBpcyB0aGUgY2xhc3NOYW1lIG9mIHRoZSBzdWJjbGFzcy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBiZWZvcmUgYSBzYXZlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH07XG4gKi9cblBhcnNlQ2xvdWQuYmVmb3JlU2F2ZSA9IGZ1bmN0aW9uIChwYXJzZUNsYXNzLCBoYW5kbGVyKSB7XG4gIHZhciBjbGFzc05hbWUgPSBnZXRDbGFzc05hbWUocGFyc2VDbGFzcyk7XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlU2F2ZSxcbiAgICBjbGFzc05hbWUsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkXG4gICk7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhIGJlZm9yZSBkZWxldGUgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogSWYgeW91IHdhbnQgdG8gdXNlIGJlZm9yZURlbGV0ZSBmb3IgYSBwcmVkZWZpbmVkIGNsYXNzIGluIHRoZSBQYXJzZSBKYXZhU2NyaXB0IFNESyAoZS5nLiB7QGxpbmsgUGFyc2UuVXNlcn0pLCB5b3Ugc2hvdWxkIHBhc3MgdGhlIGNsYXNzIGl0c2VsZiBhbmQgbm90IHRoZSBTdHJpbmcgZm9yIGFyZzEuXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZURlbGV0ZSgnTXlDdXN0b21DbGFzcycsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSlcbiAqXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVEZWxldGUoUGFyc2UuVXNlciwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9KVxuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGJlZm9yZURlbGV0ZVxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlRGVsZXRlXG4gKiBAcGFyYW0geyhTdHJpbmd8UGFyc2UuT2JqZWN0KX0gYXJnMSBUaGUgUGFyc2UuT2JqZWN0IHN1YmNsYXNzIHRvIHJlZ2lzdGVyIHRoZSBiZWZvcmUgZGVsZXRlIGZ1bmN0aW9uIGZvci4gVGhpcyBjYW4gaW5zdGVhZCBiZSBhIFN0cmluZyB0aGF0IGlzIHRoZSBjbGFzc05hbWUgb2YgdGhlIHN1YmNsYXNzLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGJlZm9yZSBhIGRlbGV0ZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIsIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fS5cbiAqL1xuUGFyc2VDbG91ZC5iZWZvcmVEZWxldGUgPSBmdW5jdGlvbiAocGFyc2VDbGFzcywgaGFuZGxlcikge1xuICB2YXIgY2xhc3NOYW1lID0gZ2V0Q2xhc3NOYW1lKHBhcnNlQ2xhc3MpO1xuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZURlbGV0ZSxcbiAgICBjbGFzc05hbWUsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkXG4gICk7XG59O1xuXG4vKipcbiAqXG4gKiBSZWdpc3RlcnMgdGhlIGJlZm9yZSBsb2dpbiBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBUaGlzIGZ1bmN0aW9uIHByb3ZpZGVzIGZ1cnRoZXIgY29udHJvbFxuICogaW4gdmFsaWRhdGluZyBhIGxvZ2luIGF0dGVtcHQuIFNwZWNpZmljYWxseSxcbiAqIGl0IGlzIHRyaWdnZXJlZCBhZnRlciBhIHVzZXIgZW50ZXJzXG4gKiBjb3JyZWN0IGNyZWRlbnRpYWxzIChvciBvdGhlciB2YWxpZCBhdXRoRGF0YSksXG4gKiBidXQgcHJpb3IgdG8gYSBzZXNzaW9uIGJlaW5nIGdlbmVyYXRlZC5cbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZUxvZ2luKChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSlcbiAqXG4gKiBgYGBcbiAqXG4gKiBAbWV0aG9kIGJlZm9yZUxvZ2luXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5iZWZvcmVMb2dpblxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGJlZm9yZSBhIGxvZ2luLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH07XG4gKi9cblBhcnNlQ2xvdWQuYmVmb3JlTG9naW4gPSBmdW5jdGlvbiAoaGFuZGxlcikge1xuICBsZXQgY2xhc3NOYW1lID0gJ19Vc2VyJztcbiAgaWYgKHR5cGVvZiBoYW5kbGVyID09PSAnc3RyaW5nJyB8fCBpc1BhcnNlT2JqZWN0Q29uc3RydWN0b3IoaGFuZGxlcikpIHtcbiAgICAvLyB2YWxpZGF0aW9uIHdpbGwgb2NjdXIgZG93bnN0cmVhbSwgdGhpcyBpcyB0byBtYWludGFpbiBpbnRlcm5hbFxuICAgIC8vIGNvZGUgY29uc2lzdGVuY3kgd2l0aCB0aGUgb3RoZXIgaG9vayB0eXBlcy5cbiAgICBjbGFzc05hbWUgPSBnZXRDbGFzc05hbWUoaGFuZGxlcik7XG4gICAgaGFuZGxlciA9IGFyZ3VtZW50c1sxXTtcbiAgfVxuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZUxvZ2luLFxuICAgIGNsYXNzTmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWRcbiAgKTtcbn07XG5cbi8qKlxuICpcbiAqIFJlZ2lzdGVycyB0aGUgYWZ0ZXIgbG9naW4gZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogVGhpcyBmdW5jdGlvbiBpcyB0cmlnZ2VyZWQgYWZ0ZXIgYSB1c2VyIGxvZ3MgaW4gc3VjY2Vzc2Z1bGx5LFxuICogYW5kIGFmdGVyIGEgX1Nlc3Npb24gb2JqZWN0IGhhcyBiZWVuIGNyZWF0ZWQuXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5hZnRlckxvZ2luKChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSlcbiAqXG4gKiBgYGBcbiAqXG4gKiBAbWV0aG9kIGFmdGVyTG9naW5cbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmFmdGVyTG9naW5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBhZnRlciBhIGxvZ2luLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH07XG4gKi9cblBhcnNlQ2xvdWQuYWZ0ZXJMb2dpbiA9IGZ1bmN0aW9uIChoYW5kbGVyKSB7XG4gIGxldCBjbGFzc05hbWUgPSAnX1VzZXInO1xuICBpZiAodHlwZW9mIGhhbmRsZXIgPT09ICdzdHJpbmcnIHx8IGlzUGFyc2VPYmplY3RDb25zdHJ1Y3RvcihoYW5kbGVyKSkge1xuICAgIC8vIHZhbGlkYXRpb24gd2lsbCBvY2N1ciBkb3duc3RyZWFtLCB0aGlzIGlzIHRvIG1haW50YWluIGludGVybmFsXG4gICAgLy8gY29kZSBjb25zaXN0ZW5jeSB3aXRoIHRoZSBvdGhlciBob29rIHR5cGVzLlxuICAgIGNsYXNzTmFtZSA9IGdldENsYXNzTmFtZShoYW5kbGVyKTtcbiAgICBoYW5kbGVyID0gYXJndW1lbnRzWzFdO1xuICB9XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJMb2dpbixcbiAgICBjbGFzc05hbWUsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkXG4gICk7XG59O1xuXG4vKipcbiAqXG4gKiBSZWdpc3RlcnMgdGhlIGFmdGVyIGxvZ291dCBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBUaGlzIGZ1bmN0aW9uIGlzIHRyaWdnZXJlZCBhZnRlciBhIHVzZXIgbG9ncyBvdXQuXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5hZnRlckxvZ291dCgocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0pXG4gKlxuICogYGBgXG4gKlxuICogQG1ldGhvZCBhZnRlckxvZ291dFxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYWZ0ZXJMb2dvdXRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBhZnRlciBhIGxvZ291dC4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9O1xuICovXG5QYXJzZUNsb3VkLmFmdGVyTG9nb3V0ID0gZnVuY3Rpb24gKGhhbmRsZXIpIHtcbiAgbGV0IGNsYXNzTmFtZSA9ICdfU2Vzc2lvbic7XG4gIGlmICh0eXBlb2YgaGFuZGxlciA9PT0gJ3N0cmluZycgfHwgaXNQYXJzZU9iamVjdENvbnN0cnVjdG9yKGhhbmRsZXIpKSB7XG4gICAgLy8gdmFsaWRhdGlvbiB3aWxsIG9jY3VyIGRvd25zdHJlYW0sIHRoaXMgaXMgdG8gbWFpbnRhaW4gaW50ZXJuYWxcbiAgICAvLyBjb2RlIGNvbnNpc3RlbmN5IHdpdGggdGhlIG90aGVyIGhvb2sgdHlwZXMuXG4gICAgY2xhc3NOYW1lID0gZ2V0Q2xhc3NOYW1lKGhhbmRsZXIpO1xuICAgIGhhbmRsZXIgPSBhcmd1bWVudHNbMV07XG4gIH1cbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlckxvZ291dCxcbiAgICBjbGFzc05hbWUsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkXG4gICk7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhbiBhZnRlciBzYXZlIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIElmIHlvdSB3YW50IHRvIHVzZSBhZnRlclNhdmUgZm9yIGEgcHJlZGVmaW5lZCBjbGFzcyBpbiB0aGUgUGFyc2UgSmF2YVNjcmlwdCBTREsgKGUuZy4ge0BsaW5rIFBhcnNlLlVzZXJ9KSwgeW91IHNob3VsZCBwYXNzIHRoZSBjbGFzcyBpdHNlbGYgYW5kIG5vdCB0aGUgU3RyaW5nIGZvciBhcmcxLlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJTYXZlKCdNeUN1c3RvbUNsYXNzJywgYXN5bmMgZnVuY3Rpb24ocmVxdWVzdCkge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0pXG4gKlxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJTYXZlKFBhcnNlLlVzZXIsIGFzeW5jIGZ1bmN0aW9uKHJlcXVlc3QpIHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9KVxuICogYGBgXG4gKlxuICogQG1ldGhvZCBhZnRlclNhdmVcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmFmdGVyU2F2ZVxuICogQHBhcmFtIHsoU3RyaW5nfFBhcnNlLk9iamVjdCl9IGFyZzEgVGhlIFBhcnNlLk9iamVjdCBzdWJjbGFzcyB0byByZWdpc3RlciB0aGUgYWZ0ZXIgc2F2ZSBmdW5jdGlvbiBmb3IuIFRoaXMgY2FuIGluc3RlYWQgYmUgYSBTdHJpbmcgdGhhdCBpcyB0aGUgY2xhc3NOYW1lIG9mIHRoZSBzdWJjbGFzcy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBhZnRlciBhIHNhdmUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBqdXN0IG9uZSBwYXJhbWV0ZXIsIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0uXG4gKi9cblBhcnNlQ2xvdWQuYWZ0ZXJTYXZlID0gZnVuY3Rpb24gKHBhcnNlQ2xhc3MsIGhhbmRsZXIpIHtcbiAgdmFyIGNsYXNzTmFtZSA9IGdldENsYXNzTmFtZShwYXJzZUNsYXNzKTtcbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlclNhdmUsXG4gICAgY2xhc3NOYW1lLFxuICAgIGhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZFxuICApO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYW4gYWZ0ZXIgZGVsZXRlIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIElmIHlvdSB3YW50IHRvIHVzZSBhZnRlckRlbGV0ZSBmb3IgYSBwcmVkZWZpbmVkIGNsYXNzIGluIHRoZSBQYXJzZSBKYXZhU2NyaXB0IFNESyAoZS5nLiB7QGxpbmsgUGFyc2UuVXNlcn0pLCB5b3Ugc2hvdWxkIHBhc3MgdGhlIGNsYXNzIGl0c2VsZiBhbmQgbm90IHRoZSBTdHJpbmcgZm9yIGFyZzEuXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmFmdGVyRGVsZXRlKCdNeUN1c3RvbUNsYXNzJywgYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9KVxuICpcbiAqIFBhcnNlLkNsb3VkLmFmdGVyRGVsZXRlKFBhcnNlLlVzZXIsIGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSlcbiAqYGBgXG4gKlxuICogQG1ldGhvZCBhZnRlckRlbGV0ZVxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYWZ0ZXJEZWxldGVcbiAqIEBwYXJhbSB7KFN0cmluZ3xQYXJzZS5PYmplY3QpfSBhcmcxIFRoZSBQYXJzZS5PYmplY3Qgc3ViY2xhc3MgdG8gcmVnaXN0ZXIgdGhlIGFmdGVyIGRlbGV0ZSBmdW5jdGlvbiBmb3IuIFRoaXMgY2FuIGluc3RlYWQgYmUgYSBTdHJpbmcgdGhhdCBpcyB0aGUgY2xhc3NOYW1lIG9mIHRoZSBzdWJjbGFzcy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBhZnRlciBhIGRlbGV0ZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIGp1c3Qgb25lIHBhcmFtZXRlciwge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fS5cbiAqL1xuUGFyc2VDbG91ZC5hZnRlckRlbGV0ZSA9IGZ1bmN0aW9uIChwYXJzZUNsYXNzLCBoYW5kbGVyKSB7XG4gIHZhciBjbGFzc05hbWUgPSBnZXRDbGFzc05hbWUocGFyc2VDbGFzcyk7XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJEZWxldGUsXG4gICAgY2xhc3NOYW1lLFxuICAgIGhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZFxuICApO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYSBiZWZvcmUgZmluZCBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBJZiB5b3Ugd2FudCB0byB1c2UgYmVmb3JlRmluZCBmb3IgYSBwcmVkZWZpbmVkIGNsYXNzIGluIHRoZSBQYXJzZSBKYXZhU2NyaXB0IFNESyAoZS5nLiB7QGxpbmsgUGFyc2UuVXNlcn0pLCB5b3Ugc2hvdWxkIHBhc3MgdGhlIGNsYXNzIGl0c2VsZiBhbmQgbm90IHRoZSBTdHJpbmcgZm9yIGFyZzEuXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZUZpbmQoJ015Q3VzdG9tQ2xhc3MnLCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0pXG4gKlxuICogUGFyc2UuQ2xvdWQuYmVmb3JlRmluZChQYXJzZS5Vc2VyLCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0pXG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYmVmb3JlRmluZFxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlRmluZFxuICogQHBhcmFtIHsoU3RyaW5nfFBhcnNlLk9iamVjdCl9IGFyZzEgVGhlIFBhcnNlLk9iamVjdCBzdWJjbGFzcyB0byByZWdpc3RlciB0aGUgYmVmb3JlIGZpbmQgZnVuY3Rpb24gZm9yLiBUaGlzIGNhbiBpbnN0ZWFkIGJlIGEgU3RyaW5nIHRoYXQgaXMgdGhlIGNsYXNzTmFtZSBvZiB0aGUgc3ViY2xhc3MuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYmVmb3JlIGEgZmluZC4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIGp1c3Qgb25lIHBhcmFtZXRlciwge0BsaW5rIFBhcnNlLkNsb3VkLkJlZm9yZUZpbmRSZXF1ZXN0fS5cbiAqL1xuUGFyc2VDbG91ZC5iZWZvcmVGaW5kID0gZnVuY3Rpb24gKHBhcnNlQ2xhc3MsIGhhbmRsZXIpIHtcbiAgdmFyIGNsYXNzTmFtZSA9IGdldENsYXNzTmFtZShwYXJzZUNsYXNzKTtcbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVGaW5kLFxuICAgIGNsYXNzTmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWRcbiAgKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGFuIGFmdGVyIGZpbmQgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogSWYgeW91IHdhbnQgdG8gdXNlIGFmdGVyRmluZCBmb3IgYSBwcmVkZWZpbmVkIGNsYXNzIGluIHRoZSBQYXJzZSBKYXZhU2NyaXB0IFNESyAoZS5nLiB7QGxpbmsgUGFyc2UuVXNlcn0pLCB5b3Ugc2hvdWxkIHBhc3MgdGhlIGNsYXNzIGl0c2VsZiBhbmQgbm90IHRoZSBTdHJpbmcgZm9yIGFyZzEuXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmFmdGVyRmluZCgnTXlDdXN0b21DbGFzcycsIGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSlcbiAqXG4gKiBQYXJzZS5DbG91ZC5hZnRlckZpbmQoUGFyc2UuVXNlciwgYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9KVxuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGFmdGVyRmluZFxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYWZ0ZXJGaW5kXG4gKiBAcGFyYW0geyhTdHJpbmd8UGFyc2UuT2JqZWN0KX0gYXJnMSBUaGUgUGFyc2UuT2JqZWN0IHN1YmNsYXNzIHRvIHJlZ2lzdGVyIHRoZSBhZnRlciBmaW5kIGZ1bmN0aW9uIGZvci4gVGhpcyBjYW4gaW5zdGVhZCBiZSBhIFN0cmluZyB0aGF0IGlzIHRoZSBjbGFzc05hbWUgb2YgdGhlIHN1YmNsYXNzLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGJlZm9yZSBhIGZpbmQuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBqdXN0IG9uZSBwYXJhbWV0ZXIsIHtAbGluayBQYXJzZS5DbG91ZC5BZnRlckZpbmRSZXF1ZXN0fS5cbiAqL1xuUGFyc2VDbG91ZC5hZnRlckZpbmQgPSBmdW5jdGlvbiAocGFyc2VDbGFzcywgaGFuZGxlcikge1xuICBjb25zdCBjbGFzc05hbWUgPSBnZXRDbGFzc05hbWUocGFyc2VDbGFzcyk7XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJGaW5kLFxuICAgIGNsYXNzTmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWRcbiAgKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGEgYmVmb3JlIHNhdmUgZmlsZSBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZVNhdmVGaWxlKGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSlcbiAqYGBgXG4gKlxuICogQG1ldGhvZCBiZWZvcmVTYXZlRmlsZVxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlU2F2ZUZpbGVcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBiZWZvcmUgc2F2aW5nIGEgZmlsZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIGp1c3Qgb25lIHBhcmFtZXRlciwge0BsaW5rIFBhcnNlLkNsb3VkLkZpbGVUcmlnZ2VyUmVxdWVzdH0uXG4gKi9cblBhcnNlQ2xvdWQuYmVmb3JlU2F2ZUZpbGUgPSBmdW5jdGlvbiAoaGFuZGxlcikge1xuICB0cmlnZ2Vycy5hZGRGaWxlVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVTYXZlRmlsZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWRcbiAgKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGFuIGFmdGVyIHNhdmUgZmlsZSBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmFmdGVyU2F2ZUZpbGUoYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9KVxuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGFmdGVyU2F2ZUZpbGVcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmFmdGVyU2F2ZUZpbGVcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBhZnRlciBzYXZpbmcgYSBmaWxlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2UganVzdCBvbmUgcGFyYW1ldGVyLCB7QGxpbmsgUGFyc2UuQ2xvdWQuRmlsZVRyaWdnZXJSZXF1ZXN0fS5cbiAqL1xuUGFyc2VDbG91ZC5hZnRlclNhdmVGaWxlID0gZnVuY3Rpb24gKGhhbmRsZXIpIHtcbiAgdHJpZ2dlcnMuYWRkRmlsZVRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJTYXZlRmlsZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWRcbiAgKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGEgYmVmb3JlIGRlbGV0ZSBmaWxlIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYmVmb3JlRGVsZXRlRmlsZShhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0pXG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYmVmb3JlRGVsZXRlRmlsZVxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlRGVsZXRlRmlsZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGJlZm9yZSBkZWxldGluZyBhIGZpbGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBqdXN0IG9uZSBwYXJhbWV0ZXIsIHtAbGluayBQYXJzZS5DbG91ZC5GaWxlVHJpZ2dlclJlcXVlc3R9LlxuICovXG5QYXJzZUNsb3VkLmJlZm9yZURlbGV0ZUZpbGUgPSBmdW5jdGlvbiAoaGFuZGxlcikge1xuICB0cmlnZ2Vycy5hZGRGaWxlVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVEZWxldGVGaWxlLFxuICAgIGhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZFxuICApO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYW4gYWZ0ZXIgZGVsZXRlIGZpbGUgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5hZnRlckRlbGV0ZUZpbGUoYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9KVxuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGFmdGVyRGVsZXRlRmlsZVxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYWZ0ZXJEZWxldGVGaWxlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBhZnRlciBiZWZvcmUgZGVsZXRpbmcgYSBmaWxlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2UganVzdCBvbmUgcGFyYW1ldGVyLCB7QGxpbmsgUGFyc2UuQ2xvdWQuRmlsZVRyaWdnZXJSZXF1ZXN0fS5cbiAqL1xuUGFyc2VDbG91ZC5hZnRlckRlbGV0ZUZpbGUgPSBmdW5jdGlvbiAoaGFuZGxlcikge1xuICB0cmlnZ2Vycy5hZGRGaWxlVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlckRlbGV0ZUZpbGUsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkXG4gICk7XG59O1xuXG5QYXJzZUNsb3VkLm9uTGl2ZVF1ZXJ5RXZlbnQgPSBmdW5jdGlvbiAoaGFuZGxlcikge1xuICB0cmlnZ2Vycy5hZGRMaXZlUXVlcnlFdmVudEhhbmRsZXIoaGFuZGxlciwgUGFyc2UuYXBwbGljYXRpb25JZCk7XG59O1xuXG5QYXJzZUNsb3VkLl9yZW1vdmVBbGxIb29rcyA9ICgpID0+IHtcbiAgdHJpZ2dlcnMuX3VucmVnaXN0ZXJBbGwoKTtcbn07XG5cblBhcnNlQ2xvdWQudXNlTWFzdGVyS2V5ID0gKCkgPT4ge1xuICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmVcbiAgY29uc29sZS53YXJuKFxuICAgICdQYXJzZS5DbG91ZC51c2VNYXN0ZXJLZXkgaXMgZGVwcmVjYXRlZCAoYW5kIGhhcyBubyBlZmZlY3QgYW55bW9yZSkgb24gcGFyc2Utc2VydmVyLCBwbGVhc2UgcmVmZXIgdG8gdGhlIGNsb3VkIGNvZGUgbWlncmF0aW9uIG5vdGVzOiBodHRwOi8vZG9jcy5wYXJzZXBsYXRmb3JtLm9yZy9wYXJzZS1zZXJ2ZXIvZ3VpZGUvI21hc3Rlci1rZXktbXVzdC1iZS1wYXNzZWQtZXhwbGljaXRseSdcbiAgKTtcbn07XG5cblBhcnNlQ2xvdWQuaHR0cFJlcXVlc3QgPSByZXF1aXJlKCcuL2h0dHBSZXF1ZXN0Jyk7XG5cbm1vZHVsZS5leHBvcnRzID0gUGFyc2VDbG91ZDtcblxuLyoqXG4gKiBAaW50ZXJmYWNlIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0XG4gKiBAcHJvcGVydHkge1N0cmluZ30gaW5zdGFsbGF0aW9uSWQgSWYgc2V0LCB0aGUgaW5zdGFsbGF0aW9uSWQgdHJpZ2dlcmluZyB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gbWFzdGVyIElmIHRydWUsIG1lYW5zIHRoZSBtYXN0ZXIga2V5IHdhcyB1c2VkLlxuICogQHByb3BlcnR5IHtQYXJzZS5Vc2VyfSB1c2VyIElmIHNldCwgdGhlIHVzZXIgdGhhdCBtYWRlIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtQYXJzZS5PYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRyaWdnZXJpbmcgdGhlIGhvb2suXG4gKiBAcHJvcGVydHkge1N0cmluZ30gaXAgVGhlIElQIGFkZHJlc3Mgb2YgdGhlIGNsaWVudCBtYWtpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge09iamVjdH0gaGVhZGVycyBUaGUgb3JpZ2luYWwgSFRUUCBoZWFkZXJzIGZvciB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSB0cmlnZ2VyTmFtZSBUaGUgbmFtZSBvZiB0aGUgdHJpZ2dlciAoYGJlZm9yZVNhdmVgLCBgYWZ0ZXJTYXZlYCwgLi4uKVxuICogQHByb3BlcnR5IHtPYmplY3R9IGxvZyBUaGUgY3VycmVudCBsb2dnZXIgaW5zaWRlIFBhcnNlIFNlcnZlci5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuT2JqZWN0fSBvcmlnaW5hbCBJZiBzZXQsIHRoZSBvYmplY3QsIGFzIGN1cnJlbnRseSBzdG9yZWQuXG4gKi9cblxuLyoqXG4gKiBAaW50ZXJmYWNlIFBhcnNlLkNsb3VkLkZpbGVUcmlnZ2VyUmVxdWVzdFxuICogQHByb3BlcnR5IHtTdHJpbmd9IGluc3RhbGxhdGlvbklkIElmIHNldCwgdGhlIGluc3RhbGxhdGlvbklkIHRyaWdnZXJpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IG1hc3RlciBJZiB0cnVlLCBtZWFucyB0aGUgbWFzdGVyIGtleSB3YXMgdXNlZC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuVXNlcn0gdXNlciBJZiBzZXQsIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuRmlsZX0gZmlsZSBUaGUgZmlsZSB0aGF0IHRyaWdnZXJlZCB0aGUgaG9vay5cbiAqIEBwcm9wZXJ0eSB7SW50ZWdlcn0gZmlsZVNpemUgVGhlIHNpemUgb2YgdGhlIGZpbGUgaW4gYnl0ZXMuXG4gKiBAcHJvcGVydHkge0ludGVnZXJ9IGNvbnRlbnRMZW5ndGggVGhlIHZhbHVlIGZyb20gQ29udGVudC1MZW5ndGggaGVhZGVyXG4gKiBAcHJvcGVydHkge1N0cmluZ30gaXAgVGhlIElQIGFkZHJlc3Mgb2YgdGhlIGNsaWVudCBtYWtpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge09iamVjdH0gaGVhZGVycyBUaGUgb3JpZ2luYWwgSFRUUCBoZWFkZXJzIGZvciB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSB0cmlnZ2VyTmFtZSBUaGUgbmFtZSBvZiB0aGUgdHJpZ2dlciAoYGJlZm9yZVNhdmVGaWxlYCwgYGFmdGVyU2F2ZUZpbGVgKVxuICogQHByb3BlcnR5IHtPYmplY3R9IGxvZyBUaGUgY3VycmVudCBsb2dnZXIgaW5zaWRlIFBhcnNlIFNlcnZlci5cbiAqL1xuXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFyc2UuQ2xvdWQuQmVmb3JlRmluZFJlcXVlc3RcbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpbnN0YWxsYXRpb25JZCBJZiBzZXQsIHRoZSBpbnN0YWxsYXRpb25JZCB0cmlnZ2VyaW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtCb29sZWFufSBtYXN0ZXIgSWYgdHJ1ZSwgbWVhbnMgdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4gKiBAcHJvcGVydHkge1BhcnNlLlVzZXJ9IHVzZXIgSWYgc2V0LCB0aGUgdXNlciB0aGF0IG1hZGUgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1BhcnNlLlF1ZXJ5fSBxdWVyeSBUaGUgcXVlcnkgdHJpZ2dlcmluZyB0aGUgaG9vay5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpcCBUaGUgSVAgYWRkcmVzcyBvZiB0aGUgY2xpZW50IG1ha2luZyB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBoZWFkZXJzIFRoZSBvcmlnaW5hbCBIVFRQIGhlYWRlcnMgZm9yIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtTdHJpbmd9IHRyaWdnZXJOYW1lIFRoZSBuYW1lIG9mIHRoZSB0cmlnZ2VyIChgYmVmb3JlU2F2ZWAsIGBhZnRlclNhdmVgLCAuLi4pXG4gKiBAcHJvcGVydHkge09iamVjdH0gbG9nIFRoZSBjdXJyZW50IGxvZ2dlciBpbnNpZGUgUGFyc2UgU2VydmVyLlxuICogQHByb3BlcnR5IHtCb29sZWFufSBpc0dldCB3ZXRoZXIgdGhlIHF1ZXJ5IGEgYGdldGAgb3IgYSBgZmluZGBcbiAqL1xuXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFyc2UuQ2xvdWQuQWZ0ZXJGaW5kUmVxdWVzdFxuICogQHByb3BlcnR5IHtTdHJpbmd9IGluc3RhbGxhdGlvbklkIElmIHNldCwgdGhlIGluc3RhbGxhdGlvbklkIHRyaWdnZXJpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IG1hc3RlciBJZiB0cnVlLCBtZWFucyB0aGUgbWFzdGVyIGtleSB3YXMgdXNlZC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuVXNlcn0gdXNlciBJZiBzZXQsIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuUXVlcnl9IHF1ZXJ5IFRoZSBxdWVyeSB0cmlnZ2VyaW5nIHRoZSBob29rLlxuICogQHByb3BlcnR5IHtBcnJheTxQYXJzZS5PYmplY3Q+fSByZXN1bHRzIFRoZSByZXN1bHRzIHRoZSBxdWVyeSB5aWVsZGVkLlxuICogQHByb3BlcnR5IHtTdHJpbmd9IGlwIFRoZSBJUCBhZGRyZXNzIG9mIHRoZSBjbGllbnQgbWFraW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtPYmplY3R9IGhlYWRlcnMgVGhlIG9yaWdpbmFsIEhUVFAgaGVhZGVycyBmb3IgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gdHJpZ2dlck5hbWUgVGhlIG5hbWUgb2YgdGhlIHRyaWdnZXIgKGBiZWZvcmVTYXZlYCwgYGFmdGVyU2F2ZWAsIC4uLilcbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBsb2cgVGhlIGN1cnJlbnQgbG9nZ2VyIGluc2lkZSBQYXJzZSBTZXJ2ZXIuXG4gKi9cblxuLyoqXG4gKiBAaW50ZXJmYWNlIFBhcnNlLkNsb3VkLkZ1bmN0aW9uUmVxdWVzdFxuICogQHByb3BlcnR5IHtTdHJpbmd9IGluc3RhbGxhdGlvbklkIElmIHNldCwgdGhlIGluc3RhbGxhdGlvbklkIHRyaWdnZXJpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IG1hc3RlciBJZiB0cnVlLCBtZWFucyB0aGUgbWFzdGVyIGtleSB3YXMgdXNlZC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuVXNlcn0gdXNlciBJZiBzZXQsIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBwYXJhbXMgVGhlIHBhcmFtcyBwYXNzZWQgdG8gdGhlIGNsb3VkIGZ1bmN0aW9uLlxuICovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5Kb2JSZXF1ZXN0XG4gKiBAcHJvcGVydHkge09iamVjdH0gcGFyYW1zIFRoZSBwYXJhbXMgcGFzc2VkIHRvIHRoZSBiYWNrZ3JvdW5kIGpvYi5cbiAqIEBwcm9wZXJ0eSB7ZnVuY3Rpb259IG1lc3NhZ2UgSWYgbWVzc2FnZSBpcyBjYWxsZWQgd2l0aCBhIHN0cmluZyBhcmd1bWVudCwgd2lsbCB1cGRhdGUgdGhlIGN1cnJlbnQgbWVzc2FnZSB0byBiZSBzdG9yZWQgaW4gdGhlIGpvYiBzdGF0dXMuXG4gKi9cbiJdfQ==