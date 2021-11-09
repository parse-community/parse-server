import {
  GraphQLNonNull,
  GraphQLString,
  GraphQLInputObjectType,
  GraphQLList,
  GraphQLObjectType,
  GraphQLInterfaceType,
} from 'graphql';

const SCHEMA_FIELD_NAME_ATT = {
  description: 'This is the field name.',
  type: new GraphQLNonNull(GraphQLString),
};

const SCHEMA_FIELD_INPUT = new GraphQLInputObjectType({
  name: 'SchemaFieldInput',
  description: 'The SchemaFieldInput is used to specify a field of an object class schema.',
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
  },
});

const SCHEMA_FIELD = new GraphQLInterfaceType({
  name: 'SchemaField',
  description:
    'The SchemaField interface type is used as a base type for the different supported fields of an object class schema.',
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
  },
  resolveType: value =>
    ({
      String: SCHEMA_STRING_FIELD,
      Number: SCHEMA_NUMBER_FIELD,
      Boolean: SCHEMA_BOOLEAN_FIELD,
      Array: SCHEMA_ARRAY_FIELD,
      Object: SCHEMA_OBJECT_FIELD,
      Date: SCHEMA_DATE_FIELD,
      File: SCHEMA_FILE_FIELD,
      GeoPoint: SCHEMA_GEO_POINT_FIELD,
      Polygon: SCHEMA_POLYGON_FIELD,
      Bytes: SCHEMA_BYTES_FIELD,
      Pointer: SCHEMA_POINTER_FIELD,
      Relation: SCHEMA_RELATION_FIELD,
      ACL: SCHEMA_ACL_FIELD,
    }[value.type]),
});

const SCHEMA_STRING_FIELD_INPUT = new GraphQLInputObjectType({
  name: 'SchemaStringFieldInput',
  description:
    'The SchemaStringFieldInput is used to specify a field of type string for an object class schema.',
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
  },
});

const SCHEMA_STRING_FIELD = new GraphQLObjectType({
  name: 'SchemaStringField',
  description: 'The SchemaStringField is used to return information of a String field.',
  interfaces: [SCHEMA_FIELD],
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
  },
});

const SCHEMA_NUMBER_FIELD_INPUT = new GraphQLInputObjectType({
  name: 'SchemaNumberFieldInput',
  description:
    'The SchemaNumberFieldInput is used to specify a field of type number for an object class schema.',
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
  },
});

const SCHEMA_NUMBER_FIELD = new GraphQLObjectType({
  name: 'SchemaNumberField',
  description: 'The SchemaNumberField is used to return information of a Number field.',
  interfaces: [SCHEMA_FIELD],
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
  },
});

const SCHEMA_BOOLEAN_FIELD_INPUT = new GraphQLInputObjectType({
  name: 'SchemaBooleanFieldInput',
  description:
    'The SchemaBooleanFieldInput is used to specify a field of type boolean for an object class schema.',
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
  },
});

const SCHEMA_BOOLEAN_FIELD = new GraphQLObjectType({
  name: 'SchemaBooleanField',
  description: 'The SchemaBooleanField is used to return information of a Boolean field.',
  interfaces: [SCHEMA_FIELD],
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
  },
});

const SCHEMA_ARRAY_FIELD_INPUT = new GraphQLInputObjectType({
  name: 'SchemaArrayFieldInput',
  description:
    'The SchemaArrayFieldInput is used to specify a field of type array for an object class schema.',
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
  },
});

const SCHEMA_ARRAY_FIELD = new GraphQLObjectType({
  name: 'SchemaArrayField',
  description: 'The SchemaArrayField is used to return information of an Array field.',
  interfaces: [SCHEMA_FIELD],
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
  },
});

const SCHEMA_OBJECT_FIELD_INPUT = new GraphQLInputObjectType({
  name: 'SchemaObjectFieldInput',
  description:
    'The SchemaObjectFieldInput is used to specify a field of type object for an object class schema.',
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
  },
});

const SCHEMA_OBJECT_FIELD = new GraphQLObjectType({
  name: 'SchemaObjectField',
  description: 'The SchemaObjectField is used to return information of an Object field.',
  interfaces: [SCHEMA_FIELD],
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
  },
});

const SCHEMA_DATE_FIELD_INPUT = new GraphQLInputObjectType({
  name: 'SchemaDateFieldInput',
  description:
    'The SchemaDateFieldInput is used to specify a field of type date for an object class schema.',
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
  },
});

const SCHEMA_DATE_FIELD = new GraphQLObjectType({
  name: 'SchemaDateField',
  description: 'The SchemaDateField is used to return information of a Date field.',
  interfaces: [SCHEMA_FIELD],
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
  },
});

const SCHEMA_FILE_FIELD_INPUT = new GraphQLInputObjectType({
  name: 'SchemaFileFieldInput',
  description:
    'The SchemaFileFieldInput is used to specify a field of type file for an object class schema.',
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
  },
});

const SCHEMA_FILE_FIELD = new GraphQLObjectType({
  name: 'SchemaFileField',
  description: 'The SchemaFileField is used to return information of a File field.',
  interfaces: [SCHEMA_FIELD],
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
  },
});

const SCHEMA_GEO_POINT_FIELD_INPUT = new GraphQLInputObjectType({
  name: 'SchemaGeoPointFieldInput',
  description:
    'The SchemaGeoPointFieldInput is used to specify a field of type geo point for an object class schema.',
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
  },
});

const SCHEMA_GEO_POINT_FIELD = new GraphQLObjectType({
  name: 'SchemaGeoPointField',
  description: 'The SchemaGeoPointField is used to return information of a Geo Point field.',
  interfaces: [SCHEMA_FIELD],
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
  },
});

const SCHEMA_POLYGON_FIELD_INPUT = new GraphQLInputObjectType({
  name: 'SchemaPolygonFieldInput',
  description:
    'The SchemaPolygonFieldInput is used to specify a field of type polygon for an object class schema.',
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
  },
});

const SCHEMA_POLYGON_FIELD = new GraphQLObjectType({
  name: 'SchemaPolygonField',
  description: 'The SchemaPolygonField is used to return information of a Polygon field.',
  interfaces: [SCHEMA_FIELD],
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
  },
});

const SCHEMA_BYTES_FIELD_INPUT = new GraphQLInputObjectType({
  name: 'SchemaBytesFieldInput',
  description:
    'The SchemaBytesFieldInput is used to specify a field of type bytes for an object class schema.',
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
  },
});

const SCHEMA_BYTES_FIELD = new GraphQLObjectType({
  name: 'SchemaBytesField',
  description: 'The SchemaBytesField is used to return information of a Bytes field.',
  interfaces: [SCHEMA_FIELD],
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
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
  },
});

const SCHEMA_POINTER_FIELD = new GraphQLObjectType({
  name: 'SchemaPointerField',
  description: 'The SchemaPointerField is used to return information of a Pointer field.',
  interfaces: [SCHEMA_FIELD],
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
    targetClassName: TARGET_CLASS_ATT,
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

const SCHEMA_RELATION_FIELD = new GraphQLObjectType({
  name: 'SchemaRelationField',
  description: 'The SchemaRelationField is used to return information of a Relation field.',
  interfaces: [SCHEMA_FIELD],
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
    targetClassName: TARGET_CLASS_ATT,
  },
});

const SCHEMA_ACL_FIELD = new GraphQLObjectType({
  name: 'SchemaACLField',
  description: 'The SchemaACLField is used to return information of an ACL field.',
  interfaces: [SCHEMA_FIELD],
  fields: {
    name: SCHEMA_FIELD_NAME_ATT,
  },
});

const SCHEMA_FIELDS_INPUT = new GraphQLInputObjectType({
  name: 'SchemaFieldsInput',
  description: `The CreateClassSchemaInput type is used to specify the schema for a new object class to be created.`,
  fields: {
    addStrings: {
      description: 'These are the String fields to be added to the class schema.',
      type: new GraphQLList(new GraphQLNonNull(SCHEMA_STRING_FIELD_INPUT)),
    },
    addNumbers: {
      description: 'These are the Number fields to be added to the class schema.',
      type: new GraphQLList(new GraphQLNonNull(SCHEMA_NUMBER_FIELD_INPUT)),
    },
    addBooleans: {
      description: 'These are the Boolean fields to be added to the class schema.',
      type: new GraphQLList(new GraphQLNonNull(SCHEMA_BOOLEAN_FIELD_INPUT)),
    },
    addArrays: {
      description: 'These are the Array fields to be added to the class schema.',
      type: new GraphQLList(new GraphQLNonNull(SCHEMA_ARRAY_FIELD_INPUT)),
    },
    addObjects: {
      description: 'These are the Object fields to be added to the class schema.',
      type: new GraphQLList(new GraphQLNonNull(SCHEMA_OBJECT_FIELD_INPUT)),
    },
    addDates: {
      description: 'These are the Date fields to be added to the class schema.',
      type: new GraphQLList(new GraphQLNonNull(SCHEMA_DATE_FIELD_INPUT)),
    },
    addFiles: {
      description: 'These are the File fields to be added to the class schema.',
      type: new GraphQLList(new GraphQLNonNull(SCHEMA_FILE_FIELD_INPUT)),
    },
    addGeoPoint: {
      description:
        'This is the Geo Point field to be added to the class schema. Currently it is supported only one GeoPoint field per Class.',
      type: SCHEMA_GEO_POINT_FIELD_INPUT,
    },
    addPolygons: {
      description: 'These are the Polygon fields to be added to the class schema.',
      type: new GraphQLList(new GraphQLNonNull(SCHEMA_POLYGON_FIELD_INPUT)),
    },
    addBytes: {
      description: 'These are the Bytes fields to be added to the class schema.',
      type: new GraphQLList(new GraphQLNonNull(SCHEMA_BYTES_FIELD_INPUT)),
    },
    addPointers: {
      description: 'These are the Pointer fields to be added to the class schema.',
      type: new GraphQLList(new GraphQLNonNull(SCHEMA_POINTER_FIELD_INPUT)),
    },
    addRelations: {
      description: 'These are the Relation fields to be added to the class schema.',
      type: new GraphQLList(new GraphQLNonNull(SCHEMA_RELATION_FIELD_INPUT)),
    },
    remove: {
      description: 'These are the fields to be removed from the class schema.',
      type: new GraphQLList(new GraphQLNonNull(SCHEMA_FIELD_INPUT)),
    },
  },
});

const CLASS_NAME_ATT = {
  description: 'This is the name of the object class.',
  type: new GraphQLNonNull(GraphQLString),
};

const CLASS = new GraphQLObjectType({
  name: 'Class',
  description: `The Class type is used to return the information about an object class.`,
  fields: {
    name: CLASS_NAME_ATT,
    schemaFields: {
      description: "These are the schema's fields of the object class.",
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(SCHEMA_FIELD))),
    },
  },
});

const load = parseGraphQLSchema => {
  parseGraphQLSchema.addGraphQLType(SCHEMA_FIELD_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_STRING_FIELD_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_STRING_FIELD, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_NUMBER_FIELD_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_NUMBER_FIELD, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_BOOLEAN_FIELD_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_BOOLEAN_FIELD, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_ARRAY_FIELD_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_ARRAY_FIELD, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_OBJECT_FIELD_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_OBJECT_FIELD, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_DATE_FIELD_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_DATE_FIELD, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_FILE_FIELD_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_FILE_FIELD, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_GEO_POINT_FIELD_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_GEO_POINT_FIELD, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_POLYGON_FIELD_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_POLYGON_FIELD, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_BYTES_FIELD_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_BYTES_FIELD, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_POINTER_FIELD_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_POINTER_FIELD, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_RELATION_FIELD_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_RELATION_FIELD, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_ACL_FIELD, true);
  parseGraphQLSchema.addGraphQLType(SCHEMA_FIELDS_INPUT, true);
  parseGraphQLSchema.addGraphQLType(CLASS, true);
};

export {
  SCHEMA_FIELD_NAME_ATT,
  SCHEMA_FIELD_INPUT,
  SCHEMA_STRING_FIELD_INPUT,
  SCHEMA_STRING_FIELD,
  SCHEMA_NUMBER_FIELD_INPUT,
  SCHEMA_NUMBER_FIELD,
  SCHEMA_BOOLEAN_FIELD_INPUT,
  SCHEMA_BOOLEAN_FIELD,
  SCHEMA_ARRAY_FIELD_INPUT,
  SCHEMA_ARRAY_FIELD,
  SCHEMA_OBJECT_FIELD_INPUT,
  SCHEMA_OBJECT_FIELD,
  SCHEMA_DATE_FIELD_INPUT,
  SCHEMA_DATE_FIELD,
  SCHEMA_FILE_FIELD_INPUT,
  SCHEMA_FILE_FIELD,
  SCHEMA_GEO_POINT_FIELD_INPUT,
  SCHEMA_GEO_POINT_FIELD,
  SCHEMA_POLYGON_FIELD_INPUT,
  SCHEMA_POLYGON_FIELD,
  SCHEMA_BYTES_FIELD_INPUT,
  SCHEMA_BYTES_FIELD,
  TARGET_CLASS_ATT,
  SCHEMA_POINTER_FIELD_INPUT,
  SCHEMA_POINTER_FIELD,
  SCHEMA_RELATION_FIELD_INPUT,
  SCHEMA_RELATION_FIELD,
  SCHEMA_ACL_FIELD,
  SCHEMA_FIELDS_INPUT,
  CLASS_NAME_ATT,
  CLASS,
  load,
};
