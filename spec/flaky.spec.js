let retry = 0;
const isFlaky = true;

describe('flaky', () => {
  it('example', () => {
    if (retry >= 1) {
      expect(isFlaky).toBe(true);
      return;
    }
    retry += 1;
    expect(isFlaky).toBe(false);
  });
});
