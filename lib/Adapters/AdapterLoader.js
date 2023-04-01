"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
exports.loadAdapter = loadAdapter;
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
    }
    // Load from the default adapter when no adapter is set
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
    adapter = require(adapter);
    // If it's define as a module, get the default
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
  }
  // return the adapter as provided
  return adapter;
}
var _default = loadAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJsb2FkQWRhcHRlciIsImFkYXB0ZXIiLCJkZWZhdWx0QWRhcHRlciIsIm9wdGlvbnMiLCJ1bmRlZmluZWQiLCJlIiwibmFtZSIsIkFkYXB0ZXIiLCJyZXF1aXJlIiwiZGVmYXVsdCIsIm1vZHVsZSIsImNsYXNzIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0FkYXB0ZXJzL0FkYXB0ZXJMb2FkZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbW9kdWxlIEFkYXB0ZXJMb2FkZXJcbiAqL1xuLyoqXG4gKiBAc3RhdGljXG4gKiBBdHRlbXB0IHRvIGxvYWQgYW4gYWRhcHRlciBvciBmYWxsYmFjayB0byB0aGUgZGVmYXVsdC5cbiAqIEBwYXJhbSB7QWRhcHRlcn0gYWRhcHRlciBhbiBhZGFwdGVyXG4gKiBAcGFyYW0ge0FkYXB0ZXJ9IGRlZmF1bHRBZGFwdGVyIHRoZSBkZWZhdWx0IGFkYXB0ZXIgdG8gbG9hZFxuICogQHBhcmFtIHthbnl9IG9wdGlvbnMgb3B0aW9ucyB0byBwYXNzIHRvIHRoZSBjb250c3RydWN0b3JcbiAqIEByZXR1cm5zIHtPYmplY3R9IHRoZSBsb2FkZWQgYWRhcHRlclxuICovXG5leHBvcnQgZnVuY3Rpb24gbG9hZEFkYXB0ZXI8VD4oYWRhcHRlciwgZGVmYXVsdEFkYXB0ZXIsIG9wdGlvbnMpOiBUIHtcbiAgaWYgKCFhZGFwdGVyKSB7XG4gICAgaWYgKCFkZWZhdWx0QWRhcHRlcikge1xuICAgICAgcmV0dXJuIG9wdGlvbnM7XG4gICAgfVxuICAgIC8vIExvYWQgZnJvbSB0aGUgZGVmYXVsdCBhZGFwdGVyIHdoZW4gbm8gYWRhcHRlciBpcyBzZXRcbiAgICByZXR1cm4gbG9hZEFkYXB0ZXIoZGVmYXVsdEFkYXB0ZXIsIHVuZGVmaW5lZCwgb3B0aW9ucyk7XG4gIH0gZWxzZSBpZiAodHlwZW9mIGFkYXB0ZXIgPT09ICdmdW5jdGlvbicpIHtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIGFkYXB0ZXIob3B0aW9ucyk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKGUubmFtZSA9PT0gJ1R5cGVFcnJvcicpIHtcbiAgICAgICAgdmFyIEFkYXB0ZXIgPSBhZGFwdGVyO1xuICAgICAgICByZXR1cm4gbmV3IEFkYXB0ZXIob3B0aW9ucyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlO1xuICAgICAgfVxuICAgIH1cbiAgfSBlbHNlIGlmICh0eXBlb2YgYWRhcHRlciA9PT0gJ3N0cmluZycpIHtcbiAgICAvKiBlc2xpbnQtZGlzYWJsZSAqL1xuICAgIGFkYXB0ZXIgPSByZXF1aXJlKGFkYXB0ZXIpO1xuICAgIC8vIElmIGl0J3MgZGVmaW5lIGFzIGEgbW9kdWxlLCBnZXQgdGhlIGRlZmF1bHRcbiAgICBpZiAoYWRhcHRlci5kZWZhdWx0KSB7XG4gICAgICBhZGFwdGVyID0gYWRhcHRlci5kZWZhdWx0O1xuICAgIH1cbiAgICByZXR1cm4gbG9hZEFkYXB0ZXIoYWRhcHRlciwgdW5kZWZpbmVkLCBvcHRpb25zKTtcbiAgfSBlbHNlIGlmIChhZGFwdGVyLm1vZHVsZSkge1xuICAgIHJldHVybiBsb2FkQWRhcHRlcihhZGFwdGVyLm1vZHVsZSwgdW5kZWZpbmVkLCBhZGFwdGVyLm9wdGlvbnMpO1xuICB9IGVsc2UgaWYgKGFkYXB0ZXIuY2xhc3MpIHtcbiAgICByZXR1cm4gbG9hZEFkYXB0ZXIoYWRhcHRlci5jbGFzcywgdW5kZWZpbmVkLCBhZGFwdGVyLm9wdGlvbnMpO1xuICB9IGVsc2UgaWYgKGFkYXB0ZXIuYWRhcHRlcikge1xuICAgIHJldHVybiBsb2FkQWRhcHRlcihhZGFwdGVyLmFkYXB0ZXIsIHVuZGVmaW5lZCwgYWRhcHRlci5vcHRpb25zKTtcbiAgfVxuICAvLyByZXR1cm4gdGhlIGFkYXB0ZXIgYXMgcHJvdmlkZWRcbiAgcmV0dXJuIGFkYXB0ZXI7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGxvYWRBZGFwdGVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNPLFNBQVNBLFdBQVcsQ0FBSUMsT0FBTyxFQUFFQyxjQUFjLEVBQUVDLE9BQU8sRUFBSztFQUNsRSxJQUFJLENBQUNGLE9BQU8sRUFBRTtJQUNaLElBQUksQ0FBQ0MsY0FBYyxFQUFFO01BQ25CLE9BQU9DLE9BQU87SUFDaEI7SUFDQTtJQUNBLE9BQU9ILFdBQVcsQ0FBQ0UsY0FBYyxFQUFFRSxTQUFTLEVBQUVELE9BQU8sQ0FBQztFQUN4RCxDQUFDLE1BQU0sSUFBSSxPQUFPRixPQUFPLEtBQUssVUFBVSxFQUFFO0lBQ3hDLElBQUk7TUFDRixPQUFPQSxPQUFPLENBQUNFLE9BQU8sQ0FBQztJQUN6QixDQUFDLENBQUMsT0FBT0UsQ0FBQyxFQUFFO01BQ1YsSUFBSUEsQ0FBQyxDQUFDQyxJQUFJLEtBQUssV0FBVyxFQUFFO1FBQzFCLElBQUlDLE9BQU8sR0FBR04sT0FBTztRQUNyQixPQUFPLElBQUlNLE9BQU8sQ0FBQ0osT0FBTyxDQUFDO01BQzdCLENBQUMsTUFBTTtRQUNMLE1BQU1FLENBQUM7TUFDVDtJQUNGO0VBQ0YsQ0FBQyxNQUFNLElBQUksT0FBT0osT0FBTyxLQUFLLFFBQVEsRUFBRTtJQUN0QztJQUNBQSxPQUFPLEdBQUdPLE9BQU8sQ0FBQ1AsT0FBTyxDQUFDO0lBQzFCO0lBQ0EsSUFBSUEsT0FBTyxDQUFDUSxPQUFPLEVBQUU7TUFDbkJSLE9BQU8sR0FBR0EsT0FBTyxDQUFDUSxPQUFPO0lBQzNCO0lBQ0EsT0FBT1QsV0FBVyxDQUFDQyxPQUFPLEVBQUVHLFNBQVMsRUFBRUQsT0FBTyxDQUFDO0VBQ2pELENBQUMsTUFBTSxJQUFJRixPQUFPLENBQUNTLE1BQU0sRUFBRTtJQUN6QixPQUFPVixXQUFXLENBQUNDLE9BQU8sQ0FBQ1MsTUFBTSxFQUFFTixTQUFTLEVBQUVILE9BQU8sQ0FBQ0UsT0FBTyxDQUFDO0VBQ2hFLENBQUMsTUFBTSxJQUFJRixPQUFPLENBQUNVLEtBQUssRUFBRTtJQUN4QixPQUFPWCxXQUFXLENBQUNDLE9BQU8sQ0FBQ1UsS0FBSyxFQUFFUCxTQUFTLEVBQUVILE9BQU8sQ0FBQ0UsT0FBTyxDQUFDO0VBQy9ELENBQUMsTUFBTSxJQUFJRixPQUFPLENBQUNBLE9BQU8sRUFBRTtJQUMxQixPQUFPRCxXQUFXLENBQUNDLE9BQU8sQ0FBQ0EsT0FBTyxFQUFFRyxTQUFTLEVBQUVILE9BQU8sQ0FBQ0UsT0FBTyxDQUFDO0VBQ2pFO0VBQ0E7RUFDQSxPQUFPRixPQUFPO0FBQ2hCO0FBQUMsZUFFY0QsV0FBVztBQUFBIn0=