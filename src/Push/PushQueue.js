import { ParseMessageQueue }  from '../ParseMessageQueue';
import rest                   from '../rest';
import { isPushIncrementing } from './utils';
import deepcopy               from 'deepcopy';

const PUSH_CHANNEL = 'parse-server-push';
const DEFAULT_BATCH_SIZE = 100;

export class PushQueue {
  parsePublisher: Object;
  channel: String;
  batchSize: Number;

  // config object of the publisher, right now it only contains the redisURL,
  // but we may extend it later.
  constructor(config: any = {}) {
    this.channel = config.channel || PUSH_CHANNEL;
    this.batchSize = config.batchSize || DEFAULT_BATCH_SIZE;
    this.parsePublisher = ParseMessageQueue.createPublisher(config);
  }

  static defaultPushChannel() {
    return PUSH_CHANNEL;
  }

  enqueue(body, where, config, auth, pushStatus) {
    const limit = this.batchSize;
    // Order by badge (because the payload is badge dependant)
    // and createdAt to fix the order
    const order = isPushIncrementing(body) ? 'badge,createdAt' : 'createdAt';
    where = deepcopy(where);
    if (!where.hasOwnProperty('deviceToken')) {
      where['deviceToken'] = {'$exists': true};
    }
    return Promise.resolve().then(() => {
      return rest.find(config,
        auth,
        '_Installation',
        where,
        {limit: 0, count: true});
    }).then(({results, count}) => {
      if (!results) {
        return Promise.reject({error: 'PushController: no results in query'})
      }
      pushStatus.setRunning(count);
      let skip = 0;
      while (skip < count) {
        const query = { where,
          limit,
          skip,
          order };

        const pushWorkItem = {
          body,
          query,
          pushStatus: { objectId: pushStatus.objectId },
          applicationId: config.applicationId
        }
        this.parsePublisher.publish(this.channel, JSON.stringify(pushWorkItem));
        skip += limit;
      }
    });
  }
}
