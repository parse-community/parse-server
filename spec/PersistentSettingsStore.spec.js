'use strict';

var PersistentSettingsStore = require('../src/PersistentSettingsStore').default;
var DatabaseAdapter = require('../src/DatabaseAdapter');
var appId = 'test';
var collectionPrefix = 'test_';
var store;
var settingsCollection;

describe('PersistentSettingsStore', function () {
  beforeEach(function () {
    store = PersistentSettingsStore({
      freshness: 0.1
    }, {
      defined: 0
    });
  });

  describe('mocked db', function () {
    beforeEach(function () {
      settingsCollection = jasmine.createSpyObj('settingsCollection', ['find', 'upsertOne']);
      settingsCollection.find.and.returnValue(Promise.resolve([]));
      settingsCollection.upsertOne.and.returnValue(Promise.resolve());

      spyOn(DatabaseAdapter, 'getDatabaseConnection').and.returnValue({
        adaptiveCollection: _ => {
          return Promise.resolve(settingsCollection);
        }
      });
    });

    it('does not persist locked settings', function() {
      store.set(appId, {
        applicationId: appId
      });

      expect(store.get(appId, 'persisted').applicationId).toBeUndefined;
      expect(store.get(appId, 'locked').applicationId).toEqual(appId);
    });

    it('does not persist defined settings by default', function() {
      store.set(appId, {
        defined: 0
      });

      expect(store.get(appId, 'persisted').defined).toBeUndefined;
      expect(store.get(appId, 'locked').defined).toBeDefined;
    });

    it('persists defined settings if lockDefinedSettings false', function() {
      store = PersistentSettingsStore({
        lockDefinedSettings: false
      }, {
        defined: 0
      });

      store.set(appId, {
        defined: 0
      });

      expect(store.get(appId, 'persisted').defined).toBeDefined;
      expect(store.get(appId, 'locked').defined).toBeUndefined;
    });

    it('does not allow modification of locked settings', function() {
      store.set(appId, {
        defined: 0
      });

      store.get(appId).defined = 2;

      expect(store.get(appId).defined).toEqual(0);
    });

    it('allows modification of persisted settings', function() {
      store.set(appId, {
        modifiable: 0
      });

      store.get(appId).modifiable = 2;
      expect(store.get(appId).modifiable).toEqual(2);
    });

    it('respects freshness option', function(done) {
      // freshness 100 ms
      store.set(appId, {
        modifiable: 0
      });

      function get() {
        store.get(appId);
      }
      setTimeout(get, 50);
      // freshness expires
      setTimeout(get, 150);
      setTimeout(get, 200);
      // freshness expires
      setTimeout(get, 300)
      setTimeout(function () {
        // three calls: one for initial pull, two from expired freshness
        expect(settingsCollection.find.calls.count()).toEqual(3);
        done();
      }, 350);
    });

    it('pushes on setting change', function(done) {
      store.set(appId, {
        applicationId: appId,
        modifiable: 0
      });

      setTimeout(function () {
        store.get(appId).modifiable = 2;
      }, 100);

      setTimeout(function () {
        var calls = settingsCollection.upsertOne.calls;
        expect(calls.count()).toEqual(2);
        expect(calls.argsFor(0)[1]).toEqual({
          applicationId: appId,
          persisted: {
            modifiable: 0
          }
        });
        expect(calls.argsFor(1)[1]).toEqual({
          $set: {
            'persisted.modifiable': 2
          }
        });
        done();
      }, 200);
    });
  });
});
