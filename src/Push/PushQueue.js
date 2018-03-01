import { ParseMessageQueue }      from '../ParseMessageQueue';
import rest                       from '../rest';
import { applyDeviceTokenExists } from './utils';
import Parse from 'parse/node';

const PUSH_CHANNEL = 'parse-server-push';
const DEFAULT_BATCH_SIZE = 100;

export class PushQueue {
  parsePublisher: Object;
  channel: String;
  batchSize: Number;

  // config object of the publisher, right now it only contains the redisURL,
  // but we may extend it later.
  constructor(config: any = {}) {
    this.channel = config.channel || PushQueue.defaultPushChannel();
    this.batchSize = config.batchSize || DEFAULT_BATCH_SIZE;
    this.parsePublisher = ParseMessageQueue.createPublisher(config);
  }

  static defaultPushChannel() {
    return `${Parse.applicationId}-${PUSH_CHANNEL}`;
  }

  enqueue(body, where, config, auth, pushStatus) {
    const limit = this.batchSize;

    where = applyDeviceTokenExists(where);

    // Order by objectId so no impact on the DB
    const order = 'objectId';
    return Promise.resolve().then(() => {
      return rest.find(config,
        auth,
        '_Installation',
        where,
        {limit: 0, count: true});
    }).then(({results, count}) => {
      if (!results || count == 0) {
        return pushStatus.complete();
      }
      pushStatus.setRunning(Math.ceil(count / limit));
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
