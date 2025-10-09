describe('requestContextMiddleware', () => {

  it('should support dependency injection on graphql and rest api', async () => {
    const requestContextMiddleware = (req, res, next) => {
      req.config.aCustomController = 'aCustomController';
      next();
    };

    let called = 0
    await reconfigureServer({ requestContextMiddleware, mountGraphQL: true, graphQLPath: '/graphql' });
    Parse.Cloud.beforeSave('_User', request => {
      expect(request.config.aCustomController).toEqual('aCustomController');
      called++;
    });
    const user = new Parse.User();
    user.setUsername('test');
    user.setPassword('test');
    await user.signUp();

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
              createUser(input: { fields: { username: "test2", password: "test2" } }) {
                user {
                  objectId
                }
              }
            }
          `,
      }),
    });
    expect(called).toBe(2);
  });
});
