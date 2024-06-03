import { GraphQLNonNull } from 'graphql';
import { request } from 'http';
import { getExtension } from 'mime';
import { mutationWithClientMutationId } from 'graphql-relay';
import Parse from 'parse/node';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import logger from '../../logger';

// Handle GraphQL file upload and proxy file upload to GraphQL server url specified in config;
// `createFile` is not directly called by Parse Server to leverage standard file upload mechanism
const handleUpload = async (upload, config) => {
  const { createReadStream, filename, mimetype } = await upload;
  const headers = { ...config.headers };
  delete headers['accept-encoding'];
  delete headers['accept'];
  delete headers['connection'];
  delete headers['host'];
  delete headers['content-length'];
  const stream = createReadStream();
  try {
    const ext = getExtension(mimetype);
    const fullFileName = filename.endsWith(`.${ext}`) ? filename : `${filename}.${ext}`;
    const serverUrl = new URL(config.serverURL);
    const fileInfo = await new Promise((resolve, reject) => {
      const req = request(
        {
          hostname: serverUrl.hostname,
          port: serverUrl.port,
          path: `${serverUrl.pathname}/files/${fullFileName}`,
          method: 'POST',
          headers,
        },
        res => {
          let data = '';
          res.on('data', chunk => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Parse.Error(Parse.error, data));
            }
          });
        }
      );
      stream.pipe(req);
      stream.on('end', () => {
        req.end();
      });
    });
    return {
      fileInfo,
    };
  } catch (e) {
    stream.destroy();
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
