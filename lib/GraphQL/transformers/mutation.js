"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.transformTypes = void 0;

var _node = _interopRequireDefault(require("parse/node"));

var _graphqlRelay = require("graphql-relay");

var defaultGraphQLTypes = _interopRequireWildcard(require("../loaders/defaultGraphQLTypes"));

var objectsMutations = _interopRequireWildcard(require("../helpers/objectsMutations"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

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
            fields[field] = transformers.geoPoint(fields[field]);
            break;

          case inputTypeField.type === defaultGraphQLTypes.POLYGON_INPUT:
            fields[field] = transformers.polygon(fields[field]);
            break;

          case parseClass.fields[field].type === 'Relation':
            fields[field] = await transformers.relation(parseClass.fields[field].targetClass, field, fields[field], parseGraphQLSchema, req);
            break;

          case parseClass.fields[field].type === 'Pointer':
            fields[field] = await transformers.pointer(parseClass.fields[field].targetClass, field, fields[field], parseGraphQLSchema, req);
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
  polygon: value => ({
    __type: 'Polygon',
    coordinates: value.map(geoPoint => [geoPoint.latitude, geoPoint.longitude])
  }),
  geoPoint: value => _objectSpread({}, value, {
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
    if (Object.keys(value) === 0) throw new _node.default.Error(_node.default.Error.INVALID_POINTER, `You need to provide at least one operation on the relation mutation of field ${field}`);
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
    if (Object.keys(value) > 1 || Object.keys(value) === 0) throw new _node.default.Error(_node.default.Error.INVALID_POINTER, `You need to provide link OR createLink on the pointer mutation of field ${field}`);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML3RyYW5zZm9ybWVycy9tdXRhdGlvbi5qcyJdLCJuYW1lcyI6WyJ0cmFuc2Zvcm1UeXBlcyIsImlucHV0VHlwZSIsImZpZWxkcyIsImNsYXNzTmFtZSIsInBhcnNlR3JhcGhRTFNjaGVtYSIsInJlcSIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGUiLCJjbGFzc0dyYXBoUUxVcGRhdGVUeXBlIiwiY29uZmlnIiwiaXNDcmVhdGVFbmFibGVkIiwiaXNVcGRhdGVFbmFibGVkIiwicGFyc2VDbGFzc1R5cGVzIiwicGFyc2VDbGFzcyIsInBhcnNlQ2xhc3NlcyIsImZpbmQiLCJjbGF6eiIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGVGaWVsZHMiLCJnZXRGaWVsZHMiLCJjbGFzc0dyYXBoUUxVcGRhdGVUeXBlRmllbGRzIiwicHJvbWlzZXMiLCJPYmplY3QiLCJrZXlzIiwibWFwIiwiZmllbGQiLCJpbnB1dFR5cGVGaWVsZCIsInR5cGUiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiR0VPX1BPSU5UX0lOUFVUIiwidHJhbnNmb3JtZXJzIiwiZ2VvUG9pbnQiLCJQT0xZR09OX0lOUFVUIiwicG9seWdvbiIsInJlbGF0aW9uIiwidGFyZ2V0Q2xhc3MiLCJwb2ludGVyIiwiUHJvbWlzZSIsImFsbCIsIkFDTCIsInZhbHVlIiwiX190eXBlIiwiY29vcmRpbmF0ZXMiLCJsYXRpdHVkZSIsImxvbmdpdHVkZSIsInBhcnNlQUNMIiwicHVibGljIiwicmVhZCIsIndyaXRlIiwidXNlcnMiLCJmb3JFYWNoIiwicnVsZSIsInVzZXJJZCIsInJvbGVzIiwicm9sZU5hbWUiLCJhdXRoIiwiaW5mbyIsIlBhcnNlIiwiRXJyb3IiLCJJTlZBTElEX1BPSU5URVIiLCJvcCIsIl9fb3AiLCJvcHMiLCJuZXN0ZWRPYmplY3RzVG9BZGQiLCJjcmVhdGVBbmRBZGQiLCJpbnB1dCIsInBhcnNlRmllbGRzIiwib2JqZWN0c011dGF0aW9ucyIsImNyZWF0ZU9iamVjdCIsIm9iamVjdCIsIm9iamVjdElkIiwiYWRkIiwibGVuZ3RoIiwiZ2xvYmFsSWRPYmplY3QiLCJpZCIsInB1c2giLCJvYmplY3RzIiwicmVtb3ZlIiwibmVzdGVkT2JqZWN0VG9BZGQiLCJjcmVhdGVBbmRMaW5rIiwibGluayJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7Ozs7Ozs7OztBQUVBLE1BQU1BLGNBQWMsR0FBRyxPQUNyQkMsU0FEcUIsRUFFckJDLE1BRnFCLEVBR3JCO0FBQUVDLEVBQUFBLFNBQUY7QUFBYUMsRUFBQUEsa0JBQWI7QUFBaUNDLEVBQUFBO0FBQWpDLENBSHFCLEtBSWxCO0FBQ0gsUUFBTTtBQUNKQyxJQUFBQSxzQkFESTtBQUVKQyxJQUFBQSxzQkFGSTtBQUdKQyxJQUFBQSxNQUFNLEVBQUU7QUFBRUMsTUFBQUEsZUFBRjtBQUFtQkMsTUFBQUE7QUFBbkI7QUFISixNQUlGTixrQkFBa0IsQ0FBQ08sZUFBbkIsQ0FBbUNSLFNBQW5DLENBSko7QUFLQSxRQUFNUyxVQUFVLEdBQUdSLGtCQUFrQixDQUFDUyxZQUFuQixDQUFnQ0MsSUFBaEMsQ0FDakJDLEtBQUssSUFBSUEsS0FBSyxDQUFDWixTQUFOLEtBQW9CQSxTQURaLENBQW5COztBQUdBLE1BQUlELE1BQUosRUFBWTtBQUNWLFVBQU1jLDRCQUE0QixHQUNoQ1AsZUFBZSxJQUFJSCxzQkFBbkIsR0FDSUEsc0JBQXNCLENBQUNXLFNBQXZCLEVBREosR0FFSSxJQUhOO0FBSUEsVUFBTUMsNEJBQTRCLEdBQ2hDUixlQUFlLElBQUlILHNCQUFuQixHQUNJQSxzQkFBc0IsQ0FBQ1UsU0FBdkIsRUFESixHQUVJLElBSE47QUFJQSxVQUFNRSxRQUFRLEdBQUdDLE1BQU0sQ0FBQ0MsSUFBUCxDQUFZbkIsTUFBWixFQUFvQm9CLEdBQXBCLENBQXdCLE1BQU1DLEtBQU4sSUFBZTtBQUN0RCxVQUFJQyxjQUFKOztBQUNBLFVBQUl2QixTQUFTLEtBQUssUUFBZCxJQUEwQmUsNEJBQTlCLEVBQTRE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QXdCUSxXQUE1QixFQUF5QztBQUN2Q21DLFFBQUFBLFFBQVEsR0FBR0csY0FBYyxDQUFDQyxFQUExQjtBQUNEOztBQUNELGFBQU87QUFDTGpDLFFBQUFBLE1BQU0sRUFBRSxTQURIO0FBRUxwQyxRQUFBQSxTQUFTLEVBQUU4QixXQUZOO0FBR0xtQyxRQUFBQTtBQUhLLE9BQVA7QUFLRDtBQUNGO0FBL0prQixDQUFyQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7IGZyb21HbG9iYWxJZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuLi9sb2FkZXJzL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0ICogYXMgb2JqZWN0c011dGF0aW9ucyBmcm9tICcuLi9oZWxwZXJzL29iamVjdHNNdXRhdGlvbnMnO1xuXG5jb25zdCB0cmFuc2Zvcm1UeXBlcyA9IGFzeW5jIChcbiAgaW5wdXRUeXBlOiAnY3JlYXRlJyB8ICd1cGRhdGUnLFxuICBmaWVsZHMsXG4gIHsgY2xhc3NOYW1lLCBwYXJzZUdyYXBoUUxTY2hlbWEsIHJlcSB9XG4pID0+IHtcbiAgY29uc3Qge1xuICAgIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUsXG4gICAgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSxcbiAgICBjb25maWc6IHsgaXNDcmVhdGVFbmFibGVkLCBpc1VwZGF0ZUVuYWJsZWQgfSxcbiAgfSA9IHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbY2xhc3NOYW1lXTtcbiAgY29uc3QgcGFyc2VDbGFzcyA9IHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXMuZmluZChcbiAgICBjbGF6eiA9PiBjbGF6ei5jbGFzc05hbWUgPT09IGNsYXNzTmFtZVxuICApO1xuICBpZiAoZmllbGRzKSB7XG4gICAgY29uc3QgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZUZpZWxkcyA9XG4gICAgICBpc0NyZWF0ZUVuYWJsZWQgJiYgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZVxuICAgICAgICA/IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUuZ2V0RmllbGRzKClcbiAgICAgICAgOiBudWxsO1xuICAgIGNvbnN0IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVGaWVsZHMgPVxuICAgICAgaXNVcGRhdGVFbmFibGVkICYmIGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVcbiAgICAgICAgPyBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlLmdldEZpZWxkcygpXG4gICAgICAgIDogbnVsbDtcbiAgICBjb25zdCBwcm9taXNlcyA9IE9iamVjdC5rZXlzKGZpZWxkcykubWFwKGFzeW5jIGZpZWxkID0+IHtcbiAgICAgIGxldCBpbnB1dFR5cGVGaWVsZDtcbiAgICAgIGlmIChpbnB1dFR5cGUgPT09ICdjcmVhdGUnICYmIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGVGaWVsZHMpIHtcbiAgICAgICAgaW5wdXRUeXBlRmllbGQgPSBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlRmllbGRzW2ZpZWxkXTtcbiAgICAgIH0gZWxzZSBpZiAoY2xhc3NHcmFwaFFMVXBkYXRlVHlwZUZpZWxkcykge1xuICAgICAgICBpbnB1dFR5cGVGaWVsZCA9IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVGaWVsZHNbZmllbGRdO1xuICAgICAgfVxuICAgICAgaWYgKGlucHV0VHlwZUZpZWxkKSB7XG4gICAgICAgIHN3aXRjaCAodHJ1ZSkge1xuICAgICAgICAgIGNhc2UgaW5wdXRUeXBlRmllbGQudHlwZSA9PT0gZGVmYXVsdEdyYXBoUUxUeXBlcy5HRU9fUE9JTlRfSU5QVVQ6XG4gICAgICAgICAgICBmaWVsZHNbZmllbGRdID0gdHJhbnNmb3JtZXJzLmdlb1BvaW50KGZpZWxkc1tmaWVsZF0pO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSBpbnB1dFR5cGVGaWVsZC50eXBlID09PSBkZWZhdWx0R3JhcGhRTFR5cGVzLlBPTFlHT05fSU5QVVQ6XG4gICAgICAgICAgICBmaWVsZHNbZmllbGRdID0gdHJhbnNmb3JtZXJzLnBvbHlnb24oZmllbGRzW2ZpZWxkXSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUmVsYXRpb24nOlxuICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSA9IGF3YWl0IHRyYW5zZm9ybWVycy5yZWxhdGlvbihcbiAgICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzLFxuICAgICAgICAgICAgICBmaWVsZCxcbiAgICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgICAgICByZXFcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9pbnRlcic6XG4gICAgICAgICAgICBmaWVsZHNbZmllbGRdID0gYXdhaXQgdHJhbnNmb3JtZXJzLnBvaW50ZXIoXG4gICAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgICAgICAgZmllbGQsXG4gICAgICAgICAgICAgIGZpZWxkc1tmaWVsZF0sXG4gICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgICAgICAgcmVxXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcbiAgICBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gICAgaWYgKGZpZWxkcy5BQ0wpIGZpZWxkcy5BQ0wgPSB0cmFuc2Zvcm1lcnMuQUNMKGZpZWxkcy5BQ0wpO1xuICB9XG4gIHJldHVybiBmaWVsZHM7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1lcnMgPSB7XG4gIHBvbHlnb246IHZhbHVlID0+ICh7XG4gICAgX190eXBlOiAnUG9seWdvbicsXG4gICAgY29vcmRpbmF0ZXM6IHZhbHVlLm1hcChnZW9Qb2ludCA9PiBbZ2VvUG9pbnQubGF0aXR1ZGUsIGdlb1BvaW50LmxvbmdpdHVkZV0pLFxuICB9KSxcbiAgZ2VvUG9pbnQ6IHZhbHVlID0+ICh7XG4gICAgLi4udmFsdWUsXG4gICAgX190eXBlOiAnR2VvUG9pbnQnLFxuICB9KSxcbiAgQUNMOiB2YWx1ZSA9PiB7XG4gICAgY29uc3QgcGFyc2VBQ0wgPSB7fTtcbiAgICBpZiAodmFsdWUucHVibGljKSB7XG4gICAgICBwYXJzZUFDTFsnKiddID0ge1xuICAgICAgICByZWFkOiB2YWx1ZS5wdWJsaWMucmVhZCxcbiAgICAgICAgd3JpdGU6IHZhbHVlLnB1YmxpYy53cml0ZSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmICh2YWx1ZS51c2Vycykge1xuICAgICAgdmFsdWUudXNlcnMuZm9yRWFjaChydWxlID0+IHtcbiAgICAgICAgcGFyc2VBQ0xbcnVsZS51c2VySWRdID0ge1xuICAgICAgICAgIHJlYWQ6IHJ1bGUucmVhZCxcbiAgICAgICAgICB3cml0ZTogcnVsZS53cml0ZSxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICAgIH1cbiAgICBpZiAodmFsdWUucm9sZXMpIHtcbiAgICAgIHZhbHVlLnJvbGVzLmZvckVhY2gocnVsZSA9PiB7XG4gICAgICAgIHBhcnNlQUNMW2Byb2xlOiR7cnVsZS5yb2xlTmFtZX1gXSA9IHtcbiAgICAgICAgICByZWFkOiBydWxlLnJlYWQsXG4gICAgICAgICAgd3JpdGU6IHJ1bGUud3JpdGUsXG4gICAgICAgIH07XG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIHBhcnNlQUNMO1xuICB9LFxuICByZWxhdGlvbjogYXN5bmMgKFxuICAgIHRhcmdldENsYXNzLFxuICAgIGZpZWxkLFxuICAgIHZhbHVlLFxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICB7IGNvbmZpZywgYXV0aCwgaW5mbyB9XG4gICkgPT4ge1xuICAgIGlmIChPYmplY3Qua2V5cyh2YWx1ZSkgPT09IDApXG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUE9JTlRFUixcbiAgICAgICAgYFlvdSBuZWVkIHRvIHByb3ZpZGUgYXQgbGVhc3Qgb25lIG9wZXJhdGlvbiBvbiB0aGUgcmVsYXRpb24gbXV0YXRpb24gb2YgZmllbGQgJHtmaWVsZH1gXG4gICAgICApO1xuXG4gICAgY29uc3Qgb3AgPSB7XG4gICAgICBfX29wOiAnQmF0Y2gnLFxuICAgICAgb3BzOiBbXSxcbiAgICB9O1xuICAgIGxldCBuZXN0ZWRPYmplY3RzVG9BZGQgPSBbXTtcblxuICAgIGlmICh2YWx1ZS5jcmVhdGVBbmRBZGQpIHtcbiAgICAgIG5lc3RlZE9iamVjdHNUb0FkZCA9IChhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgICAgdmFsdWUuY3JlYXRlQW5kQWRkLm1hcChhc3luYyBpbnB1dCA9PiB7XG4gICAgICAgICAgY29uc3QgcGFyc2VGaWVsZHMgPSBhd2FpdCB0cmFuc2Zvcm1UeXBlcygnY3JlYXRlJywgaW5wdXQsIHtcbiAgICAgICAgICAgIGNsYXNzTmFtZTogdGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gICAgICAgICAgICByZXE6IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0sXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuIG9iamVjdHNNdXRhdGlvbnMuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICAgdGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICBwYXJzZUZpZWxkcyxcbiAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBpbmZvXG4gICAgICAgICAgKTtcbiAgICAgICAgfSlcbiAgICAgICkpLm1hcChvYmplY3QgPT4gKHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogdGFyZ2V0Q2xhc3MsXG4gICAgICAgIG9iamVjdElkOiBvYmplY3Qub2JqZWN0SWQsXG4gICAgICB9KSk7XG4gICAgfVxuXG4gICAgaWYgKHZhbHVlLmFkZCB8fCBuZXN0ZWRPYmplY3RzVG9BZGQubGVuZ3RoID4gMCkge1xuICAgICAgaWYgKCF2YWx1ZS5hZGQpIHZhbHVlLmFkZCA9IFtdO1xuICAgICAgdmFsdWUuYWRkID0gdmFsdWUuYWRkLm1hcChpbnB1dCA9PiB7XG4gICAgICAgIGNvbnN0IGdsb2JhbElkT2JqZWN0ID0gZnJvbUdsb2JhbElkKGlucHV0KTtcbiAgICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IHRhcmdldENsYXNzKSB7XG4gICAgICAgICAgaW5wdXQgPSBnbG9iYWxJZE9iamVjdC5pZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgIGNsYXNzTmFtZTogdGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgb2JqZWN0SWQ6IGlucHV0LFxuICAgICAgICB9O1xuICAgICAgfSk7XG4gICAgICBvcC5vcHMucHVzaCh7XG4gICAgICAgIF9fb3A6ICdBZGRSZWxhdGlvbicsXG4gICAgICAgIG9iamVjdHM6IFsuLi52YWx1ZS5hZGQsIC4uLm5lc3RlZE9iamVjdHNUb0FkZF0sXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBpZiAodmFsdWUucmVtb3ZlKSB7XG4gICAgICBvcC5vcHMucHVzaCh7XG4gICAgICAgIF9fb3A6ICdSZW1vdmVSZWxhdGlvbicsXG4gICAgICAgIG9iamVjdHM6IHZhbHVlLnJlbW92ZS5tYXAoaW5wdXQgPT4ge1xuICAgICAgICAgIGNvbnN0IGdsb2JhbElkT2JqZWN0ID0gZnJvbUdsb2JhbElkKGlucHV0KTtcbiAgICAgICAgICBpZiAoZ2xvYmFsSWRPYmplY3QudHlwZSA9PT0gdGFyZ2V0Q2xhc3MpIHtcbiAgICAgICAgICAgIGlucHV0ID0gZ2xvYmFsSWRPYmplY3QuaWQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICAgIGNsYXNzTmFtZTogdGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICBvYmplY3RJZDogaW5wdXQsXG4gICAgICAgICAgfTtcbiAgICAgICAgfSksXG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIG9wO1xuICB9LFxuICBwb2ludGVyOiBhc3luYyAoXG4gICAgdGFyZ2V0Q2xhc3MsXG4gICAgZmllbGQsXG4gICAgdmFsdWUsXG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgIHsgY29uZmlnLCBhdXRoLCBpbmZvIH1cbiAgKSA9PiB7XG4gICAgaWYgKE9iamVjdC5rZXlzKHZhbHVlKSA+IDEgfHwgT2JqZWN0LmtleXModmFsdWUpID09PSAwKVxuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1BPSU5URVIsXG4gICAgICAgIGBZb3UgbmVlZCB0byBwcm92aWRlIGxpbmsgT1IgY3JlYXRlTGluayBvbiB0aGUgcG9pbnRlciBtdXRhdGlvbiBvZiBmaWVsZCAke2ZpZWxkfWBcbiAgICAgICk7XG5cbiAgICBsZXQgbmVzdGVkT2JqZWN0VG9BZGQ7XG4gICAgaWYgKHZhbHVlLmNyZWF0ZUFuZExpbmspIHtcbiAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ2NyZWF0ZScsIHZhbHVlLmNyZWF0ZUFuZExpbmssIHtcbiAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICByZXE6IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0sXG4gICAgICB9KTtcbiAgICAgIG5lc3RlZE9iamVjdFRvQWRkID0gYXdhaXQgb2JqZWN0c011dGF0aW9ucy5jcmVhdGVPYmplY3QoXG4gICAgICAgIHRhcmdldENsYXNzLFxuICAgICAgICBwYXJzZUZpZWxkcyxcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBhdXRoLFxuICAgICAgICBpbmZvXG4gICAgICApO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogdGFyZ2V0Q2xhc3MsXG4gICAgICAgIG9iamVjdElkOiBuZXN0ZWRPYmplY3RUb0FkZC5vYmplY3RJZCxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmICh2YWx1ZS5saW5rKSB7XG4gICAgICBsZXQgb2JqZWN0SWQgPSB2YWx1ZS5saW5rO1xuICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQob2JqZWN0SWQpO1xuICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IHRhcmdldENsYXNzKSB7XG4gICAgICAgIG9iamVjdElkID0gZ2xvYmFsSWRPYmplY3QuaWQ7XG4gICAgICB9XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgb2JqZWN0SWQsXG4gICAgICB9O1xuICAgIH1cbiAgfSxcbn07XG5cbmV4cG9ydCB7IHRyYW5zZm9ybVR5cGVzIH07XG4iXX0=