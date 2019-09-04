import { GraphQLNonNull } from 'graphql';
import getFieldNames from 'graphql-list-fields';
import pluralize from 'pluralize';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import * as objectsQueries from '../helpers/objectsQueries';
import { ParseGraphQLClassConfig } from '../../Controllers/ParseGraphQLController';
import { transformClassNameToGraphQL } from '../transformers/className';
import { extractKeysAndInclude } from '../parseGraphQLUtils';

const getParseClassQueryConfig = function(
  parseClassConfig: ?ParseGraphQLClassConfig
) {
  return (parseClassConfig && parseClassConfig.query) || {};
};

const getQuery = async (className, _source, args, context, queryInfo) => {
  const { id, readPreference, includeReadPreference } = args;
  const { config, auth, info } = context;
  const selectedFields = getFieldNames(queryInfo);

  const { keys, include } = extractKeysAndInclude(selectedFields);

  return await objectsQueries.getObject(
    className,
    id,
    keys,
    include,
    readPreference,
    includeReadPreference,
    config,
    auth,
    info
  );
};

const load = function(
  parseGraphQLSchema,
  parseClass,
  parseClassConfig: ?ParseGraphQLClassConfig
) {
  const className = parseClass.className;
  const graphQLClassName = transformClassNameToGraphQL(className);
  const {
    get: isGetEnabled = true,
    find: isFindEnabled = true,
  } = getParseClassQueryConfig(parseClassConfig);

  const {
    classGraphQLOutputType,
    classGraphQLFindArgs,
    classGraphQLFindResultType,
  } = parseGraphQLSchema.parseClassTypes[className];

  if (isGetEnabled) {
    const getGraphQLQueryName =
      graphQLClassName.charAt(0).toLowerCase() + graphQLClassName.slice(1);
    parseGraphQLSchema.addGraphQLQuery(getGraphQLQueryName, {
      description: `The ${getGraphQLQueryName} query can be used to get an object of the ${graphQLClassName} class by its id.`,
      args: {
        id: defaultGraphQLTypes.OBJECT_ID_ATT,
        readPreference: defaultGraphQLTypes.READ_PREFERENCE_ATT,
        includeReadPreference: defaultGraphQLTypes.INCLUDE_READ_PREFERENCE_ATT,
      },
      type: new GraphQLNonNull(
        classGraphQLOutputType || defaultGraphQLTypes.OBJECT
      ),
      async resolve(_source, args, context, queryInfo) {
        try {
          return await getQuery(className, _source, args, context, queryInfo);
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    });
  }

  if (isFindEnabled) {
    const findGraphQLQueryName = pluralize(
      graphQLClassName.charAt(0).toLowerCase() + graphQLClassName.slice(1)
    );
    parseGraphQLSchema.addGraphQLQuery(findGraphQLQueryName, {
      description: `The ${findGraphQLQueryName} query can be used to find objects of the ${graphQLClassName} class.`,
      args: classGraphQLFindArgs,
      type: new GraphQLNonNull(
        classGraphQLFindResultType || defaultGraphQLTypes.FIND_RESULT
      ),
      async resolve(_source, args, context, queryInfo) {
        try {
          const {
            where,
            order,
            skip,
            limit,
            readPreference,
            includeReadPreference,
            subqueryReadPreference,
          } = args;
          const { config, auth, info } = context;
          const selectedFields = getFieldNames(queryInfo);

          const { keys, include } = extractKeysAndInclude(
            selectedFields
              .filter(field => field.includes('.'))
              .map(field => field.slice(field.indexOf('.') + 1))
          );
          const parseOrder = order && order.join(',');

          return await objectsQueries.findObjects(
            className,
            where,
            parseOrder,
            skip,
            limit,
            keys,
            include,
            false,
            readPreference,
            includeReadPreference,
            subqueryReadPreference,
            config,
            auth,
            info,
            selectedFields.map(field => field.split('.', 1)[0]),
            parseClass.fields
          );
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    });
  }
};

export { load };
