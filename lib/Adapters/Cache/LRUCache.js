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
      ttl
    });
  }

  get(key) {
    return this.cache.get(key) || null;
  }

  put(key, value, ttl = this.ttl) {
    this.cache.set(key, value, ttl);
  }

  del(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

}

exports.LRUCache = LRUCache;
var _default = LRUCache;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9DYWNoZS9MUlVDYWNoZS5qcyJdLCJuYW1lcyI6WyJMUlVDYWNoZSIsImNvbnN0cnVjdG9yIiwidHRsIiwiZGVmYXVsdHMiLCJjYWNoZVRUTCIsIm1heFNpemUiLCJjYWNoZU1heFNpemUiLCJjYWNoZSIsIkxSVSIsIm1heCIsImdldCIsImtleSIsInB1dCIsInZhbHVlIiwic2V0IiwiZGVsIiwiZGVsZXRlIiwiY2xlYXIiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7OztBQUVPLE1BQU1BLFFBQU4sQ0FBZTtBQUNwQkMsRUFBQUEsV0FBVyxDQUFDO0FBQUVDLElBQUFBLEdBQUcsR0FBR0Msa0JBQVNDLFFBQWpCO0FBQTJCQyxJQUFBQSxPQUFPLEdBQUdGLGtCQUFTRztBQUE5QyxHQUFELEVBQStEO0FBQ3hFLFNBQUtDLEtBQUwsR0FBYSxJQUFJQyxpQkFBSixDQUFRO0FBQ25CQyxNQUFBQSxHQUFHLEVBQUVKLE9BRGM7QUFFbkJILE1BQUFBO0FBRm1CLEtBQVIsQ0FBYjtBQUlEOztBQUVEUSxFQUFBQSxHQUFHLENBQUNDLEdBQUQsRUFBTTtBQUNQLFdBQU8sS0FBS0osS0FBTCxDQUFXRyxHQUFYLENBQWVDLEdBQWYsS0FBdUIsSUFBOUI7QUFDRDs7QUFFREMsRUFBQUEsR0FBRyxDQUFDRCxHQUFELEVBQU1FLEtBQU4sRUFBYVgsR0FBRyxHQUFHLEtBQUtBLEdBQXhCLEVBQTZCO0FBQzlCLFNBQUtLLEtBQUwsQ0FBV08sR0FBWCxDQUFlSCxHQUFmLEVBQW9CRSxLQUFwQixFQUEyQlgsR0FBM0I7QUFDRDs7QUFFRGEsRUFBQUEsR0FBRyxDQUFDSixHQUFELEVBQU07QUFDUCxTQUFLSixLQUFMLENBQVdTLE1BQVgsQ0FBa0JMLEdBQWxCO0FBQ0Q7O0FBRURNLEVBQUFBLEtBQUssR0FBRztBQUNOLFNBQUtWLEtBQUwsQ0FBV1UsS0FBWDtBQUNEOztBQXRCbUI7OztlQXlCUGpCLFEiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgTFJVIGZyb20gJ2xydS1jYWNoZSc7XG5pbXBvcnQgZGVmYXVsdHMgZnJvbSAnLi4vLi4vZGVmYXVsdHMnO1xuXG5leHBvcnQgY2xhc3MgTFJVQ2FjaGUge1xuICBjb25zdHJ1Y3Rvcih7IHR0bCA9IGRlZmF1bHRzLmNhY2hlVFRMLCBtYXhTaXplID0gZGVmYXVsdHMuY2FjaGVNYXhTaXplIH0pIHtcbiAgICB0aGlzLmNhY2hlID0gbmV3IExSVSh7XG4gICAgICBtYXg6IG1heFNpemUsXG4gICAgICB0dGwsXG4gICAgfSk7XG4gIH1cblxuICBnZXQoa2V5KSB7XG4gICAgcmV0dXJuIHRoaXMuY2FjaGUuZ2V0KGtleSkgfHwgbnVsbDtcbiAgfVxuXG4gIHB1dChrZXksIHZhbHVlLCB0dGwgPSB0aGlzLnR0bCkge1xuICAgIHRoaXMuY2FjaGUuc2V0KGtleSwgdmFsdWUsIHR0bCk7XG4gIH1cblxuICBkZWwoa2V5KSB7XG4gICAgdGhpcy5jYWNoZS5kZWxldGUoa2V5KTtcbiAgfVxuXG4gIGNsZWFyKCkge1xuICAgIHRoaXMuY2FjaGUuY2xlYXIoKTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBMUlVDYWNoZTtcbiJdfQ==