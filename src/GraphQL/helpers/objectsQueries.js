import Parse from 'parse/node';
import { offsetToCursor, cursorToOffset } from 'graphql-relay';
import rest from '../../rest';
import { transformQueryInputToParse } from '../transformers/query';

const getObject = async (
  className,
  objectId,
  keys,
  include,
  readPreference,
  includeReadPreference,
  config,
  auth,
  info
) => {
  const options = {};
  if (keys) {
    options.keys = keys;
  }
  if (include) {
    options.include = include;
    if (includeReadPreference) {
      options.includeReadPreference = includeReadPreference;
    }
  }
  if (readPreference) {
    options.readPreference = readPreference;
  }

  const response = await rest.get(
    config,
    auth,
    className,
    objectId,
    options,
    info.clientSDK
  );

  if (!response.results || response.results.length == 0) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
  }

  const object = response.results[0];
  if (className === '_User') {
    delete object.sessionToken;
  }
  return object;
};

const findObjects = async (
  className,
  where,
  order,
  skipInput,
  first,
  after,
  last,
  before,
  keys,
  include,
  includeAll,
  readPreference,
  includeReadPreference,
  subqueryReadPreference,
  config,
  auth,
  info,
  selectedFields,
  fields
) => {
  if (!where) {
    where = {};
  }
  transformQueryInputToParse(where, fields, className);

  const skipAndLimitCalculation = calculateSkipAndLimit(
    skipInput,
    first,
    after,
    last,
    before,
    config.maxLimit
  );
  let { skip } = skipAndLimitCalculation;
  const { limit, needToPreCount } = skipAndLimitCalculation;
  let preCount = undefined;
  if (needToPreCount) {
    const preCountOptions = {
      limit: 0,
      count: true,
    };
    if (readPreference) {
      preCountOptions.readPreference = readPreference;
    }
    if (Object.keys(where).length > 0 && subqueryReadPreference) {
      preCountOptions.subqueryReadPreference = subqueryReadPreference;
    }
    preCount = (await rest.find(
      config,
      auth,
      className,
      where,
      preCountOptions,
      info.clientSDK
    )).count;
    if ((skip || 0) + limit < preCount) {
      skip = preCount - limit;
    }
  }

  const options = {};

  if (
    selectedFields.find(
      field => field.startsWith('edges.') || field.startsWith('pageInfo.')
    )
  ) {
    if (limit || limit === 0) {
      options.limit = limit;
    }
    if (options.limit !== 0) {
      if (order) {
        options.order = order;
      }
      if (skip) {
        options.skip = skip;
      }
      if (config.maxLimit && options.limit > config.maxLimit) {
        // Silently replace the limit on the query with the max configured
        options.limit = config.maxLimit;
      }
      if (keys) {
        options.keys = keys;
      }
      if (includeAll === true) {
        options.includeAll = includeAll;
      }
      if (!options.includeAll && include) {
        options.include = include;
      }
      if ((options.includeAll || options.include) && includeReadPreference) {
        options.includeReadPreference = includeReadPreference;
      }
    }
  } else {
    options.limit = 0;
  }

  if (
    (selectedFields.includes('count') ||
      selectedFields.includes('pageInfo.hasPreviousPage') ||
      selectedFields.includes('pageInfo.hasNextPage')) &&
    !needToPreCount
  ) {
    options.count = true;
  }

  if (readPreference) {
    options.readPreference = readPreference;
  }
  if (Object.keys(where).length > 0 && subqueryReadPreference) {
    options.subqueryReadPreference = subqueryReadPreference;
  }

  let results, count;
  if (options.count || !options.limit || (options.limit && options.limit > 0)) {
    const findResult = await rest.find(
      config,
      auth,
      className,
      where,
      options,
      info.clientSDK
    );
    results = findResult.results;
    count = findResult.count;
  }

  let edges = null;
  let pageInfo = null;
  if (results) {
    edges = results.map((result, index) => ({
      cursor: offsetToCursor((skip || 0) + index),
      node: result,
    }));

    pageInfo = {
      hasPreviousPage:
        ((preCount && preCount > 0) || (count && count > 0)) &&
        skip !== undefined &&
        skip > 0,
      startCursor: offsetToCursor(skip || 0),
      endCursor: offsetToCursor((skip || 0) + (results.length || 1) - 1),
      hasNextPage: (preCount || count) > (skip || 0) + results.length,
    };
  }

  return {
    edges,
    pageInfo,
    count: preCount || count,
  };
};

const calculateSkipAndLimit = (
  skipInput,
  first,
  after,
  last,
  before,
  maxLimit
) => {
  let skip = undefined;
  let limit = undefined;
  let needToPreCount = false;
  if (skipInput || skipInput === 0) {
    if (skipInput < 0) {
      throw new Parse.Error(
        Parse.Error.INVALID_QUERY,
        'Skip should be a positive number'
      );
    }
    skip = skipInput;
  }
  if (after) {
    after = cursorToOffset(after);
    if ((!after && after !== 0) || after < 0) {
      throw new Parse.Error(
        Parse.Error.INVALID_QUERY,
        'After is not a valid cursor'
      );
    }
    skip = (skip || 0) + (after + 1);
  }
  if (first || first === 0) {
    if (first < 0) {
      throw new Parse.Error(
        Parse.Error.INVALID_QUERY,
        'First should be a positive number'
      );
    }
    limit = first;
  }
  if (before || before === 0) {
    before = cursorToOffset(before);
    if ((!before && before !== 0) || before < 0) {
      throw new Parse.Error(
        Parse.Error.INVALID_QUERY,
        'Before is not a valid cursor'
      );
    }
    if ((skip || 0) >= before) {
      limit = 0;
    } else if ((!limit && limit !== 0) || (skip || 0) + limit > before) {
      limit = before - (skip || 0);
    }
  }
  if (last || last === 0) {
    if (last < 0) {
      throw new Parse.Error(
        Parse.Error.INVALID_QUERY,
        'Last should be a positive number'
      );
    }
    if (last > maxLimit) {
      last = maxLimit;
    }
    if (limit || limit === 0) {
      if (last < limit) {
        skip = (skip || 0) + (limit - last);
        limit = last;
      }
    } else if (last === 0) {
      limit = 0;
    } else {
      limit = last;
      needToPreCount = true;
    }
  }
  return {
    skip,
    limit,
    needToPreCount,
  };
};

export { getObject, findObjects, calculateSkipAndLimit };
