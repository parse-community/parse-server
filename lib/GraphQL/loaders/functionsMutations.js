"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;
var _graphql = require("graphql");
var _deepcopy = _interopRequireDefault(require("deepcopy"));
var _graphqlRelay = require("graphql-relay");
var _FunctionsRouter = require("../../Routers/FunctionsRouter");
var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
const load = parseGraphQLSchema => {
  if (parseGraphQLSchema.functionNames.length > 0) {
    const cloudCodeFunctionEnum = parseGraphQLSchema.addGraphQLType(new _graphql.GraphQLEnumType({
      name: 'CloudCodeFunction',
      description: 'The CloudCodeFunction enum type contains a list of all available cloud code functions.',
      values: parseGraphQLSchema.functionNames.reduce((values, functionName) => _objectSpread(_objectSpread({}, values), {}, {
        [functionName]: {
          value: functionName
        }
      }), {})
    }), true, true);
    const callCloudCodeMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
      name: 'CallCloudCode',
      description: 'The callCloudCode mutation can be used to invoke a cloud code function.',
      inputFields: {
        functionName: {
          description: 'This is the function to be called.',
          type: new _graphql.GraphQLNonNull(cloudCodeFunctionEnum)
        },
        params: {
          description: 'These are the params to be passed to the function.',
          type: defaultGraphQLTypes.OBJECT
        }
      },
      outputFields: {
        result: {
          description: 'This is the result value of the cloud code function execution.',
          type: defaultGraphQLTypes.ANY
        }
      },
      mutateAndGetPayload: async (args, context) => {
        try {
          const {
            functionName,
            params
          } = (0, _deepcopy.default)(args);
          const {
            config,
            auth,
            info
          } = context;
          return {
            result: (await _FunctionsRouter.FunctionsRouter.handleCloudFunction({
              params: {
                functionName
              },
              config,
              auth,
              info,
              body: params
            })).response.result
          };
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      }
    });
    parseGraphQLSchema.addGraphQLType(callCloudCodeMutation.args.input.type.ofType, true, true);
    parseGraphQLSchema.addGraphQLType(callCloudCodeMutation.type, true, true);
    parseGraphQLSchema.addGraphQLMutation('callCloudCode', callCloudCodeMutation, true, true);
  }
};
exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJsb2FkIiwicGFyc2VHcmFwaFFMU2NoZW1hIiwiZnVuY3Rpb25OYW1lcyIsImxlbmd0aCIsImNsb3VkQ29kZUZ1bmN0aW9uRW51bSIsImFkZEdyYXBoUUxUeXBlIiwiR3JhcGhRTEVudW1UeXBlIiwibmFtZSIsImRlc2NyaXB0aW9uIiwidmFsdWVzIiwicmVkdWNlIiwiZnVuY3Rpb25OYW1lIiwidmFsdWUiLCJjYWxsQ2xvdWRDb2RlTXV0YXRpb24iLCJtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkIiwiaW5wdXRGaWVsZHMiLCJ0eXBlIiwiR3JhcGhRTE5vbk51bGwiLCJwYXJhbXMiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiT0JKRUNUIiwib3V0cHV0RmllbGRzIiwicmVzdWx0IiwiQU5ZIiwibXV0YXRlQW5kR2V0UGF5bG9hZCIsImFyZ3MiLCJjb250ZXh0IiwiZGVlcGNvcHkiLCJjb25maWciLCJhdXRoIiwiaW5mbyIsIkZ1bmN0aW9uc1JvdXRlciIsImhhbmRsZUNsb3VkRnVuY3Rpb24iLCJib2R5IiwicmVzcG9uc2UiLCJlIiwiaGFuZGxlRXJyb3IiLCJpbnB1dCIsIm9mVHlwZSIsImFkZEdyYXBoUUxNdXRhdGlvbiJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZnVuY3Rpb25zTXV0YXRpb25zLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEdyYXBoUUxOb25OdWxsLCBHcmFwaFFMRW51bVR5cGUgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCBkZWVwY29weSBmcm9tICdkZWVwY29weSc7XG5pbXBvcnQgeyBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkIH0gZnJvbSAnZ3JhcGhxbC1yZWxheSc7XG5pbXBvcnQgeyBGdW5jdGlvbnNSb3V0ZXIgfSBmcm9tICcuLi8uLi9Sb3V0ZXJzL0Z1bmN0aW9uc1JvdXRlcic7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4vZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5cbmNvbnN0IGxvYWQgPSBwYXJzZUdyYXBoUUxTY2hlbWEgPT4ge1xuICBpZiAocGFyc2VHcmFwaFFMU2NoZW1hLmZ1bmN0aW9uTmFtZXMubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IGNsb3VkQ29kZUZ1bmN0aW9uRW51bSA9IHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICAgIG5ldyBHcmFwaFFMRW51bVR5cGUoe1xuICAgICAgICBuYW1lOiAnQ2xvdWRDb2RlRnVuY3Rpb24nLFxuICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAnVGhlIENsb3VkQ29kZUZ1bmN0aW9uIGVudW0gdHlwZSBjb250YWlucyBhIGxpc3Qgb2YgYWxsIGF2YWlsYWJsZSBjbG91ZCBjb2RlIGZ1bmN0aW9ucy4nLFxuICAgICAgICB2YWx1ZXM6IHBhcnNlR3JhcGhRTFNjaGVtYS5mdW5jdGlvbk5hbWVzLnJlZHVjZShcbiAgICAgICAgICAodmFsdWVzLCBmdW5jdGlvbk5hbWUpID0+ICh7XG4gICAgICAgICAgICAuLi52YWx1ZXMsXG4gICAgICAgICAgICBbZnVuY3Rpb25OYW1lXTogeyB2YWx1ZTogZnVuY3Rpb25OYW1lIH0sXG4gICAgICAgICAgfSksXG4gICAgICAgICAge31cbiAgICAgICAgKSxcbiAgICAgIH0pLFxuICAgICAgdHJ1ZSxcbiAgICAgIHRydWVcbiAgICApO1xuXG4gICAgY29uc3QgY2FsbENsb3VkQ29kZU11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgICBuYW1lOiAnQ2FsbENsb3VkQ29kZScsXG4gICAgICBkZXNjcmlwdGlvbjogJ1RoZSBjYWxsQ2xvdWRDb2RlIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGludm9rZSBhIGNsb3VkIGNvZGUgZnVuY3Rpb24uJyxcbiAgICAgIGlucHV0RmllbGRzOiB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZToge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZnVuY3Rpb24gdG8gYmUgY2FsbGVkLicsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKGNsb3VkQ29kZUZ1bmN0aW9uRW51bSksXG4gICAgICAgIH0sXG4gICAgICAgIHBhcmFtczoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhlc2UgYXJlIHRoZSBwYXJhbXMgdG8gYmUgcGFzc2VkIHRvIHRoZSBmdW5jdGlvbi4nLFxuICAgICAgICAgIHR5cGU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNULFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgICByZXN1bHQ6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHJlc3VsdCB2YWx1ZSBvZiB0aGUgY2xvdWQgY29kZSBmdW5jdGlvbiBleGVjdXRpb24uJyxcbiAgICAgICAgICB0eXBlOiBkZWZhdWx0R3JhcGhRTFR5cGVzLkFOWSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHsgZnVuY3Rpb25OYW1lLCBwYXJhbXMgfSA9IGRlZXBjb3B5KGFyZ3MpO1xuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHJlc3VsdDogKFxuICAgICAgICAgICAgICBhd2FpdCBGdW5jdGlvbnNSb3V0ZXIuaGFuZGxlQ2xvdWRGdW5jdGlvbih7XG4gICAgICAgICAgICAgICAgcGFyYW1zOiB7XG4gICAgICAgICAgICAgICAgICBmdW5jdGlvbk5hbWUsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICAgIGJvZHk6IHBhcmFtcyxcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICkucmVzcG9uc2UucmVzdWx0LFxuICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2FsbENsb3VkQ29kZU11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsIHRydWUsIHRydWUpO1xuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjYWxsQ2xvdWRDb2RlTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbignY2FsbENsb3VkQ29kZScsIGNhbGxDbG91ZENvZGVNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG4gIH1cbn07XG5cbmV4cG9ydCB7IGxvYWQgfTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUE2RDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBRTdELE1BQU1BLElBQUksR0FBR0Msa0JBQWtCLElBQUk7RUFDakMsSUFBSUEsa0JBQWtCLENBQUNDLGFBQWEsQ0FBQ0MsTUFBTSxHQUFHLENBQUMsRUFBRTtJQUMvQyxNQUFNQyxxQkFBcUIsR0FBR0gsa0JBQWtCLENBQUNJLGNBQWMsQ0FDN0QsSUFBSUMsd0JBQWUsQ0FBQztNQUNsQkMsSUFBSSxFQUFFLG1CQUFtQjtNQUN6QkMsV0FBVyxFQUNULHdGQUF3RjtNQUMxRkMsTUFBTSxFQUFFUixrQkFBa0IsQ0FBQ0MsYUFBYSxDQUFDUSxNQUFNLENBQzdDLENBQUNELE1BQU0sRUFBRUUsWUFBWSxxQ0FDaEJGLE1BQU07UUFDVCxDQUFDRSxZQUFZLEdBQUc7VUFBRUMsS0FBSyxFQUFFRDtRQUFhO01BQUMsRUFDdkMsRUFDRixDQUFDLENBQUM7SUFFTixDQUFDLENBQUMsRUFDRixJQUFJLEVBQ0osSUFBSSxDQUNMO0lBRUQsTUFBTUUscUJBQXFCLEdBQUcsSUFBQUMsMENBQTRCLEVBQUM7TUFDekRQLElBQUksRUFBRSxlQUFlO01BQ3JCQyxXQUFXLEVBQUUseUVBQXlFO01BQ3RGTyxXQUFXLEVBQUU7UUFDWEosWUFBWSxFQUFFO1VBQ1pILFdBQVcsRUFBRSxvQ0FBb0M7VUFDakRRLElBQUksRUFBRSxJQUFJQyx1QkFBYyxDQUFDYixxQkFBcUI7UUFDaEQsQ0FBQztRQUNEYyxNQUFNLEVBQUU7VUFDTlYsV0FBVyxFQUFFLG9EQUFvRDtVQUNqRVEsSUFBSSxFQUFFRyxtQkFBbUIsQ0FBQ0M7UUFDNUI7TUFDRixDQUFDO01BQ0RDLFlBQVksRUFBRTtRQUNaQyxNQUFNLEVBQUU7VUFDTmQsV0FBVyxFQUFFLGdFQUFnRTtVQUM3RVEsSUFBSSxFQUFFRyxtQkFBbUIsQ0FBQ0k7UUFDNUI7TUFDRixDQUFDO01BQ0RDLG1CQUFtQixFQUFFLE9BQU9DLElBQUksRUFBRUMsT0FBTyxLQUFLO1FBQzVDLElBQUk7VUFDRixNQUFNO1lBQUVmLFlBQVk7WUFBRU87VUFBTyxDQUFDLEdBQUcsSUFBQVMsaUJBQVEsRUFBQ0YsSUFBSSxDQUFDO1VBQy9DLE1BQU07WUFBRUcsTUFBTTtZQUFFQyxJQUFJO1lBQUVDO1VBQUssQ0FBQyxHQUFHSixPQUFPO1VBRXRDLE9BQU87WUFDTEosTUFBTSxFQUFFLENBQ04sTUFBTVMsZ0NBQWUsQ0FBQ0MsbUJBQW1CLENBQUM7Y0FDeENkLE1BQU0sRUFBRTtnQkFDTlA7Y0FDRixDQUFDO2NBQ0RpQixNQUFNO2NBQ05DLElBQUk7Y0FDSkMsSUFBSTtjQUNKRyxJQUFJLEVBQUVmO1lBQ1IsQ0FBQyxDQUFDLEVBQ0ZnQixRQUFRLENBQUNaO1VBQ2IsQ0FBQztRQUNILENBQUMsQ0FBQyxPQUFPYSxDQUFDLEVBQUU7VUFDVmxDLGtCQUFrQixDQUFDbUMsV0FBVyxDQUFDRCxDQUFDLENBQUM7UUFDbkM7TUFDRjtJQUNGLENBQUMsQ0FBQztJQUVGbEMsa0JBQWtCLENBQUNJLGNBQWMsQ0FBQ1EscUJBQXFCLENBQUNZLElBQUksQ0FBQ1ksS0FBSyxDQUFDckIsSUFBSSxDQUFDc0IsTUFBTSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUM7SUFDM0ZyQyxrQkFBa0IsQ0FBQ0ksY0FBYyxDQUFDUSxxQkFBcUIsQ0FBQ0csSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUM7SUFDekVmLGtCQUFrQixDQUFDc0Msa0JBQWtCLENBQUMsZUFBZSxFQUFFMUIscUJBQXFCLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQztFQUMzRjtBQUNGLENBQUM7QUFBQyJ9