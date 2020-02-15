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

const simplePathPattern = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/;
const hostnameMaxLen = 255; // protocols that can allow "unsafe" and "unwise" chars.

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
    }

    if (this.hostname.length > hostnameMaxLen) {
      this.hostname = '';
    } else {
      // hostnames are always lower case.
      this.hostname = this.hostname.toLowerCase();
    }

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
    && code <= 57 ||
    /*9*/
    code >= 97
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy92ZW5kb3IvbW9uZ29kYlVybC5qcyJdLCJuYW1lcyI6WyJwdW55Y29kZSIsInJlcXVpcmUiLCJleHBvcnRzIiwicGFyc2UiLCJ1cmxQYXJzZSIsInJlc29sdmUiLCJ1cmxSZXNvbHZlIiwicmVzb2x2ZU9iamVjdCIsInVybFJlc29sdmVPYmplY3QiLCJmb3JtYXQiLCJ1cmxGb3JtYXQiLCJVcmwiLCJwcm90b2NvbCIsInNsYXNoZXMiLCJhdXRoIiwiaG9zdCIsInBvcnQiLCJob3N0bmFtZSIsImhhc2giLCJzZWFyY2giLCJxdWVyeSIsInBhdGhuYW1lIiwicGF0aCIsImhyZWYiLCJwcm90b2NvbFBhdHRlcm4iLCJwb3J0UGF0dGVybiIsInNpbXBsZVBhdGhQYXR0ZXJuIiwiaG9zdG5hbWVNYXhMZW4iLCJ1bnNhZmVQcm90b2NvbCIsImphdmFzY3JpcHQiLCJob3N0bGVzc1Byb3RvY29sIiwic2xhc2hlZFByb3RvY29sIiwiaHR0cCIsImh0dHBzIiwiZnRwIiwiZ29waGVyIiwiZmlsZSIsInF1ZXJ5c3RyaW5nIiwidXJsIiwicGFyc2VRdWVyeVN0cmluZyIsInNsYXNoZXNEZW5vdGVIb3N0IiwidSIsInByb3RvdHlwZSIsIlR5cGVFcnJvciIsImhhc0hhc2giLCJzdGFydCIsImVuZCIsInJlc3QiLCJsYXN0UG9zIiwiaSIsImluV3MiLCJzcGxpdCIsImxlbmd0aCIsImNvZGUiLCJjaGFyQ29kZUF0IiwiaXNXcyIsInNsaWNlIiwic2ltcGxlUGF0aCIsImV4ZWMiLCJwcm90byIsImxvd2VyUHJvdG8iLCJ0b0xvd2VyQ2FzZSIsInRlc3QiLCJob3N0RW5kIiwiYXRTaWduIiwibm9uSG9zdCIsImRlY29kZVVSSUNvbXBvbmVudCIsInBhcnNlSG9zdCIsImlwdjZIb3N0bmFtZSIsInJlc3VsdCIsInZhbGlkYXRlSG9zdG5hbWUiLCJ1bmRlZmluZWQiLCJ0b0FTQ0lJIiwicCIsImgiLCJhdXRvRXNjYXBlU3RyIiwicXVlc3Rpb25JZHgiLCJoYXNoSWR4IiwiZmlyc3RJZHgiLCJzIiwic2VsZiIsIm5ld1Jlc3QiLCJvYmoiLCJjYWxsIiwiZW5jb2RlQXV0aCIsImluZGV4T2YiLCJzdHJpbmdpZnkiLCJuZXdQYXRobmFtZSIsInJlcGxhY2UiLCJzb3VyY2UiLCJyZWxhdGl2ZSIsInJlbCIsInRrZXlzIiwiT2JqZWN0Iiwia2V5cyIsInRrIiwidGtleSIsInJrZXlzIiwicmsiLCJya2V5IiwidiIsImsiLCJyZWxQYXRoIiwic2hpZnQiLCJ1bnNoaWZ0Iiwiam9pbiIsImlzU291cmNlQWJzIiwiY2hhckF0IiwiaXNSZWxBYnMiLCJtdXN0RW5kQWJzIiwicmVtb3ZlQWxsRG90cyIsInNyY1BhdGgiLCJwc3ljaG90aWMiLCJwb3AiLCJjb25jYXQiLCJhdXRoSW5Ib3N0IiwibGFzdCIsImhhc1RyYWlsaW5nU2xhc2giLCJ1cCIsInNwbGljZU9uZSIsInN1YnN0ciIsInB1c2giLCJpc0Fic29sdXRlIiwibGlzdCIsImluZGV4IiwibiIsImhleFRhYmxlIiwiQXJyYXkiLCJ0b1N0cmluZyIsInRvVXBwZXJDYXNlIiwic3RyIiwib3V0IiwiYyIsImMyIl0sIm1hcHBpbmdzIjoiQUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7O0FBRUEsTUFBTUEsUUFBUSxHQUFHQyxPQUFPLENBQUMsVUFBRCxDQUF4Qjs7QUFFQUMsT0FBTyxDQUFDQyxLQUFSLEdBQWdCQyxRQUFoQjtBQUNBRixPQUFPLENBQUNHLE9BQVIsR0FBa0JDLFVBQWxCO0FBQ0FKLE9BQU8sQ0FBQ0ssYUFBUixHQUF3QkMsZ0JBQXhCO0FBQ0FOLE9BQU8sQ0FBQ08sTUFBUixHQUFpQkMsU0FBakI7QUFFQVIsT0FBTyxDQUFDUyxHQUFSLEdBQWNBLEdBQWQ7O0FBRUEsU0FBU0EsR0FBVCxHQUFlO0FBQ2IsT0FBS0MsUUFBTCxHQUFnQixJQUFoQjtBQUNBLE9BQUtDLE9BQUwsR0FBZSxJQUFmO0FBQ0EsT0FBS0MsSUFBTCxHQUFZLElBQVo7QUFDQSxPQUFLQyxJQUFMLEdBQVksSUFBWjtBQUNBLE9BQUtDLElBQUwsR0FBWSxJQUFaO0FBQ0EsT0FBS0MsUUFBTCxHQUFnQixJQUFoQjtBQUNBLE9BQUtDLElBQUwsR0FBWSxJQUFaO0FBQ0EsT0FBS0MsTUFBTCxHQUFjLElBQWQ7QUFDQSxPQUFLQyxLQUFMLEdBQWEsSUFBYjtBQUNBLE9BQUtDLFFBQUwsR0FBZ0IsSUFBaEI7QUFDQSxPQUFLQyxJQUFMLEdBQVksSUFBWjtBQUNBLE9BQUtDLElBQUwsR0FBWSxJQUFaO0FBQ0QsQyxDQUVEO0FBRUE7QUFDQTs7O0FBQ0EsTUFBTUMsZUFBZSxHQUFHLG1CQUF4QjtBQUNBLE1BQU1DLFdBQVcsR0FBRyxVQUFwQixDLENBRUE7O0FBQ0EsTUFBTUMsaUJBQWlCLEdBQUcsb0NBQTFCO0FBRUEsTUFBTUMsY0FBYyxHQUFHLEdBQXZCLEMsQ0FDQTs7QUFDQSxNQUFNQyxjQUFjLEdBQUc7QUFDckJDLEVBQUFBLFVBQVUsRUFBRSxJQURTO0FBRXJCLGlCQUFlO0FBRk0sQ0FBdkIsQyxDQUlBOztBQUNBLE1BQU1DLGdCQUFnQixHQUFHO0FBQ3ZCRCxFQUFBQSxVQUFVLEVBQUUsSUFEVztBQUV2QixpQkFBZTtBQUZRLENBQXpCLEMsQ0FJQTs7QUFDQSxNQUFNRSxlQUFlLEdBQUc7QUFDdEJDLEVBQUFBLElBQUksRUFBRSxJQURnQjtBQUV0QixXQUFTLElBRmE7QUFHdEJDLEVBQUFBLEtBQUssRUFBRSxJQUhlO0FBSXRCLFlBQVUsSUFKWTtBQUt0QkMsRUFBQUEsR0FBRyxFQUFFLElBTGlCO0FBTXRCLFVBQVEsSUFOYztBQU90QkMsRUFBQUEsTUFBTSxFQUFFLElBUGM7QUFRdEIsYUFBVyxJQVJXO0FBU3RCQyxFQUFBQSxJQUFJLEVBQUUsSUFUZ0I7QUFVdEIsV0FBUztBQVZhLENBQXhCOztBQVlBLE1BQU1DLFdBQVcsR0FBR3BDLE9BQU8sQ0FBQyxhQUFELENBQTNCO0FBRUE7OztBQUNBLFNBQVNHLFFBQVQsQ0FBa0JrQyxHQUFsQixFQUF1QkMsZ0JBQXZCLEVBQXlDQyxpQkFBekMsRUFBNEQ7QUFDMUQsTUFBSUYsR0FBRyxZQUFZM0IsR0FBbkIsRUFBd0IsT0FBTzJCLEdBQVA7QUFFeEIsTUFBSUcsQ0FBQyxHQUFHLElBQUk5QixHQUFKLEVBQVI7QUFDQThCLEVBQUFBLENBQUMsQ0FBQ3RDLEtBQUYsQ0FBUW1DLEdBQVIsRUFBYUMsZ0JBQWIsRUFBK0JDLGlCQUEvQjtBQUNBLFNBQU9DLENBQVA7QUFDRDtBQUVEOzs7QUFDQTlCLEdBQUcsQ0FBQytCLFNBQUosQ0FBY3ZDLEtBQWQsR0FBc0IsVUFBU21DLEdBQVQsRUFBY0MsZ0JBQWQsRUFBZ0NDLGlCQUFoQyxFQUFtRDtBQUN2RSxNQUFJLE9BQU9GLEdBQVAsS0FBZSxRQUFuQixFQUE2QjtBQUMzQixVQUFNLElBQUlLLFNBQUosQ0FBYywyQ0FBMkMsT0FBT0wsR0FBaEUsQ0FBTjtBQUNELEdBSHNFLENBS3ZFO0FBQ0E7QUFDQTs7O0FBQ0EsTUFBSU0sT0FBTyxHQUFHLEtBQWQ7QUFDQSxNQUFJQyxLQUFLLEdBQUcsQ0FBQyxDQUFiO0FBQ0EsTUFBSUMsR0FBRyxHQUFHLENBQUMsQ0FBWDtBQUNBLE1BQUlDLElBQUksR0FBRyxFQUFYO0FBQ0EsTUFBSUMsT0FBTyxHQUFHLENBQWQ7QUFDQSxNQUFJQyxDQUFDLEdBQUcsQ0FBUjs7QUFDQSxPQUFLLElBQUlDLElBQUksR0FBRyxLQUFYLEVBQWtCQyxLQUFLLEdBQUcsS0FBL0IsRUFBc0NGLENBQUMsR0FBR1gsR0FBRyxDQUFDYyxNQUE5QyxFQUFzRCxFQUFFSCxDQUF4RCxFQUEyRDtBQUN6RCxVQUFNSSxJQUFJLEdBQUdmLEdBQUcsQ0FBQ2dCLFVBQUosQ0FBZUwsQ0FBZixDQUFiLENBRHlELENBR3pEOztBQUNBLFVBQU1NLElBQUksR0FDUkYsSUFBSSxLQUFLO0FBQUc7QUFBWixPQUNBQSxJQUFJLEtBQUs7QUFBRTtBQURYLE9BRUFBLElBQUksS0FBSztBQUFHO0FBRlosT0FHQUEsSUFBSSxLQUFLO0FBQUc7QUFIWixPQUlBQSxJQUFJLEtBQUs7QUFBRztBQUpaLE9BS0FBLElBQUksS0FBSztBQUFJO0FBTGIsT0FNQUEsSUFBSSxLQUFLLEtBUFg7QUFPa0I7O0FBQ2xCLFFBQUlSLEtBQUssS0FBSyxDQUFDLENBQWYsRUFBa0I7QUFDaEIsVUFBSVUsSUFBSixFQUFVO0FBQ1ZQLE1BQUFBLE9BQU8sR0FBR0gsS0FBSyxHQUFHSSxDQUFsQjtBQUNELEtBSEQsTUFHTztBQUNMLFVBQUlDLElBQUosRUFBVTtBQUNSLFlBQUksQ0FBQ0ssSUFBTCxFQUFXO0FBQ1RULFVBQUFBLEdBQUcsR0FBRyxDQUFDLENBQVA7QUFDQUksVUFBQUEsSUFBSSxHQUFHLEtBQVA7QUFDRDtBQUNGLE9BTEQsTUFLTyxJQUFJSyxJQUFKLEVBQVU7QUFDZlQsUUFBQUEsR0FBRyxHQUFHRyxDQUFOO0FBQ0FDLFFBQUFBLElBQUksR0FBRyxJQUFQO0FBQ0Q7QUFDRixLQXpCd0QsQ0EyQnpEOzs7QUFDQSxRQUFJLENBQUNDLEtBQUwsRUFBWTtBQUNWLGNBQVFFLElBQVI7QUFDRSxhQUFLLEVBQUw7QUFBUztBQUNQVCxVQUFBQSxPQUFPLEdBQUcsSUFBVjtBQUNGOztBQUNBLGFBQUssRUFBTDtBQUFTO0FBQ1BPLFVBQUFBLEtBQUssR0FBRyxJQUFSO0FBQ0E7O0FBQ0YsYUFBSyxFQUFMO0FBQVM7QUFDUCxjQUFJRixDQUFDLEdBQUdELE9BQUosR0FBYyxDQUFsQixFQUFxQkQsSUFBSSxJQUFJVCxHQUFHLENBQUNrQixLQUFKLENBQVVSLE9BQVYsRUFBbUJDLENBQW5CLENBQVI7QUFDckJGLFVBQUFBLElBQUksSUFBSSxHQUFSO0FBQ0FDLFVBQUFBLE9BQU8sR0FBR0MsQ0FBQyxHQUFHLENBQWQ7QUFDQTtBQVhKO0FBYUQsS0FkRCxNQWNPLElBQUksQ0FBQ0wsT0FBRCxJQUFZUyxJQUFJLEtBQUs7QUFBRztBQUE1QixNQUFtQztBQUN4Q1QsUUFBQUEsT0FBTyxHQUFHLElBQVY7QUFDRDtBQUNGLEdBM0RzRSxDQTZEdkU7OztBQUNBLE1BQUlDLEtBQUssS0FBSyxDQUFDLENBQWYsRUFBa0I7QUFDaEIsUUFBSUcsT0FBTyxLQUFLSCxLQUFoQixFQUF1QjtBQUNyQjtBQUVBLFVBQUlDLEdBQUcsS0FBSyxDQUFDLENBQWIsRUFBZ0I7QUFDZCxZQUFJRCxLQUFLLEtBQUssQ0FBZCxFQUFpQkUsSUFBSSxHQUFHVCxHQUFQLENBQWpCLEtBQ0tTLElBQUksR0FBR1QsR0FBRyxDQUFDa0IsS0FBSixDQUFVWCxLQUFWLENBQVA7QUFDTixPQUhELE1BR087QUFDTEUsUUFBQUEsSUFBSSxHQUFHVCxHQUFHLENBQUNrQixLQUFKLENBQVVYLEtBQVYsRUFBaUJDLEdBQWpCLENBQVA7QUFDRDtBQUNGLEtBVEQsTUFTTyxJQUFJQSxHQUFHLEtBQUssQ0FBQyxDQUFULElBQWNFLE9BQU8sR0FBR1YsR0FBRyxDQUFDYyxNQUFoQyxFQUF3QztBQUM3QztBQUNBTCxNQUFBQSxJQUFJLElBQUlULEdBQUcsQ0FBQ2tCLEtBQUosQ0FBVVIsT0FBVixDQUFSO0FBQ0QsS0FITSxNQUdBLElBQUlGLEdBQUcsS0FBSyxDQUFDLENBQVQsSUFBY0UsT0FBTyxHQUFHRixHQUE1QixFQUFpQztBQUN0QztBQUNBQyxNQUFBQSxJQUFJLElBQUlULEdBQUcsQ0FBQ2tCLEtBQUosQ0FBVVIsT0FBVixFQUFtQkYsR0FBbkIsQ0FBUjtBQUNEO0FBQ0Y7O0FBRUQsTUFBSSxDQUFDTixpQkFBRCxJQUFzQixDQUFDSSxPQUEzQixFQUFvQztBQUNsQztBQUNBLFVBQU1hLFVBQVUsR0FBRy9CLGlCQUFpQixDQUFDZ0MsSUFBbEIsQ0FBdUJYLElBQXZCLENBQW5COztBQUNBLFFBQUlVLFVBQUosRUFBZ0I7QUFDZCxXQUFLbkMsSUFBTCxHQUFZeUIsSUFBWjtBQUNBLFdBQUt4QixJQUFMLEdBQVl3QixJQUFaO0FBQ0EsV0FBSzFCLFFBQUwsR0FBZ0JvQyxVQUFVLENBQUMsQ0FBRCxDQUExQjs7QUFDQSxVQUFJQSxVQUFVLENBQUMsQ0FBRCxDQUFkLEVBQW1CO0FBQ2pCLGFBQUt0QyxNQUFMLEdBQWNzQyxVQUFVLENBQUMsQ0FBRCxDQUF4Qjs7QUFDQSxZQUFJbEIsZ0JBQUosRUFBc0I7QUFDcEIsZUFBS25CLEtBQUwsR0FBYWlCLFdBQVcsQ0FBQ2xDLEtBQVosQ0FBa0IsS0FBS2dCLE1BQUwsQ0FBWXFDLEtBQVosQ0FBa0IsQ0FBbEIsQ0FBbEIsQ0FBYjtBQUNELFNBRkQsTUFFTztBQUNMLGVBQUtwQyxLQUFMLEdBQWEsS0FBS0QsTUFBTCxDQUFZcUMsS0FBWixDQUFrQixDQUFsQixDQUFiO0FBQ0Q7QUFDRixPQVBELE1BT08sSUFBSWpCLGdCQUFKLEVBQXNCO0FBQzNCLGFBQUtwQixNQUFMLEdBQWMsRUFBZDtBQUNBLGFBQUtDLEtBQUwsR0FBYSxFQUFiO0FBQ0Q7O0FBQ0QsYUFBTyxJQUFQO0FBQ0Q7QUFDRjs7QUFFRCxNQUFJdUMsS0FBSyxHQUFHbkMsZUFBZSxDQUFDa0MsSUFBaEIsQ0FBcUJYLElBQXJCLENBQVo7O0FBQ0EsTUFBSVksS0FBSixFQUFXO0FBQ1RBLElBQUFBLEtBQUssR0FBR0EsS0FBSyxDQUFDLENBQUQsQ0FBYjtBQUNBLFFBQUlDLFVBQVUsR0FBR0QsS0FBSyxDQUFDRSxXQUFOLEVBQWpCO0FBQ0EsU0FBS2pELFFBQUwsR0FBZ0JnRCxVQUFoQjtBQUNBYixJQUFBQSxJQUFJLEdBQUdBLElBQUksQ0FBQ1MsS0FBTCxDQUFXRyxLQUFLLENBQUNQLE1BQWpCLENBQVA7QUFDRCxHQTdHc0UsQ0ErR3ZFO0FBQ0E7QUFDQTtBQUNBOzs7QUFDQSxNQUFJWixpQkFBaUIsSUFBSW1CLEtBQXJCLElBQThCLHVCQUF1QkcsSUFBdkIsQ0FBNEJmLElBQTVCLENBQWxDLEVBQXFFO0FBQ25FLFFBQUlsQyxPQUFPLEdBQ1RrQyxJQUFJLENBQUNPLFVBQUwsQ0FBZ0IsQ0FBaEIsTUFBdUI7QUFBRztBQUExQixPQUFtQ1AsSUFBSSxDQUFDTyxVQUFMLENBQWdCLENBQWhCLE1BQXVCLEVBRDVEO0FBQ2dFOztBQUNoRSxRQUFJekMsT0FBTyxJQUFJLEVBQUU4QyxLQUFLLElBQUk3QixnQkFBZ0IsQ0FBQzZCLEtBQUQsQ0FBM0IsQ0FBZixFQUFvRDtBQUNsRFosTUFBQUEsSUFBSSxHQUFHQSxJQUFJLENBQUNTLEtBQUwsQ0FBVyxDQUFYLENBQVA7QUFDQSxXQUFLM0MsT0FBTCxHQUFlLElBQWY7QUFDRDtBQUNGOztBQUVELE1BQ0UsQ0FBQ2lCLGdCQUFnQixDQUFDNkIsS0FBRCxDQUFqQixLQUNDOUMsT0FBTyxJQUFLOEMsS0FBSyxJQUFJLENBQUM1QixlQUFlLENBQUM0QixLQUFELENBRHRDLENBREYsRUFHRTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBRUEsUUFBSUksT0FBTyxHQUFHLENBQUMsQ0FBZjtBQUNBLFFBQUlDLE1BQU0sR0FBRyxDQUFDLENBQWQ7QUFDQSxRQUFJQyxPQUFPLEdBQUcsQ0FBQyxDQUFmOztBQUNBLFNBQUtoQixDQUFDLEdBQUcsQ0FBVCxFQUFZQSxDQUFDLEdBQUdGLElBQUksQ0FBQ0ssTUFBckIsRUFBNkIsRUFBRUgsQ0FBL0IsRUFBa0M7QUFDaEMsY0FBUUYsSUFBSSxDQUFDTyxVQUFMLENBQWdCTCxDQUFoQixDQUFSO0FBQ0UsYUFBSyxDQUFMLENBREYsQ0FDVTs7QUFDUixhQUFLLEVBQUwsQ0FGRixDQUVXOztBQUNULGFBQUssRUFBTCxDQUhGLENBR1c7O0FBQ1QsYUFBSyxFQUFMLENBSkYsQ0FJVzs7QUFDVCxhQUFLLEVBQUwsQ0FMRixDQUtXOztBQUNULGFBQUssRUFBTCxDQU5GLENBTVc7O0FBQ1QsYUFBSyxFQUFMLENBUEYsQ0FPVzs7QUFDVCxhQUFLLEVBQUwsQ0FSRixDQVFXOztBQUNULGFBQUssRUFBTCxDQVRGLENBU1c7O0FBQ1QsYUFBSyxFQUFMLENBVkYsQ0FVVzs7QUFDVCxhQUFLLEVBQUwsQ0FYRixDQVdXOztBQUNULGFBQUssRUFBTCxDQVpGLENBWVc7O0FBQ1QsYUFBSyxFQUFMLENBYkYsQ0FhVzs7QUFDVCxhQUFLLEdBQUwsQ0FkRixDQWNZOztBQUNWLGFBQUssR0FBTCxDQWZGLENBZVk7O0FBQ1YsYUFBSyxHQUFMO0FBQVU7QUFDUjtBQUNBLGNBQUlnQixPQUFPLEtBQUssQ0FBQyxDQUFqQixFQUFvQkEsT0FBTyxHQUFHaEIsQ0FBVjtBQUNwQjs7QUFDRixhQUFLLEVBQUwsQ0FwQkYsQ0FvQlc7O0FBQ1QsYUFBSyxFQUFMLENBckJGLENBcUJXOztBQUNULGFBQUssRUFBTDtBQUFTO0FBQ1A7QUFDQSxjQUFJZ0IsT0FBTyxLQUFLLENBQUMsQ0FBakIsRUFBb0JBLE9BQU8sR0FBR2hCLENBQVY7QUFDcEJjLFVBQUFBLE9BQU8sR0FBR2QsQ0FBVjtBQUNBOztBQUNGLGFBQUssRUFBTDtBQUFTO0FBQ1A7QUFDQTtBQUNBZSxVQUFBQSxNQUFNLEdBQUdmLENBQVQ7QUFDQWdCLFVBQUFBLE9BQU8sR0FBRyxDQUFDLENBQVg7QUFDQTtBQWhDSjs7QUFrQ0EsVUFBSUYsT0FBTyxLQUFLLENBQUMsQ0FBakIsRUFBb0I7QUFDckI7O0FBQ0RsQixJQUFBQSxLQUFLLEdBQUcsQ0FBUjs7QUFDQSxRQUFJbUIsTUFBTSxLQUFLLENBQUMsQ0FBaEIsRUFBbUI7QUFDakIsV0FBS2xELElBQUwsR0FBWW9ELGtCQUFrQixDQUFDbkIsSUFBSSxDQUFDUyxLQUFMLENBQVcsQ0FBWCxFQUFjUSxNQUFkLENBQUQsQ0FBOUI7QUFDQW5CLE1BQUFBLEtBQUssR0FBR21CLE1BQU0sR0FBRyxDQUFqQjtBQUNEOztBQUNELFFBQUlDLE9BQU8sS0FBSyxDQUFDLENBQWpCLEVBQW9CO0FBQ2xCLFdBQUtsRCxJQUFMLEdBQVlnQyxJQUFJLENBQUNTLEtBQUwsQ0FBV1gsS0FBWCxDQUFaO0FBQ0FFLE1BQUFBLElBQUksR0FBRyxFQUFQO0FBQ0QsS0FIRCxNQUdPO0FBQ0wsV0FBS2hDLElBQUwsR0FBWWdDLElBQUksQ0FBQ1MsS0FBTCxDQUFXWCxLQUFYLEVBQWtCb0IsT0FBbEIsQ0FBWjtBQUNBbEIsTUFBQUEsSUFBSSxHQUFHQSxJQUFJLENBQUNTLEtBQUwsQ0FBV1MsT0FBWCxDQUFQO0FBQ0QsS0FuRUQsQ0FxRUE7OztBQUNBLFNBQUtFLFNBQUwsR0F0RUEsQ0F3RUE7QUFDQTs7QUFDQSxRQUFJLE9BQU8sS0FBS2xELFFBQVosS0FBeUIsUUFBN0IsRUFBdUMsS0FBS0EsUUFBTCxHQUFnQixFQUFoQjtBQUV2QyxRQUFJQSxRQUFRLEdBQUcsS0FBS0EsUUFBcEIsQ0E1RUEsQ0E4RUE7QUFDQTs7QUFDQSxRQUFJbUQsWUFBWSxHQUNkbkQsUUFBUSxDQUFDcUMsVUFBVCxDQUFvQixDQUFwQixNQUEyQjtBQUFHO0FBQTlCLE9BQ0FyQyxRQUFRLENBQUNxQyxVQUFULENBQW9CckMsUUFBUSxDQUFDbUMsTUFBVCxHQUFrQixDQUF0QyxNQUE2QyxFQUYvQztBQUVtRDtBQUVuRDs7QUFDQSxRQUFJLENBQUNnQixZQUFMLEVBQW1CO0FBQ2pCLFlBQU1DLE1BQU0sR0FBR0MsZ0JBQWdCLENBQUMsSUFBRCxFQUFPdkIsSUFBUCxFQUFhOUIsUUFBYixDQUEvQjtBQUNBLFVBQUlvRCxNQUFNLEtBQUtFLFNBQWYsRUFBMEJ4QixJQUFJLEdBQUdzQixNQUFQO0FBQzNCOztBQUVELFFBQUksS0FBS3BELFFBQUwsQ0FBY21DLE1BQWQsR0FBdUJ6QixjQUEzQixFQUEyQztBQUN6QyxXQUFLVixRQUFMLEdBQWdCLEVBQWhCO0FBQ0QsS0FGRCxNQUVPO0FBQ0w7QUFDQSxXQUFLQSxRQUFMLEdBQWdCLEtBQUtBLFFBQUwsQ0FBYzRDLFdBQWQsRUFBaEI7QUFDRDs7QUFFRCxRQUFJLENBQUNPLFlBQUwsRUFBbUI7QUFDakI7QUFDQTtBQUNBO0FBQ0E7QUFDQSxXQUFLbkQsUUFBTCxHQUFnQmpCLFFBQVEsQ0FBQ3dFLE9BQVQsQ0FBaUIsS0FBS3ZELFFBQXRCLENBQWhCO0FBQ0Q7O0FBRUQsUUFBSXdELENBQUMsR0FBRyxLQUFLekQsSUFBTCxHQUFZLE1BQU0sS0FBS0EsSUFBdkIsR0FBOEIsRUFBdEM7QUFDQSxRQUFJMEQsQ0FBQyxHQUFHLEtBQUt6RCxRQUFMLElBQWlCLEVBQXpCO0FBQ0EsU0FBS0YsSUFBTCxHQUFZMkQsQ0FBQyxHQUFHRCxDQUFoQixDQTNHQSxDQTZHQTtBQUNBOztBQUNBLFFBQUlMLFlBQUosRUFBa0I7QUFDaEIsV0FBS25ELFFBQUwsR0FBZ0IsS0FBS0EsUUFBTCxDQUFjdUMsS0FBZCxDQUFvQixDQUFwQixFQUF1QixDQUFDLENBQXhCLENBQWhCOztBQUNBLFVBQUlULElBQUksQ0FBQyxDQUFELENBQUosS0FBWSxHQUFoQixFQUFxQjtBQUNuQkEsUUFBQUEsSUFBSSxHQUFHLE1BQU1BLElBQWI7QUFDRDtBQUNGO0FBQ0YsR0FwUHNFLENBc1B2RTtBQUNBOzs7QUFDQSxNQUFJLENBQUNuQixjQUFjLENBQUNnQyxVQUFELENBQW5CLEVBQWlDO0FBQy9CO0FBQ0E7QUFDQTtBQUNBLFVBQU1TLE1BQU0sR0FBR00sYUFBYSxDQUFDNUIsSUFBRCxDQUE1QjtBQUNBLFFBQUlzQixNQUFNLEtBQUtFLFNBQWYsRUFBMEJ4QixJQUFJLEdBQUdzQixNQUFQO0FBQzNCOztBQUVELE1BQUlPLFdBQVcsR0FBRyxDQUFDLENBQW5CO0FBQ0EsTUFBSUMsT0FBTyxHQUFHLENBQUMsQ0FBZjs7QUFDQSxPQUFLNUIsQ0FBQyxHQUFHLENBQVQsRUFBWUEsQ0FBQyxHQUFHRixJQUFJLENBQUNLLE1BQXJCLEVBQTZCLEVBQUVILENBQS9CLEVBQWtDO0FBQ2hDLFVBQU1JLElBQUksR0FBR04sSUFBSSxDQUFDTyxVQUFMLENBQWdCTCxDQUFoQixDQUFiOztBQUNBLFFBQUlJLElBQUksS0FBSztBQUFHO0FBQWhCLE1BQXVCO0FBQ3JCLGFBQUtuQyxJQUFMLEdBQVk2QixJQUFJLENBQUNTLEtBQUwsQ0FBV1AsQ0FBWCxDQUFaO0FBQ0E0QixRQUFBQSxPQUFPLEdBQUc1QixDQUFWO0FBQ0E7QUFDRCxPQUpELE1BSU8sSUFBSUksSUFBSSxLQUFLO0FBQUc7QUFBWixPQUFxQnVCLFdBQVcsS0FBSyxDQUFDLENBQTFDLEVBQTZDO0FBQ2xEQSxNQUFBQSxXQUFXLEdBQUczQixDQUFkO0FBQ0Q7QUFDRjs7QUFFRCxNQUFJMkIsV0FBVyxLQUFLLENBQUMsQ0FBckIsRUFBd0I7QUFDdEIsUUFBSUMsT0FBTyxLQUFLLENBQUMsQ0FBakIsRUFBb0I7QUFDbEIsV0FBSzFELE1BQUwsR0FBYzRCLElBQUksQ0FBQ1MsS0FBTCxDQUFXb0IsV0FBWCxDQUFkO0FBQ0EsV0FBS3hELEtBQUwsR0FBYTJCLElBQUksQ0FBQ1MsS0FBTCxDQUFXb0IsV0FBVyxHQUFHLENBQXpCLENBQWI7QUFDRCxLQUhELE1BR087QUFDTCxXQUFLekQsTUFBTCxHQUFjNEIsSUFBSSxDQUFDUyxLQUFMLENBQVdvQixXQUFYLEVBQXdCQyxPQUF4QixDQUFkO0FBQ0EsV0FBS3pELEtBQUwsR0FBYTJCLElBQUksQ0FBQ1MsS0FBTCxDQUFXb0IsV0FBVyxHQUFHLENBQXpCLEVBQTRCQyxPQUE1QixDQUFiO0FBQ0Q7O0FBQ0QsUUFBSXRDLGdCQUFKLEVBQXNCO0FBQ3BCLFdBQUtuQixLQUFMLEdBQWFpQixXQUFXLENBQUNsQyxLQUFaLENBQWtCLEtBQUtpQixLQUF2QixDQUFiO0FBQ0Q7QUFDRixHQVhELE1BV08sSUFBSW1CLGdCQUFKLEVBQXNCO0FBQzNCO0FBQ0EsU0FBS3BCLE1BQUwsR0FBYyxFQUFkO0FBQ0EsU0FBS0MsS0FBTCxHQUFhLEVBQWI7QUFDRDs7QUFFRCxNQUFJMEQsUUFBUSxHQUNWRixXQUFXLEtBQUssQ0FBQyxDQUFqQixLQUF1QkMsT0FBTyxLQUFLLENBQUMsQ0FBYixJQUFrQkQsV0FBVyxHQUFHQyxPQUF2RCxJQUNJRCxXQURKLEdBRUlDLE9BSE47O0FBSUEsTUFBSUMsUUFBUSxLQUFLLENBQUMsQ0FBbEIsRUFBcUI7QUFDbkIsUUFBSS9CLElBQUksQ0FBQ0ssTUFBTCxHQUFjLENBQWxCLEVBQXFCLEtBQUsvQixRQUFMLEdBQWdCMEIsSUFBaEI7QUFDdEIsR0FGRCxNQUVPLElBQUkrQixRQUFRLEdBQUcsQ0FBZixFQUFrQjtBQUN2QixTQUFLekQsUUFBTCxHQUFnQjBCLElBQUksQ0FBQ1MsS0FBTCxDQUFXLENBQVgsRUFBY3NCLFFBQWQsQ0FBaEI7QUFDRDs7QUFDRCxNQUFJL0MsZUFBZSxDQUFDNkIsVUFBRCxDQUFmLElBQStCLEtBQUszQyxRQUFwQyxJQUFnRCxDQUFDLEtBQUtJLFFBQTFELEVBQW9FO0FBQ2xFLFNBQUtBLFFBQUwsR0FBZ0IsR0FBaEI7QUFDRCxHQXpTc0UsQ0EyU3ZFOzs7QUFDQSxNQUFJLEtBQUtBLFFBQUwsSUFBaUIsS0FBS0YsTUFBMUIsRUFBa0M7QUFDaEMsVUFBTXNELENBQUMsR0FBRyxLQUFLcEQsUUFBTCxJQUFpQixFQUEzQjtBQUNBLFVBQU0wRCxDQUFDLEdBQUcsS0FBSzVELE1BQUwsSUFBZSxFQUF6QjtBQUNBLFNBQUtHLElBQUwsR0FBWW1ELENBQUMsR0FBR00sQ0FBaEI7QUFDRCxHQWhUc0UsQ0FrVHZFOzs7QUFDQSxPQUFLeEQsSUFBTCxHQUFZLEtBQUtkLE1BQUwsRUFBWjtBQUNBLFNBQU8sSUFBUDtBQUNELENBclREO0FBdVRBOzs7QUFDQSxTQUFTNkQsZ0JBQVQsQ0FBMEJVLElBQTFCLEVBQWdDakMsSUFBaEMsRUFBc0M5QixRQUF0QyxFQUFnRDtBQUM5QyxPQUFLLElBQUlnQyxDQUFDLEdBQUcsQ0FBUixFQUFXRCxPQUFoQixFQUF5QkMsQ0FBQyxJQUFJaEMsUUFBUSxDQUFDbUMsTUFBdkMsRUFBK0MsRUFBRUgsQ0FBakQsRUFBb0Q7QUFDbEQsUUFBSUksSUFBSjtBQUNBLFFBQUlKLENBQUMsR0FBR2hDLFFBQVEsQ0FBQ21DLE1BQWpCLEVBQXlCQyxJQUFJLEdBQUdwQyxRQUFRLENBQUNxQyxVQUFULENBQW9CTCxDQUFwQixDQUFQOztBQUN6QixRQUFJSSxJQUFJLEtBQUs7QUFBRztBQUFaLE9BQXFCSixDQUFDLEtBQUtoQyxRQUFRLENBQUNtQyxNQUF4QyxFQUFnRDtBQUM5QyxVQUFJSCxDQUFDLEdBQUdELE9BQUosR0FBYyxDQUFsQixFQUFxQjtBQUNuQixZQUFJQyxDQUFDLEdBQUdELE9BQUosR0FBYyxFQUFsQixFQUFzQjtBQUNwQmdDLFVBQUFBLElBQUksQ0FBQy9ELFFBQUwsR0FBZ0JBLFFBQVEsQ0FBQ3VDLEtBQVQsQ0FBZSxDQUFmLEVBQWtCUixPQUFPLEdBQUcsRUFBNUIsQ0FBaEI7QUFDQSxpQkFBTyxNQUFNL0IsUUFBUSxDQUFDdUMsS0FBVCxDQUFlUixPQUFPLEdBQUcsRUFBekIsQ0FBTixHQUFxQ0QsSUFBNUM7QUFDRDtBQUNGOztBQUNEQyxNQUFBQSxPQUFPLEdBQUdDLENBQUMsR0FBRyxDQUFkO0FBQ0E7QUFDRCxLQVRELE1BU08sSUFDSkksSUFBSSxJQUFJO0FBQUc7QUFBWCxPQUFvQkEsSUFBSSxJQUFJLEVBQTdCO0FBQWlDO0FBQ2hDQSxJQUFBQSxJQUFJLElBQUk7QUFBRztBQUFYLE9BQW9CQSxJQUFJLElBQUk7QUFBSztBQURsQyxPQUVBQSxJQUFJLEtBQUs7QUFBRztBQUZaLE9BR0NBLElBQUksSUFBSTtBQUFHO0FBQVgsT0FBb0JBLElBQUksSUFBSTtBQUFJO0FBSGpDLE9BSUFBLElBQUksS0FBSztBQUFHO0FBSlosT0FLQUEsSUFBSSxLQUFLO0FBQUc7QUFMWjtBQU1BO0FBQ0FBLElBQUFBLElBQUksS0FBSztBQUFHO0FBUFosT0FRQUEsSUFBSSxLQUFLO0FBQUc7QUFSWjtBQVNBO0FBQ0FBLElBQUFBLElBQUksR0FBRyxHQVhGLEVBWUw7QUFDQTtBQUNELEtBMUJpRCxDQTJCbEQ7OztBQUNBMkIsSUFBQUEsSUFBSSxDQUFDL0QsUUFBTCxHQUFnQkEsUUFBUSxDQUFDdUMsS0FBVCxDQUFlLENBQWYsRUFBa0JQLENBQWxCLENBQWhCO0FBQ0EsUUFBSUEsQ0FBQyxHQUFHaEMsUUFBUSxDQUFDbUMsTUFBakIsRUFBeUIsT0FBTyxNQUFNbkMsUUFBUSxDQUFDdUMsS0FBVCxDQUFlUCxDQUFmLENBQU4sR0FBMEJGLElBQWpDO0FBQ3pCO0FBQ0Q7QUFDRjtBQUVEOzs7QUFDQSxTQUFTNEIsYUFBVCxDQUF1QjVCLElBQXZCLEVBQTZCO0FBQzNCLE1BQUlrQyxPQUFPLEdBQUcsRUFBZDtBQUNBLE1BQUlqQyxPQUFPLEdBQUcsQ0FBZDs7QUFDQSxPQUFLLElBQUlDLENBQUMsR0FBRyxDQUFiLEVBQWdCQSxDQUFDLEdBQUdGLElBQUksQ0FBQ0ssTUFBekIsRUFBaUMsRUFBRUgsQ0FBbkMsRUFBc0M7QUFDcEM7QUFDQTtBQUNBLFlBQVFGLElBQUksQ0FBQ08sVUFBTCxDQUFnQkwsQ0FBaEIsQ0FBUjtBQUNFLFdBQUssQ0FBTDtBQUFRO0FBQ04sWUFBSUEsQ0FBQyxHQUFHRCxPQUFKLEdBQWMsQ0FBbEIsRUFBcUJpQyxPQUFPLElBQUlsQyxJQUFJLENBQUNTLEtBQUwsQ0FBV1IsT0FBWCxFQUFvQkMsQ0FBcEIsQ0FBWDtBQUNyQmdDLFFBQUFBLE9BQU8sSUFBSSxLQUFYO0FBQ0FqQyxRQUFBQSxPQUFPLEdBQUdDLENBQUMsR0FBRyxDQUFkO0FBQ0E7O0FBQ0YsV0FBSyxFQUFMO0FBQVM7QUFDUCxZQUFJQSxDQUFDLEdBQUdELE9BQUosR0FBYyxDQUFsQixFQUFxQmlDLE9BQU8sSUFBSWxDLElBQUksQ0FBQ1MsS0FBTCxDQUFXUixPQUFYLEVBQW9CQyxDQUFwQixDQUFYO0FBQ3JCZ0MsUUFBQUEsT0FBTyxJQUFJLEtBQVg7QUFDQWpDLFFBQUFBLE9BQU8sR0FBR0MsQ0FBQyxHQUFHLENBQWQ7QUFDQTs7QUFDRixXQUFLLEVBQUw7QUFBUztBQUNQLFlBQUlBLENBQUMsR0FBR0QsT0FBSixHQUFjLENBQWxCLEVBQXFCaUMsT0FBTyxJQUFJbEMsSUFBSSxDQUFDUyxLQUFMLENBQVdSLE9BQVgsRUFBb0JDLENBQXBCLENBQVg7QUFDckJnQyxRQUFBQSxPQUFPLElBQUksS0FBWDtBQUNBakMsUUFBQUEsT0FBTyxHQUFHQyxDQUFDLEdBQUcsQ0FBZDtBQUNBOztBQUNGLFdBQUssRUFBTDtBQUFTO0FBQ1AsWUFBSUEsQ0FBQyxHQUFHRCxPQUFKLEdBQWMsQ0FBbEIsRUFBcUJpQyxPQUFPLElBQUlsQyxJQUFJLENBQUNTLEtBQUwsQ0FBV1IsT0FBWCxFQUFvQkMsQ0FBcEIsQ0FBWDtBQUNyQmdDLFFBQUFBLE9BQU8sSUFBSSxLQUFYO0FBQ0FqQyxRQUFBQSxPQUFPLEdBQUdDLENBQUMsR0FBRyxDQUFkO0FBQ0E7O0FBQ0YsV0FBSyxFQUFMO0FBQVM7QUFDUCxZQUFJQSxDQUFDLEdBQUdELE9BQUosR0FBYyxDQUFsQixFQUFxQmlDLE9BQU8sSUFBSWxDLElBQUksQ0FBQ1MsS0FBTCxDQUFXUixPQUFYLEVBQW9CQyxDQUFwQixDQUFYO0FBQ3JCZ0MsUUFBQUEsT0FBTyxJQUFJLEtBQVg7QUFDQWpDLFFBQUFBLE9BQU8sR0FBR0MsQ0FBQyxHQUFHLENBQWQ7QUFDQTs7QUFDRixXQUFLLEVBQUw7QUFBUztBQUNQLFlBQUlBLENBQUMsR0FBR0QsT0FBSixHQUFjLENBQWxCLEVBQXFCaUMsT0FBTyxJQUFJbEMsSUFBSSxDQUFDUyxLQUFMLENBQVdSLE9BQVgsRUFBb0JDLENBQXBCLENBQVg7QUFDckJnQyxRQUFBQSxPQUFPLElBQUksS0FBWDtBQUNBakMsUUFBQUEsT0FBTyxHQUFHQyxDQUFDLEdBQUcsQ0FBZDtBQUNBOztBQUNGLFdBQUssRUFBTDtBQUFTO0FBQ1AsWUFBSUEsQ0FBQyxHQUFHRCxPQUFKLEdBQWMsQ0FBbEIsRUFBcUJpQyxPQUFPLElBQUlsQyxJQUFJLENBQUNTLEtBQUwsQ0FBV1IsT0FBWCxFQUFvQkMsQ0FBcEIsQ0FBWDtBQUNyQmdDLFFBQUFBLE9BQU8sSUFBSSxLQUFYO0FBQ0FqQyxRQUFBQSxPQUFPLEdBQUdDLENBQUMsR0FBRyxDQUFkO0FBQ0E7O0FBQ0YsV0FBSyxFQUFMO0FBQVM7QUFDUCxZQUFJQSxDQUFDLEdBQUdELE9BQUosR0FBYyxDQUFsQixFQUFxQmlDLE9BQU8sSUFBSWxDLElBQUksQ0FBQ1MsS0FBTCxDQUFXUixPQUFYLEVBQW9CQyxDQUFwQixDQUFYO0FBQ3JCZ0MsUUFBQUEsT0FBTyxJQUFJLEtBQVg7QUFDQWpDLFFBQUFBLE9BQU8sR0FBR0MsQ0FBQyxHQUFHLENBQWQ7QUFDQTs7QUFDRixXQUFLLEVBQUw7QUFBUztBQUNQLFlBQUlBLENBQUMsR0FBR0QsT0FBSixHQUFjLENBQWxCLEVBQXFCaUMsT0FBTyxJQUFJbEMsSUFBSSxDQUFDUyxLQUFMLENBQVdSLE9BQVgsRUFBb0JDLENBQXBCLENBQVg7QUFDckJnQyxRQUFBQSxPQUFPLElBQUksS0FBWDtBQUNBakMsUUFBQUEsT0FBTyxHQUFHQyxDQUFDLEdBQUcsQ0FBZDtBQUNBOztBQUNGLFdBQUssRUFBTDtBQUFTO0FBQ1AsWUFBSUEsQ0FBQyxHQUFHRCxPQUFKLEdBQWMsQ0FBbEIsRUFBcUJpQyxPQUFPLElBQUlsQyxJQUFJLENBQUNTLEtBQUwsQ0FBV1IsT0FBWCxFQUFvQkMsQ0FBcEIsQ0FBWDtBQUNyQmdDLFFBQUFBLE9BQU8sSUFBSSxLQUFYO0FBQ0FqQyxRQUFBQSxPQUFPLEdBQUdDLENBQUMsR0FBRyxDQUFkO0FBQ0E7O0FBQ0YsV0FBSyxFQUFMO0FBQVM7QUFDUCxZQUFJQSxDQUFDLEdBQUdELE9BQUosR0FBYyxDQUFsQixFQUFxQmlDLE9BQU8sSUFBSWxDLElBQUksQ0FBQ1MsS0FBTCxDQUFXUixPQUFYLEVBQW9CQyxDQUFwQixDQUFYO0FBQ3JCZ0MsUUFBQUEsT0FBTyxJQUFJLEtBQVg7QUFDQWpDLFFBQUFBLE9BQU8sR0FBR0MsQ0FBQyxHQUFHLENBQWQ7QUFDQTs7QUFDRixXQUFLLEdBQUw7QUFBVTtBQUNSLFlBQUlBLENBQUMsR0FBR0QsT0FBSixHQUFjLENBQWxCLEVBQXFCaUMsT0FBTyxJQUFJbEMsSUFBSSxDQUFDUyxLQUFMLENBQVdSLE9BQVgsRUFBb0JDLENBQXBCLENBQVg7QUFDckJnQyxRQUFBQSxPQUFPLElBQUksS0FBWDtBQUNBakMsUUFBQUEsT0FBTyxHQUFHQyxDQUFDLEdBQUcsQ0FBZDtBQUNBOztBQUNGLFdBQUssR0FBTDtBQUFVO0FBQ1IsWUFBSUEsQ0FBQyxHQUFHRCxPQUFKLEdBQWMsQ0FBbEIsRUFBcUJpQyxPQUFPLElBQUlsQyxJQUFJLENBQUNTLEtBQUwsQ0FBV1IsT0FBWCxFQUFvQkMsQ0FBcEIsQ0FBWDtBQUNyQmdDLFFBQUFBLE9BQU8sSUFBSSxLQUFYO0FBQ0FqQyxRQUFBQSxPQUFPLEdBQUdDLENBQUMsR0FBRyxDQUFkO0FBQ0E7O0FBQ0YsV0FBSyxHQUFMO0FBQVU7QUFDUixZQUFJQSxDQUFDLEdBQUdELE9BQUosR0FBYyxDQUFsQixFQUFxQmlDLE9BQU8sSUFBSWxDLElBQUksQ0FBQ1MsS0FBTCxDQUFXUixPQUFYLEVBQW9CQyxDQUFwQixDQUFYO0FBQ3JCZ0MsUUFBQUEsT0FBTyxJQUFJLEtBQVg7QUFDQWpDLFFBQUFBLE9BQU8sR0FBR0MsQ0FBQyxHQUFHLENBQWQ7QUFDQTtBQXRFSjtBQXdFRDs7QUFDRCxNQUFJRCxPQUFPLEtBQUssQ0FBaEIsRUFBbUI7QUFDbkIsTUFBSUEsT0FBTyxHQUFHRCxJQUFJLENBQUNLLE1BQW5CLEVBQTJCLE9BQU82QixPQUFPLEdBQUdsQyxJQUFJLENBQUNTLEtBQUwsQ0FBV1IsT0FBWCxDQUFqQixDQUEzQixLQUNLLE9BQU9pQyxPQUFQO0FBQ04sQyxDQUVEOztBQUNBOzs7QUFDQSxTQUFTdkUsU0FBVCxDQUFtQndFLEdBQW5CLEVBQXdCO0FBQ3RCO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsTUFBSSxPQUFPQSxHQUFQLEtBQWUsUUFBbkIsRUFBNkJBLEdBQUcsR0FBRzlFLFFBQVEsQ0FBQzhFLEdBQUQsQ0FBZCxDQUE3QixLQUNLLElBQUksT0FBT0EsR0FBUCxLQUFlLFFBQWYsSUFBMkJBLEdBQUcsS0FBSyxJQUF2QyxFQUNILE1BQU0sSUFBSXZDLFNBQUosQ0FDSiwrQ0FBK0N1QyxHQUEvQyxLQUF1RCxJQUF2RCxHQUNJLE1BREosR0FFSSxPQUFPQSxHQUhQLENBQU4sQ0FERyxLQU1BLElBQUksRUFBRUEsR0FBRyxZQUFZdkUsR0FBakIsQ0FBSixFQUEyQixPQUFPQSxHQUFHLENBQUMrQixTQUFKLENBQWNqQyxNQUFkLENBQXFCMEUsSUFBckIsQ0FBMEJELEdBQTFCLENBQVA7QUFFaEMsU0FBT0EsR0FBRyxDQUFDekUsTUFBSixFQUFQO0FBQ0Q7QUFFRDs7O0FBQ0FFLEdBQUcsQ0FBQytCLFNBQUosQ0FBY2pDLE1BQWQsR0FBdUIsWUFBVztBQUNoQyxNQUFJSyxJQUFJLEdBQUcsS0FBS0EsSUFBTCxJQUFhLEVBQXhCOztBQUNBLE1BQUlBLElBQUosRUFBVTtBQUNSQSxJQUFBQSxJQUFJLEdBQUdzRSxVQUFVLENBQUN0RSxJQUFELENBQWpCO0FBQ0FBLElBQUFBLElBQUksSUFBSSxHQUFSO0FBQ0Q7O0FBRUQsTUFBSUYsUUFBUSxHQUFHLEtBQUtBLFFBQUwsSUFBaUIsRUFBaEM7QUFDQSxNQUFJUyxRQUFRLEdBQUcsS0FBS0EsUUFBTCxJQUFpQixFQUFoQztBQUNBLE1BQUlILElBQUksR0FBRyxLQUFLQSxJQUFMLElBQWEsRUFBeEI7QUFDQSxNQUFJSCxJQUFJLEdBQUcsS0FBWDtBQUNBLE1BQUlLLEtBQUssR0FBRyxFQUFaOztBQUVBLE1BQUksS0FBS0wsSUFBVCxFQUFlO0FBQ2JBLElBQUFBLElBQUksR0FBR0QsSUFBSSxHQUFHLEtBQUtDLElBQW5CO0FBQ0QsR0FGRCxNQUVPLElBQUksS0FBS0UsUUFBVCxFQUFtQjtBQUN4QkYsSUFBQUEsSUFBSSxHQUNGRCxJQUFJLElBQ0gsS0FBS0csUUFBTCxDQUFjb0UsT0FBZCxDQUFzQixHQUF0QixNQUErQixDQUFDLENBQWhDLEdBQ0csS0FBS3BFLFFBRFIsR0FFRyxNQUFNLEtBQUtBLFFBQVgsR0FBc0IsR0FIdEIsQ0FETjs7QUFLQSxRQUFJLEtBQUtELElBQVQsRUFBZTtBQUNiRCxNQUFBQSxJQUFJLElBQUksTUFBTSxLQUFLQyxJQUFuQjtBQUNEO0FBQ0Y7O0FBRUQsTUFBSSxLQUFLSSxLQUFMLEtBQWUsSUFBZixJQUF1QixPQUFPLEtBQUtBLEtBQVosS0FBc0IsUUFBakQsRUFDRUEsS0FBSyxHQUFHaUIsV0FBVyxDQUFDaUQsU0FBWixDQUFzQixLQUFLbEUsS0FBM0IsQ0FBUjtBQUVGLE1BQUlELE1BQU0sR0FBRyxLQUFLQSxNQUFMLElBQWdCQyxLQUFLLElBQUksTUFBTUEsS0FBL0IsSUFBeUMsRUFBdEQ7QUFFQSxNQUFJUixRQUFRLElBQUlBLFFBQVEsQ0FBQzBDLFVBQVQsQ0FBb0IxQyxRQUFRLENBQUN3QyxNQUFULEdBQWtCLENBQXRDLE1BQTZDO0FBQUc7QUFBaEUsSUFDRXhDLFFBQVEsSUFBSSxHQUFaO0FBRUYsTUFBSTJFLFdBQVcsR0FBRyxFQUFsQjtBQUNBLE1BQUl2QyxPQUFPLEdBQUcsQ0FBZDs7QUFDQSxPQUFLLElBQUlDLENBQUMsR0FBRyxDQUFiLEVBQWdCQSxDQUFDLEdBQUc1QixRQUFRLENBQUMrQixNQUE3QixFQUFxQyxFQUFFSCxDQUF2QyxFQUEwQztBQUN4QyxZQUFRNUIsUUFBUSxDQUFDaUMsVUFBVCxDQUFvQkwsQ0FBcEIsQ0FBUjtBQUNFLFdBQUssRUFBTDtBQUFTO0FBQ1AsWUFBSUEsQ0FBQyxHQUFHRCxPQUFKLEdBQWMsQ0FBbEIsRUFBcUJ1QyxXQUFXLElBQUlsRSxRQUFRLENBQUNtQyxLQUFULENBQWVSLE9BQWYsRUFBd0JDLENBQXhCLENBQWY7QUFDckJzQyxRQUFBQSxXQUFXLElBQUksS0FBZjtBQUNBdkMsUUFBQUEsT0FBTyxHQUFHQyxDQUFDLEdBQUcsQ0FBZDtBQUNBOztBQUNGLFdBQUssRUFBTDtBQUFTO0FBQ1AsWUFBSUEsQ0FBQyxHQUFHRCxPQUFKLEdBQWMsQ0FBbEIsRUFBcUJ1QyxXQUFXLElBQUlsRSxRQUFRLENBQUNtQyxLQUFULENBQWVSLE9BQWYsRUFBd0JDLENBQXhCLENBQWY7QUFDckJzQyxRQUFBQSxXQUFXLElBQUksS0FBZjtBQUNBdkMsUUFBQUEsT0FBTyxHQUFHQyxDQUFDLEdBQUcsQ0FBZDtBQUNBO0FBVko7QUFZRDs7QUFDRCxNQUFJRCxPQUFPLEdBQUcsQ0FBZCxFQUFpQjtBQUNmLFFBQUlBLE9BQU8sS0FBSzNCLFFBQVEsQ0FBQytCLE1BQXpCLEVBQ0UvQixRQUFRLEdBQUdrRSxXQUFXLEdBQUdsRSxRQUFRLENBQUNtQyxLQUFULENBQWVSLE9BQWYsQ0FBekIsQ0FERixLQUVLM0IsUUFBUSxHQUFHa0UsV0FBWDtBQUNOLEdBdEQrQixDQXdEaEM7QUFDQTs7O0FBQ0EsTUFDRSxLQUFLMUUsT0FBTCxJQUNDLENBQUMsQ0FBQ0QsUUFBRCxJQUFhbUIsZUFBZSxDQUFDbkIsUUFBRCxDQUE3QixLQUE0Q0csSUFBSSxLQUFLLEtBRnhELEVBR0U7QUFDQUEsSUFBQUEsSUFBSSxHQUFHLFFBQVFBLElBQUksSUFBSSxFQUFoQixDQUFQO0FBQ0EsUUFBSU0sUUFBUSxJQUFJQSxRQUFRLENBQUNpQyxVQUFULENBQW9CLENBQXBCLE1BQTJCO0FBQUc7QUFBOUMsTUFDRWpDLFFBQVEsR0FBRyxNQUFNQSxRQUFqQjtBQUNILEdBUEQsTUFPTyxJQUFJLENBQUNOLElBQUwsRUFBVztBQUNoQkEsSUFBQUEsSUFBSSxHQUFHLEVBQVA7QUFDRDs7QUFFREksRUFBQUEsTUFBTSxHQUFHQSxNQUFNLENBQUNxRSxPQUFQLENBQWUsR0FBZixFQUFvQixLQUFwQixDQUFUO0FBRUEsTUFBSXRFLElBQUksSUFBSUEsSUFBSSxDQUFDb0MsVUFBTCxDQUFnQixDQUFoQixNQUF1QjtBQUFHO0FBQXRDLElBQTZDcEMsSUFBSSxHQUFHLE1BQU1BLElBQWI7QUFDN0MsTUFBSUMsTUFBTSxJQUFJQSxNQUFNLENBQUNtQyxVQUFQLENBQWtCLENBQWxCLE1BQXlCO0FBQUc7QUFBMUMsSUFBaURuQyxNQUFNLEdBQUcsTUFBTUEsTUFBZjtBQUVqRCxTQUFPUCxRQUFRLEdBQUdHLElBQVgsR0FBa0JNLFFBQWxCLEdBQTZCRixNQUE3QixHQUFzQ0QsSUFBN0M7QUFDRCxDQTNFRDtBQTZFQTs7O0FBQ0EsU0FBU1osVUFBVCxDQUFvQm1GLE1BQXBCLEVBQTRCQyxRQUE1QixFQUFzQztBQUNwQyxTQUFPdEYsUUFBUSxDQUFDcUYsTUFBRCxFQUFTLEtBQVQsRUFBZ0IsSUFBaEIsQ0FBUixDQUE4QnBGLE9BQTlCLENBQXNDcUYsUUFBdEMsQ0FBUDtBQUNEO0FBRUQ7OztBQUNBL0UsR0FBRyxDQUFDK0IsU0FBSixDQUFjckMsT0FBZCxHQUF3QixVQUFTcUYsUUFBVCxFQUFtQjtBQUN6QyxTQUFPLEtBQUtuRixhQUFMLENBQW1CSCxRQUFRLENBQUNzRixRQUFELEVBQVcsS0FBWCxFQUFrQixJQUFsQixDQUEzQixFQUFvRGpGLE1BQXBELEVBQVA7QUFDRCxDQUZEO0FBSUE7OztBQUNBLFNBQVNELGdCQUFULENBQTBCaUYsTUFBMUIsRUFBa0NDLFFBQWxDLEVBQTRDO0FBQzFDLE1BQUksQ0FBQ0QsTUFBTCxFQUFhLE9BQU9DLFFBQVA7QUFDYixTQUFPdEYsUUFBUSxDQUFDcUYsTUFBRCxFQUFTLEtBQVQsRUFBZ0IsSUFBaEIsQ0FBUixDQUE4QmxGLGFBQTlCLENBQTRDbUYsUUFBNUMsQ0FBUDtBQUNEO0FBRUQ7OztBQUNBL0UsR0FBRyxDQUFDK0IsU0FBSixDQUFjbkMsYUFBZCxHQUE4QixVQUFTbUYsUUFBVCxFQUFtQjtBQUMvQyxNQUFJLE9BQU9BLFFBQVAsS0FBb0IsUUFBeEIsRUFBa0M7QUFDaEMsUUFBSUMsR0FBRyxHQUFHLElBQUloRixHQUFKLEVBQVY7QUFDQWdGLElBQUFBLEdBQUcsQ0FBQ3hGLEtBQUosQ0FBVXVGLFFBQVYsRUFBb0IsS0FBcEIsRUFBMkIsSUFBM0I7QUFDQUEsSUFBQUEsUUFBUSxHQUFHQyxHQUFYO0FBQ0Q7O0FBRUQsTUFBSXRCLE1BQU0sR0FBRyxJQUFJMUQsR0FBSixFQUFiO0FBQ0EsTUFBSWlGLEtBQUssR0FBR0MsTUFBTSxDQUFDQyxJQUFQLENBQVksSUFBWixDQUFaOztBQUNBLE9BQUssSUFBSUMsRUFBRSxHQUFHLENBQWQsRUFBaUJBLEVBQUUsR0FBR0gsS0FBSyxDQUFDeEMsTUFBNUIsRUFBb0MyQyxFQUFFLEVBQXRDLEVBQTBDO0FBQ3hDLFFBQUlDLElBQUksR0FBR0osS0FBSyxDQUFDRyxFQUFELENBQWhCO0FBQ0ExQixJQUFBQSxNQUFNLENBQUMyQixJQUFELENBQU4sR0FBZSxLQUFLQSxJQUFMLENBQWY7QUFDRCxHQVo4QyxDQWMvQztBQUNBOzs7QUFDQTNCLEVBQUFBLE1BQU0sQ0FBQ25ELElBQVAsR0FBY3dFLFFBQVEsQ0FBQ3hFLElBQXZCLENBaEIrQyxDQWtCL0M7O0FBQ0EsTUFBSXdFLFFBQVEsQ0FBQ25FLElBQVQsS0FBa0IsRUFBdEIsRUFBMEI7QUFDeEI4QyxJQUFBQSxNQUFNLENBQUM5QyxJQUFQLEdBQWM4QyxNQUFNLENBQUM1RCxNQUFQLEVBQWQ7QUFDQSxXQUFPNEQsTUFBUDtBQUNELEdBdEI4QyxDQXdCL0M7OztBQUNBLE1BQUlxQixRQUFRLENBQUM3RSxPQUFULElBQW9CLENBQUM2RSxRQUFRLENBQUM5RSxRQUFsQyxFQUE0QztBQUMxQztBQUNBLFFBQUlxRixLQUFLLEdBQUdKLE1BQU0sQ0FBQ0MsSUFBUCxDQUFZSixRQUFaLENBQVo7O0FBQ0EsU0FBSyxJQUFJUSxFQUFFLEdBQUcsQ0FBZCxFQUFpQkEsRUFBRSxHQUFHRCxLQUFLLENBQUM3QyxNQUE1QixFQUFvQzhDLEVBQUUsRUFBdEMsRUFBMEM7QUFDeEMsVUFBSUMsSUFBSSxHQUFHRixLQUFLLENBQUNDLEVBQUQsQ0FBaEI7QUFDQSxVQUFJQyxJQUFJLEtBQUssVUFBYixFQUF5QjlCLE1BQU0sQ0FBQzhCLElBQUQsQ0FBTixHQUFlVCxRQUFRLENBQUNTLElBQUQsQ0FBdkI7QUFDMUIsS0FOeUMsQ0FRMUM7OztBQUNBLFFBQ0VwRSxlQUFlLENBQUNzQyxNQUFNLENBQUN6RCxRQUFSLENBQWYsSUFDQXlELE1BQU0sQ0FBQ3BELFFBRFAsSUFFQSxDQUFDb0QsTUFBTSxDQUFDaEQsUUFIVixFQUlFO0FBQ0FnRCxNQUFBQSxNQUFNLENBQUMvQyxJQUFQLEdBQWMrQyxNQUFNLENBQUNoRCxRQUFQLEdBQWtCLEdBQWhDO0FBQ0Q7O0FBRURnRCxJQUFBQSxNQUFNLENBQUM5QyxJQUFQLEdBQWM4QyxNQUFNLENBQUM1RCxNQUFQLEVBQWQ7QUFDQSxXQUFPNEQsTUFBUDtBQUNEOztBQUVELE1BQUlxQixRQUFRLENBQUM5RSxRQUFULElBQXFCOEUsUUFBUSxDQUFDOUUsUUFBVCxLQUFzQnlELE1BQU0sQ0FBQ3pELFFBQXRELEVBQWdFO0FBQzlEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxRQUFJLENBQUNtQixlQUFlLENBQUMyRCxRQUFRLENBQUM5RSxRQUFWLENBQXBCLEVBQXlDO0FBQ3ZDLFVBQUlrRixJQUFJLEdBQUdELE1BQU0sQ0FBQ0MsSUFBUCxDQUFZSixRQUFaLENBQVg7O0FBQ0EsV0FBSyxJQUFJVSxDQUFDLEdBQUcsQ0FBYixFQUFnQkEsQ0FBQyxHQUFHTixJQUFJLENBQUMxQyxNQUF6QixFQUFpQ2dELENBQUMsRUFBbEMsRUFBc0M7QUFDcEMsWUFBSUMsQ0FBQyxHQUFHUCxJQUFJLENBQUNNLENBQUQsQ0FBWjtBQUNBL0IsUUFBQUEsTUFBTSxDQUFDZ0MsQ0FBRCxDQUFOLEdBQVlYLFFBQVEsQ0FBQ1csQ0FBRCxDQUFwQjtBQUNEOztBQUNEaEMsTUFBQUEsTUFBTSxDQUFDOUMsSUFBUCxHQUFjOEMsTUFBTSxDQUFDNUQsTUFBUCxFQUFkO0FBQ0EsYUFBTzRELE1BQVA7QUFDRDs7QUFFREEsSUFBQUEsTUFBTSxDQUFDekQsUUFBUCxHQUFrQjhFLFFBQVEsQ0FBQzlFLFFBQTNCOztBQUNBLFFBQ0UsQ0FBQzhFLFFBQVEsQ0FBQzNFLElBQVYsSUFDQSxDQUFDLFdBQVcrQyxJQUFYLENBQWdCNEIsUUFBUSxDQUFDOUUsUUFBekIsQ0FERCxJQUVBLENBQUNrQixnQkFBZ0IsQ0FBQzRELFFBQVEsQ0FBQzlFLFFBQVYsQ0FIbkIsRUFJRTtBQUNBLFlBQU0wRixPQUFPLEdBQUcsQ0FBQ1osUUFBUSxDQUFDckUsUUFBVCxJQUFxQixFQUF0QixFQUEwQjhCLEtBQTFCLENBQWdDLEdBQWhDLENBQWhCOztBQUNBLGFBQU9tRCxPQUFPLENBQUNsRCxNQUFSLElBQWtCLEVBQUVzQyxRQUFRLENBQUMzRSxJQUFULEdBQWdCdUYsT0FBTyxDQUFDQyxLQUFSLEVBQWxCLENBQXpCLENBQTREOztBQUM1RCxVQUFJLENBQUNiLFFBQVEsQ0FBQzNFLElBQWQsRUFBb0IyRSxRQUFRLENBQUMzRSxJQUFULEdBQWdCLEVBQWhCO0FBQ3BCLFVBQUksQ0FBQzJFLFFBQVEsQ0FBQ3pFLFFBQWQsRUFBd0J5RSxRQUFRLENBQUN6RSxRQUFULEdBQW9CLEVBQXBCO0FBQ3hCLFVBQUlxRixPQUFPLENBQUMsQ0FBRCxDQUFQLEtBQWUsRUFBbkIsRUFBdUJBLE9BQU8sQ0FBQ0UsT0FBUixDQUFnQixFQUFoQjtBQUN2QixVQUFJRixPQUFPLENBQUNsRCxNQUFSLEdBQWlCLENBQXJCLEVBQXdCa0QsT0FBTyxDQUFDRSxPQUFSLENBQWdCLEVBQWhCO0FBQ3hCbkMsTUFBQUEsTUFBTSxDQUFDaEQsUUFBUCxHQUFrQmlGLE9BQU8sQ0FBQ0csSUFBUixDQUFhLEdBQWIsQ0FBbEI7QUFDRCxLQVpELE1BWU87QUFDTHBDLE1BQUFBLE1BQU0sQ0FBQ2hELFFBQVAsR0FBa0JxRSxRQUFRLENBQUNyRSxRQUEzQjtBQUNEOztBQUNEZ0QsSUFBQUEsTUFBTSxDQUFDbEQsTUFBUCxHQUFnQnVFLFFBQVEsQ0FBQ3ZFLE1BQXpCO0FBQ0FrRCxJQUFBQSxNQUFNLENBQUNqRCxLQUFQLEdBQWVzRSxRQUFRLENBQUN0RSxLQUF4QjtBQUNBaUQsSUFBQUEsTUFBTSxDQUFDdEQsSUFBUCxHQUFjMkUsUUFBUSxDQUFDM0UsSUFBVCxJQUFpQixFQUEvQjtBQUNBc0QsSUFBQUEsTUFBTSxDQUFDdkQsSUFBUCxHQUFjNEUsUUFBUSxDQUFDNUUsSUFBdkI7QUFDQXVELElBQUFBLE1BQU0sQ0FBQ3BELFFBQVAsR0FBa0J5RSxRQUFRLENBQUN6RSxRQUFULElBQXFCeUUsUUFBUSxDQUFDM0UsSUFBaEQ7QUFDQXNELElBQUFBLE1BQU0sQ0FBQ3JELElBQVAsR0FBYzBFLFFBQVEsQ0FBQzFFLElBQXZCLENBeEM4RCxDQXlDOUQ7O0FBQ0EsUUFBSXFELE1BQU0sQ0FBQ2hELFFBQVAsSUFBbUJnRCxNQUFNLENBQUNsRCxNQUE5QixFQUFzQztBQUNwQyxVQUFJc0QsQ0FBQyxHQUFHSixNQUFNLENBQUNoRCxRQUFQLElBQW1CLEVBQTNCO0FBQ0EsVUFBSTBELENBQUMsR0FBR1YsTUFBTSxDQUFDbEQsTUFBUCxJQUFpQixFQUF6QjtBQUNBa0QsTUFBQUEsTUFBTSxDQUFDL0MsSUFBUCxHQUFjbUQsQ0FBQyxHQUFHTSxDQUFsQjtBQUNEOztBQUNEVixJQUFBQSxNQUFNLENBQUN4RCxPQUFQLEdBQWlCd0QsTUFBTSxDQUFDeEQsT0FBUCxJQUFrQjZFLFFBQVEsQ0FBQzdFLE9BQTVDO0FBQ0F3RCxJQUFBQSxNQUFNLENBQUM5QyxJQUFQLEdBQWM4QyxNQUFNLENBQUM1RCxNQUFQLEVBQWQ7QUFDQSxXQUFPNEQsTUFBUDtBQUNEOztBQUVELE1BQUlxQyxXQUFXLEdBQUdyQyxNQUFNLENBQUNoRCxRQUFQLElBQW1CZ0QsTUFBTSxDQUFDaEQsUUFBUCxDQUFnQnNGLE1BQWhCLENBQXVCLENBQXZCLE1BQThCLEdBQW5FO0FBQ0EsTUFBSUMsUUFBUSxHQUNWbEIsUUFBUSxDQUFDM0UsSUFBVCxJQUFrQjJFLFFBQVEsQ0FBQ3JFLFFBQVQsSUFBcUJxRSxRQUFRLENBQUNyRSxRQUFULENBQWtCc0YsTUFBbEIsQ0FBeUIsQ0FBekIsTUFBZ0MsR0FEekU7QUFFQSxNQUFJRSxVQUFVLEdBQ1pELFFBQVEsSUFBSUYsV0FBWixJQUE0QnJDLE1BQU0sQ0FBQ3RELElBQVAsSUFBZTJFLFFBQVEsQ0FBQ3JFLFFBRHREO0FBRUEsTUFBSXlGLGFBQWEsR0FBR0QsVUFBcEI7QUFDQSxNQUFJRSxPQUFPLEdBQUkxQyxNQUFNLENBQUNoRCxRQUFQLElBQW1CZ0QsTUFBTSxDQUFDaEQsUUFBUCxDQUFnQjhCLEtBQWhCLENBQXNCLEdBQXRCLENBQXBCLElBQW1ELEVBQWpFO0FBQ0EsTUFBSW1ELE9BQU8sR0FBSVosUUFBUSxDQUFDckUsUUFBVCxJQUFxQnFFLFFBQVEsQ0FBQ3JFLFFBQVQsQ0FBa0I4QixLQUFsQixDQUF3QixHQUF4QixDQUF0QixJQUF1RCxFQUFyRTtBQUNBLE1BQUk2RCxTQUFTLEdBQUczQyxNQUFNLENBQUN6RCxRQUFQLElBQW1CLENBQUNtQixlQUFlLENBQUNzQyxNQUFNLENBQUN6RCxRQUFSLENBQW5ELENBMUcrQyxDQTRHL0M7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFDQSxNQUFJb0csU0FBSixFQUFlO0FBQ2IzQyxJQUFBQSxNQUFNLENBQUNwRCxRQUFQLEdBQWtCLEVBQWxCO0FBQ0FvRCxJQUFBQSxNQUFNLENBQUNyRCxJQUFQLEdBQWMsSUFBZDs7QUFDQSxRQUFJcUQsTUFBTSxDQUFDdEQsSUFBWCxFQUFpQjtBQUNmLFVBQUlnRyxPQUFPLENBQUMsQ0FBRCxDQUFQLEtBQWUsRUFBbkIsRUFBdUJBLE9BQU8sQ0FBQyxDQUFELENBQVAsR0FBYTFDLE1BQU0sQ0FBQ3RELElBQXBCLENBQXZCLEtBQ0tnRyxPQUFPLENBQUNQLE9BQVIsQ0FBZ0JuQyxNQUFNLENBQUN0RCxJQUF2QjtBQUNOOztBQUNEc0QsSUFBQUEsTUFBTSxDQUFDdEQsSUFBUCxHQUFjLEVBQWQ7O0FBQ0EsUUFBSTJFLFFBQVEsQ0FBQzlFLFFBQWIsRUFBdUI7QUFDckI4RSxNQUFBQSxRQUFRLENBQUN6RSxRQUFULEdBQW9CLElBQXBCO0FBQ0F5RSxNQUFBQSxRQUFRLENBQUMxRSxJQUFULEdBQWdCLElBQWhCOztBQUNBLFVBQUkwRSxRQUFRLENBQUMzRSxJQUFiLEVBQW1CO0FBQ2pCLFlBQUl1RixPQUFPLENBQUMsQ0FBRCxDQUFQLEtBQWUsRUFBbkIsRUFBdUJBLE9BQU8sQ0FBQyxDQUFELENBQVAsR0FBYVosUUFBUSxDQUFDM0UsSUFBdEIsQ0FBdkIsS0FDS3VGLE9BQU8sQ0FBQ0UsT0FBUixDQUFnQmQsUUFBUSxDQUFDM0UsSUFBekI7QUFDTjs7QUFDRDJFLE1BQUFBLFFBQVEsQ0FBQzNFLElBQVQsR0FBZ0IsSUFBaEI7QUFDRDs7QUFDRDhGLElBQUFBLFVBQVUsR0FBR0EsVUFBVSxLQUFLUCxPQUFPLENBQUMsQ0FBRCxDQUFQLEtBQWUsRUFBZixJQUFxQlMsT0FBTyxDQUFDLENBQUQsQ0FBUCxLQUFlLEVBQXpDLENBQXZCO0FBQ0Q7O0FBRUQsTUFBSUgsUUFBSixFQUFjO0FBQ1o7QUFDQXZDLElBQUFBLE1BQU0sQ0FBQ3RELElBQVAsR0FDRTJFLFFBQVEsQ0FBQzNFLElBQVQsSUFBaUIyRSxRQUFRLENBQUMzRSxJQUFULEtBQWtCLEVBQW5DLEdBQXdDMkUsUUFBUSxDQUFDM0UsSUFBakQsR0FBd0RzRCxNQUFNLENBQUN0RCxJQURqRTtBQUVBc0QsSUFBQUEsTUFBTSxDQUFDcEQsUUFBUCxHQUNFeUUsUUFBUSxDQUFDekUsUUFBVCxJQUFxQnlFLFFBQVEsQ0FBQ3pFLFFBQVQsS0FBc0IsRUFBM0MsR0FDSXlFLFFBQVEsQ0FBQ3pFLFFBRGIsR0FFSW9ELE1BQU0sQ0FBQ3BELFFBSGI7QUFJQW9ELElBQUFBLE1BQU0sQ0FBQ2xELE1BQVAsR0FBZ0J1RSxRQUFRLENBQUN2RSxNQUF6QjtBQUNBa0QsSUFBQUEsTUFBTSxDQUFDakQsS0FBUCxHQUFlc0UsUUFBUSxDQUFDdEUsS0FBeEI7QUFDQTJGLElBQUFBLE9BQU8sR0FBR1QsT0FBVixDQVZZLENBV1o7QUFDRCxHQVpELE1BWU8sSUFBSUEsT0FBTyxDQUFDbEQsTUFBWixFQUFvQjtBQUN6QjtBQUNBO0FBQ0EsUUFBSSxDQUFDMkQsT0FBTCxFQUFjQSxPQUFPLEdBQUcsRUFBVjtBQUNkQSxJQUFBQSxPQUFPLENBQUNFLEdBQVI7QUFDQUYsSUFBQUEsT0FBTyxHQUFHQSxPQUFPLENBQUNHLE1BQVIsQ0FBZVosT0FBZixDQUFWO0FBQ0FqQyxJQUFBQSxNQUFNLENBQUNsRCxNQUFQLEdBQWdCdUUsUUFBUSxDQUFDdkUsTUFBekI7QUFDQWtELElBQUFBLE1BQU0sQ0FBQ2pELEtBQVAsR0FBZXNFLFFBQVEsQ0FBQ3RFLEtBQXhCO0FBQ0QsR0FSTSxNQVFBLElBQUlzRSxRQUFRLENBQUN2RSxNQUFULEtBQW9CLElBQXBCLElBQTRCdUUsUUFBUSxDQUFDdkUsTUFBVCxLQUFvQm9ELFNBQXBELEVBQStEO0FBQ3BFO0FBQ0E7QUFDQTtBQUNBLFFBQUl5QyxTQUFKLEVBQWU7QUFDYjNDLE1BQUFBLE1BQU0sQ0FBQ3BELFFBQVAsR0FBa0JvRCxNQUFNLENBQUN0RCxJQUFQLEdBQWNnRyxPQUFPLENBQUNSLEtBQVIsRUFBaEMsQ0FEYSxDQUViO0FBQ0E7QUFDQTs7QUFDQSxZQUFNWSxVQUFVLEdBQ2Q5QyxNQUFNLENBQUN0RCxJQUFQLElBQWVzRCxNQUFNLENBQUN0RCxJQUFQLENBQVlzRSxPQUFaLENBQW9CLEdBQXBCLElBQTJCLENBQTFDLEdBQ0loQixNQUFNLENBQUN0RCxJQUFQLENBQVlvQyxLQUFaLENBQWtCLEdBQWxCLENBREosR0FFSSxLQUhOOztBQUlBLFVBQUlnRSxVQUFKLEVBQWdCO0FBQ2Q5QyxRQUFBQSxNQUFNLENBQUN2RCxJQUFQLEdBQWNxRyxVQUFVLENBQUNaLEtBQVgsRUFBZDtBQUNBbEMsUUFBQUEsTUFBTSxDQUFDdEQsSUFBUCxHQUFjc0QsTUFBTSxDQUFDcEQsUUFBUCxHQUFrQmtHLFVBQVUsQ0FBQ1osS0FBWCxFQUFoQztBQUNEO0FBQ0Y7O0FBQ0RsQyxJQUFBQSxNQUFNLENBQUNsRCxNQUFQLEdBQWdCdUUsUUFBUSxDQUFDdkUsTUFBekI7QUFDQWtELElBQUFBLE1BQU0sQ0FBQ2pELEtBQVAsR0FBZXNFLFFBQVEsQ0FBQ3RFLEtBQXhCLENBbkJvRSxDQW9CcEU7O0FBQ0EsUUFBSWlELE1BQU0sQ0FBQ2hELFFBQVAsS0FBb0IsSUFBcEIsSUFBNEJnRCxNQUFNLENBQUNsRCxNQUFQLEtBQWtCLElBQWxELEVBQXdEO0FBQ3REa0QsTUFBQUEsTUFBTSxDQUFDL0MsSUFBUCxHQUNFLENBQUMrQyxNQUFNLENBQUNoRCxRQUFQLEdBQWtCZ0QsTUFBTSxDQUFDaEQsUUFBekIsR0FBb0MsRUFBckMsS0FDQ2dELE1BQU0sQ0FBQ2xELE1BQVAsR0FBZ0JrRCxNQUFNLENBQUNsRCxNQUF2QixHQUFnQyxFQURqQyxDQURGO0FBR0Q7O0FBQ0RrRCxJQUFBQSxNQUFNLENBQUM5QyxJQUFQLEdBQWM4QyxNQUFNLENBQUM1RCxNQUFQLEVBQWQ7QUFDQSxXQUFPNEQsTUFBUDtBQUNEOztBQUVELE1BQUksQ0FBQzBDLE9BQU8sQ0FBQzNELE1BQWIsRUFBcUI7QUFDbkI7QUFDQTtBQUNBaUIsSUFBQUEsTUFBTSxDQUFDaEQsUUFBUCxHQUFrQixJQUFsQixDQUhtQixDQUluQjs7QUFDQSxRQUFJZ0QsTUFBTSxDQUFDbEQsTUFBWCxFQUFtQjtBQUNqQmtELE1BQUFBLE1BQU0sQ0FBQy9DLElBQVAsR0FBYyxNQUFNK0MsTUFBTSxDQUFDbEQsTUFBM0I7QUFDRCxLQUZELE1BRU87QUFDTGtELE1BQUFBLE1BQU0sQ0FBQy9DLElBQVAsR0FBYyxJQUFkO0FBQ0Q7O0FBQ0QrQyxJQUFBQSxNQUFNLENBQUM5QyxJQUFQLEdBQWM4QyxNQUFNLENBQUM1RCxNQUFQLEVBQWQ7QUFDQSxXQUFPNEQsTUFBUDtBQUNELEdBbk04QyxDQXFNL0M7QUFDQTtBQUNBOzs7QUFDQSxNQUFJK0MsSUFBSSxHQUFHTCxPQUFPLENBQUN2RCxLQUFSLENBQWMsQ0FBQyxDQUFmLEVBQWtCLENBQWxCLENBQVg7QUFDQSxNQUFJNkQsZ0JBQWdCLEdBQ2pCLENBQUNoRCxNQUFNLENBQUN0RCxJQUFQLElBQWUyRSxRQUFRLENBQUMzRSxJQUF4QixJQUFnQ2dHLE9BQU8sQ0FBQzNELE1BQVIsR0FBaUIsQ0FBbEQsTUFDRWdFLElBQUksS0FBSyxHQUFULElBQWdCQSxJQUFJLEtBQUssSUFEM0IsQ0FBRCxJQUVBQSxJQUFJLEtBQUssRUFIWCxDQXpNK0MsQ0E4TS9DO0FBQ0E7O0FBQ0EsTUFBSUUsRUFBRSxHQUFHLENBQVQ7O0FBQ0EsT0FBSyxJQUFJckUsQ0FBQyxHQUFHOEQsT0FBTyxDQUFDM0QsTUFBckIsRUFBNkJILENBQUMsSUFBSSxDQUFsQyxFQUFxQ0EsQ0FBQyxFQUF0QyxFQUEwQztBQUN4Q21FLElBQUFBLElBQUksR0FBR0wsT0FBTyxDQUFDOUQsQ0FBRCxDQUFkOztBQUNBLFFBQUltRSxJQUFJLEtBQUssR0FBYixFQUFrQjtBQUNoQkcsTUFBQUEsU0FBUyxDQUFDUixPQUFELEVBQVU5RCxDQUFWLENBQVQ7QUFDRCxLQUZELE1BRU8sSUFBSW1FLElBQUksS0FBSyxJQUFiLEVBQW1CO0FBQ3hCRyxNQUFBQSxTQUFTLENBQUNSLE9BQUQsRUFBVTlELENBQVYsQ0FBVDtBQUNBcUUsTUFBQUEsRUFBRTtBQUNILEtBSE0sTUFHQSxJQUFJQSxFQUFKLEVBQVE7QUFDYkMsTUFBQUEsU0FBUyxDQUFDUixPQUFELEVBQVU5RCxDQUFWLENBQVQ7QUFDQXFFLE1BQUFBLEVBQUU7QUFDSDtBQUNGLEdBNU44QyxDQThOL0M7OztBQUNBLE1BQUksQ0FBQ1QsVUFBRCxJQUFlLENBQUNDLGFBQXBCLEVBQW1DO0FBQ2pDLFdBQU9RLEVBQUUsRUFBVCxFQUFhQSxFQUFiLEVBQWlCO0FBQ2ZQLE1BQUFBLE9BQU8sQ0FBQ1AsT0FBUixDQUFnQixJQUFoQjtBQUNEO0FBQ0Y7O0FBRUQsTUFDRUssVUFBVSxJQUNWRSxPQUFPLENBQUMsQ0FBRCxDQUFQLEtBQWUsRUFEZixLQUVDLENBQUNBLE9BQU8sQ0FBQyxDQUFELENBQVIsSUFBZUEsT0FBTyxDQUFDLENBQUQsQ0FBUCxDQUFXSixNQUFYLENBQWtCLENBQWxCLE1BQXlCLEdBRnpDLENBREYsRUFJRTtBQUNBSSxJQUFBQSxPQUFPLENBQUNQLE9BQVIsQ0FBZ0IsRUFBaEI7QUFDRDs7QUFFRCxNQUFJYSxnQkFBZ0IsSUFBSU4sT0FBTyxDQUFDTixJQUFSLENBQWEsR0FBYixFQUFrQmUsTUFBbEIsQ0FBeUIsQ0FBQyxDQUExQixNQUFpQyxHQUF6RCxFQUE4RDtBQUM1RFQsSUFBQUEsT0FBTyxDQUFDVSxJQUFSLENBQWEsRUFBYjtBQUNEOztBQUVELE1BQUlDLFVBQVUsR0FDWlgsT0FBTyxDQUFDLENBQUQsQ0FBUCxLQUFlLEVBQWYsSUFBc0JBLE9BQU8sQ0FBQyxDQUFELENBQVAsSUFBY0EsT0FBTyxDQUFDLENBQUQsQ0FBUCxDQUFXSixNQUFYLENBQWtCLENBQWxCLE1BQXlCLEdBRC9ELENBalArQyxDQW9QL0M7O0FBQ0EsTUFBSUssU0FBSixFQUFlO0FBQ2IsUUFBSVUsVUFBSixFQUFnQjtBQUNkckQsTUFBQUEsTUFBTSxDQUFDcEQsUUFBUCxHQUFrQm9ELE1BQU0sQ0FBQ3RELElBQVAsR0FBYyxFQUFoQztBQUNELEtBRkQsTUFFTztBQUNMc0QsTUFBQUEsTUFBTSxDQUFDcEQsUUFBUCxHQUFrQm9ELE1BQU0sQ0FBQ3RELElBQVAsR0FBY2dHLE9BQU8sQ0FBQzNELE1BQVIsR0FBaUIyRCxPQUFPLENBQUNSLEtBQVIsRUFBakIsR0FBbUMsRUFBbkU7QUFDRCxLQUxZLENBTWI7QUFDQTtBQUNBOzs7QUFDQSxVQUFNWSxVQUFVLEdBQ2Q5QyxNQUFNLENBQUN0RCxJQUFQLElBQWVzRCxNQUFNLENBQUN0RCxJQUFQLENBQVlzRSxPQUFaLENBQW9CLEdBQXBCLElBQTJCLENBQTFDLEdBQ0loQixNQUFNLENBQUN0RCxJQUFQLENBQVlvQyxLQUFaLENBQWtCLEdBQWxCLENBREosR0FFSSxLQUhOOztBQUlBLFFBQUlnRSxVQUFKLEVBQWdCO0FBQ2Q5QyxNQUFBQSxNQUFNLENBQUN2RCxJQUFQLEdBQWNxRyxVQUFVLENBQUNaLEtBQVgsRUFBZDtBQUNBbEMsTUFBQUEsTUFBTSxDQUFDdEQsSUFBUCxHQUFjc0QsTUFBTSxDQUFDcEQsUUFBUCxHQUFrQmtHLFVBQVUsQ0FBQ1osS0FBWCxFQUFoQztBQUNEO0FBQ0Y7O0FBRURNLEVBQUFBLFVBQVUsR0FBR0EsVUFBVSxJQUFLeEMsTUFBTSxDQUFDdEQsSUFBUCxJQUFlZ0csT0FBTyxDQUFDM0QsTUFBbkQ7O0FBRUEsTUFBSXlELFVBQVUsSUFBSSxDQUFDYSxVQUFuQixFQUErQjtBQUM3QlgsSUFBQUEsT0FBTyxDQUFDUCxPQUFSLENBQWdCLEVBQWhCO0FBQ0Q7O0FBRUQsTUFBSSxDQUFDTyxPQUFPLENBQUMzRCxNQUFiLEVBQXFCO0FBQ25CaUIsSUFBQUEsTUFBTSxDQUFDaEQsUUFBUCxHQUFrQixJQUFsQjtBQUNBZ0QsSUFBQUEsTUFBTSxDQUFDL0MsSUFBUCxHQUFjLElBQWQ7QUFDRCxHQUhELE1BR087QUFDTCtDLElBQUFBLE1BQU0sQ0FBQ2hELFFBQVAsR0FBa0IwRixPQUFPLENBQUNOLElBQVIsQ0FBYSxHQUFiLENBQWxCO0FBQ0QsR0FuUjhDLENBcVIvQzs7O0FBQ0EsTUFBSXBDLE1BQU0sQ0FBQ2hELFFBQVAsS0FBb0IsSUFBcEIsSUFBNEJnRCxNQUFNLENBQUNsRCxNQUFQLEtBQWtCLElBQWxELEVBQXdEO0FBQ3REa0QsSUFBQUEsTUFBTSxDQUFDL0MsSUFBUCxHQUNFLENBQUMrQyxNQUFNLENBQUNoRCxRQUFQLEdBQWtCZ0QsTUFBTSxDQUFDaEQsUUFBekIsR0FBb0MsRUFBckMsS0FDQ2dELE1BQU0sQ0FBQ2xELE1BQVAsR0FBZ0JrRCxNQUFNLENBQUNsRCxNQUF2QixHQUFnQyxFQURqQyxDQURGO0FBR0Q7O0FBQ0RrRCxFQUFBQSxNQUFNLENBQUN2RCxJQUFQLEdBQWM0RSxRQUFRLENBQUM1RSxJQUFULElBQWlCdUQsTUFBTSxDQUFDdkQsSUFBdEM7QUFDQXVELEVBQUFBLE1BQU0sQ0FBQ3hELE9BQVAsR0FBaUJ3RCxNQUFNLENBQUN4RCxPQUFQLElBQWtCNkUsUUFBUSxDQUFDN0UsT0FBNUM7QUFDQXdELEVBQUFBLE1BQU0sQ0FBQzlDLElBQVAsR0FBYzhDLE1BQU0sQ0FBQzVELE1BQVAsRUFBZDtBQUNBLFNBQU80RCxNQUFQO0FBQ0QsQ0EvUkQ7QUFpU0E7OztBQUNBMUQsR0FBRyxDQUFDK0IsU0FBSixDQUFjeUIsU0FBZCxHQUEwQixZQUFXO0FBQ25DLE1BQUlwRCxJQUFJLEdBQUcsS0FBS0EsSUFBaEI7QUFDQSxNQUFJQyxJQUFJLEdBQUdTLFdBQVcsQ0FBQ2lDLElBQVosQ0FBaUIzQyxJQUFqQixDQUFYOztBQUNBLE1BQUlDLElBQUosRUFBVTtBQUNSQSxJQUFBQSxJQUFJLEdBQUdBLElBQUksQ0FBQyxDQUFELENBQVg7O0FBQ0EsUUFBSUEsSUFBSSxLQUFLLEdBQWIsRUFBa0I7QUFDaEIsV0FBS0EsSUFBTCxHQUFZQSxJQUFJLENBQUN3QyxLQUFMLENBQVcsQ0FBWCxDQUFaO0FBQ0Q7O0FBQ0R6QyxJQUFBQSxJQUFJLEdBQUdBLElBQUksQ0FBQ3lDLEtBQUwsQ0FBVyxDQUFYLEVBQWN6QyxJQUFJLENBQUNxQyxNQUFMLEdBQWNwQyxJQUFJLENBQUNvQyxNQUFqQyxDQUFQO0FBQ0Q7O0FBQ0QsTUFBSXJDLElBQUosRUFBVSxLQUFLRSxRQUFMLEdBQWdCRixJQUFoQjtBQUNYLENBWEQsQyxDQWFBOztBQUNBOzs7QUFDQSxTQUFTd0csU0FBVCxDQUFtQkksSUFBbkIsRUFBeUJDLEtBQXpCLEVBQWdDO0FBQzlCLE9BQUssSUFBSTNFLENBQUMsR0FBRzJFLEtBQVIsRUFBZXZCLENBQUMsR0FBR3BELENBQUMsR0FBRyxDQUF2QixFQUEwQjRFLENBQUMsR0FBR0YsSUFBSSxDQUFDdkUsTUFBeEMsRUFBZ0RpRCxDQUFDLEdBQUd3QixDQUFwRCxFQUF1RDVFLENBQUMsSUFBSSxDQUFMLEVBQVFvRCxDQUFDLElBQUksQ0FBcEUsRUFDRXNCLElBQUksQ0FBQzFFLENBQUQsQ0FBSixHQUFVMEUsSUFBSSxDQUFDdEIsQ0FBRCxDQUFkOztBQUNGc0IsRUFBQUEsSUFBSSxDQUFDVixHQUFMO0FBQ0Q7O0FBRUQsSUFBSWEsUUFBUSxHQUFHLElBQUlDLEtBQUosQ0FBVSxHQUFWLENBQWY7O0FBQ0EsS0FBSyxJQUFJOUUsQ0FBQyxHQUFHLENBQWIsRUFBZ0JBLENBQUMsR0FBRyxHQUFwQixFQUF5QixFQUFFQSxDQUEzQixFQUNFNkUsUUFBUSxDQUFDN0UsQ0FBRCxDQUFSLEdBQWMsTUFBTSxDQUFDLENBQUNBLENBQUMsR0FBRyxFQUFKLEdBQVMsR0FBVCxHQUFlLEVBQWhCLElBQXNCQSxDQUFDLENBQUMrRSxRQUFGLENBQVcsRUFBWCxDQUF2QixFQUF1Q0MsV0FBdkMsRUFBcEI7QUFDRjs7O0FBQ0EsU0FBUzdDLFVBQVQsQ0FBb0I4QyxHQUFwQixFQUF5QjtBQUN2QjtBQUNBLE1BQUlDLEdBQUcsR0FBRyxFQUFWO0FBQ0EsTUFBSW5GLE9BQU8sR0FBRyxDQUFkOztBQUNBLE9BQUssSUFBSUMsQ0FBQyxHQUFHLENBQWIsRUFBZ0JBLENBQUMsR0FBR2lGLEdBQUcsQ0FBQzlFLE1BQXhCLEVBQWdDLEVBQUVILENBQWxDLEVBQXFDO0FBQ25DLFFBQUltRixDQUFDLEdBQUdGLEdBQUcsQ0FBQzVFLFVBQUosQ0FBZUwsQ0FBZixDQUFSLENBRG1DLENBR25DO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFDQSxRQUNFbUYsQ0FBQyxLQUFLLElBQU4sSUFDQUEsQ0FBQyxLQUFLLElBRE4sSUFFQUEsQ0FBQyxLQUFLLElBRk4sSUFHQUEsQ0FBQyxLQUFLLElBSE4sSUFJQUEsQ0FBQyxLQUFLLElBSk4sSUFLQ0EsQ0FBQyxJQUFJLElBQUwsSUFBYUEsQ0FBQyxJQUFJLElBTG5CLElBTUNBLENBQUMsSUFBSSxJQUFMLElBQWFBLENBQUMsSUFBSSxJQU5uQixJQU9DQSxDQUFDLElBQUksSUFBTCxJQUFhQSxDQUFDLElBQUksSUFQbkIsSUFRQ0EsQ0FBQyxJQUFJLElBQUwsSUFBYUEsQ0FBQyxJQUFJLElBVHJCLEVBVUU7QUFDQTtBQUNEOztBQUVELFFBQUluRixDQUFDLEdBQUdELE9BQUosR0FBYyxDQUFsQixFQUFxQm1GLEdBQUcsSUFBSUQsR0FBRyxDQUFDMUUsS0FBSixDQUFVUixPQUFWLEVBQW1CQyxDQUFuQixDQUFQO0FBRXJCRCxJQUFBQSxPQUFPLEdBQUdDLENBQUMsR0FBRyxDQUFkLENBekJtQyxDQTJCbkM7O0FBQ0EsUUFBSW1GLENBQUMsR0FBRyxJQUFSLEVBQWM7QUFDWkQsTUFBQUEsR0FBRyxJQUFJTCxRQUFRLENBQUNNLENBQUQsQ0FBZjtBQUNBO0FBQ0QsS0EvQmtDLENBaUNuQzs7O0FBQ0EsUUFBSUEsQ0FBQyxHQUFHLEtBQVIsRUFBZTtBQUNiRCxNQUFBQSxHQUFHLElBQUlMLFFBQVEsQ0FBQyxPQUFRTSxDQUFDLElBQUksQ0FBZCxDQUFSLEdBQTRCTixRQUFRLENBQUMsT0FBUU0sQ0FBQyxHQUFHLElBQWIsQ0FBM0M7QUFDQTtBQUNEOztBQUNELFFBQUlBLENBQUMsR0FBRyxNQUFKLElBQWNBLENBQUMsSUFBSSxNQUF2QixFQUErQjtBQUM3QkQsTUFBQUEsR0FBRyxJQUNETCxRQUFRLENBQUMsT0FBUU0sQ0FBQyxJQUFJLEVBQWQsQ0FBUixHQUNBTixRQUFRLENBQUMsT0FBU00sQ0FBQyxJQUFJLENBQU4sR0FBVyxJQUFwQixDQURSLEdBRUFOLFFBQVEsQ0FBQyxPQUFRTSxDQUFDLEdBQUcsSUFBYixDQUhWO0FBSUE7QUFDRCxLQTVDa0MsQ0E2Q25DOzs7QUFDQSxNQUFFbkYsQ0FBRjtBQUNBLFFBQUlvRixFQUFKO0FBQ0EsUUFBSXBGLENBQUMsR0FBR2lGLEdBQUcsQ0FBQzlFLE1BQVosRUFBb0JpRixFQUFFLEdBQUdILEdBQUcsQ0FBQzVFLFVBQUosQ0FBZUwsQ0FBZixJQUFvQixLQUF6QixDQUFwQixLQUNLb0YsRUFBRSxHQUFHLENBQUw7QUFDTEQsSUFBQUEsQ0FBQyxHQUFHLFdBQVksQ0FBQ0EsQ0FBQyxHQUFHLEtBQUwsS0FBZSxFQUFoQixHQUFzQkMsRUFBakMsQ0FBSjtBQUNBRixJQUFBQSxHQUFHLElBQ0RMLFFBQVEsQ0FBQyxPQUFRTSxDQUFDLElBQUksRUFBZCxDQUFSLEdBQ0FOLFFBQVEsQ0FBQyxPQUFTTSxDQUFDLElBQUksRUFBTixHQUFZLElBQXJCLENBRFIsR0FFQU4sUUFBUSxDQUFDLE9BQVNNLENBQUMsSUFBSSxDQUFOLEdBQVcsSUFBcEIsQ0FGUixHQUdBTixRQUFRLENBQUMsT0FBUU0sQ0FBQyxHQUFHLElBQWIsQ0FKVjtBQUtEOztBQUNELE1BQUlwRixPQUFPLEtBQUssQ0FBaEIsRUFBbUIsT0FBT2tGLEdBQVA7QUFDbkIsTUFBSWxGLE9BQU8sR0FBR2tGLEdBQUcsQ0FBQzlFLE1BQWxCLEVBQTBCLE9BQU8rRSxHQUFHLEdBQUdELEdBQUcsQ0FBQzFFLEtBQUosQ0FBVVIsT0FBVixDQUFiO0FBQzFCLFNBQU9tRixHQUFQO0FBQ0QiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBBIHNsaWdodGx5IHBhdGNoZWQgdmVyc2lvbiBvZiBub2RlJ3MgdXJsIG1vZHVsZSwgd2l0aCBzdXBwb3J0IGZvciBtb25nb2RiOi8vXG4vLyB1cmlzLlxuLy9cbi8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbm9kZWpzL25vZGUvYmxvYi9tYXN0ZXIvTElDRU5TRSBmb3IgbGljZW5zaW5nXG4vLyBpbmZvcm1hdGlvblxuXG4ndXNlIHN0cmljdCc7XG5cbmNvbnN0IHB1bnljb2RlID0gcmVxdWlyZSgncHVueWNvZGUnKTtcblxuZXhwb3J0cy5wYXJzZSA9IHVybFBhcnNlO1xuZXhwb3J0cy5yZXNvbHZlID0gdXJsUmVzb2x2ZTtcbmV4cG9ydHMucmVzb2x2ZU9iamVjdCA9IHVybFJlc29sdmVPYmplY3Q7XG5leHBvcnRzLmZvcm1hdCA9IHVybEZvcm1hdDtcblxuZXhwb3J0cy5VcmwgPSBVcmw7XG5cbmZ1bmN0aW9uIFVybCgpIHtcbiAgdGhpcy5wcm90b2NvbCA9IG51bGw7XG4gIHRoaXMuc2xhc2hlcyA9IG51bGw7XG4gIHRoaXMuYXV0aCA9IG51bGw7XG4gIHRoaXMuaG9zdCA9IG51bGw7XG4gIHRoaXMucG9ydCA9IG51bGw7XG4gIHRoaXMuaG9zdG5hbWUgPSBudWxsO1xuICB0aGlzLmhhc2ggPSBudWxsO1xuICB0aGlzLnNlYXJjaCA9IG51bGw7XG4gIHRoaXMucXVlcnkgPSBudWxsO1xuICB0aGlzLnBhdGhuYW1lID0gbnVsbDtcbiAgdGhpcy5wYXRoID0gbnVsbDtcbiAgdGhpcy5ocmVmID0gbnVsbDtcbn1cblxuLy8gUmVmZXJlbmNlOiBSRkMgMzk4NiwgUkZDIDE4MDgsIFJGQyAyMzk2XG5cbi8vIGRlZmluZSB0aGVzZSBoZXJlIHNvIGF0IGxlYXN0IHRoZXkgb25seSBoYXZlIHRvIGJlXG4vLyBjb21waWxlZCBvbmNlIG9uIHRoZSBmaXJzdCBtb2R1bGUgbG9hZC5cbmNvbnN0IHByb3RvY29sUGF0dGVybiA9IC9eKFthLXowLTkuKy1dKzopL2k7XG5jb25zdCBwb3J0UGF0dGVybiA9IC86WzAtOV0qJC87XG5cbi8vIFNwZWNpYWwgY2FzZSBmb3IgYSBzaW1wbGUgcGF0aCBVUkxcbmNvbnN0IHNpbXBsZVBhdGhQYXR0ZXJuID0gL14oXFwvXFwvPyg/IVxcLylbXlxcP1xcc10qKShcXD9bXlxcc10qKT8kLztcblxuY29uc3QgaG9zdG5hbWVNYXhMZW4gPSAyNTU7XG4vLyBwcm90b2NvbHMgdGhhdCBjYW4gYWxsb3cgXCJ1bnNhZmVcIiBhbmQgXCJ1bndpc2VcIiBjaGFycy5cbmNvbnN0IHVuc2FmZVByb3RvY29sID0ge1xuICBqYXZhc2NyaXB0OiB0cnVlLFxuICAnamF2YXNjcmlwdDonOiB0cnVlLFxufTtcbi8vIHByb3RvY29scyB0aGF0IG5ldmVyIGhhdmUgYSBob3N0bmFtZS5cbmNvbnN0IGhvc3RsZXNzUHJvdG9jb2wgPSB7XG4gIGphdmFzY3JpcHQ6IHRydWUsXG4gICdqYXZhc2NyaXB0Oic6IHRydWUsXG59O1xuLy8gcHJvdG9jb2xzIHRoYXQgYWx3YXlzIGNvbnRhaW4gYSAvLyBiaXQuXG5jb25zdCBzbGFzaGVkUHJvdG9jb2wgPSB7XG4gIGh0dHA6IHRydWUsXG4gICdodHRwOic6IHRydWUsXG4gIGh0dHBzOiB0cnVlLFxuICAnaHR0cHM6JzogdHJ1ZSxcbiAgZnRwOiB0cnVlLFxuICAnZnRwOic6IHRydWUsXG4gIGdvcGhlcjogdHJ1ZSxcbiAgJ2dvcGhlcjonOiB0cnVlLFxuICBmaWxlOiB0cnVlLFxuICAnZmlsZTonOiB0cnVlLFxufTtcbmNvbnN0IHF1ZXJ5c3RyaW5nID0gcmVxdWlyZSgncXVlcnlzdHJpbmcnKTtcblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cbmZ1bmN0aW9uIHVybFBhcnNlKHVybCwgcGFyc2VRdWVyeVN0cmluZywgc2xhc2hlc0Rlbm90ZUhvc3QpIHtcbiAgaWYgKHVybCBpbnN0YW5jZW9mIFVybCkgcmV0dXJuIHVybDtcblxuICB2YXIgdSA9IG5ldyBVcmwoKTtcbiAgdS5wYXJzZSh1cmwsIHBhcnNlUXVlcnlTdHJpbmcsIHNsYXNoZXNEZW5vdGVIb3N0KTtcbiAgcmV0dXJuIHU7XG59XG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5VcmwucHJvdG90eXBlLnBhcnNlID0gZnVuY3Rpb24odXJsLCBwYXJzZVF1ZXJ5U3RyaW5nLCBzbGFzaGVzRGVub3RlSG9zdCkge1xuICBpZiAodHlwZW9mIHVybCAhPT0gJ3N0cmluZycpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdQYXJhbWV0ZXIgXCJ1cmxcIiBtdXN0IGJlIGEgc3RyaW5nLCBub3QgJyArIHR5cGVvZiB1cmwpO1xuICB9XG5cbiAgLy8gQ29weSBjaHJvbWUsIElFLCBvcGVyYSBiYWNrc2xhc2gtaGFuZGxpbmcgYmVoYXZpb3IuXG4gIC8vIEJhY2sgc2xhc2hlcyBiZWZvcmUgdGhlIHF1ZXJ5IHN0cmluZyBnZXQgY29udmVydGVkIHRvIGZvcndhcmQgc2xhc2hlc1xuICAvLyBTZWU6IGh0dHBzOi8vY29kZS5nb29nbGUuY29tL3AvY2hyb21pdW0vaXNzdWVzL2RldGFpbD9pZD0yNTkxNlxuICB2YXIgaGFzSGFzaCA9IGZhbHNlO1xuICB2YXIgc3RhcnQgPSAtMTtcbiAgdmFyIGVuZCA9IC0xO1xuICB2YXIgcmVzdCA9ICcnO1xuICB2YXIgbGFzdFBvcyA9IDA7XG4gIHZhciBpID0gMDtcbiAgZm9yICh2YXIgaW5XcyA9IGZhbHNlLCBzcGxpdCA9IGZhbHNlOyBpIDwgdXJsLmxlbmd0aDsgKytpKSB7XG4gICAgY29uc3QgY29kZSA9IHVybC5jaGFyQ29kZUF0KGkpO1xuXG4gICAgLy8gRmluZCBmaXJzdCBhbmQgbGFzdCBub24td2hpdGVzcGFjZSBjaGFyYWN0ZXJzIGZvciB0cmltbWluZ1xuICAgIGNvbnN0IGlzV3MgPVxuICAgICAgY29kZSA9PT0gMzIgLyogKi8gfHxcbiAgICAgIGNvZGUgPT09IDkgLypcXHQqLyB8fFxuICAgICAgY29kZSA9PT0gMTMgLypcXHIqLyB8fFxuICAgICAgY29kZSA9PT0gMTAgLypcXG4qLyB8fFxuICAgICAgY29kZSA9PT0gMTIgLypcXGYqLyB8fFxuICAgICAgY29kZSA9PT0gMTYwIC8qXFx1MDBBMCovIHx8XG4gICAgICBjb2RlID09PSA2NTI3OTsgLypcXHVGRUZGKi9cbiAgICBpZiAoc3RhcnQgPT09IC0xKSB7XG4gICAgICBpZiAoaXNXcykgY29udGludWU7XG4gICAgICBsYXN0UG9zID0gc3RhcnQgPSBpO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoaW5Xcykge1xuICAgICAgICBpZiAoIWlzV3MpIHtcbiAgICAgICAgICBlbmQgPSAtMTtcbiAgICAgICAgICBpbldzID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoaXNXcykge1xuICAgICAgICBlbmQgPSBpO1xuICAgICAgICBpbldzID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBPbmx5IGNvbnZlcnQgYmFja3NsYXNoZXMgd2hpbGUgd2UgaGF2ZW4ndCBzZWVuIGEgc3BsaXQgY2hhcmFjdGVyXG4gICAgaWYgKCFzcGxpdCkge1xuICAgICAgc3dpdGNoIChjb2RlKSB7XG4gICAgICAgIGNhc2UgMzU6IC8vICcjJ1xuICAgICAgICAgIGhhc0hhc2ggPSB0cnVlO1xuICAgICAgICAvLyBGYWxsIHRocm91Z2hcbiAgICAgICAgY2FzZSA2MzogLy8gJz8nXG4gICAgICAgICAgc3BsaXQgPSB0cnVlO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIDkyOiAvLyAnXFxcXCdcbiAgICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSByZXN0ICs9IHVybC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgICByZXN0ICs9ICcvJztcbiAgICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICghaGFzSGFzaCAmJiBjb2RlID09PSAzNSAvKiMqLykge1xuICAgICAgaGFzSGFzaCA9IHRydWU7XG4gICAgfVxuICB9XG5cbiAgLy8gQ2hlY2sgaWYgc3RyaW5nIHdhcyBub24tZW1wdHkgKGluY2x1ZGluZyBzdHJpbmdzIHdpdGggb25seSB3aGl0ZXNwYWNlKVxuICBpZiAoc3RhcnQgIT09IC0xKSB7XG4gICAgaWYgKGxhc3RQb3MgPT09IHN0YXJ0KSB7XG4gICAgICAvLyBXZSBkaWRuJ3QgY29udmVydCBhbnkgYmFja3NsYXNoZXNcblxuICAgICAgaWYgKGVuZCA9PT0gLTEpIHtcbiAgICAgICAgaWYgKHN0YXJ0ID09PSAwKSByZXN0ID0gdXJsO1xuICAgICAgICBlbHNlIHJlc3QgPSB1cmwuc2xpY2Uoc3RhcnQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdCA9IHVybC5zbGljZShzdGFydCwgZW5kKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGVuZCA9PT0gLTEgJiYgbGFzdFBvcyA8IHVybC5sZW5ndGgpIHtcbiAgICAgIC8vIFdlIGNvbnZlcnRlZCBzb21lIGJhY2tzbGFzaGVzIGFuZCBoYXZlIG9ubHkgcGFydCBvZiB0aGUgZW50aXJlIHN0cmluZ1xuICAgICAgcmVzdCArPSB1cmwuc2xpY2UobGFzdFBvcyk7XG4gICAgfSBlbHNlIGlmIChlbmQgIT09IC0xICYmIGxhc3RQb3MgPCBlbmQpIHtcbiAgICAgIC8vIFdlIGNvbnZlcnRlZCBzb21lIGJhY2tzbGFzaGVzIGFuZCBoYXZlIG9ubHkgcGFydCBvZiB0aGUgZW50aXJlIHN0cmluZ1xuICAgICAgcmVzdCArPSB1cmwuc2xpY2UobGFzdFBvcywgZW5kKTtcbiAgICB9XG4gIH1cblxuICBpZiAoIXNsYXNoZXNEZW5vdGVIb3N0ICYmICFoYXNIYXNoKSB7XG4gICAgLy8gVHJ5IGZhc3QgcGF0aCByZWdleHBcbiAgICBjb25zdCBzaW1wbGVQYXRoID0gc2ltcGxlUGF0aFBhdHRlcm4uZXhlYyhyZXN0KTtcbiAgICBpZiAoc2ltcGxlUGF0aCkge1xuICAgICAgdGhpcy5wYXRoID0gcmVzdDtcbiAgICAgIHRoaXMuaHJlZiA9IHJlc3Q7XG4gICAgICB0aGlzLnBhdGhuYW1lID0gc2ltcGxlUGF0aFsxXTtcbiAgICAgIGlmIChzaW1wbGVQYXRoWzJdKSB7XG4gICAgICAgIHRoaXMuc2VhcmNoID0gc2ltcGxlUGF0aFsyXTtcbiAgICAgICAgaWYgKHBhcnNlUXVlcnlTdHJpbmcpIHtcbiAgICAgICAgICB0aGlzLnF1ZXJ5ID0gcXVlcnlzdHJpbmcucGFyc2UodGhpcy5zZWFyY2guc2xpY2UoMSkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMucXVlcnkgPSB0aGlzLnNlYXJjaC5zbGljZSgxKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChwYXJzZVF1ZXJ5U3RyaW5nKSB7XG4gICAgICAgIHRoaXMuc2VhcmNoID0gJyc7XG4gICAgICAgIHRoaXMucXVlcnkgPSB7fTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgfVxuXG4gIHZhciBwcm90byA9IHByb3RvY29sUGF0dGVybi5leGVjKHJlc3QpO1xuICBpZiAocHJvdG8pIHtcbiAgICBwcm90byA9IHByb3RvWzBdO1xuICAgIHZhciBsb3dlclByb3RvID0gcHJvdG8udG9Mb3dlckNhc2UoKTtcbiAgICB0aGlzLnByb3RvY29sID0gbG93ZXJQcm90bztcbiAgICByZXN0ID0gcmVzdC5zbGljZShwcm90by5sZW5ndGgpO1xuICB9XG5cbiAgLy8gZmlndXJlIG91dCBpZiBpdCdzIGdvdCBhIGhvc3RcbiAgLy8gdXNlckBzZXJ2ZXIgaXMgKmFsd2F5cyogaW50ZXJwcmV0ZWQgYXMgYSBob3N0bmFtZSwgYW5kIHVybFxuICAvLyByZXNvbHV0aW9uIHdpbGwgdHJlYXQgLy9mb28vYmFyIGFzIGhvc3Q9Zm9vLHBhdGg9YmFyIGJlY2F1c2UgdGhhdCdzXG4gIC8vIGhvdyB0aGUgYnJvd3NlciByZXNvbHZlcyByZWxhdGl2ZSBVUkxzLlxuICBpZiAoc2xhc2hlc0Rlbm90ZUhvc3QgfHwgcHJvdG8gfHwgL15cXC9cXC9bXkBcXC9dK0BbXkBcXC9dKy8udGVzdChyZXN0KSkge1xuICAgIHZhciBzbGFzaGVzID1cbiAgICAgIHJlc3QuY2hhckNvZGVBdCgwKSA9PT0gNDcgLyovKi8gJiYgcmVzdC5jaGFyQ29kZUF0KDEpID09PSA0NzsgLyovKi9cbiAgICBpZiAoc2xhc2hlcyAmJiAhKHByb3RvICYmIGhvc3RsZXNzUHJvdG9jb2xbcHJvdG9dKSkge1xuICAgICAgcmVzdCA9IHJlc3Quc2xpY2UoMik7XG4gICAgICB0aGlzLnNsYXNoZXMgPSB0cnVlO1xuICAgIH1cbiAgfVxuXG4gIGlmIChcbiAgICAhaG9zdGxlc3NQcm90b2NvbFtwcm90b10gJiZcbiAgICAoc2xhc2hlcyB8fCAocHJvdG8gJiYgIXNsYXNoZWRQcm90b2NvbFtwcm90b10pKVxuICApIHtcbiAgICAvLyB0aGVyZSdzIGEgaG9zdG5hbWUuXG4gICAgLy8gdGhlIGZpcnN0IGluc3RhbmNlIG9mIC8sID8sIDssIG9yICMgZW5kcyB0aGUgaG9zdC5cbiAgICAvL1xuICAgIC8vIElmIHRoZXJlIGlzIGFuIEAgaW4gdGhlIGhvc3RuYW1lLCB0aGVuIG5vbi1ob3N0IGNoYXJzICphcmUqIGFsbG93ZWRcbiAgICAvLyB0byB0aGUgbGVmdCBvZiB0aGUgbGFzdCBAIHNpZ24sIHVubGVzcyBzb21lIGhvc3QtZW5kaW5nIGNoYXJhY3RlclxuICAgIC8vIGNvbWVzICpiZWZvcmUqIHRoZSBALXNpZ24uXG4gICAgLy8gVVJMcyBhcmUgb2Jub3hpb3VzLlxuICAgIC8vXG4gICAgLy8gZXg6XG4gICAgLy8gaHR0cDovL2FAYkBjLyA9PiB1c2VyOmFAYiBob3N0OmNcbiAgICAvLyBodHRwOi8vYUBiP0BjID0+IHVzZXI6YSBob3N0OmIgcGF0aDovP0BjXG5cbiAgICAvLyB2MC4xMiBUT0RPKGlzYWFjcyk6IFRoaXMgaXMgbm90IHF1aXRlIGhvdyBDaHJvbWUgZG9lcyB0aGluZ3MuXG4gICAgLy8gUmV2aWV3IG91ciB0ZXN0IGNhc2UgYWdhaW5zdCBicm93c2VycyBtb3JlIGNvbXByZWhlbnNpdmVseS5cblxuICAgIHZhciBob3N0RW5kID0gLTE7XG4gICAgdmFyIGF0U2lnbiA9IC0xO1xuICAgIHZhciBub25Ib3N0ID0gLTE7XG4gICAgZm9yIChpID0gMDsgaSA8IHJlc3QubGVuZ3RoOyArK2kpIHtcbiAgICAgIHN3aXRjaCAocmVzdC5jaGFyQ29kZUF0KGkpKSB7XG4gICAgICAgIGNhc2UgOTogLy8gJ1xcdCdcbiAgICAgICAgY2FzZSAxMDogLy8gJ1xcbidcbiAgICAgICAgY2FzZSAxMzogLy8gJ1xccidcbiAgICAgICAgY2FzZSAzMjogLy8gJyAnXG4gICAgICAgIGNhc2UgMzQ6IC8vICdcIidcbiAgICAgICAgY2FzZSAzNzogLy8gJyUnXG4gICAgICAgIGNhc2UgMzk6IC8vICdcXCcnXG4gICAgICAgIGNhc2UgNTk6IC8vICc7J1xuICAgICAgICBjYXNlIDYwOiAvLyAnPCdcbiAgICAgICAgY2FzZSA2MjogLy8gJz4nXG4gICAgICAgIGNhc2UgOTI6IC8vICdcXFxcJ1xuICAgICAgICBjYXNlIDk0OiAvLyAnXidcbiAgICAgICAgY2FzZSA5NjogLy8gJ2AnXG4gICAgICAgIGNhc2UgMTIzOiAvLyAneydcbiAgICAgICAgY2FzZSAxMjQ6IC8vICd8J1xuICAgICAgICBjYXNlIDEyNTogLy8gJ30nXG4gICAgICAgICAgLy8gQ2hhcmFjdGVycyB0aGF0IGFyZSBuZXZlciBldmVyIGFsbG93ZWQgaW4gYSBob3N0bmFtZSBmcm9tIFJGQyAyMzk2XG4gICAgICAgICAgaWYgKG5vbkhvc3QgPT09IC0xKSBub25Ib3N0ID0gaTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAzNTogLy8gJyMnXG4gICAgICAgIGNhc2UgNDc6IC8vICcvJ1xuICAgICAgICBjYXNlIDYzOiAvLyAnPydcbiAgICAgICAgICAvLyBGaW5kIHRoZSBmaXJzdCBpbnN0YW5jZSBvZiBhbnkgaG9zdC1lbmRpbmcgY2hhcmFjdGVyc1xuICAgICAgICAgIGlmIChub25Ib3N0ID09PSAtMSkgbm9uSG9zdCA9IGk7XG4gICAgICAgICAgaG9zdEVuZCA9IGk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgNjQ6IC8vICdAJ1xuICAgICAgICAgIC8vIEF0IHRoaXMgcG9pbnQsIGVpdGhlciB3ZSBoYXZlIGFuIGV4cGxpY2l0IHBvaW50IHdoZXJlIHRoZVxuICAgICAgICAgIC8vIGF1dGggcG9ydGlvbiBjYW5ub3QgZ28gcGFzdCwgb3IgdGhlIGxhc3QgQCBjaGFyIGlzIHRoZSBkZWNpZGVyLlxuICAgICAgICAgIGF0U2lnbiA9IGk7XG4gICAgICAgICAgbm9uSG9zdCA9IC0xO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgaWYgKGhvc3RFbmQgIT09IC0xKSBicmVhaztcbiAgICB9XG4gICAgc3RhcnQgPSAwO1xuICAgIGlmIChhdFNpZ24gIT09IC0xKSB7XG4gICAgICB0aGlzLmF1dGggPSBkZWNvZGVVUklDb21wb25lbnQocmVzdC5zbGljZSgwLCBhdFNpZ24pKTtcbiAgICAgIHN0YXJ0ID0gYXRTaWduICsgMTtcbiAgICB9XG4gICAgaWYgKG5vbkhvc3QgPT09IC0xKSB7XG4gICAgICB0aGlzLmhvc3QgPSByZXN0LnNsaWNlKHN0YXJ0KTtcbiAgICAgIHJlc3QgPSAnJztcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5ob3N0ID0gcmVzdC5zbGljZShzdGFydCwgbm9uSG9zdCk7XG4gICAgICByZXN0ID0gcmVzdC5zbGljZShub25Ib3N0KTtcbiAgICB9XG5cbiAgICAvLyBwdWxsIG91dCBwb3J0LlxuICAgIHRoaXMucGFyc2VIb3N0KCk7XG5cbiAgICAvLyB3ZSd2ZSBpbmRpY2F0ZWQgdGhhdCB0aGVyZSBpcyBhIGhvc3RuYW1lLFxuICAgIC8vIHNvIGV2ZW4gaWYgaXQncyBlbXB0eSwgaXQgaGFzIHRvIGJlIHByZXNlbnQuXG4gICAgaWYgKHR5cGVvZiB0aGlzLmhvc3RuYW1lICE9PSAnc3RyaW5nJykgdGhpcy5ob3N0bmFtZSA9ICcnO1xuXG4gICAgdmFyIGhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZTtcblxuICAgIC8vIGlmIGhvc3RuYW1lIGJlZ2lucyB3aXRoIFsgYW5kIGVuZHMgd2l0aCBdXG4gICAgLy8gYXNzdW1lIHRoYXQgaXQncyBhbiBJUHY2IGFkZHJlc3MuXG4gICAgdmFyIGlwdjZIb3N0bmFtZSA9XG4gICAgICBob3N0bmFtZS5jaGFyQ29kZUF0KDApID09PSA5MSAvKlsqLyAmJlxuICAgICAgaG9zdG5hbWUuY2hhckNvZGVBdChob3N0bmFtZS5sZW5ndGggLSAxKSA9PT0gOTM7IC8qXSovXG5cbiAgICAvLyB2YWxpZGF0ZSBhIGxpdHRsZS5cbiAgICBpZiAoIWlwdjZIb3N0bmFtZSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gdmFsaWRhdGVIb3N0bmFtZSh0aGlzLCByZXN0LCBob3N0bmFtZSk7XG4gICAgICBpZiAocmVzdWx0ICE9PSB1bmRlZmluZWQpIHJlc3QgPSByZXN1bHQ7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuaG9zdG5hbWUubGVuZ3RoID4gaG9zdG5hbWVNYXhMZW4pIHtcbiAgICAgIHRoaXMuaG9zdG5hbWUgPSAnJztcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gaG9zdG5hbWVzIGFyZSBhbHdheXMgbG93ZXIgY2FzZS5cbiAgICAgIHRoaXMuaG9zdG5hbWUgPSB0aGlzLmhvc3RuYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgfVxuXG4gICAgaWYgKCFpcHY2SG9zdG5hbWUpIHtcbiAgICAgIC8vIElETkEgU3VwcG9ydDogUmV0dXJucyBhIHB1bnljb2RlZCByZXByZXNlbnRhdGlvbiBvZiBcImRvbWFpblwiLlxuICAgICAgLy8gSXQgb25seSBjb252ZXJ0cyBwYXJ0cyBvZiB0aGUgZG9tYWluIG5hbWUgdGhhdFxuICAgICAgLy8gaGF2ZSBub24tQVNDSUkgY2hhcmFjdGVycywgaS5lLiBpdCBkb2Vzbid0IG1hdHRlciBpZlxuICAgICAgLy8geW91IGNhbGwgaXQgd2l0aCBhIGRvbWFpbiB0aGF0IGFscmVhZHkgaXMgQVNDSUktb25seS5cbiAgICAgIHRoaXMuaG9zdG5hbWUgPSBwdW55Y29kZS50b0FTQ0lJKHRoaXMuaG9zdG5hbWUpO1xuICAgIH1cblxuICAgIHZhciBwID0gdGhpcy5wb3J0ID8gJzonICsgdGhpcy5wb3J0IDogJyc7XG4gICAgdmFyIGggPSB0aGlzLmhvc3RuYW1lIHx8ICcnO1xuICAgIHRoaXMuaG9zdCA9IGggKyBwO1xuXG4gICAgLy8gc3RyaXAgWyBhbmQgXSBmcm9tIHRoZSBob3N0bmFtZVxuICAgIC8vIHRoZSBob3N0IGZpZWxkIHN0aWxsIHJldGFpbnMgdGhlbSwgdGhvdWdoXG4gICAgaWYgKGlwdjZIb3N0bmFtZSkge1xuICAgICAgdGhpcy5ob3N0bmFtZSA9IHRoaXMuaG9zdG5hbWUuc2xpY2UoMSwgLTEpO1xuICAgICAgaWYgKHJlc3RbMF0gIT09ICcvJykge1xuICAgICAgICByZXN0ID0gJy8nICsgcmVzdDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBub3cgcmVzdCBpcyBzZXQgdG8gdGhlIHBvc3QtaG9zdCBzdHVmZi5cbiAgLy8gY2hvcCBvZmYgYW55IGRlbGltIGNoYXJzLlxuICBpZiAoIXVuc2FmZVByb3RvY29sW2xvd2VyUHJvdG9dKSB7XG4gICAgLy8gRmlyc3QsIG1ha2UgMTAwJSBzdXJlIHRoYXQgYW55IFwiYXV0b0VzY2FwZVwiIGNoYXJzIGdldFxuICAgIC8vIGVzY2FwZWQsIGV2ZW4gaWYgZW5jb2RlVVJJQ29tcG9uZW50IGRvZXNuJ3QgdGhpbmsgdGhleVxuICAgIC8vIG5lZWQgdG8gYmUuXG4gICAgY29uc3QgcmVzdWx0ID0gYXV0b0VzY2FwZVN0cihyZXN0KTtcbiAgICBpZiAocmVzdWx0ICE9PSB1bmRlZmluZWQpIHJlc3QgPSByZXN1bHQ7XG4gIH1cblxuICB2YXIgcXVlc3Rpb25JZHggPSAtMTtcbiAgdmFyIGhhc2hJZHggPSAtMTtcbiAgZm9yIChpID0gMDsgaSA8IHJlc3QubGVuZ3RoOyArK2kpIHtcbiAgICBjb25zdCBjb2RlID0gcmVzdC5jaGFyQ29kZUF0KGkpO1xuICAgIGlmIChjb2RlID09PSAzNSAvKiMqLykge1xuICAgICAgdGhpcy5oYXNoID0gcmVzdC5zbGljZShpKTtcbiAgICAgIGhhc2hJZHggPSBpO1xuICAgICAgYnJlYWs7XG4gICAgfSBlbHNlIGlmIChjb2RlID09PSA2MyAvKj8qLyAmJiBxdWVzdGlvbklkeCA9PT0gLTEpIHtcbiAgICAgIHF1ZXN0aW9uSWR4ID0gaTtcbiAgICB9XG4gIH1cblxuICBpZiAocXVlc3Rpb25JZHggIT09IC0xKSB7XG4gICAgaWYgKGhhc2hJZHggPT09IC0xKSB7XG4gICAgICB0aGlzLnNlYXJjaCA9IHJlc3Quc2xpY2UocXVlc3Rpb25JZHgpO1xuICAgICAgdGhpcy5xdWVyeSA9IHJlc3Quc2xpY2UocXVlc3Rpb25JZHggKyAxKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5zZWFyY2ggPSByZXN0LnNsaWNlKHF1ZXN0aW9uSWR4LCBoYXNoSWR4KTtcbiAgICAgIHRoaXMucXVlcnkgPSByZXN0LnNsaWNlKHF1ZXN0aW9uSWR4ICsgMSwgaGFzaElkeCk7XG4gICAgfVxuICAgIGlmIChwYXJzZVF1ZXJ5U3RyaW5nKSB7XG4gICAgICB0aGlzLnF1ZXJ5ID0gcXVlcnlzdHJpbmcucGFyc2UodGhpcy5xdWVyeSk7XG4gICAgfVxuICB9IGVsc2UgaWYgKHBhcnNlUXVlcnlTdHJpbmcpIHtcbiAgICAvLyBubyBxdWVyeSBzdHJpbmcsIGJ1dCBwYXJzZVF1ZXJ5U3RyaW5nIHN0aWxsIHJlcXVlc3RlZFxuICAgIHRoaXMuc2VhcmNoID0gJyc7XG4gICAgdGhpcy5xdWVyeSA9IHt9O1xuICB9XG5cbiAgdmFyIGZpcnN0SWR4ID1cbiAgICBxdWVzdGlvbklkeCAhPT0gLTEgJiYgKGhhc2hJZHggPT09IC0xIHx8IHF1ZXN0aW9uSWR4IDwgaGFzaElkeClcbiAgICAgID8gcXVlc3Rpb25JZHhcbiAgICAgIDogaGFzaElkeDtcbiAgaWYgKGZpcnN0SWR4ID09PSAtMSkge1xuICAgIGlmIChyZXN0Lmxlbmd0aCA+IDApIHRoaXMucGF0aG5hbWUgPSByZXN0O1xuICB9IGVsc2UgaWYgKGZpcnN0SWR4ID4gMCkge1xuICAgIHRoaXMucGF0aG5hbWUgPSByZXN0LnNsaWNlKDAsIGZpcnN0SWR4KTtcbiAgfVxuICBpZiAoc2xhc2hlZFByb3RvY29sW2xvd2VyUHJvdG9dICYmIHRoaXMuaG9zdG5hbWUgJiYgIXRoaXMucGF0aG5hbWUpIHtcbiAgICB0aGlzLnBhdGhuYW1lID0gJy8nO1xuICB9XG5cbiAgLy8gdG8gc3VwcG9ydCBodHRwLnJlcXVlc3RcbiAgaWYgKHRoaXMucGF0aG5hbWUgfHwgdGhpcy5zZWFyY2gpIHtcbiAgICBjb25zdCBwID0gdGhpcy5wYXRobmFtZSB8fCAnJztcbiAgICBjb25zdCBzID0gdGhpcy5zZWFyY2ggfHwgJyc7XG4gICAgdGhpcy5wYXRoID0gcCArIHM7XG4gIH1cblxuICAvLyBmaW5hbGx5LCByZWNvbnN0cnVjdCB0aGUgaHJlZiBiYXNlZCBvbiB3aGF0IGhhcyBiZWVuIHZhbGlkYXRlZC5cbiAgdGhpcy5ocmVmID0gdGhpcy5mb3JtYXQoKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuZnVuY3Rpb24gdmFsaWRhdGVIb3N0bmFtZShzZWxmLCByZXN0LCBob3N0bmFtZSkge1xuICBmb3IgKHZhciBpID0gMCwgbGFzdFBvczsgaSA8PSBob3N0bmFtZS5sZW5ndGg7ICsraSkge1xuICAgIHZhciBjb2RlO1xuICAgIGlmIChpIDwgaG9zdG5hbWUubGVuZ3RoKSBjb2RlID0gaG9zdG5hbWUuY2hhckNvZGVBdChpKTtcbiAgICBpZiAoY29kZSA9PT0gNDYgLyouKi8gfHwgaSA9PT0gaG9zdG5hbWUubGVuZ3RoKSB7XG4gICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSB7XG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDYzKSB7XG4gICAgICAgICAgc2VsZi5ob3N0bmFtZSA9IGhvc3RuYW1lLnNsaWNlKDAsIGxhc3RQb3MgKyA2Myk7XG4gICAgICAgICAgcmV0dXJuICcvJyArIGhvc3RuYW1lLnNsaWNlKGxhc3RQb3MgKyA2MykgKyByZXN0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICBjb250aW51ZTtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgKGNvZGUgPj0gNDggLyowKi8gJiYgY29kZSA8PSA1NykgLyo5Ki8gfHxcbiAgICAgIChjb2RlID49IDk3IC8qYSovICYmIGNvZGUgPD0gMTIyKSAvKnoqLyB8fFxuICAgICAgY29kZSA9PT0gNDUgLyotKi8gfHxcbiAgICAgIChjb2RlID49IDY1IC8qQSovICYmIGNvZGUgPD0gOTApIC8qWiovIHx8XG4gICAgICBjb2RlID09PSA0MyAvKisqLyB8fFxuICAgICAgY29kZSA9PT0gOTUgLypfKi8gfHxcbiAgICAgIC8qIEJFR0lOIE1PTkdPIFVSSSBQQVRDSCAqL1xuICAgICAgY29kZSA9PT0gNDQgLyosKi8gfHxcbiAgICAgIGNvZGUgPT09IDU4IC8qOiovIHx8XG4gICAgICAvKiBFTkQgTU9OR08gVVJJIFBBVENIICovXG4gICAgICBjb2RlID4gMTI3XG4gICAgKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgLy8gSW52YWxpZCBob3N0IGNoYXJhY3RlclxuICAgIHNlbGYuaG9zdG5hbWUgPSBob3N0bmFtZS5zbGljZSgwLCBpKTtcbiAgICBpZiAoaSA8IGhvc3RuYW1lLmxlbmd0aCkgcmV0dXJuICcvJyArIGhvc3RuYW1lLnNsaWNlKGkpICsgcmVzdDtcbiAgICBicmVhaztcbiAgfVxufVxuXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuZnVuY3Rpb24gYXV0b0VzY2FwZVN0cihyZXN0KSB7XG4gIHZhciBuZXdSZXN0ID0gJyc7XG4gIHZhciBsYXN0UG9zID0gMDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCByZXN0Lmxlbmd0aDsgKytpKSB7XG4gICAgLy8gQXV0b21hdGljYWxseSBlc2NhcGUgYWxsIGRlbGltaXRlcnMgYW5kIHVud2lzZSBjaGFyYWN0ZXJzIGZyb20gUkZDIDIzOTZcbiAgICAvLyBBbHNvIGVzY2FwZSBzaW5nbGUgcXVvdGVzIGluIGNhc2Ugb2YgYW4gWFNTIGF0dGFja1xuICAgIHN3aXRjaCAocmVzdC5jaGFyQ29kZUF0KGkpKSB7XG4gICAgICBjYXNlIDk6IC8vICdcXHQnXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UmVzdCArPSAnJTA5JztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMTA6IC8vICdcXG4nXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UmVzdCArPSAnJTBBJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMTM6IC8vICdcXHInXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UmVzdCArPSAnJTBEJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMzI6IC8vICcgJ1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyUyMCc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDM0OiAvLyAnXCInXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UmVzdCArPSAnJTIyJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMzk6IC8vICdcXCcnXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UmVzdCArPSAnJTI3JztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgNjA6IC8vICc8J1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyUzQyc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDYyOiAvLyAnPidcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclM0UnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSA5MjogLy8gJ1xcXFwnXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UmVzdCArPSAnJTVDJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgOTQ6IC8vICdeJ1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyU1RSc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDk2OiAvLyAnYCdcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclNjAnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAxMjM6IC8vICd7J1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyU3Qic7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDEyNDogLy8gJ3wnXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UmVzdCArPSAnJTdDJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMTI1OiAvLyAnfSdcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclN0QnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuICBpZiAobGFzdFBvcyA9PT0gMCkgcmV0dXJuO1xuICBpZiAobGFzdFBvcyA8IHJlc3QubGVuZ3RoKSByZXR1cm4gbmV3UmVzdCArIHJlc3Quc2xpY2UobGFzdFBvcyk7XG4gIGVsc2UgcmV0dXJuIG5ld1Jlc3Q7XG59XG5cbi8vIGZvcm1hdCBhIHBhcnNlZCBvYmplY3QgaW50byBhIHVybCBzdHJpbmdcbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5mdW5jdGlvbiB1cmxGb3JtYXQob2JqKSB7XG4gIC8vIGVuc3VyZSBpdCdzIGFuIG9iamVjdCwgYW5kIG5vdCBhIHN0cmluZyB1cmwuXG4gIC8vIElmIGl0J3MgYW4gb2JqLCB0aGlzIGlzIGEgbm8tb3AuXG4gIC8vIHRoaXMgd2F5LCB5b3UgY2FuIGNhbGwgdXJsX2Zvcm1hdCgpIG9uIHN0cmluZ3NcbiAgLy8gdG8gY2xlYW4gdXAgcG90ZW50aWFsbHkgd29ua3kgdXJscy5cbiAgaWYgKHR5cGVvZiBvYmogPT09ICdzdHJpbmcnKSBvYmogPSB1cmxQYXJzZShvYmopO1xuICBlbHNlIGlmICh0eXBlb2Ygb2JqICE9PSAnb2JqZWN0JyB8fCBvYmogPT09IG51bGwpXG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcbiAgICAgICdQYXJhbWV0ZXIgXCJ1cmxPYmpcIiBtdXN0IGJlIGFuIG9iamVjdCwgbm90ICcgKyBvYmogPT09IG51bGxcbiAgICAgICAgPyAnbnVsbCdcbiAgICAgICAgOiB0eXBlb2Ygb2JqXG4gICAgKTtcbiAgZWxzZSBpZiAoIShvYmogaW5zdGFuY2VvZiBVcmwpKSByZXR1cm4gVXJsLnByb3RvdHlwZS5mb3JtYXQuY2FsbChvYmopO1xuXG4gIHJldHVybiBvYmouZm9ybWF0KCk7XG59XG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5VcmwucHJvdG90eXBlLmZvcm1hdCA9IGZ1bmN0aW9uKCkge1xuICB2YXIgYXV0aCA9IHRoaXMuYXV0aCB8fCAnJztcbiAgaWYgKGF1dGgpIHtcbiAgICBhdXRoID0gZW5jb2RlQXV0aChhdXRoKTtcbiAgICBhdXRoICs9ICdAJztcbiAgfVxuXG4gIHZhciBwcm90b2NvbCA9IHRoaXMucHJvdG9jb2wgfHwgJyc7XG4gIHZhciBwYXRobmFtZSA9IHRoaXMucGF0aG5hbWUgfHwgJyc7XG4gIHZhciBoYXNoID0gdGhpcy5oYXNoIHx8ICcnO1xuICB2YXIgaG9zdCA9IGZhbHNlO1xuICB2YXIgcXVlcnkgPSAnJztcblxuICBpZiAodGhpcy5ob3N0KSB7XG4gICAgaG9zdCA9IGF1dGggKyB0aGlzLmhvc3Q7XG4gIH0gZWxzZSBpZiAodGhpcy5ob3N0bmFtZSkge1xuICAgIGhvc3QgPVxuICAgICAgYXV0aCArXG4gICAgICAodGhpcy5ob3N0bmFtZS5pbmRleE9mKCc6JykgPT09IC0xXG4gICAgICAgID8gdGhpcy5ob3N0bmFtZVxuICAgICAgICA6ICdbJyArIHRoaXMuaG9zdG5hbWUgKyAnXScpO1xuICAgIGlmICh0aGlzLnBvcnQpIHtcbiAgICAgIGhvc3QgKz0gJzonICsgdGhpcy5wb3J0O1xuICAgIH1cbiAgfVxuXG4gIGlmICh0aGlzLnF1ZXJ5ICE9PSBudWxsICYmIHR5cGVvZiB0aGlzLnF1ZXJ5ID09PSAnb2JqZWN0JylcbiAgICBxdWVyeSA9IHF1ZXJ5c3RyaW5nLnN0cmluZ2lmeSh0aGlzLnF1ZXJ5KTtcblxuICB2YXIgc2VhcmNoID0gdGhpcy5zZWFyY2ggfHwgKHF1ZXJ5ICYmICc/JyArIHF1ZXJ5KSB8fCAnJztcblxuICBpZiAocHJvdG9jb2wgJiYgcHJvdG9jb2wuY2hhckNvZGVBdChwcm90b2NvbC5sZW5ndGggLSAxKSAhPT0gNTggLyo6Ki8pXG4gICAgcHJvdG9jb2wgKz0gJzonO1xuXG4gIHZhciBuZXdQYXRobmFtZSA9ICcnO1xuICB2YXIgbGFzdFBvcyA9IDA7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgcGF0aG5hbWUubGVuZ3RoOyArK2kpIHtcbiAgICBzd2l0Y2ggKHBhdGhuYW1lLmNoYXJDb2RlQXQoaSkpIHtcbiAgICAgIGNhc2UgMzU6IC8vICcjJ1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdQYXRobmFtZSArPSBwYXRobmFtZS5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UGF0aG5hbWUgKz0gJyUyMyc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDYzOiAvLyAnPydcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UGF0aG5hbWUgKz0gcGF0aG5hbWUuc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1BhdGhuYW1lICs9ICclM0YnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuICBpZiAobGFzdFBvcyA+IDApIHtcbiAgICBpZiAobGFzdFBvcyAhPT0gcGF0aG5hbWUubGVuZ3RoKVxuICAgICAgcGF0aG5hbWUgPSBuZXdQYXRobmFtZSArIHBhdGhuYW1lLnNsaWNlKGxhc3RQb3MpO1xuICAgIGVsc2UgcGF0aG5hbWUgPSBuZXdQYXRobmFtZTtcbiAgfVxuXG4gIC8vIG9ubHkgdGhlIHNsYXNoZWRQcm90b2NvbHMgZ2V0IHRoZSAvLy4gIE5vdCBtYWlsdG86LCB4bXBwOiwgZXRjLlxuICAvLyB1bmxlc3MgdGhleSBoYWQgdGhlbSB0byBiZWdpbiB3aXRoLlxuICBpZiAoXG4gICAgdGhpcy5zbGFzaGVzIHx8XG4gICAgKCghcHJvdG9jb2wgfHwgc2xhc2hlZFByb3RvY29sW3Byb3RvY29sXSkgJiYgaG9zdCAhPT0gZmFsc2UpXG4gICkge1xuICAgIGhvc3QgPSAnLy8nICsgKGhvc3QgfHwgJycpO1xuICAgIGlmIChwYXRobmFtZSAmJiBwYXRobmFtZS5jaGFyQ29kZUF0KDApICE9PSA0NyAvKi8qLylcbiAgICAgIHBhdGhuYW1lID0gJy8nICsgcGF0aG5hbWU7XG4gIH0gZWxzZSBpZiAoIWhvc3QpIHtcbiAgICBob3N0ID0gJyc7XG4gIH1cblxuICBzZWFyY2ggPSBzZWFyY2gucmVwbGFjZSgnIycsICclMjMnKTtcblxuICBpZiAoaGFzaCAmJiBoYXNoLmNoYXJDb2RlQXQoMCkgIT09IDM1IC8qIyovKSBoYXNoID0gJyMnICsgaGFzaDtcbiAgaWYgKHNlYXJjaCAmJiBzZWFyY2guY2hhckNvZGVBdCgwKSAhPT0gNjMgLyo/Ki8pIHNlYXJjaCA9ICc/JyArIHNlYXJjaDtcblxuICByZXR1cm4gcHJvdG9jb2wgKyBob3N0ICsgcGF0aG5hbWUgKyBzZWFyY2ggKyBoYXNoO1xufTtcblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cbmZ1bmN0aW9uIHVybFJlc29sdmUoc291cmNlLCByZWxhdGl2ZSkge1xuICByZXR1cm4gdXJsUGFyc2Uoc291cmNlLCBmYWxzZSwgdHJ1ZSkucmVzb2x2ZShyZWxhdGl2ZSk7XG59XG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5VcmwucHJvdG90eXBlLnJlc29sdmUgPSBmdW5jdGlvbihyZWxhdGl2ZSkge1xuICByZXR1cm4gdGhpcy5yZXNvbHZlT2JqZWN0KHVybFBhcnNlKHJlbGF0aXZlLCBmYWxzZSwgdHJ1ZSkpLmZvcm1hdCgpO1xufTtcblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cbmZ1bmN0aW9uIHVybFJlc29sdmVPYmplY3Qoc291cmNlLCByZWxhdGl2ZSkge1xuICBpZiAoIXNvdXJjZSkgcmV0dXJuIHJlbGF0aXZlO1xuICByZXR1cm4gdXJsUGFyc2Uoc291cmNlLCBmYWxzZSwgdHJ1ZSkucmVzb2x2ZU9iamVjdChyZWxhdGl2ZSk7XG59XG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5VcmwucHJvdG90eXBlLnJlc29sdmVPYmplY3QgPSBmdW5jdGlvbihyZWxhdGl2ZSkge1xuICBpZiAodHlwZW9mIHJlbGF0aXZlID09PSAnc3RyaW5nJykge1xuICAgIHZhciByZWwgPSBuZXcgVXJsKCk7XG4gICAgcmVsLnBhcnNlKHJlbGF0aXZlLCBmYWxzZSwgdHJ1ZSk7XG4gICAgcmVsYXRpdmUgPSByZWw7XG4gIH1cblxuICB2YXIgcmVzdWx0ID0gbmV3IFVybCgpO1xuICB2YXIgdGtleXMgPSBPYmplY3Qua2V5cyh0aGlzKTtcbiAgZm9yICh2YXIgdGsgPSAwOyB0ayA8IHRrZXlzLmxlbmd0aDsgdGsrKykge1xuICAgIHZhciB0a2V5ID0gdGtleXNbdGtdO1xuICAgIHJlc3VsdFt0a2V5XSA9IHRoaXNbdGtleV07XG4gIH1cblxuICAvLyBoYXNoIGlzIGFsd2F5cyBvdmVycmlkZGVuLCBubyBtYXR0ZXIgd2hhdC5cbiAgLy8gZXZlbiBocmVmPVwiXCIgd2lsbCByZW1vdmUgaXQuXG4gIHJlc3VsdC5oYXNoID0gcmVsYXRpdmUuaGFzaDtcblxuICAvLyBpZiB0aGUgcmVsYXRpdmUgdXJsIGlzIGVtcHR5LCB0aGVuIHRoZXJlJ3Mgbm90aGluZyBsZWZ0IHRvIGRvIGhlcmUuXG4gIGlmIChyZWxhdGl2ZS5ocmVmID09PSAnJykge1xuICAgIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvLyBocmVmcyBsaWtlIC8vZm9vL2JhciBhbHdheXMgY3V0IHRvIHRoZSBwcm90b2NvbC5cbiAgaWYgKHJlbGF0aXZlLnNsYXNoZXMgJiYgIXJlbGF0aXZlLnByb3RvY29sKSB7XG4gICAgLy8gdGFrZSBldmVyeXRoaW5nIGV4Y2VwdCB0aGUgcHJvdG9jb2wgZnJvbSByZWxhdGl2ZVxuICAgIHZhciBya2V5cyA9IE9iamVjdC5rZXlzKHJlbGF0aXZlKTtcbiAgICBmb3IgKHZhciByayA9IDA7IHJrIDwgcmtleXMubGVuZ3RoOyByaysrKSB7XG4gICAgICB2YXIgcmtleSA9IHJrZXlzW3JrXTtcbiAgICAgIGlmIChya2V5ICE9PSAncHJvdG9jb2wnKSByZXN1bHRbcmtleV0gPSByZWxhdGl2ZVtya2V5XTtcbiAgICB9XG5cbiAgICAvL3VybFBhcnNlIGFwcGVuZHMgdHJhaWxpbmcgLyB0byB1cmxzIGxpa2UgaHR0cDovL3d3dy5leGFtcGxlLmNvbVxuICAgIGlmIChcbiAgICAgIHNsYXNoZWRQcm90b2NvbFtyZXN1bHQucHJvdG9jb2xdICYmXG4gICAgICByZXN1bHQuaG9zdG5hbWUgJiZcbiAgICAgICFyZXN1bHQucGF0aG5hbWVcbiAgICApIHtcbiAgICAgIHJlc3VsdC5wYXRoID0gcmVzdWx0LnBhdGhuYW1lID0gJy8nO1xuICAgIH1cblxuICAgIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBpZiAocmVsYXRpdmUucHJvdG9jb2wgJiYgcmVsYXRpdmUucHJvdG9jb2wgIT09IHJlc3VsdC5wcm90b2NvbCkge1xuICAgIC8vIGlmIGl0J3MgYSBrbm93biB1cmwgcHJvdG9jb2wsIHRoZW4gY2hhbmdpbmdcbiAgICAvLyB0aGUgcHJvdG9jb2wgZG9lcyB3ZWlyZCB0aGluZ3NcbiAgICAvLyBmaXJzdCwgaWYgaXQncyBub3QgZmlsZTosIHRoZW4gd2UgTVVTVCBoYXZlIGEgaG9zdCxcbiAgICAvLyBhbmQgaWYgdGhlcmUgd2FzIGEgcGF0aFxuICAgIC8vIHRvIGJlZ2luIHdpdGgsIHRoZW4gd2UgTVVTVCBoYXZlIGEgcGF0aC5cbiAgICAvLyBpZiBpdCBpcyBmaWxlOiwgdGhlbiB0aGUgaG9zdCBpcyBkcm9wcGVkLFxuICAgIC8vIGJlY2F1c2UgdGhhdCdzIGtub3duIHRvIGJlIGhvc3RsZXNzLlxuICAgIC8vIGFueXRoaW5nIGVsc2UgaXMgYXNzdW1lZCB0byBiZSBhYnNvbHV0ZS5cbiAgICBpZiAoIXNsYXNoZWRQcm90b2NvbFtyZWxhdGl2ZS5wcm90b2NvbF0pIHtcbiAgICAgIHZhciBrZXlzID0gT2JqZWN0LmtleXMocmVsYXRpdmUpO1xuICAgICAgZm9yICh2YXIgdiA9IDA7IHYgPCBrZXlzLmxlbmd0aDsgdisrKSB7XG4gICAgICAgIHZhciBrID0ga2V5c1t2XTtcbiAgICAgICAgcmVzdWx0W2tdID0gcmVsYXRpdmVba107XG4gICAgICB9XG4gICAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgcmVzdWx0LnByb3RvY29sID0gcmVsYXRpdmUucHJvdG9jb2w7XG4gICAgaWYgKFxuICAgICAgIXJlbGF0aXZlLmhvc3QgJiZcbiAgICAgICEvXmZpbGU6PyQvLnRlc3QocmVsYXRpdmUucHJvdG9jb2wpICYmXG4gICAgICAhaG9zdGxlc3NQcm90b2NvbFtyZWxhdGl2ZS5wcm90b2NvbF1cbiAgICApIHtcbiAgICAgIGNvbnN0IHJlbFBhdGggPSAocmVsYXRpdmUucGF0aG5hbWUgfHwgJycpLnNwbGl0KCcvJyk7XG4gICAgICB3aGlsZSAocmVsUGF0aC5sZW5ndGggJiYgIShyZWxhdGl2ZS5ob3N0ID0gcmVsUGF0aC5zaGlmdCgpKSk7XG4gICAgICBpZiAoIXJlbGF0aXZlLmhvc3QpIHJlbGF0aXZlLmhvc3QgPSAnJztcbiAgICAgIGlmICghcmVsYXRpdmUuaG9zdG5hbWUpIHJlbGF0aXZlLmhvc3RuYW1lID0gJyc7XG4gICAgICBpZiAocmVsUGF0aFswXSAhPT0gJycpIHJlbFBhdGgudW5zaGlmdCgnJyk7XG4gICAgICBpZiAocmVsUGF0aC5sZW5ndGggPCAyKSByZWxQYXRoLnVuc2hpZnQoJycpO1xuICAgICAgcmVzdWx0LnBhdGhuYW1lID0gcmVsUGF0aC5qb2luKCcvJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc3VsdC5wYXRobmFtZSA9IHJlbGF0aXZlLnBhdGhuYW1lO1xuICAgIH1cbiAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgIHJlc3VsdC5xdWVyeSA9IHJlbGF0aXZlLnF1ZXJ5O1xuICAgIHJlc3VsdC5ob3N0ID0gcmVsYXRpdmUuaG9zdCB8fCAnJztcbiAgICByZXN1bHQuYXV0aCA9IHJlbGF0aXZlLmF1dGg7XG4gICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVsYXRpdmUuaG9zdG5hbWUgfHwgcmVsYXRpdmUuaG9zdDtcbiAgICByZXN1bHQucG9ydCA9IHJlbGF0aXZlLnBvcnQ7XG4gICAgLy8gdG8gc3VwcG9ydCBodHRwLnJlcXVlc3RcbiAgICBpZiAocmVzdWx0LnBhdGhuYW1lIHx8IHJlc3VsdC5zZWFyY2gpIHtcbiAgICAgIHZhciBwID0gcmVzdWx0LnBhdGhuYW1lIHx8ICcnO1xuICAgICAgdmFyIHMgPSByZXN1bHQuc2VhcmNoIHx8ICcnO1xuICAgICAgcmVzdWx0LnBhdGggPSBwICsgcztcbiAgICB9XG4gICAgcmVzdWx0LnNsYXNoZXMgPSByZXN1bHQuc2xhc2hlcyB8fCByZWxhdGl2ZS5zbGFzaGVzO1xuICAgIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICB2YXIgaXNTb3VyY2VBYnMgPSByZXN1bHQucGF0aG5hbWUgJiYgcmVzdWx0LnBhdGhuYW1lLmNoYXJBdCgwKSA9PT0gJy8nO1xuICB2YXIgaXNSZWxBYnMgPVxuICAgIHJlbGF0aXZlLmhvc3QgfHwgKHJlbGF0aXZlLnBhdGhuYW1lICYmIHJlbGF0aXZlLnBhdGhuYW1lLmNoYXJBdCgwKSA9PT0gJy8nKTtcbiAgdmFyIG11c3RFbmRBYnMgPVxuICAgIGlzUmVsQWJzIHx8IGlzU291cmNlQWJzIHx8IChyZXN1bHQuaG9zdCAmJiByZWxhdGl2ZS5wYXRobmFtZSk7XG4gIHZhciByZW1vdmVBbGxEb3RzID0gbXVzdEVuZEFicztcbiAgdmFyIHNyY1BhdGggPSAocmVzdWx0LnBhdGhuYW1lICYmIHJlc3VsdC5wYXRobmFtZS5zcGxpdCgnLycpKSB8fCBbXTtcbiAgdmFyIHJlbFBhdGggPSAocmVsYXRpdmUucGF0aG5hbWUgJiYgcmVsYXRpdmUucGF0aG5hbWUuc3BsaXQoJy8nKSkgfHwgW107XG4gIHZhciBwc3ljaG90aWMgPSByZXN1bHQucHJvdG9jb2wgJiYgIXNsYXNoZWRQcm90b2NvbFtyZXN1bHQucHJvdG9jb2xdO1xuXG4gIC8vIGlmIHRoZSB1cmwgaXMgYSBub24tc2xhc2hlZCB1cmwsIHRoZW4gcmVsYXRpdmVcbiAgLy8gbGlua3MgbGlrZSAuLi8uLiBzaG91bGQgYmUgYWJsZVxuICAvLyB0byBjcmF3bCB1cCB0byB0aGUgaG9zdG5hbWUsIGFzIHdlbGwuICBUaGlzIGlzIHN0cmFuZ2UuXG4gIC8vIHJlc3VsdC5wcm90b2NvbCBoYXMgYWxyZWFkeSBiZWVuIHNldCBieSBub3cuXG4gIC8vIExhdGVyIG9uLCBwdXQgdGhlIGZpcnN0IHBhdGggcGFydCBpbnRvIHRoZSBob3N0IGZpZWxkLlxuICBpZiAocHN5Y2hvdGljKSB7XG4gICAgcmVzdWx0Lmhvc3RuYW1lID0gJyc7XG4gICAgcmVzdWx0LnBvcnQgPSBudWxsO1xuICAgIGlmIChyZXN1bHQuaG9zdCkge1xuICAgICAgaWYgKHNyY1BhdGhbMF0gPT09ICcnKSBzcmNQYXRoWzBdID0gcmVzdWx0Lmhvc3Q7XG4gICAgICBlbHNlIHNyY1BhdGgudW5zaGlmdChyZXN1bHQuaG9zdCk7XG4gICAgfVxuICAgIHJlc3VsdC5ob3N0ID0gJyc7XG4gICAgaWYgKHJlbGF0aXZlLnByb3RvY29sKSB7XG4gICAgICByZWxhdGl2ZS5ob3N0bmFtZSA9IG51bGw7XG4gICAgICByZWxhdGl2ZS5wb3J0ID0gbnVsbDtcbiAgICAgIGlmIChyZWxhdGl2ZS5ob3N0KSB7XG4gICAgICAgIGlmIChyZWxQYXRoWzBdID09PSAnJykgcmVsUGF0aFswXSA9IHJlbGF0aXZlLmhvc3Q7XG4gICAgICAgIGVsc2UgcmVsUGF0aC51bnNoaWZ0KHJlbGF0aXZlLmhvc3QpO1xuICAgICAgfVxuICAgICAgcmVsYXRpdmUuaG9zdCA9IG51bGw7XG4gICAgfVxuICAgIG11c3RFbmRBYnMgPSBtdXN0RW5kQWJzICYmIChyZWxQYXRoWzBdID09PSAnJyB8fCBzcmNQYXRoWzBdID09PSAnJyk7XG4gIH1cblxuICBpZiAoaXNSZWxBYnMpIHtcbiAgICAvLyBpdCdzIGFic29sdXRlLlxuICAgIHJlc3VsdC5ob3N0ID1cbiAgICAgIHJlbGF0aXZlLmhvc3QgfHwgcmVsYXRpdmUuaG9zdCA9PT0gJycgPyByZWxhdGl2ZS5ob3N0IDogcmVzdWx0Lmhvc3Q7XG4gICAgcmVzdWx0Lmhvc3RuYW1lID1cbiAgICAgIHJlbGF0aXZlLmhvc3RuYW1lIHx8IHJlbGF0aXZlLmhvc3RuYW1lID09PSAnJ1xuICAgICAgICA/IHJlbGF0aXZlLmhvc3RuYW1lXG4gICAgICAgIDogcmVzdWx0Lmhvc3RuYW1lO1xuICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgcmVzdWx0LnF1ZXJ5ID0gcmVsYXRpdmUucXVlcnk7XG4gICAgc3JjUGF0aCA9IHJlbFBhdGg7XG4gICAgLy8gZmFsbCB0aHJvdWdoIHRvIHRoZSBkb3QtaGFuZGxpbmcgYmVsb3cuXG4gIH0gZWxzZSBpZiAocmVsUGF0aC5sZW5ndGgpIHtcbiAgICAvLyBpdCdzIHJlbGF0aXZlXG4gICAgLy8gdGhyb3cgYXdheSB0aGUgZXhpc3RpbmcgZmlsZSwgYW5kIHRha2UgdGhlIG5ldyBwYXRoIGluc3RlYWQuXG4gICAgaWYgKCFzcmNQYXRoKSBzcmNQYXRoID0gW107XG4gICAgc3JjUGF0aC5wb3AoKTtcbiAgICBzcmNQYXRoID0gc3JjUGF0aC5jb25jYXQocmVsUGF0aCk7XG4gICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICByZXN1bHQucXVlcnkgPSByZWxhdGl2ZS5xdWVyeTtcbiAgfSBlbHNlIGlmIChyZWxhdGl2ZS5zZWFyY2ggIT09IG51bGwgJiYgcmVsYXRpdmUuc2VhcmNoICE9PSB1bmRlZmluZWQpIHtcbiAgICAvLyBqdXN0IHB1bGwgb3V0IHRoZSBzZWFyY2guXG4gICAgLy8gbGlrZSBocmVmPSc/Zm9vJy5cbiAgICAvLyBQdXQgdGhpcyBhZnRlciB0aGUgb3RoZXIgdHdvIGNhc2VzIGJlY2F1c2UgaXQgc2ltcGxpZmllcyB0aGUgYm9vbGVhbnNcbiAgICBpZiAocHN5Y2hvdGljKSB7XG4gICAgICByZXN1bHQuaG9zdG5hbWUgPSByZXN1bHQuaG9zdCA9IHNyY1BhdGguc2hpZnQoKTtcbiAgICAgIC8vb2NjYXNpb25hbGx5IHRoZSBhdXRoIGNhbiBnZXQgc3R1Y2sgb25seSBpbiBob3N0XG4gICAgICAvL3RoaXMgZXNwZWNpYWxseSBoYXBwZW5zIGluIGNhc2VzIGxpa2VcbiAgICAgIC8vdXJsLnJlc29sdmVPYmplY3QoJ21haWx0bzpsb2NhbDFAZG9tYWluMScsICdsb2NhbDJAZG9tYWluMicpXG4gICAgICBjb25zdCBhdXRoSW5Ib3N0ID1cbiAgICAgICAgcmVzdWx0Lmhvc3QgJiYgcmVzdWx0Lmhvc3QuaW5kZXhPZignQCcpID4gMFxuICAgICAgICAgID8gcmVzdWx0Lmhvc3Quc3BsaXQoJ0AnKVxuICAgICAgICAgIDogZmFsc2U7XG4gICAgICBpZiAoYXV0aEluSG9zdCkge1xuICAgICAgICByZXN1bHQuYXV0aCA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgICAgcmVzdWx0Lmhvc3QgPSByZXN1bHQuaG9zdG5hbWUgPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgICB9XG4gICAgfVxuICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgcmVzdWx0LnF1ZXJ5ID0gcmVsYXRpdmUucXVlcnk7XG4gICAgLy90byBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICAgIGlmIChyZXN1bHQucGF0aG5hbWUgIT09IG51bGwgfHwgcmVzdWx0LnNlYXJjaCAhPT0gbnVsbCkge1xuICAgICAgcmVzdWx0LnBhdGggPVxuICAgICAgICAocmVzdWx0LnBhdGhuYW1lID8gcmVzdWx0LnBhdGhuYW1lIDogJycpICtcbiAgICAgICAgKHJlc3VsdC5zZWFyY2ggPyByZXN1bHQuc2VhcmNoIDogJycpO1xuICAgIH1cbiAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgaWYgKCFzcmNQYXRoLmxlbmd0aCkge1xuICAgIC8vIG5vIHBhdGggYXQgYWxsLiAgZWFzeS5cbiAgICAvLyB3ZSd2ZSBhbHJlYWR5IGhhbmRsZWQgdGhlIG90aGVyIHN0dWZmIGFib3ZlLlxuICAgIHJlc3VsdC5wYXRobmFtZSA9IG51bGw7XG4gICAgLy90byBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICAgIGlmIChyZXN1bHQuc2VhcmNoKSB7XG4gICAgICByZXN1bHQucGF0aCA9ICcvJyArIHJlc3VsdC5zZWFyY2g7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc3VsdC5wYXRoID0gbnVsbDtcbiAgICB9XG4gICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIGlmIGEgdXJsIEVORHMgaW4gLiBvciAuLiwgdGhlbiBpdCBtdXN0IGdldCBhIHRyYWlsaW5nIHNsYXNoLlxuICAvLyBob3dldmVyLCBpZiBpdCBlbmRzIGluIGFueXRoaW5nIGVsc2Ugbm9uLXNsYXNoeSxcbiAgLy8gdGhlbiBpdCBtdXN0IE5PVCBnZXQgYSB0cmFpbGluZyBzbGFzaC5cbiAgdmFyIGxhc3QgPSBzcmNQYXRoLnNsaWNlKC0xKVswXTtcbiAgdmFyIGhhc1RyYWlsaW5nU2xhc2ggPVxuICAgICgocmVzdWx0Lmhvc3QgfHwgcmVsYXRpdmUuaG9zdCB8fCBzcmNQYXRoLmxlbmd0aCA+IDEpICYmXG4gICAgICAobGFzdCA9PT0gJy4nIHx8IGxhc3QgPT09ICcuLicpKSB8fFxuICAgIGxhc3QgPT09ICcnO1xuXG4gIC8vIHN0cmlwIHNpbmdsZSBkb3RzLCByZXNvbHZlIGRvdWJsZSBkb3RzIHRvIHBhcmVudCBkaXJcbiAgLy8gaWYgdGhlIHBhdGggdHJpZXMgdG8gZ28gYWJvdmUgdGhlIHJvb3QsIGB1cGAgZW5kcyB1cCA+IDBcbiAgdmFyIHVwID0gMDtcbiAgZm9yICh2YXIgaSA9IHNyY1BhdGgubGVuZ3RoOyBpID49IDA7IGktLSkge1xuICAgIGxhc3QgPSBzcmNQYXRoW2ldO1xuICAgIGlmIChsYXN0ID09PSAnLicpIHtcbiAgICAgIHNwbGljZU9uZShzcmNQYXRoLCBpKTtcbiAgICB9IGVsc2UgaWYgKGxhc3QgPT09ICcuLicpIHtcbiAgICAgIHNwbGljZU9uZShzcmNQYXRoLCBpKTtcbiAgICAgIHVwKys7XG4gICAgfSBlbHNlIGlmICh1cCkge1xuICAgICAgc3BsaWNlT25lKHNyY1BhdGgsIGkpO1xuICAgICAgdXAtLTtcbiAgICB9XG4gIH1cblxuICAvLyBpZiB0aGUgcGF0aCBpcyBhbGxvd2VkIHRvIGdvIGFib3ZlIHRoZSByb290LCByZXN0b3JlIGxlYWRpbmcgLi5zXG4gIGlmICghbXVzdEVuZEFicyAmJiAhcmVtb3ZlQWxsRG90cykge1xuICAgIGZvciAoOyB1cC0tOyB1cCkge1xuICAgICAgc3JjUGF0aC51bnNoaWZ0KCcuLicpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChcbiAgICBtdXN0RW5kQWJzICYmXG4gICAgc3JjUGF0aFswXSAhPT0gJycgJiZcbiAgICAoIXNyY1BhdGhbMF0gfHwgc3JjUGF0aFswXS5jaGFyQXQoMCkgIT09ICcvJylcbiAgKSB7XG4gICAgc3JjUGF0aC51bnNoaWZ0KCcnKTtcbiAgfVxuXG4gIGlmIChoYXNUcmFpbGluZ1NsYXNoICYmIHNyY1BhdGguam9pbignLycpLnN1YnN0cigtMSkgIT09ICcvJykge1xuICAgIHNyY1BhdGgucHVzaCgnJyk7XG4gIH1cblxuICB2YXIgaXNBYnNvbHV0ZSA9XG4gICAgc3JjUGF0aFswXSA9PT0gJycgfHwgKHNyY1BhdGhbMF0gJiYgc3JjUGF0aFswXS5jaGFyQXQoMCkgPT09ICcvJyk7XG5cbiAgLy8gcHV0IHRoZSBob3N0IGJhY2tcbiAgaWYgKHBzeWNob3RpYykge1xuICAgIGlmIChpc0Fic29sdXRlKSB7XG4gICAgICByZXN1bHQuaG9zdG5hbWUgPSByZXN1bHQuaG9zdCA9ICcnO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXN1bHQuaG9zdG5hbWUgPSByZXN1bHQuaG9zdCA9IHNyY1BhdGgubGVuZ3RoID8gc3JjUGF0aC5zaGlmdCgpIDogJyc7XG4gICAgfVxuICAgIC8vb2NjYXNpb25hbGx5IHRoZSBhdXRoIGNhbiBnZXQgc3R1Y2sgb25seSBpbiBob3N0XG4gICAgLy90aGlzIGVzcGVjaWFsbHkgaGFwcGVucyBpbiBjYXNlcyBsaWtlXG4gICAgLy91cmwucmVzb2x2ZU9iamVjdCgnbWFpbHRvOmxvY2FsMUBkb21haW4xJywgJ2xvY2FsMkBkb21haW4yJylcbiAgICBjb25zdCBhdXRoSW5Ib3N0ID1cbiAgICAgIHJlc3VsdC5ob3N0ICYmIHJlc3VsdC5ob3N0LmluZGV4T2YoJ0AnKSA+IDBcbiAgICAgICAgPyByZXN1bHQuaG9zdC5zcGxpdCgnQCcpXG4gICAgICAgIDogZmFsc2U7XG4gICAgaWYgKGF1dGhJbkhvc3QpIHtcbiAgICAgIHJlc3VsdC5hdXRoID0gYXV0aEluSG9zdC5zaGlmdCgpO1xuICAgICAgcmVzdWx0Lmhvc3QgPSByZXN1bHQuaG9zdG5hbWUgPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgfVxuICB9XG5cbiAgbXVzdEVuZEFicyA9IG11c3RFbmRBYnMgfHwgKHJlc3VsdC5ob3N0ICYmIHNyY1BhdGgubGVuZ3RoKTtcblxuICBpZiAobXVzdEVuZEFicyAmJiAhaXNBYnNvbHV0ZSkge1xuICAgIHNyY1BhdGgudW5zaGlmdCgnJyk7XG4gIH1cblxuICBpZiAoIXNyY1BhdGgubGVuZ3RoKSB7XG4gICAgcmVzdWx0LnBhdGhuYW1lID0gbnVsbDtcbiAgICByZXN1bHQucGF0aCA9IG51bGw7XG4gIH0gZWxzZSB7XG4gICAgcmVzdWx0LnBhdGhuYW1lID0gc3JjUGF0aC5qb2luKCcvJyk7XG4gIH1cblxuICAvL3RvIHN1cHBvcnQgcmVxdWVzdC5odHRwXG4gIGlmIChyZXN1bHQucGF0aG5hbWUgIT09IG51bGwgfHwgcmVzdWx0LnNlYXJjaCAhPT0gbnVsbCkge1xuICAgIHJlc3VsdC5wYXRoID1cbiAgICAgIChyZXN1bHQucGF0aG5hbWUgPyByZXN1bHQucGF0aG5hbWUgOiAnJykgK1xuICAgICAgKHJlc3VsdC5zZWFyY2ggPyByZXN1bHQuc2VhcmNoIDogJycpO1xuICB9XG4gIHJlc3VsdC5hdXRoID0gcmVsYXRpdmUuYXV0aCB8fCByZXN1bHQuYXV0aDtcbiAgcmVzdWx0LnNsYXNoZXMgPSByZXN1bHQuc2xhc2hlcyB8fCByZWxhdGl2ZS5zbGFzaGVzO1xuICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5VcmwucHJvdG90eXBlLnBhcnNlSG9zdCA9IGZ1bmN0aW9uKCkge1xuICB2YXIgaG9zdCA9IHRoaXMuaG9zdDtcbiAgdmFyIHBvcnQgPSBwb3J0UGF0dGVybi5leGVjKGhvc3QpO1xuICBpZiAocG9ydCkge1xuICAgIHBvcnQgPSBwb3J0WzBdO1xuICAgIGlmIChwb3J0ICE9PSAnOicpIHtcbiAgICAgIHRoaXMucG9ydCA9IHBvcnQuc2xpY2UoMSk7XG4gICAgfVxuICAgIGhvc3QgPSBob3N0LnNsaWNlKDAsIGhvc3QubGVuZ3RoIC0gcG9ydC5sZW5ndGgpO1xuICB9XG4gIGlmIChob3N0KSB0aGlzLmhvc3RuYW1lID0gaG9zdDtcbn07XG5cbi8vIEFib3V0IDEuNXggZmFzdGVyIHRoYW4gdGhlIHR3by1hcmcgdmVyc2lvbiBvZiBBcnJheSNzcGxpY2UoKS5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5mdW5jdGlvbiBzcGxpY2VPbmUobGlzdCwgaW5kZXgpIHtcbiAgZm9yICh2YXIgaSA9IGluZGV4LCBrID0gaSArIDEsIG4gPSBsaXN0Lmxlbmd0aDsgayA8IG47IGkgKz0gMSwgayArPSAxKVxuICAgIGxpc3RbaV0gPSBsaXN0W2tdO1xuICBsaXN0LnBvcCgpO1xufVxuXG52YXIgaGV4VGFibGUgPSBuZXcgQXJyYXkoMjU2KTtcbmZvciAodmFyIGkgPSAwOyBpIDwgMjU2OyArK2kpXG4gIGhleFRhYmxlW2ldID0gJyUnICsgKChpIDwgMTYgPyAnMCcgOiAnJykgKyBpLnRvU3RyaW5nKDE2KSkudG9VcHBlckNhc2UoKTtcbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5mdW5jdGlvbiBlbmNvZGVBdXRoKHN0cikge1xuICAvLyBmYXN0ZXIgZW5jb2RlVVJJQ29tcG9uZW50IGFsdGVybmF0aXZlIGZvciBlbmNvZGluZyBhdXRoIHVyaSBjb21wb25lbnRzXG4gIHZhciBvdXQgPSAnJztcbiAgdmFyIGxhc3RQb3MgPSAwO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7ICsraSkge1xuICAgIHZhciBjID0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAvLyBUaGVzZSBjaGFyYWN0ZXJzIGRvIG5vdCBuZWVkIGVzY2FwaW5nOlxuICAgIC8vICEgLSAuIF8gflxuICAgIC8vICcgKCApICogOlxuICAgIC8vIGRpZ2l0c1xuICAgIC8vIGFscGhhICh1cHBlcmNhc2UpXG4gICAgLy8gYWxwaGEgKGxvd2VyY2FzZSlcbiAgICBpZiAoXG4gICAgICBjID09PSAweDIxIHx8XG4gICAgICBjID09PSAweDJkIHx8XG4gICAgICBjID09PSAweDJlIHx8XG4gICAgICBjID09PSAweDVmIHx8XG4gICAgICBjID09PSAweDdlIHx8XG4gICAgICAoYyA+PSAweDI3ICYmIGMgPD0gMHgyYSkgfHxcbiAgICAgIChjID49IDB4MzAgJiYgYyA8PSAweDNhKSB8fFxuICAgICAgKGMgPj0gMHg0MSAmJiBjIDw9IDB4NWEpIHx8XG4gICAgICAoYyA+PSAweDYxICYmIGMgPD0gMHg3YSlcbiAgICApIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG91dCArPSBzdHIuc2xpY2UobGFzdFBvcywgaSk7XG5cbiAgICBsYXN0UG9zID0gaSArIDE7XG5cbiAgICAvLyBPdGhlciBBU0NJSSBjaGFyYWN0ZXJzXG4gICAgaWYgKGMgPCAweDgwKSB7XG4gICAgICBvdXQgKz0gaGV4VGFibGVbY107XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyBNdWx0aS1ieXRlIGNoYXJhY3RlcnMgLi4uXG4gICAgaWYgKGMgPCAweDgwMCkge1xuICAgICAgb3V0ICs9IGhleFRhYmxlWzB4YzAgfCAoYyA+PiA2KV0gKyBoZXhUYWJsZVsweDgwIHwgKGMgJiAweDNmKV07XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgaWYgKGMgPCAweGQ4MDAgfHwgYyA+PSAweGUwMDApIHtcbiAgICAgIG91dCArPVxuICAgICAgICBoZXhUYWJsZVsweGUwIHwgKGMgPj4gMTIpXSArXG4gICAgICAgIGhleFRhYmxlWzB4ODAgfCAoKGMgPj4gNikgJiAweDNmKV0gK1xuICAgICAgICBoZXhUYWJsZVsweDgwIHwgKGMgJiAweDNmKV07XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgLy8gU3Vycm9nYXRlIHBhaXJcbiAgICArK2k7XG4gICAgdmFyIGMyO1xuICAgIGlmIChpIDwgc3RyLmxlbmd0aCkgYzIgPSBzdHIuY2hhckNvZGVBdChpKSAmIDB4M2ZmO1xuICAgIGVsc2UgYzIgPSAwO1xuICAgIGMgPSAweDEwMDAwICsgKCgoYyAmIDB4M2ZmKSA8PCAxMCkgfCBjMik7XG4gICAgb3V0ICs9XG4gICAgICBoZXhUYWJsZVsweGYwIHwgKGMgPj4gMTgpXSArXG4gICAgICBoZXhUYWJsZVsweDgwIHwgKChjID4+IDEyKSAmIDB4M2YpXSArXG4gICAgICBoZXhUYWJsZVsweDgwIHwgKChjID4+IDYpICYgMHgzZildICtcbiAgICAgIGhleFRhYmxlWzB4ODAgfCAoYyAmIDB4M2YpXTtcbiAgfVxuICBpZiAobGFzdFBvcyA9PT0gMCkgcmV0dXJuIHN0cjtcbiAgaWYgKGxhc3RQb3MgPCBzdHIubGVuZ3RoKSByZXR1cm4gb3V0ICsgc3RyLnNsaWNlKGxhc3RQb3MpO1xuICByZXR1cm4gb3V0O1xufVxuIl19