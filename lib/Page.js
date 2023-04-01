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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQYWdlIiwiY29uc3RydWN0b3IiLCJwYXJhbXMiLCJpZCIsImRlZmF1bHRGaWxlIiwiX2lkIiwiX2RlZmF1bHRGaWxlIiwidiJdLCJzb3VyY2VzIjpbIi4uL3NyYy9QYWdlLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qZXNsaW50IG5vLXVudXNlZC12YXJzOiBcIm9mZlwiKi9cbi8qKlxuICogQGludGVyZmFjZSBQYWdlXG4gKiBQYWdlXG4gKiBQYWdlIGNvbnRlbnQgdGhhdCBpcyByZXR1cm5lZCBieSBQYWdlUm91dGVyLlxuICovXG5leHBvcnQgY2xhc3MgUGFnZSB7XG4gIC8qKlxuICAgKiBAZGVzY3JpcHRpb24gQ3JlYXRlcyBhIHBhZ2UuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBwYXJhbXMgVGhlIHBhZ2UgcGFyYW1ldGVycy5cbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhcmFtcy5pZCBUaGUgcGFnZSBpZGVudGlmaWVyLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGFyYW1zLmRlZmF1bHRGaWxlIFRoZSBwYWdlIGZpbGUgbmFtZS5cbiAgICogQHJldHVybnMge1BhZ2V9IFRoZSBwYWdlLlxuICAgKi9cbiAgY29uc3RydWN0b3IocGFyYW1zID0ge30pIHtcbiAgICBjb25zdCB7IGlkLCBkZWZhdWx0RmlsZSB9ID0gcGFyYW1zO1xuXG4gICAgdGhpcy5faWQgPSBpZDtcbiAgICB0aGlzLl9kZWZhdWx0RmlsZSA9IGRlZmF1bHRGaWxlO1xuICB9XG5cbiAgZ2V0IGlkKCkge1xuICAgIHJldHVybiB0aGlzLl9pZDtcbiAgfVxuICBnZXQgZGVmYXVsdEZpbGUoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2RlZmF1bHRGaWxlO1xuICB9XG4gIHNldCBpZCh2KSB7XG4gICAgdGhpcy5faWQgPSB2O1xuICB9XG4gIHNldCBkZWZhdWx0RmlsZSh2KSB7XG4gICAgdGhpcy5fZGVmYXVsdEZpbGUgPSB2O1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFBhZ2U7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNPLE1BQU1BLElBQUksQ0FBQztFQUNoQjtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNFQyxXQUFXLENBQUNDLE1BQU0sR0FBRyxDQUFDLENBQUMsRUFBRTtJQUN2QixNQUFNO01BQUVDLEVBQUU7TUFBRUM7SUFBWSxDQUFDLEdBQUdGLE1BQU07SUFFbEMsSUFBSSxDQUFDRyxHQUFHLEdBQUdGLEVBQUU7SUFDYixJQUFJLENBQUNHLFlBQVksR0FBR0YsV0FBVztFQUNqQztFQUVBLElBQUlELEVBQUUsR0FBRztJQUNQLE9BQU8sSUFBSSxDQUFDRSxHQUFHO0VBQ2pCO0VBQ0EsSUFBSUQsV0FBVyxHQUFHO0lBQ2hCLE9BQU8sSUFBSSxDQUFDRSxZQUFZO0VBQzFCO0VBQ0EsSUFBSUgsRUFBRSxDQUFDSSxDQUFDLEVBQUU7SUFDUixJQUFJLENBQUNGLEdBQUcsR0FBR0UsQ0FBQztFQUNkO0VBQ0EsSUFBSUgsV0FBVyxDQUFDRyxDQUFDLEVBQUU7SUFDakIsSUFBSSxDQUFDRCxZQUFZLEdBQUdDLENBQUM7RUFDdkI7QUFDRjtBQUFDO0FBQUEsZUFFY1AsSUFBSTtBQUFBIn0=