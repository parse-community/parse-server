import { GraphQLNonNull } from 'graphql';
import { mutationWithClientMutationId } from 'graphql-relay';
import { GraphQLUpload } from '@graphql-tools/links';
import Parse from 'parse/node';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import logger from '../../logger';

const handleUpload = async (upload, config) => {
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
    throw new Parse.Error(Parse.Error.FILE_SAVE_ERROR, 'Invalid file upload.');
  }

  if (filename.length > 128) {
    throw new Parse.Error(Parse.Error.INVALID_FILE_NAME, 'Filename too long.');
  }

  if (!filename.match(/^[_a-zA-Z0-9][a-zA-Z0-9@\.\ ~_-]*$/)) {
    throw new Parse.Error(Parse.Error.INVALID_FILE_NAME, 'Filename contains invalid characters.');
  }

  try {
    return {
      fileInfo: await config.filesController.createFile(config, filename, data, mimetype),
    };
  } catch (e) {
    logger.error('Error creating a file: ', e);
    throw new Parse.Error(Parse.Error.FILE_SAVE_ERROR, `Could not store file: ${filename}.`);
  }
};

const load = parseGraphQLSchema => {
  const createMutation = mutationWithClientMutationId({
    name: 'CreateFile',
    description: 'The createFile mutation can be used to create and upload a new file.',
    inputFields: {
      upload: {
        description: 'This is the new file to be created and uploaded.',
        type: new GraphQLNonNull(GraphQLUpload),
      },
    },
    outputFields: {
      fileInfo: {
        description: 'This is the created file info.',
        type: new GraphQLNonNull(defaultGraphQLTypes.FILE_INFO),
      },
    },
    mutateAndGetPayload: async (args, context) => {
      try {
        const { upload } = args;
        const { config } = context;
        return handleUpload(upload, config);
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    },
  });

  parseGraphQLSchema.addGraphQLType(createMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(createMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('createFile', createMutation, true, true);
};

export { load, handleUpload };
