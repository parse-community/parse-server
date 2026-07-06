"use strict";

// Standalone package copy of the built SQLite adapter utility helpers.

const stableStringify = require('safe-stable-stringify');

// Keep object-key order deterministic so equality-sensitive array operations
// behave consistently across logically equivalent payloads.
const canonicalJSONStringify = value => stableStringify(value);
const parseJSONArray = value => {
  try {
    const parsedValue = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
};
const removeRegexWhiteSpace = regex => {
  let normalizedRegex = regex;
  if (!normalizedRegex.endsWith('\n')) {
    normalizedRegex += '\n';
  }
  return normalizedRegex.replace(/([^\\])#.*\n/gim, '$1').replace(/^#.*\n/gim, '').replace(/([^\\])\s+/gim, '$1').replace(/^\s+/, '').trim();
};
const createLiteralRegex = remaining => remaining.split('').map(c => {
  const regex = RegExp('[0-9 ]|\\p{L}', 'u');
  if (c.match(regex) !== null) {
    return c;
  }
  return /[.*+?^${}()|[\]\\]/.test(c) ? `\\${c}` : c;
}).join('');
const literalizeRegexPart = s => {
  const matcher1 = /\\Q((?!\\E).*)\\E$/;
  const result1 = s.match(matcher1);
  if (result1 && result1.length > 1 && result1.index > -1) {
    const prefix = s.substring(0, result1.index);
    const remaining = result1[1];
    return literalizeRegexPart(prefix) + createLiteralRegex(remaining);
  }
  const matcher2 = /\\Q((?!\\E).*)$/;
  const result2 = s.match(matcher2);
  if (result2 && result2.length > 1 && result2.index > -1) {
    const prefix = s.substring(0, result2.index);
    const remaining = result2[1];
    return literalizeRegexPart(prefix) + createLiteralRegex(remaining);
  }
  return s.replace(/([^\\])(\\E)/g, '$1').replace(/([^\\])(\\Q)/g, '$1').replace(/^\\E/, '').replace(/^\\Q/, '');
};
const processRegexPattern = pattern => {
  if (pattern && pattern.startsWith('^')) {
    return '^' + literalizeRegexPart(pattern.slice(1));
  }
  if (pattern && pattern.endsWith('$')) {
    return literalizeRegexPart(pattern.slice(0, pattern.length - 1)) + '$';
  }
  return literalizeRegexPart(pattern);
};
const normalizeRegexPattern = (pattern, flags) => {
  let normalizedPattern = pattern;
  let normalizedFlags = flags || '';
  if (normalizedFlags.includes('x')) {
    normalizedPattern = removeRegexWhiteSpace(normalizedPattern);
    normalizedFlags = normalizedFlags.replace(/x/g, '');
  }
  normalizedPattern = processRegexPattern(normalizedPattern);
  return {
    pattern: normalizedPattern,
    flags: normalizedFlags
  };
};
const isRegexCharacterEscaped = (pattern, index) => {
  let backslashCount = 0;
  for (let i = index - 1; i >= 0 && pattern[i] === '\\'; i -= 1) {
    backslashCount += 1;
  }
  return backslashCount % 2 === 1;
};
const getSimpleNormalizedRegexInfo = (pattern, flags) => {
  const distinctFlags = Array.from(new Set((flags || '').split('').filter(Boolean)));
  if (distinctFlags.some(flag => flag !== 'i')) {
    return null;
  }
  let startIndex = 0;
  let endIndex = pattern.length;
  let anchoredStart = false;
  let anchoredEnd = false;
  if (pattern.startsWith('^')) {
    anchoredStart = true;
    startIndex = 1;
  }
  if (endIndex > startIndex && pattern[endIndex - 1] === '$' && !isRegexCharacterEscaped(pattern, endIndex - 1)) {
    anchoredEnd = true;
    endIndex -= 1;
  }
  let literal = '';
  for (let index = startIndex; index < endIndex; index += 1) {
    const char = pattern[index];
    if (char === '\\') {
      index += 1;
      if (index >= endIndex) {
        return null;
      }
      const escapedChar = pattern[index];
      if ('\\.^$|?*+()[]{}'.includes(escapedChar)) {
        literal += escapedChar;
        continue;
      }
      return null;
    }
    if ('.*+?()|[{'.includes(char)) {
      return null;
    }
    literal += char;
  }
  let mode = 'contains';
  if (anchoredStart && anchoredEnd) {
    mode = 'exact';
  } else if (anchoredStart) {
    mode = 'startsWith';
  } else if (anchoredEnd) {
    mode = 'endsWith';
  }
  return {
    literal,
    mode,
    caseInsensitive: distinctFlags.includes('i')
  };
};
module.exports = {
  canonicalJSONStringify,
  getSimpleNormalizedRegexInfo,
  normalizeRegexPattern,
  parseJSONArray
};