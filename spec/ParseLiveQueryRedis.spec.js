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
      const [, object] = await Promise.all([
        new Promise(resolve =>
          subscription.on('create', () => {
            resolve();
          })
        ),
        new Parse.Object('TestObject').save(),
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
  });
}
