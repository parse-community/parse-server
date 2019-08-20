import { GraphQLNonNull } from 'graphql';
import { GraphQLUpload } from 'graphql-upload';
import Parse from 'parse/node';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import logger from '../../logger';

const load = parseGraphQLSchema => {
  parseGraphQLSchema.addGraphQLMutation(
    'createFile',
    {
      description:
        'The create mutation can be used to create and upload a new file.',
      args: {
        upload: {
          description: 'This is the new file to be created and uploaded',
          type: new GraphQLNonNull(GraphQLUpload),
        },
      },
      type: new GraphQLNonNull(defaultGraphQLTypes.FILE_INFO),
      async resolve(_source, args, context) {
        try {
          const { upload } = args;
          const { config } = context;

          const { createReadStream, filename, mimetype } = await upload;
          let data = null;
          if (createReadStream) {
            const stream = createReadStream();
            data = await new Promise((resolve, reject) => {
              const chunks = [];
              stream
                .on('error', reject)
                .on('data', chunk => chunks.push(chunk))
                .on('end', () => resolve(Buffer.concat(chunks)));
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
    },
    true,
    true
  );
};

export { load };
