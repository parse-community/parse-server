import * as objectsMutations from './objectsMutations';
import * as filesMutations from './filesMutations';
import * as usersMutations from './usersMutations';
import * as functionsMutations from './functionsMutations';
import * as classSchemaMutations from './classSchemaMutations';

const load = parseGraphQLSchema => {
  objectsMutations.load(parseGraphQLSchema);
  filesMutations.load(parseGraphQLSchema);
  usersMutations.load(parseGraphQLSchema);
  functionsMutations.load(parseGraphQLSchema);
  classSchemaMutations.load(parseGraphQLSchema);
};

export { load };
