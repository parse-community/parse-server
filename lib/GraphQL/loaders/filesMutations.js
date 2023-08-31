"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = exports.handleUpload = void 0;
var _graphql = require("graphql");
var _http = require("http");
var _mimeTypes = require("mime-types");
var _graphqlRelay = require("graphql-relay");
var _node = _interopRequireDefault(require("parse/node"));
var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));
var _logger = _interopRequireDefault(require("../../logger"));
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
// Handle graphql file upload and proxy the file upload
// to the graphql server url specified in the config
// We do not call directly createFile from the Parse Server
// to leverage the standard file upload mechanism
const handleUpload = async (upload, config) => {
  const {
    createReadStream,
    filename,
    mimetype
  } = await upload;
  const headers = _objectSpread({}, config.headers);
  delete headers['accept-encoding'];
  delete headers['accept'];
  delete headers['connection'];
  delete headers['host'];
  delete headers['content-length'];
  const stream = createReadStream();
  try {
    const ext = (0, _mimeTypes.extension)(mimetype);
    const fullFileName = filename.endsWith(`.${ext}`) ? filename : `${filename}.${ext}`;
    const serverUrl = new URL(config.serverURL);
    const fileInfo = await new Promise((resolve, reject) => {
      const req = (0, _http.request)({
        hostname: serverUrl.hostname,
        port: serverUrl.port,
        path: `${serverUrl.pathname}/files/${fullFileName}`,
        method: 'POST',
        headers
      }, res => {
        let data = '';
        res.on('data', chunk => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new _node.default.Error(_node.default.error, data));
          }
        });
      });
      stream.pipe(req);
      stream.on('end', () => {
        req.end();
      });
    });
    return {
      fileInfo
    };
  } catch (e) {
    stream.destroy();
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJoYW5kbGVVcGxvYWQiLCJ1cGxvYWQiLCJjb25maWciLCJjcmVhdGVSZWFkU3RyZWFtIiwiZmlsZW5hbWUiLCJtaW1ldHlwZSIsImhlYWRlcnMiLCJzdHJlYW0iLCJleHQiLCJleHRlbnNpb24iLCJmdWxsRmlsZU5hbWUiLCJlbmRzV2l0aCIsInNlcnZlclVybCIsIlVSTCIsInNlcnZlclVSTCIsImZpbGVJbmZvIiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJyZXEiLCJyZXF1ZXN0IiwiaG9zdG5hbWUiLCJwb3J0IiwicGF0aCIsInBhdGhuYW1lIiwibWV0aG9kIiwicmVzIiwiZGF0YSIsIm9uIiwiY2h1bmsiLCJKU09OIiwicGFyc2UiLCJlIiwiUGFyc2UiLCJFcnJvciIsImVycm9yIiwicGlwZSIsImVuZCIsImRlc3Ryb3kiLCJsb2dnZXIiLCJGSUxFX1NBVkVfRVJST1IiLCJsb2FkIiwicGFyc2VHcmFwaFFMU2NoZW1hIiwiY3JlYXRlTXV0YXRpb24iLCJtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiaW5wdXRGaWVsZHMiLCJ0eXBlIiwiR3JhcGhRTE5vbk51bGwiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiR3JhcGhRTFVwbG9hZCIsIm91dHB1dEZpZWxkcyIsIkZJTEVfSU5GTyIsIm11dGF0ZUFuZEdldFBheWxvYWQiLCJhcmdzIiwiY29udGV4dCIsImhhbmRsZUVycm9yIiwiYWRkR3JhcGhRTFR5cGUiLCJpbnB1dCIsIm9mVHlwZSIsImFkZEdyYXBoUUxNdXRhdGlvbiJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZmlsZXNNdXRhdGlvbnMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgR3JhcGhRTE5vbk51bGwgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IHJlcXVlc3QgfSBmcm9tICdodHRwJztcbmltcG9ydCB7IGV4dGVuc2lvbiB9IGZyb20gJ21pbWUtdHlwZXMnO1xuaW1wb3J0IHsgbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi8uLi9sb2dnZXInO1xuXG4vLyBIYW5kbGUgZ3JhcGhxbCBmaWxlIHVwbG9hZCBhbmQgcHJveHkgdGhlIGZpbGUgdXBsb2FkXG4vLyB0byB0aGUgZ3JhcGhxbCBzZXJ2ZXIgdXJsIHNwZWNpZmllZCBpbiB0aGUgY29uZmlnXG4vLyBXZSBkbyBub3QgY2FsbCBkaXJlY3RseSBjcmVhdGVGaWxlIGZyb20gdGhlIFBhcnNlIFNlcnZlclxuLy8gdG8gbGV2ZXJhZ2UgdGhlIHN0YW5kYXJkIGZpbGUgdXBsb2FkIG1lY2hhbmlzbVxuY29uc3QgaGFuZGxlVXBsb2FkID0gYXN5bmMgKHVwbG9hZCwgY29uZmlnKSA9PiB7XG4gIGNvbnN0IHsgY3JlYXRlUmVhZFN0cmVhbSwgZmlsZW5hbWUsIG1pbWV0eXBlIH0gPSBhd2FpdCB1cGxvYWQ7XG4gIGNvbnN0IGhlYWRlcnMgPSB7IC4uLmNvbmZpZy5oZWFkZXJzIH07XG4gIGRlbGV0ZSBoZWFkZXJzWydhY2NlcHQtZW5jb2RpbmcnXTtcbiAgZGVsZXRlIGhlYWRlcnNbJ2FjY2VwdCddO1xuICBkZWxldGUgaGVhZGVyc1snY29ubmVjdGlvbiddO1xuICBkZWxldGUgaGVhZGVyc1snaG9zdCddO1xuICBkZWxldGUgaGVhZGVyc1snY29udGVudC1sZW5ndGgnXTtcbiAgY29uc3Qgc3RyZWFtID0gY3JlYXRlUmVhZFN0cmVhbSgpO1xuICB0cnkge1xuICAgIGNvbnN0IGV4dCA9IGV4dGVuc2lvbihtaW1ldHlwZSk7XG4gICAgY29uc3QgZnVsbEZpbGVOYW1lID0gZmlsZW5hbWUuZW5kc1dpdGgoYC4ke2V4dH1gKSA/IGZpbGVuYW1lIDogYCR7ZmlsZW5hbWV9LiR7ZXh0fWA7XG4gICAgY29uc3Qgc2VydmVyVXJsID0gbmV3IFVSTChjb25maWcuc2VydmVyVVJMKTtcbiAgICBjb25zdCBmaWxlSW5mbyA9IGF3YWl0IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIGNvbnN0IHJlcSA9IHJlcXVlc3QoXG4gICAgICAgIHtcbiAgICAgICAgICBob3N0bmFtZTogc2VydmVyVXJsLmhvc3RuYW1lLFxuICAgICAgICAgIHBvcnQ6IHNlcnZlclVybC5wb3J0LFxuICAgICAgICAgIHBhdGg6IGAke3NlcnZlclVybC5wYXRobmFtZX0vZmlsZXMvJHtmdWxsRmlsZU5hbWV9YCxcbiAgICAgICAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICAgICAgICBoZWFkZXJzLFxuICAgICAgICB9LFxuICAgICAgICByZXMgPT4ge1xuICAgICAgICAgIGxldCBkYXRhID0gJyc7XG4gICAgICAgICAgcmVzLm9uKCdkYXRhJywgY2h1bmsgPT4ge1xuICAgICAgICAgICAgZGF0YSArPSBjaHVuaztcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXMub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIHJlc29sdmUoSlNPTi5wYXJzZShkYXRhKSk7XG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgIHJlamVjdChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuZXJyb3IsIGRhdGEpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgKTtcbiAgICAgIHN0cmVhbS5waXBlKHJlcSk7XG4gICAgICBzdHJlYW0ub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgcmVxLmVuZCgpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIGZpbGVJbmZvLFxuICAgIH07XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBzdHJlYW0uZGVzdHJveSgpO1xuICAgIGxvZ2dlci5lcnJvcignRXJyb3IgY3JlYXRpbmcgYSBmaWxlOiAnLCBlKTtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLCBgQ291bGQgbm90IHN0b3JlIGZpbGU6ICR7ZmlsZW5hbWV9LmApO1xuICB9XG59O1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgY29uc3QgY3JlYXRlTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnQ3JlYXRlRmlsZScsXG4gICAgZGVzY3JpcHRpb246ICdUaGUgY3JlYXRlRmlsZSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBjcmVhdGUgYW5kIHVwbG9hZCBhIG5ldyBmaWxlLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIHVwbG9hZDoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIG5ldyBmaWxlIHRvIGJlIGNyZWF0ZWQgYW5kIHVwbG9hZGVkLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChkZWZhdWx0R3JhcGhRTFR5cGVzLkdyYXBoUUxVcGxvYWQpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgZmlsZUluZm86IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBjcmVhdGVkIGZpbGUgaW5mby4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoZGVmYXVsdEdyYXBoUUxUeXBlcy5GSUxFX0lORk8pLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0KSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IHVwbG9hZCB9ID0gYXJncztcbiAgICAgICAgY29uc3QgeyBjb25maWcgfSA9IGNvbnRleHQ7XG4gICAgICAgIHJldHVybiBoYW5kbGVVcGxvYWQodXBsb2FkLCBjb25maWcpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNyZWF0ZU11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY3JlYXRlTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oJ2NyZWF0ZUZpbGUnLCBjcmVhdGVNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG59O1xuXG5leHBvcnQgeyBsb2FkLCBoYW5kbGVVcGxvYWQgfTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBa0M7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUVsQztBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU1BLFlBQVksR0FBRyxPQUFPQyxNQUFNLEVBQUVDLE1BQU0sS0FBSztFQUM3QyxNQUFNO0lBQUVDLGdCQUFnQjtJQUFFQyxRQUFRO0lBQUVDO0VBQVMsQ0FBQyxHQUFHLE1BQU1KLE1BQU07RUFDN0QsTUFBTUssT0FBTyxxQkFBUUosTUFBTSxDQUFDSSxPQUFPLENBQUU7RUFDckMsT0FBT0EsT0FBTyxDQUFDLGlCQUFpQixDQUFDO0VBQ2pDLE9BQU9BLE9BQU8sQ0FBQyxRQUFRLENBQUM7RUFDeEIsT0FBT0EsT0FBTyxDQUFDLFlBQVksQ0FBQztFQUM1QixPQUFPQSxPQUFPLENBQUMsTUFBTSxDQUFDO0VBQ3RCLE9BQU9BLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQztFQUNoQyxNQUFNQyxNQUFNLEdBQUdKLGdCQUFnQixFQUFFO0VBQ2pDLElBQUk7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