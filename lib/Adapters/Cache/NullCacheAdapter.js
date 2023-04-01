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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJOdWxsQ2FjaGVBZGFwdGVyIiwiY29uc3RydWN0b3IiLCJnZXQiLCJQcm9taXNlIiwicmVzb2x2ZSIsInB1dCIsImRlbCIsImNsZWFyIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0FkYXB0ZXJzL0NhY2hlL051bGxDYWNoZUFkYXB0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGNsYXNzIE51bGxDYWNoZUFkYXB0ZXIge1xuICBjb25zdHJ1Y3RvcigpIHt9XG5cbiAgZ2V0KCkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAgIHJldHVybiByZXNvbHZlKG51bGwpO1xuICAgIH0pO1xuICB9XG5cbiAgcHV0KCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIGRlbCgpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBjbGVhcigpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgTnVsbENhY2hlQWRhcHRlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQU8sTUFBTUEsZ0JBQWdCLENBQUM7RUFDNUJDLFdBQVcsR0FBRyxDQUFDO0VBRWZDLEdBQUcsR0FBRztJQUNKLE9BQU8sSUFBSUMsT0FBTyxDQUFDQyxPQUFPLElBQUk7TUFDNUIsT0FBT0EsT0FBTyxDQUFDLElBQUksQ0FBQztJQUN0QixDQUFDLENBQUM7RUFDSjtFQUVBQyxHQUFHLEdBQUc7SUFDSixPQUFPRixPQUFPLENBQUNDLE9BQU8sRUFBRTtFQUMxQjtFQUVBRSxHQUFHLEdBQUc7SUFDSixPQUFPSCxPQUFPLENBQUNDLE9BQU8sRUFBRTtFQUMxQjtFQUVBRyxLQUFLLEdBQUc7SUFDTixPQUFPSixPQUFPLENBQUNDLE9BQU8sRUFBRTtFQUMxQjtBQUNGO0FBQUM7QUFBQSxlQUVjSixnQkFBZ0I7QUFBQSJ9