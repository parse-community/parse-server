import { GraphQLNonNull } from 'graphql';
import getFieldNames from 'graphql-list-fields';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import * as objectsQueries from './objectsQueries';
import * as parseClassTypes from './parseClassTypes';

const objectTypeConstraintToParse = (fieldName, objectConstraint) => {
  return Object.entries(objectConstraint).reduce(
    (acc, [constraint, keyValue]) => {
      const { key, value } = keyValue;
      return {
        ...acc,
        [`${fieldName}.${key}`]: {
          [constraint]: value,
        },
      };
    },
    {}
  );
};

const transformConstraintsToParse = (constraints, fields) => {
  if (!constraints || typeof constraints !== 'object') {
    return constraints;
  }
  const parseConstraints = {};
  Object.entries(constraints).forEach(([constraint, fieldValue]) => {
    // If constraint is a field name, and its type is Object
    if (fields[constraint] && fields[constraint].type === 'Object') {
      const objectConstraints = objectTypeConstraintToParse(
        constraint,
        fieldValue
      );
      Object.entries(objectConstraints).forEach(([key, value]) => {
        parseConstraints[key] = value;
      });
    } else if (['_and', '_or', '_nor'].includes(constraint)) {
      parseConstraints[constraint] = fieldValue.map(innerConstraints =>
        transformConstraintsToParse(innerConstraints, fields)
      );
    } else {
      parseConstraints[constraint] = fieldValue;
    }
  });
  return parseConstraints;
};

const load = (parseGraphQLSchema, parseClass) => {
  const className = parseClass.className;

  const {
    classGraphQLOutputType,
    classGraphQLFindArgs,
    classGraphQLFindResultType,
  } = parseGraphQLSchema.parseClassTypes[className];

  const getGraphQLQueryName = `get${className}`;
  parseGraphQLSchema.graphQLObjectsQueries[getGraphQLQueryName] = {
    description: `The ${getGraphQLQueryName} query can be used to get an object of the ${className} class by its id.`,
    args: {
      objectId: defaultGraphQLTypes.OBJECT_ID_ATT,
      readPreference: defaultGraphQLTypes.READ_PREFERENCE_ATT,
      includeReadPreference: defaultGraphQLTypes.INCLUDE_READ_PREFERENCE_ATT,
    },
    type: new GraphQLNonNull(classGraphQLOutputType),
    async resolve(_source, args, context, queryInfo) {
      try {
        const { objectId, readPreference, includeReadPreference } = args;
        const { config, auth, info } = context;
        const selectedFields = getFieldNames(queryInfo);

        const { keys, include } = parseClassTypes.extractKeysAndInclude(
          selectedFields
        );

        return await objectsQueries.getObject(
          className,
          objectId,
          keys,
          include,
          readPreference,
          includeReadPreference,
          config,
          auth,
          info
        );
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    },
  };

  const findGraphQLQueryName = `find${className}`;
  parseGraphQLSchema.graphQLObjectsQueries[findGraphQLQueryName] = {
    description: `The ${findGraphQLQueryName} query can be used to find objects of the ${className} class.`,
    args: classGraphQLFindArgs,
    type: new GraphQLNonNull(classGraphQLFindResultType),
    async resolve(_source, args, context, queryInfo) {
      try {
        const {
          where: graphQLWhere,
          order,
          skip,
          limit,
          readPreference,
          includeReadPreference,
          subqueryReadPreference,
        } = args;
        const { config, auth, info } = context;
        const selectedFields = getFieldNames(queryInfo);

        const where = transformConstraintsToParse(
          graphQLWhere,
          parseClass.fields
        );

        const { keys, include } = parseClassTypes.extractKeysAndInclude(
          selectedFields
            .filter(field => field.includes('.'))
            .map(field => field.slice(field.indexOf('.') + 1))
        );
        const parseOrder = order && order.join(',');

        return await objectsQueries.findObjects(
          className,
          where,
          parseOrder,
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
  };
};

export { load };
