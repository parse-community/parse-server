"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.handleUpload = exports.load = void 0;

var _graphql = require("graphql");

var _graphqlRelay = require("graphql-relay");

var _links = require("@graphql-tools/links");

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
        type: new _graphql.GraphQLNonNull(_links.GraphQLUpload)
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZmlsZXNNdXRhdGlvbnMuanMiXSwibmFtZXMiOlsiaGFuZGxlVXBsb2FkIiwidXBsb2FkIiwiY29uZmlnIiwiY3JlYXRlUmVhZFN0cmVhbSIsImZpbGVuYW1lIiwibWltZXR5cGUiLCJkYXRhIiwic3RyZWFtIiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJjaHVua3MiLCJvbiIsImNodW5rIiwicHVzaCIsIkJ1ZmZlciIsImNvbmNhdCIsImxlbmd0aCIsIlBhcnNlIiwiRXJyb3IiLCJGSUxFX1NBVkVfRVJST1IiLCJJTlZBTElEX0ZJTEVfTkFNRSIsIm1hdGNoIiwiZmlsZUluZm8iLCJmaWxlc0NvbnRyb2xsZXIiLCJjcmVhdGVGaWxlIiwiZSIsImxvZ2dlciIsImVycm9yIiwibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsImNyZWF0ZU11dGF0aW9uIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiaW5wdXRGaWVsZHMiLCJ0eXBlIiwiR3JhcGhRTE5vbk51bGwiLCJHcmFwaFFMVXBsb2FkIiwib3V0cHV0RmllbGRzIiwiZGVmYXVsdEdyYXBoUUxUeXBlcyIsIkZJTEVfSU5GTyIsIm11dGF0ZUFuZEdldFBheWxvYWQiLCJhcmdzIiwiY29udGV4dCIsImhhbmRsZUVycm9yIiwiYWRkR3JhcGhRTFR5cGUiLCJpbnB1dCIsIm9mVHlwZSIsImFkZEdyYXBoUUxNdXRhdGlvbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQUVBLE1BQU1BLFlBQVksR0FBRyxPQUFPQyxNQUFQLEVBQWVDLE1BQWYsS0FBMEI7QUFDN0MsUUFBTTtBQUFFQyxJQUFBQSxnQkFBRjtBQUFvQkMsSUFBQUEsUUFBcEI7QUFBOEJDLElBQUFBO0FBQTlCLE1BQTJDLE1BQU1KLE1BQXZEO0FBQ0EsTUFBSUssSUFBSSxHQUFHLElBQVg7O0FBQ0EsTUFBSUgsZ0JBQUos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QUEwQkFJLEVBQUFBLGtCQUFrQixDQUFDZSxjQUFuQixDQUFrQ2QsY0FBYyxDQUFDVyxJQUFmLENBQW9CSSxLQUFwQixDQUEwQlgsSUFBMUIsQ0FBK0JZLE1BQWpFLEVBQXlFLElBQXpFLEVBQStFLElBQS9FO0FBQ0FqQixFQUFBQSxrQkFBa0IsQ0FBQ2UsY0FBbkIsQ0FBa0NkLGNBQWMsQ0FBQ0ksSUFBakQsRUFBdUQsSUFBdkQsRUFBNkQsSUFBN0Q7QUFDQUwsRUFBQUEsa0JBQWtCLENBQUNrQixrQkFBbkIsQ0FBc0MsWUFBdEMsRUFBb0RqQixjQUFwRCxFQUFvRSxJQUFwRSxFQUEwRSxJQUExRTtBQUNELENBOUJEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgR3JhcGhRTE5vbk51bGwgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQgfSBmcm9tICdncmFwaHFsLXJlbGF5JztcbmltcG9ydCB7IEdyYXBoUUxVcGxvYWQgfSBmcm9tICdAZ3JhcGhxbC10b29scy9saW5rcyc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4vZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uLy4uL2xvZ2dlcic7XG5cbmNvbnN0IGhhbmRsZVVwbG9hZCA9IGFzeW5jICh1cGxvYWQsIGNvbmZpZykgPT4ge1xuICBjb25zdCB7IGNyZWF0ZVJlYWRTdHJlYW0sIGZpbGVuYW1lLCBtaW1ldHlwZSB9ID0gYXdhaXQgdXBsb2FkO1xuICBsZXQgZGF0YSA9IG51bGw7XG4gIGlmIChjcmVhdGVSZWFkU3RyZWFtKSB7XG4gICAgY29uc3Qgc3RyZWFtID0gY3JlYXRlUmVhZFN0cmVhbSgpO1xuICAgIGRhdGEgPSBhd2FpdCBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBjb25zdCBjaHVua3MgPSBbXTtcbiAgICAgIHN0cmVhbVxuICAgICAgICAub24oJ2Vycm9yJywgcmVqZWN0KVxuICAgICAgICAub24oJ2RhdGEnLCBjaHVuayA9PiBjaHVua3MucHVzaChjaHVuaykpXG4gICAgICAgIC5vbignZW5kJywgKCkgPT4gcmVzb2x2ZShCdWZmZXIuY29uY2F0KGNodW5rcykpKTtcbiAgICB9KTtcbiAgfVxuXG4gIGlmICghZGF0YSB8fCAhZGF0YS5sZW5ndGgpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLCAnSW52YWxpZCBmaWxlIHVwbG9hZC4nKTtcbiAgfVxuXG4gIGlmIChmaWxlbmFtZS5sZW5ndGggPiAxMjgpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9GSUxFX05BTUUsICdGaWxlbmFtZSB0b28gbG9uZy4nKTtcbiAgfVxuXG4gIGlmICghZmlsZW5hbWUubWF0Y2goL15bX2EtekEtWjAtOV1bYS16QS1aMC05QFxcLlxcIH5fLV0qJC8pKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfRklMRV9OQU1FLCAnRmlsZW5hbWUgY29udGFpbnMgaW52YWxpZCBjaGFyYWN0ZXJzLicpO1xuICB9XG5cbiAgdHJ5IHtcbiAgICByZXR1cm4ge1xuICAgICAgZmlsZUluZm86IGF3YWl0IGNvbmZpZy5maWxlc0NvbnRyb2xsZXIuY3JlYXRlRmlsZShjb25maWcsIGZpbGVuYW1lLCBkYXRhLCBtaW1ldHlwZSksXG4gICAgfTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGxvZ2dlci5lcnJvcignRXJyb3IgY3JlYXRpbmcgYSBmaWxlOiAnLCBlKTtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLCBgQ291bGQgbm90IHN0b3JlIGZpbGU6ICR7ZmlsZW5hbWV9LmApO1xuICB9XG59O1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgY29uc3QgY3JlYXRlTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnQ3JlYXRlRmlsZScsXG4gICAgZGVzY3JpcHRpb246ICdUaGUgY3JlYXRlRmlsZSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBjcmVhdGUgYW5kIHVwbG9hZCBhIG5ldyBmaWxlLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIHVwbG9hZDoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIG5ldyBmaWxlIHRvIGJlIGNyZWF0ZWQgYW5kIHVwbG9hZGVkLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMVXBsb2FkKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIGZpbGVJbmZvOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgY3JlYXRlZCBmaWxlIGluZm8uJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKGRlZmF1bHRHcmFwaFFMVHlwZXMuRklMRV9JTkZPKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyB1cGxvYWQgfSA9IGFyZ3M7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnIH0gPSBjb250ZXh0O1xuICAgICAgICByZXR1cm4gaGFuZGxlVXBsb2FkKHVwbG9hZCwgY29uZmlnKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjcmVhdGVNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNyZWF0ZU11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdjcmVhdGVGaWxlJywgY3JlYXRlTXV0YXRpb24sIHRydWUsIHRydWUpO1xufTtcblxuZXhwb3J0IHsgbG9hZCwgaGFuZGxlVXBsb2FkIH07XG4iXX0=