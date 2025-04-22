// @flow
// @flow-disable-next
import deepcopy from 'deepcopy';
import AdaptableController from '../Controllers/AdaptableController';
import { master } from '../Auth';
import Config from '../Config';
import { PushAdapter } from '../Adapters/Push/PushAdapter';
import rest from '../rest';
import { pushStatusHandler } from '../StatusHandler';
import * as utils from './utils';
import { ParseMessageQueue } from '../ParseMessageQueue';
import { PushQueue } from './PushQueue';
import logger from '../logger';

function groupByBadge(installations) {
  return installations.reduce((map, installation) => {
    const badge = installation.badge + '';
    map[badge] = map[badge] || [];
    map[badge].push(installation);
    return map;
  }, {});
}

export class PushWorker {
  subscriber: ?any;
  adapter: any;
  channel: string;

  constructor(pushAdapter: PushAdapter, subscriberConfig: any = {}) {
    AdaptableController.validateAdapter(pushAdapter, this, PushAdapter);
    this.adapter = pushAdapter;

    this.channel = subscriberConfig.channel || PushQueue.defaultPushChannel();
    this.subscriber = ParseMessageQueue.createSubscriber(subscriberConfig);
    if (this.subscriber) {
      const subscriber = this.subscriber;
      subscriber.subscribe(this.channel);
      subscriber.on('message', (channel, messageStr) => {
        const workItem = JSON.parse(messageStr);
        this.run(workItem);
      });
    }
  }

  run({ body, query, pushStatus, applicationId, UTCOffset }: any): Promise<*> {
    const config = Config.get(applicationId);
    const auth = master(config);
    const where = utils.applyDeviceTokenExists(query.where);
    delete query.where;
    pushStatus = pushStatusHandler(config, pushStatus.objectId);
    return rest.find(config, auth, '_Installation', where, query).then(({ results }) => {
      if (results.length == 0) {
        return;
      }
      return this.sendToAdapter(body, results, pushStatus, config, UTCOffset);
    });
  }

  sendToAdapter(
    body: any,
    installations: any[],
    pushStatus: any,
    config: Config,
    UTCOffset: ?any
  ): Promise<*> {
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
      logger.verbose(`Sending push to ${installations.length}`);
      return this.adapter.send(body, installations, pushStatus.objectId).then(results => {
        return pushStatus.trackSent(results, UTCOffset).then(() => results);
      });
    }

    // Collect the badges to reduce the # of calls
    const badgeInstallationsMap = groupByBadge(installations);

    // Map the on the badges count and return the send result
    const promises = Object.keys(badgeInstallationsMap).map(badge => {
      const payload = deepcopy(body);
      payload.data.badge = parseInt(badge);
      const installations = badgeInstallationsMap[badge];
      return this.sendToAdapter(payload, installations, pushStatus, config, UTCOffset);
    });
    return Promise.all(promises);
  }
}

export default PushWorker;
