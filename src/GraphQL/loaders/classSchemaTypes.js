import {
  GraphQLNonNull,
  GraphQLString,
  GraphQLBoolean,
  GraphQLInputObjectType,
  GraphQLList,
} from 'graphql';
import { transformInputTypeToGraphQL } from '../transformers/inputType';

const SCHEMA_FIELD_NAME_ATT = {
  description: 'This is the field name.',
  type: new GraphQLNonNull(GraphQLString),
};

const SCHEMA_FIELD_IS_REQUIRED_ATT = {
  description:
    'This is the flag to specify whether the field is required or not.',
  type: GraphQLBoolean,
};

const SCHEMA_FIELD_INPUT = new GraphQLInputObjectType({
  name: 'SchemaFieldInput',
  description:
    'The SchemaFieldInput is used to specify a field of an object class schema.',
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
  },
});

const SCHEMA_STRING_FIELD_INPUT = new GraphQLInputObjectType({
  name: 'SchemaStringFieldInput',
  description:
    'The SchemaStringFieldInput is used to specify a field of type string for an object class schema.',
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
    isRequired: SCHEMA_FIELD_IS_REQUIRED_ATT,
    defaultValue: {
      description: 'This is the field default value.',
      type: transformInputTypeToGraphQL('String'),
    },
  },
});

const SCHEMA_NUMBER_FIELD_INPUT = new GraphQLInputObjectType({
  name: 'SchemaNumberFieldInput',
  description:
    'The SchemaNumberFieldInput is used to specify a field of type number for an object class schema.',
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
    isRequired: SCHEMA_FIELD_IS_REQUIRED_ATT,
    defaultValue: {
      description: 'This is the field default value.',
      type: transformInputTypeToGraphQL('Number'),
    },
  },
});

const SCHEMA_BOOLEAN_FIELD_INPUT = new GraphQLInputObjectType({
  name: 'SchemaBooleanFieldInput',
  description:
    'The SchemaBooleanFieldInput is used to specify a field of type boolean for an object class schema.',
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
    isRequired: SCHEMA_FIELD_IS_REQUIRED_ATT,
    defaultValue: {
      description: 'This is the field default value.',
      type: transformInputTypeToGraphQL('Boolean'),
    },
  },
});

const SCHEMA_ARRAY_FIELD_INPUT = new GraphQLInputObjectType({
  name: 'SchemaArrayFieldInput',
  description:
    'The SchemaArrayFieldInput is used to specify a field of type array for an object class schema.',
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
    isRequired: SCHEMA_FIELD_IS_REQUIRED_ATT,
    defaultValue: {
      description: 'This is the field default value.',
      type: transformInputTypeToGraphQL('Array'),
    },
  },
});

const SCHEMA_OBJECT_FIELD_INPUT = new GraphQLInputObjectType({
  name: 'SchemaObjectFieldInput',
  description:
    'The SchemaObjectFieldInput is used to specify a field of type object for an object class schema.',
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
    isRequired: SCHEMA_FIELD_IS_REQUIRED_ATT,
    defaultValue: {
      description: 'This is the field default value.',
      type: transformInputTypeToGraphQL('Object'),
    },
  },
});

const SCHEMA_DATE_FIELD_INPUT = new GraphQLInputObjectType({
  name: 'SchemaDateFieldInput',
  description:
    'The SchemaDateFieldInput is used to specify a field of type date for an object class schema.',
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
    isRequired: SCHEMA_FIELD_IS_REQUIRED_ATT,
    defaultValue: {
      description: 'This is the field default value.',
      type: transformInputTypeToGraphQL('Date'),
    },
  },
});

const SCHEMA_FILE_FIELD_INPUT = new GraphQLInputObjectType({
  name: 'SchemaFileFieldInput',
  description:
    'The SchemaFileFieldInput is used to specify a field of type file for an object class schema.',
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
    isRequired: SCHEMA_FIELD_IS_REQUIRED_ATT,
    defaultValue: {
      description: 'This is the field default value.',
      type: transformInputTypeToGraphQL('File'),
    },
  },
});

const SCHEMA_GEO_POINT_FIELD_INPUT = new GraphQLInputObjectType({
  name: 'SchemaGeoPointFieldInput',
  description:
    'The SchemaGeoPointFieldInput is used to specify a field of type geo point for an object class schema.',
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
    isRequired: SCHEMA_FIELD_IS_REQUIRED_ATT,
    defaultValue: {
      description: 'This is the field default value.',
      type: transformInputTypeToGraphQL('GeoPoint'),
    },
  },
});

const SCHEMA_POLYGON_FIELD_INPUT = new GraphQLInputObjectType({
  name: 'SchemaPolygonFieldInput',
  description:
    'The SchemaPolygonFieldInput is used to specify a field of type polygon for an object class schema.',
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
    isRequired: SCHEMA_FIELD_IS_REQUIRED_ATT,
    defaultValue: {
      description: 'This is the field default value.',
      type: transformInputTypeToGraphQL('Polygon'),
    },
  },
});

const SCHEMA_BYTES_FIELD_INPUT = new GraphQLInputObjectType({
  name: 'SchemaBytesFieldInput',
  description:
    'The SchemaBytesFieldInput is used to specify a field of type bytes for an object class schema.',
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
    isRequired: SCHEMA_FIELD_IS_REQUIRED_ATT,
    defaultValue: {
      description: 'This is the field default value.',
      type: transformInputTypeToGraphQL('Bytes'),
    },
  },
});

const TARGET_CLASS_ATT = {
  description: 'This is the name of the target class for the field.',
  type: new GraphQLNonNull(GraphQLString),
};

const SCHEMA_POINTER_FIELD_INPUT = new GraphQLInputObjectType({
  name: 'PointerFieldInput',
  description:
    'The PointerFieldInput is used to specify a field of type pointer for an object class schema.',
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
    targetClassName: TARGET_CLASS_ATT,
    isRequired: SCHEMA_FIELD_IS_REQUIRED_ATT,
    defaultValue: {
      description: 'This is the field default value.',
      type: transformInputTypeToGraphQL('Pointer'),
    },
  },
});

const SCHEMA_RELATION_FIELD_INPUT = new GraphQLInputObjectType({
  name: 'RelationFieldInput',
  description:
    'The RelationFieldInput is used to specify a field of type relation for an object class schema.',
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
    targetClassName: TARGET_CLASS_ATT,
  },
});

const SCHEMA_INPUT = new GraphQLInputObjectType({
  name: 'SchemaInput',
  description: `The CreateClassSchemaInput type is used to specify the schema for a new object class to be created.`,
  fields: {
    addStringFields: {
      description:
        'These are the String fields to be added to the class schema.',
      type: new GraphQLList(new GraphQLNonNull(SCHEMA_STRING_FIELD_INPUT)),
    },
    addNumberFields: {
      description:
        'These are the Number fields to be added to the class schema.',
      type: new GraphQLList(new GraphQLNonNull(SCHEMA_NUMBER_FIELD_INPUT)),
    },
    addBooleanFields: {
      description:
        'These are the Boolean fields to be added to the class schema.',
      type: new GraphQLList(new GraphQLNonNull(SCHEMA_BOOLEAN_FIELD_INPUT)),
    },
    addArrayFields: {
      description:
        'These are the Array fields to be added to the class schema.',
      type: new GraphQLList(new GraphQLNonNull(SCHEMA_ARRAY_FIELD_INPUT)),
    },
    addObjectFields: {
      description:
        'These are the Object fields to be added to the class schema.',
      type: new GraphQLList(new GraphQLNonNull(SCHEMA_OBJECT_FIELD_INPUT)),
    },
    addDateFields: {
      description: 'These are the Date fields to be added to the class schema.',
      type: new GraphQLList(new GraphQLNonNull(SCHEMA_DATE_FIELD_INPUT)),
    },
    addFileFields: {
      description: 'These are the File fields to be added to the class schema.',
      type: new GraphQLList(new GraphQLNonNull(SCHEMA_FILE_FIELD_INPUT)),
    },
    addGeoPointFields: {
      description:
        'These are the Geo Point fields to be added to the class schema.',
      type: new GraphQLList(new GraphQLNonNull(SCHEMA_GEO_POINT_FIELD_INPUT)),
    },
    addPolygonFields: {
      description:
        'These are the Polygon fields to be added to the class schema.',
      type: new GraphQLList(new GraphQLNonNull(SCHEMA_POLYGON_FIELD_INPUT)),
    },
    addBytesFields: {
      description:
        'These are the Bytes fields to be added to the class schema.',
      type: new GraphQLList(new GraphQLNonNull(SCHEMA_BYTES_FIELD_INPUT)),
    },
    addPointerFields: {
      description:
        'These are the Pointer fields to be added to the class schema.',
      type: new GraphQLList(new GraphQLNonNull(SCHEMA_POINTER_FIELD_INPUT)),
    },
    addRelationFields: {
      description:
        'These are the Relation fields to be added to the class schema.',
      type: new GraphQLList(new GraphQLNonNull(SCHEMA_RELATION_FIELD_INPUT)),
    },
    removeFields: {
      description: 'These are the fields to be removed from the class schema.',
      type: new GraphQLList(new GraphQLNonNull(SCHEMA_FIELD_INPUT)),
    },
  },
});

const load = parseGraphQLSchema => {
  parseGraphQLSchema.addGraphQLType(SCHEMA_FIELD_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_STRING_FIELD_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_NUMBER_FIELD_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_BOOLEAN_FIELD_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_ARRAY_FIELD_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_OBJECT_FIELD_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_DATE_FIELD_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_FILE_FIELD_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_GEO_POINT_FIELD_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_POLYGON_FIELD_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_BYTES_FIELD_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_POINTER_FIELD_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_RELATION_FIELD_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_INPUT, true);
};

export {
  SCHEMA_FIELD_NAME_ATT,
  SCHEMA_FIELD_IS_REQUIRED_ATT,
  SCHEMA_FIELD_INPUT,
  SCHEMA_STRING_FIELD_INPUT,
  SCHEMA_NUMBER_FIELD_INPUT,
  SCHEMA_BOOLEAN_FIELD_INPUT,
  SCHEMA_ARRAY_FIELD_INPUT,
  SCHEMA_OBJECT_FIELD_INPUT,
  SCHEMA_DATE_FIELD_INPUT,
  SCHEMA_FILE_FIELD_INPUT,
  SCHEMA_GEO_POINT_FIELD_INPUT,
  SCHEMA_POLYGON_FIELD_INPUT,
  SCHEMA_BYTES_FIELD_INPUT,
  TARGET_CLASS_ATT,
  SCHEMA_POINTER_FIELD_INPUT,
  SCHEMA_RELATION_FIELD_INPUT,
  SCHEMA_INPUT,
  load,
};
