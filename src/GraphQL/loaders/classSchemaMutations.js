import { GraphQLNonNull } from 'graphql';
import * as classSchemaTypes from './classSchemaTypes';

const load = parseGraphQLSchema => {
  parseGraphQLSchema.addGraphQLMutation(
    'createClass',
    {
      description:
        'The createClass mutation can be used to create the schema for a new object class.',
      args: {
        name: classSchemaTypes.CLASS_NAME_ATT,
        schemaFields: {
          description: "These are the schema's fields of the object class.",
          type: classSchemaTypes.SCHEMA_FIELDS_INPUT,
        },
      },
      type: new GraphQLNonNull(classSchemaTypes.CLASS),
      resolve: () => ({}),
    },
    true,
    true
  );
};

export { load };
