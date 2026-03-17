import { z } from 'zod';
import { option } from '../schemaUtils';

/** A positive integer or -1 to disable. */
const complexityLimit = z.number().int().refine(
  v => v === -1 || v >= 1,
  { message: 'Must be a positive integer or -1 to disable.' }
);

export const RequestComplexityOptionsSchema = z
  .object({
    graphQLDepth: option(complexityLimit.default(-1), {
      env: 'PARSE_SERVER_REQUEST_COMPLEXITY_GRAPHQL_DEPTH',
      help: 'Maximum allowed nesting depth for GraphQL queries. Set to -1 to disable.',
    }),
    graphQLFields: option(complexityLimit.default(-1), {
      env: 'PARSE_SERVER_REQUEST_COMPLEXITY_GRAPHQL_FIELDS',
      help: 'Maximum number of fields allowed in a single GraphQL query. Set to -1 to disable.',
    }),
    includeCount: option(complexityLimit.default(-1), {
      env: 'PARSE_SERVER_REQUEST_COMPLEXITY_INCLUDE_COUNT',
      help: 'Maximum number of include pointers allowed in a single query. Set to -1 to disable.',
    }),
    includeDepth: option(complexityLimit.default(-1), {
      env: 'PARSE_SERVER_REQUEST_COMPLEXITY_INCLUDE_DEPTH',
      help: 'Maximum nesting depth of include pointers in a query. Set to -1 to disable.',
    }),
    queryDepth: option(complexityLimit.default(-1), {
      env: 'PARSE_SERVER_REQUEST_COMPLEXITY_QUERY_DEPTH',
      help: 'Maximum depth of nested query constraints. Set to -1 to disable.',
    }),
    subqueryDepth: option(complexityLimit.default(-1), {
      env: 'PARSE_SERVER_REQUEST_COMPLEXITY_SUBQUERY_DEPTH',
      help: 'Maximum depth of nested subqueries (e.g. $inQuery). Set to -1 to disable.',
    }),
  })
  .loose();

export type RequestComplexityOptions = z.infer<typeof RequestComplexityOptionsSchema>;
