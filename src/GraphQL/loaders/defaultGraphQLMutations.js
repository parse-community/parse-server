import * as objectsMutations from './objectsMutations';

const load = parseGraphQLSchema => {
  objectsMutations.load(parseGraphQLSchema);
};

export { load };
