'use strict';

const http = require('http');
const express = require('express');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
require('./helper');
const { ParseGraphQLServer } = require('../lib/GraphQL/ParseGraphQLServer');

describe('graphql query complexity', () => {
  let httpServer;
  let graphQLServer;
  const headers = {
    'X-Parse-Application-Id': 'test',
    'X-Parse-Javascript-Key': 'test',
    'Content-Type': 'application/json',
  };

  async function setupGraphQL(serverOptions = {}) {
    if (httpServer) {
      await new Promise(resolve => httpServer.close(resolve));
    }
    const server = await reconfigureServer(serverOptions);
    const expressApp = express();
    httpServer = http.createServer(expressApp);
    expressApp.use('/parse', server.app);
    graphQLServer = new ParseGraphQLServer(server, {
      graphQLPath: '/graphql',
    });
    graphQLServer.applyGraphQL(expressApp);
    await new Promise(resolve => httpServer.listen({ port: 13378 }, resolve));
  }

  async function graphqlRequest(query, requestHeaders = headers) {
    const response = await fetch('http://localhost:13378/graphql', {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({ query }),
    });
    return response.json();
  }

  // Returns a query with depth 4: users(1) > edges(2) > node(3) > objectId(4)
  function buildDeepQuery() {
    return '{ users { edges { node { objectId } } } }';
  }

  function buildWideQuery(fieldCount) {
    const fields = Array.from({ length: fieldCount }, (_, i) => `field${i}: objectId`).join('\n      ');
    return `{ users { edges { node { ${fields} } } } }`;
  }

  afterEach(async () => {
    if (httpServer) {
      await new Promise(resolve => httpServer.close(resolve));
      httpServer = null;
    }
  });

  describe('depth limit', () => {
    it('should reject query exceeding depth limit', async () => {
      await setupGraphQL({
        requestComplexity: { graphQLDepth: 3 },
      });
      const result = await graphqlRequest(buildDeepQuery());
      expect(result.errors).toBeDefined();
      expect(result.errors[0].message).toMatch(
        /GraphQL query depth of \d+ exceeds maximum allowed depth of 3/
      );
    });

    it('should allow query within depth limit', async () => {
      await setupGraphQL({
        requestComplexity: { graphQLDepth: 10 },
      });
      const result = await graphqlRequest(buildDeepQuery());
      expect(result.errors).toBeUndefined();
    });

    it('should allow deep query with master key', async () => {
      await setupGraphQL({
        requestComplexity: { graphQLDepth: 3 },
      });
      const result = await graphqlRequest(buildDeepQuery(), {
        ...headers,
        'X-Parse-Master-Key': 'test',
      });
      expect(result.errors).toBeUndefined();
    });

    it('should allow unlimited depth when graphQLDepth is -1', async () => {
      await setupGraphQL({
        requestComplexity: { graphQLDepth: -1 },
      });
      const result = await graphqlRequest(buildDeepQuery());
      expect(result.errors).toBeUndefined();
    });
  });

  describe('fields limit', () => {
    it('should reject query exceeding fields limit', async () => {
      await setupGraphQL({
        requestComplexity: { graphQLFields: 5 },
      });
      const result = await graphqlRequest(buildWideQuery(10));
      expect(result.errors).toBeDefined();
      expect(result.errors[0].message).toMatch(
        /Number of GraphQL fields \(\d+\) exceeds maximum allowed \(5\)/
      );
    });

    it('should allow query within fields limit', async () => {
      await setupGraphQL({
        requestComplexity: { graphQLFields: 200 },
      });
      const result = await graphqlRequest(buildDeepQuery());
      expect(result.errors).toBeUndefined();
    });

    it('should allow wide query with master key', async () => {
      await setupGraphQL({
        requestComplexity: { graphQLFields: 5 },
      });
      const result = await graphqlRequest(buildWideQuery(10), {
        ...headers,
        'X-Parse-Master-Key': 'test',
      });
      expect(result.errors).toBeUndefined();
    });

    it('should count fragment fields at each spread location', async () => {
      // With correct counting: 2 aliases (2) + 2×edges (2) + 2×node (2) + 2×objectId from fragment (2) = 8
      // With incorrect counting (fragment once): 2 + 2 + 2 + 1 = 7
      // Set limit to 7 so incorrect counting passes but correct counting rejects
      await setupGraphQL({
        requestComplexity: { graphQLFields: 7 },
      });
      const result = await graphqlRequest(`
        fragment UserFields on User { objectId }
        {
          a1: users { edges { node { ...UserFields } } }
          a2: users { edges { node { ...UserFields } } }
        }
      `);
      expect(result.errors).toBeDefined();
      expect(result.errors[0].message).toMatch(
        /Number of GraphQL fields \(\d+\) exceeds maximum allowed \(7\)/
      );
    });

    it('should count inline fragment fields toward depth and field limits', async () => {
      await setupGraphQL({
        requestComplexity: { graphQLFields: 3 },
      });
      // Inline fragment adds fields without increasing depth:
      // users(1) > edges(2) > ... on UserConnection { edges(3) > node(4) }
      const result = await graphqlRequest(`{
        users {
          edges {
            ... on UserEdge {
              node {
                objectId
              }
            }
          }
        }
      }`);
      expect(result.errors).toBeDefined();
      expect(result.errors[0].message).toMatch(
        /Number of GraphQL fields \(\d+\) exceeds maximum allowed \(3\)/
      );
    });

    it('should allow unlimited fields when graphQLFields is -1', async () => {
      await setupGraphQL({
        requestComplexity: { graphQLFields: -1 },
      });
      const result = await graphqlRequest(buildWideQuery(50));
      expect(result.errors).toBeUndefined();
    });
  });
});
