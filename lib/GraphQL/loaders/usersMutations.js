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
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
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
          originalFields: args.fields || {},
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
          originalFields: args.fields || {},
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
    description: 'The challenge mutation can be used to initiate an authentication challenge when an auth adapter needs it.',
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
        description: 'Auth data allow to preidentify the user if the auth adapter needs preidentification.',
        type: _defaultGraphQLTypes.OBJECT
      },
      challengeData: {
        description: 'Challenge data payload, can be used to post data to auth providers to auth providers if they need data for the response.',
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJ1c2Vyc1JvdXRlciIsIlVzZXJzUm91dGVyIiwibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsImlzVXNlcnNDbGFzc0Rpc2FibGVkIiwic2lnblVwTXV0YXRpb24iLCJtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiaW5wdXRGaWVsZHMiLCJmaWVsZHMiLCJkZXNjcmlwdGlvbnMiLCJ0eXBlIiwicGFyc2VDbGFzc1R5cGVzIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSIsIm91dHB1dEZpZWxkcyIsInZpZXdlciIsIkdyYXBoUUxOb25OdWxsIiwidmlld2VyVHlwZSIsIm11dGF0ZUFuZEdldFBheWxvYWQiLCJhcmdzIiwiY29udGV4dCIsIm11dGF0aW9uSW5mbyIsImRlZXBjb3B5IiwiY29uZmlnIiwiYXV0aCIsImluZm8iLCJwYXJzZUZpZWxkcyIsInRyYW5zZm9ybVR5cGVzIiwiY2xhc3NOYW1lIiwib3JpZ2luYWxGaWVsZHMiLCJyZXEiLCJzZXNzaW9uVG9rZW4iLCJvYmplY3RJZCIsImF1dGhEYXRhUmVzcG9uc2UiLCJvYmplY3RzTXV0YXRpb25zIiwiY3JlYXRlT2JqZWN0IiwiZ2V0VXNlckZyb21TZXNzaW9uVG9rZW4iLCJ1c2VyIiwiZSIsImhhbmRsZUVycm9yIiwiYWRkR3JhcGhRTFR5cGUiLCJpbnB1dCIsIm9mVHlwZSIsImFkZEdyYXBoUUxNdXRhdGlvbiIsImxvZ0luV2l0aE11dGF0aW9uIiwiYXV0aERhdGEiLCJPQkpFQ1QiLCJHcmFwaFFMSW5wdXRPYmplY3RUeXBlIiwiY2xhc3NHcmFwaFFMQ3JlYXRlRmllbGRzIiwiZ2V0RmllbGRzIiwiT2JqZWN0Iiwia2V5cyIsInJlZHVjZSIsImZpZWxkTmFtZSIsImxvZ0luTXV0YXRpb24iLCJ1c2VybmFtZSIsIkdyYXBoUUxTdHJpbmciLCJwYXNzd29yZCIsImhhbmRsZUxvZ0luIiwiYm9keSIsInF1ZXJ5IiwicmVzcG9uc2UiLCJsb2dPdXRNdXRhdGlvbiIsIm9rIiwiR3JhcGhRTEJvb2xlYW4iLCJfYXJncyIsImhhbmRsZUxvZ091dCIsInJlc2V0UGFzc3dvcmRNdXRhdGlvbiIsImVtYWlsIiwiaGFuZGxlUmVzZXRSZXF1ZXN0IiwiY29uZmlybVJlc2V0UGFzc3dvcmRNdXRhdGlvbiIsInRva2VuIiwiUGFyc2UiLCJFcnJvciIsIlVTRVJOQU1FX01JU1NJTkciLCJQQVNTV09SRF9NSVNTSU5HIiwiT1RIRVJfQ0FVU0UiLCJ1c2VyQ29udHJvbGxlciIsInVwZGF0ZVBhc3N3b3JkIiwic2VuZFZlcmlmaWNhdGlvbkVtYWlsTXV0YXRpb24iLCJoYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3QiLCJjaGFsbGVuZ2VNdXRhdGlvbiIsImNoYWxsZW5nZURhdGEiLCJoYW5kbGVDaGFsbGVuZ2UiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvR3JhcGhRTC9sb2FkZXJzL3VzZXJzTXV0YXRpb25zLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEdyYXBoUUxOb25OdWxsLCBHcmFwaFFMU3RyaW5nLCBHcmFwaFFMQm9vbGVhbiwgR3JhcGhRTElucHV0T2JqZWN0VHlwZSB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IGRlZXBjb3B5IGZyb20gJ2RlZXBjb3B5JztcbmltcG9ydCBVc2Vyc1JvdXRlciBmcm9tICcuLi8uLi9Sb3V0ZXJzL1VzZXJzUm91dGVyJztcbmltcG9ydCAqIGFzIG9iamVjdHNNdXRhdGlvbnMgZnJvbSAnLi4vaGVscGVycy9vYmplY3RzTXV0YXRpb25zJztcbmltcG9ydCB7IE9CSkVDVCB9IGZyb20gJy4vZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgeyBnZXRVc2VyRnJvbVNlc3Npb25Ub2tlbiB9IGZyb20gJy4vdXNlcnNRdWVyaWVzJztcbmltcG9ydCB7IHRyYW5zZm9ybVR5cGVzIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL211dGF0aW9uJztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcblxuY29uc3QgdXNlcnNSb3V0ZXIgPSBuZXcgVXNlcnNSb3V0ZXIoKTtcblxuY29uc3QgbG9hZCA9IHBhcnNlR3JhcGhRTFNjaGVtYSA9PiB7XG4gIGlmIChwYXJzZUdyYXBoUUxTY2hlbWEuaXNVc2Vyc0NsYXNzRGlzYWJsZWQpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBzaWduVXBNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdTaWduVXAnLFxuICAgIGRlc2NyaXB0aW9uOiAnVGhlIHNpZ25VcCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBjcmVhdGUgYW5kIHNpZ24gdXAgYSBuZXcgdXNlci4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOiAnVGhlc2UgYXJlIHRoZSBmaWVsZHMgb2YgdGhlIG5ldyB1c2VyIHRvIGJlIGNyZWF0ZWQgYW5kIHNpZ25lZCB1cC4nLFxuICAgICAgICB0eXBlOiBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzWydfVXNlciddLmNsYXNzR3JhcGhRTENyZWF0ZVR5cGUsXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICB2aWV3ZXI6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBuZXcgdXNlciB0aGF0IHdhcyBjcmVhdGVkLCBzaWduZWQgdXAgYW5kIHJldHVybmVkIGFzIGEgdmlld2VyLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChwYXJzZUdyYXBoUUxTY2hlbWEudmlld2VyVHlwZSksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQsIG11dGF0aW9uSW5mbykgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyBmaWVsZHMgfSA9IGRlZXBjb3B5KGFyZ3MpO1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICBjb25zdCBwYXJzZUZpZWxkcyA9IGF3YWl0IHRyYW5zZm9ybVR5cGVzKCdjcmVhdGUnLCBmaWVsZHMsIHtcbiAgICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgIG9yaWdpbmFsRmllbGRzOiBhcmdzLmZpZWxkcyB8fCB7fSxcbiAgICAgICAgICByZXE6IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHsgc2Vzc2lvblRva2VuLCBvYmplY3RJZCwgYXV0aERhdGFSZXNwb25zZSB9ID0gYXdhaXQgb2JqZWN0c011dGF0aW9ucy5jcmVhdGVPYmplY3QoXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICBwYXJzZUZpZWxkcyxcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBpbmZvXG4gICAgICAgICk7XG5cbiAgICAgICAgY29udGV4dC5pbmZvLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25Ub2tlbjtcbiAgICAgICAgY29uc3Qgdmlld2VyID0gYXdhaXQgZ2V0VXNlckZyb21TZXNzaW9uVG9rZW4oXG4gICAgICAgICAgY29udGV4dCxcbiAgICAgICAgICBtdXRhdGlvbkluZm8sXG4gICAgICAgICAgJ3ZpZXdlci51c2VyLicsXG4gICAgICAgICAgb2JqZWN0SWRcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGF1dGhEYXRhUmVzcG9uc2UgJiYgdmlld2VyLnVzZXIpIHZpZXdlci51c2VyLmF1dGhEYXRhUmVzcG9uc2UgPSBhdXRoRGF0YVJlc3BvbnNlO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHZpZXdlcixcbiAgICAgICAgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShzaWduVXBNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHNpZ25VcE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdzaWduVXAnLCBzaWduVXBNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG4gIGNvbnN0IGxvZ0luV2l0aE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ0xvZ0luV2l0aCcsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIGxvZ0luV2l0aCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBzaWdudXAsIGxvZ2luIHVzZXIgd2l0aCAzcmQgcGFydHkgYXV0aGVudGljYXRpb24gc3lzdGVtLiBUaGlzIG11dGF0aW9uIGNyZWF0ZSBhIHVzZXIgaWYgdGhlIGF1dGhEYXRhIGRvIG5vdCBjb3JyZXNwb25kIHRvIGFuIGV4aXN0aW5nIG9uZS4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICBhdXRoRGF0YToge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdUaGlzIGlzIHRoZSBhdXRoIGRhdGEgb2YgeW91ciBjdXN0b20gYXV0aCBwcm92aWRlcicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChPQkpFQ1QpLFxuICAgICAgfSxcbiAgICAgIGZpZWxkczoge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdUaGVzZSBhcmUgdGhlIGZpZWxkcyBvZiB0aGUgdXNlciB0byBiZSBjcmVhdGVkL3VwZGF0ZWQgYW5kIGxvZ2dlZCBpbi4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgICAgICAgbmFtZTogJ1VzZXJMb2dpbldpdGhJbnB1dCcsXG4gICAgICAgICAgZmllbGRzOiAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjbGFzc0dyYXBoUUxDcmVhdGVGaWVsZHMgPSBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW1xuICAgICAgICAgICAgICAnX1VzZXInXG4gICAgICAgICAgICBdLmNsYXNzR3JhcGhRTENyZWF0ZVR5cGUuZ2V0RmllbGRzKCk7XG4gICAgICAgICAgICByZXR1cm4gT2JqZWN0LmtleXMoY2xhc3NHcmFwaFFMQ3JlYXRlRmllbGRzKS5yZWR1Y2UoKGZpZWxkcywgZmllbGROYW1lKSA9PiB7XG4gICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBmaWVsZE5hbWUgIT09ICdwYXNzd29yZCcgJiZcbiAgICAgICAgICAgICAgICBmaWVsZE5hbWUgIT09ICd1c2VybmFtZScgJiZcbiAgICAgICAgICAgICAgICBmaWVsZE5hbWUgIT09ICdhdXRoRGF0YSdcbiAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgZmllbGRzW2ZpZWxkTmFtZV0gPSBjbGFzc0dyYXBoUUxDcmVhdGVGaWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgICAgICAgfSwge30pO1xuICAgICAgICAgIH0sXG4gICAgICAgIH0pLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgdmlld2VyOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbmV3IHVzZXIgdGhhdCB3YXMgY3JlYXRlZCwgc2lnbmVkIHVwIGFuZCByZXR1cm5lZCBhcyBhIHZpZXdlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwocGFyc2VHcmFwaFFMU2NoZW1hLnZpZXdlclR5cGUpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgZmllbGRzLCBhdXRoRGF0YSB9ID0gZGVlcGNvcHkoYXJncyk7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ2NyZWF0ZScsIGZpZWxkcywge1xuICAgICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gICAgICAgICAgb3JpZ2luYWxGaWVsZHM6IGFyZ3MuZmllbGRzIHx8IHt9LFxuICAgICAgICAgIHJlcTogeyBjb25maWcsIGF1dGgsIGluZm8gfSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgeyBzZXNzaW9uVG9rZW4sIG9iamVjdElkLCBhdXRoRGF0YVJlc3BvbnNlIH0gPSBhd2FpdCBvYmplY3RzTXV0YXRpb25zLmNyZWF0ZU9iamVjdChcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHsgLi4ucGFyc2VGaWVsZHMsIGF1dGhEYXRhIH0sXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgaW5mb1xuICAgICAgICApO1xuXG4gICAgICAgIGNvbnRleHQuaW5mby5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uVG9rZW47XG4gICAgICAgIGNvbnN0IHZpZXdlciA9IGF3YWl0IGdldFVzZXJGcm9tU2Vzc2lvblRva2VuKFxuICAgICAgICAgIGNvbnRleHQsXG4gICAgICAgICAgbXV0YXRpb25JbmZvLFxuICAgICAgICAgICd2aWV3ZXIudXNlci4nLFxuICAgICAgICAgIG9iamVjdElkXG4gICAgICAgICk7XG4gICAgICAgIGlmIChhdXRoRGF0YVJlc3BvbnNlICYmIHZpZXdlci51c2VyKSB2aWV3ZXIudXNlci5hdXRoRGF0YVJlc3BvbnNlID0gYXV0aERhdGFSZXNwb25zZTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICB2aWV3ZXIsXG4gICAgICAgIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUobG9nSW5XaXRoTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShsb2dJbldpdGhNdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbignbG9nSW5XaXRoJywgbG9nSW5XaXRoTXV0YXRpb24sIHRydWUsIHRydWUpO1xuXG4gIGNvbnN0IGxvZ0luTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnTG9nSW4nLFxuICAgIGRlc2NyaXB0aW9uOiAnVGhlIGxvZ0luIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGxvZyBpbiBhbiBleGlzdGluZyB1c2VyLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIHVzZXJuYW1lOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdXNlcm5hbWUgdXNlZCB0byBsb2cgaW4gdGhlIHVzZXIuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICAgIHBhc3N3b3JkOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgcGFzc3dvcmQgdXNlZCB0byBsb2cgaW4gdGhlIHVzZXIuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICAgIGF1dGhEYXRhOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQXV0aCBkYXRhIHBheWxvYWQsIG5lZWRlZCBpZiBzb21lIHJlcXVpcmVkIGF1dGggYWRhcHRlcnMgYXJlIGNvbmZpZ3VyZWQuJyxcbiAgICAgICAgdHlwZTogT0JKRUNULFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgdmlld2VyOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZXhpc3RpbmcgdXNlciB0aGF0IHdhcyBsb2dnZWQgaW4gYW5kIHJldHVybmVkIGFzIGEgdmlld2VyLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChwYXJzZUdyYXBoUUxTY2hlbWEudmlld2VyVHlwZSksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQsIG11dGF0aW9uSW5mbykgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyB1c2VybmFtZSwgcGFzc3dvcmQsIGF1dGhEYXRhIH0gPSBkZWVwY29weShhcmdzKTtcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgY29uc3QgeyBzZXNzaW9uVG9rZW4sIG9iamVjdElkLCBhdXRoRGF0YVJlc3BvbnNlIH0gPSAoXG4gICAgICAgICAgYXdhaXQgdXNlcnNSb3V0ZXIuaGFuZGxlTG9nSW4oe1xuICAgICAgICAgICAgYm9keToge1xuICAgICAgICAgICAgICB1c2VybmFtZSxcbiAgICAgICAgICAgICAgcGFzc3dvcmQsXG4gICAgICAgICAgICAgIGF1dGhEYXRhLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHF1ZXJ5OiB7fSxcbiAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBpbmZvLFxuICAgICAgICAgIH0pXG4gICAgICAgICkucmVzcG9uc2U7XG5cbiAgICAgICAgY29udGV4dC5pbmZvLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25Ub2tlbjtcblxuICAgICAgICBjb25zdCB2aWV3ZXIgPSBhd2FpdCBnZXRVc2VyRnJvbVNlc3Npb25Ub2tlbihcbiAgICAgICAgICBjb250ZXh0LFxuICAgICAgICAgIG11dGF0aW9uSW5mbyxcbiAgICAgICAgICAndmlld2VyLnVzZXIuJyxcbiAgICAgICAgICBvYmplY3RJZFxuICAgICAgICApO1xuICAgICAgICBpZiAoYXV0aERhdGFSZXNwb25zZSAmJiB2aWV3ZXIudXNlcikgdmlld2VyLnVzZXIuYXV0aERhdGFSZXNwb25zZSA9IGF1dGhEYXRhUmVzcG9uc2U7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgdmlld2VyLFxuICAgICAgICB9O1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGxvZ0luTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShsb2dJbk11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdsb2dJbicsIGxvZ0luTXV0YXRpb24sIHRydWUsIHRydWUpO1xuXG4gIGNvbnN0IGxvZ091dE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ0xvZ091dCcsXG4gICAgZGVzY3JpcHRpb246ICdUaGUgbG9nT3V0IG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGxvZyBvdXQgYW4gZXhpc3RpbmcgdXNlci4nLFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgb2s6IHtcbiAgICAgICAgZGVzY3JpcHRpb246IFwiSXQncyBhbHdheXMgdHJ1ZS5cIixcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoX2FyZ3MsIGNvbnRleHQpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgIGF3YWl0IHVzZXJzUm91dGVyLmhhbmRsZUxvZ091dCh7XG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgaW5mbyxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShsb2dPdXRNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGxvZ091dE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdsb2dPdXQnLCBsb2dPdXRNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgY29uc3QgcmVzZXRQYXNzd29yZE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ1Jlc2V0UGFzc3dvcmQnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSByZXNldFBhc3N3b3JkIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIHJlc2V0IHRoZSBwYXNzd29yZCBvZiBhbiBleGlzdGluZyB1c2VyLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIGVtYWlsOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczogJ0VtYWlsIG9mIHRoZSB1c2VyIHRoYXQgc2hvdWxkIHJlY2VpdmUgdGhlIHJlc2V0IGVtYWlsJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgb2s6IHtcbiAgICAgICAgZGVzY3JpcHRpb246IFwiSXQncyBhbHdheXMgdHJ1ZS5cIixcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoeyBlbWFpbCB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgYXdhaXQgdXNlcnNSb3V0ZXIuaGFuZGxlUmVzZXRSZXF1ZXN0KHtcbiAgICAgICAgYm9keToge1xuICAgICAgICAgIGVtYWlsLFxuICAgICAgICB9LFxuICAgICAgICBjb25maWcsXG4gICAgICAgIGF1dGgsXG4gICAgICAgIGluZm8sXG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUocmVzZXRQYXNzd29yZE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUocmVzZXRQYXNzd29yZE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdyZXNldFBhc3N3b3JkJywgcmVzZXRQYXNzd29yZE11dGF0aW9uLCB0cnVlLCB0cnVlKTtcblxuICBjb25zdCBjb25maXJtUmVzZXRQYXNzd29yZE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ0NvbmZpcm1SZXNldFBhc3N3b3JkJyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdUaGUgY29uZmlybVJlc2V0UGFzc3dvcmQgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gcmVzZXQgdGhlIHBhc3N3b3JkIG9mIGFuIGV4aXN0aW5nIHVzZXIuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgdXNlcm5hbWU6IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOiAnVXNlcm5hbWUgb2YgdGhlIHVzZXIgdGhhdCBoYXZlIHJlY2VpdmVkIHRoZSByZXNldCBlbWFpbCcsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICAgIH0sXG4gICAgICBwYXNzd29yZDoge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdOZXcgcGFzc3dvcmQgb2YgdGhlIHVzZXInLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgICAgdG9rZW46IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOiAnUmVzZXQgdG9rZW4gdGhhdCB3YXMgZW1haWxlZCB0byB0aGUgdXNlcicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIG9rOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIkl0J3MgYWx3YXlzIHRydWUuXCIsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKHsgdXNlcm5hbWUsIHBhc3N3b3JkLCB0b2tlbiB9LCBjb250ZXh0KSA9PiB7XG4gICAgICBjb25zdCB7IGNvbmZpZyB9ID0gY29udGV4dDtcbiAgICAgIGlmICghdXNlcm5hbWUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlVTRVJOQU1FX01JU1NJTkcsICd5b3UgbXVzdCBwcm92aWRlIGEgdXNlcm5hbWUnKTtcbiAgICAgIH1cbiAgICAgIGlmICghcGFzc3dvcmQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlBBU1NXT1JEX01JU1NJTkcsICd5b3UgbXVzdCBwcm92aWRlIGEgcGFzc3dvcmQnKTtcbiAgICAgIH1cbiAgICAgIGlmICghdG9rZW4pIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAneW91IG11c3QgcHJvdmlkZSBhIHRva2VuJyk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHVzZXJDb250cm9sbGVyID0gY29uZmlnLnVzZXJDb250cm9sbGVyO1xuICAgICAgYXdhaXQgdXNlckNvbnRyb2xsZXIudXBkYXRlUGFzc3dvcmQodXNlcm5hbWUsIHRva2VuLCBwYXNzd29yZCk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICBjb25maXJtUmVzZXRQYXNzd29yZE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsXG4gICAgdHJ1ZSxcbiAgICB0cnVlXG4gICk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjb25maXJtUmVzZXRQYXNzd29yZE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKFxuICAgICdjb25maXJtUmVzZXRQYXNzd29yZCcsXG4gICAgY29uZmlybVJlc2V0UGFzc3dvcmRNdXRhdGlvbixcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcblxuICBjb25zdCBzZW5kVmVyaWZpY2F0aW9uRW1haWxNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdTZW5kVmVyaWZpY2F0aW9uRW1haWwnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSBzZW5kVmVyaWZpY2F0aW9uRW1haWwgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gc2VuZCB0aGUgdmVyaWZpY2F0aW9uIGVtYWlsIGFnYWluLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIGVtYWlsOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczogJ0VtYWlsIG9mIHRoZSB1c2VyIHRoYXQgc2hvdWxkIHJlY2VpdmUgdGhlIHZlcmlmaWNhdGlvbiBlbWFpbCcsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIG9rOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIkl0J3MgYWx3YXlzIHRydWUuXCIsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKHsgZW1haWwgfSwgY29udGV4dCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgYXdhaXQgdXNlcnNSb3V0ZXIuaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0KHtcbiAgICAgICAgICBib2R5OiB7XG4gICAgICAgICAgICBlbWFpbCxcbiAgICAgICAgICB9LFxuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGluZm8sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgc2VuZFZlcmlmaWNhdGlvbkVtYWlsTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHNlbmRWZXJpZmljYXRpb25FbWFpbE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKFxuICAgICdzZW5kVmVyaWZpY2F0aW9uRW1haWwnLFxuICAgIHNlbmRWZXJpZmljYXRpb25FbWFpbE11dGF0aW9uLFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuXG4gIGNvbnN0IGNoYWxsZW5nZU11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ0NoYWxsZW5nZScsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIGNoYWxsZW5nZSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBpbml0aWF0ZSBhbiBhdXRoZW50aWNhdGlvbiBjaGFsbGVuZ2Ugd2hlbiBhbiBhdXRoIGFkYXB0ZXIgbmVlZHMgaXQuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgdXNlcm5hbWU6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB1c2VybmFtZSB1c2VkIHRvIGxvZyBpbiB0aGUgdXNlci4nLFxuICAgICAgICB0eXBlOiBHcmFwaFFMU3RyaW5nLFxuICAgICAgfSxcbiAgICAgIHBhc3N3b3JkOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgcGFzc3dvcmQgdXNlZCB0byBsb2cgaW4gdGhlIHVzZXIuJyxcbiAgICAgICAgdHlwZTogR3JhcGhRTFN0cmluZyxcbiAgICAgIH0sXG4gICAgICBhdXRoRGF0YToge1xuICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAnQXV0aCBkYXRhIGFsbG93IHRvIHByZWlkZW50aWZ5IHRoZSB1c2VyIGlmIHRoZSBhdXRoIGFkYXB0ZXIgbmVlZHMgcHJlaWRlbnRpZmljYXRpb24uJyxcbiAgICAgICAgdHlwZTogT0JKRUNULFxuICAgICAgfSxcbiAgICAgIGNoYWxsZW5nZURhdGE6IHtcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgJ0NoYWxsZW5nZSBkYXRhIHBheWxvYWQsIGNhbiBiZSB1c2VkIHRvIHBvc3QgZGF0YSB0byBhdXRoIHByb3ZpZGVycyB0byBhdXRoIHByb3ZpZGVycyBpZiB0aGV5IG5lZWQgZGF0YSBmb3IgdGhlIHJlc3BvbnNlLicsXG4gICAgICAgIHR5cGU6IE9CSkVDVCxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIGNoYWxsZW5nZURhdGE6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdDaGFsbGVuZ2UgcmVzcG9uc2UgZnJvbSBjb25maWd1cmVkIGF1dGggYWRhcHRlcnMuJyxcbiAgICAgICAgdHlwZTogT0JKRUNULFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChpbnB1dCwgY29udGV4dCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgY29uc3QgeyByZXNwb25zZSB9ID0gYXdhaXQgdXNlcnNSb3V0ZXIuaGFuZGxlQ2hhbGxlbmdlKHtcbiAgICAgICAgICBib2R5OiBpbnB1dCxcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBpbmZvLFxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNoYWxsZW5nZU11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2hhbGxlbmdlTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oJ2NoYWxsZW5nZScsIGNoYWxsZW5nZU11dGF0aW9uLCB0cnVlLCB0cnVlKTtcbn07XG5cbmV4cG9ydCB7IGxvYWQgfTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQStCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFFL0IsTUFBTUEsV0FBVyxHQUFHLElBQUlDLG9CQUFXLEVBQUU7QUFFckMsTUFBTUMsSUFBSSxHQUFHQyxrQkFBa0IsSUFBSTtFQUNqQyxJQUFJQSxrQkFBa0IsQ0FBQ0Msb0JBQW9CLEVBQUU7SUFDM0M7RUFDRjtFQUVBLE1BQU1DLGNBQWMsR0FBRyxJQUFBQywwQ0FBNEIsRUFBQztJQUNsREMsSUFBSSxFQUFFLFFBQVE7SUFDZEMsV0FBVyxFQUFFLG1FQUFtRTtJQUNoRkMsV0FBVyxFQUFFO01BQ1hDLE1BQU0sRUFBRTtRQUNOQyxZQUFZLEVBQUUsbUVBQW1FO1FBQ2pGQyxJQUFJLEVBQUVULGtCQUFrQixDQUFDVSxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUNDO01BQ3BEO0lBQ0YsQ0FBQztJQUNEQyxZQUFZLEVBQUU7TUFD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