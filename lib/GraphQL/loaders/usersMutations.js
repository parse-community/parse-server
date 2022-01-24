"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

var _graphqlRelay = require("graphql-relay");

var _deepcopy = _interopRequireDefault(require("deepcopy"));

var _UsersRouter = _interopRequireDefault(require("../../Routers/UsersRouter"));

var objectsMutations = _interopRequireWildcard(require("../helpers/objectsMutations"));

var _defaultGraphQLTypes = require("./defaultGraphQLTypes");

var _usersQueries = require("./usersQueries");

var _mutation = require("../transformers/mutation");

var _node = _interopRequireDefault(require("parse/node"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

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
        } = (0, _deepcopy.default)(args);
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
        } = (0, _deepcopy.default)(args);
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
        } = (0, _deepcopy.default)(args);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvdXNlcnNNdXRhdGlvbnMuanMiXSwibmFtZXMiOlsidXNlcnNSb3V0ZXIiLCJVc2Vyc1JvdXRlciIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJpc1VzZXJzQ2xhc3NEaXNhYmxlZCIsInNpZ25VcE11dGF0aW9uIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiaW5wdXRGaWVsZHMiLCJmaWVsZHMiLCJkZXNjcmlwdGlvbnMiLCJ0eXBlIiwicGFyc2VDbGFzc1R5cGVzIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSIsIm91dHB1dEZpZWxkcyIsInZpZXdlciIsIkdyYXBoUUxOb25OdWxsIiwidmlld2VyVHlwZSIsIm11dGF0ZUFuZEdldFBheWxvYWQiLCJhcmdzIiwiY29udGV4dCIsIm11dGF0aW9uSW5mbyIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwicGFyc2VGaWVsZHMiLCJjbGFzc05hbWUiLCJyZXEiLCJzZXNzaW9uVG9rZW4iLCJvYmplY3RJZCIsImF1dGhEYXRhUmVzcG9uc2UiLCJvYmplY3RzTXV0YXRpb25zIiwiY3JlYXRlT2JqZWN0IiwidXNlciIsImUiLCJoYW5kbGVFcnJvciIsImFkZEdyYXBoUUxUeXBlIiwiaW5wdXQiLCJvZlR5cGUiLCJhZGRHcmFwaFFMTXV0YXRpb24iLCJsb2dJbldpdGhNdXRhdGlvbiIsImF1dGhEYXRhIiwiT0JKRUNUIiwiR3JhcGhRTElucHV0T2JqZWN0VHlwZSIsImNsYXNzR3JhcGhRTENyZWF0ZUZpZWxkcyIsImdldEZpZWxkcyIsIk9iamVjdCIsImtleXMiLCJyZWR1Y2UiLCJmaWVsZE5hbWUiLCJsb2dJbk11dGF0aW9uIiwidXNlcm5hbWUiLCJHcmFwaFFMU3RyaW5nIiwicGFzc3dvcmQiLCJoYW5kbGVMb2dJbiIsImJvZHkiLCJxdWVyeSIsInJlc3BvbnNlIiwibG9nT3V0TXV0YXRpb24iLCJvayIsIkdyYXBoUUxCb29sZWFuIiwiX2FyZ3MiLCJoYW5kbGVMb2dPdXQiLCJyZXNldFBhc3N3b3JkTXV0YXRpb24iLCJlbWFpbCIsImhhbmRsZVJlc2V0UmVxdWVzdCIsImNvbmZpcm1SZXNldFBhc3N3b3JkTXV0YXRpb24iLCJ0b2tlbiIsIlBhcnNlIiwiRXJyb3IiLCJVU0VSTkFNRV9NSVNTSU5HIiwiUEFTU1dPUkRfTUlTU0lORyIsIk9USEVSX0NBVVNFIiwidXNlckNvbnRyb2xsZXIiLCJ1cGRhdGVQYXNzd29yZCIsInNlbmRWZXJpZmljYXRpb25FbWFpbE11dGF0aW9uIiwiaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0IiwiY2hhbGxlbmdlTXV0YXRpb24iLCJjaGFsbGVuZ2VEYXRhIiwiaGFuZGxlQ2hhbGxlbmdlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7O0FBRUEsTUFBTUEsV0FBVyxHQUFHLElBQUlDLG9CQUFKLEVBQXBCOztBQUVBLE1BQU1DLElBQUksR0FBR0Msa0JBQWtCLElBQUk7QUFDakMsTUFBSUEsa0JBQWtCLENBQUNDLG9CQUF2QixFQUE2QztBQUMzQztBQUNEOztBQUVELFFBQU1DLGNBQWMsR0FBRyxnREFBNkI7QUFDbERDLElBQUFBLElBQUksRUFBRSxRQUQ0QztBQUVsREMsSUFBQUEsV0FBVyxFQUFFLG1FQUZxQztBQUdsREMsSUFBQUEsV0FBVyxFQUFFO0FBQ1hDLE1BQUFBLE1BQU0sRUFBRTtBQUNOQyxRQUFBQSxZQUFZLEVBQUUsbUVBRFI7QUFFTkMsUUFBQUEsSUFBSSxFQUFFUixrQkFBa0IsQ0FBQ1MsZUFBbkIsQ0FBbUMsT0FBbkMsRUFBNENDO0FBRjVDO0FBREcsS0FIcUM7QUFTbERDLElBQUFBLFlBQVksRUFBRTtBQUNaQyxNQUFBQSxNQUFNLEVBQUU7QUFDTlIsUUFBQUEsV0FBVyxFQUFFLDRFQURQO0FBRU5JLFFBQUFBLElBQUksRUFBRSxJQUFJSyx1QkFBSixDQUFtQmIsa0JBQWtCLENBQUNjLFVBQXRD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QkFBa0IsQ0FBQ2dDLFdBQW5CLENBQStCRCxDQUEvQjtBQUNEO0FBQ0Y7QUE1Q29ELEdBQTdCLENBQTFCO0FBK0NBL0IsRUFBQUEsa0JBQWtCLENBQUNpQyxjQUFuQixDQUFrQ3lDLGlCQUFpQixDQUFDMUQsSUFBbEIsQ0FBdUJrQixLQUF2QixDQUE2QjFCLElBQTdCLENBQWtDMkIsTUFBcEUsRUFBNEUsSUFBNUUsRUFBa0YsSUFBbEY7QUFDQW5DLEVBQUFBLGtCQUFrQixDQUFDaUMsY0FBbkIsQ0FBa0N5QyxpQkFBaUIsQ0FBQ2xFLElBQXBELEVBQTBELElBQTFELEVBQWdFLElBQWhFO0FBQ0FSLEVBQUFBLGtCQUFrQixDQUFDb0Msa0JBQW5CLENBQXNDLFdBQXRDLEVBQW1Ec0MsaUJBQW5ELEVBQXNFLElBQXRFLEVBQTRFLElBQTVFO0FBQ0QsQ0FwYUQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBHcmFwaFFMTm9uTnVsbCwgR3JhcGhRTFN0cmluZywgR3JhcGhRTEJvb2xlYW4sIEdyYXBoUUxJbnB1dE9iamVjdFR5cGUgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQgfSBmcm9tICdncmFwaHFsLXJlbGF5JztcbmltcG9ydCBkZWVwY29weSBmcm9tICdkZWVwY29weSc7XG5pbXBvcnQgVXNlcnNSb3V0ZXIgZnJvbSAnLi4vLi4vUm91dGVycy9Vc2Vyc1JvdXRlcic7XG5pbXBvcnQgKiBhcyBvYmplY3RzTXV0YXRpb25zIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c011dGF0aW9ucyc7XG5pbXBvcnQgeyBPQkpFQ1QgfSBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0IHsgZ2V0VXNlckZyb21TZXNzaW9uVG9rZW4gfSBmcm9tICcuL3VzZXJzUXVlcmllcyc7XG5pbXBvcnQgeyB0cmFuc2Zvcm1UeXBlcyB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9tdXRhdGlvbic7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5cbmNvbnN0IHVzZXJzUm91dGVyID0gbmV3IFVzZXJzUm91dGVyKCk7XG5cbmNvbnN0IGxvYWQgPSBwYXJzZUdyYXBoUUxTY2hlbWEgPT4ge1xuICBpZiAocGFyc2VHcmFwaFFMU2NoZW1hLmlzVXNlcnNDbGFzc0Rpc2FibGVkKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3Qgc2lnblVwTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnU2lnblVwJyxcbiAgICBkZXNjcmlwdGlvbjogJ1RoZSBzaWduVXAgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gY3JlYXRlIGFuZCBzaWduIHVwIGEgbmV3IHVzZXIuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgZmllbGRzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczogJ1RoZXNlIGFyZSB0aGUgZmllbGRzIG9mIHRoZSBuZXcgdXNlciB0byBiZSBjcmVhdGVkIGFuZCBzaWduZWQgdXAuJyxcbiAgICAgICAgdHlwZTogcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1snX1VzZXInXS5jbGFzc0dyYXBoUUxDcmVhdGVUeXBlLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgdmlld2VyOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbmV3IHVzZXIgdGhhdCB3YXMgY3JlYXRlZCwgc2lnbmVkIHVwIGFuZCByZXR1cm5lZCBhcyBhIHZpZXdlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwocGFyc2VHcmFwaFFMU2NoZW1hLnZpZXdlclR5cGUpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgZmllbGRzIH0gPSBkZWVwY29weShhcmdzKTtcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgY29uc3QgcGFyc2VGaWVsZHMgPSBhd2FpdCB0cmFuc2Zvcm1UeXBlcygnY3JlYXRlJywgZmllbGRzLCB7XG4gICAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgICByZXE6IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHsgc2Vzc2lvblRva2VuLCBvYmplY3RJZCwgYXV0aERhdGFSZXNwb25zZSB9ID0gYXdhaXQgb2JqZWN0c011dGF0aW9ucy5jcmVhdGVPYmplY3QoXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICBwYXJzZUZpZWxkcyxcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBpbmZvXG4gICAgICAgICk7XG5cbiAgICAgICAgY29udGV4dC5pbmZvLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25Ub2tlbjtcbiAgICAgICAgY29uc3Qgdmlld2VyID0gYXdhaXQgZ2V0VXNlckZyb21TZXNzaW9uVG9rZW4oXG4gICAgICAgICAgY29udGV4dCxcbiAgICAgICAgICBtdXRhdGlvbkluZm8sXG4gICAgICAgICAgJ3ZpZXdlci51c2VyLicsXG4gICAgICAgICAgb2JqZWN0SWRcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGF1dGhEYXRhUmVzcG9uc2UgJiYgdmlld2VyLnVzZXIpIHZpZXdlci51c2VyLmF1dGhEYXRhUmVzcG9uc2UgPSBhdXRoRGF0YVJlc3BvbnNlO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHZpZXdlcixcbiAgICAgICAgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShzaWduVXBNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHNpZ25VcE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdzaWduVXAnLCBzaWduVXBNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG4gIGNvbnN0IGxvZ0luV2l0aE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ0xvZ0luV2l0aCcsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIGxvZ0luV2l0aCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBzaWdudXAsIGxvZ2luIHVzZXIgd2l0aCAzcmQgcGFydHkgYXV0aGVudGljYXRpb24gc3lzdGVtLiBUaGlzIG11dGF0aW9uIGNyZWF0ZSBhIHVzZXIgaWYgdGhlIGF1dGhEYXRhIGRvIG5vdCBjb3JyZXNwb25kIHRvIGFuIGV4aXN0aW5nIG9uZS4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICBhdXRoRGF0YToge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdUaGlzIGlzIHRoZSBhdXRoIGRhdGEgb2YgeW91ciBjdXN0b20gYXV0aCBwcm92aWRlcicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChPQkpFQ1QpLFxuICAgICAgfSxcbiAgICAgIGZpZWxkczoge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdUaGVzZSBhcmUgdGhlIGZpZWxkcyBvZiB0aGUgdXNlciB0byBiZSBjcmVhdGVkL3VwZGF0ZWQgYW5kIGxvZ2dlZCBpbi4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgICAgICAgbmFtZTogJ1VzZXJMb2dpbldpdGhJbnB1dCcsXG4gICAgICAgICAgZmllbGRzOiAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjbGFzc0dyYXBoUUxDcmVhdGVGaWVsZHMgPSBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW1xuICAgICAgICAgICAgICAnX1VzZXInXG4gICAgICAgICAgICBdLmNsYXNzR3JhcGhRTENyZWF0ZVR5cGUuZ2V0RmllbGRzKCk7XG4gICAgICAgICAgICByZXR1cm4gT2JqZWN0LmtleXMoY2xhc3NHcmFwaFFMQ3JlYXRlRmllbGRzKS5yZWR1Y2UoKGZpZWxkcywgZmllbGROYW1lKSA9PiB7XG4gICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBmaWVsZE5hbWUgIT09ICdwYXNzd29yZCcgJiZcbiAgICAgICAgICAgICAgICBmaWVsZE5hbWUgIT09ICd1c2VybmFtZScgJiZcbiAgICAgICAgICAgICAgICBmaWVsZE5hbWUgIT09ICdhdXRoRGF0YSdcbiAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgZmllbGRzW2ZpZWxkTmFtZV0gPSBjbGFzc0dyYXBoUUxDcmVhdGVGaWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgICAgICAgfSwge30pO1xuICAgICAgICAgIH0sXG4gICAgICAgIH0pLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgdmlld2VyOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbmV3IHVzZXIgdGhhdCB3YXMgY3JlYXRlZCwgc2lnbmVkIHVwIGFuZCByZXR1cm5lZCBhcyBhIHZpZXdlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwocGFyc2VHcmFwaFFMU2NoZW1hLnZpZXdlclR5cGUpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgZmllbGRzLCBhdXRoRGF0YSB9ID0gZGVlcGNvcHkoYXJncyk7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ2NyZWF0ZScsIGZpZWxkcywge1xuICAgICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gICAgICAgICAgcmVxOiB7IGNvbmZpZywgYXV0aCwgaW5mbyB9LFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCB7IHNlc3Npb25Ub2tlbiwgb2JqZWN0SWQsIGF1dGhEYXRhUmVzcG9uc2UgfSA9IGF3YWl0IG9iamVjdHNNdXRhdGlvbnMuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgeyAuLi5wYXJzZUZpZWxkcywgYXV0aERhdGEgfSxcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBpbmZvXG4gICAgICAgICk7XG5cbiAgICAgICAgY29udGV4dC5pbmZvLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25Ub2tlbjtcbiAgICAgICAgY29uc3Qgdmlld2VyID0gYXdhaXQgZ2V0VXNlckZyb21TZXNzaW9uVG9rZW4oXG4gICAgICAgICAgY29udGV4dCxcbiAgICAgICAgICBtdXRhdGlvbkluZm8sXG4gICAgICAgICAgJ3ZpZXdlci51c2VyLicsXG4gICAgICAgICAgb2JqZWN0SWRcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGF1dGhEYXRhUmVzcG9uc2UgJiYgdmlld2VyLnVzZXIpIHZpZXdlci51c2VyLmF1dGhEYXRhUmVzcG9uc2UgPSBhdXRoRGF0YVJlc3BvbnNlO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHZpZXdlcixcbiAgICAgICAgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShsb2dJbldpdGhNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGxvZ0luV2l0aE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdsb2dJbldpdGgnLCBsb2dJbldpdGhNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgY29uc3QgbG9nSW5NdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdMb2dJbicsXG4gICAgZGVzY3JpcHRpb246ICdUaGUgbG9nSW4gbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gbG9nIGluIGFuIGV4aXN0aW5nIHVzZXIuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgdXNlcm5hbWU6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB1c2VybmFtZSB1c2VkIHRvIGxvZyBpbiB0aGUgdXNlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgICAgcGFzc3dvcmQ6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBwYXNzd29yZCB1c2VkIHRvIGxvZyBpbiB0aGUgdXNlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgICAgYXV0aERhdGE6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdBdXRoIGRhdGEgcGF5bG9hZCwgbmVlZGVkIGlmIHNvbWUgcmVxdWlyZWQgYXV0aCBhZGFwdGVycyBhcmUgY29uZmlndXJlZC4nLFxuICAgICAgICB0eXBlOiBPQkpFQ1QsXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICB2aWV3ZXI6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBleGlzdGluZyB1c2VyIHRoYXQgd2FzIGxvZ2dlZCBpbiBhbmQgcmV0dXJuZWQgYXMgYSB2aWV3ZXIuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKHBhcnNlR3JhcGhRTFNjaGVtYS52aWV3ZXJUeXBlKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IHVzZXJuYW1lLCBwYXNzd29yZCwgYXV0aERhdGEgfSA9IGRlZXBjb3B5KGFyZ3MpO1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICBjb25zdCB7IHNlc3Npb25Ub2tlbiwgb2JqZWN0SWQsIGF1dGhEYXRhUmVzcG9uc2UgfSA9IChcbiAgICAgICAgICBhd2FpdCB1c2Vyc1JvdXRlci5oYW5kbGVMb2dJbih7XG4gICAgICAgICAgICBib2R5OiB7XG4gICAgICAgICAgICAgIHVzZXJuYW1lLFxuICAgICAgICAgICAgICBwYXNzd29yZCxcbiAgICAgICAgICAgICAgYXV0aERhdGEsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcXVlcnk6IHt9LFxuICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgfSlcbiAgICAgICAgKS5yZXNwb25zZTtcblxuICAgICAgICBjb250ZXh0LmluZm8uc2Vzc2lvblRva2VuID0gc2Vzc2lvblRva2VuO1xuXG4gICAgICAgIGNvbnN0IHZpZXdlciA9IGF3YWl0IGdldFVzZXJGcm9tU2Vzc2lvblRva2VuKFxuICAgICAgICAgIGNvbnRleHQsXG4gICAgICAgICAgbXV0YXRpb25JbmZvLFxuICAgICAgICAgICd2aWV3ZXIudXNlci4nLFxuICAgICAgICAgIG9iamVjdElkXG4gICAgICAgICk7XG4gICAgICAgIGlmIChhdXRoRGF0YVJlc3BvbnNlICYmIHZpZXdlci51c2VyKSB2aWV3ZXIudXNlci5hdXRoRGF0YVJlc3BvbnNlID0gYXV0aERhdGFSZXNwb25zZTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICB2aWV3ZXIsXG4gICAgICAgIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUobG9nSW5NdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGxvZ0luTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oJ2xvZ0luJywgbG9nSW5NdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgY29uc3QgbG9nT3V0TXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnTG9nT3V0JyxcbiAgICBkZXNjcmlwdGlvbjogJ1RoZSBsb2dPdXQgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gbG9nIG91dCBhbiBleGlzdGluZyB1c2VyLicsXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICBvazoge1xuICAgICAgICBkZXNjcmlwdGlvbjogXCJJdCdzIGFsd2F5cyB0cnVlLlwiLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChfYXJncywgY29udGV4dCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgYXdhaXQgdXNlcnNSb3V0ZXIuaGFuZGxlTG9nT3V0KHtcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBpbmZvLFxuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGxvZ091dE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUobG9nT3V0TXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oJ2xvZ091dCcsIGxvZ091dE11dGF0aW9uLCB0cnVlLCB0cnVlKTtcblxuICBjb25zdCByZXNldFBhc3N3b3JkTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnUmVzZXRQYXNzd29yZCcsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIHJlc2V0UGFzc3dvcmQgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gcmVzZXQgdGhlIHBhc3N3b3JkIG9mIGFuIGV4aXN0aW5nIHVzZXIuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgZW1haWw6IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOiAnRW1haWwgb2YgdGhlIHVzZXIgdGhhdCBzaG91bGQgcmVjZWl2ZSB0aGUgcmVzZXQgZW1haWwnLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICBvazoge1xuICAgICAgICBkZXNjcmlwdGlvbjogXCJJdCdzIGFsd2F5cyB0cnVlLlwiLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jICh7IGVtYWlsIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICBhd2FpdCB1c2Vyc1JvdXRlci5oYW5kbGVSZXNldFJlcXVlc3Qoe1xuICAgICAgICBib2R5OiB7XG4gICAgICAgICAgZW1haWwsXG4gICAgICAgIH0sXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgYXV0aCxcbiAgICAgICAgaW5mbyxcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShyZXNldFBhc3N3b3JkTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShyZXNldFBhc3N3b3JkTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oJ3Jlc2V0UGFzc3dvcmQnLCByZXNldFBhc3N3b3JkTXV0YXRpb24sIHRydWUsIHRydWUpO1xuXG4gIGNvbnN0IGNvbmZpcm1SZXNldFBhc3N3b3JkTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnQ29uZmlybVJlc2V0UGFzc3dvcmQnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSBjb25maXJtUmVzZXRQYXNzd29yZCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byByZXNldCB0aGUgcGFzc3dvcmQgb2YgYW4gZXhpc3RpbmcgdXNlci4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICB1c2VybmFtZToge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdVc2VybmFtZSBvZiB0aGUgdXNlciB0aGF0IGhhdmUgcmVjZWl2ZWQgdGhlIHJlc2V0IGVtYWlsJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICAgIHBhc3N3b3JkOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczogJ05ldyBwYXNzd29yZCBvZiB0aGUgdXNlcicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICAgIH0sXG4gICAgICB0b2tlbjoge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdSZXNldCB0b2tlbiB0aGF0IHdhcyBlbWFpbGVkIHRvIHRoZSB1c2VyJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgb2s6IHtcbiAgICAgICAgZGVzY3JpcHRpb246IFwiSXQncyBhbHdheXMgdHJ1ZS5cIixcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoeyB1c2VybmFtZSwgcGFzc3dvcmQsIHRva2VuIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHsgY29uZmlnIH0gPSBjb250ZXh0O1xuICAgICAgaWYgKCF1c2VybmFtZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVVNFUk5BTUVfTUlTU0lORywgJ3lvdSBtdXN0IHByb3ZpZGUgYSB1c2VybmFtZScpO1xuICAgICAgfVxuICAgICAgaWYgKCFwYXNzd29yZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuUEFTU1dPUkRfTUlTU0lORywgJ3lvdSBtdXN0IHByb3ZpZGUgYSBwYXNzd29yZCcpO1xuICAgICAgfVxuICAgICAgaWYgKCF0b2tlbikge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICd5b3UgbXVzdCBwcm92aWRlIGEgdG9rZW4nKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdXNlckNvbnRyb2xsZXIgPSBjb25maWcudXNlckNvbnRyb2xsZXI7XG4gICAgICBhd2FpdCB1c2VyQ29udHJvbGxlci51cGRhdGVQYXNzd29yZCh1c2VybmFtZSwgdG9rZW4sIHBhc3N3b3JkKTtcbiAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgIGNvbmZpcm1SZXNldFBhc3N3b3JkTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNvbmZpcm1SZXNldFBhc3N3b3JkTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oXG4gICAgJ2NvbmZpcm1SZXNldFBhc3N3b3JkJyxcbiAgICBjb25maXJtUmVzZXRQYXNzd29yZE11dGF0aW9uLFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuXG4gIGNvbnN0IHNlbmRWZXJpZmljYXRpb25FbWFpbE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ1NlbmRWZXJpZmljYXRpb25FbWFpbCcsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIHNlbmRWZXJpZmljYXRpb25FbWFpbCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBzZW5kIHRoZSB2ZXJpZmljYXRpb24gZW1haWwgYWdhaW4uJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgZW1haWw6IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOiAnRW1haWwgb2YgdGhlIHVzZXIgdGhhdCBzaG91bGQgcmVjZWl2ZSB0aGUgdmVyaWZpY2F0aW9uIGVtYWlsJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgb2s6IHtcbiAgICAgICAgZGVzY3JpcHRpb246IFwiSXQncyBhbHdheXMgdHJ1ZS5cIixcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoeyBlbWFpbCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICBhd2FpdCB1c2Vyc1JvdXRlci5oYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3Qoe1xuICAgICAgICAgIGJvZHk6IHtcbiAgICAgICAgICAgIGVtYWlsLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgaW5mbyxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICBzZW5kVmVyaWZpY2F0aW9uRW1haWxNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoc2VuZFZlcmlmaWNhdGlvbkVtYWlsTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oXG4gICAgJ3NlbmRWZXJpZmljYXRpb25FbWFpbCcsXG4gICAgc2VuZFZlcmlmaWNhdGlvbkVtYWlsTXV0YXRpb24sXG4gICAgdHJ1ZSxcbiAgICB0cnVlXG4gICk7XG5cbiAgY29uc3QgY2hhbGxlbmdlTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnQ2hhbGxlbmdlJyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdUaGUgY2hhbGxlbmdlIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGluaXRpYXRlIGFuIGF1dGhlbnRpY2F0aW9uIGNoYWxsZW5nZSB3aGVuIGFuIGF1dGggYWRhcHRlciBuZWVkIGl0LicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIHVzZXJuYW1lOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdXNlcm5hbWUgdXNlZCB0byBsb2cgaW4gdGhlIHVzZXIuJyxcbiAgICAgICAgdHlwZTogR3JhcGhRTFN0cmluZyxcbiAgICAgIH0sXG4gICAgICBwYXNzd29yZDoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHBhc3N3b3JkIHVzZWQgdG8gbG9nIGluIHRoZSB1c2VyLicsXG4gICAgICAgIHR5cGU6IEdyYXBoUUxTdHJpbmcsXG4gICAgICB9LFxuICAgICAgYXV0aERhdGE6IHtcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgJ0F1dGggZGF0YSBhbGxvdyB0byBwcmUgaWRlbnRpZnkgdGhlIHVzZXIgaWYgdGhlIGF1dGggYWRhcHRlciBuZWVkIHByZSBpZGVudGlmaWNhdGlvbi4nLFxuICAgICAgICB0eXBlOiBPQkpFQ1QsXG4gICAgICB9LFxuICAgICAgY2hhbGxlbmdlRGF0YToge1xuICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAnQ2hhbGxlbmdlIGRhdGEgcGF5bG9hZCwgY291bGQgYmUgdXNlZCB0byBwb3N0IHNvbWUgZGF0YSB0byBhdXRoIHByb3ZpZGVycyBpZiB0aGV5IG5lZWQgZGF0YSBmb3IgdGhlIHJlc3BvbnNlLicsXG4gICAgICAgIHR5cGU6IE9CSkVDVCxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIGNoYWxsZW5nZURhdGE6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdDaGFsbGVuZ2UgcmVzcG9uc2UgZnJvbSBjb25maWd1cmVkIGF1dGggYWRhcHRlcnMuJyxcbiAgICAgICAgdHlwZTogT0JKRUNULFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChpbnB1dCwgY29udGV4dCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgY29uc3QgeyByZXNwb25zZSB9ID0gYXdhaXQgdXNlcnNSb3V0ZXIuaGFuZGxlQ2hhbGxlbmdlKHtcbiAgICAgICAgICBib2R5OiBpbnB1dCxcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBpbmZvLFxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNoYWxsZW5nZU11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2hhbGxlbmdlTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oJ2NoYWxsZW5nZScsIGNoYWxsZW5nZU11dGF0aW9uLCB0cnVlLCB0cnVlKTtcbn07XG5cbmV4cG9ydCB7IGxvYWQgfTtcbiJdfQ==