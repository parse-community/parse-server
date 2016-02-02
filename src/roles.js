// roles.js

var Parse = require('parse/node').Parse,
    PromiseRouter = require('./PromiseRouter'),
    rest = require('./rest');

var router = new PromiseRouter();

function handleCreate(req) {
    return rest.create(req.config, req.auth,
                     '_Role', req.body);
}

function handleUpdate(req) {
    return rest.update(req.config, req.auth, '_Role',
                     req.params.objectId, req.body)
  .then((response) => {
      return {response: response};
  });
}

function handleDelete(req) {
    return rest.del(req.config, req.auth,
                  '_Role', req.params.objectId)
  .then(() => {
      return {response: {}};
  });
}

function handleGet(req) {
    return rest.find(req.config, req.auth, '_Role',
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

router.route('POST','/roles', handleCreate);
router.route('GET','/roles/:objectId', handleGet);
router.route('PUT','/roles/:objectId', handleUpdate);
router.route('DELETE','/roles/:objectId', handleDelete);

module.exports = router;