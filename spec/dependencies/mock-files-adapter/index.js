/**
 * A mock files adapter for testing.
 */
class MockFilesAdapter {
  constructor(options = {}) {
    if (options.throw) {
      throw 'MockFilesAdapterConstructor';
    }
  }
  createFile() {
    return 'MockFilesAdapterCreateFile';
  }
  deleteFile() {
    return 'MockFilesAdapterDeleteFile';
  }
  getFileData() {
    return 'MockFilesAdapterGetFileData';
  }
  getFileLocation() {
    return 'MockFilesAdapterGetFileLocation';
  }
  validateFilename() {
    return 'MockFilesAdapterValidateFilename';
  }
  handleFileStream() {
    return 'MockFilesAdapterHandleFileStream';
  }
}

module.exports = MockFilesAdapter;
module.exports.default = MockFilesAdapter;
