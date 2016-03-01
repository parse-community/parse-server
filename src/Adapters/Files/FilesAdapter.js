// Files Adapter
//
// Allows you to change the file storage mechanism.
//
// Adapter classes must implement the following functions:
// * createFile(config, filename, data)
// * getFileData(config, filename)
// * getFileLocation(config, request, filename)
//
// Default is GridStoreAdapter, which requires mongo
// and for the API server to be using the DatabaseController with Mongo
// database adapter.

export class FilesAdapter {
  createFile(config, filename, data) { }

  deleteFile(config, filename) { }

  getFileData(config, filename) { }

  getFileLocation(config, filename) { }
}

export default FilesAdapter;
