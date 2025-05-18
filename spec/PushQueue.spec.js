const Config = require('../lib/Config');
const { PushQueue } = require('../lib/Push/PushQueue');

describe('PushQueue', () => {
  describe('With a defined channel', () => {
    it('should be propagated to the PushWorker and PushQueue', done => {
      reconfigureServer({
        push: {
          queueOptions: {
            disablePushWorker: false,
            channel: 'my-specific-channel',
          },
          adapter: {
            send() {
              return Promise.resolve();
            },
            getValidPushTypes() {
              return [];
            },
          },
        },
      })
        .then(() => {
          const config = Config.get(Parse.applicationId);
          expect(config.pushWorker.channel).toEqual('my-specific-channel', 'pushWorker.channel');
          expect(config.pushControllerQueue.channel).toEqual(
            'my-specific-channel',
            'pushWorker.channel'
          );
        })
        .then(done, done.fail);
    });
  });

  describe('Default channel', () => {
    it('should be prefixed with the applicationId', done => {
      reconfigureServer({
        push: {
          queueOptions: {
            disablePushWorker: false,
          },
          adapter: {
            send() {
              return Promise.resolve();
            },
            getValidPushTypes() {
              return [];
            },
          },
        },
      })
        .then(() => {
          const config = Config.get(Parse.applicationId);
          expect(PushQueue.defaultPushChannel()).toEqual('test-parse-server-push');
          expect(config.pushWorker.channel).toEqual('test-parse-server-push');
          expect(config.pushControllerQueue.channel).toEqual('test-parse-server-push');
        })
        .then(done, done.fail);
    });
  });
});
