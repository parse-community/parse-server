import { GraphQLNonNull } from 'graphql';
import getFieldNames from 'graphql-list-fields';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import * as objectsQueries from './objectsQueries';

const extractKeysAndInclude = selectedFields => {
  selectedFields = selectedFields.filter(
    field => !field.includes('__typename')
  );
  let keys = undefined;
  let include = undefined;
  if (selectedFields && selectedFields.length > 0) {
    keys = selectedFields.join(',');
    include = selectedFields
      .reduce((fields, field) => {
        fields = fields.slice();
        let pointIndex = field.lastIndexOf('.');
        while (pointIndex > 0) {
          field = field.slice(0, pointIndex);
          if (!fields.includes(field)) {
            fields.push(field);
          }
          pointIndex = field.lastIndexOf('.');
        }
        return fields;
      }, [])
      .join(',');
  }
  return { keys, include };
};

const load = (parseGraphQLSchema, parseClass) => {
  const className = parseClass.className;

  const {
    classGraphQLOutputType,
    classGraphQLConstraintsType,
    classGraphQLFindResultType,
  } = parseGraphQLSchema.parseClassTypes[className];

  const getGraphQLQueryName = `get${className}`;
  parseGraphQLSchema.graphQLObjectsQueries[getGraphQLQueryName] = {
    description: `The ${getGraphQLQueryName} query can be used to get an object of the ${className} class by its id.`,
    args: {
      objectId: defaultGraphQLTypes.OBJECT_ID_ATT,
      readPreference: defaultGraphQLTypes.READ_PREFERENCE_ATT,
      includeReadPreference: defaultGraphQLTypes.INCLUDE_READ_PREFERENCE_ATT,
    },
    type: new GraphQLNonNull(classGraphQLOutputType),
    async resolve(_source, args, context, queryInfo) {
      try {
        const { objectId, readPreference, includeReadPreference } = args;
        const { config, auth, info } = context;
        const selectedFields = getFieldNames(queryInfo);

        const { keys, include } = extractKeysAndInclude(selectedFields);

        return await objectsQueries.getObject(
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

  const findGraphQLQueryName = `find${className}`;
  parseGraphQLSchema.graphQLObjectsQueries[findGraphQLQueryName] = {
    description: `The ${findGraphQLQueryName} query can be used to find objects of the ${className} class.`,
    args: {
      where: {
        description:
          'These are the conditions that the objects need to match in order to be found',
        type: classGraphQLConstraintsType,
      },
      skip: defaultGraphQLTypes.SKIP_ATT,
      limit: defaultGraphQLTypes.LIMIT_ATT,
      readPreference: defaultGraphQLTypes.READ_PREFERENCE_ATT,
      includeReadPreference: defaultGraphQLTypes.INCLUDE_READ_PREFERENCE_ATT,
      subqueryReadPreference: defaultGraphQLTypes.SUBQUERY_READ_PREFERENCE_ATT,
    },
    type: new GraphQLNonNull(classGraphQLFindResultType),
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

        return await objectsQueries.findObjects(
          className,
          where,
          order,
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
          selectedFields.map(field => field.split('.', 1)[0])
        );
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    },
  };
};

export { load };
