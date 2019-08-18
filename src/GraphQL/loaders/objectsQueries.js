import { GraphQLNonNull, GraphQLBoolean, GraphQLString } from 'graphql';
import getFieldNames from 'graphql-list-fields';
import Parse from 'parse/node';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
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

  if (className === '_User') {
    delete response.results[0].sessionToken;
  }

  return response.results[0];
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
  selectedFields
) => {
  if (!where) {
    where = {};
  }

  transformQueryInputToParse(where);

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

const load = parseGraphQLSchema => {
  parseGraphQLSchema.addGraphQLQuery(
    'get',
    {
      description:
        'The get query can be used to get an object of a certain class by its objectId.',
      args: {
        className: defaultGraphQLTypes.CLASS_NAME_ATT,
        objectId: defaultGraphQLTypes.OBJECT_ID_ATT,
        keys: defaultGraphQLTypes.KEYS_ATT,
        include: defaultGraphQLTypes.INCLUDE_ATT,
        readPreference: defaultGraphQLTypes.READ_PREFERENCE_ATT,
        includeReadPreference: defaultGraphQLTypes.INCLUDE_READ_PREFERENCE_ATT,
      },
      type: new GraphQLNonNull(defaultGraphQLTypes.OBJECT),
      async resolve(_source, args, context) {
        try {
          const {
            className,
            objectId,
            keys,
            include,
            readPreference,
            includeReadPreference,
          } = args;

          const { config, auth, info } = context;

          return await getObject(
            className,
            objectId,
            keys,
            include,
            readPreference,
            includeReadPreference,
            config,
            auth,
            info
          );
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    },
    true,
    true
  );

  parseGraphQLSchema.addGraphQLQuery(
    'find',
    {
      description:
        'The find query can be used to find objects of a certain class.',
      args: {
        className: defaultGraphQLTypes.CLASS_NAME_ATT,
        where: defaultGraphQLTypes.WHERE_ATT,
        order: {
          description:
            'This is the order in which the objects should be returned',
          type: GraphQLString,
        },
        skip: defaultGraphQLTypes.SKIP_ATT,
        limit: defaultGraphQLTypes.LIMIT_ATT,
        keys: defaultGraphQLTypes.KEYS_ATT,
        include: defaultGraphQLTypes.INCLUDE_ATT,
        includeAll: {
          description: 'All pointers will be returned',
          type: GraphQLBoolean,
        },
        readPreference: defaultGraphQLTypes.READ_PREFERENCE_ATT,
        includeReadPreference: defaultGraphQLTypes.INCLUDE_READ_PREFERENCE_ATT,
        subqueryReadPreference:
          defaultGraphQLTypes.SUBQUERY_READ_PREFERENCE_ATT,
      },
      type: new GraphQLNonNull(defaultGraphQLTypes.FIND_RESULT),
      async resolve(_source, args, context, queryInfo) {
        try {
          const {
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
          } = args;

          const { config, auth, info } = context;
          const selectedFields = getFieldNames(queryInfo);

          return await findObjects(
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
            selectedFields
          );
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    },
    true,
    true
  );
};

export { getObject, findObjects, load };
