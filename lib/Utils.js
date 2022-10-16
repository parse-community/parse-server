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
  /**
   * Determines whether an object is a Promise.
   * @param {any} object The object to validate.
   * @returns {Boolean} Returns true if the object is a promise.
   */


  static isPromise(object) {
    return object instanceof Promise;
  }
  /**
   * Creates an object with all permutations of the original keys.
   * For example, this definition:
   * ```
   * {
   *   a: [true, false],
   *   b: [1, 2],
   *   c: ['x']
   * }
   * ```
   * permutates to:
   * ```
   * [
   *   { a: true, b: 1, c: 'x' },
   *   { a: true, b: 2, c: 'x' },
   *   { a: false, b: 1, c: 'x' },
   *   { a: false, b: 2, c: 'x' }
   * ]
   * ```
   * @param {Object} object The object to permutate.
   * @param {Integer} [index=0] The current key index.
   * @param {Object} [current={}] The current result entry being composed.
   * @param {Array} [results=[]] The resulting array of permutations.
   */


  static getObjectKeyPermutations(object, index = 0, current = {}, results = []) {
    const keys = Object.keys(object);
    const key = keys[index];
    const values = object[key];

    for (const value of values) {
      current[key] = value;
      const nextIndex = index + 1;

      if (nextIndex < keys.length) {
        Utils.getObjectKeyPermutations(object, nextIndex, current, results);
      } else {
        const result = Object.assign({}, current);
        results.push(result);
      }
    }

    return results;
  }
  /**
   * Validates parameters and throws if a parameter is invalid.
   * Example parameter types syntax:
   * ```
   * {
   *   parameterName: {
   *      t: 'boolean',
   *      v: isBoolean,
   *      o: true
   *   },
   *   ...
   * }
   * ```
   * @param {Object} params The parameters to validate.
   * @param {Array<Object>} types The parameter types used for validation.
   * @param {Object} types.t The parameter type; used for error message, not for validation.
   * @param {Object} types.v The function to validate the parameter value.
   * @param {Boolean} [types.o=false] Is true if the parameter is optional.
   */


  static validateParams(params, types) {
    for (const key of Object.keys(params)) {
      const type = types[key];
      const isOptional = !!type.o;
      const param = params[key];

      if (!(isOptional && param == null) && !type.v(param)) {
        throw `Invalid parameter ${key} must be of type ${type.t} but is ${typeof param}`;
      }
    }
  }
  /**
   * Computes the relative date based on a string.
   * @param {String} text The string to interpret the date from.
   * @param {Date} now The date the string is comparing against.
   * @returns {Object} The relative date object.
   **/


  static relativeTimeToDate(text, now = new Date()) {
    text = text.toLowerCase();
    let parts = text.split(' '); // Filter out whitespace

    parts = parts.filter(part => part !== '');
    const future = parts[0] === 'in';
    const past = parts[parts.length - 1] === 'ago';

    if (!future && !past && text !== 'now') {
      return {
        status: 'error',
        info: "Time should either start with 'in' or end with 'ago'"
      };
    }

    if (future && past) {
      return {
        status: 'error',
        info: "Time cannot have both 'in' and 'ago'"
      };
    } // strip the 'ago' or 'in'


    if (future) {
      parts = parts.slice(1);
    } else {
      // past
      parts = parts.slice(0, parts.length - 1);
    }

    if (parts.length % 2 !== 0 && text !== 'now') {
      return {
        status: 'error',
        info: 'Invalid time string. Dangling unit or number.'
      };
    }

    const pairs = [];

    while (parts.length) {
      pairs.push([parts.shift(), parts.shift()]);
    }

    let seconds = 0;

    for (const [num, interval] of pairs) {
      const val = Number(num);

      if (!Number.isInteger(val)) {
        return {
          status: 'error',
          info: `'${num}' is not an integer.`
        };
      }

      switch (interval) {
        case 'yr':
        case 'yrs':
        case 'year':
        case 'years':
          seconds += val * 31536000; // 365 * 24 * 60 * 60

          break;

        case 'wk':
        case 'wks':
        case 'week':
        case 'weeks':
          seconds += val * 604800; // 7 * 24 * 60 * 60

          break;

        case 'd':
        case 'day':
        case 'days':
          seconds += val * 86400; // 24 * 60 * 60

          break;

        case 'hr':
        case 'hrs':
        case 'hour':
        case 'hours':
          seconds += val * 3600; // 60 * 60

          break;

        case 'min':
        case 'mins':
        case 'minute':
        case 'minutes':
          seconds += val * 60;
          break;

        case 'sec':
        case 'secs':
        case 'second':
        case 'seconds':
          seconds += val;
          break;

        default:
          return {
            status: 'error',
            info: `Invalid interval: '${interval}'`
          };
      }
    }

    const milliseconds = seconds * 1000;

    if (future) {
      return {
        status: 'success',
        info: 'future',
        result: new Date(now.valueOf() + milliseconds)
      };
    } else if (past) {
      return {
        status: 'success',
        info: 'past',
        result: new Date(now.valueOf() - milliseconds)
      };
    } else {
      return {
        status: 'success',
        info: 'present',
        result: new Date(now.valueOf())
      };
    }
  }
  /**
   * Deep-scans an object for a matching key/value definition.
   * @param {Object} obj The object to scan.
   * @param {String | undefined} key The key to match, or undefined if only the value should be matched.
   * @param {any | undefined} value The value to match, or undefined if only the key should be matched.
   * @returns {Boolean} True if a match was found, false otherwise.
   */


  static objectContainsKeyValue(obj, key, value) {
    const isMatch = (a, b) => typeof a === 'string' && new RegExp(b).test(a) || a === b;

    const isKeyMatch = k => isMatch(k, key);

    const isValueMatch = v => isMatch(v, value);

    for (const [k, v] of Object.entries(obj)) {
      if (key !== undefined && value === undefined && isKeyMatch(k)) {
        return true;
      } else if (key === undefined && value !== undefined && isValueMatch(v)) {
        return true;
      } else if (key !== undefined && value !== undefined && isKeyMatch(k) && isValueMatch(v)) {
        return true;
      }

      if (['[object Object]', '[object Array]'].includes(Object.prototype.toString.call(v))) {
        return Utils.objectContainsKeyValue(v, key, value);
      }
    }

    return false;
  }

}

module.exports = Utils;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9VdGlscy5qcyJdLCJuYW1lcyI6WyJwYXRoIiwicmVxdWlyZSIsImZzIiwicHJvbWlzZXMiLCJVdGlscyIsImdldExvY2FsaXplZFBhdGgiLCJkZWZhdWx0UGF0aCIsImxvY2FsZSIsImZpbGUiLCJiYXNlbmFtZSIsImJhc2VQYXRoIiwiZGlybmFtZSIsImxvY2FsZVBhdGgiLCJqb2luIiwibG9jYWxlRmlsZUV4aXN0cyIsImZpbGVFeGlzdHMiLCJzdWJkaXIiLCJsYW5ndWFnZSIsInNwbGl0IiwibGFuZ3VhZ2VQYXRoIiwibGFuZ3VhZ2VGaWxlRXhpc3RzIiwiYWNjZXNzIiwiZSIsImlzUGF0aCIsInMiLCJ0ZXN0IiwiZmxhdHRlbk9iamVjdCIsIm9iaiIsInBhcmVudEtleSIsImRlbGltaXRlciIsInJlc3VsdCIsImtleSIsIk9iamVjdCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsIm5ld0tleSIsImlzUHJvbWlzZSIsIm9iamVjdCIsIlByb21pc2UiLCJnZXRPYmplY3RLZXlQZXJtdXRhdGlvbnMiLCJpbmRleCIsImN1cnJlbnQiLCJyZXN1bHRzIiwia2V5cyIsInZhbHVlcyIsInZhbHVlIiwibmV4dEluZGV4IiwibGVuZ3RoIiwiYXNzaWduIiwicHVzaCIsInZhbGlkYXRlUGFyYW1zIiwicGFyYW1zIiwidHlwZXMiLCJ0eXBlIiwiaXNPcHRpb25hbCIsIm8iLCJwYXJhbSIsInYiLCJ0IiwicmVsYXRpdmVUaW1lVG9EYXRlIiwidGV4dCIsIm5vdyIsIkRhdGUiLCJ0b0xvd2VyQ2FzZSIsInBhcnRzIiwiZmlsdGVyIiwicGFydCIsImZ1dHVyZSIsInBhc3QiLCJzdGF0dXMiLCJpbmZvIiwic2xpY2UiLCJwYWlycyIsInNoaWZ0Iiwic2Vjb25kcyIsIm51bSIsImludGVydmFsIiwidmFsIiwiTnVtYmVyIiwiaXNJbnRlZ2VyIiwibWlsbGlzZWNvbmRzIiwidmFsdWVPZiIsIm9iamVjdENvbnRhaW5zS2V5VmFsdWUiLCJpc01hdGNoIiwiYSIsImIiLCJSZWdFeHAiLCJpc0tleU1hdGNoIiwiayIsImlzVmFsdWVNYXRjaCIsImVudHJpZXMiLCJ1bmRlZmluZWQiLCJpbmNsdWRlcyIsInRvU3RyaW5nIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJtYXBwaW5ncyI6Ijs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUEsTUFBTUEsSUFBSSxHQUFHQyxPQUFPLENBQUMsTUFBRCxDQUFwQjs7QUFDQSxNQUFNQyxFQUFFLEdBQUdELE9BQU8sQ0FBQyxJQUFELENBQVAsQ0FBY0UsUUFBekI7QUFFQTtBQUNBO0FBQ0E7OztBQUNBLE1BQU1DLEtBQU4sQ0FBWTtBQUNWO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQytCLGVBQWhCQyxnQkFBZ0IsQ0FBQ0MsV0FBRCxFQUFjQyxNQUFkLEVBQXNCO0FBQ2pEO0FBQ0EsVUFBTUMsSUFBSSxHQUFHUixJQUFJLENBQUNTLFFBQUwsQ0FBY0gsV0FBZCxDQUFiO0FBQ0EsVUFBTUksUUFBUSxHQUFHVixJQUFJLENBQUNXLE9BQUwsQ0FBYUwsV0FBYixDQUFqQixDQUhpRCxDQUtqRDs7QUFDQSxRQUFJLENBQUNDLE1BQUwsRUFBYTtBQUNYLGFBQU87QUFBRVAsUUFBQUEsSUFBSSxFQUFFTTtBQUFSLE9BQVA7QUFDRCxLQVJnRCxDQVVqRDs7O0FBQ0EsVUFBTU0sVUFBVSxHQUFHWixJQUFJLENBQUNhLElBQUwsQ0FBVUgsUUFBVixFQUFvQkgsTUFBcEIsRUFBNEJDLElBQTVCLENBQW5CO0FBQ0EsVUFBTU0sZ0JBQWdCLEdBQUcsTUFBTVYsS0FBSyxDQUFDVyxVQUFOLENBQWlCSCxVQUFqQixDQUEvQixDQVppRCxDQWNqRDs7QUFDQSxRQUFJRSxnQkFBSixFQUFzQjtBQUNwQixhQUFPO0FBQUVkLFFB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QUN0RSxlQUFPLElBQVA7QUFDRCxPQUZNLE1BRUEsSUFBSTNCLEdBQUcsS0FBSzZELFNBQVIsSUFBcUI5QyxLQUFLLEtBQUs4QyxTQUEvQixJQUE0Q0osVUFBVSxDQUFDQyxDQUFELENBQXRELElBQTZEQyxZQUFZLENBQUNoQyxDQUFELENBQTdFLEVBQWtGO0FBQ3ZGLGVBQU8sSUFBUDtBQUNEOztBQUNELFVBQUksQ0FBQyxpQkFBRCxFQUFvQixnQkFBcEIsRUFBc0NtQyxRQUF0QyxDQUErQzdELE1BQU0sQ0FBQ0MsU0FBUCxDQUFpQjZELFFBQWpCLENBQTBCM0QsSUFBMUIsQ0FBK0J1QixDQUEvQixDQUEvQyxDQUFKLEVBQXVGO0FBQ3JGLGVBQU90RCxLQUFLLENBQUMrRSxzQkFBTixDQUE2QnpCLENBQTdCLEVBQWdDM0IsR0FBaEMsRUFBcUNlLEtBQXJDLENBQVA7QUFDRDtBQUNGOztBQUNELFdBQU8sS0FBUDtBQUNEOztBQTNWUzs7QUE4VlppRCxNQUFNLENBQUNDLE9BQVAsR0FBaUI1RixLQUFqQiIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogdXRpbHMuanNcbiAqIEBmaWxlIEdlbmVyYWwgcHVycG9zZSB1dGlsaXRpZXNcbiAqIEBkZXNjcmlwdGlvbiBHZW5lcmFsIHB1cnBvc2UgdXRpbGl0aWVzLlxuICovXG5cbmNvbnN0IHBhdGggPSByZXF1aXJlKCdwYXRoJyk7XG5jb25zdCBmcyA9IHJlcXVpcmUoJ2ZzJykucHJvbWlzZXM7XG5cbi8qKlxuICogVGhlIGdlbmVyYWwgcHVycG9zZSB1dGlsaXRpZXMuXG4gKi9cbmNsYXNzIFV0aWxzIHtcbiAgLyoqXG4gICAqIEBmdW5jdGlvbiBnZXRMb2NhbGl6ZWRQYXRoXG4gICAqIEBkZXNjcmlwdGlvbiBSZXR1cm5zIGEgbG9jYWxpemVkIGZpbGUgcGF0aCBhY2NvcmluZyB0byB0aGUgbG9jYWxlLlxuICAgKlxuICAgKiBMb2NhbGl6ZWQgZmlsZXMgYXJlIHNlYXJjaGVkIGluIHN1YmZvbGRlcnMgb2YgYSBnaXZlbiBwYXRoLCBlLmcuXG4gICAqXG4gICAqIHJvb3QvXG4gICAqIOKUnOKUgOKUgCBiYXNlLyAgICAgICAgICAgICAgICAgICAgLy8gYmFzZSBwYXRoIHRvIGZpbGVzXG4gICAqIOKUgiAgIOKUnOKUgOKUgCBleGFtcGxlLmh0bWwgICAgICAgICAvLyBkZWZhdWx0IGZpbGVcbiAgICog4pSCICAg4pSU4pSA4pSAIGRlLyAgICAgICAgICAgICAgICAgIC8vIGRlIGxhbmd1YWdlIGZvbGRlclxuICAgKiDilIIgICDilIIgICDilJTilIDilIAgZXhhbXBsZS5odG1sICAgICAvLyBkZSBsb2NhbGl6ZWQgZmlsZVxuICAgKiDilIIgICDilJTilIDilIAgZGUtQVQvICAgICAgICAgICAgICAgLy8gZGUtQVQgbG9jYWxlIGZvbGRlclxuICAgKiDilIIgICDilIIgICDilJTilIDilIAgZXhhbXBsZS5odG1sICAgICAvLyBkZS1BVCBsb2NhbGl6ZWQgZmlsZVxuICAgKlxuICAgKiBGaWxlcyBhcmUgbWF0Y2hlZCB3aXRoIHRoZSBsb2NhbGUgaW4gdGhlIGZvbGxvd2luZyBvcmRlcjpcbiAgICogMS4gTG9jYWxlIG1hdGNoLCBlLmcuIGxvY2FsZSBgZGUtQVRgIG1hdGNoZXMgZmlsZSBpbiBmb2xkZXIgYGRlLUFUYC5cbiAgICogMi4gTGFuZ3VhZ2UgbWF0Y2gsIGUuZy4gbG9jYWxlIGBkZS1BVGAgbWF0Y2hlcyBmaWxlIGluIGZvbGRlciBgZGVgLlxuICAgKiAzLiBEZWZhdWx0OyBmaWxlIGluIGJhc2UgZm9sZGVyIGlzIHJldHVybmVkLlxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gZGVmYXVsdFBhdGggVGhlIGFic29sdXRlIGZpbGUgcGF0aCwgd2hpY2ggaXMgYWxzb1xuICAgKiB0aGUgZGVmYXVsdCBwYXRoIHJldHVybmVkIGlmIGxvY2FsaXphdGlvbiBpcyBub3QgYXZhaWxhYmxlLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gbG9jYWxlIFRoZSBsb2NhbGUuXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPE9iamVjdD59IFRoZSBvYmplY3QgY29udGFpbnM6XG4gICAqIC0gYHBhdGhgOiBUaGUgcGF0aCB0byB0aGUgbG9jYWxpemVkIGZpbGUsIG9yIHRoZSBvcmlnaW5hbCBwYXRoIGlmXG4gICAqICAgbG9jYWxpemF0aW9uIGlzIG5vdCBhdmFpbGFibGUuXG4gICAqIC0gYHN1YmRpcmA6IFRoZSBzdWJkaXJlY3Rvcnkgb2YgdGhlIGxvY2FsaXplZCBmaWxlLCBvciB1bmRlZmluZWQgaWZcbiAgICogICB0aGVyZSBpcyBubyBtYXRjaGluZyBsb2NhbGl6ZWQgZmlsZS5cbiAgICovXG4gIHN0YXRpYyBhc3luYyBnZXRMb2NhbGl6ZWRQYXRoKGRlZmF1bHRQYXRoLCBsb2NhbGUpIHtcbiAgICAvLyBHZXQgZmlsZSBuYW1lIGFuZCBwYXRoc1xuICAgIGNvbnN0IGZpbGUgPSBwYXRoLmJhc2VuYW1lKGRlZmF1bHRQYXRoKTtcbiAgICBjb25zdCBiYXNlUGF0aCA9IHBhdGguZGlybmFtZShkZWZhdWx0UGF0aCk7XG5cbiAgICAvLyBJZiBsb2NhbGUgaXMgbm90IHNldCByZXR1cm4gZGVmYXVsdCBmaWxlXG4gICAgaWYgKCFsb2NhbGUpIHtcbiAgICAgIHJldHVybiB7IHBhdGg6IGRlZmF1bHRQYXRoIH07XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgZmlsZSBmb3IgbG9jYWxlIGV4aXN0c1xuICAgIGNvbnN0IGxvY2FsZVBhdGggPSBwYXRoLmpvaW4oYmFzZVBhdGgsIGxvY2FsZSwgZmlsZSk7XG4gICAgY29uc3QgbG9jYWxlRmlsZUV4aXN0cyA9IGF3YWl0IFV0aWxzLmZpbGVFeGlzdHMobG9jYWxlUGF0aCk7XG5cbiAgICAvLyBJZiBmaWxlIGZvciBsb2NhbGUgZXhpc3RzIHJldHVybiBmaWxlXG4gICAgaWYgKGxvY2FsZUZpbGVFeGlzdHMpIHtcbiAgICAgIHJldHVybiB7IHBhdGg6IGxvY2FsZVBhdGgsIHN1YmRpcjogbG9jYWxlIH07XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgZmlsZSBmb3IgbGFuZ3VhZ2UgZXhpc3RzXG4gICAgY29uc3QgbGFuZ3VhZ2UgPSBsb2NhbGUuc3BsaXQoJy0nKVswXTtcbiAgICBjb25zdCBsYW5ndWFnZVBhdGggPSBwYXRoLmpvaW4oYmFzZVBhdGgsIGxhbmd1YWdlLCBmaWxlKTtcbiAgICBjb25zdCBsYW5ndWFnZUZpbGVFeGlzdHMgPSBhd2FpdCBVdGlscy5maWxlRXhpc3RzKGxhbmd1YWdlUGF0aCk7XG5cbiAgICAvLyBJZiBmaWxlIGZvciBsYW5ndWFnZSBleGlzdHMgcmV0dXJuIGZpbGVcbiAgICBpZiAobGFuZ3VhZ2VGaWxlRXhpc3RzKSB7XG4gICAgICByZXR1cm4geyBwYXRoOiBsYW5ndWFnZVBhdGgsIHN1YmRpcjogbGFuZ3VhZ2UgfTtcbiAgICB9XG5cbiAgICAvLyBSZXR1cm4gZGVmYXVsdCBmaWxlXG4gICAgcmV0dXJuIHsgcGF0aDogZGVmYXVsdFBhdGggfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBAZnVuY3Rpb24gZmlsZUV4aXN0c1xuICAgKiBAZGVzY3JpcHRpb24gQ2hlY2tzIHdoZXRoZXIgYSBmaWxlIGV4aXN0cy5cbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIGZpbGUgcGF0aC5cbiAgICogQHJldHVybnMge1Byb21pc2U8Qm9vbGVhbj59IElzIHRydWUgaWYgdGhlIGZpbGUgY2FuIGJlIGFjY2Vzc2VkLCBmYWxzZSBvdGhlcndpc2UuXG4gICAqL1xuICBzdGF0aWMgYXN5bmMgZmlsZUV4aXN0cyhwYXRoKSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGZzLmFjY2VzcyhwYXRoKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQGZ1bmN0aW9uIGlzUGF0aFxuICAgKiBAZGVzY3JpcHRpb24gRXZhbHVhdGVzIHdoZXRoZXIgYSBzdHJpbmcgaXMgYSBmaWxlIHBhdGggKGFzIG9wcG9zZWQgdG8gYSBVUkwgZm9yIGV4YW1wbGUpLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcyBUaGUgc3RyaW5nIHRvIGV2YWx1YXRlLlxuICAgKiBAcmV0dXJucyB7Qm9vbGVhbn0gUmV0dXJucyB0cnVlIGlmIHRoZSBldmFsdWF0ZWQgc3RyaW5nIGlzIGEgcGF0aC5cbiAgICovXG4gIHN0YXRpYyBpc1BhdGgocykge1xuICAgIHJldHVybiAvKF5cXC8pfCheXFwuXFwvKXwoXlxcLlxcLlxcLykvLnRlc3Qocyk7XG4gIH1cblxuICAvKipcbiAgICogRmxhdHRlbnMgYW4gb2JqZWN0IGFuZCBjcmF0ZXMgbmV3IGtleXMgd2l0aCBjdXN0b20gZGVsaW1pdGVycy5cbiAgICogQHBhcmFtIHtPYmplY3R9IG9iaiBUaGUgb2JqZWN0IHRvIGZsYXR0ZW4uXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBbZGVsaW1pdGVyPScuJ10gVGhlIGRlbGltaXRlciBvZiB0aGUgbmV3bHkgZ2VuZXJhdGVkIGtleXMuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXN1bHRcbiAgICogQHJldHVybnMge09iamVjdH0gVGhlIGZsYXR0ZW5lZCBvYmplY3QuXG4gICAqKi9cbiAgc3RhdGljIGZsYXR0ZW5PYmplY3Qob2JqLCBwYXJlbnRLZXksIGRlbGltaXRlciA9ICcuJywgcmVzdWx0ID0ge30pIHtcbiAgICBmb3IgKGNvbnN0IGtleSBpbiBvYmopIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpKSB7XG4gICAgICAgIGNvbnN0IG5ld0tleSA9IHBhcmVudEtleSA/IHBhcmVudEtleSArIGRlbGltaXRlciArIGtleSA6IGtleTtcblxuICAgICAgICBpZiAodHlwZW9mIG9ialtrZXldID09PSAnb2JqZWN0JyAmJiBvYmpba2V5XSAhPT0gbnVsbCkge1xuICAgICAgICAgIHRoaXMuZmxhdHRlbk9iamVjdChvYmpba2V5XSwgbmV3S2V5LCBkZWxpbWl0ZXIsIHJlc3VsdCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmVzdWx0W25ld0tleV0gPSBvYmpba2V5XTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIERldGVybWluZXMgd2hldGhlciBhbiBvYmplY3QgaXMgYSBQcm9taXNlLlxuICAgKiBAcGFyYW0ge2FueX0gb2JqZWN0IFRoZSBvYmplY3QgdG8gdmFsaWRhdGUuXG4gICAqIEByZXR1cm5zIHtCb29sZWFufSBSZXR1cm5zIHRydWUgaWYgdGhlIG9iamVjdCBpcyBhIHByb21pc2UuXG4gICAqL1xuICBzdGF0aWMgaXNQcm9taXNlKG9iamVjdCkge1xuICAgIHJldHVybiBvYmplY3QgaW5zdGFuY2VvZiBQcm9taXNlO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYW4gb2JqZWN0IHdpdGggYWxsIHBlcm11dGF0aW9ucyBvZiB0aGUgb3JpZ2luYWwga2V5cy5cbiAgICogRm9yIGV4YW1wbGUsIHRoaXMgZGVmaW5pdGlvbjpcbiAgICogYGBgXG4gICAqIHtcbiAgICogICBhOiBbdHJ1ZSwgZmFsc2VdLFxuICAgKiAgIGI6IFsxLCAyXSxcbiAgICogICBjOiBbJ3gnXVxuICAgKiB9XG4gICAqIGBgYFxuICAgKiBwZXJtdXRhdGVzIHRvOlxuICAgKiBgYGBcbiAgICogW1xuICAgKiAgIHsgYTogdHJ1ZSwgYjogMSwgYzogJ3gnIH0sXG4gICAqICAgeyBhOiB0cnVlLCBiOiAyLCBjOiAneCcgfSxcbiAgICogICB7IGE6IGZhbHNlLCBiOiAxLCBjOiAneCcgfSxcbiAgICogICB7IGE6IGZhbHNlLCBiOiAyLCBjOiAneCcgfVxuICAgKiBdXG4gICAqIGBgYFxuICAgKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdG8gcGVybXV0YXRlLlxuICAgKiBAcGFyYW0ge0ludGVnZXJ9IFtpbmRleD0wXSBUaGUgY3VycmVudCBrZXkgaW5kZXguXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbY3VycmVudD17fV0gVGhlIGN1cnJlbnQgcmVzdWx0IGVudHJ5IGJlaW5nIGNvbXBvc2VkLlxuICAgKiBAcGFyYW0ge0FycmF5fSBbcmVzdWx0cz1bXV0gVGhlIHJlc3VsdGluZyBhcnJheSBvZiBwZXJtdXRhdGlvbnMuXG4gICAqL1xuICBzdGF0aWMgZ2V0T2JqZWN0S2V5UGVybXV0YXRpb25zKG9iamVjdCwgaW5kZXggPSAwLCBjdXJyZW50ID0ge30sIHJlc3VsdHMgPSBbXSkge1xuICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyhvYmplY3QpO1xuICAgIGNvbnN0IGtleSA9IGtleXNbaW5kZXhdO1xuICAgIGNvbnN0IHZhbHVlcyA9IG9iamVjdFtrZXldO1xuXG4gICAgZm9yIChjb25zdCB2YWx1ZSBvZiB2YWx1ZXMpIHtcbiAgICAgIGN1cnJlbnRba2V5XSA9IHZhbHVlO1xuICAgICAgY29uc3QgbmV4dEluZGV4ID0gaW5kZXggKyAxO1xuXG4gICAgICBpZiAobmV4dEluZGV4IDwga2V5cy5sZW5ndGgpIHtcbiAgICAgICAgVXRpbHMuZ2V0T2JqZWN0S2V5UGVybXV0YXRpb25zKG9iamVjdCwgbmV4dEluZGV4LCBjdXJyZW50LCByZXN1bHRzKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IE9iamVjdC5hc3NpZ24oe30sIGN1cnJlbnQpO1xuICAgICAgICByZXN1bHRzLnB1c2gocmVzdWx0KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH1cblxuICAvKipcbiAgICogVmFsaWRhdGVzIHBhcmFtZXRlcnMgYW5kIHRocm93cyBpZiBhIHBhcmFtZXRlciBpcyBpbnZhbGlkLlxuICAgKiBFeGFtcGxlIHBhcmFtZXRlciB0eXBlcyBzeW50YXg6XG4gICAqIGBgYFxuICAgKiB7XG4gICAqICAgcGFyYW1ldGVyTmFtZToge1xuICAgKiAgICAgIHQ6ICdib29sZWFuJyxcbiAgICogICAgICB2OiBpc0Jvb2xlYW4sXG4gICAqICAgICAgbzogdHJ1ZVxuICAgKiAgIH0sXG4gICAqICAgLi4uXG4gICAqIH1cbiAgICogYGBgXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBwYXJhbXMgVGhlIHBhcmFtZXRlcnMgdG8gdmFsaWRhdGUuXG4gICAqIEBwYXJhbSB7QXJyYXk8T2JqZWN0Pn0gdHlwZXMgVGhlIHBhcmFtZXRlciB0eXBlcyB1c2VkIGZvciB2YWxpZGF0aW9uLlxuICAgKiBAcGFyYW0ge09iamVjdH0gdHlwZXMudCBUaGUgcGFyYW1ldGVyIHR5cGU7IHVzZWQgZm9yIGVycm9yIG1lc3NhZ2UsIG5vdCBmb3IgdmFsaWRhdGlvbi5cbiAgICogQHBhcmFtIHtPYmplY3R9IHR5cGVzLnYgVGhlIGZ1bmN0aW9uIHRvIHZhbGlkYXRlIHRoZSBwYXJhbWV0ZXIgdmFsdWUuXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gW3R5cGVzLm89ZmFsc2VdIElzIHRydWUgaWYgdGhlIHBhcmFtZXRlciBpcyBvcHRpb25hbC5cbiAgICovXG4gIHN0YXRpYyB2YWxpZGF0ZVBhcmFtcyhwYXJhbXMsIHR5cGVzKSB7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMocGFyYW1zKSkge1xuICAgICAgY29uc3QgdHlwZSA9IHR5cGVzW2tleV07XG4gICAgICBjb25zdCBpc09wdGlvbmFsID0gISF0eXBlLm87XG4gICAgICBjb25zdCBwYXJhbSA9IHBhcmFtc1trZXldO1xuICAgICAgaWYgKCEoaXNPcHRpb25hbCAmJiBwYXJhbSA9PSBudWxsKSAmJiAhdHlwZS52KHBhcmFtKSkge1xuICAgICAgICB0aHJvdyBgSW52YWxpZCBwYXJhbWV0ZXIgJHtrZXl9IG11c3QgYmUgb2YgdHlwZSAke3R5cGUudH0gYnV0IGlzICR7dHlwZW9mIHBhcmFtfWA7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIENvbXB1dGVzIHRoZSByZWxhdGl2ZSBkYXRlIGJhc2VkIG9uIGEgc3RyaW5nLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gdGV4dCBUaGUgc3RyaW5nIHRvIGludGVycHJldCB0aGUgZGF0ZSBmcm9tLlxuICAgKiBAcGFyYW0ge0RhdGV9IG5vdyBUaGUgZGF0ZSB0aGUgc3RyaW5nIGlzIGNvbXBhcmluZyBhZ2FpbnN0LlxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgcmVsYXRpdmUgZGF0ZSBvYmplY3QuXG4gICAqKi9cbiAgc3RhdGljIHJlbGF0aXZlVGltZVRvRGF0ZSh0ZXh0LCBub3cgPSBuZXcgRGF0ZSgpKSB7XG4gICAgdGV4dCA9IHRleHQudG9Mb3dlckNhc2UoKTtcbiAgICBsZXQgcGFydHMgPSB0ZXh0LnNwbGl0KCcgJyk7XG5cbiAgICAvLyBGaWx0ZXIgb3V0IHdoaXRlc3BhY2VcbiAgICBwYXJ0cyA9IHBhcnRzLmZpbHRlcihwYXJ0ID0+IHBhcnQgIT09ICcnKTtcblxuICAgIGNvbnN0IGZ1dHVyZSA9IHBhcnRzWzBdID09PSAnaW4nO1xuICAgIGNvbnN0IHBhc3QgPSBwYXJ0c1twYXJ0cy5sZW5ndGggLSAxXSA9PT0gJ2Fnbyc7XG5cbiAgICBpZiAoIWZ1dHVyZSAmJiAhcGFzdCAmJiB0ZXh0ICE9PSAnbm93Jykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzOiAnZXJyb3InLFxuICAgICAgICBpbmZvOiBcIlRpbWUgc2hvdWxkIGVpdGhlciBzdGFydCB3aXRoICdpbicgb3IgZW5kIHdpdGggJ2FnbydcIixcbiAgICAgIH07XG4gICAgfVxuXG4gICAgaWYgKGZ1dHVyZSAmJiBwYXN0KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICAgIGluZm86IFwiVGltZSBjYW5ub3QgaGF2ZSBib3RoICdpbicgYW5kICdhZ28nXCIsXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIHN0cmlwIHRoZSAnYWdvJyBvciAnaW4nXG4gICAgaWYgKGZ1dHVyZSkge1xuICAgICAgcGFydHMgPSBwYXJ0cy5zbGljZSgxKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gcGFzdFxuICAgICAgcGFydHMgPSBwYXJ0cy5zbGljZSgwLCBwYXJ0cy5sZW5ndGggLSAxKTtcbiAgICB9XG5cbiAgICBpZiAocGFydHMubGVuZ3RoICUgMiAhPT0gMCAmJiB0ZXh0ICE9PSAnbm93Jykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzOiAnZXJyb3InLFxuICAgICAgICBpbmZvOiAnSW52YWxpZCB0aW1lIHN0cmluZy4gRGFuZ2xpbmcgdW5pdCBvciBudW1iZXIuJyxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgcGFpcnMgPSBbXTtcbiAgICB3aGlsZSAocGFydHMubGVuZ3RoKSB7XG4gICAgICBwYWlycy5wdXNoKFtwYXJ0cy5zaGlmdCgpLCBwYXJ0cy5zaGlmdCgpXSk7XG4gICAgfVxuXG4gICAgbGV0IHNlY29uZHMgPSAwO1xuICAgIGZvciAoY29uc3QgW251bSwgaW50ZXJ2YWxdIG9mIHBhaXJzKSB7XG4gICAgICBjb25zdCB2YWwgPSBOdW1iZXIobnVtKTtcbiAgICAgIGlmICghTnVtYmVyLmlzSW50ZWdlcih2YWwpKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgc3RhdHVzOiAnZXJyb3InLFxuICAgICAgICAgIGluZm86IGAnJHtudW19JyBpcyBub3QgYW4gaW50ZWdlci5gLFxuICAgICAgICB9O1xuICAgICAgfVxuXG4gICAgICBzd2l0Y2ggKGludGVydmFsKSB7XG4gICAgICAgIGNhc2UgJ3lyJzpcbiAgICAgICAgY2FzZSAneXJzJzpcbiAgICAgICAgY2FzZSAneWVhcic6XG4gICAgICAgIGNhc2UgJ3llYXJzJzpcbiAgICAgICAgICBzZWNvbmRzICs9IHZhbCAqIDMxNTM2MDAwOyAvLyAzNjUgKiAyNCAqIDYwICogNjBcbiAgICAgICAgICBicmVhaztcblxuICAgICAgICBjYXNlICd3ayc6XG4gICAgICAgIGNhc2UgJ3drcyc6XG4gICAgICAgIGNhc2UgJ3dlZWsnOlxuICAgICAgICBjYXNlICd3ZWVrcyc6XG4gICAgICAgICAgc2Vjb25kcyArPSB2YWwgKiA2MDQ4MDA7IC8vIDcgKiAyNCAqIDYwICogNjBcbiAgICAgICAgICBicmVhaztcblxuICAgICAgICBjYXNlICdkJzpcbiAgICAgICAgY2FzZSAnZGF5JzpcbiAgICAgICAgY2FzZSAnZGF5cyc6XG4gICAgICAgICAgc2Vjb25kcyArPSB2YWwgKiA4NjQwMDsgLy8gMjQgKiA2MCAqIDYwXG4gICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgY2FzZSAnaHInOlxuICAgICAgICBjYXNlICdocnMnOlxuICAgICAgICBjYXNlICdob3VyJzpcbiAgICAgICAgY2FzZSAnaG91cnMnOlxuICAgICAgICAgIHNlY29uZHMgKz0gdmFsICogMzYwMDsgLy8gNjAgKiA2MFxuICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGNhc2UgJ21pbic6XG4gICAgICAgIGNhc2UgJ21pbnMnOlxuICAgICAgICBjYXNlICdtaW51dGUnOlxuICAgICAgICBjYXNlICdtaW51dGVzJzpcbiAgICAgICAgICBzZWNvbmRzICs9IHZhbCAqIDYwO1xuICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGNhc2UgJ3NlYyc6XG4gICAgICAgIGNhc2UgJ3NlY3MnOlxuICAgICAgICBjYXNlICdzZWNvbmQnOlxuICAgICAgICBjYXNlICdzZWNvbmRzJzpcbiAgICAgICAgICBzZWNvbmRzICs9IHZhbDtcbiAgICAgICAgICBicmVhaztcblxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICAgICAgICBpbmZvOiBgSW52YWxpZCBpbnRlcnZhbDogJyR7aW50ZXJ2YWx9J2AsXG4gICAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBtaWxsaXNlY29uZHMgPSBzZWNvbmRzICogMTAwMDtcbiAgICBpZiAoZnV0dXJlKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdzdWNjZXNzJyxcbiAgICAgICAgaW5mbzogJ2Z1dHVyZScsXG4gICAgICAgIHJlc3VsdDogbmV3IERhdGUobm93LnZhbHVlT2YoKSArIG1pbGxpc2Vjb25kcyksXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAocGFzdCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzOiAnc3VjY2VzcycsXG4gICAgICAgIGluZm86ICdwYXN0JyxcbiAgICAgICAgcmVzdWx0OiBuZXcgRGF0ZShub3cudmFsdWVPZigpIC0gbWlsbGlzZWNvbmRzKSxcbiAgICAgIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1czogJ3N1Y2Nlc3MnLFxuICAgICAgICBpbmZvOiAncHJlc2VudCcsXG4gICAgICAgIHJlc3VsdDogbmV3IERhdGUobm93LnZhbHVlT2YoKSksXG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBEZWVwLXNjYW5zIGFuIG9iamVjdCBmb3IgYSBtYXRjaGluZyBrZXkvdmFsdWUgZGVmaW5pdGlvbi5cbiAgICogQHBhcmFtIHtPYmplY3R9IG9iaiBUaGUgb2JqZWN0IHRvIHNjYW4uXG4gICAqIEBwYXJhbSB7U3RyaW5nIHwgdW5kZWZpbmVkfSBrZXkgVGhlIGtleSB0byBtYXRjaCwgb3IgdW5kZWZpbmVkIGlmIG9ubHkgdGhlIHZhbHVlIHNob3VsZCBiZSBtYXRjaGVkLlxuICAgKiBAcGFyYW0ge2FueSB8IHVuZGVmaW5lZH0gdmFsdWUgVGhlIHZhbHVlIHRvIG1hdGNoLCBvciB1bmRlZmluZWQgaWYgb25seSB0aGUga2V5IHNob3VsZCBiZSBtYXRjaGVkLlxuICAgKiBAcmV0dXJucyB7Qm9vbGVhbn0gVHJ1ZSBpZiBhIG1hdGNoIHdhcyBmb3VuZCwgZmFsc2Ugb3RoZXJ3aXNlLlxuICAgKi9cbiAgc3RhdGljIG9iamVjdENvbnRhaW5zS2V5VmFsdWUob2JqLCBrZXksIHZhbHVlKSB7XG4gICAgY29uc3QgaXNNYXRjaCA9IChhLCBiKSA9PiAodHlwZW9mIGEgPT09ICdzdHJpbmcnICYmIG5ldyBSZWdFeHAoYikudGVzdChhKSkgfHwgYSA9PT0gYjtcbiAgICBjb25zdCBpc0tleU1hdGNoID0gayA9PiBpc01hdGNoKGssIGtleSk7XG4gICAgY29uc3QgaXNWYWx1ZU1hdGNoID0gdiA9PiBpc01hdGNoKHYsIHZhbHVlKTtcbiAgICBmb3IgKGNvbnN0IFtrLCB2XSBvZiBPYmplY3QuZW50cmllcyhvYmopKSB7XG4gICAgICBpZiAoa2V5ICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgPT09IHVuZGVmaW5lZCAmJiBpc0tleU1hdGNoKGspKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfSBlbHNlIGlmIChrZXkgPT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIGlzVmFsdWVNYXRjaCh2KSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0gZWxzZSBpZiAoa2V5ICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IHVuZGVmaW5lZCAmJiBpc0tleU1hdGNoKGspICYmIGlzVmFsdWVNYXRjaCh2KSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICAgIGlmIChbJ1tvYmplY3QgT2JqZWN0XScsICdbb2JqZWN0IEFycmF5XSddLmluY2x1ZGVzKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2KSkpIHtcbiAgICAgICAgcmV0dXJuIFV0aWxzLm9iamVjdENvbnRhaW5zS2V5VmFsdWUodiwga2V5LCB2YWx1ZSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFV0aWxzO1xuIl19