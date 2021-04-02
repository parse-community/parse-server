"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

var _graphqlRelay = require("graphql-relay");

var _UsersRouter = _interopRequireDefault(require("../../Routers/UsersRouter"));

var objectsMutations = _interopRequireWildcard(require("../helpers/objectsMutations"));

var _defaultGraphQLTypes = require("./defaultGraphQLTypes");

var _usersQueries = require("./usersQueries");

var _mutation = require("../transformers/mutation");

var _node = _interopRequireDefault(require("parse/node"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const usersRouter = new _UsersRouter.default();

const load = parseGraphQLSchema => {
  if (parseGraphQLSchema.isUsersClassDisabled) {
    return;
  }

  const signUpMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'SignUp',
    description: 'The signUp mutation can be used to create and sign up a new user.',
    inputFields: {
      fields: {
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
          fields
        } = args;
        const {
          config,
          auth,
          info
        } = context;
        const parseFields = await (0, _mutation.transformTypes)('create', fields, {
          className: '_User',
          parseGraphQLSchema,
          req: {
            config,
            auth,
            info
          }
        });
        const {
          sessionToken,
          objectId,
          authDataResponse
        } = await objectsMutations.createObject('_User', parseFields, config, auth, info);
        context.info.sessionToken = sessionToken;
        const viewer = await (0, _usersQueries.getUserFromSessionToken)(context, mutationInfo, 'viewer.user.', objectId);
        if (authDataResponse && viewer.user) viewer.user.authDataResponse = authDataResponse;
        return {
          viewer
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(signUpMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(signUpMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('signUp', signUpMutation, true, true);
  const logInWithMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'LogInWith',
    description: 'The logInWith mutation can be used to signup, login user with 3rd party authentication system. This mutation create a user if the authData do not correspond to an existing one.',
    inputFields: {
      authData: {
        descriptions: 'This is the auth data of your custom auth provider',
        type: new _graphql.GraphQLNonNull(_defaultGraphQLTypes.OBJECT)
      },
      fields: {
        descriptions: 'These are the fields of the user to be created/updated and logged in.',
        type: new _graphql.GraphQLInputObjectType({
          name: 'UserLoginWithInput',
          fields: () => {
            const classGraphQLCreateFields = parseGraphQLSchema.parseClassTypes['_User'].classGraphQLCreateType.getFields();
            return Object.keys(classGraphQLCreateFields).reduce((fields, fieldName) => {
              if (fieldName !== 'password' && fieldName !== 'username' && fieldName !== 'authData') {
                fields[fieldName] = classGraphQLCreateFields[fieldName];
              }

              return fields;
            }, {});
          }
        })
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
          fields,
          authData
        } = args;
        const {
          config,
          auth,
          info
        } = context;
        const parseFields = await (0, _mutation.transformTypes)('create', fields, {
          className: '_User',
          parseGraphQLSchema,
          req: {
            config,
            auth,
            info
          }
        });
        const {
          sessionToken,
          objectId,
          authDataResponse
        } = await objectsMutations.createObject('_User', _objectSpread(_objectSpread({}, parseFields), {}, {
          authData
        }), config, auth, info);
        context.info.sessionToken = sessionToken;
        const viewer = await (0, _usersQueries.getUserFromSessionToken)(context, mutationInfo, 'viewer.user.', objectId);
        if (authDataResponse && viewer.user) viewer.user.authDataResponse = authDataResponse;
        return {
          viewer
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(logInWithMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(logInWithMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('logInWith', logInWithMutation, true, true);
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
      },
      authData: {
        description: 'Auth data payload, needed if some required auth adapters are configured.',
        type: _defaultGraphQLTypes.OBJECT
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
          password,
          authData
        } = args;
        const {
          config,
          auth,
          info
        } = context;
        const {
          sessionToken,
          objectId,
          authDataResponse
        } = (await usersRouter.handleLogIn({
          body: {
            username,
            password,
            authData
          },
          query: {},
          config,
          auth,
          info
        })).response;
        context.info.sessionToken = sessionToken;
        const viewer = await (0, _usersQueries.getUserFromSessionToken)(context, mutationInfo, 'viewer.user.', objectId);
        if (authDataResponse && viewer.user) viewer.user.authDataResponse = authDataResponse;
        return {
          viewer
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
      ok: {
        description: "It's always true.",
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
      }
    },
    mutateAndGetPayload: async (_args, context) => {
      try {
        const {
          config,
          auth,
          info
        } = context;
        await usersRouter.handleLogOut({
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
  const confirmResetPasswordMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'ConfirmResetPassword',
    description: 'The confirmResetPassword mutation can be used to reset the password of an existing user.',
    inputFields: {
      username: {
        descriptions: 'Username of the user that have received the reset email',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
      },
      password: {
        descriptions: 'New password of the user',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
      },
      token: {
        descriptions: 'Reset token that was emailed to the user',
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
      username,
      password,
      token
    }, context) => {
      const {
        config
      } = context;

      if (!username) {
        throw new _node.default.Error(_node.default.Error.USERNAME_MISSING, 'you must provide a username');
      }

      if (!password) {
        throw new _node.default.Error(_node.default.Error.PASSWORD_MISSING, 'you must provide a password');
      }

      if (!token) {
        throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'you must provide a token');
      }

      const userController = config.userController;
      await userController.updatePassword(username, token, password);
      return {
        ok: true
      };
    }
  });
  parseGraphQLSchema.addGraphQLType(confirmResetPasswordMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(confirmResetPasswordMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('confirmResetPassword', confirmResetPasswordMutation, true, true);
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
  const challengeMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'Challenge',
    description: 'The challenge mutation can be used to initiate an authentication challenge when an auth adapter need it.',
    inputFields: {
      username: {
        description: 'This is the username used to log in the user.',
        type: _graphql.GraphQLString
      },
      password: {
        description: 'This is the password used to log in the user.',
        type: _graphql.GraphQLString
      },
      authData: {
        description: 'Auth data allow to pre identify the user if the auth adapter need pre identification.',
        type: _defaultGraphQLTypes.OBJECT
      },
      challengeData: {
        description: 'Challenge data payload, could be used to post some data to auth providers if they need data for the response.',
        type: _defaultGraphQLTypes.OBJECT
      }
    },
    outputFields: {
      challengeData: {
        description: 'Challenge response from configured auth adapters.',
        type: _defaultGraphQLTypes.OBJECT
      }
    },
    mutateAndGetPayload: async (input, context) => {
      try {
        const {
          config,
          auth,
          info
        } = context;
        const {
          response
        } = await usersRouter.handleChallenge({
          body: input,
          config,
          auth,
          info
        });
        return response;
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(challengeMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(challengeMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('challenge', challengeMutation, true, true);
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvdXNlcnNNdXRhdGlvbnMuanMiXSwibmFtZXMiOlsidXNlcnNSb3V0ZXIiLCJVc2Vyc1JvdXRlciIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJpc1VzZXJzQ2xhc3NEaXNhYmxlZCIsInNpZ25VcE11dGF0aW9uIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiaW5wdXRGaWVsZHMiLCJmaWVsZHMiLCJkZXNjcmlwdGlvbnMiLCJ0eXBlIiwicGFyc2VDbGFzc1R5cGVzIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSIsIm91dHB1dEZpZWxkcyIsInZpZXdlciIsIkdyYXBoUUxOb25OdWxsIiwidmlld2VyVHlwZSIsIm11dGF0ZUFuZEdldFBheWxvYWQiLCJhcmdzIiwiY29udGV4dCIsIm11dGF0aW9uSW5mbyIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwicGFyc2VGaWVsZHMiLCJjbGFzc05hbWUiLCJyZXEiLCJzZXNzaW9uVG9rZW4iLCJvYmplY3RJZCIsImF1dGhEYXRhUmVzcG9uc2UiLCJvYmplY3RzTXV0YXRpb25zIiwiY3JlYXRlT2JqZWN0IiwidXNlciIsImUiLCJoYW5kbGVFcnJvciIsImFkZEdyYXBoUUxUeXBlIiwiaW5wdXQiLCJvZlR5cGUiLCJhZGRHcmFwaFFMTXV0YXRpb24iLCJsb2dJbldpdGhNdXRhdGlvbiIsImF1dGhEYXRhIiwiT0JKRUNUIiwiR3JhcGhRTElucHV0T2JqZWN0VHlwZSIsImNsYXNzR3JhcGhRTENyZWF0ZUZpZWxkcyIsImdldEZpZWxkcyIsIk9iamVjdCIsImtleXMiLCJyZWR1Y2UiLCJmaWVsZE5hbWUiLCJsb2dJbk11dGF0aW9uIiwidXNlcm5hbWUiLCJHcmFwaFFMU3RyaW5nIiwicGFzc3dvcmQiLCJoYW5kbGVMb2dJbiIsImJvZHkiLCJxdWVyeSIsInJlc3BvbnNlIiwibG9nT3V0TXV0YXRpb24iLCJvayIsIkdyYXBoUUxCb29sZWFuIiwiX2FyZ3MiLCJoYW5kbGVMb2dPdXQiLCJyZXNldFBhc3N3b3JkTXV0YXRpb24iLCJlbWFpbCIsImhhbmRsZVJlc2V0UmVxdWVzdCIsImNvbmZpcm1SZXNldFBhc3N3b3JkTXV0YXRpb24iLCJ0b2tlbiIsIlBhcnNlIiwiRXJyb3IiLCJVU0VSTkFNRV9NSVNTSU5HIiwiUEFTU1dPUkRfTUlTU0lORyIsIk9USEVSX0NBVVNFIiwidXNlckNvbnRyb2xsZXIiLCJ1cGRhdGVQYXNzd29yZCIsInNlbmRWZXJpZmljYXRpb25FbWFpbE11dGF0aW9uIiwiaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0IiwiY2hhbGxlbmdlTXV0YXRpb24iLCJjaGFsbGVuZ2VEYXRhIiwiaGFuZGxlQ2hhbGxlbmdlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7O0FBRUEsTUFBTUEsV0FBVyxHQUFHLElBQUlDLG9CQUFKLEVBQXBCOztBQUVBLE1BQU1DLElBQUksR0FBR0Msa0JBQWtCLElBQUk7QUFDakMsTUFBSUEsa0JBQWtCLENBQUNDLG9CQUF2QixFQUE2QztBQUMzQztBQUNEOztBQUVELFFBQU1DLGNBQWMsR0FBRyxnREFBNkI7QUFDbERDLElBQUFBLElBQUksRUFBRSxRQUQ0QztBQUVsREMsSUFBQUEsV0FBVyxFQUFFLG1FQUZxQztBQUdsREMsSUFBQUEsV0FBVyxFQUFFO0FBQ1hDLE1BQUFBLE1BQU0sRUFBRTtBQUNOQyxRQUFBQSxZQUFZLEVBQUUsbUVBRFI7QUFFTkMsUUFBQUEsSUFBSSxFQUFFUixrQkFBa0IsQ0FBQ1MsZUFBbkIsQ0FBbUMsT0FBbkMsRUFBNENDO0FBRjVDO0FBREcsS0FIcUM7QUFTbERDLElBQUFBLFlBQVksRUFBRTtBQUNaQyxNQUFBQSxNQUFNLEVBQUU7QUFDTlIsUUFBQUEsV0FBVyxFQUFFLDRFQURQO0FBRU5JLFFBQUFBLElBQUksRUFBRSxJQUFJSyx1QkFBSixDQUFtQmIsa0JBQWtCLENBQUNjLFVBQXRDO0FBRkE7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Q0Y7QUE1Q29ELEdBQTdCLENBQTFCO0FBK0NBL0IsRUFBQUEsa0JBQWtCLENBQUNpQyxjQUFuQixDQUFrQ3lDLGlCQUFpQixDQUFDMUQsSUFBbEIsQ0FBdUJrQixLQUF2QixDQUE2QjFCLElBQTdCLENBQWtDMkIsTUFBcEUsRUFBNEUsSUFBNUUsRUFBa0YsSUFBbEY7QUFDQW5DLEVBQUFBLGtCQUFrQixDQUFDaUMsY0FBbkIsQ0FBa0N5QyxpQkFBaUIsQ0FBQ2xFLElBQXBELEVBQTBELElBQTFELEVBQWdFLElBQWhFO0FBQ0FSLEVBQUFBLGtCQUFrQixDQUFDb0Msa0JBQW5CLENBQXNDLFdBQXRDLEVBQW1Ec0MsaUJBQW5ELEVBQXNFLElBQXRFLEVBQTRFLElBQTVFO0FBQ0QsQ0FwYUQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBHcmFwaFFMTm9uTnVsbCwgR3JhcGhRTFN0cmluZywgR3JhcGhRTEJvb2xlYW4sIEdyYXBoUUxJbnB1dE9iamVjdFR5cGUgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQgfSBmcm9tICdncmFwaHFsLXJlbGF5JztcbmltcG9ydCBVc2Vyc1JvdXRlciBmcm9tICcuLi8uLi9Sb3V0ZXJzL1VzZXJzUm91dGVyJztcbmltcG9ydCAqIGFzIG9iamVjdHNNdXRhdGlvbnMgZnJvbSAnLi4vaGVscGVycy9vYmplY3RzTXV0YXRpb25zJztcbmltcG9ydCB7IE9CSkVDVCB9IGZyb20gJy4vZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgeyBnZXRVc2VyRnJvbVNlc3Npb25Ub2tlbiB9IGZyb20gJy4vdXNlcnNRdWVyaWVzJztcbmltcG9ydCB7IHRyYW5zZm9ybVR5cGVzIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL211dGF0aW9uJztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcblxuY29uc3QgdXNlcnNSb3V0ZXIgPSBuZXcgVXNlcnNSb3V0ZXIoKTtcblxuY29uc3QgbG9hZCA9IHBhcnNlR3JhcGhRTFNjaGVtYSA9PiB7XG4gIGlmIChwYXJzZUdyYXBoUUxTY2hlbWEuaXNVc2Vyc0NsYXNzRGlzYWJsZWQpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBzaWduVXBNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdTaWduVXAnLFxuICAgIGRlc2NyaXB0aW9uOiAnVGhlIHNpZ25VcCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBjcmVhdGUgYW5kIHNpZ24gdXAgYSBuZXcgdXNlci4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOiAnVGhlc2UgYXJlIHRoZSBmaWVsZHMgb2YgdGhlIG5ldyB1c2VyIHRvIGJlIGNyZWF0ZWQgYW5kIHNpZ25lZCB1cC4nLFxuICAgICAgICB0eXBlOiBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzWydfVXNlciddLmNsYXNzR3JhcGhRTENyZWF0ZVR5cGUsXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICB2aWV3ZXI6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBuZXcgdXNlciB0aGF0IHdhcyBjcmVhdGVkLCBzaWduZWQgdXAgYW5kIHJldHVybmVkIGFzIGEgdmlld2VyLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChwYXJzZUdyYXBoUUxTY2hlbWEudmlld2VyVHlwZSksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQsIG11dGF0aW9uSW5mbykgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyBmaWVsZHMgfSA9IGFyZ3M7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ2NyZWF0ZScsIGZpZWxkcywge1xuICAgICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gICAgICAgICAgcmVxOiB7IGNvbmZpZywgYXV0aCwgaW5mbyB9LFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCB7IHNlc3Npb25Ub2tlbiwgb2JqZWN0SWQsIGF1dGhEYXRhUmVzcG9uc2UgfSA9IGF3YWl0IG9iamVjdHNNdXRhdGlvbnMuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgcGFyc2VGaWVsZHMsXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgaW5mb1xuICAgICAgICApO1xuXG4gICAgICAgIGNvbnRleHQuaW5mby5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uVG9rZW47XG4gICAgICAgIGNvbnN0IHZpZXdlciA9IGF3YWl0IGdldFVzZXJGcm9tU2Vzc2lvblRva2VuKFxuICAgICAgICAgIGNvbnRleHQsXG4gICAgICAgICAgbXV0YXRpb25JbmZvLFxuICAgICAgICAgICd2aWV3ZXIudXNlci4nLFxuICAgICAgICAgIG9iamVjdElkXG4gICAgICAgICk7XG4gICAgICAgIGlmIChhdXRoRGF0YVJlc3BvbnNlICYmIHZpZXdlci51c2VyKSB2aWV3ZXIudXNlci5hdXRoRGF0YVJlc3BvbnNlID0gYXV0aERhdGFSZXNwb25zZTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICB2aWV3ZXIsXG4gICAgICAgIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoc2lnblVwTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShzaWduVXBNdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbignc2lnblVwJywgc2lnblVwTXV0YXRpb24sIHRydWUsIHRydWUpO1xuICBjb25zdCBsb2dJbldpdGhNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdMb2dJbldpdGgnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSBsb2dJbldpdGggbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gc2lnbnVwLCBsb2dpbiB1c2VyIHdpdGggM3JkIHBhcnR5IGF1dGhlbnRpY2F0aW9uIHN5c3RlbS4gVGhpcyBtdXRhdGlvbiBjcmVhdGUgYSB1c2VyIGlmIHRoZSBhdXRoRGF0YSBkbyBub3QgY29ycmVzcG9uZCB0byBhbiBleGlzdGluZyBvbmUuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgYXV0aERhdGE6IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOiAnVGhpcyBpcyB0aGUgYXV0aCBkYXRhIG9mIHlvdXIgY3VzdG9tIGF1dGggcHJvdmlkZXInLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoT0JKRUNUKSxcbiAgICAgIH0sXG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOiAnVGhlc2UgYXJlIHRoZSBmaWVsZHMgb2YgdGhlIHVzZXIgdG8gYmUgY3JlYXRlZC91cGRhdGVkIGFuZCBsb2dnZWQgaW4uJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgICAgICAgIG5hbWU6ICdVc2VyTG9naW5XaXRoSW5wdXQnLFxuICAgICAgICAgIGZpZWxkczogKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgY2xhc3NHcmFwaFFMQ3JlYXRlRmllbGRzID0gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tcbiAgICAgICAgICAgICAgJ19Vc2VyJ1xuICAgICAgICAgICAgXS5jbGFzc0dyYXBoUUxDcmVhdGVUeXBlLmdldEZpZWxkcygpO1xuICAgICAgICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKGNsYXNzR3JhcGhRTENyZWF0ZUZpZWxkcykucmVkdWNlKChmaWVsZHMsIGZpZWxkTmFtZSkgPT4ge1xuICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgZmllbGROYW1lICE9PSAncGFzc3dvcmQnICYmXG4gICAgICAgICAgICAgICAgZmllbGROYW1lICE9PSAndXNlcm5hbWUnICYmXG4gICAgICAgICAgICAgICAgZmllbGROYW1lICE9PSAnYXV0aERhdGEnXG4gICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIGZpZWxkc1tmaWVsZE5hbWVdID0gY2xhc3NHcmFwaFFMQ3JlYXRlRmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgICAgICAgIH0sIHt9KTtcbiAgICAgICAgICB9LFxuICAgICAgICB9KSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIHZpZXdlcjoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIG5ldyB1c2VyIHRoYXQgd2FzIGNyZWF0ZWQsIHNpZ25lZCB1cCBhbmQgcmV0dXJuZWQgYXMgYSB2aWV3ZXIuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKHBhcnNlR3JhcGhRTFNjaGVtYS52aWV3ZXJUeXBlKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IGZpZWxkcywgYXV0aERhdGEgfSA9IGFyZ3M7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ2NyZWF0ZScsIGZpZWxkcywge1xuICAgICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gICAgICAgICAgcmVxOiB7IGNvbmZpZywgYXV0aCwgaW5mbyB9LFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCB7IHNlc3Npb25Ub2tlbiwgb2JqZWN0SWQsIGF1dGhEYXRhUmVzcG9uc2UgfSA9IGF3YWl0IG9iamVjdHNNdXRhdGlvbnMuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgeyAuLi5wYXJzZUZpZWxkcywgYXV0aERhdGEgfSxcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBpbmZvXG4gICAgICAgICk7XG5cbiAgICAgICAgY29udGV4dC5pbmZvLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25Ub2tlbjtcbiAgICAgICAgY29uc3Qgdmlld2VyID0gYXdhaXQgZ2V0VXNlckZyb21TZXNzaW9uVG9rZW4oXG4gICAgICAgICAgY29udGV4dCxcbiAgICAgICAgICBtdXRhdGlvbkluZm8sXG4gICAgICAgICAgJ3ZpZXdlci51c2VyLicsXG4gICAgICAgICAgb2JqZWN0SWRcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGF1dGhEYXRhUmVzcG9uc2UgJiYgdmlld2VyLnVzZXIpIHZpZXdlci51c2VyLmF1dGhEYXRhUmVzcG9uc2UgPSBhdXRoRGF0YVJlc3BvbnNlO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHZpZXdlcixcbiAgICAgICAgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShsb2dJbldpdGhNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGxvZ0luV2l0aE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdsb2dJbldpdGgnLCBsb2dJbldpdGhNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgY29uc3QgbG9nSW5NdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdMb2dJbicsXG4gICAgZGVzY3JpcHRpb246ICdUaGUgbG9nSW4gbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gbG9nIGluIGFuIGV4aXN0aW5nIHVzZXIuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgdXNlcm5hbWU6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB1c2VybmFtZSB1c2VkIHRvIGxvZyBpbiB0aGUgdXNlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgICAgcGFzc3dvcmQ6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBwYXNzd29yZCB1c2VkIHRvIGxvZyBpbiB0aGUgdXNlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgICAgYXV0aERhdGE6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdBdXRoIGRhdGEgcGF5bG9hZCwgbmVlZGVkIGlmIHNvbWUgcmVxdWlyZWQgYXV0aCBhZGFwdGVycyBhcmUgY29uZmlndXJlZC4nLFxuICAgICAgICB0eXBlOiBPQkpFQ1QsXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICB2aWV3ZXI6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBleGlzdGluZyB1c2VyIHRoYXQgd2FzIGxvZ2dlZCBpbiBhbmQgcmV0dXJuZWQgYXMgYSB2aWV3ZXIuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKHBhcnNlR3JhcGhRTFNjaGVtYS52aWV3ZXJUeXBlKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IHVzZXJuYW1lLCBwYXNzd29yZCwgYXV0aERhdGEgfSA9IGFyZ3M7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgIGNvbnN0IHsgc2Vzc2lvblRva2VuLCBvYmplY3RJZCwgYXV0aERhdGFSZXNwb25zZSB9ID0gKFxuICAgICAgICAgIGF3YWl0IHVzZXJzUm91dGVyLmhhbmRsZUxvZ0luKHtcbiAgICAgICAgICAgIGJvZHk6IHtcbiAgICAgICAgICAgICAgdXNlcm5hbWUsXG4gICAgICAgICAgICAgIHBhc3N3b3JkLFxuICAgICAgICAgICAgICBhdXRoRGF0YSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBxdWVyeToge30sXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICB9KVxuICAgICAgICApLnJlc3BvbnNlO1xuXG4gICAgICAgIGNvbnRleHQuaW5mby5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uVG9rZW47XG5cbiAgICAgICAgY29uc3Qgdmlld2VyID0gYXdhaXQgZ2V0VXNlckZyb21TZXNzaW9uVG9rZW4oXG4gICAgICAgICAgY29udGV4dCxcbiAgICAgICAgICBtdXRhdGlvbkluZm8sXG4gICAgICAgICAgJ3ZpZXdlci51c2VyLicsXG4gICAgICAgICAgb2JqZWN0SWRcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGF1dGhEYXRhUmVzcG9uc2UgJiYgdmlld2VyLnVzZXIpIHZpZXdlci51c2VyLmF1dGhEYXRhUmVzcG9uc2UgPSBhdXRoRGF0YVJlc3BvbnNlO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHZpZXdlcixcbiAgICAgICAgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShsb2dJbk11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUobG9nSW5NdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbignbG9nSW4nLCBsb2dJbk11dGF0aW9uLCB0cnVlLCB0cnVlKTtcblxuICBjb25zdCBsb2dPdXRNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdMb2dPdXQnLFxuICAgIGRlc2NyaXB0aW9uOiAnVGhlIGxvZ091dCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBsb2cgb3V0IGFuIGV4aXN0aW5nIHVzZXIuJyxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIG9rOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIkl0J3MgYWx3YXlzIHRydWUuXCIsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKF9hcmdzLCBjb250ZXh0KSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICBhd2FpdCB1c2Vyc1JvdXRlci5oYW5kbGVMb2dPdXQoe1xuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGluZm8sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUobG9nT3V0TXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShsb2dPdXRNdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbignbG9nT3V0JywgbG9nT3V0TXV0YXRpb24sIHRydWUsIHRydWUpO1xuXG4gIGNvbnN0IHJlc2V0UGFzc3dvcmRNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdSZXNldFBhc3N3b3JkJyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdUaGUgcmVzZXRQYXNzd29yZCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byByZXNldCB0aGUgcGFzc3dvcmQgb2YgYW4gZXhpc3RpbmcgdXNlci4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICBlbWFpbDoge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdFbWFpbCBvZiB0aGUgdXNlciB0aGF0IHNob3VsZCByZWNlaXZlIHRoZSByZXNldCBlbWFpbCcsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIG9rOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIkl0J3MgYWx3YXlzIHRydWUuXCIsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKHsgZW1haWwgfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgIGF3YWl0IHVzZXJzUm91dGVyLmhhbmRsZVJlc2V0UmVxdWVzdCh7XG4gICAgICAgIGJvZHk6IHtcbiAgICAgICAgICBlbWFpbCxcbiAgICAgICAgfSxcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBhdXRoLFxuICAgICAgICBpbmZvLFxuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHJlc2V0UGFzc3dvcmRNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHJlc2V0UGFzc3dvcmRNdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbigncmVzZXRQYXNzd29yZCcsIHJlc2V0UGFzc3dvcmRNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgY29uc3QgY29uZmlybVJlc2V0UGFzc3dvcmRNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdDb25maXJtUmVzZXRQYXNzd29yZCcsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIGNvbmZpcm1SZXNldFBhc3N3b3JkIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIHJlc2V0IHRoZSBwYXNzd29yZCBvZiBhbiBleGlzdGluZyB1c2VyLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIHVzZXJuYW1lOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczogJ1VzZXJuYW1lIG9mIHRoZSB1c2VyIHRoYXQgaGF2ZSByZWNlaXZlZCB0aGUgcmVzZXQgZW1haWwnLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgICAgcGFzc3dvcmQ6IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOiAnTmV3IHBhc3N3b3JkIG9mIHRoZSB1c2VyJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICAgIHRva2VuOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczogJ1Jlc2V0IHRva2VuIHRoYXQgd2FzIGVtYWlsZWQgdG8gdGhlIHVzZXInLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICBvazoge1xuICAgICAgICBkZXNjcmlwdGlvbjogXCJJdCdzIGFsd2F5cyB0cnVlLlwiLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jICh7IHVzZXJuYW1lLCBwYXNzd29yZCwgdG9rZW4gfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgeyBjb25maWcgfSA9IGNvbnRleHQ7XG4gICAgICBpZiAoIXVzZXJuYW1lKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5VU0VSTkFNRV9NSVNTSU5HLCAneW91IG11c3QgcHJvdmlkZSBhIHVzZXJuYW1lJyk7XG4gICAgICB9XG4gICAgICBpZiAoIXBhc3N3b3JkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5QQVNTV09SRF9NSVNTSU5HLCAneW91IG11c3QgcHJvdmlkZSBhIHBhc3N3b3JkJyk7XG4gICAgICB9XG4gICAgICBpZiAoIXRva2VuKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ3lvdSBtdXN0IHByb3ZpZGUgYSB0b2tlbicpO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB1c2VyQ29udHJvbGxlciA9IGNvbmZpZy51c2VyQ29udHJvbGxlcjtcbiAgICAgIGF3YWl0IHVzZXJDb250cm9sbGVyLnVwZGF0ZVBhc3N3b3JkKHVzZXJuYW1lLCB0b2tlbiwgcGFzc3dvcmQpO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgY29uZmlybVJlc2V0UGFzc3dvcmRNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY29uZmlybVJlc2V0UGFzc3dvcmRNdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbihcbiAgICAnY29uZmlybVJlc2V0UGFzc3dvcmQnLFxuICAgIGNvbmZpcm1SZXNldFBhc3N3b3JkTXV0YXRpb24sXG4gICAgdHJ1ZSxcbiAgICB0cnVlXG4gICk7XG5cbiAgY29uc3Qgc2VuZFZlcmlmaWNhdGlvbkVtYWlsTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnU2VuZFZlcmlmaWNhdGlvbkVtYWlsJyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdUaGUgc2VuZFZlcmlmaWNhdGlvbkVtYWlsIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIHNlbmQgdGhlIHZlcmlmaWNhdGlvbiBlbWFpbCBhZ2Fpbi4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICBlbWFpbDoge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdFbWFpbCBvZiB0aGUgdXNlciB0aGF0IHNob3VsZCByZWNlaXZlIHRoZSB2ZXJpZmljYXRpb24gZW1haWwnLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICBvazoge1xuICAgICAgICBkZXNjcmlwdGlvbjogXCJJdCdzIGFsd2F5cyB0cnVlLlwiLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jICh7IGVtYWlsIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgIGF3YWl0IHVzZXJzUm91dGVyLmhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdCh7XG4gICAgICAgICAgYm9keToge1xuICAgICAgICAgICAgZW1haWwsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBpbmZvLFxuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgIHNlbmRWZXJpZmljYXRpb25FbWFpbE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsXG4gICAgdHJ1ZSxcbiAgICB0cnVlXG4gICk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShzZW5kVmVyaWZpY2F0aW9uRW1haWxNdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbihcbiAgICAnc2VuZFZlcmlmaWNhdGlvbkVtYWlsJyxcbiAgICBzZW5kVmVyaWZpY2F0aW9uRW1haWxNdXRhdGlvbixcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcblxuICBjb25zdCBjaGFsbGVuZ2VNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdDaGFsbGVuZ2UnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSBjaGFsbGVuZ2UgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gaW5pdGlhdGUgYW4gYXV0aGVudGljYXRpb24gY2hhbGxlbmdlIHdoZW4gYW4gYXV0aCBhZGFwdGVyIG5lZWQgaXQuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgdXNlcm5hbWU6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB1c2VybmFtZSB1c2VkIHRvIGxvZyBpbiB0aGUgdXNlci4nLFxuICAgICAgICB0eXBlOiBHcmFwaFFMU3RyaW5nLFxuICAgICAgfSxcbiAgICAgIHBhc3N3b3JkOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgcGFzc3dvcmQgdXNlZCB0byBsb2cgaW4gdGhlIHVzZXIuJyxcbiAgICAgICAgdHlwZTogR3JhcGhRTFN0cmluZyxcbiAgICAgIH0sXG4gICAgICBhdXRoRGF0YToge1xuICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAnQXV0aCBkYXRhIGFsbG93IHRvIHByZSBpZGVudGlmeSB0aGUgdXNlciBpZiB0aGUgYXV0aCBhZGFwdGVyIG5lZWQgcHJlIGlkZW50aWZpY2F0aW9uLicsXG4gICAgICAgIHR5cGU6IE9CSkVDVCxcbiAgICAgIH0sXG4gICAgICBjaGFsbGVuZ2VEYXRhOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgICdDaGFsbGVuZ2UgZGF0YSBwYXlsb2FkLCBjb3VsZCBiZSB1c2VkIHRvIHBvc3Qgc29tZSBkYXRhIHRvIGF1dGggcHJvdmlkZXJzIGlmIHRoZXkgbmVlZCBkYXRhIGZvciB0aGUgcmVzcG9uc2UuJyxcbiAgICAgICAgdHlwZTogT0JKRUNULFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgY2hhbGxlbmdlRGF0YToge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ0NoYWxsZW5nZSByZXNwb25zZSBmcm9tIGNvbmZpZ3VyZWQgYXV0aCBhZGFwdGVycy4nLFxuICAgICAgICB0eXBlOiBPQkpFQ1QsXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGlucHV0LCBjb250ZXh0KSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICBjb25zdCB7IHJlc3BvbnNlIH0gPSBhd2FpdCB1c2Vyc1JvdXRlci5oYW5kbGVDaGFsbGVuZ2Uoe1xuICAgICAgICAgIGJvZHk6IGlucHV0LFxuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGluZm8sXG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2hhbGxlbmdlTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjaGFsbGVuZ2VNdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbignY2hhbGxlbmdlJywgY2hhbGxlbmdlTXV0YXRpb24sIHRydWUsIHRydWUpO1xufTtcblxuZXhwb3J0IHsgbG9hZCB9O1xuIl19