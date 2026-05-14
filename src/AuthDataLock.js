// Apply optimistic locking for authData provider field changes. For each lockable
// top-level field in the original authData whose value differs from the incoming
// value, add an equality constraint for the original value to the update WHERE
// clause. Concurrent requests racing the same single-use token will only allow the
// first update to match; subsequent updates miss and surface as OBJECT_NOT_FOUND.
//
// Only fields whose values round-trip cleanly through both storage adapters are
// locked: primitives (string, number, boolean) and arrays. Date values and nested
// objects are skipped because their JSON representation differs between the
// MongoDB and Postgres adapters, and because Parse Server's query-key validator
// rejects deeper paths containing characters like `+` (e.g. phone-number keys).
// Locking the consumed single-use credential (the MFA token string or the
// recovery-code array) is sufficient — its removal invalidates the WHERE clause
// for concurrent writers.
export function applyAuthDataOptimisticLock(query, originalAuthData, newAuthData) {
  if (!originalAuthData) {
    return;
  }
  for (const provider of Object.keys(newAuthData)) {
    const original = originalAuthData[provider];
    if (!original || typeof original !== 'object') {
      continue;
    }
    for (const [field, value] of Object.entries(original)) {
      if (!isLockableAuthDataValue(value)) {
        continue;
      }
      if (JSON.stringify(value) !== JSON.stringify(newAuthData[provider]?.[field])) {
        query[`authData.${provider}.${field}`] = value;
      }
    }
  }
}

function isLockableAuthDataValue(value) {
  if (value === null || value === undefined) {
    return false;
  }
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') {
    return true;
  }
  if (Array.isArray(value)) {
    return true;
  }
  return false;
}
