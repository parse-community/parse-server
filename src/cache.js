/** @flow weak */

export function CacheStore<KeyType, ValueType>() {
  let dataStore: {[id:KeyType]:ValueType} = {};
  return {
    get: (key: KeyType): ValueType => {
      return dataStore[key];
    },
    set(key: KeyType, value: ValueType): void {
      dataStore[key] = value;
    },
    remove(key: KeyType): void {
      delete dataStore[key];
    },
    clear(): void {
      dataStore = {};
    }
  };
}

const apps = CacheStore();
const users = CacheStore();

//So far used only in tests
export function clearCache(): void {
  apps.clear();
  users.clear();
}

export default {
  apps,
  users,
  clearCache,
  CacheStore
};
