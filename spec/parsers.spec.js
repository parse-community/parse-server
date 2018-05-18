import {
  numberParser,
  numberOrBoolParser,
  booleanParser,
  objectParser,
  arrayParser,
  moduleOrObjectParser,
  nullParser,
} from '../src/Options/parsers';

describe('parsers', () => {
  it('parses correctly with numberParser', () => {
    const parser = numberParser('key');
    expect(parser(2)).toEqual(2);
    expect(parser('2')).toEqual(2);
    expect(() => {parser('string')}).toThrow();
  });

  it('parses correctly with numberOrBoolParser', () => {
    const parser = numberOrBoolParser('key');
    expect(parser(true)).toEqual(true);
    expect(parser(false)).toEqual(false);
    expect(parser('true')).toEqual(true);
    expect(parser('false')).toEqual(false);
    expect(parser(1)).toEqual(1);
    expect(parser('1')).toEqual(1);
  });

  it('parses correctly with booleanParser', () => {
    const parser = booleanParser;
    expect(parser(true)).toEqual(true);
    expect(parser(false)).toEqual(false);
    expect(parser('true')).toEqual(true);
    expect(parser('false')).toEqual(false);
    expect(parser(1)).toEqual(true);
    expect(parser(2)).toEqual(false);
  });

  it('parses correctly with objectParser', () => {
    const parser = objectParser;
    expect(parser({hello: 'world'})).toEqual({hello: 'world'});
    expect(parser('{"hello": "world"}')).toEqual({hello: 'world'});
    expect(() => {parser('string')}).toThrow();
  });

  it('parses correctly with moduleOrObjectParser', () => {
    const parser = moduleOrObjectParser;
    expect(parser({hello: 'world'})).toEqual({hello: 'world'});
    expect(parser('{"hello": "world"}')).toEqual({hello: 'world'});
    expect(parser('string')).toEqual('string');
  });

  it('parses correctly with arrayParser', () => {
    const parser = arrayParser;
    expect(parser([1,2,3])).toEqual([1,2,3]);
    expect(parser('{"hello": "world"}')).toEqual(['{"hello": "world"}']);
    expect(parser('1,2,3')).toEqual(['1','2','3']);
    expect(() => {parser(1)}).toThrow();
  });

  it('parses correctly with nullParser', () => {
    const parser = nullParser;
    expect(parser('null')).toEqual(null);
    expect(parser(1)).toEqual(1);
    expect(parser('blabla')).toEqual('blabla');
  });
});
