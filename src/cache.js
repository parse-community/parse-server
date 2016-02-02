var apps = {};
var stats = {};
var isLoaded = false;
var users = {};

function getApp(app, callback) {
    if (apps[app]) return callback(true, apps[app]);
    return callback(false);
}

function updateStat(key, value) {
    stats[key] = value;
}

function getUser(sessionToken) {
    if (users[sessionToken]) return users[sessionToken];
    return undefined;
}

function setUser(sessionToken, userObject) {
    users[sessionToken] = userObject;
}

function clearUser(sessionToken) {
    delete users[sessionToken];
}

module.exports = {
    apps: apps,
    stats: stats,
    isLoaded: isLoaded,
    getApp: getApp,
    updateStat: updateStat,
    clearUser: clearUser,
    getUser: getUser,
    setUser: setUser
};
