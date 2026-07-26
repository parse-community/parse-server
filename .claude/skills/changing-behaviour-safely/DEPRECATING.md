# Deprecating

Reach this file only once a change is justified and cannot be made additive or opt-in (see [SKILL.md](SKILL.md)).

---

## The required pattern

From `CONTRIBUTING.md` §"Deprecation Policy", in order:

1. **Make the new feature or change optional**, adding a Parse Server option for it if necessary.
2. **Default to existing behaviour**, so an unchanged deployment behaves exactly as before.
3. **Add a deprecation warning** that fires at launch.

**The behaviour does not change in the release that adds the warning.** Shipping the warning and the new default together is precisely the failure this policy exists to prevent — users get told about a change they have already been subjected to.

---

## Static or runtime?

**Static** — anything expressible as a Parse Server option: a declarative entry in `src/Deprecator/Deprecations.js`, scanned at launch.

**Runtime** — anything only detectable while serving a request, such as a Parse Query syntax that is going away. Call at the site where the deprecated usage is detected:

```js
Deprecator.logRuntimeDeprecation({ usage: '...', solution: '...' });
```

Using one where the other belongs is called out as incorrect. If it is an option, it is static.

---

## The `Deprecations.js` entry

Schema, per the file's own header comment:

| Key | Meaning |
|---|---|
| `optionKey` | The option including its path, e.g. `security.enableCheck` |
| `envKey` | The environment variable, e.g. `PARSE_SERVER_SECURITY` |
| `changeNewKey` | The replacement key name, or `''` if it is being removed with no replacement |
| `changeNewDefault` | The default value it will change to in a future version |
| `solution` | What the user should do. Optional |

```js
{
  optionKey: 'requestComplexity.includeDepth',
  changeNewDefault: '10',
  solution: "Set 'requestComplexity.includeDepth' to a positive integer appropriate for your app to limit include pointer chain depth, or to '-1' to disable.",
},
```

Rules that are easy to get wrong:

- **`solution` must not restate that the option is deprecated.** That sentence is composed automatically by `Deprecator._logOption`; your text is the *additional* instruction only. Writing "This option is deprecated and will be removed…" produces a duplicated, awkward warning.
- Use `changeNewDefault` for "the default is changing" and `changeNewKey` for "this key is being renamed or removed". They drive different warnings and different trigger conditions — `changeNewDefault` warns when the option is *unset*, `changeNewKey` warns when it *is* set.
- `readOnlyMasterKeyIps`, `mountPlayground` and the `requestComplexity.*` entries are the current reference examples of each shape.

**Ordering constraint worth knowing:** `Deprecator.scanParseServerOptions` runs *before* defaults are applied, which is what lets it tell "the user set this" apart from "this defaulted". A refactor that moves default assignment earlier silently breaks detection without failing anything.

---

## The ledger

Add the deprecation to **`DEPRECATIONS.md`** at the repo root. The table columns are: ID (`DEPPS<n>`, incrementing), Change, Issue (linked issue or PR), Deprecation (version and year, e.g. `5.0.0 (2022)`), Planned Change (version and year), Status (`deprecated` / `changed` / `retracted`), and Notes (`-` if none).

Nothing in CI checks this, so it rots silently. It is also the document `CONTRIBUTING`'s "Preparing Release" step reads when deciding which breaking changes are due, so an unrecorded deprecation tends to simply never happen.

---

## Timing

A deprecation must be warned about for **at least one entire previous major release** before the break. CONTRIBUTING's worked example:

- `4.5.0` — current
- `4.6.0` — adds the optional new behaviour and the deprecation warning
- `5.0.0` — warns for the whole of major 5
- `6.0.0` — the breaking change lands

Major versions increment yearly, so this is a real wait. Plan for the break to be executed by someone else, later, reading only your `DEPRECATIONS.md` row — write it so that is enough.

---

## Landing the eventual break

When the deprecation period has elapsed:

- The commit message needs a literal **`BREAKING CHANGE`** line, capitalised and unformatted, with a short description. semantic-release keys the major version bump off it.
- Per CONTRIBUTING, the **PR title must not restate that it is breaking** — the footer carries that, and duplicating it produces a bad changelog entry.
- Update the `DEPRECATIONS.md` row's status to `changed`.
- Remove the deprecation entry from `Deprecations.js` along with the old code path.
