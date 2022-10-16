"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.handleUpload = exports.load = void 0;

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZmlsZXNNdXRhdGlvbnMuanMiXSwibmFtZXMiOlsiaGFuZGxlVXBsb2FkIiwidXBsb2FkIiwiY29uZmlnIiwiZGF0YSIsIkJ1ZmZlciIsImZyb20iLCJhcnJheUJ1ZmZlciIsImZpbGVOYW1lIiwibmFtZSIsInR5cGUiLCJsZW5ndGgiLCJQYXJzZSIsIkVycm9yIiwiRklMRV9TQVZFX0VSUk9SIiwiSU5WQUxJRF9GSUxFX05BTUUiLCJtYXRjaCIsImZpbGVJbmZvIiwiZmlsZXNDb250cm9sbGVyIiwiY3JlYXRlRmlsZSIsImUiLCJsb2dnZXIiLCJlcnJvciIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJjcmVhdGVNdXRhdGlvbiIsImRlc2NyaXB0aW9uIiwiaW5wdXRGaWVsZHMiLCJHcmFwaFFMTm9uTnVsbCIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJHcmFwaFFMVXBsb2FkIiwib3V0cHV0RmllbGRzIiwiRklMRV9JTkZPIiwibXV0YXRlQW5kR2V0UGF5bG9hZCIsImFyZ3MiLCJjb250ZXh0IiwiaGFuZGxlRXJyb3IiLCJhZGRHcmFwaFFMVHlwZSIsImlucHV0Iiwib2ZUeXBlIiwiYWRkR3JhcGhRTE11dGF0aW9uIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBRUEsTUFBTUEsWUFBWSxHQUFHLE9BQU9DLE1BQVAsRUFBZUMsTUFBZixLQUEwQjtBQUM3QyxRQUFNQyxJQUFJLEdBQUdDLE1BQU0sQ0FBQ0MsSUFBUCxDQUFZLE1BQU1KLE1BQU0sQ0FBQ0ssV0FBUCxFQUFsQixDQUFiO0FBQ0EsUUFBTUMsUUFBUSxHQUFHTixNQUFNLENBQUNPLElBQXhCO0FBQ0EsUUFBTUMsSUFBSSxHQUFHUixNQUFNLENBQUNRLElBQXBCOztBQUVBLE1BQUksQ0FBQ04sSUFBRCxJQUFTLENBQUNBLElBQUksQ0FBQ08sTUFBbkIsRUFBMkI7QUFDekIsVUFBTSxJQUFJQyxjQUFNQyxLQUFWLENBQWdCRCxjQUFNQyxLQUFOLENBQVlDLGVBQTVCLEVBQTZDLHNCQUE3QyxDQUFOO0FBQ0Q7O0FBRUQsTUFBSU4sUUFBUSxDQUFDRyxNQUFULEdBQWtCLEdBQXRCLEVBQTJCO0FBQ3pCLFVBQU0sSUFBSUMsY0FBTUMsS0FBVixDQUFnQkQsY0FBTUMsS0FBTixDQUFZRSxpQkFBNUIsRUFBK0Msb0JBQS9DLENBQU47QUFDRDs7QUFFRCxNQUFJLENBQUNQLFFBQVEsQ0FBQ1EsS0FBVCxDQUFlLG9DQUFmLENBQUwsRUFBMkQ7QUFDekQsVUFBTSxJQUFJSixjQUFNQyxLQUFWLENBQWdCRCxjQUFNQyxLQUFOLENBQVlFLGlCQUE1QixFQUErQyx1Q0FBL0MsQ0FBTjtBQUNEOztBQUVELE1BQUk7QUFDRixXQUFPO0FBQ0xFLE1BQUFBLFFBQVEsRUFBRSxNQUFNZCxNQUFNLENBQUNlLGVBQVAsQ0FBdUJDLFVBQXZCLENBQWtDaEIsTUFBbEMsRUFBMENLLFFBQTFDLEVBQW9ESixJQUFwRCxFQUEwRE0sSUFBMUQ7QUFEWCxLQUFQO0FBR0QsR0FKRCxDQUlFLE9BQU9VLENBQVAsRUFBVTtBQUNWQyxvQkFBT0MsS0FBUCxDQUFhLHlCQUFiLEVBQXdDRixDQUF4Qzs7QUFDQSxVQUFNLElBQUlSLGNBQU1DLEtBQVYsQ0FBZ0JELGNBQU1DLEtBQU4sQ0FBWUMsZUFBNUIsRUFBOEMseUJBQXdCTixRQUFTLEdBQS9FLENBQU47QUFDRDtBQUNGLENBekJEOzs7O0FBMkJBLE1BQU1lLElBQUksR0FBR0Msa0JBQWtCLElBQUk7QUFDakMsUUFBTUMsY0FBYyxHQUFHLGdEQUE2QjtBQUNsRGhCLElBQUFBLElBQUksRUFBRSxZQUQ0QztBQUVsRGlCLElBQUFBLFdBQVcsRUFBRSxzRUFGcUM7QUFHbERDLElBQUFBLFdBQVcsRUFBRTtBQUNYekIsTUFBQUEsTUFBTSxFQUFFO0FBQ053QixRQUFBQSxXQUFXLEVBQUUsa0RBRFA7QUFFTmhCLFFBQUFBLElBQUksRUFBRSxJQUFJa0IsdUJBQUosQ0FBbUJDLG1CQUFtQixDQUFDQyxhQUF2QztBQUZBO0FBREcsS0FIcUM7QUFTbERDLElBQUFBLFlBQVksRUFBRTtBQUNaZCxNQUFBQSxRQUFRLEVBQUU7QUFDUlMsUUFBQUEsV0FBVyxFQUFFLGdDQURMO0FBRVJoQixRQUFBQSxJQUFJLEVBQUUsSUFBSWtCLHVCQUFKLENBQW1CQyxtQkFBbUIsQ0FBQ0csU0FBdkM7QUFGRTtBQURFLEtBVG9DO0FBZWxEQyxJQUFBQSxtQkFBbUIsRUFBRSxPQUFPQyxJQUFQLEVBQWFDLE9BQWIsS0FBeUI7QUFDNUMsVUFBSTtBQUNGLGNBQU07QUFBRWpDLFVBQUFBO0FBQUYsWUFBYWdDLElBQW5CO0FBQ0EsY0FBTTtBQUFFL0IsVUFBQUE7QUFBRixZQUFhZ0MsT0FBbkI7QUFDQSxlQUFPbEMsWUFBWSxDQUFDQyxNQUFELEVBQVNDLE1BQVQsQ0FBbkI7QUFDRCxPQUpELENBSUUsT0FBT2lCLENBQVAsRUFBVTtBQUNWSSxRQUFBQSxrQkFBa0IsQ0FBQ1ksV0FBbkIsQ0FBK0JoQixDQUEvQjtBQUNEO0FBQ0Y7QUF2QmlELEdBQTdCLENBQXZCO0FBMEJBSSxFQUFBQSxrQkFBa0IsQ0FBQ2EsY0FBbkIsQ0FBa0NaLGNBQWMsQ0FBQ1MsSUFBZixDQUFvQkksS0FBcEIsQ0FBMEI1QixJQUExQixDQUErQjZCLE1BQWpFLEVBQXlFLElBQXpFLEVBQStFLElBQS9FO0FBQ0FmLEVBQUFBLGtCQUFrQixDQUFDYSxjQUFuQixDQUFrQ1osY0FBYyxDQUFDZixJQUFqRCxFQUF1RCxJQUF2RCxFQUE2RCxJQUE3RDtBQUNBYyxFQUFBQSxrQkFBa0IsQ0FBQ2dCLGtCQUFuQixDQUFzQyxZQUF0QyxFQUFvRGYsY0FBcEQsRUFBb0UsSUFBcEUsRUFBMEUsSUFBMUU7QUFDRCxDQTlCRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEdyYXBoUUxOb25OdWxsIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkIH0gZnJvbSAnZ3JhcGhxbC1yZWxheSc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4vZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uLy4uL2xvZ2dlcic7XG5cbmNvbnN0IGhhbmRsZVVwbG9hZCA9IGFzeW5jICh1cGxvYWQsIGNvbmZpZykgPT4ge1xuICBjb25zdCBkYXRhID0gQnVmZmVyLmZyb20oYXdhaXQgdXBsb2FkLmFycmF5QnVmZmVyKCkpO1xuICBjb25zdCBmaWxlTmFtZSA9IHVwbG9hZC5uYW1lO1xuICBjb25zdCB0eXBlID0gdXBsb2FkLnR5cGU7XG5cbiAgaWYgKCFkYXRhIHx8ICFkYXRhLmxlbmd0aCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsICdJbnZhbGlkIGZpbGUgdXBsb2FkLicpO1xuICB9XG5cbiAgaWYgKGZpbGVOYW1lLmxlbmd0aCA+IDEyOCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0ZJTEVfTkFNRSwgJ0ZpbGVuYW1lIHRvbyBsb25nLicpO1xuICB9XG5cbiAgaWYgKCFmaWxlTmFtZS5tYXRjaCgvXltfYS16QS1aMC05XVthLXpBLVowLTlAXFwuXFwgfl8tXSokLykpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9GSUxFX05BTUUsICdGaWxlbmFtZSBjb250YWlucyBpbnZhbGlkIGNoYXJhY3RlcnMuJyk7XG4gIH1cblxuICB0cnkge1xuICAgIHJldHVybiB7XG4gICAgICBmaWxlSW5mbzogYXdhaXQgY29uZmlnLmZpbGVzQ29udHJvbGxlci5jcmVhdGVGaWxlKGNvbmZpZywgZmlsZU5hbWUsIGRhdGEsIHR5cGUpLFxuICAgIH07XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBsb2dnZXIuZXJyb3IoJ0Vycm9yIGNyZWF0aW5nIGEgZmlsZTogJywgZSk7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkZJTEVfU0FWRV9FUlJPUiwgYENvdWxkIG5vdCBzdG9yZSBmaWxlOiAke2ZpbGVOYW1lfS5gKTtcbiAgfVxufTtcblxuY29uc3QgbG9hZCA9IHBhcnNlR3JhcGhRTFNjaGVtYSA9PiB7XG4gIGNvbnN0IGNyZWF0ZU11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ0NyZWF0ZUZpbGUnLFxuICAgIGRlc2NyaXB0aW9uOiAnVGhlIGNyZWF0ZUZpbGUgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gY3JlYXRlIGFuZCB1cGxvYWQgYSBuZXcgZmlsZS4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICB1cGxvYWQ6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBuZXcgZmlsZSB0byBiZSBjcmVhdGVkIGFuZCB1cGxvYWRlZC4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoZGVmYXVsdEdyYXBoUUxUeXBlcy5HcmFwaFFMVXBsb2FkKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIGZpbGVJbmZvOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgY3JlYXRlZCBmaWxlIGluZm8uJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKGRlZmF1bHRHcmFwaFFMVHlwZXMuRklMRV9JTkZPKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyB1cGxvYWQgfSA9IGFyZ3M7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnIH0gPSBjb250ZXh0O1xuICAgICAgICByZXR1cm4gaGFuZGxlVXBsb2FkKHVwbG9hZCwgY29uZmlnKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjcmVhdGVNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNyZWF0ZU11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdjcmVhdGVGaWxlJywgY3JlYXRlTXV0YXRpb24sIHRydWUsIHRydWUpO1xufTtcblxuZXhwb3J0IHsgbG9hZCwgaGFuZGxlVXBsb2FkIH07XG4iXX0=