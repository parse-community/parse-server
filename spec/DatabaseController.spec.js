var DatabaseController = require('../src/Controllers/DatabaseController');

describe('DatabaseController', () => {
  it('can be constructed', (done) => {
    var database = new DatabaseController('mongodb://localhost:27017/test',
	{
		collectionPrefix: 'test_'
	});
    database.connect().then(done, (error) => {
      console.log('error', error.stack);
      fail();
    });
  });

});
