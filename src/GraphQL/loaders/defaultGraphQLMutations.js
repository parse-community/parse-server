import * as objectsMutations from './objectsMutations';
import * as filesMutations from './filesMutations';
import * as usersMutations from './usersMutations';

const load = parseGraphQLSchema => {
  objectsMutations.load(parseGraphQLSchema);
  filesMutations.load(parseGraphQLSchema);
  usersMutations.load(parseGraphQLSchema);
};

export { load };
