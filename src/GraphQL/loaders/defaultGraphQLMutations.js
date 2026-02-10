import * as filesMutations from './filesMutations';
import * as usersMutations from './usersMutations';
import * as functionsMutations from './functionsMutations';
import * as schemaMutations from './schemaMutations';
import * as configMutations from './configMutations';

const load = parseGraphQLSchema => {
  filesMutations.load(parseGraphQLSchema);
  usersMutations.load(parseGraphQLSchema);
  functionsMutations.load(parseGraphQLSchema);
  schemaMutations.load(parseGraphQLSchema);
  configMutations.load(parseGraphQLSchema);
};

export { load };
