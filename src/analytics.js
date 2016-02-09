// analytics.js

var Parse = require('parse/node').Parse,
    PromiseRouter = require('./PromiseRouter'),
    rest = require('./rest');

var router = new PromiseRouter();


// Returns a promise that resolves to an empty object response
function ignoreAndSucceed(req) {
  return Promise.resolve({
    response: {}
  });
}

router.route('POST','/events/AppOpened', ignoreAndSucceed);
router.route('POST','/events/:eventName', ignoreAndSucceed);

module.exports = router;