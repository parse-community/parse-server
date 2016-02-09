/* global describe, it, before, beforeEach, afterEach */
'use strict';

var cache = new (require('../../src/classes/MemoryCache'));
var _ = require('lodash');

describe('MemoryCache', function() {
    beforeEach(function() {
        jasmine.clock().install();
        jasmine.clock().mockDate();
        jasmine.addMatchers({
            toDeepEqual: function(util, customEqualityTesters) {
                return {
                    compare: function(actual, expected) {
                        var result = {};
                        result.pass = _.isEqual(actual, expected);
                        return result;
                    }
                }
            }
        });

        cache.clear();
    });

    afterEach(function() {
        jasmine.clock().uninstall();
    });

    describe('put()', function() {
        beforeEach(function() {
          cache.setDebug(false);
        });

        it('should allow adding a new item to the cache', function() {
          expect(function() {
            cache.put('key', 'value');
          }).not.toThrow();
        });

        it('should allow adding a new item to the cache with a timeout', function() {
          expect(function() {
            cache.put('key', 'value', 100);
          }).not.toThrow();
        });

        it('should allow adding a new item to the cache with a timeout callback', function() {
          expect(function() {
            cache.put('key', 'value', 100, function() {});
          }).not.toThrow();
        });

        it('should throw an error given a non-numeric timeout', function() {
          expect(function() {
            cache.put('key', 'value', 'foo');
          }).toThrow();
        });

        it('should throw an error given a timeout of NaN', function() {
          expect(function() {
            cache.put('key', 'value', NaN);
          }).toThrow();
        });

        it('should throw an error given a timeout of 0', function() {
          expect(function() {
            cache.put('key', 'value', 0);
          }).toThrow();
        });

        it('should throw an error given a negative timeout', function() {
          expect(function() {
            cache.put('key', 'value', -100);
          }).toThrow();
        });

        it('should throw an error given a non-function timeout callback', function() {
          expect(function() {
            cache.put('key', 'value', 100, 'foo');
          }).toThrow();
        });

        it('should cause the timeout callback to fire once the cache item expires', function() {
          var callback = jasmine.createSpy('callback');
          cache.put('key', 'value', 1000, callback);
          jasmine.clock().tick(999);
          expect(callback).not.toHaveBeenCalled();
          jasmine.clock().tick(1);
          expect(callback).toHaveBeenCalledWith('key');
        });

        it('should override the timeout callback on a new put() with a different timeout callback', function() {
          var spy1 = jasmine.createSpy();
          var spy2 = jasmine.createSpy();
          cache.put('key', 'value', 1000, spy1);
          jasmine.clock().tick(999);
          cache.put('key', 'value', 1000, spy2)
          jasmine.clock().tick(1001);
          expect(spy1).not.toHaveBeenCalled();
          expect(spy2).toHaveBeenCalledWith('key');
        });

        it('should cancel the timeout callback on a new put() without a timeout callback', function() {
          var spy = jasmine.createSpy();
          cache.put('key', 'value', 1000, spy);
          jasmine.clock().tick(999);
          cache.put('key', 'value')
          jasmine.clock().tick(1);
          expect(spy).not.toHaveBeenCalled();
        });

        it('should return the cached value', function() {
          expect(cache.put('key', 'value')).toEqual('value');
        });
    });

    describe('del()', function() {
        beforeEach(function() {
          cache.setDebug(false);
        });

        it('should return false given a key for an empty cache', function() {
          expect(cache.del('miss')).toBe(false);
        });

        it('should return false given a key not in a non-empty cache', function() {
          cache.put('key', 'value');
          expect(cache.del('miss')).toBe(false);
        });

        it('should return true given a key in the cache', function() {
          cache.put('key', 'value');
          expect(cache.del('key')).toBe(true);
        });

        it('should remove the provided key from the cache', function() {
          cache.put('key', 'value');
          expect(cache.get('key')).toEqual('value');
          expect(cache.del('key')).toBe(true);
          expect(cache.get('key')).toBe(undefined);
        });

        it('should decrement the cache size by 1', function() {
          cache.put('key', 'value');
          expect(cache.size()).toEqual(1);
          expect(cache.del('key')).toBe(true);
          expect(cache.size()).toEqual(0);
        });

        it('should not remove other keys in the cache', function() {
          cache.put('key1', 'value1');
          cache.put('key2', 'value2');
          cache.put('key3', 'value3');
          expect(cache.get('key1')).toEqual('value1');
          expect(cache.get('key2')).toEqual('value2');
          expect(cache.get('key3')).toEqual('value3');
          cache.del('key1');
          expect(cache.get('key1')).toBe(undefined);
          expect(cache.get('key2')).toEqual('value2');
          expect(cache.get('key3')).toEqual('value3');
        });

        it('should only delete a key from the cache once even if called multiple times in a row', function() {
          cache.put('key1', 'value1');
          cache.put('key2', 'value2');
          cache.put('key3', 'value3');
          expect(cache.size()).toEqual(3);
          cache.del('key1');
          cache.del('key1');
          cache.del('key1');
          expect(cache.size()).toEqual(2);
        });

        it('should handle deleting keys which were previously deleted and then re-added to the cache', function() {
          cache.put('key', 'value');
          expect(cache.get('key')).toEqual('value');
          cache.del('key');
          expect(cache.get('key')).toBe(undefined);
          cache.put('key', 'value');
          expect(cache.get('key')).toEqual('value');
          cache.del('key');
          expect(cache.get('key')).toBe(undefined);
        });

        it('should cancel the timeout callback for the deleted key', function() {
          var spy = jasmine.createSpy();
          cache.put('key', 'value', 1000, spy);
          cache.del('key');
          jasmine.clock().tick(1000);
          expect(spy).not.toHaveBeenCalled();
        });
    });

    describe('clear()', function() {
        beforeEach(function() {
          cache.setDebug(false);
        });

        it('should have no effect given an empty cache', function() {
          expect(cache.size()).toEqual(0);
          cache.clear();
          expect(cache.size()).toEqual(0);
        });

        it('should remove all existing keys in the cache', function() {
          cache.put('key1', 'value1');
          cache.put('key2', 'value2');
          cache.put('key3', 'value3');
          expect(cache.size()).toEqual(3);
          cache.clear();
          expect(cache.size()).toEqual(0);
        });

        it('should remove the keys in the cache', function() {
          cache.put('key1', 'value1');
          cache.put('key2', 'value2');
          cache.put('key3', 'value3');
          expect(cache.get('key1')).toEqual('value1');
          expect(cache.get('key2')).toEqual('value2');
          expect(cache.get('key3')).toEqual('value3');
          cache.clear();
          expect(cache.get('key1')).toBe(undefined);
          expect(cache.get('key2')).toBe(undefined);
          expect(cache.get('key3')).toBe(undefined);
        });

        it('should reset the cache size to 0', function() {
          cache.put('key1', 'value1');
          cache.put('key2', 'value2');
          cache.put('key3', 'value3');
          expect(cache.size()).toEqual(3);
          cache.clear();
          expect(cache.size()).toEqual(0);
        });

        it('should reset the debug cache hits', function() {
          cache.setDebug(false);
          cache.put('key', 'value');
          cache.get('key');
          expect(cache.hits()).toEqual(1);
          cache.clear();
          expect(cache.hits()).toEqual(0);
        });

        it('should reset the debug cache misses', function() {
          cache.setDebug(false);
          cache.put('key', 'value');
          cache.get('miss1');
          expect(cache.misses()).toEqual(1);
          cache.clear();
          expect(cache.misses()).toEqual(0);
        });

        it('should cancel the timeout callbacks for all existing keys', function() {
          var spy1 = jasmine.createSpy();
          var spy2 = jasmine.createSpy();
          var spy3 = jasmine.createSpy();
          cache.put('key1', 'value1', 1000, spy1);
          cache.put('key2', 'value2', 1000, spy2);
          cache.put('key3', 'value3', 1000, spy3);
          cache.clear();
          jasmine.clock().tick(1000);
          expect(spy1).not.toHaveBeenCalled();
          expect(spy2).not.toHaveBeenCalled();
          expect(spy3).not.toHaveBeenCalled();
        });
    });

    describe('get()', function() {
        beforeEach(function() {
            cache.setDebug(false);
        });

        it('should return null given a key for an empty cache', function() {
          expect(cache.get('miss')).toBe(undefined);
        });

        it('should return null given a key not in a non-empty cache', function() {
          cache.put('key', 'value');
          expect(cache.get('miss')).toBe(undefined);
        });

        it('should return the corresponding value of a key in the cache', function() {
          cache.put('key', 'value');
          expect(cache.get('key')).toEqual('value');
        });

        it('should return the latest corresponding value of a key in the cache', function() {
          cache.put('key', 'value1');
          cache.put('key', 'value2');
          cache.put('key', 'value3');
          expect(cache.get('key')).toEqual('value3');
        });

        it('should handle various types of cache keys', function() {
          var keys = [null, undefined, NaN, true, false, 0, 1, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '', 'a', [], {}, [1, 'a', false], {a:1,b:'a',c:false}, function() {}];
          keys.forEach(function(key, index) {
            var value = 'value' + index;
            cache.put(key, value);
            expect(cache.get(key)).toDeepEqual(value);
          });
        });

        it('should handle various types of cache values', function() {
          var values = [null, undefined, NaN, true, false, 0, 1, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '', 'a', [], {}, [1, 'a', false], {a:1,b:'a',c:false}, function() {}];
          values.forEach(function(value, index) {
            var key = 'key' + index;
            cache.put(key, value);
            expect(cache.get(key)).toDeepEqual(value);
          });
        });

        it('should set a default timeout given no expiration time', function() {
          cache.put('key', 'value');
          jasmine.clock().tick(cache.defaultTtl + 1);
          expect(cache.get('key')).toEqual(undefined);
        });

        it('should not timeout if the expiration is set to infinity', function() {
          cache.put('key', 'value', Infinity);
          jasmine.clock().tick(100000);
          expect(cache.get('key')).toEqual('value');
        });

        it('should return the corresponding value of a non-expired key in the cache', function() {
          cache.put('key', 'value', 1000);
          jasmine.clock().tick(999);
          expect(cache.get('key')).toEqual('value');
        });

        it('should return null given an expired key', function() {
          cache.put('key', 'value', 1000);
          jasmine.clock().tick(1000);
          expect(cache.get('key')).toBe(undefined);
        });

        it('should delete an object which has expired and is still in the cache', function() {
            cache.setDebug(false);
          cache.put('key', 'value', 10000);
          cache.killTimer('key');
          jasmine.clock().tick(10001);
          expect(cache.keys()).toDeepEqual(['key']);
          cache.get('key');
          expect(cache.keys()).toDeepEqual([]);
        });

        it('should return null given a key which is a property on the Object prototype', function() {
          expect(cache.get('toString')).toBe(undefined);
        });

        it('should allow reading the value for a key which is a property on the Object prototype', function() {
          cache.put('toString', 'value');
          expect(cache.get('toString')).toEqual('value');
        });
    });

    describe("killTimer()", function() {
        it("should prevent a timer from being executed", function() {
            // Sanity check
            cache.put('key', 'value', 10000);
            expect(cache.get('key')).toEqual('value');
            jasmine.clock().tick(10000);
            expect(cache.get('key')).not.toEqual('value');

            cache.put('key', 'value', 10000);
            cache.killTimer('key');
            expect(cache.get('key')).toEqual('value');
            jasmine.clock().tick(10000);
            expect(cache.get('key')).toEqual('value');
        });
    });

    describe('size()', function() {
        beforeEach(function() {
          cache.setDebug(false);
        });

        it('should return 0 given a fresh cache', function() {
          expect(cache.size()).toEqual(0);
        });

        it('should return 1 after adding a single item to the cache', function() {
          cache.put('key', 'value');
          expect(cache.size()).toEqual(1);
        });

        it('should return 3 after adding three items to the cache', function() {
          cache.put('key1', 'value1');
          cache.put('key2', 'value2');
          cache.put('key3', 'value3');
          expect(cache.size()).toEqual(3);
        });

        it('should not multi-count duplicate items added to the cache', function() {
          cache.put('key', 'value1');
          expect(cache.size()).toEqual(1);
          cache.put('key', 'value2');
          expect(cache.size()).toEqual(1);
        });

        it('should update when a key in the cache expires', function() {
          cache.put('key', 'value', 1000);
          expect(cache.size()).toEqual(1);
          jasmine.clock().tick(999);
          expect(cache.size()).toEqual(1);
          jasmine.clock().tick(1);
          expect(cache.size()).toEqual(0);
        });
    });

    describe('debug()', function() {
        it('should change the value of the debug property', function() {
          expect(cache.debug).toEqual(false);
          cache.setDebug(true);
          expect(cache.debug).toEqual(true);
        });
    });

    describe('hits()', function() {
        beforeEach(function() {
          cache.setDebug(false);
        });

        it('should return 0 given an empty cache', function() {
          expect(cache.hits()).toEqual(0);
        });

        it('should return 0 given a non-empty cache which has not been accessed', function() {
          cache.put('key', 'value');
          expect(cache.hits()).toEqual(0);
        });

        it('should return 0 given a non-empty cache which has had only misses', function() {
          cache.put('key', 'value');
          cache.get('miss1');
          cache.get('miss2');
          cache.get('miss3');
          expect(cache.hits()).toEqual(0);
        });

        it('should return 1 given a non-empty cache which has had a single hit', function() {
          cache.put('key', 'value');
          cache.get('key');
          expect(cache.hits()).toEqual(1);
        });

        it('should return 3 given a non-empty cache which has had three hits on the same key', function() {
          cache.put('key', 'value');
          cache.get('key');
          cache.get('key');
          cache.get('key');
          expect(cache.hits()).toEqual(3);
        });

        it('should return 3 given a non-empty cache which has had three hits across many keys', function() {
          cache.put('key1', 'value1');
          cache.put('key2', 'value2');
          cache.put('key3', 'value3');
          cache.get('key1');
          cache.get('key2');
          cache.get('key3');
          expect(cache.hits()).toEqual(3);
        });

        it('should return the correct value after a sequence of hits and misses', function() {
          cache.put('key1', 'value1');
          cache.put('key2', 'value2');
          cache.put('key3', 'value3');
          cache.get('key1');
          cache.get('miss');
          cache.get('key3');
          expect(cache.hits()).toEqual(2);
        });

        it('should not count hits for expired keys', function() {
          cache.put('key', 'value', 1000);
          cache.get('key');
          expect(cache.hits()).toEqual(1);
          jasmine.clock().tick(999);
          cache.get('key');
          expect(cache.hits()).toEqual(2);
          jasmine.clock().tick(1);
          cache.get('key');
          expect(cache.hits()).toEqual(2);
        });
    });

    describe('misses()', function() {
        beforeEach(function() {
          cache.setDebug(false);
        });

        it('should return 0 given an empty cache', function() {
          expect(cache.misses()).toEqual(0);
        });

        it('should return 0 given a non-empty cache which has not been accessed', function() {
          cache.put('key', 'value');
          expect(cache.misses()).toEqual(0);
        });

        it('should return 0 given a non-empty cache which has had only hits', function() {
          cache.put('key', 'value');
          cache.get('key');
          cache.get('key');
          cache.get('key');
          expect(cache.misses()).toEqual(0);
        });

        it('should return 1 given a non-empty cache which has had a single miss', function() {
          cache.put('key', 'value');
          cache.get('miss');
          expect(cache.misses()).toEqual(1);
        });

        it('should return 3 given a non-empty cache which has had three misses', function() {
          cache.put('key', 'value');
          cache.get('miss1');
          cache.get('miss2');
          cache.get('miss3');
          expect(cache.misses()).toEqual(3);
        });

        it('should return the correct value after a sequence of hits and misses', function() {
          cache.put('key1', 'value1');
          cache.put('key2', 'value2');
          cache.put('key3', 'value3');
          cache.get('key1');
          cache.get('miss');
          cache.get('key3');
          expect(cache.misses()).toEqual(1);
        });

        it('should count misses for expired keys', function() {
          cache.put('key', 'value', 1000);
          cache.get('key');
          expect(cache.misses()).toEqual(0);
          jasmine.clock().tick(999);
          cache.get('key');
          expect(cache.misses()).toEqual(0);
          jasmine.clock().tick(1);
          cache.get('key');
          expect(cache.misses()).toEqual(1);
        });
    });

    describe('keys()', function() {
        beforeEach(function() {
          cache.setDebug(false);
        });

        it('should return an empty array given an empty cache', function() {
          expect(cache.keys()).toDeepEqual([]);
        });

        it('should return a single key after adding a single item to the cache', function() {
          cache.put('key', 'value');
          expect(cache.keys()).toDeepEqual(['key']);
        });

        it('should return 3 keys after adding three items to the cache', function() {
          cache.put('key1', 'value1');
          cache.put('key2', 'value2');
          cache.put('key3', 'value3');
          expect(cache.keys()).toDeepEqual(['key1', 'key2', 'key3']);
        });

        it('should not multi-count duplicate items added to the cache', function() {
          cache.put('key', 'value1');
          expect(cache.keys()).toDeepEqual(['key']);
          cache.put('key', 'value2');
          expect(cache.keys()).toDeepEqual(['key']);
        });

        it('should update when a key in the cache expires', function() {
          cache.put('key', 'value', 1000);
          expect(cache.keys()).toDeepEqual(['key']);
          jasmine.clock().tick(999);
          expect(cache.keys()).toDeepEqual(['key']);
          jasmine.clock().tick(1);
          expect(cache.keys()).toDeepEqual([]);
        });
    });

    describe('toArray()', function() {
        beforeEach(function() {
          cache.setDebug(false);
        });

        it("should return an array of values", function() {
            cache.put('key1', 'value1');
            cache.put('key2', 'value2');
            expect(
                cache.toArray()
                .map(function(item) { return item.value })
            ).toDeepEqual(['value1', 'value2']);
        });
    });

    describe('filter()', function() {
        beforeEach(function() {
            cache.setDebug(false);
        });

        it("should filter based on a predicate", function() {
            cache.put('key1', 'value1');
            cache.put('key2', 'value2');
            var filtered = cache.filter(function(item) {
                return item.value == 'value1';
            });
            expect(filtered.get('key1').value).toEqual('value1');
            expect(filtered.get('key2')).toEqual(undefined);
        });

        it("should filter all keys without expirations", function() {
            cache.put('key1', 'value1', Infinity);
            cache.put('key2', 'value2', Infinity);
            cache.put('key3', 'value3', 10000);
            cache.put('key4', 'value4', 20000);
            var filtered = cache.filter(function(item) {
                return !item.timeout;
            })
            expect(filtered.get('key1').value).toEqual('value1');
            expect(filtered.get('key2').value).toEqual('value2');
            expect(filtered.get('key3')).toEqual(undefined);
            expect(filtered.get('key4')).toEqual(undefined);
        });
    });

    describe("map()", function() {
        it("should map the values of the cache", function() {
            cache.put('key1', 1);
            cache.put('key2', 2);
            cache.put('key3', 3);
            cache.put('key4', 4);
            var mapped = cache.map(function(value, key) {
                value.value = value.value + 1;
                return value;
            });
            expect(mapped.get('key1').value).toEqual(2);
            expect(mapped.get('key2').value).toEqual(3);
            expect(mapped.get('key3').value).toEqual(4);
            expect(mapped.get('key4').value).toEqual(5);
        })
    })
});
