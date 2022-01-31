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

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML3RyYW5zZm9ybWVycy9tdXRhdGlvbi5qcyJdLCJuYW1lcyI6WyJ0cmFuc2Zvcm1UeXBlcyIsImlucHV0VHlwZSIsImZpZWxkcyIsImNsYXNzTmFtZSIsInBhcnNlR3JhcGhRTFNjaGVtYSIsInJlcSIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGUiLCJjbGFzc0dyYXBoUUxVcGRhdGVUeXBlIiwiY29uZmlnIiwiaXNDcmVhdGVFbmFibGVkIiwiaXNVcGRhdGVFbmFibGVkIiwicGFyc2VDbGFzc1R5cGVzIiwicGFyc2VDbGFzcyIsInBhcnNlQ2xhc3NlcyIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGVGaWVsZHMiLCJnZXRGaWVsZHMiLCJjbGFzc0dyYXBoUUxVcGRhdGVUeXBlRmllbGRzIiwicHJvbWlzZXMiLCJPYmplY3QiLCJrZXlzIiwibWFwIiwiZmllbGQiLCJpbnB1dFR5cGVGaWVsZCIsInR5cGUiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiR0VPX1BPSU5UX0lOUFVUIiwiX19vcCIsInRyYW5zZm9ybWVycyIsImdlb1BvaW50IiwiUE9MWUdPTl9JTlBVVCIsInBvbHlnb24iLCJGSUxFX0lOUFVUIiwiZmlsZSIsInJlbGF0aW9uIiwidGFyZ2V0Q2xhc3MiLCJwb2ludGVyIiwiUHJvbWlzZSIsImFsbCIsIkFDTCIsImlucHV0IiwidXBsb2FkIiwiZmlsZUluZm8iLCJfX3R5cGUiLCJuYW1lIiwidXJsIiwiUGFyc2UiLCJFcnJvciIsIkZJTEVfU0FWRV9FUlJPUiIsInZhbHVlIiwiY29vcmRpbmF0ZXMiLCJsYXRpdHVkZSIsImxvbmdpdHVkZSIsInBhcnNlQUNMIiwicHVibGljIiwicmVhZCIsIndyaXRlIiwidXNlcnMiLCJmb3JFYWNoIiwicnVsZSIsImdsb2JhbElkT2JqZWN0IiwidXNlcklkIiwiaWQiLCJyb2xlcyIsInJvbGVOYW1lIiwiYXV0aCIsImluZm8iLCJsZW5ndGgiLCJJTlZBTElEX1BPSU5URVIiLCJvcCIsIm9wcyIsIm5lc3RlZE9iamVjdHNUb0FkZCIsImNyZWF0ZUFuZEFkZCIsInBhcnNlRmllbGRzIiwib2JqZWN0c011dGF0aW9ucyIsImNyZWF0ZU9iamVjdCIsIm9iamVjdCIsIm9iamVjdElkIiwiYWRkIiwicHVzaCIsIm9iamVjdHMiLCJyZW1vdmUiLCJuZXN0ZWRPYmplY3RUb0FkZCIsImNyZWF0ZUFuZExpbmsiLCJsaW5rIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7O0FBRUEsTUFBTUEsY0FBYyxHQUFHLE9BQ3JCQyxTQURxQixFQUVyQkMsTUFGcUIsRUFHckI7QUFBRUMsRUFBQUEsU0FBRjtBQUFhQyxFQUFBQSxrQkFBYjtBQUFpQ0MsRUFBQUE7QUFBakMsQ0FIcUIsS0FJbEI7QUFDSCxRQUFNO0FBQ0pDLElBQUFBLHNCQURJO0FBRUpDLElBQUFBLHNCQUZJO0FBR0pDLElBQUFBLE1BQU0sRUFBRTtBQUFFQyxNQUFBQSxlQUFGO0FBQW1CQyxNQUFBQTtBQUFuQjtBQUhKLE1BSUZOLGtCQUFrQixDQUFDTyxlQUFuQixDQUFtQ1IsU0FBbkMsQ0FKSjtBQUtBLFFBQU1TLFVBQVUsR0FBR1Isa0JBQWtCLENBQUNTLFlBQW5CLENBQWdDVixTQUFoQyxDQUFuQjs7QUFDQSxNQUFJRCxNQUFKLEVBQVk7QUFDVixVQUFNWSw0QkFBNEIsR0FDaENMLGVBQWUsSUFBSUgsc0JBQW5CLEdBQTRDQSxzQkFBc0IsQ0FBQ1MsU0FBdkIsRUFBNUMsR0FBaUYsSUFEbkY7QUFFQSxVQUFNQyw0QkFBNEIsR0FDaENOLGVBQWUsSUFBSUgsc0JBQW5CLEdBQTRDQSxzQkFBc0IsQ0FBQ1EsU0FBdkIsRUFBNUMsR0FBaUYsSUFEbkY7QUFFQSxVQUFNRSxRQUFRLEdBQUdDLE1BQU0sQ0FBQ0MsSUFBUCxDQUFZakIsTUFBWixFQUFvQmtCLEdBQXBCLENBQXdCLE1BQU1DLEtBQU4sSUFBZTtBQUN0RCxVQUFJQyxjQUFKOztBQUNBLFVBQUlyQixTQUFTLEtBQUss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QUFLRDtBQUNGO0FBaEtrQixDQUFyQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7IGZyb21HbG9iYWxJZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IHsgaGFuZGxlVXBsb2FkIH0gZnJvbSAnLi4vbG9hZGVycy9maWxlc011dGF0aW9ucyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4uL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzTXV0YXRpb25zIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c011dGF0aW9ucyc7XG5cbmNvbnN0IHRyYW5zZm9ybVR5cGVzID0gYXN5bmMgKFxuICBpbnB1dFR5cGU6ICdjcmVhdGUnIHwgJ3VwZGF0ZScsXG4gIGZpZWxkcyxcbiAgeyBjbGFzc05hbWUsIHBhcnNlR3JhcGhRTFNjaGVtYSwgcmVxIH1cbikgPT4ge1xuICBjb25zdCB7XG4gICAgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlLFxuICAgIGNvbmZpZzogeyBpc0NyZWF0ZUVuYWJsZWQsIGlzVXBkYXRlRW5hYmxlZCB9LFxuICB9ID0gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tjbGFzc05hbWVdO1xuICBjb25zdCBwYXJzZUNsYXNzID0gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1tjbGFzc05hbWVdO1xuICBpZiAoZmllbGRzKSB7XG4gICAgY29uc3QgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZUZpZWxkcyA9XG4gICAgICBpc0NyZWF0ZUVuYWJsZWQgJiYgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSA/IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUuZ2V0RmllbGRzKCkgOiBudWxsO1xuICAgIGNvbnN0IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVGaWVsZHMgPVxuICAgICAgaXNVcGRhdGVFbmFibGVkICYmIGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUgPyBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlLmdldEZpZWxkcygpIDogbnVsbDtcbiAgICBjb25zdCBwcm9taXNlcyA9IE9iamVjdC5rZXlzKGZpZWxkcykubWFwKGFzeW5jIGZpZWxkID0+IHtcbiAgICAgIGxldCBpbnB1dFR5cGVGaWVsZDtcbiAgICAgIGlmIChpbnB1dFR5cGUgPT09ICdjcmVhdGUnICYmIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGVGaWVsZHMpIHtcbiAgICAgICAgaW5wdXRUeXBlRmllbGQgPSBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlRmllbGRzW2ZpZWxkXTtcbiAgICAgIH0gZWxzZSBpZiAoY2xhc3NHcmFwaFFMVXBkYXRlVHlwZUZpZWxkcykge1xuICAgICAgICBpbnB1dFR5cGVGaWVsZCA9IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVGaWVsZHNbZmllbGRdO1xuICAgICAgfVxuICAgICAgaWYgKGlucHV0VHlwZUZpZWxkKSB7XG4gICAgICAgIHN3aXRjaCAodHJ1ZSkge1xuICAgICAgICAgIGNhc2UgaW5wdXRUeXBlRmllbGQudHlwZSA9PT0gZGVmYXVsdEdyYXBoUUxUeXBlcy5HRU9fUE9JTlRfSU5QVVQ6XG4gICAgICAgICAgICBpZiAoZmllbGRzW2ZpZWxkXSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICBmaWVsZHNbZmllbGRdID0geyBfX29wOiAnRGVsZXRlJyB9O1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZpZWxkc1tmaWVsZF0gPSB0cmFuc2Zvcm1lcnMuZ2VvUG9pbnQoZmllbGRzW2ZpZWxkXSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIGlucHV0VHlwZUZpZWxkLnR5cGUgPT09IGRlZmF1bHRHcmFwaFFMVHlwZXMuUE9MWUdPTl9JTlBVVDpcbiAgICAgICAgICAgIGlmIChmaWVsZHNbZmllbGRdID09PSBudWxsKSB7XG4gICAgICAgICAgICAgIGZpZWxkc1tmaWVsZF0gPSB7IF9fb3A6ICdEZWxldGUnIH07XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSA9IHRyYW5zZm9ybWVycy5wb2x5Z29uKGZpZWxkc1tmaWVsZF0pO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSBpbnB1dFR5cGVGaWVsZC50eXBlID09PSBkZWZhdWx0R3JhcGhRTFR5cGVzLkZJTEVfSU5QVVQ6XG4gICAgICAgICAgICBmaWVsZHNbZmllbGRdID0gYXdhaXQgdHJhbnNmb3JtZXJzLmZpbGUoZmllbGRzW2ZpZWxkXSwgcmVxKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdSZWxhdGlvbic6XG4gICAgICAgICAgICBmaWVsZHNbZmllbGRdID0gYXdhaXQgdHJhbnNmb3JtZXJzLnJlbGF0aW9uKFxuICAgICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICAgIGZpZWxkLFxuICAgICAgICAgICAgICBmaWVsZHNbZmllbGRdLFxuICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gICAgICAgICAgICAgIHJlcVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdQb2ludGVyJzpcbiAgICAgICAgICAgIGlmIChmaWVsZHNbZmllbGRdID09PSBudWxsKSB7XG4gICAgICAgICAgICAgIGZpZWxkc1tmaWVsZF0gPSB7IF9fb3A6ICdEZWxldGUnIH07XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSA9IGF3YWl0IHRyYW5zZm9ybWVycy5wb2ludGVyKFxuICAgICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICAgIGZpZWxkLFxuICAgICAgICAgICAgICBmaWVsZHNbZmllbGRdLFxuICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gICAgICAgICAgICAgIHJlcVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBpZiAoZmllbGRzW2ZpZWxkXSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICBmaWVsZHNbZmllbGRdID0geyBfX29wOiAnRGVsZXRlJyB9O1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuICAgIGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICBpZiAoZmllbGRzLkFDTCkgZmllbGRzLkFDTCA9IHRyYW5zZm9ybWVycy5BQ0woZmllbGRzLkFDTCk7XG4gIH1cbiAgcmV0dXJuIGZpZWxkcztcbn07XG5cbmNvbnN0IHRyYW5zZm9ybWVycyA9IHtcbiAgZmlsZTogYXN5bmMgKGlucHV0LCB7IGNvbmZpZyB9KSA9PiB7XG4gICAgaWYgKGlucHV0ID09PSBudWxsKSB7XG4gICAgICByZXR1cm4geyBfX29wOiAnRGVsZXRlJyB9O1xuICAgIH1cbiAgICBjb25zdCB7IGZpbGUsIHVwbG9hZCB9ID0gaW5wdXQ7XG4gICAgaWYgKHVwbG9hZCkge1xuICAgICAgY29uc3QgeyBmaWxlSW5mbyB9ID0gYXdhaXQgaGFuZGxlVXBsb2FkKHVwbG9hZCwgY29uZmlnKTtcbiAgICAgIHJldHVybiB7IC4uLmZpbGVJbmZvLCBfX3R5cGU6ICdGaWxlJyB9O1xuICAgIH0gZWxzZSBpZiAoZmlsZSAmJiBmaWxlLm5hbWUpIHtcbiAgICAgIHJldHVybiB7IG5hbWU6IGZpbGUubmFtZSwgX190eXBlOiAnRmlsZScsIHVybDogZmlsZS51cmwgfTtcbiAgICB9XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkZJTEVfU0FWRV9FUlJPUiwgJ0ludmFsaWQgZmlsZSB1cGxvYWQuJyk7XG4gIH0sXG4gIHBvbHlnb246IHZhbHVlID0+ICh7XG4gICAgX190eXBlOiAnUG9seWdvbicsXG4gICAgY29vcmRpbmF0ZXM6IHZhbHVlLm1hcChnZW9Qb2ludCA9PiBbZ2VvUG9pbnQubGF0aXR1ZGUsIGdlb1BvaW50LmxvbmdpdHVkZV0pLFxuICB9KSxcbiAgZ2VvUG9pbnQ6IHZhbHVlID0+ICh7XG4gICAgLi4udmFsdWUsXG4gICAgX190eXBlOiAnR2VvUG9pbnQnLFxuICB9KSxcbiAgQUNMOiB2YWx1ZSA9PiB7XG4gICAgY29uc3QgcGFyc2VBQ0wgPSB7fTtcbiAgICBpZiAodmFsdWUucHVibGljKSB7XG4gICAgICBwYXJzZUFDTFsnKiddID0ge1xuICAgICAgICByZWFkOiB2YWx1ZS5wdWJsaWMucmVhZCxcbiAgICAgICAgd3JpdGU6IHZhbHVlLnB1YmxpYy53cml0ZSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmICh2YWx1ZS51c2Vycykge1xuICAgICAgdmFsdWUudXNlcnMuZm9yRWFjaChydWxlID0+IHtcbiAgICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQocnVsZS51c2VySWQpO1xuICAgICAgICBpZiAoZ2xvYmFsSWRPYmplY3QudHlwZSA9PT0gJ19Vc2VyJykge1xuICAgICAgICAgIHJ1bGUudXNlcklkID0gZ2xvYmFsSWRPYmplY3QuaWQ7XG4gICAgICAgIH1cbiAgICAgICAgcGFyc2VBQ0xbcnVsZS51c2VySWRdID0ge1xuICAgICAgICAgIHJlYWQ6IHJ1bGUucmVhZCxcbiAgICAgICAgICB3cml0ZTogcnVsZS53cml0ZSxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICAgIH1cbiAgICBpZiAodmFsdWUucm9sZXMpIHtcbiAgICAgIHZhbHVlLnJvbGVzLmZvckVhY2gocnVsZSA9PiB7XG4gICAgICAgIHBhcnNlQUNMW2Byb2xlOiR7cnVsZS5yb2xlTmFtZX1gXSA9IHtcbiAgICAgICAgICByZWFkOiBydWxlLnJlYWQsXG4gICAgICAgICAgd3JpdGU6IHJ1bGUud3JpdGUsXG4gICAgICAgIH07XG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIHBhcnNlQUNMO1xuICB9LFxuICByZWxhdGlvbjogYXN5bmMgKHRhcmdldENsYXNzLCBmaWVsZCwgdmFsdWUsIHBhcnNlR3JhcGhRTFNjaGVtYSwgeyBjb25maWcsIGF1dGgsIGluZm8gfSkgPT4ge1xuICAgIGlmIChPYmplY3Qua2V5cyh2YWx1ZSkubGVuZ3RoID09PSAwKVxuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1BPSU5URVIsXG4gICAgICAgIGBZb3UgbmVlZCB0byBwcm92aWRlIGF0IGxlYXN0IG9uZSBvcGVyYXRpb24gb24gdGhlIHJlbGF0aW9uIG11dGF0aW9uIG9mIGZpZWxkICR7ZmllbGR9YFxuICAgICAgKTtcblxuICAgIGNvbnN0IG9wID0ge1xuICAgICAgX19vcDogJ0JhdGNoJyxcbiAgICAgIG9wczogW10sXG4gICAgfTtcbiAgICBsZXQgbmVzdGVkT2JqZWN0c1RvQWRkID0gW107XG5cbiAgICBpZiAodmFsdWUuY3JlYXRlQW5kQWRkKSB7XG4gICAgICBuZXN0ZWRPYmplY3RzVG9BZGQgPSAoXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgICAgIHZhbHVlLmNyZWF0ZUFuZEFkZC5tYXAoYXN5bmMgaW5wdXQgPT4ge1xuICAgICAgICAgICAgY29uc3QgcGFyc2VGaWVsZHMgPSBhd2FpdCB0cmFuc2Zvcm1UeXBlcygnY3JlYXRlJywgaW5wdXQsIHtcbiAgICAgICAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgICAgICByZXE6IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0sXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBvYmplY3RzTXV0YXRpb25zLmNyZWF0ZU9iamVjdCh0YXJnZXRDbGFzcywgcGFyc2VGaWVsZHMsIGNvbmZpZywgYXV0aCwgaW5mbyk7XG4gICAgICAgICAgfSlcbiAgICAgICAgKVxuICAgICAgKS5tYXAob2JqZWN0ID0+ICh7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6IHRhcmdldENsYXNzLFxuICAgICAgICBvYmplY3RJZDogb2JqZWN0Lm9iamVjdElkLFxuICAgICAgfSkpO1xuICAgIH1cblxuICAgIGlmICh2YWx1ZS5hZGQgfHwgbmVzdGVkT2JqZWN0c1RvQWRkLmxlbmd0aCA+IDApIHtcbiAgICAgIGlmICghdmFsdWUuYWRkKSB2YWx1ZS5hZGQgPSBbXTtcbiAgICAgIHZhbHVlLmFkZCA9IHZhbHVlLmFkZC5tYXAoaW5wdXQgPT4ge1xuICAgICAgICBjb25zdCBnbG9iYWxJZE9iamVjdCA9IGZyb21HbG9iYWxJZChpbnB1dCk7XG4gICAgICAgIGlmIChnbG9iYWxJZE9iamVjdC50eXBlID09PSB0YXJnZXRDbGFzcykge1xuICAgICAgICAgIGlucHV0ID0gZ2xvYmFsSWRPYmplY3QuaWQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICBjbGFzc05hbWU6IHRhcmdldENsYXNzLFxuICAgICAgICAgIG9iamVjdElkOiBpbnB1dCxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICAgICAgb3Aub3BzLnB1c2goe1xuICAgICAgICBfX29wOiAnQWRkUmVsYXRpb24nLFxuICAgICAgICBvYmplY3RzOiBbLi4udmFsdWUuYWRkLCAuLi5uZXN0ZWRPYmplY3RzVG9BZGRdLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKHZhbHVlLnJlbW92ZSkge1xuICAgICAgb3Aub3BzLnB1c2goe1xuICAgICAgICBfX29wOiAnUmVtb3ZlUmVsYXRpb24nLFxuICAgICAgICBvYmplY3RzOiB2YWx1ZS5yZW1vdmUubWFwKGlucHV0ID0+IHtcbiAgICAgICAgICBjb25zdCBnbG9iYWxJZE9iamVjdCA9IGZyb21HbG9iYWxJZChpbnB1dCk7XG4gICAgICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IHRhcmdldENsYXNzKSB7XG4gICAgICAgICAgICBpbnB1dCA9IGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICBjbGFzc05hbWU6IHRhcmdldENsYXNzLFxuICAgICAgICAgICAgb2JqZWN0SWQ6IGlucHV0LFxuICAgICAgICAgIH07XG4gICAgICAgIH0pLFxuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiBvcDtcbiAgfSxcbiAgcG9pbnRlcjogYXN5bmMgKHRhcmdldENsYXNzLCBmaWVsZCwgdmFsdWUsIHBhcnNlR3JhcGhRTFNjaGVtYSwgeyBjb25maWcsIGF1dGgsIGluZm8gfSkgPT4ge1xuICAgIGlmIChPYmplY3Qua2V5cyh2YWx1ZSkubGVuZ3RoID4gMSB8fCBPYmplY3Qua2V5cyh2YWx1ZSkubGVuZ3RoID09PSAwKVxuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1BPSU5URVIsXG4gICAgICAgIGBZb3UgbmVlZCB0byBwcm92aWRlIGxpbmsgT1IgY3JlYXRlTGluayBvbiB0aGUgcG9pbnRlciBtdXRhdGlvbiBvZiBmaWVsZCAke2ZpZWxkfWBcbiAgICAgICk7XG5cbiAgICBsZXQgbmVzdGVkT2JqZWN0VG9BZGQ7XG4gICAgaWYgKHZhbHVlLmNyZWF0ZUFuZExpbmspIHtcbiAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ2NyZWF0ZScsIHZhbHVlLmNyZWF0ZUFuZExpbmssIHtcbiAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICByZXE6IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0sXG4gICAgICB9KTtcbiAgICAgIG5lc3RlZE9iamVjdFRvQWRkID0gYXdhaXQgb2JqZWN0c011dGF0aW9ucy5jcmVhdGVPYmplY3QoXG4gICAgICAgIHRhcmdldENsYXNzLFxuICAgICAgICBwYXJzZUZpZWxkcyxcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBhdXRoLFxuICAgICAgICBpbmZvXG4gICAgICApO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogdGFyZ2V0Q2xhc3MsXG4gICAgICAgIG9iamVjdElkOiBuZXN0ZWRPYmplY3RUb0FkZC5vYmplY3RJZCxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmICh2YWx1ZS5saW5rKSB7XG4gICAgICBsZXQgb2JqZWN0SWQgPSB2YWx1ZS5saW5rO1xuICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQob2JqZWN0SWQpO1xuICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IHRhcmdldENsYXNzKSB7XG4gICAgICAgIG9iamVjdElkID0gZ2xvYmFsSWRPYmplY3QuaWQ7XG4gICAgICB9XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgb2JqZWN0SWQsXG4gICAgICB9O1xuICAgIH1cbiAgfSxcbn07XG5cbmV4cG9ydCB7IHRyYW5zZm9ybVR5cGVzIH07XG4iXX0=