var features = require('../src/features')

describe('features', () => {
  it('set and get features', (done) => {
    features.setFeature('users', {
      testOption1: true,
      testOption2: false
    });

    var _features = features.getFeatures();

    var expected = {
      testOption1: true,
      testOption2: false 
    };

    expect(_features.users).toEqual(expected);
    done();
  });

  it('get features that does not exist', (done) => {
    var _features = features.getFeatures();
    expect(_features.test).toBeUndefined();
    done();
  });
});
