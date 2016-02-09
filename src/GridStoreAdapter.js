// GridStoreAdapter
//
// Stores files in Mongo using GridStore
// Requires the database adapter to be based on mongoclient

import { GridStore } from 'mongodb';

import * as Path from 'path';
import { FilesAdapter } from './FilesAdapter';

class GridStoreAdapter extends FilesAdapter {
  // For a given config object, filename, and data, store a file
  // Returns a promise
  createFileAsync(config, filename, data) {
    return config.database.connect().then(() => {
      let gridStore = new GridStore(config.database.db, filename, 'w');
      return gridStore.open();
    }).then((gridStore) => {
      return gridStore.write(data);
    }).then((gridStore) => {
      return gridStore.close();
    });
  }

  getFileDataAsync(config, filename) {
    return config.database.connect().then(() => {
      return GridStore.exist(config.database.db, filename);
    }).then(() => {
      let gridStore = new GridStore(config.database.db, filename, 'r');
      return gridStore.open();
    }).then((gridStore) => {
      return gridStore.read();
    });
  }

  getFileLocation(config, request, filename) {
    return (request.protocol + '://' + request.get('host') +
    Path.dirname(request.originalUrl) + '/' + config.applicationId +
    '/' + encodeURIComponent(filename));
  }
}

export default GridStoreAdapter;
