"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = exports.definitions = void 0;

var _graphqlTag = _interopRequireDefault(require("graphql-tag"));

var _utils = require("@graphql-tools/utils");

var _FunctionsRouter = require("../../Routers/FunctionsRouter");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const definitions = (0, _graphqlTag.default)`
  directive @resolve(to: String) on FIELD_DEFINITION
  directive @mock(with: Any!) on FIELD_DEFINITION
`;
exports.definitions = definitions;

const load = parseGraphQLSchema => {
  parseGraphQLSchema.graphQLSchemaDirectivesDefinitions = definitions;

  class ResolveDirectiveVisitor extends _utils.SchemaDirectiveVisitor {
    visitFieldDefinition(field) {
      field.resolve = async (_source, args, context) => {
        try {
          const {
            config,
            auth,
            info
          } = context;
          let functionName = field.name;

          if (this.args.to) {
            functionName = this.args.to;
          }

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

  }

  parseGraphQLSchema.graphQLSchemaDirectives.resolve = ResolveDirectiveVisitor;

  class MockDirectiveVisitor extends _utils.SchemaDirectiveVisitor {
    visitFieldDefinition(field) {
      field.resolve = () => {
        return this.args.with;
      };
    }

  }

  parseGraphQLSchema.graphQLSchemaDirectives.mock = MockDirectiveVisitor;
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvc2NoZW1hRGlyZWN0aXZlcy5qcyJdLCJuYW1lcyI6WyJkZWZpbml0aW9ucyIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zIiwiUmVzb2x2ZURpcmVjdGl2ZVZpc2l0b3IiLCJTY2hlbWFEaXJlY3RpdmVWaXNpdG9yIiwidmlzaXRGaWVsZERlZmluaXRpb24iLCJmaWVsZCIsInJlc29sdmUiLCJfc291cmNlIiwiYXJncyIsImNvbnRleHQiLCJjb25maWciLCJhdXRoIiwiaW5mbyIsImZ1bmN0aW9uTmFtZSIsIm5hbWUiLCJ0byIsIkZ1bmN0aW9uc1JvdXRlciIsImhhbmRsZUNsb3VkRnVuY3Rpb24iLCJwYXJhbXMiLCJib2R5IiwicmVzcG9uc2UiLCJyZXN1bHQiLCJlIiwiaGFuZGxlRXJyb3IiLCJncmFwaFFMU2NoZW1hRGlyZWN0aXZlcyIsIk1vY2tEaXJlY3RpdmVWaXNpdG9yIiwid2l0aCIsIm1vY2siXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7OztBQUVPLE1BQU1BLFdBQVcsR0FBRyx3QkFBSTtBQUMvQjtBQUNBO0FBQ0EsQ0FITzs7O0FBS1AsTUFBTUMsSUFBSSxHQUFHQyxrQkFBa0IsSUFBSTtBQUNqQ0EsRUFBQUEsa0JBQWtCLENBQUNDLGtDQUFuQixHQUF3REgsV0FBeEQ7O0FBRUEsUUFBTUksdUJBQU4sU0FBc0NDLDZCQUF0QyxDQUE2RDtBQUMzREMsSUFBQUEsb0JBQW9CLENBQUNDLEtBQUQsRUFBUTtBQUMxQkEsTUFBQUEsS0FBSyxDQUFDQyxPQUFOLEdBQWdCLE9BQU9DLE9BQVAsRUFBZ0JDLElBQWhCLEVBQXNCQyxPQUF0QixLQUFrQztBQUNoRCxZQUFJO0FBQ0YsZ0JBQU07QUFBRUMsWUFBQUEsTUFBRjtBQUFVQyxZQUFBQSxJQUFWO0FBQWdCQyxZQUFBQTtBQUFoQixjQUF5QkgsT0FBL0I7QUFFQSxjQUFJSSxZQUFZLEdBQUdSLEtBQUssQ0FBQ1MsSUFBekI7O0FBQ0EsY0FBSSxLQUFLTixJQUFMLENBQVVPLEVBQWQsRUFBa0I7QUFDaEJGLFlBQUFBLFlBQVksR0FBRyxLQUFLTCxJQUFMLENBQVVPLEVBQXpCO0FBQ0Q7O0FBRUQsaUJBQU8sQ0FDTCxNQUFNQyxpQ0FBZ0JDLG1CQUFoQixDQUFvQztBQUN4Q0MsWUFBQUEsTUFBTSxFQUFFO0FBQ05MLGNBQUFBO0FBRE0sYUFEZ0M7QUFJeENILFlBQUFBLE1BSndDO0FBS3hDQyxZQUFBQSxJQUx3QztBQU14Q0MsWUFBQUEsSUFOd0M7QUFPeENPLFlBQUFBLElBQUksRUFBRVg7QUFQa0MsV0FBcEMsQ0FERCxFQVVMWSxRQVZLLENBVUlDLE1BVlg7QUFXRCxTQW5CRCxDQW1CRSxPQUFPQyxDQUFQLEVBQVU7QUFDVnRCLFVBQUFBLGtCQUFrQixDQUFDdUIsV0FBbkIsQ0FBK0JELENBQS9CO0FBQ0Q7QUFDRixPQXZCRDtBQXdCRDs7QUExQjBEOztBQTZCN0R0QixFQUFBQSxrQkFBa0IsQ0FBQ3dCLHVCQUFuQixDQUEyQ2xCLE9BQTNDLEdBQXFESix1QkFBckQ7O0FBRUEsUUFBTXVCLG9CQUFOLFNBQW1DdEIsNkJBQW5DLENBQTBEO0FBQ3hEQyxJQUFBQSxvQkFBb0IsQ0FBQ0MsS0FBRCxFQUFRO0FBQzFCQSxNQUFBQSxLQUFLLENBQUNDLE9BQU4sR0FBZ0IsTUFBTTtBQUNwQixlQUFPLEtBQUtFLElBQUwsQ0FBVWtCLElBQWpCO0FBQ0QsT0FGRDtBQUdEOztBQUx1RDs7QUFRMUQxQixFQUFBQSxrQkFBa0IsQ0FBQ3dCLHVCQUFuQixDQUEyQ0csSUFBM0MsR0FBa0RGLG9CQUFsRDtBQUNELENBM0NEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGdxbCBmcm9tICdncmFwaHFsLXRhZyc7XG5pbXBvcnQgeyBTY2hlbWFEaXJlY3RpdmVWaXNpdG9yIH0gZnJvbSAnQGdyYXBocWwtdG9vbHMvdXRpbHMnO1xuaW1wb3J0IHsgRnVuY3Rpb25zUm91dGVyIH0gZnJvbSAnLi4vLi4vUm91dGVycy9GdW5jdGlvbnNSb3V0ZXInO1xuXG5leHBvcnQgY29uc3QgZGVmaW5pdGlvbnMgPSBncWxgXG4gIGRpcmVjdGl2ZSBAcmVzb2x2ZSh0bzogU3RyaW5nKSBvbiBGSUVMRF9ERUZJTklUSU9OXG4gIGRpcmVjdGl2ZSBAbW9jayh3aXRoOiBBbnkhKSBvbiBGSUVMRF9ERUZJTklUSU9OXG5gO1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzRGVmaW5pdGlvbnMgPSBkZWZpbml0aW9ucztcblxuICBjbGFzcyBSZXNvbHZlRGlyZWN0aXZlVmlzaXRvciBleHRlbmRzIFNjaGVtYURpcmVjdGl2ZVZpc2l0b3Ige1xuICAgIHZpc2l0RmllbGREZWZpbml0aW9uKGZpZWxkKSB7XG4gICAgICBmaWVsZC5yZXNvbHZlID0gYXN5bmMgKF9zb3VyY2UsIGFyZ3MsIGNvbnRleHQpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICAgIGxldCBmdW5jdGlvbk5hbWUgPSBmaWVsZC5uYW1lO1xuICAgICAgICAgIGlmICh0aGlzLmFyZ3MudG8pIHtcbiAgICAgICAgICAgIGZ1bmN0aW9uTmFtZSA9IHRoaXMuYXJncy50bztcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgYXdhaXQgRnVuY3Rpb25zUm91dGVyLmhhbmRsZUNsb3VkRnVuY3Rpb24oe1xuICAgICAgICAgICAgICBwYXJhbXM6IHtcbiAgICAgICAgICAgICAgICBmdW5jdGlvbk5hbWUsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgYm9keTogYXJncyxcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgKS5yZXNwb25zZS5yZXN1bHQ7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzLnJlc29sdmUgPSBSZXNvbHZlRGlyZWN0aXZlVmlzaXRvcjtcblxuICBjbGFzcyBNb2NrRGlyZWN0aXZlVmlzaXRvciBleHRlbmRzIFNjaGVtYURpcmVjdGl2ZVZpc2l0b3Ige1xuICAgIHZpc2l0RmllbGREZWZpbml0aW9uKGZpZWxkKSB7XG4gICAgICBmaWVsZC5yZXNvbHZlID0gKCkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5hcmdzLndpdGg7XG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlcy5tb2NrID0gTW9ja0RpcmVjdGl2ZVZpc2l0b3I7XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXX0=