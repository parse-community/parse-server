import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLList,
} from 'graphql';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';

const mapInputType = parseType => {
  switch (parseType) {
    case 'String':
      return GraphQLString;
    case 'Number':
      return GraphQLFloat;
    case 'Boolean':
      return GraphQLBoolean;
    case 'Array':
      return new GraphQLList(defaultGraphQLTypes.OBJECT);
    case 'Object':
      return defaultGraphQLTypes.OBJECT;
    case 'Date':
      return defaultGraphQLTypes.DATE;
    case 'Pointer':
      return defaultGraphQLTypes.OBJECT;
    case 'Relation':
      return new GraphQLList(defaultGraphQLTypes.OBJECT);
  }
};

const mapOutputType = parseType => {
  switch (parseType) {
    case 'String':
      return GraphQLString;
    case 'Number':
      return GraphQLFloat;
    case 'Boolean':
      return GraphQLBoolean;
    case 'Array':
      return new GraphQLList(defaultGraphQLTypes.OBJECT);
    case 'Object':
      return defaultGraphQLTypes.OBJECT;
    case 'Date':
      return defaultGraphQLTypes.DATE;
    case 'Pointer':
      return defaultGraphQLTypes.OBJECT;
    case 'Relation':
      return new GraphQLList(defaultGraphQLTypes.OBJECT);
  }
};

const load = (parseGraphQLSchema, parseClass) => {
  const className = parseClass.className;

  const classCustomFields = Object.keys(parseClass.fields).filter(
    field => !Object.keys(defaultGraphQLTypes.CLASS_FIELDS).includes(field)
  );

  const classGraphQLInputFields = classCustomFields.reduce(
    (fields, field) => ({
      ...fields,
      [field]: {
        description: `This is the object ${field}.`,
        type: mapInputType(parseClass.fields[field].type),
      },
    }),
    {
      ACL: defaultGraphQLTypes.ACL,
    }
  );

  const classGraphQLOutputFields = classCustomFields.reduce(
    (fields, field) => ({
      ...fields,
      [field]: {
        description: `This is the object ${field}.`,
        type: mapOutputType(parseClass.fields[field].type),
      },
    }),
    defaultGraphQLTypes.CLASS_FIELDS
  );

  const classGraphQLTypeName = `${className}Class`;
  const classGraphQLType = new GraphQLObjectType({
    name: classGraphQLTypeName,
    description: `The ${classGraphQLTypeName} object type is used in operations that involve objects of this specific class.`,
    interfaces: [defaultGraphQLTypes.CLASS],
    fields: classGraphQLOutputFields,
  });

  parseGraphQLSchema.parseClassTypes = {
    [className]: {
      classGraphQLType,
      classGraphQLInputFields,
      classGraphQLOutputFields,
    },
  };

  parseGraphQLSchema.graphQLTypes.push(classGraphQLType);
};

export { load };
