var request = require("request");
const send = function(method, path, body) {
  
  var Parse = require("parse/node").Parse;

  var options = {
      method: method,
      url: Parse.serverURL + path,
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Master-Key': Parse.masterKey,
        'Content-Type': 'application/json'
      },
  };
  
  if (body) {
    if (typeof body == "object") {
      options.body = JSON.stringify(body);
    } else {
      options.body = body;
    }
  }
  
  var promise = new Parse.Promise();
  request(options, function(err, response, body){
      if (err) {
          promise.reject(err);
          return;
      }
      body = JSON.parse(body);
      if (body.error) {
        promise.reject(body);
      } else {
        promise.resolve(body);
      }
    });
    return promise;
}

var Hooks = {};

Hooks.getFunctions = function() {
  return Hooks.get("functions");
}

Hooks.getTriggers = function() {
  return Hooks.get("triggers");
}

Hooks.getFunction = function(name) {
  return Hooks.get("functions", name);
}

Hooks.getTrigger = function(className, triggerName) {
  return Hooks.get("triggers", className, triggerName);
}

Hooks.get = function(type, functionName, triggerName) {
  var url = "/hooks/"+type;
  if(functionName) {
    url += "/"+functionName;
    if (triggerName) {
      url += "/"+triggerName;
    }
  }
  return send("GET", url);
}

Hooks.createFunction = function(functionName, url) {
  return Hooks.create({functionName: functionName, url: url});
}

Hooks.createTrigger = function(className, triggerName, url) {
  return Hooks.create({className: className, triggerName: triggerName, url: url});
}

Hooks.create = function(hook) {
  var url;
  if (hook.functionName && hook.url) {
      url = "/hooks/functions";
  } else if (hook.className && hook.triggerName && hook.url) {
      url = "/hooks/triggers";
  } else {
    return Promise.reject({error: 'invalid hook declaration', code: 143});
  }
  return send("POST", url, hook);
}

Hooks.updateFunction = function(functionName, url) {
  return Hooks.update({functionName: functionName, url: url});
}

Hooks.updateTrigger = function(className, triggerName, url) {
  return Hooks.update({className: className, triggerName: triggerName, url: url});
}


Hooks.update = function(hook) {
  var url;
  if (hook.functionName && hook.url) {
      url = "/hooks/functions/"+hook.functionName;
      delete hook.functionName;
  } else if (hook.className && hook.triggerName && hook.url) {
      url = "/hooks/triggers/"+hook.className+"/"+hook.triggerName;
      delete hook.className;
      delete hook.triggerName;
  }
  return send("PUT", url, hook);
}

Hooks.deleteFunction = function(functionName) {
  return Hooks.delete({functionName: functionName});
}

Hooks.deleteTrigger = function(className, triggerName) {
  return Hooks.delete({className: className, triggerName: triggerName});
}

Hooks.delete = function(hook) {
  var url;
  if (hook.functionName) {
      url = "/hooks/functions/"+hook.functionName;
      delete hook.functionName;
  } else if (hook.className && hook.triggerName) {
      url = "/hooks/triggers/"+hook.className+"/"+hook.triggerName;
      delete hook.className;
      delete hook.triggerName;
  }
  return send("PUT", url, '{ "__op": "Delete" }');
}

module.exports = Hooks
