"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.transformQueryInputToParse = exports.transformQueryConstraintInputToParse = void 0;

var _graphqlRelay = require("graphql-relay");

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

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
  const fields = parseClasses.find(parseClass => parseClass.className === className).fields;

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


    if (fieldValue.key && fieldValue.value && parentConstraints && parentFieldName) {
      delete parentConstraints[parentFieldName];
      parentConstraints[`${parentFieldName}.${fieldValue.key}`] = _objectSpread({}, parentConstraints[`${parentFieldName}.${fieldValue.key}`], {
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
              constraints[whereTarget].objectId = _objectSpread({}, constraints[whereTarget].objectId, {
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
      case '$point':
      case '$nearSphere':
        if (typeof fieldValue === 'object' && !fieldValue.__type) {
          fieldValue.__type = 'GeoPoint';
        }

        break;

      case '$box':
        if (typeof fieldValue === 'object' && fieldValue.bottomLeft && fieldValue.upperRight) {
          fieldValue = [_objectSpread({
            __type: 'GeoPoint'
          }, fieldValue.bottomLeft), _objectSpread({
            __type: 'GeoPoint'
          }, fieldValue.upperRight)];
          constraints[fieldName] = fieldValue;
        }

        break;

      case '$polygon':
        if (fieldValue instanceof Array) {
          fieldValue.forEach(geoPoint => {
            if (typeof geoPoint === 'object' && !geoPoint.__type) {
              geoPoint.__type = 'GeoPoint';
            }
          });
        }

        break;

      case '$centerSphere':
        if (typeof fieldValue === 'object' && fieldValue.center && fieldValue.distance) {
          fieldValue = [_objectSpread({
            __type: 'GeoPoint'
          }, fieldValue.center), fieldValue.distance];
          constraints[fieldName] = fieldValue;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML3RyYW5zZm9ybWVycy9xdWVyeS5qcyJdLCJuYW1lcyI6WyJwYXJzZVF1ZXJ5TWFwIiwiT1IiLCJBTkQiLCJOT1IiLCJwYXJzZUNvbnN0cmFpbnRNYXAiLCJlcXVhbFRvIiwibm90RXF1YWxUbyIsImxlc3NUaGFuIiwibGVzc1RoYW5PckVxdWFsVG8iLCJncmVhdGVyVGhhbiIsImdyZWF0ZXJUaGFuT3JFcXVhbFRvIiwiaW4iLCJub3RJbiIsImV4aXN0cyIsImluUXVlcnlLZXkiLCJub3RJblF1ZXJ5S2V5IiwiaW5RdWVyeSIsIm5vdEluUXVlcnkiLCJjb250YWluZWRCeSIsImNvbnRhaW5zIiwibWF0Y2hlc1JlZ2V4Iiwib3B0aW9ucyIsInRleHQiLCJzZWFyY2giLCJ0ZXJtIiwibGFuZ3VhZ2UiLCJjYXNlU2Vuc2l0aXZlIiwiZGlhY3JpdGljU2Vuc2l0aXZlIiwibmVhclNwaGVyZSIsIm1heERpc3RhbmNlIiwibWF4RGlzdGFuY2VJblJhZGlhbnMiLCJtYXhEaXN0YW5jZUluTWlsZXMiLCJtYXhEaXN0YW5jZUluS2lsb21ldGVycyIsIndpdGhpbiIsImJveCIsImdlb1dpdGhpbiIsInBvbHlnb24iLCJjZW50ZXJTcGhlcmUiLCJnZW9JbnRlcnNlY3RzIiwicG9pbnQiLCJ0cmFuc2Zvcm1RdWVyeUNvbnN0cmFpbnRJbnB1dFRvUGFyc2UiLCJjb25zdHJhaW50cyIsInBhcmVudEZpZWxkTmFtZSIsImNsYXNzTmFtZSIsInBhcmVudENvbnN0cmFpbnRzIiwicGFyc2VDbGFzc2VzIiwiZmllbGRzIiwiZmluZCIsInBhcnNlQ2xhc3MiLCJPYmplY3QiLCJrZXlzIiwiZm9yRWFjaCIsImNvbnN0cmFpbnROYW1lIiwiY29uc3RyYWludFZhbHVlIiwiZ2xvYmFsSWRPYmplY3QiLCJ0eXBlIiwiaWQiLCJBcnJheSIsImlzQXJyYXkiLCJtYXAiLCJ2YWx1ZSIsIm9iamVjdElkIiwiZmllbGROYW1lIiwiZmllbGRWYWx1ZSIsImtleSIsInRhcmdldENsYXNzIiwid2hlcmVUYXJnZXQiLCIkZXhpc3RzIiwicGFyc2VXaGVyZVRhcmdldCIsIndoZXJlIiwiJGluUXVlcnkiLCJ0cmFuc2Zvcm1RdWVyeUlucHV0VG9QYXJzZSIsIiRub3RJblF1ZXJ5IiwiX190eXBlIiwiYm90dG9tTGVmdCIsInVwcGVyUmlnaHQiLCJnZW9Qb2ludCIsImNlbnRlciIsImRpc3RhbmNlIiwiZmllbGRWYWx1ZUl0ZW0iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7Ozs7Ozs7QUFFQSxNQUFNQSxhQUFhLEdBQUc7QUFDcEJDLEVBQUFBLEVBQUUsRUFBRSxLQURnQjtBQUVwQkMsRUFBQUEsR0FBRyxFQUFFLE1BRmU7QUFHcEJDLEVBQUFBLEdBQUcsRUFBRTtBQUhlLENBQXRCO0FBTUEsTUFBTUMsa0JBQWtCLEdBQUc7QUFDekJDLEVBQUFBLE9BQU8sRUFBRSxLQURnQjtBQUV6QkMsRUFBQUEsVUFBVSxFQUFFLEtBRmE7QUFHekJDLEVBQUFBLFFBQVEsRUFBRSxLQUhlO0FBSXpCQyxFQUFBQSxpQkFBaUIsRUFBRSxNQUpNO0FBS3pCQyxFQUFBQSxXQUFXLEVBQUUsS0FMWTtBQU16QkMsRUFBQUEsb0JBQW9CLEVBQUUsTUFORztBQU96QkMsRUFBQUEsRUFBRSxFQUFFLEtBUHFCO0FBUXpCQyxFQUFBQSxLQUFLLEVBQUUsTUFSa0I7QUFTekJDLEVBQUFBLE1BQU0sRUFBRSxTQVRpQjtBQVV6QkMsRUFBQUEsVUFBVSxFQUFFLFNBVmE7QUFXekJDLEVBQUFBLGFBQWEsRUFBRSxhQVhVO0FBWXpCQyxFQUFBQSxPQUFPLEVBQUUsVUFaZ0I7QUFhekJDLEVBQUFBLFVBQVUsRUFBRSxhQWJhO0FBY3pCQyxFQUFBQSxXQUFXLEVBQUUsY0FkWTtBQWV6QkMsRUFBQUEsUUFBUSxFQUFFLE1BZmU7QUFnQnpCQyxFQUFBQSxZQUFZLEVBQUUsUUFoQlc7QUFpQnpCQyxFQUFBQSxPQUFPLEVBQUUsVUFqQmdCO0FBa0J6QkMsRUFBQUEsSUFBSSxFQUFFLE9BbEJtQjtBQW1CekJD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QUFDQUEsTUFBQUEsVUFBVSxDQUFDWixPQUFYLENBQW1CNEIsY0FBYyxJQUFJO0FBQ25DUixRQUFBQSwwQkFBMEIsQ0FBQ1EsY0FBRCxFQUFpQnBDLFNBQWpCLEVBQTRCRSxZQUE1QixDQUExQjtBQUNELE9BRkQ7QUFHQTtBQUNELEtBUkQsTUFRTztBQUNMTCxNQUFBQSxvQ0FBb0MsQ0FDbEN1QixVQURrQyxFQUVsQ0QsU0FGa0MsRUFHbENuQixTQUhrQyxFQUlsQ0YsV0FKa0MsRUFLbENJLFlBTGtDLENBQXBDO0FBT0Q7QUFDRixHQXBCRDtBQXFCRCxDQTFCRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGZyb21HbG9iYWxJZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuXG5jb25zdCBwYXJzZVF1ZXJ5TWFwID0ge1xuICBPUjogJyRvcicsXG4gIEFORDogJyRhbmQnLFxuICBOT1I6ICckbm9yJyxcbn07XG5cbmNvbnN0IHBhcnNlQ29uc3RyYWludE1hcCA9IHtcbiAgZXF1YWxUbzogJyRlcScsXG4gIG5vdEVxdWFsVG86ICckbmUnLFxuICBsZXNzVGhhbjogJyRsdCcsXG4gIGxlc3NUaGFuT3JFcXVhbFRvOiAnJGx0ZScsXG4gIGdyZWF0ZXJUaGFuOiAnJGd0JyxcbiAgZ3JlYXRlclRoYW5PckVxdWFsVG86ICckZ3RlJyxcbiAgaW46ICckaW4nLFxuICBub3RJbjogJyRuaW4nLFxuICBleGlzdHM6ICckZXhpc3RzJyxcbiAgaW5RdWVyeUtleTogJyRzZWxlY3QnLFxuICBub3RJblF1ZXJ5S2V5OiAnJGRvbnRTZWxlY3QnLFxuICBpblF1ZXJ5OiAnJGluUXVlcnknLFxuICBub3RJblF1ZXJ5OiAnJG5vdEluUXVlcnknLFxuICBjb250YWluZWRCeTogJyRjb250YWluZWRCeScsXG4gIGNvbnRhaW5zOiAnJGFsbCcsXG4gIG1hdGNoZXNSZWdleDogJyRyZWdleCcsXG4gIG9wdGlvbnM6ICckb3B0aW9ucycsXG4gIHRleHQ6ICckdGV4dCcsXG4gIHNlYXJjaDogJyRzZWFyY2gnLFxuICB0ZXJtOiAnJHRlcm0nLFxuICBsYW5ndWFnZTogJyRsYW5ndWFnZScsXG4gIGNhc2VTZW5zaXRpdmU6ICckY2FzZVNlbnNpdGl2ZScsXG4gIGRpYWNyaXRpY1NlbnNpdGl2ZTogJyRkaWFjcml0aWNTZW5zaXRpdmUnLFxuICBuZWFyU3BoZXJlOiAnJG5lYXJTcGhlcmUnLFxuICBtYXhEaXN0YW5jZTogJyRtYXhEaXN0YW5jZScsXG4gIG1heERpc3RhbmNlSW5SYWRpYW5zOiAnJG1heERpc3RhbmNlSW5SYWRpYW5zJyxcbiAgbWF4RGlzdGFuY2VJbk1pbGVzOiAnJG1heERpc3RhbmNlSW5NaWxlcycsXG4gIG1heERpc3RhbmNlSW5LaWxvbWV0ZXJzOiAnJG1heERpc3RhbmNlSW5LaWxvbWV0ZXJzJyxcbiAgd2l0aGluOiAnJHdpdGhpbicsXG4gIGJveDogJyRib3gnLFxuICBnZW9XaXRoaW46ICckZ2VvV2l0aGluJyxcbiAgcG9seWdvbjogJyRwb2x5Z29uJyxcbiAgY2VudGVyU3BoZXJlOiAnJGNlbnRlclNwaGVyZScsXG4gIGdlb0ludGVyc2VjdHM6ICckZ2VvSW50ZXJzZWN0cycsXG4gIHBvaW50OiAnJHBvaW50Jyxcbn07XG5cbmNvbnN0IHRyYW5zZm9ybVF1ZXJ5Q29uc3RyYWludElucHV0VG9QYXJzZSA9IChcbiAgY29uc3RyYWludHMsXG4gIHBhcmVudEZpZWxkTmFtZSxcbiAgY2xhc3NOYW1lLFxuICBwYXJlbnRDb25zdHJhaW50cyxcbiAgcGFyc2VDbGFzc2VzXG4pID0+IHtcbiAgY29uc3QgZmllbGRzID0gcGFyc2VDbGFzc2VzLmZpbmQoXG4gICAgcGFyc2VDbGFzcyA9PiBwYXJzZUNsYXNzLmNsYXNzTmFtZSA9PT0gY2xhc3NOYW1lXG4gICkuZmllbGRzO1xuICBpZiAocGFyZW50RmllbGROYW1lID09PSAnaWQnICYmIGNsYXNzTmFtZSkge1xuICAgIE9iamVjdC5rZXlzKGNvbnN0cmFpbnRzKS5mb3JFYWNoKGNvbnN0cmFpbnROYW1lID0+IHtcbiAgICAgIGNvbnN0IGNvbnN0cmFpbnRWYWx1ZSA9IGNvbnN0cmFpbnRzW2NvbnN0cmFpbnROYW1lXTtcbiAgICAgIGlmICh0eXBlb2YgY29uc3RyYWludFZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICBjb25zdCBnbG9iYWxJZE9iamVjdCA9IGZyb21HbG9iYWxJZChjb25zdHJhaW50VmFsdWUpO1xuXG4gICAgICAgIGlmIChnbG9iYWxJZE9iamVjdC50eXBlID09PSBjbGFzc05hbWUpIHtcbiAgICAgICAgICBjb25zdHJhaW50c1tjb25zdHJhaW50TmFtZV0gPSBnbG9iYWxJZE9iamVjdC5pZDtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGNvbnN0cmFpbnRWYWx1ZSkpIHtcbiAgICAgICAgY29uc3RyYWludHNbY29uc3RyYWludE5hbWVdID0gY29uc3RyYWludFZhbHVlLm1hcCh2YWx1ZSA9PiB7XG4gICAgICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQodmFsdWUpO1xuXG4gICAgICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IGNsYXNzTmFtZSkge1xuICAgICAgICAgICAgcmV0dXJuIGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgcGFyZW50Q29uc3RyYWludHMub2JqZWN0SWQgPSBjb25zdHJhaW50cztcbiAgICBkZWxldGUgcGFyZW50Q29uc3RyYWludHMuaWQ7XG4gIH1cbiAgT2JqZWN0LmtleXMoY29uc3RyYWludHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICBsZXQgZmllbGRWYWx1ZSA9IGNvbnN0cmFpbnRzW2ZpZWxkTmFtZV07XG4gICAgaWYgKHBhcnNlQ29uc3RyYWludE1hcFtmaWVsZE5hbWVdKSB7XG4gICAgICBjb25zdHJhaW50c1twYXJzZUNvbnN0cmFpbnRNYXBbZmllbGROYW1lXV0gPSBjb25zdHJhaW50c1tmaWVsZE5hbWVdO1xuICAgICAgZGVsZXRlIGNvbnN0cmFpbnRzW2ZpZWxkTmFtZV07XG4gICAgfVxuICAgIC8qKlxuICAgICAqIElmIHdlIGhhdmUgYSBrZXktdmFsdWUgcGFpciwgd2UgbmVlZCB0byBjaGFuZ2UgdGhlIHdheSB0aGUgY29uc3RyYWludCBpcyBzdHJ1Y3R1cmVkLlxuICAgICAqXG4gICAgICogRXhhbXBsZTpcbiAgICAgKiAgIEZyb206XG4gICAgICogICB7XG4gICAgICogICAgIFwic29tZUZpZWxkXCI6IHtcbiAgICAgKiAgICAgICBcImxlc3NUaGFuXCI6IHtcbiAgICAgKiAgICAgICAgIFwia2V5XCI6XCJmb28uYmFyXCIsXG4gICAgICogICAgICAgICBcInZhbHVlXCI6IDEwMFxuICAgICAqICAgICAgIH0sXG4gICAgICogICAgICAgXCJncmVhdGVyVGhhblwiOiB7XG4gICAgICogICAgICAgICBcImtleVwiOlwiZm9vLmJhclwiLFxuICAgICAqICAgICAgICAgXCJ2YWx1ZVwiOiAxMFxuICAgICAqICAgICAgIH1cbiAgICAgKiAgICAgfVxuICAgICAqICAgfVxuICAgICAqXG4gICAgICogICBUbzpcbiAgICAgKiAgIHtcbiAgICAgKiAgICAgXCJzb21lRmllbGQuZm9vLmJhclwiOiB7XG4gICAgICogICAgICAgXCIkbHRcIjogMTAwLFxuICAgICAqICAgICAgIFwiJGd0XCI6IDEwXG4gICAgICogICAgICB9XG4gICAgICogICB9XG4gICAgICovXG4gICAgaWYgKFxuICAgICAgZmllbGRWYWx1ZS5rZXkgJiZcbiAgICAgIGZpZWxkVmFsdWUudmFsdWUgJiZcbiAgICAgIHBhcmVudENvbnN0cmFpbnRzICYmXG4gICAgICBwYXJlbnRGaWVsZE5hbWVcbiAgICApIHtcbiAgICAgIGRlbGV0ZSBwYXJlbnRDb25zdHJhaW50c1twYXJlbnRGaWVsZE5hbWVdO1xuICAgICAgcGFyZW50Q29uc3RyYWludHNbYCR7cGFyZW50RmllbGROYW1lfS4ke2ZpZWxkVmFsdWUua2V5fWBdID0ge1xuICAgICAgICAuLi5wYXJlbnRDb25zdHJhaW50c1tgJHtwYXJlbnRGaWVsZE5hbWV9LiR7ZmllbGRWYWx1ZS5rZXl9YF0sXG4gICAgICAgIFtwYXJzZUNvbnN0cmFpbnRNYXBbZmllbGROYW1lXV06IGZpZWxkVmFsdWUudmFsdWUsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICBmaWVsZHNbcGFyZW50RmllbGROYW1lXSAmJlxuICAgICAgKGZpZWxkc1twYXJlbnRGaWVsZE5hbWVdLnR5cGUgPT09ICdQb2ludGVyJyB8fFxuICAgICAgICBmaWVsZHNbcGFyZW50RmllbGROYW1lXS50eXBlID09PSAnUmVsYXRpb24nKVxuICAgICkge1xuICAgICAgY29uc3QgeyB0YXJnZXRDbGFzcyB9ID0gZmllbGRzW3BhcmVudEZpZWxkTmFtZV07XG4gICAgICBpZiAoZmllbGROYW1lID09PSAnZXhpc3RzJykge1xuICAgICAgICBpZiAoZmllbGRzW3BhcmVudEZpZWxkTmFtZV0udHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICAgIGNvbnN0IHdoZXJlVGFyZ2V0ID0gZmllbGRWYWx1ZSA/ICd3aGVyZScgOiAnbm90V2hlcmUnO1xuICAgICAgICAgIGlmIChjb25zdHJhaW50c1t3aGVyZVRhcmdldF0pIHtcbiAgICAgICAgICAgIGlmIChjb25zdHJhaW50c1t3aGVyZVRhcmdldF0ub2JqZWN0SWQpIHtcbiAgICAgICAgICAgICAgY29uc3RyYWludHNbd2hlcmVUYXJnZXRdLm9iamVjdElkID0ge1xuICAgICAgICAgICAgICAgIC4uLmNvbnN0cmFpbnRzW3doZXJlVGFyZ2V0XS5vYmplY3RJZCxcbiAgICAgICAgICAgICAgICAkZXhpc3RzOiBmaWVsZFZhbHVlLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgY29uc3RyYWludHNbd2hlcmVUYXJnZXRdLm9iamVjdElkID0ge1xuICAgICAgICAgICAgICAgICRleGlzdHM6IGZpZWxkVmFsdWUsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IHBhcnNlV2hlcmVUYXJnZXQgPSBmaWVsZFZhbHVlID8gJyRpblF1ZXJ5JyA6ICckbm90SW5RdWVyeSc7XG4gICAgICAgICAgICBwYXJlbnRDb25zdHJhaW50c1twYXJlbnRGaWVsZE5hbWVdW3BhcnNlV2hlcmVUYXJnZXRdID0ge1xuICAgICAgICAgICAgICB3aGVyZTogeyBvYmplY3RJZDogeyAkZXhpc3RzOiB0cnVlIH0gfSxcbiAgICAgICAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICAgIGRlbGV0ZSBjb25zdHJhaW50cy4kZXhpc3RzO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBhcmVudENvbnN0cmFpbnRzW3BhcmVudEZpZWxkTmFtZV0uJGV4aXN0cyA9IGZpZWxkVmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgc3dpdGNoIChmaWVsZE5hbWUpIHtcbiAgICAgICAgY2FzZSAnaGF2ZSc6XG4gICAgICAgICAgcGFyZW50Q29uc3RyYWludHNbcGFyZW50RmllbGROYW1lXS4kaW5RdWVyeSA9IHtcbiAgICAgICAgICAgIHdoZXJlOiBmaWVsZFZhbHVlLFxuICAgICAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgICB9O1xuICAgICAgICAgIHRyYW5zZm9ybVF1ZXJ5SW5wdXRUb1BhcnNlKFxuICAgICAgICAgICAgcGFyZW50Q29uc3RyYWludHNbcGFyZW50RmllbGROYW1lXS4kaW5RdWVyeS53aGVyZSxcbiAgICAgICAgICAgIHRhcmdldENsYXNzLFxuICAgICAgICAgICAgcGFyc2VDbGFzc2VzXG4gICAgICAgICAgKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnaGF2ZU5vdCc6XG4gICAgICAgICAgcGFyZW50Q29uc3RyYWludHNbcGFyZW50RmllbGROYW1lXS4kbm90SW5RdWVyeSA9IHtcbiAgICAgICAgICAgIHdoZXJlOiBmaWVsZFZhbHVlLFxuICAgICAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgICB9O1xuICAgICAgICAgIHRyYW5zZm9ybVF1ZXJ5SW5wdXRUb1BhcnNlKFxuICAgICAgICAgICAgcGFyZW50Q29uc3RyYWludHNbcGFyZW50RmllbGROYW1lXS4kbm90SW5RdWVyeS53aGVyZSxcbiAgICAgICAgICAgIHRhcmdldENsYXNzLFxuICAgICAgICAgICAgcGFyc2VDbGFzc2VzXG4gICAgICAgICAgKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGRlbGV0ZSBjb25zdHJhaW50c1tmaWVsZE5hbWVdO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBzd2l0Y2ggKGZpZWxkTmFtZSkge1xuICAgICAgY2FzZSAnJHBvaW50JzpcbiAgICAgIGNhc2UgJyRuZWFyU3BoZXJlJzpcbiAgICAgICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnb2JqZWN0JyAmJiAhZmllbGRWYWx1ZS5fX3R5cGUpIHtcbiAgICAgICAgICBmaWVsZFZhbHVlLl9fdHlwZSA9ICdHZW9Qb2ludCc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICckYm94JzpcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHR5cGVvZiBmaWVsZFZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgIGZpZWxkVmFsdWUuYm90dG9tTGVmdCAmJlxuICAgICAgICAgIGZpZWxkVmFsdWUudXBwZXJSaWdodFxuICAgICAgICApIHtcbiAgICAgICAgICBmaWVsZFZhbHVlID0gW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBfX3R5cGU6ICdHZW9Qb2ludCcsXG4gICAgICAgICAgICAgIC4uLmZpZWxkVmFsdWUuYm90dG9tTGVmdCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIF9fdHlwZTogJ0dlb1BvaW50JyxcbiAgICAgICAgICAgICAgLi4uZmllbGRWYWx1ZS51cHBlclJpZ2h0LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdO1xuICAgICAgICAgIGNvbnN0cmFpbnRzW2ZpZWxkTmFtZV0gPSBmaWVsZFZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnJHBvbHlnb24nOlxuICAgICAgICBpZiAoZmllbGRWYWx1ZSBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgICAgZmllbGRWYWx1ZS5mb3JFYWNoKGdlb1BvaW50ID0+IHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgZ2VvUG9pbnQgPT09ICdvYmplY3QnICYmICFnZW9Qb2ludC5fX3R5cGUpIHtcbiAgICAgICAgICAgICAgZ2VvUG9pbnQuX190eXBlID0gJ0dlb1BvaW50JztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJyRjZW50ZXJTcGhlcmUnOlxuICAgICAgICBpZiAoXG4gICAgICAgICAgdHlwZW9mIGZpZWxkVmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICAgICAgZmllbGRWYWx1ZS5jZW50ZXIgJiZcbiAgICAgICAgICBmaWVsZFZhbHVlLmRpc3RhbmNlXG4gICAgICAgICkge1xuICAgICAgICAgIGZpZWxkVmFsdWUgPSBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIF9fdHlwZTogJ0dlb1BvaW50JyxcbiAgICAgICAgICAgICAgLi4uZmllbGRWYWx1ZS5jZW50ZXIsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZmllbGRWYWx1ZS5kaXN0YW5jZSxcbiAgICAgICAgICBdO1xuICAgICAgICAgIGNvbnN0cmFpbnRzW2ZpZWxkTmFtZV0gPSBmaWVsZFZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICBpZiAoZmllbGROYW1lID09PSAnd2hlcmUnKSB7XG4gICAgICAgIHRyYW5zZm9ybVF1ZXJ5SW5wdXRUb1BhcnNlKGZpZWxkVmFsdWUsIGNsYXNzTmFtZSwgcGFyc2VDbGFzc2VzKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRyYW5zZm9ybVF1ZXJ5Q29uc3RyYWludElucHV0VG9QYXJzZShcbiAgICAgICAgICBmaWVsZFZhbHVlLFxuICAgICAgICAgIGZpZWxkTmFtZSxcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgY29uc3RyYWludHMsXG4gICAgICAgICAgcGFyc2VDbGFzc2VzXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybVF1ZXJ5SW5wdXRUb1BhcnNlID0gKGNvbnN0cmFpbnRzLCBjbGFzc05hbWUsIHBhcnNlQ2xhc3NlcykgPT4ge1xuICBpZiAoIWNvbnN0cmFpbnRzIHx8IHR5cGVvZiBjb25zdHJhaW50cyAhPT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBPYmplY3Qua2V5cyhjb25zdHJhaW50cykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgIGNvbnN0IGZpZWxkVmFsdWUgPSBjb25zdHJhaW50c1tmaWVsZE5hbWVdO1xuXG4gICAgaWYgKHBhcnNlUXVlcnlNYXBbZmllbGROYW1lXSkge1xuICAgICAgZGVsZXRlIGNvbnN0cmFpbnRzW2ZpZWxkTmFtZV07XG4gICAgICBmaWVsZE5hbWUgPSBwYXJzZVF1ZXJ5TWFwW2ZpZWxkTmFtZV07XG4gICAgICBjb25zdHJhaW50c1tmaWVsZE5hbWVdID0gZmllbGRWYWx1ZTtcbiAgICAgIGZpZWxkVmFsdWUuZm9yRWFjaChmaWVsZFZhbHVlSXRlbSA9PiB7XG4gICAgICAgIHRyYW5zZm9ybVF1ZXJ5SW5wdXRUb1BhcnNlKGZpZWxkVmFsdWVJdGVtLCBjbGFzc05hbWUsIHBhcnNlQ2xhc3Nlcyk7XG4gICAgICB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9IGVsc2Uge1xuICAgICAgdHJhbnNmb3JtUXVlcnlDb25zdHJhaW50SW5wdXRUb1BhcnNlKFxuICAgICAgICBmaWVsZFZhbHVlLFxuICAgICAgICBmaWVsZE5hbWUsXG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgY29uc3RyYWludHMsXG4gICAgICAgIHBhcnNlQ2xhc3Nlc1xuICAgICAgKTtcbiAgICB9XG4gIH0pO1xufTtcblxuZXhwb3J0IHsgdHJhbnNmb3JtUXVlcnlDb25zdHJhaW50SW5wdXRUb1BhcnNlLCB0cmFuc2Zvcm1RdWVyeUlucHV0VG9QYXJzZSB9O1xuIl19