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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9QYWdlLmpzIl0sIm5hbWVzIjpbIlBhZ2UiLCJjb25zdHJ1Y3RvciIsInBhcmFtcyIsImlkIiwiZGVmYXVsdEZpbGUiLCJfaWQiLCJfZGVmYXVsdEZpbGUiLCJ2Il0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNPLE1BQU1BLElBQU4sQ0FBVztBQUNoQjtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNFQyxFQUFBQSxXQUFXLENBQUNDLE1BQU0sR0FBRyxFQUFWLEVBQWM7QUFDdkIsVUFBTTtBQUFFQyxNQUFBQSxFQUFGO0FBQU1DLE1BQUFBO0FBQU4sUUFBc0JGLE1BQTVCO0FBRUEsU0FBS0csR0FBTCxHQUFXRixFQUFYO0FBQ0EsU0FBS0csWUFBTCxHQUFvQkYsV0FBcEI7QUFDRDs7QUFFSyxNQUFGRCxFQUFFLEdBQUc7QUFDUCxXQUFPLEtBQUtFLEdBQVo7QUFDRDs7QUFDYyxNQUFYRCxXQUFXLEdBQUc7QUFDaEIsV0FBTyxLQUFLRSxZQUFaO0FBQ0Q7O0FBQ0ssTUFBRkgsRUFBRSxDQUFDSSxDQUFELEVBQUk7QUFDUixTQUFLRixHQUFMLEdBQVdFLENBQVg7QUFDRDs7QUFDYyxNQUFYSCxXQUFXLENBQUNHLENBQUQsRUFBSTtBQUNqQixTQUFLRCxZQUFMLEdBQW9CQyxDQUFwQjtBQUNEOztBQTFCZTs7O2VBNkJIUCxJIiwic291cmNlc0NvbnRlbnQiOlsiLyplc2xpbnQgbm8tdW51c2VkLXZhcnM6IFwib2ZmXCIqL1xuLyoqXG4gKiBAaW50ZXJmYWNlIFBhZ2VcbiAqIFBhZ2VcbiAqIFBhZ2UgY29udGVudCB0aGF0IGlzIHJldHVybmVkIGJ5IFBhZ2VSb3V0ZXIuXG4gKi9cbmV4cG9ydCBjbGFzcyBQYWdlIHtcbiAgLyoqXG4gICAqIEBkZXNjcmlwdGlvbiBDcmVhdGVzIGEgcGFnZS5cbiAgICogQHBhcmFtIHtPYmplY3R9IHBhcmFtcyBUaGUgcGFnZSBwYXJhbWV0ZXJzLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGFyYW1zLmlkIFRoZSBwYWdlIGlkZW50aWZpZXIuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXJhbXMuZGVmYXVsdEZpbGUgVGhlIHBhZ2UgZmlsZSBuYW1lLlxuICAgKiBAcmV0dXJucyB7UGFnZX0gVGhlIHBhZ2UuXG4gICAqL1xuICBjb25zdHJ1Y3RvcihwYXJhbXMgPSB7fSkge1xuICAgIGNvbnN0IHsgaWQsIGRlZmF1bHRGaWxlIH0gPSBwYXJhbXM7XG5cbiAgICB0aGlzLl9pZCA9IGlkO1xuICAgIHRoaXMuX2RlZmF1bHRGaWxlID0gZGVmYXVsdEZpbGU7XG4gIH1cblxuICBnZXQgaWQoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2lkO1xuICB9XG4gIGdldCBkZWZhdWx0RmlsZSgpIHtcbiAgICByZXR1cm4gdGhpcy5fZGVmYXVsdEZpbGU7XG4gIH1cbiAgc2V0IGlkKHYpIHtcbiAgICB0aGlzLl9pZCA9IHY7XG4gIH1cbiAgc2V0IGRlZmF1bHRGaWxlKHYpIHtcbiAgICB0aGlzLl9kZWZhdWx0RmlsZSA9IHY7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgUGFnZTtcbiJdfQ==