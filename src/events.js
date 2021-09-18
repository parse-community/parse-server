// events.js
import Parse from 'parse/node';

export const EventTypes = {
  Auth: {
    loginStarted: 'loginStarted',
    userAuthenticated: 'userAuthenticated',
    loginFinished: 'loginFinished',
    loginFailed: 'loginFailed',
    logoutStarted: 'logoutStarted',
    logoutFinished: 'logoutFinished',
    logoutFailed: 'logoutFailed',
  },
};

function validateClassNameForEvents(className, eventType) {
  if (
    (eventType === EventTypes.Auth.loginStarted ||
      eventType === EventTypes.Auth.userAuthenticated ||
      eventType === EventTypes.Auth.loginFinished ||
      eventType === EventTypes.Auth.loginFailed ||
      eventType === EventTypes.Auth.logoutStarted ||
      eventType === EventTypes.Auth.logoutFinished ||
      eventType === EventTypes.Auth.logoutFailed) &&
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
  validateClassNameForEvents(className, eventType);
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
    return await Promise.resolve(event(request));
  } catch (error) {
    if (typeof error === 'string') {
      throw new Parse.Error(Parse.Error.SCRIPT_FAILED, error);
    }
    throw error;
  }
}

export async function runAuthEvent(eventType, request, applicationId) {
  applicationId = applicationId || Parse.applicationId;
  return await runEvent('_User', eventType, request, applicationId);
}

export function getAuthEventRequest(credentials, auth, config) {
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
  if (auth.user) {
    request.user = auth.user;
  }
  if (auth.installationId) {
    request.installationId = auth.installationId;
  }
  return request;
}
