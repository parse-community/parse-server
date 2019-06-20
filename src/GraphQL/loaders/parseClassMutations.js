import { GraphQLNonNull, GraphQLBoolean } from 'graphql';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import * as objectsMutations from './objectsMutations';

const load = (parseGraphQLSchema, parseClass) => {
  const className = parseClass.className;

  const classGraphQLInputType =
    parseGraphQLSchema.parseClassTypes[className].classGraphQLInputType;
  const fields = {
    description: 'These are the fields of the object.',
    type: classGraphQLInputType,
  };
  const classGraphQLInputTypeFields = classGraphQLInputType.getFields();

  const transformTypes = fields => {
    if (fields) {
      Object.keys(fields).forEach(field => {
        if (classGraphQLInputTypeFields[field]) {
          switch (classGraphQLInputTypeFields[field].type) {
            case defaultGraphQLTypes.GEO_POINT:
              fields[field].__type = 'GeoPoint';
              break;
            case defaultGraphQLTypes.POLYGON:
              fields[field] = {
                __type: 'Polygon',
                coordinates: fields[field].map(geoPoint => [
                  geoPoint.latitude,
                  geoPoint.longitude,
                ]),
              };
              break;
          }
        }
      });
    }
  };

  const createGraphQLMutationName = `create${className}`;
  parseGraphQLSchema.graphQLObjectsMutations[createGraphQLMutationName] = {
    description: `The ${createGraphQLMutationName} mutation can be used to create a new object of the ${className} class.`,
    args: {
      fields,
    },
    type: new GraphQLNonNull(defaultGraphQLTypes.CREATE_RESULT),
    async resolve(_source, args, context) {
      try {
        const { fields } = args;
        const { config, auth, info } = context;

        transformTypes(fields);

        return await objectsMutations.createObject(
          className,
          fields,
          config,
          auth,
          info
        );
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    },
  };

  const updateGraphQLMutationName = `update${className}`;
  parseGraphQLSchema.graphQLObjectsMutations[updateGraphQLMutationName] = {
    description: `The ${updateGraphQLMutationName} mutation can be used to update an object of the ${className} class.`,
    args: {
      objectId: defaultGraphQLTypes.OBJECT_ID_ATT,
      fields,
    },
    type: defaultGraphQLTypes.UPDATE_RESULT,
    async resolve(_source, args, context) {
      try {
        const { objectId, fields } = args;
        const { config, auth, info } = context;

        transformTypes(fields);

        return await objectsMutations.updateObject(
          className,
          objectId,
          fields,
          config,
          auth,
          info
        );
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    },
  };

  const deleteGraphQLMutationName = `delete${className}`;
  parseGraphQLSchema.graphQLObjectsMutations[deleteGraphQLMutationName] = {
    description: `The ${deleteGraphQLMutationName} mutation can be used to delete an object of the ${className} class.`,
    args: {
      objectId: defaultGraphQLTypes.OBJECT_ID_ATT,
    },
    type: new GraphQLNonNull(GraphQLBoolean),
    async resolve(_source, args, context) {
      try {
        const { objectId } = args;
        const { config, auth, info } = context;

        return await objectsMutations.deleteObject(
          className,
          objectId,
          config,
          auth,
          info
        );
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    },
  };
};

export { load };
