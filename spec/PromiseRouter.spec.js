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

  describe('layer match result', () => {
    const params = { className: 'TestObject', objectId: 'abc' };
    let router;
    let layer;

    // The handler returns the route parameters that it receives
    beforeEach(() => {
      router = new PromiseRouter();
      router.route('PUT', '/classes/:className/:objectId', req =>
        Promise.resolve({ response: req.params })
      );
      layer = router.routes[0].layer;
    });

    it('passes route parameters returned by the layer to the handler', async () => {
      // As of router 2.3.0 the layer returns the match result and does not store it on the layer
      spyOn(layer, 'match').and.returnValue({
        params,
        path: '/classes/TestObject/abc',
        keys: ['className', 'objectId'],
        pattern: '/classes/:className/:objectId',
      });
      const { response } = await router.tryRouteRequest('PUT', '/classes/TestObject/abc', {});
      expect(response).toEqual(params);
    });

    it('passes route parameters stored on the layer to the handler', async () => {
      // Before router 2.3.0 the layer stores the match result on the layer and returns a boolean
      spyOn(layer, 'match').and.callFake(() => {
        layer.params = params;
        return true;
      });
      const { response } = await router.tryRouteRequest('PUT', '/classes/TestObject/abc', {});
      expect(response).toEqual(params);
    });
  });
});
