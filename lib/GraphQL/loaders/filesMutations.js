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
  const data = Buffer.from(upload.arrayBuffer ? await upload.arrayBuffer() : upload.blobParts);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJoYW5kbGVVcGxvYWQiLCJ1cGxvYWQiLCJjb25maWciLCJkYXRhIiwiQnVmZmVyIiwiZnJvbSIsImFycmF5QnVmZmVyIiwiYmxvYlBhcnRzIiwiZmlsZU5hbWUiLCJuYW1lIiwidHlwZSIsImxlbmd0aCIsIlBhcnNlIiwiRXJyb3IiLCJGSUxFX1NBVkVfRVJST1IiLCJJTlZBTElEX0ZJTEVfTkFNRSIsIm1hdGNoIiwiZmlsZUluZm8iLCJmaWxlc0NvbnRyb2xsZXIiLCJjcmVhdGVGaWxlIiwiZSIsImxvZ2dlciIsImVycm9yIiwibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsImNyZWF0ZU11dGF0aW9uIiwibXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCIsImRlc2NyaXB0aW9uIiwiaW5wdXRGaWVsZHMiLCJHcmFwaFFMTm9uTnVsbCIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJHcmFwaFFMVXBsb2FkIiwib3V0cHV0RmllbGRzIiwiRklMRV9JTkZPIiwibXV0YXRlQW5kR2V0UGF5bG9hZCIsImFyZ3MiLCJjb250ZXh0IiwiaGFuZGxlRXJyb3IiLCJhZGRHcmFwaFFMVHlwZSIsImlucHV0Iiwib2ZUeXBlIiwiYWRkR3JhcGhRTE11dGF0aW9uIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0dyYXBoUUwvbG9hZGVycy9maWxlc011dGF0aW9ucy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBHcmFwaFFMTm9uTnVsbCB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi8uLi9sb2dnZXInO1xuXG5jb25zdCBoYW5kbGVVcGxvYWQgPSBhc3luYyAodXBsb2FkLCBjb25maWcpID0+IHtcbiAgY29uc3QgZGF0YSA9IEJ1ZmZlci5mcm9tKHVwbG9hZC5hcnJheUJ1ZmZlciA/IGF3YWl0IHVwbG9hZC5hcnJheUJ1ZmZlcigpIDogdXBsb2FkLmJsb2JQYXJ0cyk7XG4gIGNvbnN0IGZpbGVOYW1lID0gdXBsb2FkLm5hbWU7XG4gIGNvbnN0IHR5cGUgPSB1cGxvYWQudHlwZTtcblxuICBpZiAoIWRhdGEgfHwgIWRhdGEubGVuZ3RoKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkZJTEVfU0FWRV9FUlJPUiwgJ0ludmFsaWQgZmlsZSB1cGxvYWQuJyk7XG4gIH1cblxuICBpZiAoZmlsZU5hbWUubGVuZ3RoID4gMTI4KSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfRklMRV9OQU1FLCAnRmlsZW5hbWUgdG9vIGxvbmcuJyk7XG4gIH1cblxuICBpZiAoIWZpbGVOYW1lLm1hdGNoKC9eW19hLXpBLVowLTldW2EtekEtWjAtOUBcXC5cXCB+Xy1dKiQvKSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0ZJTEVfTkFNRSwgJ0ZpbGVuYW1lIGNvbnRhaW5zIGludmFsaWQgY2hhcmFjdGVycy4nKTtcbiAgfVxuXG4gIHRyeSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGZpbGVJbmZvOiBhd2FpdCBjb25maWcuZmlsZXNDb250cm9sbGVyLmNyZWF0ZUZpbGUoY29uZmlnLCBmaWxlTmFtZSwgZGF0YSwgdHlwZSksXG4gICAgfTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGxvZ2dlci5lcnJvcignRXJyb3IgY3JlYXRpbmcgYSBmaWxlOiAnLCBlKTtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLCBgQ291bGQgbm90IHN0b3JlIGZpbGU6ICR7ZmlsZU5hbWV9LmApO1xuICB9XG59O1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgY29uc3QgY3JlYXRlTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnQ3JlYXRlRmlsZScsXG4gICAgZGVzY3JpcHRpb246ICdUaGUgY3JlYXRlRmlsZSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBjcmVhdGUgYW5kIHVwbG9hZCBhIG5ldyBmaWxlLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIHVwbG9hZDoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIG5ldyBmaWxlIHRvIGJlIGNyZWF0ZWQgYW5kIHVwbG9hZGVkLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChkZWZhdWx0R3JhcGhRTFR5cGVzLkdyYXBoUUxVcGxvYWQpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgZmlsZUluZm86IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBjcmVhdGVkIGZpbGUgaW5mby4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoZGVmYXVsdEdyYXBoUUxUeXBlcy5GSUxFX0lORk8pLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0KSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IHVwbG9hZCB9ID0gYXJncztcbiAgICAgICAgY29uc3QgeyBjb25maWcgfSA9IGNvbnRleHQ7XG4gICAgICAgIHJldHVybiBoYW5kbGVVcGxvYWQodXBsb2FkLCBjb25maWcpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNyZWF0ZU11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY3JlYXRlTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oJ2NyZWF0ZUZpbGUnLCBjcmVhdGVNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG59O1xuXG5leHBvcnQgeyBsb2FkLCBoYW5kbGVVcGxvYWQgfTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFrQztBQUFBO0FBQUE7QUFFbEMsTUFBTUEsWUFBWSxHQUFHLE9BQU9DLE1BQU0sRUFBRUMsTUFBTSxLQUFLO0VBQzdDLE1BQU1DLElBQUksR0FBR0MsTUFBTSxDQUFDQyxJQUFJLENBQUNKLE1BQU0sQ0FBQ0ssV0FBVyxHQUFHLE1BQU1MLE1BQU0sQ0FBQ0ssV0FBVyxFQUFFLEdBQUdMLE1BQU0sQ0FBQ00sU0FBUyxDQUFDO0VBQzVGLE1BQU1DLFFBQVEsR0FBR1AsTUFBTSxDQUFDUSxJQUFJO0VBQzVCLE1BQU1DLElBQUksR0FBR1QsTUFBTSxDQUFDUyxJQUFJO0VBRXhCLElBQUksQ0FBQ1AsSUFBSSxJQUFJLENBQUNBLElBQUksQ0FBQ1EsTUFBTSxFQUFFO0lBQ3pCLE1BQU0sSUFBSUMsYUFBSyxDQUFDQyxLQUFLLENBQUNELGFBQUssQ0FBQ0MsS0FBSyxDQUFDQyxlQUFlLEVBQUUsc0JBQXNCLENBQUM7RUFDNUU7RUFFQSxJQUFJTixRQUFRLENBQUNHLE1BQU0sR0FBRyxHQUFHLEVBQUU7SUFDekIsTUFBTSxJQUFJQyxhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUNFLGlCQUFpQixFQUFFLG9CQUFvQixDQUFDO0VBQzVFO0VBRUEsSUFBSSxDQUFDUCxRQUFRLENBQUNRLEtBQUssQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFO0lBQ3pELE1BQU0sSUFBSUosYUFBSyxDQUFDQyxLQUFLLENBQUNELGFBQUssQ0FBQ0MsS0FBSyxDQUFDRSxpQkFBaUIsRUFBRSx1Q0FBdUMsQ0FBQztFQUMvRjtFQUVBLElBQUk7SUFDRixPQUFPO01BQ0xFLFFBQVEsRUFBRSxNQUFNZixNQUFNLENBQUNnQixlQUFlLENBQUNDLFVBQVUsQ0FBQ2pCLE1BQU0sRUFBRU0sUUFBUSxFQUFFTCxJQUFJLEVBQUVPLElBQUk7SUFDaEYsQ0FBQztFQUNILENBQUMsQ0FBQyxPQUFPVSxDQUFDLEVBQUU7SUFDVkMsZUFBTSxDQUFDQyxLQUFLLENBQUMseUJBQXlCLEVBQUVGLENBQUMsQ0FBQztJQUMxQyxNQUFNLElBQUlSLGFBQUssQ0FBQ0MsS0FBSyxDQUFDRCxhQUFLLENBQUNDLEtBQUssQ0FBQ0MsZUFBZSxFQUFHLHlCQUF3Qk4sUUFBUyxHQUFFLENBQUM7RUFDMUY7QUFDRixDQUFDO0FBQUM7QUFFRixNQUFNZSxJQUFJLEdBQUdDLGtCQUFrQixJQUFJO0VBQ2pDLE1BQU1DLGNBQWMsR0FBRyxJQUFBQywwQ0FBNEIsRUFBQztJQUNsRGpCLElBQUksRUFBRSxZQUFZO0lBQ2xCa0IsV0FBVyxFQUFFLHNFQUFzRTtJQUNuRkMsV0FBVyxFQUFFO01BQ1gzQixNQUFNLEVBQUU7UUFDTjBCLFdBQVcsRUFBRSxrREFBa0Q7UUFDL0RqQixJQUFJLEVBQUUsSUFBSW1CLHVCQUFjLENBQUNDLG1CQUFtQixDQUFDQyxhQUFhO01BQzVEO0lBQ0YsQ0FBQztJQUNEQyxZQUFZLEVBQUU7TUFDWmYsUUFBUSxFQUFFO1FBQ1JVLFdBQVcsRUFBRSxnQ0FBZ0M7UUFDN0NqQixJQUFJLEVBQUUsSUFBSW1CLHVCQUFjLENBQUNDLG1CQUFtQixDQUFDRyxTQUFTO01BQ3hEO0lBQ0YsQ0FBQztJQUNEQyxtQkFBbUIsRUFBRSxPQUFPQyxJQUFJLEVBQUVDLE9BQU8sS0FBSztNQUM1QyxJQUFJO1FBQ0YsTUFBTTtVQUFFbkM7UUFBTyxDQUFDLEdBQUdrQyxJQUFJO1FBQ3ZCLE1BQU07VUFBRWpDO1FBQU8sQ0FBQyxHQUFHa0MsT0FBTztRQUMxQixPQUFPcEMsWUFBWSxDQUFDQyxNQUFNLEVBQUVDLE1BQU0sQ0FBQztNQUNyQyxDQUFDLENBQUMsT0FBT2tCLENBQUMsRUFBRTtRQUNWSSxrQkFBa0IsQ0FBQ2EsV0FBVyxDQUFDakIsQ0FBQyxDQUFDO01BQ25DO0lBQ0Y7RUFDRixDQUFDLENBQUM7RUFFRkksa0JBQWtCLENBQUNjLGNBQWMsQ0FBQ2IsY0FBYyxDQUFDVSxJQUFJLENBQUNJLEtBQUssQ0FBQzdCLElBQUksQ0FBQzhCLE1BQU0sRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDO0VBQ3BGaEIsa0JBQWtCLENBQUNjLGNBQWMsQ0FBQ2IsY0FBYyxDQUFDZixJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQztFQUNsRWMsa0JBQWtCLENBQUNpQixrQkFBa0IsQ0FBQyxZQUFZLEVBQUVoQixjQUFjLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQztBQUNqRixDQUFDO0FBQUMifQ==