"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = exports.definitions = void 0;
var _utils = require("@graphql-tools/utils");
var _FunctionsRouter = require("../../Routers/FunctionsRouter");
const definitions = `
  directive @resolve(to: String) on FIELD_DEFINITION
  directive @mock(with: Any!) on FIELD_DEFINITION
`;
exports.definitions = definitions;
const load = parseGraphQLSchema => {
  parseGraphQLSchema.graphQLSchemaDirectivesDefinitions = definitions;
  const resolveDirective = schema => (0, _utils.mapSchema)(schema, {
    [_utils.MapperKind.OBJECT_FIELD]: fieldConfig => {
      var _getDirective;
      const directive = (_getDirective = (0, _utils.getDirective)(schema, fieldConfig, 'resolve')) === null || _getDirective === void 0 ? void 0 : _getDirective[0];
      if (directive) {
        const {
          to: targetCloudFunction
        } = directive;
        fieldConfig.resolve = async (_source, args, context, gqlInfo) => {
          try {
            const {
              config,
              auth,
              info
            } = context;
            const functionName = targetCloudFunction || gqlInfo.fieldName;
            return (await _FunctionsRouter.FunctionsRouter.handleCloudFunction({
              params: {
                functionName
              },
              config,
              auth,
              info,
              body: args
            })).response.result;
          } catch (e) {
            parseGraphQLSchema.handleError(e);
          }
        };
      }
      return fieldConfig;
    }
  });
  const mockDirective = schema => (0, _utils.mapSchema)(schema, {
    [_utils.MapperKind.OBJECT_FIELD]: fieldConfig => {
      var _getDirective2;
      const directive = (_getDirective2 = (0, _utils.getDirective)(schema, fieldConfig, 'mock')) === null || _getDirective2 === void 0 ? void 0 : _getDirective2[0];
      if (directive) {
        const {
          with: mockValue
        } = directive;
        fieldConfig.resolve = async () => mockValue;
      }
      return fieldConfig;
    }
  });
  parseGraphQLSchema.graphQLSchemaDirectives = schema => mockDirective(resolveDirective(schema));
};
exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJkZWZpbml0aW9ucyIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zIiwicmVzb2x2ZURpcmVjdGl2ZSIsInNjaGVtYSIsIm1hcFNjaGVtYSIsIk1hcHBlcktpbmQiLCJPQkpFQ1RfRklFTEQiLCJmaWVsZENvbmZpZyIsImRpcmVjdGl2ZSIsImdldERpcmVjdGl2ZSIsInRvIiwidGFyZ2V0Q2xvdWRGdW5jdGlvbiIsInJlc29sdmUiLCJfc291cmNlIiwiYXJncyIsImNvbnRleHQiLCJncWxJbmZvIiwiY29uZmlnIiwiYXV0aCIsImluZm8iLCJmdW5jdGlvbk5hbWUiLCJmaWVsZE5hbWUiLCJGdW5jdGlvbnNSb3V0ZXIiLCJoYW5kbGVDbG91ZEZ1bmN0aW9uIiwicGFyYW1zIiwiYm9keSIsInJlc3BvbnNlIiwicmVzdWx0IiwiZSIsImhhbmRsZUVycm9yIiwibW9ja0RpcmVjdGl2ZSIsIndpdGgiLCJtb2NrVmFsdWUiLCJncmFwaFFMU2NoZW1hRGlyZWN0aXZlcyJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvc2NoZW1hRGlyZWN0aXZlcy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBtYXBTY2hlbWEsIGdldERpcmVjdGl2ZSwgTWFwcGVyS2luZCB9IGZyb20gJ0BncmFwaHFsLXRvb2xzL3V0aWxzJztcbmltcG9ydCB7IEZ1bmN0aW9uc1JvdXRlciB9IGZyb20gJy4uLy4uL1JvdXRlcnMvRnVuY3Rpb25zUm91dGVyJztcblxuZXhwb3J0IGNvbnN0IGRlZmluaXRpb25zID0gYFxuICBkaXJlY3RpdmUgQHJlc29sdmUodG86IFN0cmluZykgb24gRklFTERfREVGSU5JVElPTlxuICBkaXJlY3RpdmUgQG1vY2sod2l0aDogQW55ISkgb24gRklFTERfREVGSU5JVElPTlxuYDtcblxuY29uc3QgbG9hZCA9IHBhcnNlR3JhcGhRTFNjaGVtYSA9PiB7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zID0gZGVmaW5pdGlvbnM7XG5cbiAgY29uc3QgcmVzb2x2ZURpcmVjdGl2ZSA9IHNjaGVtYSA9PlxuICAgIG1hcFNjaGVtYShzY2hlbWEsIHtcbiAgICAgIFtNYXBwZXJLaW5kLk9CSkVDVF9GSUVMRF06IGZpZWxkQ29uZmlnID0+IHtcbiAgICAgICAgY29uc3QgZGlyZWN0aXZlID0gZ2V0RGlyZWN0aXZlKHNjaGVtYSwgZmllbGRDb25maWcsICdyZXNvbHZlJyk/LlswXTtcbiAgICAgICAgaWYgKGRpcmVjdGl2ZSkge1xuICAgICAgICAgIGNvbnN0IHsgdG86IHRhcmdldENsb3VkRnVuY3Rpb24gfSA9IGRpcmVjdGl2ZTtcbiAgICAgICAgICBmaWVsZENvbmZpZy5yZXNvbHZlID0gYXN5bmMgKF9zb3VyY2UsIGFyZ3MsIGNvbnRleHQsIGdxbEluZm8pID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuICAgICAgICAgICAgICBjb25zdCBmdW5jdGlvbk5hbWUgPSB0YXJnZXRDbG91ZEZ1bmN0aW9uIHx8IGdxbEluZm8uZmllbGROYW1lO1xuICAgICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICAgIGF3YWl0IEZ1bmN0aW9uc1JvdXRlci5oYW5kbGVDbG91ZEZ1bmN0aW9uKHtcbiAgICAgICAgICAgICAgICAgIHBhcmFtczoge1xuICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbk5hbWUsXG4gICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICAgICAgICBib2R5OiBhcmdzLFxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICkucmVzcG9uc2UucmVzdWx0O1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmllbGRDb25maWc7XG4gICAgICB9LFxuICAgIH0pO1xuXG4gIGNvbnN0IG1vY2tEaXJlY3RpdmUgPSBzY2hlbWEgPT5cbiAgICBtYXBTY2hlbWEoc2NoZW1hLCB7XG4gICAgICBbTWFwcGVyS2luZC5PQkpFQ1RfRklFTERdOiBmaWVsZENvbmZpZyA9PiB7XG4gICAgICAgIGNvbnN0IGRpcmVjdGl2ZSA9IGdldERpcmVjdGl2ZShzY2hlbWEsIGZpZWxkQ29uZmlnLCAnbW9jaycpPy5bMF07XG4gICAgICAgIGlmIChkaXJlY3RpdmUpIHtcbiAgICAgICAgICBjb25zdCB7IHdpdGg6IG1vY2tWYWx1ZSB9ID0gZGlyZWN0aXZlO1xuICAgICAgICAgIGZpZWxkQ29uZmlnLnJlc29sdmUgPSBhc3luYyAoKSA9PiBtb2NrVmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZpZWxkQ29uZmlnO1xuICAgICAgfSxcbiAgICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXMgPSBzY2hlbWEgPT4gbW9ja0RpcmVjdGl2ZShyZXNvbHZlRGlyZWN0aXZlKHNjaGVtYSkpO1xufTtcbmV4cG9ydCB7IGxvYWQgfTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUE7QUFDQTtBQUVPLE1BQU1BLFdBQVcsR0FBSTtBQUM1QjtBQUNBO0FBQ0EsQ0FBQztBQUFDO0FBRUYsTUFBTUMsSUFBSSxHQUFHQyxrQkFBa0IsSUFBSTtFQUNqQ0Esa0JBQWtCLENBQUNDLGtDQUFrQyxHQUFHSCxXQUFXO0VBRW5FLE1BQU1JLGdCQUFnQixHQUFHQyxNQUFNLElBQzdCLElBQUFDLGdCQUFTLEVBQUNELE1BQU0sRUFBRTtJQUNoQixDQUFDRSxpQkFBVSxDQUFDQyxZQUFZLEdBQUdDLFdBQVcsSUFBSTtNQUFBO01BQ3hDLE1BQU1DLFNBQVMsb0JBQUcsSUFBQUMsbUJBQVksRUFBQ04sTUFBTSxFQUFFSSxXQUFXLEVBQUUsU0FBUyxDQUFDLGtEQUE1QyxjQUErQyxDQUFDLENBQUM7TUFDbkUsSUFBSUMsU0FBUyxFQUFFO1FBQ2IsTUFBTTtVQUFFRSxFQUFFLEVBQUVDO1FBQW9CLENBQUMsR0FBR0gsU0FBUztRQUM3Q0QsV0FBVyxDQUFDSyxPQUFPLEdBQUcsT0FBT0MsT0FBTyxFQUFFQyxJQUFJLEVBQUVDLE9BQU8sRUFBRUMsT0FBTyxLQUFLO1VBQy9ELElBQUk7WUFDRixNQUFNO2NBQUVDLE1BQU07Y0FBRUMsSUFBSTtjQUFFQztZQUFLLENBQUMsR0FBR0osT0FBTztZQUN0QyxNQUFNSyxZQUFZLEdBQUdULG1CQUFtQixJQUFJSyxPQUFPLENBQUNLLFNBQVM7WUFDN0QsT0FBTyxDQUNMLE1BQU1DLGdDQUFlLENBQUNDLG1CQUFtQixDQUFDO2NBQ3hDQyxNQUFNLEVBQUU7Z0JBQ05KO2NBQ0YsQ0FBQztjQUNESCxNQUFNO2NBQ05DLElBQUk7Y0FDSkMsSUFBSTtjQUNKTSxJQUFJLEVBQUVYO1lBQ1IsQ0FBQyxDQUFDLEVBQ0ZZLFFBQVEsQ0FBQ0MsTUFBTTtVQUNuQixDQUFDLENBQUMsT0FBT0MsQ0FBQyxFQUFFO1lBQ1Y1QixrQkFBa0IsQ0FBQzZCLFdBQVcsQ0FBQ0QsQ0FBQyxDQUFDO1VBQ25DO1FBQ0YsQ0FBQztNQUNIO01BQ0EsT0FBT3JCLFdBQVc7SUFDcEI7RUFDRixDQUFDLENBQUM7RUFFSixNQUFNdUIsYUFBYSxHQUFHM0IsTUFBTSxJQUMxQixJQUFBQyxnQkFBUyxFQUFDRCxNQUFNLEVBQUU7SUFDaEIsQ0FBQ0UsaUJBQVUsQ0FBQ0MsWUFBWSxHQUFHQyxXQUFXLElBQUk7TUFBQTtNQUN4QyxNQUFNQyxTQUFTLHFCQUFHLElBQUFDLG1CQUFZLEVBQUNOLE1BQU0sRUFBRUksV0FBVyxFQUFFLE1BQU0sQ0FBQyxtREFBekMsZUFBNEMsQ0FBQyxDQUFDO01BQ2hFLElBQUlDLFNBQVMsRUFBRTtRQUNiLE1BQU07VUFBRXVCLElBQUksRUFBRUM7UUFBVSxDQUFDLEdBQUd4QixTQUFTO1FBQ3JDRCxXQUFXLENBQUNLLE9BQU8sR0FBRyxZQUFZb0IsU0FBUztNQUM3QztNQUNBLE9BQU96QixXQUFXO0lBQ3BCO0VBQ0YsQ0FBQyxDQUFDO0VBRUpQLGtCQUFrQixDQUFDaUMsdUJBQXVCLEdBQUc5QixNQUFNLElBQUkyQixhQUFhLENBQUM1QixnQkFBZ0IsQ0FBQ0MsTUFBTSxDQUFDLENBQUM7QUFDaEcsQ0FBQztBQUFDIn0=