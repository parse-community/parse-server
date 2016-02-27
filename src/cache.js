export var apps = {};
export var stats = {};
export var isLoaded = false;
export var users = {};

export function getApp(app, callback) {
  if (apps[app]) return callback(true, apps[app]);
  return callback(false);
}

export function updateStat(key, value) {
  stats[key] = value;
}

export function getUser(sessionToken) {
  if (users[sessionToken]) return users[sessionToken];
  return undefined;
}

export function setUser(sessionToken, userObject) {
  users[sessionToken] = userObject;
}

export function clearUser(sessionToken) {
  delete users[sessionToken];
}

//So far used only in tests
export function clearCache() {
  apps = {};
  stats = {};
  users = {};
}

export default {
  apps,
  stats,
  isLoaded,
  getApp,
  updateStat,
  clearUser,
  getUser,
  setUser,
  clearCache,
};
