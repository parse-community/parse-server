
var auth = require('../Auth');
var cache = require('../cache');
var Config = require('../Config');
var DatabaseAdapter = require('../DatabaseAdapter');
var Parse = require('parse/node').Parse;
var rest = require('../rest');

var config = new Config('test');
var database = DatabaseAdapter.getDatabaseConnection('test');

describe('GlobalConfig', () => {
  beforeEach(function() {
    database.create('_GlobalConfig', { objectId: 1, params: { mostValuableCompany: 'Apple' } }, {});
  });

  it('find existing values', (done) => {
    rest.find(config, auth.nobody(config), '_GlobalConfig', 1)
    .then(() => {
      return database.mongoFind('_GlobalConfig', {}, {});
    }).then((results) => {
      expect(results.length).toEqual(1);
      var obj = results[0];
      expect(obj.params.mostValuableCompany).toEqual('Apple');
      done();
    }).catch((error) => { console.log(error); });
  });

  it('update with a new value', (done) => {
    var input = {
      params: {
        mostValuableCompany: 'Alphabet'
      }
    };
    rest.update(config, auth.nobody(config), '_GlobalConfig', 1, input)
    .then(() => {
      return database.mongoFind('_GlobalConfig', {}, {});
    }).then((results) => {
      expect(results.length).toEqual(1);
      var obj = results[0];
      expect(obj.params.mostValuableCompany).toEqual('Alphabet');
      done();
    }).catch((error) => { console.log(error); });
  });


});
