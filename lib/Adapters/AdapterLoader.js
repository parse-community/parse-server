"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.loadAdapter = loadAdapter;
exports.default = void 0;

/**
 * @module AdapterLoader
 */

/**
 * @static
 * Attempt to load an adapter or fallback to the default.
 * @param {Adapter} adapter an adapter
 * @param {Adapter} defaultAdapter the default adapter to load
 * @param {any} options options to pass to the contstructor
 * @returns {Object} the loaded adapter
 */
function loadAdapter(adapter, defaultAdapter, options) {
  if (!adapter) {
    if (!defaultAdapter) {
      return options;
    } // Load from the default adapter when no adapter is set


    return loadAdapter(defaultAdapter, undefined, options);
  } else if (typeof adapter === 'function') {
    try {
      return adapter(options);
    } catch (e) {
      if (e.name === 'TypeError') {
        var Adapter = adapter;
        return new Adapter(options);
      } else {
        throw e;
      }
    }
  } else if (typeof adapter === 'string') {
    /* eslint-disable */
    adapter = require(adapter); // If it's define as a module, get the default

    if (adapter.default) {
      adapter = adapter.default;
    }

    return loadAdapter(adapter, undefined, options);
  } else if (adapter.module) {
    return loadAdapter(adapter.module, undefined, adapter.options);
  } else if (adapter.class) {
    return loadAdapter(adapter.class, undefined, adapter.options);
  } else if (adapter.adapter) {
    return loadAdapter(adapter.adapter, undefined, adapter.options);
  } // return the adapter as provided


  return adapter;
}

var _default = loadAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9BZGFwdGVycy9BZGFwdGVyTG9hZGVyLmpzIl0sIm5hbWVzIjpbImxvYWRBZGFwdGVyIiwiYWRhcHRlciIsImRlZmF1bHRBZGFwdGVyIiwib3B0aW9ucyIsInVuZGVmaW5lZCIsImUiLCJuYW1lIiwiQWRhcHRlciIsInJlcXVpcmUiLCJkZWZhdWx0IiwibW9kdWxlIiwiY2xhc3MiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7O0FBQUE7Ozs7QUFHQTs7Ozs7Ozs7QUFRTyxTQUFTQSxXQUFULENBQXdCQyxPQUF4QixFQUFpQ0MsY0FBakMsRUFBaURDLE9BQWpELEVBQTZEO0FBQ2xFLE1BQUksQ0FBQ0YsT0FBTCxFQUFjO0FBQ1osUUFBSSxDQUFDQyxjQUFMLEVBQXFCO0FBQ25CLGFBQU9DLE9BQVA7QUFDRCxLQUhXLENBSVo7OztBQUNBLFdBQU9ILFdBQVcsQ0FBQ0UsY0FBRCxFQUFpQkUsU0FBakIsRUFBNEJELE9BQTVCLENBQWxCO0FBQ0QsR0FORCxNQU1PLElBQUksT0FBT0YsT0FBUCxLQUFtQixVQUF2QixFQUFtQztBQUN4QyxRQUFJO0FBQ0YsYUFBT0EsT0FBTyxDQUFDRSxPQUFELENBQWQ7QUFDRCxLQUZELENBRUUsT0FBT0UsQ0FBUCxFQUFVO0FBQ1YsVUFBSUEsQ0FBQyxDQUFDQyxJQUFGLEtBQVcsV0FBZixFQUE0QjtBQUMxQixZQUFJQyxPQUFPLEdBQUdOLE9BQWQ7QUFDQSxlQUFPLElBQUlNLE9BQUosQ0FBWUosT0FBWixDQUFQO0FBQ0QsT0FIRCxNQUdPO0FBQ0wsY0FBTUUsQ0FBTjtBQUNEO0FBQ0Y7QUFDRixHQVhNLE1BV0EsSUFBSSxPQUFPSixPQUFQLEtBQW1CLFFBQXZCLEVBQWlDO0FBQ3RDO0FBQ0FBLElBQUFBLE9BQU8sR0FBR08sT0FBTyxDQUFDUCxPQUFELENBQWpCLENBRnNDLENBR3RDOztBQUNBLFFBQUlBLE9BQU8sQ0FBQ1EsT0FBWixFQUFxQjtBQUNuQlIsTUFBQUEsT0FBTyxHQUFHQSxPQUFPLENBQUNRLE9BQWxCO0FBQ0Q7O0FBQ0QsV0FBT1QsV0FBVyxDQUFDQyxPQUFELEVBQVVHLFNBQVYsRUFBcUJELE9BQXJCLENBQWxCO0FBQ0QsR0FSTSxNQVFBLElBQUlGLE9BQU8sQ0FBQ1MsTUFBWixFQUFvQjtBQUN6QixXQUFPVixXQUFXLENBQUNDLE9BQU8sQ0FBQ1MsTUFBVCxFQUFpQk4sU0FBakIsRUFBNEJILE9BQU8sQ0FBQ0UsT0FBcEMsQ0FBbEI7QUFDRCxHQUZNLE1BRUEsSUFBSUYsT0FBTyxDQUFDVSxLQUFaLEVBQW1CO0FBQ3hCLFdBQU9YLFdBQVcsQ0FBQ0MsT0FBTyxDQUFDVSxLQUFULEVBQWdCUCxTQUFoQixFQUEyQkgsT0FBTyxDQUFDRSxPQUFuQyxDQUFsQjtBQUNELEdBRk0sTUFFQSxJQUFJRixPQUFPLENBQUNBLE9BQVosRUFBcUI7QUFDMUIsV0FBT0QsV0FBVyxDQUFDQyxPQUFPLENBQUNBLE9BQVQsRUFBa0JHLFNBQWxCLEVBQTZCSCxPQUFPLENBQUNFLE9BQXJDLENBQWxCO0FBQ0QsR0FoQ2lFLENBaUNsRTs7O0FBQ0EsU0FBT0YsT0FBUDtBQUNEOztlQUVjRCxXIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbW9kdWxlIEFkYXB0ZXJMb2FkZXJcbiAqL1xuLyoqXG4gKiBAc3RhdGljXG4gKiBBdHRlbXB0IHRvIGxvYWQgYW4gYWRhcHRlciBvciBmYWxsYmFjayB0byB0aGUgZGVmYXVsdC5cbiAqIEBwYXJhbSB7QWRhcHRlcn0gYWRhcHRlciBhbiBhZGFwdGVyXG4gKiBAcGFyYW0ge0FkYXB0ZXJ9IGRlZmF1bHRBZGFwdGVyIHRoZSBkZWZhdWx0IGFkYXB0ZXIgdG8gbG9hZFxuICogQHBhcmFtIHthbnl9IG9wdGlvbnMgb3B0aW9ucyB0byBwYXNzIHRvIHRoZSBjb250c3RydWN0b3JcbiAqIEByZXR1cm5zIHtPYmplY3R9IHRoZSBsb2FkZWQgYWRhcHRlclxuICovXG5leHBvcnQgZnVuY3Rpb24gbG9hZEFkYXB0ZXI8VD4oYWRhcHRlciwgZGVmYXVsdEFkYXB0ZXIsIG9wdGlvbnMpOiBUIHtcbiAgaWYgKCFhZGFwdGVyKSB7XG4gICAgaWYgKCFkZWZhdWx0QWRhcHRlcikge1xuICAgICAgcmV0dXJuIG9wdGlvbnM7XG4gICAgfVxuICAgIC8vIExvYWQgZnJvbSB0aGUgZGVmYXVsdCBhZGFwdGVyIHdoZW4gbm8gYWRhcHRlciBpcyBzZXRcbiAgICByZXR1cm4gbG9hZEFkYXB0ZXIoZGVmYXVsdEFkYXB0ZXIsIHVuZGVmaW5lZCwgb3B0aW9ucyk7XG4gIH0gZWxzZSBpZiAodHlwZW9mIGFkYXB0ZXIgPT09ICdmdW5jdGlvbicpIHtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIGFkYXB0ZXIob3B0aW9ucyk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKGUubmFtZSA9PT0gJ1R5cGVFcnJvcicpIHtcbiAgICAgICAgdmFyIEFkYXB0ZXIgPSBhZGFwdGVyO1xuICAgICAgICByZXR1cm4gbmV3IEFkYXB0ZXIob3B0aW9ucyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlO1xuICAgICAgfVxuICAgIH1cbiAgfSBlbHNlIGlmICh0eXBlb2YgYWRhcHRlciA9PT0gJ3N0cmluZycpIHtcbiAgICAvKiBlc2xpbnQtZGlzYWJsZSAqL1xuICAgIGFkYXB0ZXIgPSByZXF1aXJlKGFkYXB0ZXIpO1xuICAgIC8vIElmIGl0J3MgZGVmaW5lIGFzIGEgbW9kdWxlLCBnZXQgdGhlIGRlZmF1bHRcbiAgICBpZiAoYWRhcHRlci5kZWZhdWx0KSB7XG4gICAgICBhZGFwdGVyID0gYWRhcHRlci5kZWZhdWx0O1xuICAgIH1cbiAgICByZXR1cm4gbG9hZEFkYXB0ZXIoYWRhcHRlciwgdW5kZWZpbmVkLCBvcHRpb25zKTtcbiAgfSBlbHNlIGlmIChhZGFwdGVyLm1vZHVsZSkge1xuICAgIHJldHVybiBsb2FkQWRhcHRlcihhZGFwdGVyLm1vZHVsZSwgdW5kZWZpbmVkLCBhZGFwdGVyLm9wdGlvbnMpO1xuICB9IGVsc2UgaWYgKGFkYXB0ZXIuY2xhc3MpIHtcbiAgICByZXR1cm4gbG9hZEFkYXB0ZXIoYWRhcHRlci5jbGFzcywgdW5kZWZpbmVkLCBhZGFwdGVyLm9wdGlvbnMpO1xuICB9IGVsc2UgaWYgKGFkYXB0ZXIuYWRhcHRlcikge1xuICAgIHJldHVybiBsb2FkQWRhcHRlcihhZGFwdGVyLmFkYXB0ZXIsIHVuZGVmaW5lZCwgYWRhcHRlci5vcHRpb25zKTtcbiAgfVxuICAvLyByZXR1cm4gdGhlIGFkYXB0ZXIgYXMgcHJvdmlkZWRcbiAgcmV0dXJuIGFkYXB0ZXI7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGxvYWRBZGFwdGVyO1xuIl19