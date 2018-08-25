import {
  GraphQLID,
  GraphQLNonNull,
  GraphQLInterfaceType,
} from 'graphql'

export const Node = new GraphQLInterfaceType({
  name: 'Node',
  fields: {
    id: {
      type: new GraphQLNonNull(GraphQLID)
    }
  }
});
