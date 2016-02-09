// sessions.js

var Auth = require('./Auth'),
    Parse = require('parse/node').Parse,
    PromiseRouter = require('./PromiseRouter'),
    rest = require('./rest');

var router = new PromiseRouter();

function handleCreate(req) {
  return rest.create(req.config, req.auth,
                     '_Session', req.body);
}

function handleUpdate(req) {
  return rest.update(req.config, req.auth, '_Session',
                     req.params.objectId, req.body)
  .then((response) => {
    return {response: response};
  });
}

function handleDelete(req) {
  return rest.del(req.config, req.auth,
                  '_Session', req.params.objectId)
  .then(() => {
    return {response: {}};
  });
}

function handleGet(req) {
  return rest.find(req.config, req.auth, '_Session',
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

function handleLogout(req) {
  // TODO: Verify correct behavior for logout without token
  if (!req.info || !req.info.sessionToken) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING,
                          'Session token required for logout.');
  }
  return rest.find(req.config, Auth.master(req.config), '_Session',
                  { _session_token: req.info.sessionToken})
  .then((response) => {
    if (!response.results || response.results.length == 0) {
      throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN,
                            'Session token not found.');
    }
    return rest.del(req.config, Auth.master(req.config), '_Session',
                    response.results[0].objectId);
  }).then(() => {
    return {
      status: 200,
      response: {}
    };
  });
}

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
  if (typeof req.body.keys == 'string') {
    options.keys = req.body.keys;
  }
  if (req.body.include) {
    options.include = String(req.body.include);
  }

  return rest.find(req.config, req.auth,
                   '_Session', req.body.where, options)
  .then((response) => {
    return {response: response};
  });
}

function handleMe(req) {
  // TODO: Verify correct behavior
  if (!req.info || !req.info.sessionToken) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN,
                          'Session token required.');
  }
  return rest.find(req.config, Auth.master(req.config), '_Session',
                  { _session_token: req.info.sessionToken})
  .then((response) => {
    if (!response.results || response.results.length == 0) {
      throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN,
                            'Session token not found.');
    }
    return {
      response: response.results[0]
    };
  });
}

router.route('POST', '/logout', handleLogout);
router.route('POST','/sessions', handleCreate);
router.route('GET','/sessions/me', handleMe);
router.route('GET','/sessions/:objectId', handleGet);
router.route('PUT','/sessions/:objectId', handleUpdate);
router.route('GET','/sessions', handleFind);
router.route('DELETE','/sessions/:objectId', handleDelete);

module.exports = router;