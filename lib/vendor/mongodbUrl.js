// A slightly patched version of node's url module, with support for mongodb://
// uris.
//
// See https://github.com/nodejs/node/blob/master/LICENSE for licensing
// information
'use strict';

const punycode = require('punycode');

exports.parse = urlParse;
exports.resolve = urlResolve;
exports.resolveObject = urlResolveObject;
exports.format = urlFormat;
exports.Url = Url;

function Url() {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.host = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.query = null;
  this.pathname = null;
  this.path = null;
  this.href = null;
} // Reference: RFC 3986, RFC 1808, RFC 2396
// define these here so at least they only have to be
// compiled once on the first module load.


const protocolPattern = /^([a-z0-9.+-]+:)/i;
const portPattern = /:[0-9]*$/; // Special case for a simple path URL

const simplePathPattern = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/; // protocols that can allow "unsafe" and "unwise" chars.

const unsafeProtocol = {
  javascript: true,
  'javascript:': true
}; // protocols that never have a hostname.

const hostlessProtocol = {
  javascript: true,
  'javascript:': true
}; // protocols that always contain a // bit.

const slashedProtocol = {
  http: true,
  'http:': true,
  https: true,
  'https:': true,
  ftp: true,
  'ftp:': true,
  gopher: true,
  'gopher:': true,
  file: true,
  'file:': true
};

const querystring = require('querystring');
/* istanbul ignore next: improve coverage */


function urlParse(url, parseQueryString, slashesDenoteHost) {
  if (url instanceof Url) return url;
  var u = new Url();
  u.parse(url, parseQueryString, slashesDenoteHost);
  return u;
}
/* istanbul ignore next: improve coverage */


Url.prototype.parse = function (url, parseQueryString, slashesDenoteHost) {
  if (typeof url !== 'string') {
    throw new TypeError('Parameter "url" must be a string, not ' + typeof url);
  } // Copy chrome, IE, opera backslash-handling behavior.
  // Back slashes before the query string get converted to forward slashes
  // See: https://code.google.com/p/chromium/issues/detail?id=25916


  var hasHash = false;
  var start = -1;
  var end = -1;
  var rest = '';
  var lastPos = 0;
  var i = 0;

  for (var inWs = false, split = false; i < url.length; ++i) {
    const code = url.charCodeAt(i); // Find first and last non-whitespace characters for trimming

    const isWs = code === 32
    /* */
    || code === 9
    /*\t*/
    || code === 13
    /*\r*/
    || code === 10
    /*\n*/
    || code === 12
    /*\f*/
    || code === 160
    /*\u00A0*/
    || code === 65279;
    /*\uFEFF*/

    if (start === -1) {
      if (isWs) continue;
      lastPos = start = i;
    } else {
      if (inWs) {
        if (!isWs) {
          end = -1;
          inWs = false;
        }
      } else if (isWs) {
        end = i;
        inWs = true;
      }
    } // Only convert backslashes while we haven't seen a split character


    if (!split) {
      switch (code) {
        case 35:
          // '#'
          hasHash = true;
        // Fall through

        case 63:
          // '?'
          split = true;
          break;

        case 92:
          // '\\'
          if (i - lastPos > 0) rest += url.slice(lastPos, i);
          rest += '/';
          lastPos = i + 1;
          break;
      }
    } else if (!hasHash && code === 35
    /*#*/
    ) {
      hasHash = true;
    }
  } // Check if string was non-empty (including strings with only whitespace)


  if (start !== -1) {
    if (lastPos === start) {
      // We didn't convert any backslashes
      if (end === -1) {
        if (start === 0) rest = url;else rest = url.slice(start);
      } else {
        rest = url.slice(start, end);
      }
    } else if (end === -1 && lastPos < url.length) {
      // We converted some backslashes and have only part of the entire string
      rest += url.slice(lastPos);
    } else if (end !== -1 && lastPos < end) {
      // We converted some backslashes and have only part of the entire string
      rest += url.slice(lastPos, end);
    }
  }

  if (!slashesDenoteHost && !hasHash) {
    // Try fast path regexp
    const simplePath = simplePathPattern.exec(rest);

    if (simplePath) {
      this.path = rest;
      this.href = rest;
      this.pathname = simplePath[1];

      if (simplePath[2]) {
        this.search = simplePath[2];

        if (parseQueryString) {
          this.query = querystring.parse(this.search.slice(1));
        } else {
          this.query = this.search.slice(1);
        }
      } else if (parseQueryString) {
        this.search = '';
        this.query = {};
      }

      return this;
    }
  }

  var proto = protocolPattern.exec(rest);

  if (proto) {
    proto = proto[0];
    var lowerProto = proto.toLowerCase();
    this.protocol = lowerProto;
    rest = rest.slice(proto.length);
  } // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.


  if (slashesDenoteHost || proto || /^\/\/[^@\/]+@[^@\/]+/.test(rest)) {
    var slashes = rest.charCodeAt(0) === 47
    /*/*/
    && rest.charCodeAt(1) === 47;
    /*/*/

    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.slice(2);
      this.slashes = true;
    }
  }

  if (!hostlessProtocol[proto] && (slashes || proto && !slashedProtocol[proto])) {
    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    //
    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the last @ sign, unless some host-ending character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    //
    // ex:
    // http://a@b@c/ => user:a@b host:c
    // http://a@b?@c => user:a host:b path:/?@c
    // v0.12 TODO(isaacs): This is not quite how Chrome does things.
    // Review our test case against browsers more comprehensively.
    var hostEnd = -1;
    var atSign = -1;
    var nonHost = -1;

    for (i = 0; i < rest.length; ++i) {
      switch (rest.charCodeAt(i)) {
        case 9: // '\t'

        case 10: // '\n'

        case 13: // '\r'

        case 32: // ' '

        case 34: // '"'

        case 37: // '%'

        case 39: // '\''

        case 59: // ';'

        case 60: // '<'

        case 62: // '>'

        case 92: // '\\'

        case 94: // '^'

        case 96: // '`'

        case 123: // '{'

        case 124: // '|'

        case 125:
          // '}'
          // Characters that are never ever allowed in a hostname from RFC 2396
          if (nonHost === -1) nonHost = i;
          break;

        case 35: // '#'

        case 47: // '/'

        case 63:
          // '?'
          // Find the first instance of any host-ending characters
          if (nonHost === -1) nonHost = i;
          hostEnd = i;
          break;

        case 64:
          // '@'
          // At this point, either we have an explicit point where the
          // auth portion cannot go past, or the last @ char is the decider.
          atSign = i;
          nonHost = -1;
          break;
      }

      if (hostEnd !== -1) break;
    }

    start = 0;

    if (atSign !== -1) {
      this.auth = decodeURIComponent(rest.slice(0, atSign));
      start = atSign + 1;
    }

    if (nonHost === -1) {
      this.host = rest.slice(start);
      rest = '';
    } else {
      this.host = rest.slice(start, nonHost);
      rest = rest.slice(nonHost);
    } // pull out port.


    this.parseHost(); // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.

    if (typeof this.hostname !== 'string') this.hostname = '';
    var hostname = this.hostname; // if hostname begins with [ and ends with ]
    // assume that it's an IPv6 address.

    var ipv6Hostname = hostname.charCodeAt(0) === 91
    /*[*/
    && hostname.charCodeAt(hostname.length - 1) === 93;
    /*]*/
    // validate a little.

    if (!ipv6Hostname) {
      const result = validateHostname(this, rest, hostname);
      if (result !== undefined) rest = result;
    } // hostnames are always lower case.


    this.hostname = this.hostname.toLowerCase();

    if (!ipv6Hostname) {
      // IDNA Support: Returns a punycoded representation of "domain".
      // It only converts parts of the domain name that
      // have non-ASCII characters, i.e. it doesn't matter if
      // you call it with a domain that already is ASCII-only.
      this.hostname = punycode.toASCII(this.hostname);
    }

    var p = this.port ? ':' + this.port : '';
    var h = this.hostname || '';
    this.host = h + p; // strip [ and ] from the hostname
    // the host field still retains them, though

    if (ipv6Hostname) {
      this.hostname = this.hostname.slice(1, -1);

      if (rest[0] !== '/') {
        rest = '/' + rest;
      }
    }
  } // now rest is set to the post-host stuff.
  // chop off any delim chars.


  if (!unsafeProtocol[lowerProto]) {
    // First, make 100% sure that any "autoEscape" chars get
    // escaped, even if encodeURIComponent doesn't think they
    // need to be.
    const result = autoEscapeStr(rest);
    if (result !== undefined) rest = result;
  }

  var questionIdx = -1;
  var hashIdx = -1;

  for (i = 0; i < rest.length; ++i) {
    const code = rest.charCodeAt(i);

    if (code === 35
    /*#*/
    ) {
      this.hash = rest.slice(i);
      hashIdx = i;
      break;
    } else if (code === 63
    /*?*/
    && questionIdx === -1) {
      questionIdx = i;
    }
  }

  if (questionIdx !== -1) {
    if (hashIdx === -1) {
      this.search = rest.slice(questionIdx);
      this.query = rest.slice(questionIdx + 1);
    } else {
      this.search = rest.slice(questionIdx, hashIdx);
      this.query = rest.slice(questionIdx + 1, hashIdx);
    }

    if (parseQueryString) {
      this.query = querystring.parse(this.query);
    }
  } else if (parseQueryString) {
    // no query string, but parseQueryString still requested
    this.search = '';
    this.query = {};
  }

  var firstIdx = questionIdx !== -1 && (hashIdx === -1 || questionIdx < hashIdx) ? questionIdx : hashIdx;

  if (firstIdx === -1) {
    if (rest.length > 0) this.pathname = rest;
  } else if (firstIdx > 0) {
    this.pathname = rest.slice(0, firstIdx);
  }

  if (slashedProtocol[lowerProto] && this.hostname && !this.pathname) {
    this.pathname = '/';
  } // to support http.request


  if (this.pathname || this.search) {
    const p = this.pathname || '';
    const s = this.search || '';
    this.path = p + s;
  } // finally, reconstruct the href based on what has been validated.


  this.href = this.format();
  return this;
};
/* istanbul ignore next: improve coverage */


function validateHostname(self, rest, hostname) {
  for (var i = 0, lastPos; i <= hostname.length; ++i) {
    var code;
    if (i < hostname.length) code = hostname.charCodeAt(i);

    if (code === 46
    /*.*/
    || i === hostname.length) {
      if (i - lastPos > 0) {
        if (i - lastPos > 63) {
          self.hostname = hostname.slice(0, lastPos + 63);
          return '/' + hostname.slice(lastPos + 63) + rest;
        }
      }

      lastPos = i + 1;
      continue;
    } else if (code >= 48
    /*0*/
    && code <= 57 || code >= 97
    /*a*/
    && code <= 122
    /*z*/
    || code === 45
    /*-*/
    || code >= 65
    /*A*/
    && code <= 90
    /*Z*/
    || code === 43
    /*+*/
    || code === 95
    /*_*/
    ||
    /* BEGIN MONGO URI PATCH */
    code === 44
    /*,*/
    || code === 58
    /*:*/
    ||
    /* END MONGO URI PATCH */
    code > 127) {
      continue;
    } // Invalid host character


    self.hostname = hostname.slice(0, i);
    if (i < hostname.length) return '/' + hostname.slice(i) + rest;
    break;
  }
}
/* istanbul ignore next: improve coverage */


function autoEscapeStr(rest) {
  var newRest = '';
  var lastPos = 0;

  for (var i = 0; i < rest.length; ++i) {
    // Automatically escape all delimiters and unwise characters from RFC 2396
    // Also escape single quotes in case of an XSS attack
    switch (rest.charCodeAt(i)) {
      case 9:
        // '\t'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%09';
        lastPos = i + 1;
        break;

      case 10:
        // '\n'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%0A';
        lastPos = i + 1;
        break;

      case 13:
        // '\r'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%0D';
        lastPos = i + 1;
        break;

      case 32:
        // ' '
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%20';
        lastPos = i + 1;
        break;

      case 34:
        // '"'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%22';
        lastPos = i + 1;
        break;

      case 39:
        // '\''
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%27';
        lastPos = i + 1;
        break;

      case 60:
        // '<'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%3C';
        lastPos = i + 1;
        break;

      case 62:
        // '>'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%3E';
        lastPos = i + 1;
        break;

      case 92:
        // '\\'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%5C';
        lastPos = i + 1;
        break;

      case 94:
        // '^'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%5E';
        lastPos = i + 1;
        break;

      case 96:
        // '`'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%60';
        lastPos = i + 1;
        break;

      case 123:
        // '{'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%7B';
        lastPos = i + 1;
        break;

      case 124:
        // '|'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%7C';
        lastPos = i + 1;
        break;

      case 125:
        // '}'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%7D';
        lastPos = i + 1;
        break;
    }
  }

  if (lastPos === 0) return;
  if (lastPos < rest.length) return newRest + rest.slice(lastPos);else return newRest;
} // format a parsed object into a url string

/* istanbul ignore next: improve coverage */


function urlFormat(obj) {
  // ensure it's an object, and not a string url.
  // If it's an obj, this is a no-op.
  // this way, you can call url_format() on strings
  // to clean up potentially wonky urls.
  if (typeof obj === 'string') obj = urlParse(obj);else if (typeof obj !== 'object' || obj === null) throw new TypeError('Parameter "urlObj" must be an object, not ' + obj === null ? 'null' : typeof obj);else if (!(obj instanceof Url)) return Url.prototype.format.call(obj);
  return obj.format();
}
/* istanbul ignore next: improve coverage */


Url.prototype.format = function () {
  var auth = this.auth || '';

  if (auth) {
    auth = encodeAuth(auth);
    auth += '@';
  }

  var protocol = this.protocol || '';
  var pathname = this.pathname || '';
  var hash = this.hash || '';
  var host = false;
  var query = '';

  if (this.host) {
    host = auth + this.host;
  } else if (this.hostname) {
    host = auth + (this.hostname.indexOf(':') === -1 ? this.hostname : '[' + this.hostname + ']');

    if (this.port) {
      host += ':' + this.port;
    }
  }

  if (this.query !== null && typeof this.query === 'object') query = querystring.stringify(this.query);
  var search = this.search || query && '?' + query || '';
  if (protocol && protocol.charCodeAt(protocol.length - 1) !== 58
  /*:*/
  ) protocol += ':';
  var newPathname = '';
  var lastPos = 0;

  for (var i = 0; i < pathname.length; ++i) {
    switch (pathname.charCodeAt(i)) {
      case 35:
        // '#'
        if (i - lastPos > 0) newPathname += pathname.slice(lastPos, i);
        newPathname += '%23';
        lastPos = i + 1;
        break;

      case 63:
        // '?'
        if (i - lastPos > 0) newPathname += pathname.slice(lastPos, i);
        newPathname += '%3F';
        lastPos = i + 1;
        break;
    }
  }

  if (lastPos > 0) {
    if (lastPos !== pathname.length) pathname = newPathname + pathname.slice(lastPos);else pathname = newPathname;
  } // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.


  if (this.slashes || (!protocol || slashedProtocol[protocol]) && host !== false) {
    host = '//' + (host || '');
    if (pathname && pathname.charCodeAt(0) !== 47
    /*/*/
    ) pathname = '/' + pathname;
  } else if (!host) {
    host = '';
  }

  search = search.replace('#', '%23');
  if (hash && hash.charCodeAt(0) !== 35
  /*#*/
  ) hash = '#' + hash;
  if (search && search.charCodeAt(0) !== 63
  /*?*/
  ) search = '?' + search;
  return protocol + host + pathname + search + hash;
};
/* istanbul ignore next: improve coverage */


function urlResolve(source, relative) {
  return urlParse(source, false, true).resolve(relative);
}
/* istanbul ignore next: improve coverage */


Url.prototype.resolve = function (relative) {
  return this.resolveObject(urlParse(relative, false, true)).format();
};
/* istanbul ignore next: improve coverage */


function urlResolveObject(source, relative) {
  if (!source) return relative;
  return urlParse(source, false, true).resolveObject(relative);
}
/* istanbul ignore next: improve coverage */


Url.prototype.resolveObject = function (relative) {
  if (typeof relative === 'string') {
    var rel = new Url();
    rel.parse(relative, false, true);
    relative = rel;
  }

  var result = new Url();
  var tkeys = Object.keys(this);

  for (var tk = 0; tk < tkeys.length; tk++) {
    var tkey = tkeys[tk];
    result[tkey] = this[tkey];
  } // hash is always overridden, no matter what.
  // even href="" will remove it.


  result.hash = relative.hash; // if the relative url is empty, then there's nothing left to do here.

  if (relative.href === '') {
    result.href = result.format();
    return result;
  } // hrefs like //foo/bar always cut to the protocol.


  if (relative.slashes && !relative.protocol) {
    // take everything except the protocol from relative
    var rkeys = Object.keys(relative);

    for (var rk = 0; rk < rkeys.length; rk++) {
      var rkey = rkeys[rk];
      if (rkey !== 'protocol') result[rkey] = relative[rkey];
    } //urlParse appends trailing / to urls like http://www.example.com


    if (slashedProtocol[result.protocol] && result.hostname && !result.pathname) {
      result.path = result.pathname = '/';
    }

    result.href = result.format();
    return result;
  }

  if (relative.protocol && relative.protocol !== result.protocol) {
    // if it's a known url protocol, then changing
    // the protocol does weird things
    // first, if it's not file:, then we MUST have a host,
    // and if there was a path
    // to begin with, then we MUST have a path.
    // if it is file:, then the host is dropped,
    // because that's known to be hostless.
    // anything else is assumed to be absolute.
    if (!slashedProtocol[relative.protocol]) {
      var keys = Object.keys(relative);

      for (var v = 0; v < keys.length; v++) {
        var k = keys[v];
        result[k] = relative[k];
      }

      result.href = result.format();
      return result;
    }

    result.protocol = relative.protocol;

    if (!relative.host && !/^file:?$/.test(relative.protocol) && !hostlessProtocol[relative.protocol]) {
      const relPath = (relative.pathname || '').split('/');

      while (relPath.length && !(relative.host = relPath.shift()));

      if (!relative.host) relative.host = '';
      if (!relative.hostname) relative.hostname = '';
      if (relPath[0] !== '') relPath.unshift('');
      if (relPath.length < 2) relPath.unshift('');
      result.pathname = relPath.join('/');
    } else {
      result.pathname = relative.pathname;
    }

    result.search = relative.search;
    result.query = relative.query;
    result.host = relative.host || '';
    result.auth = relative.auth;
    result.hostname = relative.hostname || relative.host;
    result.port = relative.port; // to support http.request

    if (result.pathname || result.search) {
      var p = result.pathname || '';
      var s = result.search || '';
      result.path = p + s;
    }

    result.slashes = result.slashes || relative.slashes;
    result.href = result.format();
    return result;
  }

  var isSourceAbs = result.pathname && result.pathname.charAt(0) === '/';
  var isRelAbs = relative.host || relative.pathname && relative.pathname.charAt(0) === '/';
  var mustEndAbs = isRelAbs || isSourceAbs || result.host && relative.pathname;
  var removeAllDots = mustEndAbs;
  var srcPath = result.pathname && result.pathname.split('/') || [];
  var relPath = relative.pathname && relative.pathname.split('/') || [];
  var psychotic = result.protocol && !slashedProtocol[result.protocol]; // if the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // result.protocol has already been set by now.
  // Later on, put the first path part into the host field.

  if (psychotic) {
    result.hostname = '';
    result.port = null;

    if (result.host) {
      if (srcPath[0] === '') srcPath[0] = result.host;else srcPath.unshift(result.host);
    }

    result.host = '';

    if (relative.protocol) {
      relative.hostname = null;
      relative.port = null;

      if (relative.host) {
        if (relPath[0] === '') relPath[0] = relative.host;else relPath.unshift(relative.host);
      }

      relative.host = null;
    }

    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
  }

  if (isRelAbs) {
    // it's absolute.
    result.host = relative.host || relative.host === '' ? relative.host : result.host;
    result.hostname = relative.hostname || relative.hostname === '' ? relative.hostname : result.hostname;
    result.search = relative.search;
    result.query = relative.query;
    srcPath = relPath; // fall through to the dot-handling below.
  } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
    if (!srcPath) srcPath = [];
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    result.search = relative.search;
    result.query = relative.query;
  } else if (relative.search !== null && relative.search !== undefined) {
    // just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
    if (psychotic) {
      result.hostname = result.host = srcPath.shift(); //occasionally the auth can get stuck only in host
      //this especially happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')

      const authInHost = result.host && result.host.indexOf('@') > 0 ? result.host.split('@') : false;

      if (authInHost) {
        result.auth = authInHost.shift();
        result.host = result.hostname = authInHost.shift();
      }
    }

    result.search = relative.search;
    result.query = relative.query; //to support http.request

    if (result.pathname !== null || result.search !== null) {
      result.path = (result.pathname ? result.pathname : '') + (result.search ? result.search : '');
    }

    result.href = result.format();
    return result;
  }

  if (!srcPath.length) {
    // no path at all.  easy.
    // we've already handled the other stuff above.
    result.pathname = null; //to support http.request

    if (result.search) {
      result.path = '/' + result.search;
    } else {
      result.path = null;
    }

    result.href = result.format();
    return result;
  } // if a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.


  var last = srcPath.slice(-1)[0];
  var hasTrailingSlash = (result.host || relative.host || srcPath.length > 1) && (last === '.' || last === '..') || last === ''; // strip single dots, resolve double dots to parent dir
  // if the path tries to go above the root, `up` ends up > 0

  var up = 0;

  for (var i = srcPath.length; i >= 0; i--) {
    last = srcPath[i];

    if (last === '.') {
      spliceOne(srcPath, i);
    } else if (last === '..') {
      spliceOne(srcPath, i);
      up++;
    } else if (up) {
      spliceOne(srcPath, i);
      up--;
    }
  } // if the path is allowed to go above the root, restore leading ..s


  if (!mustEndAbs && !removeAllDots) {
    for (; up--; up) {
      srcPath.unshift('..');
    }
  }

  if (mustEndAbs && srcPath[0] !== '' && (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
    srcPath.unshift('');
  }

  if (hasTrailingSlash && srcPath.join('/').substr(-1) !== '/') {
    srcPath.push('');
  }

  var isAbsolute = srcPath[0] === '' || srcPath[0] && srcPath[0].charAt(0) === '/'; // put the host back

  if (psychotic) {
    if (isAbsolute) {
      result.hostname = result.host = '';
    } else {
      result.hostname = result.host = srcPath.length ? srcPath.shift() : '';
    } //occasionally the auth can get stuck only in host
    //this especially happens in cases like
    //url.resolveObject('mailto:local1@domain1', 'local2@domain2')


    const authInHost = result.host && result.host.indexOf('@') > 0 ? result.host.split('@') : false;

    if (authInHost) {
      result.auth = authInHost.shift();
      result.host = result.hostname = authInHost.shift();
    }
  }

  mustEndAbs = mustEndAbs || result.host && srcPath.length;

  if (mustEndAbs && !isAbsolute) {
    srcPath.unshift('');
  }

  if (!srcPath.length) {
    result.pathname = null;
    result.path = null;
  } else {
    result.pathname = srcPath.join('/');
  } //to support request.http


  if (result.pathname !== null || result.search !== null) {
    result.path = (result.pathname ? result.pathname : '') + (result.search ? result.search : '');
  }

  result.auth = relative.auth || result.auth;
  result.slashes = result.slashes || relative.slashes;
  result.href = result.format();
  return result;
};
/* istanbul ignore next: improve coverage */


Url.prototype.parseHost = function () {
  var host = this.host;
  var port = portPattern.exec(host);

  if (port) {
    port = port[0];

    if (port !== ':') {
      this.port = port.slice(1);
    }

    host = host.slice(0, host.length - port.length);
  }

  if (host) this.hostname = host;
}; // About 1.5x faster than the two-arg version of Array#splice().

/* istanbul ignore next: improve coverage */


function spliceOne(list, index) {
  for (var i = index, k = i + 1, n = list.length; k < n; i += 1, k += 1) list[i] = list[k];

  list.pop();
}

var hexTable = new Array(256);

for (var i = 0; i < 256; ++i) hexTable[i] = '%' + ((i < 16 ? '0' : '') + i.toString(16)).toUpperCase();
/* istanbul ignore next: improve coverage */


function encodeAuth(str) {
  // faster encodeURIComponent alternative for encoding auth uri components
  var out = '';
  var lastPos = 0;

  for (var i = 0; i < str.length; ++i) {
    var c = str.charCodeAt(i); // These characters do not need escaping:
    // ! - . _ ~
    // ' ( ) * :
    // digits
    // alpha (uppercase)
    // alpha (lowercase)

    if (c === 0x21 || c === 0x2d || c === 0x2e || c === 0x5f || c === 0x7e || c >= 0x27 && c <= 0x2a || c >= 0x30 && c <= 0x3a || c >= 0x41 && c <= 0x5a || c >= 0x61 && c <= 0x7a) {
      continue;
    }

    if (i - lastPos > 0) out += str.slice(lastPos, i);
    lastPos = i + 1; // Other ASCII characters

    if (c < 0x80) {
      out += hexTable[c];
      continue;
    } // Multi-byte characters ...


    if (c < 0x800) {
      out += hexTable[0xc0 | c >> 6] + hexTable[0x80 | c & 0x3f];
      continue;
    }

    if (c < 0xd800 || c >= 0xe000) {
      out += hexTable[0xe0 | c >> 12] + hexTable[0x80 | c >> 6 & 0x3f] + hexTable[0x80 | c & 0x3f];
      continue;
    } // Surrogate pair


    ++i;
    var c2;
    if (i < str.length) c2 = str.charCodeAt(i) & 0x3ff;else c2 = 0;
    c = 0x10000 + ((c & 0x3ff) << 10 | c2);
    out += hexTable[0xf0 | c >> 18] + hexTable[0x80 | c >> 12 & 0x3f] + hexTable[0x80 | c >> 6 & 0x3f] + hexTable[0x80 | c & 0x3f];
  }

  if (lastPos === 0) return str;
  if (lastPos < str.length) return out + str.slice(lastPos);
  return out;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy92ZW5kb3IvbW9uZ29kYlVybC5qcyJdLCJuYW1lcyI6WyJwdW55Y29kZSIsInJlcXVpcmUiLCJleHBvcnRzIiwicGFyc2UiLCJ1cmxQYXJzZSIsInJlc29sdmUiLCJ1cmxSZXNvbHZlIiwicmVzb2x2ZU9iamVjdCIsInVybFJlc29sdmVPYmplY3QiLCJmb3JtYXQiLCJ1cmxGb3JtYXQiLCJVcmwiLCJwcm90b2NvbCIsInNsYXNoZXMiLCJhdXRoIiwiaG9zdCIsInBvcnQiLCJob3N0bmFtZSIsImhhc2giLCJzZWFyY2giLCJxdWVyeSIsInBhdGhuYW1lIiwicGF0aCIsImhyZWYiLCJwcm90b2NvbFBhdHRlcm4iLCJwb3J0UGF0dGVybiIsInNpbXBsZVBhdGhQYXR0ZXJuIiwidW5zYWZlUHJvdG9jb2wiLCJqYXZhc2NyaXB0IiwiaG9zdGxlc3NQcm90b2NvbCIsInNsYXNoZWRQcm90b2NvbCIsImh0dHAiLCJodHRwcyIsImZ0cCIsImdvcGhlciIsImZpbGUiLCJxdWVyeXN0cmluZyIsInVybCIsInBhcnNlUXVlcnlTdHJpbmciLCJzbGFzaGVzRGVub3RlSG9zdCIsInUiLCJwcm90b3R5cGUiLCJUeXBlRXJyb3IiLCJoYXNIYXNoIiwic3RhcnQiLCJlbmQiLCJyZXN0IiwibGFzdFBvcyIsImkiLCJpbldzIiwic3BsaXQiLCJsZW5ndGgiLCJjb2RlIiwiY2hhckNvZGVBdCIsImlzV3MiLCJzbGljZSIsInNpbXBsZVBhdGgiLCJleGVjIiwicHJvdG8iLCJsb3dlclByb3RvIiwidG9Mb3dlckNhc2UiLCJ0ZXN0IiwiaG9zdEVuZCIsImF0U2lnbiIsIm5vbkhvc3QiLCJkZWNvZGVVUklDb21wb25lbnQiLCJwYXJzZUhvc3QiLCJpcHY2SG9zdG5hbWUiLCJyZXN1bHQiLCJ2YWxpZGF0ZUhvc3RuYW1lIiwidW5kZWZpbmVkIiwidG9BU0NJSSIsInAiLCJoIiwiYXV0b0VzY2FwZVN0ciIsInF1ZXN0aW9uSWR4IiwiaGFzaElkeCIsImZpcnN0SWR4IiwicyIsInNlbGYiLCJuZXdSZXN0Iiwib2JqIiwiY2FsbCIsImVuY29kZUF1dGgiLCJpbmRleE9mIiwic3RyaW5naWZ5IiwibmV3UGF0aG5hbWUiLCJyZXBsYWNlIiwic291cmNlIiwicmVsYXRpdmUiLCJyZWwiLCJ0a2V5cyIsIk9iamVjdCIsImtleXMiLCJ0ayIsInRrZXkiLCJya2V5cyIsInJrIiwicmtleSIsInYiLCJrIiwicmVsUGF0aCIsInNoaWZ0IiwidW5zaGlmdCIsImpvaW4iLCJpc1NvdXJjZUFicyIsImNoYXJBdCIsImlzUmVsQWJzIiwibXVzdEVuZEFicyIsInJlbW92ZUFsbERvdHMiLCJzcmNQYXRoIiwicHN5Y2hvdGljIiwicG9wIiwiY29uY2F0IiwiYXV0aEluSG9zdCIsImxhc3QiLCJoYXNUcmFpbGluZ1NsYXNoIiwidXAiLCJzcGxpY2VPbmUiLCJzdWJzdHIiLCJwdXNoIiwiaXNBYnNvbHV0ZSIsImxpc3QiLCJpbmRleCIsIm4iLCJoZXhUYWJsZSIsIkFycmF5IiwidG9TdHJpbmciLCJ0b1VwcGVyQ2FzZSIsInN0ciIsIm91dCIsImMiLCJjMiJdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBOztBQUVBLE1BQU1BLFFBQVEsR0FBR0MsT0FBTyxDQUFDLFVBQUQsQ0FBeEI7O0FBRUFDLE9BQU8sQ0FBQ0MsS0FBUixHQUFnQkMsUUFBaEI7QUFDQUYsT0FBTyxDQUFDRyxPQUFSLEdBQWtCQyxVQUFsQjtBQUNBSixPQUFPLENBQUNLLGFBQVIsR0FBd0JDLGdCQUF4QjtBQUNBTixPQUFPLENBQUNPLE1BQVIsR0FBaUJDLFNBQWpCO0FBRUFSLE9BQU8sQ0FBQ1MsR0FBUixHQUFjQSxHQUFkOztBQUVBLFNBQVNBLEdBQVQsR0FBZTtBQUNiLE9BQUtDLFFBQUwsR0FBZ0IsSUFBaEI7QUFDQSxPQUFLQyxPQUFMLEdBQWUsSUFBZjtBQUNBLE9BQUtDLElBQUwsR0FBWSxJQUFaO0FBQ0EsT0FBS0MsSUFBTCxHQUFZLElBQVo7QUFDQSxPQUFLQyxJQUFMLEdBQVksSUFB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QyxHQUFHLEtBQUwsS0FBZSxFQUFoQixHQUFzQkMsRUFBakMsQ0FBSjtBQUNBRixJQUFBQSxHQUFHLElBQ0RMLFFBQVEsQ0FBQyxPQUFRTSxDQUFDLElBQUksRUFBZCxDQUFSLEdBQ0FOLFFBQVEsQ0FBQyxPQUFTTSxDQUFDLElBQUksRUFBTixHQUFZLElBQXJCLENBRFIsR0FFQU4sUUFBUSxDQUFDLE9BQVNNLENBQUMsSUFBSSxDQUFOLEdBQVcsSUFBcEIsQ0FGUixHQUdBTixRQUFRLENBQUMsT0FBUU0sQ0FBQyxHQUFHLElBQWIsQ0FKVjtBQUtEOztBQUNELE1BQUlwRixPQUFPLEtBQUssQ0FBaEIsRUFBbUIsT0FBT2tGLEdBQVA7QUFDbkIsTUFBSWxGLE9BQU8sR0FBR2tGLEdBQUcsQ0FBQzlFLE1BQWxCLEVBQTBCLE9BQU8rRSxHQUFHLEdBQUdELEdBQUcsQ0FBQzFFLEtBQUosQ0FBVVIsT0FBVixDQUFiO0FBQzFCLFNBQU9tRixHQUFQO0FBQ0QiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBBIHNsaWdodGx5IHBhdGNoZWQgdmVyc2lvbiBvZiBub2RlJ3MgdXJsIG1vZHVsZSwgd2l0aCBzdXBwb3J0IGZvciBtb25nb2RiOi8vXG4vLyB1cmlzLlxuLy9cbi8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbm9kZWpzL25vZGUvYmxvYi9tYXN0ZXIvTElDRU5TRSBmb3IgbGljZW5zaW5nXG4vLyBpbmZvcm1hdGlvblxuXG4ndXNlIHN0cmljdCc7XG5cbmNvbnN0IHB1bnljb2RlID0gcmVxdWlyZSgncHVueWNvZGUnKTtcblxuZXhwb3J0cy5wYXJzZSA9IHVybFBhcnNlO1xuZXhwb3J0cy5yZXNvbHZlID0gdXJsUmVzb2x2ZTtcbmV4cG9ydHMucmVzb2x2ZU9iamVjdCA9IHVybFJlc29sdmVPYmplY3Q7XG5leHBvcnRzLmZvcm1hdCA9IHVybEZvcm1hdDtcblxuZXhwb3J0cy5VcmwgPSBVcmw7XG5cbmZ1bmN0aW9uIFVybCgpIHtcbiAgdGhpcy5wcm90b2NvbCA9IG51bGw7XG4gIHRoaXMuc2xhc2hlcyA9IG51bGw7XG4gIHRoaXMuYXV0aCA9IG51bGw7XG4gIHRoaXMuaG9zdCA9IG51bGw7XG4gIHRoaXMucG9ydCA9IG51bGw7XG4gIHRoaXMuaG9zdG5hbWUgPSBudWxsO1xuICB0aGlzLmhhc2ggPSBudWxsO1xuICB0aGlzLnNlYXJjaCA9IG51bGw7XG4gIHRoaXMucXVlcnkgPSBudWxsO1xuICB0aGlzLnBhdGhuYW1lID0gbnVsbDtcbiAgdGhpcy5wYXRoID0gbnVsbDtcbiAgdGhpcy5ocmVmID0gbnVsbDtcbn1cblxuLy8gUmVmZXJlbmNlOiBSRkMgMzk4NiwgUkZDIDE4MDgsIFJGQyAyMzk2XG5cbi8vIGRlZmluZSB0aGVzZSBoZXJlIHNvIGF0IGxlYXN0IHRoZXkgb25seSBoYXZlIHRvIGJlXG4vLyBjb21waWxlZCBvbmNlIG9uIHRoZSBmaXJzdCBtb2R1bGUgbG9hZC5cbmNvbnN0IHByb3RvY29sUGF0dGVybiA9IC9eKFthLXowLTkuKy1dKzopL2k7XG5jb25zdCBwb3J0UGF0dGVybiA9IC86WzAtOV0qJC87XG5cbi8vIFNwZWNpYWwgY2FzZSBmb3IgYSBzaW1wbGUgcGF0aCBVUkxcbmNvbnN0IHNpbXBsZVBhdGhQYXR0ZXJuID0gL14oXFwvXFwvPyg/IVxcLylbXlxcP1xcc10qKShcXD9bXlxcc10qKT8kLztcblxuLy8gcHJvdG9jb2xzIHRoYXQgY2FuIGFsbG93IFwidW5zYWZlXCIgYW5kIFwidW53aXNlXCIgY2hhcnMuXG5jb25zdCB1bnNhZmVQcm90b2NvbCA9IHtcbiAgamF2YXNjcmlwdDogdHJ1ZSxcbiAgJ2phdmFzY3JpcHQ6JzogdHJ1ZSxcbn07XG4vLyBwcm90b2NvbHMgdGhhdCBuZXZlciBoYXZlIGEgaG9zdG5hbWUuXG5jb25zdCBob3N0bGVzc1Byb3RvY29sID0ge1xuICBqYXZhc2NyaXB0OiB0cnVlLFxuICAnamF2YXNjcmlwdDonOiB0cnVlLFxufTtcbi8vIHByb3RvY29scyB0aGF0IGFsd2F5cyBjb250YWluIGEgLy8gYml0LlxuY29uc3Qgc2xhc2hlZFByb3RvY29sID0ge1xuICBodHRwOiB0cnVlLFxuICAnaHR0cDonOiB0cnVlLFxuICBodHRwczogdHJ1ZSxcbiAgJ2h0dHBzOic6IHRydWUsXG4gIGZ0cDogdHJ1ZSxcbiAgJ2Z0cDonOiB0cnVlLFxuICBnb3BoZXI6IHRydWUsXG4gICdnb3BoZXI6JzogdHJ1ZSxcbiAgZmlsZTogdHJ1ZSxcbiAgJ2ZpbGU6JzogdHJ1ZSxcbn07XG5jb25zdCBxdWVyeXN0cmluZyA9IHJlcXVpcmUoJ3F1ZXJ5c3RyaW5nJyk7XG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5mdW5jdGlvbiB1cmxQYXJzZSh1cmwsIHBhcnNlUXVlcnlTdHJpbmcsIHNsYXNoZXNEZW5vdGVIb3N0KSB7XG4gIGlmICh1cmwgaW5zdGFuY2VvZiBVcmwpIHJldHVybiB1cmw7XG5cbiAgdmFyIHUgPSBuZXcgVXJsKCk7XG4gIHUucGFyc2UodXJsLCBwYXJzZVF1ZXJ5U3RyaW5nLCBzbGFzaGVzRGVub3RlSG9zdCk7XG4gIHJldHVybiB1O1xufVxuXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuVXJsLnByb3RvdHlwZS5wYXJzZSA9IGZ1bmN0aW9uICh1cmwsIHBhcnNlUXVlcnlTdHJpbmcsIHNsYXNoZXNEZW5vdGVIb3N0KSB7XG4gIGlmICh0eXBlb2YgdXJsICE9PSAnc3RyaW5nJykge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ1BhcmFtZXRlciBcInVybFwiIG11c3QgYmUgYSBzdHJpbmcsIG5vdCAnICsgdHlwZW9mIHVybCk7XG4gIH1cblxuICAvLyBDb3B5IGNocm9tZSwgSUUsIG9wZXJhIGJhY2tzbGFzaC1oYW5kbGluZyBiZWhhdmlvci5cbiAgLy8gQmFjayBzbGFzaGVzIGJlZm9yZSB0aGUgcXVlcnkgc3RyaW5nIGdldCBjb252ZXJ0ZWQgdG8gZm9yd2FyZCBzbGFzaGVzXG4gIC8vIFNlZTogaHR0cHM6Ly9jb2RlLmdvb2dsZS5jb20vcC9jaHJvbWl1bS9pc3N1ZXMvZGV0YWlsP2lkPTI1OTE2XG4gIHZhciBoYXNIYXNoID0gZmFsc2U7XG4gIHZhciBzdGFydCA9IC0xO1xuICB2YXIgZW5kID0gLTE7XG4gIHZhciByZXN0ID0gJyc7XG4gIHZhciBsYXN0UG9zID0gMDtcbiAgdmFyIGkgPSAwO1xuICBmb3IgKHZhciBpbldzID0gZmFsc2UsIHNwbGl0ID0gZmFsc2U7IGkgPCB1cmwubGVuZ3RoOyArK2kpIHtcbiAgICBjb25zdCBjb2RlID0gdXJsLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAvLyBGaW5kIGZpcnN0IGFuZCBsYXN0IG5vbi13aGl0ZXNwYWNlIGNoYXJhY3RlcnMgZm9yIHRyaW1taW5nXG4gICAgY29uc3QgaXNXcyA9XG4gICAgICBjb2RlID09PSAzMiAvKiAqLyB8fFxuICAgICAgY29kZSA9PT0gOSAvKlxcdCovIHx8XG4gICAgICBjb2RlID09PSAxMyAvKlxcciovIHx8XG4gICAgICBjb2RlID09PSAxMCAvKlxcbiovIHx8XG4gICAgICBjb2RlID09PSAxMiAvKlxcZiovIHx8XG4gICAgICBjb2RlID09PSAxNjAgLypcXHUwMEEwKi8gfHxcbiAgICAgIGNvZGUgPT09IDY1Mjc5OyAvKlxcdUZFRkYqL1xuICAgIGlmIChzdGFydCA9PT0gLTEpIHtcbiAgICAgIGlmIChpc1dzKSBjb250aW51ZTtcbiAgICAgIGxhc3RQb3MgPSBzdGFydCA9IGk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChpbldzKSB7XG4gICAgICAgIGlmICghaXNXcykge1xuICAgICAgICAgIGVuZCA9IC0xO1xuICAgICAgICAgIGluV3MgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChpc1dzKSB7XG4gICAgICAgIGVuZCA9IGk7XG4gICAgICAgIGluV3MgPSB0cnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIE9ubHkgY29udmVydCBiYWNrc2xhc2hlcyB3aGlsZSB3ZSBoYXZlbid0IHNlZW4gYSBzcGxpdCBjaGFyYWN0ZXJcbiAgICBpZiAoIXNwbGl0KSB7XG4gICAgICBzd2l0Y2ggKGNvZGUpIHtcbiAgICAgICAgY2FzZSAzNTogLy8gJyMnXG4gICAgICAgICAgaGFzSGFzaCA9IHRydWU7XG4gICAgICAgIC8vIEZhbGwgdGhyb3VnaFxuICAgICAgICBjYXNlIDYzOiAvLyAnPydcbiAgICAgICAgICBzcGxpdCA9IHRydWU7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgOTI6IC8vICdcXFxcJ1xuICAgICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIHJlc3QgKz0gdXJsLnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICAgIHJlc3QgKz0gJy8nO1xuICAgICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKCFoYXNIYXNoICYmIGNvZGUgPT09IDM1IC8qIyovKSB7XG4gICAgICBoYXNIYXNoID0gdHJ1ZTtcbiAgICB9XG4gIH1cblxuICAvLyBDaGVjayBpZiBzdHJpbmcgd2FzIG5vbi1lbXB0eSAoaW5jbHVkaW5nIHN0cmluZ3Mgd2l0aCBvbmx5IHdoaXRlc3BhY2UpXG4gIGlmIChzdGFydCAhPT0gLTEpIHtcbiAgICBpZiAobGFzdFBvcyA9PT0gc3RhcnQpIHtcbiAgICAgIC8vIFdlIGRpZG4ndCBjb252ZXJ0IGFueSBiYWNrc2xhc2hlc1xuXG4gICAgICBpZiAoZW5kID09PSAtMSkge1xuICAgICAgICBpZiAoc3RhcnQgPT09IDApIHJlc3QgPSB1cmw7XG4gICAgICAgIGVsc2UgcmVzdCA9IHVybC5zbGljZShzdGFydCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXN0ID0gdXJsLnNsaWNlKHN0YXJ0LCBlbmQpO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZW5kID09PSAtMSAmJiBsYXN0UG9zIDwgdXJsLmxlbmd0aCkge1xuICAgICAgLy8gV2UgY29udmVydGVkIHNvbWUgYmFja3NsYXNoZXMgYW5kIGhhdmUgb25seSBwYXJ0IG9mIHRoZSBlbnRpcmUgc3RyaW5nXG4gICAgICByZXN0ICs9IHVybC5zbGljZShsYXN0UG9zKTtcbiAgICB9IGVsc2UgaWYgKGVuZCAhPT0gLTEgJiYgbGFzdFBvcyA8IGVuZCkge1xuICAgICAgLy8gV2UgY29udmVydGVkIHNvbWUgYmFja3NsYXNoZXMgYW5kIGhhdmUgb25seSBwYXJ0IG9mIHRoZSBlbnRpcmUgc3RyaW5nXG4gICAgICByZXN0ICs9IHVybC5zbGljZShsYXN0UG9zLCBlbmQpO1xuICAgIH1cbiAgfVxuXG4gIGlmICghc2xhc2hlc0Rlbm90ZUhvc3QgJiYgIWhhc0hhc2gpIHtcbiAgICAvLyBUcnkgZmFzdCBwYXRoIHJlZ2V4cFxuICAgIGNvbnN0IHNpbXBsZVBhdGggPSBzaW1wbGVQYXRoUGF0dGVybi5leGVjKHJlc3QpO1xuICAgIGlmIChzaW1wbGVQYXRoKSB7XG4gICAgICB0aGlzLnBhdGggPSByZXN0O1xuICAgICAgdGhpcy5ocmVmID0gcmVzdDtcbiAgICAgIHRoaXMucGF0aG5hbWUgPSBzaW1wbGVQYXRoWzFdO1xuICAgICAgaWYgKHNpbXBsZVBhdGhbMl0pIHtcbiAgICAgICAgdGhpcy5zZWFyY2ggPSBzaW1wbGVQYXRoWzJdO1xuICAgICAgICBpZiAocGFyc2VRdWVyeVN0cmluZykge1xuICAgICAgICAgIHRoaXMucXVlcnkgPSBxdWVyeXN0cmluZy5wYXJzZSh0aGlzLnNlYXJjaC5zbGljZSgxKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5xdWVyeSA9IHRoaXMuc2VhcmNoLnNsaWNlKDEpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHBhcnNlUXVlcnlTdHJpbmcpIHtcbiAgICAgICAgdGhpcy5zZWFyY2ggPSAnJztcbiAgICAgICAgdGhpcy5xdWVyeSA9IHt9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICB9XG5cbiAgdmFyIHByb3RvID0gcHJvdG9jb2xQYXR0ZXJuLmV4ZWMocmVzdCk7XG4gIGlmIChwcm90bykge1xuICAgIHByb3RvID0gcHJvdG9bMF07XG4gICAgdmFyIGxvd2VyUHJvdG8gPSBwcm90by50b0xvd2VyQ2FzZSgpO1xuICAgIHRoaXMucHJvdG9jb2wgPSBsb3dlclByb3RvO1xuICAgIHJlc3QgPSByZXN0LnNsaWNlKHByb3RvLmxlbmd0aCk7XG4gIH1cblxuICAvLyBmaWd1cmUgb3V0IGlmIGl0J3MgZ290IGEgaG9zdFxuICAvLyB1c2VyQHNlcnZlciBpcyAqYWx3YXlzKiBpbnRlcnByZXRlZCBhcyBhIGhvc3RuYW1lLCBhbmQgdXJsXG4gIC8vIHJlc29sdXRpb24gd2lsbCB0cmVhdCAvL2Zvby9iYXIgYXMgaG9zdD1mb28scGF0aD1iYXIgYmVjYXVzZSB0aGF0J3NcbiAgLy8gaG93IHRoZSBicm93c2VyIHJlc29sdmVzIHJlbGF0aXZlIFVSTHMuXG4gIGlmIChzbGFzaGVzRGVub3RlSG9zdCB8fCBwcm90byB8fCAvXlxcL1xcL1teQFxcL10rQFteQFxcL10rLy50ZXN0KHJlc3QpKSB7XG4gICAgdmFyIHNsYXNoZXMgPSByZXN0LmNoYXJDb2RlQXQoMCkgPT09IDQ3IC8qLyovICYmIHJlc3QuY2hhckNvZGVBdCgxKSA9PT0gNDc7IC8qLyovXG4gICAgaWYgKHNsYXNoZXMgJiYgIShwcm90byAmJiBob3N0bGVzc1Byb3RvY29sW3Byb3RvXSkpIHtcbiAgICAgIHJlc3QgPSByZXN0LnNsaWNlKDIpO1xuICAgICAgdGhpcy5zbGFzaGVzID0gdHJ1ZTtcbiAgICB9XG4gIH1cblxuICBpZiAoIWhvc3RsZXNzUHJvdG9jb2xbcHJvdG9dICYmIChzbGFzaGVzIHx8IChwcm90byAmJiAhc2xhc2hlZFByb3RvY29sW3Byb3RvXSkpKSB7XG4gICAgLy8gdGhlcmUncyBhIGhvc3RuYW1lLlxuICAgIC8vIHRoZSBmaXJzdCBpbnN0YW5jZSBvZiAvLCA/LCA7LCBvciAjIGVuZHMgdGhlIGhvc3QuXG4gICAgLy9cbiAgICAvLyBJZiB0aGVyZSBpcyBhbiBAIGluIHRoZSBob3N0bmFtZSwgdGhlbiBub24taG9zdCBjaGFycyAqYXJlKiBhbGxvd2VkXG4gICAgLy8gdG8gdGhlIGxlZnQgb2YgdGhlIGxhc3QgQCBzaWduLCB1bmxlc3Mgc29tZSBob3N0LWVuZGluZyBjaGFyYWN0ZXJcbiAgICAvLyBjb21lcyAqYmVmb3JlKiB0aGUgQC1zaWduLlxuICAgIC8vIFVSTHMgYXJlIG9ibm94aW91cy5cbiAgICAvL1xuICAgIC8vIGV4OlxuICAgIC8vIGh0dHA6Ly9hQGJAYy8gPT4gdXNlcjphQGIgaG9zdDpjXG4gICAgLy8gaHR0cDovL2FAYj9AYyA9PiB1c2VyOmEgaG9zdDpiIHBhdGg6Lz9AY1xuXG4gICAgLy8gdjAuMTIgVE9ETyhpc2FhY3MpOiBUaGlzIGlzIG5vdCBxdWl0ZSBob3cgQ2hyb21lIGRvZXMgdGhpbmdzLlxuICAgIC8vIFJldmlldyBvdXIgdGVzdCBjYXNlIGFnYWluc3QgYnJvd3NlcnMgbW9yZSBjb21wcmVoZW5zaXZlbHkuXG5cbiAgICB2YXIgaG9zdEVuZCA9IC0xO1xuICAgIHZhciBhdFNpZ24gPSAtMTtcbiAgICB2YXIgbm9uSG9zdCA9IC0xO1xuICAgIGZvciAoaSA9IDA7IGkgPCByZXN0Lmxlbmd0aDsgKytpKSB7XG4gICAgICBzd2l0Y2ggKHJlc3QuY2hhckNvZGVBdChpKSkge1xuICAgICAgICBjYXNlIDk6IC8vICdcXHQnXG4gICAgICAgIGNhc2UgMTA6IC8vICdcXG4nXG4gICAgICAgIGNhc2UgMTM6IC8vICdcXHInXG4gICAgICAgIGNhc2UgMzI6IC8vICcgJ1xuICAgICAgICBjYXNlIDM0OiAvLyAnXCInXG4gICAgICAgIGNhc2UgMzc6IC8vICclJ1xuICAgICAgICBjYXNlIDM5OiAvLyAnXFwnJ1xuICAgICAgICBjYXNlIDU5OiAvLyAnOydcbiAgICAgICAgY2FzZSA2MDogLy8gJzwnXG4gICAgICAgIGNhc2UgNjI6IC8vICc+J1xuICAgICAgICBjYXNlIDkyOiAvLyAnXFxcXCdcbiAgICAgICAgY2FzZSA5NDogLy8gJ14nXG4gICAgICAgIGNhc2UgOTY6IC8vICdgJ1xuICAgICAgICBjYXNlIDEyMzogLy8gJ3snXG4gICAgICAgIGNhc2UgMTI0OiAvLyAnfCdcbiAgICAgICAgY2FzZSAxMjU6IC8vICd9J1xuICAgICAgICAgIC8vIENoYXJhY3RlcnMgdGhhdCBhcmUgbmV2ZXIgZXZlciBhbGxvd2VkIGluIGEgaG9zdG5hbWUgZnJvbSBSRkMgMjM5NlxuICAgICAgICAgIGlmIChub25Ib3N0ID09PSAtMSkgbm9uSG9zdCA9IGk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgMzU6IC8vICcjJ1xuICAgICAgICBjYXNlIDQ3OiAvLyAnLydcbiAgICAgICAgY2FzZSA2MzogLy8gJz8nXG4gICAgICAgICAgLy8gRmluZCB0aGUgZmlyc3QgaW5zdGFuY2Ugb2YgYW55IGhvc3QtZW5kaW5nIGNoYXJhY3RlcnNcbiAgICAgICAgICBpZiAobm9uSG9zdCA9PT0gLTEpIG5vbkhvc3QgPSBpO1xuICAgICAgICAgIGhvc3RFbmQgPSBpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIDY0OiAvLyAnQCdcbiAgICAgICAgICAvLyBBdCB0aGlzIHBvaW50LCBlaXRoZXIgd2UgaGF2ZSBhbiBleHBsaWNpdCBwb2ludCB3aGVyZSB0aGVcbiAgICAgICAgICAvLyBhdXRoIHBvcnRpb24gY2Fubm90IGdvIHBhc3QsIG9yIHRoZSBsYXN0IEAgY2hhciBpcyB0aGUgZGVjaWRlci5cbiAgICAgICAgICBhdFNpZ24gPSBpO1xuICAgICAgICAgIG5vbkhvc3QgPSAtMTtcbiAgICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGlmIChob3N0RW5kICE9PSAtMSkgYnJlYWs7XG4gICAgfVxuICAgIHN0YXJ0ID0gMDtcbiAgICBpZiAoYXRTaWduICE9PSAtMSkge1xuICAgICAgdGhpcy5hdXRoID0gZGVjb2RlVVJJQ29tcG9uZW50KHJlc3Quc2xpY2UoMCwgYXRTaWduKSk7XG4gICAgICBzdGFydCA9IGF0U2lnbiArIDE7XG4gICAgfVxuICAgIGlmIChub25Ib3N0ID09PSAtMSkge1xuICAgICAgdGhpcy5ob3N0ID0gcmVzdC5zbGljZShzdGFydCk7XG4gICAgICByZXN0ID0gJyc7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuaG9zdCA9IHJlc3Quc2xpY2Uoc3RhcnQsIG5vbkhvc3QpO1xuICAgICAgcmVzdCA9IHJlc3Quc2xpY2Uobm9uSG9zdCk7XG4gICAgfVxuXG4gICAgLy8gcHVsbCBvdXQgcG9ydC5cbiAgICB0aGlzLnBhcnNlSG9zdCgpO1xuXG4gICAgLy8gd2UndmUgaW5kaWNhdGVkIHRoYXQgdGhlcmUgaXMgYSBob3N0bmFtZSxcbiAgICAvLyBzbyBldmVuIGlmIGl0J3MgZW1wdHksIGl0IGhhcyB0byBiZSBwcmVzZW50LlxuICAgIGlmICh0eXBlb2YgdGhpcy5ob3N0bmFtZSAhPT0gJ3N0cmluZycpIHRoaXMuaG9zdG5hbWUgPSAnJztcblxuICAgIHZhciBob3N0bmFtZSA9IHRoaXMuaG9zdG5hbWU7XG5cbiAgICAvLyBpZiBob3N0bmFtZSBiZWdpbnMgd2l0aCBbIGFuZCBlbmRzIHdpdGggXVxuICAgIC8vIGFzc3VtZSB0aGF0IGl0J3MgYW4gSVB2NiBhZGRyZXNzLlxuICAgIHZhciBpcHY2SG9zdG5hbWUgPVxuICAgICAgaG9zdG5hbWUuY2hhckNvZGVBdCgwKSA9PT0gOTEgLypbKi8gJiYgaG9zdG5hbWUuY2hhckNvZGVBdChob3N0bmFtZS5sZW5ndGggLSAxKSA9PT0gOTM7IC8qXSovXG5cbiAgICAvLyB2YWxpZGF0ZSBhIGxpdHRsZS5cbiAgICBpZiAoIWlwdjZIb3N0bmFtZSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gdmFsaWRhdGVIb3N0bmFtZSh0aGlzLCByZXN0LCBob3N0bmFtZSk7XG4gICAgICBpZiAocmVzdWx0ICE9PSB1bmRlZmluZWQpIHJlc3QgPSByZXN1bHQ7XG4gICAgfVxuXG4gICAgLy8gaG9zdG5hbWVzIGFyZSBhbHdheXMgbG93ZXIgY2FzZS5cbiAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZS50b0xvd2VyQ2FzZSgpO1xuXG4gICAgaWYgKCFpcHY2SG9zdG5hbWUpIHtcbiAgICAgIC8vIElETkEgU3VwcG9ydDogUmV0dXJucyBhIHB1bnljb2RlZCByZXByZXNlbnRhdGlvbiBvZiBcImRvbWFpblwiLlxuICAgICAgLy8gSXQgb25seSBjb252ZXJ0cyBwYXJ0cyBvZiB0aGUgZG9tYWluIG5hbWUgdGhhdFxuICAgICAgLy8gaGF2ZSBub24tQVNDSUkgY2hhcmFjdGVycywgaS5lLiBpdCBkb2Vzbid0IG1hdHRlciBpZlxuICAgICAgLy8geW91IGNhbGwgaXQgd2l0aCBhIGRvbWFpbiB0aGF0IGFscmVhZHkgaXMgQVNDSUktb25seS5cbiAgICAgIHRoaXMuaG9zdG5hbWUgPSBwdW55Y29kZS50b0FTQ0lJKHRoaXMuaG9zdG5hbWUpO1xuICAgIH1cblxuICAgIHZhciBwID0gdGhpcy5wb3J0ID8gJzonICsgdGhpcy5wb3J0IDogJyc7XG4gICAgdmFyIGggPSB0aGlzLmhvc3RuYW1lIHx8ICcnO1xuICAgIHRoaXMuaG9zdCA9IGggKyBwO1xuXG4gICAgLy8gc3RyaXAgWyBhbmQgXSBmcm9tIHRoZSBob3N0bmFtZVxuICAgIC8vIHRoZSBob3N0IGZpZWxkIHN0aWxsIHJldGFpbnMgdGhlbSwgdGhvdWdoXG4gICAgaWYgKGlwdjZIb3N0bmFtZSkge1xuICAgICAgdGhpcy5ob3N0bmFtZSA9IHRoaXMuaG9zdG5hbWUuc2xpY2UoMSwgLTEpO1xuICAgICAgaWYgKHJlc3RbMF0gIT09ICcvJykge1xuICAgICAgICByZXN0ID0gJy8nICsgcmVzdDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBub3cgcmVzdCBpcyBzZXQgdG8gdGhlIHBvc3QtaG9zdCBzdHVmZi5cbiAgLy8gY2hvcCBvZmYgYW55IGRlbGltIGNoYXJzLlxuICBpZiAoIXVuc2FmZVByb3RvY29sW2xvd2VyUHJvdG9dKSB7XG4gICAgLy8gRmlyc3QsIG1ha2UgMTAwJSBzdXJlIHRoYXQgYW55IFwiYXV0b0VzY2FwZVwiIGNoYXJzIGdldFxuICAgIC8vIGVzY2FwZWQsIGV2ZW4gaWYgZW5jb2RlVVJJQ29tcG9uZW50IGRvZXNuJ3QgdGhpbmsgdGhleVxuICAgIC8vIG5lZWQgdG8gYmUuXG4gICAgY29uc3QgcmVzdWx0ID0gYXV0b0VzY2FwZVN0cihyZXN0KTtcbiAgICBpZiAocmVzdWx0ICE9PSB1bmRlZmluZWQpIHJlc3QgPSByZXN1bHQ7XG4gIH1cblxuICB2YXIgcXVlc3Rpb25JZHggPSAtMTtcbiAgdmFyIGhhc2hJZHggPSAtMTtcbiAgZm9yIChpID0gMDsgaSA8IHJlc3QubGVuZ3RoOyArK2kpIHtcbiAgICBjb25zdCBjb2RlID0gcmVzdC5jaGFyQ29kZUF0KGkpO1xuICAgIGlmIChjb2RlID09PSAzNSAvKiMqLykge1xuICAgICAgdGhpcy5oYXNoID0gcmVzdC5zbGljZShpKTtcbiAgICAgIGhhc2hJZHggPSBpO1xuICAgICAgYnJlYWs7XG4gICAgfSBlbHNlIGlmIChjb2RlID09PSA2MyAvKj8qLyAmJiBxdWVzdGlvbklkeCA9PT0gLTEpIHtcbiAgICAgIHF1ZXN0aW9uSWR4ID0gaTtcbiAgICB9XG4gIH1cblxuICBpZiAocXVlc3Rpb25JZHggIT09IC0xKSB7XG4gICAgaWYgKGhhc2hJZHggPT09IC0xKSB7XG4gICAgICB0aGlzLnNlYXJjaCA9IHJlc3Quc2xpY2UocXVlc3Rpb25JZHgpO1xuICAgICAgdGhpcy5xdWVyeSA9IHJlc3Quc2xpY2UocXVlc3Rpb25JZHggKyAxKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5zZWFyY2ggPSByZXN0LnNsaWNlKHF1ZXN0aW9uSWR4LCBoYXNoSWR4KTtcbiAgICAgIHRoaXMucXVlcnkgPSByZXN0LnNsaWNlKHF1ZXN0aW9uSWR4ICsgMSwgaGFzaElkeCk7XG4gICAgfVxuICAgIGlmIChwYXJzZVF1ZXJ5U3RyaW5nKSB7XG4gICAgICB0aGlzLnF1ZXJ5ID0gcXVlcnlzdHJpbmcucGFyc2UodGhpcy5xdWVyeSk7XG4gICAgfVxuICB9IGVsc2UgaWYgKHBhcnNlUXVlcnlTdHJpbmcpIHtcbiAgICAvLyBubyBxdWVyeSBzdHJpbmcsIGJ1dCBwYXJzZVF1ZXJ5U3RyaW5nIHN0aWxsIHJlcXVlc3RlZFxuICAgIHRoaXMuc2VhcmNoID0gJyc7XG4gICAgdGhpcy5xdWVyeSA9IHt9O1xuICB9XG5cbiAgdmFyIGZpcnN0SWR4ID1cbiAgICBxdWVzdGlvbklkeCAhPT0gLTEgJiYgKGhhc2hJZHggPT09IC0xIHx8IHF1ZXN0aW9uSWR4IDwgaGFzaElkeCkgPyBxdWVzdGlvbklkeCA6IGhhc2hJZHg7XG4gIGlmIChmaXJzdElkeCA9PT0gLTEpIHtcbiAgICBpZiAocmVzdC5sZW5ndGggPiAwKSB0aGlzLnBhdGhuYW1lID0gcmVzdDtcbiAgfSBlbHNlIGlmIChmaXJzdElkeCA+IDApIHtcbiAgICB0aGlzLnBhdGhuYW1lID0gcmVzdC5zbGljZSgwLCBmaXJzdElkeCk7XG4gIH1cbiAgaWYgKHNsYXNoZWRQcm90b2NvbFtsb3dlclByb3RvXSAmJiB0aGlzLmhvc3RuYW1lICYmICF0aGlzLnBhdGhuYW1lKSB7XG4gICAgdGhpcy5wYXRobmFtZSA9ICcvJztcbiAgfVxuXG4gIC8vIHRvIHN1cHBvcnQgaHR0cC5yZXF1ZXN0XG4gIGlmICh0aGlzLnBhdGhuYW1lIHx8IHRoaXMuc2VhcmNoKSB7XG4gICAgY29uc3QgcCA9IHRoaXMucGF0aG5hbWUgfHwgJyc7XG4gICAgY29uc3QgcyA9IHRoaXMuc2VhcmNoIHx8ICcnO1xuICAgIHRoaXMucGF0aCA9IHAgKyBzO1xuICB9XG5cbiAgLy8gZmluYWxseSwgcmVjb25zdHJ1Y3QgdGhlIGhyZWYgYmFzZWQgb24gd2hhdCBoYXMgYmVlbiB2YWxpZGF0ZWQuXG4gIHRoaXMuaHJlZiA9IHRoaXMuZm9ybWF0KCk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cbmZ1bmN0aW9uIHZhbGlkYXRlSG9zdG5hbWUoc2VsZiwgcmVzdCwgaG9zdG5hbWUpIHtcbiAgZm9yICh2YXIgaSA9IDAsIGxhc3RQb3M7IGkgPD0gaG9zdG5hbWUubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgY29kZTtcbiAgICBpZiAoaSA8IGhvc3RuYW1lLmxlbmd0aCkgY29kZSA9IGhvc3RuYW1lLmNoYXJDb2RlQXQoaSk7XG4gICAgaWYgKGNvZGUgPT09IDQ2IC8qLiovIHx8IGkgPT09IGhvc3RuYW1lLmxlbmd0aCkge1xuICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkge1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiA2Mykge1xuICAgICAgICAgIHNlbGYuaG9zdG5hbWUgPSBob3N0bmFtZS5zbGljZSgwLCBsYXN0UG9zICsgNjMpO1xuICAgICAgICAgIHJldHVybiAnLycgKyBob3N0bmFtZS5zbGljZShsYXN0UG9zICsgNjMpICsgcmVzdDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgY29udGludWU7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIChjb2RlID49IDQ4IC8qMCovICYmIGNvZGUgPD0gNTcpIC8qOSovIHx8XG4gICAgICAoY29kZSA+PSA5NyAvKmEqLyAmJiBjb2RlIDw9IDEyMikgLyp6Ki8gfHxcbiAgICAgIGNvZGUgPT09IDQ1IC8qLSovIHx8XG4gICAgICAoY29kZSA+PSA2NSAvKkEqLyAmJiBjb2RlIDw9IDkwKSAvKloqLyB8fFxuICAgICAgY29kZSA9PT0gNDMgLyorKi8gfHxcbiAgICAgIGNvZGUgPT09IDk1IC8qXyovIHx8XG4gICAgICAvKiBCRUdJTiBNT05HTyBVUkkgUEFUQ0ggKi9cbiAgICAgIGNvZGUgPT09IDQ0IC8qLCovIHx8XG4gICAgICBjb2RlID09PSA1OCAvKjoqLyB8fFxuICAgICAgLyogRU5EIE1PTkdPIFVSSSBQQVRDSCAqL1xuICAgICAgY29kZSA+IDEyN1xuICAgICkge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIC8vIEludmFsaWQgaG9zdCBjaGFyYWN0ZXJcbiAgICBzZWxmLmhvc3RuYW1lID0gaG9zdG5hbWUuc2xpY2UoMCwgaSk7XG4gICAgaWYgKGkgPCBob3N0bmFtZS5sZW5ndGgpIHJldHVybiAnLycgKyBob3N0bmFtZS5zbGljZShpKSArIHJlc3Q7XG4gICAgYnJlYWs7XG4gIH1cbn1cblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cbmZ1bmN0aW9uIGF1dG9Fc2NhcGVTdHIocmVzdCkge1xuICB2YXIgbmV3UmVzdCA9ICcnO1xuICB2YXIgbGFzdFBvcyA9IDA7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgcmVzdC5sZW5ndGg7ICsraSkge1xuICAgIC8vIEF1dG9tYXRpY2FsbHkgZXNjYXBlIGFsbCBkZWxpbWl0ZXJzIGFuZCB1bndpc2UgY2hhcmFjdGVycyBmcm9tIFJGQyAyMzk2XG4gICAgLy8gQWxzbyBlc2NhcGUgc2luZ2xlIHF1b3RlcyBpbiBjYXNlIG9mIGFuIFhTUyBhdHRhY2tcbiAgICBzd2l0Y2ggKHJlc3QuY2hhckNvZGVBdChpKSkge1xuICAgICAgY2FzZSA5OiAvLyAnXFx0J1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyUwOSc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDEwOiAvLyAnXFxuJ1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyUwQSc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDEzOiAvLyAnXFxyJ1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyUwRCc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDMyOiAvLyAnICdcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclMjAnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAzNDogLy8gJ1wiJ1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyUyMic7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDM5OiAvLyAnXFwnJ1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyUyNyc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDYwOiAvLyAnPCdcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclM0MnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSA2MjogLy8gJz4nXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UmVzdCArPSAnJTNFJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgOTI6IC8vICdcXFxcJ1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyU1Qyc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDk0OiAvLyAnXidcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclNUUnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSA5NjogLy8gJ2AnXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UmVzdCArPSAnJTYwJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMTIzOiAvLyAneydcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclN0InO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAxMjQ6IC8vICd8J1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyU3Qyc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDEyNTogLy8gJ30nXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UmVzdCArPSAnJTdEJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICB9XG4gIH1cbiAgaWYgKGxhc3RQb3MgPT09IDApIHJldHVybjtcbiAgaWYgKGxhc3RQb3MgPCByZXN0Lmxlbmd0aCkgcmV0dXJuIG5ld1Jlc3QgKyByZXN0LnNsaWNlKGxhc3RQb3MpO1xuICBlbHNlIHJldHVybiBuZXdSZXN0O1xufVxuXG4vLyBmb3JtYXQgYSBwYXJzZWQgb2JqZWN0IGludG8gYSB1cmwgc3RyaW5nXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuZnVuY3Rpb24gdXJsRm9ybWF0KG9iaikge1xuICAvLyBlbnN1cmUgaXQncyBhbiBvYmplY3QsIGFuZCBub3QgYSBzdHJpbmcgdXJsLlxuICAvLyBJZiBpdCdzIGFuIG9iaiwgdGhpcyBpcyBhIG5vLW9wLlxuICAvLyB0aGlzIHdheSwgeW91IGNhbiBjYWxsIHVybF9mb3JtYXQoKSBvbiBzdHJpbmdzXG4gIC8vIHRvIGNsZWFuIHVwIHBvdGVudGlhbGx5IHdvbmt5IHVybHMuXG4gIGlmICh0eXBlb2Ygb2JqID09PSAnc3RyaW5nJykgb2JqID0gdXJsUGFyc2Uob2JqKTtcbiAgZWxzZSBpZiAodHlwZW9mIG9iaiAhPT0gJ29iamVjdCcgfHwgb2JqID09PSBudWxsKVxuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXG4gICAgICAnUGFyYW1ldGVyIFwidXJsT2JqXCIgbXVzdCBiZSBhbiBvYmplY3QsIG5vdCAnICsgb2JqID09PSBudWxsID8gJ251bGwnIDogdHlwZW9mIG9ialxuICAgICk7XG4gIGVsc2UgaWYgKCEob2JqIGluc3RhbmNlb2YgVXJsKSkgcmV0dXJuIFVybC5wcm90b3R5cGUuZm9ybWF0LmNhbGwob2JqKTtcblxuICByZXR1cm4gb2JqLmZvcm1hdCgpO1xufVxuXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuVXJsLnByb3RvdHlwZS5mb3JtYXQgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBhdXRoID0gdGhpcy5hdXRoIHx8ICcnO1xuICBpZiAoYXV0aCkge1xuICAgIGF1dGggPSBlbmNvZGVBdXRoKGF1dGgpO1xuICAgIGF1dGggKz0gJ0AnO1xuICB9XG5cbiAgdmFyIHByb3RvY29sID0gdGhpcy5wcm90b2NvbCB8fCAnJztcbiAgdmFyIHBhdGhuYW1lID0gdGhpcy5wYXRobmFtZSB8fCAnJztcbiAgdmFyIGhhc2ggPSB0aGlzLmhhc2ggfHwgJyc7XG4gIHZhciBob3N0ID0gZmFsc2U7XG4gIHZhciBxdWVyeSA9ICcnO1xuXG4gIGlmICh0aGlzLmhvc3QpIHtcbiAgICBob3N0ID0gYXV0aCArIHRoaXMuaG9zdDtcbiAgfSBlbHNlIGlmICh0aGlzLmhvc3RuYW1lKSB7XG4gICAgaG9zdCA9IGF1dGggKyAodGhpcy5ob3N0bmFtZS5pbmRleE9mKCc6JykgPT09IC0xID8gdGhpcy5ob3N0bmFtZSA6ICdbJyArIHRoaXMuaG9zdG5hbWUgKyAnXScpO1xuICAgIGlmICh0aGlzLnBvcnQpIHtcbiAgICAgIGhvc3QgKz0gJzonICsgdGhpcy5wb3J0O1xuICAgIH1cbiAgfVxuXG4gIGlmICh0aGlzLnF1ZXJ5ICE9PSBudWxsICYmIHR5cGVvZiB0aGlzLnF1ZXJ5ID09PSAnb2JqZWN0JylcbiAgICBxdWVyeSA9IHF1ZXJ5c3RyaW5nLnN0cmluZ2lmeSh0aGlzLnF1ZXJ5KTtcblxuICB2YXIgc2VhcmNoID0gdGhpcy5zZWFyY2ggfHwgKHF1ZXJ5ICYmICc/JyArIHF1ZXJ5KSB8fCAnJztcblxuICBpZiAocHJvdG9jb2wgJiYgcHJvdG9jb2wuY2hhckNvZGVBdChwcm90b2NvbC5sZW5ndGggLSAxKSAhPT0gNTggLyo6Ki8pIHByb3RvY29sICs9ICc6JztcblxuICB2YXIgbmV3UGF0aG5hbWUgPSAnJztcbiAgdmFyIGxhc3RQb3MgPSAwO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHBhdGhuYW1lLmxlbmd0aDsgKytpKSB7XG4gICAgc3dpdGNoIChwYXRobmFtZS5jaGFyQ29kZUF0KGkpKSB7XG4gICAgICBjYXNlIDM1OiAvLyAnIydcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UGF0aG5hbWUgKz0gcGF0aG5hbWUuc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1BhdGhuYW1lICs9ICclMjMnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSA2MzogLy8gJz8nXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1BhdGhuYW1lICs9IHBhdGhuYW1lLnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdQYXRobmFtZSArPSAnJTNGJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICB9XG4gIH1cbiAgaWYgKGxhc3RQb3MgPiAwKSB7XG4gICAgaWYgKGxhc3RQb3MgIT09IHBhdGhuYW1lLmxlbmd0aCkgcGF0aG5hbWUgPSBuZXdQYXRobmFtZSArIHBhdGhuYW1lLnNsaWNlKGxhc3RQb3MpO1xuICAgIGVsc2UgcGF0aG5hbWUgPSBuZXdQYXRobmFtZTtcbiAgfVxuXG4gIC8vIG9ubHkgdGhlIHNsYXNoZWRQcm90b2NvbHMgZ2V0IHRoZSAvLy4gIE5vdCBtYWlsdG86LCB4bXBwOiwgZXRjLlxuICAvLyB1bmxlc3MgdGhleSBoYWQgdGhlbSB0byBiZWdpbiB3aXRoLlxuICBpZiAodGhpcy5zbGFzaGVzIHx8ICgoIXByb3RvY29sIHx8IHNsYXNoZWRQcm90b2NvbFtwcm90b2NvbF0pICYmIGhvc3QgIT09IGZhbHNlKSkge1xuICAgIGhvc3QgPSAnLy8nICsgKGhvc3QgfHwgJycpO1xuICAgIGlmIChwYXRobmFtZSAmJiBwYXRobmFtZS5jaGFyQ29kZUF0KDApICE9PSA0NyAvKi8qLykgcGF0aG5hbWUgPSAnLycgKyBwYXRobmFtZTtcbiAgfSBlbHNlIGlmICghaG9zdCkge1xuICAgIGhvc3QgPSAnJztcbiAgfVxuXG4gIHNlYXJjaCA9IHNlYXJjaC5yZXBsYWNlKCcjJywgJyUyMycpO1xuXG4gIGlmIChoYXNoICYmIGhhc2guY2hhckNvZGVBdCgwKSAhPT0gMzUgLyojKi8pIGhhc2ggPSAnIycgKyBoYXNoO1xuICBpZiAoc2VhcmNoICYmIHNlYXJjaC5jaGFyQ29kZUF0KDApICE9PSA2MyAvKj8qLykgc2VhcmNoID0gJz8nICsgc2VhcmNoO1xuXG4gIHJldHVybiBwcm90b2NvbCArIGhvc3QgKyBwYXRobmFtZSArIHNlYXJjaCArIGhhc2g7XG59O1xuXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuZnVuY3Rpb24gdXJsUmVzb2x2ZShzb3VyY2UsIHJlbGF0aXZlKSB7XG4gIHJldHVybiB1cmxQYXJzZShzb3VyY2UsIGZhbHNlLCB0cnVlKS5yZXNvbHZlKHJlbGF0aXZlKTtcbn1cblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cblVybC5wcm90b3R5cGUucmVzb2x2ZSA9IGZ1bmN0aW9uIChyZWxhdGl2ZSkge1xuICByZXR1cm4gdGhpcy5yZXNvbHZlT2JqZWN0KHVybFBhcnNlKHJlbGF0aXZlLCBmYWxzZSwgdHJ1ZSkpLmZvcm1hdCgpO1xufTtcblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cbmZ1bmN0aW9uIHVybFJlc29sdmVPYmplY3Qoc291cmNlLCByZWxhdGl2ZSkge1xuICBpZiAoIXNvdXJjZSkgcmV0dXJuIHJlbGF0aXZlO1xuICByZXR1cm4gdXJsUGFyc2Uoc291cmNlLCBmYWxzZSwgdHJ1ZSkucmVzb2x2ZU9iamVjdChyZWxhdGl2ZSk7XG59XG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5VcmwucHJvdG90eXBlLnJlc29sdmVPYmplY3QgPSBmdW5jdGlvbiAocmVsYXRpdmUpIHtcbiAgaWYgKHR5cGVvZiByZWxhdGl2ZSA9PT0gJ3N0cmluZycpIHtcbiAgICB2YXIgcmVsID0gbmV3IFVybCgpO1xuICAgIHJlbC5wYXJzZShyZWxhdGl2ZSwgZmFsc2UsIHRydWUpO1xuICAgIHJlbGF0aXZlID0gcmVsO1xuICB9XG5cbiAgdmFyIHJlc3VsdCA9IG5ldyBVcmwoKTtcbiAgdmFyIHRrZXlzID0gT2JqZWN0LmtleXModGhpcyk7XG4gIGZvciAodmFyIHRrID0gMDsgdGsgPCB0a2V5cy5sZW5ndGg7IHRrKyspIHtcbiAgICB2YXIgdGtleSA9IHRrZXlzW3RrXTtcbiAgICByZXN1bHRbdGtleV0gPSB0aGlzW3RrZXldO1xuICB9XG5cbiAgLy8gaGFzaCBpcyBhbHdheXMgb3ZlcnJpZGRlbiwgbm8gbWF0dGVyIHdoYXQuXG4gIC8vIGV2ZW4gaHJlZj1cIlwiIHdpbGwgcmVtb3ZlIGl0LlxuICByZXN1bHQuaGFzaCA9IHJlbGF0aXZlLmhhc2g7XG5cbiAgLy8gaWYgdGhlIHJlbGF0aXZlIHVybCBpcyBlbXB0eSwgdGhlbiB0aGVyZSdzIG5vdGhpbmcgbGVmdCB0byBkbyBoZXJlLlxuICBpZiAocmVsYXRpdmUuaHJlZiA9PT0gJycpIHtcbiAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gaHJlZnMgbGlrZSAvL2Zvby9iYXIgYWx3YXlzIGN1dCB0byB0aGUgcHJvdG9jb2wuXG4gIGlmIChyZWxhdGl2ZS5zbGFzaGVzICYmICFyZWxhdGl2ZS5wcm90b2NvbCkge1xuICAgIC8vIHRha2UgZXZlcnl0aGluZyBleGNlcHQgdGhlIHByb3RvY29sIGZyb20gcmVsYXRpdmVcbiAgICB2YXIgcmtleXMgPSBPYmplY3Qua2V5cyhyZWxhdGl2ZSk7XG4gICAgZm9yICh2YXIgcmsgPSAwOyByayA8IHJrZXlzLmxlbmd0aDsgcmsrKykge1xuICAgICAgdmFyIHJrZXkgPSBya2V5c1tya107XG4gICAgICBpZiAocmtleSAhPT0gJ3Byb3RvY29sJykgcmVzdWx0W3JrZXldID0gcmVsYXRpdmVbcmtleV07XG4gICAgfVxuXG4gICAgLy91cmxQYXJzZSBhcHBlbmRzIHRyYWlsaW5nIC8gdG8gdXJscyBsaWtlIGh0dHA6Ly93d3cuZXhhbXBsZS5jb21cbiAgICBpZiAoc2xhc2hlZFByb3RvY29sW3Jlc3VsdC5wcm90b2NvbF0gJiYgcmVzdWx0Lmhvc3RuYW1lICYmICFyZXN1bHQucGF0aG5hbWUpIHtcbiAgICAgIHJlc3VsdC5wYXRoID0gcmVzdWx0LnBhdGhuYW1lID0gJy8nO1xuICAgIH1cblxuICAgIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBpZiAocmVsYXRpdmUucHJvdG9jb2wgJiYgcmVsYXRpdmUucHJvdG9jb2wgIT09IHJlc3VsdC5wcm90b2NvbCkge1xuICAgIC8vIGlmIGl0J3MgYSBrbm93biB1cmwgcHJvdG9jb2wsIHRoZW4gY2hhbmdpbmdcbiAgICAvLyB0aGUgcHJvdG9jb2wgZG9lcyB3ZWlyZCB0aGluZ3NcbiAgICAvLyBmaXJzdCwgaWYgaXQncyBub3QgZmlsZTosIHRoZW4gd2UgTVVTVCBoYXZlIGEgaG9zdCxcbiAgICAvLyBhbmQgaWYgdGhlcmUgd2FzIGEgcGF0aFxuICAgIC8vIHRvIGJlZ2luIHdpdGgsIHRoZW4gd2UgTVVTVCBoYXZlIGEgcGF0aC5cbiAgICAvLyBpZiBpdCBpcyBmaWxlOiwgdGhlbiB0aGUgaG9zdCBpcyBkcm9wcGVkLFxuICAgIC8vIGJlY2F1c2UgdGhhdCdzIGtub3duIHRvIGJlIGhvc3RsZXNzLlxuICAgIC8vIGFueXRoaW5nIGVsc2UgaXMgYXNzdW1lZCB0byBiZSBhYnNvbHV0ZS5cbiAgICBpZiAoIXNsYXNoZWRQcm90b2NvbFtyZWxhdGl2ZS5wcm90b2NvbF0pIHtcbiAgICAgIHZhciBrZXlzID0gT2JqZWN0LmtleXMocmVsYXRpdmUpO1xuICAgICAgZm9yICh2YXIgdiA9IDA7IHYgPCBrZXlzLmxlbmd0aDsgdisrKSB7XG4gICAgICAgIHZhciBrID0ga2V5c1t2XTtcbiAgICAgICAgcmVzdWx0W2tdID0gcmVsYXRpdmVba107XG4gICAgICB9XG4gICAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgcmVzdWx0LnByb3RvY29sID0gcmVsYXRpdmUucHJvdG9jb2w7XG4gICAgaWYgKFxuICAgICAgIXJlbGF0aXZlLmhvc3QgJiZcbiAgICAgICEvXmZpbGU6PyQvLnRlc3QocmVsYXRpdmUucHJvdG9jb2wpICYmXG4gICAgICAhaG9zdGxlc3NQcm90b2NvbFtyZWxhdGl2ZS5wcm90b2NvbF1cbiAgICApIHtcbiAgICAgIGNvbnN0IHJlbFBhdGggPSAocmVsYXRpdmUucGF0aG5hbWUgfHwgJycpLnNwbGl0KCcvJyk7XG4gICAgICB3aGlsZSAocmVsUGF0aC5sZW5ndGggJiYgIShyZWxhdGl2ZS5ob3N0ID0gcmVsUGF0aC5zaGlmdCgpKSk7XG4gICAgICBpZiAoIXJlbGF0aXZlLmhvc3QpIHJlbGF0aXZlLmhvc3QgPSAnJztcbiAgICAgIGlmICghcmVsYXRpdmUuaG9zdG5hbWUpIHJlbGF0aXZlLmhvc3RuYW1lID0gJyc7XG4gICAgICBpZiAocmVsUGF0aFswXSAhPT0gJycpIHJlbFBhdGgudW5zaGlmdCgnJyk7XG4gICAgICBpZiAocmVsUGF0aC5sZW5ndGggPCAyKSByZWxQYXRoLnVuc2hpZnQoJycpO1xuICAgICAgcmVzdWx0LnBhdGhuYW1lID0gcmVsUGF0aC5qb2luKCcvJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc3VsdC5wYXRobmFtZSA9IHJlbGF0aXZlLnBhdGhuYW1lO1xuICAgIH1cbiAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgIHJlc3VsdC5xdWVyeSA9IHJlbGF0aXZlLnF1ZXJ5O1xuICAgIHJlc3VsdC5ob3N0ID0gcmVsYXRpdmUuaG9zdCB8fCAnJztcbiAgICByZXN1bHQuYXV0aCA9IHJlbGF0aXZlLmF1dGg7XG4gICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVsYXRpdmUuaG9zdG5hbWUgfHwgcmVsYXRpdmUuaG9zdDtcbiAgICByZXN1bHQucG9ydCA9IHJlbGF0aXZlLnBvcnQ7XG4gICAgLy8gdG8gc3VwcG9ydCBodHRwLnJlcXVlc3RcbiAgICBpZiAocmVzdWx0LnBhdGhuYW1lIHx8IHJlc3VsdC5zZWFyY2gpIHtcbiAgICAgIHZhciBwID0gcmVzdWx0LnBhdGhuYW1lIHx8ICcnO1xuICAgICAgdmFyIHMgPSByZXN1bHQuc2VhcmNoIHx8ICcnO1xuICAgICAgcmVzdWx0LnBhdGggPSBwICsgcztcbiAgICB9XG4gICAgcmVzdWx0LnNsYXNoZXMgPSByZXN1bHQuc2xhc2hlcyB8fCByZWxhdGl2ZS5zbGFzaGVzO1xuICAgIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICB2YXIgaXNTb3VyY2VBYnMgPSByZXN1bHQucGF0aG5hbWUgJiYgcmVzdWx0LnBhdGhuYW1lLmNoYXJBdCgwKSA9PT0gJy8nO1xuICB2YXIgaXNSZWxBYnMgPSByZWxhdGl2ZS5ob3N0IHx8IChyZWxhdGl2ZS5wYXRobmFtZSAmJiByZWxhdGl2ZS5wYXRobmFtZS5jaGFyQXQoMCkgPT09ICcvJyk7XG4gIHZhciBtdXN0RW5kQWJzID0gaXNSZWxBYnMgfHwgaXNTb3VyY2VBYnMgfHwgKHJlc3VsdC5ob3N0ICYmIHJlbGF0aXZlLnBhdGhuYW1lKTtcbiAgdmFyIHJlbW92ZUFsbERvdHMgPSBtdXN0RW5kQWJzO1xuICB2YXIgc3JjUGF0aCA9IChyZXN1bHQucGF0aG5hbWUgJiYgcmVzdWx0LnBhdGhuYW1lLnNwbGl0KCcvJykpIHx8IFtdO1xuICB2YXIgcmVsUGF0aCA9IChyZWxhdGl2ZS5wYXRobmFtZSAmJiByZWxhdGl2ZS5wYXRobmFtZS5zcGxpdCgnLycpKSB8fCBbXTtcbiAgdmFyIHBzeWNob3RpYyA9IHJlc3VsdC5wcm90b2NvbCAmJiAhc2xhc2hlZFByb3RvY29sW3Jlc3VsdC5wcm90b2NvbF07XG5cbiAgLy8gaWYgdGhlIHVybCBpcyBhIG5vbi1zbGFzaGVkIHVybCwgdGhlbiByZWxhdGl2ZVxuICAvLyBsaW5rcyBsaWtlIC4uLy4uIHNob3VsZCBiZSBhYmxlXG4gIC8vIHRvIGNyYXdsIHVwIHRvIHRoZSBob3N0bmFtZSwgYXMgd2VsbC4gIFRoaXMgaXMgc3RyYW5nZS5cbiAgLy8gcmVzdWx0LnByb3RvY29sIGhhcyBhbHJlYWR5IGJlZW4gc2V0IGJ5IG5vdy5cbiAgLy8gTGF0ZXIgb24sIHB1dCB0aGUgZmlyc3QgcGF0aCBwYXJ0IGludG8gdGhlIGhvc3QgZmllbGQuXG4gIGlmIChwc3ljaG90aWMpIHtcbiAgICByZXN1bHQuaG9zdG5hbWUgPSAnJztcbiAgICByZXN1bHQucG9ydCA9IG51bGw7XG4gICAgaWYgKHJlc3VsdC5ob3N0KSB7XG4gICAgICBpZiAoc3JjUGF0aFswXSA9PT0gJycpIHNyY1BhdGhbMF0gPSByZXN1bHQuaG9zdDtcbiAgICAgIGVsc2Ugc3JjUGF0aC51bnNoaWZ0KHJlc3VsdC5ob3N0KTtcbiAgICB9XG4gICAgcmVzdWx0Lmhvc3QgPSAnJztcbiAgICBpZiAocmVsYXRpdmUucHJvdG9jb2wpIHtcbiAgICAgIHJlbGF0aXZlLmhvc3RuYW1lID0gbnVsbDtcbiAgICAgIHJlbGF0aXZlLnBvcnQgPSBudWxsO1xuICAgICAgaWYgKHJlbGF0aXZlLmhvc3QpIHtcbiAgICAgICAgaWYgKHJlbFBhdGhbMF0gPT09ICcnKSByZWxQYXRoWzBdID0gcmVsYXRpdmUuaG9zdDtcbiAgICAgICAgZWxzZSByZWxQYXRoLnVuc2hpZnQocmVsYXRpdmUuaG9zdCk7XG4gICAgICB9XG4gICAgICByZWxhdGl2ZS5ob3N0ID0gbnVsbDtcbiAgICB9XG4gICAgbXVzdEVuZEFicyA9IG11c3RFbmRBYnMgJiYgKHJlbFBhdGhbMF0gPT09ICcnIHx8IHNyY1BhdGhbMF0gPT09ICcnKTtcbiAgfVxuXG4gIGlmIChpc1JlbEFicykge1xuICAgIC8vIGl0J3MgYWJzb2x1dGUuXG4gICAgcmVzdWx0Lmhvc3QgPSByZWxhdGl2ZS5ob3N0IHx8IHJlbGF0aXZlLmhvc3QgPT09ICcnID8gcmVsYXRpdmUuaG9zdCA6IHJlc3VsdC5ob3N0O1xuICAgIHJlc3VsdC5ob3N0bmFtZSA9XG4gICAgICByZWxhdGl2ZS5ob3N0bmFtZSB8fCByZWxhdGl2ZS5ob3N0bmFtZSA9PT0gJycgPyByZWxhdGl2ZS5ob3N0bmFtZSA6IHJlc3VsdC5ob3N0bmFtZTtcbiAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgIHJlc3VsdC5xdWVyeSA9IHJlbGF0aXZlLnF1ZXJ5O1xuICAgIHNyY1BhdGggPSByZWxQYXRoO1xuICAgIC8vIGZhbGwgdGhyb3VnaCB0byB0aGUgZG90LWhhbmRsaW5nIGJlbG93LlxuICB9IGVsc2UgaWYgKHJlbFBhdGgubGVuZ3RoKSB7XG4gICAgLy8gaXQncyByZWxhdGl2ZVxuICAgIC8vIHRocm93IGF3YXkgdGhlIGV4aXN0aW5nIGZpbGUsIGFuZCB0YWtlIHRoZSBuZXcgcGF0aCBpbnN0ZWFkLlxuICAgIGlmICghc3JjUGF0aCkgc3JjUGF0aCA9IFtdO1xuICAgIHNyY1BhdGgucG9wKCk7XG4gICAgc3JjUGF0aCA9IHNyY1BhdGguY29uY2F0KHJlbFBhdGgpO1xuICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgcmVzdWx0LnF1ZXJ5ID0gcmVsYXRpdmUucXVlcnk7XG4gIH0gZWxzZSBpZiAocmVsYXRpdmUuc2VhcmNoICE9PSBudWxsICYmIHJlbGF0aXZlLnNlYXJjaCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgLy8ganVzdCBwdWxsIG91dCB0aGUgc2VhcmNoLlxuICAgIC8vIGxpa2UgaHJlZj0nP2ZvbycuXG4gICAgLy8gUHV0IHRoaXMgYWZ0ZXIgdGhlIG90aGVyIHR3byBjYXNlcyBiZWNhdXNlIGl0IHNpbXBsaWZpZXMgdGhlIGJvb2xlYW5zXG4gICAgaWYgKHBzeWNob3RpYykge1xuICAgICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVzdWx0Lmhvc3QgPSBzcmNQYXRoLnNoaWZ0KCk7XG4gICAgICAvL29jY2FzaW9uYWxseSB0aGUgYXV0aCBjYW4gZ2V0IHN0dWNrIG9ubHkgaW4gaG9zdFxuICAgICAgLy90aGlzIGVzcGVjaWFsbHkgaGFwcGVucyBpbiBjYXNlcyBsaWtlXG4gICAgICAvL3VybC5yZXNvbHZlT2JqZWN0KCdtYWlsdG86bG9jYWwxQGRvbWFpbjEnLCAnbG9jYWwyQGRvbWFpbjInKVxuICAgICAgY29uc3QgYXV0aEluSG9zdCA9XG4gICAgICAgIHJlc3VsdC5ob3N0ICYmIHJlc3VsdC5ob3N0LmluZGV4T2YoJ0AnKSA+IDAgPyByZXN1bHQuaG9zdC5zcGxpdCgnQCcpIDogZmFsc2U7XG4gICAgICBpZiAoYXV0aEluSG9zdCkge1xuICAgICAgICByZXN1bHQuYXV0aCA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgICAgcmVzdWx0Lmhvc3QgPSByZXN1bHQuaG9zdG5hbWUgPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgICB9XG4gICAgfVxuICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgcmVzdWx0LnF1ZXJ5ID0gcmVsYXRpdmUucXVlcnk7XG4gICAgLy90byBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICAgIGlmIChyZXN1bHQucGF0aG5hbWUgIT09IG51bGwgfHwgcmVzdWx0LnNlYXJjaCAhPT0gbnVsbCkge1xuICAgICAgcmVzdWx0LnBhdGggPSAocmVzdWx0LnBhdGhuYW1lID8gcmVzdWx0LnBhdGhuYW1lIDogJycpICsgKHJlc3VsdC5zZWFyY2ggPyByZXN1bHQuc2VhcmNoIDogJycpO1xuICAgIH1cbiAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgaWYgKCFzcmNQYXRoLmxlbmd0aCkge1xuICAgIC8vIG5vIHBhdGggYXQgYWxsLiAgZWFzeS5cbiAgICAvLyB3ZSd2ZSBhbHJlYWR5IGhhbmRsZWQgdGhlIG90aGVyIHN0dWZmIGFib3ZlLlxuICAgIHJlc3VsdC5wYXRobmFtZSA9IG51bGw7XG4gICAgLy90byBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICAgIGlmIChyZXN1bHQuc2VhcmNoKSB7XG4gICAgICByZXN1bHQucGF0aCA9ICcvJyArIHJlc3VsdC5zZWFyY2g7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc3VsdC5wYXRoID0gbnVsbDtcbiAgICB9XG4gICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIGlmIGEgdXJsIEVORHMgaW4gLiBvciAuLiwgdGhlbiBpdCBtdXN0IGdldCBhIHRyYWlsaW5nIHNsYXNoLlxuICAvLyBob3dldmVyLCBpZiBpdCBlbmRzIGluIGFueXRoaW5nIGVsc2Ugbm9uLXNsYXNoeSxcbiAgLy8gdGhlbiBpdCBtdXN0IE5PVCBnZXQgYSB0cmFpbGluZyBzbGFzaC5cbiAgdmFyIGxhc3QgPSBzcmNQYXRoLnNsaWNlKC0xKVswXTtcbiAgdmFyIGhhc1RyYWlsaW5nU2xhc2ggPVxuICAgICgocmVzdWx0Lmhvc3QgfHwgcmVsYXRpdmUuaG9zdCB8fCBzcmNQYXRoLmxlbmd0aCA+IDEpICYmIChsYXN0ID09PSAnLicgfHwgbGFzdCA9PT0gJy4uJykpIHx8XG4gICAgbGFzdCA9PT0gJyc7XG5cbiAgLy8gc3RyaXAgc2luZ2xlIGRvdHMsIHJlc29sdmUgZG91YmxlIGRvdHMgdG8gcGFyZW50IGRpclxuICAvLyBpZiB0aGUgcGF0aCB0cmllcyB0byBnbyBhYm92ZSB0aGUgcm9vdCwgYHVwYCBlbmRzIHVwID4gMFxuICB2YXIgdXAgPSAwO1xuICBmb3IgKHZhciBpID0gc3JjUGF0aC5sZW5ndGg7IGkgPj0gMDsgaS0tKSB7XG4gICAgbGFzdCA9IHNyY1BhdGhbaV07XG4gICAgaWYgKGxhc3QgPT09ICcuJykge1xuICAgICAgc3BsaWNlT25lKHNyY1BhdGgsIGkpO1xuICAgIH0gZWxzZSBpZiAobGFzdCA9PT0gJy4uJykge1xuICAgICAgc3BsaWNlT25lKHNyY1BhdGgsIGkpO1xuICAgICAgdXArKztcbiAgICB9IGVsc2UgaWYgKHVwKSB7XG4gICAgICBzcGxpY2VPbmUoc3JjUGF0aCwgaSk7XG4gICAgICB1cC0tO1xuICAgIH1cbiAgfVxuXG4gIC8vIGlmIHRoZSBwYXRoIGlzIGFsbG93ZWQgdG8gZ28gYWJvdmUgdGhlIHJvb3QsIHJlc3RvcmUgbGVhZGluZyAuLnNcbiAgaWYgKCFtdXN0RW5kQWJzICYmICFyZW1vdmVBbGxEb3RzKSB7XG4gICAgZm9yICg7IHVwLS07IHVwKSB7XG4gICAgICBzcmNQYXRoLnVuc2hpZnQoJy4uJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKG11c3RFbmRBYnMgJiYgc3JjUGF0aFswXSAhPT0gJycgJiYgKCFzcmNQYXRoWzBdIHx8IHNyY1BhdGhbMF0uY2hhckF0KDApICE9PSAnLycpKSB7XG4gICAgc3JjUGF0aC51bnNoaWZ0KCcnKTtcbiAgfVxuXG4gIGlmIChoYXNUcmFpbGluZ1NsYXNoICYmIHNyY1BhdGguam9pbignLycpLnN1YnN0cigtMSkgIT09ICcvJykge1xuICAgIHNyY1BhdGgucHVzaCgnJyk7XG4gIH1cblxuICB2YXIgaXNBYnNvbHV0ZSA9IHNyY1BhdGhbMF0gPT09ICcnIHx8IChzcmNQYXRoWzBdICYmIHNyY1BhdGhbMF0uY2hhckF0KDApID09PSAnLycpO1xuXG4gIC8vIHB1dCB0aGUgaG9zdCBiYWNrXG4gIGlmIChwc3ljaG90aWMpIHtcbiAgICBpZiAoaXNBYnNvbHV0ZSkge1xuICAgICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVzdWx0Lmhvc3QgPSAnJztcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVzdWx0Lmhvc3QgPSBzcmNQYXRoLmxlbmd0aCA/IHNyY1BhdGguc2hpZnQoKSA6ICcnO1xuICAgIH1cbiAgICAvL29jY2FzaW9uYWxseSB0aGUgYXV0aCBjYW4gZ2V0IHN0dWNrIG9ubHkgaW4gaG9zdFxuICAgIC8vdGhpcyBlc3BlY2lhbGx5IGhhcHBlbnMgaW4gY2FzZXMgbGlrZVxuICAgIC8vdXJsLnJlc29sdmVPYmplY3QoJ21haWx0bzpsb2NhbDFAZG9tYWluMScsICdsb2NhbDJAZG9tYWluMicpXG4gICAgY29uc3QgYXV0aEluSG9zdCA9IHJlc3VsdC5ob3N0ICYmIHJlc3VsdC5ob3N0LmluZGV4T2YoJ0AnKSA+IDAgPyByZXN1bHQuaG9zdC5zcGxpdCgnQCcpIDogZmFsc2U7XG4gICAgaWYgKGF1dGhJbkhvc3QpIHtcbiAgICAgIHJlc3VsdC5hdXRoID0gYXV0aEluSG9zdC5zaGlmdCgpO1xuICAgICAgcmVzdWx0Lmhvc3QgPSByZXN1bHQuaG9zdG5hbWUgPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgfVxuICB9XG5cbiAgbXVzdEVuZEFicyA9IG11c3RFbmRBYnMgfHwgKHJlc3VsdC5ob3N0ICYmIHNyY1BhdGgubGVuZ3RoKTtcblxuICBpZiAobXVzdEVuZEFicyAmJiAhaXNBYnNvbHV0ZSkge1xuICAgIHNyY1BhdGgudW5zaGlmdCgnJyk7XG4gIH1cblxuICBpZiAoIXNyY1BhdGgubGVuZ3RoKSB7XG4gICAgcmVzdWx0LnBhdGhuYW1lID0gbnVsbDtcbiAgICByZXN1bHQucGF0aCA9IG51bGw7XG4gIH0gZWxzZSB7XG4gICAgcmVzdWx0LnBhdGhuYW1lID0gc3JjUGF0aC5qb2luKCcvJyk7XG4gIH1cblxuICAvL3RvIHN1cHBvcnQgcmVxdWVzdC5odHRwXG4gIGlmIChyZXN1bHQucGF0aG5hbWUgIT09IG51bGwgfHwgcmVzdWx0LnNlYXJjaCAhPT0gbnVsbCkge1xuICAgIHJlc3VsdC5wYXRoID0gKHJlc3VsdC5wYXRobmFtZSA/IHJlc3VsdC5wYXRobmFtZSA6ICcnKSArIChyZXN1bHQuc2VhcmNoID8gcmVzdWx0LnNlYXJjaCA6ICcnKTtcbiAgfVxuICByZXN1bHQuYXV0aCA9IHJlbGF0aXZlLmF1dGggfHwgcmVzdWx0LmF1dGg7XG4gIHJlc3VsdC5zbGFzaGVzID0gcmVzdWx0LnNsYXNoZXMgfHwgcmVsYXRpdmUuc2xhc2hlcztcbiAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuVXJsLnByb3RvdHlwZS5wYXJzZUhvc3QgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBob3N0ID0gdGhpcy5ob3N0O1xuICB2YXIgcG9ydCA9IHBvcnRQYXR0ZXJuLmV4ZWMoaG9zdCk7XG4gIGlmIChwb3J0KSB7XG4gICAgcG9ydCA9IHBvcnRbMF07XG4gICAgaWYgKHBvcnQgIT09ICc6Jykge1xuICAgICAgdGhpcy5wb3J0ID0gcG9ydC5zbGljZSgxKTtcbiAgICB9XG4gICAgaG9zdCA9IGhvc3Quc2xpY2UoMCwgaG9zdC5sZW5ndGggLSBwb3J0Lmxlbmd0aCk7XG4gIH1cbiAgaWYgKGhvc3QpIHRoaXMuaG9zdG5hbWUgPSBob3N0O1xufTtcblxuLy8gQWJvdXQgMS41eCBmYXN0ZXIgdGhhbiB0aGUgdHdvLWFyZyB2ZXJzaW9uIG9mIEFycmF5I3NwbGljZSgpLlxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cbmZ1bmN0aW9uIHNwbGljZU9uZShsaXN0LCBpbmRleCkge1xuICBmb3IgKHZhciBpID0gaW5kZXgsIGsgPSBpICsgMSwgbiA9IGxpc3QubGVuZ3RoOyBrIDwgbjsgaSArPSAxLCBrICs9IDEpIGxpc3RbaV0gPSBsaXN0W2tdO1xuICBsaXN0LnBvcCgpO1xufVxuXG52YXIgaGV4VGFibGUgPSBuZXcgQXJyYXkoMjU2KTtcbmZvciAodmFyIGkgPSAwOyBpIDwgMjU2OyArK2kpXG4gIGhleFRhYmxlW2ldID0gJyUnICsgKChpIDwgMTYgPyAnMCcgOiAnJykgKyBpLnRvU3RyaW5nKDE2KSkudG9VcHBlckNhc2UoKTtcbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5mdW5jdGlvbiBlbmNvZGVBdXRoKHN0cikge1xuICAvLyBmYXN0ZXIgZW5jb2RlVVJJQ29tcG9uZW50IGFsdGVybmF0aXZlIGZvciBlbmNvZGluZyBhdXRoIHVyaSBjb21wb25lbnRzXG4gIHZhciBvdXQgPSAnJztcbiAgdmFyIGxhc3RQb3MgPSAwO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7ICsraSkge1xuICAgIHZhciBjID0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAvLyBUaGVzZSBjaGFyYWN0ZXJzIGRvIG5vdCBuZWVkIGVzY2FwaW5nOlxuICAgIC8vICEgLSAuIF8gflxuICAgIC8vICcgKCApICogOlxuICAgIC8vIGRpZ2l0c1xuICAgIC8vIGFscGhhICh1cHBlcmNhc2UpXG4gICAgLy8gYWxwaGEgKGxvd2VyY2FzZSlcbiAgICBpZiAoXG4gICAgICBjID09PSAweDIxIHx8XG4gICAgICBjID09PSAweDJkIHx8XG4gICAgICBjID09PSAweDJlIHx8XG4gICAgICBjID09PSAweDVmIHx8XG4gICAgICBjID09PSAweDdlIHx8XG4gICAgICAoYyA+PSAweDI3ICYmIGMgPD0gMHgyYSkgfHxcbiAgICAgIChjID49IDB4MzAgJiYgYyA8PSAweDNhKSB8fFxuICAgICAgKGMgPj0gMHg0MSAmJiBjIDw9IDB4NWEpIHx8XG4gICAgICAoYyA+PSAweDYxICYmIGMgPD0gMHg3YSlcbiAgICApIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG91dCArPSBzdHIuc2xpY2UobGFzdFBvcywgaSk7XG5cbiAgICBsYXN0UG9zID0gaSArIDE7XG5cbiAgICAvLyBPdGhlciBBU0NJSSBjaGFyYWN0ZXJzXG4gICAgaWYgKGMgPCAweDgwKSB7XG4gICAgICBvdXQgKz0gaGV4VGFibGVbY107XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyBNdWx0aS1ieXRlIGNoYXJhY3RlcnMgLi4uXG4gICAgaWYgKGMgPCAweDgwMCkge1xuICAgICAgb3V0ICs9IGhleFRhYmxlWzB4YzAgfCAoYyA+PiA2KV0gKyBoZXhUYWJsZVsweDgwIHwgKGMgJiAweDNmKV07XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgaWYgKGMgPCAweGQ4MDAgfHwgYyA+PSAweGUwMDApIHtcbiAgICAgIG91dCArPVxuICAgICAgICBoZXhUYWJsZVsweGUwIHwgKGMgPj4gMTIpXSArXG4gICAgICAgIGhleFRhYmxlWzB4ODAgfCAoKGMgPj4gNikgJiAweDNmKV0gK1xuICAgICAgICBoZXhUYWJsZVsweDgwIHwgKGMgJiAweDNmKV07XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgLy8gU3Vycm9nYXRlIHBhaXJcbiAgICArK2k7XG4gICAgdmFyIGMyO1xuICAgIGlmIChpIDwgc3RyLmxlbmd0aCkgYzIgPSBzdHIuY2hhckNvZGVBdChpKSAmIDB4M2ZmO1xuICAgIGVsc2UgYzIgPSAwO1xuICAgIGMgPSAweDEwMDAwICsgKCgoYyAmIDB4M2ZmKSA8PCAxMCkgfCBjMik7XG4gICAgb3V0ICs9XG4gICAgICBoZXhUYWJsZVsweGYwIHwgKGMgPj4gMTgpXSArXG4gICAgICBoZXhUYWJsZVsweDgwIHwgKChjID4+IDEyKSAmIDB4M2YpXSArXG4gICAgICBoZXhUYWJsZVsweDgwIHwgKChjID4+IDYpICYgMHgzZildICtcbiAgICAgIGhleFRhYmxlWzB4ODAgfCAoYyAmIDB4M2YpXTtcbiAgfVxuICBpZiAobGFzdFBvcyA9PT0gMCkgcmV0dXJuIHN0cjtcbiAgaWYgKGxhc3RQb3MgPCBzdHIubGVuZ3RoKSByZXR1cm4gb3V0ICsgc3RyLnNsaWNlKGxhc3RQb3MpO1xuICByZXR1cm4gb3V0O1xufVxuIl19