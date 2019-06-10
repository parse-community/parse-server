import {
  GraphQLNonNull,
  GraphQLBoolean,
  GraphQLString,
  GraphQLObjectType,
} from 'graphql';
import getFieldNames from 'graphql-list-fields';
import Parse from 'parse/node';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import rest from '../../rest';

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

const parseMap = {
  _or: '$or',
  _and: '$and',
  _nor: '$nor',
  _relatedTo: '$relatedTo',
  _eq: '$eq',
  _ne: '$ne',
  _lt: '$lt',
  _lte: '$lte',
  _gt: '$gt',
  _gte: '$gte',
  _in: '$in',
  _nin: '$nin',
  _exists: '$exists',
  _select: '$select',
  _dontSelect: '$dontSelect',
  _inQuery: '$inQuery',
  _notInQuery: '$notInQuery',
  _containedBy: '$containedBy',
  _all: '$all',
  _regex: '$regex',
  _options: '$options',
  _text: '$text',
  _search: '$search',
  _term: '$term',
  _language: '$language',
  _caseSensitive: '$caseSensitive',
  _diacriticSensitive: '$diacriticSensitive',
  _nearSphere: '$nearSphere',
  _maxDistance: '$maxDistance',
  _maxDistanceInRadians: '$maxDistanceInRadians',
  _maxDistanceInMiles: '$maxDistanceInMiles',
  _maxDistanceInKilometers: '$maxDistanceInKilometers',
  _within: '$within',
  _box: '$box',
  _geoWithin: '$geoWithin',
  _polygon: '$polygon',
  _centerSphere: '$centerSphere',
  _geoIntersects: '$geoIntersects',
  _point: '$point',
};

const transformToParse = constraints => {
  if (!constraints || typeof constraints !== 'object') {
    return;
  }
  Object.keys(constraints).forEach(fieldName => {
    let fieldValue = constraints[fieldName];
    if (parseMap[fieldName]) {
      delete constraints[fieldName];
      fieldName = parseMap[fieldName];
      constraints[fieldName] = fieldValue;
    }
    switch (fieldName) {
      case '$point':
      case '$nearSphere':
        if (typeof fieldValue === 'object' && !fieldValue.__type) {
          fieldValue.__type = 'GeoPoint';
        }
        break;
      case '$box':
        if (
          typeof fieldValue === 'object' &&
          fieldValue.bottomLeft &&
          fieldValue.upperRight
        ) {
          fieldValue = [
            {
              __type: 'GeoPoint',
              ...fieldValue.bottomLeft,
            },
            {
              __type: 'GeoPoint',
              ...fieldValue.upperRight,
            },
          ];
          constraints[fieldName] = fieldValue;
        }
        break;
      case '$polygon':
        if (fieldValue instanceof Array) {
          fieldValue.forEach(geoPoint => {
            if (typeof geoPoint === 'object' && !geoPoint.__type) {
              geoPoint.__type = 'GeoPoint';
            }
          });
        }
        break;
      case '$centerSphere':
        if (
          typeof fieldValue === 'object' &&
          fieldValue.center &&
          fieldValue.distance
        ) {
          fieldValue = [
            {
              __type: 'GeoPoint',
              ...fieldValue.center,
            },
            fieldValue.distance,
          ];
          constraints[fieldName] = fieldValue;
        }
        break;
    }
    if (typeof fieldValue === 'object') {
      transformToParse(fieldValue);
    }
  });
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

  transformToParse(where);

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
  parseGraphQLSchema.graphQLObjectsQueries.get = {
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
  };

  parseGraphQLSchema.graphQLObjectsQueries.find = {
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
      subqueryReadPreference: defaultGraphQLTypes.SUBQUERY_READ_PREFERENCE_ATT,
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
  };

  const objectsQuery = new GraphQLObjectType({
    name: 'ObjectsQuery',
    description: 'ObjectsQuery is the top level type for objects queries.',
    fields: parseGraphQLSchema.graphQLObjectsQueries,
  });
  parseGraphQLSchema.graphQLTypes.push(objectsQuery);

  parseGraphQLSchema.graphQLQueries.objects = {
    description: 'This is the top level for objects queries.',
    type: objectsQuery,
    resolve: () => new Object(),
  };
};

export { getObject, findObjects, load };
