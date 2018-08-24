
let cache = {};

export function getOrElse(key, handler) {
  if (!cache[key]) {
    cache[key] = handler();
  }
  return cache[key];
}

export function clearCache() {
  cache = {};
}
