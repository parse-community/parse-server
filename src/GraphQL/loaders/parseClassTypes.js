import {
  Kind,
  GraphQLObjectType,
  GraphQLString,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLList,
  GraphQLInputObjectType,
  GraphQLNonNull,
  GraphQLScalarType,
} from 'graphql';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';

const mapInputType = (parseType, targetClass, parseClassTypes) => {
  switch (parseType) {
    case 'String':
      return GraphQLString;
    case 'Number':
      return GraphQLFloat;
    case 'Boolean':
      return GraphQLBoolean;
    case 'Array':
      return new GraphQLList(defaultGraphQLTypes.ANY);
    case 'Object':
      return defaultGraphQLTypes.OBJECT;
    case 'Date':
      return defaultGraphQLTypes.DATE;
    case 'Pointer':
      if (parseClassTypes[targetClass]) {
        return parseClassTypes[targetClass].classGraphQLScalarType;
      } else {
        return defaultGraphQLTypes.OBJECT;
      }
    case 'Relation':
      return new GraphQLList(defaultGraphQLTypes.OBJECT);
    case 'File':
      return defaultGraphQLTypes.OBJECT;
    case 'GeoPoint':
      return defaultGraphQLTypes.OBJECT;
    case 'ACL':
      return defaultGraphQLTypes.OBJECT;
  }
};

const mapOutputType = (parseType, targetClass, parseClassTypes) => {
  switch (parseType) {
    case 'String':
      return GraphQLString;
    case 'Number':
      return GraphQLFloat;
    case 'Boolean':
      return GraphQLBoolean;
    case 'Array':
      return new GraphQLList(defaultGraphQLTypes.ANY);
    case 'Object':
      return defaultGraphQLTypes.OBJECT;
    case 'Date':
      return defaultGraphQLTypes.DATE;
    case 'Pointer':
      if (parseClassTypes[targetClass]) {
        return parseClassTypes[targetClass].classGraphQLOutputType;
      } else {
        return defaultGraphQLTypes.OBJECT;
      }
    case 'Relation':
      return new GraphQLList(defaultGraphQLTypes.OBJECT);
    case 'File':
      return defaultGraphQLTypes.OBJECT;
    case 'GeoPoint':
      return defaultGraphQLTypes.OBJECT;
    case 'ACL':
      return defaultGraphQLTypes.OBJECT;
  }
};

const mapConstraintType = (parseType, targetClass, parseClassTypes) => {
  switch (parseType) {
    case 'String':
      return defaultGraphQLTypes.STRING_CONSTRAINT;
    case 'Number':
      return defaultGraphQLTypes.NUMBER_CONSTRAINT;
    case 'Boolean':
      return defaultGraphQLTypes.BOOLEAN_CONSTRAINT;
    case 'Array':
      return defaultGraphQLTypes.ARRAY_CONSTRAINT;
    case 'Object':
      return defaultGraphQLTypes.OBJECT_CONSTRAINT;
    case 'Date':
      return defaultGraphQLTypes.DATE_CONSTRAINT;
    case 'Pointer':
      if (parseClassTypes[targetClass]) {
        return parseClassTypes[targetClass].classGraphQLConstraintType;
      } else {
        return defaultGraphQLTypes.OBJECT;
      }
    case 'Relation':
      return new GraphQLList(defaultGraphQLTypes.OBJECT);
    case 'File':
      return defaultGraphQLTypes.OBJECT;
    case 'GeoPoint':
      return defaultGraphQLTypes.OBJECT;
    case 'ACL':
      return defaultGraphQLTypes.OBJECT;
  }
};

const load = (parseGraphQLSchema, parseClass) => {
  const className = parseClass.className;

  const classFields = Object.keys(parseClass.fields);

  const classCustomFields = classFields.filter(
    field => !Object.keys(defaultGraphQLTypes.CLASS_FIELDS).includes(field)
  );

  const classGraphQLScalarTypeName = `${className}Field`;
  const parseScalarValue = value => {
    if (typeof value === 'string') {
      return {
        __type: 'Pointer',
        className,
        objectId: value,
      };
    } else if (
      typeof value === 'object' &&
      value.__type === 'Pointer' &&
      value.className === className &&
      typeof value.objectId === 'string'
    ) {
      return value;
    }

    throw new defaultGraphQLTypes.TypeValidationError(
      value,
      classGraphQLScalarTypeName
    );
  };
  const classGraphQLScalarType = new GraphQLScalarType({
    name: classGraphQLScalarTypeName,
    description: `The ${classGraphQLScalarTypeName} is used in operations that involve ${className} pointers.`,
    parseValue: parseScalarValue,
    serialize: parseScalarValue,
    parseLiteral(ast) {
      if (ast.kind === Kind.STRING) {
        return parseScalarValue(ast.value);
      } else if (ast.kind === Kind.OBJECT) {
        const __type = ast.fields.find(field => field.name.value === '__type');
        const className = ast.fields.find(
          field => field.name.value === 'className'
        );
        const objectId = ast.fields.find(
          field => field.name.value === 'objectId'
        );
        if (
          __type &&
          __type.value &&
          className &&
          className.value &&
          objectId &&
          objectId.value
        ) {
          return parseScalarValue({
            __type: __type.value.value,
            className: className.value.value,
            objectId: objectId.value.value,
          });
        }
      }

      throw new defaultGraphQLTypes.TypeValidationError(
        ast.kind,
        classGraphQLScalarTypeName
      );
    },
  });
  parseGraphQLSchema.graphQLTypes.push(classGraphQLScalarType);

  const classGraphQLInputTypeName = `${className}Fields`;
  const classGraphQLInputType = new GraphQLInputObjectType({
    name: classGraphQLInputTypeName,
    description: `The ${classGraphQLInputTypeName} input type is used in operations that involve inputting objects of ${className} class.`,
    fields: () =>
      classCustomFields.reduce(
        (fields, field) => ({
          ...fields,
          [field]: {
            description: `This is the object ${field}.`,
            type: mapInputType(
              parseClass.fields[field].type,
              parseClass.fields[field].targetClass,
              parseGraphQLSchema.parseClassTypes
            ),
          },
        }),
        {
          ACL: defaultGraphQLTypes.ACL_ATT,
        }
      ),
  });
  parseGraphQLSchema.graphQLTypes.push(classGraphQLInputType);

  const classGraphQLOutputTypeName = `${className}Class`;
  const outputFields = () => {
    const fields = classCustomFields.reduce(
      (fields, field) => ({
        ...fields,
        [field]: {
          description: `This is the object ${field}.`,
          type: mapOutputType(
            parseClass.fields[field].type,
            parseClass.fields[field].targetClass,
            parseGraphQLSchema.parseClassTypes
          ),
        },
      }),
      defaultGraphQLTypes.CLASS_FIELDS
    );
    if (className === '_User') {
      fields.sessionToken = {
        description: 'The user session token',
        type: GraphQLString,
      };
    }
    return fields;
  };
  const classGraphQLOutputType = new GraphQLObjectType({
    name: classGraphQLOutputTypeName,
    description: `The ${classGraphQLOutputTypeName} object type is used in operations that involve outputting objects of ${className} class.`,
    interfaces: [defaultGraphQLTypes.CLASS],
    fields: outputFields,
  });
  parseGraphQLSchema.graphQLTypes.push(classGraphQLOutputType);

  const classGraphQLConstraintTypeName = `${className}Constraint`;
  const classGraphQLConstraintType = new GraphQLInputObjectType({
    name: classGraphQLConstraintTypeName,
    description: `The ${classGraphQLConstraintTypeName} input type is used in operations that involve filtering objects by a pointer field to ${className} class.`,
    fields: {
      _eq: defaultGraphQLTypes._eq(classGraphQLScalarType),
      _ne: defaultGraphQLTypes._ne(classGraphQLScalarType),
      _in: defaultGraphQLTypes._in(classGraphQLScalarType),
      _nin: defaultGraphQLTypes._nin(classGraphQLScalarType),
      _exists: defaultGraphQLTypes._exists,
      _select: defaultGraphQLTypes._select,
      _dontSelect: defaultGraphQLTypes._dontSelect,
      _inQuery: {
        description:
          'This is the $inQuery operator to specify a constraint to select the objects where a field equals to any of the ids in the result of a different query.',
        type: defaultGraphQLTypes.SUBQUERY,
      },
      _notInQuery: {
        description:
          'This is the $notInQuery operator to specify a constraint to select the objects where a field do not equal to any of the ids in the result of a different query.',
        type: defaultGraphQLTypes.SUBQUERY,
      },
    },
  });
  parseGraphQLSchema.graphQLTypes.push(classGraphQLConstraintType);

  const classGraphQLConstraintsTypeName = `${className}Constraints`;
  const classGraphQLConstraintsType = new GraphQLInputObjectType({
    name: classGraphQLConstraintsTypeName,
    description: `The ${classGraphQLConstraintsTypeName} input type is used in operations that involve filtering objects of ${className} class.`,
    fields: () => ({
      ...classFields.reduce(
        (fields, field) => ({
          ...fields,
          [field]: {
            description: `This is the object ${field}.`,
            type: mapConstraintType(
              parseClass.fields[field].type,
              parseClass.fields[field].targetClass,
              parseGraphQLSchema.parseClassTypes
            ),
          },
        }),
        {}
      ),
      _or: {
        description: 'This is the $or operator to compound constraints.',
        type: new GraphQLList(new GraphQLNonNull(classGraphQLConstraintsType)),
      },
      _and: {
        description: 'This is the $and operator to compound constraints.',
        type: new GraphQLList(new GraphQLNonNull(classGraphQLConstraintsType)),
      },
      _nor: {
        description: 'This is the $nor operator to compound constraints.',
        type: new GraphQLList(new GraphQLNonNull(classGraphQLConstraintsType)),
      },
      // _relatedTo: {},
    }),
  });
  parseGraphQLSchema.graphQLTypes.push(classGraphQLConstraintsType);

  const classGraphQLFindResultTypeName = `${className}FindResult`;
  const classGraphQLFindResultType = new GraphQLObjectType({
    name: classGraphQLFindResultTypeName,
    description: `The ${classGraphQLFindResultTypeName} object type is used in the ${className} find query to return the data of the matched objects.`,
    fields: {
      results: {
        description: 'This is the objects returned by the query',
        type: new GraphQLNonNull(
          new GraphQLList(new GraphQLNonNull(classGraphQLOutputType))
        ),
      },
      count: defaultGraphQLTypes.COUNT_ATT,
    },
  });
  parseGraphQLSchema.graphQLTypes.push(classGraphQLFindResultType);

  parseGraphQLSchema.parseClassTypes[className] = {
    classGraphQLScalarType,
    classGraphQLInputType,
    classGraphQLOutputType,
    classGraphQLConstraintType,
    classGraphQLConstraintsType,
    classGraphQLFindResultType,
  };
};

export { load };
