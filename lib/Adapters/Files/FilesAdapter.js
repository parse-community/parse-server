"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.validateFilename = validateFilename;
exports.default = exports.FilesAdapter = void 0;

var _node = _interopRequireDefault(require("parse/node"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/*eslint no-unused-vars: "off"*/
// Files Adapter
//
// Allows you to change the file storage mechanism.
//
// Adapter classes must implement the following functions:
// * createFile(filename, data, contentType)
// * deleteFile(filename)
// * getFileData(filename)
// * getFileLocation(config, filename)
// Adapter classes should implement the following functions:
// * validateFilename(filename)
// * handleFileStream(filename, req, res, contentType)
//
// Default is GridFSBucketAdapter, which requires mongo
// and for the API server to be using the DatabaseController with Mongo
// database adapter.

/**
 * @module Adapters
 */

/**
 * @interface FilesAdapter
 */
class FilesAdapter {
  /** Responsible for storing the file in order to be retrieved later by its filename
   *
   * @param {string} filename - the filename to save
   * @param {*} data - the buffer of data from the file
   * @param {string} contentType - the supposed contentType
   * @discussion the contentType can be undefined if the controller was not able to determine it
   *
   * @return {Promise} a promise that should fail if the storage didn't succeed
   */
  createFile(filename, data, contentType) {}
  /** Responsible for deleting the specified file
   *
   * @param {string} filename - the filename to delete
   *
   * @return {Promise} a promise that should fail if the deletion didn't succeed
   */


  deleteFile(filename) {}
  /** Responsible for retrieving the data of the specified file
   *
   * @param {string} filename - the name of file to retrieve
   *
   * @return {Promise} a promise that should pass with the file data or fail on error
   */


  getFileData(filename) {}
  /** Returns an absolute URL where the file can be accessed
   *
   * @param {Config} config - server configuration
   * @param {string} filename
   *
   * @return {string} Absolute URL
   */


  getFileLocation(config, filename) {}
  /** Validate a filename for this adapter type
   *
   * @param {string} filename
   *
   * @returns {null|Parse.Error} null if there are no errors
   */
  // validateFilename(filename: string): ?Parse.Error {}

  /** Handles Byte-Range Requests for Streaming
   *
   * @param {string} filename
   * @param {object} req
   * @param {object} res
   * @param {string} contentType
   *
   * @returns {Promise} Data for byte range
   */
  // handleFileStream(filename: string, res: any, req: any, contentType: string): Promise


}
/**
 * Simple filename validation
 *
 * @param filename
 * @returns {null|Parse.Error}
 */


exports.FilesAdapter = FilesAdapter;

function validateFilename(filename) {
  if (filename.length > 128) {
    return new _node.default.Error(_node.default.Error.INVALID_FILE_NAME, 'Filename too long.');
  }

  const regx = /^[_a-zA-Z0-9][a-zA-Z0-9@. ~_-]*$/;

  if (!filename.match(regx)) {
    return new _node.default.Error(_node.default.Error.INVALID_FILE_NAME, 'Filename contains invalid characters.');
  }

  return null;
}

var _default = FilesAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9GaWxlcy9GaWxlc0FkYXB0ZXIuanMiXSwibmFtZXMiOlsiRmlsZXNBZGFwdGVyIiwiY3JlYXRlRmlsZSIsImZpbGVuYW1lIiwiZGF0YSIsImNvbnRlbnRUeXBlIiwiZGVsZXRlRmlsZSIsImdldEZpbGVEYXRhIiwiZ2V0RmlsZUxvY2F0aW9uIiwiY29uZmlnIiwidmFsaWRhdGVGaWxlbmFtZSIsImxlbmd0aCIsIlBhcnNlIiwiRXJyb3IiLCJJTlZBTElEX0ZJTEVfTkFNRSIsInJlZ3giLCJtYXRjaCJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7QUFtQkE7Ozs7QUFuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFJQTs7OztBQUdBOzs7QUFHTyxNQUFNQSxZQUFOLENBQW1CO0FBQ3hCOzs7Ozs7Ozs7QUFTQUMsRUFBQUEsVUFBVSxDQUFDQyxRQUFELEVBQW1CQyxJQUFuQixFQUF5QkMsV0FBekIsRUFBdUQsQ0FBRTtBQUVuRTs7Ozs7Ozs7QUFNQUMsRUFBQUEsVUFBVSxDQUFDSCxRQUFELEVBQTRCLENBQUU7QUFFeEM7Ozs7Ozs7O0FBTUFJLEVBQUFBLFdBQVcsQ0FBQ0osUUFBRCxFQUFpQyxDQUFFO0FBRTlDOzs7Ozs7Ozs7QUFPQUssRUFBQUEsZUFBZSxDQUFDQyxNQUFELEVBQWlCTixRQUFqQixFQUEyQyxDQUFFO0FBRTVEOzs7Ozs7QUFNQTs7QUFFQTs7Ozs7Ozs7O0FBU0E7OztBQXREd0I7QUF5RDFCOzs7Ozs7Ozs7O0FBTU8sU0FBU08sZ0JBQVQsQ0FBMEJQLFFBQTFCLEVBQWtEO0FBQ3ZELE1BQUlBLFFBQVEsQ0FBQ1EsTUFBVCxHQUFrQixHQUF0QixFQUEyQjtBQUN6QixXQUFPLElBQUlDLGNBQU1DLEtBQVYsQ0FBZ0JELGNBQU1DLEtBQU4sQ0FBWUMsaUJBQTVCLEVBQStDLG9CQUEvQyxDQUFQO0FBQ0Q7O0FBRUQsUUFBTUMsSUFBSSxHQUFHLGtDQUFiOztBQUNBLE1BQUksQ0FBQ1osUUFBUSxDQUFDYSxLQUFULENBQWVELElBQWYsQ0FBTCxFQUEyQjtBQUN6QixXQUFPLElBQUlILGNBQU1DLEtBQVYsQ0FDTEQsY0FBTUMsS0FBTixDQUFZQyxpQkFEUCxFQUVMLHVDQUZLLENBQVA7QUFJRDs7QUFDRCxTQUFPLElBQVA7QUFDRDs7ZUFFY2IsWSIsInNvdXJjZXNDb250ZW50IjpbIi8qZXNsaW50IG5vLXVudXNlZC12YXJzOiBcIm9mZlwiKi9cbi8vIEZpbGVzIEFkYXB0ZXJcbi8vXG4vLyBBbGxvd3MgeW91IHRvIGNoYW5nZSB0aGUgZmlsZSBzdG9yYWdlIG1lY2hhbmlzbS5cbi8vXG4vLyBBZGFwdGVyIGNsYXNzZXMgbXVzdCBpbXBsZW1lbnQgdGhlIGZvbGxvd2luZyBmdW5jdGlvbnM6XG4vLyAqIGNyZWF0ZUZpbGUoZmlsZW5hbWUsIGRhdGEsIGNvbnRlbnRUeXBlKVxuLy8gKiBkZWxldGVGaWxlKGZpbGVuYW1lKVxuLy8gKiBnZXRGaWxlRGF0YShmaWxlbmFtZSlcbi8vICogZ2V0RmlsZUxvY2F0aW9uKGNvbmZpZywgZmlsZW5hbWUpXG4vLyBBZGFwdGVyIGNsYXNzZXMgc2hvdWxkIGltcGxlbWVudCB0aGUgZm9sbG93aW5nIGZ1bmN0aW9uczpcbi8vICogdmFsaWRhdGVGaWxlbmFtZShmaWxlbmFtZSlcbi8vICogaGFuZGxlRmlsZVN0cmVhbShmaWxlbmFtZSwgcmVxLCByZXMsIGNvbnRlbnRUeXBlKVxuLy9cbi8vIERlZmF1bHQgaXMgR3JpZEZTQnVja2V0QWRhcHRlciwgd2hpY2ggcmVxdWlyZXMgbW9uZ29cbi8vIGFuZCBmb3IgdGhlIEFQSSBzZXJ2ZXIgdG8gYmUgdXNpbmcgdGhlIERhdGFiYXNlQ29udHJvbGxlciB3aXRoIE1vbmdvXG4vLyBkYXRhYmFzZSBhZGFwdGVyLlxuXG5pbXBvcnQgdHlwZSB7IENvbmZpZyB9IGZyb20gJy4uLy4uL0NvbmZpZyc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG4vKipcbiAqIEBtb2R1bGUgQWRhcHRlcnNcbiAqL1xuLyoqXG4gKiBAaW50ZXJmYWNlIEZpbGVzQWRhcHRlclxuICovXG5leHBvcnQgY2xhc3MgRmlsZXNBZGFwdGVyIHtcbiAgLyoqIFJlc3BvbnNpYmxlIGZvciBzdG9yaW5nIHRoZSBmaWxlIGluIG9yZGVyIHRvIGJlIHJldHJpZXZlZCBsYXRlciBieSBpdHMgZmlsZW5hbWVcbiAgICpcbiAgICogQHBhcmFtIHtzdHJpbmd9IGZpbGVuYW1lIC0gdGhlIGZpbGVuYW1lIHRvIHNhdmVcbiAgICogQHBhcmFtIHsqfSBkYXRhIC0gdGhlIGJ1ZmZlciBvZiBkYXRhIGZyb20gdGhlIGZpbGVcbiAgICogQHBhcmFtIHtzdHJpbmd9IGNvbnRlbnRUeXBlIC0gdGhlIHN1cHBvc2VkIGNvbnRlbnRUeXBlXG4gICAqIEBkaXNjdXNzaW9uIHRoZSBjb250ZW50VHlwZSBjYW4gYmUgdW5kZWZpbmVkIGlmIHRoZSBjb250cm9sbGVyIHdhcyBub3QgYWJsZSB0byBkZXRlcm1pbmUgaXRcbiAgICpcbiAgICogQHJldHVybiB7UHJvbWlzZX0gYSBwcm9taXNlIHRoYXQgc2hvdWxkIGZhaWwgaWYgdGhlIHN0b3JhZ2UgZGlkbid0IHN1Y2NlZWRcbiAgICovXG4gIGNyZWF0ZUZpbGUoZmlsZW5hbWU6IHN0cmluZywgZGF0YSwgY29udGVudFR5cGU6IHN0cmluZyk6IFByb21pc2Uge31cblxuICAvKiogUmVzcG9uc2libGUgZm9yIGRlbGV0aW5nIHRoZSBzcGVjaWZpZWQgZmlsZVxuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gZmlsZW5hbWUgLSB0aGUgZmlsZW5hbWUgdG8gZGVsZXRlXG4gICAqXG4gICAqIEByZXR1cm4ge1Byb21pc2V9IGEgcHJvbWlzZSB0aGF0IHNob3VsZCBmYWlsIGlmIHRoZSBkZWxldGlvbiBkaWRuJ3Qgc3VjY2VlZFxuICAgKi9cbiAgZGVsZXRlRmlsZShmaWxlbmFtZTogc3RyaW5nKTogUHJvbWlzZSB7fVxuXG4gIC8qKiBSZXNwb25zaWJsZSBmb3IgcmV0cmlldmluZyB0aGUgZGF0YSBvZiB0aGUgc3BlY2lmaWVkIGZpbGVcbiAgICpcbiAgICogQHBhcmFtIHtzdHJpbmd9IGZpbGVuYW1lIC0gdGhlIG5hbWUgb2YgZmlsZSB0byByZXRyaWV2ZVxuICAgKlxuICAgKiBAcmV0dXJuIHtQcm9taXNlfSBhIHByb21pc2UgdGhhdCBzaG91bGQgcGFzcyB3aXRoIHRoZSBmaWxlIGRhdGEgb3IgZmFpbCBvbiBlcnJvclxuICAgKi9cbiAgZ2V0RmlsZURhdGEoZmlsZW5hbWU6IHN0cmluZyk6IFByb21pc2U8YW55PiB7fVxuXG4gIC8qKiBSZXR1cm5zIGFuIGFic29sdXRlIFVSTCB3aGVyZSB0aGUgZmlsZSBjYW4gYmUgYWNjZXNzZWRcbiAgICpcbiAgICogQHBhcmFtIHtDb25maWd9IGNvbmZpZyAtIHNlcnZlciBjb25maWd1cmF0aW9uXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBmaWxlbmFtZVxuICAgKlxuICAgKiBAcmV0dXJuIHtzdHJpbmd9IEFic29sdXRlIFVSTFxuICAgKi9cbiAgZ2V0RmlsZUxvY2F0aW9uKGNvbmZpZzogQ29uZmlnLCBmaWxlbmFtZTogc3RyaW5nKTogc3RyaW5nIHt9XG5cbiAgLyoqIFZhbGlkYXRlIGEgZmlsZW5hbWUgZm9yIHRoaXMgYWRhcHRlciB0eXBlXG4gICAqXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBmaWxlbmFtZVxuICAgKlxuICAgKiBAcmV0dXJucyB7bnVsbHxQYXJzZS5FcnJvcn0gbnVsbCBpZiB0aGVyZSBhcmUgbm8gZXJyb3JzXG4gICAqL1xuICAvLyB2YWxpZGF0ZUZpbGVuYW1lKGZpbGVuYW1lOiBzdHJpbmcpOiA/UGFyc2UuRXJyb3Ige31cblxuICAvKiogSGFuZGxlcyBCeXRlLVJhbmdlIFJlcXVlc3RzIGZvciBTdHJlYW1pbmdcbiAgICpcbiAgICogQHBhcmFtIHtzdHJpbmd9IGZpbGVuYW1lXG4gICAqIEBwYXJhbSB7b2JqZWN0fSByZXFcbiAgICogQHBhcmFtIHtvYmplY3R9IHJlc1xuICAgKiBAcGFyYW0ge3N0cmluZ30gY29udGVudFR5cGVcbiAgICpcbiAgICogQHJldHVybnMge1Byb21pc2V9IERhdGEgZm9yIGJ5dGUgcmFuZ2VcbiAgICovXG4gIC8vIGhhbmRsZUZpbGVTdHJlYW0oZmlsZW5hbWU6IHN0cmluZywgcmVzOiBhbnksIHJlcTogYW55LCBjb250ZW50VHlwZTogc3RyaW5nKTogUHJvbWlzZVxufVxuXG4vKipcbiAqIFNpbXBsZSBmaWxlbmFtZSB2YWxpZGF0aW9uXG4gKlxuICogQHBhcmFtIGZpbGVuYW1lXG4gKiBAcmV0dXJucyB7bnVsbHxQYXJzZS5FcnJvcn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlRmlsZW5hbWUoZmlsZW5hbWUpOiA/UGFyc2UuRXJyb3Ige1xuICBpZiAoZmlsZW5hbWUubGVuZ3RoID4gMTI4KSB7XG4gICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0ZJTEVfTkFNRSwgJ0ZpbGVuYW1lIHRvbyBsb25nLicpO1xuICB9XG5cbiAgY29uc3QgcmVneCA9IC9eW19hLXpBLVowLTldW2EtekEtWjAtOUAuIH5fLV0qJC87XG4gIGlmICghZmlsZW5hbWUubWF0Y2gocmVneCkpIHtcbiAgICByZXR1cm4gbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9GSUxFX05BTUUsXG4gICAgICAnRmlsZW5hbWUgY29udGFpbnMgaW52YWxpZCBjaGFyYWN0ZXJzLidcbiAgICApO1xuICB9XG4gIHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgZGVmYXVsdCBGaWxlc0FkYXB0ZXI7XG4iXX0=