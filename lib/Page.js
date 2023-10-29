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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQYWdlIiwiY29uc3RydWN0b3IiLCJwYXJhbXMiLCJpZCIsImRlZmF1bHRGaWxlIiwiX2lkIiwiX2RlZmF1bHRGaWxlIiwidiIsImV4cG9ydHMiLCJfZGVmYXVsdCIsImRlZmF1bHQiXSwic291cmNlcyI6WyIuLi9zcmMvUGFnZS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKmVzbGludCBuby11bnVzZWQtdmFyczogXCJvZmZcIiovXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFnZVxuICogUGFnZVxuICogUGFnZSBjb250ZW50IHRoYXQgaXMgcmV0dXJuZWQgYnkgUGFnZVJvdXRlci5cbiAqL1xuZXhwb3J0IGNsYXNzIFBhZ2Uge1xuICAvKipcbiAgICogQGRlc2NyaXB0aW9uIENyZWF0ZXMgYSBwYWdlLlxuICAgKiBAcGFyYW0ge09iamVjdH0gcGFyYW1zIFRoZSBwYWdlIHBhcmFtZXRlcnMuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXJhbXMuaWQgVGhlIHBhZ2UgaWRlbnRpZmllci5cbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhcmFtcy5kZWZhdWx0RmlsZSBUaGUgcGFnZSBmaWxlIG5hbWUuXG4gICAqIEByZXR1cm5zIHtQYWdlfSBUaGUgcGFnZS5cbiAgICovXG4gIGNvbnN0cnVjdG9yKHBhcmFtcyA9IHt9KSB7XG4gICAgY29uc3QgeyBpZCwgZGVmYXVsdEZpbGUgfSA9IHBhcmFtcztcblxuICAgIHRoaXMuX2lkID0gaWQ7XG4gICAgdGhpcy5fZGVmYXVsdEZpbGUgPSBkZWZhdWx0RmlsZTtcbiAgfVxuXG4gIGdldCBpZCgpIHtcbiAgICByZXR1cm4gdGhpcy5faWQ7XG4gIH1cbiAgZ2V0IGRlZmF1bHRGaWxlKCkge1xuICAgIHJldHVybiB0aGlzLl9kZWZhdWx0RmlsZTtcbiAgfVxuICBzZXQgaWQodikge1xuICAgIHRoaXMuX2lkID0gdjtcbiAgfVxuICBzZXQgZGVmYXVsdEZpbGUodikge1xuICAgIHRoaXMuX2RlZmF1bHRGaWxlID0gdjtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBQYWdlO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDTyxNQUFNQSxJQUFJLENBQUM7RUFDaEI7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDRUMsV0FBV0EsQ0FBQ0MsTUFBTSxHQUFHLENBQUMsQ0FBQyxFQUFFO0lBQ3ZCLE1BQU07TUFBRUMsRUFBRTtNQUFFQztJQUFZLENBQUMsR0FBR0YsTUFBTTtJQUVsQyxJQUFJLENBQUNHLEdBQUcsR0FBR0YsRUFBRTtJQUNiLElBQUksQ0FBQ0csWUFBWSxHQUFHRixXQUFXO0VBQ2pDO0VBRUEsSUFBSUQsRUFBRUEsQ0FBQSxFQUFHO0lBQ1AsT0FBTyxJQUFJLENBQUNFLEdBQUc7RUFDakI7RUFDQSxJQUFJRCxXQUFXQSxDQUFBLEVBQUc7SUFDaEIsT0FBTyxJQUFJLENBQUNFLFlBQVk7RUFDMUI7RUFDQSxJQUFJSCxFQUFFQSxDQUFDSSxDQUFDLEVBQUU7SUFDUixJQUFJLENBQUNGLEdBQUcsR0FBR0UsQ0FBQztFQUNkO0VBQ0EsSUFBSUgsV0FBV0EsQ0FBQ0csQ0FBQyxFQUFFO0lBQ2pCLElBQUksQ0FBQ0QsWUFBWSxHQUFHQyxDQUFDO0VBQ3ZCO0FBQ0Y7QUFBQ0MsT0FBQSxDQUFBUixJQUFBLEdBQUFBLElBQUE7QUFBQSxJQUFBUyxRQUFBLEdBRWNULElBQUk7QUFBQVEsT0FBQSxDQUFBRSxPQUFBLEdBQUFELFFBQUEifQ==