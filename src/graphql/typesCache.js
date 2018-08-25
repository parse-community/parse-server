// @flow
let cache = {};

export function getOrElse<T>(key: string, handler: () => T): ?T {
  if (!cache[key]) {
    cache[key] = handler();
  }
  return cache[key];
}

export function clearCache() {
  cache = {};
}
