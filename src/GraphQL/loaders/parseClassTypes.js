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
  GraphQLEnumType,
} from 'graphql';
import getFieldNames from 'graphql-list-fields';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import * as objectsQueries from './objectsQueries';
import { ParseGraphQLClassConfig } from '../../Controllers/ParseGraphQLController';
import {
  transformClassNameToGraphQL,
  transformClassNameToParse,
} from '../transformers/className';

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
      if (parseClassTypes[targetClass]) {
        return parseClassTypes[targetClass].classGraphQLRelationOpType;
      } else {
        return defaultGraphQLTypes.OBJECT;
      }
    case 'File':
      return defaultGraphQLTypes.FILE;
    case 'GeoPoint':
      return defaultGraphQLTypes.GEO_POINT;
    case 'Polygon':
      return defaultGraphQLTypes.POLYGON;
    case 'Bytes':
      return defaultGraphQLTypes.BYTES;
    case 'ACL':
      return defaultGraphQLTypes.OBJECT;
    default:
      return undefined;
  }
};

const mapOutputType = (parseType, targetClass, parseClassTypes) => {
  targetClass = transformClassNameToGraphQL(targetClass);
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
      if (parseClassTypes[targetClass]) {
        return new GraphQLNonNull(
          parseClassTypes[targetClass].classGraphQLFindResultType
        );
      } else {
        return new GraphQLNonNull(defaultGraphQLTypes.FIND_RESULT);
      }
    case 'File':
      return defaultGraphQLTypes.FILE_INFO;
    case 'GeoPoint':
      return defaultGraphQLTypes.GEO_POINT_INFO;
    case 'Polygon':
      return defaultGraphQLTypes.POLYGON_INFO;
    case 'Bytes':
      return defaultGraphQLTypes.BYTES;
    case 'ACL':
      return defaultGraphQLTypes.OBJECT;
    default:
      return undefined;
  }
};

const mapConstraintType = (parseType, targetClass, parseClassTypes) => {
  switch (parseType) {
    case 'String':
      return defaultGraphQLTypes.STRING_WHERE_INPUT;
    case 'Number':
      return defaultGraphQLTypes.NUMBER_WHERE_INPUT;
    case 'Boolean':
      return defaultGraphQLTypes.BOOLEAN_WHERE_INPUT;
    case 'Array':
      return defaultGraphQLTypes.ARRAY_WHERE_INPUT;
    case 'Object':
      return defaultGraphQLTypes.OBJECT_WHERE_INPUT;
    case 'Date':
      return defaultGraphQLTypes.DATE_WHERE_INPUT;
    case 'Pointer':
      if (parseClassTypes[targetClass]) {
        return parseClassTypes[targetClass].classGraphQLConstraintType;
      } else {
        return defaultGraphQLTypes.OBJECT;
      }
    case 'File':
      return defaultGraphQLTypes.FILE_WHERE_INPUT;
    case 'GeoPoint':
      return defaultGraphQLTypes.GEO_POINT_WHERE_INPUT;
    case 'Polygon':
      return defaultGraphQLTypes.POLYGON_WHERE_INPUT;
    case 'Bytes':
      return defaultGraphQLTypes.BYTES_WHERE_INPUT;
    case 'ACL':
      return defaultGraphQLTypes.OBJECT_WHERE_INPUT;
    case 'Relation':
    default:
      return undefined;
  }
};

const extractKeysAndInclude = selectedFields => {
  selectedFields = selectedFields.filter(
    field => !field.includes('__typename')
  );
  let keys = undefined;
  let include = undefined;
  if (selectedFields && selectedFields.length > 0) {
    keys = selectedFields.join(',');
    include = selectedFields
      .reduce((fields, field) => {
        fields = fields.slice();
        let pointIndex = field.lastIndexOf('.');
        while (pointIndex > 0) {
          const lastField = field.slice(pointIndex + 1);
          field = field.slice(0, pointIndex);
          if (!fields.includes(field) && lastField !== 'objectId') {
            fields.push(field);
          }
          pointIndex = field.lastIndexOf('.');
        }
        return fields;
      }, [])
      .join(',');
  }
  return { keys, include };
};

const getParseClassTypeConfig = function(
  parseClassConfig: ?ParseGraphQLClassConfig
) {
  return (parseClassConfig && parseClassConfig.type) || {};
};

const getInputFieldsAndConstraints = function(
  parseClass,
  parseClassConfig: ?ParseGraphQLClassConfig
) {
  const classFields = Object.keys(parseClass.fields);
  const {
    inputFields: allowedInputFields,
    outputFields: allowedOutputFields,
    constraintFields: allowedConstraintFields,
    sortFields: allowedSortFields,
  } = getParseClassTypeConfig(parseClassConfig);

  let classOutputFields;
  let classCreateFields;
  let classUpdateFields;
  let classConstraintFields;
  let classSortFields;

  // All allowed customs fields
  const classCustomFields = classFields.filter(field => {
    return !Object.keys(defaultGraphQLTypes.CLASS_FIELDS).includes(field);
  });

  if (allowedInputFields && allowedInputFields.create) {
    classCreateFields = classCustomFields.filter(field => {
      return allowedInputFields.create.includes(field);
    });
  } else {
    classCreateFields = classCustomFields;
  }
  if (allowedInputFields && allowedInputFields.update) {
    classUpdateFields = classCustomFields.filter(field => {
      return allowedInputFields.update.includes(field);
    });
  } else {
    classUpdateFields = classCustomFields;
  }

  if (allowedOutputFields) {
    classOutputFields = classCustomFields.filter(field => {
      return allowedOutputFields.includes(field);
    });
  } else {
    classOutputFields = classCustomFields;
  }
  // Filters the "password" field from class _User
  if (parseClass.className === '_User') {
    classOutputFields = classOutputFields.filter(
      outputField => outputField !== 'password'
    );
  }

  if (allowedConstraintFields) {
    classConstraintFields = classCustomFields.filter(field => {
      return allowedConstraintFields.includes(field);
    });
  } else {
    classConstraintFields = classFields;
  }

  if (allowedSortFields) {
    classSortFields = allowedSortFields;
    if (!classSortFields.length) {
      // must have at least 1 order field
      // otherwise the FindArgs Input Type will throw.
      classSortFields.push({
        field: 'objectId',
        asc: true,
        desc: true,
      });
    }
  } else {
    classSortFields = classFields.map(field => {
      return { field, asc: true, desc: true };
    });
  }

  return {
    classCreateFields,
    classUpdateFields,
    classConstraintFields,
    classOutputFields,
    classSortFields,
  };
};

const load = (
  parseGraphQLSchema,
  parseClass,
  parseClassConfig: ?ParseGraphQLClassConfig
) => {
  const className = transformClassNameToGraphQL(parseClass.className);
  const {
    classCreateFields,
    classUpdateFields,
    classOutputFields,
    classConstraintFields,
    classSortFields,
  } = getInputFieldsAndConstraints(parseClass, parseClassConfig);

  const classGraphQLScalarTypeName = `${className}Pointer`;
  const parseScalarValue = value => {
    if (typeof value === 'string') {
      return {
        __type: 'Pointer',
        className: transformClassNameToParse(className),
        objectId: value,
      };
    } else if (
      typeof value === 'object' &&
      value.__type === 'Pointer' &&
      value.className === className &&
      typeof value.objectId === 'string'
    ) {
      return { ...value, className: transformClassNameToParse(className) };
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
    serialize(value) {
      if (typeof value === 'string') {
        return value;
      } else if (
        typeof value === 'object' &&
        value.__type === 'Pointer' &&
        transformClassNameToGraphQL(value.className) === className &&
        typeof value.objectId === 'string'
      ) {
        return value.objectId;
      }

      throw new defaultGraphQLTypes.TypeValidationError(
        value,
        classGraphQLScalarTypeName
      );
    },
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

  const classGraphQLRelationOpTypeName = `${className}RelationOp`;
  const classGraphQLRelationOpType = new GraphQLInputObjectType({
    name: classGraphQLRelationOpTypeName,
    description: `The ${classGraphQLRelationOpTypeName} input type is used in operations that involve relations with the ${className} class.`,
    fields: () => ({
      _op: {
        description: 'This is the operation to be executed.',
        type: new GraphQLNonNull(defaultGraphQLTypes.RELATION_OP),
      },
      ops: {
        description:
          'In the case of a Batch operation, this is the list of operations to be executed.',
        type: new GraphQLList(new GraphQLNonNull(classGraphQLRelationOpType)),
      },
      objects: {
        description:
          'In the case of a AddRelation or RemoveRelation operation, this is the list of objects to be added/removed.',
        type: new GraphQLList(new GraphQLNonNull(classGraphQLScalarType)),
      },
    }),
  });
  parseGraphQLSchema.graphQLTypes.push(classGraphQLRelationOpType);

  const classGraphQLCreateTypeName = `${className}CreateInput`;
  const classGraphQLCreateType = new GraphQLInputObjectType({
    name: classGraphQLCreateTypeName,
    description: `The ${classGraphQLCreateTypeName} input type is used in operations that involve creation of objects in the ${className} class.`,
    fields: () =>
      classCreateFields.reduce(
        (fields, field) => {
          const type = mapInputType(
            parseClass.fields[field].type,
            parseClass.fields[field].targetClass,
            parseGraphQLSchema.parseClassTypes
          );
          if (type) {
            return {
              ...fields,
              [field]: {
                description: `This is the object ${field}.`,
                type,
              },
            };
          } else {
            return fields;
          }
        },
        {
          ACL: defaultGraphQLTypes.ACL_ATT,
        }
      ),
  });
  parseGraphQLSchema.graphQLTypes.push(classGraphQLCreateType);

  const classGraphQLUpdateTypeName = `${className}UpdateInput`;
  const classGraphQLUpdateType = new GraphQLInputObjectType({
    name: classGraphQLUpdateTypeName,
    description: `The ${classGraphQLUpdateTypeName} input type is used in operations that involve creation of objects in the ${className} class.`,
    fields: () =>
      classUpdateFields.reduce(
        (fields, field) => {
          const type = mapInputType(
            parseClass.fields[field].type,
            parseClass.fields[field].targetClass,
            parseGraphQLSchema.parseClassTypes
          );
          if (type) {
            return {
              ...fields,
              [field]: {
                description: `This is the object ${field}.`,
                type,
              },
            };
          } else {
            return fields;
          }
        },
        {
          ACL: defaultGraphQLTypes.ACL_ATT,
        }
      ),
  });
  parseGraphQLSchema.graphQLTypes.push(classGraphQLUpdateType);

  const classGraphQLConstraintTypeName = `${className}PointerWhereInput`;
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

  const classGraphQLConstraintsTypeName = `${className}WhereInput`;
  const classGraphQLConstraintsType = new GraphQLInputObjectType({
    name: classGraphQLConstraintsTypeName,
    description: `The ${classGraphQLConstraintsTypeName} input type is used in operations that involve filtering objects of ${className} class.`,
    fields: () => ({
      ...classConstraintFields.reduce((fields, field) => {
        const type = mapConstraintType(
          parseClass.fields[field].type,
          parseClass.fields[field].targetClass,
          parseGraphQLSchema.parseClassTypes
        );
        if (type) {
          return {
            ...fields,
            [field]: {
              description: `This is the object ${field}.`,
              type,
            },
          };
        } else {
          return fields;
        }
      }, {}),
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
    }),
  });
  parseGraphQLSchema.graphQLTypes.push(classGraphQLConstraintsType);

  const classGraphQLOrderTypeName = `${className}Order`;
  const classGraphQLOrderType = new GraphQLEnumType({
    name: classGraphQLOrderTypeName,
    description: `The ${classGraphQLOrderTypeName} input type is used when sorting objects of the ${className} class.`,
    values: classSortFields.reduce((sortFields, fieldConfig) => {
      const { field, asc, desc } = fieldConfig;
      const updatedSortFields = {
        ...sortFields,
      };
      if (asc) {
        updatedSortFields[`${field}_ASC`] = { value: field };
      }
      if (desc) {
        updatedSortFields[`${field}_DESC`] = { value: `-${field}` };
      }
      return updatedSortFields;
    }, {}),
  });
  parseGraphQLSchema.graphQLTypes.push(classGraphQLOrderType);

  const classGraphQLFindArgs = {
    where: {
      description:
        'These are the conditions that the objects need to match in order to be found.',
      type: classGraphQLConstraintsType,
    },
    order: {
      description: 'The fields to be used when sorting the data fetched.',
      type: new GraphQLList(new GraphQLNonNull(classGraphQLOrderType)),
    },
    skip: defaultGraphQLTypes.SKIP_ATT,
    limit: defaultGraphQLTypes.LIMIT_ATT,
    readPreference: defaultGraphQLTypes.READ_PREFERENCE_ATT,
    includeReadPreference: defaultGraphQLTypes.INCLUDE_READ_PREFERENCE_ATT,
    subqueryReadPreference: defaultGraphQLTypes.SUBQUERY_READ_PREFERENCE_ATT,
  };

  const classGraphQLOutputTypeName = `${className}`;
  const outputFields = () => {
    return classOutputFields.reduce((fields, field) => {
      const type = mapOutputType(
        parseClass.fields[field].type,
        parseClass.fields[field].targetClass,
        parseGraphQLSchema.parseClassTypes
      );
      if (parseClass.fields[field].type === 'Relation') {
        const targetParseClassTypes =
          parseGraphQLSchema.parseClassTypes[
            transformClassNameToGraphQL(parseClass.fields[field].targetClass)
          ];
        const args = targetParseClassTypes
          ? targetParseClassTypes.classGraphQLFindArgs
          : undefined;
        return {
          ...fields,
          [field]: {
            description: `This is the object ${field}.`,
            args,
            type,
            async resolve(source, args, context, queryInfo) {
              try {
                const {
                  where,
                  order,
                  skip,
                  limit,
                  readPreference,
                  includeReadPreference,
                  subqueryReadPreference,
                } = args;
                const { config, auth, info } = context;
                const selectedFields = getFieldNames(queryInfo);

                const { keys, include } = extractKeysAndInclude(
                  selectedFields
                    .filter(field => field.includes('.'))
                    .map(field => field.slice(field.indexOf('.') + 1))
                );
                return await objectsQueries.findObjects(
                  source[field].className,
                  {
                    _relatedTo: {
                      object: {
                        __type: 'Pointer',
                        className: transformClassNameToParse(className),
                        objectId: source.objectId,
                      },
                      key: field,
                    },
                    ...(where || {}),
                  },
                  order,
                  skip,
                  limit,
                  keys,
                  include,
                  false,
                  readPreference,
                  includeReadPreference,
                  subqueryReadPreference,
                  config,
                  auth,
                  info,
                  selectedFields.map(field => field.split('.', 1)[0])
                );
              } catch (e) {
                parseGraphQLSchema.handleError(e);
              }
            },
          },
        };
      } else if (parseClass.fields[field].type === 'Polygon') {
        return {
          ...fields,
          [field]: {
            description: `This is the object ${field}.`,
            type,
            async resolve(source) {
              if (source[field] && source[field].coordinates) {
                return source[field].coordinates.map(coordinate => ({
                  latitude: coordinate[0],
                  longitude: coordinate[1],
                }));
              } else {
                return null;
              }
            },
          },
        };
      } else if (type) {
        return {
          ...fields,
          [field]: {
            description: `This is the object ${field}.`,
            type,
          },
        };
      } else {
        return fields;
      }
    }, defaultGraphQLTypes.CLASS_FIELDS);
  };
  const classGraphQLOutputType = new GraphQLObjectType({
    name: classGraphQLOutputTypeName,
    description: `The ${classGraphQLOutputTypeName} object type is used in operations that involve outputting objects of ${className} class.`,
    interfaces: [defaultGraphQLTypes.CLASS],
    fields: outputFields,
  });
  parseGraphQLSchema.graphQLTypes.push(classGraphQLOutputType);

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
    classGraphQLRelationOpType,
    classGraphQLCreateType,
    classGraphQLUpdateType,
    classGraphQLConstraintType,
    classGraphQLConstraintsType,
    classGraphQLFindArgs,
    classGraphQLOutputType,
    classGraphQLFindResultType,
  };

  if (className === transformClassNameToGraphQL('_User')) {
    const meType = new GraphQLObjectType({
      name: 'Me',
      description: `The Me object type is used in operations that involve outputting the current user data.`,
      interfaces: [defaultGraphQLTypes.CLASS],
      fields: () => ({
        ...outputFields(),
        sessionToken: defaultGraphQLTypes.SESSION_TOKEN_ATT,
      }),
    });
    parseGraphQLSchema.meType = meType;
    parseGraphQLSchema.graphQLTypes.push(meType);

    const userSignUpInputTypeName = 'SignUpInput';
    const userSignUpInputType = new GraphQLInputObjectType({
      name: userSignUpInputTypeName,
      description: `The ${userSignUpInputTypeName} input type is used in operations that involve inputting objects of ${className} class when signing up.`,
      fields: () =>
        classCreateFields.reduce((fields, field) => {
          const type = mapInputType(
            parseClass.fields[field].type,
            parseClass.fields[field].targetClass,
            parseGraphQLSchema.parseClassTypes
          );
          if (type) {
            return {
              ...fields,
              [field]: {
                description: `This is the object ${field}.`,
                type:
                  field === 'username' || field === 'password'
                    ? new GraphQLNonNull(type)
                    : type,
              },
            };
          } else {
            return fields;
          }
        }, {}),
    });

    const userLogInInputTypeName = '_UserLoginFields';
    const userLogInInputType = new GraphQLInputObjectType({
      name: userLogInInputTypeName,
      description: `The ${userLogInInputTypeName} input type is used to login.`,
      fields: {
        username: {
          description: 'This is the username used to log the user in.',
          type: new GraphQLNonNull(GraphQLString),
        },
        password: {
          description: 'This is the password used to log the user in.',
          type: new GraphQLNonNull(GraphQLString),
        },
      },
    });
    parseGraphQLSchema.parseClassTypes[
      transformClassNameToGraphQL('_User')
    ].signUpInputType = userSignUpInputType;
    parseGraphQLSchema.parseClassTypes[
      transformClassNameToGraphQL('_User')
    ].logInInputType = userLogInInputType;
    parseGraphQLSchema.graphQLTypes.push(userSignUpInputType);
  }
};

export { extractKeysAndInclude, load };
