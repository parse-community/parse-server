"use strict";

/**
 * utils.js
 * @file General purpose utilities
 * @description General purpose utilities.
 */
const path = require('path');

const fs = require('fs').promises;
/**
 * The general purpose utilities.
 */


class Utils {
  /**
   * @function getLocalizedPath
   * @description Returns a localized file path accoring to the locale.
   *
   * Localized files are searched in subfolders of a given path, e.g.
   *
   * root/
   * ├── base/                    // base path to files
   * │   ├── example.html         // default file
   * │   └── de/                  // de language folder
   * │   │   └── example.html     // de localized file
   * │   └── de-AT/               // de-AT locale folder
   * │   │   └── example.html     // de-AT localized file
   *
   * Files are matched with the locale in the following order:
   * 1. Locale match, e.g. locale `de-AT` matches file in folder `de-AT`.
   * 2. Language match, e.g. locale `de-AT` matches file in folder `de`.
   * 3. Default; file in base folder is returned.
   *
   * @param {String} defaultPath The absolute file path, which is also
   * the default path returned if localization is not available.
   * @param {String} locale The locale.
   * @returns {Promise<Object>} The object contains:
   * - `path`: The path to the localized file, or the original path if
   *   localization is not available.
   * - `subdir`: The subdirectory of the localized file, or undefined if
   *   there is no matching localized file.
   */
  static async getLocalizedPath(defaultPath, locale) {
    // Get file name and paths
    const file = path.basename(defaultPath);
    const basePath = path.dirname(defaultPath); // If locale is not set return default file

    if (!locale) {
      return {
        path: defaultPath
      };
    } // Check file for locale exists


    const localePath = path.join(basePath, locale, file);
    const localeFileExists = await Utils.fileExists(localePath); // If file for locale exists return file

    if (localeFileExists) {
      return {
        path: localePath,
        subdir: locale
      };
    } // Check file for language exists


    const language = locale.split('-')[0];
    const languagePath = path.join(basePath, language, file);
    const languageFileExists = await Utils.fileExists(languagePath); // If file for language exists return file

    if (languageFileExists) {
      return {
        path: languagePath,
        subdir: language
      };
    } // Return default file


    return {
      path: defaultPath
    };
  }
  /**
   * @function fileExists
   * @description Checks whether a file exists.
   * @param {String} path The file path.
   * @returns {Promise<Boolean>} Is true if the file can be accessed, false otherwise.
   */


  static async fileExists(path) {
    try {
      await fs.access(path);
      return true;
    } catch (e) {
      return false;
    }
  }
  /**
   * @function isPath
   * @description Evaluates whether a string is a file path (as opposed to a URL for example).
   * @param {String} s The string to evaluate.
   * @returns {Boolean} Returns true if the evaluated string is a path.
   */


  static isPath(s) {
    return /(^\/)|(^\.\/)|(^\.\.\/)/.test(s);
  }
  /**
   * Flattens an object and crates new keys with custom delimiters.
   * @param {Object} obj The object to flatten.
   * @param {String} [delimiter='.'] The delimiter of the newly generated keys.
   * @param {Object} result
   * @returns {Object} The flattened object.
   **/


  static flattenObject(obj, parentKey, delimiter = '.', result = {}) {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const newKey = parentKey ? parentKey + delimiter + key : key;

        if (typeof obj[key] === 'object' && obj[key] !== null) {
          this.flattenObject(obj[key], newKey, delimiter, result);
        } else {
          result[newKey] = obj[key];
        }
      }
    }

    return result;
  }

}

module.exports = Utils;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9VdGlscy5qcyJdLCJuYW1lcyI6WyJwYXRoIiwicmVxdWlyZSIsImZzIiwicHJvbWlzZXMiLCJVdGlscyIsImdldExvY2FsaXplZFBhdGgiLCJkZWZhdWx0UGF0aCIsImxvY2FsZSIsImZpbGUiLCJiYXNlbmFtZSIsImJhc2VQYXRoIiwiZGlybmFtZSIsImxvY2FsZVBhdGgiLCJqb2luIiwibG9jYWxlRmlsZUV4aXN0cyIsImZpbGVFeGlzdHMiLCJzdWJkaXIiLCJsYW5ndWFnZSIsInNwbGl0IiwibGFuZ3VhZ2VQYXRoIiwibGFuZ3VhZ2VGaWxlRXhpc3RzIiwiYWNjZXNzIiwiZSIsImlzUGF0aCIsInMiLCJ0ZXN0IiwiZmxhdHRlbk9iamVjdCIsIm9iaiIsInBhcmVudEtleSIsImRlbGltaXRlciIsInJlc3VsdCIsImtleSIsIk9iamVjdCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsIm5ld0tleSIsIm1vZHVsZSIsImV4cG9ydHMiXSwibWFwcGluZ3MiOiI7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBLE1BQU1BLElBQUksR0FBR0MsT0FBTyxDQUFDLE1BQUQsQ0FBcEI7O0FBQ0EsTUFBTUMsRUFBRSxHQUFHRCxPQUFPLENBQUMsSUFBRCxDQUFQLENBQWNFLFFBQXpCO0FBRUE7QUFDQTtBQUNBOzs7QUFDQSxNQUFNQyxLQUFOLENBQVk7QUFDVjtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNFLGVBQWFDLGdCQUFiLENBQThCQyxXQUE5QixFQUEyQ0MsTUFBM0MsRUFBbUQ7QUFDakQ7QUFDQSxVQUFNQyxJQUFJLEdBQUdSLElBQUksQ0FBQ1MsUUFBTCxDQUFjSCxXQUFkLENBQWI7QUFDQSxVQUFNSSxRQUFRLEdB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dXJjZXNDb250ZW50IjpbIi8qKlxuICogdXRpbHMuanNcbiAqIEBmaWxlIEdlbmVyYWwgcHVycG9zZSB1dGlsaXRpZXNcbiAqIEBkZXNjcmlwdGlvbiBHZW5lcmFsIHB1cnBvc2UgdXRpbGl0aWVzLlxuICovXG5cbmNvbnN0IHBhdGggPSByZXF1aXJlKCdwYXRoJyk7XG5jb25zdCBmcyA9IHJlcXVpcmUoJ2ZzJykucHJvbWlzZXM7XG5cbi8qKlxuICogVGhlIGdlbmVyYWwgcHVycG9zZSB1dGlsaXRpZXMuXG4gKi9cbmNsYXNzIFV0aWxzIHtcbiAgLyoqXG4gICAqIEBmdW5jdGlvbiBnZXRMb2NhbGl6ZWRQYXRoXG4gICAqIEBkZXNjcmlwdGlvbiBSZXR1cm5zIGEgbG9jYWxpemVkIGZpbGUgcGF0aCBhY2NvcmluZyB0byB0aGUgbG9jYWxlLlxuICAgKlxuICAgKiBMb2NhbGl6ZWQgZmlsZXMgYXJlIHNlYXJjaGVkIGluIHN1YmZvbGRlcnMgb2YgYSBnaXZlbiBwYXRoLCBlLmcuXG4gICAqXG4gICAqIHJvb3QvXG4gICAqIOKUnOKUgOKUgCBiYXNlLyAgICAgICAgICAgICAgICAgICAgLy8gYmFzZSBwYXRoIHRvIGZpbGVzXG4gICAqIOKUgiAgIOKUnOKUgOKUgCBleGFtcGxlLmh0bWwgICAgICAgICAvLyBkZWZhdWx0IGZpbGVcbiAgICog4pSCICAg4pSU4pSA4pSAIGRlLyAgICAgICAgICAgICAgICAgIC8vIGRlIGxhbmd1YWdlIGZvbGRlclxuICAgKiDilIIgICDilIIgICDilJTilIDilIAgZXhhbXBsZS5odG1sICAgICAvLyBkZSBsb2NhbGl6ZWQgZmlsZVxuICAgKiDilIIgICDilJTilIDilIAgZGUtQVQvICAgICAgICAgICAgICAgLy8gZGUtQVQgbG9jYWxlIGZvbGRlclxuICAgKiDilIIgICDilIIgICDilJTilIDilIAgZXhhbXBsZS5odG1sICAgICAvLyBkZS1BVCBsb2NhbGl6ZWQgZmlsZVxuICAgKlxuICAgKiBGaWxlcyBhcmUgbWF0Y2hlZCB3aXRoIHRoZSBsb2NhbGUgaW4gdGhlIGZvbGxvd2luZyBvcmRlcjpcbiAgICogMS4gTG9jYWxlIG1hdGNoLCBlLmcuIGxvY2FsZSBgZGUtQVRgIG1hdGNoZXMgZmlsZSBpbiBmb2xkZXIgYGRlLUFUYC5cbiAgICogMi4gTGFuZ3VhZ2UgbWF0Y2gsIGUuZy4gbG9jYWxlIGBkZS1BVGAgbWF0Y2hlcyBmaWxlIGluIGZvbGRlciBgZGVgLlxuICAgKiAzLiBEZWZhdWx0OyBmaWxlIGluIGJhc2UgZm9sZGVyIGlzIHJldHVybmVkLlxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gZGVmYXVsdFBhdGggVGhlIGFic29sdXRlIGZpbGUgcGF0aCwgd2hpY2ggaXMgYWxzb1xuICAgKiB0aGUgZGVmYXVsdCBwYXRoIHJldHVybmVkIGlmIGxvY2FsaXphdGlvbiBpcyBub3QgYXZhaWxhYmxlLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gbG9jYWxlIFRoZSBsb2NhbGUuXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPE9iamVjdD59IFRoZSBvYmplY3QgY29udGFpbnM6XG4gICAqIC0gYHBhdGhgOiBUaGUgcGF0aCB0byB0aGUgbG9jYWxpemVkIGZpbGUsIG9yIHRoZSBvcmlnaW5hbCBwYXRoIGlmXG4gICAqICAgbG9jYWxpemF0aW9uIGlzIG5vdCBhdmFpbGFibGUuXG4gICAqIC0gYHN1YmRpcmA6IFRoZSBzdWJkaXJlY3Rvcnkgb2YgdGhlIGxvY2FsaXplZCBmaWxlLCBvciB1bmRlZmluZWQgaWZcbiAgICogICB0aGVyZSBpcyBubyBtYXRjaGluZyBsb2NhbGl6ZWQgZmlsZS5cbiAgICovXG4gIHN0YXRpYyBhc3luYyBnZXRMb2NhbGl6ZWRQYXRoKGRlZmF1bHRQYXRoLCBsb2NhbGUpIHtcbiAgICAvLyBHZXQgZmlsZSBuYW1lIGFuZCBwYXRoc1xuICAgIGNvbnN0IGZpbGUgPSBwYXRoLmJhc2VuYW1lKGRlZmF1bHRQYXRoKTtcbiAgICBjb25zdCBiYXNlUGF0aCA9IHBhdGguZGlybmFtZShkZWZhdWx0UGF0aCk7XG5cbiAgICAvLyBJZiBsb2NhbGUgaXMgbm90IHNldCByZXR1cm4gZGVmYXVsdCBmaWxlXG4gICAgaWYgKCFsb2NhbGUpIHtcbiAgICAgIHJldHVybiB7IHBhdGg6IGRlZmF1bHRQYXRoIH07XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgZmlsZSBmb3IgbG9jYWxlIGV4aXN0c1xuICAgIGNvbnN0IGxvY2FsZVBhdGggPSBwYXRoLmpvaW4oYmFzZVBhdGgsIGxvY2FsZSwgZmlsZSk7XG4gICAgY29uc3QgbG9jYWxlRmlsZUV4aXN0cyA9IGF3YWl0IFV0aWxzLmZpbGVFeGlzdHMobG9jYWxlUGF0aCk7XG5cbiAgICAvLyBJZiBmaWxlIGZvciBsb2NhbGUgZXhpc3RzIHJldHVybiBmaWxlXG4gICAgaWYgKGxvY2FsZUZpbGVFeGlzdHMpIHtcbiAgICAgIHJldHVybiB7IHBhdGg6IGxvY2FsZVBhdGgsIHN1YmRpcjogbG9jYWxlIH07XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgZmlsZSBmb3IgbGFuZ3VhZ2UgZXhpc3RzXG4gICAgY29uc3QgbGFuZ3VhZ2UgPSBsb2NhbGUuc3BsaXQoJy0nKVswXTtcbiAgICBjb25zdCBsYW5ndWFnZVBhdGggPSBwYXRoLmpvaW4oYmFzZVBhdGgsIGxhbmd1YWdlLCBmaWxlKTtcbiAgICBjb25zdCBsYW5ndWFnZUZpbGVFeGlzdHMgPSBhd2FpdCBVdGlscy5maWxlRXhpc3RzKGxhbmd1YWdlUGF0aCk7XG5cbiAgICAvLyBJZiBmaWxlIGZvciBsYW5ndWFnZSBleGlzdHMgcmV0dXJuIGZpbGVcbiAgICBpZiAobGFuZ3VhZ2VGaWxlRXhpc3RzKSB7XG4gICAgICByZXR1cm4geyBwYXRoOiBsYW5ndWFnZVBhdGgsIHN1YmRpcjogbGFuZ3VhZ2UgfTtcbiAgICB9XG5cbiAgICAvLyBSZXR1cm4gZGVmYXVsdCBmaWxlXG4gICAgcmV0dXJuIHsgcGF0aDogZGVmYXVsdFBhdGggfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBAZnVuY3Rpb24gZmlsZUV4aXN0c1xuICAgKiBAZGVzY3JpcHRpb24gQ2hlY2tzIHdoZXRoZXIgYSBmaWxlIGV4aXN0cy5cbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIGZpbGUgcGF0aC5cbiAgICogQHJldHVybnMge1Byb21pc2U8Qm9vbGVhbj59IElzIHRydWUgaWYgdGhlIGZpbGUgY2FuIGJlIGFjY2Vzc2VkLCBmYWxzZSBvdGhlcndpc2UuXG4gICAqL1xuICBzdGF0aWMgYXN5bmMgZmlsZUV4aXN0cyhwYXRoKSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGZzLmFjY2VzcyhwYXRoKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQGZ1bmN0aW9uIGlzUGF0aFxuICAgKiBAZGVzY3JpcHRpb24gRXZhbHVhdGVzIHdoZXRoZXIgYSBzdHJpbmcgaXMgYSBmaWxlIHBhdGggKGFzIG9wcG9zZWQgdG8gYSBVUkwgZm9yIGV4YW1wbGUpLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcyBUaGUgc3RyaW5nIHRvIGV2YWx1YXRlLlxuICAgKiBAcmV0dXJucyB7Qm9vbGVhbn0gUmV0dXJucyB0cnVlIGlmIHRoZSBldmFsdWF0ZWQgc3RyaW5nIGlzIGEgcGF0aC5cbiAgICovXG4gIHN0YXRpYyBpc1BhdGgocykge1xuICAgIHJldHVybiAvKF5cXC8pfCheXFwuXFwvKXwoXlxcLlxcLlxcLykvLnRlc3Qocyk7XG4gIH1cblxuICAvKipcbiAgICogRmxhdHRlbnMgYW4gb2JqZWN0IGFuZCBjcmF0ZXMgbmV3IGtleXMgd2l0aCBjdXN0b20gZGVsaW1pdGVycy5cbiAgICogQHBhcmFtIHtPYmplY3R9IG9iaiBUaGUgb2JqZWN0IHRvIGZsYXR0ZW4uXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBbZGVsaW1pdGVyPScuJ10gVGhlIGRlbGltaXRlciBvZiB0aGUgbmV3bHkgZ2VuZXJhdGVkIGtleXMuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXN1bHRcbiAgICogQHJldHVybnMge09iamVjdH0gVGhlIGZsYXR0ZW5lZCBvYmplY3QuXG4gICAqKi9cbiAgc3RhdGljIGZsYXR0ZW5PYmplY3Qob2JqLCBwYXJlbnRLZXksIGRlbGltaXRlciA9ICcuJywgcmVzdWx0ID0ge30pIHtcbiAgICBmb3IgKGNvbnN0IGtleSBpbiBvYmopIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpKSB7XG4gICAgICAgIGNvbnN0IG5ld0tleSA9IHBhcmVudEtleSA/IHBhcmVudEtleSArIGRlbGltaXRlciArIGtleSA6IGtleTtcblxuICAgICAgICBpZiAodHlwZW9mIG9ialtrZXldID09PSAnb2JqZWN0JyAmJiBvYmpba2V5XSAhPT0gbnVsbCkge1xuICAgICAgICAgIHRoaXMuZmxhdHRlbk9iamVjdChvYmpba2V5XSwgbmV3S2V5LCBkZWxpbWl0ZXIsIHJlc3VsdCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmVzdWx0W25ld0tleV0gPSBvYmpba2V5XTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gVXRpbHM7XG4iXX0=