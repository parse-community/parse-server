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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy92ZW5kb3IvbW9uZ29kYlVybC5qcyJdLCJuYW1lcyI6WyJwdW55Y29kZSIsInJlcXVpcmUiLCJleHBvcnRzIiwicGFyc2UiLCJ1cmxQYXJzZSIsInJlc29sdmUiLCJ1cmxSZXNvbHZlIiwicmVzb2x2ZU9iamVjdCIsInVybFJlc29sdmVPYmplY3QiLCJmb3JtYXQiLCJ1cmxGb3JtYXQiLCJVcmwiLCJwcm90b2NvbCIsInNsYXNoZXMiLCJhdXRoIiwiaG9zdCIsInBvcnQiLCJob3N0bmFtZSIsImhhc2giLCJzZWFyY2giLCJxdWVyeSIsInBhdGhuYW1lIiwicGF0aCIsImhyZWYiLCJwcm90b2NvbFBhdHRlcm4iLCJwb3J0UGF0dGVybiIsInNpbXBsZVBhdGhQYXR0ZXJuIiwiaG9zdG5hbWVNYXhMZW4iLCJ1bnNhZmVQcm90b2NvbCIsImphdmFzY3JpcHQiLCJob3N0bGVzc1Byb3RvY29sIiwic2xhc2hlZFByb3RvY29sIiwiaHR0cCIsImh0dHBzIiwiZnRwIiwiZ29waGVyIiwiZmlsZSIsInF1ZXJ5c3RyaW5nIiwidXJsIiwicGFyc2VRdWVyeVN0cmluZyIsInNsYXNoZXNEZW5vdGVIb3N0IiwidSIsInByb3RvdHlwZSIsIlR5cGVFcnJvciIsImhhc0hhc2giLCJzdGFydCIsImVuZCIsInJlc3QiLCJsYXN0UG9zIiwiaSIsImluV3MiLCJzcGxpdCIsImxlbmd0aCIsImNvZGUiLCJjaGFyQ29kZUF0IiwiaXNXcyIsInNsaWNlIiwic2ltcGxlUGF0aCIsImV4ZWMiLCJwcm90byIsImxvd2VyUHJvdG8iLCJ0b0xvd2VyQ2FzZSIsInRlc3QiLCJob3N0RW5kIiwiYXRTaWduIiwibm9uSG9zdCIsImRlY29kZVVSSUNvbXBvbmVudCIsInBhcnNlSG9zdCIsImlwdjZIb3N0bmFtZSIsInJlc3VsdCIsInZhbGlkYXRlSG9zdG5hbWUiLCJ1bmRlZmluZWQiLCJ0b0FTQ0lJIiwicCIsImgiLCJhdXRvRXNjYXBlU3RyIiwicXVlc3Rpb25JZHgiLCJoYXNoSWR4IiwiZmlyc3RJZHgiLCJzIiwic2VsZiIsIm5ld1Jlc3QiLCJvYmoiLCJjYWxsIiwiZW5jb2RlQXV0aCIsImluZGV4T2YiLCJzdHJpbmdpZnkiLCJuZXdQYXRobmFtZSIsInJlcGxhY2UiLCJzb3VyY2UiLCJyZWxhdGl2ZSIsInJlbCIsInRrZXlzIiwiT2JqZWN0Iiwia2V5cyIsInRrIiwidGtleSIsInJrZXlzIiwicmsiLCJya2V5IiwidiIsImsiLCJyZWxQYXRoIiwic2hpZnQiLCJ1bnNoaWZ0Iiwiam9pbiIsImlzU291cmNlQWJzIiwiY2hhckF0IiwiaXNSZWxBYnMiLCJtdXN0RW5kQWJzIiwicmVtb3ZlQWxsRG90cyIsInNyY1BhdGgiLCJwc3ljaG90aWMiLCJwb3AiLCJjb25jYXQiLCJhdXRoSW5Ib3N0IiwibGFzdCIsImhhc1RyYWlsaW5nU2xhc2giLCJ1cCIsInNwbGljZU9uZSIsInN1YnN0ciIsInB1c2giLCJpc0Fic29sdXRlIiwibGlzdCIsImluZGV4IiwibiIsImhleFRhYmxlIiwiQXJyYXkiLCJ0b1N0cmluZyIsInRvVXBwZXJDYXNlIiwic3RyIiwib3V0IiwiYyIsImMyIl0sIm1hcHBpbmdzIjoiQUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7O0FBRUEsTUFBTUEsUUFBUSxHQUFHQyxPQUFPLENBQUMsVUFBRCxDQUF4Qjs7QUFFQUMsT0FBTyxDQUFDQyxLQUFSLEdBQWdCQyxRQUFoQjtBQUNBRixPQUFPLENBQUNHLE9BQVIsR0FBa0JDLFVBQWxCO0FBQ0FKLE9BQU8sQ0FBQ0ssYUFBUixHQUF3QkMsZ0JBQXhCO0FBQ0FOLE9BQU8sQ0FBQ08sTUFBUixHQUFpQkMsU0FBakI7QUFFQVIsT0FBTyxDQUFDUyxHQUFSLEdBQWNBLEdBQWQ7O0FBRUEsU0FBU0EsR0FBVCxHQUFlO0FBQ2IsT0FBS0MsUUFBTCxHQUFnQixJQUFoQjtBQUNBLE9BQUtDLE9BQUwsR0FBZSxJQUFmO0FBQ0EsT0FBS0MsSUFBTCxHQUFZLElBQVo7QUFDQSxPQUFLQyxJQUFMLEdBQVksSUFBWjtBQUNBLE9B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QUosQ0FBZUwsQ0FBZixJQUFvQixLQUF6QixDQUFwQixLQUNLb0YsRUFBRSxHQUFHLENBQUw7QUFDTEQsSUFBQUEsQ0FBQyxHQUFHLFdBQVksQ0FBQ0EsQ0FBQyxHQUFHLEtBQUwsS0FBZSxFQUFoQixHQUFzQkMsRUFBakMsQ0FBSjtBQUNBRixJQUFBQSxHQUFHLElBQ0RMLFFBQVEsQ0FBQyxPQUFRTSxDQUFDLElBQUksRUFBZCxDQUFSLEdBQ0FOLFFBQVEsQ0FBQyxPQUFTTSxDQUFDLElBQUksRUFBTixHQUFZLElBQXJCLENBRFIsR0FFQU4sUUFBUSxDQUFDLE9BQVNNLENBQUMsSUFBSSxDQUFOLEdBQVcsSUFBcEIsQ0FGUixHQUdBTixRQUFRLENBQUMsT0FBUU0sQ0FBQyxHQUFHLElBQWIsQ0FKVjtBQUtEOztBQUNELE1BQUlwRixPQUFPLEtBQUssQ0FBaEIsRUFBbUIsT0FBT2tGLEdBQVA7QUFDbkIsTUFBSWxGLE9BQU8sR0FBR2tGLEdBQUcsQ0FBQzlFLE1BQWxCLEVBQTBCLE9BQU8rRSxHQUFHLEdBQUdELEdBQUcsQ0FBQzFFLEtBQUosQ0FBVVIsT0FBVixDQUFiO0FBQzFCLFNBQU9tRixHQUFQO0FBQ0QiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBBIHNsaWdodGx5IHBhdGNoZWQgdmVyc2lvbiBvZiBub2RlJ3MgdXJsIG1vZHVsZSwgd2l0aCBzdXBwb3J0IGZvciBtb25nb2RiOi8vXG4vLyB1cmlzLlxuLy9cbi8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbm9kZWpzL25vZGUvYmxvYi9tYXN0ZXIvTElDRU5TRSBmb3IgbGljZW5zaW5nXG4vLyBpbmZvcm1hdGlvblxuXG4ndXNlIHN0cmljdCc7XG5cbmNvbnN0IHB1bnljb2RlID0gcmVxdWlyZSgncHVueWNvZGUnKTtcblxuZXhwb3J0cy5wYXJzZSA9IHVybFBhcnNlO1xuZXhwb3J0cy5yZXNvbHZlID0gdXJsUmVzb2x2ZTtcbmV4cG9ydHMucmVzb2x2ZU9iamVjdCA9IHVybFJlc29sdmVPYmplY3Q7XG5leHBvcnRzLmZvcm1hdCA9IHVybEZvcm1hdDtcblxuZXhwb3J0cy5VcmwgPSBVcmw7XG5cbmZ1bmN0aW9uIFVybCgpIHtcbiAgdGhpcy5wcm90b2NvbCA9IG51bGw7XG4gIHRoaXMuc2xhc2hlcyA9IG51bGw7XG4gIHRoaXMuYXV0aCA9IG51bGw7XG4gIHRoaXMuaG9zdCA9IG51bGw7XG4gIHRoaXMucG9ydCA9IG51bGw7XG4gIHRoaXMuaG9zdG5hbWUgPSBudWxsO1xuICB0aGlzLmhhc2ggPSBudWxsO1xuICB0aGlzLnNlYXJjaCA9IG51bGw7XG4gIHRoaXMucXVlcnkgPSBudWxsO1xuICB0aGlzLnBhdGhuYW1lID0gbnVsbDtcbiAgdGhpcy5wYXRoID0gbnVsbDtcbiAgdGhpcy5ocmVmID0gbnVsbDtcbn1cblxuLy8gUmVmZXJlbmNlOiBSRkMgMzk4NiwgUkZDIDE4MDgsIFJGQyAyMzk2XG5cbi8vIGRlZmluZSB0aGVzZSBoZXJlIHNvIGF0IGxlYXN0IHRoZXkgb25seSBoYXZlIHRvIGJlXG4vLyBjb21waWxlZCBvbmNlIG9uIHRoZSBmaXJzdCBtb2R1bGUgbG9hZC5cbmNvbnN0IHByb3RvY29sUGF0dGVybiA9IC9eKFthLXowLTkuKy1dKzopL2k7XG5jb25zdCBwb3J0UGF0dGVybiA9IC86WzAtOV0qJC87XG5cbi8vIFNwZWNpYWwgY2FzZSBmb3IgYSBzaW1wbGUgcGF0aCBVUkxcbmNvbnN0IHNpbXBsZVBhdGhQYXR0ZXJuID0gL14oXFwvXFwvPyg/IVxcLylbXlxcP1xcc10qKShcXD9bXlxcc10qKT8kLztcblxuY29uc3QgaG9zdG5hbWVNYXhMZW4gPSAyNTU7XG4vLyBwcm90b2NvbHMgdGhhdCBjYW4gYWxsb3cgXCJ1bnNhZmVcIiBhbmQgXCJ1bndpc2VcIiBjaGFycy5cbmNvbnN0IHVuc2FmZVByb3RvY29sID0ge1xuICBqYXZhc2NyaXB0OiB0cnVlLFxuICAnamF2YXNjcmlwdDonOiB0cnVlLFxufTtcbi8vIHByb3RvY29scyB0aGF0IG5ldmVyIGhhdmUgYSBob3N0bmFtZS5cbmNvbnN0IGhvc3RsZXNzUHJvdG9jb2wgPSB7XG4gIGphdmFzY3JpcHQ6IHRydWUsXG4gICdqYXZhc2NyaXB0Oic6IHRydWUsXG59O1xuLy8gcHJvdG9jb2xzIHRoYXQgYWx3YXlzIGNvbnRhaW4gYSAvLyBiaXQuXG5jb25zdCBzbGFzaGVkUHJvdG9jb2wgPSB7XG4gIGh0dHA6IHRydWUsXG4gICdodHRwOic6IHRydWUsXG4gIGh0dHBzOiB0cnVlLFxuICAnaHR0cHM6JzogdHJ1ZSxcbiAgZnRwOiB0cnVlLFxuICAnZnRwOic6IHRydWUsXG4gIGdvcGhlcjogdHJ1ZSxcbiAgJ2dvcGhlcjonOiB0cnVlLFxuICBmaWxlOiB0cnVlLFxuICAnZmlsZTonOiB0cnVlLFxufTtcbmNvbnN0IHF1ZXJ5c3RyaW5nID0gcmVxdWlyZSgncXVlcnlzdHJpbmcnKTtcblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cbmZ1bmN0aW9uIHVybFBhcnNlKHVybCwgcGFyc2VRdWVyeVN0cmluZywgc2xhc2hlc0Rlbm90ZUhvc3QpIHtcbiAgaWYgKHVybCBpbnN0YW5jZW9mIFVybCkgcmV0dXJuIHVybDtcblxuICB2YXIgdSA9IG5ldyBVcmwoKTtcbiAgdS5wYXJzZSh1cmwsIHBhcnNlUXVlcnlTdHJpbmcsIHNsYXNoZXNEZW5vdGVIb3N0KTtcbiAgcmV0dXJuIHU7XG59XG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5VcmwucHJvdG90eXBlLnBhcnNlID0gZnVuY3Rpb24gKHVybCwgcGFyc2VRdWVyeVN0cmluZywgc2xhc2hlc0Rlbm90ZUhvc3QpIHtcbiAgaWYgKHR5cGVvZiB1cmwgIT09ICdzdHJpbmcnKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignUGFyYW1ldGVyIFwidXJsXCIgbXVzdCBiZSBhIHN0cmluZywgbm90ICcgKyB0eXBlb2YgdXJsKTtcbiAgfVxuXG4gIC8vIENvcHkgY2hyb21lLCBJRSwgb3BlcmEgYmFja3NsYXNoLWhhbmRsaW5nIGJlaGF2aW9yLlxuICAvLyBCYWNrIHNsYXNoZXMgYmVmb3JlIHRoZSBxdWVyeSBzdHJpbmcgZ2V0IGNvbnZlcnRlZCB0byBmb3J3YXJkIHNsYXNoZXNcbiAgLy8gU2VlOiBodHRwczovL2NvZGUuZ29vZ2xlLmNvbS9wL2Nocm9taXVtL2lzc3Vlcy9kZXRhaWw/aWQ9MjU5MTZcbiAgdmFyIGhhc0hhc2ggPSBmYWxzZTtcbiAgdmFyIHN0YXJ0ID0gLTE7XG4gIHZhciBlbmQgPSAtMTtcbiAgdmFyIHJlc3QgPSAnJztcbiAgdmFyIGxhc3RQb3MgPSAwO1xuICB2YXIgaSA9IDA7XG4gIGZvciAodmFyIGluV3MgPSBmYWxzZSwgc3BsaXQgPSBmYWxzZTsgaSA8IHVybC5sZW5ndGg7ICsraSkge1xuICAgIGNvbnN0IGNvZGUgPSB1cmwuY2hhckNvZGVBdChpKTtcblxuICAgIC8vIEZpbmQgZmlyc3QgYW5kIGxhc3Qgbm9uLXdoaXRlc3BhY2UgY2hhcmFjdGVycyBmb3IgdHJpbW1pbmdcbiAgICBjb25zdCBpc1dzID1cbiAgICAgIGNvZGUgPT09IDMyIC8qICovIHx8XG4gICAgICBjb2RlID09PSA5IC8qXFx0Ki8gfHxcbiAgICAgIGNvZGUgPT09IDEzIC8qXFxyKi8gfHxcbiAgICAgIGNvZGUgPT09IDEwIC8qXFxuKi8gfHxcbiAgICAgIGNvZGUgPT09IDEyIC8qXFxmKi8gfHxcbiAgICAgIGNvZGUgPT09IDE2MCAvKlxcdTAwQTAqLyB8fFxuICAgICAgY29kZSA9PT0gNjUyNzk7IC8qXFx1RkVGRiovXG4gICAgaWYgKHN0YXJ0ID09PSAtMSkge1xuICAgICAgaWYgKGlzV3MpIGNvbnRpbnVlO1xuICAgICAgbGFzdFBvcyA9IHN0YXJ0ID0gaTtcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKGluV3MpIHtcbiAgICAgICAgaWYgKCFpc1dzKSB7XG4gICAgICAgICAgZW5kID0gLTE7XG4gICAgICAgICAgaW5XcyA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGlzV3MpIHtcbiAgICAgICAgZW5kID0gaTtcbiAgICAgICAgaW5XcyA9IHRydWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gT25seSBjb252ZXJ0IGJhY2tzbGFzaGVzIHdoaWxlIHdlIGhhdmVuJ3Qgc2VlbiBhIHNwbGl0IGNoYXJhY3RlclxuICAgIGlmICghc3BsaXQpIHtcbiAgICAgIHN3aXRjaCAoY29kZSkge1xuICAgICAgICBjYXNlIDM1OiAvLyAnIydcbiAgICAgICAgICBoYXNIYXNoID0gdHJ1ZTtcbiAgICAgICAgLy8gRmFsbCB0aHJvdWdoXG4gICAgICAgIGNhc2UgNjM6IC8vICc/J1xuICAgICAgICAgIHNwbGl0ID0gdHJ1ZTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSA5MjogLy8gJ1xcXFwnXG4gICAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgcmVzdCArPSB1cmwuc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgICAgcmVzdCArPSAnLyc7XG4gICAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoIWhhc0hhc2ggJiYgY29kZSA9PT0gMzUgLyojKi8pIHtcbiAgICAgIGhhc0hhc2ggPSB0cnVlO1xuICAgIH1cbiAgfVxuXG4gIC8vIENoZWNrIGlmIHN0cmluZyB3YXMgbm9uLWVtcHR5IChpbmNsdWRpbmcgc3RyaW5ncyB3aXRoIG9ubHkgd2hpdGVzcGFjZSlcbiAgaWYgKHN0YXJ0ICE9PSAtMSkge1xuICAgIGlmIChsYXN0UG9zID09PSBzdGFydCkge1xuICAgICAgLy8gV2UgZGlkbid0IGNvbnZlcnQgYW55IGJhY2tzbGFzaGVzXG5cbiAgICAgIGlmIChlbmQgPT09IC0xKSB7XG4gICAgICAgIGlmIChzdGFydCA9PT0gMCkgcmVzdCA9IHVybDtcbiAgICAgICAgZWxzZSByZXN0ID0gdXJsLnNsaWNlKHN0YXJ0KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc3QgPSB1cmwuc2xpY2Uoc3RhcnQsIGVuZCk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChlbmQgPT09IC0xICYmIGxhc3RQb3MgPCB1cmwubGVuZ3RoKSB7XG4gICAgICAvLyBXZSBjb252ZXJ0ZWQgc29tZSBiYWNrc2xhc2hlcyBhbmQgaGF2ZSBvbmx5IHBhcnQgb2YgdGhlIGVudGlyZSBzdHJpbmdcbiAgICAgIHJlc3QgKz0gdXJsLnNsaWNlKGxhc3RQb3MpO1xuICAgIH0gZWxzZSBpZiAoZW5kICE9PSAtMSAmJiBsYXN0UG9zIDwgZW5kKSB7XG4gICAgICAvLyBXZSBjb252ZXJ0ZWQgc29tZSBiYWNrc2xhc2hlcyBhbmQgaGF2ZSBvbmx5IHBhcnQgb2YgdGhlIGVudGlyZSBzdHJpbmdcbiAgICAgIHJlc3QgKz0gdXJsLnNsaWNlKGxhc3RQb3MsIGVuZCk7XG4gICAgfVxuICB9XG5cbiAgaWYgKCFzbGFzaGVzRGVub3RlSG9zdCAmJiAhaGFzSGFzaCkge1xuICAgIC8vIFRyeSBmYXN0IHBhdGggcmVnZXhwXG4gICAgY29uc3Qgc2ltcGxlUGF0aCA9IHNpbXBsZVBhdGhQYXR0ZXJuLmV4ZWMocmVzdCk7XG4gICAgaWYgKHNpbXBsZVBhdGgpIHtcbiAgICAgIHRoaXMucGF0aCA9IHJlc3Q7XG4gICAgICB0aGlzLmhyZWYgPSByZXN0O1xuICAgICAgdGhpcy5wYXRobmFtZSA9IHNpbXBsZVBhdGhbMV07XG4gICAgICBpZiAoc2ltcGxlUGF0aFsyXSkge1xuICAgICAgICB0aGlzLnNlYXJjaCA9IHNpbXBsZVBhdGhbMl07XG4gICAgICAgIGlmIChwYXJzZVF1ZXJ5U3RyaW5nKSB7XG4gICAgICAgICAgdGhpcy5xdWVyeSA9IHF1ZXJ5c3RyaW5nLnBhcnNlKHRoaXMuc2VhcmNoLnNsaWNlKDEpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLnF1ZXJ5ID0gdGhpcy5zZWFyY2guc2xpY2UoMSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAocGFyc2VRdWVyeVN0cmluZykge1xuICAgICAgICB0aGlzLnNlYXJjaCA9ICcnO1xuICAgICAgICB0aGlzLnF1ZXJ5ID0ge307XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gIH1cblxuICB2YXIgcHJvdG8gPSBwcm90b2NvbFBhdHRlcm4uZXhlYyhyZXN0KTtcbiAgaWYgKHByb3RvKSB7XG4gICAgcHJvdG8gPSBwcm90b1swXTtcbiAgICB2YXIgbG93ZXJQcm90byA9IHByb3RvLnRvTG93ZXJDYXNlKCk7XG4gICAgdGhpcy5wcm90b2NvbCA9IGxvd2VyUHJvdG87XG4gICAgcmVzdCA9IHJlc3Quc2xpY2UocHJvdG8ubGVuZ3RoKTtcbiAgfVxuXG4gIC8vIGZpZ3VyZSBvdXQgaWYgaXQncyBnb3QgYSBob3N0XG4gIC8vIHVzZXJAc2VydmVyIGlzICphbHdheXMqIGludGVycHJldGVkIGFzIGEgaG9zdG5hbWUsIGFuZCB1cmxcbiAgLy8gcmVzb2x1dGlvbiB3aWxsIHRyZWF0IC8vZm9vL2JhciBhcyBob3N0PWZvbyxwYXRoPWJhciBiZWNhdXNlIHRoYXQnc1xuICAvLyBob3cgdGhlIGJyb3dzZXIgcmVzb2x2ZXMgcmVsYXRpdmUgVVJMcy5cbiAgaWYgKHNsYXNoZXNEZW5vdGVIb3N0IHx8IHByb3RvIHx8IC9eXFwvXFwvW15AXFwvXStAW15AXFwvXSsvLnRlc3QocmVzdCkpIHtcbiAgICB2YXIgc2xhc2hlcyA9XG4gICAgICByZXN0LmNoYXJDb2RlQXQoMCkgPT09IDQ3IC8qLyovICYmIHJlc3QuY2hhckNvZGVBdCgxKSA9PT0gNDc7IC8qLyovXG4gICAgaWYgKHNsYXNoZXMgJiYgIShwcm90byAmJiBob3N0bGVzc1Byb3RvY29sW3Byb3RvXSkpIHtcbiAgICAgIHJlc3QgPSByZXN0LnNsaWNlKDIpO1xuICAgICAgdGhpcy5zbGFzaGVzID0gdHJ1ZTtcbiAgICB9XG4gIH1cblxuICBpZiAoXG4gICAgIWhvc3RsZXNzUHJvdG9jb2xbcHJvdG9dICYmXG4gICAgKHNsYXNoZXMgfHwgKHByb3RvICYmICFzbGFzaGVkUHJvdG9jb2xbcHJvdG9dKSlcbiAgKSB7XG4gICAgLy8gdGhlcmUncyBhIGhvc3RuYW1lLlxuICAgIC8vIHRoZSBmaXJzdCBpbnN0YW5jZSBvZiAvLCA/LCA7LCBvciAjIGVuZHMgdGhlIGhvc3QuXG4gICAgLy9cbiAgICAvLyBJZiB0aGVyZSBpcyBhbiBAIGluIHRoZSBob3N0bmFtZSwgdGhlbiBub24taG9zdCBjaGFycyAqYXJlKiBhbGxvd2VkXG4gICAgLy8gdG8gdGhlIGxlZnQgb2YgdGhlIGxhc3QgQCBzaWduLCB1bmxlc3Mgc29tZSBob3N0LWVuZGluZyBjaGFyYWN0ZXJcbiAgICAvLyBjb21lcyAqYmVmb3JlKiB0aGUgQC1zaWduLlxuICAgIC8vIFVSTHMgYXJlIG9ibm94aW91cy5cbiAgICAvL1xuICAgIC8vIGV4OlxuICAgIC8vIGh0dHA6Ly9hQGJAYy8gPT4gdXNlcjphQGIgaG9zdDpjXG4gICAgLy8gaHR0cDovL2FAYj9AYyA9PiB1c2VyOmEgaG9zdDpiIHBhdGg6Lz9AY1xuXG4gICAgLy8gdjAuMTIgVE9ETyhpc2FhY3MpOiBUaGlzIGlzIG5vdCBxdWl0ZSBob3cgQ2hyb21lIGRvZXMgdGhpbmdzLlxuICAgIC8vIFJldmlldyBvdXIgdGVzdCBjYXNlIGFnYWluc3QgYnJvd3NlcnMgbW9yZSBjb21wcmVoZW5zaXZlbHkuXG5cbiAgICB2YXIgaG9zdEVuZCA9IC0xO1xuICAgIHZhciBhdFNpZ24gPSAtMTtcbiAgICB2YXIgbm9uSG9zdCA9IC0xO1xuICAgIGZvciAoaSA9IDA7IGkgPCByZXN0Lmxlbmd0aDsgKytpKSB7XG4gICAgICBzd2l0Y2ggKHJlc3QuY2hhckNvZGVBdChpKSkge1xuICAgICAgICBjYXNlIDk6IC8vICdcXHQnXG4gICAgICAgIGNhc2UgMTA6IC8vICdcXG4nXG4gICAgICAgIGNhc2UgMTM6IC8vICdcXHInXG4gICAgICAgIGNhc2UgMzI6IC8vICcgJ1xuICAgICAgICBjYXNlIDM0OiAvLyAnXCInXG4gICAgICAgIGNhc2UgMzc6IC8vICclJ1xuICAgICAgICBjYXNlIDM5OiAvLyAnXFwnJ1xuICAgICAgICBjYXNlIDU5OiAvLyAnOydcbiAgICAgICAgY2FzZSA2MDogLy8gJzwnXG4gICAgICAgIGNhc2UgNjI6IC8vICc+J1xuICAgICAgICBjYXNlIDkyOiAvLyAnXFxcXCdcbiAgICAgICAgY2FzZSA5NDogLy8gJ14nXG4gICAgICAgIGNhc2UgOTY6IC8vICdgJ1xuICAgICAgICBjYXNlIDEyMzogLy8gJ3snXG4gICAgICAgIGNhc2UgMTI0OiAvLyAnfCdcbiAgICAgICAgY2FzZSAxMjU6IC8vICd9J1xuICAgICAgICAgIC8vIENoYXJhY3RlcnMgdGhhdCBhcmUgbmV2ZXIgZXZlciBhbGxvd2VkIGluIGEgaG9zdG5hbWUgZnJvbSBSRkMgMjM5NlxuICAgICAgICAgIGlmIChub25Ib3N0ID09PSAtMSkgbm9uSG9zdCA9IGk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgMzU6IC8vICcjJ1xuICAgICAgICBjYXNlIDQ3OiAvLyAnLydcbiAgICAgICAgY2FzZSA2MzogLy8gJz8nXG4gICAgICAgICAgLy8gRmluZCB0aGUgZmlyc3QgaW5zdGFuY2Ugb2YgYW55IGhvc3QtZW5kaW5nIGNoYXJhY3RlcnNcbiAgICAgICAgICBpZiAobm9uSG9zdCA9PT0gLTEpIG5vbkhvc3QgPSBpO1xuICAgICAgICAgIGhvc3RFbmQgPSBpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIDY0OiAvLyAnQCdcbiAgICAgICAgICAvLyBBdCB0aGlzIHBvaW50LCBlaXRoZXIgd2UgaGF2ZSBhbiBleHBsaWNpdCBwb2ludCB3aGVyZSB0aGVcbiAgICAgICAgICAvLyBhdXRoIHBvcnRpb24gY2Fubm90IGdvIHBhc3QsIG9yIHRoZSBsYXN0IEAgY2hhciBpcyB0aGUgZGVjaWRlci5cbiAgICAgICAgICBhdFNpZ24gPSBpO1xuICAgICAgICAgIG5vbkhvc3QgPSAtMTtcbiAgICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGlmIChob3N0RW5kICE9PSAtMSkgYnJlYWs7XG4gICAgfVxuICAgIHN0YXJ0ID0gMDtcbiAgICBpZiAoYXRTaWduICE9PSAtMSkge1xuICAgICAgdGhpcy5hdXRoID0gZGVjb2RlVVJJQ29tcG9uZW50KHJlc3Quc2xpY2UoMCwgYXRTaWduKSk7XG4gICAgICBzdGFydCA9IGF0U2lnbiArIDE7XG4gICAgfVxuICAgIGlmIChub25Ib3N0ID09PSAtMSkge1xuICAgICAgdGhpcy5ob3N0ID0gcmVzdC5zbGljZShzdGFydCk7XG4gICAgICByZXN0ID0gJyc7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuaG9zdCA9IHJlc3Quc2xpY2Uoc3RhcnQsIG5vbkhvc3QpO1xuICAgICAgcmVzdCA9IHJlc3Quc2xpY2Uobm9uSG9zdCk7XG4gICAgfVxuXG4gICAgLy8gcHVsbCBvdXQgcG9ydC5cbiAgICB0aGlzLnBhcnNlSG9zdCgpO1xuXG4gICAgLy8gd2UndmUgaW5kaWNhdGVkIHRoYXQgdGhlcmUgaXMgYSBob3N0bmFtZSxcbiAgICAvLyBzbyBldmVuIGlmIGl0J3MgZW1wdHksIGl0IGhhcyB0byBiZSBwcmVzZW50LlxuICAgIGlmICh0eXBlb2YgdGhpcy5ob3N0bmFtZSAhPT0gJ3N0cmluZycpIHRoaXMuaG9zdG5hbWUgPSAnJztcblxuICAgIHZhciBob3N0bmFtZSA9IHRoaXMuaG9zdG5hbWU7XG5cbiAgICAvLyBpZiBob3N0bmFtZSBiZWdpbnMgd2l0aCBbIGFuZCBlbmRzIHdpdGggXVxuICAgIC8vIGFzc3VtZSB0aGF0IGl0J3MgYW4gSVB2NiBhZGRyZXNzLlxuICAgIHZhciBpcHY2SG9zdG5hbWUgPVxuICAgICAgaG9zdG5hbWUuY2hhckNvZGVBdCgwKSA9PT0gOTEgLypbKi8gJiZcbiAgICAgIGhvc3RuYW1lLmNoYXJDb2RlQXQoaG9zdG5hbWUubGVuZ3RoIC0gMSkgPT09IDkzOyAvKl0qL1xuXG4gICAgLy8gdmFsaWRhdGUgYSBsaXR0bGUuXG4gICAgaWYgKCFpcHY2SG9zdG5hbWUpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IHZhbGlkYXRlSG9zdG5hbWUodGhpcywgcmVzdCwgaG9zdG5hbWUpO1xuICAgICAgaWYgKHJlc3VsdCAhPT0gdW5kZWZpbmVkKSByZXN0ID0gcmVzdWx0O1xuICAgIH1cblxuICAgIGlmICh0aGlzLmhvc3RuYW1lLmxlbmd0aCA+IGhvc3RuYW1lTWF4TGVuKSB7XG4gICAgICB0aGlzLmhvc3RuYW1lID0gJyc7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIGhvc3RuYW1lcyBhcmUgYWx3YXlzIGxvd2VyIGNhc2UuXG4gICAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgIH1cblxuICAgIGlmICghaXB2Nkhvc3RuYW1lKSB7XG4gICAgICAvLyBJRE5BIFN1cHBvcnQ6IFJldHVybnMgYSBwdW55Y29kZWQgcmVwcmVzZW50YXRpb24gb2YgXCJkb21haW5cIi5cbiAgICAgIC8vIEl0IG9ubHkgY29udmVydHMgcGFydHMgb2YgdGhlIGRvbWFpbiBuYW1lIHRoYXRcbiAgICAgIC8vIGhhdmUgbm9uLUFTQ0lJIGNoYXJhY3RlcnMsIGkuZS4gaXQgZG9lc24ndCBtYXR0ZXIgaWZcbiAgICAgIC8vIHlvdSBjYWxsIGl0IHdpdGggYSBkb21haW4gdGhhdCBhbHJlYWR5IGlzIEFTQ0lJLW9ubHkuXG4gICAgICB0aGlzLmhvc3RuYW1lID0gcHVueWNvZGUudG9BU0NJSSh0aGlzLmhvc3RuYW1lKTtcbiAgICB9XG5cbiAgICB2YXIgcCA9IHRoaXMucG9ydCA/ICc6JyArIHRoaXMucG9ydCA6ICcnO1xuICAgIHZhciBoID0gdGhpcy5ob3N0bmFtZSB8fCAnJztcbiAgICB0aGlzLmhvc3QgPSBoICsgcDtcblxuICAgIC8vIHN0cmlwIFsgYW5kIF0gZnJvbSB0aGUgaG9zdG5hbWVcbiAgICAvLyB0aGUgaG9zdCBmaWVsZCBzdGlsbCByZXRhaW5zIHRoZW0sIHRob3VnaFxuICAgIGlmIChpcHY2SG9zdG5hbWUpIHtcbiAgICAgIHRoaXMuaG9zdG5hbWUgPSB0aGlzLmhvc3RuYW1lLnNsaWNlKDEsIC0xKTtcbiAgICAgIGlmIChyZXN0WzBdICE9PSAnLycpIHtcbiAgICAgICAgcmVzdCA9ICcvJyArIHJlc3Q7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gbm93IHJlc3QgaXMgc2V0IHRvIHRoZSBwb3N0LWhvc3Qgc3R1ZmYuXG4gIC8vIGNob3Agb2ZmIGFueSBkZWxpbSBjaGFycy5cbiAgaWYgKCF1bnNhZmVQcm90b2NvbFtsb3dlclByb3RvXSkge1xuICAgIC8vIEZpcnN0LCBtYWtlIDEwMCUgc3VyZSB0aGF0IGFueSBcImF1dG9Fc2NhcGVcIiBjaGFycyBnZXRcbiAgICAvLyBlc2NhcGVkLCBldmVuIGlmIGVuY29kZVVSSUNvbXBvbmVudCBkb2Vzbid0IHRoaW5rIHRoZXlcbiAgICAvLyBuZWVkIHRvIGJlLlxuICAgIGNvbnN0IHJlc3VsdCA9IGF1dG9Fc2NhcGVTdHIocmVzdCk7XG4gICAgaWYgKHJlc3VsdCAhPT0gdW5kZWZpbmVkKSByZXN0ID0gcmVzdWx0O1xuICB9XG5cbiAgdmFyIHF1ZXN0aW9uSWR4ID0gLTE7XG4gIHZhciBoYXNoSWR4ID0gLTE7XG4gIGZvciAoaSA9IDA7IGkgPCByZXN0Lmxlbmd0aDsgKytpKSB7XG4gICAgY29uc3QgY29kZSA9IHJlc3QuY2hhckNvZGVBdChpKTtcbiAgICBpZiAoY29kZSA9PT0gMzUgLyojKi8pIHtcbiAgICAgIHRoaXMuaGFzaCA9IHJlc3Quc2xpY2UoaSk7XG4gICAgICBoYXNoSWR4ID0gaTtcbiAgICAgIGJyZWFrO1xuICAgIH0gZWxzZSBpZiAoY29kZSA9PT0gNjMgLyo/Ki8gJiYgcXVlc3Rpb25JZHggPT09IC0xKSB7XG4gICAgICBxdWVzdGlvbklkeCA9IGk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHF1ZXN0aW9uSWR4ICE9PSAtMSkge1xuICAgIGlmIChoYXNoSWR4ID09PSAtMSkge1xuICAgICAgdGhpcy5zZWFyY2ggPSByZXN0LnNsaWNlKHF1ZXN0aW9uSWR4KTtcbiAgICAgIHRoaXMucXVlcnkgPSByZXN0LnNsaWNlKHF1ZXN0aW9uSWR4ICsgMSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuc2VhcmNoID0gcmVzdC5zbGljZShxdWVzdGlvbklkeCwgaGFzaElkeCk7XG4gICAgICB0aGlzLnF1ZXJ5ID0gcmVzdC5zbGljZShxdWVzdGlvbklkeCArIDEsIGhhc2hJZHgpO1xuICAgIH1cbiAgICBpZiAocGFyc2VRdWVyeVN0cmluZykge1xuICAgICAgdGhpcy5xdWVyeSA9IHF1ZXJ5c3RyaW5nLnBhcnNlKHRoaXMucXVlcnkpO1xuICAgIH1cbiAgfSBlbHNlIGlmIChwYXJzZVF1ZXJ5U3RyaW5nKSB7XG4gICAgLy8gbm8gcXVlcnkgc3RyaW5nLCBidXQgcGFyc2VRdWVyeVN0cmluZyBzdGlsbCByZXF1ZXN0ZWRcbiAgICB0aGlzLnNlYXJjaCA9ICcnO1xuICAgIHRoaXMucXVlcnkgPSB7fTtcbiAgfVxuXG4gIHZhciBmaXJzdElkeCA9XG4gICAgcXVlc3Rpb25JZHggIT09IC0xICYmIChoYXNoSWR4ID09PSAtMSB8fCBxdWVzdGlvbklkeCA8IGhhc2hJZHgpXG4gICAgICA/IHF1ZXN0aW9uSWR4XG4gICAgICA6IGhhc2hJZHg7XG4gIGlmIChmaXJzdElkeCA9PT0gLTEpIHtcbiAgICBpZiAocmVzdC5sZW5ndGggPiAwKSB0aGlzLnBhdGhuYW1lID0gcmVzdDtcbiAgfSBlbHNlIGlmIChmaXJzdElkeCA+IDApIHtcbiAgICB0aGlzLnBhdGhuYW1lID0gcmVzdC5zbGljZSgwLCBmaXJzdElkeCk7XG4gIH1cbiAgaWYgKHNsYXNoZWRQcm90b2NvbFtsb3dlclByb3RvXSAmJiB0aGlzLmhvc3RuYW1lICYmICF0aGlzLnBhdGhuYW1lKSB7XG4gICAgdGhpcy5wYXRobmFtZSA9ICcvJztcbiAgfVxuXG4gIC8vIHRvIHN1cHBvcnQgaHR0cC5yZXF1ZXN0XG4gIGlmICh0aGlzLnBhdGhuYW1lIHx8IHRoaXMuc2VhcmNoKSB7XG4gICAgY29uc3QgcCA9IHRoaXMucGF0aG5hbWUgfHwgJyc7XG4gICAgY29uc3QgcyA9IHRoaXMuc2VhcmNoIHx8ICcnO1xuICAgIHRoaXMucGF0aCA9IHAgKyBzO1xuICB9XG5cbiAgLy8gZmluYWxseSwgcmVjb25zdHJ1Y3QgdGhlIGhyZWYgYmFzZWQgb24gd2hhdCBoYXMgYmVlbiB2YWxpZGF0ZWQuXG4gIHRoaXMuaHJlZiA9IHRoaXMuZm9ybWF0KCk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cbmZ1bmN0aW9uIHZhbGlkYXRlSG9zdG5hbWUoc2VsZiwgcmVzdCwgaG9zdG5hbWUpIHtcbiAgZm9yICh2YXIgaSA9IDAsIGxhc3RQb3M7IGkgPD0gaG9zdG5hbWUubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgY29kZTtcbiAgICBpZiAoaSA8IGhvc3RuYW1lLmxlbmd0aCkgY29kZSA9IGhvc3RuYW1lLmNoYXJDb2RlQXQoaSk7XG4gICAgaWYgKGNvZGUgPT09IDQ2IC8qLiovIHx8IGkgPT09IGhvc3RuYW1lLmxlbmd0aCkge1xuICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkge1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiA2Mykge1xuICAgICAgICAgIHNlbGYuaG9zdG5hbWUgPSBob3N0bmFtZS5zbGljZSgwLCBsYXN0UG9zICsgNjMpO1xuICAgICAgICAgIHJldHVybiAnLycgKyBob3N0bmFtZS5zbGljZShsYXN0UG9zICsgNjMpICsgcmVzdDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgY29udGludWU7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIChjb2RlID49IDQ4IC8qMCovICYmIGNvZGUgPD0gNTcpIC8qOSovIHx8XG4gICAgICAoY29kZSA+PSA5NyAvKmEqLyAmJiBjb2RlIDw9IDEyMikgLyp6Ki8gfHxcbiAgICAgIGNvZGUgPT09IDQ1IC8qLSovIHx8XG4gICAgICAoY29kZSA+PSA2NSAvKkEqLyAmJiBjb2RlIDw9IDkwKSAvKloqLyB8fFxuICAgICAgY29kZSA9PT0gNDMgLyorKi8gfHxcbiAgICAgIGNvZGUgPT09IDk1IC8qXyovIHx8XG4gICAgICAvKiBCRUdJTiBNT05HTyBVUkkgUEFUQ0ggKi9cbiAgICAgIGNvZGUgPT09IDQ0IC8qLCovIHx8XG4gICAgICBjb2RlID09PSA1OCAvKjoqLyB8fFxuICAgICAgLyogRU5EIE1PTkdPIFVSSSBQQVRDSCAqL1xuICAgICAgY29kZSA+IDEyN1xuICAgICkge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIC8vIEludmFsaWQgaG9zdCBjaGFyYWN0ZXJcbiAgICBzZWxmLmhvc3RuYW1lID0gaG9zdG5hbWUuc2xpY2UoMCwgaSk7XG4gICAgaWYgKGkgPCBob3N0bmFtZS5sZW5ndGgpIHJldHVybiAnLycgKyBob3N0bmFtZS5zbGljZShpKSArIHJlc3Q7XG4gICAgYnJlYWs7XG4gIH1cbn1cblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cbmZ1bmN0aW9uIGF1dG9Fc2NhcGVTdHIocmVzdCkge1xuICB2YXIgbmV3UmVzdCA9ICcnO1xuICB2YXIgbGFzdFBvcyA9IDA7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgcmVzdC5sZW5ndGg7ICsraSkge1xuICAgIC8vIEF1dG9tYXRpY2FsbHkgZXNjYXBlIGFsbCBkZWxpbWl0ZXJzIGFuZCB1bndpc2UgY2hhcmFjdGVycyBmcm9tIFJGQyAyMzk2XG4gICAgLy8gQWxzbyBlc2NhcGUgc2luZ2xlIHF1b3RlcyBpbiBjYXNlIG9mIGFuIFhTUyBhdHRhY2tcbiAgICBzd2l0Y2ggKHJlc3QuY2hhckNvZGVBdChpKSkge1xuICAgICAgY2FzZSA5OiAvLyAnXFx0J1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyUwOSc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDEwOiAvLyAnXFxuJ1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyUwQSc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDEzOiAvLyAnXFxyJ1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyUwRCc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDMyOiAvLyAnICdcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclMjAnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAzNDogLy8gJ1wiJ1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyUyMic7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDM5OiAvLyAnXFwnJ1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyUyNyc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDYwOiAvLyAnPCdcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclM0MnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSA2MjogLy8gJz4nXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UmVzdCArPSAnJTNFJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgOTI6IC8vICdcXFxcJ1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyU1Qyc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDk0OiAvLyAnXidcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclNUUnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSA5NjogLy8gJ2AnXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UmVzdCArPSAnJTYwJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMTIzOiAvLyAneydcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclN0InO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAxMjQ6IC8vICd8J1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyU3Qyc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDEyNTogLy8gJ30nXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UmVzdCArPSAnJTdEJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICB9XG4gIH1cbiAgaWYgKGxhc3RQb3MgPT09IDApIHJldHVybjtcbiAgaWYgKGxhc3RQb3MgPCByZXN0Lmxlbmd0aCkgcmV0dXJuIG5ld1Jlc3QgKyByZXN0LnNsaWNlKGxhc3RQb3MpO1xuICBlbHNlIHJldHVybiBuZXdSZXN0O1xufVxuXG4vLyBmb3JtYXQgYSBwYXJzZWQgb2JqZWN0IGludG8gYSB1cmwgc3RyaW5nXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuZnVuY3Rpb24gdXJsRm9ybWF0KG9iaikge1xuICAvLyBlbnN1cmUgaXQncyBhbiBvYmplY3QsIGFuZCBub3QgYSBzdHJpbmcgdXJsLlxuICAvLyBJZiBpdCdzIGFuIG9iaiwgdGhpcyBpcyBhIG5vLW9wLlxuICAvLyB0aGlzIHdheSwgeW91IGNhbiBjYWxsIHVybF9mb3JtYXQoKSBvbiBzdHJpbmdzXG4gIC8vIHRvIGNsZWFuIHVwIHBvdGVudGlhbGx5IHdvbmt5IHVybHMuXG4gIGlmICh0eXBlb2Ygb2JqID09PSAnc3RyaW5nJykgb2JqID0gdXJsUGFyc2Uob2JqKTtcbiAgZWxzZSBpZiAodHlwZW9mIG9iaiAhPT0gJ29iamVjdCcgfHwgb2JqID09PSBudWxsKVxuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXG4gICAgICAnUGFyYW1ldGVyIFwidXJsT2JqXCIgbXVzdCBiZSBhbiBvYmplY3QsIG5vdCAnICsgb2JqID09PSBudWxsXG4gICAgICAgID8gJ251bGwnXG4gICAgICAgIDogdHlwZW9mIG9ialxuICAgICk7XG4gIGVsc2UgaWYgKCEob2JqIGluc3RhbmNlb2YgVXJsKSkgcmV0dXJuIFVybC5wcm90b3R5cGUuZm9ybWF0LmNhbGwob2JqKTtcblxuICByZXR1cm4gb2JqLmZvcm1hdCgpO1xufVxuXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuVXJsLnByb3RvdHlwZS5mb3JtYXQgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBhdXRoID0gdGhpcy5hdXRoIHx8ICcnO1xuICBpZiAoYXV0aCkge1xuICAgIGF1dGggPSBlbmNvZGVBdXRoKGF1dGgpO1xuICAgIGF1dGggKz0gJ0AnO1xuICB9XG5cbiAgdmFyIHByb3RvY29sID0gdGhpcy5wcm90b2NvbCB8fCAnJztcbiAgdmFyIHBhdGhuYW1lID0gdGhpcy5wYXRobmFtZSB8fCAnJztcbiAgdmFyIGhhc2ggPSB0aGlzLmhhc2ggfHwgJyc7XG4gIHZhciBob3N0ID0gZmFsc2U7XG4gIHZhciBxdWVyeSA9ICcnO1xuXG4gIGlmICh0aGlzLmhvc3QpIHtcbiAgICBob3N0ID0gYXV0aCArIHRoaXMuaG9zdDtcbiAgfSBlbHNlIGlmICh0aGlzLmhvc3RuYW1lKSB7XG4gICAgaG9zdCA9XG4gICAgICBhdXRoICtcbiAgICAgICh0aGlzLmhvc3RuYW1lLmluZGV4T2YoJzonKSA9PT0gLTFcbiAgICAgICAgPyB0aGlzLmhvc3RuYW1lXG4gICAgICAgIDogJ1snICsgdGhpcy5ob3N0bmFtZSArICddJyk7XG4gICAgaWYgKHRoaXMucG9ydCkge1xuICAgICAgaG9zdCArPSAnOicgKyB0aGlzLnBvcnQ7XG4gICAgfVxuICB9XG5cbiAgaWYgKHRoaXMucXVlcnkgIT09IG51bGwgJiYgdHlwZW9mIHRoaXMucXVlcnkgPT09ICdvYmplY3QnKVxuICAgIHF1ZXJ5ID0gcXVlcnlzdHJpbmcuc3RyaW5naWZ5KHRoaXMucXVlcnkpO1xuXG4gIHZhciBzZWFyY2ggPSB0aGlzLnNlYXJjaCB8fCAocXVlcnkgJiYgJz8nICsgcXVlcnkpIHx8ICcnO1xuXG4gIGlmIChwcm90b2NvbCAmJiBwcm90b2NvbC5jaGFyQ29kZUF0KHByb3RvY29sLmxlbmd0aCAtIDEpICE9PSA1OCAvKjoqLylcbiAgICBwcm90b2NvbCArPSAnOic7XG5cbiAgdmFyIG5ld1BhdGhuYW1lID0gJyc7XG4gIHZhciBsYXN0UG9zID0gMDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBwYXRobmFtZS5sZW5ndGg7ICsraSkge1xuICAgIHN3aXRjaCAocGF0aG5hbWUuY2hhckNvZGVBdChpKSkge1xuICAgICAgY2FzZSAzNTogLy8gJyMnXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1BhdGhuYW1lICs9IHBhdGhuYW1lLnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdQYXRobmFtZSArPSAnJTIzJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgNjM6IC8vICc/J1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdQYXRobmFtZSArPSBwYXRobmFtZS5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UGF0aG5hbWUgKz0gJyUzRic7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG4gIGlmIChsYXN0UG9zID4gMCkge1xuICAgIGlmIChsYXN0UG9zICE9PSBwYXRobmFtZS5sZW5ndGgpXG4gICAgICBwYXRobmFtZSA9IG5ld1BhdGhuYW1lICsgcGF0aG5hbWUuc2xpY2UobGFzdFBvcyk7XG4gICAgZWxzZSBwYXRobmFtZSA9IG5ld1BhdGhuYW1lO1xuICB9XG5cbiAgLy8gb25seSB0aGUgc2xhc2hlZFByb3RvY29scyBnZXQgdGhlIC8vLiAgTm90IG1haWx0bzosIHhtcHA6LCBldGMuXG4gIC8vIHVubGVzcyB0aGV5IGhhZCB0aGVtIHRvIGJlZ2luIHdpdGguXG4gIGlmIChcbiAgICB0aGlzLnNsYXNoZXMgfHxcbiAgICAoKCFwcm90b2NvbCB8fCBzbGFzaGVkUHJvdG9jb2xbcHJvdG9jb2xdKSAmJiBob3N0ICE9PSBmYWxzZSlcbiAgKSB7XG4gICAgaG9zdCA9ICcvLycgKyAoaG9zdCB8fCAnJyk7XG4gICAgaWYgKHBhdGhuYW1lICYmIHBhdGhuYW1lLmNoYXJDb2RlQXQoMCkgIT09IDQ3IC8qLyovKVxuICAgICAgcGF0aG5hbWUgPSAnLycgKyBwYXRobmFtZTtcbiAgfSBlbHNlIGlmICghaG9zdCkge1xuICAgIGhvc3QgPSAnJztcbiAgfVxuXG4gIHNlYXJjaCA9IHNlYXJjaC5yZXBsYWNlKCcjJywgJyUyMycpO1xuXG4gIGlmIChoYXNoICYmIGhhc2guY2hhckNvZGVBdCgwKSAhPT0gMzUgLyojKi8pIGhhc2ggPSAnIycgKyBoYXNoO1xuICBpZiAoc2VhcmNoICYmIHNlYXJjaC5jaGFyQ29kZUF0KDApICE9PSA2MyAvKj8qLykgc2VhcmNoID0gJz8nICsgc2VhcmNoO1xuXG4gIHJldHVybiBwcm90b2NvbCArIGhvc3QgKyBwYXRobmFtZSArIHNlYXJjaCArIGhhc2g7XG59O1xuXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuZnVuY3Rpb24gdXJsUmVzb2x2ZShzb3VyY2UsIHJlbGF0aXZlKSB7XG4gIHJldHVybiB1cmxQYXJzZShzb3VyY2UsIGZhbHNlLCB0cnVlKS5yZXNvbHZlKHJlbGF0aXZlKTtcbn1cblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cblVybC5wcm90b3R5cGUucmVzb2x2ZSA9IGZ1bmN0aW9uIChyZWxhdGl2ZSkge1xuICByZXR1cm4gdGhpcy5yZXNvbHZlT2JqZWN0KHVybFBhcnNlKHJlbGF0aXZlLCBmYWxzZSwgdHJ1ZSkpLmZvcm1hdCgpO1xufTtcblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cbmZ1bmN0aW9uIHVybFJlc29sdmVPYmplY3Qoc291cmNlLCByZWxhdGl2ZSkge1xuICBpZiAoIXNvdXJjZSkgcmV0dXJuIHJlbGF0aXZlO1xuICByZXR1cm4gdXJsUGFyc2Uoc291cmNlLCBmYWxzZSwgdHJ1ZSkucmVzb2x2ZU9iamVjdChyZWxhdGl2ZSk7XG59XG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5VcmwucHJvdG90eXBlLnJlc29sdmVPYmplY3QgPSBmdW5jdGlvbiAocmVsYXRpdmUpIHtcbiAgaWYgKHR5cGVvZiByZWxhdGl2ZSA9PT0gJ3N0cmluZycpIHtcbiAgICB2YXIgcmVsID0gbmV3IFVybCgpO1xuICAgIHJlbC5wYXJzZShyZWxhdGl2ZSwgZmFsc2UsIHRydWUpO1xuICAgIHJlbGF0aXZlID0gcmVsO1xuICB9XG5cbiAgdmFyIHJlc3VsdCA9IG5ldyBVcmwoKTtcbiAgdmFyIHRrZXlzID0gT2JqZWN0LmtleXModGhpcyk7XG4gIGZvciAodmFyIHRrID0gMDsgdGsgPCB0a2V5cy5sZW5ndGg7IHRrKyspIHtcbiAgICB2YXIgdGtleSA9IHRrZXlzW3RrXTtcbiAgICByZXN1bHRbdGtleV0gPSB0aGlzW3RrZXldO1xuICB9XG5cbiAgLy8gaGFzaCBpcyBhbHdheXMgb3ZlcnJpZGRlbiwgbm8gbWF0dGVyIHdoYXQuXG4gIC8vIGV2ZW4gaHJlZj1cIlwiIHdpbGwgcmVtb3ZlIGl0LlxuICByZXN1bHQuaGFzaCA9IHJlbGF0aXZlLmhhc2g7XG5cbiAgLy8gaWYgdGhlIHJlbGF0aXZlIHVybCBpcyBlbXB0eSwgdGhlbiB0aGVyZSdzIG5vdGhpbmcgbGVmdCB0byBkbyBoZXJlLlxuICBpZiAocmVsYXRpdmUuaHJlZiA9PT0gJycpIHtcbiAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gaHJlZnMgbGlrZSAvL2Zvby9iYXIgYWx3YXlzIGN1dCB0byB0aGUgcHJvdG9jb2wuXG4gIGlmIChyZWxhdGl2ZS5zbGFzaGVzICYmICFyZWxhdGl2ZS5wcm90b2NvbCkge1xuICAgIC8vIHRha2UgZXZlcnl0aGluZyBleGNlcHQgdGhlIHByb3RvY29sIGZyb20gcmVsYXRpdmVcbiAgICB2YXIgcmtleXMgPSBPYmplY3Qua2V5cyhyZWxhdGl2ZSk7XG4gICAgZm9yICh2YXIgcmsgPSAwOyByayA8IHJrZXlzLmxlbmd0aDsgcmsrKykge1xuICAgICAgdmFyIHJrZXkgPSBya2V5c1tya107XG4gICAgICBpZiAocmtleSAhPT0gJ3Byb3RvY29sJykgcmVzdWx0W3JrZXldID0gcmVsYXRpdmVbcmtleV07XG4gICAgfVxuXG4gICAgLy91cmxQYXJzZSBhcHBlbmRzIHRyYWlsaW5nIC8gdG8gdXJscyBsaWtlIGh0dHA6Ly93d3cuZXhhbXBsZS5jb21cbiAgICBpZiAoXG4gICAgICBzbGFzaGVkUHJvdG9jb2xbcmVzdWx0LnByb3RvY29sXSAmJlxuICAgICAgcmVzdWx0Lmhvc3RuYW1lICYmXG4gICAgICAhcmVzdWx0LnBhdGhuYW1lXG4gICAgKSB7XG4gICAgICByZXN1bHQucGF0aCA9IHJlc3VsdC5wYXRobmFtZSA9ICcvJztcbiAgICB9XG5cbiAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgaWYgKHJlbGF0aXZlLnByb3RvY29sICYmIHJlbGF0aXZlLnByb3RvY29sICE9PSByZXN1bHQucHJvdG9jb2wpIHtcbiAgICAvLyBpZiBpdCdzIGEga25vd24gdXJsIHByb3RvY29sLCB0aGVuIGNoYW5naW5nXG4gICAgLy8gdGhlIHByb3RvY29sIGRvZXMgd2VpcmQgdGhpbmdzXG4gICAgLy8gZmlyc3QsIGlmIGl0J3Mgbm90IGZpbGU6LCB0aGVuIHdlIE1VU1QgaGF2ZSBhIGhvc3QsXG4gICAgLy8gYW5kIGlmIHRoZXJlIHdhcyBhIHBhdGhcbiAgICAvLyB0byBiZWdpbiB3aXRoLCB0aGVuIHdlIE1VU1QgaGF2ZSBhIHBhdGguXG4gICAgLy8gaWYgaXQgaXMgZmlsZTosIHRoZW4gdGhlIGhvc3QgaXMgZHJvcHBlZCxcbiAgICAvLyBiZWNhdXNlIHRoYXQncyBrbm93biB0byBiZSBob3N0bGVzcy5cbiAgICAvLyBhbnl0aGluZyBlbHNlIGlzIGFzc3VtZWQgdG8gYmUgYWJzb2x1dGUuXG4gICAgaWYgKCFzbGFzaGVkUHJvdG9jb2xbcmVsYXRpdmUucHJvdG9jb2xdKSB7XG4gICAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHJlbGF0aXZlKTtcbiAgICAgIGZvciAodmFyIHYgPSAwOyB2IDwga2V5cy5sZW5ndGg7IHYrKykge1xuICAgICAgICB2YXIgayA9IGtleXNbdl07XG4gICAgICAgIHJlc3VsdFtrXSA9IHJlbGF0aXZlW2tdO1xuICAgICAgfVxuICAgICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIHJlc3VsdC5wcm90b2NvbCA9IHJlbGF0aXZlLnByb3RvY29sO1xuICAgIGlmIChcbiAgICAgICFyZWxhdGl2ZS5ob3N0ICYmXG4gICAgICAhL15maWxlOj8kLy50ZXN0KHJlbGF0aXZlLnByb3RvY29sKSAmJlxuICAgICAgIWhvc3RsZXNzUHJvdG9jb2xbcmVsYXRpdmUucHJvdG9jb2xdXG4gICAgKSB7XG4gICAgICBjb25zdCByZWxQYXRoID0gKHJlbGF0aXZlLnBhdGhuYW1lIHx8ICcnKS5zcGxpdCgnLycpO1xuICAgICAgd2hpbGUgKHJlbFBhdGgubGVuZ3RoICYmICEocmVsYXRpdmUuaG9zdCA9IHJlbFBhdGguc2hpZnQoKSkpO1xuICAgICAgaWYgKCFyZWxhdGl2ZS5ob3N0KSByZWxhdGl2ZS5ob3N0ID0gJyc7XG4gICAgICBpZiAoIXJlbGF0aXZlLmhvc3RuYW1lKSByZWxhdGl2ZS5ob3N0bmFtZSA9ICcnO1xuICAgICAgaWYgKHJlbFBhdGhbMF0gIT09ICcnKSByZWxQYXRoLnVuc2hpZnQoJycpO1xuICAgICAgaWYgKHJlbFBhdGgubGVuZ3RoIDwgMikgcmVsUGF0aC51bnNoaWZ0KCcnKTtcbiAgICAgIHJlc3VsdC5wYXRobmFtZSA9IHJlbFBhdGguam9pbignLycpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXN1bHQucGF0aG5hbWUgPSByZWxhdGl2ZS5wYXRobmFtZTtcbiAgICB9XG4gICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICByZXN1bHQucXVlcnkgPSByZWxhdGl2ZS5xdWVyeTtcbiAgICByZXN1bHQuaG9zdCA9IHJlbGF0aXZlLmhvc3QgfHwgJyc7XG4gICAgcmVzdWx0LmF1dGggPSByZWxhdGl2ZS5hdXRoO1xuICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlbGF0aXZlLmhvc3RuYW1lIHx8IHJlbGF0aXZlLmhvc3Q7XG4gICAgcmVzdWx0LnBvcnQgPSByZWxhdGl2ZS5wb3J0O1xuICAgIC8vIHRvIHN1cHBvcnQgaHR0cC5yZXF1ZXN0XG4gICAgaWYgKHJlc3VsdC5wYXRobmFtZSB8fCByZXN1bHQuc2VhcmNoKSB7XG4gICAgICB2YXIgcCA9IHJlc3VsdC5wYXRobmFtZSB8fCAnJztcbiAgICAgIHZhciBzID0gcmVzdWx0LnNlYXJjaCB8fCAnJztcbiAgICAgIHJlc3VsdC5wYXRoID0gcCArIHM7XG4gICAgfVxuICAgIHJlc3VsdC5zbGFzaGVzID0gcmVzdWx0LnNsYXNoZXMgfHwgcmVsYXRpdmUuc2xhc2hlcztcbiAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgdmFyIGlzU291cmNlQWJzID0gcmVzdWx0LnBhdGhuYW1lICYmIHJlc3VsdC5wYXRobmFtZS5jaGFyQXQoMCkgPT09ICcvJztcbiAgdmFyIGlzUmVsQWJzID1cbiAgICByZWxhdGl2ZS5ob3N0IHx8IChyZWxhdGl2ZS5wYXRobmFtZSAmJiByZWxhdGl2ZS5wYXRobmFtZS5jaGFyQXQoMCkgPT09ICcvJyk7XG4gIHZhciBtdXN0RW5kQWJzID1cbiAgICBpc1JlbEFicyB8fCBpc1NvdXJjZUFicyB8fCAocmVzdWx0Lmhvc3QgJiYgcmVsYXRpdmUucGF0aG5hbWUpO1xuICB2YXIgcmVtb3ZlQWxsRG90cyA9IG11c3RFbmRBYnM7XG4gIHZhciBzcmNQYXRoID0gKHJlc3VsdC5wYXRobmFtZSAmJiByZXN1bHQucGF0aG5hbWUuc3BsaXQoJy8nKSkgfHwgW107XG4gIHZhciByZWxQYXRoID0gKHJlbGF0aXZlLnBhdGhuYW1lICYmIHJlbGF0aXZlLnBhdGhuYW1lLnNwbGl0KCcvJykpIHx8IFtdO1xuICB2YXIgcHN5Y2hvdGljID0gcmVzdWx0LnByb3RvY29sICYmICFzbGFzaGVkUHJvdG9jb2xbcmVzdWx0LnByb3RvY29sXTtcblxuICAvLyBpZiB0aGUgdXJsIGlzIGEgbm9uLXNsYXNoZWQgdXJsLCB0aGVuIHJlbGF0aXZlXG4gIC8vIGxpbmtzIGxpa2UgLi4vLi4gc2hvdWxkIGJlIGFibGVcbiAgLy8gdG8gY3Jhd2wgdXAgdG8gdGhlIGhvc3RuYW1lLCBhcyB3ZWxsLiAgVGhpcyBpcyBzdHJhbmdlLlxuICAvLyByZXN1bHQucHJvdG9jb2wgaGFzIGFscmVhZHkgYmVlbiBzZXQgYnkgbm93LlxuICAvLyBMYXRlciBvbiwgcHV0IHRoZSBmaXJzdCBwYXRoIHBhcnQgaW50byB0aGUgaG9zdCBmaWVsZC5cbiAgaWYgKHBzeWNob3RpYykge1xuICAgIHJlc3VsdC5ob3N0bmFtZSA9ICcnO1xuICAgIHJlc3VsdC5wb3J0ID0gbnVsbDtcbiAgICBpZiAocmVzdWx0Lmhvc3QpIHtcbiAgICAgIGlmIChzcmNQYXRoWzBdID09PSAnJykgc3JjUGF0aFswXSA9IHJlc3VsdC5ob3N0O1xuICAgICAgZWxzZSBzcmNQYXRoLnVuc2hpZnQocmVzdWx0Lmhvc3QpO1xuICAgIH1cbiAgICByZXN1bHQuaG9zdCA9ICcnO1xuICAgIGlmIChyZWxhdGl2ZS5wcm90b2NvbCkge1xuICAgICAgcmVsYXRpdmUuaG9zdG5hbWUgPSBudWxsO1xuICAgICAgcmVsYXRpdmUucG9ydCA9IG51bGw7XG4gICAgICBpZiAocmVsYXRpdmUuaG9zdCkge1xuICAgICAgICBpZiAocmVsUGF0aFswXSA9PT0gJycpIHJlbFBhdGhbMF0gPSByZWxhdGl2ZS5ob3N0O1xuICAgICAgICBlbHNlIHJlbFBhdGgudW5zaGlmdChyZWxhdGl2ZS5ob3N0KTtcbiAgICAgIH1cbiAgICAgIHJlbGF0aXZlLmhvc3QgPSBudWxsO1xuICAgIH1cbiAgICBtdXN0RW5kQWJzID0gbXVzdEVuZEFicyAmJiAocmVsUGF0aFswXSA9PT0gJycgfHwgc3JjUGF0aFswXSA9PT0gJycpO1xuICB9XG5cbiAgaWYgKGlzUmVsQWJzKSB7XG4gICAgLy8gaXQncyBhYnNvbHV0ZS5cbiAgICByZXN1bHQuaG9zdCA9XG4gICAgICByZWxhdGl2ZS5ob3N0IHx8IHJlbGF0aXZlLmhvc3QgPT09ICcnID8gcmVsYXRpdmUuaG9zdCA6IHJlc3VsdC5ob3N0O1xuICAgIHJlc3VsdC5ob3N0bmFtZSA9XG4gICAgICByZWxhdGl2ZS5ob3N0bmFtZSB8fCByZWxhdGl2ZS5ob3N0bmFtZSA9PT0gJydcbiAgICAgICAgPyByZWxhdGl2ZS5ob3N0bmFtZVxuICAgICAgICA6IHJlc3VsdC5ob3N0bmFtZTtcbiAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgIHJlc3VsdC5xdWVyeSA9IHJlbGF0aXZlLnF1ZXJ5O1xuICAgIHNyY1BhdGggPSByZWxQYXRoO1xuICAgIC8vIGZhbGwgdGhyb3VnaCB0byB0aGUgZG90LWhhbmRsaW5nIGJlbG93LlxuICB9IGVsc2UgaWYgKHJlbFBhdGgubGVuZ3RoKSB7XG4gICAgLy8gaXQncyByZWxhdGl2ZVxuICAgIC8vIHRocm93IGF3YXkgdGhlIGV4aXN0aW5nIGZpbGUsIGFuZCB0YWtlIHRoZSBuZXcgcGF0aCBpbnN0ZWFkLlxuICAgIGlmICghc3JjUGF0aCkgc3JjUGF0aCA9IFtdO1xuICAgIHNyY1BhdGgucG9wKCk7XG4gICAgc3JjUGF0aCA9IHNyY1BhdGguY29uY2F0KHJlbFBhdGgpO1xuICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgcmVzdWx0LnF1ZXJ5ID0gcmVsYXRpdmUucXVlcnk7XG4gIH0gZWxzZSBpZiAocmVsYXRpdmUuc2VhcmNoICE9PSBudWxsICYmIHJlbGF0aXZlLnNlYXJjaCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgLy8ganVzdCBwdWxsIG91dCB0aGUgc2VhcmNoLlxuICAgIC8vIGxpa2UgaHJlZj0nP2ZvbycuXG4gICAgLy8gUHV0IHRoaXMgYWZ0ZXIgdGhlIG90aGVyIHR3byBjYXNlcyBiZWNhdXNlIGl0IHNpbXBsaWZpZXMgdGhlIGJvb2xlYW5zXG4gICAgaWYgKHBzeWNob3RpYykge1xuICAgICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVzdWx0Lmhvc3QgPSBzcmNQYXRoLnNoaWZ0KCk7XG4gICAgICAvL29jY2FzaW9uYWxseSB0aGUgYXV0aCBjYW4gZ2V0IHN0dWNrIG9ubHkgaW4gaG9zdFxuICAgICAgLy90aGlzIGVzcGVjaWFsbHkgaGFwcGVucyBpbiBjYXNlcyBsaWtlXG4gICAgICAvL3VybC5yZXNvbHZlT2JqZWN0KCdtYWlsdG86bG9jYWwxQGRvbWFpbjEnLCAnbG9jYWwyQGRvbWFpbjInKVxuICAgICAgY29uc3QgYXV0aEluSG9zdCA9XG4gICAgICAgIHJlc3VsdC5ob3N0ICYmIHJlc3VsdC5ob3N0LmluZGV4T2YoJ0AnKSA+IDBcbiAgICAgICAgICA/IHJlc3VsdC5ob3N0LnNwbGl0KCdAJylcbiAgICAgICAgICA6IGZhbHNlO1xuICAgICAgaWYgKGF1dGhJbkhvc3QpIHtcbiAgICAgICAgcmVzdWx0LmF1dGggPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgICAgIHJlc3VsdC5ob3N0ID0gcmVzdWx0Lmhvc3RuYW1lID0gYXV0aEluSG9zdC5zaGlmdCgpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgIHJlc3VsdC5xdWVyeSA9IHJlbGF0aXZlLnF1ZXJ5O1xuICAgIC8vdG8gc3VwcG9ydCBodHRwLnJlcXVlc3RcbiAgICBpZiAocmVzdWx0LnBhdGhuYW1lICE9PSBudWxsIHx8IHJlc3VsdC5zZWFyY2ggIT09IG51bGwpIHtcbiAgICAgIHJlc3VsdC5wYXRoID1cbiAgICAgICAgKHJlc3VsdC5wYXRobmFtZSA/IHJlc3VsdC5wYXRobmFtZSA6ICcnKSArXG4gICAgICAgIChyZXN1bHQuc2VhcmNoID8gcmVzdWx0LnNlYXJjaCA6ICcnKTtcbiAgICB9XG4gICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGlmICghc3JjUGF0aC5sZW5ndGgpIHtcbiAgICAvLyBubyBwYXRoIGF0IGFsbC4gIGVhc3kuXG4gICAgLy8gd2UndmUgYWxyZWFkeSBoYW5kbGVkIHRoZSBvdGhlciBzdHVmZiBhYm92ZS5cbiAgICByZXN1bHQucGF0aG5hbWUgPSBudWxsO1xuICAgIC8vdG8gc3VwcG9ydCBodHRwLnJlcXVlc3RcbiAgICBpZiAocmVzdWx0LnNlYXJjaCkge1xuICAgICAgcmVzdWx0LnBhdGggPSAnLycgKyByZXN1bHQuc2VhcmNoO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXN1bHQucGF0aCA9IG51bGw7XG4gICAgfVxuICAgIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvLyBpZiBhIHVybCBFTkRzIGluIC4gb3IgLi4sIHRoZW4gaXQgbXVzdCBnZXQgYSB0cmFpbGluZyBzbGFzaC5cbiAgLy8gaG93ZXZlciwgaWYgaXQgZW5kcyBpbiBhbnl0aGluZyBlbHNlIG5vbi1zbGFzaHksXG4gIC8vIHRoZW4gaXQgbXVzdCBOT1QgZ2V0IGEgdHJhaWxpbmcgc2xhc2guXG4gIHZhciBsYXN0ID0gc3JjUGF0aC5zbGljZSgtMSlbMF07XG4gIHZhciBoYXNUcmFpbGluZ1NsYXNoID1cbiAgICAoKHJlc3VsdC5ob3N0IHx8IHJlbGF0aXZlLmhvc3QgfHwgc3JjUGF0aC5sZW5ndGggPiAxKSAmJlxuICAgICAgKGxhc3QgPT09ICcuJyB8fCBsYXN0ID09PSAnLi4nKSkgfHxcbiAgICBsYXN0ID09PSAnJztcblxuICAvLyBzdHJpcCBzaW5nbGUgZG90cywgcmVzb2x2ZSBkb3VibGUgZG90cyB0byBwYXJlbnQgZGlyXG4gIC8vIGlmIHRoZSBwYXRoIHRyaWVzIHRvIGdvIGFib3ZlIHRoZSByb290LCBgdXBgIGVuZHMgdXAgPiAwXG4gIHZhciB1cCA9IDA7XG4gIGZvciAodmFyIGkgPSBzcmNQYXRoLmxlbmd0aDsgaSA+PSAwOyBpLS0pIHtcbiAgICBsYXN0ID0gc3JjUGF0aFtpXTtcbiAgICBpZiAobGFzdCA9PT0gJy4nKSB7XG4gICAgICBzcGxpY2VPbmUoc3JjUGF0aCwgaSk7XG4gICAgfSBlbHNlIGlmIChsYXN0ID09PSAnLi4nKSB7XG4gICAgICBzcGxpY2VPbmUoc3JjUGF0aCwgaSk7XG4gICAgICB1cCsrO1xuICAgIH0gZWxzZSBpZiAodXApIHtcbiAgICAgIHNwbGljZU9uZShzcmNQYXRoLCBpKTtcbiAgICAgIHVwLS07XG4gICAgfVxuICB9XG5cbiAgLy8gaWYgdGhlIHBhdGggaXMgYWxsb3dlZCB0byBnbyBhYm92ZSB0aGUgcm9vdCwgcmVzdG9yZSBsZWFkaW5nIC4uc1xuICBpZiAoIW11c3RFbmRBYnMgJiYgIXJlbW92ZUFsbERvdHMpIHtcbiAgICBmb3IgKDsgdXAtLTsgdXApIHtcbiAgICAgIHNyY1BhdGgudW5zaGlmdCgnLi4nKTtcbiAgICB9XG4gIH1cblxuICBpZiAoXG4gICAgbXVzdEVuZEFicyAmJlxuICAgIHNyY1BhdGhbMF0gIT09ICcnICYmXG4gICAgKCFzcmNQYXRoWzBdIHx8IHNyY1BhdGhbMF0uY2hhckF0KDApICE9PSAnLycpXG4gICkge1xuICAgIHNyY1BhdGgudW5zaGlmdCgnJyk7XG4gIH1cblxuICBpZiAoaGFzVHJhaWxpbmdTbGFzaCAmJiBzcmNQYXRoLmpvaW4oJy8nKS5zdWJzdHIoLTEpICE9PSAnLycpIHtcbiAgICBzcmNQYXRoLnB1c2goJycpO1xuICB9XG5cbiAgdmFyIGlzQWJzb2x1dGUgPVxuICAgIHNyY1BhdGhbMF0gPT09ICcnIHx8IChzcmNQYXRoWzBdICYmIHNyY1BhdGhbMF0uY2hhckF0KDApID09PSAnLycpO1xuXG4gIC8vIHB1dCB0aGUgaG9zdCBiYWNrXG4gIGlmIChwc3ljaG90aWMpIHtcbiAgICBpZiAoaXNBYnNvbHV0ZSkge1xuICAgICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVzdWx0Lmhvc3QgPSAnJztcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVzdWx0Lmhvc3QgPSBzcmNQYXRoLmxlbmd0aCA/IHNyY1BhdGguc2hpZnQoKSA6ICcnO1xuICAgIH1cbiAgICAvL29jY2FzaW9uYWxseSB0aGUgYXV0aCBjYW4gZ2V0IHN0dWNrIG9ubHkgaW4gaG9zdFxuICAgIC8vdGhpcyBlc3BlY2lhbGx5IGhhcHBlbnMgaW4gY2FzZXMgbGlrZVxuICAgIC8vdXJsLnJlc29sdmVPYmplY3QoJ21haWx0bzpsb2NhbDFAZG9tYWluMScsICdsb2NhbDJAZG9tYWluMicpXG4gICAgY29uc3QgYXV0aEluSG9zdCA9XG4gICAgICByZXN1bHQuaG9zdCAmJiByZXN1bHQuaG9zdC5pbmRleE9mKCdAJykgPiAwXG4gICAgICAgID8gcmVzdWx0Lmhvc3Quc3BsaXQoJ0AnKVxuICAgICAgICA6IGZhbHNlO1xuICAgIGlmIChhdXRoSW5Ib3N0KSB7XG4gICAgICByZXN1bHQuYXV0aCA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgIHJlc3VsdC5ob3N0ID0gcmVzdWx0Lmhvc3RuYW1lID0gYXV0aEluSG9zdC5zaGlmdCgpO1xuICAgIH1cbiAgfVxuXG4gIG11c3RFbmRBYnMgPSBtdXN0RW5kQWJzIHx8IChyZXN1bHQuaG9zdCAmJiBzcmNQYXRoLmxlbmd0aCk7XG5cbiAgaWYgKG11c3RFbmRBYnMgJiYgIWlzQWJzb2x1dGUpIHtcbiAgICBzcmNQYXRoLnVuc2hpZnQoJycpO1xuICB9XG5cbiAgaWYgKCFzcmNQYXRoLmxlbmd0aCkge1xuICAgIHJlc3VsdC5wYXRobmFtZSA9IG51bGw7XG4gICAgcmVzdWx0LnBhdGggPSBudWxsO1xuICB9IGVsc2Uge1xuICAgIHJlc3VsdC5wYXRobmFtZSA9IHNyY1BhdGguam9pbignLycpO1xuICB9XG5cbiAgLy90byBzdXBwb3J0IHJlcXVlc3QuaHR0cFxuICBpZiAocmVzdWx0LnBhdGhuYW1lICE9PSBudWxsIHx8IHJlc3VsdC5zZWFyY2ggIT09IG51bGwpIHtcbiAgICByZXN1bHQucGF0aCA9XG4gICAgICAocmVzdWx0LnBhdGhuYW1lID8gcmVzdWx0LnBhdGhuYW1lIDogJycpICtcbiAgICAgIChyZXN1bHQuc2VhcmNoID8gcmVzdWx0LnNlYXJjaCA6ICcnKTtcbiAgfVxuICByZXN1bHQuYXV0aCA9IHJlbGF0aXZlLmF1dGggfHwgcmVzdWx0LmF1dGg7XG4gIHJlc3VsdC5zbGFzaGVzID0gcmVzdWx0LnNsYXNoZXMgfHwgcmVsYXRpdmUuc2xhc2hlcztcbiAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuVXJsLnByb3RvdHlwZS5wYXJzZUhvc3QgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBob3N0ID0gdGhpcy5ob3N0O1xuICB2YXIgcG9ydCA9IHBvcnRQYXR0ZXJuLmV4ZWMoaG9zdCk7XG4gIGlmIChwb3J0KSB7XG4gICAgcG9ydCA9IHBvcnRbMF07XG4gICAgaWYgKHBvcnQgIT09ICc6Jykge1xuICAgICAgdGhpcy5wb3J0ID0gcG9ydC5zbGljZSgxKTtcbiAgICB9XG4gICAgaG9zdCA9IGhvc3Quc2xpY2UoMCwgaG9zdC5sZW5ndGggLSBwb3J0Lmxlbmd0aCk7XG4gIH1cbiAgaWYgKGhvc3QpIHRoaXMuaG9zdG5hbWUgPSBob3N0O1xufTtcblxuLy8gQWJvdXQgMS41eCBmYXN0ZXIgdGhhbiB0aGUgdHdvLWFyZyB2ZXJzaW9uIG9mIEFycmF5I3NwbGljZSgpLlxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cbmZ1bmN0aW9uIHNwbGljZU9uZShsaXN0LCBpbmRleCkge1xuICBmb3IgKHZhciBpID0gaW5kZXgsIGsgPSBpICsgMSwgbiA9IGxpc3QubGVuZ3RoOyBrIDwgbjsgaSArPSAxLCBrICs9IDEpXG4gICAgbGlzdFtpXSA9IGxpc3Rba107XG4gIGxpc3QucG9wKCk7XG59XG5cbnZhciBoZXhUYWJsZSA9IG5ldyBBcnJheSgyNTYpO1xuZm9yICh2YXIgaSA9IDA7IGkgPCAyNTY7ICsraSlcbiAgaGV4VGFibGVbaV0gPSAnJScgKyAoKGkgPCAxNiA/ICcwJyA6ICcnKSArIGkudG9TdHJpbmcoMTYpKS50b1VwcGVyQ2FzZSgpO1xuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cbmZ1bmN0aW9uIGVuY29kZUF1dGgoc3RyKSB7XG4gIC8vIGZhc3RlciBlbmNvZGVVUklDb21wb25lbnQgYWx0ZXJuYXRpdmUgZm9yIGVuY29kaW5nIGF1dGggdXJpIGNvbXBvbmVudHNcbiAgdmFyIG91dCA9ICcnO1xuICB2YXIgbGFzdFBvcyA9IDA7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIGMgPSBzdHIuY2hhckNvZGVBdChpKTtcblxuICAgIC8vIFRoZXNlIGNoYXJhY3RlcnMgZG8gbm90IG5lZWQgZXNjYXBpbmc6XG4gICAgLy8gISAtIC4gXyB+XG4gICAgLy8gJyAoICkgKiA6XG4gICAgLy8gZGlnaXRzXG4gICAgLy8gYWxwaGEgKHVwcGVyY2FzZSlcbiAgICAvLyBhbHBoYSAobG93ZXJjYXNlKVxuICAgIGlmIChcbiAgICAgIGMgPT09IDB4MjEgfHxcbiAgICAgIGMgPT09IDB4MmQgfHxcbiAgICAgIGMgPT09IDB4MmUgfHxcbiAgICAgIGMgPT09IDB4NWYgfHxcbiAgICAgIGMgPT09IDB4N2UgfHxcbiAgICAgIChjID49IDB4MjcgJiYgYyA8PSAweDJhKSB8fFxuICAgICAgKGMgPj0gMHgzMCAmJiBjIDw9IDB4M2EpIHx8XG4gICAgICAoYyA+PSAweDQxICYmIGMgPD0gMHg1YSkgfHxcbiAgICAgIChjID49IDB4NjEgJiYgYyA8PSAweDdhKVxuICAgICkge1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgb3V0ICs9IHN0ci5zbGljZShsYXN0UG9zLCBpKTtcblxuICAgIGxhc3RQb3MgPSBpICsgMTtcblxuICAgIC8vIE90aGVyIEFTQ0lJIGNoYXJhY3RlcnNcbiAgICBpZiAoYyA8IDB4ODApIHtcbiAgICAgIG91dCArPSBoZXhUYWJsZVtjXTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIC8vIE11bHRpLWJ5dGUgY2hhcmFjdGVycyAuLi5cbiAgICBpZiAoYyA8IDB4ODAwKSB7XG4gICAgICBvdXQgKz0gaGV4VGFibGVbMHhjMCB8IChjID4+IDYpXSArIGhleFRhYmxlWzB4ODAgfCAoYyAmIDB4M2YpXTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBpZiAoYyA8IDB4ZDgwMCB8fCBjID49IDB4ZTAwMCkge1xuICAgICAgb3V0ICs9XG4gICAgICAgIGhleFRhYmxlWzB4ZTAgfCAoYyA+PiAxMildICtcbiAgICAgICAgaGV4VGFibGVbMHg4MCB8ICgoYyA+PiA2KSAmIDB4M2YpXSArXG4gICAgICAgIGhleFRhYmxlWzB4ODAgfCAoYyAmIDB4M2YpXTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICAvLyBTdXJyb2dhdGUgcGFpclxuICAgICsraTtcbiAgICB2YXIgYzI7XG4gICAgaWYgKGkgPCBzdHIubGVuZ3RoKSBjMiA9IHN0ci5jaGFyQ29kZUF0KGkpICYgMHgzZmY7XG4gICAgZWxzZSBjMiA9IDA7XG4gICAgYyA9IDB4MTAwMDAgKyAoKChjICYgMHgzZmYpIDw8IDEwKSB8IGMyKTtcbiAgICBvdXQgKz1cbiAgICAgIGhleFRhYmxlWzB4ZjAgfCAoYyA+PiAxOCldICtcbiAgICAgIGhleFRhYmxlWzB4ODAgfCAoKGMgPj4gMTIpICYgMHgzZildICtcbiAgICAgIGhleFRhYmxlWzB4ODAgfCAoKGMgPj4gNikgJiAweDNmKV0gK1xuICAgICAgaGV4VGFibGVbMHg4MCB8IChjICYgMHgzZildO1xuICB9XG4gIGlmIChsYXN0UG9zID09PSAwKSByZXR1cm4gc3RyO1xuICBpZiAobGFzdFBvcyA8IHN0ci5sZW5ndGgpIHJldHVybiBvdXQgKyBzdHIuc2xpY2UobGFzdFBvcyk7XG4gIHJldHVybiBvdXQ7XG59XG4iXX0=