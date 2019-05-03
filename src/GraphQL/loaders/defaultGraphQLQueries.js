import {
  GraphQLNonNull,
  GraphQLBoolean,
  GraphQLString,
  GraphQLList,
  GraphQLID,
} from 'graphql';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import rest from '../../rest';

const HEALTH = {
  description:
    'The health query can be used to check if the server is up and running.',
  type: new GraphQLNonNull(GraphQLBoolean),
  resolve: () => true,
};

const GET = {
  description:
    'The get query can be used to get an object of a certain class by its objectId.',
  args: {
    className: {
      description: 'This is the class name of the objects to be found',
      type: new GraphQLNonNull(GraphQLString),
    },
    objectId: {
      description: 'The objectId that will be used to get the object.',
      type: new GraphQLNonNull(GraphQLID),
    },
  },
  type: new GraphQLNonNull(defaultGraphQLTypes.OBJECT),
  async resolve(_source, args, context) {
    const { className, objectId } = args;

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
  parseGraphQLSchema.graphQLQueries.get = GET;
  parseGraphQLSchema.graphQLQueries.find = FIND;
};

export { load };
