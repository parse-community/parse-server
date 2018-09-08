import {
  GraphQLList,
  GraphQLString,
  GraphQLObjectType,
  GraphQLInputObjectType,
} from 'graphql';

const aclFields = {
  read: {
    type: new GraphQLList(GraphQLString),
    description: 'list of allowed users, roles for read',
  },
  write: {
    type: new GraphQLList(GraphQLString),
    description: 'list of allowed users, roles for write',
  },
};

export const ACL = new GraphQLObjectType({
  name: 'ACL',
  fields: aclFields,
});

export const ACLInput = new GraphQLInputObjectType({
  name: 'ACLInput',
  fields: aclFields,
});

export function toParseACL(graphqlACL) {
  const { read, write } = graphqlACL;
  let ACL = {};
  const reducer = perm => {
    return (memo, key) => {
      memo[key] = memo[key] || {};
      memo[key][perm] = true;
      return memo;
    };
  };
  if (read) {
    ACL = read.reduce(reducer('read'), ACL);
  }
  if (write) {
    ACL = write.reduce(reducer('write'), ACL);
  }
  return ACL;
}

export function toGraphQLACL(parseACL) {
  return Object.keys(parseACL).reduce((memo, id) => {
    const perm = parseACL[id];
    if (perm.read) {
      memo.read = memo.read || [];
      memo.read.push(id);
    }
    if (perm.write) {
      memo.write = memo.write || [];
      memo.write.push(id);
    }
    return memo;
  }, {});
}
