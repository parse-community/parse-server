describe('requestContextMiddlewareGraphQL', () => {

  it('should support dependency injection on graphql api', async () => {
    const requestContextMiddleware = (req, res, next) => {
      req.config.aCustomController = 'aCustomController';
      next();
    };
    let called = false;
    Parse.Cloud.beforeSave('_User', request => {
      expect(request.config.aCustomController).toEqual('aCustomController');
      called = true;
    });
    await reconfigureServer({
      requestContextMiddleware,
      mountGraphQL: true,
      graphQLPath: '/graphql',
    });

    await fetch('http://localhost:8378/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
      },
      body: JSON.stringify({
        query: `
            mutation {
              createUser(input: { fields: { username: "test", password: "test" } }) {
                user {
                  objectId
                }
              }
            }
          `,
      }),
    });
    expect(called).toBeTruthy();
  });
});
