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
            // fields are a deepcopy, but we can't deepcopy a stream so
            // we use the original fields from the graphql request
            fields[field] = await transformers.file(originalFields[field], req);
            break;
          case parseClass.fields[field].type === 'Relation':
            fields[field] = await transformers.relation(parseClass.fields[field].targetClass, field, fields[field], parseGraphQLSchema, req);
            break;
          case parseClass.fields[field].type === 'Pointer':
            if (fields[field] === null) {
              fields[field] = {
                __op: 'Delete'
              };
              break;
            }
            fields[field] = await transformers.pointer(parseClass.fields[field].targetClass, field, fields[field], parseGraphQLSchema, req);
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
  relation: async (targetClass, field, value, parseGraphQLSchema, {
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
      nestedObjectsToAdd = (await Promise.all(value.createAndAdd.map(async input => {
        const parseFields = await transformTypes('create', (0, _deepcopy.default)(input), {
          className: targetClass,
          parseGraphQLSchema,
          originalFields: input || {},
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
  pointer: async (targetClass, field, value, parseGraphQLSchema, {
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
        originalFields: value.createAndLink || {},
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJ0cmFuc2Zvcm1UeXBlcyIsImlucHV0VHlwZSIsImZpZWxkcyIsImNsYXNzTmFtZSIsInBhcnNlR3JhcGhRTFNjaGVtYSIsInJlcSIsIm9yaWdpbmFsRmllbGRzIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSIsImNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUiLCJjb25maWciLCJpc0NyZWF0ZUVuYWJsZWQiLCJpc1VwZGF0ZUVuYWJsZWQiLCJwYXJzZUNsYXNzVHlwZXMiLCJwYXJzZUNsYXNzIiwicGFyc2VDbGFzc2VzIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZUZpZWxkcyIsImdldEZpZWxkcyIsImNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVGaWVsZHMiLCJwcm9taXNlcyIsIk9iamVjdCIsImtleXMiLCJtYXAiLCJmaWVsZCIsImlucHV0VHlwZUZpZWxkIiwidHlwZSIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJHRU9fUE9JTlRfSU5QVVQiLCJfX29wIiwidHJhbnNmb3JtZXJzIiwiZ2VvUG9pbnQiLCJQT0xZR09OX0lOUFVUIiwicG9seWdvbiIsIkZJTEVfSU5QVVQiLCJmaWxlIiwicmVsYXRpb24iLCJ0YXJnZXRDbGFzcyIsInBvaW50ZXIiLCJQcm9taXNlIiwiYWxsIiwiQUNMIiwiaW5wdXQiLCJ1cGxvYWQiLCJmaWxlSW5mbyIsImhhbmRsZVVwbG9hZCIsIl9fdHlwZSIsIm5hbWUiLCJ1cmwiLCJQYXJzZSIsIkVycm9yIiwiRklMRV9TQVZFX0VSUk9SIiwidmFsdWUiLCJjb29yZGluYXRlcyIsImxhdGl0dWRlIiwibG9uZ2l0dWRlIiwicGFyc2VBQ0wiLCJwdWJsaWMiLCJyZWFkIiwid3JpdGUiLCJ1c2VycyIsImZvckVhY2giLCJydWxlIiwiZ2xvYmFsSWRPYmplY3QiLCJmcm9tR2xvYmFsSWQiLCJ1c2VySWQiLCJpZCIsInJvbGVzIiwicm9sZU5hbWUiLCJhdXRoIiwiaW5mbyIsImxlbmd0aCIsIklOVkFMSURfUE9JTlRFUiIsIm9wIiwib3BzIiwibmVzdGVkT2JqZWN0c1RvQWRkIiwiY3JlYXRlQW5kQWRkIiwicGFyc2VGaWVsZHMiLCJkZWVwY29weSIsIm9iamVjdHNNdXRhdGlvbnMiLCJjcmVhdGVPYmplY3QiLCJvYmplY3QiLCJvYmplY3RJZCIsImFkZCIsInB1c2giLCJvYmplY3RzIiwicmVtb3ZlIiwibmVzdGVkT2JqZWN0VG9BZGQiLCJjcmVhdGVBbmRMaW5rIiwibGluayJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML3RyYW5zZm9ybWVycy9tdXRhdGlvbi5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgeyBmcm9tR2xvYmFsSWQgfSBmcm9tICdncmFwaHFsLXJlbGF5JztcbmltcG9ydCB7IGhhbmRsZVVwbG9hZCB9IGZyb20gJy4uL2xvYWRlcnMvZmlsZXNNdXRhdGlvbnMnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuLi9sb2FkZXJzL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0ICogYXMgb2JqZWN0c011dGF0aW9ucyBmcm9tICcuLi9oZWxwZXJzL29iamVjdHNNdXRhdGlvbnMnO1xuaW1wb3J0IGRlZXBjb3B5IGZyb20gJ2RlZXBjb3B5JztcblxuY29uc3QgdHJhbnNmb3JtVHlwZXMgPSBhc3luYyAoXG4gIGlucHV0VHlwZTogJ2NyZWF0ZScgfCAndXBkYXRlJyxcbiAgZmllbGRzLFxuICB7IGNsYXNzTmFtZSwgcGFyc2VHcmFwaFFMU2NoZW1hLCByZXEsIG9yaWdpbmFsRmllbGRzIH1cbikgPT4ge1xuICBjb25zdCB7XG4gICAgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlLFxuICAgIGNvbmZpZzogeyBpc0NyZWF0ZUVuYWJsZWQsIGlzVXBkYXRlRW5hYmxlZCB9LFxuICB9ID0gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tjbGFzc05hbWVdO1xuICBjb25zdCBwYXJzZUNsYXNzID0gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1tjbGFzc05hbWVdO1xuICBpZiAoZmllbGRzKSB7XG4gICAgY29uc3QgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZUZpZWxkcyA9XG4gICAgICBpc0NyZWF0ZUVuYWJsZWQgJiYgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSA/IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUuZ2V0RmllbGRzKCkgOiBudWxsO1xuICAgIGNvbnN0IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVGaWVsZHMgPVxuICAgICAgaXNVcGRhdGVFbmFibGVkICYmIGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUgPyBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlLmdldEZpZWxkcygpIDogbnVsbDtcbiAgICBjb25zdCBwcm9taXNlcyA9IE9iamVjdC5rZXlzKGZpZWxkcykubWFwKGFzeW5jIGZpZWxkID0+IHtcbiAgICAgIGxldCBpbnB1dFR5cGVGaWVsZDtcbiAgICAgIGlmIChpbnB1dFR5cGUgPT09ICdjcmVhdGUnICYmIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGVGaWVsZHMpIHtcbiAgICAgICAgaW5wdXRUeXBlRmllbGQgPSBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlRmllbGRzW2ZpZWxkXTtcbiAgICAgIH0gZWxzZSBpZiAoY2xhc3NHcmFwaFFMVXBkYXRlVHlwZUZpZWxkcykge1xuICAgICAgICBpbnB1dFR5cGVGaWVsZCA9IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVGaWVsZHNbZmllbGRdO1xuICAgICAgfVxuICAgICAgaWYgKGlucHV0VHlwZUZpZWxkKSB7XG4gICAgICAgIHN3aXRjaCAodHJ1ZSkge1xuICAgICAgICAgIGNhc2UgaW5wdXRUeXBlRmllbGQudHlwZSA9PT0gZGVmYXVsdEdyYXBoUUxUeXBlcy5HRU9fUE9JTlRfSU5QVVQ6XG4gICAgICAgICAgICBpZiAoZmllbGRzW2ZpZWxkXSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICBmaWVsZHNbZmllbGRdID0geyBfX29wOiAnRGVsZXRlJyB9O1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZpZWxkc1tmaWVsZF0gPSB0cmFuc2Zvcm1lcnMuZ2VvUG9pbnQoZmllbGRzW2ZpZWxkXSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIGlucHV0VHlwZUZpZWxkLnR5cGUgPT09IGRlZmF1bHRHcmFwaFFMVHlwZXMuUE9MWUdPTl9JTlBVVDpcbiAgICAgICAgICAgIGlmIChmaWVsZHNbZmllbGRdID09PSBudWxsKSB7XG4gICAgICAgICAgICAgIGZpZWxkc1tmaWVsZF0gPSB7IF9fb3A6ICdEZWxldGUnIH07XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSA9IHRyYW5zZm9ybWVycy5wb2x5Z29uKGZpZWxkc1tmaWVsZF0pO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSBpbnB1dFR5cGVGaWVsZC50eXBlID09PSBkZWZhdWx0R3JhcGhRTFR5cGVzLkZJTEVfSU5QVVQ6XG4gICAgICAgICAgICAvLyBmaWVsZHMgYXJlIGEgZGVlcGNvcHksIGJ1dCB3ZSBjYW4ndCBkZWVwY29weSBhIHN0cmVhbSBzb1xuICAgICAgICAgICAgLy8gd2UgdXNlIHRoZSBvcmlnaW5hbCBmaWVsZHMgZnJvbSB0aGUgZ3JhcGhxbCByZXF1ZXN0XG4gICAgICAgICAgICBmaWVsZHNbZmllbGRdID0gYXdhaXQgdHJhbnNmb3JtZXJzLmZpbGUob3JpZ2luYWxGaWVsZHNbZmllbGRdLCByZXEpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1JlbGF0aW9uJzpcbiAgICAgICAgICAgIGZpZWxkc1tmaWVsZF0gPSBhd2FpdCB0cmFuc2Zvcm1lcnMucmVsYXRpb24oXG4gICAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgICAgICAgZmllbGQsXG4gICAgICAgICAgICAgIGZpZWxkc1tmaWVsZF0sXG4gICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgICAgICAgcmVxXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1BvaW50ZXInOlxuICAgICAgICAgICAgaWYgKGZpZWxkc1tmaWVsZF0gPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSA9IHsgX19vcDogJ0RlbGV0ZScgfTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmaWVsZHNbZmllbGRdID0gYXdhaXQgdHJhbnNmb3JtZXJzLnBvaW50ZXIoXG4gICAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgICAgICAgZmllbGQsXG4gICAgICAgICAgICAgIGZpZWxkc1tmaWVsZF0sXG4gICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgICAgICAgcmVxXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIGlmIChmaWVsZHNbZmllbGRdID09PSBudWxsKSB7XG4gICAgICAgICAgICAgIGZpZWxkc1tmaWVsZF0gPSB7IF9fb3A6ICdEZWxldGUnIH07XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICAgIGlmIChmaWVsZHMuQUNMKSBmaWVsZHMuQUNMID0gdHJhbnNmb3JtZXJzLkFDTChmaWVsZHMuQUNMKTtcbiAgfVxuICByZXR1cm4gZmllbGRzO1xufTtcblxuY29uc3QgdHJhbnNmb3JtZXJzID0ge1xuICBmaWxlOiBhc3luYyAoaW5wdXQsIHsgY29uZmlnIH0pID0+IHtcbiAgICBpZiAoaW5wdXQgPT09IG51bGwpIHtcbiAgICAgIHJldHVybiB7IF9fb3A6ICdEZWxldGUnIH07XG4gICAgfVxuICAgIGNvbnN0IHsgZmlsZSwgdXBsb2FkIH0gPSBpbnB1dDtcbiAgICBpZiAodXBsb2FkKSB7XG4gICAgICBjb25zdCB7IGZpbGVJbmZvIH0gPSBhd2FpdCBoYW5kbGVVcGxvYWQodXBsb2FkLCBjb25maWcpO1xuICAgICAgcmV0dXJuIHsgLi4uZmlsZUluZm8sIF9fdHlwZTogJ0ZpbGUnIH07XG4gICAgfSBlbHNlIGlmIChmaWxlICYmIGZpbGUubmFtZSkge1xuICAgICAgcmV0dXJuIHsgbmFtZTogZmlsZS5uYW1lLCBfX3R5cGU6ICdGaWxlJywgdXJsOiBmaWxlLnVybCB9O1xuICAgIH1cbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLCAnSW52YWxpZCBmaWxlIHVwbG9hZC4nKTtcbiAgfSxcbiAgcG9seWdvbjogdmFsdWUgPT4gKHtcbiAgICBfX3R5cGU6ICdQb2x5Z29uJyxcbiAgICBjb29yZGluYXRlczogdmFsdWUubWFwKGdlb1BvaW50ID0+IFtnZW9Qb2ludC5sYXRpdHVkZSwgZ2VvUG9pbnQubG9uZ2l0dWRlXSksXG4gIH0pLFxuICBnZW9Qb2ludDogdmFsdWUgPT4gKHtcbiAgICAuLi52YWx1ZSxcbiAgICBfX3R5cGU6ICdHZW9Qb2ludCcsXG4gIH0pLFxuICBBQ0w6IHZhbHVlID0+IHtcbiAgICBjb25zdCBwYXJzZUFDTCA9IHt9O1xuICAgIGlmICh2YWx1ZS5wdWJsaWMpIHtcbiAgICAgIHBhcnNlQUNMWycqJ10gPSB7XG4gICAgICAgIHJlYWQ6IHZhbHVlLnB1YmxpYy5yZWFkLFxuICAgICAgICB3cml0ZTogdmFsdWUucHVibGljLndyaXRlLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKHZhbHVlLnVzZXJzKSB7XG4gICAgICB2YWx1ZS51c2Vycy5mb3JFYWNoKHJ1bGUgPT4ge1xuICAgICAgICBjb25zdCBnbG9iYWxJZE9iamVjdCA9IGZyb21HbG9iYWxJZChydWxlLnVzZXJJZCk7XG4gICAgICAgIGlmIChnbG9iYWxJZE9iamVjdC50eXBlID09PSAnX1VzZXInKSB7XG4gICAgICAgICAgcnVsZS51c2VySWQgPSBnbG9iYWxJZE9iamVjdC5pZDtcbiAgICAgICAgfVxuICAgICAgICBwYXJzZUFDTFtydWxlLnVzZXJJZF0gPSB7XG4gICAgICAgICAgcmVhZDogcnVsZS5yZWFkLFxuICAgICAgICAgIHdyaXRlOiBydWxlLndyaXRlLFxuICAgICAgICB9O1xuICAgICAgfSk7XG4gICAgfVxuICAgIGlmICh2YWx1ZS5yb2xlcykge1xuICAgICAgdmFsdWUucm9sZXMuZm9yRWFjaChydWxlID0+IHtcbiAgICAgICAgcGFyc2VBQ0xbYHJvbGU6JHtydWxlLnJvbGVOYW1lfWBdID0ge1xuICAgICAgICAgIHJlYWQ6IHJ1bGUucmVhZCxcbiAgICAgICAgICB3cml0ZTogcnVsZS53cml0ZSxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gcGFyc2VBQ0w7XG4gIH0sXG4gIHJlbGF0aW9uOiBhc3luYyAodGFyZ2V0Q2xhc3MsIGZpZWxkLCB2YWx1ZSwgcGFyc2VHcmFwaFFMU2NoZW1hLCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9KSA9PiB7XG4gICAgaWYgKE9iamVjdC5rZXlzKHZhbHVlKS5sZW5ndGggPT09IDApXG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUE9JTlRFUixcbiAgICAgICAgYFlvdSBuZWVkIHRvIHByb3ZpZGUgYXQgbGVhc3Qgb25lIG9wZXJhdGlvbiBvbiB0aGUgcmVsYXRpb24gbXV0YXRpb24gb2YgZmllbGQgJHtmaWVsZH1gXG4gICAgICApO1xuXG4gICAgY29uc3Qgb3AgPSB7XG4gICAgICBfX29wOiAnQmF0Y2gnLFxuICAgICAgb3BzOiBbXSxcbiAgICB9O1xuICAgIGxldCBuZXN0ZWRPYmplY3RzVG9BZGQgPSBbXTtcblxuICAgIGlmICh2YWx1ZS5jcmVhdGVBbmRBZGQpIHtcbiAgICAgIG5lc3RlZE9iamVjdHNUb0FkZCA9IChcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICAgICAgdmFsdWUuY3JlYXRlQW5kQWRkLm1hcChhc3luYyBpbnB1dCA9PiB7XG4gICAgICAgICAgICBjb25zdCBwYXJzZUZpZWxkcyA9IGF3YWl0IHRyYW5zZm9ybVR5cGVzKCdjcmVhdGUnLCBkZWVwY29weShpbnB1dCksIHtcbiAgICAgICAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgICAgICBvcmlnaW5hbEZpZWxkczogaW5wdXQgfHwge30sXG4gICAgICAgICAgICAgIHJlcTogeyBjb25maWcsIGF1dGgsIGluZm8gfSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIG9iamVjdHNNdXRhdGlvbnMuY3JlYXRlT2JqZWN0KHRhcmdldENsYXNzLCBwYXJzZUZpZWxkcywgY29uZmlnLCBhdXRoLCBpbmZvKTtcbiAgICAgICAgICB9KVxuICAgICAgICApXG4gICAgICApLm1hcChvYmplY3QgPT4gKHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogdGFyZ2V0Q2xhc3MsXG4gICAgICAgIG9iamVjdElkOiBvYmplY3Qub2JqZWN0SWQsXG4gICAgICB9KSk7XG4gICAgfVxuXG4gICAgaWYgKHZhbHVlLmFkZCB8fCBuZXN0ZWRPYmplY3RzVG9BZGQubGVuZ3RoID4gMCkge1xuICAgICAgaWYgKCF2YWx1ZS5hZGQpIHZhbHVlLmFkZCA9IFtdO1xuICAgICAgdmFsdWUuYWRkID0gdmFsdWUuYWRkLm1hcChpbnB1dCA9PiB7XG4gICAgICAgIGNvbnN0IGdsb2JhbElkT2JqZWN0ID0gZnJvbUdsb2JhbElkKGlucHV0KTtcbiAgICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IHRhcmdldENsYXNzKSB7XG4gICAgICAgICAgaW5wdXQgPSBnbG9iYWxJZE9iamVjdC5pZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgIGNsYXNzTmFtZTogdGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgb2JqZWN0SWQ6IGlucHV0LFxuICAgICAgICB9O1xuICAgICAgfSk7XG4gICAgICBvcC5vcHMucHVzaCh7XG4gICAgICAgIF9fb3A6ICdBZGRSZWxhdGlvbicsXG4gICAgICAgIG9iamVjdHM6IFsuLi52YWx1ZS5hZGQsIC4uLm5lc3RlZE9iamVjdHNUb0FkZF0sXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBpZiAodmFsdWUucmVtb3ZlKSB7XG4gICAgICBvcC5vcHMucHVzaCh7XG4gICAgICAgIF9fb3A6ICdSZW1vdmVSZWxhdGlvbicsXG4gICAgICAgIG9iamVjdHM6IHZhbHVlLnJlbW92ZS5tYXAoaW5wdXQgPT4ge1xuICAgICAgICAgIGNvbnN0IGdsb2JhbElkT2JqZWN0ID0gZnJvbUdsb2JhbElkKGlucHV0KTtcbiAgICAgICAgICBpZiAoZ2xvYmFsSWRPYmplY3QudHlwZSA9PT0gdGFyZ2V0Q2xhc3MpIHtcbiAgICAgICAgICAgIGlucHV0ID0gZ2xvYmFsSWRPYmplY3QuaWQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICAgIGNsYXNzTmFtZTogdGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICBvYmplY3RJZDogaW5wdXQsXG4gICAgICAgICAgfTtcbiAgICAgICAgfSksXG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIG9wO1xuICB9LFxuICBwb2ludGVyOiBhc3luYyAodGFyZ2V0Q2xhc3MsIGZpZWxkLCB2YWx1ZSwgcGFyc2VHcmFwaFFMU2NoZW1hLCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9KSA9PiB7XG4gICAgaWYgKE9iamVjdC5rZXlzKHZhbHVlKS5sZW5ndGggPiAxIHx8IE9iamVjdC5rZXlzKHZhbHVlKS5sZW5ndGggPT09IDApXG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUE9JTlRFUixcbiAgICAgICAgYFlvdSBuZWVkIHRvIHByb3ZpZGUgbGluayBPUiBjcmVhdGVMaW5rIG9uIHRoZSBwb2ludGVyIG11dGF0aW9uIG9mIGZpZWxkICR7ZmllbGR9YFxuICAgICAgKTtcblxuICAgIGxldCBuZXN0ZWRPYmplY3RUb0FkZDtcbiAgICBpZiAodmFsdWUuY3JlYXRlQW5kTGluaykge1xuICAgICAgY29uc3QgcGFyc2VGaWVsZHMgPSBhd2FpdCB0cmFuc2Zvcm1UeXBlcygnY3JlYXRlJywgZGVlcGNvcHkodmFsdWUuY3JlYXRlQW5kTGluayksIHtcbiAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICBvcmlnaW5hbEZpZWxkczogdmFsdWUuY3JlYXRlQW5kTGluayB8fCB7fSxcbiAgICAgICAgcmVxOiB7IGNvbmZpZywgYXV0aCwgaW5mbyB9LFxuICAgICAgfSk7XG4gICAgICBuZXN0ZWRPYmplY3RUb0FkZCA9IGF3YWl0IG9iamVjdHNNdXRhdGlvbnMuY3JlYXRlT2JqZWN0KFxuICAgICAgICB0YXJnZXRDbGFzcyxcbiAgICAgICAgcGFyc2VGaWVsZHMsXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgYXV0aCxcbiAgICAgICAgaW5mb1xuICAgICAgKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6IHRhcmdldENsYXNzLFxuICAgICAgICBvYmplY3RJZDogbmVzdGVkT2JqZWN0VG9BZGQub2JqZWN0SWQsXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAodmFsdWUubGluaykge1xuICAgICAgbGV0IG9iamVjdElkID0gdmFsdWUubGluaztcbiAgICAgIGNvbnN0IGdsb2JhbElkT2JqZWN0ID0gZnJvbUdsb2JhbElkKG9iamVjdElkKTtcbiAgICAgIGlmIChnbG9iYWxJZE9iamVjdC50eXBlID09PSB0YXJnZXRDbGFzcykge1xuICAgICAgICBvYmplY3RJZCA9IGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogdGFyZ2V0Q2xhc3MsXG4gICAgICAgIG9iamVjdElkLFxuICAgICAgfTtcbiAgICB9XG4gIH0sXG59O1xuXG5leHBvcnQgeyB0cmFuc2Zvcm1UeXBlcyB9O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBZ0M7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUVoQyxNQUFNQSxjQUFjLEdBQUcsT0FDckJDLFNBQThCLEVBQzlCQyxNQUFNLEVBQ047RUFBRUMsU0FBUztFQUFFQyxrQkFBa0I7RUFBRUMsR0FBRztFQUFFQztBQUFlLENBQUMsS0FDbkQ7RUFDSCxNQUFNO0lBQ0pDLHNCQUFzQjtJQUN0QkMsc0JBQXNCO0lBQ3RCQyxNQUFNLEVBQUU7TUFBRUMsZUFBZTtNQUFFQztJQUFnQjtFQUM3QyxDQUFDLEdBQUdQLGtCQUFrQixDQUFDUSxlQUFlLENBQUNULFNBQVMsQ0FBQztFQUNqRCxNQUFNVSxVQUFVLEdBQUdULGtCQUFrQixDQUFDVSxZQUFZLENBQUNYLFNBQVMsQ0FBQztFQUM3RCxJQUFJRCxNQUFNLEVBQUU7SUFDVixNQUFNYSw0QkFBNEIsR0FDaENMLGVBQWUsSUFBSUgsc0JBQXNCLEdBQUdBLHNCQUFzQixDQUFDUyxTQUFT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