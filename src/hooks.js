var Parse = require('parse/node').Parse,
    PromiseRouter = require('./PromiseRouter'),
    triggers = require('./triggers');
   
import { HooksFileCache } from './Controllers/HooksFileCache';

var wrap = function(hook) {
  return function(request, response) {
    var jsonBody = {};
    for(var i in request) {
      jsonBody[i] = request[i];
    }
    if (request.object) {
      jsonBody.object = request.object.toJSON();
      jsonBody.object.className = request.object.className;
    }
    if (request.original) {
      jsonBody.original = request.original.toJSON();
      jsonBody.original.className = request.original.className;
    }
    var jsonRequest = {};
    jsonRequest.headers = {
      'Content-Type': 'application/json'
    }
    jsonRequest.body = JSON.stringify(jsonBody);
    
    require("request").post(hook.url, jsonRequest, function(err, res, body){
      var result;
      if (body) {
        if (typeof body == "string") {
          try {
            body = JSON.parse(body);
          } catch(e) {
            err = {error: "Malformed response", code: -1};
          }
        }
        if (!err) {
          result = body.success;
          err  = body.error;
        }
      }
      if (err) {
        return response.error(err);
      } else {   
        return response.success(result);
      }
    });
  }
}

var registerHook = function(hook, applicationId) {
  var wrappedFunction = wrap(hook);
  wrappedFunction.url = hook.url;
  if (hook.className) {
    triggers.addTrigger(hook.triggerName, hook.className, wrappedFunction, applicationId)
  } else {
    triggers.addFunction(hook.functionName, wrappedFunction, null, applicationId);
  }
  new HooksFileCache(applicationId).addHook(hook);
}

var load = function(applicationId) {
  var json = new HooksFileCache(applicationId).getHooks();
  for(var i in json.triggers) {
    registerHook(json.triggers[i], applicationId);
  }
  for(var i in json.functions) {
    registerHook(json.functions[i], applicationId);
  }
};

var createOrUpdateHook = function(aHook, applicationId) {
  if (!applicationId) {
    throw "Application ID is missing";
  }
  var hook;
  if (aHook && aHook.functionName && aHook.url) {
    hook = {};
    hook.functionName = aHook.functionName;
    hook.url = aHook.url;
  } else if (aHook && aHook.className && aHook.url && aHook.triggerName && triggers.Types[aHook.triggerName]) {
    hook = {};
    hook.className = aHook.className;
    hook.url = aHook.url;
    hook.triggerName = aHook.triggerName;
  }
  var promise;
  if (!hook) {
    promise = Promise.resolve({response: {code: 143, error: "invalid hook declaration"}});
  } else {
    registerHook(aHook, applicationId);
    promise = Promise.resolve({response: hook});
  }
  return promise;
};

var createHook = function(aHook, applicationId) {
    var hookCache = new HooksFileCache(applicationId);
    if (aHook.functionName && hookCache.getFunction(aHook.functionName)) {
      return Promise.resolve({response: {code: 143, error: `function name: ${aHook.functionName} already exits`}});
    }
    if (aHook.className && aHook.triggerName && hookCache.getTrigger(aHook.className, aHook.triggerName)) {
      return Promise.resolve({response: {code: 143, error: `class ${aHook.className} already has trigger ${aHook.triggerName}`}}); 
    }
    return createOrUpdateHook(aHook, applicationId);
};

var updateHook = function(aHook, applicationId) {
   var hookCache = new HooksFileCache(applicationId);
    if (aHook.functionName && !hookCache.getFunction(aHook.functionName)) {
      return Promise.resolve({response: {code: 143, error: `no function named: ${aHook.functionName} is defined`}});
    }
    if (aHook.className && aHook.triggerName && !hookCache.getTrigger(aHook.className, aHook.triggerName)) {
      return Promise.resolve({response: {code: 143, error: `class ${aHook.className} does not exist`}}); 
    }
    return createOrUpdateHook(aHook, applicationId);
}

var handlePost = function(req) {
  return createHook(req.body, req.config.applicationId);
};

var handleGetFunctions = function(req) {
    var hookCache = new HooksFileCache(req.config.applicationId);
    if (req.params.functionName) {
      var foundFunction = hookCache.getFunction(req.params.functionName);
      if (foundFunction) {
        return Promise.resolve({response: foundFunction});
      } else {
        return Promise.resolve({response: {error: `no function named: ${req.params.functionName} is defined`, code: 143}});
      }
    }
    return Promise.resolve({ response: hookCache.getFunctions() })
}
var handleGetTriggers = function(req) {
    var hookCache = new HooksFileCache(req.config.applicationId);
    if (req.params.className && req.params.triggerName) {
      var foundTrigger = hookCache.getTrigger(req.params.className, req.params.triggerName);
      if (foundTrigger) {
        return Promise.resolve({response: foundTrigger});
      } else {
        return Promise.resolve({response: {error: `class ${req.params.className} does not exist`, code: 143}});
      }
    }
    
    return Promise.resolve({ response: hookCache.getTriggers() })
}
var handleDelete = function(req) {
  var cache = new HooksFileCache(req.config.applicationId);
  if (req.params.functionName) {
    triggers.removeFunction(req.params.functionName, req.config.applicationId);
    cache.removeHook(req.params.functionName, req.params.triggerName)
  } else if (req.params.className && req.params.triggerName) {
     triggers.removeTrigger(req.params.triggerName, req.params.className,req.config.applicationId);
     cache.removeHook(req.params.className, req.params.triggerName)
  }
  return Promise.resolve({response: {}});
}

var handleUpdate = function(req) {
  var hook;
  if (req.params.functionName && req.body.url) {
    hook = {}
    hook.functionName = req.params.functionName;
    hook.url = req.body.url;
  } else if (req.params.className && req.params.triggerName && req.body.url) {
    hook = {}
    hook.className = req.params.className;
    hook.triggerName = req.params.triggerName;
    hook.url = req.body.url
  }
  return updateHook(hook, req.config.applicationId);
}

var handlePut = function(req) {
  var body = req.body;
  if (body.__op == "Delete") {
   return handleDelete(req);
  } else {
    return handleUpdate(req);
  }
}

var requireMaster = function(handler) {
  return (req) =>  {
      if (req.auth.isMaster) {
        return handler(req);
      }
      return Promise.resolve({response: {error: 'unauthorized'}, status: 403});
  }
}

var router = new PromiseRouter();

router.route('GET',  '/hooks/functions', requireMaster(handleGetFunctions));
router.route('GET',  '/hooks/triggers', requireMaster(handleGetTriggers));
router.route('GET',  '/hooks/functions/:functionName', requireMaster(handleGetFunctions));
router.route('GET',  '/hooks/triggers/:className/:triggerName', requireMaster(handleGetTriggers));
router.route('POST', '/hooks/functions', requireMaster(handlePost));
router.route('POST', '/hooks/triggers', requireMaster(handlePost));
router.route('PUT',  '/hooks/functions/:functionName', requireMaster(handlePut));
router.route('PUT',  '/hooks/triggers/:className/:triggerName', requireMaster(handlePut));

module.exports = router;
module.exports.load = load;
