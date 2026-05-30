// QueryAdapter — the single boundary between parse-server's internal,
// SDK-agnostic query format and the Parse JS SDK's `Parse.Query`.
//
// parse-server represents a query internally as plain JSON
// (`{ className, where, ...restOptions }`). Cloud Code triggers
// (`beforeFind`, `afterFind`, `beforeSubscribe`), however, are a public
// contract that hands the handler a real `Parse.Query` instance and may
// receive a modified one back. This module is the only place in `src/` that
// constructs or inspects a `Parse.Query`, so the rest of the codebase stays
// free of a direct SDK dependency on the query type. Towards #8787.

import Parse from 'parse/node';

// Fields that `Parse.Query#toJSON()` may surface and that map onto
// parse-server's `restOptions`. `where` is handled separately as `restWhere`.
const REST_OPTION_KEYS = [
  'limit',
  'skip',
  'include',
  'excludeKeys',
  'explain',
  'keys',
  'order',
  'hint',
  'comment',
];

// Build a `Parse.Query` from parse-server's internal format so it can be
// handed to a Cloud Code trigger. `json` is `{ where, ...restOptions }`;
// omit it to produce an empty query for the class.
export function inflateQuery(className, json) {
  const query = new Parse.Query(className);
  if (json) {
    query.withJSON(json);
  }
  return query;
}

// Convert a `Parse.Query` (typically one a trigger returned or mutated) back
// into parse-server's internal JSON format.
export function deflateQuery(query) {
  return query.toJSON();
}

// Whether a value is a `Parse.Query` instance. Used where a trigger may return
// either a modified query or some other value.
export function isQuery(value) {
  return value instanceof Parse.Query;
}

// Merge the JSON of a (possibly trigger-modified) `Parse.Query` onto existing
// `restWhere` / `restOptions`, preserving the field-by-field override semantics
// the `beforeFind` trigger has always used.
export function applyQueryToRest(query, restWhere, restOptions) {
  const jsonQuery = deflateQuery(query);
  if (jsonQuery.where) {
    restWhere = jsonQuery.where;
  }
  for (const key of REST_OPTION_KEYS) {
    if (jsonQuery[key]) {
      restOptions = restOptions || {};
      restOptions[key] = jsonQuery[key];
    }
  }
  return { restWhere, restOptions };
}

export default { inflateQuery, deflateQuery, isQuery, applyQueryToRest };
