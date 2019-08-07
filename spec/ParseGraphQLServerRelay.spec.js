const http = require('http');
const fetch = require('node-fetch');
const ws = require('ws');
const express = require('express');
const { ParseServer } = require('../');
const { ParseGraphQLServer } = require('../lib/GraphQL/ParseGraphQLServer');
const { SubscriptionClient } = require('subscriptions-transport-ws');
const { WebSocketLink } = require('apollo-link-ws');
const { createUploadLink } = require('apollo-upload-client');
const ApolloClient = require('apollo-client').default;
const { getMainDefinition } = require('apollo-utilities');
const { split } = require('apollo-link');
const { InMemoryCache } = require('apollo-cache-inmemory');
const gql = require('graphql-tag');

describe('ParseGraphQLServer - Relay Style', () => {
  const headers = {
    'X-Parse-Application-Id': 'test',
    'X-Parse-Javascript-Key': 'test',
  };

  let apolloClient;

  beforeAll(async () => {
    const parseServer = await global.reconfigureServer({});
    const parseGraphQLServer = new ParseGraphQLServer(parseServer, {
      graphQLPath: '/graphql',
      playgroundPath: '/playground',
      subscriptionsPath: '/subscriptions',
      relayStyle: true,
    });
    const expressApp = express();
    const httpServer = http.createServer(expressApp);
    expressApp.use('/parse', parseServer.app);
    ParseServer.createLiveQueryServer(httpServer, {
      port: 1338,
    });
    parseGraphQLServer.applyGraphQL(expressApp);
    parseGraphQLServer.applyPlayground(expressApp);
    parseGraphQLServer.createSubscriptions(httpServer);
    await new Promise(resolve => httpServer.listen({ port: 13377 }, resolve));

    const subscriptionClient = new SubscriptionClient(
      'ws://localhost:13377/subscriptions',
      {
        reconnect: true,
        connectionParams: headers,
      },
      ws
    );
    const wsLink = new WebSocketLink(subscriptionClient);
    const httpLink = createUploadLink({
      uri: 'http://localhost:13377/graphql',
      fetch,
      headers,
    });
    apolloClient = new ApolloClient({
      link: split(
        ({ query }) => {
          const { kind, operation } = getMainDefinition(query);
          return kind === 'OperationDefinition' && operation === 'subscription';
        },
        wsLink,
        httpLink
      ),
      cache: new InMemoryCache(),
      defaultOptions: {
        query: {
          fetchPolicy: 'no-cache',
        },
      },
    });
  });

  describe('Object Identification', () => {
    it('Class get custom method should return valid gobal id', async () => {
      const obj = new Parse.Object('SomeClass');
      obj.set('someField', 'some value');
      await obj.save();

      const getResult = await apolloClient.query({
        query: gql`
          query GetSomeClass($objectId: ID!) {
            objects {
              getSomeClass(objectId: $objectId) {
                id
                objectId
              }
            }
          }
        `,
        variables: {
          objectId: obj.id,
        },
      });

      expect(getResult.data.objects.getSomeClass.objectId).toBe(obj.id);

      const nodeResult = await apolloClient.query({
        query: gql`
          query Node($id: ID!) {
            node(id: $id) {
              id
              ... on SomeClassClass {
                objectId
                someField
              }
            }
          }
        `,
        variables: {
          id: getResult.data.objects.getSomeClass.id,
        },
      });

      expect(nodeResult.data.node.id).toBe(
        getResult.data.objects.getSomeClass.id
      );
      expect(nodeResult.data.node.objectId).toBe(obj.id);
      expect(nodeResult.data.node.someField).toBe('some value');
    });
  });
});
