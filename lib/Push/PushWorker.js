'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PushWorker = undefined;

var _deepcopy = require('deepcopy');

var _deepcopy2 = _interopRequireDefault(_deepcopy);

var _AdaptableController = require('../Controllers/AdaptableController');

var _AdaptableController2 = _interopRequireDefault(_AdaptableController);

var _Auth = require('../Auth');

var _Config = require('../Config');

var _Config2 = _interopRequireDefault(_Config);

var _PushAdapter = require('../Adapters/Push/PushAdapter');

var _rest = require('../rest');

var _rest2 = _interopRequireDefault(_rest);

var _StatusHandler = require('../StatusHandler');

var _utils = require('./utils');

var utils = _interopRequireWildcard(_utils);

var _ParseMessageQueue = require('../ParseMessageQueue');

var _PushQueue = require('./PushQueue');

var _logger = require('../logger');

var _logger2 = _interopRequireDefault(_logger);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function groupByBadge(installations) {
  return installations.reduce((map, installation) => {
    const badge = installation.badge + '';
    map[badge] = map[badge] || [];
    map[badge].push(installation);
    return map;
  }, {});
}
// -disable-next
class PushWorker {

  constructor(pushAdapter, subscriberConfig = {}) {
    _AdaptableController2.default.validateAdapter(pushAdapter, this, _PushAdapter.PushAdapter);
    this.adapter = pushAdapter;

    this.channel = subscriberConfig.channel || _PushQueue.PushQueue.defaultPushChannel();
    this.subscriber = _ParseMessageQueue.ParseMessageQueue.createSubscriber(subscriberConfig);
    if (this.subscriber) {
      const subscriber = this.subscriber;
      subscriber.subscribe(this.channel);
      subscriber.on('message', (channel, messageStr) => {
        const workItem = JSON.parse(messageStr);
        this.run(workItem);
      });
    }
  }

  unsubscribe() {
    if (this.subscriber) {
      this.subscriber.unsubscribe(this.channel);
    }
  }

  run({ body, query, pushStatus, applicationId, UTCOffset }) {
    const config = _Config2.default.get(applicationId);
    const auth = (0, _Auth.master)(config);
    const where = utils.applyDeviceTokenExists(query.where);
    delete query.where;
    pushStatus = (0, _StatusHandler.pushStatusHandler)(config, pushStatus.objectId);
    return _rest2.default.find(config, auth, '_Installation', where, query).then(({ results }) => {
      if (results.length == 0) {
        return;
      }
      return this.sendToAdapter(body, results, pushStatus, config, UTCOffset);
    }, err => {
      throw err;
    });
  }

  sendToAdapter(body, installations, pushStatus, config, UTCOffset) {
    // Check if we have locales in the push body
    const locales = utils.getLocalesFromPush(body);
    if (locales.length > 0) {
      // Get all tranformed bodies for each locale
      const bodiesPerLocales = utils.bodiesPerLocales(body, locales);

      // Group installations on the specified locales (en, fr, default etc...)
      const grouppedInstallations = utils.groupByLocaleIdentifier(installations, locales);
      const promises = Object.keys(grouppedInstallations).map(locale => {
        const installations = grouppedInstallations[locale];
        const body = bodiesPerLocales[locale];
        return this.sendToAdapter(body, installations, pushStatus, config, UTCOffset);
      });
      return Promise.all(promises);
    }

    if (!utils.isPushIncrementing(body)) {
      _logger2.default.verbose(`Sending push to ${installations.length}`);
      return this.adapter.send(body, installations, pushStatus.objectId).then(results => {
        return pushStatus.trackSent(results, UTCOffset).then(() => results);
      });
    }

    // Collect the badges to reduce the # of calls
    const badgeInstallationsMap = groupByBadge(installations);

    // Map the on the badges count and return the send result
    const promises = Object.keys(badgeInstallationsMap).map(badge => {
      const payload = (0, _deepcopy2.default)(body);
      payload.data.badge = parseInt(badge);
      const installations = badgeInstallationsMap[badge];
      return this.sendToAdapter(payload, installations, pushStatus, config, UTCOffset);
    });
    return Promise.all(promises);
  }
}

exports.PushWorker = PushWorker;
exports.default = PushWorker;