const http = require('http');
const express = require('express');
const gql = require('graphql-tag');
const { ApolloClient, InMemoryCache, createHttpLink } = require('@apollo/client/core');
const { ParseServer } = require('../');
const { ParseGraphQLServer } = require('../lib/GraphQL/ParseGraphQLServer');
const Parse = require('parse/node');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

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
      fetch,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Javascript-Key': 'test',
      },
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
      expect(result.data.users).toBeDefined();
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
        expect(error.networkError.result.errors[0].message).toContain('Number of fields selected exceeds maximum allowed');
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
          'X-Parse-Application-Id': 'test',
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
                email
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
          depth: 4,
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
        expect(error.networkError.result.errors[0].message).toContain('Query depth exceeds maximum allowed depth');
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
          'X-Parse-Application-Id': 'test',
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
          'X-Parse-Application-Id': 'test',
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
          fields: 10,
        },
      });

      const query = gql`
        fragment UserFields1 on User {
          objectId
          username
          createdAt
        }

        query {
          users {
            edges {
              node {
                ...UserFields1
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
        fragment UserFields2 on User {
          objectId
          username
          createdAt
          updatedAt
        }

        query {
          users {
            edges {
              node {
                ...UserFields2
              }
            }
          }
        }
      `;

      try {
        await apolloClient.query({ query });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.networkError.result.errors[0].message).toContain('Number of fields selected exceeds maximum allowed');
      }
    });

    it('should handle inline fragments correctly', async () => {
      await reconfigureServer({
        maxGraphQLQueryComplexity: {
          fields: 10,
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

    it('should reject inline fragments exceeding fields limit', async () => {
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
                ... on User {
                  objectId
                  username
                  createdAt
                  updatedAt
                }
              }
            }
          }
        }
      `;

      try {
        await apolloClient.query({ query });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.networkError.result.errors[0].message).toContain('Number of fields selected exceeds maximum allowed');
      }
    });

    it('should reject actual cyclic fragment definitions with GraphQL validation error', async () => {
      await reconfigureServer({
        maxGraphQLQueryComplexity: {
          fields: 10,
        },
      });

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
        const query = gql(queryString);
        await apolloClient.query({ query });
        fail('Should have thrown an error due to cyclic fragments');
      } catch (error) {
        expect(error.networkError?.result?.errors?.[0]?.message).toEqual('Cannot spread fragment "FragmentA" within itself via "FragmentB".');
      }
    });
  });

  describe('Combined depth and fields validation', () => {
    it('should validate both depth and fields limits', async () => {
      await reconfigureServer({
        maxGraphQLQueryComplexity: {
          depth: 4,
          fields: 10,
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
        expect(error.networkError.result.errors[0].message).toContain('Number of fields selected exceeds maximum allowed');
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
                email
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

