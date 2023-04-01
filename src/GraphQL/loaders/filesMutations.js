import { GraphQLNonNull } from 'graphql';
import { mutationWithClientMutationId } from 'graphql-relay';
import Parse from 'parse/node';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import logger from '../../logger';

const handleUpload = async (upload, config) => {
  const data = Buffer.from(await upload.arrayBuffer());
  const fileName = upload.name;
  const type = upload.type;

  if (!data || !data.length) {
    throw new Parse.Error(Parse.Error.FILE_SAVE_ERROR, 'Invalid file upload.');
  }

  if (fileName.length > 128) {
    throw new Parse.Error(Parse.Error.INVALID_FILE_NAME, 'Filename too long.');
  }

  if (!fileName.match(/^[_a-zA-Z0-9][a-zA-Z0-9@\.\ ~_-]*$/)) {
    throw new Parse.Error(Parse.Error.INVALID_FILE_NAME, 'Filename contains invalid characters.');
  }

  try {
    return {
      fileInfo: await config.filesController.createFile(config, fileName, data, type),
    };
  } catch (e) {
    logger.error('Error creating a file: ', e);
    throw new Parse.Error(Parse.Error.FILE_SAVE_ERROR, `Could not store file: ${fileName}.`);
  }
};

const load = parseGraphQLSchema => {
  const createMutation = mutationWithClientMutationId({
    name: 'CreateFile',
    description: 'The createFile mutation can be used to create and upload a new file.',
    inputFields: {
      upload: {
        description: 'This is the new file to be created and uploaded.',
        type: new GraphQLNonNull(defaultGraphQLTypes.GraphQLUpload),
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
