import Parse from 'parse/node';
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
  skip,
  limit,
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
  transformQueryInputToParse(where, fields);

  const options = {};

  if (selectedFields.includes('results')) {
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

  if (selectedFields.includes('count')) {
    options.count = true;
  }

  if (readPreference) {
    options.readPreference = readPreference;
  }
  if (Object.keys(where).length > 0 && subqueryReadPreference) {
    options.subqueryReadPreference = subqueryReadPreference;
  }

  return await rest.find(
    config,
    auth,
    className,
    where,
    options,
    info.clientSDK
  );
};

export { getObject, findObjects };
