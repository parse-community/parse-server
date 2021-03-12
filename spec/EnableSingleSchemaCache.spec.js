const auth = require('../lib/Auth');
const Config = require('../lib/Config');
const rest = require('../lib/rest');

describe('Enable single schema cache', () => {
  beforeEach(done => {
    reconfigureServer({
      enableSingleSchemaCache: true,
      schemaCacheTTL: 30000,
    }).then(() => {
      done();
    });
  });

  it('can perform multiple create and query operations', done => {
    let config = fakeRequestForConfig();
    let nobody = auth.nobody(config);
    rest
      .create(config, nobody, 'Foo', { type: 1 })
      .then(() => {
        config = fakeRequestForConfig();
        nobody = auth.nobody(config);
        return rest.create(config, nobody, 'Foo', { type: 2 });
      })
      .then(() => {
        config = fakeRequestForConfig();
        nobody = auth.nobody(config);
        return rest.create(config, nobody, 'Bar');
      })
      .then(() => {
        config = fakeRequestForConfig();
        nobody = auth.nobody(config);
        return rest.find(config, nobody, 'Bar', { type: 1 });
      })
      .then(
        () => {
          fail('Should throw error');
          done();
        },
        error => {
          config = fakeRequestForConfig();
          nobody = auth.nobody(config);
          expect(error).toBeDefined();
          return rest.find(config, nobody, 'Foo', { type: 1 });
        }
      )
      .then(response => {
        config = fakeRequestForConfig();
        nobody = auth.nobody(config);
        expect(response.results.length).toEqual(1);
        done();
      });
  });
});

const fakeRequestForConfig = function () {
  return Config.get('test');
};
