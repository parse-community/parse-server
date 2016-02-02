// GridStoreAdapter
//
// Stores files in Mongo using GridStore
// Requires the database adapter to be based on mongoclient

var GridStore = require('mongodb').GridStore;
var path = require('path');

// For a given config object, filename, and data, store a file
// Returns a promise
function create(config, filename, data) {
    return config.database.connect().then(() => {
        var gridStore = new GridStore(config.database.db, filename, 'w');
        return gridStore.open();
    }).then((gridStore) => {
        return gridStore.write(data);
    }).then((gridStore) => {
        return gridStore.close();
    });
}

// Search for and return a file if found by filename
// Resolves a promise that succeeds with the buffer result
// from GridStore
function get(config, filename) {
    return config.database.connect().then(() => {
        return GridStore.exist(config.database.db, filename);
    }).then(() => {
        var gridStore = new GridStore(config.database.db, filename, 'r');
        return gridStore.open();
    }).then((gridStore) => {
        return gridStore.read();
    });
}

// Generates and returns the location of a file stored in GridStore for the
// given request and filename
function location(config, req, filename) {
    return (req.protocol + '://' + req.get('host') +
    path.dirname(req.originalUrl) + '/' + req.config.applicationId +
    '/' + encodeURIComponent(filename));
}

module.exports = {
    create: create,
    get: get,
    location: location
};
