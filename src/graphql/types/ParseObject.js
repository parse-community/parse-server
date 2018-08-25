import {
  GraphQLID,
  GraphQLNonNull,
  GraphQLInterfaceType,
} from 'graphql'

import {
  type
} from './index';

export const ParseObjectInterface = new GraphQLInterfaceType({
  name: 'ParseObject',
  fields: {
    objectId: {
      type: new GraphQLNonNull(GraphQLID)
    },
    createdAt: {
      type: type({type: 'Date'})
    },
    updatedAt: {
      type: type({type: 'Date'})
    },
    ACL: {
      type: type({type: 'ACL'})
    }
  }
});
