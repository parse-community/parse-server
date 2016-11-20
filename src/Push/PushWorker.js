import deepcopy               from 'deepcopy';
import AdaptableController    from '../Controllers/AdaptableController';
import { master }             from '../Auth';
import Config                 from '../Config';
import { PushAdapter }        from '../Adapters/Push/PushAdapter';
import rest                   from '../rest';
import { pushStatusHandler }  from '../StatusHandler';
import { isPushIncrementing } from './utils';
import { ParseMessageQueue }  from '../ParseMessageQueue';
import { PushQueue }          from './PushQueue';

const UNSUPPORTED_BADGE_KEY = "unsupported";

function groupByBadge(installations) {
  return installations.reduce((map, installation) => {
    let badge = installation.badge+'';
    if (installation.deviceType != "ios") {
      badge = UNSUPPORTED_BADGE_KEY;
    }
    map[badge] = map[badge] || [];
    map[badge].push(installation);
    return map;
  }, {});
}

export class PushWorker {
  
  constructor(pushAdapter, subscriberConfig = {}) {
    AdaptableController.validateAdapter(pushAdapter, this, PushAdapter);
    this.adapter = pushAdapter;
    
    this.channel = subscriberConfig.channel || PushQueue.defaultPushChannel();
    this.subscriber = ParseMessageQueue.createSubscriber(subscriberConfig);
    this.subscriber.subscribe(this.channel);
    this.subscriber.on('message', (channel, messageStr) => {
      let workItem = JSON.parse(messageStr);
      this.run(workItem);
    });
  }

  unsubscribe() {
    this.subscriber.unsubscribe(this.channel);
  }

  run({ body, query, pushStatus, applicationId }) {
    let config = new Config(applicationId);
    let auth = master(config);
    let where  = query.where;
    delete query.where;
    return rest.find(config, auth, '_Installation', where, query).then(({results}) => {
      if (results.length == 0) {
        return;
      }
      return this.sendToAdapter(body, results, pushStatus, config);
    }, err => {
      throw err;
    });
  }

  sendToAdapter(body, installations, pushStatus, config) {
    pushStatus = pushStatusHandler(config, pushStatus.objectId);
    if (!isPushIncrementing(body)) {
      return this.adapter.send(body, installations, pushStatus.objectId).then((results) => {
        return pushStatus.trackSent(results);
      });
    }

    // Collect the badges to reduce the # of calls
    let badgeInstallationsMap = groupByBadge(installations);

    // Map the on the badges count and return the send result
    let promises = Object.keys(badgeInstallationsMap).map((badge) => {
      let payload = deepcopy(body);
      if (badge == UNSUPPORTED_BADGE_KEY) {
        delete payload.data.badge;
      } else {
        payload.data.badge = parseInt(badge);
      }
      const installations = badgeInstallationsMap[badge];
      return this.sendToAdapter(payload, installations, pushStatus, config);
    });
    return Promise.all(promises);
  }
}

export default PushWorker;
