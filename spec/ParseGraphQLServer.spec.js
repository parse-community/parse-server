const http = require('http');
const express = require('express');
const req = require('../lib/request');
const fetch = require('node-fetch');
const ws = require('ws');
const { getMainDefinition } = require('apollo-utilities');
const { split } = require('apollo-link');
const { InMemoryCache } = require('apollo-cache-inmemory');
const { createUploadLink } = require('apollo-upload-client');
const { SubscriptionClient } = require('subscriptions-transport-ws');
const { WebSocketLink } = require('apollo-link-ws');
const ApolloClient = require('apollo-client').default;
const gql = require('graphql-tag');
const { ParseServer } = require('../');
const { ParseGraphQLServer } = require('../lib/GraphQL/ParseGraphQLServer');

describe('ParseGraphQLServer', () => {
  it('can be initialized', async () => {
    const expressApp = express();
    const httpServer = http.createServer(expressApp);
    const parseServer = await global.reconfigureServer();
    expressApp.use('/parse', parseServer.app);
    ParseServer.createLiveQueryServer(httpServer, {
      port: 1338,
    });
    const parseGraphQLServer = new ParseGraphQLServer(parseServer, {
      graphQLPath: '/graphql',
      playgroundPath: '/playground',
      subscriptionsPath: '/subscriptions',
    });
    parseGraphQLServer.applyGraphQL(expressApp);
    parseGraphQLServer.applyPlayground(expressApp);
    parseGraphQLServer.createSubscriptions(httpServer);
    await new Promise(resolve => httpServer.listen({ port: 13377 }, resolve));

    const subscriptionClient = new SubscriptionClient(
      'ws://localhost:13377/subscriptions',
      {
        reconnect: true,
        connectionParams: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Javascript-Key': 'test',
        },
      },
      ws
    );
    const wsLink = new WebSocketLink(subscriptionClient);
    const httpLink = createUploadLink({
      uri: 'http://localhost:13377/graphql',
      fetch,
    });
    const apolloClient = new ApolloClient({
      link: split(
        ({ query }) => {
          const { kind, operation } = getMainDefinition(query);
          return kind === 'OperationDefinition' && operation === 'subscription';
        },
        wsLink,
        httpLink
      ),
      cache: new InMemoryCache(),
    });

    const health = (await apolloClient.query({
      query: gql`
        query Health {
          health
        }
      `,
      fetchPolicy: 'no-cache',
    })).data.health;
    expect(health).toBeTruthy();

    await req({
      method: 'GET',
      url: 'http://localhost:13377/playground',
    });

    httpServer.close();
  });
});
