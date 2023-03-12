const { ApolloClient, gql, InMemoryCache } = require('@apollo/client');
describe('requestContextMiddleware', () => {
  const requestContextMiddleware = (req, res, next) => {
    req.config.aCustomController = 'aCustomController';
    next();
  };

  fit('should support dependency injection on rest api', async () => {
    Parse.Cloud.beforeSave('_User', request => {
      expect(request.config.aCustomController).toEqual('aCustomController');
    });
    await reconfigureServer({ requestContextMiddleware });
    const user = new Parse.User();
    user.setUsername('test');
    user.setPassword('test');
    await user.signUp();
  });
  it('should support dependency injection on graphql api', async () => {
    Parse.Cloud.beforeSave('_User', request => {
      expect(request.config.aCustomController).toEqual('aCustomController');
    });
    await reconfigureServer({ requestContextMiddleware, graphQLPath: '/graphql' });
    const client = new ApolloClient({
      uri: 'http://localhost:13377/graphql',
      cache: new InMemoryCache(),
    });

    await client.mutate({
      mutation: gql`
        mutation {
          createUser(username: "test", password: "test") {
            user {
              objectId
            }
          }
        }
      `,
    });
  });
});
