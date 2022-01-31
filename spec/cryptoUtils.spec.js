const cryptoUtils = require('../lib/cryptoUtils');

function givesUniqueResults(fn, iterations) {
  const results = {};
  for (let i = 0; i < iterations; i++) {
    const s = fn();
    if (results[s]) {
      return false;
    }
    results[s] = true;
  }
  return true;
}

describe('randomString', () => {
  it('returns a string', () => {
    expect(typeof cryptoUtils.randomString(10)).toBe('string');
  });

  it('returns result of the given length', () => {
    expect(cryptoUtils.randomString(11).length).toBe(11);
    expect(cryptoUtils.randomString(25).length).toBe(25);
  });

  it('throws if requested length is zero', () => {
    expect(() => cryptoUtils.randomString(0)).toThrow();
  });

  it('returns unique results', () => {
    expect(givesUniqueResults(() => cryptoUtils.randomString(10), 100)).toBe(true);
  });
});

describe('randomHexString', () => {
  it('returns a string', () => {
    expect(typeof cryptoUtils.randomHexString(10)).toBe('string');
  });

  it('returns result of the given length', () => {
    expect(cryptoUtils.randomHexString(10).length).toBe(10);
    expect(cryptoUtils.randomHexString(32).length).toBe(32);
  });

  it('throws if requested length is zero', () => {
    expect(() => cryptoUtils.randomHexString(0)).toThrow();
  });

  it('throws if requested length is not even', () => {
    expect(() => cryptoUtils.randomHexString(11)).toThrow();
  });

  it('returns unique results', () => {
    expect(givesUniqueResults(() => cryptoUtils.randomHexString(20), 100)).toBe(true);
  });
});

describe('newObjectId', () => {
  it('returns a string', () => {
    expect(typeof cryptoUtils.newObjectId()).toBe('string');
  });

  it('returns result with at least 10 characters', () => {
    expect(cryptoUtils.newObjectId().length).toBeGreaterThan(9);
  });

  it('returns result with required number of characters', () => {
    expect(cryptoUtils.newObjectId(42).length).toBe(42);
  });

  it('returns unique results', () => {
    expect(givesUniqueResults(() => cryptoUtils.newObjectId(), 100)).toBe(true);
  });
});

describe('newToken', () => {
  it('returns a string', () => {
    expect(typeof cryptoUtils.newToken()).toBe('string');
  });

  it('returns result with at least 32 characters', () => {
    expect(cryptoUtils.newToken().length).toBeGreaterThan(31);
  });

  it('returns unique results', () => {
    expect(givesUniqueResults(() => cryptoUtils.newToken(), 100)).toBe(true);
  });
});
