import { GraphQLNonNull, GraphQLBoolean } from 'graphql';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import * as objectsMutations from './objectsMutations';

const load = (parseGraphQLSchema, parseClass) => {
  const className = parseClass.className;

  const classGraphQLInputFields =
    parseGraphQLSchema.parseClassTypes[className].classGraphQLInputFields;

  const createGraphQLMutationName = `create${className}`;
  parseGraphQLSchema.graphQLObjectsMutations[createGraphQLMutationName] = {
    description: `The ${createGraphQLMutationName} mutation can be used to create a new object of the ${className} class.`,
    args: classGraphQLInputFields,
    type: new GraphQLNonNull(defaultGraphQLTypes.CREATE_RESULT),
    async resolve(_source, args, context) {
      try {
        const { config, auth, info } = context;

        return await objectsMutations.createObject(
          className,
          args,
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
      objectId: defaultGraphQLTypes.OBJECT_ID,
      ...classGraphQLInputFields,
    },
    type: new GraphQLNonNull(defaultGraphQLTypes.UPDATE_RESULT),
    async resolve(_source, args, context) {
      try {
        const { objectId, ...fields } = args;
        const { config, auth, info } = context;

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
      objectId: defaultGraphQLTypes.OBJECT_ID,
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
