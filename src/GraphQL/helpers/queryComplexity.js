import { GraphQLError } from 'graphql';

function calculateQueryComplexity(document, fragments) {
  let maxDepth = 0;
  let totalFields = 0;

  function visitSelectionSet(selectionSet, depth, visitedFragments) {
    if (!selectionSet) {
      return;
    }
    for (const selection of selectionSet.selections) {
      if (selection.kind === 'Field') {
        totalFields++;
        const newDepth = depth + 1;
        if (newDepth > maxDepth) {
          maxDepth = newDepth;
        }
        if (selection.selectionSet) {
          visitSelectionSet(selection.selectionSet, newDepth, visitedFragments);
        }
      } else if (selection.kind === 'InlineFragment') {
        visitSelectionSet(selection.selectionSet, depth, visitedFragments);
      } else if (selection.kind === 'FragmentSpread') {
        const name = selection.name.value;
        if (visitedFragments.has(name)) {
          continue;
        }
        const fragment = fragments[name];
        if (fragment) {
          const branchVisited = new Set(visitedFragments);
          branchVisited.add(name);
          visitSelectionSet(fragment.selectionSet, depth, branchVisited);
        }
      }
    }
  }

  for (const definition of document.definitions) {
    if (definition.kind === 'OperationDefinition') {
      visitSelectionSet(definition.selectionSet, 0, new Set());
    }
  }

  return { depth: maxDepth, fields: totalFields };
}

function createComplexityValidationPlugin(getConfig) {
  return {
    requestDidStart: (requestContext) => ({
      didResolveOperation: async () => {
        const auth = requestContext.contextValue?.auth;
        if (auth?.isMaster || auth?.isMaintenance) {
          return;
        }

        const config = getConfig();
        if (!config) {
          return;
        }

        const { graphQLDepth, graphQLFields } = config;
        if (graphQLDepth === -1 && graphQLFields === -1) {
          return;
        }

        const fragments = {};
        for (const definition of requestContext.document.definitions) {
          if (definition.kind === 'FragmentDefinition') {
            fragments[definition.name.value] = definition;
          }
        }

        const { depth, fields } = calculateQueryComplexity(
          requestContext.document,
          fragments
        );

        if (graphQLDepth !== -1 && depth > graphQLDepth) {
          throw new GraphQLError(
            `GraphQL query depth of ${depth} exceeds maximum allowed depth of ${graphQLDepth}`,
            {
              extensions: {
                http: { status: 400 },
              },
            }
          );
        }

        if (graphQLFields !== -1 && fields > graphQLFields) {
          throw new GraphQLError(
            `Number of GraphQL fields (${fields}) exceeds maximum allowed (${graphQLFields})`,
            {
              extensions: {
                http: { status: 400 },
              },
            }
          );
        }
      },
    }),
  };
}

export { calculateQueryComplexity, createComplexityValidationPlugin };
