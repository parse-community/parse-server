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

}

module.exports = Utils;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9VdGlscy5qcyJdLCJuYW1lcyI6WyJwYXRoIiwicmVxdWlyZSIsImZzIiwicHJvbWlzZXMiLCJVdGlscyIsImdldExvY2FsaXplZFBhdGgiLCJkZWZhdWx0UGF0aCIsImxvY2FsZSIsImZpbGUiLCJiYXNlbmFtZSIsImJhc2VQYXRoIiwiZGlybmFtZSIsImxvY2FsZVBhdGgiLCJqb2luIiwibG9jYWxlRmlsZUV4aXN0cyIsImZpbGVFeGlzdHMiLCJzdWJkaXIiLCJsYW5ndWFnZSIsInNwbGl0IiwibGFuZ3VhZ2VQYXRoIiwibGFuZ3VhZ2VGaWxlRXhpc3RzIiwiYWNjZXNzIiwiZSIsImlzUGF0aCIsInMiLCJ0ZXN0IiwiZmxhdHRlbk9iamVjdCIsIm9iaiIsInBhcmVudEtleSIsImRlbGltaXRlciIsInJlc3VsdCIsImtleSIsIk9iamVjdCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsIm5ld0tleSIsImlzUHJvbWlzZSIsIm9iamVjdCIsIlByb21pc2UiLCJnZXRPYmplY3RLZXlQZXJtdXRhdGlvbnMiLCJpbmRleCIsImN1cnJlbnQiLCJyZXN1bHRzIiwia2V5cyIsInZhbHVlcyIsInZhbHVlIiwibmV4dEluZGV4IiwibGVuZ3RoIiwiYXNzaWduIiwicHVzaCIsInZhbGlkYXRlUGFyYW1zIiwicGFyYW1zIiwidHlwZXMiLCJ0eXBlIiwiaXNPcHRpb25hbCIsIm8iLCJwYXJhbSIsInYiLCJ0IiwicmVsYXRpdmVUaW1lVG9EYXRlIiwidGV4dCIsIm5vdyIsIkRhdGUiLCJ0b0xvd2VyQ2FzZSIsInBhcnRzIiwiZmlsdGVyIiwicGFydCIsImZ1dHVyZSIsInBhc3QiLCJzdGF0dXMiLCJpbmZvIiwic2xpY2UiLCJwYWlycyIsInNoaWZ0Iiwic2Vjb25kcyIsIm51bSIsImludGVydmFsIiwidmFsIiwiTnVtYmVyIiwiaXNJbnRlZ2VyIiwibWlsbGlzZWNvbmRzIiwidmFsdWVPZiIsIm1vZHVsZSIsImV4cG9ydHMiXSwibWFwcGlu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ekMsUUFBQUEsTUFBTSxFQUFFLElBQUlpQyxJQUFKLENBQVNELEdBQUcsQ0FBQ29CLE9BQUosRUFBVDtBQUhILE9BQVA7QUFLRDtBQUNGOztBQWpVUzs7QUFvVVpDLE1BQU0sQ0FBQ0MsT0FBUCxHQUFpQmhGLEtBQWpCIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiB1dGlscy5qc1xuICogQGZpbGUgR2VuZXJhbCBwdXJwb3NlIHV0aWxpdGllc1xuICogQGRlc2NyaXB0aW9uIEdlbmVyYWwgcHVycG9zZSB1dGlsaXRpZXMuXG4gKi9cblxuY29uc3QgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKTtcbmNvbnN0IGZzID0gcmVxdWlyZSgnZnMnKS5wcm9taXNlcztcblxuLyoqXG4gKiBUaGUgZ2VuZXJhbCBwdXJwb3NlIHV0aWxpdGllcy5cbiAqL1xuY2xhc3MgVXRpbHMge1xuICAvKipcbiAgICogQGZ1bmN0aW9uIGdldExvY2FsaXplZFBhdGhcbiAgICogQGRlc2NyaXB0aW9uIFJldHVybnMgYSBsb2NhbGl6ZWQgZmlsZSBwYXRoIGFjY29yaW5nIHRvIHRoZSBsb2NhbGUuXG4gICAqXG4gICAqIExvY2FsaXplZCBmaWxlcyBhcmUgc2VhcmNoZWQgaW4gc3ViZm9sZGVycyBvZiBhIGdpdmVuIHBhdGgsIGUuZy5cbiAgICpcbiAgICogcm9vdC9cbiAgICog4pSc4pSA4pSAIGJhc2UvICAgICAgICAgICAgICAgICAgICAvLyBiYXNlIHBhdGggdG8gZmlsZXNcbiAgICog4pSCICAg4pSc4pSA4pSAIGV4YW1wbGUuaHRtbCAgICAgICAgIC8vIGRlZmF1bHQgZmlsZVxuICAgKiDilIIgICDilJTilIDilIAgZGUvICAgICAgICAgICAgICAgICAgLy8gZGUgbGFuZ3VhZ2UgZm9sZGVyXG4gICAqIOKUgiAgIOKUgiAgIOKUlOKUgOKUgCBleGFtcGxlLmh0bWwgICAgIC8vIGRlIGxvY2FsaXplZCBmaWxlXG4gICAqIOKUgiAgIOKUlOKUgOKUgCBkZS1BVC8gICAgICAgICAgICAgICAvLyBkZS1BVCBsb2NhbGUgZm9sZGVyXG4gICAqIOKUgiAgIOKUgiAgIOKUlOKUgOKUgCBleGFtcGxlLmh0bWwgICAgIC8vIGRlLUFUIGxvY2FsaXplZCBmaWxlXG4gICAqXG4gICAqIEZpbGVzIGFyZSBtYXRjaGVkIHdpdGggdGhlIGxvY2FsZSBpbiB0aGUgZm9sbG93aW5nIG9yZGVyOlxuICAgKiAxLiBMb2NhbGUgbWF0Y2gsIGUuZy4gbG9jYWxlIGBkZS1BVGAgbWF0Y2hlcyBmaWxlIGluIGZvbGRlciBgZGUtQVRgLlxuICAgKiAyLiBMYW5ndWFnZSBtYXRjaCwgZS5nLiBsb2NhbGUgYGRlLUFUYCBtYXRjaGVzIGZpbGUgaW4gZm9sZGVyIGBkZWAuXG4gICAqIDMuIERlZmF1bHQ7IGZpbGUgaW4gYmFzZSBmb2xkZXIgaXMgcmV0dXJuZWQuXG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBkZWZhdWx0UGF0aCBUaGUgYWJzb2x1dGUgZmlsZSBwYXRoLCB3aGljaCBpcyBhbHNvXG4gICAqIHRoZSBkZWZhdWx0IHBhdGggcmV0dXJuZWQgaWYgbG9jYWxpemF0aW9uIGlzIG5vdCBhdmFpbGFibGUuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBsb2NhbGUgVGhlIGxvY2FsZS5cbiAgICogQHJldHVybnMge1Byb21pc2U8T2JqZWN0Pn0gVGhlIG9iamVjdCBjb250YWluczpcbiAgICogLSBgcGF0aGA6IFRoZSBwYXRoIHRvIHRoZSBsb2NhbGl6ZWQgZmlsZSwgb3IgdGhlIG9yaWdpbmFsIHBhdGggaWZcbiAgICogICBsb2NhbGl6YXRpb24gaXMgbm90IGF2YWlsYWJsZS5cbiAgICogLSBgc3ViZGlyYDogVGhlIHN1YmRpcmVjdG9yeSBvZiB0aGUgbG9jYWxpemVkIGZpbGUsIG9yIHVuZGVmaW5lZCBpZlxuICAgKiAgIHRoZXJlIGlzIG5vIG1hdGNoaW5nIGxvY2FsaXplZCBmaWxlLlxuICAgKi9cbiAgc3RhdGljIGFzeW5jIGdldExvY2FsaXplZFBhdGgoZGVmYXVsdFBhdGgsIGxvY2FsZSkge1xuICAgIC8vIEdldCBmaWxlIG5hbWUgYW5kIHBhdGhzXG4gICAgY29uc3QgZmlsZSA9IHBhdGguYmFzZW5hbWUoZGVmYXVsdFBhdGgpO1xuICAgIGNvbnN0IGJhc2VQYXRoID0gcGF0aC5kaXJuYW1lKGRlZmF1bHRQYXRoKTtcblxuICAgIC8vIElmIGxvY2FsZSBpcyBub3Qgc2V0IHJldHVybiBkZWZhdWx0IGZpbGVcbiAgICBpZiAoIWxvY2FsZSkge1xuICAgICAgcmV0dXJuIHsgcGF0aDogZGVmYXVsdFBhdGggfTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBmaWxlIGZvciBsb2NhbGUgZXhpc3RzXG4gICAgY29uc3QgbG9jYWxlUGF0aCA9IHBhdGguam9pbihiYXNlUGF0aCwgbG9jYWxlLCBmaWxlKTtcbiAgICBjb25zdCBsb2NhbGVGaWxlRXhpc3RzID0gYXdhaXQgVXRpbHMuZmlsZUV4aXN0cyhsb2NhbGVQYXRoKTtcblxuICAgIC8vIElmIGZpbGUgZm9yIGxvY2FsZSBleGlzdHMgcmV0dXJuIGZpbGVcbiAgICBpZiAobG9jYWxlRmlsZUV4aXN0cykge1xuICAgICAgcmV0dXJuIHsgcGF0aDogbG9jYWxlUGF0aCwgc3ViZGlyOiBsb2NhbGUgfTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBmaWxlIGZvciBsYW5ndWFnZSBleGlzdHNcbiAgICBjb25zdCBsYW5ndWFnZSA9IGxvY2FsZS5zcGxpdCgnLScpWzBdO1xuICAgIGNvbnN0IGxhbmd1YWdlUGF0aCA9IHBhdGguam9pbihiYXNlUGF0aCwgbGFuZ3VhZ2UsIGZpbGUpO1xuICAgIGNvbnN0IGxhbmd1YWdlRmlsZUV4aXN0cyA9IGF3YWl0IFV0aWxzLmZpbGVFeGlzdHMobGFuZ3VhZ2VQYXRoKTtcblxuICAgIC8vIElmIGZpbGUgZm9yIGxhbmd1YWdlIGV4aXN0cyByZXR1cm4gZmlsZVxuICAgIGlmIChsYW5ndWFnZUZpbGVFeGlzdHMpIHtcbiAgICAgIHJldHVybiB7IHBhdGg6IGxhbmd1YWdlUGF0aCwgc3ViZGlyOiBsYW5ndWFnZSB9O1xuICAgIH1cblxuICAgIC8vIFJldHVybiBkZWZhdWx0IGZpbGVcbiAgICByZXR1cm4geyBwYXRoOiBkZWZhdWx0UGF0aCB9O1xuICB9XG5cbiAgLyoqXG4gICAqIEBmdW5jdGlvbiBmaWxlRXhpc3RzXG4gICAqIEBkZXNjcmlwdGlvbiBDaGVja3Mgd2hldGhlciBhIGZpbGUgZXhpc3RzLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aCBUaGUgZmlsZSBwYXRoLlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZTxCb29sZWFuPn0gSXMgdHJ1ZSBpZiB0aGUgZmlsZSBjYW4gYmUgYWNjZXNzZWQsIGZhbHNlIG90aGVyd2lzZS5cbiAgICovXG4gIHN0YXRpYyBhc3luYyBmaWxlRXhpc3RzKHBhdGgpIHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgZnMuYWNjZXNzKHBhdGgpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBAZnVuY3Rpb24gaXNQYXRoXG4gICAqIEBkZXNjcmlwdGlvbiBFdmFsdWF0ZXMgd2hldGhlciBhIHN0cmluZyBpcyBhIGZpbGUgcGF0aCAoYXMgb3Bwb3NlZCB0byBhIFVSTCBmb3IgZXhhbXBsZSkuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBzIFRoZSBzdHJpbmcgdG8gZXZhbHVhdGUuXG4gICAqIEByZXR1cm5zIHtCb29sZWFufSBSZXR1cm5zIHRydWUgaWYgdGhlIGV2YWx1YXRlZCBzdHJpbmcgaXMgYSBwYXRoLlxuICAgKi9cbiAgc3RhdGljIGlzUGF0aChzKSB7XG4gICAgcmV0dXJuIC8oXlxcLyl8KF5cXC5cXC8pfCheXFwuXFwuXFwvKS8udGVzdChzKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBGbGF0dGVucyBhbiBvYmplY3QgYW5kIGNyYXRlcyBuZXcga2V5cyB3aXRoIGN1c3RvbSBkZWxpbWl0ZXJzLlxuICAgKiBAcGFyYW0ge09iamVjdH0gb2JqIFRoZSBvYmplY3QgdG8gZmxhdHRlbi5cbiAgICogQHBhcmFtIHtTdHJpbmd9IFtkZWxpbWl0ZXI9Jy4nXSBUaGUgZGVsaW1pdGVyIG9mIHRoZSBuZXdseSBnZW5lcmF0ZWQga2V5cy5cbiAgICogQHBhcmFtIHtPYmplY3R9IHJlc3VsdFxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgZmxhdHRlbmVkIG9iamVjdC5cbiAgICoqL1xuICBzdGF0aWMgZmxhdHRlbk9iamVjdChvYmosIHBhcmVudEtleSwgZGVsaW1pdGVyID0gJy4nLCByZXN1bHQgPSB7fSkge1xuICAgIGZvciAoY29uc3Qga2V5IGluIG9iaikge1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSkpIHtcbiAgICAgICAgY29uc3QgbmV3S2V5ID0gcGFyZW50S2V5ID8gcGFyZW50S2V5ICsgZGVsaW1pdGVyICsga2V5IDoga2V5O1xuXG4gICAgICAgIGlmICh0eXBlb2Ygb2JqW2tleV0gPT09ICdvYmplY3QnICYmIG9ialtrZXldICE9PSBudWxsKSB7XG4gICAgICAgICAgdGhpcy5mbGF0dGVuT2JqZWN0KG9ialtrZXldLCBuZXdLZXksIGRlbGltaXRlciwgcmVzdWx0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXN1bHRbbmV3S2V5XSA9IG9ialtrZXldO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogRGV0ZXJtaW5lcyB3aGV0aGVyIGFuIG9iamVjdCBpcyBhIFByb21pc2UuXG4gICAqIEBwYXJhbSB7YW55fSBvYmplY3QgVGhlIG9iamVjdCB0byB2YWxpZGF0ZS5cbiAgICogQHJldHVybnMge0Jvb2xlYW59IFJldHVybnMgdHJ1ZSBpZiB0aGUgb2JqZWN0IGlzIGEgcHJvbWlzZS5cbiAgICovXG4gIHN0YXRpYyBpc1Byb21pc2Uob2JqZWN0KSB7XG4gICAgcmV0dXJuIG9iamVjdCBpbnN0YW5jZW9mIFByb21pc2U7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlcyBhbiBvYmplY3Qgd2l0aCBhbGwgcGVybXV0YXRpb25zIG9mIHRoZSBvcmlnaW5hbCBrZXlzLlxuICAgKiBGb3IgZXhhbXBsZSwgdGhpcyBkZWZpbml0aW9uOlxuICAgKiBgYGBcbiAgICoge1xuICAgKiAgIGE6IFt0cnVlLCBmYWxzZV0sXG4gICAqICAgYjogWzEsIDJdLFxuICAgKiAgIGM6IFsneCddXG4gICAqIH1cbiAgICogYGBgXG4gICAqIHBlcm11dGF0ZXMgdG86XG4gICAqIGBgYFxuICAgKiBbXG4gICAqICAgeyBhOiB0cnVlLCBiOiAxLCBjOiAneCcgfSxcbiAgICogICB7IGE6IHRydWUsIGI6IDIsIGM6ICd4JyB9LFxuICAgKiAgIHsgYTogZmFsc2UsIGI6IDEsIGM6ICd4JyB9LFxuICAgKiAgIHsgYTogZmFsc2UsIGI6IDIsIGM6ICd4JyB9XG4gICAqIF1cbiAgICogYGBgXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBwZXJtdXRhdGUuXG4gICAqIEBwYXJhbSB7SW50ZWdlcn0gW2luZGV4PTBdIFRoZSBjdXJyZW50IGtleSBpbmRleC5cbiAgICogQHBhcmFtIHtPYmplY3R9IFtjdXJyZW50PXt9XSBUaGUgY3VycmVudCByZXN1bHQgZW50cnkgYmVpbmcgY29tcG9zZWQuXG4gICAqIEBwYXJhbSB7QXJyYXl9IFtyZXN1bHRzPVtdXSBUaGUgcmVzdWx0aW5nIGFycmF5IG9mIHBlcm11dGF0aW9ucy5cbiAgICovXG4gIHN0YXRpYyBnZXRPYmplY3RLZXlQZXJtdXRhdGlvbnMob2JqZWN0LCBpbmRleCA9IDAsIGN1cnJlbnQgPSB7fSwgcmVzdWx0cyA9IFtdKSB7XG4gICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKG9iamVjdCk7XG4gICAgY29uc3Qga2V5ID0ga2V5c1tpbmRleF07XG4gICAgY29uc3QgdmFsdWVzID0gb2JqZWN0W2tleV07XG5cbiAgICBmb3IgKGNvbnN0IHZhbHVlIG9mIHZhbHVlcykge1xuICAgICAgY3VycmVudFtrZXldID0gdmFsdWU7XG4gICAgICBjb25zdCBuZXh0SW5kZXggPSBpbmRleCArIDE7XG5cbiAgICAgIGlmIChuZXh0SW5kZXggPCBrZXlzLmxlbmd0aCkge1xuICAgICAgICBVdGlscy5nZXRPYmplY3RLZXlQZXJtdXRhdGlvbnMob2JqZWN0LCBuZXh0SW5kZXgsIGN1cnJlbnQsIHJlc3VsdHMpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gT2JqZWN0LmFzc2lnbih7fSwgY3VycmVudCk7XG4gICAgICAgIHJlc3VsdHMucHVzaChyZXN1bHQpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfVxuXG4gIC8qKlxuICAgKiBWYWxpZGF0ZXMgcGFyYW1ldGVycyBhbmQgdGhyb3dzIGlmIGEgcGFyYW1ldGVyIGlzIGludmFsaWQuXG4gICAqIEV4YW1wbGUgcGFyYW1ldGVyIHR5cGVzIHN5bnRheDpcbiAgICogYGBgXG4gICAqIHtcbiAgICogICBwYXJhbWV0ZXJOYW1lOiB7XG4gICAqICAgICAgdDogJ2Jvb2xlYW4nLFxuICAgKiAgICAgIHY6IGlzQm9vbGVhbixcbiAgICogICAgICBvOiB0cnVlXG4gICAqICAgfSxcbiAgICogICAuLi5cbiAgICogfVxuICAgKiBgYGBcbiAgICogQHBhcmFtIHtPYmplY3R9IHBhcmFtcyBUaGUgcGFyYW1ldGVycyB0byB2YWxpZGF0ZS5cbiAgICogQHBhcmFtIHtBcnJheTxPYmplY3Q+fSB0eXBlcyBUaGUgcGFyYW1ldGVyIHR5cGVzIHVzZWQgZm9yIHZhbGlkYXRpb24uXG4gICAqIEBwYXJhbSB7T2JqZWN0fSB0eXBlcy50IFRoZSBwYXJhbWV0ZXIgdHlwZTsgdXNlZCBmb3IgZXJyb3IgbWVzc2FnZSwgbm90IGZvciB2YWxpZGF0aW9uLlxuICAgKiBAcGFyYW0ge09iamVjdH0gdHlwZXMudiBUaGUgZnVuY3Rpb24gdG8gdmFsaWRhdGUgdGhlIHBhcmFtZXRlciB2YWx1ZS5cbiAgICogQHBhcmFtIHtCb29sZWFufSBbdHlwZXMubz1mYWxzZV0gSXMgdHJ1ZSBpZiB0aGUgcGFyYW1ldGVyIGlzIG9wdGlvbmFsLlxuICAgKi9cbiAgc3RhdGljIHZhbGlkYXRlUGFyYW1zKHBhcmFtcywgdHlwZXMpIHtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhwYXJhbXMpKSB7XG4gICAgICBjb25zdCB0eXBlID0gdHlwZXNba2V5XTtcbiAgICAgIGNvbnN0IGlzT3B0aW9uYWwgPSAhIXR5cGUubztcbiAgICAgIGNvbnN0IHBhcmFtID0gcGFyYW1zW2tleV07XG4gICAgICBpZiAoIShpc09wdGlvbmFsICYmIHBhcmFtID09IG51bGwpICYmICF0eXBlLnYocGFyYW0pKSB7XG4gICAgICAgIHRocm93IGBJbnZhbGlkIHBhcmFtZXRlciAke2tleX0gbXVzdCBiZSBvZiB0eXBlICR7dHlwZS50fSBidXQgaXMgJHt0eXBlb2YgcGFyYW19YDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQ29tcHV0ZXMgdGhlIHJlbGF0aXZlIGRhdGUgYmFzZWQgb24gYSBzdHJpbmcuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IFRoZSBzdHJpbmcgdG8gaW50ZXJwcmV0IHRoZSBkYXRlIGZyb20uXG4gICAqIEBwYXJhbSB7RGF0ZX0gbm93IFRoZSBkYXRlIHRoZSBzdHJpbmcgaXMgY29tcGFyaW5nIGFnYWluc3QuXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSByZWxhdGl2ZSBkYXRlIG9iamVjdC5cbiAgICoqL1xuICBzdGF0aWMgcmVsYXRpdmVUaW1lVG9EYXRlKHRleHQsIG5vdyA9IG5ldyBEYXRlKCkpIHtcbiAgICB0ZXh0ID0gdGV4dC50b0xvd2VyQ2FzZSgpO1xuICAgIGxldCBwYXJ0cyA9IHRleHQuc3BsaXQoJyAnKTtcblxuICAgIC8vIEZpbHRlciBvdXQgd2hpdGVzcGFjZVxuICAgIHBhcnRzID0gcGFydHMuZmlsdGVyKHBhcnQgPT4gcGFydCAhPT0gJycpO1xuXG4gICAgY29uc3QgZnV0dXJlID0gcGFydHNbMF0gPT09ICdpbic7XG4gICAgY29uc3QgcGFzdCA9IHBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdID09PSAnYWdvJztcblxuICAgIGlmICghZnV0dXJlICYmICFwYXN0ICYmIHRleHQgIT09ICdub3cnKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICAgIGluZm86IFwiVGltZSBzaG91bGQgZWl0aGVyIHN0YXJ0IHdpdGggJ2luJyBvciBlbmQgd2l0aCAnYWdvJ1wiLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBpZiAoZnV0dXJlICYmIHBhc3QpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1czogJ2Vycm9yJyxcbiAgICAgICAgaW5mbzogXCJUaW1lIGNhbm5vdCBoYXZlIGJvdGggJ2luJyBhbmQgJ2FnbydcIixcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gc3RyaXAgdGhlICdhZ28nIG9yICdpbidcbiAgICBpZiAoZnV0dXJlKSB7XG4gICAgICBwYXJ0cyA9IHBhcnRzLnNsaWNlKDEpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBwYXN0XG4gICAgICBwYXJ0cyA9IHBhcnRzLnNsaWNlKDAsIHBhcnRzLmxlbmd0aCAtIDEpO1xuICAgIH1cblxuICAgIGlmIChwYXJ0cy5sZW5ndGggJSAyICE9PSAwICYmIHRleHQgIT09ICdub3cnKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICAgIGluZm86ICdJbnZhbGlkIHRpbWUgc3RyaW5nLiBEYW5nbGluZyB1bml0IG9yIG51bWJlci4nLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zdCBwYWlycyA9IFtdO1xuICAgIHdoaWxlIChwYXJ0cy5sZW5ndGgpIHtcbiAgICAgIHBhaXJzLnB1c2goW3BhcnRzLnNoaWZ0KCksIHBhcnRzLnNoaWZ0KCldKTtcbiAgICB9XG5cbiAgICBsZXQgc2Vjb25kcyA9IDA7XG4gICAgZm9yIChjb25zdCBbbnVtLCBpbnRlcnZhbF0gb2YgcGFpcnMpIHtcbiAgICAgIGNvbnN0IHZhbCA9IE51bWJlcihudW0pO1xuICAgICAgaWYgKCFOdW1iZXIuaXNJbnRlZ2VyKHZhbCkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICAgICAgaW5mbzogYCcke251bX0nIGlzIG5vdCBhbiBpbnRlZ2VyLmAsXG4gICAgICAgIH07XG4gICAgICB9XG5cbiAgICAgIHN3aXRjaCAoaW50ZXJ2YWwpIHtcbiAgICAgICAgY2FzZSAneXInOlxuICAgICAgICBjYXNlICd5cnMnOlxuICAgICAgICBjYXNlICd5ZWFyJzpcbiAgICAgICAgY2FzZSAneWVhcnMnOlxuICAgICAgICAgIHNlY29uZHMgKz0gdmFsICogMzE1MzYwMDA7IC8vIDM2NSAqIDI0ICogNjAgKiA2MFxuICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGNhc2UgJ3drJzpcbiAgICAgICAgY2FzZSAnd2tzJzpcbiAgICAgICAgY2FzZSAnd2Vlayc6XG4gICAgICAgIGNhc2UgJ3dlZWtzJzpcbiAgICAgICAgICBzZWNvbmRzICs9IHZhbCAqIDYwNDgwMDsgLy8gNyAqIDI0ICogNjAgKiA2MFxuICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGNhc2UgJ2QnOlxuICAgICAgICBjYXNlICdkYXknOlxuICAgICAgICBjYXNlICdkYXlzJzpcbiAgICAgICAgICBzZWNvbmRzICs9IHZhbCAqIDg2NDAwOyAvLyAyNCAqIDYwICogNjBcbiAgICAgICAgICBicmVhaztcblxuICAgICAgICBjYXNlICdocic6XG4gICAgICAgIGNhc2UgJ2hycyc6XG4gICAgICAgIGNhc2UgJ2hvdXInOlxuICAgICAgICBjYXNlICdob3Vycyc6XG4gICAgICAgICAgc2Vjb25kcyArPSB2YWwgKiAzNjAwOyAvLyA2MCAqIDYwXG4gICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgY2FzZSAnbWluJzpcbiAgICAgICAgY2FzZSAnbWlucyc6XG4gICAgICAgIGNhc2UgJ21pbnV0ZSc6XG4gICAgICAgIGNhc2UgJ21pbnV0ZXMnOlxuICAgICAgICAgIHNlY29uZHMgKz0gdmFsICogNjA7XG4gICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgY2FzZSAnc2VjJzpcbiAgICAgICAgY2FzZSAnc2Vjcyc6XG4gICAgICAgIGNhc2UgJ3NlY29uZCc6XG4gICAgICAgIGNhc2UgJ3NlY29uZHMnOlxuICAgICAgICAgIHNlY29uZHMgKz0gdmFsO1xuICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN0YXR1czogJ2Vycm9yJyxcbiAgICAgICAgICAgIGluZm86IGBJbnZhbGlkIGludGVydmFsOiAnJHtpbnRlcnZhbH0nYCxcbiAgICAgICAgICB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IG1pbGxpc2Vjb25kcyA9IHNlY29uZHMgKiAxMDAwO1xuICAgIGlmIChmdXR1cmUpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1czogJ3N1Y2Nlc3MnLFxuICAgICAgICBpbmZvOiAnZnV0dXJlJyxcbiAgICAgICAgcmVzdWx0OiBuZXcgRGF0ZShub3cudmFsdWVPZigpICsgbWlsbGlzZWNvbmRzKSxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmIChwYXN0KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdzdWNjZXNzJyxcbiAgICAgICAgaW5mbzogJ3Bhc3QnLFxuICAgICAgICByZXN1bHQ6IG5ldyBEYXRlKG5vdy52YWx1ZU9mKCkgLSBtaWxsaXNlY29uZHMpLFxuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzOiAnc3VjY2VzcycsXG4gICAgICAgIGluZm86ICdwcmVzZW50JyxcbiAgICAgICAgcmVzdWx0OiBuZXcgRGF0ZShub3cudmFsdWVPZigpKSxcbiAgICAgIH07XG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gVXRpbHM7XG4iXX0=