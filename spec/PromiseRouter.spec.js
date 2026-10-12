const PromiseRouter = require('../lib/PromiseRouter').default;

describe('PromiseRouter', () => {
  it('should properly handle rejects', done => {
    const router = new PromiseRouter();
    router.route(
      'GET',
      '/dummy',
      () => {
        return Promise.reject({
          error: 'an error',
          code: -1,
        });
      },
      () => {
        fail('this should not be called');
      }
    );

    router.routes[0].handler({}).then(
      result => {
        jfail(result);
        fail('this should not be called');
        done();
      },
      error => {
        expect(error.error).toEqual('an error');
        expect(error.code).toEqual(-1);
        done();
      }
    );
  });

  it('passes route parameters to the handler as decoded from the path', () => {
    const router = new PromiseRouter();
    router.route('GET', '/classes/:className/:objectId', () => Promise.resolve({ response: {} }));
    for (const objectId of ['-', '_', '~', ' ', 'abc']) {
      const { params } = router.match('GET', `/classes/123/${encodeURIComponent(objectId)}`);
      expect(params.className).toBe('123');
      expect(params.objectId).toBe(objectId);
    }
  });
});
