// functions.js

var express = require('express'),
    Parse = require('parse/node').Parse,
    PromiseRouter = require('./PromiseRouter'),
    rest = require('./rest');

var router = new PromiseRouter();

function handleCloudFunction(req) {
  if (Parse.Cloud.Functions[req.params.functionName]) {
    return new Promise(function (resolve, reject) {
      var response = createResponseObject(resolve, reject);
      var request = {
        params: req.body || {},
<<<<<<< HEAD
        master : req.auth ? req.auth.isMaster : false,
        user :  req.auth && req.auth.user ? req.auth.user : undefined,
        installationId : req.auth && req.auth.installationId ? req.auth.installationId : undefined
=======
        user: req.auth && req.auth.user || {}
>>>>>>> upstream/master
      };
      Parse.Cloud.Functions[req.params.functionName](request, response);
    });
  } else {
    throw new Parse.Error(Parse.Error.SCRIPT_FAILED, 'Invalid function.');
  }
}

function createResponseObject(resolve, reject) {
  return {
    success: function(result) {
      resolve({
        response: {
          result: result
        }
      });
    },
    error: function(error) {
      reject(new Parse.Error(Parse.Error.SCRIPT_FAILED, error));
    }
  };
}

router.route('POST', '/functions/:functionName+', handleCloudFunction);


module.exports = router;
