// Files Adapter
//
// Allows you to change the file storage mechanism.
//
// Adapter classes must implement the following functions:
// * create(config, filename, data)
// * get(config, filename)
// * location(config, req, filename)
//
// Default is GridStoreAdapter, which requires mongo
// and for the API server to be using the ExportAdapter
// database adapter.

var GridStoreAdapter = require('./GridStoreAdapter');

var adapter = GridStoreAdapter;

function setAdapter(filesAdapter) {
    adapter = filesAdapter;
}

function getAdapter() {
    return adapter;
}

module.exports = {
    getAdapter: getAdapter,
    setAdapter: setAdapter
};
