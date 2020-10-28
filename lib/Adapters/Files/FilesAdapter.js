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

  /** Responsible for retrieving metadata and tags
   *
   * @param {string} filename - the filename to retrieve metadata
   *
   * @return {Promise} a promise that should pass with metadata
   */
  // getMetadata(filename: string): Promise<any> {}


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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9GaWxlcy9GaWxlc0FkYXB0ZXIuanMiXSwibmFtZXMiOlsiRmlsZXNBZGFwdGVyIiwiY3JlYXRlRmlsZSIsImZpbGVuYW1lIiwiZGF0YSIsImNvbnRlbnRUeXBlIiwib3B0aW9ucyIsImRlbGV0ZUZpbGUiLCJnZXRGaWxlRGF0YSIsImdldEZpbGVMb2NhdGlvbiIsImNvbmZpZyIsInZhbGlkYXRlRmlsZW5hbWUiLCJsZW5ndGgiLCJQYXJzZSIsIkVycm9yIiwiSU5WQUxJRF9GSUxFX05BTUUiLCJyZWd4IiwibWF0Y2giXSwibWFwcGluZ3MiOiI7Ozs7Ozs7O0FBbUJBOzs7O0FBbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBSUE7Ozs7QUFHQTs7O0FBR08sTUFBTUEsWUFBTixDQUFtQjtBQUN4Qjs7Ozs7Ozs7Ozs7OztBQWFBQyxFQUFBQSxVQUFVLENBQ1JDLFFBRFEsRUFFUkMsSUFGUSxFQUdSQyxXQUhRLEVBSVJDLE9BSlEsRUFLQyxDQUFFO0FBRWI7Ozs7Ozs7O0FBTUFDLEVBQUFBLFVBQVUsQ0FBQ0osUUFBRCxFQUE0QixDQUFFO0FBRXhDOzs7Ozs7OztBQU1BSyxFQUFBQSxXQUFXLENBQUNMLFFBQUQsRUFBaUMsQ0FBRTtBQUU5Qzs7Ozs7Ozs7O0FBT0FNLEVBQUFBLGVBQWUsQ0FBQ0MsTUFBRCxFQUFpQlAsUUFBakIsRUFBMkMsQ0FBRTtBQUU1RDs7Ozs7O0FBTUE7O0FBRUE7Ozs7Ozs7OztBQVNBOztBQUVBOzs7Ozs7QUFNQTs7O0FBdkV3QjtBQTBFMUI7Ozs7Ozs7Ozs7QUFNTyxTQUFTUSxnQkFBVCxDQUEwQlIsUUFBMUIsRUFBa0Q7QUFDdkQsTUFBSUEsUUFBUSxDQUFDUyxNQUFULEdBQWtCLEdBQXRCLEVBQTJCO0FBQ3pCLFdBQU8sSUFBSUMsY0FBTUMsS0FBVixDQUFnQkQsY0FBTUMsS0FBTixDQUFZQyxpQkFBNUIsRUFBK0Msb0JBQS9DLENBQVA7QUFDRDs7QUFFRCxRQUFNQyxJQUFJLEdBQUcsa0NBQWI7O0FBQ0EsTUFBSSxDQUFDYixRQUFRLENBQUNjLEtBQVQsQ0FBZUQsSUFBZixDQUFMLEVBQTJCO0FBQ3pCLFdBQU8sSUFBSUgsY0FBTUMsS0FBVixDQUNMRCxjQUFNQyxLQUFOLENBQVlDLGlCQURQLEVBRUwsdUNBRkssQ0FBUDtBQUlEOztBQUNELFNBQU8sSUFBUDtBQUNEOztlQUVjZCxZIiwic291cmNlc0NvbnRlbnQiOlsiLyplc2xpbnQgbm8tdW51c2VkLXZhcnM6IFwib2ZmXCIqL1xuLy8gRmlsZXMgQWRhcHRlclxuLy9cbi8vIEFsbG93cyB5b3UgdG8gY2hhbmdlIHRoZSBmaWxlIHN0b3JhZ2UgbWVjaGFuaXNtLlxuLy9cbi8vIEFkYXB0ZXIgY2xhc3NlcyBtdXN0IGltcGxlbWVudCB0aGUgZm9sbG93aW5nIGZ1bmN0aW9uczpcbi8vICogY3JlYXRlRmlsZShmaWxlbmFtZSwgZGF0YSwgY29udGVudFR5cGUpXG4vLyAqIGRlbGV0ZUZpbGUoZmlsZW5hbWUpXG4vLyAqIGdldEZpbGVEYXRhKGZpbGVuYW1lKVxuLy8gKiBnZXRGaWxlTG9jYXRpb24oY29uZmlnLCBmaWxlbmFtZSlcbi8vIEFkYXB0ZXIgY2xhc3NlcyBzaG91bGQgaW1wbGVtZW50IHRoZSBmb2xsb3dpbmcgZnVuY3Rpb25zOlxuLy8gKiB2YWxpZGF0ZUZpbGVuYW1lKGZpbGVuYW1lKVxuLy8gKiBoYW5kbGVGaWxlU3RyZWFtKGZpbGVuYW1lLCByZXEsIHJlcywgY29udGVudFR5cGUpXG4vL1xuLy8gRGVmYXVsdCBpcyBHcmlkRlNCdWNrZXRBZGFwdGVyLCB3aGljaCByZXF1aXJlcyBtb25nb1xuLy8gYW5kIGZvciB0aGUgQVBJIHNlcnZlciB0byBiZSB1c2luZyB0aGUgRGF0YWJhc2VDb250cm9sbGVyIHdpdGggTW9uZ29cbi8vIGRhdGFiYXNlIGFkYXB0ZXIuXG5cbmltcG9ydCB0eXBlIHsgQ29uZmlnIH0gZnJvbSAnLi4vLi4vQ29uZmlnJztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbi8qKlxuICogQG1vZHVsZSBBZGFwdGVyc1xuICovXG4vKipcbiAqIEBpbnRlcmZhY2UgRmlsZXNBZGFwdGVyXG4gKi9cbmV4cG9ydCBjbGFzcyBGaWxlc0FkYXB0ZXIge1xuICAvKiogUmVzcG9uc2libGUgZm9yIHN0b3JpbmcgdGhlIGZpbGUgaW4gb3JkZXIgdG8gYmUgcmV0cmlldmVkIGxhdGVyIGJ5IGl0cyBmaWxlbmFtZVxuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gZmlsZW5hbWUgLSB0aGUgZmlsZW5hbWUgdG8gc2F2ZVxuICAgKiBAcGFyYW0geyp9IGRhdGEgLSB0aGUgYnVmZmVyIG9mIGRhdGEgZnJvbSB0aGUgZmlsZVxuICAgKiBAcGFyYW0ge3N0cmluZ30gY29udGVudFR5cGUgLSB0aGUgc3VwcG9zZWQgY29udGVudFR5cGVcbiAgICogQGRpc2N1c3Npb24gdGhlIGNvbnRlbnRUeXBlIGNhbiBiZSB1bmRlZmluZWQgaWYgdGhlIGNvbnRyb2xsZXIgd2FzIG5vdCBhYmxlIHRvIGRldGVybWluZSBpdFxuICAgKiBAcGFyYW0ge29iamVjdH0gb3B0aW9ucyAtIChPcHRpb25hbCkgb3B0aW9ucyB0byBiZSBwYXNzZWQgdG8gZmlsZSBhZGFwdGVyIChTMyBGaWxlIEFkYXB0ZXIgT25seSlcbiAgICogLSB0YWdzOiBvYmplY3QgY29udGFpbmluZyBrZXkgdmFsdWUgcGFpcnMgdGhhdCB3aWxsIGJlIHN0b3JlZCB3aXRoIGZpbGVcbiAgICogLSBtZXRhZGF0YTogb2JqZWN0IGNvbnRhaW5pbmcga2V5IHZhbHVlIHBhaXJzIHRoYXQgd2lsbCBiZSBzb3RyZWQgd2l0aCBmaWxlIChodHRwczovL2RvY3MuYXdzLmFtYXpvbi5jb20vQW1hem9uUzMvbGF0ZXN0L3VzZXItZ3VpZGUvYWRkLW9iamVjdC1tZXRhZGF0YS5odG1sKVxuICAgKiBAZGlzY3Vzc2lvbiBvcHRpb25zIGFyZSBub3Qgc3VwcG9ydGVkIGJ5IGFsbCBmaWxlIGFkYXB0ZXJzLiBDaGVjayB0aGUgeW91ciBhZGFwdGVyJ3MgZG9jdW1lbnRhdGlvbiBmb3IgY29tcGF0aWJpbGl0eVxuICAgKlxuICAgKiBAcmV0dXJuIHtQcm9taXNlfSBhIHByb21pc2UgdGhhdCBzaG91bGQgZmFpbCBpZiB0aGUgc3RvcmFnZSBkaWRuJ3Qgc3VjY2VlZFxuICAgKi9cbiAgY3JlYXRlRmlsZShcbiAgICBmaWxlbmFtZTogc3RyaW5nLFxuICAgIGRhdGEsXG4gICAgY29udGVudFR5cGU6IHN0cmluZyxcbiAgICBvcHRpb25zOiBPYmplY3RcbiAgKTogUHJvbWlzZSB7fVxuXG4gIC8qKiBSZXNwb25zaWJsZSBmb3IgZGVsZXRpbmcgdGhlIHNwZWNpZmllZCBmaWxlXG4gICAqXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBmaWxlbmFtZSAtIHRoZSBmaWxlbmFtZSB0byBkZWxldGVcbiAgICpcbiAgICogQHJldHVybiB7UHJvbWlzZX0gYSBwcm9taXNlIHRoYXQgc2hvdWxkIGZhaWwgaWYgdGhlIGRlbGV0aW9uIGRpZG4ndCBzdWNjZWVkXG4gICAqL1xuICBkZWxldGVGaWxlKGZpbGVuYW1lOiBzdHJpbmcpOiBQcm9taXNlIHt9XG5cbiAgLyoqIFJlc3BvbnNpYmxlIGZvciByZXRyaWV2aW5nIHRoZSBkYXRhIG9mIHRoZSBzcGVjaWZpZWQgZmlsZVxuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gZmlsZW5hbWUgLSB0aGUgbmFtZSBvZiBmaWxlIHRvIHJldHJpZXZlXG4gICAqXG4gICAqIEByZXR1cm4ge1Byb21pc2V9IGEgcHJvbWlzZSB0aGF0IHNob3VsZCBwYXNzIHdpdGggdGhlIGZpbGUgZGF0YSBvciBmYWlsIG9uIGVycm9yXG4gICAqL1xuICBnZXRGaWxlRGF0YShmaWxlbmFtZTogc3RyaW5nKTogUHJvbWlzZTxhbnk+IHt9XG5cbiAgLyoqIFJldHVybnMgYW4gYWJzb2x1dGUgVVJMIHdoZXJlIHRoZSBmaWxlIGNhbiBiZSBhY2Nlc3NlZFxuICAgKlxuICAgKiBAcGFyYW0ge0NvbmZpZ30gY29uZmlnIC0gc2VydmVyIGNvbmZpZ3VyYXRpb25cbiAgICogQHBhcmFtIHtzdHJpbmd9IGZpbGVuYW1lXG4gICAqXG4gICAqIEByZXR1cm4ge3N0cmluZ30gQWJzb2x1dGUgVVJMXG4gICAqL1xuICBnZXRGaWxlTG9jYXRpb24oY29uZmlnOiBDb25maWcsIGZpbGVuYW1lOiBzdHJpbmcpOiBzdHJpbmcge31cblxuICAvKiogVmFsaWRhdGUgYSBmaWxlbmFtZSBmb3IgdGhpcyBhZGFwdGVyIHR5cGVcbiAgICpcbiAgICogQHBhcmFtIHtzdHJpbmd9IGZpbGVuYW1lXG4gICAqXG4gICAqIEByZXR1cm5zIHtudWxsfFBhcnNlLkVycm9yfSBudWxsIGlmIHRoZXJlIGFyZSBubyBlcnJvcnNcbiAgICovXG4gIC8vIHZhbGlkYXRlRmlsZW5hbWUoZmlsZW5hbWU6IHN0cmluZyk6ID9QYXJzZS5FcnJvciB7fVxuXG4gIC8qKiBIYW5kbGVzIEJ5dGUtUmFuZ2UgUmVxdWVzdHMgZm9yIFN0cmVhbWluZ1xuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gZmlsZW5hbWVcbiAgICogQHBhcmFtIHtvYmplY3R9IHJlcVxuICAgKiBAcGFyYW0ge29iamVjdH0gcmVzXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBjb250ZW50VHlwZVxuICAgKlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gRGF0YSBmb3IgYnl0ZSByYW5nZVxuICAgKi9cbiAgLy8gaGFuZGxlRmlsZVN0cmVhbShmaWxlbmFtZTogc3RyaW5nLCByZXM6IGFueSwgcmVxOiBhbnksIGNvbnRlbnRUeXBlOiBzdHJpbmcpOiBQcm9taXNlXG5cbiAgLyoqIFJlc3BvbnNpYmxlIGZvciByZXRyaWV2aW5nIG1ldGFkYXRhIGFuZCB0YWdzXG4gICAqXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBmaWxlbmFtZSAtIHRoZSBmaWxlbmFtZSB0byByZXRyaWV2ZSBtZXRhZGF0YVxuICAgKlxuICAgKiBAcmV0dXJuIHtQcm9taXNlfSBhIHByb21pc2UgdGhhdCBzaG91bGQgcGFzcyB3aXRoIG1ldGFkYXRhXG4gICAqL1xuICAvLyBnZXRNZXRhZGF0YShmaWxlbmFtZTogc3RyaW5nKTogUHJvbWlzZTxhbnk+IHt9XG59XG5cbi8qKlxuICogU2ltcGxlIGZpbGVuYW1lIHZhbGlkYXRpb25cbiAqXG4gKiBAcGFyYW0gZmlsZW5hbWVcbiAqIEByZXR1cm5zIHtudWxsfFBhcnNlLkVycm9yfVxuICovXG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGVGaWxlbmFtZShmaWxlbmFtZSk6ID9QYXJzZS5FcnJvciB7XG4gIGlmIChmaWxlbmFtZS5sZW5ndGggPiAxMjgpIHtcbiAgICByZXR1cm4gbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfRklMRV9OQU1FLCAnRmlsZW5hbWUgdG9vIGxvbmcuJyk7XG4gIH1cblxuICBjb25zdCByZWd4ID0gL15bX2EtekEtWjAtOV1bYS16QS1aMC05QC4gfl8tXSokLztcbiAgaWYgKCFmaWxlbmFtZS5tYXRjaChyZWd4KSkge1xuICAgIHJldHVybiBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0ZJTEVfTkFNRSxcbiAgICAgICdGaWxlbmFtZSBjb250YWlucyBpbnZhbGlkIGNoYXJhY3RlcnMuJ1xuICAgICk7XG4gIH1cbiAgcmV0dXJuIG51bGw7XG59XG5cbmV4cG9ydCBkZWZhdWx0IEZpbGVzQWRhcHRlcjtcbiJdfQ==