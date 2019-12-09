"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

var _graphqlRelay = require("graphql-relay");

var _graphqlUpload = require("graphql-upload");

var _node = _interopRequireDefault(require("parse/node"));

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

var _logger = _interopRequireDefault(require("../../logger"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZmlsZXNNdXRhdGlvbnMuanMiXSwibmFtZXMiOlsibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsImNyZWF0ZU11dGF0aW9uIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiaW5wdXRGaWVsZHMiLCJ1cGxvYWQiLCJ0eXBlIiwiR3JhcGhRTE5vbk51bGwiLCJHcmFwaFFMVXBsb2FkIiwib3V0cHV0RmllbGRzIiwiZmlsZUluZm8iLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiRklMRV9JTkZPIiwibXV0YXRlQW5kR2V0UGF5bG9hZCIsImFyZ3MiLCJjb250ZXh0IiwiY29uZmlnIiwiY3JlYXRlUmVhZFN0cmVhbSIsImZpbGVuYW1lIiwibWltZXR5cGUiLCJkYXRhIiwic3RyZWFtIiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJjaHVua3MiLCJvbiIsImNodW5rIiwicHVzaCIsIkJ1ZmZlciIsImNvbmNhdCIsImxlbmd0aCIsIlBhcnNlIiwiRXJyb3IiLCJGSUxFX1NBVkVfRVJST1IiLCJJTlZBTElEX0ZJTEVfTkFNRSIsIm1hdGNoIiwiZmlsZXNDb250cm9sbGVyIiwiY3JlYXRlRmlsZSIsImUiLCJsb2dnZXIiLCJlcnJvciIsImhhbmRsZUVycm9yIiwiYWRkR3JhcGhRTFR5cGUiLCJpbnB1dCIsIm9mVHlwZSIsImFkZEdyYXBoUUxNdXRhdGlvbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQUVBLE1BQU1BLElBQUksR0FBR0Msa0JBQWtCLElBQUk7QUFDakMsUUFBTUMsY0FBYyxHQUFHLGdEQUE2QjtBQUNsREMsSUFBQUEsSUFBSSxFQUFFLFlBRDRDO0FBRWxEQyxJQUFBQSxXQUFXLEVBQ1Qsc0VBSGdEO0FBSWxEQyxJQUFBQSxXQUFXLEVBQUU7QUFDWEMsTUFBQUEsTUFBTSxFQUFFO0FBQ05GLFFBQUFBLFdBQVcsRUFBRSxrREFE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QyxjQUFuQixDQUFrQzFDLGNBQWMsQ0FBQ0ssSUFBakQsRUFBdUQsSUFBdkQsRUFBNkQsSUFBN0Q7QUFDQU4sRUFBQUEsa0JBQWtCLENBQUM4QyxrQkFBbkIsQ0FDRSxZQURGLEVBRUU3QyxjQUZGLEVBR0UsSUFIRixFQUlFLElBSkY7QUFNRCxDQTFGRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEdyYXBoUUxOb25OdWxsIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkIH0gZnJvbSAnZ3JhcGhxbC1yZWxheSc7XG5pbXBvcnQgeyBHcmFwaFFMVXBsb2FkIH0gZnJvbSAnZ3JhcGhxbC11cGxvYWQnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi8uLi9sb2dnZXInO1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgY29uc3QgY3JlYXRlTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnQ3JlYXRlRmlsZScsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIGNyZWF0ZUZpbGUgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gY3JlYXRlIGFuZCB1cGxvYWQgYSBuZXcgZmlsZS4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICB1cGxvYWQ6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBuZXcgZmlsZSB0byBiZSBjcmVhdGVkIGFuZCB1cGxvYWRlZC4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFVwbG9hZCksXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICBmaWxlSW5mbzoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGNyZWF0ZWQgZmlsZSBpbmZvLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChkZWZhdWx0R3JhcGhRTFR5cGVzLkZJTEVfSU5GTyksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgdXBsb2FkIH0gPSBhcmdzO1xuICAgICAgICBjb25zdCB7IGNvbmZpZyB9ID0gY29udGV4dDtcblxuICAgICAgICBjb25zdCB7IGNyZWF0ZVJlYWRTdHJlYW0sIGZpbGVuYW1lLCBtaW1ldHlwZSB9ID0gYXdhaXQgdXBsb2FkO1xuICAgICAgICBsZXQgZGF0YSA9IG51bGw7XG4gICAgICAgIGlmIChjcmVhdGVSZWFkU3RyZWFtKSB7XG4gICAgICAgICAgY29uc3Qgc3RyZWFtID0gY3JlYXRlUmVhZFN0cmVhbSgpO1xuICAgICAgICAgIGRhdGEgPSBhd2FpdCBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjaHVua3MgPSBbXTtcbiAgICAgICAgICAgIHN0cmVhbVxuICAgICAgICAgICAgICAub24oJ2Vycm9yJywgcmVqZWN0KVxuICAgICAgICAgICAgICAub24oJ2RhdGEnLCBjaHVuayA9PiBjaHVua3MucHVzaChjaHVuaykpXG4gICAgICAgICAgICAgIC5vbignZW5kJywgKCkgPT4gcmVzb2x2ZShCdWZmZXIuY29uY2F0KGNodW5rcykpKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghZGF0YSB8fCAhZGF0YS5sZW5ndGgpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsXG4gICAgICAgICAgICAnSW52YWxpZCBmaWxlIHVwbG9hZC4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChmaWxlbmFtZS5sZW5ndGggPiAxMjgpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0ZJTEVfTkFNRSxcbiAgICAgICAgICAgICdGaWxlbmFtZSB0b28gbG9uZy4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghZmlsZW5hbWUubWF0Y2goL15bX2EtekEtWjAtOV1bYS16QS1aMC05QFxcLlxcIH5fLV0qJC8pKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9GSUxFX05BTUUsXG4gICAgICAgICAgICAnRmlsZW5hbWUgY29udGFpbnMgaW52YWxpZCBjaGFyYWN0ZXJzLidcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgZmlsZUluZm86IGF3YWl0IGNvbmZpZy5maWxlc0NvbnRyb2xsZXIuY3JlYXRlRmlsZShcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBmaWxlbmFtZSxcbiAgICAgICAgICAgICAgZGF0YSxcbiAgICAgICAgICAgICAgbWltZXR5cGVcbiAgICAgICAgICAgICksXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIGxvZ2dlci5lcnJvcignRXJyb3IgY3JlYXRpbmcgYSBmaWxlOiAnLCBlKTtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsXG4gICAgICAgICAgICBgQ291bGQgbm90IHN0b3JlIGZpbGU6ICR7ZmlsZW5hbWV9LmBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgY3JlYXRlTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNyZWF0ZU11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKFxuICAgICdjcmVhdGVGaWxlJyxcbiAgICBjcmVhdGVNdXRhdGlvbixcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbn07XG5cbmV4cG9ydCB7IGxvYWQgfTtcbiJdfQ==