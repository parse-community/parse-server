import {
  numberParser,
  numberOrBoolParser,
  booleanParser,
} from '../src/cli/utils/parsers';

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
});
