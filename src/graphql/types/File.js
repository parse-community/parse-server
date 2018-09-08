import {
  GraphQLObjectType,
  GraphQLInputObjectType,
  GraphQLString,
} from 'graphql';

export const File = new GraphQLObjectType({
  name: 'File',
  fields: {
    name: {
      type: GraphQLString,
      name: 'name',
      description: 'name of the file',
    },
    url: {
      type: GraphQLString,
      name: 'url',
      description: 'url of the file',
    },
  },
});

export const FileInput = new GraphQLInputObjectType({
  name: 'FileInput',
  fields: {
    name: {
      type: GraphQLString,
      description: 'name of the file',
    },
    base64: {
      type: GraphQLString,
      description: 'the base 64 encoded contents of the file',
    },
    contentType: {
      type: GraphQLString,
      description: 'the content type of the file. Optional',
    },
  },
});
