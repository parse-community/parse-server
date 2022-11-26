if (process.env.PARSE_SERVER_TEST_CACHE === 'redis') {
  describe('ParseLiveQuery redis', () => {
    afterEach(async () => {
      const client = await Parse.CoreManager.getLiveQueryController().getDefaultLiveQueryClient();
      client.close();
    });
    it('can connect', async () => {
      await reconfigureServer({
        startLiveQueryServer: true,
        liveQuery: {
          classNames: ['TestObject'],
          redisURL: 'redis://localhost:6379',
        },
        liveQueryServerOptions: {
          redisURL: 'redis://localhost:6379',
        },
      });
      const subscription = await new Parse.Query('TestObject').subscribe();
      const [object] = await Promise.all([
        new Parse.Object('TestObject').save(),
        new Promise(resolve =>
          subscription.on('create', () => {
            resolve();
          })
        ),
      ]);
      await Promise.all([
        new Promise(resolve =>
          subscription.on('delete', () => {
            resolve();
          })
        ),
        object.destroy(),
      ]);
    });

    it('can call connect twice', async () => {
      const server = await reconfigureServer({
        startLiveQueryServer: true,
        liveQuery: {
          classNames: ['TestObject'],
          redisURL: 'redis://localhost:6379',
        },
        liveQueryServerOptions: {
          redisURL: 'redis://localhost:6379',
        },
      });
      expect(server.config.liveQueryController.liveQueryPublisher.parsePublisher.isOpen).toBeTrue();
      await server.config.liveQueryController.connect();
      expect(server.config.liveQueryController.liveQueryPublisher.parsePublisher.isOpen).toBeTrue();
      expect(server.liveQueryServer.subscriber.isOpen).toBe(true);
      await server.liveQueryServer.connect();
      expect(server.liveQueryServer.subscriber.isOpen).toBe(true);
    });
  });
}
