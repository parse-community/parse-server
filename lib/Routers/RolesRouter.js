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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1JvbGVzUm91dGVyLmpzIl0sIm5hbWVzIjpbIlJvbGVzUm91dGVyIiwiQ2xhc3Nlc1JvdXRlciIsImNsYXNzTmFtZSIsIm1vdW50Um91dGVzIiwicm91dGUiLCJyZXEiLCJoYW5kbGVGaW5kIiwiaGFuZGxlR2V0IiwiaGFuZGxlQ3JlYXRlIiwiaGFuZGxlVXBkYXRlIiwiaGFuZGxlRGVsZXRlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7Ozs7QUFFTyxNQUFNQSxXQUFOLFNBQTBCQyxzQkFBMUIsQ0FBd0M7QUFDN0NDLEVBQUFBLFNBQVMsR0FBRztBQUNWLFdBQU8sT0FBUDtBQUNEOztBQUVEQyxFQUFBQSxXQUFXLEdBQUc7QUFDWixTQUFLQyxLQUFMLENBQVcsS0FBWCxFQUFrQixRQUFsQixFQUE0QkMsR0FBRyxJQUFJO0FBQ2pDLGFBQU8sS0FBS0MsVUFBTCxDQUFnQkQsR0FBaEIsQ0FBUDtBQUNELEtBRkQ7QUFHQSxTQUFLRCxLQUFMLENBQVcsS0FBWCxFQUFrQixrQkFBbEIsRUFBc0NDLEdBQUcsSUFBSTtBQUMzQyxhQUFPLEtBQUtFLFNBQUwsQ0FBZUYsR0FBZixDQUFQO0FBQ0QsS0FGRDtBQUdBLFNBQUtELEtBQUwsQ0FBVyxNQUFYLEVBQW1CLFFBQW5CLEVBQTZCQyxHQUFHLElBQUk7QUFDbEMsYUFBTyxLQUFLRyxZQUFMLENBQWtCSCxHQUFsQixDQUFQO0FBQ0QsS0FGRDtBQUdBLFNBQUtELEtBQUwsQ0FBVyxLQUFYLEVBQWtCLGtCQUFsQixFQUFzQ0MsR0FBRyxJQUFJO0FBQzNDLGFBQU8sS0FBS0ksWUFBTCxDQUFrQkosR0FBbEIsQ0FBUDtBQUNELEtBRkQ7QUFHQSxTQUFLRCxLQUFMLENBQVcsUUFBWCxFQUFxQixrQkFBckIsRUFBeUNDLEdBQUcsSUFBSTtBQUM5QyxhQUFPLEtBQUtLLFlBQUwsQ0FBa0JMLEdBQWxCLENBQVA7QUFDRCxLQUZEO0FBR0Q7O0FBckI0Qzs7O2VBd0JoQ0wsVyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBDbGFzc2VzUm91dGVyIGZyb20gJy4vQ2xhc3Nlc1JvdXRlcic7XG5cbmV4cG9ydCBjbGFzcyBSb2xlc1JvdXRlciBleHRlbmRzIENsYXNzZXNSb3V0ZXIge1xuICBjbGFzc05hbWUoKSB7XG4gICAgcmV0dXJuICdfUm9sZSc7XG4gIH1cblxuICBtb3VudFJvdXRlcygpIHtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3JvbGVzJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUZpbmQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3JvbGVzLzpvYmplY3RJZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVHZXQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9yb2xlcycsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVDcmVhdGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQVVQnLCAnL3JvbGVzLzpvYmplY3RJZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVVcGRhdGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdERUxFVEUnLCAnL3JvbGVzLzpvYmplY3RJZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVEZWxldGUocmVxKTtcbiAgICB9KTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBSb2xlc1JvdXRlcjtcbiJdfQ==