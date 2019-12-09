"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = exports.deleteObject = exports.updateObject = exports.createObject = void 0;

var _graphql = require("graphql");

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

var _rest = _interopRequireDefault(require("../../rest"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

const createObject = async (className, fields, config, auth, info) => {
  if (!fields) {
    fields = {};
  }

  return (await _rest.default.create(config, auth, className, fields, info.clientSDK)).response;
};

exports.createObject = createObject;

const updateObject = async (className, objectId, fields, config, auth, info) => {
  if (!fields) {
    fields = {};
  }

  return (await _rest.default.update(config, auth, className, {
    objectId
  }, fields, info.clientSDK)).response;
};

exports.updateObject = updateObject;

const deleteObject = async (className, objectId, config, auth, info) => {
  await _rest.default.del(config, auth, className, objectId, info.clientSDK);
  return true;
};

exports.deleteObject = deleteObject;

const load = parseGraphQLSchema => {
  parseGraphQLSchema.addGraphQLMutation('create', {
    description: 'The create mutation can be used to create a new object of a certain class.',
    args: {
      className: defaultGraphQLTypes.CLASS_NAME_ATT,
      fields: defaultGraphQLTypes.FIELDS_ATT
    },
    type: new _graphql.GraphQLNonNull(defaultGraphQLTypes.CREATE_RESULT),

    async resolve(_source, args, context) {
      try {
        const {
          className,
          fields
        } = args;
        const {
          config,
          auth,
          info
        } = context;
        return await createObject(className, fields, config, auth, info);
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }

  }, true, true);
  parseGraphQLSchema.addGraphQLMutation('update', {
    description: 'The update mutation can be used to update an object of a certain class.',
    args: {
      className: defaultGraphQLTypes.CLASS_NAME_ATT,
      objectId: defaultGraphQLTypes.OBJECT_ID_ATT,
      fields: defaultGraphQLTypes.FIELDS_ATT
    },
    type: new _graphql.GraphQLNonNull(defaultGraphQLTypes.UPDATE_RESULT),

    async resolve(_source, args, context) {
      try {
        const {
          className,
          objectId,
          fields
        } = args;
        const {
          config,
          auth,
          info
        } = context;
        return await updateObject(className, objectId, fields, config, auth, info);
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }

  }, true, true);
  parseGraphQLSchema.addGraphQLMutation('delete', {
    description: 'The delete mutation can be used to delete an object of a certain class.',
    args: {
      className: defaultGraphQLTypes.CLASS_NAME_ATT,
      objectId: defaultGraphQLTypes.OBJECT_ID_ATT
    },
    type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean),

    async resolve(_source, args, context) {
      try {
        const {
          className,
          objectId
        } = args;
        const {
          config,
          auth,
          info
        } = context;
        return await deleteObject(className, objectId, config, auth, info);
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }

  }, true, true);
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvb2JqZWN0c011dGF0aW9ucy5qcyJdLCJuYW1lcyI6WyJjcmVhdGVPYmplY3QiLCJjbGFzc05hbWUiLCJmaWVsZHMiLCJjb25maWciLCJhdXRoIiwiaW5mbyIsInJlc3QiLCJjcmVhdGUiLCJjbGllbnRTREsiLCJyZXNwb25zZSIsInVwZGF0ZU9iamVjdCIsIm9iamVjdElkIiwidXBkYXRlIiwiZGVsZXRlT2JqZWN0IiwiZGVsIiwibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsImFkZEdyYXBoUUxNdXRhdGlvbiIsImRlc2NyaXB0aW9uIiwiYXJncyIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJDTEFTU19OQU1FX0FUVCIsIkZJRUxEU19BVFQiLCJ0eXBlIiwiR3JhcGhRTE5vbk51bGwiLCJDUkVBVEVfUkVTVUxUIiwicmVzb2x2ZSIsIl9zb3VyY2UiLCJjb250ZXh0IiwiZSIsImhhbmRsZUVycm9yIiwiT0JKRUNUX0lEX0FUVCIsIlVQREFURV9SRVNVTFQiLCJHcmFwaFFMQm9vbGVhbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOzs7Ozs7OztBQUVBLE1BQU1BLFlBQVksR0FBRyxPQUFPQyxTQUFQLEVBQWtCQyxNQUFsQixFQUEwQkMsTUFBMUIsRUFBa0NDLElBQWxDLEVBQXdDQyxJQUF4QyxLQUFpRDtBQUNwRSxNQUFJLENBQUNILE1BQUwsRUFBYTtBQUNYQSxJQUFBQSxNQUFNLEdBQUcsRUFBVDtBQUNEOztBQUVELFNBQU8sQ0FBQyxNQUFNSSxjQUFLQyxNQUFMLENBQVlKLE1BQVosRUFBb0JDLElBQXBCLEVBQTBCSCxTQUExQixFQUFxQ0MsTUFBckMsRUFBNkNHLElBQUksQ0FBQ0csU0FBbEQsQ0FBUCxFQUNKQyxRQURIO0FBRUQsQ0FQRDs7OztBQVNBLE1BQU1DLFlBQVksR0FBRyxPQUNuQlQsU0FEbUIsRUFFbkJVLFFBRm1CLEVBR25CVCxNQUhtQixFQUluQkMsTUFKbUIs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LENBQXpCO0FBUUQsT0FaRCxDQVlFLE9BQU93QixDQUFQLEVBQVU7QUFDVmIsUUFBQUEsa0JBQWtCLENBQUNjLFdBQW5CLENBQStCRCxDQUEvQjtBQUNEO0FBQ0Y7O0FBekJILEdBRkYsRUE2QkUsSUE3QkYsRUE4QkUsSUE5QkY7QUFpQ0FiLEVBQUFBLGtCQUFrQixDQUFDQyxrQkFBbkIsQ0FDRSxRQURGLEVBRUU7QUFDRUMsSUFBQUEsV0FBVyxFQUNULHlFQUZKO0FBR0VDLElBQUFBLElBQUksRUFBRTtBQUNKbEIsTUFBQUEsU0FBUyxFQUFFbUIsbUJBQW1CLENBQUNDLGNBRDNCO0FBRUpWLE1BQUFBLFFBQVEsRUFBRVMsbUJBQW1CLENBQUNXO0FBRjFCLEtBSFI7QUFPRVIsSUFBQUEsSUFBSSxFQUFFLElBQUlDLHVCQUFKLENBQW1CUyx1QkFBbkIsQ0FQUjs7QUFRRSxVQUFNUCxPQUFOLENBQWNDLE9BQWQsRUFBdUJSLElBQXZCLEVBQTZCUyxPQUE3QixFQUFzQztBQUNwQyxVQUFJO0FBQ0YsY0FBTTtBQUFFM0IsVUFBQUEsU0FBRjtBQUFhVSxVQUFBQTtBQUFiLFlBQTBCUSxJQUFoQztBQUNBLGNBQU07QUFBRWhCLFVBQUFBLE1BQUY7QUFBVUMsVUFBQUEsSUFBVjtBQUFnQkMsVUFBQUE7QUFBaEIsWUFBeUJ1QixPQUEvQjtBQUVBLGVBQU8sTUFBTWYsWUFBWSxDQUFDWixTQUFELEVBQVlVLFFBQVosRUFBc0JSLE1BQXRCLEVBQThCQyxJQUE5QixFQUFvQ0MsSUFBcEMsQ0FBekI7QUFDRCxPQUxELENBS0UsT0FBT3dCLENBQVAsRUFBVTtBQUNWYixRQUFBQSxrQkFBa0IsQ0FBQ2MsV0FBbkIsQ0FBK0JELENBQS9CO0FBQ0Q7QUFDRjs7QUFqQkgsR0FGRixFQXFCRSxJQXJCRixFQXNCRSxJQXRCRjtBQXdCRCxDQW5GRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEdyYXBoUUxOb25OdWxsLCBHcmFwaFFMQm9vbGVhbiB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0IHJlc3QgZnJvbSAnLi4vLi4vcmVzdCc7XG5cbmNvbnN0IGNyZWF0ZU9iamVjdCA9IGFzeW5jIChjbGFzc05hbWUsIGZpZWxkcywgY29uZmlnLCBhdXRoLCBpbmZvKSA9PiB7XG4gIGlmICghZmllbGRzKSB7XG4gICAgZmllbGRzID0ge307XG4gIH1cblxuICByZXR1cm4gKGF3YWl0IHJlc3QuY3JlYXRlKGNvbmZpZywgYXV0aCwgY2xhc3NOYW1lLCBmaWVsZHMsIGluZm8uY2xpZW50U0RLKSlcbiAgICAucmVzcG9uc2U7XG59O1xuXG5jb25zdCB1cGRhdGVPYmplY3QgPSBhc3luYyAoXG4gIGNsYXNzTmFtZSxcbiAgb2JqZWN0SWQsXG4gIGZpZWxkcyxcbiAgY29uZmlnLFxuICBhdXRoLFxuICBpbmZvXG4pID0+IHtcbiAgaWYgKCFmaWVsZHMpIHtcbiAgICBmaWVsZHMgPSB7fTtcbiAgfVxuXG4gIHJldHVybiAoYXdhaXQgcmVzdC51cGRhdGUoXG4gICAgY29uZmlnLFxuICAgIGF1dGgsXG4gICAgY2xhc3NOYW1lLFxuICAgIHsgb2JqZWN0SWQgfSxcbiAgICBmaWVsZHMsXG4gICAgaW5mby5jbGllbnRTREtcbiAgKSkucmVzcG9uc2U7XG59O1xuXG5jb25zdCBkZWxldGVPYmplY3QgPSBhc3luYyAoY2xhc3NOYW1lLCBvYmplY3RJZCwgY29uZmlnLCBhdXRoLCBpbmZvKSA9PiB7XG4gIGF3YWl0IHJlc3QuZGVsKGNvbmZpZywgYXV0aCwgY2xhc3NOYW1lLCBvYmplY3RJZCwgaW5mby5jbGllbnRTREspO1xuICByZXR1cm4gdHJ1ZTtcbn07XG5cbmNvbnN0IGxvYWQgPSBwYXJzZUdyYXBoUUxTY2hlbWEgPT4ge1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKFxuICAgICdjcmVhdGUnLFxuICAgIHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhlIGNyZWF0ZSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBjcmVhdGUgYSBuZXcgb2JqZWN0IG9mIGEgY2VydGFpbiBjbGFzcy4nLFxuICAgICAgYXJnczoge1xuICAgICAgICBjbGFzc05hbWU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuQ0xBU1NfTkFNRV9BVFQsXG4gICAgICAgIGZpZWxkczogZGVmYXVsdEdyYXBoUUxUeXBlcy5GSUVMRFNfQVRULFxuICAgICAgfSxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChkZWZhdWx0R3JhcGhRTFR5cGVzLkNSRUFURV9SRVNVTFQpLFxuICAgICAgYXN5bmMgcmVzb2x2ZShfc291cmNlLCBhcmdzLCBjb250ZXh0KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgeyBjbGFzc05hbWUsIGZpZWxkcyB9ID0gYXJncztcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICAgIHJldHVybiBhd2FpdCBjcmVhdGVPYmplY3QoY2xhc3NOYW1lLCBmaWVsZHMsIGNvbmZpZywgYXV0aCwgaW5mbyk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKFxuICAgICd1cGRhdGUnLFxuICAgIHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhlIHVwZGF0ZSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byB1cGRhdGUgYW4gb2JqZWN0IG9mIGEgY2VydGFpbiBjbGFzcy4nLFxuICAgICAgYXJnczoge1xuICAgICAgICBjbGFzc05hbWU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuQ0xBU1NfTkFNRV9BVFQsXG4gICAgICAgIG9iamVjdElkOiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVF9JRF9BVFQsXG4gICAgICAgIGZpZWxkczogZGVmYXVsdEdyYXBoUUxUeXBlcy5GSUVMRFNfQVRULFxuICAgICAgfSxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChkZWZhdWx0R3JhcGhRTFR5cGVzLlVQREFURV9SRVNVTFQpLFxuICAgICAgYXN5bmMgcmVzb2x2ZShfc291cmNlLCBhcmdzLCBjb250ZXh0KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgeyBjbGFzc05hbWUsIG9iamVjdElkLCBmaWVsZHMgfSA9IGFyZ3M7XG4gICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgICByZXR1cm4gYXdhaXQgdXBkYXRlT2JqZWN0KFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgb2JqZWN0SWQsXG4gICAgICAgICAgICBmaWVsZHMsXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mb1xuICAgICAgICAgICk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKFxuICAgICdkZWxldGUnLFxuICAgIHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhlIGRlbGV0ZSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBkZWxldGUgYW4gb2JqZWN0IG9mIGEgY2VydGFpbiBjbGFzcy4nLFxuICAgICAgYXJnczoge1xuICAgICAgICBjbGFzc05hbWU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuQ0xBU1NfTkFNRV9BVFQsXG4gICAgICAgIG9iamVjdElkOiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVF9JRF9BVFQsXG4gICAgICB9LFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICAgIGFzeW5jIHJlc29sdmUoX3NvdXJjZSwgYXJncywgY29udGV4dCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHsgY2xhc3NOYW1lLCBvYmplY3RJZCB9ID0gYXJncztcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICAgIHJldHVybiBhd2FpdCBkZWxldGVPYmplY3QoY2xhc3NOYW1lLCBvYmplY3RJZCwgY29uZmlnLCBhdXRoLCBpbmZvKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9LFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xufTtcblxuZXhwb3J0IHsgY3JlYXRlT2JqZWN0LCB1cGRhdGVPYmplY3QsIGRlbGV0ZU9iamVjdCwgbG9hZCB9O1xuIl19