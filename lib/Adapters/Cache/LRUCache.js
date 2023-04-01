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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJMUlVDYWNoZSIsImNvbnN0cnVjdG9yIiwidHRsIiwiZGVmYXVsdHMiLCJjYWNoZVRUTCIsIm1heFNpemUiLCJjYWNoZU1heFNpemUiLCJjYWNoZSIsIkxSVSIsIm1heCIsImdldCIsImtleSIsInB1dCIsInZhbHVlIiwic2V0IiwiZGVsIiwiZGVsZXRlIiwiY2xlYXIiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvQWRhcHRlcnMvQ2FjaGUvTFJVQ2FjaGUuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IExSVSBmcm9tICdscnUtY2FjaGUnO1xuaW1wb3J0IGRlZmF1bHRzIGZyb20gJy4uLy4uL2RlZmF1bHRzJztcblxuZXhwb3J0IGNsYXNzIExSVUNhY2hlIHtcbiAgY29uc3RydWN0b3IoeyB0dGwgPSBkZWZhdWx0cy5jYWNoZVRUTCwgbWF4U2l6ZSA9IGRlZmF1bHRzLmNhY2hlTWF4U2l6ZSB9KSB7XG4gICAgdGhpcy5jYWNoZSA9IG5ldyBMUlUoe1xuICAgICAgbWF4OiBtYXhTaXplLFxuICAgICAgdHRsLFxuICAgIH0pO1xuICB9XG5cbiAgZ2V0KGtleSkge1xuICAgIHJldHVybiB0aGlzLmNhY2hlLmdldChrZXkpIHx8IG51bGw7XG4gIH1cblxuICBwdXQoa2V5LCB2YWx1ZSwgdHRsID0gdGhpcy50dGwpIHtcbiAgICB0aGlzLmNhY2hlLnNldChrZXksIHZhbHVlLCB0dGwpO1xuICB9XG5cbiAgZGVsKGtleSkge1xuICAgIHRoaXMuY2FjaGUuZGVsZXRlKGtleSk7XG4gIH1cblxuICBjbGVhcigpIHtcbiAgICB0aGlzLmNhY2hlLmNsZWFyKCk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgTFJVQ2FjaGU7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBO0FBQ0E7QUFBc0M7QUFFL0IsTUFBTUEsUUFBUSxDQUFDO0VBQ3BCQyxXQUFXLENBQUM7SUFBRUMsR0FBRyxHQUFHQyxpQkFBUSxDQUFDQyxRQUFRO0lBQUVDLE9BQU8sR0FBR0YsaUJBQVEsQ0FBQ0c7RUFBYSxDQUFDLEVBQUU7SUFDeEUsSUFBSSxDQUFDQyxLQUFLLEdBQUcsSUFBSUMsaUJBQUcsQ0FBQztNQUNuQkMsR0FBRyxFQUFFSixPQUFPO01BQ1pIO0lBQ0YsQ0FBQyxDQUFDO0VBQ0o7RUFFQVEsR0FBRyxDQUFDQyxHQUFHLEVBQUU7SUFDUCxPQUFPLElBQUksQ0FBQ0osS0FBSyxDQUFDRyxHQUFHLENBQUNDLEdBQUcsQ0FBQyxJQUFJLElBQUk7RUFDcEM7RUFFQUMsR0FBRyxDQUFDRCxHQUFHLEVBQUVFLEtBQUssRUFBRVgsR0FBRyxHQUFHLElBQUksQ0FBQ0EsR0FBRyxFQUFFO0lBQzlCLElBQUksQ0FBQ0ssS0FBSyxDQUFDTyxHQUFHLENBQUNILEdBQUcsRUFBRUUsS0FBSyxFQUFFWCxHQUFHLENBQUM7RUFDakM7RUFFQWEsR0FBRyxDQUFDSixHQUFHLEVBQUU7SUFDUCxJQUFJLENBQUNKLEtBQUssQ0FBQ1MsTUFBTSxDQUFDTCxHQUFHLENBQUM7RUFDeEI7RUFFQU0sS0FBSyxHQUFHO0lBQ04sSUFBSSxDQUFDVixLQUFLLENBQUNVLEtBQUssRUFBRTtFQUNwQjtBQUNGO0FBQUM7QUFBQSxlQUVjakIsUUFBUTtBQUFBIn0=