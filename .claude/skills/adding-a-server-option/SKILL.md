---
name: adding-a-server-option
description: Use when adding, renaming, removing or changing a Parse Server configuration option in src/Options/, when wiring an option's environment variable or default, when a nested option group's env vars are not being picked up, or when the Check Definitions CI job fails with "Definitions files cannot be updated manually".
---

# Adding a Parse Server option

## Overview

Adding an option is the most repeated code change in this repository — `src/Options/Definitions.js`, `src/Options/index.js` and `src/Options/docs.js` are the three highest-churn files in `src/` by a wide margin. It is also more than a one-line edit: one file is hand-written, two are generated, one type definition is hand-maintained against the trend of every other file in `types/`, and CI verifies you ran the generator.

**The core rule: `src/Options/index.js` is the only source of truth you edit. Everything else about the option is either generated from it or validated against it.**

## Quick reference

```bash
npm run definitions          # regenerate Definitions.js + docs.js from index.js
npm run ci:definitionsCheck  # what CI runs — regenerates and diffs, fails on mismatch
npm run docs                 # jsdoc, output in /out
npm run build:types          # regenerate types/ — does NOT cover types/Options/index.d.ts
```

## The procedure

### 0. Check that it does not already exist

Options accumulate, and one often already covers more ground than its name suggests. Before drafting a new one:

```bash
grep -n "yourConcept\|relatedWord" src/Options/index.js   # is there an existing option?
grep -rn "existingOption" src/                            # what does it actually govern?
```

Read the *call sites*, not just the name. `maxUploadSize`, for example, reads as a file-upload limit but is also the `limit` passed to the general `express.json` body parser in `src/ParseServer.ts`, so it already bounds every request body. An option that duplicates or overlaps an existing one is worse than no option: users now have two knobs whose interaction nobody has defined.

If an existing option covers the need, the change is to its documentation or its call sites, not a new option. If it *nearly* covers it, decide deliberately between widening the existing one (which may be a breaking change — see [changing-behaviour-safely](../changing-behaviour-safely/SKILL.md)) and adding a genuinely independent one.

### 1. Define the option in `src/Options/index.js`

This is a Flow interface. The **leading block comment becomes the help text**, and two directives inside it drive generation:

```js
export interface ParseServerOptions {
  /* Whether to enable the thing. Explain what it does and when to use it.
  :DEFAULT: false */
  enableTheThing: ?boolean;
}
```

- `:DEFAULT: <value>` sets the default. Omit it for an option with no default.
- `:ENV: <NAME>` overrides the environment variable name. Usually unnecessary — the name is derived from the interface's prefix plus the key.

Write the help text properly: it is what users read in the CLI and on the docs site.

### 2. If it is a nested option group, register it

An option whose value is an object (like `security`, `pages`, `fileUpload`) is a **nested option group**, declared as its own interface. Two registries in `resources/buildConfigDefinitions.js` must know about it:

- `nestedOptionTypes` — the interface's type name, e.g. `'RequestComplexityOptions'`
- `nestedOptionEnvPrefix` — its env var prefix, e.g. `RequestComplexityOptions: 'PARSE_SERVER_REQUEST_COMPLEXITY_'`

**Skipping this silently breaks environment-variable support for the entire group.** Nothing fails; the env vars simply never resolve. This is the quietest failure in the whole workflow.

### 3. Generate

```bash
npm run definitions
```

This runs `resources/buildConfigDefinitions.js` and prettifies the result, regenerating **`src/Options/Definitions.js`** (the env/default/parser/help map the CLI and env loader consume) and **`src/Options/docs.js`** (the JSDoc mirror).

**Never hand-edit either file.** `Definitions.js` opens with a `GENERATED CODE` banner; `docs.js` carries no marker at all, so there is nothing in the file itself to stop you — treat both as generated regardless. `ci/definitionsCheck.js` reads them, re-runs `npm run definitions`, and compares — any difference fails the Check Definitions job with:

> Definitions files cannot be updated manually. Please update src/Options/index.js then run `npm run definitions` to generate definitions.

If you see that error, you either edited a generated file or forgot to commit the regenerated output. The fix is the same either way: revert the generated files, edit `index.js`, re-run, commit all three.

### 4. Validate the value in `src/Config.js`

An invalid value must make the server throw **at launch**, not misbehave at request time. Add a static validator and call it from `Config.validateOptions`:

```js
static validateMaxLimit(maxLimit) {
  if (maxLimit <= 0) {
    throw 'Max limit must be a value greater than 0.';
  }
}
```

Follow the existing conventions in that file: validators are static, throw a plain descriptive string, and are invoked from the `validateOptions` list. Group validators (`validateSecurityOptions`, `validateSchemaOptions`) return early on `null` rather than throwing when the whole group is absent.

Add a spec for the validation — both the accepted and the rejected value.

### 5. Update `types/Options/index.d.ts` **by hand**

This is the trap. Every other file in `types/` is generated by `npm run build:types` and must not be touched, but `types/Options/index.d.ts` carries the marker:

```
// This file is manually updated to match src/Options/index.js until typed
```

It is the exact inverse of the rule you apply everywhere else, and `npm run build:types` will not do it for you. CONTRIBUTING documents the exemption under "TypeScript Tests", but omits it from the "Parse Server Configuration" procedure you would actually be following, so it is easy to work through that checklist and never learn about it. Miss it and TypeScript consumers cannot see the new option.

### 6. Ask whether the option needs a security check

**If a misconfiguration of this option can weaken a deployment, it needs a security check** — this is required by CONTRIBUTING, not optional. Checks live in `src/Security/CheckGroups/`.

- Add a `Check` to the fitting group (`CheckGroupServerConfig.js`, `CheckGroupDatabase.js`), or create a new `CheckGroup<Category>.js` and export it from `src/Security/CheckGroups/CheckGroups.js`.
- A `Check` takes `{ title, warning, solution, check }`, where `check()` returns normally to pass and throws to fail.
- Add **both** a passing and a failing case to `spec/SecurityCheckGroups.js`.
- Wording rules are strict: the `title` states a **positive hypothesis** ("Users are created without public access") with no trailing period; `warning` and `solution` are full sentences ending in a period; no pronouns; and **never put a key, secret or other sensitive value in a check**, because the report can be logged and exposed.

### 7. Docs and the local gate

```bash
npm run build                # REQUIRED before docs — see below
npm run docs                 # then review the formatting in /out
npm run ci:definitionsCheck  # must pass before you push
npm run lint
```

**`npm run docs` reads `lib/`, not `src/`.** `jsdoc-conf.json` lists `./lib/Options/docs.js` in its `source.include`, and there is no `predocs` hook, so running it straight after `npm run definitions` renders the *previous* build and your new option is simply absent. This is the same stale-`lib/` trap that governs the specs — build first, in both cases.

Then run the specs per [testing-parse-server](../testing-parse-server/SKILL.md), which load `lib/` for the same reason.

## Changing an existing option

Adding a new option is additive and safe. **Changing an existing one usually is not.** Renaming it, removing it, or changing its default alters behaviour for every deployment that upgrades, which is a breaking change and follows the deprecation pattern instead — see [changing-behaviour-safely](../changing-behaviour-safely/SKILL.md).

The `requestComplexity.*` and `readOnlyMasterKeyIps` entries in `src/Deprecator/Deprecations.js` are the worked examples: a safer default introduced as a deprecation warning first, with the old behaviour left in place for a full major release.

## Red flags

- Adding an option without checking whether an existing one already covers it.
- Editing `src/Options/Definitions.js` or `src/Options/docs.js` directly — CI will catch it, but you have already wasted the round trip.
- Running `npm run definitions` and not committing the regenerated files.
- Adding a nested group without touching `resources/buildConfigDefinitions.js` — env vars silently do nothing.
- Assuming `npm run build:types` covers `types/Options/index.d.ts`. It does not.
- Adding an option that loosens a default, or lets a deployment be misconfigured into weakness, without asking whether it needs a security check.
- No validation, so a bad value fails at request time rather than at launch.
- Changing an existing option's default and calling it a feature.

## Common mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| New option duplicates an existing one | Two knobs with undefined interaction | Grep `src/Options/index.js` and the call sites first |
| Hand-edit a generated file | `ci:definitionsCheck` fails | Edit `index.js`, run `npm run definitions` |
| Forget to commit regenerated output | Same CI failure, less obvious | Commit all three Options files together |
| Nested group not registered | Env vars for the whole group silently ignored | Add to `nestedOptionTypes` and `nestedOptionEnvPrefix` |
| Skip `types/Options/index.d.ts` | Option invisible to TypeScript users | Hand-edit it; it is the one manual `.d.ts` |
| No `Config.js` validation | Invalid config fails late and confusingly | Static validator called from `validateOptions` |
| Security-relevant option, no check | Weak deployments go unwarned | Add a `Check`, with a pass and a fail spec |
| Secret or key inside a security check | Sensitive data in an exposable report | Never reference secret values in a check |
| Change a default in place | Silent breaking change on upgrade | Deprecate first, see `changing-behaviour-safely` |
