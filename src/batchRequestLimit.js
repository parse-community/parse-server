/**
 * Shared logic for `requestComplexity.batchRequestLimit` (REST batch, GraphQL bulk mutations, etc.).
 * Matches `src/batch.js` behavior: master and maintenance keys bypass the limit.
 */
function getBatchRequestLimit(config) {
  return config?.requestComplexity?.batchRequestLimit ?? -1;
}

function isBatchRequestLimitExceeded(count, config, auth) {
  const batchRequestLimit = getBatchRequestLimit(config);
  return (
    batchRequestLimit > -1 &&
    !auth?.isMaster &&
    !auth?.isMaintenance &&
    count > batchRequestLimit
  );
}

export { getBatchRequestLimit, isBatchRequestLimitExceeded };
