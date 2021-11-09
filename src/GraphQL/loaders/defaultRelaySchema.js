import { nodeDefinitions, fromGlobalId } from 'graphql-relay';
import getFieldNames from 'graphql-list-fields';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import * as objectsQueries from '../helpers/objectsQueries';
import { extractKeysAndInclude } from './parseClassTypes';

const GLOBAL_ID_ATT = {
  description: 'This is the global id.',
  type: defaultGraphQLTypes.OBJECT_ID,
};

const load = parseGraphQLSchema => {
  const { nodeInterface, nodeField } = nodeDefinitions(
    async (globalId, context, queryInfo) => {
      try {
        const { type, id } = fromGlobalId(globalId);
        const { config, auth, info } = context;
        const selectedFields = getFieldNames(queryInfo);

        const { keys, include } = extractKeysAndInclude(selectedFields);

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
            info,
            parseGraphQLSchema.parseClasses
          )),
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    },
    obj => {
      return parseGraphQLSchema.parseClassTypes[obj.className].classGraphQLOutputType;
    }
  );

  parseGraphQLSchema.addGraphQLType(nodeInterface, true);
  parseGraphQLSchema.relayNodeInterface = nodeInterface;
  parseGraphQLSchema.addGraphQLQuery('node', nodeField, true);
};

export { GLOBAL_ID_ATT, load };
