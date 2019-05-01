import {
  GraphQLNonNull,
  GraphQLBoolean,
  GraphQLString,
  GraphQLList,
} from 'graphql';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import rest from '../../rest';

const HEALTH = {
  description:
    'The health query can be used to check if the server is up and running.',
  type: new GraphQLNonNull(GraphQLBoolean),
  resolve: () => true,
};

const FIND = {
  description: 'The find query can be used to find objects of a certain class.',
  args: {
    className: {
      description: 'This is the class name of the objects to be found',
      type: new GraphQLNonNull(GraphQLString),
    },
  },
  type: new GraphQLNonNull(new GraphQLList(defaultGraphQLTypes.OBJECT)),
  async resolve(_source, args, context) {
    const { className } = args;

    const { config, auth, info } = context;

    return (await rest.find(config, auth, className, {}, {}, info.clientSDK))
      .results;
  },
};

const load = parseGraphQLSchema => {
  parseGraphQLSchema.graphQLQueries.health = HEALTH;
  parseGraphQLSchema.graphQLQueries.find = FIND;
};

export { load };
