"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

var _graphqlRelay = require("graphql-relay");

var _UsersRouter = _interopRequireDefault(require("../../Routers/UsersRouter"));

var objectsMutations = _interopRequireWildcard(require("../helpers/objectsMutations"));

var _usersQueries = require("./usersQueries");

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const usersRouter = new _UsersRouter.default();

const load = parseGraphQLSchema => {
  if (parseGraphQLSchema.isUsersClassDisabled) {
    return;
  }

  const signUpMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'SignUp',
    description: 'The signUp mutation can be used to create and sign up a new user.',
    inputFields: {
      userFields: {
        descriptions: 'These are the fields of the new user to be created and signed up.',
        type: parseGraphQLSchema.parseClassTypes['_User'].classGraphQLCreateType
      }
    },
    outputFields: {
      viewer: {
        description: 'This is the new user that was created, signed up and returned as a viewer.',
        type: new _graphql.GraphQLNonNull(parseGraphQLSchema.viewerType)
      }
    },
    mutateAndGetPayload: async (args, context, mutationInfo) => {
      try {
        const {
          userFields
        } = args;
        const {
          config,
          auth,
          info
        } = context;
        const {
          sessionToken
        } = await objectsMutations.createObject('_User', userFields, config, auth, info);
        info.sessionToken = sessionToken;
        return {
          viewer: await (0, _usersQueries.getUserFromSessionToken)(config, info, mutationInfo, 'viewer.user.', true)
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(signUpMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(signUpMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('signUp', signUpMutation, true, true);
  const logInMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'LogIn',
    description: 'The logIn mutation can be used to log in an existing user.',
    inputFields: {
      username: {
        description: 'This is the username used to log in the user.',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
      },
      password: {
        description: 'This is the password used to log in the user.',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
      }
    },
    outputFields: {
      viewer: {
        description: 'This is the existing user that was logged in and returned as a viewer.',
        type: new _graphql.GraphQLNonNull(parseGraphQLSchema.viewerType)
      }
    },
    mutateAndGetPayload: async (args, context, mutationInfo) => {
      try {
        const {
          username,
          password
        } = args;
        const {
          config,
          auth,
          info
        } = context;
        const {
          sessionToken
        } = (await usersRouter.handleLogIn({
          body: {
            username,
            password
          },
          query: {},
          config,
          auth,
          info
        })).response;
        info.sessionToken = sessionToken;
        return {
          viewer: await (0, _usersQueries.getUserFromSessionToken)(config, info, mutationInfo, 'viewer.user.', true)
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(logInMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(logInMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('logIn', logInMutation, true, true);
  const logOutMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'LogOut',
    description: 'The logOut mutation can be used to log out an existing user.',
    outputFields: {
      viewer: {
        description: 'This is the existing user that was logged out and returned as a viewer.',
        type: new _graphql.GraphQLNonNull(parseGraphQLSchema.viewerType)
      }
    },
    mutateAndGetPayload: async (_args, context, mutationInfo) => {
      try {
        const {
          config,
          auth,
          info
        } = context;
        const viewer = await (0, _usersQueries.getUserFromSessionToken)(config, info, mutationInfo, 'viewer.user.', true);
        await usersRouter.handleLogOut({
          config,
          auth,
          info
        });
        return {
          viewer
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(logOutMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(logOutMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('logOut', logOutMutation, true, true);
  const resetPasswordMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'ResetPassword',
    description: 'The resetPassword mutation can be used to reset the password of an existing user.',
    inputFields: {
      email: {
        descriptions: 'Email of the user that should receive the reset email',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
      }
    },
    outputFields: {
      ok: {
        description: "It's always true.",
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
      }
    },
    mutateAndGetPayload: async ({
      email
    }, context) => {
      const {
        config,
        auth,
        info
      } = context;
      await usersRouter.handleResetRequest({
        body: {
          email
        },
        config,
        auth,
        info
      });
      return {
        ok: true
      };
    }
  });
  parseGraphQLSchema.addGraphQLType(resetPasswordMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(resetPasswordMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('resetPassword', resetPasswordMutation, true, true);
  const sendVerificationEmailMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'SendVerificationEmail',
    description: 'The sendVerificationEmail mutation can be used to send the verification email again.',
    inputFields: {
      email: {
        descriptions: 'Email of the user that should receive the verification email',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
      }
    },
    outputFields: {
      ok: {
        description: "It's always true.",
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
      }
    },
    mutateAndGetPayload: async ({
      email
    }, context) => {
      try {
        const {
          config,
          auth,
          info
        } = context;
        await usersRouter.handleVerificationEmailRequest({
          body: {
            email
          },
          config,
          auth,
          info
        });
        return {
          ok: true
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(sendVerificationEmailMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(sendVerificationEmailMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('sendVerificationEmail', sendVerificationEmailMutation, true, true);
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvdXNlcnNNdXRhdGlvbnMuanMiXSwibmFtZXMiOlsidXNlcnNSb3V0ZXIiLCJVc2Vyc1JvdXRlciIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJpc1VzZXJzQ2xhc3NEaXNhYmxlZCIsInNpZ25VcE11dGF0aW9uIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiaW5wdXRGaWVsZHMiLCJ1c2VyRmllbGRzIiwiZGVzY3JpcHRpb25zIiwidHlwZSIsInBhcnNlQ2xhc3NUeXBlcyIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGUiLCJvdXRwdXRGaWVsZHMiLCJ2aWV3ZXIiLCJHcmFwaFFMTm9uTnVsbCIsInZpZXdlclR5cGUiLCJtdXRhdGVBbmRHZXRQYXlsb2FkIiwiYXJncyIsImNvbnRleHQiLCJtdXRhdGlvbkluZm8iLCJjb25maWciLCJhdXRoIiwiaW5mbyIsInNlc3Npb25Ub2tlbiIsIm9iamVjdHNNdXRhdGlvbnMiLCJjcmVhdGVPYmplY3QiLCJlIiwiaGFuZGxlRXJyb3IiLCJhZGRHcmFwaFFMVHlwZSIsImlucHV0Iiwib2ZUeXBlIiwiYWRkR3JhcGhRTE11dGF0aW9uIiwibG9nSW5NdXRhdGlvbiIsInVzZXJuYW1lIiwiR3JhcGhRTFN0cmluZyIsInBhc3N3b3JkIiwiaGFuZGxlTG9nSW4iLCJib2R5IiwicXVlcnkiLCJyZXNwb25zZSIsImxvZ091dE11dGF0aW9uIiwiX2FyZ3MiLCJoYW5kbGVMb2dPdXQiLCJyZXNldFBhc3N3b3JkTXV0YXRpb24iLCJlbWFpbCIsIm9rIiwiR3JhcGhRTEJvb2xlYW4iLCJoYW5kbGVSZXNldFJlcXVlc3QiLCJzZW5kVmVyaWZpY2F0aW9uRW1haWxNdXRhdGlvbiIsImhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdCJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQUVBLE1BQU1BLFdBQVcsR0FBRyxJQUFJ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V0FBVyxDQUFDbUQsOEJBQVosQ0FBMkM7QUFDL0NaLFVBQUFBLElBQUksRUFBRTtBQUNKTyxZQUFBQTtBQURJLFdBRHlDO0FBSS9DeEIsVUFBQUEsTUFKK0M7QUFLL0NDLFVBQUFBLElBTCtDO0FBTS9DQyxVQUFBQTtBQU4rQyxTQUEzQyxDQUFOO0FBU0EsZUFBTztBQUFFdUIsVUFBQUEsRUFBRSxFQUFFO0FBQU4sU0FBUDtBQUNELE9BYkQsQ0FhRSxPQUFPbkIsQ0FBUCxFQUFVO0FBQ1Z6QixRQUFBQSxrQkFBa0IsQ0FBQzBCLFdBQW5CLENBQStCRCxDQUEvQjtBQUNEO0FBQ0Y7QUFsQ2dFLEdBQTdCLENBQXRDO0FBcUNBekIsRUFBQUEsa0JBQWtCLENBQUMyQixjQUFuQixDQUNFb0IsNkJBQTZCLENBQUMvQixJQUE5QixDQUFtQ1ksS0FBbkMsQ0FBeUNwQixJQUF6QyxDQUE4Q3FCLE1BRGhELEVBRUUsSUFGRixFQUdFLElBSEY7QUFLQTdCLEVBQUFBLGtCQUFrQixDQUFDMkIsY0FBbkIsQ0FDRW9CLDZCQUE2QixDQUFDdkMsSUFEaEMsRUFFRSxJQUZGLEVBR0UsSUFIRjtBQUtBUixFQUFBQSxrQkFBa0IsQ0FBQzhCLGtCQUFuQixDQUNFLHVCQURGLEVBRUVpQiw2QkFGRixFQUdFLElBSEYsRUFJRSxJQUpGO0FBTUQsQ0ExUUQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBHcmFwaFFMTm9uTnVsbCwgR3JhcGhRTFN0cmluZywgR3JhcGhRTEJvb2xlYW4gfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQgfSBmcm9tICdncmFwaHFsLXJlbGF5JztcbmltcG9ydCBVc2Vyc1JvdXRlciBmcm9tICcuLi8uLi9Sb3V0ZXJzL1VzZXJzUm91dGVyJztcbmltcG9ydCAqIGFzIG9iamVjdHNNdXRhdGlvbnMgZnJvbSAnLi4vaGVscGVycy9vYmplY3RzTXV0YXRpb25zJztcbmltcG9ydCB7IGdldFVzZXJGcm9tU2Vzc2lvblRva2VuIH0gZnJvbSAnLi91c2Vyc1F1ZXJpZXMnO1xuXG5jb25zdCB1c2Vyc1JvdXRlciA9IG5ldyBVc2Vyc1JvdXRlcigpO1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgaWYgKHBhcnNlR3JhcGhRTFNjaGVtYS5pc1VzZXJzQ2xhc3NEaXNhYmxlZCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IHNpZ25VcE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ1NpZ25VcCcsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIHNpZ25VcCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBjcmVhdGUgYW5kIHNpZ24gdXAgYSBuZXcgdXNlci4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICB1c2VyRmllbGRzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczpcbiAgICAgICAgICAnVGhlc2UgYXJlIHRoZSBmaWVsZHMgb2YgdGhlIG5ldyB1c2VyIHRvIGJlIGNyZWF0ZWQgYW5kIHNpZ25lZCB1cC4nLFxuICAgICAgICB0eXBlOlxuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbJ19Vc2VyJ10uY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIHZpZXdlcjoge1xuICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAnVGhpcyBpcyB0aGUgbmV3IHVzZXIgdGhhdCB3YXMgY3JlYXRlZCwgc2lnbmVkIHVwIGFuZCByZXR1cm5lZCBhcyBhIHZpZXdlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwocGFyc2VHcmFwaFFMU2NoZW1hLnZpZXdlclR5cGUpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgdXNlckZpZWxkcyB9ID0gYXJncztcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgY29uc3QgeyBzZXNzaW9uVG9rZW4gfSA9IGF3YWl0IG9iamVjdHNNdXRhdGlvbnMuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgdXNlckZpZWxkcyxcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBpbmZvXG4gICAgICAgICk7XG5cbiAgICAgICAgaW5mby5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uVG9rZW47XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICB2aWV3ZXI6IGF3YWl0IGdldFVzZXJGcm9tU2Vzc2lvblRva2VuKFxuICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgIG11dGF0aW9uSW5mbyxcbiAgICAgICAgICAgICd2aWV3ZXIudXNlci4nLFxuICAgICAgICAgICAgdHJ1ZVxuICAgICAgICAgICksXG4gICAgICAgIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgc2lnblVwTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHNpZ25VcE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdzaWduVXAnLCBzaWduVXBNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgY29uc3QgbG9nSW5NdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdMb2dJbicsXG4gICAgZGVzY3JpcHRpb246ICdUaGUgbG9nSW4gbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gbG9nIGluIGFuIGV4aXN0aW5nIHVzZXIuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgdXNlcm5hbWU6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB1c2VybmFtZSB1c2VkIHRvIGxvZyBpbiB0aGUgdXNlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgICAgcGFzc3dvcmQ6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBwYXNzd29yZCB1c2VkIHRvIGxvZyBpbiB0aGUgdXNlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICB2aWV3ZXI6IHtcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgJ1RoaXMgaXMgdGhlIGV4aXN0aW5nIHVzZXIgdGhhdCB3YXMgbG9nZ2VkIGluIGFuZCByZXR1cm5lZCBhcyBhIHZpZXdlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwocGFyc2VHcmFwaFFMU2NoZW1hLnZpZXdlclR5cGUpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgdXNlcm5hbWUsIHBhc3N3b3JkIH0gPSBhcmdzO1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICBjb25zdCB7IHNlc3Npb25Ub2tlbiB9ID0gKFxuICAgICAgICAgIGF3YWl0IHVzZXJzUm91dGVyLmhhbmRsZUxvZ0luKHtcbiAgICAgICAgICAgIGJvZHk6IHtcbiAgICAgICAgICAgICAgdXNlcm5hbWUsXG4gICAgICAgICAgICAgIHBhc3N3b3JkLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHF1ZXJ5OiB7fSxcbiAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBpbmZvLFxuICAgICAgICAgIH0pXG4gICAgICAgICkucmVzcG9uc2U7XG5cbiAgICAgICAgaW5mby5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uVG9rZW47XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICB2aWV3ZXI6IGF3YWl0IGdldFVzZXJGcm9tU2Vzc2lvblRva2VuKFxuICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgIG11dGF0aW9uSW5mbyxcbiAgICAgICAgICAgICd2aWV3ZXIudXNlci4nLFxuICAgICAgICAgICAgdHJ1ZVxuICAgICAgICAgICksXG4gICAgICAgIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgbG9nSW5NdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUobG9nSW5NdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbignbG9nSW4nLCBsb2dJbk11dGF0aW9uLCB0cnVlLCB0cnVlKTtcblxuICBjb25zdCBsb2dPdXRNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdMb2dPdXQnLFxuICAgIGRlc2NyaXB0aW9uOiAnVGhlIGxvZ091dCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBsb2cgb3V0IGFuIGV4aXN0aW5nIHVzZXIuJyxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIHZpZXdlcjoge1xuICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAnVGhpcyBpcyB0aGUgZXhpc3RpbmcgdXNlciB0aGF0IHdhcyBsb2dnZWQgb3V0IGFuZCByZXR1cm5lZCBhcyBhIHZpZXdlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwocGFyc2VHcmFwaFFMU2NoZW1hLnZpZXdlclR5cGUpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChfYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICBjb25zdCB2aWV3ZXIgPSBhd2FpdCBnZXRVc2VyRnJvbVNlc3Npb25Ub2tlbihcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgaW5mbyxcbiAgICAgICAgICBtdXRhdGlvbkluZm8sXG4gICAgICAgICAgJ3ZpZXdlci51c2VyLicsXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuXG4gICAgICAgIGF3YWl0IHVzZXJzUm91dGVyLmhhbmRsZUxvZ091dCh7XG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgaW5mbyxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHsgdmlld2VyIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgbG9nT3V0TXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGxvZ091dE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdsb2dPdXQnLCBsb2dPdXRNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgY29uc3QgcmVzZXRQYXNzd29yZE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ1Jlc2V0UGFzc3dvcmQnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSByZXNldFBhc3N3b3JkIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIHJlc2V0IHRoZSBwYXNzd29yZCBvZiBhbiBleGlzdGluZyB1c2VyLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIGVtYWlsOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczogJ0VtYWlsIG9mIHRoZSB1c2VyIHRoYXQgc2hvdWxkIHJlY2VpdmUgdGhlIHJlc2V0IGVtYWlsJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgb2s6IHtcbiAgICAgICAgZGVzY3JpcHRpb246IFwiSXQncyBhbHdheXMgdHJ1ZS5cIixcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoeyBlbWFpbCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgYXdhaXQgdXNlcnNSb3V0ZXIuaGFuZGxlUmVzZXRSZXF1ZXN0KHtcbiAgICAgICAgYm9keToge1xuICAgICAgICAgIGVtYWlsLFxuICAgICAgICB9LFxuICAgICAgICBjb25maWcsXG4gICAgICAgIGF1dGgsXG4gICAgICAgIGluZm8sXG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgcmVzZXRQYXNzd29yZE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsXG4gICAgdHJ1ZSxcbiAgICB0cnVlXG4gICk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShyZXNldFBhc3N3b3JkTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oXG4gICAgJ3Jlc2V0UGFzc3dvcmQnLFxuICAgIHJlc2V0UGFzc3dvcmRNdXRhdGlvbixcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcblxuICBjb25zdCBzZW5kVmVyaWZpY2F0aW9uRW1haWxNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdTZW5kVmVyaWZpY2F0aW9uRW1haWwnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSBzZW5kVmVyaWZpY2F0aW9uRW1haWwgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gc2VuZCB0aGUgdmVyaWZpY2F0aW9uIGVtYWlsIGFnYWluLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIGVtYWlsOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczpcbiAgICAgICAgICAnRW1haWwgb2YgdGhlIHVzZXIgdGhhdCBzaG91bGQgcmVjZWl2ZSB0aGUgdmVyaWZpY2F0aW9uIGVtYWlsJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgb2s6IHtcbiAgICAgICAgZGVzY3JpcHRpb246IFwiSXQncyBhbHdheXMgdHJ1ZS5cIixcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoeyBlbWFpbCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICBhd2FpdCB1c2Vyc1JvdXRlci5oYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3Qoe1xuICAgICAgICAgIGJvZHk6IHtcbiAgICAgICAgICAgIGVtYWlsLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgaW5mbyxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICBzZW5kVmVyaWZpY2F0aW9uRW1haWxNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgc2VuZFZlcmlmaWNhdGlvbkVtYWlsTXV0YXRpb24udHlwZSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbihcbiAgICAnc2VuZFZlcmlmaWNhdGlvbkVtYWlsJyxcbiAgICBzZW5kVmVyaWZpY2F0aW9uRW1haWxNdXRhdGlvbixcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbn07XG5cbmV4cG9ydCB7IGxvYWQgfTtcbiJdfQ==