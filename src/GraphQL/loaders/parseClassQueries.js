import { GraphQLNonNull } from 'graphql';
import getFieldNames from 'graphql-list-fields';
import * as rest from '../../rest';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import * as objectsQueries from './objectsQueries';

const load = (parseGraphQLSchema, parseClass) => {
  const className = parseClass.className;

  const classGraphQLOutputType =
    parseGraphQLSchema.parseClassTypes[className].classGraphQLOutputType;

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
    args: {},
    type: new GraphQLNonNull(classGraphQLOutputType),
    async resolve(_source, _args, context) {
      const { config, auth, info } = context;

      return (await rest.find(config, auth, className, {}, {}, info.clientSDK))
        .results;
    },
  };
};

export { load };
