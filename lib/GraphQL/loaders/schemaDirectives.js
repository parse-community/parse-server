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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvc2NoZW1hRGlyZWN0aXZlcy5qcyJdLCJuYW1lcyI6WyJkZWZpbml0aW9ucyIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zIiwicmVzb2x2ZURpcmVjdGl2ZSIsInNjaGVtYSIsIk1hcHBlcktpbmQiLCJPQkpFQ1RfRklFTEQiLCJmaWVsZENvbmZpZyIsImRpcmVjdGl2ZSIsInRvIiwidGFyZ2V0Q2xvdWRGdW5jdGlvbiIsInJlc29sdmUiLCJfc291cmNlIiwiYXJncyIsImNvbnRleHQiLCJncWxJbmZvIiwiY29uZmlnIiwiYXV0aCIsImluZm8iLCJmdW5jdGlvbk5hbWUiLCJmaWVsZE5hbWUiLCJGdW5jdGlvbnNSb3V0ZXIiLCJoYW5kbGVDbG91ZEZ1bmN0aW9uIiwicGFyYW1zIiwiYm9keSIsInJlc3BvbnNlIiwicmVzdWx0IiwiZSIsImhhbmRsZUVycm9yIiwibW9ja0RpcmVjdGl2ZSIsIndpdGgiLCJtb2NrVmFsdWUiLCJncmFwaFFMU2NoZW1hRGlyZWN0aXZlcyJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUVPLE1BQU1BLFdBQVcsR0FBSTtBQUM1QjtBQUNBO0FBQ0EsQ0FITzs7O0FBS1AsTUFBTUMsSUFBSSxHQUFHQyxrQkFBa0IsSUFBSTtBQUNqQ0EsRUFBQUEsa0JBQWtCLENBQUNDLGtDQUFuQixHQUF3REgsV0FBeEQ7O0FBRUEsUUFBTUksZ0JBQWdCLEdBQUdDLE1BQU0sSUFDN0Isc0JBQVVBLE1BQVYsRUFBa0I7QUFDaEIsS0FBQ0Msa0JBQVdDLFlBQVosR0FBMkJDLFdBQVcsSUFBSTtBQUFBOztBQUN4QyxZQUFNQyxTQUFTLG9CQUFHLHlCQUFhSixNQUFiLEVBQXFCRyxXQUFyQixFQUFrQyxTQUFsQyxDQUFILGtEQUFHLGNBQStDLENBQS9DLENBQWxCOztBQUNBLFVBQUlDLFNBQUosRUFBZTtBQUNiLGNBQU07QUFBRUMsVUFBQUEsRUFBRSxFQUFFQztBQUFOLFlBQThCRixTQUFwQzs7QUFDQUQsUUFBQUEsV0FBVyxDQUFDSSxPQUFaLEdBQXNCLE9BQU9DLE9BQVAsRUFBZ0JDLElBQWhCLEVBQXNCQyxPQUF0QixFQUErQkMsT0FBL0IsS0FBMkM7QUFDL0QsY0FBSTtBQUNGLGtCQUFNO0FBQUVDLGNBQUFBLE1BQUY7QUFBVUMsY0FBQUEsSUFBVjtBQUFnQkMsY0FBQUE7QUFBaEIsZ0JBQXlCSixPQUEvQjtBQUNBLGtCQUFNSyxZQUFZLEdBQUdULG1CQUFtQixJQUFJSyxPQUFPLENBQUNLLFNBQXBEO0FBQ0EsbUJBQU8sQ0FDTCxNQUFNQyxpQ0FBZ0JDLG1CQUFoQixDQUFvQztBQUN4Q0MsY0FBQUEsTUFBTSxFQUFFO0FBQ05KLGdCQUFBQTtBQURNLGVBRGdDO0FBSXhDSCxjQUFBQSxNQUp3QztBQUt4Q0MsY0FBQUEsSUFMd0M7QUFNeENDLGNBQUFBLElBTndDO0FBT3hDTSxjQUFBQSxJQUFJLEVBQUVYO0FBUGtDLGFBQXBDLENBREQsRUFVTFksUUFWSyxDQVVJQyxNQVZYO0FBV0QsV0FkRCxDQWNFLE9BQU9DLENBQVAsRUFBVTtBQUNWMUIsWUFBQUEsa0JBQWtCLENBQUMyQixXQUFuQixDQUErQkQsQ0FBL0I7QUFDRDtBQUNGLFNBbEJEO0FBbUJEOztBQUNELGFBQU9wQixXQUFQO0FBQ0Q7QUExQmUsR0FBbEIsQ0FERjs7QUE4QkEsUUFBTXNCLGFBQWEsR0FBR3pCLE1BQU0sSUFDMUIsc0JBQVVBLE1BQVYsRUFBa0I7QUFDaEIsS0FBQ0Msa0JBQVdDLFlBQVosR0FBMkJDLFdBQVcsSUFBSTtBQUFBOztBQUN4QyxZQUFNQyxTQUFTLHFCQUFHLHlCQUFhSixNQUFiLEVBQXFCRyxXQUFyQixFQUFrQyxNQUFsQyxDQUFILG1EQUFHLGVBQTRDLENBQTVDLENBQWxCOztBQUNBLFVBQUlDLFNBQUosRUFBZTtBQUNiLGNBQU07QUFBRXNCLFVBQUFBLElBQUksRUFBRUM7QUFBUixZQUFzQnZCLFNBQTVCOztBQUNBRCxRQUFBQSxXQUFXLENBQUNJLE9BQVosR0FBc0IsWUFBWW9CLFNBQWxDO0FBQ0Q7O0FBQ0QsYUFBT3hCLFdBQVA7QUFDRDtBQVJlLEdBQWxCLENBREY7O0FBWUFOLEVBQUFBLGtCQUFrQixDQUFDK0IsdUJBQW5CLEdBQTZDNUIsTUFBTSxJQUFJeUIsYUFBYSxDQUFDMUIsZ0JBQWdCLENBQUNDLE1BQUQsQ0FBakIsQ0FBcEU7QUFDRCxDQTlDRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IG1hcFNjaGVtYSwgZ2V0RGlyZWN0aXZlLCBNYXBwZXJLaW5kIH0gZnJvbSAnQGdyYXBocWwtdG9vbHMvdXRpbHMnO1xuaW1wb3J0IHsgRnVuY3Rpb25zUm91dGVyIH0gZnJvbSAnLi4vLi4vUm91dGVycy9GdW5jdGlvbnNSb3V0ZXInO1xuXG5leHBvcnQgY29uc3QgZGVmaW5pdGlvbnMgPSBgXG4gIGRpcmVjdGl2ZSBAcmVzb2x2ZSh0bzogU3RyaW5nKSBvbiBGSUVMRF9ERUZJTklUSU9OXG4gIGRpcmVjdGl2ZSBAbW9jayh3aXRoOiBBbnkhKSBvbiBGSUVMRF9ERUZJTklUSU9OXG5gO1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzRGVmaW5pdGlvbnMgPSBkZWZpbml0aW9ucztcblxuICBjb25zdCByZXNvbHZlRGlyZWN0aXZlID0gc2NoZW1hID0+XG4gICAgbWFwU2NoZW1hKHNjaGVtYSwge1xuICAgICAgW01hcHBlcktpbmQuT0JKRUNUX0ZJRUxEXTogZmllbGRDb25maWcgPT4ge1xuICAgICAgICBjb25zdCBkaXJlY3RpdmUgPSBnZXREaXJlY3RpdmUoc2NoZW1hLCBmaWVsZENvbmZpZywgJ3Jlc29sdmUnKT8uWzBdO1xuICAgICAgICBpZiAoZGlyZWN0aXZlKSB7XG4gICAgICAgICAgY29uc3QgeyB0bzogdGFyZ2V0Q2xvdWRGdW5jdGlvbiB9ID0gZGlyZWN0aXZlO1xuICAgICAgICAgIGZpZWxkQ29uZmlnLnJlc29sdmUgPSBhc3luYyAoX3NvdXJjZSwgYXJncywgY29udGV4dCwgZ3FsSW5mbykgPT4ge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG4gICAgICAgICAgICAgIGNvbnN0IGZ1bmN0aW9uTmFtZSA9IHRhcmdldENsb3VkRnVuY3Rpb24gfHwgZ3FsSW5mby5maWVsZE5hbWU7XG4gICAgICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAgICAgYXdhaXQgRnVuY3Rpb25zUm91dGVyLmhhbmRsZUNsb3VkRnVuY3Rpb24oe1xuICAgICAgICAgICAgICAgICAgcGFyYW1zOiB7XG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uTmFtZSxcbiAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgICAgIGJvZHk6IGFyZ3MsXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgKS5yZXNwb25zZS5yZXN1bHQ7XG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmaWVsZENvbmZpZztcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgY29uc3QgbW9ja0RpcmVjdGl2ZSA9IHNjaGVtYSA9PlxuICAgIG1hcFNjaGVtYShzY2hlbWEsIHtcbiAgICAgIFtNYXBwZXJLaW5kLk9CSkVDVF9GSUVMRF06IGZpZWxkQ29uZmlnID0+IHtcbiAgICAgICAgY29uc3QgZGlyZWN0aXZlID0gZ2V0RGlyZWN0aXZlKHNjaGVtYSwgZmllbGRDb25maWcsICdtb2NrJyk/LlswXTtcbiAgICAgICAgaWYgKGRpcmVjdGl2ZSkge1xuICAgICAgICAgIGNvbnN0IHsgd2l0aDogbW9ja1ZhbHVlIH0gPSBkaXJlY3RpdmU7XG4gICAgICAgICAgZmllbGRDb25maWcucmVzb2x2ZSA9IGFzeW5jICgpID0+IG1vY2tWYWx1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmllbGRDb25maWc7XG4gICAgICB9LFxuICAgIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlcyA9IHNjaGVtYSA9PiBtb2NrRGlyZWN0aXZlKHJlc29sdmVEaXJlY3RpdmUoc2NoZW1hKSk7XG59O1xuZXhwb3J0IHsgbG9hZCB9O1xuIl19