// events.js
import Parse from 'parse/node';

export const EventTypes = {
  Login: {
    loginStarted: 'loginStarted',
    userAuthenticated: 'userAuthenticated',
    loginFinished: 'loginFinished',
    loginFailed: 'loginFailed',
  },
};

function validateClassNameForTriggers(className, eventType) {
  if (
    (eventType === EventTypes.Login.loginStarted ||
      eventType === EventTypes.Login.userAuthenticated ||
      eventType === EventTypes.Login.loginFinished ||
      eventType === EventTypes.Login.loginFailed) &&
    className !== '_User'
  ) {
    throw 'Login events can only be used with _User class!';
  }
}

const _eventStore = {};

function getEventStore() {
  return _eventStore;
}

function add(className, eventType, applicationId, handler) {
  let store = getEventStore();
  applicationId = applicationId || Parse.applicationId;
  const path = `${applicationId}.${className}.${eventType}`;
  const paths = path.split('.');
  paths.pop();
  for (const currentPath of paths) {
    if (!store[currentPath]) {
      store[currentPath] = {};
    }
    store = store[currentPath];
  }
  store[eventType] = handler;
}

function remove(className, eventType, applicationId) {
  const store = getEventStore();
  applicationId = applicationId || Parse.applicationId;
  delete store[applicationId][className][eventType];
}

function get(className, eventType, applicationId) {
  const store = getEventStore();
  applicationId = applicationId || Parse.applicationId;
  return store[applicationId]?.[className]?.[eventType];
}

export function addEvent(className, eventType, applicationId, handler) {
  validateClassNameForTriggers(className, eventType);
  applicationId = applicationId || Parse.applicationId;
  add(className, eventType, applicationId, handler);
}

export function removeEvent(className, eventType, applicationId) {
  applicationId = applicationId || Parse.applicationId;
  remove(className, eventType, applicationId);
}

export function getEvent(className, eventType, applicationId) {
  applicationId = applicationId || Parse.applicationId;
  return get(className, eventType, applicationId);
}

async function runEvent(className, eventType, request, applicationId) {
  try {
    applicationId = applicationId || Parse.applicationId;
    const event = get(className, eventType, applicationId);

    if (!event || typeof event !== 'function') {
      return null;
    }
    const res = event(request);
    return await Promise.resolve(res);
  } catch (error) {
    if (typeof error === 'string') {
      throw new Parse.Error(Parse.Error.SCRIPT_FAILED, error);
    }
    throw error;
  }
}

export async function runLoginEvent(eventType, request, applicationId) {
  applicationId = applicationId || Parse.applicationId;
  return await runEvent('_User', eventType, request, applicationId);
}

export function getLoginEventRequest(credentials, auth, config) {
  const request = {
    credentials: credentials,
    log: config.loggerController,
    headers: config.headers,
    ip: config.ip,
  };
  if (!auth) {
    return request;
  }
  if (auth.isMaster) {
    request.master = true;
  }
  if (auth.installationId) {
    request.installationId = auth.installationId;
  }
  return request;
}
