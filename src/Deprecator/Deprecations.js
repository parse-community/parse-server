/**
 * The deprecations.
 *
 * Add deprecations to the array using the following keys:
 * - `optionKey` {String}: The option key incl. its path, e.g. `security.enableCheck`.
 * - `envKey` {String}: The environment key, e.g. `PARSE_SERVER_SECURITY`.
 * - `changeNewKey` {String}: Set the new key name if the current key will be replaced,
 * or set to an empty string if the current key will be removed without replacement.
 * - `changeNewDefault` {String}: Set the new default value if the key's default value
 * will change in a future version.
 *
 * If there are no deprecations this must return an empty array anyway.
 */
module.exports = [{ optionKey: 'enforcePrivateUsers', changeNewDefault: 'true' }];
