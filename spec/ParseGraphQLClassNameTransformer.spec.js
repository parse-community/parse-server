const { transformClassNameToGraphQL } = require('../lib/GraphQL/transformers/className');

describe('transformClassNameToGraphQL', () => {
  it('should remove starting _ and tansform first letter to upper case', () => {
    expect(['_User', '_user', 'User', 'user'].map(transformClassNameToGraphQL)).toEqual([
      'User',
      'User',
      'User',
      'User',
    ]);
  });
});
