"use strict";

var _logger = _interopRequireDefault(require("../logger"));

var _Deprecations = _interopRequireDefault(require("./Deprecations"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * The deprecator class.
 */
class Deprecator {
  /**
   * Scans the Parse Server for deprecated options.
   * This needs to be called before setting option defaults, otherwise it
   * becomes indistinguishable whether an option has been set manually or
   * by default.
   * @param {any} options The Parse Server options.
   */
  static scanParseServerOptions(options) {
    // Scan for deprecations
    for (const deprecation of Deprecator._getDeprecations()) {
      // Get deprecation properties
      const solution = deprecation.solution;
      const optionKey = deprecation.optionKey;
      const changeNewDefault = deprecation.changeNewDefault; // If default will change, only throw a warning if option is not set

      if (changeNewDefault != null && options[optionKey] == null) {
        Deprecator._log({
          optionKey,
          changeNewDefault,
          solution
        });
      }
    }
  }
  /**
   * Returns the deprecation definitions.
   * @returns {Array<Object>} The deprecations.
   */


  static _getDeprecations() {
    return _Deprecations.default;
  }
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


  static _log({
    optionKey,
    envKey,
    changeNewKey,
    changeNewDefault,
    solution
  }) {
    const type = optionKey ? 'option' : 'environment key';
    const key = optionKey ? optionKey : envKey;
    const keyAction = changeNewKey == null ? undefined : changeNewKey.length > 0 ? `renamed to '${changeNewKey}'` : `removed`; // Compose message

    let output = `DeprecationWarning: The Parse Server ${type} '${key}' `;
    output += changeNewKey ? `is deprecated and will be ${keyAction} in a future version.` : '';
    output += changeNewDefault ? `default will change to '${changeNewDefault}' in a future version.` : '';
    output += solution ? ` ${solution}` : '';

    _logger.default.warn(output);
  }

}

module.exports = Deprecator;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9EZXByZWNhdG9yL0RlcHJlY2F0b3IuanMiXSwibmFtZXMiOlsiRGVwcmVjYXRvciIsInNjYW5QYXJzZVNlcnZlck9wdGlvbnMiLCJvcHRpb25zIiwiZGVwcmVjYXRpb24iLCJfZ2V0RGVwcmVjYXRpb25zIiwic29sdXRpb24iLCJvcHRpb25LZXkiLCJjaGFuZ2VOZXdEZWZhdWx0IiwiX2xvZyIsIkRlcHJlY2F0aW9ucyIsImVudktleSIsImNoYW5nZU5ld0tleSIsInR5cGUiLCJrZXkiLCJrZXlBY3Rpb24iLCJ1bmRlZmluZWQiLCJsZW5ndGgiLCJvdXRwdXQiLCJsb2dnZXIiLCJ3YXJuIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJtYXBwaW5ncyI6Ijs7QUFBQTs7QUFDQTs7OztBQUVBO0FBQ0E7QUFDQTtBQUNBLE1BQU1BLFVBQU4sQ0FBaUI7QUFDZjtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUMrQixTQUF0QkMsc0JBQXNCLENBQUNDLE9BQUQsRUFBVTtBQUNyQztBQUNBLFNBQUssTUFBTUMsV0FBWCxJQUEwQkgsVUFBVSxDQUFDSSxnQkFBWCxFQUExQixFQUF5RDtBQUN2RDtBQUNBLFlBQU1DLFFBQVEsR0FBR0YsV0FBVyxDQUFDRSxRQUE3QjtBQUNBLFlBQU1DLFNBQVMsR0FBR0gsV0FBVyxDQUFDRyxTQUE5QjtBQUNBLFlBQU1DLGdCQUFnQixHQUFHSixXQUFXLENBQUNJLGdCQUFyQyxDQUp1RCxDQU12RDs7QUFDQSxVQUFJQSxnQkFBZ0IsSUFBSSxJQUFwQixJQUE0QkwsT0FBTyxDQUFDSSxTQUFELENBQVAsSUFBc0IsSUFBdEQsRUFBNEQ7QUFDMUROLFFBQUFBLFVBQVUsQ0FBQ1EsSUFBWCxDQUFnQjtBQUFFRixVQUFBQSxTQUFGO0FBQWFDLFVBQUFBLGdCQUFiO0FBQStCRixVQUFBQTtBQUEvQixTQUFoQjtBQUNEO0FBQ0Y7QUFDRjtBQUVEO0FBQ0Y7QUFDQTtBQUNBOzs7QUFDeUIsU0FBaEJELGdCQUFnQixHQUFHO0FBQ3hCLFdBQU9LLHFCQUFQO0FBQ0Q7QUFFRDtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBQ2EsU0FBSkQsSUFBSSxDQUFDO0FBQUVGLElBQUFBLFNBQUY7QUFBYUksSUFBQUEsTUFBYjtBQUFxQkMsSUFBQUEsWUFBckI7QUFBbUNKLElBQUFBLGdCQUFuQztBQUFxREYsSUFBQUE7QUFBckQsR0FBRCxFQUFrRTtBQUMzRSxVQUFNTyxJQUFJLEdBQUdOLFNBQVMsR0FBRyxRQUFILEdBQWMsaUJBQXBDO0FBQ0EsVUFBTU8sR0FBRyxHQUFHUCxTQUFTLEdBQUdBLFNBQUgsR0FBZUksTUFBcEM7QUFDQSxVQUFNSSxTQUFTLEdBQ2JILFlBQVksSUFBSSxJQUFoQixHQUNJSSxTQURKLEdBRUlKLFlBQVksQ0FBQ0ssTUFBYixHQUFzQixDQUF0QixHQUNDLGVBQWNMLFlBQWEsR0FENUIsR0FFQyxTQUxQLENBSDJFLENBVTNFOztBQUNBLFFBQUlNLE1BQU0sR0FBSSx3Q0FBdUNMLElBQUssS0FBSUMsR0FBSSxJQUFsRTtBQUNBSSxJQUFBQSxNQUFNLElBQUlOLFlBQVksR0FBSSw2QkFBNEJHLFNBQVUsdUJBQTFDLEdBQW1FLEVBQXpGO0FBQ0FHLElBQUFBLE1BQU0sSUFBSVYsZ0JBQWdCLEdBQ3JCLDJCQUEwQkEsZ0JBQWlCLHdCQUR0QixHQUV0QixFQUZKO0FBR0FVLElBQUFBLE1BQU0sSUFBSVosUUFBUSxHQUFJLElBQUdBLFFBQVMsRUFBaEIsR0FBb0IsRUFBdEM7O0FBQ0FhLG9CQUFPQyxJQUFQLENBQVlGLE1BQVo7QUFDRDs7QUE5RGM7O0FBaUVqQkcsTUFBTSxDQUFDQyxPQUFQLEdBQWlCckIsVUFBakIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgRGVwcmVjYXRpb25zIGZyb20gJy4vRGVwcmVjYXRpb25zJztcblxuLyoqXG4gKiBUaGUgZGVwcmVjYXRvciBjbGFzcy5cbiAqL1xuY2xhc3MgRGVwcmVjYXRvciB7XG4gIC8qKlxuICAgKiBTY2FucyB0aGUgUGFyc2UgU2VydmVyIGZvciBkZXByZWNhdGVkIG9wdGlvbnMuXG4gICAqIFRoaXMgbmVlZHMgdG8gYmUgY2FsbGVkIGJlZm9yZSBzZXR0aW5nIG9wdGlvbiBkZWZhdWx0cywgb3RoZXJ3aXNlIGl0XG4gICAqIGJlY29tZXMgaW5kaXN0aW5ndWlzaGFibGUgd2hldGhlciBhbiBvcHRpb24gaGFzIGJlZW4gc2V0IG1hbnVhbGx5IG9yXG4gICAqIGJ5IGRlZmF1bHQuXG4gICAqIEBwYXJhbSB7YW55fSBvcHRpb25zIFRoZSBQYXJzZSBTZXJ2ZXIgb3B0aW9ucy5cbiAgICovXG4gIHN0YXRpYyBzY2FuUGFyc2VTZXJ2ZXJPcHRpb25zKG9wdGlvbnMpIHtcbiAgICAvLyBTY2FuIGZvciBkZXByZWNhdGlvbnNcbiAgICBmb3IgKGNvbnN0IGRlcHJlY2F0aW9uIG9mIERlcHJlY2F0b3IuX2dldERlcHJlY2F0aW9ucygpKSB7XG4gICAgICAvLyBHZXQgZGVwcmVjYXRpb24gcHJvcGVydGllc1xuICAgICAgY29uc3Qgc29sdXRpb24gPSBkZXByZWNhdGlvbi5zb2x1dGlvbjtcbiAgICAgIGNvbnN0IG9wdGlvbktleSA9IGRlcHJlY2F0aW9uLm9wdGlvbktleTtcbiAgICAgIGNvbnN0IGNoYW5nZU5ld0RlZmF1bHQgPSBkZXByZWNhdGlvbi5jaGFuZ2VOZXdEZWZhdWx0O1xuXG4gICAgICAvLyBJZiBkZWZhdWx0IHdpbGwgY2hhbmdlLCBvbmx5IHRocm93IGEgd2FybmluZyBpZiBvcHRpb24gaXMgbm90IHNldFxuICAgICAgaWYgKGNoYW5nZU5ld0RlZmF1bHQgIT0gbnVsbCAmJiBvcHRpb25zW29wdGlvbktleV0gPT0gbnVsbCkge1xuICAgICAgICBEZXByZWNhdG9yLl9sb2coeyBvcHRpb25LZXksIGNoYW5nZU5ld0RlZmF1bHQsIHNvbHV0aW9uIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBkZXByZWNhdGlvbiBkZWZpbml0aW9ucy5cbiAgICogQHJldHVybnMge0FycmF5PE9iamVjdD59IFRoZSBkZXByZWNhdGlvbnMuXG4gICAqL1xuICBzdGF0aWMgX2dldERlcHJlY2F0aW9ucygpIHtcbiAgICByZXR1cm4gRGVwcmVjYXRpb25zO1xuICB9XG5cbiAgLyoqXG4gICAqIExvZ3MgYSBkZXByZWNhdGlvbiB3YXJuaW5nIGZvciBhIFBhcnNlIFNlcnZlciBvcHRpb24uXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBvcHRpb25LZXkgVGhlIG9wdGlvbiBrZXkgaW5jbC4gaXRzIHBhdGgsIGUuZy4gYHNlY3VyaXR5LmVuYWJsZUNoZWNrYC5cbiAgICogQHBhcmFtIHtTdHJpbmd9IGVudktleSBUaGUgZW52aXJvbm1lbnQga2V5LCBlLmcuIGBQQVJTRV9TRVJWRVJfU0VDVVJJVFlgLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gY2hhbmdlTmV3S2V5IFNldCB0aGUgbmV3IGtleSBuYW1lIGlmIHRoZSBjdXJyZW50IGtleSB3aWxsIGJlIHJlcGxhY2VkLFxuICAgKiBvciBzZXQgdG8gYW4gZW1wdHkgc3RyaW5nIGlmIHRoZSBjdXJyZW50IGtleSB3aWxsIGJlIHJlbW92ZWQgd2l0aG91dCByZXBsYWNlbWVudC5cbiAgICogQHBhcmFtIHtTdHJpbmd9IGNoYW5nZU5ld0RlZmF1bHQgU2V0IHRoZSBuZXcgZGVmYXVsdCB2YWx1ZSBpZiB0aGUga2V5J3MgZGVmYXVsdCB2YWx1ZVxuICAgKiB3aWxsIGNoYW5nZSBpbiBhIGZ1dHVyZSB2ZXJzaW9uLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gW3NvbHV0aW9uXSBUaGUgaW5zdHJ1Y3Rpb24gdG8gcmVzb2x2ZSB0aGlzIGRlcHJlY2F0aW9uIHdhcm5pbmcuIFRoaXNcbiAgICogbWVzc2FnZSBtdXN0IG5vdCBpbmNsdWRlIHRoZSB3YXJuaW5nIHRoYXQgdGhlIHBhcmFtZXRlciBpcyBkZXByZWNhdGVkLCB0aGF0IGlzXG4gICAqIGF1dG9tYXRpY2FsbHkgYWRkZWQgdG8gdGhlIG1lc3NhZ2UuIEl0IHNob3VsZCBvbmx5IGNvbnRhaW4gdGhlIGluc3RydWN0aW9uIG9uIGhvd1xuICAgKiB0byByZXNvbHZlIHRoaXMgd2FybmluZy5cbiAgICovXG4gIHN0YXRpYyBfbG9nKHsgb3B0aW9uS2V5LCBlbnZLZXksIGNoYW5nZU5ld0tleSwgY2hhbmdlTmV3RGVmYXVsdCwgc29sdXRpb24gfSkge1xuICAgIGNvbnN0IHR5cGUgPSBvcHRpb25LZXkgPyAnb3B0aW9uJyA6ICdlbnZpcm9ubWVudCBrZXknO1xuICAgIGNvbnN0IGtleSA9IG9wdGlvbktleSA/IG9wdGlvbktleSA6IGVudktleTtcbiAgICBjb25zdCBrZXlBY3Rpb24gPVxuICAgICAgY2hhbmdlTmV3S2V5ID09IG51bGxcbiAgICAgICAgPyB1bmRlZmluZWRcbiAgICAgICAgOiBjaGFuZ2VOZXdLZXkubGVuZ3RoID4gMFxuICAgICAgICA/IGByZW5hbWVkIHRvICcke2NoYW5nZU5ld0tleX0nYFxuICAgICAgICA6IGByZW1vdmVkYDtcblxuICAgIC8vIENvbXBvc2UgbWVzc2FnZVxuICAgIGxldCBvdXRwdXQgPSBgRGVwcmVjYXRpb25XYXJuaW5nOiBUaGUgUGFyc2UgU2VydmVyICR7dHlwZX0gJyR7a2V5fScgYDtcbiAgICBvdXRwdXQgKz0gY2hhbmdlTmV3S2V5ID8gYGlzIGRlcHJlY2F0ZWQgYW5kIHdpbGwgYmUgJHtrZXlBY3Rpb259IGluIGEgZnV0dXJlIHZlcnNpb24uYCA6ICcnO1xuICAgIG91dHB1dCArPSBjaGFuZ2VOZXdEZWZhdWx0XG4gICAgICA/IGBkZWZhdWx0IHdpbGwgY2hhbmdlIHRvICcke2NoYW5nZU5ld0RlZmF1bHR9JyBpbiBhIGZ1dHVyZSB2ZXJzaW9uLmBcbiAgICAgIDogJyc7XG4gICAgb3V0cHV0ICs9IHNvbHV0aW9uID8gYCAke3NvbHV0aW9ufWAgOiAnJztcbiAgICBsb2dnZXIud2FybihvdXRwdXQpO1xuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gRGVwcmVjYXRvcjtcbiJdfQ==