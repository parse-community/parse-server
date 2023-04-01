"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.RolesRouter = void 0;
var _ClassesRouter = _interopRequireDefault(require("./ClassesRouter"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
class RolesRouter extends _ClassesRouter.default {
  className() {
    return '_Role';
  }
  mountRoutes() {
    this.route('GET', '/roles', req => {
      return this.handleFind(req);
    });
    this.route('GET', '/roles/:objectId', req => {
      return this.handleGet(req);
    });
    this.route('POST', '/roles', req => {
      return this.handleCreate(req);
    });
    this.route('PUT', '/roles/:objectId', req => {
      return this.handleUpdate(req);
    });
    this.route('DELETE', '/roles/:objectId', req => {
      return this.handleDelete(req);
    });
  }
}
exports.RolesRouter = RolesRouter;
var _default = RolesRouter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSb2xlc1JvdXRlciIsIkNsYXNzZXNSb3V0ZXIiLCJjbGFzc05hbWUiLCJtb3VudFJvdXRlcyIsInJvdXRlIiwicmVxIiwiaGFuZGxlRmluZCIsImhhbmRsZUdldCIsImhhbmRsZUNyZWF0ZSIsImhhbmRsZVVwZGF0ZSIsImhhbmRsZURlbGV0ZSJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1JvbGVzUm91dGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBDbGFzc2VzUm91dGVyIGZyb20gJy4vQ2xhc3Nlc1JvdXRlcic7XG5cbmV4cG9ydCBjbGFzcyBSb2xlc1JvdXRlciBleHRlbmRzIENsYXNzZXNSb3V0ZXIge1xuICBjbGFzc05hbWUoKSB7XG4gICAgcmV0dXJuICdfUm9sZSc7XG4gIH1cblxuICBtb3VudFJvdXRlcygpIHtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3JvbGVzJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUZpbmQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3JvbGVzLzpvYmplY3RJZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVHZXQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9yb2xlcycsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVDcmVhdGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQVVQnLCAnL3JvbGVzLzpvYmplY3RJZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVVcGRhdGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdERUxFVEUnLCAnL3JvbGVzLzpvYmplY3RJZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVEZWxldGUocmVxKTtcbiAgICB9KTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBSb2xlc1JvdXRlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUE7QUFBNEM7QUFFckMsTUFBTUEsV0FBVyxTQUFTQyxzQkFBYSxDQUFDO0VBQzdDQyxTQUFTLEdBQUc7SUFDVixPQUFPLE9BQU87RUFDaEI7RUFFQUMsV0FBVyxHQUFHO0lBQ1osSUFBSSxDQUFDQyxLQUFLLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRUMsR0FBRyxJQUFJO01BQ2pDLE9BQU8sSUFBSSxDQUFDQyxVQUFVLENBQUNELEdBQUcsQ0FBQztJQUM3QixDQUFDLENBQUM7SUFDRixJQUFJLENBQUNELEtBQUssQ0FBQyxLQUFLLEVBQUUsa0JBQWtCLEVBQUVDLEdBQUcsSUFBSTtNQUMzQyxPQUFPLElBQUksQ0FBQ0UsU0FBUyxDQUFDRixHQUFHLENBQUM7SUFDNUIsQ0FBQyxDQUFDO0lBQ0YsSUFBSSxDQUFDRCxLQUFLLENBQUMsTUFBTSxFQUFFLFFBQVEsRUFBRUMsR0FBRyxJQUFJO01BQ2xDLE9BQU8sSUFBSSxDQUFDRyxZQUFZLENBQUNILEdBQUcsQ0FBQztJQUMvQixDQUFDLENBQUM7SUFDRixJQUFJLENBQUNELEtBQUssQ0FBQyxLQUFLLEVBQUUsa0JBQWtCLEVBQUVDLEdBQUcsSUFBSTtNQUMzQyxPQUFPLElBQUksQ0FBQ0ksWUFBWSxDQUFDSixHQUFHLENBQUM7SUFDL0IsQ0FBQyxDQUFDO0lBQ0YsSUFBSSxDQUFDRCxLQUFLLENBQUMsUUFBUSxFQUFFLGtCQUFrQixFQUFFQyxHQUFHLElBQUk7TUFDOUMsT0FBTyxJQUFJLENBQUNLLFlBQVksQ0FBQ0wsR0FBRyxDQUFDO0lBQy9CLENBQUMsQ0FBQztFQUNKO0FBQ0Y7QUFBQztBQUFBLGVBRWNMLFdBQVc7QUFBQSJ9