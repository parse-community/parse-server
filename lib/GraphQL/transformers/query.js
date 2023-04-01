"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.transformQueryInputToParse = exports.transformQueryConstraintInputToParse = void 0;
var _graphqlRelay = require("graphql-relay");
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
const parseQueryMap = {
  OR: '$or',
  AND: '$and',
  NOR: '$nor'
};
const parseConstraintMap = {
  equalTo: '$eq',
  notEqualTo: '$ne',
  lessThan: '$lt',
  lessThanOrEqualTo: '$lte',
  greaterThan: '$gt',
  greaterThanOrEqualTo: '$gte',
  in: '$in',
  notIn: '$nin',
  exists: '$exists',
  inQueryKey: '$select',
  notInQueryKey: '$dontSelect',
  inQuery: '$inQuery',
  notInQuery: '$notInQuery',
  containedBy: '$containedBy',
  contains: '$all',
  matchesRegex: '$regex',
  options: '$options',
  text: '$text',
  search: '$search',
  term: '$term',
  language: '$language',
  caseSensitive: '$caseSensitive',
  diacriticSensitive: '$diacriticSensitive',
  nearSphere: '$nearSphere',
  maxDistance: '$maxDistance',
  maxDistanceInRadians: '$maxDistanceInRadians',
  maxDistanceInMiles: '$maxDistanceInMiles',
  maxDistanceInKilometers: '$maxDistanceInKilometers',
  within: '$within',
  box: '$box',
  geoWithin: '$geoWithin',
  polygon: '$polygon',
  centerSphere: '$centerSphere',
  geoIntersects: '$geoIntersects',
  point: '$point'
};
const transformQueryConstraintInputToParse = (constraints, parentFieldName, className, parentConstraints, parseClasses) => {
  const fields = parseClasses[className].fields;
  if (parentFieldName === 'id' && className) {
    Object.keys(constraints).forEach(constraintName => {
      const constraintValue = constraints[constraintName];
      if (typeof constraintValue === 'string') {
        const globalIdObject = (0, _graphqlRelay.fromGlobalId)(constraintValue);
        if (globalIdObject.type === className) {
          constraints[constraintName] = globalIdObject.id;
        }
      } else if (Array.isArray(constraintValue)) {
        constraints[constraintName] = constraintValue.map(value => {
          const globalIdObject = (0, _graphqlRelay.fromGlobalId)(value);
          if (globalIdObject.type === className) {
            return globalIdObject.id;
          }
          return value;
        });
      }
    });
    parentConstraints.objectId = constraints;
    delete parentConstraints.id;
  }
  Object.keys(constraints).forEach(fieldName => {
    let fieldValue = constraints[fieldName];
    if (parseConstraintMap[fieldName]) {
      constraints[parseConstraintMap[fieldName]] = constraints[fieldName];
      delete constraints[fieldName];
    }
    /**
     * If we have a key-value pair, we need to change the way the constraint is structured.
     *
     * Example:
     *   From:
     *   {
     *     "someField": {
     *       "lessThan": {
     *         "key":"foo.bar",
     *         "value": 100
     *       },
     *       "greaterThan": {
     *         "key":"foo.bar",
     *         "value": 10
     *       }
     *     }
     *   }
     *
     *   To:
     *   {
     *     "someField.foo.bar": {
     *       "$lt": 100,
     *       "$gt": 10
     *      }
     *   }
     */
    if (fieldValue.key && fieldValue.value !== undefined && parentConstraints && parentFieldName) {
      delete parentConstraints[parentFieldName];
      parentConstraints[`${parentFieldName}.${fieldValue.key}`] = _objectSpread(_objectSpread({}, parentConstraints[`${parentFieldName}.${fieldValue.key}`]), {}, {
        [parseConstraintMap[fieldName]]: fieldValue.value
      });
    } else if (fields[parentFieldName] && (fields[parentFieldName].type === 'Pointer' || fields[parentFieldName].type === 'Relation')) {
      const {
        targetClass
      } = fields[parentFieldName];
      if (fieldName === 'exists') {
        if (fields[parentFieldName].type === 'Relation') {
          const whereTarget = fieldValue ? 'where' : 'notWhere';
          if (constraints[whereTarget]) {
            if (constraints[whereTarget].objectId) {
              constraints[whereTarget].objectId = _objectSpread(_objectSpread({}, constraints[whereTarget].objectId), {}, {
                $exists: fieldValue
              });
            } else {
              constraints[whereTarget].objectId = {
                $exists: fieldValue
              };
            }
          } else {
            const parseWhereTarget = fieldValue ? '$inQuery' : '$notInQuery';
            parentConstraints[parentFieldName][parseWhereTarget] = {
              where: {
                objectId: {
                  $exists: true
                }
              },
              className: targetClass
            };
          }
          delete constraints.$exists;
        } else {
          parentConstraints[parentFieldName].$exists = fieldValue;
        }
        return;
      }
      switch (fieldName) {
        case 'have':
          parentConstraints[parentFieldName].$inQuery = {
            where: fieldValue,
            className: targetClass
          };
          transformQueryInputToParse(parentConstraints[parentFieldName].$inQuery.where, targetClass, parseClasses);
          break;
        case 'haveNot':
          parentConstraints[parentFieldName].$notInQuery = {
            where: fieldValue,
            className: targetClass
          };
          transformQueryInputToParse(parentConstraints[parentFieldName].$notInQuery.where, targetClass, parseClasses);
          break;
      }
      delete constraints[fieldName];
      return;
    }
    switch (fieldName) {
      case 'point':
        if (typeof fieldValue === 'object' && !fieldValue.__type) {
          fieldValue.__type = 'GeoPoint';
        }
        break;
      case 'nearSphere':
        if (typeof fieldValue === 'object' && !fieldValue.__type) {
          fieldValue.__type = 'GeoPoint';
        }
        break;
      case 'box':
        if (typeof fieldValue === 'object' && fieldValue.bottomLeft && fieldValue.upperRight) {
          fieldValue = [_objectSpread({
            __type: 'GeoPoint'
          }, fieldValue.bottomLeft), _objectSpread({
            __type: 'GeoPoint'
          }, fieldValue.upperRight)];
          constraints[parseConstraintMap[fieldName]] = fieldValue;
        }
        break;
      case 'polygon':
        if (fieldValue instanceof Array) {
          fieldValue.forEach(geoPoint => {
            if (typeof geoPoint === 'object' && !geoPoint.__type) {
              geoPoint.__type = 'GeoPoint';
            }
          });
        }
        break;
      case 'centerSphere':
        if (typeof fieldValue === 'object' && fieldValue.center && fieldValue.distance) {
          fieldValue = [_objectSpread({
            __type: 'GeoPoint'
          }, fieldValue.center), fieldValue.distance];
          constraints[parseConstraintMap[fieldName]] = fieldValue;
        }
        break;
    }
    if (typeof fieldValue === 'object') {
      if (fieldName === 'where') {
        transformQueryInputToParse(fieldValue, className, parseClasses);
      } else {
        transformQueryConstraintInputToParse(fieldValue, fieldName, className, constraints, parseClasses);
      }
    }
  });
};
exports.transformQueryConstraintInputToParse = transformQueryConstraintInputToParse;
const transformQueryInputToParse = (constraints, className, parseClasses) => {
  if (!constraints || typeof constraints !== 'object') {
    return;
  }
  Object.keys(constraints).forEach(fieldName => {
    const fieldValue = constraints[fieldName];
    if (parseQueryMap[fieldName]) {
      delete constraints[fieldName];
      fieldName = parseQueryMap[fieldName];
      constraints[fieldName] = fieldValue;
      fieldValue.forEach(fieldValueItem => {
        transformQueryInputToParse(fieldValueItem, className, parseClasses);
      });
      return;
    } else {
      transformQueryConstraintInputToParse(fieldValue, fieldName, className, constraints, parseClasses);
    }
  });
};
exports.transformQueryInputToParse = transformQueryInputToParse;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJwYXJzZVF1ZXJ5TWFwIiwiT1IiLCJBTkQiLCJOT1IiLCJwYXJzZUNvbnN0cmFpbnRNYXAiLCJlcXVhbFRvIiwibm90RXF1YWxUbyIsImxlc3NUaGFuIiwibGVzc1RoYW5PckVxdWFsVG8iLCJncmVhdGVyVGhhbiIsImdyZWF0ZXJUaGFuT3JFcXVhbFRvIiwiaW4iLCJub3RJbiIsImV4aXN0cyIsImluUXVlcnlLZXkiLCJub3RJblF1ZXJ5S2V5IiwiaW5RdWVyeSIsIm5vdEluUXVlcnkiLCJjb250YWluZWRCeSIsImNvbnRhaW5zIiwibWF0Y2hlc1JlZ2V4Iiwib3B0aW9ucyIsInRleHQiLCJzZWFyY2giLCJ0ZXJtIiwibGFuZ3VhZ2UiLCJjYXNlU2Vuc2l0aXZlIiwiZGlhY3JpdGljU2Vuc2l0aXZlIiwibmVhclNwaGVyZSIsIm1heERpc3RhbmNlIiwibWF4RGlzdGFuY2VJblJhZGlhbnMiLCJtYXhEaXN0YW5jZUluTWlsZXMiLCJtYXhEaXN0YW5jZUluS2lsb21ldGVycyIsIndpdGhpbiIsImJveCIsImdlb1dpdGhpbiIsInBvbHlnb24iLCJjZW50ZXJTcGhlcmUiLCJnZW9JbnRlcnNlY3RzIiwicG9pbnQiLCJ0cmFuc2Zvcm1RdWVyeUNvbnN0cmFpbnRJbnB1dFRvUGFyc2UiLCJjb25zdHJhaW50cyIsInBhcmVudEZpZWxkTmFtZSIsImNsYXNzTmFtZSIsInBhcmVudENvbnN0cmFpbnRzIiwicGFyc2VDbGFzc2VzIiwiZmllbGRzIiwiT2JqZWN0Iiwia2V5cyIsImZvckVhY2giLCJjb25zdHJhaW50TmFtZSIsImNvbnN0cmFpbnRWYWx1ZSIsImdsb2JhbElkT2JqZWN0IiwiZnJvbUdsb2JhbElkIiwidHlwZSIsImlkIiwiQXJyYXkiLCJpc0FycmF5IiwibWFwIiwidmFsdWUiLCJvYmplY3RJZCIsImZpZWxkTmFtZSIsImZpZWxkVmFsdWUiLCJrZXkiLCJ1bmRlZmluZWQiLCJ0YXJnZXRDbGFzcyIsIndoZXJlVGFyZ2V0IiwiJGV4aXN0cyIsInBhcnNlV2hlcmVUYXJnZXQiLCJ3aGVyZSIsIiRpblF1ZXJ5IiwidHJhbnNmb3JtUXVlcnlJbnB1dFRvUGFyc2UiLCIkbm90SW5RdWVyeSIsIl9fdHlwZSIsImJvdHRvbUxlZnQiLCJ1cHBlclJpZ2h0IiwiZ2VvUG9pbnQiLCJjZW50ZXIiLCJkaXN0YW5jZSIsImZpZWxkVmFsdWVJdGVtIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0dyYXBoUUwvdHJhbnNmb3JtZXJzL3F1ZXJ5LmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGZyb21HbG9iYWxJZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuXG5jb25zdCBwYXJzZVF1ZXJ5TWFwID0ge1xuICBPUjogJyRvcicsXG4gIEFORDogJyRhbmQnLFxuICBOT1I6ICckbm9yJyxcbn07XG5cbmNvbnN0IHBhcnNlQ29uc3RyYWludE1hcCA9IHtcbiAgZXF1YWxUbzogJyRlcScsXG4gIG5vdEVxdWFsVG86ICckbmUnLFxuICBsZXNzVGhhbjogJyRsdCcsXG4gIGxlc3NUaGFuT3JFcXVhbFRvOiAnJGx0ZScsXG4gIGdyZWF0ZXJUaGFuOiAnJGd0JyxcbiAgZ3JlYXRlclRoYW5PckVxdWFsVG86ICckZ3RlJyxcbiAgaW46ICckaW4nLFxuICBub3RJbjogJyRuaW4nLFxuICBleGlzdHM6ICckZXhpc3RzJyxcbiAgaW5RdWVyeUtleTogJyRzZWxlY3QnLFxuICBub3RJblF1ZXJ5S2V5OiAnJGRvbnRTZWxlY3QnLFxuICBpblF1ZXJ5OiAnJGluUXVlcnknLFxuICBub3RJblF1ZXJ5OiAnJG5vdEluUXVlcnknLFxuICBjb250YWluZWRCeTogJyRjb250YWluZWRCeScsXG4gIGNvbnRhaW5zOiAnJGFsbCcsXG4gIG1hdGNoZXNSZWdleDogJyRyZWdleCcsXG4gIG9wdGlvbnM6ICckb3B0aW9ucycsXG4gIHRleHQ6ICckdGV4dCcsXG4gIHNlYXJjaDogJyRzZWFyY2gnLFxuICB0ZXJtOiAnJHRlcm0nLFxuICBsYW5ndWFnZTogJyRsYW5ndWFnZScsXG4gIGNhc2VTZW5zaXRpdmU6ICckY2FzZVNlbnNpdGl2ZScsXG4gIGRpYWNyaXRpY1NlbnNpdGl2ZTogJyRkaWFjcml0aWNTZW5zaXRpdmUnLFxuICBuZWFyU3BoZXJlOiAnJG5lYXJTcGhlcmUnLFxuICBtYXhEaXN0YW5jZTogJyRtYXhEaXN0YW5jZScsXG4gIG1heERpc3RhbmNlSW5SYWRpYW5zOiAnJG1heERpc3RhbmNlSW5SYWRpYW5zJyxcbiAgbWF4RGlzdGFuY2VJbk1pbGVzOiAnJG1heERpc3RhbmNlSW5NaWxlcycsXG4gIG1heERpc3RhbmNlSW5LaWxvbWV0ZXJzOiAnJG1heERpc3RhbmNlSW5LaWxvbWV0ZXJzJyxcbiAgd2l0aGluOiAnJHdpdGhpbicsXG4gIGJveDogJyRib3gnLFxuICBnZW9XaXRoaW46ICckZ2VvV2l0aGluJyxcbiAgcG9seWdvbjogJyRwb2x5Z29uJyxcbiAgY2VudGVyU3BoZXJlOiAnJGNlbnRlclNwaGVyZScsXG4gIGdlb0ludGVyc2VjdHM6ICckZ2VvSW50ZXJzZWN0cycsXG4gIHBvaW50OiAnJHBvaW50Jyxcbn07XG5cbmNvbnN0IHRyYW5zZm9ybVF1ZXJ5Q29uc3RyYWludElucHV0VG9QYXJzZSA9IChcbiAgY29uc3RyYWludHMsXG4gIHBhcmVudEZpZWxkTmFtZSxcbiAgY2xhc3NOYW1lLFxuICBwYXJlbnRDb25zdHJhaW50cyxcbiAgcGFyc2VDbGFzc2VzXG4pID0+IHtcbiAgY29uc3QgZmllbGRzID0gcGFyc2VDbGFzc2VzW2NsYXNzTmFtZV0uZmllbGRzO1xuICBpZiAocGFyZW50RmllbGROYW1lID09PSAnaWQnICYmIGNsYXNzTmFtZSkge1xuICAgIE9iamVjdC5rZXlzKGNvbnN0cmFpbnRzKS5mb3JFYWNoKGNvbnN0cmFpbnROYW1lID0+IHtcbiAgICAgIGNvbnN0IGNvbnN0cmFpbnRWYWx1ZSA9IGNvbnN0cmFpbnRzW2NvbnN0cmFpbnROYW1lXTtcbiAgICAgIGlmICh0eXBlb2YgY29uc3RyYWludFZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICBjb25zdCBnbG9iYWxJZE9iamVjdCA9IGZyb21HbG9iYWxJZChjb25zdHJhaW50VmFsdWUpO1xuXG4gICAgICAgIGlmIChnbG9iYWxJZE9iamVjdC50eXBlID09PSBjbGFzc05hbWUpIHtcbiAgICAgICAgICBjb25zdHJhaW50c1tjb25zdHJhaW50TmFtZV0gPSBnbG9iYWxJZE9iamVjdC5pZDtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGNvbnN0cmFpbnRWYWx1ZSkpIHtcbiAgICAgICAgY29uc3RyYWludHNbY29uc3RyYWludE5hbWVdID0gY29uc3RyYWludFZhbHVlLm1hcCh2YWx1ZSA9PiB7XG4gICAgICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQodmFsdWUpO1xuXG4gICAgICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IGNsYXNzTmFtZSkge1xuICAgICAgICAgICAgcmV0dXJuIGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgcGFyZW50Q29uc3RyYWludHMub2JqZWN0SWQgPSBjb25zdHJhaW50cztcbiAgICBkZWxldGUgcGFyZW50Q29uc3RyYWludHMuaWQ7XG4gIH1cbiAgT2JqZWN0LmtleXMoY29uc3RyYWludHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICBsZXQgZmllbGRWYWx1ZSA9IGNvbnN0cmFpbnRzW2ZpZWxkTmFtZV07XG4gICAgaWYgKHBhcnNlQ29uc3RyYWludE1hcFtmaWVsZE5hbWVdKSB7XG4gICAgICBjb25zdHJhaW50c1twYXJzZUNvbnN0cmFpbnRNYXBbZmllbGROYW1lXV0gPSBjb25zdHJhaW50c1tmaWVsZE5hbWVdO1xuICAgICAgZGVsZXRlIGNvbnN0cmFpbnRzW2ZpZWxkTmFtZV07XG4gICAgfVxuICAgIC8qKlxuICAgICAqIElmIHdlIGhhdmUgYSBrZXktdmFsdWUgcGFpciwgd2UgbmVlZCB0byBjaGFuZ2UgdGhlIHdheSB0aGUgY29uc3RyYWludCBpcyBzdHJ1Y3R1cmVkLlxuICAgICAqXG4gICAgICogRXhhbXBsZTpcbiAgICAgKiAgIEZyb206XG4gICAgICogICB7XG4gICAgICogICAgIFwic29tZUZpZWxkXCI6IHtcbiAgICAgKiAgICAgICBcImxlc3NUaGFuXCI6IHtcbiAgICAgKiAgICAgICAgIFwia2V5XCI6XCJmb28uYmFyXCIsXG4gICAgICogICAgICAgICBcInZhbHVlXCI6IDEwMFxuICAgICAqICAgICAgIH0sXG4gICAgICogICAgICAgXCJncmVhdGVyVGhhblwiOiB7XG4gICAgICogICAgICAgICBcImtleVwiOlwiZm9vLmJhclwiLFxuICAgICAqICAgICAgICAgXCJ2YWx1ZVwiOiAxMFxuICAgICAqICAgICAgIH1cbiAgICAgKiAgICAgfVxuICAgICAqICAgfVxuICAgICAqXG4gICAgICogICBUbzpcbiAgICAgKiAgIHtcbiAgICAgKiAgICAgXCJzb21lRmllbGQuZm9vLmJhclwiOiB7XG4gICAgICogICAgICAgXCIkbHRcIjogMTAwLFxuICAgICAqICAgICAgIFwiJGd0XCI6IDEwXG4gICAgICogICAgICB9XG4gICAgICogICB9XG4gICAgICovXG4gICAgaWYgKGZpZWxkVmFsdWUua2V5ICYmIGZpZWxkVmFsdWUudmFsdWUgIT09IHVuZGVmaW5lZCAmJiBwYXJlbnRDb25zdHJhaW50cyAmJiBwYXJlbnRGaWVsZE5hbWUpIHtcbiAgICAgIGRlbGV0ZSBwYXJlbnRDb25zdHJhaW50c1twYXJlbnRGaWVsZE5hbWVdO1xuICAgICAgcGFyZW50Q29uc3RyYWludHNbYCR7cGFyZW50RmllbGROYW1lfS4ke2ZpZWxkVmFsdWUua2V5fWBdID0ge1xuICAgICAgICAuLi5wYXJlbnRDb25zdHJhaW50c1tgJHtwYXJlbnRGaWVsZE5hbWV9LiR7ZmllbGRWYWx1ZS5rZXl9YF0sXG4gICAgICAgIFtwYXJzZUNvbnN0cmFpbnRNYXBbZmllbGROYW1lXV06IGZpZWxkVmFsdWUudmFsdWUsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICBmaWVsZHNbcGFyZW50RmllbGROYW1lXSAmJlxuICAgICAgKGZpZWxkc1twYXJlbnRGaWVsZE5hbWVdLnR5cGUgPT09ICdQb2ludGVyJyB8fCBmaWVsZHNbcGFyZW50RmllbGROYW1lXS50eXBlID09PSAnUmVsYXRpb24nKVxuICAgICkge1xuICAgICAgY29uc3QgeyB0YXJnZXRDbGFzcyB9ID0gZmllbGRzW3BhcmVudEZpZWxkTmFtZV07XG4gICAgICBpZiAoZmllbGROYW1lID09PSAnZXhpc3RzJykge1xuICAgICAgICBpZiAoZmllbGRzW3BhcmVudEZpZWxkTmFtZV0udHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICAgIGNvbnN0IHdoZXJlVGFyZ2V0ID0gZmllbGRWYWx1ZSA/ICd3aGVyZScgOiAnbm90V2hlcmUnO1xuICAgICAgICAgIGlmIChjb25zdHJhaW50c1t3aGVyZVRhcmdldF0pIHtcbiAgICAgICAgICAgIGlmIChjb25zdHJhaW50c1t3aGVyZVRhcmdldF0ub2JqZWN0SWQpIHtcbiAgICAgICAgICAgICAgY29uc3RyYWludHNbd2hlcmVUYXJnZXRdLm9iamVjdElkID0ge1xuICAgICAgICAgICAgICAgIC4uLmNvbnN0cmFpbnRzW3doZXJlVGFyZ2V0XS5vYmplY3RJZCxcbiAgICAgICAgICAgICAgICAkZXhpc3RzOiBmaWVsZFZhbHVlLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgY29uc3RyYWludHNbd2hlcmVUYXJnZXRdLm9iamVjdElkID0ge1xuICAgICAgICAgICAgICAgICRleGlzdHM6IGZpZWxkVmFsdWUsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IHBhcnNlV2hlcmVUYXJnZXQgPSBmaWVsZFZhbHVlID8gJyRpblF1ZXJ5JyA6ICckbm90SW5RdWVyeSc7XG4gICAgICAgICAgICBwYXJlbnRDb25zdHJhaW50c1twYXJlbnRGaWVsZE5hbWVdW3BhcnNlV2hlcmVUYXJnZXRdID0ge1xuICAgICAgICAgICAgICB3aGVyZTogeyBvYmplY3RJZDogeyAkZXhpc3RzOiB0cnVlIH0gfSxcbiAgICAgICAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICAgIGRlbGV0ZSBjb25zdHJhaW50cy4kZXhpc3RzO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBhcmVudENvbnN0cmFpbnRzW3BhcmVudEZpZWxkTmFtZV0uJGV4aXN0cyA9IGZpZWxkVmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgc3dpdGNoIChmaWVsZE5hbWUpIHtcbiAgICAgICAgY2FzZSAnaGF2ZSc6XG4gICAgICAgICAgcGFyZW50Q29uc3RyYWludHNbcGFyZW50RmllbGROYW1lXS4kaW5RdWVyeSA9IHtcbiAgICAgICAgICAgIHdoZXJlOiBmaWVsZFZhbHVlLFxuICAgICAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgICB9O1xuICAgICAgICAgIHRyYW5zZm9ybVF1ZXJ5SW5wdXRUb1BhcnNlKFxuICAgICAgICAgICAgcGFyZW50Q29uc3RyYWludHNbcGFyZW50RmllbGROYW1lXS4kaW5RdWVyeS53aGVyZSxcbiAgICAgICAgICAgIHRhcmdldENsYXNzLFxuICAgICAgICAgICAgcGFyc2VDbGFzc2VzXG4gICAgICAgICAgKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnaGF2ZU5vdCc6XG4gICAgICAgICAgcGFyZW50Q29uc3RyYWludHNbcGFyZW50RmllbGROYW1lXS4kbm90SW5RdWVyeSA9IHtcbiAgICAgICAgICAgIHdoZXJlOiBmaWVsZFZhbHVlLFxuICAgICAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgICB9O1xuICAgICAgICAgIHRyYW5zZm9ybVF1ZXJ5SW5wdXRUb1BhcnNlKFxuICAgICAgICAgICAgcGFyZW50Q29uc3RyYWludHNbcGFyZW50RmllbGROYW1lXS4kbm90SW5RdWVyeS53aGVyZSxcbiAgICAgICAgICAgIHRhcmdldENsYXNzLFxuICAgICAgICAgICAgcGFyc2VDbGFzc2VzXG4gICAgICAgICAgKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGRlbGV0ZSBjb25zdHJhaW50c1tmaWVsZE5hbWVdO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBzd2l0Y2ggKGZpZWxkTmFtZSkge1xuICAgICAgY2FzZSAncG9pbnQnOlxuICAgICAgICBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdvYmplY3QnICYmICFmaWVsZFZhbHVlLl9fdHlwZSkge1xuICAgICAgICAgIGZpZWxkVmFsdWUuX190eXBlID0gJ0dlb1BvaW50JztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ25lYXJTcGhlcmUnOlxuICAgICAgICBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdvYmplY3QnICYmICFmaWVsZFZhbHVlLl9fdHlwZSkge1xuICAgICAgICAgIGZpZWxkVmFsdWUuX190eXBlID0gJ0dlb1BvaW50JztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2JveCc6XG4gICAgICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ29iamVjdCcgJiYgZmllbGRWYWx1ZS5ib3R0b21MZWZ0ICYmIGZpZWxkVmFsdWUudXBwZXJSaWdodCkge1xuICAgICAgICAgIGZpZWxkVmFsdWUgPSBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIF9fdHlwZTogJ0dlb1BvaW50JyxcbiAgICAgICAgICAgICAgLi4uZmllbGRWYWx1ZS5ib3R0b21MZWZ0LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgX190eXBlOiAnR2VvUG9pbnQnLFxuICAgICAgICAgICAgICAuLi5maWVsZFZhbHVlLnVwcGVyUmlnaHQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF07XG4gICAgICAgICAgY29uc3RyYWludHNbcGFyc2VDb25zdHJhaW50TWFwW2ZpZWxkTmFtZV1dID0gZmllbGRWYWx1ZTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ3BvbHlnb24nOlxuICAgICAgICBpZiAoZmllbGRWYWx1ZSBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgICAgZmllbGRWYWx1ZS5mb3JFYWNoKGdlb1BvaW50ID0+IHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgZ2VvUG9pbnQgPT09ICdvYmplY3QnICYmICFnZW9Qb2ludC5fX3R5cGUpIHtcbiAgICAgICAgICAgICAgZ2VvUG9pbnQuX190eXBlID0gJ0dlb1BvaW50JztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2NlbnRlclNwaGVyZSc6XG4gICAgICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ29iamVjdCcgJiYgZmllbGRWYWx1ZS5jZW50ZXIgJiYgZmllbGRWYWx1ZS5kaXN0YW5jZSkge1xuICAgICAgICAgIGZpZWxkVmFsdWUgPSBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIF9fdHlwZTogJ0dlb1BvaW50JyxcbiAgICAgICAgICAgICAgLi4uZmllbGRWYWx1ZS5jZW50ZXIsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZmllbGRWYWx1ZS5kaXN0YW5jZSxcbiAgICAgICAgICBdO1xuICAgICAgICAgIGNvbnN0cmFpbnRzW3BhcnNlQ29uc3RyYWludE1hcFtmaWVsZE5hbWVdXSA9IGZpZWxkVmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGlmIChmaWVsZE5hbWUgPT09ICd3aGVyZScpIHtcbiAgICAgICAgdHJhbnNmb3JtUXVlcnlJbnB1dFRvUGFyc2UoZmllbGRWYWx1ZSwgY2xhc3NOYW1lLCBwYXJzZUNsYXNzZXMpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdHJhbnNmb3JtUXVlcnlDb25zdHJhaW50SW5wdXRUb1BhcnNlKFxuICAgICAgICAgIGZpZWxkVmFsdWUsXG4gICAgICAgICAgZmllbGROYW1lLFxuICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICBjb25zdHJhaW50cyxcbiAgICAgICAgICBwYXJzZUNsYXNzZXNcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xufTtcblxuY29uc3QgdHJhbnNmb3JtUXVlcnlJbnB1dFRvUGFyc2UgPSAoY29uc3RyYWludHMsIGNsYXNzTmFtZSwgcGFyc2VDbGFzc2VzKSA9PiB7XG4gIGlmICghY29uc3RyYWludHMgfHwgdHlwZW9mIGNvbnN0cmFpbnRzICE9PSAnb2JqZWN0Jykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIE9iamVjdC5rZXlzKGNvbnN0cmFpbnRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgY29uc3QgZmllbGRWYWx1ZSA9IGNvbnN0cmFpbnRzW2ZpZWxkTmFtZV07XG5cbiAgICBpZiAocGFyc2VRdWVyeU1hcFtmaWVsZE5hbWVdKSB7XG4gICAgICBkZWxldGUgY29uc3RyYWludHNbZmllbGROYW1lXTtcbiAgICAgIGZpZWxkTmFtZSA9IHBhcnNlUXVlcnlNYXBbZmllbGROYW1lXTtcbiAgICAgIGNvbnN0cmFpbnRzW2ZpZWxkTmFtZV0gPSBmaWVsZFZhbHVlO1xuICAgICAgZmllbGRWYWx1ZS5mb3JFYWNoKGZpZWxkVmFsdWVJdGVtID0+IHtcbiAgICAgICAgdHJhbnNmb3JtUXVlcnlJbnB1dFRvUGFyc2UoZmllbGRWYWx1ZUl0ZW0sIGNsYXNzTmFtZSwgcGFyc2VDbGFzc2VzKTtcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH0gZWxzZSB7XG4gICAgICB0cmFuc2Zvcm1RdWVyeUNvbnN0cmFpbnRJbnB1dFRvUGFyc2UoXG4gICAgICAgIGZpZWxkVmFsdWUsXG4gICAgICAgIGZpZWxkTmFtZSxcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICBjb25zdHJhaW50cyxcbiAgICAgICAgcGFyc2VDbGFzc2VzXG4gICAgICApO1xuICAgIH1cbiAgfSk7XG59O1xuXG5leHBvcnQgeyB0cmFuc2Zvcm1RdWVyeUNvbnN0cmFpbnRJbnB1dFRvUGFyc2UsIHRyYW5zZm9ybVF1ZXJ5SW5wdXRUb1BhcnNlIH07XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBO0FBQTZDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFFN0MsTUFBTUEsYUFBYSxHQUFHO0VBQ3BCQyxFQUFFLEVBQUUsS0FBSztFQUNUQyxHQUFHLEVBQUUsTUFBTTtFQUNYQyxHQUFHLEVBQUU7QUFDUCxDQUFDO0FBRUQsTUFBTUMsa0JBQWtCLEdBQUc7RUFDekJDLE9BQU8sRUFBRSxLQUFLO0VBQ2RDLFVBQVUsRUFBRSxLQUFLO0VBQ2pCQyxRQUFRLEVBQUUsS0FBSztFQUNmQyxpQkFBaUIsRUFBRSxNQUFNO0VBQ3pCQyxXQUFXLEVBQUUsS0FBSztFQUNsQkMsb0JBQW9CLEVBQUUsTUFBTTtFQUM1QkMsRUFBRSxFQUFFLEtBQUs7RUFDVEMsS0FBSyxFQUFFLE1BQU07RUFDYkMsTUFBTSxFQUFFLFNBQVM7RUFDakJDLFVBQVUsRUFBRSxTQUFTO0VBQ3JCQyxhQUFhLEVBQUUsYUFBYTtFQUM1QkMsT0FBTyxFQUFFLFVBQVU7RUFDbkJDLFVBQVUsRUFBRSxhQUFhO0VBQ3pCQyxXQUFXLEVBQUUsY0FBYztFQUMzQkMsUUFBUSxFQUFFLE1BQU07RUFDaEJDLFlBQVksRUFBRSxRQUFRO0VBQ3RCQyxPQUFPLEVBQUUsVUFBVTtFQUNuQkMsSUFBSSxFQUFFLE9BQU87RUFDYkMsTUFBTSxFQUFFLFNBQVM7RUFDakJDLElBQUksRUFBRSxPQUFPO0VBQ2JDLFFBQVEsRUFBRSxX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