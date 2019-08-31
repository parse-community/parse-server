import * as filesMutations from './filesMutations';
import * as usersMutations from './usersMutations';
import * as functionsMutations from './functionsMutations';
import * as classSchemaMutations from './schemaMutations';

const load = parseGraphQLSchema => {
  filesMutations.load(parseGraphQLSchema);
  usersMutations.load(parseGraphQLSchema);
  functionsMutations.load(parseGraphQLSchema);
  classSchemaMutations.load(parseGraphQLSchema);
};

export { load };
