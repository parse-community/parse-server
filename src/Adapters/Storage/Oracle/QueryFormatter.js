// Query formatter to convert pg-promise style queries to Oracle format
// pg-promise uses $1, $2, etc. with modifiers like :name, :raw
// Oracle uses :1, :2, etc. for positional or :name for named parameters

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
