const { Kind } = require('graphql');
const {
  TypeValidationError,
  parseStringValue,
  parseIntValue,
  parseFloatValue,
  parseBooleanValue,
  parseDateIsoValue,
  parseValue,
  parseListValues,
  parseObjectFields,
  BYTES,
  DATE,
  FILE,
} = require('../lib/GraphQL/loaders/defaultGraphQLTypes');

function createValue(kind, value, values, fields) {
  return {
    kind,
    value,
    values,
    fields,
  };
}

function createObjectField(name, value) {
  return {
    name: {
      value: name,
    },
    value,
  };
}

describe('defaultGraphQLTypes', () => {
  describe('TypeValidationError', () => {
    it('should be an error with specific message', () => {
      const typeValidationError = new TypeValidationError('somevalue', 'sometype');
      expect(typeValidationError).toEqual(jasmine.any(Error));
      expect(typeValidationError.message).toEqual('somevalue is not a valid sometype');
    });
  });

  describe('parseStringValue', () => {
    it('should return itself if a string', () => {
      const myString = 'myString';
      expect(parseStringValue(myString)).toBe(myString);
    });

    it('should fail if not a string', () => {
      expect(() => parseStringValue()).toThrow(jasmine.stringMatching('is not a valid String'));
      expect(() => parseStringValue({})).toThrow(jasmine.stringMatching('is not a valid String'));
      expect(() => parseStringValue([])).toThrow(jasmine.stringMatching('is not a valid String'));
      expect(() => parseStringValue(123)).toThrow(jasmine.stringMatching('is not a valid String'));
    });
  });

  describe('parseIntValue', () => {
    it('should parse to number if a string', () => {
      const myString = '123';
      expect(parseIntValue(myString)).toBe(123);
    });

    it('should fail if not a string', () => {
      expect(() => parseIntValue()).toThrow(jasmine.stringMatching('is not a valid Int'));
      expect(() => parseIntValue({})).toThrow(jasmine.stringMatching('is not a valid Int'));
      expect(() => parseIntValue([])).toThrow(jasmine.stringMatching('is not a valid Int'));
      expect(() => parseIntValue(123)).toThrow(jasmine.stringMatching('is not a valid Int'));
    });

    it('should fail if not an integer string', () => {
      expect(() => parseIntValue('a123')).toThrow(jasmine.stringMatching('is not a valid Int'));
      expect(() => parseIntValue('123.4')).toThrow(jasmine.stringMatching('is not a valid Int'));
    });
  });

  describe('parseFloatValue', () => {
    it('should parse to number if a string', () => {
      expect(parseFloatValue('123')).toBe(123);
      expect(parseFloatValue('123.4')).toBe(123.4);
    });

    it('should fail if not a string', () => {
      expect(() => parseFloatValue()).toThrow(jasmine.stringMatching('is not a valid Float'));
      expect(() => parseFloatValue({})).toThrow(jasmine.stringMatching('is not a valid Float'));
      expect(() => parseFloatValue([])).toThrow(jasmine.stringMatching('is not a valid Float'));
    });

    it('should fail if not a float string', () => {
      expect(() => parseIntValue('a123')).toThrow(jasmine.stringMatching('is not a valid Int'));
    });
  });

  describe('parseBooleanValue', () => {
    it('should return itself if a boolean', () => {
      let myBoolean = true;
      expect(parseBooleanValue(myBoolean)).toBe(myBoolean);
      myBoolean = false;
      expect(parseBooleanValue(myBoolean)).toBe(myBoolean);
    });

    it('should fail if not a boolean', () => {
      expect(() => parseBooleanValue()).toThrow(jasmine.stringMatching('is not a valid Boolean'));
      expect(() => parseBooleanValue({})).toThrow(jasmine.stringMatching('is not a valid Boolean'));
      expect(() => parseBooleanValue([])).toThrow(jasmine.stringMatching('is not a valid Boolean'));
      expect(() => parseBooleanValue(123)).toThrow(
        jasmine.stringMatching('is not a valid Boolean')
      );
      expect(() => parseBooleanValue('true')).toThrow(
        jasmine.stringMatching('is not a valid Boolean')
      );
    });
  });

  describe('parseDateValue', () => {
    it('should parse to date if a string', () => {
      const myDateString = '2019-05-09T23:12:00.000Z';
      const myDate = new Date(Date.UTC(2019, 4, 9, 23, 12, 0, 0));
      expect(parseDateIsoValue(myDateString)).toEqual(myDate);
    });

    it('should fail if not a string', () => {
      expect(() => parseDateIsoValue()).toThrow(jasmine.stringMatching('is not a valid Date'));
      expect(() => parseDateIsoValue({})).toThrow(jasmine.stringMatching('is not a valid Date'));
      expect(() => parseDateIsoValue([])).toThrow(jasmine.stringMatching('is not a valid Date'));
      expect(() => parseDateIsoValue(123)).toThrow(jasmine.stringMatching('is not a valid Date'));
    });

    it('should fail if not a date string', () => {
      expect(() => parseDateIsoValue('not a date')).toThrow(
        jasmine.stringMatching('is not a valid Date')
      );
    });
  });

  describe('parseValue', () => {
    const someString = createValue(Kind.STRING, 'somestring');
    const someInt = createValue(Kind.INT, '123');
    const someFloat = createValue(Kind.FLOAT, '123.4');
    const someBoolean = createValue(Kind.BOOLEAN, true);
    const someOther = createValue(undefined, new Object());
    const someObject = createValue(Kind.OBJECT, undefined, undefined, [
      createObjectField('someString', someString),
      createObjectField('someInt', someInt),
      createObjectField('someFloat', someFloat),
      createObjectField('someBoolean', someBoolean),
      createObjectField('someOther', someOther),
      createObjectField(
        'someList',
        createValue(Kind.LIST, undefined, [
          createValue(Kind.OBJECT, undefined, undefined, [
            createObjectField('someString', someString),
          ]),
        ])
      ),
      createObjectField(
        'someObject',
        createValue(Kind.OBJECT, undefined, undefined, [
          createObjectField('someString', someString),
        ])
      ),
    ]);
    const someList = createValue(Kind.LIST, undefined, [
      someString,
      someInt,
      someFloat,
      someBoolean,
      someObject,
      someOther,
      createValue(Kind.LIST, undefined, [
        someString,
        someInt,
        someFloat,
        someBoolean,
        someObject,
        someOther,
      ]),
    ]);

    it('should parse string', () => {
      expect(parseValue(someString)).toEqual('somestring');
    });

    it('should parse int', () => {
      expect(parseValue(someInt)).toEqual(123);
    });

    it('should parse float', () => {
      expect(parseValue(someFloat)).toEqual(123.4);
    });

    it('should parse boolean', () => {
      expect(parseValue(someBoolean)).toEqual(true);
    });

    it('should parse list', () => {
      expect(parseValue(someList)).toEqual([
        'somestring',
        123,
        123.4,
        true,
        {
          someString: 'somestring',
          someInt: 123,
          someFloat: 123.4,
          someBoolean: true,
          someOther: {},
          someList: [
            {
              someString: 'somestring',
            },
          ],
          someObject: {
            someString: 'somestring',
          },
        },
        {},
        [
          'somestring',
          123,
          123.4,
          true,
          {
            someString: 'somestring',
            someInt: 123,
            someFloat: 123.4,
            someBoolean: true,
            someOther: {},
            someList: [
              {
                someString: 'somestring',
              },
            ],
            someObject: {
              someString: 'somestring',
            },
          },
          {},
        ],
      ]);
    });

    it('should parse object', () => {
      expect(parseValue(someObject)).toEqual({
        someString: 'somestring',
        someInt: 123,
        someFloat: 123.4,
        someBoolean: true,
        someOther: {},
        someList: [
          {
            someString: 'somestring',
          },
        ],
        someObject: {
          someString: 'somestring',
        },
      });
    });

    it('should return value otherwise', () => {
      expect(parseValue(someOther)).toEqual(new Object());
    });
  });

  describe('parseListValues', () => {
    it('should parse to list if an array', () => {
      expect(
        parseListValues([
          { kind: Kind.STRING, value: 'someString' },
          { kind: Kind.INT, value: '123' },
        ])
      ).toEqual(['someString', 123]);
    });

    it('should fail if not an array', () => {
      expect(() => parseListValues()).toThrow(jasmine.stringMatching('is not a valid List'));
      expect(() => parseListValues({})).toThrow(jasmine.stringMatching('is not a valid List'));
      expect(() => parseListValues('some string')).toThrow(
        jasmine.stringMatching('is not a valid List')
      );
      expect(() => parseListValues(123)).toThrow(jasmine.stringMatching('is not a valid List'));
    });
  });

  describe('parseObjectFields', () => {
    it('should parse to list if an array', () => {
      expect(
        parseObjectFields([
          {
            name: { value: 'someString' },
            value: { kind: Kind.STRING, value: 'someString' },
          },
          {
            name: { value: 'someInt' },
            value: { kind: Kind.INT, value: '123' },
          },
        ])
      ).toEqual({
        someString: 'someString',
        someInt: 123,
      });
    });

    it('should fail if not an array', () => {
      expect(() => parseObjectFields()).toThrow(jasmine.stringMatching('is not a valid Object'));
      expect(() => parseObjectFields({})).toThrow(jasmine.stringMatching('is not a valid Object'));
      expect(() => parseObjectFields('some string')).toThrow(
        jasmine.stringMatching('is not a valid Object')
      );
      expect(() => parseObjectFields(123)).toThrow(jasmine.stringMatching('is not a valid Object'));
    });
  });

  describe('Date', () => {
    describe('parse literal', () => {
      const { parseLiteral } = DATE;

      it('should parse to date if string', () => {
        const date = '2019-05-09T23:12:00.000Z';
        expect(parseLiteral(createValue(Kind.STRING, date))).toEqual({
          __type: 'Date',
          iso: new Date(date),
        });
      });

      it('should parse to date if object', () => {
        const date = '2019-05-09T23:12:00.000Z';
        expect(
          parseLiteral(
            createValue(Kind.OBJECT, undefined, undefined, [
              createObjectField('__type', { value: 'Date' }),
              createObjectField('iso', { value: date, kind: Kind.STRING }),
            ])
          )
        ).toEqual({
          __type: 'Date',
          iso: new Date(date),
        });
      });

      it('should fail if not an valid object or string', () => {
        expect(() => parseLiteral({})).toThrow(jasmine.stringMatching('is not a valid Date'));
        expect(() =>
          parseLiteral(
            createValue(Kind.OBJECT, undefined, undefined, [
              createObjectField('__type', { value: 'Foo' }),
              createObjectField('iso', { value: '2019-05-09T23:12:00.000Z' }),
            ])
          )
        ).toThrow(jasmine.stringMatching('is not a valid Date'));
        expect(() => parseLiteral([])).toThrow(jasmine.stringMatching('is not a valid Date'));
        expect(() => parseLiteral(123)).toThrow(jasmine.stringMatching('is not a valid Date'));
      });
    });

    describe('parse value', () => {
      const { parseValue } = DATE;

      it('should parse string value', () => {
        const date = '2019-05-09T23:12:00.000Z';
        expect(parseValue(date)).toEqual({
          __type: 'Date',
          iso: new Date(date),
        });
      });

      it('should parse object value', () => {
        const input = {
          __type: 'Date',
          iso: new Date('2019-05-09T23:12:00.000Z'),
        };
        expect(parseValue(input)).toEqual(input);
      });

      it('should fail if not an valid object or string', () => {
        expect(() => parseValue({})).toThrow(jasmine.stringMatching('is not a valid Date'));
        expect(() =>
          parseValue({
            __type: 'Foo',
            iso: '2019-05-09T23:12:00.000Z',
          })
        ).toThrow(jasmine.stringMatching('is not a valid Date'));
        expect(() =>
          parseValue({
            __type: 'Date',
            iso: 'foo',
          })
        ).toThrow(jasmine.stringMatching('is not a valid Date'));
        expect(() => parseValue([])).toThrow(jasmine.stringMatching('is not a valid Date'));
        expect(() => parseValue(123)).toThrow(jasmine.stringMatching('is not a valid Date'));
      });
    });

    describe('serialize date type', () => {
      const { serialize } = DATE;

      it('should do nothing if string', () => {
        const str = '2019-05-09T23:12:00.000Z';
        expect(serialize(str)).toBe(str);
      });

      it('should serialize date', () => {
        const date = new Date();
        expect(serialize(date)).toBe(date.toISOString());
      });

      it('should return iso value if object', () => {
        const iso = '2019-05-09T23:12:00.000Z';
        const date = {
          __type: 'Date',
          iso,
        };
        expect(serialize(date)).toEqual(iso);
      });

      it('should fail if not an valid object or string', () => {
        expect(() => serialize({})).toThrow(jasmine.stringMatching('is not a valid Date'));
        expect(() =>
          serialize({
            __type: 'Foo',
            iso: '2019-05-09T23:12:00.000Z',
          })
        ).toThrow(jasmine.stringMatching('is not a valid Date'));
        expect(() => serialize([])).toThrow(jasmine.stringMatching('is not a valid Date'));
        expect(() => serialize(123)).toThrow(jasmine.stringMatching('is not a valid Date'));
      });
    });
  });

  describe('Bytes', () => {
    describe('parse literal', () => {
      const { parseLiteral } = BYTES;

      it('should parse to bytes if string', () => {
        expect(parseLiteral(createValue(Kind.STRING, 'bytesContent'))).toEqual({
          __type: 'Bytes',
          base64: 'bytesContent',
        });
      });

      it('should parse to bytes if object', () => {
        expect(
          parseLiteral(
            createValue(Kind.OBJECT, undefined, undefined, [
              createObjectField('__type', { value: 'Bytes' }),
              createObjectField('base64', { value: 'bytesContent' }),
            ])
          )
        ).toEqual({
          __type: 'Bytes',
          base64: 'bytesContent',
        });
      });

      it('should fail if not an valid object or string', () => {
        expect(() => parseLiteral({})).toThrow(jasmine.stringMatching('is not a valid Bytes'));
        expect(() =>
          parseLiteral(
            createValue(Kind.OBJECT, undefined, undefined, [
              createObjectField('__type', { value: 'Foo' }),
              createObjectField('base64', { value: 'bytesContent' }),
            ])
          )
        ).toThrow(jasmine.stringMatching('is not a valid Bytes'));
        expect(() => parseLiteral([])).toThrow(jasmine.stringMatching('is not a valid Bytes'));
        expect(() => parseLiteral(123)).toThrow(jasmine.stringMatching('is not a valid Bytes'));
      });
    });

    describe('parse value', () => {
      const { parseValue } = BYTES;

      it('should parse string value', () => {
        expect(parseValue('bytesContent')).toEqual({
          __type: 'Bytes',
          base64: 'bytesContent',
        });
      });

      it('should parse object value', () => {
        const input = {
          __type: 'Bytes',
          base64: 'bytesContent',
        };
        expect(parseValue(input)).toEqual(input);
      });

      it('should fail if not an valid object or string', () => {
        expect(() => parseValue({})).toThrow(jasmine.stringMatching('is not a valid Bytes'));
        expect(() =>
          parseValue({
            __type: 'Foo',
            base64: 'bytesContent',
          })
        ).toThrow(jasmine.stringMatching('is not a valid Bytes'));
        expect(() => parseValue([])).toThrow(jasmine.stringMatching('is not a valid Bytes'));
        expect(() => parseValue(123)).toThrow(jasmine.stringMatching('is not a valid Bytes'));
      });
    });

    describe('serialize bytes type', () => {
      const { serialize } = BYTES;

      it('should do nothing if string', () => {
        const str = 'foo';
        expect(serialize(str)).toBe(str);
      });

      it('should return base64 value if object', () => {
        const base64Content = 'bytesContent';
        const bytes = {
          __type: 'Bytes',
          base64: base64Content,
        };
        expect(serialize(bytes)).toEqual(base64Content);
      });

      it('should fail if not an valid object or string', () => {
        expect(() => serialize({})).toThrow(jasmine.stringMatching('is not a valid Bytes'));
        expect(() =>
          serialize({
            __type: 'Foo',
            base64: 'bytesContent',
          })
        ).toThrow(jasmine.stringMatching('is not a valid Bytes'));
        expect(() => serialize([])).toThrow(jasmine.stringMatching('is not a valid Bytes'));
        expect(() => serialize(123)).toThrow(jasmine.stringMatching('is not a valid Bytes'));
      });
    });
  });

  describe('File', () => {
    describe('parse literal', () => {
      const { parseLiteral } = FILE;

      it('should parse to file if string', () => {
        expect(parseLiteral(createValue(Kind.STRING, 'parsefile'))).toEqual({
          __type: 'File',
          name: 'parsefile',
        });
      });

      it('should parse to file if object', () => {
        expect(
          parseLiteral(
            createValue(Kind.OBJECT, undefined, undefined, [
              createObjectField('__type', { value: 'File' }),
              createObjectField('name', { value: 'parsefile' }),
              createObjectField('url', { value: 'myurl' }),
            ])
          )
        ).toEqual({
          __type: 'File',
          name: 'parsefile',
          url: 'myurl',
        });
      });

      it('should fail if not an valid object or string', () => {
        expect(() => parseLiteral({})).toThrow(jasmine.stringMatching('is not a valid File'));
        expect(() =>
          parseLiteral(
            createValue(Kind.OBJECT, undefined, undefined, [
              createObjectField('__type', { value: 'Foo' }),
              createObjectField('name', { value: 'parsefile' }),
              createObjectField('url', { value: 'myurl' }),
            ])
          )
        ).toThrow(jasmine.stringMatching('is not a valid File'));
        expect(() => parseLiteral([])).toThrow(jasmine.stringMatching('is not a valid File'));
        expect(() => parseLiteral(123)).toThrow(jasmine.stringMatching('is not a valid File'));
      });
    });

    describe('serialize file type', () => {
      const { serialize } = FILE;

      it('should do nothing if string', () => {
        const str = 'foo';
        expect(serialize(str)).toBe(str);
      });

      it('should return file name if object', () => {
        const fileName = 'parsefile';
        const file = {
          __type: 'File',
          name: fileName,
          url: 'myurl',
        };
        expect(serialize(file)).toEqual(fileName);
      });

      it('should fail if not an valid object or string', () => {
        expect(() => serialize({})).toThrow(jasmine.stringMatching('is not a valid File'));
        expect(() =>
          serialize({
            __type: 'Foo',
            name: 'parsefile',
            url: 'myurl',
          })
        ).toThrow(jasmine.stringMatching('is not a valid File'));
        expect(() => serialize([])).toThrow(jasmine.stringMatching('is not a valid File'));
        expect(() => serialize(123)).toThrow(jasmine.stringMatching('is not a valid File'));
      });
    });
  });
});
