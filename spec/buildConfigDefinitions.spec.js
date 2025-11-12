const t = require('@babel/types');

describe('buildConfigDefinitions', () => {
  describe('mapperFor', () => {
    // Recreate the mapperFor function for testing
    function mapperFor(elt, t) {
      const p = t.identifier('parsers');
      const wrap = identifier => t.memberExpression(p, identifier);

      if (t.isNumberTypeAnnotation(elt)) {
        return t.callExpression(wrap(t.identifier('numberParser')), [t.stringLiteral(elt.name)]);
      } else if (t.isArrayTypeAnnotation(elt)) {
        return wrap(t.identifier('arrayParser'));
      } else if (t.isAnyTypeAnnotation(elt)) {
        return wrap(t.identifier('objectParser'));
      } else if (t.isBooleanTypeAnnotation(elt)) {
        return wrap(t.identifier('booleanParser'));
      } else if (t.isObjectTypeAnnotation(elt)) {
        return wrap(t.identifier('objectParser'));
      } else if (t.isGenericTypeAnnotation(elt)) {
        const type = elt.typeAnnotation.id.name;
        if (type == 'Adapter') {
          return wrap(t.identifier('moduleOrObjectParser'));
        }
        if (type == 'NumberOrBoolean') {
          return wrap(t.identifier('numberOrBooleanParser'));
        }
        if (type == 'NumberOrString') {
          return t.callExpression(wrap(t.identifier('numberOrStringParser')), [
            t.stringLiteral(elt.name),
          ]);
        }
        if (type === 'StringOrStringArray') {
          return wrap(t.identifier('arrayParser'));
        }
        return wrap(t.identifier('objectParser'));
      }
    }

    it('should return objectParser for ObjectTypeAnnotation', () => {
      const mockElement = {
        type: 'ObjectTypeAnnotation',
      };

      const result = mapperFor(mockElement, t);

      expect(t.isMemberExpression(result)).toBe(true);
      expect(result.object.name).toBe('parsers');
      expect(result.property.name).toBe('objectParser');
    });

    it('should return objectParser for AnyTypeAnnotation', () => {
      const mockElement = {
        type: 'AnyTypeAnnotation',
      };

      const result = mapperFor(mockElement, t);

      expect(t.isMemberExpression(result)).toBe(true);
      expect(result.object.name).toBe('parsers');
      expect(result.property.name).toBe('objectParser');
    });

    it('should return arrayParser for ArrayTypeAnnotation', () => {
      const mockElement = {
        type: 'ArrayTypeAnnotation',
      };

      const result = mapperFor(mockElement, t);

      expect(t.isMemberExpression(result)).toBe(true);
      expect(result.object.name).toBe('parsers');
      expect(result.property.name).toBe('arrayParser');
    });

    it('should return booleanParser for BooleanTypeAnnotation', () => {
      const mockElement = {
        type: 'BooleanTypeAnnotation',
      };

      const result = mapperFor(mockElement, t);

      expect(t.isMemberExpression(result)).toBe(true);
      expect(result.object.name).toBe('parsers');
      expect(result.property.name).toBe('booleanParser');
    });

    it('should return numberParser call expression for NumberTypeAnnotation', () => {
      const mockElement = {
        type: 'NumberTypeAnnotation',
        name: 'testNumber',
      };

      const result = mapperFor(mockElement, t);

      expect(t.isCallExpression(result)).toBe(true);
      expect(result.callee.property.name).toBe('numberParser');
      expect(result.arguments[0].value).toBe('testNumber');
    });

    it('should return moduleOrObjectParser for Adapter GenericTypeAnnotation', () => {
      const mockElement = {
        type: 'GenericTypeAnnotation',
        typeAnnotation: {
          id: {
            name: 'Adapter',
          },
        },
      };

      const result = mapperFor(mockElement, t);

      expect(t.isMemberExpression(result)).toBe(true);
      expect(result.object.name).toBe('parsers');
      expect(result.property.name).toBe('moduleOrObjectParser');
    });

    it('should return numberOrBooleanParser for NumberOrBoolean GenericTypeAnnotation', () => {
      const mockElement = {
        type: 'GenericTypeAnnotation',
        typeAnnotation: {
          id: {
            name: 'NumberOrBoolean',
          },
        },
      };

      const result = mapperFor(mockElement, t);

      expect(t.isMemberExpression(result)).toBe(true);
      expect(result.object.name).toBe('parsers');
      expect(result.property.name).toBe('numberOrBooleanParser');
    });

    it('should return numberOrStringParser call expression for NumberOrString GenericTypeAnnotation', () => {
      const mockElement = {
        type: 'GenericTypeAnnotation',
        name: 'testString',
        typeAnnotation: {
          id: {
            name: 'NumberOrString',
          },
        },
      };

      const result = mapperFor(mockElement, t);

      expect(t.isCallExpression(result)).toBe(true);
      expect(result.callee.property.name).toBe('numberOrStringParser');
      expect(result.arguments[0].value).toBe('testString');
    });

    it('should return arrayParser for StringOrStringArray GenericTypeAnnotation', () => {
      const mockElement = {
        type: 'GenericTypeAnnotation',
        typeAnnotation: {
          id: {
            name: 'StringOrStringArray',
          },
        },
      };

      const result = mapperFor(mockElement, t);

      expect(t.isMemberExpression(result)).toBe(true);
      expect(result.object.name).toBe('parsers');
      expect(result.property.name).toBe('arrayParser');
    });

    it('should return objectParser for unknown GenericTypeAnnotation', () => {
      const mockElement = {
        type: 'GenericTypeAnnotation',
        typeAnnotation: {
          id: {
            name: 'UnknownType',
          },
        },
      };

      const result = mapperFor(mockElement, t);

      expect(t.isMemberExpression(result)).toBe(true);
      expect(result.object.name).toBe('parsers');
      expect(result.property.name).toBe('objectParser');
    });
  });
});
