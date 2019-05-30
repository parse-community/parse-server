import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLList,
  GraphQLInputObjectType,
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
      ACL: defaultGraphQLTypes.ACL_ATT,
    }
  );
  const classGraphQLInputTypeName = `${className}Input`;
  const classGraphQLInputType = new GraphQLInputObjectType({
    name: classGraphQLInputTypeName,
    description: `The ${classGraphQLInputTypeName} input type is used in operations that involve inputting objects of ${className} class.`,
    fields: classGraphQLInputFields,
  });
  parseGraphQLSchema.graphQLTypes.push(classGraphQLInputType);

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
  const classGraphQLOutputTypeName = `${className}Class`;
  const classGraphQLOutputType = new GraphQLObjectType({
    name: classGraphQLOutputTypeName,
    description: `The ${classGraphQLOutputTypeName} object type is used in operations that involve outputting objects of ${className} class.`,
    interfaces: [defaultGraphQLTypes.CLASS],
    fields: classGraphQLOutputFields,
  });
  parseGraphQLSchema.graphQLTypes.push(classGraphQLOutputType);

  parseGraphQLSchema.parseClassTypes = {
    [className]: {
      classGraphQLInputType,
      classGraphQLOutputType,
    },
  };
};

export { load };
