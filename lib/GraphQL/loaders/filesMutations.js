"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = exports.handleUpload = void 0;
var _graphql = require("graphql");
var _http = require("http");
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
    filename
  } = await upload;
  const headers = _objectSpread({}, config.headers);
  delete headers['accept-encoding'];
  delete headers['accept'];
  delete headers['connection'];
  delete headers['host'];
  delete headers['content-length'];
  const stream = createReadStream();
  try {
    const serverUrl = new URL(config.serverURL);
    const fileInfo = await new Promise((resolve, reject) => {
      const req = (0, _http.request)({
        hostname: serverUrl.hostname,
        port: serverUrl.port,
        path: `${serverUrl.pathname}/files/${filename}`,
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJoYW5kbGVVcGxvYWQiLCJ1cGxvYWQiLCJjb25maWciLCJjcmVhdGVSZWFkU3RyZWFtIiwiZmlsZW5hbWUiLCJoZWFkZXJzIiwic3RyZWFtIiwic2VydmVyVXJsIiwiVVJMIiwic2VydmVyVVJMIiwiZmlsZUluZm8iLCJQcm9taXNlIiwicmVzb2x2ZSIsInJlamVjdCIsInJlcSIsInJlcXVlc3QiLCJob3N0bmFtZSIsInBvcnQiLCJwYXRoIiwicGF0aG5hbWUiLCJtZXRob2QiLCJyZXMiLCJkYXRhIiwib24iLCJjaHVuayIsIkpTT04iLCJwYXJzZSIsImUiLCJQYXJzZSIsIkVycm9yIiwiZXJyb3IiLCJwaXBlIiwiZW5kIiwiZGVzdHJveSIsImxvZ2dlciIsIkZJTEVfU0FWRV9FUlJPUiIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJjcmVhdGVNdXRhdGlvbiIsIm11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQiLCJuYW1lIiwiZGVzY3JpcHRpb24iLCJpbnB1dEZpZWxkcyIsInR5cGUiLCJHcmFwaFFMTm9uTnVsbCIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJHcmFwaFFMVXBsb2FkIiwib3V0cHV0RmllbGRzIiwiRklMRV9JTkZPIiwibXV0YXRlQW5kR2V0UGF5bG9hZCIsImFyZ3MiLCJjb250ZXh0IiwiaGFuZGxlRXJyb3IiLCJhZGRHcmFwaFFMVHlwZSIsImlucHV0Iiwib2ZUeXBlIiwiYWRkR3JhcGhRTE11dGF0aW9uIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0dyYXBoUUwvbG9hZGVycy9maWxlc011dGF0aW9ucy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBHcmFwaFFMTm9uTnVsbCB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgcmVxdWVzdCB9IGZyb20gJ2h0dHAnO1xuaW1wb3J0IHsgbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi8uLi9sb2dnZXInO1xuXG4vLyBIYW5kbGUgZ3JhcGhxbCBmaWxlIHVwbG9hZCBhbmQgcHJveHkgdGhlIGZpbGUgdXBsb2FkXG4vLyB0byB0aGUgZ3JhcGhxbCBzZXJ2ZXIgdXJsIHNwZWNpZmllZCBpbiB0aGUgY29uZmlnXG4vLyBXZSBkbyBub3QgY2FsbCBkaXJlY3RseSBjcmVhdGVGaWxlIGZyb20gdGhlIFBhcnNlIFNlcnZlclxuLy8gdG8gbGV2ZXJhZ2UgdGhlIHN0YW5kYXJkIGZpbGUgdXBsb2FkIG1lY2hhbmlzbVxuY29uc3QgaGFuZGxlVXBsb2FkID0gYXN5bmMgKHVwbG9hZCwgY29uZmlnKSA9PiB7XG4gIGNvbnN0IHsgY3JlYXRlUmVhZFN0cmVhbSwgZmlsZW5hbWUgfSA9IGF3YWl0IHVwbG9hZDtcbiAgY29uc3QgaGVhZGVycyA9IHsgLi4uY29uZmlnLmhlYWRlcnMgfTtcbiAgZGVsZXRlIGhlYWRlcnNbJ2FjY2VwdC1lbmNvZGluZyddO1xuICBkZWxldGUgaGVhZGVyc1snYWNjZXB0J107XG4gIGRlbGV0ZSBoZWFkZXJzWydjb25uZWN0aW9uJ107XG4gIGRlbGV0ZSBoZWFkZXJzWydob3N0J107XG4gIGRlbGV0ZSBoZWFkZXJzWydjb250ZW50LWxlbmd0aCddO1xuICBjb25zdCBzdHJlYW0gPSBjcmVhdGVSZWFkU3RyZWFtKCk7XG4gIHRyeSB7XG4gICAgY29uc3Qgc2VydmVyVXJsID0gbmV3IFVSTChjb25maWcuc2VydmVyVVJMKTtcbiAgICBjb25zdCBmaWxlSW5mbyA9IGF3YWl0IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIGNvbnN0IHJlcSA9IHJlcXVlc3QoXG4gICAgICAgIHtcbiAgICAgICAgICBob3N0bmFtZTogc2VydmVyVXJsLmhvc3RuYW1lLFxuICAgICAgICAgIHBvcnQ6IHNlcnZlclVybC5wb3J0LFxuICAgICAgICAgIHBhdGg6IGAke3NlcnZlclVybC5wYXRobmFtZX0vZmlsZXMvJHtmaWxlbmFtZX1gLFxuICAgICAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgICAgICAgIGhlYWRlcnMsXG4gICAgICAgIH0sXG4gICAgICAgIHJlcyA9PiB7XG4gICAgICAgICAgbGV0IGRhdGEgPSAnJztcbiAgICAgICAgICByZXMub24oJ2RhdGEnLCBjaHVuayA9PiB7XG4gICAgICAgICAgICBkYXRhICs9IGNodW5rO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJlcy5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgcmVzb2x2ZShKU09OLnBhcnNlKGRhdGEpKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgcmVqZWN0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5lcnJvciwgZGF0YSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICApO1xuICAgICAgc3RyZWFtLnBpcGUocmVxKTtcbiAgICAgIHN0cmVhbS5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICByZXEuZW5kKCk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgICByZXR1cm4ge1xuICAgICAgZmlsZUluZm8sXG4gICAgfTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHN0cmVhbS5kZXN0cm95KCk7XG4gICAgbG9nZ2VyLmVycm9yKCdFcnJvciBjcmVhdGluZyBhIGZpbGU6ICcsIGUpO1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsIGBDb3VsZCBub3Qgc3RvcmUgZmlsZTogJHtmaWxlbmFtZX0uYCk7XG4gIH1cbn07XG5cbmNvbnN0IGxvYWQgPSBwYXJzZUdyYXBoUUxTY2hlbWEgPT4ge1xuICBjb25zdCBjcmVhdGVNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdDcmVhdGVGaWxlJyxcbiAgICBkZXNjcmlwdGlvbjogJ1RoZSBjcmVhdGVGaWxlIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGNyZWF0ZSBhbmQgdXBsb2FkIGEgbmV3IGZpbGUuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgdXBsb2FkOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbmV3IGZpbGUgdG8gYmUgY3JlYXRlZCBhbmQgdXBsb2FkZWQuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKGRlZmF1bHRHcmFwaFFMVHlwZXMuR3JhcGhRTFVwbG9hZCksXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICBmaWxlSW5mbzoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGNyZWF0ZWQgZmlsZSBpbmZvLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChkZWZhdWx0R3JhcGhRTFR5cGVzLkZJTEVfSU5GTyksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgdXBsb2FkIH0gPSBhcmdzO1xuICAgICAgICBjb25zdCB7IGNvbmZpZyB9ID0gY29udGV4dDtcbiAgICAgICAgcmV0dXJuIGhhbmRsZVVwbG9hZCh1cGxvYWQsIGNvbmZpZyk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY3JlYXRlTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjcmVhdGVNdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbignY3JlYXRlRmlsZScsIGNyZWF0ZU11dGF0aW9uLCB0cnVlLCB0cnVlKTtcbn07XG5cbmV4cG9ydCB7IGxvYWQsIGhhbmRsZVVwbG9hZCB9O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBa0M7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUVsQztBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU1BLFlBQVksR0FBRyxPQUFPQyxNQUFNLEVBQUVDLE1BQU0sS0FBSztFQUM3QyxNQUFNO0lBQUVDLGdCQUFnQjtJQUFFQztFQUFTLENBQUMsR0FBRyxNQUFNSCxNQUFNO0VBQ25ELE1BQU1JLE9BQU8scUJBQVFILE1BQU0sQ0FBQ0csT0FBTyxDQUFFO0VBQ3JDLE9BQU9BLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQztFQUNqQyxPQUFPQSxPQUFPLENBQUMsUUFBUSxDQUFDO0VBQ3hCLE9BQU9BLE9BQU8sQ0FBQyxZQUFZLENBQUM7RUFDNUIsT0FBT0EsT0FBTyxDQUFDLE1BQU0sQ0FBQztFQUN0QixPQUFPQSxPQUFPLENBQUMsZ0JBQWdCLENBQUM7RUFDaEMsTUFBTUMsTUFBTSxHQUFHSCxnQkFBZ0IsRUFBRTtFQUNqQyxJQUFJO0lBQ0YsTUFBTUksU0FBUyxHQUFHLElBQUlDLEdBQUcsQ0FBQ04sTUFBTSxDQUFDTyxTQUFTLENBQUM7SUFDM0MsTUFBTUMsUUFBUSxHQUFHLE1BQU0sSUFBSUMsT0FBTyxDQUFDLENBQUNDLE9BQU8sRUFBRUMsTUFBTSxLQUFLO01BQ3RELE1BQU1DLEdBQUcsR0FBRyxJQUFBQyxhQUFPLEVBQ2pCO1FBQ0VDLFFBQVEsRUFBRVQsU0FBUyxDQUFDUyxRQUFRO1FBQzVCQyxJQUFJLEVBQUVWLFNBQVMsQ0FBQ1UsSUFBSTtRQUNwQkMsSUFBSSxFQUFHLEdB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