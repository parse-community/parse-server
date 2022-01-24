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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9GaWxlcy9GaWxlc0FkYXB0ZXIuanMiXSwibmFtZXMiOlsiRmlsZXNBZGFwdGVyIiwiY3JlYXRlRmlsZSIsImZpbGVuYW1lIiwiZGF0YSIsImNvbnRlbnRUeXBlIiwib3B0aW9ucyIsImRlbGV0ZUZpbGUiLCJnZXRGaWxlRGF0YSIsImdldEZpbGVMb2NhdGlvbiIsImNvbmZpZyIsInZhbGlkYXRlRmlsZW5hbWUiLCJsZW5ndGgiLCJQYXJzZSIsIkVycm9yIiwiSU5WQUxJRF9GSUxFX05BTUUiLCJyZWd4IiwibWF0Y2giXSwibWFwcGluZ3MiOiI7Ozs7Ozs7O0FBbUJBOzs7O0FBbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBSUE7QUFDQTtBQUNBOztBQUNBO0FBQ0E7QUFDQTtBQUNPLE1BQU1BLFlBQU4sQ0FBbUI7QUFDeEI7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDRUMsRUFBQUEsVUFBVSxDQUFDQyxRQUFELEVBQW1CQyxJQUFuQixFQUF5QkMsV0FBekIsRUFBOENDLE9BQTlDLEVBQXdFLENBQUU7QUFFcEY7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUFDRUMsRUFBQUEsVUFBVSxDQUFDSixRQUFELEVBQTRCLENBQUU7QUFFeEM7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUFDRUssRUFBQUEsV0FBVyxDQUFDTCxRQUFELEVBQWlDLENBQUU7QUFFOUM7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQUNFTSxFQUFBQSxlQUFlLENBQUNDLE1BQUQsRUFBaUJQLFFBQWpCLEVBQTJDLENBQUU7QUFFNUQ7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0U7O0FBRUE7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0U7O0FBRUE7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0U7OztBQWxFd0I7QUFxRTFCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7QUFDTyxTQUFTUSxnQkFBVCxDQUEwQlIsUUFBMUIsRUFBa0Q7QUFDdkQsTUFBSUEsUUFBUSxDQUFDUyxNQUFULEdBQWtCLEdBQXRCLEVBQTJCO0FBQ3pCLFdBQU8sSUFBSUMsY0FBTUMsS0FBVixDQUFnQkQsY0FBTUMsS0FBTixDQUFZQyxpQkFBNUIsRUFBK0Msb0JBQS9DLENBQVA7QUFDRDs7QUFFRCxRQUFNQyxJQUFJLEdBQUcsa0NBQWI7O0FBQ0EsTUFBSSxDQUFDYixRQUFRLENBQUNjLEtBQVQsQ0FBZUQsSUFBZixDQUFMLEVBQTJCO0FBQ3pCLFdBQU8sSUFBSUgsY0FBTUMsS0FBVixDQUFnQkQsY0FBTUMsS0FBTixDQUFZQyxpQkFBNUIsRUFBK0MsdUNBQS9DLENBQVA7QUFDRDs7QUFDRCxTQUFPLElBQVA7QUFDRDs7ZUFFY2QsWSIsInNvdXJjZXNDb250ZW50IjpbIi8qZXNsaW50IG5vLXVudXNlZC12YXJzOiBcIm9mZlwiKi9cbi8vIEZpbGVzIEFkYXB0ZXJcbi8vXG4vLyBBbGxvd3MgeW91IHRvIGNoYW5nZSB0aGUgZmlsZSBzdG9yYWdlIG1lY2hhbmlzbS5cbi8vXG4vLyBBZGFwdGVyIGNsYXNzZXMgbXVzdCBpbXBsZW1lbnQgdGhlIGZvbGxvd2luZyBmdW5jdGlvbnM6XG4vLyAqIGNyZWF0ZUZpbGUoZmlsZW5hbWUsIGRhdGEsIGNvbnRlbnRUeXBlKVxuLy8gKiBkZWxldGVGaWxlKGZpbGVuYW1lKVxuLy8gKiBnZXRGaWxlRGF0YShmaWxlbmFtZSlcbi8vICogZ2V0RmlsZUxvY2F0aW9uKGNvbmZpZywgZmlsZW5hbWUpXG4vLyBBZGFwdGVyIGNsYXNzZXMgc2hvdWxkIGltcGxlbWVudCB0aGUgZm9sbG93aW5nIGZ1bmN0aW9uczpcbi8vICogdmFsaWRhdGVGaWxlbmFtZShmaWxlbmFtZSlcbi8vICogaGFuZGxlRmlsZVN0cmVhbShmaWxlbmFtZSwgcmVxLCByZXMsIGNvbnRlbnRUeXBlKVxuLy9cbi8vIERlZmF1bHQgaXMgR3JpZEZTQnVja2V0QWRhcHRlciwgd2hpY2ggcmVxdWlyZXMgbW9uZ29cbi8vIGFuZCBmb3IgdGhlIEFQSSBzZXJ2ZXIgdG8gYmUgdXNpbmcgdGhlIERhdGFiYXNlQ29udHJvbGxlciB3aXRoIE1vbmdvXG4vLyBkYXRhYmFzZSBhZGFwdGVyLlxuXG5pbXBvcnQgdHlwZSB7IENvbmZpZyB9IGZyb20gJy4uLy4uL0NvbmZpZyc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG4vKipcbiAqIEBtb2R1bGUgQWRhcHRlcnNcbiAqL1xuLyoqXG4gKiBAaW50ZXJmYWNlIEZpbGVzQWRhcHRlclxuICovXG5leHBvcnQgY2xhc3MgRmlsZXNBZGFwdGVyIHtcbiAgLyoqIFJlc3BvbnNpYmxlIGZvciBzdG9yaW5nIHRoZSBmaWxlIGluIG9yZGVyIHRvIGJlIHJldHJpZXZlZCBsYXRlciBieSBpdHMgZmlsZW5hbWVcbiAgICpcbiAgICogQHBhcmFtIHtzdHJpbmd9IGZpbGVuYW1lIC0gdGhlIGZpbGVuYW1lIHRvIHNhdmVcbiAgICogQHBhcmFtIHsqfSBkYXRhIC0gdGhlIGJ1ZmZlciBvZiBkYXRhIGZyb20gdGhlIGZpbGVcbiAgICogQHBhcmFtIHtzdHJpbmd9IGNvbnRlbnRUeXBlIC0gdGhlIHN1cHBvc2VkIGNvbnRlbnRUeXBlXG4gICAqIEBkaXNjdXNzaW9uIHRoZSBjb250ZW50VHlwZSBjYW4gYmUgdW5kZWZpbmVkIGlmIHRoZSBjb250cm9sbGVyIHdhcyBub3QgYWJsZSB0byBkZXRlcm1pbmUgaXRcbiAgICogQHBhcmFtIHtvYmplY3R9IG9wdGlvbnMgLSAoT3B0aW9uYWwpIG9wdGlvbnMgdG8gYmUgcGFzc2VkIHRvIGZpbGUgYWRhcHRlciAoUzMgRmlsZSBBZGFwdGVyIE9ubHkpXG4gICAqIC0gdGFnczogb2JqZWN0IGNvbnRhaW5pbmcga2V5IHZhbHVlIHBhaXJzIHRoYXQgd2lsbCBiZSBzdG9yZWQgd2l0aCBmaWxlXG4gICAqIC0gbWV0YWRhdGE6IG9iamVjdCBjb250YWluaW5nIGtleSB2YWx1ZSBwYWlycyB0aGF0IHdpbGwgYmUgc290cmVkIHdpdGggZmlsZSAoaHR0cHM6Ly9kb2NzLmF3cy5hbWF6b24uY29tL0FtYXpvblMzL2xhdGVzdC91c2VyLWd1aWRlL2FkZC1vYmplY3QtbWV0YWRhdGEuaHRtbClcbiAgICogQGRpc2N1c3Npb24gb3B0aW9ucyBhcmUgbm90IHN1cHBvcnRlZCBieSBhbGwgZmlsZSBhZGFwdGVycy4gQ2hlY2sgdGhlIHlvdXIgYWRhcHRlcidzIGRvY3VtZW50YXRpb24gZm9yIGNvbXBhdGliaWxpdHlcbiAgICpcbiAgICogQHJldHVybiB7UHJvbWlzZX0gYSBwcm9taXNlIHRoYXQgc2hvdWxkIGZhaWwgaWYgdGhlIHN0b3JhZ2UgZGlkbid0IHN1Y2NlZWRcbiAgICovXG4gIGNyZWF0ZUZpbGUoZmlsZW5hbWU6IHN0cmluZywgZGF0YSwgY29udGVudFR5cGU6IHN0cmluZywgb3B0aW9uczogT2JqZWN0KTogUHJvbWlzZSB7fVxuXG4gIC8qKiBSZXNwb25zaWJsZSBmb3IgZGVsZXRpbmcgdGhlIHNwZWNpZmllZCBmaWxlXG4gICAqXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBmaWxlbmFtZSAtIHRoZSBmaWxlbmFtZSB0byBkZWxldGVcbiAgICpcbiAgICogQHJldHVybiB7UHJvbWlzZX0gYSBwcm9taXNlIHRoYXQgc2hvdWxkIGZhaWwgaWYgdGhlIGRlbGV0aW9uIGRpZG4ndCBzdWNjZWVkXG4gICAqL1xuICBkZWxldGVGaWxlKGZpbGVuYW1lOiBzdHJpbmcpOiBQcm9taXNlIHt9XG5cbiAgLyoqIFJlc3BvbnNpYmxlIGZvciByZXRyaWV2aW5nIHRoZSBkYXRhIG9mIHRoZSBzcGVjaWZpZWQgZmlsZVxuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gZmlsZW5hbWUgLSB0aGUgbmFtZSBvZiBmaWxlIHRvIHJldHJpZXZlXG4gICAqXG4gICAqIEByZXR1cm4ge1Byb21pc2V9IGEgcHJvbWlzZSB0aGF0IHNob3VsZCBwYXNzIHdpdGggdGhlIGZpbGUgZGF0YSBvciBmYWlsIG9uIGVycm9yXG4gICAqL1xuICBnZXRGaWxlRGF0YShmaWxlbmFtZTogc3RyaW5nKTogUHJvbWlzZTxhbnk+IHt9XG5cbiAgLyoqIFJldHVybnMgYW4gYWJzb2x1dGUgVVJMIHdoZXJlIHRoZSBmaWxlIGNhbiBiZSBhY2Nlc3NlZFxuICAgKlxuICAgKiBAcGFyYW0ge0NvbmZpZ30gY29uZmlnIC0gc2VydmVyIGNvbmZpZ3VyYXRpb25cbiAgICogQHBhcmFtIHtzdHJpbmd9IGZpbGVuYW1lXG4gICAqXG4gICAqIEByZXR1cm4ge3N0cmluZ30gQWJzb2x1dGUgVVJMXG4gICAqL1xuICBnZXRGaWxlTG9jYXRpb24oY29uZmlnOiBDb25maWcsIGZpbGVuYW1lOiBzdHJpbmcpOiBzdHJpbmcge31cblxuICAvKiogVmFsaWRhdGUgYSBmaWxlbmFtZSBmb3IgdGhpcyBhZGFwdGVyIHR5cGVcbiAgICpcbiAgICogQHBhcmFtIHtzdHJpbmd9IGZpbGVuYW1lXG4gICAqXG4gICAqIEByZXR1cm5zIHtudWxsfFBhcnNlLkVycm9yfSBudWxsIGlmIHRoZXJlIGFyZSBubyBlcnJvcnNcbiAgICovXG4gIC8vIHZhbGlkYXRlRmlsZW5hbWUoZmlsZW5hbWU6IHN0cmluZyk6ID9QYXJzZS5FcnJvciB7fVxuXG4gIC8qKiBIYW5kbGVzIEJ5dGUtUmFuZ2UgUmVxdWVzdHMgZm9yIFN0cmVhbWluZ1xuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gZmlsZW5hbWVcbiAgICogQHBhcmFtIHtvYmplY3R9IHJlcVxuICAgKiBAcGFyYW0ge29iamVjdH0gcmVzXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBjb250ZW50VHlwZVxuICAgKlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gRGF0YSBmb3IgYnl0ZSByYW5nZVxuICAgKi9cbiAgLy8gaGFuZGxlRmlsZVN0cmVhbShmaWxlbmFtZTogc3RyaW5nLCByZXM6IGFueSwgcmVxOiBhbnksIGNvbnRlbnRUeXBlOiBzdHJpbmcpOiBQcm9taXNlXG5cbiAgLyoqIFJlc3BvbnNpYmxlIGZvciByZXRyaWV2aW5nIG1ldGFkYXRhIGFuZCB0YWdzXG4gICAqXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBmaWxlbmFtZSAtIHRoZSBmaWxlbmFtZSB0byByZXRyaWV2ZSBtZXRhZGF0YVxuICAgKlxuICAgKiBAcmV0dXJuIHtQcm9taXNlfSBhIHByb21pc2UgdGhhdCBzaG91bGQgcGFzcyB3aXRoIG1ldGFkYXRhXG4gICAqL1xuICAvLyBnZXRNZXRhZGF0YShmaWxlbmFtZTogc3RyaW5nKTogUHJvbWlzZTxhbnk+IHt9XG59XG5cbi8qKlxuICogU2ltcGxlIGZpbGVuYW1lIHZhbGlkYXRpb25cbiAqXG4gKiBAcGFyYW0gZmlsZW5hbWVcbiAqIEByZXR1cm5zIHtudWxsfFBhcnNlLkVycm9yfVxuICovXG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGVGaWxlbmFtZShmaWxlbmFtZSk6ID9QYXJzZS5FcnJvciB7XG4gIGlmIChmaWxlbmFtZS5sZW5ndGggPiAxMjgpIHtcbiAgICByZXR1cm4gbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfRklMRV9OQU1FLCAnRmlsZW5hbWUgdG9vIGxvbmcuJyk7XG4gIH1cblxuICBjb25zdCByZWd4ID0gL15bX2EtekEtWjAtOV1bYS16QS1aMC05QC4gfl8tXSokLztcbiAgaWYgKCFmaWxlbmFtZS5tYXRjaChyZWd4KSkge1xuICAgIHJldHVybiBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9GSUxFX05BTUUsICdGaWxlbmFtZSBjb250YWlucyBpbnZhbGlkIGNoYXJhY3RlcnMuJyk7XG4gIH1cbiAgcmV0dXJuIG51bGw7XG59XG5cbmV4cG9ydCBkZWZhdWx0IEZpbGVzQWRhcHRlcjtcbiJdfQ==