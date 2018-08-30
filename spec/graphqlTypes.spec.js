const { NumberInput } = require('../lib/graphql/types/NumberInput');
const { ACL } = require('../lib/graphql/types/ACL');
const { JSONObject } = require('../lib/graphql/types/JSONObject');
const DateType = require('../lib/graphql/types/Date');

const {
  Kind,
} = require('graphql');

describe('NumberInput', () => {
  it('should parse litteral with regular values', () => {
    let result = NumberInput.parseLiteral({
      kind: Kind.OBJECT,
      fields: [{
        name: { value: 'increment' },
        value: { value: 1 }
      }]
    });
    expect(result).toEqual({
      __op: 'Increment',
      amount: 1
    });
    result = NumberInput.parseLiteral({
      kind: Kind.OBJECT,
      fields: [{
        name: { value: 'increment' },
        value: { value: '10' }
      }]
    });
    expect(result).toEqual({
      __op: 'Increment',
      amount: 10
    });

    result = NumberInput.parseLiteral({
      kind: Kind.OBJECT,
      fields: [{
        name: { value: 'increment' },
        value: { value: -2 }
      }]
    });
    expect(result).toEqual({
      __op: 'Increment',
      amount: -2
    });

    result = NumberInput.parseLiteral({
      kind: Kind.OBJECT,
      fields: [{
        name: { value: 'increment' },
        value: { value: '-5' }
      }]
    });
    expect(result).toEqual({
      __op: 'Increment',
      amount: -5
    });
  });

  it('should fail to parse litteral if kind is missing', () => {
    expect(() => {
      NumberInput.parseLiteral({
        fields: [{
          name: { value: 'increment' },
          value: { value: '-5' }
        }]
      });
    }).toThrow('Invalid literal for NumberInput');
  });

  it('should fail to parse litteral if too many fields are passed', () => {
    expect(() => {
      NumberInput.parseLiteral({
        kind: Kind.OBJECT,
        fields: [{
          name: { value: 'increment' },
          value: { value: '-5' }
        }, {
          name: { value: 'other' },
          value: { value: '-5' }
        }]
      });
    }).toThrow('Invalid literal for NumberInput (too many fields)');
  });

  it('should fail to parse litteral if the wrong operator is passed', () => {
    expect(() => {
      NumberInput.parseLiteral({
        kind: Kind.OBJECT,
        fields: [{
          name: { value: 'badOperator' },
          value: { value: '-5' }
        }]
      });
    }).toThrow('the badOperator operator is not supported');
  });

  it('should parse int and floats as litteral values', () => {
    expect(NumberInput.parseLiteral({
      kind: Kind.FLOAT,
      value: 10
    })).toBe(10);
    expect(NumberInput.parseLiteral({
      kind: Kind.INT,
      value: 5
    })).toBe(5);
  });

  it('should return values using serialize and parseValue', () => {
    const value = 10.34;
    expect(NumberInput.parseValue(value)).toBe(value);
    expect(NumberInput.serialize(value)).toBe(value);
  });
});

describe('ACL', () => {
  it('should parse Parse.ACL', () => {
    expect(ACL.parseValue(new Parse.ACL())).toEqual({});

    const publicACL = new Parse.ACL();
    publicACL.setPublicReadAccess(true);
    expect(ACL.parseValue(publicACL)).toEqual({ '*': { 'read': true }});

    const userACL = new Parse.ACL();
    userACL.setReadAccess('abcdef', true);
    userACL.setWriteAccess('abcdef', true);
    expect(ACL.parseValue(userACL)).toEqual({ 'abcdef': { 'read': true, 'write': true }});

    const roleACL = new Parse.ACL();
    roleACL.setReadAccess('abcdef', true);
    roleACL.setRoleWriteAccess('Admin', true);
    expect(ACL.parseValue(roleACL)).toEqual({ 'abcdef': { 'read': true }, 'role:Admin': { 'write': true }});
  });

  it('should throw when passing bad values', () => {
    expect(() => {
      console.log(ACL.parseValue(null));
    }).toThrow('Invalid ACL value, should be a Parse.ACL');

    expect(() => {
      ACL.parseValue('hello world');
    }).toThrow('Invalid ACL value, should be a Parse.ACL');

    expect(() => {
      ACL.parseLiteral();
    }).toThrow('not implemented');
  });
});

describe('JSONObject', () => {
  it('should parse a JSONObject', () => {
    expect(JSONObject.parseLiteral({
      kind: Kind.STRING,
      value: 'Hello'
    })).toBe('Hello');
    expect(JSONObject.parseLiteral({
      kind: Kind.BOOLEAN,
      value: true
    })).toBe(true);
    expect(JSONObject.parseLiteral({
      kind: Kind.BOOLEAN,
      value: false
    })).toBe(false);
    expect(JSONObject.parseLiteral({
      kind: Kind.INT,
      value: 1
    })).toBe(parseFloat(1));
    expect(JSONObject.parseLiteral({
      kind: Kind.FLOAT,
      value: 0.1 + 0.2
    })).toBe(parseFloat(0.1 + 0.2));
    expect(JSONObject.parseLiteral({
      kind: Kind.LIST,
      values: [{ value: 'a', kind: Kind.STRING }, { value: 1.0, kind: Kind.FLOAT }]
    })).toEqual(['a', 1.0]);
    expect(JSONObject.parseLiteral({
      kind: Kind.OBJECT,
      fields: [{ name: { value: 'string' }, value: { value: 'a', kind: Kind.STRING } }, { name: { value: 'floatKey' }, value: { value: 1.0, kind: Kind.FLOAT } }]
    })).toEqual({
      string: 'a',
      floatKey: 1.0
    });
    expect(JSONObject.parseLiteral({
      kind: Kind.VARIABLE,
      name: { value: 'myVariable' }
    }, { myVariable: 'myValue' })).toEqual('myValue');
    expect(JSONObject.parseLiteral({
      kind: Kind.VARIABLE,
      name: { value: 'myVariable' }
    })).toBeUndefined();
    expect(JSONObject.parseLiteral({
      kind: Kind.NULL
    })).toBe(null);
    expect(JSONObject.parseLiteral({
      kind: 'unknown kind'
    })).toBeUndefined();
  });

  it('should use identity for parseValue and serialize', () => {
    const anyObject = Object.create(null);
    expect(JSONObject.serialize(anyObject)).toBe(anyObject);
    expect(JSONObject.parseValue(anyObject)).toBe(anyObject);
  });
});

describe('Date', () => {
  it('should parse date from parse style object', () => {
    const isoDate = new Date().toISOString();
    expect(DateType.Date.serialize({
      __type: 'Date',
      iso: isoDate
    })).toEqual(new Date(isoDate));
  });

  it('should parse date from iso string', () => {
    const isoDate = new Date().toISOString();
    expect(DateType.Date.serialize(isoDate))
      .toEqual(new Date(isoDate));
  });

  it('should parse date from timestamp', () => {
    const ts = new Date().getTime();
    expect(DateType.Date.serialize(ts))
      .toEqual(new Date(ts));
  });

  it('should throw an error when passing an invalid value', () => {
    expect(() => DateType.Date.serialize(false))
      .toThrow('Cannot serialize date');
  });

  it('should parse the date value from ISO string', () => {
    const isoDate = new Date().toISOString();
    expect(DateType.Date.parseValue(isoDate))
      .toEqual({ __type: 'Date', iso: isoDate });
  });

  it('should parse the date value from timestamp', () => {
    const date = new Date();
    const ts = date.getTime();
    expect(DateType.Date.parseValue(ts))
      .toEqual({ __type: 'Date', iso: date.toISOString() });
  });

  it('should parse from string litteral', () => {
    const isoDate = new Date().toISOString();
    expect(DateType.Date.parseLiteral({ kind: Kind.STRING, value: isoDate }))
      .toEqual({ __type: 'Date', iso: isoDate });
  });

  it('should fail to parse from invalid litteral', () => {
    expect(() => DateType.Date.parseLiteral({ kind: 'invalid type' }))
      .toThrow('Cannot parse date of type invalid type')
  });
});
