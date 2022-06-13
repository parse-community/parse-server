"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.NullCacheAdapter = void 0;

class NullCacheAdapter {
  constructor() {}

  get() {
    return new Promise(resolve => {
      return resolve(null);
    });
  }

  put() {
    return Promise.resolve();
  }

  del() {
    return Promise.resolve();
  }

  clear() {
    return Promise.resolve();
  }

}

exports.NullCacheAdapter = NullCacheAdapter;
var _default = NullCacheAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9DYWNoZS9OdWxsQ2FjaGVBZGFwdGVyLmpzIl0sIm5hbWVzIjpbIk51bGxDYWNoZUFkYXB0ZXIiLCJjb25zdHJ1Y3RvciIsImdldCIsIlByb21pc2UiLCJyZXNvbHZlIiwicHV0IiwiZGVsIiwiY2xlYXIiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBTyxNQUFNQSxnQkFBTixDQUF1QjtBQUM1QkMsRUFBQUEsV0FBVyxHQUFHLENBQUU7O0FBRWhCQyxFQUFBQSxHQUFHLEdBQUc7QUFDSixXQUFPLElBQUlDLE9BQUosQ0FBWUMsT0FBTyxJQUFJO0FBQzVCLGFBQU9BLE9BQU8sQ0FBQyxJQUFELENBQWQ7QUFDRCxLQUZNLENBQVA7QUFHRDs7QUFFREMsRUFBQUEsR0FBRyxHQUFHO0FBQ0osV0FBT0YsT0FBTyxDQUFDQyxPQUFSLEVBQVA7QUFDRDs7QUFFREUsRUFBQUEsR0FBRyxHQUFHO0FBQ0osV0FBT0gsT0FBTyxDQUFDQyxPQUFSLEVBQVA7QUFDRDs7QUFFREcsRUFBQUEsS0FBSyxHQUFHO0FBQ04sV0FBT0osT0FBTyxDQUFDQyxPQUFSLEVBQVA7QUFDRDs7QUFuQjJCOzs7ZUFzQmZKLGdCIiwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGNsYXNzIE51bGxDYWNoZUFkYXB0ZXIge1xuICBjb25zdHJ1Y3RvcigpIHt9XG5cbiAgZ2V0KCkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAgIHJldHVybiByZXNvbHZlKG51bGwpO1xuICAgIH0pO1xuICB9XG5cbiAgcHV0KCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIGRlbCgpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBjbGVhcigpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgTnVsbENhY2hlQWRhcHRlcjtcbiJdfQ==