import { GraphQLNonNull, GraphQLInputObjectType, GraphQLList } from 'graphql';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import * as schemaTypes from './schemaTypes';

const load = parseGraphQLSchema => {
  parseGraphQLSchema.addGraphQLMutation('createClass', {
    description:
      'The createClass mutation can be used to create the schema for a new object class.',
    args: {
      className: defaultGraphQLTypes.CLASS_NAME_ATT,
      schema: {
        description: 'This is the schema for the class',
        type: parseGraphQLSchema.addGraphQLType(
          new GraphQLInputObjectType({
            name: 'CreateClassSchemaInput',
            description: `The CreateClassSchemaInput type is used to specify the schema for a new object class to be created.`,
            fields: {
              stringFields: {
                description:
                  'These are the String fields to be added to the new class',
                type: new GraphQLList(
                  new GraphQLNonNull(schemaTypes.SCHEMA_STRING_FIELD_INPUT)
                ),
              },
            },
          }),
          true,
          true
        ),
      },
    },
  });
};

export { load };
