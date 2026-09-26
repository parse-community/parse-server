'use strict';
// Loaded by Jasmine BEFORE helper.js so .ts helpers/specs can be required at
// runtime. Babel auto-resolves spec/.babelrc (which already declares
// @babel/preset-typescript), so we do not declare presets here.
//
// Scope is intentionally narrow: only `.ts` files are intercepted, so the ~3900
// existing `.js` specs keep running natively (no behavior change, no extra cost).
// `.js` requires (helpers, lib/) continue to resolve through Node directly.
require('@babel/register')({
  extensions: ['.ts'],
  only: [/[\\/]spec[\\/]/],
  cache: true,
});
