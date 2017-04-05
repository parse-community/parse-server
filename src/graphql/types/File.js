import {
  GraphQLObjectType,
  GraphQLString
} from 'graphql'

export const GraphQLFile = new GraphQLObjectType({
  name: 'File',
  fields: {
    name: {
      type: GraphQLString,
      name: 'name',
      description: 'name of the file'
    },
    url: {
      type: GraphQLString,
      name: 'url',
      description: 'url of the file'
    }
  }
});
