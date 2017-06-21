const TestObject = Parse.Object.extend('TestObject');

describe('Parse.Polygon testing', () => {
  it('polygon save', (done) => {
    const coords = [[0,0],[0,1],[1,0],[1,1]];
    const obj = new TestObject();
    obj.set('polygon', {__type: 'Polygon', coordinates: coords});
    return obj.save().then(() => {
      const query = new Parse.Query(TestObject);
      return query.get(obj.id);
    }).then((result) => {
      const polygon = result.get('polygon');
      equal(polygon.__type, 'Polygon');
      equal(polygon.coordinates, coords);
      done();
    }, done.fail);
  });

  it('polygon equalTo', (done) => {
    const coords = [[0,0],[0,1],[1,0],[1,1]];
    const polygon = {__type: 'Polygon', coordinates: coords};
    const obj = new TestObject();
    obj.set('polygon', polygon);
    return obj.save().then(() => {
      const query = new Parse.Query(TestObject);
      query.equalTo('polygon', polygon);
      return query.find();
    }).then((results) => {
      const polygon = results[0].get('polygon');
      equal(polygon.__type, 'Polygon');
      equal(polygon.coordinates, coords);
      done();
    }, done.fail);
  });
});
