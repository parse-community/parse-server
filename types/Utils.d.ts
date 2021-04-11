export = Utils;
/**
 * The general purpose utilities.
 */
declare class Utils {
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
    static getLocalizedPath(defaultPath: string, locale: string): Promise<any>;
    /**
     * @function fileExists
     * @description Checks whether a file exists.
     * @param {String} path The file path.
     * @returns {Promise<Boolean>} Is true if the file can be accessed, false otherwise.
     */
    static fileExists(path: string): Promise<boolean>;
    /**
     * @function isPath
     * @description Evaluates whether a string is a file path (as opposed to a URL for example).
     * @param {String} s The string to evaluate.
     * @returns {Boolean} Returns true if the evaluated string is a path.
     */
    static isPath(s: string): boolean;
    /**
     * Flattens an object and crates new keys with custom delimiters.
     * @param {Object} obj The object to flatten.
     * @param {String} [delimiter='.'] The delimiter of the newly generated keys.
     * @param {Object} result
     * @returns {Object} The flattened object.
     **/
    static flattenObject(obj: any, parentKey: any, delimiter?: string, result?: any): any;
    /**
     * Determines whether an object is a Promise.
     * @param {any} object The object to validate.
     * @returns {Boolean} Returns true if the object is a promise.
     */
    static isPromise(object: any): boolean;
    /**
     * Creates an object with all permutations of the original keys.
     * @param {Object} object The object to permutate.
     * @param {Integer} [index=0] The current key index.
     * @param {Object} [current={}] The current result entry being composed.
     * @param {Array} [results=[]] The resulting array of permutations.
     */
    static getObjectKeyPermutations(object: any, index?: any, current?: any, results?: any[]): any[];
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
    static validateParams(params: any, types: Array<any>): void;
}
