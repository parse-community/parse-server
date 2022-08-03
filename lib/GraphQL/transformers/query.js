"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.transformQueryInputToParse = exports.transformQueryConstraintInputToParse = void 0;

var _graphqlRelay = require("graphql-relay");

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML3RyYW5zZm9ybWVycy9xdWVyeS5qcyJdLCJuYW1lcyI6WyJwYXJzZVF1ZXJ5TWFwIiwiT1IiLCJBTkQiLCJOT1IiLCJwYXJzZUNvbnN0cmFpbnRNYXAiLCJlcXVhbFRvIiwibm90RXF1YWxUbyIsImxlc3NUaGFuIiwibGVzc1RoYW5PckVxdWFsVG8iLCJncmVhdGVyVGhhbiIsImdyZWF0ZXJUaGFuT3JFcXVhbFRvIiwiaW4iLCJub3RJbiIsImV4aXN0cyIsImluUXVlcnlLZXkiLCJub3RJblF1ZXJ5S2V5IiwiaW5RdWVyeSIsIm5vdEluUXVlcnkiLCJjb250YWluZWRCeSIsImNvbnRhaW5zIiwibWF0Y2hlc1JlZ2V4Iiwib3B0aW9ucyIsInRleHQiLCJzZWFyY2giLCJ0ZXJtIiwibGFuZ3VhZ2UiLCJjYXNlU2Vuc2l0aXZlIiwiZGlhY3JpdGljU2Vuc2l0aXZlIiwibmVhclNwaGVyZSIsIm1heERpc3RhbmNlIiwibWF4RGlzdGFuY2VJblJhZGlhbnMiLCJtYXhEaXN0YW5jZUluTWlsZXMiLCJtYXhEaXN0YW5jZUluS2lsb21ldGVycyIsIndpdGhpbiIsImJveCIsImdlb1dpdGhpbiIsInBvbHlnb24iLCJjZW50ZXJTcGhlcmUiLCJnZW9JbnRlcnNlY3RzIiwicG9pbnQiLCJ0cmFuc2Zvcm1RdWVyeUNvbnN0cmFpbnRJbnB1dFRvUGFyc2UiLCJjb25zdHJhaW50cyIsInBhcmVudEZpZWxkTmFtZSIsImNsYXNzTmFtZSIsInBhcmVudENvbnN0cmFpbnRzIiwicGFyc2VDbGFzc2VzIiwiZmllbGRzIiwiT2JqZWN0Iiwia2V5cyIsImZvckVhY2giLCJjb25zdHJhaW50TmFtZSIsImNvbnN0cmFpbnRWYWx1ZSIsImdsb2JhbElkT2JqZWN0IiwidHlwZSIsImlkIiwiQXJyYXkiLCJpc0FycmF5IiwibWFwIiwidmFsdWUiLCJvYmplY3RJZCIsImZpZWxkTmFtZSIsImZpZWxkVmFsdWUiLCJrZXkiLCJ1bmRlZmluZWQiLCJ0YXJnZXRDbGFzcyIsIndoZXJlVGFyZ2V0IiwiJGV4aXN0cyIsInBhcnNlV2hlcmVUYXJnZXQiLCJ3aGVyZSIsIiRpblF1ZXJ5IiwidHJhbnNmb3JtUXVlcnlJbnB1dFRvUGFyc2UiLCIkbm90SW5RdWVyeSIsIl9fdHlwZSIsImJvdHRvbUxlZnQiLCJ1cHBlclJpZ2h0IiwiZ2VvUG9pbnQiLCJjZW50ZXIiLCJkaXN0YW5jZSIsImZpZWxkVmFsdWVJdGVtIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7Ozs7Ozs7O0FBRUEsTUFBTUEsYUFBYSxHQUFHO0FBQ3BCQyxFQUFBQSxFQUFFLEVBQUUsS0FEZ0I7QUFFcEJDLEVBQUFBLEdBQUcsRUFBRSxNQUZlO0FBR3BCQyxFQUFBQSxHQUFHLEVBQUU7QUFIZSxDQUF0QjtBQU1BLE1BQU1DLGtCQUFrQixHQUFHO0FBQ3pCQyxFQUFBQSxPQUFPLEVBQUUsS0FEZ0I7QUFFekJDLEVBQUFBLFVBQVUsRUFBRSxLQUZhO0FBR3pCQyxFQUFBQSxRQUFRLEVBQUUsS0FIZTtBQUl6QkMsRUFBQUEsaUJBQWlCLEVBQUUsTUFKTTtBQUt6QkMsRUFBQUEsV0FBVyxFQUFFLEtBTFk7QUFNekJDLEVBQUFBLG9CQUFvQixFQUFFLE1BTkc7QUFPekJDLEVBQUFBLEVBQUUsRUFBRSxLQVBxQjtBQVF6QkMsRUFBQUEsS0FBSyxFQUFFLE1BUmtCO0FBU3pCQyxFQUFBQSxNQUFNLEVBQUUsU0FUaUI7QUFVekJDLEVBQUFBLFVBQVUsRUFBRSxTQVZhO0FBV3pCQyxFQUFBQSxhQUFhLEVBQUUsYUFYVTtBQVl6QkMsRUFBQUEsT0FBTyxFQUFFLFVBWmdCO0FBYXpCQyxFQUFBQSxVQUFVLEVBQUUsYUFiYTtBQWN6QkMsRUFBQUEsV0FBVyxFQUFFLGNBZFk7QUFlekJDLEVBQUFBLFFBQVEsRUFBRSxNQWZlO0FBZ0J6QkMsRUFBQUEsWUFBWSxFQUFFLFFBaEJXO0FBaUJ6QkMsRUFBQUEsT0FBTyxFQUFFLFVBakJnQjtBQWtCekJDLEVBQUFBLElBQUksRUFBRSxPQWxCbUI7QUFtQnpCQyxFQUFBQSxN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QlEsT0FBekIsQ0FBaUNXLFNBQVMsSUFBSTtBQUM1QyxVQUFNQyxVQUFVLEdBQUdwQixXQUFXLENBQUNtQixTQUFELENBQTlCOztBQUVBLFFBQUk1RCxhQUFhLENBQUM0RCxTQUFELENBQWpCLEVBQThCO0FBQzVCLGFBQU9uQixXQUFXLENBQUNtQixTQUFELENBQWxCO0FBQ0FBLE1BQUFBLFNBQVMsR0FBRzVELGFBQWEsQ0FBQzRELFNBQUQsQ0FBekI7QUFDQW5CLE1BQUFBLFdBQVcsQ0FBQ21CLFNBQUQsQ0FBWCxHQUF5QkMsVUFBekI7QUFDQUEsTUFBQUEsVUFBVSxDQUFDWixPQUFYLENBQW1CNkIsY0FBYyxJQUFJO0FBQ25DUixRQUFBQSwwQkFBMEIsQ0FBQ1EsY0FBRCxFQUFpQm5DLFNBQWpCLEVBQTRCRSxZQUE1QixDQUExQjtBQUNELE9BRkQ7QUFHQTtBQUNELEtBUkQsTUFRTztBQUNMTCxNQUFBQSxvQ0FBb0MsQ0FDbENxQixVQURrQyxFQUVsQ0QsU0FGa0MsRUFHbENqQixTQUhrQyxFQUlsQ0YsV0FKa0MsRUFLbENJLFlBTGtDLENBQXBDO0FBT0Q7QUFDRixHQXBCRDtBQXFCRCxDQTFCRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGZyb21HbG9iYWxJZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuXG5jb25zdCBwYXJzZVF1ZXJ5TWFwID0ge1xuICBPUjogJyRvcicsXG4gIEFORDogJyRhbmQnLFxuICBOT1I6ICckbm9yJyxcbn07XG5cbmNvbnN0IHBhcnNlQ29uc3RyYWludE1hcCA9IHtcbiAgZXF1YWxUbzogJyRlcScsXG4gIG5vdEVxdWFsVG86ICckbmUnLFxuICBsZXNzVGhhbjogJyRsdCcsXG4gIGxlc3NUaGFuT3JFcXVhbFRvOiAnJGx0ZScsXG4gIGdyZWF0ZXJUaGFuOiAnJGd0JyxcbiAgZ3JlYXRlclRoYW5PckVxdWFsVG86ICckZ3RlJyxcbiAgaW46ICckaW4nLFxuICBub3RJbjogJyRuaW4nLFxuICBleGlzdHM6ICckZXhpc3RzJyxcbiAgaW5RdWVyeUtleTogJyRzZWxlY3QnLFxuICBub3RJblF1ZXJ5S2V5OiAnJGRvbnRTZWxlY3QnLFxuICBpblF1ZXJ5OiAnJGluUXVlcnknLFxuICBub3RJblF1ZXJ5OiAnJG5vdEluUXVlcnknLFxuICBjb250YWluZWRCeTogJyRjb250YWluZWRCeScsXG4gIGNvbnRhaW5zOiAnJGFsbCcsXG4gIG1hdGNoZXNSZWdleDogJyRyZWdleCcsXG4gIG9wdGlvbnM6ICckb3B0aW9ucycsXG4gIHRleHQ6ICckdGV4dCcsXG4gIHNlYXJjaDogJyRzZWFyY2gnLFxuICB0ZXJtOiAnJHRlcm0nLFxuICBsYW5ndWFnZTogJyRsYW5ndWFnZScsXG4gIGNhc2VTZW5zaXRpdmU6ICckY2FzZVNlbnNpdGl2ZScsXG4gIGRpYWNyaXRpY1NlbnNpdGl2ZTogJyRkaWFjcml0aWNTZW5zaXRpdmUnLFxuICBuZWFyU3BoZXJlOiAnJG5lYXJTcGhlcmUnLFxuICBtYXhEaXN0YW5jZTogJyRtYXhEaXN0YW5jZScsXG4gIG1heERpc3RhbmNlSW5SYWRpYW5zOiAnJG1heERpc3RhbmNlSW5SYWRpYW5zJyxcbiAgbWF4RGlzdGFuY2VJbk1pbGVzOiAnJG1heERpc3RhbmNlSW5NaWxlcycsXG4gIG1heERpc3RhbmNlSW5LaWxvbWV0ZXJzOiAnJG1heERpc3RhbmNlSW5LaWxvbWV0ZXJzJyxcbiAgd2l0aGluOiAnJHdpdGhpbicsXG4gIGJveDogJyRib3gnLFxuICBnZW9XaXRoaW46ICckZ2VvV2l0aGluJyxcbiAgcG9seWdvbjogJyRwb2x5Z29uJyxcbiAgY2VudGVyU3BoZXJlOiAnJGNlbnRlclNwaGVyZScsXG4gIGdlb0ludGVyc2VjdHM6ICckZ2VvSW50ZXJzZWN0cycsXG4gIHBvaW50OiAnJHBvaW50Jyxcbn07XG5cbmNvbnN0IHRyYW5zZm9ybVF1ZXJ5Q29uc3RyYWludElucHV0VG9QYXJzZSA9IChcbiAgY29uc3RyYWludHMsXG4gIHBhcmVudEZpZWxkTmFtZSxcbiAgY2xhc3NOYW1lLFxuICBwYXJlbnRDb25zdHJhaW50cyxcbiAgcGFyc2VDbGFzc2VzXG4pID0+IHtcbiAgY29uc3QgZmllbGRzID0gcGFyc2VDbGFzc2VzW2NsYXNzTmFtZV0uZmllbGRzO1xuICBpZiAocGFyZW50RmllbGROYW1lID09PSAnaWQnICYmIGNsYXNzTmFtZSkge1xuICAgIE9iamVjdC5rZXlzKGNvbnN0cmFpbnRzKS5mb3JFYWNoKGNvbnN0cmFpbnROYW1lID0+IHtcbiAgICAgIGNvbnN0IGNvbnN0cmFpbnRWYWx1ZSA9IGNvbnN0cmFpbnRzW2NvbnN0cmFpbnROYW1lXTtcbiAgICAgIGlmICh0eXBlb2YgY29uc3RyYWludFZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICBjb25zdCBnbG9iYWxJZE9iamVjdCA9IGZyb21HbG9iYWxJZChjb25zdHJhaW50VmFsdWUpO1xuXG4gICAgICAgIGlmIChnbG9iYWxJZE9iamVjdC50eXBlID09PSBjbGFzc05hbWUpIHtcbiAgICAgICAgICBjb25zdHJhaW50c1tjb25zdHJhaW50TmFtZV0gPSBnbG9iYWxJZE9iamVjdC5pZDtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGNvbnN0cmFpbnRWYWx1ZSkpIHtcbiAgICAgICAgY29uc3RyYWludHNbY29uc3RyYWludE5hbWVdID0gY29uc3RyYWludFZhbHVlLm1hcCh2YWx1ZSA9PiB7XG4gICAgICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQodmFsdWUpO1xuXG4gICAgICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IGNsYXNzTmFtZSkge1xuICAgICAgICAgICAgcmV0dXJuIGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgcGFyZW50Q29uc3RyYWludHMub2JqZWN0SWQgPSBjb25zdHJhaW50cztcbiAgICBkZWxldGUgcGFyZW50Q29uc3RyYWludHMuaWQ7XG4gIH1cbiAgT2JqZWN0LmtleXMoY29uc3RyYWludHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICBsZXQgZmllbGRWYWx1ZSA9IGNvbnN0cmFpbnRzW2ZpZWxkTmFtZV07XG4gICAgaWYgKHBhcnNlQ29uc3RyYWludE1hcFtmaWVsZE5hbWVdKSB7XG4gICAgICBjb25zdHJhaW50c1twYXJzZUNvbnN0cmFpbnRNYXBbZmllbGROYW1lXV0gPSBjb25zdHJhaW50c1tmaWVsZE5hbWVdO1xuICAgICAgZGVsZXRlIGNvbnN0cmFpbnRzW2ZpZWxkTmFtZV07XG4gICAgfVxuICAgIC8qKlxuICAgICAqIElmIHdlIGhhdmUgYSBrZXktdmFsdWUgcGFpciwgd2UgbmVlZCB0byBjaGFuZ2UgdGhlIHdheSB0aGUgY29uc3RyYWludCBpcyBzdHJ1Y3R1cmVkLlxuICAgICAqXG4gICAgICogRXhhbXBsZTpcbiAgICAgKiAgIEZyb206XG4gICAgICogICB7XG4gICAgICogICAgIFwic29tZUZpZWxkXCI6IHtcbiAgICAgKiAgICAgICBcImxlc3NUaGFuXCI6IHtcbiAgICAgKiAgICAgICAgIFwia2V5XCI6XCJmb28uYmFyXCIsXG4gICAgICogICAgICAgICBcInZhbHVlXCI6IDEwMFxuICAgICAqICAgICAgIH0sXG4gICAgICogICAgICAgXCJncmVhdGVyVGhhblwiOiB7XG4gICAgICogICAgICAgICBcImtleVwiOlwiZm9vLmJhclwiLFxuICAgICAqICAgICAgICAgXCJ2YWx1ZVwiOiAxMFxuICAgICAqICAgICAgIH1cbiAgICAgKiAgICAgfVxuICAgICAqICAgfVxuICAgICAqXG4gICAgICogICBUbzpcbiAgICAgKiAgIHtcbiAgICAgKiAgICAgXCJzb21lRmllbGQuZm9vLmJhclwiOiB7XG4gICAgICogICAgICAgXCIkbHRcIjogMTAwLFxuICAgICAqICAgICAgIFwiJGd0XCI6IDEwXG4gICAgICogICAgICB9XG4gICAgICogICB9XG4gICAgICovXG4gICAgaWYgKGZpZWxkVmFsdWUua2V5ICYmIGZpZWxkVmFsdWUudmFsdWUgIT09IHVuZGVmaW5lZCAmJiBwYXJlbnRDb25zdHJhaW50cyAmJiBwYXJlbnRGaWVsZE5hbWUpIHtcbiAgICAgIGRlbGV0ZSBwYXJlbnRDb25zdHJhaW50c1twYXJlbnRGaWVsZE5hbWVdO1xuICAgICAgcGFyZW50Q29uc3RyYWludHNbYCR7cGFyZW50RmllbGROYW1lfS4ke2ZpZWxkVmFsdWUua2V5fWBdID0ge1xuICAgICAgICAuLi5wYXJlbnRDb25zdHJhaW50c1tgJHtwYXJlbnRGaWVsZE5hbWV9LiR7ZmllbGRWYWx1ZS5rZXl9YF0sXG4gICAgICAgIFtwYXJzZUNvbnN0cmFpbnRNYXBbZmllbGROYW1lXV06IGZpZWxkVmFsdWUudmFsdWUsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICBmaWVsZHNbcGFyZW50RmllbGROYW1lXSAmJlxuICAgICAgKGZpZWxkc1twYXJlbnRGaWVsZE5hbWVdLnR5cGUgPT09ICdQb2ludGVyJyB8fCBmaWVsZHNbcGFyZW50RmllbGROYW1lXS50eXBlID09PSAnUmVsYXRpb24nKVxuICAgICkge1xuICAgICAgY29uc3QgeyB0YXJnZXRDbGFzcyB9ID0gZmllbGRzW3BhcmVudEZpZWxkTmFtZV07XG4gICAgICBpZiAoZmllbGROYW1lID09PSAnZXhpc3RzJykge1xuICAgICAgICBpZiAoZmllbGRzW3BhcmVudEZpZWxkTmFtZV0udHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICAgIGNvbnN0IHdoZXJlVGFyZ2V0ID0gZmllbGRWYWx1ZSA/ICd3aGVyZScgOiAnbm90V2hlcmUnO1xuICAgICAgICAgIGlmIChjb25zdHJhaW50c1t3aGVyZVRhcmdldF0pIHtcbiAgICAgICAgICAgIGlmIChjb25zdHJhaW50c1t3aGVyZVRhcmdldF0ub2JqZWN0SWQpIHtcbiAgICAgICAgICAgICAgY29uc3RyYWludHNbd2hlcmVUYXJnZXRdLm9iamVjdElkID0ge1xuICAgICAgICAgICAgICAgIC4uLmNvbnN0cmFpbnRzW3doZXJlVGFyZ2V0XS5vYmplY3RJZCxcbiAgICAgICAgICAgICAgICAkZXhpc3RzOiBmaWVsZFZhbHVlLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgY29uc3RyYWludHNbd2hlcmVUYXJnZXRdLm9iamVjdElkID0ge1xuICAgICAgICAgICAgICAgICRleGlzdHM6IGZpZWxkVmFsdWUsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IHBhcnNlV2hlcmVUYXJnZXQgPSBmaWVsZFZhbHVlID8gJyRpblF1ZXJ5JyA6ICckbm90SW5RdWVyeSc7XG4gICAgICAgICAgICBwYXJlbnRDb25zdHJhaW50c1twYXJlbnRGaWVsZE5hbWVdW3BhcnNlV2hlcmVUYXJnZXRdID0ge1xuICAgICAgICAgICAgICB3aGVyZTogeyBvYmplY3RJZDogeyAkZXhpc3RzOiB0cnVlIH0gfSxcbiAgICAgICAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICAgIGRlbGV0ZSBjb25zdHJhaW50cy4kZXhpc3RzO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBhcmVudENvbnN0cmFpbnRzW3BhcmVudEZpZWxkTmFtZV0uJGV4aXN0cyA9IGZpZWxkVmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgc3dpdGNoIChmaWVsZE5hbWUpIHtcbiAgICAgICAgY2FzZSAnaGF2ZSc6XG4gICAgICAgICAgcGFyZW50Q29uc3RyYWludHNbcGFyZW50RmllbGROYW1lXS4kaW5RdWVyeSA9IHtcbiAgICAgICAgICAgIHdoZXJlOiBmaWVsZFZhbHVlLFxuICAgICAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgICB9O1xuICAgICAgICAgIHRyYW5zZm9ybVF1ZXJ5SW5wdXRUb1BhcnNlKFxuICAgICAgICAgICAgcGFyZW50Q29uc3RyYWludHNbcGFyZW50RmllbGROYW1lXS4kaW5RdWVyeS53aGVyZSxcbiAgICAgICAgICAgIHRhcmdldENsYXNzLFxuICAgICAgICAgICAgcGFyc2VDbGFzc2VzXG4gICAgICAgICAgKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnaGF2ZU5vdCc6XG4gICAgICAgICAgcGFyZW50Q29uc3RyYWludHNbcGFyZW50RmllbGROYW1lXS4kbm90SW5RdWVyeSA9IHtcbiAgICAgICAgICAgIHdoZXJlOiBmaWVsZFZhbHVlLFxuICAgICAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgICB9O1xuICAgICAgICAgIHRyYW5zZm9ybVF1ZXJ5SW5wdXRUb1BhcnNlKFxuICAgICAgICAgICAgcGFyZW50Q29uc3RyYWludHNbcGFyZW50RmllbGROYW1lXS4kbm90SW5RdWVyeS53aGVyZSxcbiAgICAgICAgICAgIHRhcmdldENsYXNzLFxuICAgICAgICAgICAgcGFyc2VDbGFzc2VzXG4gICAgICAgICAgKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGRlbGV0ZSBjb25zdHJhaW50c1tmaWVsZE5hbWVdO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBzd2l0Y2ggKGZpZWxkTmFtZSkge1xuICAgICAgY2FzZSAncG9pbnQnOlxuICAgICAgICBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdvYmplY3QnICYmICFmaWVsZFZhbHVlLl9fdHlwZSkge1xuICAgICAgICAgIGZpZWxkVmFsdWUuX190eXBlID0gJ0dlb1BvaW50JztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ25lYXJTcGhlcmUnOlxuICAgICAgICBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdvYmplY3QnICYmICFmaWVsZFZhbHVlLl9fdHlwZSkge1xuICAgICAgICAgIGZpZWxkVmFsdWUuX190eXBlID0gJ0dlb1BvaW50JztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2JveCc6XG4gICAgICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ29iamVjdCcgJiYgZmllbGRWYWx1ZS5ib3R0b21MZWZ0ICYmIGZpZWxkVmFsdWUudXBwZXJSaWdodCkge1xuICAgICAgICAgIGZpZWxkVmFsdWUgPSBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIF9fdHlwZTogJ0dlb1BvaW50JyxcbiAgICAgICAgICAgICAgLi4uZmllbGRWYWx1ZS5ib3R0b21MZWZ0LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgX190eXBlOiAnR2VvUG9pbnQnLFxuICAgICAgICAgICAgICAuLi5maWVsZFZhbHVlLnVwcGVyUmlnaHQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF07XG4gICAgICAgICAgY29uc3RyYWludHNbcGFyc2VDb25zdHJhaW50TWFwW2ZpZWxkTmFtZV1dID0gZmllbGRWYWx1ZTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ3BvbHlnb24nOlxuICAgICAgICBpZiAoZmllbGRWYWx1ZSBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgICAgZmllbGRWYWx1ZS5mb3JFYWNoKGdlb1BvaW50ID0+IHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgZ2VvUG9pbnQgPT09ICdvYmplY3QnICYmICFnZW9Qb2ludC5fX3R5cGUpIHtcbiAgICAgICAgICAgICAgZ2VvUG9pbnQuX190eXBlID0gJ0dlb1BvaW50JztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2NlbnRlclNwaGVyZSc6XG4gICAgICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ29iamVjdCcgJiYgZmllbGRWYWx1ZS5jZW50ZXIgJiYgZmllbGRWYWx1ZS5kaXN0YW5jZSkge1xuICAgICAgICAgIGZpZWxkVmFsdWUgPSBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIF9fdHlwZTogJ0dlb1BvaW50JyxcbiAgICAgICAgICAgICAgLi4uZmllbGRWYWx1ZS5jZW50ZXIsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZmllbGRWYWx1ZS5kaXN0YW5jZSxcbiAgICAgICAgICBdO1xuICAgICAgICAgIGNvbnN0cmFpbnRzW3BhcnNlQ29uc3RyYWludE1hcFtmaWVsZE5hbWVdXSA9IGZpZWxkVmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGlmIChmaWVsZE5hbWUgPT09ICd3aGVyZScpIHtcbiAgICAgICAgdHJhbnNmb3JtUXVlcnlJbnB1dFRvUGFyc2UoZmllbGRWYWx1ZSwgY2xhc3NOYW1lLCBwYXJzZUNsYXNzZXMpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdHJhbnNmb3JtUXVlcnlDb25zdHJhaW50SW5wdXRUb1BhcnNlKFxuICAgICAgICAgIGZpZWxkVmFsdWUsXG4gICAgICAgICAgZmllbGROYW1lLFxuICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICBjb25zdHJhaW50cyxcbiAgICAgICAgICBwYXJzZUNsYXNzZXNcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xufTtcblxuY29uc3QgdHJhbnNmb3JtUXVlcnlJbnB1dFRvUGFyc2UgPSAoY29uc3RyYWludHMsIGNsYXNzTmFtZSwgcGFyc2VDbGFzc2VzKSA9PiB7XG4gIGlmICghY29uc3RyYWludHMgfHwgdHlwZW9mIGNvbnN0cmFpbnRzICE9PSAnb2JqZWN0Jykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIE9iamVjdC5rZXlzKGNvbnN0cmFpbnRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgY29uc3QgZmllbGRWYWx1ZSA9IGNvbnN0cmFpbnRzW2ZpZWxkTmFtZV07XG5cbiAgICBpZiAocGFyc2VRdWVyeU1hcFtmaWVsZE5hbWVdKSB7XG4gICAgICBkZWxldGUgY29uc3RyYWludHNbZmllbGROYW1lXTtcbiAgICAgIGZpZWxkTmFtZSA9IHBhcnNlUXVlcnlNYXBbZmllbGROYW1lXTtcbiAgICAgIGNvbnN0cmFpbnRzW2ZpZWxkTmFtZV0gPSBmaWVsZFZhbHVlO1xuICAgICAgZmllbGRWYWx1ZS5mb3JFYWNoKGZpZWxkVmFsdWVJdGVtID0+IHtcbiAgICAgICAgdHJhbnNmb3JtUXVlcnlJbnB1dFRvUGFyc2UoZmllbGRWYWx1ZUl0ZW0sIGNsYXNzTmFtZSwgcGFyc2VDbGFzc2VzKTtcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH0gZWxzZSB7XG4gICAgICB0cmFuc2Zvcm1RdWVyeUNvbnN0cmFpbnRJbnB1dFRvUGFyc2UoXG4gICAgICAgIGZpZWxkVmFsdWUsXG4gICAgICAgIGZpZWxkTmFtZSxcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICBjb25zdHJhaW50cyxcbiAgICAgICAgcGFyc2VDbGFzc2VzXG4gICAgICApO1xuICAgIH1cbiAgfSk7XG59O1xuXG5leHBvcnQgeyB0cmFuc2Zvcm1RdWVyeUNvbnN0cmFpbnRJbnB1dFRvUGFyc2UsIHRyYW5zZm9ybVF1ZXJ5SW5wdXRUb1BhcnNlIH07XG4iXX0=