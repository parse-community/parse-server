// installations.js

var Parse = require('parse/node').Parse;
var PromiseRouter = require('./PromiseRouter');
var rest = require('./rest');

var router = new PromiseRouter();


// Returns a promise for a {status, response, location} object.
function handleCreate(req) {
    return rest.create(req.config,
                     req.auth, '_Installation', req.body);
}

// Returns a promise that resolves to a {response} object.
function handleFind(req) {
    var options = {};
    if (req.body.skip) {
        options.skip = Number(req.body.skip);
    }
    if (req.body.limit) {
        options.limit = Number(req.body.limit);
    }
    if (req.body.order) {
        options.order = String(req.body.order);
    }
    if (req.body.count) {
        options.count = true;
    }
    if (req.body.include) {
        options.include = String(req.body.include);
    }

    return rest.find(req.config, req.auth,
                   '_Installation', req.body.where, options)
  .then((response) => {
      return {response: response};
  });
}

// Returns a promise for a {response} object.
function handleGet(req) {
    return rest.find(req.config, req.auth, '_Installation',
                   {objectId: req.params.objectId})
  .then((response) => {
      if (!response.results || response.results.length == 0) {
          throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND,
                            'Object not found.');
      } else {
          return {response: response.results[0]};
      }
  });
}

// Returns a promise for a {response} object.
function handleUpdate(req) {
    return rest.update(req.config, req.auth,
                     '_Installation', req.params.objectId, req.body)
  .then((response) => {
      return {response: response};
  });
}

// Returns a promise for a {response} object.
function handleDelete(req) {
    return rest.del(req.config, req.auth,
                  '_Installation', req.params.objectId)
  .then(() => {
      return {response: {}};
  });
}

router.route('POST','/installations', handleCreate);
router.route('GET','/installations', handleFind);
router.route('GET','/installations/:objectId', handleGet);
router.route('PUT','/installations/:objectId', handleUpdate);
router.route('DELETE','/installations/:objectId', handleDelete);

module.exports = router;