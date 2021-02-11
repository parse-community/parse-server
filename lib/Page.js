"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.Page = void 0;

/*eslint no-unused-vars: "off"*/

/**
 * @interface Page
 * Page
 * Page content that is returned by PageRouter.
 */
class Page {
  /**
   * @description Creates a page.
   * @param {Object} params The page parameters.
   * @param {String} params.id The page identifier.
   * @param {String} params.defaultFile The page file name.
   * @returns {Page} The page.
   */
  constructor(params = {}) {
    const {
      id,
      defaultFile
    } = params;
    this._id = id;
    this._defaultFile = defaultFile;
  }

  get id() {
    return this._id;
  }

  get defaultFile() {
    return this._defaultFile;
  }

  set id(v) {
    this._id = v;
  }

  set defaultFile(v) {
    this._defaultFile = v;
  }

}

exports.Page = Page;
var _default = Page;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9QYWdlLmpzIl0sIm5hbWVzIjpbIlBhZ2UiLCJjb25zdHJ1Y3RvciIsInBhcmFtcyIsImlkIiwiZGVmYXVsdEZpbGUiLCJfaWQiLCJfZGVmYXVsdEZpbGUiLCJ2Il0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNPLE1BQU1BLElBQU4sQ0FBVztBQUNoQjtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNFQyxFQUFBQSxXQUFXLENBQUNDLE1BQU0sR0FBRyxFQUFWLEVBQWM7QUFDdkIsVUFBTTtBQUFFQyxNQUFBQSxFQUFGO0FBQU1DLE1BQUFBO0FBQU4sUUFBc0JGLE1BQTVCO0FBRUEsU0FBS0csR0FBTCxHQUFXRixFQUFYO0FBQ0EsU0FBS0csWUFBTCxHQUFvQkYsV0FBcEI7QUFDRDs7QUFFRCxNQUFJRCxFQUFKLEdBQVM7QUFDUCxXQUFPLEtBQUtFLEdBQVo7QUFDRDs7QUFDRCxNQUFJRCxXQUFKLEdBQWtCO0FBQ2hCLFdBQU8sS0FBS0UsWUFBWjtBQUNEOztBQUNELE1BQUlILEVBQUosQ0FBT0ksQ0FBUCxFQUFVO0FBQ1IsU0FBS0YsR0FBTCxHQUFXRSxDQUFYO0FBQ0Q7O0FBQ0QsTUFBSUgsV0FBSixDQUFnQkcsQ0FBaEIsRUFBbUI7QUFDakIsU0FBS0QsWUFBTCxHQUFvQkMsQ0FBcEI7QUFDRDs7QUExQmU7OztlQTZCSFAsSSIsInNvdXJjZXNDb250ZW50IjpbIi8qZXNsaW50IG5vLXVudXNlZC12YXJzOiBcIm9mZlwiKi9cbi8qKlxuICogQGludGVyZmFjZSBQYWdlXG4gKiBQYWdlXG4gKiBQYWdlIGNvbnRlbnQgdGhhdCBpcyByZXR1cm5lZCBieSBQYWdlUm91dGVyLlxuICovXG5leHBvcnQgY2xhc3MgUGFnZSB7XG4gIC8qKlxuICAgKiBAZGVzY3JpcHRpb24gQ3JlYXRlcyBhIHBhZ2UuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBwYXJhbXMgVGhlIHBhZ2UgcGFyYW1ldGVycy5cbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhcmFtcy5pZCBUaGUgcGFnZSBpZGVudGlmaWVyLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGFyYW1zLmRlZmF1bHRGaWxlIFRoZSBwYWdlIGZpbGUgbmFtZS5cbiAgICogQHJldHVybnMge1BhZ2V9IFRoZSBwYWdlLlxuICAgKi9cbiAgY29uc3RydWN0b3IocGFyYW1zID0ge30pIHtcbiAgICBjb25zdCB7IGlkLCBkZWZhdWx0RmlsZSB9ID0gcGFyYW1zO1xuXG4gICAgdGhpcy5faWQgPSBpZDtcbiAgICB0aGlzLl9kZWZhdWx0RmlsZSA9IGRlZmF1bHRGaWxlO1xuICB9XG5cbiAgZ2V0IGlkKCkge1xuICAgIHJldHVybiB0aGlzLl9pZDtcbiAgfVxuICBnZXQgZGVmYXVsdEZpbGUoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2RlZmF1bHRGaWxlO1xuICB9XG4gIHNldCBpZCh2KSB7XG4gICAgdGhpcy5faWQgPSB2O1xuICB9XG4gIHNldCBkZWZhdWx0RmlsZSh2KSB7XG4gICAgdGhpcy5fZGVmYXVsdEZpbGUgPSB2O1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFBhZ2U7XG4iXX0=