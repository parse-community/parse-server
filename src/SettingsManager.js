'use strict'

let equal = require('deep-equal');
let deepcopy = require('deepcopy');

import { logger, configureLogger } from './logger';
import cache from './cache';
let authDataManager = require('./authDataManager');
let database = require('./DatabaseAdapter');

const settingsCollectionName = '_ServerSettings';

// doesn't make sense to expose / modify these settings
const lockedSettings = [
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
  'liveQueryController',
  'enableConfigChanges',
  'settingsInitialized'
];

// settings defined in server configuration
let definedSettings = {};

// callbacks for specific setting changes
let authChange = settings => settings.authDataManager = authDataManager(settings.ouath, settings.enableAnonymousUsers);
let onChange = {
  logLevel: settings => configureLogger({ level: settings.logLevel }),
  verbose: settings => {
    settings.logLevel = 'silly';
    configureLogger({ level: settings.logLevel });
  },
  oauth: authChange,
  enableAnonymousUsers: authChange,
  sessionLength: settings => settings.sessionLength = Number(settings.sessionLength),
}

export default function SettingsManager(appId) {
  return {
    pull: _ => {
      return getSettingsCollection(appId)
        .then(coll => coll.find({ applicationId: appId }, { limit: 1 }))
        .then(results => {
          let settings = results && results.length && results[0];
          if (settings) delete settings._id;
          logger.verbose('Pulled settings: ' + JSON.stringify(settings, null, 2));
          return settings;
        });
    },

    push: settings => {
      settings = deepcopy(settings);
      settings.applicationId = appId;
      return getSettingsCollection(appId)
        .then(coll => coll.upsertOne({applicationId: appId}, { $set: settings }))
        .then(_ => {
          logger.verbose('Pushed settings: ' + JSON.stringify(settings, null, 2));
        });
    },

    updateCache: (updates = {}) => {
      updates = Object.keys(updates)
        .filter(update => !equal(updates[update], cache.apps.get(appId)[update]) && !isLocked(update) && !isDefined(update))
        .reduce((filtered, update) => {
          filtered[update] = updates[update];
          return filtered;
        }, {});

      Object.keys(updates).forEach(setting => {
        var config = cache.apps.get(appId);
        logger.info(`Setting '${setting}' updated from '${config[setting]}' to '${updates[setting]}'`);
        config[setting] = updates[setting];
        if (onChange[setting]) onChange[setting](cache.apps.get(appId))
      });
      return updates;
    },

    getUnlocked: _ => {
      let settings = cache.apps.get(appId);

      let settingsString = JSON.stringify(settings, (k, v) => {
        if (!lockedSettings.includes(k)) {
          if (v === undefined) return null;
          return v;
        }
      });

      return JSON.parse(settingsString);
    },

    setDefined: settings => definedSettings = settings
  };

  function getSettingsCollection() {
    let config = cache.apps.get(appId);
    return database.getDatabaseConnection(appId, config.collectionPrefix).adaptiveCollection(settingsCollectionName);
  }

  function isLocked(update) {
    var isLocked = lockedSettings.includes(update);
    if (isLocked) logger.warn(`Cannot modify the value of '${update}' as it is locked`);
    return isLocked;
  }

  function isDefined(update) {
    var isDefined = Object.keys(definedSettings).includes(update);
    if (isDefined) logger.warn(`Cannot modify the value of '${update}' as it is defined as '${definedSettings[update]}' in parse server configuration`);
    return isDefined;
  }
}
