import {
  GraphQLNonNull,
  GraphQLInputObjectType,
  GraphQLList,
  GraphQLBoolean,
} from 'graphql';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import * as classSchemaTypes from './classSchemaTypes';

const load = parseGraphQLSchema => {
  parseGraphQLSchema.addGraphQLMutation(
    'createClass',
    {
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
                    new GraphQLNonNull(
                      classSchemaTypes.SCHEMA_STRING_FIELD_INPUT
                    )
                  ),
                },
                numberFields: {
                  description:
                    'These are the Number fields to be added to the new class',
                  type: new GraphQLList(
                    new GraphQLNonNull(
                      classSchemaTypes.SCHEMA_NUMBER_FIELD_INPUT
                    )
                  ),
                },
                booleanFields: {
                  description:
                    'These are the Boolean fields to be added to the new class',
                  type: new GraphQLList(
                    new GraphQLNonNull(
                      classSchemaTypes.SCHEMA_BOOLEAN_FIELD_INPUT
                    )
                  ),
                },
                arrayFields: {
                  description:
                    'These are the Array fields to be added to the new class',
                  type: new GraphQLList(
                    new GraphQLNonNull(
                      classSchemaTypes.SCHEMA_ARRAY_FIELD_INPUT
                    )
                  ),
                },
                objectFields: {
                  description:
                    'These are the Object fields to be added to the new class',
                  type: new GraphQLList(
                    new GraphQLNonNull(
                      classSchemaTypes.SCHEMA_OBJECT_FIELD_INPUT
                    )
                  ),
                },
                dateFields: {
                  description:
                    'These are the Date fields to be added to the new class',
                  type: new GraphQLList(
                    new GraphQLNonNull(classSchemaTypes.SCHEMA_DATE_FIELD_INPUT)
                  ),
                },
                fileFields: {
                  description:
                    'These are the File fields to be added to the new class',
                  type: new GraphQLList(
                    new GraphQLNonNull(classSchemaTypes.SCHEMA_FILE_FIELD_INPUT)
                  ),
                },
                geoPointFields: {
                  description:
                    'These are the Geo Point fields to be added to the new class',
                  type: new GraphQLList(
                    new GraphQLNonNull(
                      classSchemaTypes.SCHEMA_GEO_POINT_FIELD_INPUT
                    )
                  ),
                },
                polygonFields: {
                  description:
                    'These are the Polygon fields to be added to the new class',
                  type: new GraphQLList(
                    new GraphQLNonNull(
                      classSchemaTypes.SCHEMA_POLYGON_FIELD_INPUT
                    )
                  ),
                },
                bytesFields: {
                  description:
                    'These are the Bytes fields to be added to the new class',
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
