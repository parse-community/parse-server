"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.AppCache = void 0;

var _InMemoryCache = require("./Adapters/Cache/InMemoryCache");

var AppCache = new _InMemoryCache.InMemoryCache({
  ttl: NaN
});
exports.AppCache = AppCache;
var _default = AppCache;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9jYWNoZS5qcyJdLCJuYW1lcyI6WyJBcHBDYWNoZSIsIkluTWVtb3J5Q2FjaGUiLCJ0dGwiLCJOYU4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFFTyxJQUFJQSxRQUFRLEdBQUcsSUFBSUMsNEJBQUosQ0FBa0I7QUFBRUMsRUFBQUEsR0FBRyxFQUFFQztBQUFQLENBQWxCLENBQWY7O2VBQ1FILFEiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBJbk1lbW9yeUNhY2hlIH0gZnJvbSAnLi9BZGFwdGVycy9DYWNoZS9Jbk1lbW9yeUNhY2hlJztcblxuZXhwb3J0IHZhciBBcHBDYWNoZSA9IG5ldyBJbk1lbW9yeUNhY2hlKHsgdHRsOiBOYU4gfSk7XG5leHBvcnQgZGVmYXVsdCBBcHBDYWNoZTtcbiJdfQ==