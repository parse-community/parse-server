import { GraphQLObjectType, GraphQLNonNull } from 'graphql';
import { GraphQLUpload } from 'graphql-upload';
import Parse from 'parse/node';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import logger from '../../logger';

const load = parseGraphQLSchema => {
  const fields = {};

  fields.create = {
    description:
      'The create mutation can be used to create and upload a new file.',
    args: {
      file: {
        description: 'This is the new file to be created and uploaded',
        type: new GraphQLNonNull(GraphQLUpload),
      },
    },
    type: new GraphQLNonNull(defaultGraphQLTypes.FILE_INFO),
    async resolve(_source, args, context) {
      try {
        const { file } = args;
        const { config } = context;

        const { createReadStream, filename, mimetype } = await file;
        let data = null;
        if (createReadStream) {
          const stream = createReadStream();
          data = await new Promise((resolve, reject) => {
            let data = '';
            stream
              .on('error', reject)
              .on('data', chunk => (data += chunk))
              .on('end', () => resolve(data));
          });
        }

        if (!data || !data.length) {
          throw new Parse.Error(
            Parse.Error.FILE_SAVE_ERROR,
            'Invalid file upload.'
          );
        }

        if (filename.length > 128) {
          throw new Parse.Error(
            Parse.Error.INVALID_FILE_NAME,
            'Filename too long.'
          );
        }

        if (!filename.match(/^[_a-zA-Z0-9][a-zA-Z0-9@\.\ ~_-]*$/)) {
          throw new Parse.Error(
            Parse.Error.INVALID_FILE_NAME,
            'Filename contains invalid characters.'
          );
        }

        try {
          return await config.filesController.createFile(
            config,
            filename,
            data,
            mimetype
          );
        } catch (e) {
          logger.error('Error creating a file: ', e);
          throw new Parse.Error(
            Parse.Error.FILE_SAVE_ERROR,
            `Could not store file: ${filename}.`
          );
        }
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    },
  };

  const filesMutation = new GraphQLObjectType({
    name: 'FilesMutation',
    description: 'FilesMutation is the top level type for files mutations.',
    fields,
  });
  parseGraphQLSchema.graphQLTypes.push(filesMutation);

  parseGraphQLSchema.graphQLMutations.files = {
    description: 'This is the top level for files mutations.',
    type: filesMutation,
    resolve: () => new Object(),
  };
};

export { load };
