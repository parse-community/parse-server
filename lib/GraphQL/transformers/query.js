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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML3RyYW5zZm9ybWVycy9xdWVyeS5qcyJdLCJuYW1lcyI6WyJwYXJzZVF1ZXJ5TWFwIiwiT1IiLCJBTkQiLCJOT1IiLCJwYXJzZUNvbnN0cmFpbnRNYXAiLCJlcXVhbFRvIiwibm90RXF1YWxUbyIsImxlc3NUaGFuIiwibGVzc1RoYW5PckVxdWFsVG8iLCJncmVhdGVyVGhhbiIsImdyZWF0ZXJUaGFuT3JFcXVhbFRvIiwiaW4iLCJub3RJbiIsImV4aXN0cyIsImluUXVlcnlLZXkiLCJub3RJblF1ZXJ5S2V5IiwiaW5RdWVyeSIsIm5vdEluUXVlcnkiLCJjb250YWluZWRCeSIsImNvbnRhaW5zIiwibWF0Y2hlc1JlZ2V4Iiwib3B0aW9ucyIsInRleHQiLCJzZWFyY2giLCJ0ZXJtIiwibGFuZ3VhZ2UiLCJjYXNlU2Vuc2l0aXZlIiwiZGlhY3JpdGljU2Vuc2l0aXZlIiwibmVhclNwaGVyZSIsIm1heERpc3RhbmNlIiwibWF4RGlzdGFuY2VJblJhZGlhbnMiLCJtYXhEaXN0YW5jZUluTWlsZXMiLCJtYXhEaXN0YW5jZUluS2lsb21ldGVycyIsIndpdGhpbiIsImJveCIsImdlb1dpdGhpbiIsInBvbHlnb24iLCJjZW50ZXJTcGhlcmUiLCJnZW9JbnRlcnNlY3RzIiwicG9pbnQiLCJ0cmFuc2Zvcm1RdWVyeUNvbnN0cmFpbnRJbnB1dFRvUGFyc2UiLCJjb25zdHJhaW50cyIsInBhcmVudEZpZWxkTmFtZSIsImNsYXNzTmFtZSIsInBhcmVudENvbnN0cmFpbnRzIiwicGFyc2VDbGFzc2VzIiwiZmllbGRzIiwiT2JqZWN0Iiwia2V5cyIsImZvckVhY2giLCJjb25zdHJhaW50TmFtZSIsImNvbnN0cmFpbnRWYWx1ZSIsImdsb2JhbElkT2JqZWN0IiwidHlwZSIsImlkIiwiQXJyYXkiLCJpc0FycmF5IiwibWFwIiwidmFsdWUiLCJvYmplY3RJZCIsImZpZWxkTmFtZSIsImZpZWxkVmFsdWUiLCJrZXkiLCJ0YXJnZXRDbGFzcyIsIndoZXJlVGFyZ2V0IiwiJGV4aXN0cyIsInBhcnNlV2hlcmVUYXJnZXQiLCJ3aGVyZSIsIiRpblF1ZXJ5IiwidHJhbnNmb3JtUXVlcnlJbnB1dFRvUGFyc2UiLCIkbm90SW5RdWVyeSIsIl9fdHlwZSIsImJvdHRvbUxlZnQiLCJ1cHBlclJpZ2h0IiwiZ2VvUG9pbnQiLCJjZW50ZXIiLCJkaXN0YW5jZSIsImZpZWxkVmFsdWVJdGVtIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7Ozs7Ozs7O0FBRUEsTUFBTUEsYUFBYSxHQUFHO0FBQ3BCQyxFQUFBQSxFQUFFLEVBQUUsS0FEZ0I7QUFFcEJDLEVBQUFBLEdBQUcsRUFBRSxNQUZlO0FBR3BCQyxFQUFBQSxHQUFHLEVBQUU7QUFIZSxDQUF0QjtBQU1BLE1BQU1DLGtCQUFrQixHQUFHO0FBQ3pCQyxFQUFBQSxPQUFPLEVBQUUsS0FEZ0I7QUFFekJDLEVBQUFBLFVBQVUsRUFBRSxLQUZhO0FBR3pCQyxFQUFBQSxRQUFRLEVBQUUsS0FIZTtBQUl6QkMsRUFBQUEsaUJBQWlCLEVBQUUsTUFKTTtBQUt6QkMsRUFBQUEsV0FBVyxFQUFFLEtBTFk7QUFNekJDLEVBQUFBLG9CQUFvQixFQUFFLE1BTkc7QUFPekJDLEVBQUFBLEVBQUUsRUFBRSxLQVBxQjtBQVF6QkMsRUFBQUEsS0FBSyxFQUFFLE1BUmtCO0FBU3pCQyxFQUFBQSxNQUFNLEVBQUUsU0FUaUI7QUFVekJDLEVBQUFBLFVBQVUsRUFBRSxTQVZhO0FBV3pCQyxFQUFBQSxhQUFhLEVBQUUsYUFYVTtBQVl6QkMsRUFBQUEsT0FBTyxFQUFFLFVBWmdCO0FBYXpCQyxFQUFBQSxVQUFVLEVBQUUsYUFiYTtBQWN6QkMsRUFBQUEsV0FBVyxFQUFFLGNBZFk7QUFlekJDLEVBQUFBLFFBQVEsRUFBRSxNQWZlO0FBZ0J6QkMsRUFBQUEsWUFBWSxFQUFFLFFBaEJXO0FBaUJ6QkMsRUFBQUEsT0FBTyxFQUFFLFVBakJnQjtBQWtCekJDLEVBQUFBLElBQUksRUFBRSxPQWxCbUI7QUFtQnpCQyxFQUFBQSxNQUFNLEVBQUUsU0Fu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QzVDLFVBQU1DLFVBQVUsR0FBR3BCLFdBQVcsQ0FBQ21CLFNBQUQsQ0FBOUI7O0FBRUEsUUFBSTVELGFBQWEsQ0FBQzRELFNBQUQsQ0FBakIsRUFBOEI7QUFDNUIsYUFBT25CLFdBQVcsQ0FBQ21CLFNBQUQsQ0FBbEI7QUFDQUEsTUFBQUEsU0FBUyxHQUFHNUQsYUFBYSxDQUFDNEQsU0FBRCxDQUF6QjtBQUNBbkIsTUFBQUEsV0FBVyxDQUFDbUIsU0FBRCxDQUFYLEdBQXlCQyxVQUF6QjtBQUNBQSxNQUFBQSxVQUFVLENBQUNaLE9BQVgsQ0FBbUI0QixjQUFjLElBQUk7QUFDbkNSLFFBQUFBLDBCQUEwQixDQUFDUSxjQUFELEVBQWlCbEMsU0FBakIsRUFBNEJFLFlBQTVCLENBQTFCO0FBQ0QsT0FGRDtBQUdBO0FBQ0QsS0FSRCxNQVFPO0FBQ0xMLE1BQUFBLG9DQUFvQyxDQUNsQ3FCLFVBRGtDLEVBRWxDRCxTQUZrQyxFQUdsQ2pCLFNBSGtDLEVBSWxDRixXQUprQyxFQUtsQ0ksWUFMa0MsQ0FBcEM7QUFPRDtBQUNGLEdBcEJEO0FBcUJELENBMUJEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgZnJvbUdsb2JhbElkIH0gZnJvbSAnZ3JhcGhxbC1yZWxheSc7XG5cbmNvbnN0IHBhcnNlUXVlcnlNYXAgPSB7XG4gIE9SOiAnJG9yJyxcbiAgQU5EOiAnJGFuZCcsXG4gIE5PUjogJyRub3InLFxufTtcblxuY29uc3QgcGFyc2VDb25zdHJhaW50TWFwID0ge1xuICBlcXVhbFRvOiAnJGVxJyxcbiAgbm90RXF1YWxUbzogJyRuZScsXG4gIGxlc3NUaGFuOiAnJGx0JyxcbiAgbGVzc1RoYW5PckVxdWFsVG86ICckbHRlJyxcbiAgZ3JlYXRlclRoYW46ICckZ3QnLFxuICBncmVhdGVyVGhhbk9yRXF1YWxUbzogJyRndGUnLFxuICBpbjogJyRpbicsXG4gIG5vdEluOiAnJG5pbicsXG4gIGV4aXN0czogJyRleGlzdHMnLFxuICBpblF1ZXJ5S2V5OiAnJHNlbGVjdCcsXG4gIG5vdEluUXVlcnlLZXk6ICckZG9udFNlbGVjdCcsXG4gIGluUXVlcnk6ICckaW5RdWVyeScsXG4gIG5vdEluUXVlcnk6ICckbm90SW5RdWVyeScsXG4gIGNvbnRhaW5lZEJ5OiAnJGNvbnRhaW5lZEJ5JyxcbiAgY29udGFpbnM6ICckYWxsJyxcbiAgbWF0Y2hlc1JlZ2V4OiAnJHJlZ2V4JyxcbiAgb3B0aW9uczogJyRvcHRpb25zJyxcbiAgdGV4dDogJyR0ZXh0JyxcbiAgc2VhcmNoOiAnJHNlYXJjaCcsXG4gIHRlcm06ICckdGVybScsXG4gIGxhbmd1YWdlOiAnJGxhbmd1YWdlJyxcbiAgY2FzZVNlbnNpdGl2ZTogJyRjYXNlU2Vuc2l0aXZlJyxcbiAgZGlhY3JpdGljU2Vuc2l0aXZlOiAnJGRpYWNyaXRpY1NlbnNpdGl2ZScsXG4gIG5lYXJTcGhlcmU6ICckbmVhclNwaGVyZScsXG4gIG1heERpc3RhbmNlOiAnJG1heERpc3RhbmNlJyxcbiAgbWF4RGlzdGFuY2VJblJhZGlhbnM6ICckbWF4RGlzdGFuY2VJblJhZGlhbnMnLFxuICBtYXhEaXN0YW5jZUluTWlsZXM6ICckbWF4RGlzdGFuY2VJbk1pbGVzJyxcbiAgbWF4RGlzdGFuY2VJbktpbG9tZXRlcnM6ICckbWF4RGlzdGFuY2VJbktpbG9tZXRlcnMnLFxuICB3aXRoaW46ICckd2l0aGluJyxcbiAgYm94OiAnJGJveCcsXG4gIGdlb1dpdGhpbjogJyRnZW9XaXRoaW4nLFxuICBwb2x5Z29uOiAnJHBvbHlnb24nLFxuICBjZW50ZXJTcGhlcmU6ICckY2VudGVyU3BoZXJlJyxcbiAgZ2VvSW50ZXJzZWN0czogJyRnZW9JbnRlcnNlY3RzJyxcbiAgcG9pbnQ6ICckcG9pbnQnLFxufTtcblxuY29uc3QgdHJhbnNmb3JtUXVlcnlDb25zdHJhaW50SW5wdXRUb1BhcnNlID0gKFxuICBjb25zdHJhaW50cyxcbiAgcGFyZW50RmllbGROYW1lLFxuICBjbGFzc05hbWUsXG4gIHBhcmVudENvbnN0cmFpbnRzLFxuICBwYXJzZUNsYXNzZXNcbikgPT4ge1xuICBjb25zdCBmaWVsZHMgPSBwYXJzZUNsYXNzZXNbY2xhc3NOYW1lXS5maWVsZHM7XG4gIGlmIChwYXJlbnRGaWVsZE5hbWUgPT09ICdpZCcgJiYgY2xhc3NOYW1lKSB7XG4gICAgT2JqZWN0LmtleXMoY29uc3RyYWludHMpLmZvckVhY2goY29uc3RyYWludE5hbWUgPT4ge1xuICAgICAgY29uc3QgY29uc3RyYWludFZhbHVlID0gY29uc3RyYWludHNbY29uc3RyYWludE5hbWVdO1xuICAgICAgaWYgKHR5cGVvZiBjb25zdHJhaW50VmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGNvbnN0IGdsb2JhbElkT2JqZWN0ID0gZnJvbUdsb2JhbElkKGNvbnN0cmFpbnRWYWx1ZSk7XG5cbiAgICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IGNsYXNzTmFtZSkge1xuICAgICAgICAgIGNvbnN0cmFpbnRzW2NvbnN0cmFpbnROYW1lXSA9IGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoY29uc3RyYWludFZhbHVlKSkge1xuICAgICAgICBjb25zdHJhaW50c1tjb25zdHJhaW50TmFtZV0gPSBjb25zdHJhaW50VmFsdWUubWFwKHZhbHVlID0+IHtcbiAgICAgICAgICBjb25zdCBnbG9iYWxJZE9iamVjdCA9IGZyb21HbG9iYWxJZCh2YWx1ZSk7XG5cbiAgICAgICAgICBpZiAoZ2xvYmFsSWRPYmplY3QudHlwZSA9PT0gY2xhc3NOYW1lKSB7XG4gICAgICAgICAgICByZXR1cm4gZ2xvYmFsSWRPYmplY3QuaWQ7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBwYXJlbnRDb25zdHJhaW50cy5vYmplY3RJZCA9IGNvbnN0cmFpbnRzO1xuICAgIGRlbGV0ZSBwYXJlbnRDb25zdHJhaW50cy5pZDtcbiAgfVxuICBPYmplY3Qua2V5cyhjb25zdHJhaW50cykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgIGxldCBmaWVsZFZhbHVlID0gY29uc3RyYWludHNbZmllbGROYW1lXTtcbiAgICBpZiAocGFyc2VDb25zdHJhaW50TWFwW2ZpZWxkTmFtZV0pIHtcbiAgICAgIGNvbnN0cmFpbnRzW3BhcnNlQ29uc3RyYWludE1hcFtmaWVsZE5hbWVdXSA9IGNvbnN0cmFpbnRzW2ZpZWxkTmFtZV07XG4gICAgICBkZWxldGUgY29uc3RyYWludHNbZmllbGROYW1lXTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogSWYgd2UgaGF2ZSBhIGtleS12YWx1ZSBwYWlyLCB3ZSBuZWVkIHRvIGNoYW5nZSB0aGUgd2F5IHRoZSBjb25zdHJhaW50IGlzIHN0cnVjdHVyZWQuXG4gICAgICpcbiAgICAgKiBFeGFtcGxlOlxuICAgICAqICAgRnJvbTpcbiAgICAgKiAgIHtcbiAgICAgKiAgICAgXCJzb21lRmllbGRcIjoge1xuICAgICAqICAgICAgIFwibGVzc1RoYW5cIjoge1xuICAgICAqICAgICAgICAgXCJrZXlcIjpcImZvby5iYXJcIixcbiAgICAgKiAgICAgICAgIFwidmFsdWVcIjogMTAwXG4gICAgICogICAgICAgfSxcbiAgICAgKiAgICAgICBcImdyZWF0ZXJUaGFuXCI6IHtcbiAgICAgKiAgICAgICAgIFwia2V5XCI6XCJmb28uYmFyXCIsXG4gICAgICogICAgICAgICBcInZhbHVlXCI6IDEwXG4gICAgICogICAgICAgfVxuICAgICAqICAgICB9XG4gICAgICogICB9XG4gICAgICpcbiAgICAgKiAgIFRvOlxuICAgICAqICAge1xuICAgICAqICAgICBcInNvbWVGaWVsZC5mb28uYmFyXCI6IHtcbiAgICAgKiAgICAgICBcIiRsdFwiOiAxMDAsXG4gICAgICogICAgICAgXCIkZ3RcIjogMTBcbiAgICAgKiAgICAgIH1cbiAgICAgKiAgIH1cbiAgICAgKi9cbiAgICBpZiAoZmllbGRWYWx1ZS5rZXkgJiYgZmllbGRWYWx1ZS52YWx1ZSAmJiBwYXJlbnRDb25zdHJhaW50cyAmJiBwYXJlbnRGaWVsZE5hbWUpIHtcbiAgICAgIGRlbGV0ZSBwYXJlbnRDb25zdHJhaW50c1twYXJlbnRGaWVsZE5hbWVdO1xuICAgICAgcGFyZW50Q29uc3RyYWludHNbYCR7cGFyZW50RmllbGROYW1lfS4ke2ZpZWxkVmFsdWUua2V5fWBdID0ge1xuICAgICAgICAuLi5wYXJlbnRDb25zdHJhaW50c1tgJHtwYXJlbnRGaWVsZE5hbWV9LiR7ZmllbGRWYWx1ZS5rZXl9YF0sXG4gICAgICAgIFtwYXJzZUNvbnN0cmFpbnRNYXBbZmllbGROYW1lXV06IGZpZWxkVmFsdWUudmFsdWUsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICBmaWVsZHNbcGFyZW50RmllbGROYW1lXSAmJlxuICAgICAgKGZpZWxkc1twYXJlbnRGaWVsZE5hbWVdLnR5cGUgPT09ICdQb2ludGVyJyB8fCBmaWVsZHNbcGFyZW50RmllbGROYW1lXS50eXBlID09PSAnUmVsYXRpb24nKVxuICAgICkge1xuICAgICAgY29uc3QgeyB0YXJnZXRDbGFzcyB9ID0gZmllbGRzW3BhcmVudEZpZWxkTmFtZV07XG4gICAgICBpZiAoZmllbGROYW1lID09PSAnZXhpc3RzJykge1xuICAgICAgICBpZiAoZmllbGRzW3BhcmVudEZpZWxkTmFtZV0udHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICAgIGNvbnN0IHdoZXJlVGFyZ2V0ID0gZmllbGRWYWx1ZSA/ICd3aGVyZScgOiAnbm90V2hlcmUnO1xuICAgICAgICAgIGlmIChjb25zdHJhaW50c1t3aGVyZVRhcmdldF0pIHtcbiAgICAgICAgICAgIGlmIChjb25zdHJhaW50c1t3aGVyZVRhcmdldF0ub2JqZWN0SWQpIHtcbiAgICAgICAgICAgICAgY29uc3RyYWludHNbd2hlcmVUYXJnZXRdLm9iamVjdElkID0ge1xuICAgICAgICAgICAgICAgIC4uLmNvbnN0cmFpbnRzW3doZXJlVGFyZ2V0XS5vYmplY3RJZCxcbiAgICAgICAgICAgICAgICAkZXhpc3RzOiBmaWVsZFZhbHVlLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgY29uc3RyYWludHNbd2hlcmVUYXJnZXRdLm9iamVjdElkID0ge1xuICAgICAgICAgICAgICAgICRleGlzdHM6IGZpZWxkVmFsdWUsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IHBhcnNlV2hlcmVUYXJnZXQgPSBmaWVsZFZhbHVlID8gJyRpblF1ZXJ5JyA6ICckbm90SW5RdWVyeSc7XG4gICAgICAgICAgICBwYXJlbnRDb25zdHJhaW50c1twYXJlbnRGaWVsZE5hbWVdW3BhcnNlV2hlcmVUYXJnZXRdID0ge1xuICAgICAgICAgICAgICB3aGVyZTogeyBvYmplY3RJZDogeyAkZXhpc3RzOiB0cnVlIH0gfSxcbiAgICAgICAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICAgIGRlbGV0ZSBjb25zdHJhaW50cy4kZXhpc3RzO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBhcmVudENvbnN0cmFpbnRzW3BhcmVudEZpZWxkTmFtZV0uJGV4aXN0cyA9IGZpZWxkVmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgc3dpdGNoIChmaWVsZE5hbWUpIHtcbiAgICAgICAgY2FzZSAnaGF2ZSc6XG4gICAgICAgICAgcGFyZW50Q29uc3RyYWludHNbcGFyZW50RmllbGROYW1lXS4kaW5RdWVyeSA9IHtcbiAgICAgICAgICAgIHdoZXJlOiBmaWVsZFZhbHVlLFxuICAgICAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgICB9O1xuICAgICAgICAgIHRyYW5zZm9ybVF1ZXJ5SW5wdXRUb1BhcnNlKFxuICAgICAgICAgICAgcGFyZW50Q29uc3RyYWludHNbcGFyZW50RmllbGROYW1lXS4kaW5RdWVyeS53aGVyZSxcbiAgICAgICAgICAgIHRhcmdldENsYXNzLFxuICAgICAgICAgICAgcGFyc2VDbGFzc2VzXG4gICAgICAgICAgKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnaGF2ZU5vdCc6XG4gICAgICAgICAgcGFyZW50Q29uc3RyYWludHNbcGFyZW50RmllbGROYW1lXS4kbm90SW5RdWVyeSA9IHtcbiAgICAgICAgICAgIHdoZXJlOiBmaWVsZFZhbHVlLFxuICAgICAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgICB9O1xuICAgICAgICAgIHRyYW5zZm9ybVF1ZXJ5SW5wdXRUb1BhcnNlKFxuICAgICAgICAgICAgcGFyZW50Q29uc3RyYWludHNbcGFyZW50RmllbGROYW1lXS4kbm90SW5RdWVyeS53aGVyZSxcbiAgICAgICAgICAgIHRhcmdldENsYXNzLFxuICAgICAgICAgICAgcGFyc2VDbGFzc2VzXG4gICAgICAgICAgKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGRlbGV0ZSBjb25zdHJhaW50c1tmaWVsZE5hbWVdO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBzd2l0Y2ggKGZpZWxkTmFtZSkge1xuICAgICAgY2FzZSAncG9pbnQnOlxuICAgICAgICBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdvYmplY3QnICYmICFmaWVsZFZhbHVlLl9fdHlwZSkge1xuICAgICAgICAgIGZpZWxkVmFsdWUuX190eXBlID0gJ0dlb1BvaW50JztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ25lYXJTcGhlcmUnOlxuICAgICAgICBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdvYmplY3QnICYmICFmaWVsZFZhbHVlLl9fdHlwZSkge1xuICAgICAgICAgIGZpZWxkVmFsdWUuX190eXBlID0gJ0dlb1BvaW50JztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2JveCc6XG4gICAgICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ29iamVjdCcgJiYgZmllbGRWYWx1ZS5ib3R0b21MZWZ0ICYmIGZpZWxkVmFsdWUudXBwZXJSaWdodCkge1xuICAgICAgICAgIGZpZWxkVmFsdWUgPSBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIF9fdHlwZTogJ0dlb1BvaW50JyxcbiAgICAgICAgICAgICAgLi4uZmllbGRWYWx1ZS5ib3R0b21MZWZ0LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgX190eXBlOiAnR2VvUG9pbnQnLFxuICAgICAgICAgICAgICAuLi5maWVsZFZhbHVlLnVwcGVyUmlnaHQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF07XG4gICAgICAgICAgY29uc3RyYWludHNbcGFyc2VDb25zdHJhaW50TWFwW2ZpZWxkTmFtZV1dID0gZmllbGRWYWx1ZTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ3BvbHlnb24nOlxuICAgICAgICBpZiAoZmllbGRWYWx1ZSBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgICAgZmllbGRWYWx1ZS5mb3JFYWNoKGdlb1BvaW50ID0+IHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgZ2VvUG9pbnQgPT09ICdvYmplY3QnICYmICFnZW9Qb2ludC5fX3R5cGUpIHtcbiAgICAgICAgICAgICAgZ2VvUG9pbnQuX190eXBlID0gJ0dlb1BvaW50JztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2NlbnRlclNwaGVyZSc6XG4gICAgICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ29iamVjdCcgJiYgZmllbGRWYWx1ZS5jZW50ZXIgJiYgZmllbGRWYWx1ZS5kaXN0YW5jZSkge1xuICAgICAgICAgIGZpZWxkVmFsdWUgPSBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIF9fdHlwZTogJ0dlb1BvaW50JyxcbiAgICAgICAgICAgICAgLi4uZmllbGRWYWx1ZS5jZW50ZXIsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZmllbGRWYWx1ZS5kaXN0YW5jZSxcbiAgICAgICAgICBdO1xuICAgICAgICAgIGNvbnN0cmFpbnRzW3BhcnNlQ29uc3RyYWludE1hcFtmaWVsZE5hbWVdXSA9IGZpZWxkVmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGlmIChmaWVsZE5hbWUgPT09ICd3aGVyZScpIHtcbiAgICAgICAgdHJhbnNmb3JtUXVlcnlJbnB1dFRvUGFyc2UoZmllbGRWYWx1ZSwgY2xhc3NOYW1lLCBwYXJzZUNsYXNzZXMpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdHJhbnNmb3JtUXVlcnlDb25zdHJhaW50SW5wdXRUb1BhcnNlKFxuICAgICAgICAgIGZpZWxkVmFsdWUsXG4gICAgICAgICAgZmllbGROYW1lLFxuICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICBjb25zdHJhaW50cyxcbiAgICAgICAgICBwYXJzZUNsYXNzZXNcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xufTtcblxuY29uc3QgdHJhbnNmb3JtUXVlcnlJbnB1dFRvUGFyc2UgPSAoY29uc3RyYWludHMsIGNsYXNzTmFtZSwgcGFyc2VDbGFzc2VzKSA9PiB7XG4gIGlmICghY29uc3RyYWludHMgfHwgdHlwZW9mIGNvbnN0cmFpbnRzICE9PSAnb2JqZWN0Jykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIE9iamVjdC5rZXlzKGNvbnN0cmFpbnRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgY29uc3QgZmllbGRWYWx1ZSA9IGNvbnN0cmFpbnRzW2ZpZWxkTmFtZV07XG5cbiAgICBpZiAocGFyc2VRdWVyeU1hcFtmaWVsZE5hbWVdKSB7XG4gICAgICBkZWxldGUgY29uc3RyYWludHNbZmllbGROYW1lXTtcbiAgICAgIGZpZWxkTmFtZSA9IHBhcnNlUXVlcnlNYXBbZmllbGROYW1lXTtcbiAgICAgIGNvbnN0cmFpbnRzW2ZpZWxkTmFtZV0gPSBmaWVsZFZhbHVlO1xuICAgICAgZmllbGRWYWx1ZS5mb3JFYWNoKGZpZWxkVmFsdWVJdGVtID0+IHtcbiAgICAgICAgdHJhbnNmb3JtUXVlcnlJbnB1dFRvUGFyc2UoZmllbGRWYWx1ZUl0ZW0sIGNsYXNzTmFtZSwgcGFyc2VDbGFzc2VzKTtcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH0gZWxzZSB7XG4gICAgICB0cmFuc2Zvcm1RdWVyeUNvbnN0cmFpbnRJbnB1dFRvUGFyc2UoXG4gICAgICAgIGZpZWxkVmFsdWUsXG4gICAgICAgIGZpZWxkTmFtZSxcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICBjb25zdHJhaW50cyxcbiAgICAgICAgcGFyc2VDbGFzc2VzXG4gICAgICApO1xuICAgIH1cbiAgfSk7XG59O1xuXG5leHBvcnQgeyB0cmFuc2Zvcm1RdWVyeUNvbnN0cmFpbnRJbnB1dFRvUGFyc2UsIHRyYW5zZm9ybVF1ZXJ5SW5wdXRUb1BhcnNlIH07XG4iXX0=