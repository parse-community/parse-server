'use strict'

let equal = require('deep-equal');
let deepcopy = require('deepcopy');

import { logger, configureLogger } from './logger';
let authDataManager = require('./authDataManager');
let DatabaseAdapter = require('./DatabaseAdapter');

// doesn't make sense to expose / modify these settings
let lockedSettings = [
  'applicationId',
  'masterKey',
  'serverURL',
  'collectionPrefix',
  'filesController',
  'pushController',
  'loggerController',
  'hooksController',
  'userController',
  'authDataManager',
  'liveQueryController'
];

// callbacks for specific setting changes
let onChange = {
  logLevel: logLevel => {
    configureLogger({ level: logLevel });
    return logLevel;
  },
  oauth: (oauth, doc) => {
    doc.locked.authDataManager = authDataManager(oauth, doc.settings.enableAnonymousUsers);
    return oauth;
  },
  enableAnonymousUsers: (enableAnonymousUsers, doc) => {
    doc.locked.authDataManager = authDataManager(doc.settings.oauth, enableAnonymousUsers);
    return enableAnonymousUsers;
  },
  sessionLength: sessionLength => Number(sessionLength)
}

export default function PersistentSettingsStore(options, definedSettings) {
  let {
    freshness = 15,
    lockDefinedSettings = true
  } = options;
  let dataStore = {};

  return {
    // filter can be 'locked' or 'persisted'
    get: (key, filter) => {
      let doc = dataStore[key];
      pullSettings(doc);
      if (filter) {
        // if filter, return wrapped settings for locked / persisted
        return filterDescriptors(doc.settings, doc[filter]);
      } else {
        // return wrapped settings
        return doc.settings;
      }
    },

    set: (key, settings) => {
      let doc = {
        // An object with getter/setters wrapped properties. Values stored in persisted/locked
        settings: settings,
        // Store for the persisted properties of settings
        persisted: {},
        // Store for the locked properties of settings
        locked: {},
        // Last time the settings were pulled from the database
        lastPull: new Date(1970, 0, 0),
      };

      // wrap settings with getters / setters
      setupSettingPersistence(doc, settings);

      // place doc in map
      dataStore[key] = doc;

      // sync with database
      return pullSettings(doc).then(_ => pushSettings(doc));
    },

    remove: key => {
      delete dataStore[key];
    },

    clear: _ => {
      dataStore = {};
    }
  };

  function getSettingsCollection(doc) {
    return DatabaseAdapter.getDatabaseConnection(doc.settings.applicationId, doc.settings.collectionPrefix)
      .adaptiveCollection('_ServerSettings');
  }

  function pullSettings(doc) {
    if (new Date() - doc.lastPull > freshness * 1000) {
      doc.lastPull = new Date();

      return getSettingsCollection(doc)
        .then(coll => coll.find({ 'applicationId': doc.settings.applicationId }, { limit: 1}))
        .then(results => {
          let databaseSettings = results.length && results[0] && results[0].persisted;
          Object.assign(doc.settings, databaseSettings);
        });
    }
  }

  function pushSettings(doc) {
    return getSettingsCollection(doc)
      .then(upsert(doc, {
        applicationId: doc.settings.applicationId, 
        persisted: doc.persisted
      }));
  }

  function pushSetting(doc, setting, value) {
    let upsertObject = { $set: {} };
    upsertObject.$set['persisted.' + setting] = value;

    return getSettingsCollection(doc)
      .then(upsert(doc, upsertObject));
  }

  function upsert(doc, upsertObject) {
    return coll => coll.upsertOne({ applicationId: doc.settings.applicationId }, deepcopy(upsertObject));
  }

  // Instrument settings object with getter/setters to enable persistence
  function setupSettingPersistence(doc, settings) {
    let definedSettingsArray = Object.keys(definedSettings);
    Object.keys(settings).forEach(setting => {
      if (lockedSettings.some(locked => locked === setting) || (lockDefinedSettings && definedSettingsArray.some(defined => defined === setting))) {
        // for locked settings, attach a getter and a dummy setter.  Store actual setting values in doc.locked
        doc.locked[setting] = settings[setting];
        Object.defineProperty(doc.settings, setting, {
          get: function() {
            return doc.locked[setting];
          },
          set: function(val) {
            logger.info(`Cannot modify '${setting}' as it is a locked setting`);
          }
        })
      }
      else {
        // Store persisted setting values in doc.persisted.  If the setting value is undefined set to null instead so that it is sent over the network
        doc.persisted[setting] = (settings[setting] === undefined)? null: settings[setting];
        // Attach a getter and a setter to persisted settings which executes onChange callback and stores setting in database.
        Object.defineProperty(doc.settings, setting, {
          get: function() { 
            return doc.persisted[setting];
          },
          set: function(val) {
            // ignore if previous and new value are equal
            if (!equal(val, doc.persisted[setting], { strict: true })) {
              // execute change callback for setting if it exists
              if (onChange[setting]) {
                val = onChange[setting](val, doc);
              }
              // update in-memory setting
              doc.persisted[setting] = val;

              // push setting to database
              pushSetting(doc, setting, val);
            }
          }
        });
      }
    });
  }

  function filterDescriptors(source, subset) {
    let filtered = {};
    let descriptors = Object.keys(subset).reduce((descriptors, key) => {
      descriptors[key] = Object.getOwnPropertyDescriptor(source, key);
      return descriptors;
    }, {});
    Object.defineProperties(filtered, descriptors);
    return filtered;
  } 
}

