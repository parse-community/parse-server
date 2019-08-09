const http = require('http');
const fetch = require('node-fetch');
const FormData = require('form-data');
const ws = require('ws');
const express = require('express');
const uuidv4 = require('uuid/v4');
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
  let parseServer;
  let httpServer;
  let parseLiveQueryServer;
  const headers = {
    'X-Parse-Application-Id': 'test',
    'X-Parse-Javascript-Key': 'test',
  };

  let apolloClient;

  beforeAll(async () => {
    parseServer = await global.reconfigureServer({});
    const parseGraphQLServer = new ParseGraphQLServer(parseServer, {
      graphQLPath: '/graphql',
      playgroundPath: '/playground',
      subscriptionsPath: '/subscriptions',
      relayStyle: true,
    });
    const expressApp = express();
    httpServer = http.createServer(expressApp);
    expressApp.use('/parse', parseServer.app);
    parseLiveQueryServer = ParseServer.createLiveQueryServer(httpServer, {
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

  afterAll(async () => {
    await parseLiveQueryServer.server.close();
    await httpServer.close();
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

    it('Class find custom method should return valid gobal id', async () => {
      const obj1 = new Parse.Object('SomeClass');
      obj1.set('someField', 'some value 1');
      await obj1.save();

      const obj2 = new Parse.Object('SomeClass');
      obj2.set('someField', 'some value 2');
      await obj2.save();

      const findResult = await apolloClient.query({
        query: gql`
          query FindSomeClass {
            objects {
              findSomeClass(order: [createdAt_ASC]) {
                results {
                  id
                  objectId
                }
              }
            }
          }
        `,
      });

      expect(findResult.data.objects.findSomeClass.results[0].objectId).toBe(
        obj1.id
      );
      expect(findResult.data.objects.findSomeClass.results[1].objectId).toBe(
        obj2.id
      );

      const nodeResult = await apolloClient.query({
        query: gql`
          query Node($id1: ID!, $id2: ID!) {
            node1: node(id: $id1) {
              id
              ... on SomeClassClass {
                objectId
                someField
              }
            }
            node2: node(id: $id2) {
              id
              ... on SomeClassClass {
                objectId
                someField
              }
            }
          }
        `,
        variables: {
          id1: findResult.data.objects.findSomeClass.results[0].id,
          id2: findResult.data.objects.findSomeClass.results[1].id,
        },
      });

      expect(nodeResult.data.node1.id).toBe(
        findResult.data.objects.findSomeClass.results[0].id
      );
      expect(nodeResult.data.node1.objectId).toBe(obj1.id);
      expect(nodeResult.data.node1.someField).toBe('some value 1');
      expect(nodeResult.data.node2.id).toBe(
        findResult.data.objects.findSomeClass.results[1].id
      );
      expect(nodeResult.data.node2.objectId).toBe(obj2.id);
      expect(nodeResult.data.node2.someField).toBe('some value 2');
    });
  });

  describe('Mutations', () => {
    it('should create file with clientMutationId', async () => {
      parseServer = await global.reconfigureServer({
        publicServerURL: 'http://localhost:13377/parse',
      });

      const clientMutationId = uuidv4();
      const body = new FormData();
      body.append(
        'operations',
        JSON.stringify({
          query: `
            mutation CreateFile($file: Upload!, $clientMutationId: String) {
              files {
                create(input: { file: $file, clientMutationId: $clientMutationId }) {
                  fileInfo {
                    name,
                    url
                  },
                  clientMutationId
                }
              }
            }
          `,
          variables: {
            file: null,
            clientMutationId,
          },
        })
      );
      body.append('map', JSON.stringify({ 1: ['variables.file'] }));
      body.append('1', 'My File Content', {
        filename: 'myFileName.txt',
        contentType: 'text/plain',
      });

      let res = await fetch('http://localhost:13377/graphql', {
        method: 'POST',
        headers,
        body,
      });

      expect(res.status).toEqual(200);

      const result = JSON.parse(await res.text());

      expect(result.data.files.create.fileInfo.name).toEqual(
        jasmine.stringMatching(/_myFileName.txt$/)
      );
      expect(result.data.files.create.fileInfo.url).toEqual(
        jasmine.stringMatching(/_myFileName.txt$/)
      );
      expect(result.data.files.create.clientMutationId).toEqual(
        clientMutationId
      );

      res = await fetch(result.data.files.create.fileInfo.url);

      expect(res.status).toEqual(200);
      expect(await res.text()).toEqual('My File Content');
    });

    it('should call function with clientMutationId', async () => {
      const clientMutationId = uuidv4();

      Parse.Cloud.define('hello', req => {
        return `Hello, ${req.params.name}!!!`;
      });

      const result = await apolloClient.mutate({
        mutation: gql`
          mutation CallFunction($input: CallFunctionInput!) {
            functions {
              call(input: $input) {
                result
                clientMutationId
              }
            }
          }
        `,
        variables: {
          input: {
            functionName: 'hello',
            params: {
              name: 'dude',
            },
            clientMutationId,
          },
        },
      });

      expect(result.data.functions.call.result).toEqual('Hello, dude!!!');
      expect(result.data.functions.call.clientMutationId).toEqual(
        clientMutationId
      );
    });

    it('should create object with clientMutationId in the generic mutation', async () => {
      const clientMutationId = uuidv4();

      const result = await apolloClient.mutate({
        mutation: gql`
          mutation CreateObject($input: CreateObjectInput!) {
            objects {
              create(input: $input) {
                result {
                  objectId
                  createdAt
                }
                clientMutationId
              }
            }
          }
        `,
        variables: {
          input: {
            className: 'SomeClass',
            fields: {
              someField: 'some value',
            },
            clientMutationId,
          },
        },
      });

      expect(result.data.objects.create.result.objectId).toBeDefined();

      const obj = await new Parse.Query('SomeClass').get(
        result.data.objects.create.result.objectId
      );

      expect(obj.createdAt).toEqual(
        new Date(result.data.objects.create.result.createdAt)
      );
      expect(obj.get('someField')).toEqual('some value');

      expect(result.data.objects.create.clientMutationId).toEqual(
        clientMutationId
      );
    });

    it('should update object with clientMutationId in the generic mutation', async () => {
      const clientMutationId = uuidv4();

      const obj = new Parse.Object('SomeClass');
      obj.set('someField1', 'some field 1 value 1');
      obj.set('someField2', 'some field 2 value 1');
      await obj.save();

      const result = await apolloClient.mutate({
        mutation: gql`
          mutation UpdateObject($input: UpdateObjectInput!) {
            objects {
              update(input: $input) {
                result {
                  updatedAt
                }
                clientMutationId
              }
            }
          }
        `,
        variables: {
          input: {
            className: 'SomeClass',
            objectId: obj.id,
            fields: {
              someField1: 'some field 1 value 2',
            },
            clientMutationId,
          },
        },
      });

      await obj.fetch();

      expect(obj.updatedAt).toEqual(
        new Date(result.data.objects.update.result.updatedAt)
      );
      expect(obj.get('someField1')).toEqual('some field 1 value 2');
      expect(obj.get('someField2')).toEqual('some field 2 value 1');

      expect(result.data.objects.update.clientMutationId).toEqual(
        clientMutationId
      );
    });

    it('should delete object with clientMutationId in the generic mutation', async () => {
      const clientMutationId = uuidv4();

      const obj = new Parse.Object('SomeClass');
      await obj.save();

      const result = await apolloClient.mutate({
        mutation: gql`
          mutation DeleteObject($input: DeleteObjectInput!) {
            objects {
              delete(input: $input) {
                result
                clientMutationId
              }
            }
          }
        `,
        variables: {
          input: {
            className: 'SomeClass',
            objectId: obj.id,
            clientMutationId,
          },
        },
      });

      expect(result.data.objects.delete.result).toEqual(true);

      await expectAsync(obj.fetch({ useMasterKey: true })).toBeRejectedWith(
        jasmine.stringMatching('Object not found')
      );

      expect(result.data.objects.delete.clientMutationId).toEqual(
        clientMutationId
      );
    });

    it('should sign up with clientMutationId', async () => {
      const clientMutationId = uuidv4();

      const result = await apolloClient.mutate({
        mutation: gql`
          mutation SignUp($input: SignUpInput!) {
            users {
              signUp(input: $input) {
                result {
                  sessionToken
                }
                clientMutationId
              }
            }
          }
        `,
        variables: {
          input: {
            fields: {
              username: 'user1',
              password: 'user1',
            },
            clientMutationId,
          },
        },
      });

      expect(result.data.users.signUp.result.sessionToken).toBeDefined();
      expect(typeof result.data.users.signUp.result.sessionToken).toBe(
        'string'
      );

      expect(result.data.users.signUp.clientMutationId).toEqual(
        clientMutationId
      );
    });

    it('should log in with clientMutationId', async () => {
      const clientMutationId = uuidv4();

      const user = new Parse.User();
      user.setUsername('user1');
      user.setPassword('user1');
      await user.signUp();
      await Parse.User.logOut();

      const result = await apolloClient.mutate({
        mutation: gql`
          mutation LogIn($input: LogInInput!) {
            users {
              logIn(input: $input) {
                me {
                  sessionToken
                }
                clientMutationId
              }
            }
          }
        `,
        variables: {
          input: {
            username: 'user1',
            password: 'user1',
            clientMutationId,
          },
        },
      });

      expect(result.data.users.logIn.me.sessionToken).toBeDefined();
      expect(typeof result.data.users.logIn.me.sessionToken).toBe('string');

      expect(result.data.users.logIn.clientMutationId).toEqual(
        clientMutationId
      );
    });

    it('should log out with clientMutationId', async () => {
      const clientMutationId = uuidv4();

      const user = new Parse.User();
      user.setUsername('user1');
      user.setPassword('user1');
      await user.signUp();
      const sessionToken = user.getSessionToken();

      const logOut = await apolloClient.mutate({
        mutation: gql`
          mutation LogOutUser($input: LogOutInput!) {
            users {
              logOut(input: $input) {
                result
                clientMutationId
              }
            }
          }
        `,
        variables: {
          input: {
            clientMutationId,
          },
        },
        context: {
          headers: {
            'X-Parse-Session-Token': sessionToken,
          },
        },
      });

      expect(logOut.data.users.logOut.result).toBeTruthy();
      expect(logOut.data.users.logOut.clientMutationId).toEqual(
        clientMutationId
      );
      await expectAsync(Parse.User.me({ sessionToken })).toBeRejectedWith(
        new Error('Invalid session token')
      );
    });
  });
});
