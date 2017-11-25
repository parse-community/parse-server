import { ParseMessageQueue }      from '../ParseMessageQueue';
import rest                       from '../rest';
import { applyDeviceTokenExists } from './utils';
import Parse from 'parse/node';
import logger from '../logger';

const PUSH_CHANNEL = 'parse-server-push';
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_QUERY_BATCH_SIZE = 10000;

export class PushQueue {
  parsePublisher: Object;
  channel: String;
  batchSize: Number;

  // config object of the publisher, right now it only contains the redisURL,
  // but we may extend it later.
  constructor(config: any = {}) {
    this.channel = config.channel || PushQueue.defaultPushChannel();
    this.batchSize = config.batchSize || DEFAULT_BATCH_SIZE;
    this.installationsQueryBatchSize = config.installationsQueryBatchSize || DEFAULT_QUERY_BATCH_SIZE;
    this.parsePublisher = ParseMessageQueue.createPublisher(config);
  }

  static defaultPushChannel() {
    return `${Parse.applicationId}-${PUSH_CHANNEL}`;
  }

  enqueue(body, where, config, auth, pushStatus) {
    where = applyDeviceTokenExists(where);
    return Promise.resolve().then(() => {
      const batches = [];
      let currentBatch = [];
      let total = 0;
      const options = {
        limit: this.installationsQueryBatchSize,
        keys: 'objectId'
      }
      return rest.each(config, auth, '_Installation', where, options, (result) => {
        total++;
        currentBatch.push(result.objectId);
        if (currentBatch.length == this.batchSize) {
          batches.push(currentBatch);
          currentBatch = [];
        }
      }, { useMasterKey: true, batchSize: 10000 }).then(() => {
        if (currentBatch.length > 0) {
          batches.push(currentBatch);
        }
        return Promise.resolve({ batches, total });
      });
    }).then(({ batches, total }) => {
      if (total == 0) {
        return Promise.reject({error: 'PushController: no results in query'})
      }
      logger.verbose(`_PushStatus ${pushStatus.objectId}: sending push to installations with %d batches`, total);
      batches.forEach((batch) => {
        const pushWorkItem = {
          body,
          query: {
            where: { objectId: { '$in': batch }},
          },
          pushStatus: { objectId: pushStatus.objectId },
          applicationId: config.applicationId
        };
        console.log(body) // eslint-disable-line
        this.parsePublisher.publish(this.channel, JSON.stringify(pushWorkItem));
      });
    }).then(() => {
      pushStatus.complete(); // complete right away
    });
  }
}
