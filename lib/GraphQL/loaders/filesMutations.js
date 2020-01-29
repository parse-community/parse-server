"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.handleUpload = exports.load = void 0;

var _graphql = require("graphql");

var _graphqlRelay = require("graphql-relay");

var _graphqlUpload = require("graphql-upload");

var _node = _interopRequireDefault(require("parse/node"));

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

var _logger = _interopRequireDefault(require("../../logger"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const handleUpload = async (upload, config) => {
  const {
    createReadStream,
    filename,
    mimetype
  } = await upload;
  let data = null;

  if (createReadStream) {
    const stream = createReadStream();
    data = await new Promise((resolve, reject) => {
      const chunks = [];
      stream.on('error', reject).on('data', chunk => chunks.push(chunk)).on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  if (!data || !data.length) {
    throw new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, 'Invalid file upload.');
  }

  if (filename.length > 128) {
    throw new _node.default.Error(_node.default.Error.INVALID_FILE_NAME, 'Filename too long.');
  }

  if (!filename.match(/^[_a-zA-Z0-9][a-zA-Z0-9@\.\ ~_-]*$/)) {
    throw new _node.default.Error(_node.default.Error.INVALID_FILE_NAME, 'Filename contains invalid characters.');
  }

  try {
    return {
      fileInfo: await config.filesController.createFile(config, filename, data, mimetype)
    };
  } catch (e) {
    _logger.default.error('Error creating a file: ', e);

    throw new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, `Could not store file: ${filename}.`);
  }
};

exports.handleUpload = handleUpload;

const load = parseGraphQLSchema => {
  const createMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'CreateFile',
    description: 'The createFile mutation can be used to create and upload a new file.',
    inputFields: {
      upload: {
        description: 'This is the new file to be created and uploaded.',
        type: new _graphql.GraphQLNonNull(_graphqlUpload.GraphQLUpload)
      }
    },
    outputFields: {
      fileInfo: {
        description: 'This is the created file info.',
        type: new _graphql.GraphQLNonNull(defaultGraphQLTypes.FILE_INFO)
      }
    },
    mutateAndGetPayload: async (args, context) => {
      try {
        const {
          upload
        } = args;
        const {
          config
        } = context;
        return handleUpload(upload, config);
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(createMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(createMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('createFile', createMutation, true, true);
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZmlsZXNNdXRhdGlvbnMuanMiXSwibmFtZXMiOlsiaGFuZGxlVXBsb2FkIiwidXBsb2FkIiwiY29uZmlnIiwiY3JlYXRlUmVhZFN0cmVhbSIsImZpbGVuYW1lIiwibWltZXR5cGUiLCJkYXRhIiwic3RyZWFtIiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJjaHVua3MiLCJvbiIsImNodW5rIiwicHVzaCIsIkJ1ZmZlciIsImNvbmNhdCIsImxlbmd0aCIsIlBhcnNlIiwiRXJyb3IiLCJGSUxFX1NBVkVfRVJST1IiLCJJTlZBTElEX0ZJTEVfTkFNRSIsIm1hdGNoIiwiZmlsZUluZm8iLCJmaWxlc0NvbnRyb2xsZXIiLCJjcmVhdGVGaWxlIiwiZSIsImxvZ2dlciIsImVycm9yIiwibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsImNyZWF0ZU11dGF0aW9uIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiaW5wdXRGaWVsZHMiLCJ0eXBlIiwiR3JhcGhRTE5vbk51bGwiLCJHcmFwaFFMVXBsb2FkIiwib3V0cHV0RmllbGRzIiwiZGVmYXVsdEdyYXBoUUxUeXBlcyIsIkZJTEVfSU5GTyIsIm11dGF0ZUFuZEdldFBheWxvYWQiLCJhcmdzIiwiY29udGV4dCIsImhhbmRsZUVycm9yIiwiYWRkR3JhcGhRTFR5cGUiLCJpbnB1dCIsIm9mVHlwZSIsImFkZEdyYXBoUUxNdXRhdGlvbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQUVBLE1BQU1BLFlBQVksR0FBRyxPQUFPQyxNQUFQLEVBQWVDLE1BQWYsS0FBMEI7QUFDN0MsUUFBTTtBQUFFQyxJQUFBQSxnQkFBRjtBQUFvQkMsSUFBQUEsUUFBcEI7QUFBOEJDLElBQUFBO0FBQTlCLE1BQTJDLE1BQU1KLE1BQXZEO0FBQ0EsTUFBSUssSUFBSSxHQUFHLElBQVg7O0FBQ0EsTUFBSUgsZ0JBQUos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QkFBa0IsQ0FBQ2UsY0FBbkIsQ0FDRWQsY0FBYyxDQUFDVyxJQUFmLENBQW9CSSxLQUFwQixDQUEwQlgsSUFBMUIsQ0FBK0JZLE1BRGpDLEVBRUUsSUFGRixFQUdFLElBSEY7QUFLQWpCLEVBQUFBLGtCQUFrQixDQUFDZSxjQUFuQixDQUFrQ2QsY0FBYyxDQUFDSSxJQUFqRCxFQUF1RCxJQUF2RCxFQUE2RCxJQUE3RDtBQUNBTCxFQUFBQSxrQkFBa0IsQ0FBQ2tCLGtCQUFuQixDQUNFLFlBREYsRUFFRWpCLGNBRkYsRUFHRSxJQUhGLEVBSUUsSUFKRjtBQU1ELENBeENEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgR3JhcGhRTE5vbk51bGwgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQgfSBmcm9tICdncmFwaHFsLXJlbGF5JztcbmltcG9ydCB7IEdyYXBoUUxVcGxvYWQgfSBmcm9tICdncmFwaHFsLXVwbG9hZCc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4vZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uLy4uL2xvZ2dlcic7XG5cbmNvbnN0IGhhbmRsZVVwbG9hZCA9IGFzeW5jICh1cGxvYWQsIGNvbmZpZykgPT4ge1xuICBjb25zdCB7IGNyZWF0ZVJlYWRTdHJlYW0sIGZpbGVuYW1lLCBtaW1ldHlwZSB9ID0gYXdhaXQgdXBsb2FkO1xuICBsZXQgZGF0YSA9IG51bGw7XG4gIGlmIChjcmVhdGVSZWFkU3RyZWFtKSB7XG4gICAgY29uc3Qgc3RyZWFtID0gY3JlYXRlUmVhZFN0cmVhbSgpO1xuICAgIGRhdGEgPSBhd2FpdCBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBjb25zdCBjaHVua3MgPSBbXTtcbiAgICAgIHN0cmVhbVxuICAgICAgICAub24oJ2Vycm9yJywgcmVqZWN0KVxuICAgICAgICAub24oJ2RhdGEnLCBjaHVuayA9PiBjaHVua3MucHVzaChjaHVuaykpXG4gICAgICAgIC5vbignZW5kJywgKCkgPT4gcmVzb2x2ZShCdWZmZXIuY29uY2F0KGNodW5rcykpKTtcbiAgICB9KTtcbiAgfVxuXG4gIGlmICghZGF0YSB8fCAhZGF0YS5sZW5ndGgpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLCAnSW52YWxpZCBmaWxlIHVwbG9hZC4nKTtcbiAgfVxuXG4gIGlmIChmaWxlbmFtZS5sZW5ndGggPiAxMjgpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9GSUxFX05BTUUsICdGaWxlbmFtZSB0b28gbG9uZy4nKTtcbiAgfVxuXG4gIGlmICghZmlsZW5hbWUubWF0Y2goL15bX2EtekEtWjAtOV1bYS16QS1aMC05QFxcLlxcIH5fLV0qJC8pKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9GSUxFX05BTUUsXG4gICAgICAnRmlsZW5hbWUgY29udGFpbnMgaW52YWxpZCBjaGFyYWN0ZXJzLidcbiAgICApO1xuICB9XG5cbiAgdHJ5IHtcbiAgICByZXR1cm4ge1xuICAgICAgZmlsZUluZm86IGF3YWl0IGNvbmZpZy5maWxlc0NvbnRyb2xsZXIuY3JlYXRlRmlsZShcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBmaWxlbmFtZSxcbiAgICAgICAgZGF0YSxcbiAgICAgICAgbWltZXR5cGVcbiAgICAgICksXG4gICAgfTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGxvZ2dlci5lcnJvcignRXJyb3IgY3JlYXRpbmcgYSBmaWxlOiAnLCBlKTtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsXG4gICAgICBgQ291bGQgbm90IHN0b3JlIGZpbGU6ICR7ZmlsZW5hbWV9LmBcbiAgICApO1xuICB9XG59O1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgY29uc3QgY3JlYXRlTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnQ3JlYXRlRmlsZScsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIGNyZWF0ZUZpbGUgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gY3JlYXRlIGFuZCB1cGxvYWQgYSBuZXcgZmlsZS4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICB1cGxvYWQ6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBuZXcgZmlsZSB0byBiZSBjcmVhdGVkIGFuZCB1cGxvYWRlZC4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFVwbG9hZCksXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICBmaWxlSW5mbzoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGNyZWF0ZWQgZmlsZSBpbmZvLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChkZWZhdWx0R3JhcGhRTFR5cGVzLkZJTEVfSU5GTyksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgdXBsb2FkIH0gPSBhcmdzO1xuICAgICAgICBjb25zdCB7IGNvbmZpZyB9ID0gY29udGV4dDtcbiAgICAgICAgcmV0dXJuIGhhbmRsZVVwbG9hZCh1cGxvYWQsIGNvbmZpZyk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgY3JlYXRlTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNyZWF0ZU11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKFxuICAgICdjcmVhdGVGaWxlJyxcbiAgICBjcmVhdGVNdXRhdGlvbixcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbn07XG5cbmV4cG9ydCB7IGxvYWQsIGhhbmRsZVVwbG9hZCB9O1xuIl19