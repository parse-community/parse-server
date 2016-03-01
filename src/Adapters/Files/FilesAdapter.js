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
  /* this method is responsible to store the file in order to be retrived later by it's file name
   * 
   * 
   * @param config the current config
   * @param filename the filename to save
   * @param data the buffer of data from the file
   * @param contentType the supposed contentType
   * @discussion the contentType can be undefined if the controller was not able to determine it 
   * 
   * @return a promise that should fail if the storage didn't succeed
   * 
   */
  createFile(config, filename: string, data, contentType: string) { }

  deleteFile(config, filename) { }

  getFileData(config, filename) { }

  getFileLocation(config, filename) { }
}

export default FilesAdapter;
