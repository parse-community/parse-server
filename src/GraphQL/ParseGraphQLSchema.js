import {
  GraphQLSchema,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLBoolean,
} from 'graphql';
import requiredParameter from '../requiredParameter';

class ParseGraphQLSchema {
  constructor(parseServer) {
    this.parseServer =
      parseServer ||
      requiredParameter('You must provide a parseServer instance!');
  }

  make() {
    const types = [];

    const queryFields = {};

    queryFields.health = {
      description:
        'The health query can be used to check if the server is up and running.',
      type: new GraphQLNonNull(GraphQLBoolean),
      resolve: () => true,
    };

    const query = new GraphQLObjectType({
      name: 'Query',
      description: 'Query is the top level type for queries.',
      fields: queryFields,
    });
    types.push(query);

    const mutation = undefined;

    const subscription = undefined;

    return new GraphQLSchema({
      types,
      query,
      mutation,
      subscription,
    });
  }
}

export { ParseGraphQLSchema };
