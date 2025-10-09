describe('requestContextMiddlewareRest', () => {

  it('should support dependency injection on rest api', async () => {
    const requestContextMiddleware = (req, res, next) => {
      req.config.aCustomController = 'aCustomController';
      next();
    };

    let called;
    Parse.Cloud.beforeSave('_User', request => {
      expect(request.config.aCustomController).toEqual('aCustomController');
      called = true;
    });
    await reconfigureServer({ requestContextMiddleware });
    const user = new Parse.User();
    user.setUsername('test');
    user.setPassword('test');
    await user.signUp();
    expect(called).toBeTruthy();
  });
});
