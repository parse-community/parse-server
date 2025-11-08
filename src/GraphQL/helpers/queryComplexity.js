import { GraphQLError, getOperationAST, Kind } from 'graphql';

/**
 * Calculate the maximum depth and fields (field count) of a GraphQL query
 * @param {DocumentNode} document - The GraphQL document AST
 * @returns {{ depth: number, fields: number }} Maximum depth and total fields
 */
function calculateQueryComplexity(document) {
  const operationAST = getOperationAST(document);
  if (!operationAST || !operationAST.selectionSet) {
    return { depth: 0, fields: 0 };
  }

  // Build fragment definition map
  const fragments = {};
  if (document.definitions) {
    document.definitions.forEach(def => {
      if (def.kind === Kind.FRAGMENT_DEFINITION) {
        fragments[def.name.value] = def;
      }
    });
  }

  let maxDepth = 0;
  let fields = 0;

  function visitSelectionSet(selectionSet, depth) {
    if (!selectionSet || !selectionSet.selections) {
      return;
    }

    selectionSet.selections.forEach(selection => {
      if (selection.kind === Kind.FIELD) {
        fields++;
        maxDepth = Math.max(maxDepth, depth);
        if (selection.selectionSet) {
          visitSelectionSet(selection.selectionSet, depth + 1);
        }
      } else if (selection.kind === Kind.INLINE_FRAGMENT) {
        // Inline fragments don't add depth, just traverse their selections
        visitSelectionSet(selection.selectionSet, depth);
      } else if (selection.kind === Kind.FRAGMENT_SPREAD) {
        const fragmentName = selection.name.value;
        const fragment = fragments[fragmentName];
        // Note: Circular fragments are already prevented by GraphQL validation (NoFragmentCycles rule)
        // so we don't need to check for cycles here
        if (fragment && fragment.selectionSet) {
          visitSelectionSet(fragment.selectionSet, depth);
        }
      }
    });
  }

  visitSelectionSet(operationAST.selectionSet, 1);
  return { depth: maxDepth, fields };
}

/**
 * Create a GraphQL complexity validation plugin for Apollo Server
 * Computes depth and total field count directly from the parsed GraphQL document
 * @param {Object} config - Parse Server config object
 * @returns {Object} Apollo Server plugin
 */
export function createComplexityValidationPlugin(config) {
  return {
    requestDidStart: () => ({
      didResolveOperation: async (requestContext) => {
        const { document } = requestContext;
        const auth = requestContext.contextValue?.auth;

        // Skip validation for master/maintenance keys
        if (auth?.isMaster || auth?.isMaintenance) {
          return;
        }

        // Skip if no complexity limits are configured
        if (!config.maxGraphQLQueryComplexity) {
          return;
        }

        // Skip if document is not available
        if (!document) {
          return;
        }

        const maxGraphQLQueryComplexity = config.maxGraphQLQueryComplexity;

        // Calculate depth and fields in a single pass for performance
        const { depth, fields } = calculateQueryComplexity(document);

        // Validate fields (field count)
        if (maxGraphQLQueryComplexity.fields && fields > maxGraphQLQueryComplexity.fields) {
          throw new GraphQLError(
            `Number of fields selected exceeds maximum allowed`,
          );
        }

        // Validate maximum depth
        if (maxGraphQLQueryComplexity.depth && depth > maxGraphQLQueryComplexity.depth) {
          throw new GraphQLError(
            `Query depth exceeds maximum allowed depth`,
          );
        }
      },
    }),
  };
}
