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
  req
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
            fields[field] = await transformers.file(fields[field], req);
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
        const parseFields = await transformTypes('create', input, {
          className: targetClass,
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
  pointer: async (targetClass, field, value, parseGraphQLSchema, {
    config,
    auth,
    info
  }) => {
    if (Object.keys(value).length > 1 || Object.keys(value).length === 0) throw new _node.default.Error(_node.default.Error.INVALID_POINTER, `You need to provide link OR createLink on the pointer mutation of field ${field}`);
    let nestedObjectToAdd;
    if (value.createAndLink) {
      const parseFields = await transformTypes('create', value.createAndLink, {
        className: targetClass,
        parseGraphQLSchema,
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJ0cmFuc2Zvcm1UeXBlcyIsImlucHV0VHlwZSIsImZpZWxkcyIsImNsYXNzTmFtZSIsInBhcnNlR3JhcGhRTFNjaGVtYSIsInJlcSIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGUiLCJjbGFzc0dyYXBoUUxVcGRhdGVUeXBlIiwiY29uZmlnIiwiaXNDcmVhdGVFbmFibGVkIiwiaXNVcGRhdGVFbmFibGVkIiwicGFyc2VDbGFzc1R5cGVzIiwicGFyc2VDbGFzcyIsInBhcnNlQ2xhc3NlcyIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGVGaWVsZHMiLCJnZXRGaWVsZHMiLCJjbGFzc0dyYXBoUUxVcGRhdGVUeXBlRmllbGRzIiwicHJvbWlzZXMiLCJPYmplY3QiLCJrZXlzIiwibWFwIiwiZmllbGQiLCJpbnB1dFR5cGVGaWVsZCIsInR5cGUiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiR0VPX1BPSU5UX0lOUFVUIiwiX19vcCIsInRyYW5zZm9ybWVycyIsImdlb1BvaW50IiwiUE9MWUdPTl9JTlBVVCIsInBvbHlnb24iLCJGSUxFX0lOUFVUIiwiZmlsZSIsInJlbGF0aW9uIiwidGFyZ2V0Q2xhc3MiLCJwb2ludGVyIiwiUHJvbWlzZSIsImFsbCIsIkFDTCIsImlucHV0IiwidXBsb2FkIiwiZmlsZUluZm8iLCJoYW5kbGVVcGxvYWQiLCJfX3R5cGUiLCJuYW1lIiwidXJsIiwiUGFyc2UiLCJFcnJvciIsIkZJTEVfU0FWRV9FUlJPUiIsInZhbHVlIiwiY29vcmRpbmF0ZXMiLCJsYXRpdHVkZSIsImxvbmdpdHVkZSIsInBhcnNlQUNMIiwicHVibGljIiwicmVhZCIsIndyaXRlIiwidXNlcnMiLCJmb3JFYWNoIiwicnVsZSIsImdsb2JhbElkT2JqZWN0IiwiZnJvbUdsb2JhbElkIiwidXNlcklkIiwiaWQiLCJyb2xlcyIsInJvbGVOYW1lIiwiYXV0aCIsImluZm8iLCJsZW5ndGgiLCJJTlZBTElEX1BPSU5URVIiLCJvcCIsIm9wcyIsIm5lc3RlZE9iamVjdHNUb0FkZCIsImNyZWF0ZUFuZEFkZCIsInBhcnNlRmllbGRzIiwib2JqZWN0c011dGF0aW9ucyIsImNyZWF0ZU9iamVjdCIsIm9iamVjdCIsIm9iamVjdElkIiwiYWRkIiwicHVzaCIsIm9iamVjdHMiLCJyZW1vdmUiLCJuZXN0ZWRPYmplY3RUb0FkZCIsImNyZWF0ZUFuZExpbmsiLCJsaW5rIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0dyYXBoUUwvdHJhbnNmb3JtZXJzL211dGF0aW9uLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7IGZyb21HbG9iYWxJZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IHsgaGFuZGxlVXBsb2FkIH0gZnJvbSAnLi4vbG9hZGVycy9maWxlc011dGF0aW9ucyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4uL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzTXV0YXRpb25zIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c011dGF0aW9ucyc7XG5cbmNvbnN0IHRyYW5zZm9ybVR5cGVzID0gYXN5bmMgKFxuICBpbnB1dFR5cGU6ICdjcmVhdGUnIHwgJ3VwZGF0ZScsXG4gIGZpZWxkcyxcbiAgeyBjbGFzc05hbWUsIHBhcnNlR3JhcGhRTFNjaGVtYSwgcmVxIH1cbikgPT4ge1xuICBjb25zdCB7XG4gICAgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlLFxuICAgIGNvbmZpZzogeyBpc0NyZWF0ZUVuYWJsZWQsIGlzVXBkYXRlRW5hYmxlZCB9LFxuICB9ID0gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tjbGFzc05hbWVdO1xuICBjb25zdCBwYXJzZUNsYXNzID0gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1tjbGFzc05hbWVdO1xuICBpZiAoZmllbGRzKSB7XG4gICAgY29uc3QgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZUZpZWxkcyA9XG4gICAgICBpc0NyZWF0ZUVuYWJsZWQgJiYgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSA/IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUuZ2V0RmllbGRzKCkgOiBudWxsO1xuICAgIGNvbnN0IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVGaWVsZHMgPVxuICAgICAgaXNVcGRhdGVFbmFibGVkICYmIGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUgPyBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlLmdldEZpZWxkcygpIDogbnVsbDtcbiAgICBjb25zdCBwcm9taXNlcyA9IE9iamVjdC5rZXlzKGZpZWxkcykubWFwKGFzeW5jIGZpZWxkID0+IHtcbiAgICAgIGxldCBpbnB1dFR5cGVGaWVsZDtcbiAgICAgIGlmIChpbnB1dFR5cGUgPT09ICdjcmVhdGUnICYmIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGVGaWVsZHMpIHtcbiAgICAgICAgaW5wdXRUeXBlRmllbGQgPSBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlRmllbGRzW2ZpZWxkXTtcbiAgICAgIH0gZWxzZSBpZiAoY2xhc3NHcmFwaFFMVXBkYXRlVHlwZUZpZWxkcykge1xuICAgICAgICBpbnB1dFR5cGVGaWVsZCA9IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVGaWVsZHNbZmllbGRdO1xuICAgICAgfVxuICAgICAgaWYgKGlucHV0VHlwZUZpZWxkKSB7XG4gICAgICAgIHN3aXRjaCAodHJ1ZSkge1xuICAgICAgICAgIGNhc2UgaW5wdXRUeXBlRmllbGQudHlwZSA9PT0gZGVmYXVsdEdyYXBoUUxUeXBlcy5HRU9fUE9JTlRfSU5QVVQ6XG4gICAgICAgICAgICBpZiAoZmllbGRzW2ZpZWxkXSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICBmaWVsZHNbZmllbGRdID0geyBfX29wOiAnRGVsZXRlJyB9O1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZpZWxkc1tmaWVsZF0gPSB0cmFuc2Zvcm1lcnMuZ2VvUG9pbnQoZmllbGRzW2ZpZWxkXSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIGlucHV0VHlwZUZpZWxkLnR5cGUgPT09IGRlZmF1bHRHcmFwaFFMVHlwZXMuUE9MWUdPTl9JTlBVVDpcbiAgICAgICAgICAgIGlmIChmaWVsZHNbZmllbGRdID09PSBudWxsKSB7XG4gICAgICAgICAgICAgIGZpZWxkc1tmaWVsZF0gPSB7IF9fb3A6ICdEZWxldGUnIH07XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSA9IHRyYW5zZm9ybWVycy5wb2x5Z29uKGZpZWxkc1tmaWVsZF0pO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSBpbnB1dFR5cGVGaWVsZC50eXBlID09PSBkZWZhdWx0R3JhcGhRTFR5cGVzLkZJTEVfSU5QVVQ6XG4gICAgICAgICAgICBmaWVsZHNbZmllbGRdID0gYXdhaXQgdHJhbnNmb3JtZXJzLmZpbGUoZmllbGRzW2ZpZWxkXSwgcmVxKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdSZWxhdGlvbic6XG4gICAgICAgICAgICBmaWVsZHNbZmllbGRdID0gYXdhaXQgdHJhbnNmb3JtZXJzLnJlbGF0aW9uKFxuICAgICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICAgIGZpZWxkLFxuICAgICAgICAgICAgICBmaWVsZHNbZmllbGRdLFxuICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gICAgICAgICAgICAgIHJlcVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdQb2ludGVyJzpcbiAgICAgICAgICAgIGlmIChmaWVsZHNbZmllbGRdID09PSBudWxsKSB7XG4gICAgICAgICAgICAgIGZpZWxkc1tmaWVsZF0gPSB7IF9fb3A6ICdEZWxldGUnIH07XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSA9IGF3YWl0IHRyYW5zZm9ybWVycy5wb2ludGVyKFxuICAgICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICAgIGZpZWxkLFxuICAgICAgICAgICAgICBmaWVsZHNbZmllbGRdLFxuICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gICAgICAgICAgICAgIHJlcVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBpZiAoZmllbGRzW2ZpZWxkXSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICBmaWVsZHNbZmllbGRdID0geyBfX29wOiAnRGVsZXRlJyB9O1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuICAgIGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICBpZiAoZmllbGRzLkFDTCkgZmllbGRzLkFDTCA9IHRyYW5zZm9ybWVycy5BQ0woZmllbGRzLkFDTCk7XG4gIH1cbiAgcmV0dXJuIGZpZWxkcztcbn07XG5cbmNvbnN0IHRyYW5zZm9ybWVycyA9IHtcbiAgZmlsZTogYXN5bmMgKGlucHV0LCB7IGNvbmZpZyB9KSA9PiB7XG4gICAgaWYgKGlucHV0ID09PSBudWxsKSB7XG4gICAgICByZXR1cm4geyBfX29wOiAnRGVsZXRlJyB9O1xuICAgIH1cbiAgICBjb25zdCB7IGZpbGUsIHVwbG9hZCB9ID0gaW5wdXQ7XG4gICAgaWYgKHVwbG9hZCkge1xuICAgICAgY29uc3QgeyBmaWxlSW5mbyB9ID0gYXdhaXQgaGFuZGxlVXBsb2FkKHVwbG9hZCwgY29uZmlnKTtcbiAgICAgIHJldHVybiB7IC4uLmZpbGVJbmZvLCBfX3R5cGU6ICdGaWxlJyB9O1xuICAgIH0gZWxzZSBpZiAoZmlsZSAmJiBmaWxlLm5hbWUpIHtcbiAgICAgIHJldHVybiB7IG5hbWU6IGZpbGUubmFtZSwgX190eXBlOiAnRmlsZScsIHVybDogZmlsZS51cmwgfTtcbiAgICB9XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkZJTEVfU0FWRV9FUlJPUiwgJ0ludmFsaWQgZmlsZSB1cGxvYWQuJyk7XG4gIH0sXG4gIHBvbHlnb246IHZhbHVlID0+ICh7XG4gICAgX190eXBlOiAnUG9seWdvbicsXG4gICAgY29vcmRpbmF0ZXM6IHZhbHVlLm1hcChnZW9Qb2ludCA9PiBbZ2VvUG9pbnQubGF0aXR1ZGUsIGdlb1BvaW50LmxvbmdpdHVkZV0pLFxuICB9KSxcbiAgZ2VvUG9pbnQ6IHZhbHVlID0+ICh7XG4gICAgLi4udmFsdWUsXG4gICAgX190eXBlOiAnR2VvUG9pbnQnLFxuICB9KSxcbiAgQUNMOiB2YWx1ZSA9PiB7XG4gICAgY29uc3QgcGFyc2VBQ0wgPSB7fTtcbiAgICBpZiAodmFsdWUucHVibGljKSB7XG4gICAgICBwYXJzZUFDTFsnKiddID0ge1xuICAgICAgICByZWFkOiB2YWx1ZS5wdWJsaWMucmVhZCxcbiAgICAgICAgd3JpdGU6IHZhbHVlLnB1YmxpYy53cml0ZSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmICh2YWx1ZS51c2Vycykge1xuICAgICAgdmFsdWUudXNlcnMuZm9yRWFjaChydWxlID0+IHtcbiAgICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQocnVsZS51c2VySWQpO1xuICAgICAgICBpZiAoZ2xvYmFsSWRPYmplY3QudHlwZSA9PT0gJ19Vc2VyJykge1xuICAgICAgICAgIHJ1bGUudXNlcklkID0gZ2xvYmFsSWRPYmplY3QuaWQ7XG4gICAgICAgIH1cbiAgICAgICAgcGFyc2VBQ0xbcnVsZS51c2VySWRdID0ge1xuICAgICAgICAgIHJlYWQ6IHJ1bGUucmVhZCxcbiAgICAgICAgICB3cml0ZTogcnVsZS53cml0ZSxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICAgIH1cbiAgICBpZiAodmFsdWUucm9sZXMpIHtcbiAgICAgIHZhbHVlLnJvbGVzLmZvckVhY2gocnVsZSA9PiB7XG4gICAgICAgIHBhcnNlQUNMW2Byb2xlOiR7cnVsZS5yb2xlTmFtZX1gXSA9IHtcbiAgICAgICAgICByZWFkOiBydWxlLnJlYWQsXG4gICAgICAgICAgd3JpdGU6IHJ1bGUud3JpdGUsXG4gICAgICAgIH07XG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIHBhcnNlQUNMO1xuICB9LFxuICByZWxhdGlvbjogYXN5bmMgKHRhcmdldENsYXNzLCBmaWVsZCwgdmFsdWUsIHBhcnNlR3JhcGhRTFNjaGVtYSwgeyBjb25maWcsIGF1dGgsIGluZm8gfSkgPT4ge1xuICAgIGlmIChPYmplY3Qua2V5cyh2YWx1ZSkubGVuZ3RoID09PSAwKVxuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1BPSU5URVIsXG4gICAgICAgIGBZb3UgbmVlZCB0byBwcm92aWRlIGF0IGxlYXN0IG9uZSBvcGVyYXRpb24gb24gdGhlIHJlbGF0aW9uIG11dGF0aW9uIG9mIGZpZWxkICR7ZmllbGR9YFxuICAgICAgKTtcblxuICAgIGNvbnN0IG9wID0ge1xuICAgICAgX19vcDogJ0JhdGNoJyxcbiAgICAgIG9wczogW10sXG4gICAgfTtcbiAgICBsZXQgbmVzdGVkT2JqZWN0c1RvQWRkID0gW107XG5cbiAgICBpZiAodmFsdWUuY3JlYXRlQW5kQWRkKSB7XG4gICAgICBuZXN0ZWRPYmplY3RzVG9BZGQgPSAoXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgICAgIHZhbHVlLmNyZWF0ZUFuZEFkZC5tYXAoYXN5bmMgaW5wdXQgPT4ge1xuICAgICAgICAgICAgY29uc3QgcGFyc2VGaWVsZHMgPSBhd2FpdCB0cmFuc2Zvcm1UeXBlcygnY3JlYXRlJywgaW5wdXQsIHtcbiAgICAgICAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgICAgICByZXE6IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0sXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBvYmplY3RzTXV0YXRpb25zLmNyZWF0ZU9iamVjdCh0YXJnZXRDbGFzcywgcGFyc2VGaWVsZHMsIGNvbmZpZywgYXV0aCwgaW5mbyk7XG4gICAgICAgICAgfSlcbiAgICAgICAgKVxuICAgICAgKS5tYXAob2JqZWN0ID0+ICh7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6IHRhcmdldENsYXNzLFxuICAgICAgICBvYmplY3RJZDogb2JqZWN0Lm9iamVjdElkLFxuICAgICAgfSkpO1xuICAgIH1cblxuICAgIGlmICh2YWx1ZS5hZGQgfHwgbmVzdGVkT2JqZWN0c1RvQWRkLmxlbmd0aCA+IDApIHtcbiAgICAgIGlmICghdmFsdWUuYWRkKSB2YWx1ZS5hZGQgPSBbXTtcbiAgICAgIHZhbHVlLmFkZCA9IHZhbHVlLmFkZC5tYXAoaW5wdXQgPT4ge1xuICAgICAgICBjb25zdCBnbG9iYWxJZE9iamVjdCA9IGZyb21HbG9iYWxJZChpbnB1dCk7XG4gICAgICAgIGlmIChnbG9iYWxJZE9iamVjdC50eXBlID09PSB0YXJnZXRDbGFzcykge1xuICAgICAgICAgIGlucHV0ID0gZ2xvYmFsSWRPYmplY3QuaWQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICBjbGFzc05hbWU6IHRhcmdldENsYXNzLFxuICAgICAgICAgIG9iamVjdElkOiBpbnB1dCxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICAgICAgb3Aub3BzLnB1c2goe1xuICAgICAgICBfX29wOiAnQWRkUmVsYXRpb24nLFxuICAgICAgICBvYmplY3RzOiBbLi4udmFsdWUuYWRkLCAuLi5uZXN0ZWRPYmplY3RzVG9BZGRdLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKHZhbHVlLnJlbW92ZSkge1xuICAgICAgb3Aub3BzLnB1c2goe1xuICAgICAgICBfX29wOiAnUmVtb3ZlUmVsYXRpb24nLFxuICAgICAgICBvYmplY3RzOiB2YWx1ZS5yZW1vdmUubWFwKGlucHV0ID0+IHtcbiAgICAgICAgICBjb25zdCBnbG9iYWxJZE9iamVjdCA9IGZyb21HbG9iYWxJZChpbnB1dCk7XG4gICAgICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IHRhcmdldENsYXNzKSB7XG4gICAgICAgICAgICBpbnB1dCA9IGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICBjbGFzc05hbWU6IHRhcmdldENsYXNzLFxuICAgICAgICAgICAgb2JqZWN0SWQ6IGlucHV0LFxuICAgICAgICAgIH07XG4gICAgICAgIH0pLFxuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiBvcDtcbiAgfSxcbiAgcG9pbnRlcjogYXN5bmMgKHRhcmdldENsYXNzLCBmaWVsZCwgdmFsdWUsIHBhcnNlR3JhcGhRTFNjaGVtYSwgeyBjb25maWcsIGF1dGgsIGluZm8gfSkgPT4ge1xuICAgIGlmIChPYmplY3Qua2V5cyh2YWx1ZSkubGVuZ3RoID4gMSB8fCBPYmplY3Qua2V5cyh2YWx1ZSkubGVuZ3RoID09PSAwKVxuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1BPSU5URVIsXG4gICAgICAgIGBZb3UgbmVlZCB0byBwcm92aWRlIGxpbmsgT1IgY3JlYXRlTGluayBvbiB0aGUgcG9pbnRlciBtdXRhdGlvbiBvZiBmaWVsZCAke2ZpZWxkfWBcbiAgICAgICk7XG5cbiAgICBsZXQgbmVzdGVkT2JqZWN0VG9BZGQ7XG4gICAgaWYgKHZhbHVlLmNyZWF0ZUFuZExpbmspIHtcbiAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ2NyZWF0ZScsIHZhbHVlLmNyZWF0ZUFuZExpbmssIHtcbiAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICByZXE6IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0sXG4gICAgICB9KTtcbiAgICAgIG5lc3RlZE9iamVjdFRvQWRkID0gYXdhaXQgb2JqZWN0c011dGF0aW9ucy5jcmVhdGVPYmplY3QoXG4gICAgICAgIHRhcmdldENsYXNzLFxuICAgICAgICBwYXJzZUZpZWxkcyxcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBhdXRoLFxuICAgICAgICBpbmZvXG4gICAgICApO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogdGFyZ2V0Q2xhc3MsXG4gICAgICAgIG9iamVjdElkOiBuZXN0ZWRPYmplY3RUb0FkZC5vYmplY3RJZCxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmICh2YWx1ZS5saW5rKSB7XG4gICAgICBsZXQgb2JqZWN0SWQgPSB2YWx1ZS5saW5rO1xuICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQob2JqZWN0SWQpO1xuICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IHRhcmdldENsYXNzKSB7XG4gICAgICAgIG9iamVjdElkID0gZ2xvYmFsSWRPYmplY3QuaWQ7XG4gICAgICB9XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgb2JqZWN0SWQsXG4gICAgICB9O1xuICAgIH1cbiAgfSxcbn07XG5cbmV4cG9ydCB7IHRyYW5zZm9ybVR5cGVzIH07XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBZ0U7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUVoRSxNQUFNQSxjQUFjLEdBQUcsT0FDckJDLFNBQThCLEVBQzlCQyxNQUFNLEVBQ047RUFBRUMsU0FBUztFQUFFQyxrQkFBa0I7RUFBRUM7QUFBSSxDQUFDLEtBQ25DO0VBQ0gsTUFBTTtJQUNKQyxzQkFBc0I7SUFDdEJDLHNCQUFzQjtJQUN0QkMsTUFBTSxFQUFFO01BQUVDLGVBQWU7TUFBRUM7SUFBZ0I7RUFDN0MsQ0FBQyxHQUFHTixrQkFBa0IsQ0FBQ08sZUFBZSxDQUFDUixTQUFTLENBQUM7RUFDakQsTUFBTVMsVUFBVSxHQUFHUixrQkFBa0IsQ0FBQ1MsWUFBWSxDQUFDVixTQUFTLENBQUM7RUFDN0QsSUFBSUQsTUFBTSxFQUFFO0lBQ1YsTUFBTVksNEJBQTRCLEdBQ2hDTCxlQUFlLElBQUlILHNCQUFzQixHQUFHQSxzQkFBc0IsQ0FBQ1MsU0FBUyxFQUFFLEdBQUcsSUFBSTtJQUN2RixNQUFNQyw0QkFBNEIsR0FDaENOLGVBQWUsSUFBSUgsc0JBQXNCLEdBQUdBLHNCQUFzQixDQUFDUSxTQUFTLEVBQUUsR0FBRyxJQUFJO0lBQ3ZGLE1BQU1FLFFBQVEsR0FBR0MsTUFBTSxDQUFDQyxJQUFJLENBQUNqQixNQUFNLENBQUMsQ0FBQ2tCLEdBQUcsQ0FBQyxNQUFNQyxLQUFLLElBQUk7TUFDdEQsSUFBSUMsY0FBYztNQUNsQixJQUFJckIsU0FBUyxLQUFLLFFBQVEsSUFBSWEsNEJBQTRCLEVBQUU7UUFDMURRLGNBQWMsR0FBR1IsNEJBQTRCLENBQUNPLEtBQUssQ0FBQztNQUN0RCxDQUFDLE1BQU0sSUFBSUwsNEJBQTRCLEVBQUU7UUFDdkNNLGNBQWMsR0FBR04sNEJBQTRCLENBQUNLLEtB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