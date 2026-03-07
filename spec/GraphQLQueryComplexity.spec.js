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

  function buildDeepQuery(depth) {
    let query = '{ users { edges { node {';
    let closing = '';
    // Each 'users' nesting adds depth through edges > node
    // Start at depth 4 for the base: users > edges > node > objectId
    // We add more depth by nesting pointer fields won't work easily,
    // so instead we build depth with repeated nested field selections
    for (let i = 0; i < depth; i++) {
      query += ` f${i} {`;
      closing += ' }';
    }
    query += ' objectId' + closing + ' } } } }';
    return query;
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
      // Depth: users(1) > edges(2) > node(3) > objectId(4) = depth 4
      const result = await graphqlRequest('{ users { edges { node { objectId } } } }');
      expect(result.errors).toBeDefined();
      expect(result.errors[0].message).toMatch(
        /GraphQL query depth of \d+ exceeds maximum allowed depth of 3/
      );
    });

    it('should allow query within depth limit', async () => {
      await setupGraphQL({
        requestComplexity: { graphQLDepth: 10 },
      });
      const result = await graphqlRequest('{ users { edges { node { objectId } } } }');
      expect(result.errors).toBeUndefined();
    });

    it('should allow deep query with master key', async () => {
      await setupGraphQL({
        requestComplexity: { graphQLDepth: 3 },
      });
      const result = await graphqlRequest('{ users { edges { node { objectId } } } }', {
        ...headers,
        'X-Parse-Master-Key': 'test',
      });
      expect(result.errors).toBeUndefined();
    });

    it('should allow unlimited depth when graphQLDepth is -1', async () => {
      await setupGraphQL({
        requestComplexity: { graphQLDepth: -1 },
      });
      const result = await graphqlRequest('{ users { edges { node { objectId } } } }');
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
      const result = await graphqlRequest('{ users { edges { node { objectId } } } }');
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

    it('should allow unlimited fields when graphQLFields is -1', async () => {
      await setupGraphQL({
        requestComplexity: { graphQLFields: -1 },
      });
      const result = await graphqlRequest(buildWideQuery(50));
      expect(result.errors).toBeUndefined();
    });
  });
});
