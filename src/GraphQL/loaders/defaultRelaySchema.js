import { nodeDefinitions, fromGlobalId } from 'graphql-relay';
import getFieldNames from 'graphql-list-fields';
import * as objectsQueries from './objectsQueries';
import * as parseClassTypes from './parseClassTypes';

const load = parseGraphQLSchema => {
  const { nodeInterface, nodeField } = nodeDefinitions(
    async (globalId, context, queryInfo) => {
      try {
        const { type, id } = fromGlobalId(globalId);
        const { config, auth, info } = context;
        const selectedFields = getFieldNames(queryInfo);

        const { keys, include } = parseClassTypes.extractKeysAndInclude(
          selectedFields
        );

        return {
          className: type,
          ...(await objectsQueries.getObject(
            type,
            id,
            keys,
            include,
            undefined,
            undefined,
            config,
            auth,
            info
          )),
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    },
    obj => {
      return parseGraphQLSchema[obj.className].classGraphQLOutputType;
    }
  );

  parseGraphQLSchema.relayNodeInterface = nodeInterface;
  parseGraphQLSchema.graphQLTypes.push(nodeInterface);
  parseGraphQLSchema.graphQLQueries.node = nodeField;
};

export { load };
