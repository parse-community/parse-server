"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.LRUCache = void 0;

var _lruCache = _interopRequireDefault(require("lru-cache"));

var _defaults = _interopRequireDefault(require("../../defaults"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class LRUCache {
  constructor({
    ttl = _defaults.default.cacheTTL,
    maxSize = _defaults.default.cacheMaxSize
  }) {
    this.cache = new _lruCache.default({
      max: maxSize,
      maxAge: ttl
    });
  }

  get(key) {
    return this.cache.get(key) || null;
  }

  put(key, value, ttl = this.ttl) {
    this.cache.set(key, value, ttl);
  }

  del(key) {
    this.cache.del(key);
  }

  clear() {
    this.cache.reset();
  }

}

exports.LRUCache = LRUCache;
var _default = LRUCache;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9DYWNoZS9MUlVDYWNoZS5qcyJdLCJuYW1lcyI6WyJMUlVDYWNoZSIsImNvbnN0cnVjdG9yIiwidHRsIiwiZGVmYXVsdHMiLCJjYWNoZVRUTCIsIm1heFNpemUiLCJjYWNoZU1heFNpemUiLCJjYWNoZSIsIkxSVSIsIm1heCIsIm1heEFnZSIsImdldCIsImtleSIsInB1dCIsInZhbHVlIiwic2V0IiwiZGVsIiwiY2xlYXIiLCJyZXNldCJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOzs7O0FBRU8sTUFBTUEsUUFBTixDQUFlO0FBQ3BCQyxFQUFBQSxXQUFXLENBQUM7QUFBRUMsSUFBQUEsR0FBRyxHQUFHQyxrQkFBU0MsUUFBakI7QUFBMkJDLElBQUFBLE9BQU8sR0FBR0Ysa0JBQVNHO0FBQTlDLEdBQUQsRUFBK0Q7QUFDeEUsU0FBS0MsS0FBTCxHQUFhLElBQUlDLGlCQUFKLENBQVE7QUFDbkJDLE1BQUFBLEdBQUcsRUFBRUosT0FEYztBQUVuQkssTUFBQUEsTUFBTSxFQUFFUjtBQUZXLEtBQVIsQ0FBYjtBQUlEOztBQUVEUyxFQUFBQSxHQUFHLENBQUNDLEdBQUQsRUFBTTtBQUNQLFdBQU8sS0FBS0wsS0FBTCxDQUFXSSxHQUFYLENBQWVDLEdBQWYsS0FBdUIsSUFBOUI7QUFDRDs7QUFFREMsRUFBQUEsR0FBRyxDQUFDRCxHQUFELEVBQU1FLEtBQU4sRUFBYVosR0FBRyxHQUFHLEtBQUtBLEdBQXhCLEVBQTZCO0FBQzlCLFNBQUtLLEtBQUwsQ0FBV1EsR0FBWCxDQUFlSCxHQUFmLEVBQW9CRSxLQUFwQixFQUEyQlosR0FBM0I7QUFDRDs7QUFFRGMsRUFBQUEsR0FBRyxDQUFDSixHQUFELEVBQU07QUFDUCxTQUFLTCxLQUFMLENBQVdTLEdBQVgsQ0FBZUosR0FBZjtBQUNEOztBQUVESyxFQUFBQSxLQUFLLEdBQUc7QUFDTixTQUFLVixLQUFMLENBQVdXLEtBQVg7QUFDRDs7QUF0Qm1COzs7ZUF5QlBsQixRIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IExSVSBmcm9tICdscnUtY2FjaGUnO1xuaW1wb3J0IGRlZmF1bHRzIGZyb20gJy4uLy4uL2RlZmF1bHRzJztcblxuZXhwb3J0IGNsYXNzIExSVUNhY2hlIHtcbiAgY29uc3RydWN0b3IoeyB0dGwgPSBkZWZhdWx0cy5jYWNoZVRUTCwgbWF4U2l6ZSA9IGRlZmF1bHRzLmNhY2hlTWF4U2l6ZSB9KSB7XG4gICAgdGhpcy5jYWNoZSA9IG5ldyBMUlUoe1xuICAgICAgbWF4OiBtYXhTaXplLFxuICAgICAgbWF4QWdlOiB0dGwsXG4gICAgfSk7XG4gIH1cblxuICBnZXQoa2V5KSB7XG4gICAgcmV0dXJuIHRoaXMuY2FjaGUuZ2V0KGtleSkgfHwgbnVsbDtcbiAgfVxuXG4gIHB1dChrZXksIHZhbHVlLCB0dGwgPSB0aGlzLnR0bCkge1xuICAgIHRoaXMuY2FjaGUuc2V0KGtleSwgdmFsdWUsIHR0bCk7XG4gIH1cblxuICBkZWwoa2V5KSB7XG4gICAgdGhpcy5jYWNoZS5kZWwoa2V5KTtcbiAgfVxuXG4gIGNsZWFyKCkge1xuICAgIHRoaXMuY2FjaGUucmVzZXQoKTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBMUlVDYWNoZTtcbiJdfQ==