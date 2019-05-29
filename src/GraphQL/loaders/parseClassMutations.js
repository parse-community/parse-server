import { GraphQLNonNull, GraphQLBoolean } from 'graphql';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import rest from '../../rest';

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
      if (!args) {
        args = {};
      }

      const { config, auth, info } = context;

      return (await rest.create(config, auth, className, args, info.clientSDK))
        .response;
    },
  };

  const updateGraphQLMutationName = `update${className}`;
  parseGraphQLSchema.graphQLObjectsMutations[updateGraphQLMutationName] = {
    description: `The ${updateGraphQLMutationName} mutation can be used to update an object of the ${className} class.`,
    args: {
      objectId: defaultGraphQLTypes.CLASS_FIELDS.objectId,
      ...classGraphQLInputFields,
    },
    type: new GraphQLNonNull(GraphQLBoolean),
    async resolve(_source, args, context) {
      const { objectId, ...fields } = args;

      const { config, auth, info } = context;

      await rest.update(
        config,
        auth,
        className,
        { objectId },
        fields,
        info.clientSDK
      );

      return true;
    },
  };

  const deleteGraphQLMutationName = `delete${className}`;
  parseGraphQLSchema.graphQLObjectsMutations[deleteGraphQLMutationName] = {
    description: `The ${deleteGraphQLMutationName} mutation can be used to delete an object of the ${className} class.`,
    args: {
      objectId: defaultGraphQLTypes.CLASS_FIELDS.objectId,
    },
    type: new GraphQLNonNull(GraphQLBoolean),
    async resolve(_source, args, context) {
      const { objectId } = args;

      const { config, auth, info } = context;

      await rest.del(config, auth, className, objectId, info.clientSDK);

      return true;
    },
  };
};

export { load };
