import { GraphQLNonNull, GraphQLID } from 'graphql';
import * as rest from '../../rest';

const load = (parseGraphQLSchema, parseClass) => {
  const className = parseClass.className;

  const classGraphQLType =
    parseGraphQLSchema.parseClassTypes[className].classGraphQLType;

  const getGraphQLQueryName = `get${className}`;
  parseGraphQLSchema.graphQLQueries[getGraphQLQueryName] = {
    description: `The ${getGraphQLQueryName} query can be used to get an object of the ${className} class by its id.`,
    args: {
      objectId: {
        description: 'The objectId that will be used to get the object.',
        type: new GraphQLNonNull(GraphQLID),
      },
    },
    type: new GraphQLNonNull(classGraphQLType),
    async resolve(_source, args, context) {
      const { objectId } = args;

      const { config, auth, info } = context;

      return (await rest.get(
        config,
        auth,
        className,
        objectId,
        {},
        info.clientSDK
      )).results[0];
    },
  };

  const findGraphQLQueryName = `find${className}`;
  parseGraphQLSchema.graphQLQueries[findGraphQLQueryName] = {
    description: `The ${findGraphQLQueryName} query can be used to find objects of the ${className} class.`,
    args: {},
    type: new GraphQLNonNull(classGraphQLType),
    async resolve(_source, args, context) {
      const { config, auth, info } = context;

      return (await rest.find(config, auth, className, {}, {}, info.clientSDK))
        .results;
    },
  };
};

export { load };
