"use strict";

/**
 * The deprecations.
 *
 * Add deprecations to the array using the following keys:
 * - `optionKey`: The option key incl. its path, e.g. `security.enableCheck`.
 * - `envKey`: The environment key, e.g. `PARSE_SERVER_SECURITY`.
 * - `changeNewKey`: Set the new key name if the current key will be replaced,
 * or set to an empty string if the current key will be removed without replacement.
 * - `changeNewDefault`: Set the new default value if the key's default value
 * will change in a future version.
 *
 * If there are no deprecations this must return an empty array anyway.
 */
module.exports = [];
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9EZXByZWNhdG9yL0RlcHJlY2F0aW9ucy5qcyJdLCJuYW1lcyI6WyJtb2R1bGUiLCJleHBvcnRzIl0sIm1hcHBpbmdzIjoiOztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0FBLE1BQU0sQ0FBQ0MsT0FBUCxHQUFpQixFQUFqQiIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogVGhlIGRlcHJlY2F0aW9ucy5cbiAqXG4gKiBBZGQgZGVwcmVjYXRpb25zIHRvIHRoZSBhcnJheSB1c2luZyB0aGUgZm9sbG93aW5nIGtleXM6XG4gKiAtIGBvcHRpb25LZXlgOiBUaGUgb3B0aW9uIGtleSBpbmNsLiBpdHMgcGF0aCwgZS5nLiBgc2VjdXJpdHkuZW5hYmxlQ2hlY2tgLlxuICogLSBgZW52S2V5YDogVGhlIGVudmlyb25tZW50IGtleSwgZS5nLiBgUEFSU0VfU0VSVkVSX1NFQ1VSSVRZYC5cbiAqIC0gYGNoYW5nZU5ld0tleWA6IFNldCB0aGUgbmV3IGtleSBuYW1lIGlmIHRoZSBjdXJyZW50IGtleSB3aWxsIGJlIHJlcGxhY2VkLFxuICogb3Igc2V0IHRvIGFuIGVtcHR5IHN0cmluZyBpZiB0aGUgY3VycmVudCBrZXkgd2lsbCBiZSByZW1vdmVkIHdpdGhvdXQgcmVwbGFjZW1lbnQuXG4gKiAtIGBjaGFuZ2VOZXdEZWZhdWx0YDogU2V0IHRoZSBuZXcgZGVmYXVsdCB2YWx1ZSBpZiB0aGUga2V5J3MgZGVmYXVsdCB2YWx1ZVxuICogd2lsbCBjaGFuZ2UgaW4gYSBmdXR1cmUgdmVyc2lvbi5cbiAqXG4gKiBJZiB0aGVyZSBhcmUgbm8gZGVwcmVjYXRpb25zIHRoaXMgbXVzdCByZXR1cm4gYW4gZW1wdHkgYXJyYXkgYW55d2F5LlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IFtdO1xuIl19