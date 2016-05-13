'use strict'

let equal = require('deep-equal');
let deepcopy = require('deepcopy');

import { logger, configureLogger } from './logger';
import cache from './cache';
import Config from './Config';
let authDataManager = require('./authDataManager');


const settingsCollectionName = '_ServerSettings';

// visible locked settings
const lockedSettings = [
  'applicationId',
  'masterKey',
  'serverURL',
  'collectionPrefix',
  'enableConfigChanges',
];
// hidden locked settings
const hiddenSettings = [
  'filesController',
  'pushController',
  'loggerController',
  'hooksController',
  'userController',
  'authDataManager',
  'liveQueryController',
  'settingsInitialized'
];

// settings defined in server configuration
let definedSettings = {};

// callbacks for specific setting changes
let authChange = settings => settings.authDataManager = authDataManager(settings.ouath, settings.enableAnonymousUsers);
let onChange = {
  logLevel: settings => configureLogger({ level: settings.logLevel }),
  verbose: settings => {
    settings.logLevel = settings.verbose? 'silly': 'info';
    configureLogger({ level: settings.logLevel });
  },
  oauth: authChange,
  enableAnonymousUsers: authChange,
  sessionLength: settings => settings.sessionLength = Number(settings.sessionLength),
}

export default function SettingsManager(appId) {
  return {
    pull: () => {
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
        .then(() => {
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

    getVisible: () => {
      let settings = cache.apps.get(appId);

      let settingsString = JSON.stringify(settings, (k, v) => {
        if (!hiddenSettings.includes(k)) {
          if (v === undefined) return null;
          return v;
        }
      });

      return JSON.parse(settingsString);
    },

    setDefined: settings => definedSettings = settings
  };

  function getSettingsCollection() {
    let config = new Config(appId);
    return config.database.adapter.adaptiveCollection(settingsCollectionName);
  }

  function isLocked(update) {
    var isLocked = lockedSettings.includes(update) || hiddenSettings.includes(update);
    if (isLocked) logger.warn(`Cannot modify the value of '${update}' as it is locked`);
    return isLocked;
  }

  function isDefined(update) {
    var isDefined = Object.keys(definedSettings).includes(update);
    if (isDefined) logger.warn(`Cannot modify the value of '${update}' as it is defined as '${definedSettings[update]}' in parse server configuration`);
    return isDefined;
  }
}
