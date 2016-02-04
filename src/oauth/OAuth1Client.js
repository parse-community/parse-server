var https = require('https'),
  crypto = require('crypto');

var OAuth = function(options) {
  this.consumer_key = options.consumer_key;
  this.consumer_secret = options.consumer_secret;
  this.auth_token = options.auth_token;
  this.auth_token_secret = options.auth_token_secret;
  this.host = options.host;
  this.oauth_params = options.oauth_params || {};
};

OAuth.prototype.send = function(method, path, params, body){

  var request = this.buildRequest(method, path, params, body);
  // Encode the body properly, the current Parse Implementation don't do it properly
  return new Promise(function(resolve, reject) {
    var httpRequest = https.request(request, function(res) {
      var data = '';
      res.on('data', function(chunk) {
        data += chunk;
      });
      res.on('end', function() {
        data = JSON.parse(data);
        resolve(data);
      });
    }).on('error', function(e) {
      reject('Failed to make an OAuth request');
    });
    if (request.body) {
    	httpRequest.write(request.body);
    }
    httpRequest.end();
  });
};

OAuth.prototype.buildRequest = function(method, path, params, body) {
  if (path.indexOf("/") != 0) {
    path = "/"+path;
  }
  if (params && Object.keys(params).length > 0) {
    path += "?" + OAuth.buildParameterString(params);
  }

  var request = {
    host:   this.host,
    path: 	path,
    method: method.toUpperCase()
  };

  var oauth_params = this.oauth_params || {};
  oauth_params.oauth_consumer_key = this.consumer_key;
  if(this.auth_token){
    oauth_params["oauth_token"] = this.auth_token;
  }

  request = OAuth.signRequest(request, oauth_params, this.consumer_secret,  this.auth_token_secret);

  if (body && Object.keys(body).length > 0) {
    request.body = OAuth.buildParameterString(body);
  }
  return request;
}

OAuth.prototype.get = function(path, params) {
	return this.send("GET", path, params);
}

OAuth.prototype.post = function(path, params, body) {
	return this.send("POST", path, params, body);
}

/*
	Proper string %escape encoding
*/
OAuth.encode = function(str) {
  //       discuss at: http://phpjs.org/functions/rawurlencode/
  //      original by: Brett Zamir (http://brett-zamir.me)
  //         input by: travc
  //         input by: Brett Zamir (http://brett-zamir.me)
  //         input by: Michael Grier
  //         input by: Ratheous
  //      bugfixed by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
  //      bugfixed by: Brett Zamir (http://brett-zamir.me)
  //      bugfixed by: Joris
  // reimplemented by: Brett Zamir (http://brett-zamir.me)
  // reimplemented by: Brett Zamir (http://brett-zamir.me)
  //             note: This reflects PHP 5.3/6.0+ behavior
  //             note: Please be aware that this function expects to encode into UTF-8 encoded strings, as found on
  //             note: pages served as UTF-8
  //        example 1: rawurlencode('Kevin van Zonneveld!');
  //        returns 1: 'Kevin%20van%20Zonneveld%21'
  //        example 2: rawurlencode('http://kevin.vanzonneveld.net/');
  //        returns 2: 'http%3A%2F%2Fkevin.vanzonneveld.net%2F'
  //        example 3: rawurlencode('http://www.google.nl/search?q=php.js&ie=utf-8&oe=utf-8&aq=t&rls=com.ubuntu:en-US:unofficial&client=firefox-a');
  //        returns 3: 'http%3A%2F%2Fwww.google.nl%2Fsearch%3Fq%3Dphp.js%26ie%3Dutf-8%26oe%3Dutf-8%26aq%3Dt%26rls%3Dcom.ubuntu%3Aen-US%3Aunofficial%26client%3Dfirefox-a'

  str = (str + '')
    .toString();

  // Tilde should be allowed unescaped in future versions of PHP (as reflected below), but if you want to reflect current
  // PHP behavior, you would need to add ".replace(/~/g, '%7E');" to the following.
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}

OAuth.signatureMethod = "HMAC-SHA1";
OAuth.version = "1.0";

/*
	Generate a nonce
*/
OAuth.nonce = function(){
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for( var i=0; i < 30; i++ )
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
}

OAuth.buildParameterString = function(obj){
	var result = {};

	// Sort keys and encode values
	if (obj) {
		var keys = Object.keys(obj).sort();

		// Map key=value, join them by &
		return keys.map(function(key){
			return key + "=" + OAuth.encode(obj[key]);
		}).join("&");
	}

	return "";
}

/*
	Build the signature string from the object
*/

OAuth.buildSignatureString = function(method, url, parameters){
	return [method.toUpperCase(), OAuth.encode(url), OAuth.encode(parameters)].join("&");
}

/*
	Retuns encoded HMAC-SHA1 from key and text
*/
OAuth.signature = function(text, key){
	crypto = require("crypto");
	return OAuth.encode(crypto.createHmac('sha1', key).update(text).digest('base64'));
}

OAuth.signRequest = function(request, oauth_parameters, consumer_secret, auth_token_secret){
	oauth_parameters = oauth_parameters || {};

	// Set default values
	if (!oauth_parameters.oauth_nonce) {
		oauth_parameters.oauth_nonce = OAuth.nonce();
	}
	if (!oauth_parameters.oauth_timestamp) {
		oauth_parameters.oauth_timestamp = Math.floor(new Date().getTime()/1000);
	}
	if (!oauth_parameters.oauth_signature_method) {
		oauth_parameters.oauth_signature_method = OAuth.signatureMethod;
	}
	if (!oauth_parameters.oauth_version) {
		oauth_parameters.oauth_version = OAuth.version;
	}

	if(!auth_token_secret){
		auth_token_secret="";
	}
	// Force GET method if unset
	if (!request.method) {
		request.method = "GET"
	}

	// Collect  all the parameters in one signatureParameters object
	var signatureParams = {};
	var parametersToMerge = [request.params, request.body, oauth_parameters];
	for(var i in parametersToMerge) {
		var parameters = parametersToMerge[i];
		for(var k in parameters) {
			signatureParams[k] = parameters[k];
		}
	}

	// Create a string based on the parameters
	var parameterString = OAuth.buildParameterString(signatureParams);

	// Build the signature string
	var url = "https://"+request.host+""+request.path;

	var signatureString = OAuth.buildSignatureString(request.method, url, parameterString);
	// Hash the signature string
	var signatureKey = [OAuth.encode(consumer_secret), OAuth.encode(auth_token_secret)].join("&");

	var signature = OAuth.signature(signatureString, signatureKey);

	// Set the signature in the params
	oauth_parameters.oauth_signature = signature;
	if(!request.headers){
		request.headers = {};
	}

	// Set the authorization header
	var signature = Object.keys(oauth_parameters).sort().map(function(key){
		var value = oauth_parameters[key];
		return key+'="'+value+'"';
	}).join(", ")

	request.headers.Authorization = 'OAuth ' + signature;

	// Set the content type header
	request.headers["Content-Type"] = "application/x-www-form-urlencoded";
	return request;

}

module.exports = OAuth;