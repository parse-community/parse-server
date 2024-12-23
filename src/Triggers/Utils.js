export function getClassName(parseClass) {
  if (parseClass && parseClass.className) {
    return parseClass.className;
  }
  if (parseClass && parseClass.name) {
    return parseClass.name.replace('Parse', '@');
  }
  return parseClass;
}

export function inflate(data, restObject) {
  var copy = typeof data == 'object' ? data : { className: data };
  for (var key in restObject) {
    copy[key] = restObject[key];
  }
  return Parse.Object.fromJSON(copy);
}

export function resolveError(message, defaultOpts) {
  if (!defaultOpts) {
    defaultOpts = {};
  }
  if (!message) {
    return new Parse.Error(
      defaultOpts.code || Parse.Error.SCRIPT_FAILED,
      defaultOpts.message || 'Script failed.'
    );
  }
  if (message instanceof Parse.Error) {
    return message;
  }

  const code = defaultOpts.code || Parse.Error.SCRIPT_FAILED;
  // If it's an error, mark it as a script failed
  if (typeof message === 'string') {
    return new Parse.Error(code, message);
  }
  const error = new Parse.Error(code, message.message || message);
  if (message instanceof Error) {
    error.stack = message.stack;
  }
  return error;
}

export function toJSONwithObjects(object, className) {
  if (!object || !object.toJSON) {
    return {};
  }
  const toJSON = object.toJSON();
  const stateController = Parse.CoreManager.getObjectStateController();
  const [pending] = stateController.getPendingOps(object._getStateIdentifier());
  for (const key in pending) {
    const val = object.get(key);
    if (!val || !val._toFullJSON) {
      toJSON[key] = val;
      continue;
    }
    toJSON[key] = val._toFullJSON();
  }
  if (className) {
    toJSON.className = className;
  }
  return toJSON;
}
