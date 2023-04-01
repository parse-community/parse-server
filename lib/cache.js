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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJBcHBDYWNoZSIsIkluTWVtb3J5Q2FjaGUiLCJ0dGwiLCJOYU4iXSwic291cmNlcyI6WyIuLi9zcmMvY2FjaGUuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgSW5NZW1vcnlDYWNoZSB9IGZyb20gJy4vQWRhcHRlcnMvQ2FjaGUvSW5NZW1vcnlDYWNoZSc7XG5cbmV4cG9ydCB2YXIgQXBwQ2FjaGUgPSBuZXcgSW5NZW1vcnlDYWNoZSh7IHR0bDogTmFOIH0pO1xuZXhwb3J0IGRlZmF1bHQgQXBwQ2FjaGU7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBO0FBRU8sSUFBSUEsUUFBUSxHQUFHLElBQUlDLDRCQUFhLENBQUM7RUFBRUMsR0FBRyxFQUFFQztBQUFJLENBQUMsQ0FBQztBQUFDO0FBQUEsZUFDdkNILFFBQVE7QUFBQSJ9