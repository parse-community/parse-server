import { GraphQLNonNull, GraphQLID } from 'graphql';
import * as rest from '../../rest';

const load = (parseGraphQLSchema, parseClass) => {
  const className = parseClass.className;

  const getGraphQLQueryName = `get${className}`;
  parseGraphQLSchema.graphQLQueries[getGraphQLQueryName] = {
    description: `The ${getGraphQLQueryName} query can be used to get an object of the ${className} class by its id.`,
    args: {
      objectId: {
        description: 'The objectId that will be used to get the object.',
        type: new GraphQLNonNull(GraphQLID),
      },
    },
    type: new GraphQLNonNull(
      parseGraphQLSchema.parseClassTypes[className].classGraphQLType
    ),
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
};

export { load };
