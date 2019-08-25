import { GraphQLNonNull, GraphQLBoolean, GraphQLString } from 'graphql';
import * as classSchemaTypes from './classSchemaTypes';

const load = parseGraphQLSchema => {
  parseGraphQLSchema.addGraphQLMutation(
    'createClass',
    {
      description:
        'The createClass mutation can be used to create the schema for a new object class.',
      args: {
        name: {
          description: 'This is the name of the object class.',
          type: new GraphQLNonNull(GraphQLString),
        },
        schema: {
          description: 'This is the schema of the object class.',
          type: classSchemaTypes.SCHEMA_INPUT,
        },
      },
      type: new GraphQLNonNull(GraphQLBoolean),
      resolve: () => true,
    },
    true,
    true
  );
};

export { load };
