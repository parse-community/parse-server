import {
  GraphQLNonNull,
  GraphQLInputObjectType,
  GraphQLList,
  GraphQLBoolean,
  GraphQLString,
} from 'graphql';
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
          type: parseGraphQLSchema.addGraphQLType(
            new GraphQLInputObjectType({
              name: 'CreateClassSchemaInput',
              description: `The CreateClassSchemaInput type is used to specify the schema for a new object class to be created.`,
              fields: {
                addStringFields: {
                  description:
                    'These are the String fields to be added to the class schema.',
                  type: new GraphQLList(
                    new GraphQLNonNull(
                      classSchemaTypes.SCHEMA_STRING_FIELD_INPUT
                    )
                  ),
                },
                addNumberFields: {
                  description:
                    'These are the Number fields to be added to the class schema.',
                  type: new GraphQLList(
                    new GraphQLNonNull(
                      classSchemaTypes.SCHEMA_NUMBER_FIELD_INPUT
                    )
                  ),
                },
                addBooleanFields: {
                  description:
                    'These are the Boolean fields to be added to the class schema.',
                  type: new GraphQLList(
                    new GraphQLNonNull(
                      classSchemaTypes.SCHEMA_BOOLEAN_FIELD_INPUT
                    )
                  ),
                },
                addArrayFields: {
                  description:
                    'These are the Array fields to be added to the class schema.',
                  type: new GraphQLList(
                    new GraphQLNonNull(
                      classSchemaTypes.SCHEMA_ARRAY_FIELD_INPUT
                    )
                  ),
                },
                addObjectFields: {
                  description:
                    'These are the Object fields to be added to the class schema.',
                  type: new GraphQLList(
                    new GraphQLNonNull(
                      classSchemaTypes.SCHEMA_OBJECT_FIELD_INPUT
                    )
                  ),
                },
                addDateFields: {
                  description:
                    'These are the Date fields to be added to the class schema.',
                  type: new GraphQLList(
                    new GraphQLNonNull(classSchemaTypes.SCHEMA_DATE_FIELD_INPUT)
                  ),
                },
                addFileFields: {
                  description:
                    'These are the File fields to be added to the class schema.',
                  type: new GraphQLList(
                    new GraphQLNonNull(classSchemaTypes.SCHEMA_FILE_FIELD_INPUT)
                  ),
                },
                addGeoPointFields: {
                  description:
                    'These are the Geo Point fields to be added to the class schema.',
                  type: new GraphQLList(
                    new GraphQLNonNull(
                      classSchemaTypes.SCHEMA_GEO_POINT_FIELD_INPUT
                    )
                  ),
                },
                addPolygonFields: {
                  description:
                    'These are the Polygon fields to be added to the class schema.',
                  type: new GraphQLList(
                    new GraphQLNonNull(
                      classSchemaTypes.SCHEMA_POLYGON_FIELD_INPUT
                    )
                  ),
                },
                addBytesFields: {
                  description:
                    'These are the Bytes fields to be added to the class schema.',
                  type: new GraphQLList(
                    new GraphQLNonNull(
                      classSchemaTypes.SCHEMA_BYTES_FIELD_INPUT
                    )
                  ),
                },
              },
            }),
            true,
            true
          ),
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
