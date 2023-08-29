"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.transformTypes = void 0;
var _node = _interopRequireDefault(require("parse/node"));
var _graphqlRelay = require("graphql-relay");
var _filesMutations = require("../loaders/filesMutations");
var defaultGraphQLTypes = _interopRequireWildcard(require("../loaders/defaultGraphQLTypes"));
var objectsMutations = _interopRequireWildcard(require("../helpers/objectsMutations"));
var _deepcopy = _interopRequireDefault(require("deepcopy"));
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
const transformTypes = async (inputType, fields, {
  className,
  parseGraphQLSchema,
  req,
  originalFields
}) => {
  const {
    classGraphQLCreateType,
    classGraphQLUpdateType,
    config: {
      isCreateEnabled,
      isUpdateEnabled
    }
  } = parseGraphQLSchema.parseClassTypes[className];
  const parseClass = parseGraphQLSchema.parseClasses[className];
  if (fields) {
    const classGraphQLCreateTypeFields = isCreateEnabled && classGraphQLCreateType ? classGraphQLCreateType.getFields() : null;
    const classGraphQLUpdateTypeFields = isUpdateEnabled && classGraphQLUpdateType ? classGraphQLUpdateType.getFields() : null;
    const promises = Object.keys(fields).map(async field => {
      let inputTypeField;
      if (inputType === 'create' && classGraphQLCreateTypeFields) {
        inputTypeField = classGraphQLCreateTypeFields[field];
      } else if (classGraphQLUpdateTypeFields) {
        inputTypeField = classGraphQLUpdateTypeFields[field];
      }
      if (inputTypeField) {
        switch (true) {
          case inputTypeField.type === defaultGraphQLTypes.GEO_POINT_INPUT:
            if (fields[field] === null) {
              fields[field] = {
                __op: 'Delete'
              };
              break;
            }
            fields[field] = transformers.geoPoint(fields[field]);
            break;
          case inputTypeField.type === defaultGraphQLTypes.POLYGON_INPUT:
            if (fields[field] === null) {
              fields[field] = {
                __op: 'Delete'
              };
              break;
            }
            fields[field] = transformers.polygon(fields[field]);
            break;
          case inputTypeField.type === defaultGraphQLTypes.FILE_INPUT:
            // We need to use the originalFields to handle the file upload
            // since fields are a deepcopy and do not keep the file object
            fields[field] = await transformers.file(originalFields[field], req);
            break;
          case parseClass.fields[field].type === 'Relation':
            fields[field] = await transformers.relation(parseClass.fields[field].targetClass, field, fields[field], originalFields[field], parseGraphQLSchema, req);
            break;
          case parseClass.fields[field].type === 'Pointer':
            if (fields[field] === null) {
              fields[field] = {
                __op: 'Delete'
              };
              break;
            }
            fields[field] = await transformers.pointer(parseClass.fields[field].targetClass, field, fields[field], originalFields[field], parseGraphQLSchema, req);
            break;
          default:
            if (fields[field] === null) {
              fields[field] = {
                __op: 'Delete'
              };
              return;
            }
            break;
        }
      }
    });
    await Promise.all(promises);
    if (fields.ACL) fields.ACL = transformers.ACL(fields.ACL);
  }
  return fields;
};
exports.transformTypes = transformTypes;
const transformers = {
  file: async (input, {
    config
  }) => {
    if (input === null) {
      return {
        __op: 'Delete'
      };
    }
    const {
      file,
      upload
    } = input;
    if (upload) {
      const {
        fileInfo
      } = await (0, _filesMutations.handleUpload)(upload, config);
      return _objectSpread(_objectSpread({}, fileInfo), {}, {
        __type: 'File'
      });
    } else if (file && file.name) {
      return {
        name: file.name,
        __type: 'File',
        url: file.url
      };
    }
    throw new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, 'Invalid file upload.');
  },
  polygon: value => ({
    __type: 'Polygon',
    coordinates: value.map(geoPoint => [geoPoint.latitude, geoPoint.longitude])
  }),
  geoPoint: value => _objectSpread(_objectSpread({}, value), {}, {
    __type: 'GeoPoint'
  }),
  ACL: value => {
    const parseACL = {};
    if (value.public) {
      parseACL['*'] = {
        read: value.public.read,
        write: value.public.write
      };
    }
    if (value.users) {
      value.users.forEach(rule => {
        const globalIdObject = (0, _graphqlRelay.fromGlobalId)(rule.userId);
        if (globalIdObject.type === '_User') {
          rule.userId = globalIdObject.id;
        }
        parseACL[rule.userId] = {
          read: rule.read,
          write: rule.write
        };
      });
    }
    if (value.roles) {
      value.roles.forEach(rule => {
        parseACL[`role:${rule.roleName}`] = {
          read: rule.read,
          write: rule.write
        };
      });
    }
    return parseACL;
  },
  relation: async (targetClass, field, value, originalValue, parseGraphQLSchema, {
    config,
    auth,
    info
  }) => {
    if (Object.keys(value).length === 0) throw new _node.default.Error(_node.default.Error.INVALID_POINTER, `You need to provide at least one operation on the relation mutation of field ${field}`);
    const op = {
      __op: 'Batch',
      ops: []
    };
    let nestedObjectsToAdd = [];
    if (value.createAndAdd) {
      nestedObjectsToAdd = (await Promise.all(value.createAndAdd.map(async (input, i) => {
        const parseFields = await transformTypes('create', input, {
          className: targetClass,
          originalFields: originalValue.createAndAdd[i],
          parseGraphQLSchema,
          req: {
            config,
            auth,
            info
          }
        });
        return objectsMutations.createObject(targetClass, parseFields, config, auth, info);
      }))).map(object => ({
        __type: 'Pointer',
        className: targetClass,
        objectId: object.objectId
      }));
    }
    if (value.add || nestedObjectsToAdd.length > 0) {
      if (!value.add) value.add = [];
      value.add = value.add.map(input => {
        const globalIdObject = (0, _graphqlRelay.fromGlobalId)(input);
        if (globalIdObject.type === targetClass) {
          input = globalIdObject.id;
        }
        return {
          __type: 'Pointer',
          className: targetClass,
          objectId: input
        };
      });
      op.ops.push({
        __op: 'AddRelation',
        objects: [...value.add, ...nestedObjectsToAdd]
      });
    }
    if (value.remove) {
      op.ops.push({
        __op: 'RemoveRelation',
        objects: value.remove.map(input => {
          const globalIdObject = (0, _graphqlRelay.fromGlobalId)(input);
          if (globalIdObject.type === targetClass) {
            input = globalIdObject.id;
          }
          return {
            __type: 'Pointer',
            className: targetClass,
            objectId: input
          };
        })
      });
    }
    return op;
  },
  pointer: async (targetClass, field, value, originalValue, parseGraphQLSchema, {
    config,
    auth,
    info
  }) => {
    if (Object.keys(value).length > 1 || Object.keys(value).length === 0) throw new _node.default.Error(_node.default.Error.INVALID_POINTER, `You need to provide link OR createLink on the pointer mutation of field ${field}`);
    let nestedObjectToAdd;
    if (value.createAndLink) {
      const parseFields = await transformTypes('create', (0, _deepcopy.default)(value.createAndLink), {
        className: targetClass,
        parseGraphQLSchema,
        originalFields: originalValue.createAndLink,
        req: {
          config,
          auth,
          info
        }
      });
      nestedObjectToAdd = await objectsMutations.createObject(targetClass, parseFields, config, auth, info);
      return {
        __type: 'Pointer',
        className: targetClass,
        objectId: nestedObjectToAdd.objectId
      };
    }
    if (value.link) {
      let objectId = value.link;
      const globalIdObject = (0, _graphqlRelay.fromGlobalId)(objectId);
      if (globalIdObject.type === targetClass) {
        objectId = globalIdObject.id;
      }
      return {
        __type: 'Pointer',
        className: targetClass,
        objectId
      };
    }
  }
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJ0cmFuc2Zvcm1UeXBlcyIsImlucHV0VHlwZSIsImZpZWxkcyIsImNsYXNzTmFtZSIsInBhcnNlR3JhcGhRTFNjaGVtYSIsInJlcSIsIm9yaWdpbmFsRmllbGRzIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSIsImNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUiLCJjb25maWciLCJpc0NyZWF0ZUVuYWJsZWQiLCJpc1VwZGF0ZUVuYWJsZWQiLCJwYXJzZUNsYXNzVHlwZXMiLCJwYXJzZUNsYXNzIiwicGFyc2VDbGFzc2VzIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZUZpZWxkcyIsImdldEZpZWxkcyIsImNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVGaWVsZHMiLCJwcm9taXNlcyIsIk9iamVjdCIsImtleXMiLCJtYXAiLCJmaWVsZCIsImlucHV0VHlwZUZpZWxkIiwidHlwZSIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJHRU9fUE9JTlRfSU5QVVQiLCJfX29wIiwidHJhbnNmb3JtZXJzIiwiZ2VvUG9pbnQiLCJQT0xZR09OX0lOUFVUIiwicG9seWdvbiIsIkZJTEVfSU5QVVQiLCJmaWxlIiwicmVsYXRpb24iLCJ0YXJnZXRDbGFzcyIsInBvaW50ZXIiLCJQcm9taXNlIiwiYWxsIiwiQUNMIiwiaW5wdXQiLCJ1cGxvYWQiLCJmaWxlSW5mbyIsImhhbmRsZVVwbG9hZCIsIl9fdHlwZSIsIm5hbWUiLCJ1cmwiLCJQYXJzZSIsIkVycm9yIiwiRklMRV9TQVZFX0VSUk9SIiwidmFsdWUiLCJjb29yZGluYXRlcyIsImxhdGl0dWRlIiwibG9uZ2l0dWRlIiwicGFyc2VBQ0wiLCJwdWJsaWMiLCJyZWFkIiwid3JpdGUiLCJ1c2VycyIsImZvckVhY2giLCJydWxlIiwiZ2xvYmFsSWRPYmplY3QiLCJmcm9tR2xvYmFsSWQiLCJ1c2VySWQiLCJpZCIsInJvbGVzIiwicm9sZU5hbWUiLCJvcmlnaW5hbFZhbHVlIiwiYXV0aCIsImluZm8iLCJsZW5ndGgiLCJJTlZBTElEX1BPSU5URVIiLCJvcCIsIm9wcyIsIm5lc3RlZE9iamVjdHNUb0FkZCIsImNyZWF0ZUFuZEFkZCIsImkiLCJwYXJzZUZpZWxkcyIsIm9iamVjdHNNdXRhdGlvbnMiLCJjcmVhdGVPYmplY3QiLCJvYmplY3QiLCJvYmplY3RJZCIsImFkZCIsInB1c2giLCJvYmplY3RzIiwicmVtb3ZlIiwibmVzdGVkT2JqZWN0VG9BZGQiLCJjcmVhdGVBbmRMaW5rIiwiZGVlcGNvcHkiLCJsaW5rIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0dyYXBoUUwvdHJhbnNmb3JtZXJzL211dGF0aW9uLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7IGZyb21HbG9iYWxJZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IHsgaGFuZGxlVXBsb2FkIH0gZnJvbSAnLi4vbG9hZGVycy9maWxlc011dGF0aW9ucyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4uL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzTXV0YXRpb25zIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c011dGF0aW9ucyc7XG5pbXBvcnQgZGVlcGNvcHkgZnJvbSAnZGVlcGNvcHknO1xuXG5jb25zdCB0cmFuc2Zvcm1UeXBlcyA9IGFzeW5jIChcbiAgaW5wdXRUeXBlOiAnY3JlYXRlJyB8ICd1cGRhdGUnLFxuICBmaWVsZHMsXG4gIHsgY2xhc3NOYW1lLCBwYXJzZUdyYXBoUUxTY2hlbWEsIHJlcSwgb3JpZ2luYWxGaWVsZHMgfVxuKSA9PiB7XG4gIGNvbnN0IHtcbiAgICBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlLFxuICAgIGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUsXG4gICAgY29uZmlnOiB7IGlzQ3JlYXRlRW5hYmxlZCwgaXNVcGRhdGVFbmFibGVkIH0sXG4gIH0gPSBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW2NsYXNzTmFtZV07XG4gIGNvbnN0IHBhcnNlQ2xhc3MgPSBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzW2NsYXNzTmFtZV07XG4gIGlmIChmaWVsZHMpIHtcbiAgICBjb25zdCBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlRmllbGRzID1cbiAgICAgIGlzQ3JlYXRlRW5hYmxlZCAmJiBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlID8gY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZS5nZXRGaWVsZHMoKSA6IG51bGw7XG4gICAgY29uc3QgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZUZpZWxkcyA9XG4gICAgICBpc1VwZGF0ZUVuYWJsZWQgJiYgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSA/IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUuZ2V0RmllbGRzKCkgOiBudWxsO1xuICAgIGNvbnN0IHByb21pc2VzID0gT2JqZWN0LmtleXMoZmllbGRzKS5tYXAoYXN5bmMgZmllbGQgPT4ge1xuICAgICAgbGV0IGlucHV0VHlwZUZpZWxkO1xuICAgICAgaWYgKGlucHV0VHlwZSA9PT0gJ2NyZWF0ZScgJiYgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZUZpZWxkcykge1xuICAgICAgICBpbnB1dFR5cGVGaWVsZCA9IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGVGaWVsZHNbZmllbGRdO1xuICAgICAgfSBlbHNlIGlmIChjbGFzc0dyYXBoUUxVcGRhdGVUeXBlRmllbGRzKSB7XG4gICAgICAgIGlucHV0VHlwZUZpZWxkID0gY2xhc3NHcmFwaFFMVXBkYXRlVHlwZUZpZWxkc1tmaWVsZF07XG4gICAgICB9XG4gICAgICBpZiAoaW5wdXRUeXBlRmllbGQpIHtcbiAgICAgICAgc3dpdGNoICh0cnVlKSB7XG4gICAgICAgICAgY2FzZSBpbnB1dFR5cGVGaWVsZC50eXBlID09PSBkZWZhdWx0R3JhcGhRTFR5cGVzLkdFT19QT0lOVF9JTlBVVDpcbiAgICAgICAgICAgIGlmIChmaWVsZHNbZmllbGRdID09PSBudWxsKSB7XG4gICAgICAgICAgICAgIGZpZWxkc1tmaWVsZF0gPSB7IF9fb3A6ICdEZWxldGUnIH07XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSA9IHRyYW5zZm9ybWVycy5nZW9Qb2ludChmaWVsZHNbZmllbGRdKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgaW5wdXRUeXBlRmllbGQudHlwZSA9PT0gZGVmYXVsdEdyYXBoUUxUeXBlcy5QT0xZR09OX0lOUFVUOlxuICAgICAgICAgICAgaWYgKGZpZWxkc1tmaWVsZF0gPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSA9IHsgX19vcDogJ0RlbGV0ZScgfTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmaWVsZHNbZmllbGRdID0gdHJhbnNmb3JtZXJzLnBvbHlnb24oZmllbGRzW2ZpZWxkXSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIGlucHV0VHlwZUZpZWxkLnR5cGUgPT09IGRlZmF1bHRHcmFwaFFMVHlwZXMuRklMRV9JTlBVVDpcbiAgICAgICAgICAgIC8vIFdlIG5lZWQgdG8gdXNlIHRoZSBvcmlnaW5hbEZpZWxkcyB0byBoYW5kbGUgdGhlIGZpbGUgdXBsb2FkXG4gICAgICAgICAgICAvLyBzaW5jZSBmaWVsZHMgYXJlIGEgZGVlcGNvcHkgYW5kIGRvIG5vdCBrZWVwIHRoZSBmaWxlIG9iamVjdFxuICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSA9IGF3YWl0IHRyYW5zZm9ybWVycy5maWxlKG9yaWdpbmFsRmllbGRzW2ZpZWxkXSwgcmVxKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdSZWxhdGlvbic6XG4gICAgICAgICAgICBmaWVsZHNbZmllbGRdID0gYXdhaXQgdHJhbnNmb3JtZXJzLnJlbGF0aW9uKFxuICAgICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICAgIGZpZWxkLFxuICAgICAgICAgICAgICBmaWVsZHNbZmllbGRdLFxuICAgICAgICAgICAgICBvcmlnaW5hbEZpZWxkc1tmaWVsZF0sXG4gICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgICAgICAgcmVxXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1BvaW50ZXInOlxuICAgICAgICAgICAgaWYgKGZpZWxkc1tmaWVsZF0gPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSA9IHsgX19vcDogJ0RlbGV0ZScgfTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmaWVsZHNbZmllbGRdID0gYXdhaXQgdHJhbnNmb3JtZXJzLnBvaW50ZXIoXG4gICAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgICAgICAgZmllbGQsXG4gICAgICAgICAgICAgIGZpZWxkc1tmaWVsZF0sXG4gICAgICAgICAgICAgIG9yaWdpbmFsRmllbGRzW2ZpZWxkXSxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgICAgICByZXFcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgaWYgKGZpZWxkc1tmaWVsZF0gPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSA9IHsgX19vcDogJ0RlbGV0ZScgfTtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcbiAgICBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gICAgaWYgKGZpZWxkcy5BQ0wpIGZpZWxkcy5BQ0wgPSB0cmFuc2Zvcm1lcnMuQUNMKGZpZWxkcy5BQ0wpO1xuICB9XG4gIHJldHVybiBmaWVsZHM7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1lcnMgPSB7XG4gIGZpbGU6IGFzeW5jIChpbnB1dCwgeyBjb25maWcgfSkgPT4ge1xuICAgIGlmIChpbnB1dCA9PT0gbnVsbCkge1xuICAgICAgcmV0dXJuIHsgX19vcDogJ0RlbGV0ZScgfTtcbiAgICB9XG4gICAgY29uc3QgeyBmaWxlLCB1cGxvYWQgfSA9IGlucHV0O1xuICAgIGlmICh1cGxvYWQpIHtcbiAgICAgIGNvbnN0IHsgZmlsZUluZm8gfSA9IGF3YWl0IGhhbmRsZVVwbG9hZCh1cGxvYWQsIGNvbmZpZyk7XG4gICAgICByZXR1cm4geyAuLi5maWxlSW5mbywgX190eXBlOiAnRmlsZScgfTtcbiAgICB9IGVsc2UgaWYgKGZpbGUgJiYgZmlsZS5uYW1lKSB7XG4gICAgICByZXR1cm4geyBuYW1lOiBmaWxlLm5hbWUsIF9fdHlwZTogJ0ZpbGUnLCB1cmw6IGZpbGUudXJsIH07XG4gICAgfVxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsICdJbnZhbGlkIGZpbGUgdXBsb2FkLicpO1xuICB9LFxuICBwb2x5Z29uOiB2YWx1ZSA9PiAoe1xuICAgIF9fdHlwZTogJ1BvbHlnb24nLFxuICAgIGNvb3JkaW5hdGVzOiB2YWx1ZS5tYXAoZ2VvUG9pbnQgPT4gW2dlb1BvaW50LmxhdGl0dWRlLCBnZW9Qb2ludC5sb25naXR1ZGVdKSxcbiAgfSksXG4gIGdlb1BvaW50OiB2YWx1ZSA9PiAoe1xuICAgIC4uLnZhbHVlLFxuICAgIF9fdHlwZTogJ0dlb1BvaW50JyxcbiAgfSksXG4gIEFDTDogdmFsdWUgPT4ge1xuICAgIGNvbnN0IHBhcnNlQUNMID0ge307XG4gICAgaWYgKHZhbHVlLnB1YmxpYykge1xuICAgICAgcGFyc2VBQ0xbJyonXSA9IHtcbiAgICAgICAgcmVhZDogdmFsdWUucHVibGljLnJlYWQsXG4gICAgICAgIHdyaXRlOiB2YWx1ZS5wdWJsaWMud3JpdGUsXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAodmFsdWUudXNlcnMpIHtcbiAgICAgIHZhbHVlLnVzZXJzLmZvckVhY2gocnVsZSA9PiB7XG4gICAgICAgIGNvbnN0IGdsb2JhbElkT2JqZWN0ID0gZnJvbUdsb2JhbElkKHJ1bGUudXNlcklkKTtcbiAgICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09ICdfVXNlcicpIHtcbiAgICAgICAgICBydWxlLnVzZXJJZCA9IGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgICB9XG4gICAgICAgIHBhcnNlQUNMW3J1bGUudXNlcklkXSA9IHtcbiAgICAgICAgICByZWFkOiBydWxlLnJlYWQsXG4gICAgICAgICAgd3JpdGU6IHJ1bGUud3JpdGUsXG4gICAgICAgIH07XG4gICAgICB9KTtcbiAgICB9XG4gICAgaWYgKHZhbHVlLnJvbGVzKSB7XG4gICAgICB2YWx1ZS5yb2xlcy5mb3JFYWNoKHJ1bGUgPT4ge1xuICAgICAgICBwYXJzZUFDTFtgcm9sZToke3J1bGUucm9sZU5hbWV9YF0gPSB7XG4gICAgICAgICAgcmVhZDogcnVsZS5yZWFkLFxuICAgICAgICAgIHdyaXRlOiBydWxlLndyaXRlLFxuICAgICAgICB9O1xuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiBwYXJzZUFDTDtcbiAgfSxcbiAgcmVsYXRpb246IGFzeW5jIChcbiAgICB0YXJnZXRDbGFzcyxcbiAgICBmaWVsZCxcbiAgICB2YWx1ZSxcbiAgICBvcmlnaW5hbFZhbHVlLFxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICB7IGNvbmZpZywgYXV0aCwgaW5mbyB9XG4gICkgPT4ge1xuICAgIGlmIChPYmplY3Qua2V5cyh2YWx1ZSkubGVuZ3RoID09PSAwKVxuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1BPSU5URVIsXG4gICAgICAgIGBZb3UgbmVlZCB0byBwcm92aWRlIGF0IGxlYXN0IG9uZSBvcGVyYXRpb24gb24gdGhlIHJlbGF0aW9uIG11dGF0aW9uIG9mIGZpZWxkICR7ZmllbGR9YFxuICAgICAgKTtcblxuICAgIGNvbnN0IG9wID0ge1xuICAgICAgX19vcDogJ0JhdGNoJyxcbiAgICAgIG9wczogW10sXG4gICAgfTtcbiAgICBsZXQgbmVzdGVkT2JqZWN0c1RvQWRkID0gW107XG5cbiAgICBpZiAodmFsdWUuY3JlYXRlQW5kQWRkKSB7XG4gICAgICBuZXN0ZWRPYmplY3RzVG9BZGQgPSAoXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgICAgIHZhbHVlLmNyZWF0ZUFuZEFkZC5tYXAoYXN5bmMgKGlucHV0LCBpKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBwYXJzZUZpZWxkcyA9IGF3YWl0IHRyYW5zZm9ybVR5cGVzKCdjcmVhdGUnLCBpbnB1dCwge1xuICAgICAgICAgICAgICBjbGFzc05hbWU6IHRhcmdldENsYXNzLFxuICAgICAgICAgICAgICBvcmlnaW5hbEZpZWxkczogb3JpZ2luYWxWYWx1ZS5jcmVhdGVBbmRBZGRbaV0sXG4gICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgICAgICAgcmVxOiB7IGNvbmZpZywgYXV0aCwgaW5mbyB9LFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gb2JqZWN0c011dGF0aW9ucy5jcmVhdGVPYmplY3QodGFyZ2V0Q2xhc3MsIHBhcnNlRmllbGRzLCBjb25maWcsIGF1dGgsIGluZm8pO1xuICAgICAgICAgIH0pXG4gICAgICAgIClcbiAgICAgICkubWFwKG9iamVjdCA9PiAoe1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgb2JqZWN0SWQ6IG9iamVjdC5vYmplY3RJZCxcbiAgICAgIH0pKTtcbiAgICB9XG5cbiAgICBpZiAodmFsdWUuYWRkIHx8IG5lc3RlZE9iamVjdHNUb0FkZC5sZW5ndGggPiAwKSB7XG4gICAgICBpZiAoIXZhbHVlLmFkZCkgdmFsdWUuYWRkID0gW107XG4gICAgICB2YWx1ZS5hZGQgPSB2YWx1ZS5hZGQubWFwKGlucHV0ID0+IHtcbiAgICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQoaW5wdXQpO1xuICAgICAgICBpZiAoZ2xvYmFsSWRPYmplY3QudHlwZSA9PT0gdGFyZ2V0Q2xhc3MpIHtcbiAgICAgICAgICBpbnB1dCA9IGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgICBvYmplY3RJZDogaW5wdXQsXG4gICAgICAgIH07XG4gICAgICB9KTtcbiAgICAgIG9wLm9wcy5wdXNoKHtcbiAgICAgICAgX19vcDogJ0FkZFJlbGF0aW9uJyxcbiAgICAgICAgb2JqZWN0czogWy4uLnZhbHVlLmFkZCwgLi4ubmVzdGVkT2JqZWN0c1RvQWRkXSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmICh2YWx1ZS5yZW1vdmUpIHtcbiAgICAgIG9wLm9wcy5wdXNoKHtcbiAgICAgICAgX19vcDogJ1JlbW92ZVJlbGF0aW9uJyxcbiAgICAgICAgb2JqZWN0czogdmFsdWUucmVtb3ZlLm1hcChpbnB1dCA9PiB7XG4gICAgICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQoaW5wdXQpO1xuICAgICAgICAgIGlmIChnbG9iYWxJZE9iamVjdC50eXBlID09PSB0YXJnZXRDbGFzcykge1xuICAgICAgICAgICAgaW5wdXQgPSBnbG9iYWxJZE9iamVjdC5pZDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgICAgIG9iamVjdElkOiBpbnB1dCxcbiAgICAgICAgICB9O1xuICAgICAgICB9KSxcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gb3A7XG4gIH0sXG4gIHBvaW50ZXI6IGFzeW5jIChcbiAgICB0YXJnZXRDbGFzcyxcbiAgICBmaWVsZCxcbiAgICB2YWx1ZSxcbiAgICBvcmlnaW5hbFZhbHVlLFxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICB7IGNvbmZpZywgYXV0aCwgaW5mbyB9XG4gICkgPT4ge1xuICAgIGlmIChPYmplY3Qua2V5cyh2YWx1ZSkubGVuZ3RoID4gMSB8fCBPYmplY3Qua2V5cyh2YWx1ZSkubGVuZ3RoID09PSAwKVxuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1BPSU5URVIsXG4gICAgICAgIGBZb3UgbmVlZCB0byBwcm92aWRlIGxpbmsgT1IgY3JlYXRlTGluayBvbiB0aGUgcG9pbnRlciBtdXRhdGlvbiBvZiBmaWVsZCAke2ZpZWxkfWBcbiAgICAgICk7XG5cbiAgICBsZXQgbmVzdGVkT2JqZWN0VG9BZGQ7XG4gICAgaWYgKHZhbHVlLmNyZWF0ZUFuZExpbmspIHtcbiAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ2NyZWF0ZScsIGRlZXBjb3B5KHZhbHVlLmNyZWF0ZUFuZExpbmspLCB7XG4gICAgICAgIGNsYXNzTmFtZTogdGFyZ2V0Q2xhc3MsXG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgb3JpZ2luYWxGaWVsZHM6IG9yaWdpbmFsVmFsdWUuY3JlYXRlQW5kTGluayxcbiAgICAgICAgcmVxOiB7IGNvbmZpZywgYXV0aCwgaW5mbyB9LFxuICAgICAgfSk7XG4gICAgICBuZXN0ZWRPYmplY3RUb0FkZCA9IGF3YWl0IG9iamVjdHNNdXRhdGlvbnMuY3JlYXRlT2JqZWN0KFxuICAgICAgICB0YXJnZXRDbGFzcyxcbiAgICAgICAgcGFyc2VGaWVsZHMsXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgYXV0aCxcbiAgICAgICAgaW5mb1xuICAgICAgKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6IHRhcmdldENsYXNzLFxuICAgICAgICBvYmplY3RJZDogbmVzdGVkT2JqZWN0VG9BZGQub2JqZWN0SWQsXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAodmFsdWUubGluaykge1xuICAgICAgbGV0IG9iamVjdElkID0gdmFsdWUubGluaztcbiAgICAgIGNvbnN0IGdsb2JhbElkT2JqZWN0ID0gZnJvbUdsb2JhbElkKG9iamVjdElkKTtcbiAgICAgIGlmIChnbG9iYWxJZE9iamVjdC50eXBlID09PSB0YXJnZXRDbGFzcykge1xuICAgICAgICBvYmplY3RJZCA9IGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogdGFyZ2V0Q2xhc3MsXG4gICAgICAgIG9iamVjdElkLFxuICAgICAgfTtcbiAgICB9XG4gIH0sXG59O1xuXG5leHBvcnQgeyB0cmFuc2Zvcm1UeXBlcyB9O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBZ0M7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUVoQyxNQUFNQSxjQUFjLEdBQUcsT0FDckJDLFNBQThCLEVBQzlCQyxNQUFNLEVBQ047RUFBRUMsU0FBUztFQUFFQyxrQkFBa0I7RUFBRUMsR0FBRztFQUFFQztBQUFlLENBQUMsS0FDbkQ7RUFDSCxNQUFNO0lBQ0pDLHNCQUFzQjtJQUN0QkMsc0JBQXNCO0lBQ3RCQyxNQUFNLEVB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