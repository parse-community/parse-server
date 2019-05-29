import * as objectsMutations from './objectsMutations';
import * as filesMutations from './filesMutations';

const load = parseGraphQLSchema => {
  objectsMutations.load(parseGraphQLSchema);
  filesMutations.load(parseGraphQLSchema);
};

export { load };
