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

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZnVuY3Rpb25zTXV0YXRpb25zLmpzIl0sIm5hbWVzIjpbImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJmdW5jdGlvbk5hbWVzIiwibGVuZ3RoIiwiY2xvdWRDb2RlRnVuY3Rpb25FbnVtIiwiYWRkR3JhcGhRTFR5cGUiLCJHcmFwaFFMRW51bVR5cGUiLCJuYW1lIiwiZGVzY3JpcHRpb24iLCJ2YWx1ZXMiLCJyZWR1Y2UiLCJmdW5jdGlvbk5hbWUiLCJ2YWx1ZSIsImNhbGxDbG91ZENvZGVNdXRhdGlvbiIsImlucHV0RmllbGRzIiwidHlwZSIsIkdyYXBoUUxOb25OdWxsIiwicGFyYW1zIiwiZGVmYXVsdEdyYXBoUUxUeXBlcyIsIk9CSkVDVCIsIm91dHB1dEZpZWxkcyIsInJlc3VsdCIsIkFOWSIsIm11dGF0ZUFuZEdldFBheWxvYWQiLCJhcmdzIiwiY29udGV4dCIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwiRnVuY3Rpb25zUm91dGVyIiwiaGFuZGxlQ2xvdWRGdW5jdGlvbiIsImJvZHkiLCJyZXNwb25zZSIsImUiLCJoYW5kbGVFcnJvciIsImlucHV0Iiwib2ZUeXBlIiwiYWRkR3JhcGhRTE11dGF0aW9uIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7O0FBRUEsTUFBTUEsSUFBSSxHQUFHQyxrQkFBa0IsSUFBSTtBQUNqQyxNQUFJQSxrQkFBa0IsQ0FBQ0MsYUFBbkIsQ0FBaUNDLE1BQWpDLEdBQTBDLENBQTlDLEVBQWlEO0FBQy9DLFVBQU1DLHFCQUFxQixHQUFHSCxrQkFBa0IsQ0FBQ0ksY0FBbkIsQ0FDNUIsSUFBSUMsd0JBQUosQ0FBb0I7QUFDbEJDLE1BQUFBLElBQUksRUFBRSxtQkFEWTtBQUVsQkMsTUFBQUEsV0FBVyxFQUNULHdGQUhnQjtBQUlsQkMsTUFBQUEsTUFBTSxFQUFFUixrQkFBa0IsQ0FBQ0MsYUFBbkIsQ0FBaUNRLE1BQWpDLENBQ04sQ0FBQ0QsTUFBRCxFQUFTRSxZQUFULHFDQUNLRixNQURMO0FBRUUsU0FBQ0UsWUFBRCxHQUFnQjtBQUFFQyxVQUFBQSxLQUFLLEVBQUVEO0FBQVQ7QUFGbEIsUUFETSxFQUtOLEVBTE07QUFKVSxLQUFwQixDQUQ0QixFQWE1QixJQWI0QixFQWM1QixJQWQ0QixDQUE5QjtBQWlCQSxVQUFNRSxxQkFBcUIsR0FBRyxnREFBNkI7QUFDekROLE1BQUFBLElBQUksRUFBRSxlQURtRDtBQUV6REMsTUFBQUEsV0FBVyxFQUFFLHlFQUY0QztBQUd6RE0sTUFBQUEsV0FBVyxFQUFFO0FBQ1hILFFBQUFBLFlBQVksRUFBRTtBQUNaSCxVQUFBQSxXQUFXLEVBQUUsb0NBREQ7QUFFWk8sVUFBQUEsSUFBSSxFQUFFLElBQUlDLHVCQUFKLENBQW1CWixxQkFBbkI7QUFGTSxTQURIO0FBS1hhLFFBQUFBLE1BQU0sRUFBRTtBQUNOVCxVQUFBQSxXQUFXLEVBQUUsb0RBRFA7QUFFTk8sVUFBQUEsSUFBSSxFQUFFRyxtQkFBbUIsQ0FBQ0M7QUFGcEI7QUFMRyxPQUg0QztBQWF6REMsTUFBQUEsWUFBWSxFQUFFO0FBQ1pDLFFBQUFBLE1BQU0sRUFBRTtBQUNOYixVQUFBQSxXQUFXLEVBQUUsZ0VBRFA7QUFFTk8sVUFBQUEsSUFBSSxFQUFFRyxtQkFBbUIsQ0FBQ0k7QUFGcEI7QUFESSxPQWIyQztBQW1CekRDLE1BQUFBLG1CQUFtQixFQUFFLE9BQU9DLElBQVAsRUFBYUMsT0FBYixLQUF5QjtBQUM1QyxZQUFJO0FBQ0YsZ0JBQU07QUFBRWQsWUFBQUEsWUFBRjtBQUFnQk0sWUFBQUE7QUFBaEIsY0FBMkIsdUJBQVNPLElBQVQsQ0FBakM7QUFDQSxnQkFBTTtBQUFFRSxZQUFBQSxNQUFGO0FBQVVDLFlBQUFBLElBQVY7QUFBZ0JDLFlBQUFBO0FBQWhCLGNBQXlCSCxPQUEvQjtBQUVBLGlCQUFPO0FBQ0xKLFlBQUFBLE1BQU0sRUFBRSxDQUNOLE1BQU1RLGlDQUFnQkMsbUJBQWhCLENBQW9DO0FBQ3hDYixjQUFBQSxNQUFNLEVBQUU7QUFDTk4sZ0JBQUFBO0FBRE0sZUFEZ0M7QUFJeENlLGNBQUFBLE1BSndDO0FBS3hDQyxjQUFBQSxJQUx3QztBQU14Q0MsY0FBQUEsSUFOd0M7QUFPeENHLGNBQUFBLElBQUksRUFBRWQ7QUFQa0MsYUFBcEMsQ0FEQSxFQVVOZSxRQVZNLENBVUdYO0FBWE4sV0FBUDtBQWFELFNBakJELENBaUJFLE9BQU9ZLENBQVAsRUFBVTtBQUNWaEMsVUFBQUEsa0JBQWtCLENBQUNpQyxXQUFuQixDQUErQkQsQ0FBL0I7QUFDRDtBQUNGO0FBeEN3RCxLQUE3QixDQUE5QjtBQTJDQWhDLElBQUFBLGtCQUFrQixDQUFDSSxjQUFuQixDQUFrQ1EscUJBQXFCLENBQUNXLElBQXRCLENBQTJCVyxLQUEzQixDQUFpQ3BCLElBQWpDLENBQXNDcUIsTUFBeEUsRUFBZ0YsSUFBaEYsRUFBc0YsSUFBdEY7QUFDQW5DLElBQUFBLGtCQUFrQixDQUFDSSxjQUFuQixDQUFrQ1EscUJBQXFCLENBQUNFLElBQXhELEVBQThELElBQTlELEVBQW9FLElBQXBFO0FBQ0FkLElBQUFBLGtCQUFrQixDQUFDb0Msa0JBQW5CLENBQXNDLGVBQXRDLEVBQXVEeEIscUJBQXZELEVBQThFLElBQTlFLEVBQW9GLElBQXBGO0FBQ0Q7QUFDRixDQWxFRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEdyYXBoUUxOb25OdWxsLCBHcmFwaFFMRW51bVR5cGUgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCBkZWVwY29weSBmcm9tICdkZWVwY29weSc7XG5pbXBvcnQgeyBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkIH0gZnJvbSAnZ3JhcGhxbC1yZWxheSc7XG5pbXBvcnQgeyBGdW5jdGlvbnNSb3V0ZXIgfSBmcm9tICcuLi8uLi9Sb3V0ZXJzL0Z1bmN0aW9uc1JvdXRlcic7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4vZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5cbmNvbnN0IGxvYWQgPSBwYXJzZUdyYXBoUUxTY2hlbWEgPT4ge1xuICBpZiAocGFyc2VHcmFwaFFMU2NoZW1hLmZ1bmN0aW9uTmFtZXMubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IGNsb3VkQ29kZUZ1bmN0aW9uRW51bSA9IHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICAgIG5ldyBHcmFwaFFMRW51bVR5cGUoe1xuICAgICAgICBuYW1lOiAnQ2xvdWRDb2RlRnVuY3Rpb24nLFxuICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAnVGhlIENsb3VkQ29kZUZ1bmN0aW9uIGVudW0gdHlwZSBjb250YWlucyBhIGxpc3Qgb2YgYWxsIGF2YWlsYWJsZSBjbG91ZCBjb2RlIGZ1bmN0aW9ucy4nLFxuICAgICAgICB2YWx1ZXM6IHBhcnNlR3JhcGhRTFNjaGVtYS5mdW5jdGlvbk5hbWVzLnJlZHVjZShcbiAgICAgICAgICAodmFsdWVzLCBmdW5jdGlvbk5hbWUpID0+ICh7XG4gICAgICAgICAgICAuLi52YWx1ZXMsXG4gICAgICAgICAgICBbZnVuY3Rpb25OYW1lXTogeyB2YWx1ZTogZnVuY3Rpb25OYW1lIH0sXG4gICAgICAgICAgfSksXG4gICAgICAgICAge31cbiAgICAgICAgKSxcbiAgICAgIH0pLFxuICAgICAgdHJ1ZSxcbiAgICAgIHRydWVcbiAgICApO1xuXG4gICAgY29uc3QgY2FsbENsb3VkQ29kZU11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgICBuYW1lOiAnQ2FsbENsb3VkQ29kZScsXG4gICAgICBkZXNjcmlwdGlvbjogJ1RoZSBjYWxsQ2xvdWRDb2RlIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGludm9rZSBhIGNsb3VkIGNvZGUgZnVuY3Rpb24uJyxcbiAgICAgIGlucHV0RmllbGRzOiB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZToge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZnVuY3Rpb24gdG8gYmUgY2FsbGVkLicsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKGNsb3VkQ29kZUZ1bmN0aW9uRW51bSksXG4gICAgICAgIH0sXG4gICAgICAgIHBhcmFtczoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhlc2UgYXJlIHRoZSBwYXJhbXMgdG8gYmUgcGFzc2VkIHRvIHRoZSBmdW5jdGlvbi4nLFxuICAgICAgICAgIHR5cGU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNULFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgICByZXN1bHQ6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHJlc3VsdCB2YWx1ZSBvZiB0aGUgY2xvdWQgY29kZSBmdW5jdGlvbiBleGVjdXRpb24uJyxcbiAgICAgICAgICB0eXBlOiBkZWZhdWx0R3JhcGhRTFR5cGVzLkFOWSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHsgZnVuY3Rpb25OYW1lLCBwYXJhbXMgfSA9IGRlZXBjb3B5KGFyZ3MpO1xuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHJlc3VsdDogKFxuICAgICAgICAgICAgICBhd2FpdCBGdW5jdGlvbnNSb3V0ZXIuaGFuZGxlQ2xvdWRGdW5jdGlvbih7XG4gICAgICAgICAgICAgICAgcGFyYW1zOiB7XG4gICAgICAgICAgICAgICAgICBmdW5jdGlvbk5hbWUsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICAgIGJvZHk6IHBhcmFtcyxcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICkucmVzcG9uc2UucmVzdWx0LFxuICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2FsbENsb3VkQ29kZU11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsIHRydWUsIHRydWUpO1xuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjYWxsQ2xvdWRDb2RlTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbignY2FsbENsb3VkQ29kZScsIGNhbGxDbG91ZENvZGVNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG4gIH1cbn07XG5cbmV4cG9ydCB7IGxvYWQgfTtcbiJdfQ==