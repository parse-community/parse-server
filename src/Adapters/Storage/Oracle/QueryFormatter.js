/**
 * Converts pg-promise style queries to Oracle bind variable format.
 * pg-promise uses $1, $2, etc. with modifiers like :name, :raw
 * Oracle uses :1, :2, etc. for positional or :name for named parameters
 *
 * @param {string} query - SQL query with pg-promise parameters ($1, $2:name, $3:raw)
 * @param {Array} params - Array of parameter values
 * @returns {Object} Object with formatted query and Oracle bind parameters
 * @example
 * formatQuery('SELECT * FROM $1:name WHERE id = $2', ['users', 123])
 * // Returns: { query: 'SELECT * FROM "users" WHERE id = :1', params: [123] }
 */
function formatQuery(query, params) {
  if (!params || params.length === 0) {
    return { query, params: [] };
  }

  // Convert pg-promise style $1, $2 to Oracle :1, :2
  // Handle :name modifier (column/table names)
  // Handle :raw modifier (raw SQL)
  let formattedQuery = query;
  const oracleParams = [];
  let paramIndex = 1;

  // Pattern to match $N:modifier or $N
  const paramPattern = /\$(\d+)(?::(name|raw|value))?/g;
  const matches = [];
  let match;

  // Collect all parameter references
  while ((match = paramPattern.exec(query)) !== null) {
    matches.push({
      full: match[0],
      index: parseInt(match[1]),
      modifier: match[2] || 'value',
      position: match.index,
    });
  }

  // Sort by position in reverse to replace from end to start
  matches.sort((a, b) => b.position - a.position);

  for (const m of matches) {
    const paramValue = params[m.index - 1];
    let replacement;

    if (m.modifier === 'name') {
      // Column/table name - need to quote it for Oracle
      replacement = `"${paramValue}"`;
    } else if (m.modifier === 'raw') {
      // Raw SQL - use as-is
      replacement = paramValue;
    } else {
      // Regular parameter - use Oracle bind variable
      replacement = `:${paramIndex}`;
      oracleParams.push(paramValue);
      paramIndex++;
    }

    formattedQuery =
      formattedQuery.substring(0, m.position) +
      replacement +
      formattedQuery.substring(m.position + m.full.length);
  }

  return { query: formattedQuery, params: oracleParams };
}

/**
 * Converts pg-promise style queries to Oracle named parameter format.
 * Uses named bind variables (:name) instead of positional (:1, :2).
 *
 * @param {string} query - SQL query with pg-promise parameters
 * @param {Object} params - Object with named parameter values
 * @returns {Object} Object with formatted query and Oracle named parameters
 */
function formatQueryWithNamedParams(query, params) {
  if (!params || params.length === 0) {
    return { query, params: {} };
  }

  // Convert to named parameters for Oracle
  let formattedQuery = query;
  const oracleParams = {};
  let paramIndex = 1;

  const paramPattern = /\$(\d+)(?::(name|raw|value))?/g;
  const matches = [];
  let match;

  while ((match = paramPattern.exec(query)) !== null) {
    matches.push({
      full: match[0],
      index: parseInt(match[1]),
      modifier: match[2] || 'value',
      position: match.index,
    });
  }

  matches.sort((a, b) => b.position - a.position);

  for (const m of matches) {
    const paramValue = params[m.index - 1];
    let replacement;

    if (m.modifier === 'name') {
      replacement = `"${paramValue}"`;
    } else if (m.modifier === 'raw') {
      replacement = paramValue;
    } else {
      const paramName = `param${paramIndex}`;
      replacement = `:${paramName}`;
      oracleParams[paramName] = paramValue;
      paramIndex++;
    }

    formattedQuery =
      formattedQuery.substring(0, m.position) +
      replacement +
      formattedQuery.substring(m.position + m.full.length);
  }

  return { query: formattedQuery, params: oracleParams };
}

module.exports = {
  formatQuery,
  formatQueryWithNamedParams,
};
