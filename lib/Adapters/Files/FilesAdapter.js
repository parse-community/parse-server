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
   * @param {object} options - (Optional) options to be passed to file adapter (S3 File Adapter Only)
   * - tags: object containing key value pairs that will be stored with file
   * - metadata: object containing key value pairs that will be sotred with file (https://docs.aws.amazon.com/AmazonS3/latest/user-guide/add-object-metadata.html)
   * @discussion options are not supported by all file adapters. Check the your adapter's documentation for compatibility
   *
   * @return {Promise} a promise that should fail if the storage didn't succeed
   */
  createFile(filename, data, contentType, options) {}
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9GaWxlcy9GaWxlc0FkYXB0ZXIuanMiXSwibmFtZXMiOlsiRmlsZXNBZGFwdGVyIiwiY3JlYXRlRmlsZSIsImZpbGVuYW1lIiwiZGF0YSIsImNvbnRlbnRUeXBlIiwib3B0aW9ucyIsImRlbGV0ZUZpbGUiLCJnZXRGaWxlRGF0YSIsImdldEZpbGVMb2NhdGlvbiIsImNvbmZpZyIsInZhbGlkYXRlRmlsZW5hbWUiLCJsZW5ndGgiLCJQYXJzZSIsIkVycm9yIiwiSU5WQUxJRF9GSUxFX05BTUUiLCJyZWd4IiwibWF0Y2giXSwibWFwcGluZ3MiOiI7Ozs7Ozs7O0FBbUJBOzs7O0FBbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBSUE7Ozs7QUFHQTs7O0FBR08sTUFBTUEsWUFBTixDQUFtQjtBQUN4Qjs7Ozs7Ozs7Ozs7OztBQWFBQyxFQUFBQSxVQUFVLENBQ1JDLFFBRFEsRUFFUkMsSUFGUSxFQUdSQyxXQUhRLEVBSVJDLE9BSlEsRUFLQyxDQUFFO0FBRWI7Ozs7Ozs7O0FBTUFDLEVBQUFBLFVBQVUsQ0FBQ0osUUFBRCxFQUE0QixDQUFFO0FBRXhDOzs7Ozs7OztBQU1BSyxFQUFBQSxXQUFXLENBQUNMLFFBQUQsRUFBaUMsQ0FBRTtBQUU5Qzs7Ozs7Ozs7O0FBT0FNLEVBQUFBLGVBQWUsQ0FBQ0MsTUFBRCxFQUFpQlAsUUFBakIsRUFBMkMsQ0FBRTtBQUU1RDs7Ozs7O0FBTUE7O0FBRUE7Ozs7Ozs7OztBQVNBOzs7QUEvRHdCO0FBa0UxQjs7Ozs7Ozs7OztBQU1PLFNBQVNRLGdCQUFULENBQTBCUixRQUExQixFQUFrRDtBQUN2RCxNQUFJQSxRQUFRLENBQUNTLE1BQVQsR0FBa0IsR0FBdEIsRUFBMkI7QUFDekIsV0FBTyxJQUFJQyxjQUFNQyxLQUFWLENBQWdCRCxjQUFNQyxLQUFOLENBQVlDLGlCQUE1QixFQUErQyxvQkFBL0MsQ0FBUDtBQUNEOztBQUVELFFBQU1DLElBQUksR0FBRyxrQ0FBYjs7QUFDQSxNQUFJLENBQUNiLFFBQVEsQ0FBQ2MsS0FBVCxDQUFlRCxJQUFmLENBQUwsRUFBMkI7QUFDekIsV0FBTyxJQUFJSCxjQUFNQyxLQUFWLENBQ0xELGNBQU1DLEtBQU4sQ0FBWUMsaUJBRFAsRUFFTCx1Q0FGSyxDQUFQO0FBSUQ7O0FBQ0QsU0FBTyxJQUFQO0FBQ0Q7O2VBRWNkLFkiLCJzb3VyY2VzQ29udGVudCI6WyIvKmVzbGludCBuby11bnVzZWQtdmFyczogXCJvZmZcIiovXG4vLyBGaWxlcyBBZGFwdGVyXG4vL1xuLy8gQWxsb3dzIHlvdSB0byBjaGFuZ2UgdGhlIGZpbGUgc3RvcmFnZSBtZWNoYW5pc20uXG4vL1xuLy8gQWRhcHRlciBjbGFzc2VzIG11c3QgaW1wbGVtZW50IHRoZSBmb2xsb3dpbmcgZnVuY3Rpb25zOlxuLy8gKiBjcmVhdGVGaWxlKGZpbGVuYW1lLCBkYXRhLCBjb250ZW50VHlwZSlcbi8vICogZGVsZXRlRmlsZShmaWxlbmFtZSlcbi8vICogZ2V0RmlsZURhdGEoZmlsZW5hbWUpXG4vLyAqIGdldEZpbGVMb2NhdGlvbihjb25maWcsIGZpbGVuYW1lKVxuLy8gQWRhcHRlciBjbGFzc2VzIHNob3VsZCBpbXBsZW1lbnQgdGhlIGZvbGxvd2luZyBmdW5jdGlvbnM6XG4vLyAqIHZhbGlkYXRlRmlsZW5hbWUoZmlsZW5hbWUpXG4vLyAqIGhhbmRsZUZpbGVTdHJlYW0oZmlsZW5hbWUsIHJlcSwgcmVzLCBjb250ZW50VHlwZSlcbi8vXG4vLyBEZWZhdWx0IGlzIEdyaWRGU0J1Y2tldEFkYXB0ZXIsIHdoaWNoIHJlcXVpcmVzIG1vbmdvXG4vLyBhbmQgZm9yIHRoZSBBUEkgc2VydmVyIHRvIGJlIHVzaW5nIHRoZSBEYXRhYmFzZUNvbnRyb2xsZXIgd2l0aCBNb25nb1xuLy8gZGF0YWJhc2UgYWRhcHRlci5cblxuaW1wb3J0IHR5cGUgeyBDb25maWcgfSBmcm9tICcuLi8uLi9Db25maWcnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuLyoqXG4gKiBAbW9kdWxlIEFkYXB0ZXJzXG4gKi9cbi8qKlxuICogQGludGVyZmFjZSBGaWxlc0FkYXB0ZXJcbiAqL1xuZXhwb3J0IGNsYXNzIEZpbGVzQWRhcHRlciB7XG4gIC8qKiBSZXNwb25zaWJsZSBmb3Igc3RvcmluZyB0aGUgZmlsZSBpbiBvcmRlciB0byBiZSByZXRyaWV2ZWQgbGF0ZXIgYnkgaXRzIGZpbGVuYW1lXG4gICAqXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBmaWxlbmFtZSAtIHRoZSBmaWxlbmFtZSB0byBzYXZlXG4gICAqIEBwYXJhbSB7Kn0gZGF0YSAtIHRoZSBidWZmZXIgb2YgZGF0YSBmcm9tIHRoZSBmaWxlXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBjb250ZW50VHlwZSAtIHRoZSBzdXBwb3NlZCBjb250ZW50VHlwZVxuICAgKiBAZGlzY3Vzc2lvbiB0aGUgY29udGVudFR5cGUgY2FuIGJlIHVuZGVmaW5lZCBpZiB0aGUgY29udHJvbGxlciB3YXMgbm90IGFibGUgdG8gZGV0ZXJtaW5lIGl0XG4gICAqIEBwYXJhbSB7b2JqZWN0fSBvcHRpb25zIC0gKE9wdGlvbmFsKSBvcHRpb25zIHRvIGJlIHBhc3NlZCB0byBmaWxlIGFkYXB0ZXIgKFMzIEZpbGUgQWRhcHRlciBPbmx5KVxuICAgKiAtIHRhZ3M6IG9iamVjdCBjb250YWluaW5nIGtleSB2YWx1ZSBwYWlycyB0aGF0IHdpbGwgYmUgc3RvcmVkIHdpdGggZmlsZVxuICAgKiAtIG1ldGFkYXRhOiBvYmplY3QgY29udGFpbmluZyBrZXkgdmFsdWUgcGFpcnMgdGhhdCB3aWxsIGJlIHNvdHJlZCB3aXRoIGZpbGUgKGh0dHBzOi8vZG9jcy5hd3MuYW1hem9uLmNvbS9BbWF6b25TMy9sYXRlc3QvdXNlci1ndWlkZS9hZGQtb2JqZWN0LW1ldGFkYXRhLmh0bWwpXG4gICAqIEBkaXNjdXNzaW9uIG9wdGlvbnMgYXJlIG5vdCBzdXBwb3J0ZWQgYnkgYWxsIGZpbGUgYWRhcHRlcnMuIENoZWNrIHRoZSB5b3VyIGFkYXB0ZXIncyBkb2N1bWVudGF0aW9uIGZvciBjb21wYXRpYmlsaXR5XG4gICAqXG4gICAqIEByZXR1cm4ge1Byb21pc2V9IGEgcHJvbWlzZSB0aGF0IHNob3VsZCBmYWlsIGlmIHRoZSBzdG9yYWdlIGRpZG4ndCBzdWNjZWVkXG4gICAqL1xuICBjcmVhdGVGaWxlKFxuICAgIGZpbGVuYW1lOiBzdHJpbmcsXG4gICAgZGF0YSxcbiAgICBjb250ZW50VHlwZTogc3RyaW5nLFxuICAgIG9wdGlvbnM6IE9iamVjdFxuICApOiBQcm9taXNlIHt9XG5cbiAgLyoqIFJlc3BvbnNpYmxlIGZvciBkZWxldGluZyB0aGUgc3BlY2lmaWVkIGZpbGVcbiAgICpcbiAgICogQHBhcmFtIHtzdHJpbmd9IGZpbGVuYW1lIC0gdGhlIGZpbGVuYW1lIHRvIGRlbGV0ZVxuICAgKlxuICAgKiBAcmV0dXJuIHtQcm9taXNlfSBhIHByb21pc2UgdGhhdCBzaG91bGQgZmFpbCBpZiB0aGUgZGVsZXRpb24gZGlkbid0IHN1Y2NlZWRcbiAgICovXG4gIGRlbGV0ZUZpbGUoZmlsZW5hbWU6IHN0cmluZyk6IFByb21pc2Uge31cblxuICAvKiogUmVzcG9uc2libGUgZm9yIHJldHJpZXZpbmcgdGhlIGRhdGEgb2YgdGhlIHNwZWNpZmllZCBmaWxlXG4gICAqXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBmaWxlbmFtZSAtIHRoZSBuYW1lIG9mIGZpbGUgdG8gcmV0cmlldmVcbiAgICpcbiAgICogQHJldHVybiB7UHJvbWlzZX0gYSBwcm9taXNlIHRoYXQgc2hvdWxkIHBhc3Mgd2l0aCB0aGUgZmlsZSBkYXRhIG9yIGZhaWwgb24gZXJyb3JcbiAgICovXG4gIGdldEZpbGVEYXRhKGZpbGVuYW1lOiBzdHJpbmcpOiBQcm9taXNlPGFueT4ge31cblxuICAvKiogUmV0dXJucyBhbiBhYnNvbHV0ZSBVUkwgd2hlcmUgdGhlIGZpbGUgY2FuIGJlIGFjY2Vzc2VkXG4gICAqXG4gICAqIEBwYXJhbSB7Q29uZmlnfSBjb25maWcgLSBzZXJ2ZXIgY29uZmlndXJhdGlvblxuICAgKiBAcGFyYW0ge3N0cmluZ30gZmlsZW5hbWVcbiAgICpcbiAgICogQHJldHVybiB7c3RyaW5nfSBBYnNvbHV0ZSBVUkxcbiAgICovXG4gIGdldEZpbGVMb2NhdGlvbihjb25maWc6IENvbmZpZywgZmlsZW5hbWU6IHN0cmluZyk6IHN0cmluZyB7fVxuXG4gIC8qKiBWYWxpZGF0ZSBhIGZpbGVuYW1lIGZvciB0aGlzIGFkYXB0ZXIgdHlwZVxuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gZmlsZW5hbWVcbiAgICpcbiAgICogQHJldHVybnMge251bGx8UGFyc2UuRXJyb3J9IG51bGwgaWYgdGhlcmUgYXJlIG5vIGVycm9yc1xuICAgKi9cbiAgLy8gdmFsaWRhdGVGaWxlbmFtZShmaWxlbmFtZTogc3RyaW5nKTogP1BhcnNlLkVycm9yIHt9XG5cbiAgLyoqIEhhbmRsZXMgQnl0ZS1SYW5nZSBSZXF1ZXN0cyBmb3IgU3RyZWFtaW5nXG4gICAqXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBmaWxlbmFtZVxuICAgKiBAcGFyYW0ge29iamVjdH0gcmVxXG4gICAqIEBwYXJhbSB7b2JqZWN0fSByZXNcbiAgICogQHBhcmFtIHtzdHJpbmd9IGNvbnRlbnRUeXBlXG4gICAqXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBEYXRhIGZvciBieXRlIHJhbmdlXG4gICAqL1xuICAvLyBoYW5kbGVGaWxlU3RyZWFtKGZpbGVuYW1lOiBzdHJpbmcsIHJlczogYW55LCByZXE6IGFueSwgY29udGVudFR5cGU6IHN0cmluZyk6IFByb21pc2Vcbn1cblxuLyoqXG4gKiBTaW1wbGUgZmlsZW5hbWUgdmFsaWRhdGlvblxuICpcbiAqIEBwYXJhbSBmaWxlbmFtZVxuICogQHJldHVybnMge251bGx8UGFyc2UuRXJyb3J9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB2YWxpZGF0ZUZpbGVuYW1lKGZpbGVuYW1lKTogP1BhcnNlLkVycm9yIHtcbiAgaWYgKGZpbGVuYW1lLmxlbmd0aCA+IDEyOCkge1xuICAgIHJldHVybiBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9GSUxFX05BTUUsICdGaWxlbmFtZSB0b28gbG9uZy4nKTtcbiAgfVxuXG4gIGNvbnN0IHJlZ3ggPSAvXltfYS16QS1aMC05XVthLXpBLVowLTlALiB+Xy1dKiQvO1xuICBpZiAoIWZpbGVuYW1lLm1hdGNoKHJlZ3gpKSB7XG4gICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfRklMRV9OQU1FLFxuICAgICAgJ0ZpbGVuYW1lIGNvbnRhaW5zIGludmFsaWQgY2hhcmFjdGVycy4nXG4gICAgKTtcbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGRlZmF1bHQgRmlsZXNBZGFwdGVyO1xuIl19