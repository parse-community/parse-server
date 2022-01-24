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
  const parseClass = parseGraphQLSchema.parseClasses.find(clazz => clazz.className === className);

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML3RyYW5zZm9ybWVycy9tdXRhdGlvbi5qcyJdLCJuYW1lcyI6WyJ0cmFuc2Zvcm1UeXBlcyIsImlucHV0VHlwZSIsImZpZWxkcyIsImNsYXNzTmFtZSIsInBhcnNlR3JhcGhRTFNjaGVtYSIsInJlcSIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGUiLCJjbGFzc0dyYXBoUUxVcGRhdGVUeXBlIiwiY29uZmlnIiwiaXNDcmVhdGVFbmFibGVkIiwiaXNVcGRhdGVFbmFibGVkIiwicGFyc2VDbGFzc1R5cGVzIiwicGFyc2VDbGFzcyIsInBhcnNlQ2xhc3NlcyIsImZpbmQiLCJjbGF6eiIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGVGaWVsZHMiLCJnZXRGaWVsZHMiLCJjbGFzc0dyYXBoUUxVcGRhdGVUeXBlRmllbGRzIiwicHJvbWlzZXMiLCJPYmplY3QiLCJrZXlzIiwibWFwIiwiZmllbGQiLCJpbnB1dFR5cGVGaWVsZCIsInR5cGUiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiR0VPX1BPSU5UX0lOUFVUIiwiX19vcCIsInRyYW5zZm9ybWVycyIsImdlb1BvaW50IiwiUE9MWUdPTl9JTlBVVCIsInBvbHlnb24iLCJGSUxFX0lOUFVUIiwiZmlsZSIsInJlbGF0aW9uIiwidGFyZ2V0Q2xhc3MiLCJwb2ludGVyIiwiUHJvbWlzZSIsImFsbCIsIkFDTCIsImlucHV0IiwidXBsb2FkIiwiZmlsZUluZm8iLCJfX3R5cGUiLCJuYW1lIiwidXJsIiwiUGFyc2UiLCJFcnJvciIsIkZJTEVfU0FWRV9FUlJPUiIsInZhbHVlIiwiY29vcmRpbmF0ZXMiLCJsYXRpdHVkZSIsImxvbmdpdHVkZSIsInBhcnNlQUNMIiwicHVibGljIiwicmVhZCIsIndyaXRlIiwidXNlcnMiLCJmb3JFYWNoIiwicnVsZSIsImdsb2JhbElkT2JqZWN0IiwidXNlcklkIiwiaWQiLCJyb2xlcyIsInJvbGVOYW1lIiwiYXV0aCIsImluZm8iLCJsZW5ndGgiLCJJTlZBTElEX1BPSU5URVIiLCJvcCIsIm9wcyIsIm5lc3RlZE9iamVjdHNUb0FkZCIsImNyZWF0ZUFuZEFkZCIsInBhcnNlRmllbGRzIiwib2JqZWN0c011dGF0aW9ucyIsImNyZWF0ZU9iamVjdCIsIm9iamVjdCIsIm9iamVjdElkIiwiYWRkIiwicHVzaCIsIm9iamVjdHMiLCJyZW1vdmUiLCJuZXN0ZWRPYmplY3RUb0FkZCIsImNyZWF0ZUFuZExpbmsiLCJsaW5rIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7O0FBRUEsTUFBTUEsY0FBYyxHQUFHLE9BQ3JCQyxTQURxQixFQUVyQkMsTUFGcUIsRUFHckI7QUFBRUMsRUFBQUEsU0FBRjtBQUFhQyxFQUFBQSxrQkFBYjtBQUFpQ0MsRUFBQUE7QUFBakMsQ0FIcUIsS0FJbEI7QUFDSCxRQUFNO0FBQ0pDLElBQUFBLHNCQURJO0FBRUpDLElBQUFBLHNCQUZJO0FBR0pDLElBQUFBLE1BQU0sRUFBRTtBQUFFQyxNQUFBQSxlQUFGO0FBQW1CQyxNQUFBQTtBQUFuQjtBQUhKLE1BSUZOLGtCQUFrQixDQUFDTyxlQUFuQixDQUFtQ1IsU0FBbkMsQ0FKSjtBQUtBLFFBQU1TLFVBQVUsR0FBR1Isa0JBQWtCLENBQUNTLFlBQW5CLENBQWdDQyxJQUFoQyxDQUFxQ0MsS0FBSyxJQUFJQSxLQUFLLENBQUNaLFNBQU4sS0FBb0JBLFNBQWxFLENBQW5COztBQUNBLE1BQUlELE1BQUosRUFBWTtBQUNWLFVBQU1jLDRCQUE0QixHQUNoQ1AsZUFBZSxJQUFJSCxzQkFBbkIsR0FBNENBLHNCQUFzQixDQUFDVyxTQUF2QixFQUE1QyxHQUFpRixJQURuRjtBQUVBLFVBQU1DLDRCQUE0QixHQUNoQ1IsZUFBZSxJQUFJSCxzQkFBbkIsR0FBNENBLHNCQUFzQixDQUFDVSxTQUF2QixFQUE1QyxHQUFpRixJQURuRjtBQUVBLFVBQU1FLFFBQVEsR0FBR0MsTUFBTSxDQUFDQyxJQUFQLENBQVluQixNQUFaLEVBQW9Cb0IsR0FBcEIs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RUFBRSxTQURIO0FBRUx6QyxRQUFBQSxTQUFTLEVBQUVpQyxXQUZOO0FBR0wwQyxRQUFBQTtBQUhLLE9BQVA7QUFLRDtBQUNGO0FBaEtrQixDQUFyQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7IGZyb21HbG9iYWxJZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IHsgaGFuZGxlVXBsb2FkIH0gZnJvbSAnLi4vbG9hZGVycy9maWxlc011dGF0aW9ucyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4uL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzTXV0YXRpb25zIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c011dGF0aW9ucyc7XG5cbmNvbnN0IHRyYW5zZm9ybVR5cGVzID0gYXN5bmMgKFxuICBpbnB1dFR5cGU6ICdjcmVhdGUnIHwgJ3VwZGF0ZScsXG4gIGZpZWxkcyxcbiAgeyBjbGFzc05hbWUsIHBhcnNlR3JhcGhRTFNjaGVtYSwgcmVxIH1cbikgPT4ge1xuICBjb25zdCB7XG4gICAgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlLFxuICAgIGNvbmZpZzogeyBpc0NyZWF0ZUVuYWJsZWQsIGlzVXBkYXRlRW5hYmxlZCB9LFxuICB9ID0gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tjbGFzc05hbWVdO1xuICBjb25zdCBwYXJzZUNsYXNzID0gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlcy5maW5kKGNsYXp6ID0+IGNsYXp6LmNsYXNzTmFtZSA9PT0gY2xhc3NOYW1lKTtcbiAgaWYgKGZpZWxkcykge1xuICAgIGNvbnN0IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGVGaWVsZHMgPVxuICAgICAgaXNDcmVhdGVFbmFibGVkICYmIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUgPyBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlLmdldEZpZWxkcygpIDogbnVsbDtcbiAgICBjb25zdCBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlRmllbGRzID1cbiAgICAgIGlzVXBkYXRlRW5hYmxlZCAmJiBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlID8gY2xhc3NHcmFwaFFMVXBkYXRlVHlwZS5nZXRGaWVsZHMoKSA6IG51bGw7XG4gICAgY29uc3QgcHJvbWlzZXMgPSBPYmplY3Qua2V5cyhmaWVsZHMpLm1hcChhc3luYyBmaWVsZCA9PiB7XG4gICAgICBsZXQgaW5wdXRUeXBlRmllbGQ7XG4gICAgICBpZiAoaW5wdXRUeXBlID09PSAnY3JlYXRlJyAmJiBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlRmllbGRzKSB7XG4gICAgICAgIGlucHV0VHlwZUZpZWxkID0gY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZUZpZWxkc1tmaWVsZF07XG4gICAgICB9IGVsc2UgaWYgKGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVGaWVsZHMpIHtcbiAgICAgICAgaW5wdXRUeXBlRmllbGQgPSBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlRmllbGRzW2ZpZWxkXTtcbiAgICAgIH1cbiAgICAgIGlmIChpbnB1dFR5cGVGaWVsZCkge1xuICAgICAgICBzd2l0Y2ggKHRydWUpIHtcbiAgICAgICAgICBjYXNlIGlucHV0VHlwZUZpZWxkLnR5cGUgPT09IGRlZmF1bHRHcmFwaFFMVHlwZXMuR0VPX1BPSU5UX0lOUFVUOlxuICAgICAgICAgICAgaWYgKGZpZWxkc1tmaWVsZF0gPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSA9IHsgX19vcDogJ0RlbGV0ZScgfTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmaWVsZHNbZmllbGRdID0gdHJhbnNmb3JtZXJzLmdlb1BvaW50KGZpZWxkc1tmaWVsZF0pO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSBpbnB1dFR5cGVGaWVsZC50eXBlID09PSBkZWZhdWx0R3JhcGhRTFR5cGVzLlBPTFlHT05fSU5QVVQ6XG4gICAgICAgICAgICBpZiAoZmllbGRzW2ZpZWxkXSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICBmaWVsZHNbZmllbGRdID0geyBfX29wOiAnRGVsZXRlJyB9O1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZpZWxkc1tmaWVsZF0gPSB0cmFuc2Zvcm1lcnMucG9seWdvbihmaWVsZHNbZmllbGRdKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgaW5wdXRUeXBlRmllbGQudHlwZSA9PT0gZGVmYXVsdEdyYXBoUUxUeXBlcy5GSUxFX0lOUFVUOlxuICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSA9IGF3YWl0IHRyYW5zZm9ybWVycy5maWxlKGZpZWxkc1tmaWVsZF0sIHJlcSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUmVsYXRpb24nOlxuICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSA9IGF3YWl0IHRyYW5zZm9ybWVycy5yZWxhdGlvbihcbiAgICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzLFxuICAgICAgICAgICAgICBmaWVsZCxcbiAgICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgICAgICByZXFcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9pbnRlcic6XG4gICAgICAgICAgICBpZiAoZmllbGRzW2ZpZWxkXSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICBmaWVsZHNbZmllbGRdID0geyBfX29wOiAnRGVsZXRlJyB9O1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZpZWxkc1tmaWVsZF0gPSBhd2FpdCB0cmFuc2Zvcm1lcnMucG9pbnRlcihcbiAgICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzLFxuICAgICAgICAgICAgICBmaWVsZCxcbiAgICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgICAgICByZXFcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgaWYgKGZpZWxkc1tmaWVsZF0gPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSA9IHsgX19vcDogJ0RlbGV0ZScgfTtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcbiAgICBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gICAgaWYgKGZpZWxkcy5BQ0wpIGZpZWxkcy5BQ0wgPSB0cmFuc2Zvcm1lcnMuQUNMKGZpZWxkcy5BQ0wpO1xuICB9XG4gIHJldHVybiBmaWVsZHM7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1lcnMgPSB7XG4gIGZpbGU6IGFzeW5jIChpbnB1dCwgeyBjb25maWcgfSkgPT4ge1xuICAgIGlmIChpbnB1dCA9PT0gbnVsbCkge1xuICAgICAgcmV0dXJuIHsgX19vcDogJ0RlbGV0ZScgfTtcbiAgICB9XG4gICAgY29uc3QgeyBmaWxlLCB1cGxvYWQgfSA9IGlucHV0O1xuICAgIGlmICh1cGxvYWQpIHtcbiAgICAgIGNvbnN0IHsgZmlsZUluZm8gfSA9IGF3YWl0IGhhbmRsZVVwbG9hZCh1cGxvYWQsIGNvbmZpZyk7XG4gICAgICByZXR1cm4geyAuLi5maWxlSW5mbywgX190eXBlOiAnRmlsZScgfTtcbiAgICB9IGVsc2UgaWYgKGZpbGUgJiYgZmlsZS5uYW1lKSB7XG4gICAgICByZXR1cm4geyBuYW1lOiBmaWxlLm5hbWUsIF9fdHlwZTogJ0ZpbGUnLCB1cmw6IGZpbGUudXJsIH07XG4gICAgfVxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsICdJbnZhbGlkIGZpbGUgdXBsb2FkLicpO1xuICB9LFxuICBwb2x5Z29uOiB2YWx1ZSA9PiAoe1xuICAgIF9fdHlwZTogJ1BvbHlnb24nLFxuICAgIGNvb3JkaW5hdGVzOiB2YWx1ZS5tYXAoZ2VvUG9pbnQgPT4gW2dlb1BvaW50LmxhdGl0dWRlLCBnZW9Qb2ludC5sb25naXR1ZGVdKSxcbiAgfSksXG4gIGdlb1BvaW50OiB2YWx1ZSA9PiAoe1xuICAgIC4uLnZhbHVlLFxuICAgIF9fdHlwZTogJ0dlb1BvaW50JyxcbiAgfSksXG4gIEFDTDogdmFsdWUgPT4ge1xuICAgIGNvbnN0IHBhcnNlQUNMID0ge307XG4gICAgaWYgKHZhbHVlLnB1YmxpYykge1xuICAgICAgcGFyc2VBQ0xbJyonXSA9IHtcbiAgICAgICAgcmVhZDogdmFsdWUucHVibGljLnJlYWQsXG4gICAgICAgIHdyaXRlOiB2YWx1ZS5wdWJsaWMud3JpdGUsXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAodmFsdWUudXNlcnMpIHtcbiAgICAgIHZhbHVlLnVzZXJzLmZvckVhY2gocnVsZSA9PiB7XG4gICAgICAgIGNvbnN0IGdsb2JhbElkT2JqZWN0ID0gZnJvbUdsb2JhbElkKHJ1bGUudXNlcklkKTtcbiAgICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09ICdfVXNlcicpIHtcbiAgICAgICAgICBydWxlLnVzZXJJZCA9IGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgICB9XG4gICAgICAgIHBhcnNlQUNMW3J1bGUudXNlcklkXSA9IHtcbiAgICAgICAgICByZWFkOiBydWxlLnJlYWQsXG4gICAgICAgICAgd3JpdGU6IHJ1bGUud3JpdGUsXG4gICAgICAgIH07XG4gICAgICB9KTtcbiAgICB9XG4gICAgaWYgKHZhbHVlLnJvbGVzKSB7XG4gICAgICB2YWx1ZS5yb2xlcy5mb3JFYWNoKHJ1bGUgPT4ge1xuICAgICAgICBwYXJzZUFDTFtgcm9sZToke3J1bGUucm9sZU5hbWV9YF0gPSB7XG4gICAgICAgICAgcmVhZDogcnVsZS5yZWFkLFxuICAgICAgICAgIHdyaXRlOiBydWxlLndyaXRlLFxuICAgICAgICB9O1xuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiBwYXJzZUFDTDtcbiAgfSxcbiAgcmVsYXRpb246IGFzeW5jICh0YXJnZXRDbGFzcywgZmllbGQsIHZhbHVlLCBwYXJzZUdyYXBoUUxTY2hlbWEsIHsgY29uZmlnLCBhdXRoLCBpbmZvIH0pID0+IHtcbiAgICBpZiAoT2JqZWN0LmtleXModmFsdWUpLmxlbmd0aCA9PT0gMClcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9QT0lOVEVSLFxuICAgICAgICBgWW91IG5lZWQgdG8gcHJvdmlkZSBhdCBsZWFzdCBvbmUgb3BlcmF0aW9uIG9uIHRoZSByZWxhdGlvbiBtdXRhdGlvbiBvZiBmaWVsZCAke2ZpZWxkfWBcbiAgICAgICk7XG5cbiAgICBjb25zdCBvcCA9IHtcbiAgICAgIF9fb3A6ICdCYXRjaCcsXG4gICAgICBvcHM6IFtdLFxuICAgIH07XG4gICAgbGV0IG5lc3RlZE9iamVjdHNUb0FkZCA9IFtdO1xuXG4gICAgaWYgKHZhbHVlLmNyZWF0ZUFuZEFkZCkge1xuICAgICAgbmVzdGVkT2JqZWN0c1RvQWRkID0gKFxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgICAgICB2YWx1ZS5jcmVhdGVBbmRBZGQubWFwKGFzeW5jIGlucHV0ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ2NyZWF0ZScsIGlucHV0LCB7XG4gICAgICAgICAgICAgIGNsYXNzTmFtZTogdGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgICAgICAgcmVxOiB7IGNvbmZpZywgYXV0aCwgaW5mbyB9LFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gb2JqZWN0c011dGF0aW9ucy5jcmVhdGVPYmplY3QodGFyZ2V0Q2xhc3MsIHBhcnNlRmllbGRzLCBjb25maWcsIGF1dGgsIGluZm8pO1xuICAgICAgICAgIH0pXG4gICAgICAgIClcbiAgICAgICkubWFwKG9iamVjdCA9PiAoe1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgb2JqZWN0SWQ6IG9iamVjdC5vYmplY3RJZCxcbiAgICAgIH0pKTtcbiAgICB9XG5cbiAgICBpZiAodmFsdWUuYWRkIHx8IG5lc3RlZE9iamVjdHNUb0FkZC5sZW5ndGggPiAwKSB7XG4gICAgICBpZiAoIXZhbHVlLmFkZCkgdmFsdWUuYWRkID0gW107XG4gICAgICB2YWx1ZS5hZGQgPSB2YWx1ZS5hZGQubWFwKGlucHV0ID0+IHtcbiAgICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQoaW5wdXQpO1xuICAgICAgICBpZiAoZ2xvYmFsSWRPYmplY3QudHlwZSA9PT0gdGFyZ2V0Q2xhc3MpIHtcbiAgICAgICAgICBpbnB1dCA9IGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgICBvYmplY3RJZDogaW5wdXQsXG4gICAgICAgIH07XG4gICAgICB9KTtcbiAgICAgIG9wLm9wcy5wdXNoKHtcbiAgICAgICAgX19vcDogJ0FkZFJlbGF0aW9uJyxcbiAgICAgICAgb2JqZWN0czogWy4uLnZhbHVlLmFkZCwgLi4ubmVzdGVkT2JqZWN0c1RvQWRkXSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmICh2YWx1ZS5yZW1vdmUpIHtcbiAgICAgIG9wLm9wcy5wdXNoKHtcbiAgICAgICAgX19vcDogJ1JlbW92ZVJlbGF0aW9uJyxcbiAgICAgICAgb2JqZWN0czogdmFsdWUucmVtb3ZlLm1hcChpbnB1dCA9PiB7XG4gICAgICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQoaW5wdXQpO1xuICAgICAgICAgIGlmIChnbG9iYWxJZE9iamVjdC50eXBlID09PSB0YXJnZXRDbGFzcykge1xuICAgICAgICAgICAgaW5wdXQgPSBnbG9iYWxJZE9iamVjdC5pZDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgICAgIG9iamVjdElkOiBpbnB1dCxcbiAgICAgICAgICB9O1xuICAgICAgICB9KSxcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gb3A7XG4gIH0sXG4gIHBvaW50ZXI6IGFzeW5jICh0YXJnZXRDbGFzcywgZmllbGQsIHZhbHVlLCBwYXJzZUdyYXBoUUxTY2hlbWEsIHsgY29uZmlnLCBhdXRoLCBpbmZvIH0pID0+IHtcbiAgICBpZiAoT2JqZWN0LmtleXModmFsdWUpLmxlbmd0aCA+IDEgfHwgT2JqZWN0LmtleXModmFsdWUpLmxlbmd0aCA9PT0gMClcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9QT0lOVEVSLFxuICAgICAgICBgWW91IG5lZWQgdG8gcHJvdmlkZSBsaW5rIE9SIGNyZWF0ZUxpbmsgb24gdGhlIHBvaW50ZXIgbXV0YXRpb24gb2YgZmllbGQgJHtmaWVsZH1gXG4gICAgICApO1xuXG4gICAgbGV0IG5lc3RlZE9iamVjdFRvQWRkO1xuICAgIGlmICh2YWx1ZS5jcmVhdGVBbmRMaW5rKSB7XG4gICAgICBjb25zdCBwYXJzZUZpZWxkcyA9IGF3YWl0IHRyYW5zZm9ybVR5cGVzKCdjcmVhdGUnLCB2YWx1ZS5jcmVhdGVBbmRMaW5rLCB7XG4gICAgICAgIGNsYXNzTmFtZTogdGFyZ2V0Q2xhc3MsXG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgcmVxOiB7IGNvbmZpZywgYXV0aCwgaW5mbyB9LFxuICAgICAgfSk7XG4gICAgICBuZXN0ZWRPYmplY3RUb0FkZCA9IGF3YWl0IG9iamVjdHNNdXRhdGlvbnMuY3JlYXRlT2JqZWN0KFxuICAgICAgICB0YXJnZXRDbGFzcyxcbiAgICAgICAgcGFyc2VGaWVsZHMsXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgYXV0aCxcbiAgICAgICAgaW5mb1xuICAgICAgKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6IHRhcmdldENsYXNzLFxuICAgICAgICBvYmplY3RJZDogbmVzdGVkT2JqZWN0VG9BZGQub2JqZWN0SWQsXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAodmFsdWUubGluaykge1xuICAgICAgbGV0IG9iamVjdElkID0gdmFsdWUubGluaztcbiAgICAgIGNvbnN0IGdsb2JhbElkT2JqZWN0ID0gZnJvbUdsb2JhbElkKG9iamVjdElkKTtcbiAgICAgIGlmIChnbG9iYWxJZE9iamVjdC50eXBlID09PSB0YXJnZXRDbGFzcykge1xuICAgICAgICBvYmplY3RJZCA9IGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogdGFyZ2V0Q2xhc3MsXG4gICAgICAgIG9iamVjdElkLFxuICAgICAgfTtcbiAgICB9XG4gIH0sXG59O1xuXG5leHBvcnQgeyB0cmFuc2Zvcm1UeXBlcyB9O1xuIl19