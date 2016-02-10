// Files Adapter
//
// Allows you to change the file storage mechanism.
//
// Adapter classes must implement the following functions:
// * createFileAsync(config, filename, data)
// * getFileDataAsync(config, filename)
// * getFileLocation(config, request, filename)
//
// Default is GridStoreAdapter, which requires mongo
// and for the API server to be using the ExportAdapter
// database adapter.

export class FilesAdapter {
  createFileAsync(config, filename, data) { }

  getFileDataAsync(config, filename) { }

  getFileLocation(config, filename) { }
}

export default FilesAdapter;
