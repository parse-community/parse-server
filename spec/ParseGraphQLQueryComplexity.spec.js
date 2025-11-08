const http = require('http');
const express = require('express');
const gql = require('graphql-tag');
const { ApolloClient, InMemoryCache, createHttpLink } = require('@apollo/client/core');
const { ParseServer } = require('../');
const { ParseGraphQLServer } = require('../lib/GraphQL/ParseGraphQLServer');

describe('ParseGraphQL Query Complexity', () => {
  let parseServer;
  let parseGraphQLServer;
  let httpServer;
  let apolloClient;

  async function reconfigureServer(options = {}) {
    if (httpServer) {
      await httpServer.close();
    }
    parseServer = await global.reconfigureServer(options);
    const expressApp = express();
    httpServer = http.createServer(expressApp);
    expressApp.use('/parse', parseServer.app);
    parseGraphQLServer = new ParseGraphQLServer(parseServer, {
      graphQLPath: '/graphql',
      playgroundPath: '/playground',
      subscriptionsPath: '/subscriptions',
    });
    parseGraphQLServer.applyGraphQL(expressApp);
    await new Promise(resolve => httpServer.listen({ port: 13378 }, resolve));

    const httpLink = createHttpLink({
      uri: 'http://localhost:13378/graphql',
      fetch: (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args)),
    });

    apolloClient = new ApolloClient({
      link: httpLink,
      cache: new InMemoryCache(),
      defaultOptions: {
        query: {
          fetchPolicy: 'no-cache',
        },
      },
    });
  }

  afterEach(async () => {
    if (httpServer) {
      await httpServer.close();
    }
  });

  describe('maxGraphQLQueryComplexity.fields', () => {
    it('should allow queries within fields limit', async () => {
      await reconfigureServer({
        maxGraphQLQueryComplexity: {
          fields: 10,
        },
      });

      const createUserMutation = gql`
        mutation {
          createUser(input: { fields: { username: "testuser", password: "password123" } }) {
            user {
              objectId
              username
              createdAt
            }
          }
        }
      `;

      await apolloClient.mutate({ mutation: createUserMutation });

      const query = gql`
        query {
          users {
            edges {
              node {
                objectId
                username
                createdAt
              }
            }
          }
        }
      `;

      const result = await apolloClient.query({ query });
      expect(result.data.users.edges.length).toBeGreaterThan(0);
    });

    it('should reject queries exceeding fields limit', async () => {
      await reconfigureServer({
        maxGraphQLQueryComplexity: {
          fields: 3,
        },
      });

      const query = gql`
        query {
          users {
            edges {
              node {
                objectId
                username
                createdAt
                updatedAt
              }
            }
          }
        }
      `;

      try {
        await apolloClient.query({ query });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toContain('Number of fields selected exceeds maximum allowed');
      }
    });

    it('should allow queries with master key even when exceeding fields limit', async () => {
      await reconfigureServer({
        maxGraphQLQueryComplexity: {
          fields: 3,
        },
      });

      const httpLinkWithMaster = createHttpLink({
        uri: 'http://localhost:13378/graphql',
        fetch: (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args)),
        headers: {
          'X-Parse-Master-Key': 'test',
        },
      });

      const masterClient = new ApolloClient({
        link: httpLinkWithMaster,
        cache: new InMemoryCache(),
      });

      const query = gql`
        query {
          users {
            edges {
              node {
                objectId
                username
                createdAt
                updatedAt
                sessionToken
              }
            }
          }
        }
      `;

      const result = await masterClient.query({ query });
      expect(result.data.users).toBeDefined();
    });
  });

  describe('maxGraphQLQueryComplexity.depth', () => {
    it('should allow queries within depth limit', async () => {
      await reconfigureServer({
        maxGraphQLQueryComplexity: {
          depth: 3,
        },
      });

      // Create test data with relationships
      const createClassMutation = gql`
        mutation {
          createClass(input: { name: "Post", schemaFields: { addStrings: [{ name: "title" }] } }) {
            class {
              name
            }
          }
        }
      `;

      await apolloClient.mutate({
        mutation: createClassMutation,
        context: {
          headers: {
            'X-Parse-Master-Key': 'test',
          },
        },
      });

      const query = gql`
        query {
          posts {
            edges {
              node {
                objectId
                title
              }
            }
          }
        }
      `;

      const result = await apolloClient.query({ query });
      expect(result.data.posts).toBeDefined();
    });

    it('should reject queries exceeding depth limit', async () => {
      await reconfigureServer({
        maxGraphQLQueryComplexity: {
          depth: 2,
        },
      });

      const query = gql`
        query {
          users {
            edges {
              node {
                objectId
                username
              }
            }
          }
        }
      `;

      try {
        await apolloClient.query({ query });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toContain('Query depth exceeds maximum allowed depth');
      }
    });

    it('should allow queries with master key even when exceeding depth limit', async () => {
      await reconfigureServer({
        maxGraphQLQueryComplexity: {
          depth: 2,
        },
      });

      const httpLinkWithMaster = createHttpLink({
        uri: 'http://localhost:13378/graphql',
        fetch: (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args)),
        headers: {
          'X-Parse-Master-Key': 'test',
        },
      });

      const masterClient = new ApolloClient({
        link: httpLinkWithMaster,
        cache: new InMemoryCache(),
      });

      const query = gql`
        query {
          users {
            edges {
              node {
                objectId
                username
                createdAt
              }
            }
          }
        }
      `;

      const result = await masterClient.query({ query });
      expect(result.data.users).toBeDefined();
    });

    it('should allow queries with maintenance key even when exceeding depth limit', async () => {
      await reconfigureServer({
        maintenanceKey: 'maintenanceKey123',
        maxGraphQLQueryComplexity: {
          depth: 2,
        },
      });

      const httpLinkWithMaintenance = createHttpLink({
        uri: 'http://localhost:13378/graphql',
        fetch: (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args)),
        headers: {
          'X-Parse-Maintenance-Key': 'maintenanceKey123',
        },
      });

      const maintenanceClient = new ApolloClient({
        link: httpLinkWithMaintenance,
        cache: new InMemoryCache(),
      });

      const query = gql`
        query {
          users {
            edges {
              node {
                objectId
                username
                createdAt
              }
            }
          }
        }
      `;

      const result = await maintenanceClient.query({ query });
      expect(result.data.users).toBeDefined();
    });
  });

  describe('Fragment handling', () => {
    it('should count fields in fragments correctly', async () => {
      await reconfigureServer({
        maxGraphQLQueryComplexity: {
          fields: 5,
        },
      });

      const query = gql`
        fragment UserFields on User {
          objectId
          username
          createdAt
        }

        query {
          users {
            edges {
              node {
                ...UserFields
              }
            }
          }
        }
      `;

      const result = await apolloClient.query({ query });
      expect(result.data.users).toBeDefined();
    });

    it('should reject queries with fragments exceeding fields limit', async () => {
      await reconfigureServer({
        maxGraphQLQueryComplexity: {
          fields: 3,
        },
      });

      const query = gql`
        fragment UserFields on User {
          objectId
          username
          createdAt
          updatedAt
        }

        query {
          users {
            edges {
              node {
                ...UserFields
              }
            }
          }
        }
      `;

      try {
        await apolloClient.query({ query });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toContain('Number of fields selected exceeds maximum allowed');
      }
    });

    it('should handle inline fragments correctly', async () => {
      await reconfigureServer({
        maxGraphQLQueryComplexity: {
          fields: 5,
        },
      });

      const query = gql`
        query {
          users {
            edges {
              node {
                ... on User {
                  objectId
                  username
                  createdAt
                }
              }
            }
          }
        }
      `;

      const result = await apolloClient.query({ query });
      expect(result.data.users).toBeDefined();
    });

    it('should handle cyclic fragment references (GraphQL validation prevents actual cycles)', async () => {
      await reconfigureServer({
        maxGraphQLQueryComplexity: {
          fields: 10,
        },
      });

      // Note: GraphQL's NoFragmentCycles validation rule prevents actual cycles
      // This test verifies that our complexity calculation doesn't break when
      // fragments reference each other (as long as there's no actual cycle)
      const query = gql`
        fragment UserBasicInfo on User {
          objectId
          username
        }

        fragment UserDetailedInfo on User {
          ...UserBasicInfo
          createdAt
          updatedAt
        }

        query {
          users {
            edges {
              node {
                ...UserDetailedInfo
              }
            }
          }
        }
      `;

      const result = await apolloClient.query({ query });
      expect(result.data.users).toBeDefined();
    });

    it('should reject actual cyclic fragment definitions with GraphQL validation error', async () => {
      await reconfigureServer({
        maxGraphQLQueryComplexity: {
          fields: 10,
        },
      });

      // This will fail at GraphQL parsing/validation level before our complexity check
      // because GraphQL has built-in NoFragmentCycles rule
      const queryString = `
        fragment FragmentA on User {
          objectId
          ...FragmentB
        }

        fragment FragmentB on User {
          username
          ...FragmentA
        }

        query {
          users {
            edges {
              node {
                ...FragmentA
              }
            }
          }
        }
      `;

      try {
        // Try to parse the query with cyclic fragments
        const query = gql(queryString);
        await apolloClient.query({ query });
        fail('Should have thrown an error due to cyclic fragments');
      } catch (error) {
        // GraphQL validation should catch this before complexity calculation
        expect(error.message).toMatch(/cycle|Cannot spread fragment/i);
      }
    });
  });

  describe('Combined depth and fields validation', () => {
    it('should validate both depth and fields limits', async () => {
      await reconfigureServer({
        maxGraphQLQueryComplexity: {
          depth: 3,
          fields: 5,
        },
      });

      const query = gql`
        query {
          users {
            edges {
              node {
                objectId
                username
              }
            }
          }
        }
      `;

      const result = await apolloClient.query({ query });
      expect(result.data.users).toBeDefined();
    });

    it('should reject if either depth or fields exceeds limit', async () => {
      await reconfigureServer({
        maxGraphQLQueryComplexity: {
          depth: 10,
          fields: 2,
        },
      });

      const query = gql`
        query {
          users {
            edges {
              node {
                objectId
                username
                createdAt
              }
            }
          }
        }
      `;

      try {
        await apolloClient.query({ query });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toContain('Number of fields selected exceeds maximum allowed');
      }
    });
  });

  describe('No complexity limits configured', () => {
    it('should allow complex queries when no limits are set', async () => {
      await reconfigureServer({});

      const query = gql`
        query {
          users {
            edges {
              node {
                objectId
                username
                createdAt
                updatedAt
                sessionToken
                authData
                ACL
              }
            }
          }
        }
      `;

      const result = await apolloClient.query({ query });
      expect(result.data.users).toBeDefined();
    });
  });
});

