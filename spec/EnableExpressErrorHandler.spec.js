const request = require('../lib/request');

describe('Enable express error handler', () => {
  it('should call the default handler in case of error, like updating a non existing object', async done => {
    const parseServer = await reconfigureServer(
      Object.assign({}, defaultConfiguration, {
        enableExpressErrorHandler: true,
      })
    );
    parseServer.app.use(function (err, req, res, next) {
      expect(err.message).toBe('Object not found.');
      next(err);
    });

    try {
      await request({
        method: 'PUT',
        url: defaultConfiguration.serverURL + '/classes/AnyClass/nonExistingId',
        headers: {
          'X-Parse-Application-Id': defaultConfiguration.appId,
          'X-Parse-Master-Key': defaultConfiguration.masterKey,
          'Content-Type': 'application/json',
        },
        body: { someField: 'blablabla' },
      });
      fail('Should throw error');
    } catch (response) {
      expect(response).toBeDefined();
      expect(response.status).toEqual(500);
      parseServer.server.close(done);
    }
  });
});
