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
  const data = await upload.buffer();
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJoYW5kbGVVcGxvYWQiLCJ1cGxvYWQiLCJjb25maWciLCJkYXRhIiwiYnVmZmVyIiwiZmlsZU5hbWUiLCJuYW1lIiwidHlwZSIsImxlbmd0aCIsIlBhcnNlIiwiRXJyb3IiLCJGSUxFX1NBVkVfRVJST1IiLCJJTlZBTElEX0ZJTEVfTkFNRSIsIm1hdGNoIiwiZmlsZUluZm8iLCJmaWxlc0NvbnRyb2xsZXIiLCJjcmVhdGVGaWxlIiwiZSIsImxvZ2dlciIsImVycm9yIiwibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsImNyZWF0ZU11dGF0aW9uIiwibXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCIsImRlc2NyaXB0aW9uIiwiaW5wdXRGaWVsZHMiLCJHcmFwaFFMTm9uTnVsbCIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJHcmFwaFFMVXBsb2FkIiwib3V0cHV0RmllbGRzIiwiRklMRV9JTkZPIiwibXV0YXRlQW5kR2V0UGF5bG9hZCIsImFyZ3MiLCJjb250ZXh0IiwiaGFuZGxlRXJyb3IiLCJhZGRHcmFwaFFMVHlwZSIsImlucHV0Iiwib2ZUeXBlIiwiYWRkR3JhcGhRTE11dGF0aW9uIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0dyYXBoUUwvbG9hZGVycy9maWxlc011dGF0aW9ucy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBHcmFwaFFMTm9uTnVsbCB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi8uLi9sb2dnZXInO1xuXG5jb25zdCBoYW5kbGVVcGxvYWQgPSBhc3luYyAodXBsb2FkLCBjb25maWcpID0+IHtcbiAgY29uc3QgZGF0YSA9IGF3YWl0IHVwbG9hZC5idWZmZXIoKTtcbiAgY29uc3QgZmlsZU5hbWUgPSB1cGxvYWQubmFtZTtcbiAgY29uc3QgdHlwZSA9IHVwbG9hZC50eXBlO1xuICBpZiAoIWRhdGEgfHwgIWRhdGEubGVuZ3RoKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkZJTEVfU0FWRV9FUlJPUiwgJ0ludmFsaWQgZmlsZSB1cGxvYWQuJyk7XG4gIH1cblxuICBpZiAoZmlsZU5hbWUubGVuZ3RoID4gMTI4KSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfRklMRV9OQU1FLCAnRmlsZW5hbWUgdG9vIGxvbmcuJyk7XG4gIH1cblxuICBpZiAoIWZpbGVOYW1lLm1hdGNoKC9eW19hLXpBLVowLTldW2EtekEtWjAtOUBcXC5cXCB+Xy1dKiQvKSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0ZJTEVfTkFNRSwgJ0ZpbGVuYW1lIGNvbnRhaW5zIGludmFsaWQgY2hhcmFjdGVycy4nKTtcbiAgfVxuXG4gIHRyeSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGZpbGVJbmZvOiBhd2FpdCBjb25maWcuZmlsZXNDb250cm9sbGVyLmNyZWF0ZUZpbGUoY29uZmlnLCBmaWxlTmFtZSwgZGF0YSwgdHlwZSksXG4gICAgfTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGxvZ2dlci5lcnJvcignRXJyb3IgY3JlYXRpbmcgYSBmaWxlOiAnLCBlKTtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLCBgQ291bGQgbm90IHN0b3JlIGZpbGU6ICR7ZmlsZU5hbWV9LmApO1xuICB9XG59O1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgY29uc3QgY3JlYXRlTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnQ3JlYXRlRmlsZScsXG4gICAgZGVzY3JpcHRpb246ICdUaGUgY3JlYXRlRmlsZSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBjcmVhdGUgYW5kIHVwbG9hZCBhIG5ldyBmaWxlLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIHVwbG9hZDoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIG5ldyBmaWxlIHRvIGJlIGNyZWF0ZWQgYW5kIHVwbG9hZGVkLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChkZWZhdWx0R3JhcGhRTFR5cGVzLkdyYXBoUUxVcGxvYWQpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgZmlsZUluZm86IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBjcmVhdGVkIGZpbGUgaW5mby4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoZGVmYXVsdEdyYXBoUUxUeXBlcy5GSUxFX0lORk8pLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0KSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IHVwbG9hZCB9ID0gYXJncztcbiAgICAgICAgY29uc3QgeyBjb25maWcgfSA9IGNvbnRleHQ7XG4gICAgICAgIHJldHVybiBoYW5kbGVVcGxvYWQodXBsb2FkLCBjb25maWcpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNyZWF0ZU11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY3JlYXRlTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oJ2NyZWF0ZUZpbGUnLCBjcmVhdGVNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG59O1xuXG5leHBvcnQgeyBsb2FkLCBoYW5kbGVVcGxvYWQgfTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFrQztBQUFBO0FBQUE7QUFFbEMsTUFBTUEsWUFBWSxHQUFHLE9BQU9DLE1BQU0sRUFBRUMsTUFBTSxLQUFLO0VBQzdDLE1BQU1DLElBQUksR0FBRyxNQUFNRixNQUFNLENBQUNHLE1BQU0sRUFBRTtFQUNsQyxNQUFNQyxRQUFRLEdBQUdKLE1BQU0sQ0FBQ0ssSUFBSTtFQUM1QixNQUFNQyxJQUFJLEdBQUdOLE1BQU0sQ0FBQ00sSUFBSTtFQUN4QixJQUFJLENBQUNKLElBQUksSUFBSSxDQUFDQSxJQUFJLENBQUNLLE1BQU0sRUFBRTtJQUN6QixNQUFNLElBQUlDLGFBQUssQ0FBQ0MsS0FBSyxDQUFDRCxhQUFLLENBQUNDLEtBQUssQ0FBQ0MsZUFBZSxFQUFFLHNCQUFzQixDQUFDO0VBQzVFO0VBRUEsSUFBSU4sUUFBUSxDQUFDRyxNQUFNLEdBQUcsR0FBRyxFQUFFO0lBQ3pCLE1BQU0sSUFBSUMsYUFBSyxDQUFDQyxLQUFLLENBQUNELGFBQUssQ0FBQ0MsS0FBSyxDQUFDRSxpQkFBaUIsRUFBRSxvQkFBb0IsQ0FBQztFQUM1RTtFQUVBLElBQUksQ0FBQ1AsUUFBUSxDQUFDUSxLQUFLLENBQUMsb0NBQW9DLENBQUMsRUFBRTtJQUN6RCxNQUFNLElBQUlKLGFBQUssQ0FBQ0MsS0FBSyxDQUFDRCxhQUFLLENBQUNDLEtBQUssQ0FBQ0UsaUJBQWlCLEVBQUUsdUNBQXVDLENBQUM7RUFDL0Y7RUFFQSxJQUFJO0lBQ0YsT0FBTztNQUNMRSxRQUFRLEVBQUUsTUFBTVosTUFBTSxDQUFDYSxlQUFlLENBQUNDLFVBQVUsQ0FBQ2QsTUFBTSxFQUFFRyxRQUFRLEVBQUVGLElBQUksRUFBRUksSUFBSTtJQUNoRixDQUFDO0VBQ0gsQ0FBQyxDQUFDLE9BQU9VLENBQUMsRUFBRTtJQUNWQyxlQUFNLENBQUNDLEtBQUssQ0FBQyx5QkFBeUIsRUFBRUYsQ0FBQyxDQUFDO0lBQzFDLE1BQU0sSUFBSVIsYUFBSyxDQUFDQyxLQUFLLENBQUNELGFBQUssQ0FBQ0MsS0FBSyxDQUFDQyxlQUFlLEVBQUcseUJBQXdCTixRQUFTLEdBQUUsQ0FBQztFQUMxRjtBQUNGLENBQUM7QUFBQztBQUVGLE1BQU1lLElBQUksR0FBR0Msa0JBQWtCLElBQUk7RUFDakMsTUFBTUMsY0FBYyxHQUFHLElBQUFDLDBDQUE0QixFQUFDO0lBQ2xEakIsSUFBSSxFQUFFLFlBQVk7SUFDbEJrQixXQUFXLEVBQUUsc0VBQXNFO0lBQ25GQyxXQUFXLEVBQUU7TUFDWHhCLE1BQU0sRUFBRTtRQUNOdUIsV0FBVyxFQUFFLGtEQUFrRDtRQUMvRGpCLElBQUksRUFBRSxJQUFJbUIsdUJBQWMsQ0FBQ0MsbUJBQW1CLENBQUNDLGFBQWE7TUFDNUQ7SUFDRixDQUFDO0lBQ0RDLFlBQVksRUFBRTtNQUNaZixRQUFRLEVBQUU7UUFDUlUsV0FBVyxFQUFFLGdDQUFnQztRQUM3Q2pCLElBQUksRUFBRSxJQUFJbUIsdUJBQWMsQ0FBQ0MsbUJBQW1CLENBQUNHLFNBQVM7TUFDeEQ7SUFDRixDQUFDO0lBQ0RDLG1CQUFtQixFQUFFLE9BQU9DLElBQUksRUFBRUMsT0FBTyxLQUFLO01BQzVDLElBQUk7UUFDRixNQUFNO1VBQUVoQztRQUFPLENBQUMsR0FBRytCLElBQUk7UUFDdkIsTUFBTTtVQUFFOUI7UUFBTyxDQUFDLEdBQUcrQixPQUFPO1FBQzFCLE9BQU9qQyxZQUFZLENBQUNDLE1BQU0sRUFBRUMsTUFBTSxDQUFDO01BQ3JDLENBQUMsQ0FBQyxPQUFPZSxDQUFDLEVBQUU7UUFDVkksa0JBQWtCLENBQUNhLFdBQVcsQ0FBQ2pCLENBQUMsQ0FBQztNQUNuQztJQUNGO0VBQ0YsQ0FBQyxDQUFDO0VBRUZJLGtCQUFrQixDQUFDYyxjQUFjLENBQUNiLGNBQWMsQ0FBQ1UsSUFBSSxDQUFDSSxLQUFLLENBQUM3QixJQUFJLENBQUM4QixNQUFNLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQztFQUNwRmhCLGtCQUFrQixDQUFDYyxjQUFjLENBQUNiLGNBQWMsQ0FBQ2YsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUM7RUFDbEVjLGtCQUFrQixDQUFDaUIsa0JBQWtCLENBQUMsWUFBWSxFQUFFaEIsY0FBYyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUM7QUFDakYsQ0FBQztBQUFDIn0=