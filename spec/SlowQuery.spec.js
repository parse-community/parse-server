const delay = duration => new Promise(resolve => setTimeout(resolve, duration));
describe('Slow Queries', () => {
  it('can enable slow queries', async () => {
    await reconfigureServer({
      slowQuery: {
        enable: true,
        threshold: 300,
        log: true,
      },
    });
    Parse.Cloud.beforeSave('TestObject', async () => {
      await delay(500);
    });
    const logger = require('../lib/logger').logger;
    let call = '';
    spyOn(logger, 'warn').and.callFake(warn => {
      call = warn;
    });
    await new Parse.Object('TestObject').save();
    expect(call.includes('Detected a slow query on path /classes/TestObject.')).toBeTrue();
    await delay(1000);
    const slowQuery = await new Parse.Query('_SlowQuery').first({ useMasterKey: true });
    expect(slowQuery).toBeDefined();
    expect(slowQuery.get('method')).toBe('POST');
    expect(slowQuery.get('path')).toBe('/classes/TestObject');
    expect(slowQuery.get('body')).toEqual({});
    expect(slowQuery.get('query')).toEqual({});
    expect(slowQuery.get('duration')).toBeGreaterThan(500);
  });

  it('needs masterKey for slow queries', async () => {
    await reconfigureServer({
      slowQuery: {
        enable: true,
        threshold: 300,
        log: true,
      },
    });
    Parse.Cloud.beforeSave('TestObject', async () => {
      await delay(500);
    });
    await new Parse.Object('TestObject').save();
    await delay(1000);
    await expectAsync(new Parse.Query('_SlowQuery').first()).toBeRejectedWith(
      new Parse.Error(
        Parse.Error.OPERATION_FORBIDDEN,
        "Clients aren't allowed to perform the find operation on the _SlowQuery collection."
      )
    );
  });

  it('does record cloud functions', async () => {
    await reconfigureServer({
      slowQuery: {
        enable: true,
        threshold: 300,
        log: true,
      },
    });
    Parse.Cloud.define('TestFunction', async () => {
      await delay(500);
    });
    await Parse.Cloud.run('TestFunction', { foo: 'bar' });
    await delay(1000);
    const slowQuery = await new Parse.Query('_SlowQuery').first({ useMasterKey: true });
    expect(slowQuery).toBeDefined();
    expect(slowQuery.get('method')).toBe('POST');
    expect(slowQuery.get('path')).toBe('/functions/TestFunction');
    expect(slowQuery.get('body')).toEqual({ foo: 'bar' });
    expect(slowQuery.get('query')).toEqual({});
    expect(slowQuery.get('duration')).toBeGreaterThan(500);
  });

  it('does record slow find', async () => {
    await reconfigureServer({
      slowQuery: {
        enable: true,
        threshold: 300,
        log: true,
      },
    });
    Parse.Cloud.beforeFind('TestFunction', async () => {
      await delay(500);
    });
    await new Parse.Query('TestFunction').first();
    await delay(1000);
    const slowQuery = await new Parse.Query('_SlowQuery').first({ useMasterKey: true });
    expect(slowQuery).toBeDefined();
    expect(slowQuery.get('method')).toBe('GET');
    expect(slowQuery.get('path')).toBe('/classes/TestFunction');
    expect(slowQuery.get('body')).toEqual({ where: {}, limit: 1 });
    expect(slowQuery.get('query')).toEqual({});
    expect(slowQuery.get('duration')).toBeGreaterThan(500);
  });

  it('does record slow delete', async () => {
    await reconfigureServer({
      slowQuery: {
        enable: true,
        threshold: 300,
        log: true,
      },
    });
    Parse.Cloud.beforeDelete('TestObject', async () => {
      await delay(500);
    });
    const testObj = await new Parse.Object('TestObject').save();
    await testObj.destroy();
    await delay(1000);
    const slowQuery = await new Parse.Query('_SlowQuery').first({ useMasterKey: true });
    expect(slowQuery).toBeDefined();
    expect(slowQuery.get('method')).toBe('DELETE');
    expect(slowQuery.get('path')).toBe(`/classes/TestObject/${testObj.id}`);
    expect(slowQuery.get('body')).toEqual({});
    expect(slowQuery.get('query')).toEqual({});
    expect(slowQuery.get('duration')).toBeGreaterThan(500);
  });

  it('does record slow file save', async () => {
    await reconfigureServer({
      slowQuery: {
        enable: true,
        threshold: 300,
        log: true,
      },
    });
    Parse.Cloud.beforeSaveFile(async () => {
      await delay(500);
    });
    await new Parse.File('yolo.txt', [1, 2, 3], 'text/plain').save();
    await delay(1000);
    const slowQuery = await new Parse.Query('_SlowQuery').first({ useMasterKey: true });
    expect(slowQuery).toBeDefined();
    expect(slowQuery.get('method')).toBe('POST');
    expect(slowQuery.get('path')).toBe('/files/yolo.txt');
    expect(slowQuery.get('body')).toEqual({ '0': 1, '1': 2, '2': 3 });
    expect(slowQuery.get('query')).toEqual({});
    expect(slowQuery.get('duration')).toBeGreaterThan(500);
  });
});
