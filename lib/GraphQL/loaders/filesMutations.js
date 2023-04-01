"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = exports.handleUpload = void 0;
var _graphql = require("graphql");
var _graphqlRelay = require("graphql-relay");
var _node = _interopRequireDefault(require("parse/node"));
var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));
var _logger = _interopRequireDefault(require("../../logger"));
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const handleUpload = async (upload, config) => {
  const data = Buffer.from(await upload.arrayBuffer());
  const fileName = upload.name;
  const type = upload.type;
  if (!data || !data.length) {
    throw new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, 'Invalid file upload.');
  }
  if (fileName.length > 128) {
    throw new _node.default.Error(_node.default.Error.INVALID_FILE_NAME, 'Filename too long.');
  }
  if (!fileName.match(/^[_a-zA-Z0-9][a-zA-Z0-9@\.\ ~_-]*$/)) {
    throw new _node.default.Error(_node.default.Error.INVALID_FILE_NAME, 'Filename contains invalid characters.');
  }
  try {
    return {
      fileInfo: await config.filesController.createFile(config, fileName, data, type)
    };
  } catch (e) {
    _logger.default.error('Error creating a file: ', e);
    throw new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, `Could not store file: ${fileName}.`);
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
        type: new _graphql.GraphQLNonNull(defaultGraphQLTypes.GraphQLUpload)
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJoYW5kbGVVcGxvYWQiLCJ1cGxvYWQiLCJjb25maWciLCJkYXRhIiwiQnVmZmVyIiwiZnJvbSIsImFycmF5QnVmZmVyIiwiZmlsZU5hbWUiLCJuYW1lIiwidHlwZSIsImxlbmd0aCIsIlBhcnNlIiwiRXJyb3IiLCJGSUxFX1NBVkVfRVJST1IiLCJJTlZBTElEX0ZJTEVfTkFNRSIsIm1hdGNoIiwiZmlsZUluZm8iLCJmaWxlc0NvbnRyb2xsZXIiLCJjcmVhdGVGaWxlIiwiZSIsImxvZ2dlciIsImVycm9yIiwibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsImNyZWF0ZU11dGF0aW9uIiwibXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCIsImRlc2NyaXB0aW9uIiwiaW5wdXRGaWVsZHMiLCJHcmFwaFFMTm9uTnVsbCIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJHcmFwaFFMVXBsb2FkIiwib3V0cHV0RmllbGRzIiwiRklMRV9JTkZPIiwibXV0YXRlQW5kR2V0UGF5bG9hZCIsImFyZ3MiLCJjb250ZXh0IiwiaGFuZGxlRXJyb3IiLCJhZGRHcmFwaFFMVHlwZSIsImlucHV0Iiwib2ZUeXBlIiwiYWRkR3JhcGhRTE11dGF0aW9uIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0dyYXBoUUwvbG9hZGVycy9maWxlc011dGF0aW9ucy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBHcmFwaFFMTm9uTnVsbCB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi8uLi9sb2dnZXInO1xuXG5jb25zdCBoYW5kbGVVcGxvYWQgPSBhc3luYyAodXBsb2FkLCBjb25maWcpID0+IHtcbiAgY29uc3QgZGF0YSA9IEJ1ZmZlci5mcm9tKGF3YWl0IHVwbG9hZC5hcnJheUJ1ZmZlcigpKTtcbiAgY29uc3QgZmlsZU5hbWUgPSB1cGxvYWQubmFtZTtcbiAgY29uc3QgdHlwZSA9IHVwbG9hZC50eXBlO1xuXG4gIGlmICghZGF0YSB8fCAhZGF0YS5sZW5ndGgpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLCAnSW52YWxpZCBmaWxlIHVwbG9hZC4nKTtcbiAgfVxuXG4gIGlmIChmaWxlTmFtZS5sZW5ndGggPiAxMjgpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9GSUxFX05BTUUsICdGaWxlbmFtZSB0b28gbG9uZy4nKTtcbiAgfVxuXG4gIGlmICghZmlsZU5hbWUubWF0Y2goL15bX2EtekEtWjAtOV1bYS16QS1aMC05QFxcLlxcIH5fLV0qJC8pKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfRklMRV9OQU1FLCAnRmlsZW5hbWUgY29udGFpbnMgaW52YWxpZCBjaGFyYWN0ZXJzLicpO1xuICB9XG5cbiAgdHJ5IHtcbiAgICByZXR1cm4ge1xuICAgICAgZmlsZUluZm86IGF3YWl0IGNvbmZpZy5maWxlc0NvbnRyb2xsZXIuY3JlYXRlRmlsZShjb25maWcsIGZpbGVOYW1lLCBkYXRhLCB0eXBlKSxcbiAgICB9O1xuICB9IGNhdGNoIChlKSB7XG4gICAgbG9nZ2VyLmVycm9yKCdFcnJvciBjcmVhdGluZyBhIGZpbGU6ICcsIGUpO1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsIGBDb3VsZCBub3Qgc3RvcmUgZmlsZTogJHtmaWxlTmFtZX0uYCk7XG4gIH1cbn07XG5cbmNvbnN0IGxvYWQgPSBwYXJzZUdyYXBoUUxTY2hlbWEgPT4ge1xuICBjb25zdCBjcmVhdGVNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdDcmVhdGVGaWxlJyxcbiAgICBkZXNjcmlwdGlvbjogJ1RoZSBjcmVhdGVGaWxlIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGNyZWF0ZSBhbmQgdXBsb2FkIGEgbmV3IGZpbGUuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgdXBsb2FkOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbmV3IGZpbGUgdG8gYmUgY3JlYXRlZCBhbmQgdXBsb2FkZWQuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKGRlZmF1bHRHcmFwaFFMVHlwZXMuR3JhcGhRTFVwbG9hZCksXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICBmaWxlSW5mbzoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGNyZWF0ZWQgZmlsZSBpbmZvLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChkZWZhdWx0R3JhcGhRTFR5cGVzLkZJTEVfSU5GTyksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgdXBsb2FkIH0gPSBhcmdzO1xuICAgICAgICBjb25zdCB7IGNvbmZpZyB9ID0gY29udGV4dDtcbiAgICAgICAgcmV0dXJuIGhhbmRsZVVwbG9hZCh1cGxvYWQsIGNvbmZpZyk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY3JlYXRlTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjcmVhdGVNdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbignY3JlYXRlRmlsZScsIGNyZWF0ZU11dGF0aW9uLCB0cnVlLCB0cnVlKTtcbn07XG5cbmV4cG9ydCB7IGxvYWQsIGhhbmRsZVVwbG9hZCB9O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQWtDO0FBQUE7QUFBQTtBQUVsQyxNQUFNQSxZQUFZLEdBQUcsT0FBT0MsTUFBTSxFQUFFQyxNQUFNLEtBQUs7RUFDN0MsTUFBTUMsSUFBSSxHQUFHQyxNQUFNLENBQUNDLElBQUksQ0FBQyxNQUFNSixNQUFNLENBQUNLLFdBQVcsRUFBRSxDQUFDO0VBQ3BELE1BQU1DLFFBQVEsR0FBR04sTUFBTSxDQUFDTyxJQUFJO0VBQzVCLE1BQU1DLElBQUksR0FBR1IsTUFBTSxDQUFDUSxJQUFJO0VBRXhCLElBQUksQ0FBQ04sSUFBSSxJQUFJLENBQUNBLElBQUksQ0FBQ08sTUFBTSxFQUFFO0lBQ3pCLE1BQU0sSUFBSUMsYUFBSyxDQUFDQyxLQUFLLENBQUNELGFBQUssQ0FBQ0MsS0FBSyxDQUFDQyxlQUFlLEVBQUUsc0JBQXNCLENBQUM7RUFDNUU7RUFFQSxJQUFJTixRQUFRLENBQUNHLE1BQU0sR0FBRyxHQUFHLEVBQUU7SUFDekIsTUFBTSxJQUFJQyxhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUNFLGlCQUFpQixFQUFFLG9CQUFvQixDQUFDO0VBQzVFO0VBRUEsSUFBSSxDQUFDUCxRQUFRLENBQUNRLEtBQUssQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFO0lBQ3pELE1BQU0sSUFBSUosYUFBSyxDQUFDQyxLQUFLLENBQUNELGFBQUssQ0FBQ0MsS0FBSyxDQUFDRSxpQkFBaUIsRUFBRSx1Q0FBdUMsQ0FBQztFQUMvRjtFQUVBLElBQUk7SUFDRixPQUFPO01BQ0xFLFFBQVEsRUFBRSxNQUFNZCxNQUFNLENBQUNlLGVBQWUsQ0FBQ0MsVUFBVSxDQUFDaEIsTUFBTSxFQUFFSyxRQUFRLEVBQUVKLElBQUksRUFBRU0sSUFBSTtJQUNoRixDQUFDO0VBQ0gsQ0FBQyxDQUFDLE9BQU9VLENBQUMsRUFBRTtJQUNWQyxlQUFNLENBQUNDLEtBQUssQ0FBQyx5QkFBeUIsRUFBRUYsQ0FBQyxDQUFDO0lBQzFDLE1BQU0sSUFBSVIsYUFBSyxDQUFDQyxLQUFLLENBQUNELGFBQUssQ0FBQ0MsS0FBSyxDQUFDQyxlQUFlLEVBQUcseUJBQXdCTixRQUFTLEdBQUUsQ0FBQztFQUMxRjtBQUNGLENBQUM7QUFBQztBQUVGLE1BQU1lLElBQUksR0FBR0Msa0JBQWtCLElBQUk7RUFDakMsTUFBTUMsY0FBYyxHQUFHLElBQUFDLDBDQUE0QixFQUFDO0lBQ2xEakIsSUFBSSxFQUFFLFlBQVk7SUFDbEJrQixXQUFXLEVBQUUsc0VBQXNFO0lBQ25GQyxXQUFXLEVBQUU7TUFDWDFCLE1BQU0sRUFBRTtRQUNOeUIsV0FBVyxFQUFFLGtEQUFrRDtRQUMvRGpCLElBQUksRUFBRSxJQUFJbUIsdUJBQWMsQ0FBQ0MsbUJBQW1CLENBQUNDLGFBQWE7TUFDNUQ7SUFDRixDQUFDO0lBQ0RDLFlBQVksRUFBRTtNQUNaZixRQUFRLEVBQUU7UUFDUlUsV0FBVyxFQUFFLGdDQUFnQztRQUM3Q2pCLElBQUksRUFBRSxJQUFJbUIsdUJBQWMsQ0FBQ0MsbUJBQW1CLENBQUNHLFNBQVM7TUFDeEQ7SUFDRixDQUFDO0lBQ0RDLG1CQUFtQixFQUFFLE9BQU9DLElBQUksRUFBRUMsT0FBTyxLQUFLO01BQzVDLElBQUk7UUFDRixNQUFNO1VBQUVsQztRQUFPLENBQUMsR0FBR2lDLElBQUk7UUFDdkIsTUFBTTtVQUFFaEM7UUFBTyxDQUFDLEdBQUdpQyxPQUFPO1FBQzFCLE9BQU9uQyxZQUFZLENBQUNDLE1BQU0sRUFBRUMsTUFBTSxDQUFDO01BQ3JDLENBQUMsQ0FBQyxPQUFPaUIsQ0FBQyxFQUFFO1FBQ1ZJLGtCQUFrQixDQUFDYSxXQUFXLENBQUNqQixDQUFDLENBQUM7TUFDbkM7SUFDRjtFQUNGLENBQUMsQ0FBQztFQUVGSSxrQkFBa0IsQ0FBQ2MsY0FBYyxDQUFDYixjQUFjLENBQUNVLElBQUksQ0FBQ0ksS0FBSyxDQUFDN0IsSUFBSSxDQUFDOEIsTUFBTSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUM7RUFDcEZoQixrQkFBa0IsQ0FBQ2MsY0FBYyxDQUFDYixjQUFjLENBQUNmLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDO0VBQ2xFYyxrQkFBa0IsQ0FBQ2lCLGtCQUFrQixDQUFDLFlBQVksRUFBRWhCLGNBQWMsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDO0FBQ2pGLENBQUM7QUFBQyJ9