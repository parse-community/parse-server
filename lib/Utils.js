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
    const basePath = path.dirname(defaultPath);

    // If locale is not set return default file
    if (!locale) {
      return {
        path: defaultPath
      };
    }

    // Check file for locale exists
    const localePath = path.join(basePath, locale, file);
    const localeFileExists = await Utils.fileExists(localePath);

    // If file for locale exists return file
    if (localeFileExists) {
      return {
        path: localePath,
        subdir: locale
      };
    }

    // Check file for language exists
    const language = locale.split('-')[0];
    const languagePath = path.join(basePath, language, file);
    const languageFileExists = await Utils.fileExists(languagePath);

    // If file for language exists return file
    if (languageFileExists) {
      return {
        path: languagePath,
        subdir: language
      };
    }

    // Return default file
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
    let parts = text.split(' ');

    // Filter out whitespace
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
    }

    // strip the 'ago' or 'in'
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
  static checkProhibitedKeywords(config, data) {
    if (config !== null && config !== void 0 && config.requestKeywordDenylist) {
      // Scan request data for denied keywords
      for (const keyword of config.requestKeywordDenylist) {
        const match = Utils.objectContainsKeyValue(data, keyword.key, keyword.value);
        if (match) {
          throw `Prohibited keyword in request data: ${JSON.stringify(keyword)}.`;
        }
      }
    }
  }
}
module.exports = Utils;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJwYXRoIiwicmVxdWlyZSIsImZzIiwicHJvbWlzZXMiLCJVdGlscyIsImdldExvY2FsaXplZFBhdGgiLCJkZWZhdWx0UGF0aCIsImxvY2FsZSIsImZpbGUiLCJiYXNlbmFtZSIsImJhc2VQYXRoIiwiZGlybmFtZSIsImxvY2FsZVBhdGgiLCJqb2luIiwibG9jYWxlRmlsZUV4aXN0cyIsImZpbGVFeGlzdHMiLCJzdWJkaXIiLCJsYW5ndWFnZSIsInNwbGl0IiwibGFuZ3VhZ2VQYXRoIiwibGFuZ3VhZ2VGaWxlRXhpc3RzIiwiYWNjZXNzIiwiZSIsImlzUGF0aCIsInMiLCJ0ZXN0IiwiZmxhdHRlbk9iamVjdCIsIm9iaiIsInBhcmVudEtleSIsImRlbGltaXRlciIsInJlc3VsdCIsImtleSIsIk9iamVjdCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsIm5ld0tleSIsImlzUHJvbWlzZSIsIm9iamVjdCIsIlByb21pc2UiLCJnZXRPYmplY3RLZXlQZXJtdXRhdGlvbnMiLCJpbmRleCIsImN1cnJlbnQiLCJyZXN1bHRzIiwia2V5cyIsInZhbHVlcyIsInZhbHVlIiwibmV4dEluZGV4IiwibGVuZ3RoIiwiYXNzaWduIiwicHVzaCIsInZhbGlkYXRlUGFyYW1zIiwicGFyYW1zIiwidHlwZXMiLCJ0eXBlIiwiaXNPcHRpb25hbCIsIm8iLCJwYXJhbSIsInYiLCJ0IiwicmVsYXRpdmVUaW1lVG9EYXRlIiwidGV4dCIsIm5vdyIsIkRhdGUiLCJ0b0xvd2VyQ2FzZSIsInBhcnRzIiwiZmlsdGVyIiwicGFydCIsImZ1dHVyZSIsInBhc3QiLCJzdGF0dXMiLCJpbmZvIiwic2xpY2UiLCJwYWlycyIsInNoaWZ0Iiwic2Vjb25kcyIsIm51bSIsImludGVydmFsIiwidmFsIiwiTnVtYmVyIiwiaXNJbnRlZ2VyIiwibWlsbGlzZWNvbmRzIiwidmFsdWVPZiIsIm9iamVjdENvbnRhaW5zS2V5VmFsdWUiLCJpc01hdGNoIiwiYSIsImIiLCJSZWdFeHAiLCJpc0tleU1hdGNoIiwiayIsImlzVmFsdWVNYXRjaCIsImVudHJpZXMiLCJ1bmRlZmluZWQiLCJpbmNsdWRlcyIsInRvU3RyaW5nIiwiY2hlY2tQcm9oaWJpdGVkS2V5d29yZHMiLCJjb25maWciLCJkYXRhIiwicmVxdWVzdEtleXdvcmREZW55bGlzdCIsImtleXdvcmQiLCJtYXRjaCIsIkpTT04iLCJzdHJpbmdpZnkiLCJtb2R1bGUiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vc3JjL1V0aWxzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogdXRpbHMuanNcbiAqIEBmaWxlIEdlbmVyYWwgcHVycG9zZSB1dGlsaXRpZXNcbiAqIEBkZXNjcmlwdGlvbiBHZW5lcmFsIHB1cnBvc2UgdXRpbGl0aWVzLlxuICovXG5cbmNvbnN0IHBhdGggPSByZXF1aXJlKCdwYXRoJyk7XG5jb25zdCBmcyA9IHJlcXVpcmUoJ2ZzJykucHJvbWlzZXM7XG5cbi8qKlxuICogVGhlIGdlbmVyYWwgcHVycG9zZSB1dGlsaXRpZXMuXG4gKi9cbmNsYXNzIFV0aWxzIHtcbiAgLyoqXG4gICAqIEBmdW5jdGlvbiBnZXRMb2NhbGl6ZWRQYXRoXG4gICAqIEBkZXNjcmlwdGlvbiBSZXR1cm5zIGEgbG9jYWxpemVkIGZpbGUgcGF0aCBhY2NvcmluZyB0byB0aGUgbG9jYWxlLlxuICAgKlxuICAgKiBMb2NhbGl6ZWQgZmlsZXMgYXJlIHNlYXJjaGVkIGluIHN1YmZvbGRlcnMgb2YgYSBnaXZlbiBwYXRoLCBlLmcuXG4gICAqXG4gICAqIHJvb3QvXG4gICAqIOKUnOKUgOKUgCBiYXNlLyAgICAgICAgICAgICAgICAgICAgLy8gYmFzZSBwYXRoIHRvIGZpbGVzXG4gICAqIOKUgiAgIOKUnOKUgOKUgCBleGFtcGxlLmh0bWwgICAgICAgICAvLyBkZWZhdWx0IGZpbGVcbiAgICog4pSCICAg4pSU4pSA4pSAIGRlLyAgICAgICAgICAgICAgICAgIC8vIGRlIGxhbmd1YWdlIGZvbGRlclxuICAgKiDilIIgICDilIIgICDilJTilIDilIAgZXhhbXBsZS5odG1sICAgICAvLyBkZSBsb2NhbGl6ZWQgZmlsZVxuICAgKiDilIIgICDilJTilIDilIAgZGUtQVQvICAgICAgICAgICAgICAgLy8gZGUtQVQgbG9jYWxlIGZvbGRlclxuICAgKiDilIIgICDilIIgICDilJTilIDilIAgZXhhbXBsZS5odG1sICAgICAvLyBkZS1BVCBsb2NhbGl6ZWQgZmlsZVxuICAgKlxuICAgKiBGaWxlcyBhcmUgbWF0Y2hlZCB3aXRoIHRoZSBsb2NhbGUgaW4gdGhlIGZvbGxvd2luZyBvcmRlcjpcbiAgICogMS4gTG9jYWxlIG1hdGNoLCBlLmcuIGxvY2FsZSBgZGUtQVRgIG1hdGNoZXMgZmlsZSBpbiBmb2xkZXIgYGRlLUFUYC5cbiAgICogMi4gTGFuZ3VhZ2UgbWF0Y2gsIGUuZy4gbG9jYWxlIGBkZS1BVGAgbWF0Y2hlcyBmaWxlIGluIGZvbGRlciBgZGVgLlxuICAgKiAzLiBEZWZhdWx0OyBmaWxlIGluIGJhc2UgZm9sZGVyIGlzIHJldHVybmVkLlxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gZGVmYXVsdFBhdGggVGhlIGFic29sdXRlIGZpbGUgcGF0aCwgd2hpY2ggaXMgYWxzb1xuICAgKiB0aGUgZGVmYXVsdCBwYXRoIHJldHVybmVkIGlmIGxvY2FsaXphdGlvbiBpcyBub3QgYXZhaWxhYmxlLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gbG9jYWxlIFRoZSBsb2NhbGUuXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPE9iamVjdD59IFRoZSBvYmplY3QgY29udGFpbnM6XG4gICAqIC0gYHBhdGhgOiBUaGUgcGF0aCB0byB0aGUgbG9jYWxpemVkIGZpbGUsIG9yIHRoZSBvcmlnaW5hbCBwYXRoIGlmXG4gICAqICAgbG9jYWxpemF0aW9uIGlzIG5vdCBhdmFpbGFibGUuXG4gICAqIC0gYHN1YmRpcmA6IFRoZSBzdWJkaXJlY3Rvcnkgb2YgdGhlIGxvY2FsaXplZCBmaWxlLCBvciB1bmRlZmluZWQgaWZcbiAgICogICB0aGVyZSBpcyBubyBtYXRjaGluZyBsb2NhbGl6ZWQgZmlsZS5cbiAgICovXG4gIHN0YXRpYyBhc3luYyBnZXRMb2NhbGl6ZWRQYXRoKGRlZmF1bHRQYXRoLCBsb2NhbGUpIHtcbiAgICAvLyBHZXQgZmlsZSBuYW1lIGFuZCBwYXRoc1xuICAgIGNvbnN0IGZpbGUgPSBwYXRoLmJhc2VuYW1lKGRlZmF1bHRQYXRoKTtcbiAgICBjb25zdCBiYXNlUGF0aCA9IHBhdGguZGlybmFtZShkZWZhdWx0UGF0aCk7XG5cbiAgICAvLyBJZiBsb2NhbGUgaXMgbm90IHNldCByZXR1cm4gZGVmYXVsdCBmaWxlXG4gICAgaWYgKCFsb2NhbGUpIHtcbiAgICAgIHJldHVybiB7IHBhdGg6IGRlZmF1bHRQYXRoIH07XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgZmlsZSBmb3IgbG9jYWxlIGV4aXN0c1xuICAgIGNvbnN0IGxvY2FsZVBhdGggPSBwYXRoLmpvaW4oYmFzZVBhdGgsIGxvY2FsZSwgZmlsZSk7XG4gICAgY29uc3QgbG9jYWxlRmlsZUV4aXN0cyA9IGF3YWl0IFV0aWxzLmZpbGVFeGlzdHMobG9jYWxlUGF0aCk7XG5cbiAgICAvLyBJZiBmaWxlIGZvciBsb2NhbGUgZXhpc3RzIHJldHVybiBmaWxlXG4gICAgaWYgKGxvY2FsZUZpbGVFeGlzdHMpIHtcbiAgICAgIHJldHVybiB7IHBhdGg6IGxvY2FsZVBhdGgsIHN1YmRpcjogbG9jYWxlIH07XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgZmlsZSBmb3IgbGFuZ3VhZ2UgZXhpc3RzXG4gICAgY29uc3QgbGFuZ3VhZ2UgPSBsb2NhbGUuc3BsaXQoJy0nKVswXTtcbiAgICBjb25zdCBsYW5ndWFnZVBhdGggPSBwYXRoLmpvaW4oYmFzZVBhdGgsIGxhbmd1YWdlLCBmaWxlKTtcbiAgICBjb25zdCBsYW5ndWFnZUZpbGVFeGlzdHMgPSBhd2FpdCBVdGlscy5maWxlRXhpc3RzKGxhbmd1YWdlUGF0aCk7XG5cbiAgICAvLyBJZiBmaWxlIGZvciBsYW5ndWFnZSBleGlzdHMgcmV0dXJuIGZpbGVcbiAgICBpZiAobGFuZ3VhZ2VGaWxlRXhpc3RzKSB7XG4gICAgICByZXR1cm4geyBwYXRoOiBsYW5ndWFnZVBhdGgsIHN1YmRpcjogbGFuZ3VhZ2UgfTtcbiAgICB9XG5cbiAgICAvLyBSZXR1cm4gZGVmYXVsdCBmaWxlXG4gICAgcmV0dXJuIHsgcGF0aDogZGVmYXVsdFBhdGggfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBAZnVuY3Rpb24gZmlsZUV4aXN0c1xuICAgKiBAZGVzY3JpcHRpb24gQ2hlY2tzIHdoZXRoZXIgYSBmaWxlIGV4aXN0cy5cbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIGZpbGUgcGF0aC5cbiAgICogQHJldHVybnMge1Byb21pc2U8Qm9vbGVhbj59IElzIHRydWUgaWYgdGhlIGZpbGUgY2FuIGJlIGFjY2Vzc2VkLCBmYWxzZSBvdGhlcndpc2UuXG4gICAqL1xuICBzdGF0aWMgYXN5bmMgZmlsZUV4aXN0cyhwYXRoKSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGZzLmFjY2VzcyhwYXRoKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQGZ1bmN0aW9uIGlzUGF0aFxuICAgKiBAZGVzY3JpcHRpb24gRXZhbHVhdGVzIHdoZXRoZXIgYSBzdHJpbmcgaXMgYSBmaWxlIHBhdGggKGFzIG9wcG9zZWQgdG8gYSBVUkwgZm9yIGV4YW1wbGUpLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcyBUaGUgc3RyaW5nIHRvIGV2YWx1YXRlLlxuICAgKiBAcmV0dXJucyB7Qm9vbGVhbn0gUmV0dXJucyB0cnVlIGlmIHRoZSBldmFsdWF0ZWQgc3RyaW5nIGlzIGEgcGF0aC5cbiAgICovXG4gIHN0YXRpYyBpc1BhdGgocykge1xuICAgIHJldHVybiAvKF5cXC8pfCheXFwuXFwvKXwoXlxcLlxcLlxcLykvLnRlc3Qocyk7XG4gIH1cblxuICAvKipcbiAgICogRmxhdHRlbnMgYW4gb2JqZWN0IGFuZCBjcmF0ZXMgbmV3IGtleXMgd2l0aCBjdXN0b20gZGVsaW1pdGVycy5cbiAgICogQHBhcmFtIHtPYmplY3R9IG9iaiBUaGUgb2JqZWN0IHRvIGZsYXR0ZW4uXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBbZGVsaW1pdGVyPScuJ10gVGhlIGRlbGltaXRlciBvZiB0aGUgbmV3bHkgZ2VuZXJhdGVkIGtleXMuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXN1bHRcbiAgICogQHJldHVybnMge09iamVjdH0gVGhlIGZsYXR0ZW5lZCBvYmplY3QuXG4gICAqKi9cbiAgc3RhdGljIGZsYXR0ZW5PYmplY3Qob2JqLCBwYXJlbnRLZXksIGRlbGltaXRlciA9ICcuJywgcmVzdWx0ID0ge30pIHtcbiAgICBmb3IgKGNvbnN0IGtleSBpbiBvYmopIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpKSB7XG4gICAgICAgIGNvbnN0IG5ld0tleSA9IHBhcmVudEtleSA/IHBhcmVudEtleSArIGRlbGltaXRlciArIGtleSA6IGtleTtcblxuICAgICAgICBpZiAodHlwZW9mIG9ialtrZXldID09PSAnb2JqZWN0JyAmJiBvYmpba2V5XSAhPT0gbnVsbCkge1xuICAgICAgICAgIHRoaXMuZmxhdHRlbk9iamVjdChvYmpba2V5XSwgbmV3S2V5LCBkZWxpbWl0ZXIsIHJlc3VsdCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmVzdWx0W25ld0tleV0gPSBvYmpba2V5XTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIERldGVybWluZXMgd2hldGhlciBhbiBvYmplY3QgaXMgYSBQcm9taXNlLlxuICAgKiBAcGFyYW0ge2FueX0gb2JqZWN0IFRoZSBvYmplY3QgdG8gdmFsaWRhdGUuXG4gICAqIEByZXR1cm5zIHtCb29sZWFufSBSZXR1cm5zIHRydWUgaWYgdGhlIG9iamVjdCBpcyBhIHByb21pc2UuXG4gICAqL1xuICBzdGF0aWMgaXNQcm9taXNlKG9iamVjdCkge1xuICAgIHJldHVybiBvYmplY3QgaW5zdGFuY2VvZiBQcm9taXNlO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYW4gb2JqZWN0IHdpdGggYWxsIHBlcm11dGF0aW9ucyBvZiB0aGUgb3JpZ2luYWwga2V5cy5cbiAgICogRm9yIGV4YW1wbGUsIHRoaXMgZGVmaW5pdGlvbjpcbiAgICogYGBgXG4gICAqIHtcbiAgICogICBhOiBbdHJ1ZSwgZmFsc2VdLFxuICAgKiAgIGI6IFsxLCAyXSxcbiAgICogICBjOiBbJ3gnXVxuICAgKiB9XG4gICAqIGBgYFxuICAgKiBwZXJtdXRhdGVzIHRvOlxuICAgKiBgYGBcbiAgICogW1xuICAgKiAgIHsgYTogdHJ1ZSwgYjogMSwgYzogJ3gnIH0sXG4gICAqICAgeyBhOiB0cnVlLCBiOiAyLCBjOiAneCcgfSxcbiAgICogICB7IGE6IGZhbHNlLCBiOiAxLCBjOiAneCcgfSxcbiAgICogICB7IGE6IGZhbHNlLCBiOiAyLCBjOiAneCcgfVxuICAgKiBdXG4gICAqIGBgYFxuICAgKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdG8gcGVybXV0YXRlLlxuICAgKiBAcGFyYW0ge0ludGVnZXJ9IFtpbmRleD0wXSBUaGUgY3VycmVudCBrZXkgaW5kZXguXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbY3VycmVudD17fV0gVGhlIGN1cnJlbnQgcmVzdWx0IGVudHJ5IGJlaW5nIGNvbXBvc2VkLlxuICAgKiBAcGFyYW0ge0FycmF5fSBbcmVzdWx0cz1bXV0gVGhlIHJlc3VsdGluZyBhcnJheSBvZiBwZXJtdXRhdGlvbnMuXG4gICAqL1xuICBzdGF0aWMgZ2V0T2JqZWN0S2V5UGVybXV0YXRpb25zKG9iamVjdCwgaW5kZXggPSAwLCBjdXJyZW50ID0ge30sIHJlc3VsdHMgPSBbXSkge1xuICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyhvYmplY3QpO1xuICAgIGNvbnN0IGtleSA9IGtleXNbaW5kZXhdO1xuICAgIGNvbnN0IHZhbHVlcyA9IG9iamVjdFtrZXldO1xuXG4gICAgZm9yIChjb25zdCB2YWx1ZSBvZiB2YWx1ZXMpIHtcbiAgICAgIGN1cnJlbnRba2V5XSA9IHZhbHVlO1xuICAgICAgY29uc3QgbmV4dEluZGV4ID0gaW5kZXggKyAxO1xuXG4gICAgICBpZiAobmV4dEluZGV4IDwga2V5cy5sZW5ndGgpIHtcbiAgICAgICAgVXRpbHMuZ2V0T2JqZWN0S2V5UGVybXV0YXRpb25zKG9iamVjdCwgbmV4dEluZGV4LCBjdXJyZW50LCByZXN1bHRzKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IE9iamVjdC5hc3NpZ24oe30sIGN1cnJlbnQpO1xuICAgICAgICByZXN1bHRzLnB1c2gocmVzdWx0KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH1cblxuICAvKipcbiAgICogVmFsaWRhdGVzIHBhcmFtZXRlcnMgYW5kIHRocm93cyBpZiBhIHBhcmFtZXRlciBpcyBpbnZhbGlkLlxuICAgKiBFeGFtcGxlIHBhcmFtZXRlciB0eXBlcyBzeW50YXg6XG4gICAqIGBgYFxuICAgKiB7XG4gICAqICAgcGFyYW1ldGVyTmFtZToge1xuICAgKiAgICAgIHQ6ICdib29sZWFuJyxcbiAgICogICAgICB2OiBpc0Jvb2xlYW4sXG4gICAqICAgICAgbzogdHJ1ZVxuICAgKiAgIH0sXG4gICAqICAgLi4uXG4gICAqIH1cbiAgICogYGBgXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBwYXJhbXMgVGhlIHBhcmFtZXRlcnMgdG8gdmFsaWRhdGUuXG4gICAqIEBwYXJhbSB7QXJyYXk8T2JqZWN0Pn0gdHlwZXMgVGhlIHBhcmFtZXRlciB0eXBlcyB1c2VkIGZvciB2YWxpZGF0aW9uLlxuICAgKiBAcGFyYW0ge09iamVjdH0gdHlwZXMudCBUaGUgcGFyYW1ldGVyIHR5cGU7IHVzZWQgZm9yIGVycm9yIG1lc3NhZ2UsIG5vdCBmb3IgdmFsaWRhdGlvbi5cbiAgICogQHBhcmFtIHtPYmplY3R9IHR5cGVzLnYgVGhlIGZ1bmN0aW9uIHRvIHZhbGlkYXRlIHRoZSBwYXJhbWV0ZXIgdmFsdWUuXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gW3R5cGVzLm89ZmFsc2VdIElzIHRydWUgaWYgdGhlIHBhcmFtZXRlciBpcyBvcHRpb25hbC5cbiAgICovXG4gIHN0YXRpYyB2YWxpZGF0ZVBhcmFtcyhwYXJhbXMsIHR5cGVzKSB7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMocGFyYW1zKSkge1xuICAgICAgY29uc3QgdHlwZSA9IHR5cGVzW2tleV07XG4gICAgICBjb25zdCBpc09wdGlvbmFsID0gISF0eXBlLm87XG4gICAgICBjb25zdCBwYXJhbSA9IHBhcmFtc1trZXldO1xuICAgICAgaWYgKCEoaXNPcHRpb25hbCAmJiBwYXJhbSA9PSBudWxsKSAmJiAhdHlwZS52KHBhcmFtKSkge1xuICAgICAgICB0aHJvdyBgSW52YWxpZCBwYXJhbWV0ZXIgJHtrZXl9IG11c3QgYmUgb2YgdHlwZSAke3R5cGUudH0gYnV0IGlzICR7dHlwZW9mIHBhcmFtfWA7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIENvbXB1dGVzIHRoZSByZWxhdGl2ZSBkYXRlIGJhc2VkIG9uIGEgc3RyaW5nLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gdGV4dCBUaGUgc3RyaW5nIHRvIGludGVycHJldCB0aGUgZGF0ZSBmcm9tLlxuICAgKiBAcGFyYW0ge0RhdGV9IG5vdyBUaGUgZGF0ZSB0aGUgc3RyaW5nIGlzIGNvbXBhcmluZyBhZ2FpbnN0LlxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgcmVsYXRpdmUgZGF0ZSBvYmplY3QuXG4gICAqKi9cbiAgc3RhdGljIHJlbGF0aXZlVGltZVRvRGF0ZSh0ZXh0LCBub3cgPSBuZXcgRGF0ZSgpKSB7XG4gICAgdGV4dCA9IHRleHQudG9Mb3dlckNhc2UoKTtcbiAgICBsZXQgcGFydHMgPSB0ZXh0LnNwbGl0KCcgJyk7XG5cbiAgICAvLyBGaWx0ZXIgb3V0IHdoaXRlc3BhY2VcbiAgICBwYXJ0cyA9IHBhcnRzLmZpbHRlcihwYXJ0ID0+IHBhcnQgIT09ICcnKTtcblxuICAgIGNvbnN0IGZ1dHVyZSA9IHBhcnRzWzBdID09PSAnaW4nO1xuICAgIGNvbnN0IHBhc3QgPSBwYXJ0c1twYXJ0cy5sZW5ndGggLSAxXSA9PT0gJ2Fnbyc7XG5cbiAgICBpZiAoIWZ1dHVyZSAmJiAhcGFzdCAmJiB0ZXh0ICE9PSAnbm93Jykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzOiAnZXJyb3InLFxuICAgICAgICBpbmZvOiBcIlRpbWUgc2hvdWxkIGVpdGhlciBzdGFydCB3aXRoICdpbicgb3IgZW5kIHdpdGggJ2FnbydcIixcbiAgICAgIH07XG4gICAgfVxuXG4gICAgaWYgKGZ1dHVyZSAmJiBwYXN0KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICAgIGluZm86IFwiVGltZSBjYW5ub3QgaGF2ZSBib3RoICdpbicgYW5kICdhZ28nXCIsXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIHN0cmlwIHRoZSAnYWdvJyBvciAnaW4nXG4gICAgaWYgKGZ1dHVyZSkge1xuICAgICAgcGFydHMgPSBwYXJ0cy5zbGljZSgxKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gcGFzdFxuICAgICAgcGFydHMgPSBwYXJ0cy5zbGljZSgwLCBwYXJ0cy5sZW5ndGggLSAxKTtcbiAgICB9XG5cbiAgICBpZiAocGFydHMubGVuZ3RoICUgMiAhPT0gMCAmJiB0ZXh0ICE9PSAnbm93Jykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzOiAnZXJyb3InLFxuICAgICAgICBpbmZvOiAnSW52YWxpZCB0aW1lIHN0cmluZy4gRGFuZ2xpbmcgdW5pdCBvciBudW1iZXIuJyxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgcGFpcnMgPSBbXTtcbiAgICB3aGlsZSAocGFydHMubGVuZ3RoKSB7XG4gICAgICBwYWlycy5wdXNoKFtwYXJ0cy5zaGlmdCgpLCBwYXJ0cy5zaGlmdCgpXSk7XG4gICAgfVxuXG4gICAgbGV0IHNlY29uZHMgPSAwO1xuICAgIGZvciAoY29uc3QgW251bSwgaW50ZXJ2YWxdIG9mIHBhaXJzKSB7XG4gICAgICBjb25zdCB2YWwgPSBOdW1iZXIobnVtKTtcbiAgICAgIGlmICghTnVtYmVyLmlzSW50ZWdlcih2YWwpKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgc3RhdHVzOiAnZXJyb3InLFxuICAgICAgICAgIGluZm86IGAnJHtudW19JyBpcyBub3QgYW4gaW50ZWdlci5gLFxuICAgICAgICB9O1xuICAgICAgfVxuXG4gICAgICBzd2l0Y2ggKGludGVydmFsKSB7XG4gICAgICAgIGNhc2UgJ3lyJzpcbiAgICAgICAgY2FzZSAneXJzJzpcbiAgICAgICAgY2FzZSAneWVhcic6XG4gICAgICAgIGNhc2UgJ3llYXJzJzpcbiAgICAgICAgICBzZWNvbmRzICs9IHZhbCAqIDMxNTM2MDAwOyAvLyAzNjUgKiAyNCAqIDYwICogNjBcbiAgICAgICAgICBicmVhaztcblxuICAgICAgICBjYXNlICd3ayc6XG4gICAgICAgIGNhc2UgJ3drcyc6XG4gICAgICAgIGNhc2UgJ3dlZWsnOlxuICAgICAgICBjYXNlICd3ZWVrcyc6XG4gICAgICAgICAgc2Vjb25kcyArPSB2YWwgKiA2MDQ4MDA7IC8vIDcgKiAyNCAqIDYwICogNjBcbiAgICAgICAgICBicmVhaztcblxuICAgICAgICBjYXNlICdkJzpcbiAgICAgICAgY2FzZSAnZGF5JzpcbiAgICAgICAgY2FzZSAnZGF5cyc6XG4gICAgICAgICAgc2Vjb25kcyArPSB2YWwgKiA4NjQwMDsgLy8gMjQgKiA2MCAqIDYwXG4gICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgY2FzZSAnaHInOlxuICAgICAgICBjYXNlICdocnMnOlxuICAgICAgICBjYXNlICdob3VyJzpcbiAgICAgICAgY2FzZSAnaG91cnMnOlxuICAgICAgICAgIHNlY29uZHMgKz0gdmFsICogMzYwMDsgLy8gNjAgKiA2MFxuICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGNhc2UgJ21pbic6XG4gICAgICAgIGNhc2UgJ21pbnMnOlxuICAgICAgICBjYXNlICdtaW51dGUnOlxuICAgICAgICBjYXNlICdtaW51dGVzJzpcbiAgICAgICAgICBzZWNvbmRzICs9IHZhbCAqIDYwO1xuICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGNhc2UgJ3NlYyc6XG4gICAgICAgIGNhc2UgJ3NlY3MnOlxuICAgICAgICBjYXNlICdzZWNvbmQnOlxuICAgICAgICBjYXNlICdzZWNvbmRzJzpcbiAgICAgICAgICBzZWNvbmRzICs9IHZhbDtcbiAgICAgICAgICBicmVhaztcblxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICAgICAgICBpbmZvOiBgSW52YWxpZCBpbnRlcnZhbDogJyR7aW50ZXJ2YWx9J2AsXG4gICAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBtaWxsaXNlY29uZHMgPSBzZWNvbmRzICogMTAwMDtcbiAgICBpZiAoZnV0dXJlKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdzdWNjZXNzJyxcbiAgICAgICAgaW5mbzogJ2Z1dHVyZScsXG4gICAgICAgIHJlc3VsdDogbmV3IERhdGUobm93LnZhbHVlT2YoKSArIG1pbGxpc2Vjb25kcyksXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAocGFzdCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzOiAnc3VjY2VzcycsXG4gICAgICAgIGluZm86ICdwYXN0JyxcbiAgICAgICAgcmVzdWx0OiBuZXcgRGF0ZShub3cudmFsdWVPZigpIC0gbWlsbGlzZWNvbmRzKSxcbiAgICAgIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1czogJ3N1Y2Nlc3MnLFxuICAgICAgICBpbmZvOiAncHJlc2VudCcsXG4gICAgICAgIHJlc3VsdDogbmV3IERhdGUobm93LnZhbHVlT2YoKSksXG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBEZWVwLXNjYW5zIGFuIG9iamVjdCBmb3IgYSBtYXRjaGluZyBrZXkvdmFsdWUgZGVmaW5pdGlvbi5cbiAgICogQHBhcmFtIHtPYmplY3R9IG9iaiBUaGUgb2JqZWN0IHRvIHNjYW4uXG4gICAqIEBwYXJhbSB7U3RyaW5nIHwgdW5kZWZpbmVkfSBrZXkgVGhlIGtleSB0byBtYXRjaCwgb3IgdW5kZWZpbmVkIGlmIG9ubHkgdGhlIHZhbHVlIHNob3VsZCBiZSBtYXRjaGVkLlxuICAgKiBAcGFyYW0ge2FueSB8IHVuZGVmaW5lZH0gdmFsdWUgVGhlIHZhbHVlIHRvIG1hdGNoLCBvciB1bmRlZmluZWQgaWYgb25seSB0aGUga2V5IHNob3VsZCBiZSBtYXRjaGVkLlxuICAgKiBAcmV0dXJucyB7Qm9vbGVhbn0gVHJ1ZSBpZiBhIG1hdGNoIHdhcyBmb3VuZCwgZmFsc2Ugb3RoZXJ3aXNlLlxuICAgKi9cbiAgc3RhdGljIG9iamVjdENvbnRhaW5zS2V5VmFsdWUob2JqLCBrZXksIHZhbHVlKSB7XG4gICAgY29uc3QgaXNNYXRjaCA9IChhLCBiKSA9PiAodHlwZW9mIGEgPT09ICdzdHJpbmcnICYmIG5ldyBSZWdFeHAoYikudGVzdChhKSkgfHwgYSA9PT0gYjtcbiAgICBjb25zdCBpc0tleU1hdGNoID0gayA9PiBpc01hdGNoKGssIGtleSk7XG4gICAgY29uc3QgaXNWYWx1ZU1hdGNoID0gdiA9PiBpc01hdGNoKHYsIHZhbHVlKTtcbiAgICBmb3IgKGNvbnN0IFtrLCB2XSBvZiBPYmplY3QuZW50cmllcyhvYmopKSB7XG4gICAgICBpZiAoa2V5ICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgPT09IHVuZGVmaW5lZCAmJiBpc0tleU1hdGNoKGspKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfSBlbHNlIGlmIChrZXkgPT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIGlzVmFsdWVNYXRjaCh2KSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0gZWxzZSBpZiAoa2V5ICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IHVuZGVmaW5lZCAmJiBpc0tleU1hdGNoKGspICYmIGlzVmFsdWVNYXRjaCh2KSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICAgIGlmIChbJ1tvYmplY3QgT2JqZWN0XScsICdbb2JqZWN0IEFycmF5XSddLmluY2x1ZGVzKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2KSkpIHtcbiAgICAgICAgcmV0dXJuIFV0aWxzLm9iamVjdENvbnRhaW5zS2V5VmFsdWUodiwga2V5LCB2YWx1ZSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHN0YXRpYyBjaGVja1Byb2hpYml0ZWRLZXl3b3Jkcyhjb25maWcsIGRhdGEpIHtcbiAgICBpZiAoY29uZmlnPy5yZXF1ZXN0S2V5d29yZERlbnlsaXN0KSB7XG4gICAgICAvLyBTY2FuIHJlcXVlc3QgZGF0YSBmb3IgZGVuaWVkIGtleXdvcmRzXG4gICAgICBmb3IgKGNvbnN0IGtleXdvcmQgb2YgY29uZmlnLnJlcXVlc3RLZXl3b3JkRGVueWxpc3QpIHtcbiAgICAgICAgY29uc3QgbWF0Y2ggPSBVdGlscy5vYmplY3RDb250YWluc0tleVZhbHVlKGRhdGEsIGtleXdvcmQua2V5LCBrZXl3b3JkLnZhbHVlKTtcbiAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgdGhyb3cgYFByb2hpYml0ZWQga2V5d29yZCBpbiByZXF1ZXN0IGRhdGE6ICR7SlNPTi5zdHJpbmdpZnkoa2V5d29yZCl9LmA7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBVdGlscztcbiJdLCJtYXBwaW5ncyI6Ijs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNB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