export = Deprecator;
/**
 * The deprecator class.
 */
declare class Deprecator {
    /**
     * Scans the Parse Server for deprecated options.
     * This needs to be called before setting option defaults, otherwise it
     * becomes indistinguishable whether an option has been set manually or
     * by default.
     * @param {any} options The Parse Server options.
     */
    static scanParseServerOptions(options: any): void;
    /**
     * Returns the deprecation definitions.
     * @returns {Array<Object>} The deprecations.
     */
    static _getDeprecations(): Array<any>;
    /**
     * Logs a deprecation warning for a Parse Server option.
     * @param {String} optionKey The option key incl. its path, e.g. `security.enableCheck`.
     * @param {String} envKey The environment key, e.g. `PARSE_SERVER_SECURITY`.
     * @param {String} changeNewKey Set the new key name if the current key will be replaced,
     * or set to an empty string if the current key will be removed without replacement.
     * @param {String} changeNewDefault Set the new default value if the key's default value
     * will change in a future version.
     * @param {String} [solution] The instruction to resolve this deprecation warning. This
     * message must not include the warning that the parameter is deprecated, that is
     * automatically added to the message. It should only contain the instruction on how
     * to resolve this warning.
     */
    static _log({ optionKey, envKey, changeNewKey, changeNewDefault, solution }: string): void;
}
