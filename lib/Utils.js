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
        this.getObjectKeyPermutations(object, nextIndex, current, results);
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

}

module.exports = Utils;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9VdGlscy5qcyJdLCJuYW1lcyI6WyJwYXRoIiwicmVxdWlyZSIsImZzIiwicHJvbWlzZXMiLCJVdGlscyIsImdldExvY2FsaXplZFBhdGgiLCJkZWZhdWx0UGF0aCIsImxvY2FsZSIsImZpbGUiLCJiYXNlbmFtZSIsImJhc2VQYXRoIiwiZGlybmFtZSIsImxvY2FsZVBhdGgiLCJqb2luIiwibG9jYWxlRmlsZUV4aXN0cyIsImZpbGVFeGlzdHMiLCJzdWJkaXIiLCJsYW5ndWFnZSIsInNwbGl0IiwibGFuZ3VhZ2VQYXRoIiwibGFuZ3VhZ2VGaWxlRXhpc3RzIiwiYWNjZXNzIiwiZSIsImlzUGF0aCIsInMiLCJ0ZXN0IiwiZmxhdHRlbk9iamVjdCIsIm9iaiIsInBhcmVudEtleSIsImRlbGltaXRlciIsInJlc3VsdCIsImtleSIsIk9iamVjdCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsIm5ld0tleSIsImlzUHJvbWlzZSIsIm9iamVjdCIsIlByb21pc2UiLCJnZXRPYmplY3RLZXlQZXJtdXRhdGlvbnMiLCJpbmRleCIsImN1cnJlbnQiLCJyZXN1bHRzIiwia2V5cyIsInZhbHVlcyIsInZhbHVlIiwibmV4dEluZGV4IiwibGVuZ3RoIiwiYXNzaWduIiwicHVzaCIsInZhbGlkYXRlUGFyYW1zIiwicGFyYW1zIiwidHlwZXMiLCJ0eXBlIiwiaXNPcHRpb25hbCIsIm8iLCJwYXJhbSIsInYiLCJ0IiwibW9kdWxlIiwiZXhwb3J0cyJdLCJtYXBwaW5ncyI6Ijs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUEsTUFBTUEsSUFBSSxHQUFHQyxPQUFPLENBQUMsTUFBRCxDQUFwQjs7QUFDQSxNQUFNQyxFQUFFLEdBQUdELE9BQU8sQ0FBQyxJQUFELENBQVAsQ0FBY0UsUUFBekI7QUFFQTtBQUNBO0FBQ0E7OztBQUNBLE1BQU1DLEtBQU4sQ0FBWTtBQUNWO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtB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QVIsQ0FBYXBCLE1BQWI7QUFDRDtBQUNGOztBQUNELFdBQU9hLE9BQVA7QUFDRDtBQUVEO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUFDRSxTQUFPUSxjQUFQLENBQXNCQyxNQUF0QixFQUE4QkMsS0FBOUIsRUFBcUM7QUFDbkMsU0FBSyxNQUFNdEIsR0FBWCxJQUFrQkMsTUFBTSxDQUFDWSxJQUFQLENBQVlRLE1BQVosQ0FBbEIsRUFBdUM7QUFDckMsWUFBTUUsSUFBSSxHQUFHRCxLQUFLLENBQUN0QixHQUFELENBQWxCO0FBQ0EsWUFBTXdCLFVBQVUsR0FBRyxDQUFDLENBQUNELElBQUksQ0FBQ0UsQ0FBMUI7QUFDQSxZQUFNQyxLQUFLLEdBQUdMLE1BQU0sQ0FBQ3JCLEdBQUQsQ0FBcEI7O0FBQ0EsVUFBSSxFQUFFd0IsVUFBVSxJQUFJRSxLQUFLLElBQUksSUFBekIsS0FBa0MsQ0FBQ0gsSUFBSSxDQUFDSSxDQUFMLENBQU9ELEtBQVAsQ0FBdkMsRUFBc0Q7QUFDcEQsY0FBTyxxQkFBb0IxQixHQUFJLG9CQUFtQnVCLElBQUksQ0FBQ0ssQ0FBRSxXQUFVLE9BQU9GLEtBQU0sRUFBaEY7QUFDRDtBQUNGO0FBQ0Y7O0FBNUtTOztBQStLWkcsTUFBTSxDQUFDQyxPQUFQLEdBQWlCekQsS0FBakIiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIHV0aWxzLmpzXG4gKiBAZmlsZSBHZW5lcmFsIHB1cnBvc2UgdXRpbGl0aWVzXG4gKiBAZGVzY3JpcHRpb24gR2VuZXJhbCBwdXJwb3NlIHV0aWxpdGllcy5cbiAqL1xuXG5jb25zdCBwYXRoID0gcmVxdWlyZSgncGF0aCcpO1xuY29uc3QgZnMgPSByZXF1aXJlKCdmcycpLnByb21pc2VzO1xuXG4vKipcbiAqIFRoZSBnZW5lcmFsIHB1cnBvc2UgdXRpbGl0aWVzLlxuICovXG5jbGFzcyBVdGlscyB7XG4gIC8qKlxuICAgKiBAZnVuY3Rpb24gZ2V0TG9jYWxpemVkUGF0aFxuICAgKiBAZGVzY3JpcHRpb24gUmV0dXJucyBhIGxvY2FsaXplZCBmaWxlIHBhdGggYWNjb3JpbmcgdG8gdGhlIGxvY2FsZS5cbiAgICpcbiAgICogTG9jYWxpemVkIGZpbGVzIGFyZSBzZWFyY2hlZCBpbiBzdWJmb2xkZXJzIG9mIGEgZ2l2ZW4gcGF0aCwgZS5nLlxuICAgKlxuICAgKiByb290L1xuICAgKiDilJzilIDilIAgYmFzZS8gICAgICAgICAgICAgICAgICAgIC8vIGJhc2UgcGF0aCB0byBmaWxlc1xuICAgKiDilIIgICDilJzilIDilIAgZXhhbXBsZS5odG1sICAgICAgICAgLy8gZGVmYXVsdCBmaWxlXG4gICAqIOKUgiAgIOKUlOKUgOKUgCBkZS8gICAgICAgICAgICAgICAgICAvLyBkZSBsYW5ndWFnZSBmb2xkZXJcbiAgICog4pSCICAg4pSCICAg4pSU4pSA4pSAIGV4YW1wbGUuaHRtbCAgICAgLy8gZGUgbG9jYWxpemVkIGZpbGVcbiAgICog4pSCICAg4pSU4pSA4pSAIGRlLUFULyAgICAgICAgICAgICAgIC8vIGRlLUFUIGxvY2FsZSBmb2xkZXJcbiAgICog4pSCICAg4pSCICAg4pSU4pSA4pSAIGV4YW1wbGUuaHRtbCAgICAgLy8gZGUtQVQgbG9jYWxpemVkIGZpbGVcbiAgICpcbiAgICogRmlsZXMgYXJlIG1hdGNoZWQgd2l0aCB0aGUgbG9jYWxlIGluIHRoZSBmb2xsb3dpbmcgb3JkZXI6XG4gICAqIDEuIExvY2FsZSBtYXRjaCwgZS5nLiBsb2NhbGUgYGRlLUFUYCBtYXRjaGVzIGZpbGUgaW4gZm9sZGVyIGBkZS1BVGAuXG4gICAqIDIuIExhbmd1YWdlIG1hdGNoLCBlLmcuIGxvY2FsZSBgZGUtQVRgIG1hdGNoZXMgZmlsZSBpbiBmb2xkZXIgYGRlYC5cbiAgICogMy4gRGVmYXVsdDsgZmlsZSBpbiBiYXNlIGZvbGRlciBpcyByZXR1cm5lZC5cbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IGRlZmF1bHRQYXRoIFRoZSBhYnNvbHV0ZSBmaWxlIHBhdGgsIHdoaWNoIGlzIGFsc29cbiAgICogdGhlIGRlZmF1bHQgcGF0aCByZXR1cm5lZCBpZiBsb2NhbGl6YXRpb24gaXMgbm90IGF2YWlsYWJsZS5cbiAgICogQHBhcmFtIHtTdHJpbmd9IGxvY2FsZSBUaGUgbG9jYWxlLlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZTxPYmplY3Q+fSBUaGUgb2JqZWN0IGNvbnRhaW5zOlxuICAgKiAtIGBwYXRoYDogVGhlIHBhdGggdG8gdGhlIGxvY2FsaXplZCBmaWxlLCBvciB0aGUgb3JpZ2luYWwgcGF0aCBpZlxuICAgKiAgIGxvY2FsaXphdGlvbiBpcyBub3QgYXZhaWxhYmxlLlxuICAgKiAtIGBzdWJkaXJgOiBUaGUgc3ViZGlyZWN0b3J5IG9mIHRoZSBsb2NhbGl6ZWQgZmlsZSwgb3IgdW5kZWZpbmVkIGlmXG4gICAqICAgdGhlcmUgaXMgbm8gbWF0Y2hpbmcgbG9jYWxpemVkIGZpbGUuXG4gICAqL1xuICBzdGF0aWMgYXN5bmMgZ2V0TG9jYWxpemVkUGF0aChkZWZhdWx0UGF0aCwgbG9jYWxlKSB7XG4gICAgLy8gR2V0IGZpbGUgbmFtZSBhbmQgcGF0aHNcbiAgICBjb25zdCBmaWxlID0gcGF0aC5iYXNlbmFtZShkZWZhdWx0UGF0aCk7XG4gICAgY29uc3QgYmFzZVBhdGggPSBwYXRoLmRpcm5hbWUoZGVmYXVsdFBhdGgpO1xuXG4gICAgLy8gSWYgbG9jYWxlIGlzIG5vdCBzZXQgcmV0dXJuIGRlZmF1bHQgZmlsZVxuICAgIGlmICghbG9jYWxlKSB7XG4gICAgICByZXR1cm4geyBwYXRoOiBkZWZhdWx0UGF0aCB9O1xuICAgIH1cblxuICAgIC8vIENoZWNrIGZpbGUgZm9yIGxvY2FsZSBleGlzdHNcbiAgICBjb25zdCBsb2NhbGVQYXRoID0gcGF0aC5qb2luKGJhc2VQYXRoLCBsb2NhbGUsIGZpbGUpO1xuICAgIGNvbnN0IGxvY2FsZUZpbGVFeGlzdHMgPSBhd2FpdCBVdGlscy5maWxlRXhpc3RzKGxvY2FsZVBhdGgpO1xuXG4gICAgLy8gSWYgZmlsZSBmb3IgbG9jYWxlIGV4aXN0cyByZXR1cm4gZmlsZVxuICAgIGlmIChsb2NhbGVGaWxlRXhpc3RzKSB7XG4gICAgICByZXR1cm4geyBwYXRoOiBsb2NhbGVQYXRoLCBzdWJkaXI6IGxvY2FsZSB9O1xuICAgIH1cblxuICAgIC8vIENoZWNrIGZpbGUgZm9yIGxhbmd1YWdlIGV4aXN0c1xuICAgIGNvbnN0IGxhbmd1YWdlID0gbG9jYWxlLnNwbGl0KCctJylbMF07XG4gICAgY29uc3QgbGFuZ3VhZ2VQYXRoID0gcGF0aC5qb2luKGJhc2VQYXRoLCBsYW5ndWFnZSwgZmlsZSk7XG4gICAgY29uc3QgbGFuZ3VhZ2VGaWxlRXhpc3RzID0gYXdhaXQgVXRpbHMuZmlsZUV4aXN0cyhsYW5ndWFnZVBhdGgpO1xuXG4gICAgLy8gSWYgZmlsZSBmb3IgbGFuZ3VhZ2UgZXhpc3RzIHJldHVybiBmaWxlXG4gICAgaWYgKGxhbmd1YWdlRmlsZUV4aXN0cykge1xuICAgICAgcmV0dXJuIHsgcGF0aDogbGFuZ3VhZ2VQYXRoLCBzdWJkaXI6IGxhbmd1YWdlIH07XG4gICAgfVxuXG4gICAgLy8gUmV0dXJuIGRlZmF1bHQgZmlsZVxuICAgIHJldHVybiB7IHBhdGg6IGRlZmF1bHRQYXRoIH07XG4gIH1cblxuICAvKipcbiAgICogQGZ1bmN0aW9uIGZpbGVFeGlzdHNcbiAgICogQGRlc2NyaXB0aW9uIENoZWNrcyB3aGV0aGVyIGEgZmlsZSBleGlzdHMuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoIFRoZSBmaWxlIHBhdGguXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPEJvb2xlYW4+fSBJcyB0cnVlIGlmIHRoZSBmaWxlIGNhbiBiZSBhY2Nlc3NlZCwgZmFsc2Ugb3RoZXJ3aXNlLlxuICAgKi9cbiAgc3RhdGljIGFzeW5jIGZpbGVFeGlzdHMocGF0aCkge1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBmcy5hY2Nlc3MocGF0aCk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEBmdW5jdGlvbiBpc1BhdGhcbiAgICogQGRlc2NyaXB0aW9uIEV2YWx1YXRlcyB3aGV0aGVyIGEgc3RyaW5nIGlzIGEgZmlsZSBwYXRoIChhcyBvcHBvc2VkIHRvIGEgVVJMIGZvciBleGFtcGxlKS5cbiAgICogQHBhcmFtIHtTdHJpbmd9IHMgVGhlIHN0cmluZyB0byBldmFsdWF0ZS5cbiAgICogQHJldHVybnMge0Jvb2xlYW59IFJldHVybnMgdHJ1ZSBpZiB0aGUgZXZhbHVhdGVkIHN0cmluZyBpcyBhIHBhdGguXG4gICAqL1xuICBzdGF0aWMgaXNQYXRoKHMpIHtcbiAgICByZXR1cm4gLyheXFwvKXwoXlxcLlxcLyl8KF5cXC5cXC5cXC8pLy50ZXN0KHMpO1xuICB9XG5cbiAgLyoqXG4gICAqIEZsYXR0ZW5zIGFuIG9iamVjdCBhbmQgY3JhdGVzIG5ldyBrZXlzIHdpdGggY3VzdG9tIGRlbGltaXRlcnMuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvYmogVGhlIG9iamVjdCB0byBmbGF0dGVuLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gW2RlbGltaXRlcj0nLiddIFRoZSBkZWxpbWl0ZXIgb2YgdGhlIG5ld2x5IGdlbmVyYXRlZCBrZXlzLlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVzdWx0XG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBmbGF0dGVuZWQgb2JqZWN0LlxuICAgKiovXG4gIHN0YXRpYyBmbGF0dGVuT2JqZWN0KG9iaiwgcGFyZW50S2V5LCBkZWxpbWl0ZXIgPSAnLicsIHJlc3VsdCA9IHt9KSB7XG4gICAgZm9yIChjb25zdCBrZXkgaW4gb2JqKSB7XG4gICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KSkge1xuICAgICAgICBjb25zdCBuZXdLZXkgPSBwYXJlbnRLZXkgPyBwYXJlbnRLZXkgKyBkZWxpbWl0ZXIgKyBrZXkgOiBrZXk7XG5cbiAgICAgICAgaWYgKHR5cGVvZiBvYmpba2V5XSA9PT0gJ29iamVjdCcgJiYgb2JqW2tleV0gIT09IG51bGwpIHtcbiAgICAgICAgICB0aGlzLmZsYXR0ZW5PYmplY3Qob2JqW2tleV0sIG5ld0tleSwgZGVsaW1pdGVyLCByZXN1bHQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJlc3VsdFtuZXdLZXldID0gb2JqW2tleV07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBEZXRlcm1pbmVzIHdoZXRoZXIgYW4gb2JqZWN0IGlzIGEgUHJvbWlzZS5cbiAgICogQHBhcmFtIHthbnl9IG9iamVjdCBUaGUgb2JqZWN0IHRvIHZhbGlkYXRlLlxuICAgKiBAcmV0dXJucyB7Qm9vbGVhbn0gUmV0dXJucyB0cnVlIGlmIHRoZSBvYmplY3QgaXMgYSBwcm9taXNlLlxuICAgKi9cbiAgc3RhdGljIGlzUHJvbWlzZShvYmplY3QpIHtcbiAgICByZXR1cm4gb2JqZWN0IGluc3RhbmNlb2YgUHJvbWlzZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGFuIG9iamVjdCB3aXRoIGFsbCBwZXJtdXRhdGlvbnMgb2YgdGhlIG9yaWdpbmFsIGtleXMuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBwZXJtdXRhdGUuXG4gICAqIEBwYXJhbSB7SW50ZWdlcn0gW2luZGV4PTBdIFRoZSBjdXJyZW50IGtleSBpbmRleC5cbiAgICogQHBhcmFtIHtPYmplY3R9IFtjdXJyZW50PXt9XSBUaGUgY3VycmVudCByZXN1bHQgZW50cnkgYmVpbmcgY29tcG9zZWQuXG4gICAqIEBwYXJhbSB7QXJyYXl9IFtyZXN1bHRzPVtdXSBUaGUgcmVzdWx0aW5nIGFycmF5IG9mIHBlcm11dGF0aW9ucy5cbiAgICovXG4gIHN0YXRpYyBnZXRPYmplY3RLZXlQZXJtdXRhdGlvbnMob2JqZWN0LCBpbmRleCA9IDAsIGN1cnJlbnQgPSB7fSwgcmVzdWx0cyA9IFtdKSB7XG4gICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKG9iamVjdCk7XG4gICAgY29uc3Qga2V5ID0ga2V5c1tpbmRleF07XG4gICAgY29uc3QgdmFsdWVzID0gb2JqZWN0W2tleV07XG5cbiAgICBmb3IgKGNvbnN0IHZhbHVlIG9mIHZhbHVlcykge1xuICAgICAgY3VycmVudFtrZXldID0gdmFsdWU7XG4gICAgICBjb25zdCBuZXh0SW5kZXggPSBpbmRleCArIDE7XG5cbiAgICAgIGlmIChuZXh0SW5kZXggPCBrZXlzLmxlbmd0aCkge1xuICAgICAgICB0aGlzLmdldE9iamVjdEtleVBlcm11dGF0aW9ucyhvYmplY3QsIG5leHRJbmRleCwgY3VycmVudCwgcmVzdWx0cyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBPYmplY3QuYXNzaWduKHt9LCBjdXJyZW50KTtcbiAgICAgICAgcmVzdWx0cy5wdXNoKHJlc3VsdCk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRzO1xuICB9XG5cbiAgLyoqXG4gICAqIFZhbGlkYXRlcyBwYXJhbWV0ZXJzIGFuZCB0aHJvd3MgaWYgYSBwYXJhbWV0ZXIgaXMgaW52YWxpZC5cbiAgICogRXhhbXBsZSBwYXJhbWV0ZXIgdHlwZXMgc3ludGF4OlxuICAgKiBgYGBcbiAgICoge1xuICAgKiAgIHBhcmFtZXRlck5hbWU6IHtcbiAgICogICAgICB0OiAnYm9vbGVhbicsXG4gICAqICAgICAgdjogaXNCb29sZWFuLFxuICAgKiAgICAgIG86IHRydWVcbiAgICogICB9LFxuICAgKiAgIC4uLlxuICAgKiB9XG4gICAqIGBgYFxuICAgKiBAcGFyYW0ge09iamVjdH0gcGFyYW1zIFRoZSBwYXJhbWV0ZXJzIHRvIHZhbGlkYXRlLlxuICAgKiBAcGFyYW0ge0FycmF5PE9iamVjdD59IHR5cGVzIFRoZSBwYXJhbWV0ZXIgdHlwZXMgdXNlZCBmb3IgdmFsaWRhdGlvbi5cbiAgICogQHBhcmFtIHtPYmplY3R9IHR5cGVzLnQgVGhlIHBhcmFtZXRlciB0eXBlOyB1c2VkIGZvciBlcnJvciBtZXNzYWdlLCBub3QgZm9yIHZhbGlkYXRpb24uXG4gICAqIEBwYXJhbSB7T2JqZWN0fSB0eXBlcy52IFRoZSBmdW5jdGlvbiB0byB2YWxpZGF0ZSB0aGUgcGFyYW1ldGVyIHZhbHVlLlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFt0eXBlcy5vPWZhbHNlXSBJcyB0cnVlIGlmIHRoZSBwYXJhbWV0ZXIgaXMgb3B0aW9uYWwuXG4gICAqL1xuICBzdGF0aWMgdmFsaWRhdGVQYXJhbXMocGFyYW1zLCB0eXBlcykge1xuICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHBhcmFtcykpIHtcbiAgICAgIGNvbnN0IHR5cGUgPSB0eXBlc1trZXldO1xuICAgICAgY29uc3QgaXNPcHRpb25hbCA9ICEhdHlwZS5vO1xuICAgICAgY29uc3QgcGFyYW0gPSBwYXJhbXNba2V5XTtcbiAgICAgIGlmICghKGlzT3B0aW9uYWwgJiYgcGFyYW0gPT0gbnVsbCkgJiYgIXR5cGUudihwYXJhbSkpIHtcbiAgICAgICAgdGhyb3cgYEludmFsaWQgcGFyYW1ldGVyICR7a2V5fSBtdXN0IGJlIG9mIHR5cGUgJHt0eXBlLnR9IGJ1dCBpcyAke3R5cGVvZiBwYXJhbX1gO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFV0aWxzO1xuIl19