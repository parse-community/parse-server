/**
 * Generate a hash from a query, with unique fields for columns, values, order,
 * skip, and limit.
 */
export function queryHash(query: any): string;
/**
 * matchesQuery -- Determines if an object would be returned by a Parse Query
 * It's a lightweight, where-clause only implementation of a full query engine.
 * Since we find queries that match objects, rather than objects that match
 * queries, we can avoid building a full-blown query tool.
 */
export function matchesQuery(object: any, query: any): any;
