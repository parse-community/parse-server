import { GraphQLNonNull } from 'graphql';
import getFieldNames from 'graphql-list-fields';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import * as objectsQueries from './objectsQueries';
import * as parseClassTypes from './parseClassTypes';

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
          order,
          skip,
          limit,
          readPreference,
          includeReadPreference,
          subqueryReadPreference,
        } = args;
        let { where } = args;
        const { config, auth, info } = context;
        const selectedFields = getFieldNames(queryInfo);

        const { keys, include } = parseClassTypes.extractKeysAndInclude(
          selectedFields
            .filter(field => field.includes('.'))
            .map(field => field.slice(field.indexOf('.') + 1))
        );
        const parseOrder = order && order.join(',');

        if (where) {
          const newConstraints = Object.keys(where).reduce(
            (newConstraints, fieldName) => {
              // If the field type is Object, we need to transform the constraints to the
              // format supported by Parse.
              if (
                parseClass.fields[fieldName] &&
                parseClass.fields[fieldName].type === 'Object'
              ) {
                const parseNewConstraints = where[fieldName].reduce(
                  (parseNewConstraints, gqlObjectConstraint) => {
                    const gqlConstraintEntries = Object.entries(
                      gqlObjectConstraint
                    );

                    // Each GraphQL ObjectConstraint should be composed by:
                    // { <constraintName> : { <objectEntryKey> : <objectEntryValue> } }
                    // Example: _eq : { 'foo.bar' : 'myobjectfield.foo.bar value' }
                    gqlConstraintEntries.forEach(
                      ([constraintName, constraintValue]) => {
                        const { key, value } = constraintValue; // the object entry (<key, value>)

                        // Transformed to:
                        // { <fieldName.objectEntryKey> : { <constraintName> : <objectEntryValue> } }
                        // Example: 'myobjectfield.foo.bar': { _eq: 'myobjectfield.foo.bar value' }
                        const absoluteFieldKey = `${fieldName}.${key}`;
                        parseNewConstraints[absoluteFieldKey] = {
                          ...parseNewConstraints[absoluteFieldKey],
                          [constraintName]: value,
                        };
                      }
                    );
                    return parseNewConstraints;
                  },
                  {}
                );
                // Removes the original field constraint from the where statement, now
                // that we have extracted the supported constraints from it.
                delete where[fieldName];

                // Returns the new constraints along with the existing ones.
                return {
                  ...newConstraints,
                  ...parseNewConstraints,
                };
              }
              return newConstraints;
            },
            {}
          );
          where = {
            ...where,
            ...newConstraints,
          };
        }

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
