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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML3RyYW5zZm9ybWVycy9xdWVyeS5qcyJdLCJuYW1lcyI6WyJwYXJzZVF1ZXJ5TWFwIiwiT1IiLCJBTkQiLCJOT1IiLCJwYXJzZUNvbnN0cmFpbnRNYXAiLCJlcXVhbFRvIiwibm90RXF1YWxUbyIsImxlc3NUaGFuIiwibGVzc1RoYW5PckVxdWFsVG8iLCJncmVhdGVyVGhhbiIsImdyZWF0ZXJUaGFuT3JFcXVhbFRvIiwiaW4iLCJub3RJbiIsImV4aXN0cyIsImluUXVlcnlLZXkiLCJub3RJblF1ZXJ5S2V5IiwiaW5RdWVyeSIsIm5vdEluUXVlcnkiLCJjb250YWluZWRCeSIsImNvbnRhaW5zIiwibWF0Y2hlc1JlZ2V4Iiwib3B0aW9ucyIsInRleHQiLCJzZWFyY2giLCJ0ZXJtIiwibGFuZ3VhZ2UiLCJjYXNlU2Vuc2l0aXZlIiwiZGlhY3JpdGljU2Vuc2l0aXZlIiwibmVhclNwaGVyZSIsIm1heERpc3RhbmNlIiwibWF4RGlzdGFuY2VJblJhZGlhbnMiLCJtYXhEaXN0YW5jZUluTWlsZXMiLCJtYXhEaXN0YW5jZUluS2lsb21ldGVycyIsIndpdGhpbiIsImJveCIsImdlb1dpdGhpbiIsInBvbHlnb24iLCJjZW50ZXJTcGhlcmUiLCJnZW9JbnRlcnNlY3RzIiwicG9pbnQiLCJ0cmFuc2Zvcm1RdWVyeUNvbnN0cmFpbnRJbnB1dFRvUGFyc2UiLCJjb25zdHJhaW50cyIsInBhcmVudEZpZWxkTmFtZSIsImNsYXNzTmFtZSIsInBhcmVudENvbnN0cmFpbnRzIiwicGFyc2VDbGFzc2VzIiwiZmllbGRzIiwiZmluZCIsInBhcnNlQ2xhc3MiLCJPYmplY3QiLCJrZXlzIiwiZm9yRWFjaCIsImNvbnN0cmFpbnROYW1lIiwiY29uc3RyYWludFZhbHVlIiwiZ2xvYmFsSWRPYmplY3QiLCJ0eXBlIiwiaWQiLCJBcnJheSIsImlzQXJyYXkiLCJtYXAiLCJ2YWx1ZSIsIm9iamVjdElkIiwiZmllbGROYW1lIiwiZmllbGRWYWx1ZSIsImtleSIsInRhcmdldENsYXNzIiwid2hlcmVUYXJnZXQiLCIkZXhpc3RzIiwicGFyc2VXaGVyZVRhcmdldCIsIndoZXJlIiwiJGluUXVlcnkiLCJ0cmFuc2Zvcm1RdWVyeUlucHV0VG9QYXJzZSIsIiRub3RJblF1ZXJ5IiwiX190eXBlIiwiYm90dG9tTGVmdCIsInVwcGVyUmlnaHQiLCJnZW9Qb2ludCIsImNlbnRlciIsImRpc3RhbmNlIiwiZmllbGRWYWx1ZUl0ZW0iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7Ozs7Ozs7QUFFQSxNQUFNQSxhQUFhLEdBQUc7QUFDcEJDLEVBQUFBLEVBQUUsRUFBRSxLQURnQjtBQUVwQkMsRUFBQUEsR0FBRyxFQUFFLE1BRmU7QUFHcEJDLEVBQUFBLEdBQUcsRUFBRTtBQUhlLENBQXRCO0FBTUEsTUFBTUMsa0JBQWtCLEdBQUc7QUFDekJDLEVBQUFBLE9BQU8sRUFBRSxLQURnQjtBQUV6QkMsRUFBQUEsVUFBVSxFQUFFLEtBRmE7QUFHekJDLEVBQUFBLFFBQVEsRUFBRSxLQUhlO0FBSXpCQyxFQUFBQSxpQkFBaUIsRUFBRSxNQUpNO0FBS3pCQyxFQUFBQSxXQUFXLEVBQUUsS0FMWTtBQU16QkMsRUFBQUEsb0JBQW9CLEVBQUUsTUFORztBQU96QkMsRUFBQUEsRUFBRSxFQUFFLEtBUHFCO0FBUXpCQyxFQUFBQSxLQUFLLEVBQUUsTUFSa0I7QUFTekJDLEVBQUFBLE1BQU0sRUFBRSxTQVRpQjtBQVV6QkMsRUFBQUEsVUFBVSxFQUFFLFNBVmE7QUFXekJDLEVBQUFBLGFBQWEsRUFBRSxhQVhVO0FBWXpCQyxFQUFBQSxPQUFPLEVBQUUsVUFaZ0I7QUFhekJDLEVBQUFBLFVBQVUsRUFBRSxhQWJhO0FBY3pCQyxFQUFBQSxXQUFXLEVBQUUsY0FkWTtBQWV6QkMsRUFBQUEsUUFBUSxFQUFFLE1BZmU7QUFnQnpCQyxFQUFBQSxZQUFZLEVBQUUsUUFoQlc7QUFpQnpCQyxFQUFBQSxPQUFPLEVBQUUsVUFqQmdCO0FBa0J6QkMsRUFBQUEsSUFBSSxFQUFFLE9BbEJtQjtBQW1CekJD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LFNBQUQsQ0FBOUI7O0FBRUEsUUFBSTlELGFBQWEsQ0FBQzhELFNBQUQsQ0FBakIsRUFBOEI7QUFDNUIsYUFBT3JCLFdBQVcsQ0FBQ3FCLFNBQUQsQ0FBbEI7QUFDQUEsTUFBQUEsU0FBUyxHQUFHOUQsYUFBYSxDQUFDOEQsU0FBRCxDQUF6QjtBQUNBckIsTUFBQUEsV0FBVyxDQUFDcUIsU0FBRCxDQUFYLEdBQXlCQyxVQUF6QjtBQUNBQSxNQUFBQSxVQUFVLENBQUNaLE9BQVgsQ0FBbUI0QixjQUFjLElBQUk7QUFDbkNSLFFBQUFBLDBCQUEwQixDQUFDUSxjQUFELEVBQWlCcEMsU0FBakIsRUFBNEJFLFlBQTVCLENBQTFCO0FBQ0QsT0FGRDtBQUdBO0FBQ0QsS0FSRCxNQVFPO0FBQ0xMLE1BQUFBLG9DQUFvQyxDQUNsQ3VCLFVBRGtDLEVBRWxDRCxTQUZrQyxFQUdsQ25CLFNBSGtDLEVBSWxDRixXQUprQyxFQUtsQ0ksWUFMa0MsQ0FBcEM7QUFPRDtBQUNGLEdBcEJEO0FBcUJELENBMUJEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgZnJvbUdsb2JhbElkIH0gZnJvbSAnZ3JhcGhxbC1yZWxheSc7XG5cbmNvbnN0IHBhcnNlUXVlcnlNYXAgPSB7XG4gIE9SOiAnJG9yJyxcbiAgQU5EOiAnJGFuZCcsXG4gIE5PUjogJyRub3InLFxufTtcblxuY29uc3QgcGFyc2VDb25zdHJhaW50TWFwID0ge1xuICBlcXVhbFRvOiAnJGVxJyxcbiAgbm90RXF1YWxUbzogJyRuZScsXG4gIGxlc3NUaGFuOiAnJGx0JyxcbiAgbGVzc1RoYW5PckVxdWFsVG86ICckbHRlJyxcbiAgZ3JlYXRlclRoYW46ICckZ3QnLFxuICBncmVhdGVyVGhhbk9yRXF1YWxUbzogJyRndGUnLFxuICBpbjogJyRpbicsXG4gIG5vdEluOiAnJG5pbicsXG4gIGV4aXN0czogJyRleGlzdHMnLFxuICBpblF1ZXJ5S2V5OiAnJHNlbGVjdCcsXG4gIG5vdEluUXVlcnlLZXk6ICckZG9udFNlbGVjdCcsXG4gIGluUXVlcnk6ICckaW5RdWVyeScsXG4gIG5vdEluUXVlcnk6ICckbm90SW5RdWVyeScsXG4gIGNvbnRhaW5lZEJ5OiAnJGNvbnRhaW5lZEJ5JyxcbiAgY29udGFpbnM6ICckYWxsJyxcbiAgbWF0Y2hlc1JlZ2V4OiAnJHJlZ2V4JyxcbiAgb3B0aW9uczogJyRvcHRpb25zJyxcbiAgdGV4dDogJyR0ZXh0JyxcbiAgc2VhcmNoOiAnJHNlYXJjaCcsXG4gIHRlcm06ICckdGVybScsXG4gIGxhbmd1YWdlOiAnJGxhbmd1YWdlJyxcbiAgY2FzZVNlbnNpdGl2ZTogJyRjYXNlU2Vuc2l0aXZlJyxcbiAgZGlhY3JpdGljU2Vuc2l0aXZlOiAnJGRpYWNyaXRpY1NlbnNpdGl2ZScsXG4gIG5lYXJTcGhlcmU6ICckbmVhclNwaGVyZScsXG4gIG1heERpc3RhbmNlOiAnJG1heERpc3RhbmNlJyxcbiAgbWF4RGlzdGFuY2VJblJhZGlhbnM6ICckbWF4RGlzdGFuY2VJblJhZGlhbnMnLFxuICBtYXhEaXN0YW5jZUluTWlsZXM6ICckbWF4RGlzdGFuY2VJbk1pbGVzJyxcbiAgbWF4RGlzdGFuY2VJbktpbG9tZXRlcnM6ICckbWF4RGlzdGFuY2VJbktpbG9tZXRlcnMnLFxuICB3aXRoaW46ICckd2l0aGluJyxcbiAgYm94OiAnJGJveCcsXG4gIGdlb1dpdGhpbjogJyRnZW9XaXRoaW4nLFxuICBwb2x5Z29uOiAnJHBvbHlnb24nLFxuICBjZW50ZXJTcGhlcmU6ICckY2VudGVyU3BoZXJlJyxcbiAgZ2VvSW50ZXJzZWN0czogJyRnZW9JbnRlcnNlY3RzJyxcbiAgcG9pbnQ6ICckcG9pbnQnLFxufTtcblxuY29uc3QgdHJhbnNmb3JtUXVlcnlDb25zdHJhaW50SW5wdXRUb1BhcnNlID0gKFxuICBjb25zdHJhaW50cyxcbiAgcGFyZW50RmllbGROYW1lLFxuICBjbGFzc05hbWUsXG4gIHBhcmVudENvbnN0cmFpbnRzLFxuICBwYXJzZUNsYXNzZXNcbikgPT4ge1xuICBjb25zdCBmaWVsZHMgPSBwYXJzZUNsYXNzZXMuZmluZChwYXJzZUNsYXNzID0+IHBhcnNlQ2xhc3MuY2xhc3NOYW1lID09PSBjbGFzc05hbWUpLmZpZWxkcztcbiAgaWYgKHBhcmVudEZpZWxkTmFtZSA9PT0gJ2lkJyAmJiBjbGFzc05hbWUpIHtcbiAgICBPYmplY3Qua2V5cyhjb25zdHJhaW50cykuZm9yRWFjaChjb25zdHJhaW50TmFtZSA9PiB7XG4gICAgICBjb25zdCBjb25zdHJhaW50VmFsdWUgPSBjb25zdHJhaW50c1tjb25zdHJhaW50TmFtZV07XG4gICAgICBpZiAodHlwZW9mIGNvbnN0cmFpbnRWYWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQoY29uc3RyYWludFZhbHVlKTtcblxuICAgICAgICBpZiAoZ2xvYmFsSWRPYmplY3QudHlwZSA9PT0gY2xhc3NOYW1lKSB7XG4gICAgICAgICAgY29uc3RyYWludHNbY29uc3RyYWludE5hbWVdID0gZ2xvYmFsSWRPYmplY3QuaWQ7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShjb25zdHJhaW50VmFsdWUpKSB7XG4gICAgICAgIGNvbnN0cmFpbnRzW2NvbnN0cmFpbnROYW1lXSA9IGNvbnN0cmFpbnRWYWx1ZS5tYXAodmFsdWUgPT4ge1xuICAgICAgICAgIGNvbnN0IGdsb2JhbElkT2JqZWN0ID0gZnJvbUdsb2JhbElkKHZhbHVlKTtcblxuICAgICAgICAgIGlmIChnbG9iYWxJZE9iamVjdC50eXBlID09PSBjbGFzc05hbWUpIHtcbiAgICAgICAgICAgIHJldHVybiBnbG9iYWxJZE9iamVjdC5pZDtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHBhcmVudENvbnN0cmFpbnRzLm9iamVjdElkID0gY29uc3RyYWludHM7XG4gICAgZGVsZXRlIHBhcmVudENvbnN0cmFpbnRzLmlkO1xuICB9XG4gIE9iamVjdC5rZXlzKGNvbnN0cmFpbnRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgbGV0IGZpZWxkVmFsdWUgPSBjb25zdHJhaW50c1tmaWVsZE5hbWVdO1xuICAgIGlmIChwYXJzZUNvbnN0cmFpbnRNYXBbZmllbGROYW1lXSkge1xuICAgICAgY29uc3RyYWludHNbcGFyc2VDb25zdHJhaW50TWFwW2ZpZWxkTmFtZV1dID0gY29uc3RyYWludHNbZmllbGROYW1lXTtcbiAgICAgIGRlbGV0ZSBjb25zdHJhaW50c1tmaWVsZE5hbWVdO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBJZiB3ZSBoYXZlIGEga2V5LXZhbHVlIHBhaXIsIHdlIG5lZWQgdG8gY2hhbmdlIHRoZSB3YXkgdGhlIGNvbnN0cmFpbnQgaXMgc3RydWN0dXJlZC5cbiAgICAgKlxuICAgICAqIEV4YW1wbGU6XG4gICAgICogICBGcm9tOlxuICAgICAqICAge1xuICAgICAqICAgICBcInNvbWVGaWVsZFwiOiB7XG4gICAgICogICAgICAgXCJsZXNzVGhhblwiOiB7XG4gICAgICogICAgICAgICBcImtleVwiOlwiZm9vLmJhclwiLFxuICAgICAqICAgICAgICAgXCJ2YWx1ZVwiOiAxMDBcbiAgICAgKiAgICAgICB9LFxuICAgICAqICAgICAgIFwiZ3JlYXRlclRoYW5cIjoge1xuICAgICAqICAgICAgICAgXCJrZXlcIjpcImZvby5iYXJcIixcbiAgICAgKiAgICAgICAgIFwidmFsdWVcIjogMTBcbiAgICAgKiAgICAgICB9XG4gICAgICogICAgIH1cbiAgICAgKiAgIH1cbiAgICAgKlxuICAgICAqICAgVG86XG4gICAgICogICB7XG4gICAgICogICAgIFwic29tZUZpZWxkLmZvby5iYXJcIjoge1xuICAgICAqICAgICAgIFwiJGx0XCI6IDEwMCxcbiAgICAgKiAgICAgICBcIiRndFwiOiAxMFxuICAgICAqICAgICAgfVxuICAgICAqICAgfVxuICAgICAqL1xuICAgIGlmIChmaWVsZFZhbHVlLmtleSAmJiBmaWVsZFZhbHVlLnZhbHVlICYmIHBhcmVudENvbnN0cmFpbnRzICYmIHBhcmVudEZpZWxkTmFtZSkge1xuICAgICAgZGVsZXRlIHBhcmVudENvbnN0cmFpbnRzW3BhcmVudEZpZWxkTmFtZV07XG4gICAgICBwYXJlbnRDb25zdHJhaW50c1tgJHtwYXJlbnRGaWVsZE5hbWV9LiR7ZmllbGRWYWx1ZS5rZXl9YF0gPSB7XG4gICAgICAgIC4uLnBhcmVudENvbnN0cmFpbnRzW2Ake3BhcmVudEZpZWxkTmFtZX0uJHtmaWVsZFZhbHVlLmtleX1gXSxcbiAgICAgICAgW3BhcnNlQ29uc3RyYWludE1hcFtmaWVsZE5hbWVdXTogZmllbGRWYWx1ZS52YWx1ZSxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIGZpZWxkc1twYXJlbnRGaWVsZE5hbWVdICYmXG4gICAgICAoZmllbGRzW3BhcmVudEZpZWxkTmFtZV0udHlwZSA9PT0gJ1BvaW50ZXInIHx8IGZpZWxkc1twYXJlbnRGaWVsZE5hbWVdLnR5cGUgPT09ICdSZWxhdGlvbicpXG4gICAgKSB7XG4gICAgICBjb25zdCB7IHRhcmdldENsYXNzIH0gPSBmaWVsZHNbcGFyZW50RmllbGROYW1lXTtcbiAgICAgIGlmIChmaWVsZE5hbWUgPT09ICdleGlzdHMnKSB7XG4gICAgICAgIGlmIChmaWVsZHNbcGFyZW50RmllbGROYW1lXS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgICAgY29uc3Qgd2hlcmVUYXJnZXQgPSBmaWVsZFZhbHVlID8gJ3doZXJlJyA6ICdub3RXaGVyZSc7XG4gICAgICAgICAgaWYgKGNvbnN0cmFpbnRzW3doZXJlVGFyZ2V0XSkge1xuICAgICAgICAgICAgaWYgKGNvbnN0cmFpbnRzW3doZXJlVGFyZ2V0XS5vYmplY3RJZCkge1xuICAgICAgICAgICAgICBjb25zdHJhaW50c1t3aGVyZVRhcmdldF0ub2JqZWN0SWQgPSB7XG4gICAgICAgICAgICAgICAgLi4uY29uc3RyYWludHNbd2hlcmVUYXJnZXRdLm9iamVjdElkLFxuICAgICAgICAgICAgICAgICRleGlzdHM6IGZpZWxkVmFsdWUsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBjb25zdHJhaW50c1t3aGVyZVRhcmdldF0ub2JqZWN0SWQgPSB7XG4gICAgICAgICAgICAgICAgJGV4aXN0czogZmllbGRWYWx1ZSxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgcGFyc2VXaGVyZVRhcmdldCA9IGZpZWxkVmFsdWUgPyAnJGluUXVlcnknIDogJyRub3RJblF1ZXJ5JztcbiAgICAgICAgICAgIHBhcmVudENvbnN0cmFpbnRzW3BhcmVudEZpZWxkTmFtZV1bcGFyc2VXaGVyZVRhcmdldF0gPSB7XG4gICAgICAgICAgICAgIHdoZXJlOiB7IG9iamVjdElkOiB7ICRleGlzdHM6IHRydWUgfSB9LFxuICAgICAgICAgICAgICBjbGFzc05hbWU6IHRhcmdldENsYXNzLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9XG4gICAgICAgICAgZGVsZXRlIGNvbnN0cmFpbnRzLiRleGlzdHM7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcGFyZW50Q29uc3RyYWludHNbcGFyZW50RmllbGROYW1lXS4kZXhpc3RzID0gZmllbGRWYWx1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBzd2l0Y2ggKGZpZWxkTmFtZSkge1xuICAgICAgICBjYXNlICdoYXZlJzpcbiAgICAgICAgICBwYXJlbnRDb25zdHJhaW50c1twYXJlbnRGaWVsZE5hbWVdLiRpblF1ZXJ5ID0ge1xuICAgICAgICAgICAgd2hlcmU6IGZpZWxkVmFsdWUsXG4gICAgICAgICAgICBjbGFzc05hbWU6IHRhcmdldENsYXNzLFxuICAgICAgICAgIH07XG4gICAgICAgICAgdHJhbnNmb3JtUXVlcnlJbnB1dFRvUGFyc2UoXG4gICAgICAgICAgICBwYXJlbnRDb25zdHJhaW50c1twYXJlbnRGaWVsZE5hbWVdLiRpblF1ZXJ5LndoZXJlLFxuICAgICAgICAgICAgdGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICBwYXJzZUNsYXNzZXNcbiAgICAgICAgICApO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdoYXZlTm90JzpcbiAgICAgICAgICBwYXJlbnRDb25zdHJhaW50c1twYXJlbnRGaWVsZE5hbWVdLiRub3RJblF1ZXJ5ID0ge1xuICAgICAgICAgICAgd2hlcmU6IGZpZWxkVmFsdWUsXG4gICAgICAgICAgICBjbGFzc05hbWU6IHRhcmdldENsYXNzLFxuICAgICAgICAgIH07XG4gICAgICAgICAgdHJhbnNmb3JtUXVlcnlJbnB1dFRvUGFyc2UoXG4gICAgICAgICAgICBwYXJlbnRDb25zdHJhaW50c1twYXJlbnRGaWVsZE5hbWVdLiRub3RJblF1ZXJ5LndoZXJlLFxuICAgICAgICAgICAgdGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICBwYXJzZUNsYXNzZXNcbiAgICAgICAgICApO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgZGVsZXRlIGNvbnN0cmFpbnRzW2ZpZWxkTmFtZV07XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHN3aXRjaCAoZmllbGROYW1lKSB7XG4gICAgICBjYXNlICdwb2ludCc6XG4gICAgICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ29iamVjdCcgJiYgIWZpZWxkVmFsdWUuX190eXBlKSB7XG4gICAgICAgICAgZmllbGRWYWx1ZS5fX3R5cGUgPSAnR2VvUG9pbnQnO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnbmVhclNwaGVyZSc6XG4gICAgICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ29iamVjdCcgJiYgIWZpZWxkVmFsdWUuX190eXBlKSB7XG4gICAgICAgICAgZmllbGRWYWx1ZS5fX3R5cGUgPSAnR2VvUG9pbnQnO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnYm94JzpcbiAgICAgICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnb2JqZWN0JyAmJiBmaWVsZFZhbHVlLmJvdHRvbUxlZnQgJiYgZmllbGRWYWx1ZS51cHBlclJpZ2h0KSB7XG4gICAgICAgICAgZmllbGRWYWx1ZSA9IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgX190eXBlOiAnR2VvUG9pbnQnLFxuICAgICAgICAgICAgICAuLi5maWVsZFZhbHVlLmJvdHRvbUxlZnQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBfX3R5cGU6ICdHZW9Qb2ludCcsXG4gICAgICAgICAgICAgIC4uLmZpZWxkVmFsdWUudXBwZXJSaWdodCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXTtcbiAgICAgICAgICBjb25zdHJhaW50c1twYXJzZUNvbnN0cmFpbnRNYXBbZmllbGROYW1lXV0gPSBmaWVsZFZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAncG9seWdvbic6XG4gICAgICAgIGlmIChmaWVsZFZhbHVlIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgICBmaWVsZFZhbHVlLmZvckVhY2goZ2VvUG9pbnQgPT4ge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBnZW9Qb2ludCA9PT0gJ29iamVjdCcgJiYgIWdlb1BvaW50Ll9fdHlwZSkge1xuICAgICAgICAgICAgICBnZW9Qb2ludC5fX3R5cGUgPSAnR2VvUG9pbnQnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnY2VudGVyU3BoZXJlJzpcbiAgICAgICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnb2JqZWN0JyAmJiBmaWVsZFZhbHVlLmNlbnRlciAmJiBmaWVsZFZhbHVlLmRpc3RhbmNlKSB7XG4gICAgICAgICAgZmllbGRWYWx1ZSA9IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgX190eXBlOiAnR2VvUG9pbnQnLFxuICAgICAgICAgICAgICAuLi5maWVsZFZhbHVlLmNlbnRlcixcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmaWVsZFZhbHVlLmRpc3RhbmNlLFxuICAgICAgICAgIF07XG4gICAgICAgICAgY29uc3RyYWludHNbcGFyc2VDb25zdHJhaW50TWFwW2ZpZWxkTmFtZV1dID0gZmllbGRWYWx1ZTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgaWYgKGZpZWxkTmFtZSA9PT0gJ3doZXJlJykge1xuICAgICAgICB0cmFuc2Zvcm1RdWVyeUlucHV0VG9QYXJzZShmaWVsZFZhbHVlLCBjbGFzc05hbWUsIHBhcnNlQ2xhc3Nlcyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0cmFuc2Zvcm1RdWVyeUNvbnN0cmFpbnRJbnB1dFRvUGFyc2UoXG4gICAgICAgICAgZmllbGRWYWx1ZSxcbiAgICAgICAgICBmaWVsZE5hbWUsXG4gICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgIGNvbnN0cmFpbnRzLFxuICAgICAgICAgIHBhcnNlQ2xhc3Nlc1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1RdWVyeUlucHV0VG9QYXJzZSA9IChjb25zdHJhaW50cywgY2xhc3NOYW1lLCBwYXJzZUNsYXNzZXMpID0+IHtcbiAgaWYgKCFjb25zdHJhaW50cyB8fCB0eXBlb2YgY29uc3RyYWludHMgIT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgT2JqZWN0LmtleXMoY29uc3RyYWludHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICBjb25zdCBmaWVsZFZhbHVlID0gY29uc3RyYWludHNbZmllbGROYW1lXTtcblxuICAgIGlmIChwYXJzZVF1ZXJ5TWFwW2ZpZWxkTmFtZV0pIHtcbiAgICAgIGRlbGV0ZSBjb25zdHJhaW50c1tmaWVsZE5hbWVdO1xuICAgICAgZmllbGROYW1lID0gcGFyc2VRdWVyeU1hcFtmaWVsZE5hbWVdO1xuICAgICAgY29uc3RyYWludHNbZmllbGROYW1lXSA9IGZpZWxkVmFsdWU7XG4gICAgICBmaWVsZFZhbHVlLmZvckVhY2goZmllbGRWYWx1ZUl0ZW0gPT4ge1xuICAgICAgICB0cmFuc2Zvcm1RdWVyeUlucHV0VG9QYXJzZShmaWVsZFZhbHVlSXRlbSwgY2xhc3NOYW1lLCBwYXJzZUNsYXNzZXMpO1xuICAgICAgfSk7XG4gICAgICByZXR1cm47XG4gICAgfSBlbHNlIHtcbiAgICAgIHRyYW5zZm9ybVF1ZXJ5Q29uc3RyYWludElucHV0VG9QYXJzZShcbiAgICAgICAgZmllbGRWYWx1ZSxcbiAgICAgICAgZmllbGROYW1lLFxuICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIGNvbnN0cmFpbnRzLFxuICAgICAgICBwYXJzZUNsYXNzZXNcbiAgICAgICk7XG4gICAgfVxuICB9KTtcbn07XG5cbmV4cG9ydCB7IHRyYW5zZm9ybVF1ZXJ5Q29uc3RyYWludElucHV0VG9QYXJzZSwgdHJhbnNmb3JtUXVlcnlJbnB1dFRvUGFyc2UgfTtcbiJdfQ==