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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy92ZW5kb3IvbW9uZ29kYlVybC5qcyJdLCJuYW1lcyI6WyJwdW55Y29kZSIsInJlcXVpcmUiLCJleHBvcnRzIiwicGFyc2UiLCJ1cmxQYXJzZSIsInJlc29sdmUiLCJ1cmxSZXNvbHZlIiwicmVzb2x2ZU9iamVjdCIsInVybFJlc29sdmVPYmplY3QiLCJmb3JtYXQiLCJ1cmxGb3JtYXQiLCJVcmwiLCJwcm90b2NvbCIsInNsYXNoZXMiLCJhdXRoIiwiaG9zdCIsInBvcnQiLCJob3N0bmFtZSIsImhhc2giLCJzZWFyY2giLCJxdWVyeSIsInBhdGhuYW1lIiwicGF0aCIsImhyZWYiLCJwcm90b2NvbFBhdHRlcm4iLCJwb3J0UGF0dGVybiIsInNpbXBsZVBhdGhQYXR0ZXJuIiwidW5zYWZlUHJvdG9jb2wiLCJqYXZhc2NyaXB0IiwiaG9zdGxlc3NQcm90b2NvbCIsInNsYXNoZWRQcm90b2NvbCIsImh0dHAiLCJodHRwcyIsImZ0cCIsImdvcGhlciIsImZpbGUiLCJxdWVyeXN0cmluZyIsInVybCIsInBhcnNlUXVlcnlTdHJpbmciLCJzbGFzaGVzRGVub3RlSG9zdCIsInUiLCJwcm90b3R5cGUiLCJUeXBlRXJyb3IiLCJoYXNIYXNoIiwic3RhcnQiLCJlbmQiLCJyZXN0IiwibGFzdFBvcyIsImkiLCJpbldzIiwic3BsaXQiLCJsZW5ndGgiLCJjb2RlIiwiY2hhckNvZGVBdCIsImlzV3MiLCJzbGljZSIsInNpbXBsZVBhdGgiLCJleGVjIiwicHJvdG8iLCJsb3dlclByb3RvIiwidG9Mb3dlckNhc2UiLCJ0ZXN0IiwiaG9zdEVuZCIsImF0U2lnbiIsIm5vbkhvc3QiLCJkZWNvZGVVUklDb21wb25lbnQiLCJwYXJzZUhvc3QiLCJpcHY2SG9zdG5hbWUiLCJyZXN1bHQiLCJ2YWxpZGF0ZUhvc3RuYW1lIiwidW5kZWZpbmVkIiwidG9BU0NJSSIsInAiLCJoIiwiYXV0b0VzY2FwZVN0ciIsInF1ZXN0aW9uSWR4IiwiaGFzaElkeCIsImZpcnN0SWR4IiwicyIsInNlbGYiLCJuZXdSZXN0Iiwib2JqIiwiY2FsbCIsImVuY29kZUF1dGgiLCJpbmRleE9mIiwic3RyaW5naWZ5IiwibmV3UGF0aG5hbWUiLCJyZXBsYWNlIiwic291cmNlIiwicmVsYXRpdmUiLCJyZWwiLCJ0a2V5cyIsIk9iamVjdCIsImtleXMiLCJ0ayIsInRrZXkiLCJya2V5cyIsInJrIiwicmtleSIsInYiLCJrIiwicmVsUGF0aCIsInNoaWZ0IiwidW5zaGlmdCIsImpvaW4iLCJpc1NvdXJjZUFicyIsImNoYXJBdCIsImlzUmVsQWJzIiwibXVzdEVuZEFicyIsInJlbW92ZUFsbERvdHMiLCJzcmNQYXRoIiwicHN5Y2hvdGljIiwicG9wIiwiY29uY2F0IiwiYXV0aEluSG9zdCIsImxhc3QiLCJoYXNUcmFpbGluZ1NsYXNoIiwidXAiLCJzcGxpY2VPbmUiLCJzdWJzdHIiLCJwdXNoIiwiaXNBYnNvbHV0ZSIsImxpc3QiLCJpbmRleCIsIm4iLCJoZXhUYWJsZSIsIkFycmF5IiwidG9TdHJpbmciLCJ0b1VwcGVyQ2FzZSIsInN0ciIsIm91dCIsImMiLCJjMiJdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBOztBQUVBLE1BQU1BLFFBQVEsR0FBR0MsT0FBTyxDQUFDLFVBQUQsQ0FBeEI7O0FBRUFDLE9BQU8sQ0FBQ0MsS0FBUixHQUFnQkMsUUFBaEI7QUFDQUYsT0FBTyxDQUFDRyxPQUFSLEdBQWtCQyxVQUFsQjtBQUNBSixPQUFPLENBQUNLLGFBQVIsR0FBd0JDLGdCQUF4QjtBQUNBTixPQUFPLENBQUNPLE1BQVIsR0FBaUJDLFNBQWpCO0FBRUFSLE9BQU8sQ0FBQ1MsR0FBUixHQUFjQSxHQUFkOztBQUVBLFNBQVNBLEdBQVQsR0FBZTtBQUNiLE9BQUtDLFFBQUwsR0FBZ0IsSUFBaEI7QUFDQSxPQUFLQyxPQUFMLEdBQWUsSUFBZjtBQUNBLE9BQUtDLElBQUwsR0FBWSxJQUFaO0FBQ0EsT0FBS0MsSUFBTCxHQUFZLElBQVo7QUFDQSxPQUFLQyxJQUFMLEdBQVksSUFB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QUFZLENBQUNBLENBQUMsR0FBRyxLQUFMLEtBQWUsRUFBaEIsR0FBc0JDLEVBQWpDLENBQUo7QUFDQUYsSUFBQUEsR0FBRyxJQUNETCxRQUFRLENBQUMsT0FBUU0sQ0FBQyxJQUFJLEVBQWQsQ0FBUixHQUNBTixRQUFRLENBQUMsT0FBU00sQ0FBQyxJQUFJLEVBQU4sR0FBWSxJQUFyQixDQURSLEdBRUFOLFFBQVEsQ0FBQyxPQUFTTSxDQUFDLElBQUksQ0FBTixHQUFXLElBQXBCLENBRlIsR0FHQU4sUUFBUSxDQUFDLE9BQVFNLENBQUMsR0FBRyxJQUFiLENBSlY7QUFLRDs7QUFDRCxNQUFJcEYsT0FBTyxLQUFLLENBQWhCLEVBQW1CLE9BQU9rRixHQUFQO0FBQ25CLE1BQUlsRixPQUFPLEdBQUdrRixHQUFHLENBQUM5RSxNQUFsQixFQUEwQixPQUFPK0UsR0FBRyxHQUFHRCxHQUFHLENBQUMxRSxLQUFKLENBQVVSLE9BQVYsQ0FBYjtBQUMxQixTQUFPbUYsR0FBUDtBQUNEIiwic291cmNlc0NvbnRlbnQiOlsiLy8gQSBzbGlnaHRseSBwYXRjaGVkIHZlcnNpb24gb2Ygbm9kZSdzIHVybCBtb2R1bGUsIHdpdGggc3VwcG9ydCBmb3IgbW9uZ29kYjovL1xuLy8gdXJpcy5cbi8vXG4vLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL25vZGVqcy9ub2RlL2Jsb2IvbWFzdGVyL0xJQ0VOU0UgZm9yIGxpY2Vuc2luZ1xuLy8gaW5mb3JtYXRpb25cblxuJ3VzZSBzdHJpY3QnO1xuXG5jb25zdCBwdW55Y29kZSA9IHJlcXVpcmUoJ3B1bnljb2RlJyk7XG5cbmV4cG9ydHMucGFyc2UgPSB1cmxQYXJzZTtcbmV4cG9ydHMucmVzb2x2ZSA9IHVybFJlc29sdmU7XG5leHBvcnRzLnJlc29sdmVPYmplY3QgPSB1cmxSZXNvbHZlT2JqZWN0O1xuZXhwb3J0cy5mb3JtYXQgPSB1cmxGb3JtYXQ7XG5cbmV4cG9ydHMuVXJsID0gVXJsO1xuXG5mdW5jdGlvbiBVcmwoKSB7XG4gIHRoaXMucHJvdG9jb2wgPSBudWxsO1xuICB0aGlzLnNsYXNoZXMgPSBudWxsO1xuICB0aGlzLmF1dGggPSBudWxsO1xuICB0aGlzLmhvc3QgPSBudWxsO1xuICB0aGlzLnBvcnQgPSBudWxsO1xuICB0aGlzLmhvc3RuYW1lID0gbnVsbDtcbiAgdGhpcy5oYXNoID0gbnVsbDtcbiAgdGhpcy5zZWFyY2ggPSBudWxsO1xuICB0aGlzLnF1ZXJ5ID0gbnVsbDtcbiAgdGhpcy5wYXRobmFtZSA9IG51bGw7XG4gIHRoaXMucGF0aCA9IG51bGw7XG4gIHRoaXMuaHJlZiA9IG51bGw7XG59XG5cbi8vIFJlZmVyZW5jZTogUkZDIDM5ODYsIFJGQyAxODA4LCBSRkMgMjM5NlxuXG4vLyBkZWZpbmUgdGhlc2UgaGVyZSBzbyBhdCBsZWFzdCB0aGV5IG9ubHkgaGF2ZSB0byBiZVxuLy8gY29tcGlsZWQgb25jZSBvbiB0aGUgZmlyc3QgbW9kdWxlIGxvYWQuXG5jb25zdCBwcm90b2NvbFBhdHRlcm4gPSAvXihbYS16MC05ListXSs6KS9pO1xuY29uc3QgcG9ydFBhdHRlcm4gPSAvOlswLTldKiQvO1xuXG4vLyBTcGVjaWFsIGNhc2UgZm9yIGEgc2ltcGxlIHBhdGggVVJMXG5jb25zdCBzaW1wbGVQYXRoUGF0dGVybiA9IC9eKFxcL1xcLz8oPyFcXC8pW15cXD9cXHNdKikoXFw/W15cXHNdKik/JC87XG5cbi8vIHByb3RvY29scyB0aGF0IGNhbiBhbGxvdyBcInVuc2FmZVwiIGFuZCBcInVud2lzZVwiIGNoYXJzLlxuY29uc3QgdW5zYWZlUHJvdG9jb2wgPSB7XG4gIGphdmFzY3JpcHQ6IHRydWUsXG4gICdqYXZhc2NyaXB0Oic6IHRydWUsXG59O1xuLy8gcHJvdG9jb2xzIHRoYXQgbmV2ZXIgaGF2ZSBhIGhvc3RuYW1lLlxuY29uc3QgaG9zdGxlc3NQcm90b2NvbCA9IHtcbiAgamF2YXNjcmlwdDogdHJ1ZSxcbiAgJ2phdmFzY3JpcHQ6JzogdHJ1ZSxcbn07XG4vLyBwcm90b2NvbHMgdGhhdCBhbHdheXMgY29udGFpbiBhIC8vIGJpdC5cbmNvbnN0IHNsYXNoZWRQcm90b2NvbCA9IHtcbiAgaHR0cDogdHJ1ZSxcbiAgJ2h0dHA6JzogdHJ1ZSxcbiAgaHR0cHM6IHRydWUsXG4gICdodHRwczonOiB0cnVlLFxuICBmdHA6IHRydWUsXG4gICdmdHA6JzogdHJ1ZSxcbiAgZ29waGVyOiB0cnVlLFxuICAnZ29waGVyOic6IHRydWUsXG4gIGZpbGU6IHRydWUsXG4gICdmaWxlOic6IHRydWUsXG59O1xuY29uc3QgcXVlcnlzdHJpbmcgPSByZXF1aXJlKCdxdWVyeXN0cmluZycpO1xuXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuZnVuY3Rpb24gdXJsUGFyc2UodXJsLCBwYXJzZVF1ZXJ5U3RyaW5nLCBzbGFzaGVzRGVub3RlSG9zdCkge1xuICBpZiAodXJsIGluc3RhbmNlb2YgVXJsKSByZXR1cm4gdXJsO1xuXG4gIHZhciB1ID0gbmV3IFVybCgpO1xuICB1LnBhcnNlKHVybCwgcGFyc2VRdWVyeVN0cmluZywgc2xhc2hlc0Rlbm90ZUhvc3QpO1xuICByZXR1cm4gdTtcbn1cblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cblVybC5wcm90b3R5cGUucGFyc2UgPSBmdW5jdGlvbiAodXJsLCBwYXJzZVF1ZXJ5U3RyaW5nLCBzbGFzaGVzRGVub3RlSG9zdCkge1xuICBpZiAodHlwZW9mIHVybCAhPT0gJ3N0cmluZycpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdQYXJhbWV0ZXIgXCJ1cmxcIiBtdXN0IGJlIGEgc3RyaW5nLCBub3QgJyArIHR5cGVvZiB1cmwpO1xuICB9XG5cbiAgLy8gQ29weSBjaHJvbWUsIElFLCBvcGVyYSBiYWNrc2xhc2gtaGFuZGxpbmcgYmVoYXZpb3IuXG4gIC8vIEJhY2sgc2xhc2hlcyBiZWZvcmUgdGhlIHF1ZXJ5IHN0cmluZyBnZXQgY29udmVydGVkIHRvIGZvcndhcmQgc2xhc2hlc1xuICAvLyBTZWU6IGh0dHBzOi8vY29kZS5nb29nbGUuY29tL3AvY2hyb21pdW0vaXNzdWVzL2RldGFpbD9pZD0yNTkxNlxuICB2YXIgaGFzSGFzaCA9IGZhbHNlO1xuICB2YXIgc3RhcnQgPSAtMTtcbiAgdmFyIGVuZCA9IC0xO1xuICB2YXIgcmVzdCA9ICcnO1xuICB2YXIgbGFzdFBvcyA9IDA7XG4gIHZhciBpID0gMDtcbiAgZm9yICh2YXIgaW5XcyA9IGZhbHNlLCBzcGxpdCA9IGZhbHNlOyBpIDwgdXJsLmxlbmd0aDsgKytpKSB7XG4gICAgY29uc3QgY29kZSA9IHVybC5jaGFyQ29kZUF0KGkpO1xuXG4gICAgLy8gRmluZCBmaXJzdCBhbmQgbGFzdCBub24td2hpdGVzcGFjZSBjaGFyYWN0ZXJzIGZvciB0cmltbWluZ1xuICAgIGNvbnN0IGlzV3MgPVxuICAgICAgY29kZSA9PT0gMzIgLyogKi8gfHxcbiAgICAgIGNvZGUgPT09IDkgLypcXHQqLyB8fFxuICAgICAgY29kZSA9PT0gMTMgLypcXHIqLyB8fFxuICAgICAgY29kZSA9PT0gMTAgLypcXG4qLyB8fFxuICAgICAgY29kZSA9PT0gMTIgLypcXGYqLyB8fFxuICAgICAgY29kZSA9PT0gMTYwIC8qXFx1MDBBMCovIHx8XG4gICAgICBjb2RlID09PSA2NTI3OTsgLypcXHVGRUZGKi9cbiAgICBpZiAoc3RhcnQgPT09IC0xKSB7XG4gICAgICBpZiAoaXNXcykgY29udGludWU7XG4gICAgICBsYXN0UG9zID0gc3RhcnQgPSBpO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoaW5Xcykge1xuICAgICAgICBpZiAoIWlzV3MpIHtcbiAgICAgICAgICBlbmQgPSAtMTtcbiAgICAgICAgICBpbldzID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoaXNXcykge1xuICAgICAgICBlbmQgPSBpO1xuICAgICAgICBpbldzID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBPbmx5IGNvbnZlcnQgYmFja3NsYXNoZXMgd2hpbGUgd2UgaGF2ZW4ndCBzZWVuIGEgc3BsaXQgY2hhcmFjdGVyXG4gICAgaWYgKCFzcGxpdCkge1xuICAgICAgc3dpdGNoIChjb2RlKSB7XG4gICAgICAgIGNhc2UgMzU6IC8vICcjJ1xuICAgICAgICAgIGhhc0hhc2ggPSB0cnVlO1xuICAgICAgICAvLyBGYWxsIHRocm91Z2hcbiAgICAgICAgY2FzZSA2MzogLy8gJz8nXG4gICAgICAgICAgc3BsaXQgPSB0cnVlO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIDkyOiAvLyAnXFxcXCdcbiAgICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSByZXN0ICs9IHVybC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgICByZXN0ICs9ICcvJztcbiAgICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICghaGFzSGFzaCAmJiBjb2RlID09PSAzNSAvKiMqLykge1xuICAgICAgaGFzSGFzaCA9IHRydWU7XG4gICAgfVxuICB9XG5cbiAgLy8gQ2hlY2sgaWYgc3RyaW5nIHdhcyBub24tZW1wdHkgKGluY2x1ZGluZyBzdHJpbmdzIHdpdGggb25seSB3aGl0ZXNwYWNlKVxuICBpZiAoc3RhcnQgIT09IC0xKSB7XG4gICAgaWYgKGxhc3RQb3MgPT09IHN0YXJ0KSB7XG4gICAgICAvLyBXZSBkaWRuJ3QgY29udmVydCBhbnkgYmFja3NsYXNoZXNcblxuICAgICAgaWYgKGVuZCA9PT0gLTEpIHtcbiAgICAgICAgaWYgKHN0YXJ0ID09PSAwKSByZXN0ID0gdXJsO1xuICAgICAgICBlbHNlIHJlc3QgPSB1cmwuc2xpY2Uoc3RhcnQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdCA9IHVybC5zbGljZShzdGFydCwgZW5kKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGVuZCA9PT0gLTEgJiYgbGFzdFBvcyA8IHVybC5sZW5ndGgpIHtcbiAgICAgIC8vIFdlIGNvbnZlcnRlZCBzb21lIGJhY2tzbGFzaGVzIGFuZCBoYXZlIG9ubHkgcGFydCBvZiB0aGUgZW50aXJlIHN0cmluZ1xuICAgICAgcmVzdCArPSB1cmwuc2xpY2UobGFzdFBvcyk7XG4gICAgfSBlbHNlIGlmIChlbmQgIT09IC0xICYmIGxhc3RQb3MgPCBlbmQpIHtcbiAgICAgIC8vIFdlIGNvbnZlcnRlZCBzb21lIGJhY2tzbGFzaGVzIGFuZCBoYXZlIG9ubHkgcGFydCBvZiB0aGUgZW50aXJlIHN0cmluZ1xuICAgICAgcmVzdCArPSB1cmwuc2xpY2UobGFzdFBvcywgZW5kKTtcbiAgICB9XG4gIH1cblxuICBpZiAoIXNsYXNoZXNEZW5vdGVIb3N0ICYmICFoYXNIYXNoKSB7XG4gICAgLy8gVHJ5IGZhc3QgcGF0aCByZWdleHBcbiAgICBjb25zdCBzaW1wbGVQYXRoID0gc2ltcGxlUGF0aFBhdHRlcm4uZXhlYyhyZXN0KTtcbiAgICBpZiAoc2ltcGxlUGF0aCkge1xuICAgICAgdGhpcy5wYXRoID0gcmVzdDtcbiAgICAgIHRoaXMuaHJlZiA9IHJlc3Q7XG4gICAgICB0aGlzLnBhdGhuYW1lID0gc2ltcGxlUGF0aFsxXTtcbiAgICAgIGlmIChzaW1wbGVQYXRoWzJdKSB7XG4gICAgICAgIHRoaXMuc2VhcmNoID0gc2ltcGxlUGF0aFsyXTtcbiAgICAgICAgaWYgKHBhcnNlUXVlcnlTdHJpbmcpIHtcbiAgICAgICAgICB0aGlzLnF1ZXJ5ID0gcXVlcnlzdHJpbmcucGFyc2UodGhpcy5zZWFyY2guc2xpY2UoMSkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMucXVlcnkgPSB0aGlzLnNlYXJjaC5zbGljZSgxKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChwYXJzZVF1ZXJ5U3RyaW5nKSB7XG4gICAgICAgIHRoaXMuc2VhcmNoID0gJyc7XG4gICAgICAgIHRoaXMucXVlcnkgPSB7fTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgfVxuXG4gIHZhciBwcm90byA9IHByb3RvY29sUGF0dGVybi5leGVjKHJlc3QpO1xuICBpZiAocHJvdG8pIHtcbiAgICBwcm90byA9IHByb3RvWzBdO1xuICAgIHZhciBsb3dlclByb3RvID0gcHJvdG8udG9Mb3dlckNhc2UoKTtcbiAgICB0aGlzLnByb3RvY29sID0gbG93ZXJQcm90bztcbiAgICByZXN0ID0gcmVzdC5zbGljZShwcm90by5sZW5ndGgpO1xuICB9XG5cbiAgLy8gZmlndXJlIG91dCBpZiBpdCdzIGdvdCBhIGhvc3RcbiAgLy8gdXNlckBzZXJ2ZXIgaXMgKmFsd2F5cyogaW50ZXJwcmV0ZWQgYXMgYSBob3N0bmFtZSwgYW5kIHVybFxuICAvLyByZXNvbHV0aW9uIHdpbGwgdHJlYXQgLy9mb28vYmFyIGFzIGhvc3Q9Zm9vLHBhdGg9YmFyIGJlY2F1c2UgdGhhdCdzXG4gIC8vIGhvdyB0aGUgYnJvd3NlciByZXNvbHZlcyByZWxhdGl2ZSBVUkxzLlxuICBpZiAoc2xhc2hlc0Rlbm90ZUhvc3QgfHwgcHJvdG8gfHwgL15cXC9cXC9bXkBcXC9dK0BbXkBcXC9dKy8udGVzdChyZXN0KSkge1xuICAgIHZhciBzbGFzaGVzID0gcmVzdC5jaGFyQ29kZUF0KDApID09PSA0NyAvKi8qLyAmJiByZXN0LmNoYXJDb2RlQXQoMSkgPT09IDQ3OyAvKi8qL1xuICAgIGlmIChzbGFzaGVzICYmICEocHJvdG8gJiYgaG9zdGxlc3NQcm90b2NvbFtwcm90b10pKSB7XG4gICAgICByZXN0ID0gcmVzdC5zbGljZSgyKTtcbiAgICAgIHRoaXMuc2xhc2hlcyA9IHRydWU7XG4gICAgfVxuICB9XG5cbiAgaWYgKCFob3N0bGVzc1Byb3RvY29sW3Byb3RvXSAmJiAoc2xhc2hlcyB8fCAocHJvdG8gJiYgIXNsYXNoZWRQcm90b2NvbFtwcm90b10pKSkge1xuICAgIC8vIHRoZXJlJ3MgYSBob3N0bmFtZS5cbiAgICAvLyB0aGUgZmlyc3QgaW5zdGFuY2Ugb2YgLywgPywgOywgb3IgIyBlbmRzIHRoZSBob3N0LlxuICAgIC8vXG4gICAgLy8gSWYgdGhlcmUgaXMgYW4gQCBpbiB0aGUgaG9zdG5hbWUsIHRoZW4gbm9uLWhvc3QgY2hhcnMgKmFyZSogYWxsb3dlZFxuICAgIC8vIHRvIHRoZSBsZWZ0IG9mIHRoZSBsYXN0IEAgc2lnbiwgdW5sZXNzIHNvbWUgaG9zdC1lbmRpbmcgY2hhcmFjdGVyXG4gICAgLy8gY29tZXMgKmJlZm9yZSogdGhlIEAtc2lnbi5cbiAgICAvLyBVUkxzIGFyZSBvYm5veGlvdXMuXG4gICAgLy9cbiAgICAvLyBleDpcbiAgICAvLyBodHRwOi8vYUBiQGMvID0+IHVzZXI6YUBiIGhvc3Q6Y1xuICAgIC8vIGh0dHA6Ly9hQGI/QGMgPT4gdXNlcjphIGhvc3Q6YiBwYXRoOi8/QGNcblxuICAgIC8vIHYwLjEyIFRPRE8oaXNhYWNzKTogVGhpcyBpcyBub3QgcXVpdGUgaG93IENocm9tZSBkb2VzIHRoaW5ncy5cbiAgICAvLyBSZXZpZXcgb3VyIHRlc3QgY2FzZSBhZ2FpbnN0IGJyb3dzZXJzIG1vcmUgY29tcHJlaGVuc2l2ZWx5LlxuXG4gICAgdmFyIGhvc3RFbmQgPSAtMTtcbiAgICB2YXIgYXRTaWduID0gLTE7XG4gICAgdmFyIG5vbkhvc3QgPSAtMTtcbiAgICBmb3IgKGkgPSAwOyBpIDwgcmVzdC5sZW5ndGg7ICsraSkge1xuICAgICAgc3dpdGNoIChyZXN0LmNoYXJDb2RlQXQoaSkpIHtcbiAgICAgICAgY2FzZSA5OiAvLyAnXFx0J1xuICAgICAgICBjYXNlIDEwOiAvLyAnXFxuJ1xuICAgICAgICBjYXNlIDEzOiAvLyAnXFxyJ1xuICAgICAgICBjYXNlIDMyOiAvLyAnICdcbiAgICAgICAgY2FzZSAzNDogLy8gJ1wiJ1xuICAgICAgICBjYXNlIDM3OiAvLyAnJSdcbiAgICAgICAgY2FzZSAzOTogLy8gJ1xcJydcbiAgICAgICAgY2FzZSA1OTogLy8gJzsnXG4gICAgICAgIGNhc2UgNjA6IC8vICc8J1xuICAgICAgICBjYXNlIDYyOiAvLyAnPidcbiAgICAgICAgY2FzZSA5MjogLy8gJ1xcXFwnXG4gICAgICAgIGNhc2UgOTQ6IC8vICdeJ1xuICAgICAgICBjYXNlIDk2OiAvLyAnYCdcbiAgICAgICAgY2FzZSAxMjM6IC8vICd7J1xuICAgICAgICBjYXNlIDEyNDogLy8gJ3wnXG4gICAgICAgIGNhc2UgMTI1OiAvLyAnfSdcbiAgICAgICAgICAvLyBDaGFyYWN0ZXJzIHRoYXQgYXJlIG5ldmVyIGV2ZXIgYWxsb3dlZCBpbiBhIGhvc3RuYW1lIGZyb20gUkZDIDIzOTZcbiAgICAgICAgICBpZiAobm9uSG9zdCA9PT0gLTEpIG5vbkhvc3QgPSBpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIDM1OiAvLyAnIydcbiAgICAgICAgY2FzZSA0NzogLy8gJy8nXG4gICAgICAgIGNhc2UgNjM6IC8vICc/J1xuICAgICAgICAgIC8vIEZpbmQgdGhlIGZpcnN0IGluc3RhbmNlIG9mIGFueSBob3N0LWVuZGluZyBjaGFyYWN0ZXJzXG4gICAgICAgICAgaWYgKG5vbkhvc3QgPT09IC0xKSBub25Ib3N0ID0gaTtcbiAgICAgICAgICBob3N0RW5kID0gaTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSA2NDogLy8gJ0AnXG4gICAgICAgICAgLy8gQXQgdGhpcyBwb2ludCwgZWl0aGVyIHdlIGhhdmUgYW4gZXhwbGljaXQgcG9pbnQgd2hlcmUgdGhlXG4gICAgICAgICAgLy8gYXV0aCBwb3J0aW9uIGNhbm5vdCBnbyBwYXN0LCBvciB0aGUgbGFzdCBAIGNoYXIgaXMgdGhlIGRlY2lkZXIuXG4gICAgICAgICAgYXRTaWduID0gaTtcbiAgICAgICAgICBub25Ib3N0ID0gLTE7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBpZiAoaG9zdEVuZCAhPT0gLTEpIGJyZWFrO1xuICAgIH1cbiAgICBzdGFydCA9IDA7XG4gICAgaWYgKGF0U2lnbiAhPT0gLTEpIHtcbiAgICAgIHRoaXMuYXV0aCA9IGRlY29kZVVSSUNvbXBvbmVudChyZXN0LnNsaWNlKDAsIGF0U2lnbikpO1xuICAgICAgc3RhcnQgPSBhdFNpZ24gKyAxO1xuICAgIH1cbiAgICBpZiAobm9uSG9zdCA9PT0gLTEpIHtcbiAgICAgIHRoaXMuaG9zdCA9IHJlc3Quc2xpY2Uoc3RhcnQpO1xuICAgICAgcmVzdCA9ICcnO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmhvc3QgPSByZXN0LnNsaWNlKHN0YXJ0LCBub25Ib3N0KTtcbiAgICAgIHJlc3QgPSByZXN0LnNsaWNlKG5vbkhvc3QpO1xuICAgIH1cblxuICAgIC8vIHB1bGwgb3V0IHBvcnQuXG4gICAgdGhpcy5wYXJzZUhvc3QoKTtcblxuICAgIC8vIHdlJ3ZlIGluZGljYXRlZCB0aGF0IHRoZXJlIGlzIGEgaG9zdG5hbWUsXG4gICAgLy8gc28gZXZlbiBpZiBpdCdzIGVtcHR5LCBpdCBoYXMgdG8gYmUgcHJlc2VudC5cbiAgICBpZiAodHlwZW9mIHRoaXMuaG9zdG5hbWUgIT09ICdzdHJpbmcnKSB0aGlzLmhvc3RuYW1lID0gJyc7XG5cbiAgICB2YXIgaG9zdG5hbWUgPSB0aGlzLmhvc3RuYW1lO1xuXG4gICAgLy8gaWYgaG9zdG5hbWUgYmVnaW5zIHdpdGggWyBhbmQgZW5kcyB3aXRoIF1cbiAgICAvLyBhc3N1bWUgdGhhdCBpdCdzIGFuIElQdjYgYWRkcmVzcy5cbiAgICB2YXIgaXB2Nkhvc3RuYW1lID1cbiAgICAgIGhvc3RuYW1lLmNoYXJDb2RlQXQoMCkgPT09IDkxIC8qWyovICYmIGhvc3RuYW1lLmNoYXJDb2RlQXQoaG9zdG5hbWUubGVuZ3RoIC0gMSkgPT09IDkzOyAvKl0qL1xuXG4gICAgLy8gdmFsaWRhdGUgYSBsaXR0bGUuXG4gICAgaWYgKCFpcHY2SG9zdG5hbWUpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IHZhbGlkYXRlSG9zdG5hbWUodGhpcywgcmVzdCwgaG9zdG5hbWUpO1xuICAgICAgaWYgKHJlc3VsdCAhPT0gdW5kZWZpbmVkKSByZXN0ID0gcmVzdWx0O1xuICAgIH1cblxuICAgIC8vIGhvc3RuYW1lcyBhcmUgYWx3YXlzIGxvd2VyIGNhc2UuXG4gICAgdGhpcy5ob3N0bmFtZSA9IHRoaXMuaG9zdG5hbWUudG9Mb3dlckNhc2UoKTtcblxuICAgIGlmICghaXB2Nkhvc3RuYW1lKSB7XG4gICAgICAvLyBJRE5BIFN1cHBvcnQ6IFJldHVybnMgYSBwdW55Y29kZWQgcmVwcmVzZW50YXRpb24gb2YgXCJkb21haW5cIi5cbiAgICAgIC8vIEl0IG9ubHkgY29udmVydHMgcGFydHMgb2YgdGhlIGRvbWFpbiBuYW1lIHRoYXRcbiAgICAgIC8vIGhhdmUgbm9uLUFTQ0lJIGNoYXJhY3RlcnMsIGkuZS4gaXQgZG9lc24ndCBtYXR0ZXIgaWZcbiAgICAgIC8vIHlvdSBjYWxsIGl0IHdpdGggYSBkb21haW4gdGhhdCBhbHJlYWR5IGlzIEFTQ0lJLW9ubHkuXG4gICAgICB0aGlzLmhvc3RuYW1lID0gcHVueWNvZGUudG9BU0NJSSh0aGlzLmhvc3RuYW1lKTtcbiAgICB9XG5cbiAgICB2YXIgcCA9IHRoaXMucG9ydCA/ICc6JyArIHRoaXMucG9ydCA6ICcnO1xuICAgIHZhciBoID0gdGhpcy5ob3N0bmFtZSB8fCAnJztcbiAgICB0aGlzLmhvc3QgPSBoICsgcDtcblxuICAgIC8vIHN0cmlwIFsgYW5kIF0gZnJvbSB0aGUgaG9zdG5hbWVcbiAgICAvLyB0aGUgaG9zdCBmaWVsZCBzdGlsbCByZXRhaW5zIHRoZW0sIHRob3VnaFxuICAgIGlmIChpcHY2SG9zdG5hbWUpIHtcbiAgICAgIHRoaXMuaG9zdG5hbWUgPSB0aGlzLmhvc3RuYW1lLnNsaWNlKDEsIC0xKTtcbiAgICAgIGlmIChyZXN0WzBdICE9PSAnLycpIHtcbiAgICAgICAgcmVzdCA9ICcvJyArIHJlc3Q7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gbm93IHJlc3QgaXMgc2V0IHRvIHRoZSBwb3N0LWhvc3Qgc3R1ZmYuXG4gIC8vIGNob3Agb2ZmIGFueSBkZWxpbSBjaGFycy5cbiAgaWYgKCF1bnNhZmVQcm90b2NvbFtsb3dlclByb3RvXSkge1xuICAgIC8vIEZpcnN0LCBtYWtlIDEwMCUgc3VyZSB0aGF0IGFueSBcImF1dG9Fc2NhcGVcIiBjaGFycyBnZXRcbiAgICAvLyBlc2NhcGVkLCBldmVuIGlmIGVuY29kZVVSSUNvbXBvbmVudCBkb2Vzbid0IHRoaW5rIHRoZXlcbiAgICAvLyBuZWVkIHRvIGJlLlxuICAgIGNvbnN0IHJlc3VsdCA9IGF1dG9Fc2NhcGVTdHIocmVzdCk7XG4gICAgaWYgKHJlc3VsdCAhPT0gdW5kZWZpbmVkKSByZXN0ID0gcmVzdWx0O1xuICB9XG5cbiAgdmFyIHF1ZXN0aW9uSWR4ID0gLTE7XG4gIHZhciBoYXNoSWR4ID0gLTE7XG4gIGZvciAoaSA9IDA7IGkgPCByZXN0Lmxlbmd0aDsgKytpKSB7XG4gICAgY29uc3QgY29kZSA9IHJlc3QuY2hhckNvZGVBdChpKTtcbiAgICBpZiAoY29kZSA9PT0gMzUgLyojKi8pIHtcbiAgICAgIHRoaXMuaGFzaCA9IHJlc3Quc2xpY2UoaSk7XG4gICAgICBoYXNoSWR4ID0gaTtcbiAgICAgIGJyZWFrO1xuICAgIH0gZWxzZSBpZiAoY29kZSA9PT0gNjMgLyo/Ki8gJiYgcXVlc3Rpb25JZHggPT09IC0xKSB7XG4gICAgICBxdWVzdGlvbklkeCA9IGk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHF1ZXN0aW9uSWR4ICE9PSAtMSkge1xuICAgIGlmIChoYXNoSWR4ID09PSAtMSkge1xuICAgICAgdGhpcy5zZWFyY2ggPSByZXN0LnNsaWNlKHF1ZXN0aW9uSWR4KTtcbiAgICAgIHRoaXMucXVlcnkgPSByZXN0LnNsaWNlKHF1ZXN0aW9uSWR4ICsgMSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuc2VhcmNoID0gcmVzdC5zbGljZShxdWVzdGlvbklkeCwgaGFzaElkeCk7XG4gICAgICB0aGlzLnF1ZXJ5ID0gcmVzdC5zbGljZShxdWVzdGlvbklkeCArIDEsIGhhc2hJZHgpO1xuICAgIH1cbiAgICBpZiAocGFyc2VRdWVyeVN0cmluZykge1xuICAgICAgdGhpcy5xdWVyeSA9IHF1ZXJ5c3RyaW5nLnBhcnNlKHRoaXMucXVlcnkpO1xuICAgIH1cbiAgfSBlbHNlIGlmIChwYXJzZVF1ZXJ5U3RyaW5nKSB7XG4gICAgLy8gbm8gcXVlcnkgc3RyaW5nLCBidXQgcGFyc2VRdWVyeVN0cmluZyBzdGlsbCByZXF1ZXN0ZWRcbiAgICB0aGlzLnNlYXJjaCA9ICcnO1xuICAgIHRoaXMucXVlcnkgPSB7fTtcbiAgfVxuXG4gIHZhciBmaXJzdElkeCA9XG4gICAgcXVlc3Rpb25JZHggIT09IC0xICYmIChoYXNoSWR4ID09PSAtMSB8fCBxdWVzdGlvbklkeCA8IGhhc2hJZHgpID8gcXVlc3Rpb25JZHggOiBoYXNoSWR4O1xuICBpZiAoZmlyc3RJZHggPT09IC0xKSB7XG4gICAgaWYgKHJlc3QubGVuZ3RoID4gMCkgdGhpcy5wYXRobmFtZSA9IHJlc3Q7XG4gIH0gZWxzZSBpZiAoZmlyc3RJZHggPiAwKSB7XG4gICAgdGhpcy5wYXRobmFtZSA9IHJlc3Quc2xpY2UoMCwgZmlyc3RJZHgpO1xuICB9XG4gIGlmIChzbGFzaGVkUHJvdG9jb2xbbG93ZXJQcm90b10gJiYgdGhpcy5ob3N0bmFtZSAmJiAhdGhpcy5wYXRobmFtZSkge1xuICAgIHRoaXMucGF0aG5hbWUgPSAnLyc7XG4gIH1cblxuICAvLyB0byBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICBpZiAodGhpcy5wYXRobmFtZSB8fCB0aGlzLnNlYXJjaCkge1xuICAgIGNvbnN0IHAgPSB0aGlzLnBhdGhuYW1lIHx8ICcnO1xuICAgIGNvbnN0IHMgPSB0aGlzLnNlYXJjaCB8fCAnJztcbiAgICB0aGlzLnBhdGggPSBwICsgcztcbiAgfVxuXG4gIC8vIGZpbmFsbHksIHJlY29uc3RydWN0IHRoZSBocmVmIGJhc2VkIG9uIHdoYXQgaGFzIGJlZW4gdmFsaWRhdGVkLlxuICB0aGlzLmhyZWYgPSB0aGlzLmZvcm1hdCgpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5mdW5jdGlvbiB2YWxpZGF0ZUhvc3RuYW1lKHNlbGYsIHJlc3QsIGhvc3RuYW1lKSB7XG4gIGZvciAodmFyIGkgPSAwLCBsYXN0UG9zOyBpIDw9IGhvc3RuYW1lLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIGNvZGU7XG4gICAgaWYgKGkgPCBob3N0bmFtZS5sZW5ndGgpIGNvZGUgPSBob3N0bmFtZS5jaGFyQ29kZUF0KGkpO1xuICAgIGlmIChjb2RlID09PSA0NiAvKi4qLyB8fCBpID09PSBob3N0bmFtZS5sZW5ndGgpIHtcbiAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIHtcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gNjMpIHtcbiAgICAgICAgICBzZWxmLmhvc3RuYW1lID0gaG9zdG5hbWUuc2xpY2UoMCwgbGFzdFBvcyArIDYzKTtcbiAgICAgICAgICByZXR1cm4gJy8nICsgaG9zdG5hbWUuc2xpY2UobGFzdFBvcyArIDYzKSArIHJlc3Q7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICAoY29kZSA+PSA0OCAvKjAqLyAmJiBjb2RlIDw9IDU3KSAvKjkqLyB8fFxuICAgICAgKGNvZGUgPj0gOTcgLyphKi8gJiYgY29kZSA8PSAxMjIpIC8qeiovIHx8XG4gICAgICBjb2RlID09PSA0NSAvKi0qLyB8fFxuICAgICAgKGNvZGUgPj0gNjUgLypBKi8gJiYgY29kZSA8PSA5MCkgLypaKi8gfHxcbiAgICAgIGNvZGUgPT09IDQzIC8qKyovIHx8XG4gICAgICBjb2RlID09PSA5NSAvKl8qLyB8fFxuICAgICAgLyogQkVHSU4gTU9OR08gVVJJIFBBVENIICovXG4gICAgICBjb2RlID09PSA0NCAvKiwqLyB8fFxuICAgICAgY29kZSA9PT0gNTggLyo6Ki8gfHxcbiAgICAgIC8qIEVORCBNT05HTyBVUkkgUEFUQ0ggKi9cbiAgICAgIGNvZGUgPiAxMjdcbiAgICApIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICAvLyBJbnZhbGlkIGhvc3QgY2hhcmFjdGVyXG4gICAgc2VsZi5ob3N0bmFtZSA9IGhvc3RuYW1lLnNsaWNlKDAsIGkpO1xuICAgIGlmIChpIDwgaG9zdG5hbWUubGVuZ3RoKSByZXR1cm4gJy8nICsgaG9zdG5hbWUuc2xpY2UoaSkgKyByZXN0O1xuICAgIGJyZWFrO1xuICB9XG59XG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5mdW5jdGlvbiBhdXRvRXNjYXBlU3RyKHJlc3QpIHtcbiAgdmFyIG5ld1Jlc3QgPSAnJztcbiAgdmFyIGxhc3RQb3MgPSAwO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHJlc3QubGVuZ3RoOyArK2kpIHtcbiAgICAvLyBBdXRvbWF0aWNhbGx5IGVzY2FwZSBhbGwgZGVsaW1pdGVycyBhbmQgdW53aXNlIGNoYXJhY3RlcnMgZnJvbSBSRkMgMjM5NlxuICAgIC8vIEFsc28gZXNjYXBlIHNpbmdsZSBxdW90ZXMgaW4gY2FzZSBvZiBhbiBYU1MgYXR0YWNrXG4gICAgc3dpdGNoIChyZXN0LmNoYXJDb2RlQXQoaSkpIHtcbiAgICAgIGNhc2UgOTogLy8gJ1xcdCdcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclMDknO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAxMDogLy8gJ1xcbidcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclMEEnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAxMzogLy8gJ1xccidcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclMEQnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAzMjogLy8gJyAnXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UmVzdCArPSAnJTIwJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMzQ6IC8vICdcIidcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclMjInO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAzOTogLy8gJ1xcJydcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclMjcnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSA2MDogLy8gJzwnXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UmVzdCArPSAnJTNDJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgNjI6IC8vICc+J1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyUzRSc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDkyOiAvLyAnXFxcXCdcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclNUMnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSA5NDogLy8gJ14nXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UmVzdCArPSAnJTVFJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgOTY6IC8vICdgJ1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyU2MCc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDEyMzogLy8gJ3snXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UmVzdCArPSAnJTdCJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMTI0OiAvLyAnfCdcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclN0MnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAxMjU6IC8vICd9J1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyU3RCc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG4gIGlmIChsYXN0UG9zID09PSAwKSByZXR1cm47XG4gIGlmIChsYXN0UG9zIDwgcmVzdC5sZW5ndGgpIHJldHVybiBuZXdSZXN0ICsgcmVzdC5zbGljZShsYXN0UG9zKTtcbiAgZWxzZSByZXR1cm4gbmV3UmVzdDtcbn1cblxuLy8gZm9ybWF0IGEgcGFyc2VkIG9iamVjdCBpbnRvIGEgdXJsIHN0cmluZ1xuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cbmZ1bmN0aW9uIHVybEZvcm1hdChvYmopIHtcbiAgLy8gZW5zdXJlIGl0J3MgYW4gb2JqZWN0LCBhbmQgbm90IGEgc3RyaW5nIHVybC5cbiAgLy8gSWYgaXQncyBhbiBvYmosIHRoaXMgaXMgYSBuby1vcC5cbiAgLy8gdGhpcyB3YXksIHlvdSBjYW4gY2FsbCB1cmxfZm9ybWF0KCkgb24gc3RyaW5nc1xuICAvLyB0byBjbGVhbiB1cCBwb3RlbnRpYWxseSB3b25reSB1cmxzLlxuICBpZiAodHlwZW9mIG9iaiA9PT0gJ3N0cmluZycpIG9iaiA9IHVybFBhcnNlKG9iaik7XG4gIGVsc2UgaWYgKHR5cGVvZiBvYmogIT09ICdvYmplY3QnIHx8IG9iaiA9PT0gbnVsbClcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFxuICAgICAgJ1BhcmFtZXRlciBcInVybE9ialwiIG11c3QgYmUgYW4gb2JqZWN0LCBub3QgJyArIG9iaiA9PT0gbnVsbCA/ICdudWxsJyA6IHR5cGVvZiBvYmpcbiAgICApO1xuICBlbHNlIGlmICghKG9iaiBpbnN0YW5jZW9mIFVybCkpIHJldHVybiBVcmwucHJvdG90eXBlLmZvcm1hdC5jYWxsKG9iaik7XG5cbiAgcmV0dXJuIG9iai5mb3JtYXQoKTtcbn1cblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cblVybC5wcm90b3R5cGUuZm9ybWF0ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgYXV0aCA9IHRoaXMuYXV0aCB8fCAnJztcbiAgaWYgKGF1dGgpIHtcbiAgICBhdXRoID0gZW5jb2RlQXV0aChhdXRoKTtcbiAgICBhdXRoICs9ICdAJztcbiAgfVxuXG4gIHZhciBwcm90b2NvbCA9IHRoaXMucHJvdG9jb2wgfHwgJyc7XG4gIHZhciBwYXRobmFtZSA9IHRoaXMucGF0aG5hbWUgfHwgJyc7XG4gIHZhciBoYXNoID0gdGhpcy5oYXNoIHx8ICcnO1xuICB2YXIgaG9zdCA9IGZhbHNlO1xuICB2YXIgcXVlcnkgPSAnJztcblxuICBpZiAodGhpcy5ob3N0KSB7XG4gICAgaG9zdCA9IGF1dGggKyB0aGlzLmhvc3Q7XG4gIH0gZWxzZSBpZiAodGhpcy5ob3N0bmFtZSkge1xuICAgIGhvc3QgPSBhdXRoICsgKHRoaXMuaG9zdG5hbWUuaW5kZXhPZignOicpID09PSAtMSA/IHRoaXMuaG9zdG5hbWUgOiAnWycgKyB0aGlzLmhvc3RuYW1lICsgJ10nKTtcbiAgICBpZiAodGhpcy5wb3J0KSB7XG4gICAgICBob3N0ICs9ICc6JyArIHRoaXMucG9ydDtcbiAgICB9XG4gIH1cblxuICBpZiAodGhpcy5xdWVyeSAhPT0gbnVsbCAmJiB0eXBlb2YgdGhpcy5xdWVyeSA9PT0gJ29iamVjdCcpXG4gICAgcXVlcnkgPSBxdWVyeXN0cmluZy5zdHJpbmdpZnkodGhpcy5xdWVyeSk7XG5cbiAgdmFyIHNlYXJjaCA9IHRoaXMuc2VhcmNoIHx8IChxdWVyeSAmJiAnPycgKyBxdWVyeSkgfHwgJyc7XG5cbiAgaWYgKHByb3RvY29sICYmIHByb3RvY29sLmNoYXJDb2RlQXQocHJvdG9jb2wubGVuZ3RoIC0gMSkgIT09IDU4IC8qOiovKSBwcm90b2NvbCArPSAnOic7XG5cbiAgdmFyIG5ld1BhdGhuYW1lID0gJyc7XG4gIHZhciBsYXN0UG9zID0gMDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBwYXRobmFtZS5sZW5ndGg7ICsraSkge1xuICAgIHN3aXRjaCAocGF0aG5hbWUuY2hhckNvZGVBdChpKSkge1xuICAgICAgY2FzZSAzNTogLy8gJyMnXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1BhdGhuYW1lICs9IHBhdGhuYW1lLnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdQYXRobmFtZSArPSAnJTIzJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgNjM6IC8vICc/J1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdQYXRobmFtZSArPSBwYXRobmFtZS5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UGF0aG5hbWUgKz0gJyUzRic7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG4gIGlmIChsYXN0UG9zID4gMCkge1xuICAgIGlmIChsYXN0UG9zICE9PSBwYXRobmFtZS5sZW5ndGgpIHBhdGhuYW1lID0gbmV3UGF0aG5hbWUgKyBwYXRobmFtZS5zbGljZShsYXN0UG9zKTtcbiAgICBlbHNlIHBhdGhuYW1lID0gbmV3UGF0aG5hbWU7XG4gIH1cblxuICAvLyBvbmx5IHRoZSBzbGFzaGVkUHJvdG9jb2xzIGdldCB0aGUgLy8uICBOb3QgbWFpbHRvOiwgeG1wcDosIGV0Yy5cbiAgLy8gdW5sZXNzIHRoZXkgaGFkIHRoZW0gdG8gYmVnaW4gd2l0aC5cbiAgaWYgKHRoaXMuc2xhc2hlcyB8fCAoKCFwcm90b2NvbCB8fCBzbGFzaGVkUHJvdG9jb2xbcHJvdG9jb2xdKSAmJiBob3N0ICE9PSBmYWxzZSkpIHtcbiAgICBob3N0ID0gJy8vJyArIChob3N0IHx8ICcnKTtcbiAgICBpZiAocGF0aG5hbWUgJiYgcGF0aG5hbWUuY2hhckNvZGVBdCgwKSAhPT0gNDcgLyovKi8pIHBhdGhuYW1lID0gJy8nICsgcGF0aG5hbWU7XG4gIH0gZWxzZSBpZiAoIWhvc3QpIHtcbiAgICBob3N0ID0gJyc7XG4gIH1cblxuICBzZWFyY2ggPSBzZWFyY2gucmVwbGFjZSgnIycsICclMjMnKTtcblxuICBpZiAoaGFzaCAmJiBoYXNoLmNoYXJDb2RlQXQoMCkgIT09IDM1IC8qIyovKSBoYXNoID0gJyMnICsgaGFzaDtcbiAgaWYgKHNlYXJjaCAmJiBzZWFyY2guY2hhckNvZGVBdCgwKSAhPT0gNjMgLyo/Ki8pIHNlYXJjaCA9ICc/JyArIHNlYXJjaDtcblxuICByZXR1cm4gcHJvdG9jb2wgKyBob3N0ICsgcGF0aG5hbWUgKyBzZWFyY2ggKyBoYXNoO1xufTtcblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cbmZ1bmN0aW9uIHVybFJlc29sdmUoc291cmNlLCByZWxhdGl2ZSkge1xuICByZXR1cm4gdXJsUGFyc2Uoc291cmNlLCBmYWxzZSwgdHJ1ZSkucmVzb2x2ZShyZWxhdGl2ZSk7XG59XG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5VcmwucHJvdG90eXBlLnJlc29sdmUgPSBmdW5jdGlvbiAocmVsYXRpdmUpIHtcbiAgcmV0dXJuIHRoaXMucmVzb2x2ZU9iamVjdCh1cmxQYXJzZShyZWxhdGl2ZSwgZmFsc2UsIHRydWUpKS5mb3JtYXQoKTtcbn07XG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5mdW5jdGlvbiB1cmxSZXNvbHZlT2JqZWN0KHNvdXJjZSwgcmVsYXRpdmUpIHtcbiAgaWYgKCFzb3VyY2UpIHJldHVybiByZWxhdGl2ZTtcbiAgcmV0dXJuIHVybFBhcnNlKHNvdXJjZSwgZmFsc2UsIHRydWUpLnJlc29sdmVPYmplY3QocmVsYXRpdmUpO1xufVxuXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuVXJsLnByb3RvdHlwZS5yZXNvbHZlT2JqZWN0ID0gZnVuY3Rpb24gKHJlbGF0aXZlKSB7XG4gIGlmICh0eXBlb2YgcmVsYXRpdmUgPT09ICdzdHJpbmcnKSB7XG4gICAgdmFyIHJlbCA9IG5ldyBVcmwoKTtcbiAgICByZWwucGFyc2UocmVsYXRpdmUsIGZhbHNlLCB0cnVlKTtcbiAgICByZWxhdGl2ZSA9IHJlbDtcbiAgfVxuXG4gIHZhciByZXN1bHQgPSBuZXcgVXJsKCk7XG4gIHZhciB0a2V5cyA9IE9iamVjdC5rZXlzKHRoaXMpO1xuICBmb3IgKHZhciB0ayA9IDA7IHRrIDwgdGtleXMubGVuZ3RoOyB0aysrKSB7XG4gICAgdmFyIHRrZXkgPSB0a2V5c1t0a107XG4gICAgcmVzdWx0W3RrZXldID0gdGhpc1t0a2V5XTtcbiAgfVxuXG4gIC8vIGhhc2ggaXMgYWx3YXlzIG92ZXJyaWRkZW4sIG5vIG1hdHRlciB3aGF0LlxuICAvLyBldmVuIGhyZWY9XCJcIiB3aWxsIHJlbW92ZSBpdC5cbiAgcmVzdWx0Lmhhc2ggPSByZWxhdGl2ZS5oYXNoO1xuXG4gIC8vIGlmIHRoZSByZWxhdGl2ZSB1cmwgaXMgZW1wdHksIHRoZW4gdGhlcmUncyBub3RoaW5nIGxlZnQgdG8gZG8gaGVyZS5cbiAgaWYgKHJlbGF0aXZlLmhyZWYgPT09ICcnKSB7XG4gICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIGhyZWZzIGxpa2UgLy9mb28vYmFyIGFsd2F5cyBjdXQgdG8gdGhlIHByb3RvY29sLlxuICBpZiAocmVsYXRpdmUuc2xhc2hlcyAmJiAhcmVsYXRpdmUucHJvdG9jb2wpIHtcbiAgICAvLyB0YWtlIGV2ZXJ5dGhpbmcgZXhjZXB0IHRoZSBwcm90b2NvbCBmcm9tIHJlbGF0aXZlXG4gICAgdmFyIHJrZXlzID0gT2JqZWN0LmtleXMocmVsYXRpdmUpO1xuICAgIGZvciAodmFyIHJrID0gMDsgcmsgPCBya2V5cy5sZW5ndGg7IHJrKyspIHtcbiAgICAgIHZhciBya2V5ID0gcmtleXNbcmtdO1xuICAgICAgaWYgKHJrZXkgIT09ICdwcm90b2NvbCcpIHJlc3VsdFtya2V5XSA9IHJlbGF0aXZlW3JrZXldO1xuICAgIH1cblxuICAgIC8vdXJsUGFyc2UgYXBwZW5kcyB0cmFpbGluZyAvIHRvIHVybHMgbGlrZSBodHRwOi8vd3d3LmV4YW1wbGUuY29tXG4gICAgaWYgKHNsYXNoZWRQcm90b2NvbFtyZXN1bHQucHJvdG9jb2xdICYmIHJlc3VsdC5ob3N0bmFtZSAmJiAhcmVzdWx0LnBhdGhuYW1lKSB7XG4gICAgICByZXN1bHQucGF0aCA9IHJlc3VsdC5wYXRobmFtZSA9ICcvJztcbiAgICB9XG5cbiAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgaWYgKHJlbGF0aXZlLnByb3RvY29sICYmIHJlbGF0aXZlLnByb3RvY29sICE9PSByZXN1bHQucHJvdG9jb2wpIHtcbiAgICAvLyBpZiBpdCdzIGEga25vd24gdXJsIHByb3RvY29sLCB0aGVuIGNoYW5naW5nXG4gICAgLy8gdGhlIHByb3RvY29sIGRvZXMgd2VpcmQgdGhpbmdzXG4gICAgLy8gZmlyc3QsIGlmIGl0J3Mgbm90IGZpbGU6LCB0aGVuIHdlIE1VU1QgaGF2ZSBhIGhvc3QsXG4gICAgLy8gYW5kIGlmIHRoZXJlIHdhcyBhIHBhdGhcbiAgICAvLyB0byBiZWdpbiB3aXRoLCB0aGVuIHdlIE1VU1QgaGF2ZSBhIHBhdGguXG4gICAgLy8gaWYgaXQgaXMgZmlsZTosIHRoZW4gdGhlIGhvc3QgaXMgZHJvcHBlZCxcbiAgICAvLyBiZWNhdXNlIHRoYXQncyBrbm93biB0byBiZSBob3N0bGVzcy5cbiAgICAvLyBhbnl0aGluZyBlbHNlIGlzIGFzc3VtZWQgdG8gYmUgYWJzb2x1dGUuXG4gICAgaWYgKCFzbGFzaGVkUHJvdG9jb2xbcmVsYXRpdmUucHJvdG9jb2xdKSB7XG4gICAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHJlbGF0aXZlKTtcbiAgICAgIGZvciAodmFyIHYgPSAwOyB2IDwga2V5cy5sZW5ndGg7IHYrKykge1xuICAgICAgICB2YXIgayA9IGtleXNbdl07XG4gICAgICAgIHJlc3VsdFtrXSA9IHJlbGF0aXZlW2tdO1xuICAgICAgfVxuICAgICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIHJlc3VsdC5wcm90b2NvbCA9IHJlbGF0aXZlLnByb3RvY29sO1xuICAgIGlmIChcbiAgICAgICFyZWxhdGl2ZS5ob3N0ICYmXG4gICAgICAhL15maWxlOj8kLy50ZXN0KHJlbGF0aXZlLnByb3RvY29sKSAmJlxuICAgICAgIWhvc3RsZXNzUHJvdG9jb2xbcmVsYXRpdmUucHJvdG9jb2xdXG4gICAgKSB7XG4gICAgICBjb25zdCByZWxQYXRoID0gKHJlbGF0aXZlLnBhdGhuYW1lIHx8ICcnKS5zcGxpdCgnLycpO1xuICAgICAgd2hpbGUgKHJlbFBhdGgubGVuZ3RoICYmICEocmVsYXRpdmUuaG9zdCA9IHJlbFBhdGguc2hpZnQoKSkpO1xuICAgICAgaWYgKCFyZWxhdGl2ZS5ob3N0KSByZWxhdGl2ZS5ob3N0ID0gJyc7XG4gICAgICBpZiAoIXJlbGF0aXZlLmhvc3RuYW1lKSByZWxhdGl2ZS5ob3N0bmFtZSA9ICcnO1xuICAgICAgaWYgKHJlbFBhdGhbMF0gIT09ICcnKSByZWxQYXRoLnVuc2hpZnQoJycpO1xuICAgICAgaWYgKHJlbFBhdGgubGVuZ3RoIDwgMikgcmVsUGF0aC51bnNoaWZ0KCcnKTtcbiAgICAgIHJlc3VsdC5wYXRobmFtZSA9IHJlbFBhdGguam9pbignLycpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXN1bHQucGF0aG5hbWUgPSByZWxhdGl2ZS5wYXRobmFtZTtcbiAgICB9XG4gICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICByZXN1bHQucXVlcnkgPSByZWxhdGl2ZS5xdWVyeTtcbiAgICByZXN1bHQuaG9zdCA9IHJlbGF0aXZlLmhvc3QgfHwgJyc7XG4gICAgcmVzdWx0LmF1dGggPSByZWxhdGl2ZS5hdXRoO1xuICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlbGF0aXZlLmhvc3RuYW1lIHx8IHJlbGF0aXZlLmhvc3Q7XG4gICAgcmVzdWx0LnBvcnQgPSByZWxhdGl2ZS5wb3J0O1xuICAgIC8vIHRvIHN1cHBvcnQgaHR0cC5yZXF1ZXN0XG4gICAgaWYgKHJlc3VsdC5wYXRobmFtZSB8fCByZXN1bHQuc2VhcmNoKSB7XG4gICAgICB2YXIgcCA9IHJlc3VsdC5wYXRobmFtZSB8fCAnJztcbiAgICAgIHZhciBzID0gcmVzdWx0LnNlYXJjaCB8fCAnJztcbiAgICAgIHJlc3VsdC5wYXRoID0gcCArIHM7XG4gICAgfVxuICAgIHJlc3VsdC5zbGFzaGVzID0gcmVzdWx0LnNsYXNoZXMgfHwgcmVsYXRpdmUuc2xhc2hlcztcbiAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgdmFyIGlzU291cmNlQWJzID0gcmVzdWx0LnBhdGhuYW1lICYmIHJlc3VsdC5wYXRobmFtZS5jaGFyQXQoMCkgPT09ICcvJztcbiAgdmFyIGlzUmVsQWJzID0gcmVsYXRpdmUuaG9zdCB8fCAocmVsYXRpdmUucGF0aG5hbWUgJiYgcmVsYXRpdmUucGF0aG5hbWUuY2hhckF0KDApID09PSAnLycpO1xuICB2YXIgbXVzdEVuZEFicyA9IGlzUmVsQWJzIHx8IGlzU291cmNlQWJzIHx8IChyZXN1bHQuaG9zdCAmJiByZWxhdGl2ZS5wYXRobmFtZSk7XG4gIHZhciByZW1vdmVBbGxEb3RzID0gbXVzdEVuZEFicztcbiAgdmFyIHNyY1BhdGggPSAocmVzdWx0LnBhdGhuYW1lICYmIHJlc3VsdC5wYXRobmFtZS5zcGxpdCgnLycpKSB8fCBbXTtcbiAgdmFyIHJlbFBhdGggPSAocmVsYXRpdmUucGF0aG5hbWUgJiYgcmVsYXRpdmUucGF0aG5hbWUuc3BsaXQoJy8nKSkgfHwgW107XG4gIHZhciBwc3ljaG90aWMgPSByZXN1bHQucHJvdG9jb2wgJiYgIXNsYXNoZWRQcm90b2NvbFtyZXN1bHQucHJvdG9jb2xdO1xuXG4gIC8vIGlmIHRoZSB1cmwgaXMgYSBub24tc2xhc2hlZCB1cmwsIHRoZW4gcmVsYXRpdmVcbiAgLy8gbGlua3MgbGlrZSAuLi8uLiBzaG91bGQgYmUgYWJsZVxuICAvLyB0byBjcmF3bCB1cCB0byB0aGUgaG9zdG5hbWUsIGFzIHdlbGwuICBUaGlzIGlzIHN0cmFuZ2UuXG4gIC8vIHJlc3VsdC5wcm90b2NvbCBoYXMgYWxyZWFkeSBiZWVuIHNldCBieSBub3cuXG4gIC8vIExhdGVyIG9uLCBwdXQgdGhlIGZpcnN0IHBhdGggcGFydCBpbnRvIHRoZSBob3N0IGZpZWxkLlxuICBpZiAocHN5Y2hvdGljKSB7XG4gICAgcmVzdWx0Lmhvc3RuYW1lID0gJyc7XG4gICAgcmVzdWx0LnBvcnQgPSBudWxsO1xuICAgIGlmIChyZXN1bHQuaG9zdCkge1xuICAgICAgaWYgKHNyY1BhdGhbMF0gPT09ICcnKSBzcmNQYXRoWzBdID0gcmVzdWx0Lmhvc3Q7XG4gICAgICBlbHNlIHNyY1BhdGgudW5zaGlmdChyZXN1bHQuaG9zdCk7XG4gICAgfVxuICAgIHJlc3VsdC5ob3N0ID0gJyc7XG4gICAgaWYgKHJlbGF0aXZlLnByb3RvY29sKSB7XG4gICAgICByZWxhdGl2ZS5ob3N0bmFtZSA9IG51bGw7XG4gICAgICByZWxhdGl2ZS5wb3J0ID0gbnVsbDtcbiAgICAgIGlmIChyZWxhdGl2ZS5ob3N0KSB7XG4gICAgICAgIGlmIChyZWxQYXRoWzBdID09PSAnJykgcmVsUGF0aFswXSA9IHJlbGF0aXZlLmhvc3Q7XG4gICAgICAgIGVsc2UgcmVsUGF0aC51bnNoaWZ0KHJlbGF0aXZlLmhvc3QpO1xuICAgICAgfVxuICAgICAgcmVsYXRpdmUuaG9zdCA9IG51bGw7XG4gICAgfVxuICAgIG11c3RFbmRBYnMgPSBtdXN0RW5kQWJzICYmIChyZWxQYXRoWzBdID09PSAnJyB8fCBzcmNQYXRoWzBdID09PSAnJyk7XG4gIH1cblxuICBpZiAoaXNSZWxBYnMpIHtcbiAgICAvLyBpdCdzIGFic29sdXRlLlxuICAgIHJlc3VsdC5ob3N0ID0gcmVsYXRpdmUuaG9zdCB8fCByZWxhdGl2ZS5ob3N0ID09PSAnJyA/IHJlbGF0aXZlLmhvc3QgOiByZXN1bHQuaG9zdDtcbiAgICByZXN1bHQuaG9zdG5hbWUgPVxuICAgICAgcmVsYXRpdmUuaG9zdG5hbWUgfHwgcmVsYXRpdmUuaG9zdG5hbWUgPT09ICcnID8gcmVsYXRpdmUuaG9zdG5hbWUgOiByZXN1bHQuaG9zdG5hbWU7XG4gICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICByZXN1bHQucXVlcnkgPSByZWxhdGl2ZS5xdWVyeTtcbiAgICBzcmNQYXRoID0gcmVsUGF0aDtcbiAgICAvLyBmYWxsIHRocm91Z2ggdG8gdGhlIGRvdC1oYW5kbGluZyBiZWxvdy5cbiAgfSBlbHNlIGlmIChyZWxQYXRoLmxlbmd0aCkge1xuICAgIC8vIGl0J3MgcmVsYXRpdmVcbiAgICAvLyB0aHJvdyBhd2F5IHRoZSBleGlzdGluZyBmaWxlLCBhbmQgdGFrZSB0aGUgbmV3IHBhdGggaW5zdGVhZC5cbiAgICBpZiAoIXNyY1BhdGgpIHNyY1BhdGggPSBbXTtcbiAgICBzcmNQYXRoLnBvcCgpO1xuICAgIHNyY1BhdGggPSBzcmNQYXRoLmNvbmNhdChyZWxQYXRoKTtcbiAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgIHJlc3VsdC5xdWVyeSA9IHJlbGF0aXZlLnF1ZXJ5O1xuICB9IGVsc2UgaWYgKHJlbGF0aXZlLnNlYXJjaCAhPT0gbnVsbCAmJiByZWxhdGl2ZS5zZWFyY2ggIT09IHVuZGVmaW5lZCkge1xuICAgIC8vIGp1c3QgcHVsbCBvdXQgdGhlIHNlYXJjaC5cbiAgICAvLyBsaWtlIGhyZWY9Jz9mb28nLlxuICAgIC8vIFB1dCB0aGlzIGFmdGVyIHRoZSBvdGhlciB0d28gY2FzZXMgYmVjYXVzZSBpdCBzaW1wbGlmaWVzIHRoZSBib29sZWFuc1xuICAgIGlmIChwc3ljaG90aWMpIHtcbiAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlc3VsdC5ob3N0ID0gc3JjUGF0aC5zaGlmdCgpO1xuICAgICAgLy9vY2Nhc2lvbmFsbHkgdGhlIGF1dGggY2FuIGdldCBzdHVjayBvbmx5IGluIGhvc3RcbiAgICAgIC8vdGhpcyBlc3BlY2lhbGx5IGhhcHBlbnMgaW4gY2FzZXMgbGlrZVxuICAgICAgLy91cmwucmVzb2x2ZU9iamVjdCgnbWFpbHRvOmxvY2FsMUBkb21haW4xJywgJ2xvY2FsMkBkb21haW4yJylcbiAgICAgIGNvbnN0IGF1dGhJbkhvc3QgPVxuICAgICAgICByZXN1bHQuaG9zdCAmJiByZXN1bHQuaG9zdC5pbmRleE9mKCdAJykgPiAwID8gcmVzdWx0Lmhvc3Quc3BsaXQoJ0AnKSA6IGZhbHNlO1xuICAgICAgaWYgKGF1dGhJbkhvc3QpIHtcbiAgICAgICAgcmVzdWx0LmF1dGggPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgICAgIHJlc3VsdC5ob3N0ID0gcmVzdWx0Lmhvc3RuYW1lID0gYXV0aEluSG9zdC5zaGlmdCgpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgIHJlc3VsdC5xdWVyeSA9IHJlbGF0aXZlLnF1ZXJ5O1xuICAgIC8vdG8gc3VwcG9ydCBodHRwLnJlcXVlc3RcbiAgICBpZiAocmVzdWx0LnBhdGhuYW1lICE9PSBudWxsIHx8IHJlc3VsdC5zZWFyY2ggIT09IG51bGwpIHtcbiAgICAgIHJlc3VsdC5wYXRoID0gKHJlc3VsdC5wYXRobmFtZSA/IHJlc3VsdC5wYXRobmFtZSA6ICcnKSArIChyZXN1bHQuc2VhcmNoID8gcmVzdWx0LnNlYXJjaCA6ICcnKTtcbiAgICB9XG4gICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGlmICghc3JjUGF0aC5sZW5ndGgpIHtcbiAgICAvLyBubyBwYXRoIGF0IGFsbC4gIGVhc3kuXG4gICAgLy8gd2UndmUgYWxyZWFkeSBoYW5kbGVkIHRoZSBvdGhlciBzdHVmZiBhYm92ZS5cbiAgICByZXN1bHQucGF0aG5hbWUgPSBudWxsO1xuICAgIC8vdG8gc3VwcG9ydCBodHRwLnJlcXVlc3RcbiAgICBpZiAocmVzdWx0LnNlYXJjaCkge1xuICAgICAgcmVzdWx0LnBhdGggPSAnLycgKyByZXN1bHQuc2VhcmNoO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXN1bHQucGF0aCA9IG51bGw7XG4gICAgfVxuICAgIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvLyBpZiBhIHVybCBFTkRzIGluIC4gb3IgLi4sIHRoZW4gaXQgbXVzdCBnZXQgYSB0cmFpbGluZyBzbGFzaC5cbiAgLy8gaG93ZXZlciwgaWYgaXQgZW5kcyBpbiBhbnl0aGluZyBlbHNlIG5vbi1zbGFzaHksXG4gIC8vIHRoZW4gaXQgbXVzdCBOT1QgZ2V0IGEgdHJhaWxpbmcgc2xhc2guXG4gIHZhciBsYXN0ID0gc3JjUGF0aC5zbGljZSgtMSlbMF07XG4gIHZhciBoYXNUcmFpbGluZ1NsYXNoID1cbiAgICAoKHJlc3VsdC5ob3N0IHx8IHJlbGF0aXZlLmhvc3QgfHwgc3JjUGF0aC5sZW5ndGggPiAxKSAmJiAobGFzdCA9PT0gJy4nIHx8IGxhc3QgPT09ICcuLicpKSB8fFxuICAgIGxhc3QgPT09ICcnO1xuXG4gIC8vIHN0cmlwIHNpbmdsZSBkb3RzLCByZXNvbHZlIGRvdWJsZSBkb3RzIHRvIHBhcmVudCBkaXJcbiAgLy8gaWYgdGhlIHBhdGggdHJpZXMgdG8gZ28gYWJvdmUgdGhlIHJvb3QsIGB1cGAgZW5kcyB1cCA+IDBcbiAgdmFyIHVwID0gMDtcbiAgZm9yICh2YXIgaSA9IHNyY1BhdGgubGVuZ3RoOyBpID49IDA7IGktLSkge1xuICAgIGxhc3QgPSBzcmNQYXRoW2ldO1xuICAgIGlmIChsYXN0ID09PSAnLicpIHtcbiAgICAgIHNwbGljZU9uZShzcmNQYXRoLCBpKTtcbiAgICB9IGVsc2UgaWYgKGxhc3QgPT09ICcuLicpIHtcbiAgICAgIHNwbGljZU9uZShzcmNQYXRoLCBpKTtcbiAgICAgIHVwKys7XG4gICAgfSBlbHNlIGlmICh1cCkge1xuICAgICAgc3BsaWNlT25lKHNyY1BhdGgsIGkpO1xuICAgICAgdXAtLTtcbiAgICB9XG4gIH1cblxuICAvLyBpZiB0aGUgcGF0aCBpcyBhbGxvd2VkIHRvIGdvIGFib3ZlIHRoZSByb290LCByZXN0b3JlIGxlYWRpbmcgLi5zXG4gIGlmICghbXVzdEVuZEFicyAmJiAhcmVtb3ZlQWxsRG90cykge1xuICAgIGZvciAoOyB1cC0tOyB1cCkge1xuICAgICAgc3JjUGF0aC51bnNoaWZ0KCcuLicpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChtdXN0RW5kQWJzICYmIHNyY1BhdGhbMF0gIT09ICcnICYmICghc3JjUGF0aFswXSB8fCBzcmNQYXRoWzBdLmNoYXJBdCgwKSAhPT0gJy8nKSkge1xuICAgIHNyY1BhdGgudW5zaGlmdCgnJyk7XG4gIH1cblxuICBpZiAoaGFzVHJhaWxpbmdTbGFzaCAmJiBzcmNQYXRoLmpvaW4oJy8nKS5zdWJzdHIoLTEpICE9PSAnLycpIHtcbiAgICBzcmNQYXRoLnB1c2goJycpO1xuICB9XG5cbiAgdmFyIGlzQWJzb2x1dGUgPSBzcmNQYXRoWzBdID09PSAnJyB8fCAoc3JjUGF0aFswXSAmJiBzcmNQYXRoWzBdLmNoYXJBdCgwKSA9PT0gJy8nKTtcblxuICAvLyBwdXQgdGhlIGhvc3QgYmFja1xuICBpZiAocHN5Y2hvdGljKSB7XG4gICAgaWYgKGlzQWJzb2x1dGUpIHtcbiAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlc3VsdC5ob3N0ID0gJyc7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlc3VsdC5ob3N0ID0gc3JjUGF0aC5sZW5ndGggPyBzcmNQYXRoLnNoaWZ0KCkgOiAnJztcbiAgICB9XG4gICAgLy9vY2Nhc2lvbmFsbHkgdGhlIGF1dGggY2FuIGdldCBzdHVjayBvbmx5IGluIGhvc3RcbiAgICAvL3RoaXMgZXNwZWNpYWxseSBoYXBwZW5zIGluIGNhc2VzIGxpa2VcbiAgICAvL3VybC5yZXNvbHZlT2JqZWN0KCdtYWlsdG86bG9jYWwxQGRvbWFpbjEnLCAnbG9jYWwyQGRvbWFpbjInKVxuICAgIGNvbnN0IGF1dGhJbkhvc3QgPSByZXN1bHQuaG9zdCAmJiByZXN1bHQuaG9zdC5pbmRleE9mKCdAJykgPiAwID8gcmVzdWx0Lmhvc3Quc3BsaXQoJ0AnKSA6IGZhbHNlO1xuICAgIGlmIChhdXRoSW5Ib3N0KSB7XG4gICAgICByZXN1bHQuYXV0aCA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgIHJlc3VsdC5ob3N0ID0gcmVzdWx0Lmhvc3RuYW1lID0gYXV0aEluSG9zdC5zaGlmdCgpO1xuICAgIH1cbiAgfVxuXG4gIG11c3RFbmRBYnMgPSBtdXN0RW5kQWJzIHx8IChyZXN1bHQuaG9zdCAmJiBzcmNQYXRoLmxlbmd0aCk7XG5cbiAgaWYgKG11c3RFbmRBYnMgJiYgIWlzQWJzb2x1dGUpIHtcbiAgICBzcmNQYXRoLnVuc2hpZnQoJycpO1xuICB9XG5cbiAgaWYgKCFzcmNQYXRoLmxlbmd0aCkge1xuICAgIHJlc3VsdC5wYXRobmFtZSA9IG51bGw7XG4gICAgcmVzdWx0LnBhdGggPSBudWxsO1xuICB9IGVsc2Uge1xuICAgIHJlc3VsdC5wYXRobmFtZSA9IHNyY1BhdGguam9pbignLycpO1xuICB9XG5cbiAgLy90byBzdXBwb3J0IHJlcXVlc3QuaHR0cFxuICBpZiAocmVzdWx0LnBhdGhuYW1lICE9PSBudWxsIHx8IHJlc3VsdC5zZWFyY2ggIT09IG51bGwpIHtcbiAgICByZXN1bHQucGF0aCA9IChyZXN1bHQucGF0aG5hbWUgPyByZXN1bHQucGF0aG5hbWUgOiAnJykgKyAocmVzdWx0LnNlYXJjaCA/IHJlc3VsdC5zZWFyY2ggOiAnJyk7XG4gIH1cbiAgcmVzdWx0LmF1dGggPSByZWxhdGl2ZS5hdXRoIHx8IHJlc3VsdC5hdXRoO1xuICByZXN1bHQuc2xhc2hlcyA9IHJlc3VsdC5zbGFzaGVzIHx8IHJlbGF0aXZlLnNsYXNoZXM7XG4gIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICByZXR1cm4gcmVzdWx0O1xufTtcblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cblVybC5wcm90b3R5cGUucGFyc2VIb3N0ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgaG9zdCA9IHRoaXMuaG9zdDtcbiAgdmFyIHBvcnQgPSBwb3J0UGF0dGVybi5leGVjKGhvc3QpO1xuICBpZiAocG9ydCkge1xuICAgIHBvcnQgPSBwb3J0WzBdO1xuICAgIGlmIChwb3J0ICE9PSAnOicpIHtcbiAgICAgIHRoaXMucG9ydCA9IHBvcnQuc2xpY2UoMSk7XG4gICAgfVxuICAgIGhvc3QgPSBob3N0LnNsaWNlKDAsIGhvc3QubGVuZ3RoIC0gcG9ydC5sZW5ndGgpO1xuICB9XG4gIGlmIChob3N0KSB0aGlzLmhvc3RuYW1lID0gaG9zdDtcbn07XG5cbi8vIEFib3V0IDEuNXggZmFzdGVyIHRoYW4gdGhlIHR3by1hcmcgdmVyc2lvbiBvZiBBcnJheSNzcGxpY2UoKS5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5mdW5jdGlvbiBzcGxpY2VPbmUobGlzdCwgaW5kZXgpIHtcbiAgZm9yICh2YXIgaSA9IGluZGV4LCBrID0gaSArIDEsIG4gPSBsaXN0Lmxlbmd0aDsgayA8IG47IGkgKz0gMSwgayArPSAxKSBsaXN0W2ldID0gbGlzdFtrXTtcbiAgbGlzdC5wb3AoKTtcbn1cblxudmFyIGhleFRhYmxlID0gbmV3IEFycmF5KDI1Nik7XG5mb3IgKHZhciBpID0gMDsgaSA8IDI1NjsgKytpKVxuICBoZXhUYWJsZVtpXSA9ICclJyArICgoaSA8IDE2ID8gJzAnIDogJycpICsgaS50b1N0cmluZygxNikpLnRvVXBwZXJDYXNlKCk7XG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuZnVuY3Rpb24gZW5jb2RlQXV0aChzdHIpIHtcbiAgLy8gZmFzdGVyIGVuY29kZVVSSUNvbXBvbmVudCBhbHRlcm5hdGl2ZSBmb3IgZW5jb2RpbmcgYXV0aCB1cmkgY29tcG9uZW50c1xuICB2YXIgb3V0ID0gJyc7XG4gIHZhciBsYXN0UG9zID0gMDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgYyA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuXG4gICAgLy8gVGhlc2UgY2hhcmFjdGVycyBkbyBub3QgbmVlZCBlc2NhcGluZzpcbiAgICAvLyAhIC0gLiBfIH5cbiAgICAvLyAnICggKSAqIDpcbiAgICAvLyBkaWdpdHNcbiAgICAvLyBhbHBoYSAodXBwZXJjYXNlKVxuICAgIC8vIGFscGhhIChsb3dlcmNhc2UpXG4gICAgaWYgKFxuICAgICAgYyA9PT0gMHgyMSB8fFxuICAgICAgYyA9PT0gMHgyZCB8fFxuICAgICAgYyA9PT0gMHgyZSB8fFxuICAgICAgYyA9PT0gMHg1ZiB8fFxuICAgICAgYyA9PT0gMHg3ZSB8fFxuICAgICAgKGMgPj0gMHgyNyAmJiBjIDw9IDB4MmEpIHx8XG4gICAgICAoYyA+PSAweDMwICYmIGMgPD0gMHgzYSkgfHxcbiAgICAgIChjID49IDB4NDEgJiYgYyA8PSAweDVhKSB8fFxuICAgICAgKGMgPj0gMHg2MSAmJiBjIDw9IDB4N2EpXG4gICAgKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBvdXQgKz0gc3RyLnNsaWNlKGxhc3RQb3MsIGkpO1xuXG4gICAgbGFzdFBvcyA9IGkgKyAxO1xuXG4gICAgLy8gT3RoZXIgQVNDSUkgY2hhcmFjdGVyc1xuICAgIGlmIChjIDwgMHg4MCkge1xuICAgICAgb3V0ICs9IGhleFRhYmxlW2NdO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gTXVsdGktYnl0ZSBjaGFyYWN0ZXJzIC4uLlxuICAgIGlmIChjIDwgMHg4MDApIHtcbiAgICAgIG91dCArPSBoZXhUYWJsZVsweGMwIHwgKGMgPj4gNildICsgaGV4VGFibGVbMHg4MCB8IChjICYgMHgzZildO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGlmIChjIDwgMHhkODAwIHx8IGMgPj0gMHhlMDAwKSB7XG4gICAgICBvdXQgKz1cbiAgICAgICAgaGV4VGFibGVbMHhlMCB8IChjID4+IDEyKV0gK1xuICAgICAgICBoZXhUYWJsZVsweDgwIHwgKChjID4+IDYpICYgMHgzZildICtcbiAgICAgICAgaGV4VGFibGVbMHg4MCB8IChjICYgMHgzZildO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIC8vIFN1cnJvZ2F0ZSBwYWlyXG4gICAgKytpO1xuICAgIHZhciBjMjtcbiAgICBpZiAoaSA8IHN0ci5sZW5ndGgpIGMyID0gc3RyLmNoYXJDb2RlQXQoaSkgJiAweDNmZjtcbiAgICBlbHNlIGMyID0gMDtcbiAgICBjID0gMHgxMDAwMCArICgoKGMgJiAweDNmZikgPDwgMTApIHwgYzIpO1xuICAgIG91dCArPVxuICAgICAgaGV4VGFibGVbMHhmMCB8IChjID4+IDE4KV0gK1xuICAgICAgaGV4VGFibGVbMHg4MCB8ICgoYyA+PiAxMikgJiAweDNmKV0gK1xuICAgICAgaGV4VGFibGVbMHg4MCB8ICgoYyA+PiA2KSAmIDB4M2YpXSArXG4gICAgICBoZXhUYWJsZVsweDgwIHwgKGMgJiAweDNmKV07XG4gIH1cbiAgaWYgKGxhc3RQb3MgPT09IDApIHJldHVybiBzdHI7XG4gIGlmIChsYXN0UG9zIDwgc3RyLmxlbmd0aCkgcmV0dXJuIG91dCArIHN0ci5zbGljZShsYXN0UG9zKTtcbiAgcmV0dXJuIG91dDtcbn1cbiJdfQ==