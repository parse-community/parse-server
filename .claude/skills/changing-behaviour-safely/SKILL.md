---
name: changing-behaviour-safely
description: Use when changing or removing existing Parse Server behaviour - changing a default, renaming or removing an option, altering a response shape, error code, validation or ordering, changing stored data format, or judging whether a change is breaking and how to deprecate it.
---

# Changing behaviour safely

## Overview

Parse Server is not an application, it is a component in other people's stacks. Every behaviour change is paid for by every deployment that upgrades, and that cost is invisible from inside this repository.

CONTRIBUTING's argument against casual breakage is stronger than a style preference. It lists, among the effects of too many breaking changes:

> "upgrade fatigue" where developers run old versions of Parse Server because they cannot always attend to every update that contains a breaking change

> less secure Parse Server deployments that run on old versions which is contrary to the security evangelism Parse Server intends to facilitate for developers

That second point is the one to hold on to. A large share of this repository's ongoing work is fixing security vulnerabilities — `git log --oneline --since="12 months ago" --grep GHSA | wc -l` will tell you the current figure — and every one of those fixes only protects people who actually upgrade. A gratuitous breaking change strands users on the versions that still contain them. Backward compatibility *is* security work here.

**The default answer to "should this be a breaking change?" is no.** This skill is about proving otherwise and, if you do, making the transition survivable.

## Files in this skill

| File | Use it for |
|---|---|
| **[COMPATIBILITY.md](COMPATIBILITY.md)** | The surfaces that must stay consistent: client SDKs, version-gating with `ClientSDK`, REST/GraphQL/LiveQuery/batch parity, and existing stored data |
| **[DEPRECATING.md](DEPRECATING.md)** | The mechanism, once a change is justified: the option-plus-old-default pattern, `Deprecations.js`, `DEPRECATIONS.md`, timing, and the commit footer |

## Step 1 — Is it breaking?

Most of these are not obvious, which is why the list exists. A change is breaking if it alters any of:

| Category | Examples |
|---|---|
| **Response shape** | adding is usually safe; renaming, removing, re-typing or re-nesting a field is not |
| **Error codes** | a client matching on `Parse.Error.X` breaks when the code for a scenario changes. The message is safer to change than the code |
| **Defaults** | any option whose default value changes behaviour for someone who never set it |
| **Options** | renaming or removing one; also narrowing what values are accepted |
| **Validation** | newly rejecting input that previously worked, including stricter type or length checks |
| **Semantics under existing config** | same request, same config, different result |
| **Ordering and pagination** | sort tie-breaking, default `limit`, `skip` behaviour |
| **Stored data format** | anything an older or newer version then cannot read |
| **Timing and side effects** | a trigger that stops firing, fires twice, or fires in a different order |

If you are unsure, assume it is breaking and continue.

## Step 2 — Can it be avoided?

Work down this ladder and stop at the first rung that works. Only the last rung is a breaking change.

1. **Make it additive.** A new field, a new option, a new endpoint. Existing callers are unaffected.
2. **Put it behind a new option, defaulting to today's behaviour.** Users opt in. This is the pattern CONTRIBUTING actually prescribes, and it is the right answer far more often than it feels like it should be.
3. **Version-gate it.** If behaviour must differ for older clients specifically, `src/ClientSDK.js` already does this — see [COMPATIBILITY.md](COMPATIBILITY.md).
4. **Deprecate, then break** across a full major release — [DEPRECATING.md](DEPRECATING.md).

The policy bar for the last rung, from `CONTRIBUTING.md` §"Breaking Changes": the benefits must **clearly** outweigh the cost of every developer adapting their deployment, and **a merely cosmetic breaking change will likely be rejected** — naming and tidiness improvements are expected to become obsolete organically instead.

Before proposing a break, be able to answer:

- Who is broken, and what exactly do they have to do to recover?
- Is there an additive or opt-in form that gets most of the benefit?
- Is this cosmetic? If so, stop.
- Is it a security fix? Then a break may be justified, but even here CONTRIBUTING prefers a deprecation where one is possible.

## Step 3 — Check the surfaces

A change is not just its call site. Work [COMPATIBILITY.md](COMPATIBILITY.md): client SDKs and error codes, the REST/GraphQL/LiveQuery/batch equivalents, and the data already sitting in deployments' databases.

## Step 4 — Deprecate properly

If the break is justified, [DEPRECATING.md](DEPRECATING.md) is the mechanism. The single most important part: **the warning ships first and the behaviour does not change yet.**

## Red flags

- "It is more consistent this way" — cosmetic. Likely rejected.
- "Nobody could be relying on that" — you cannot know that; deployments are private and numerous.
- "It is technically a bug fix, so compatibility does not apply" — if it changes what working deployments observe, it is breaking regardless of which behaviour was intended.
- "I will change the default and mention it in the changelog" — that is the thing the deprecation policy exists to prevent.
- Adding a deprecation warning *and* the new behaviour in the same release.
- Changing REST without checking GraphQL, LiveQuery and `/batch`.
- Changing an error code because a different one reads better.
- Changing what gets written to the database without asking what happens to data already written.
- Removing a legacy branch because it "looks dead" — in this codebase those are frequently live guards for old stored data. See `testing-parse-server/GOTCHAS.md`.

## Common mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Treating a default change as non-breaking | Silent behaviour change on upgrade | Deprecate with the old default retained |
| Renaming a response field | Every SDK and client app breaks | Add the new field, deprecate the old |
| Changing an error code | Clients matching on it break silently | Keep the code, change the message |
| Fixing REST only | Surfaces diverge; the inconsistency is itself breaking | Apply to GraphQL, LiveQuery and `/batch` |
| Warning and behaviour in one release | Deprecation gives users no time | Warning first, break a full major later |
| Forgetting `DEPRECATIONS.md` | The plan is untracked; nothing enforces it | Add the ledger entry |
| No `BREAKING CHANGE` footer | semantic-release does not bump major | Add the literal footer line |
| Removing a legacy-data code path | Old stored data becomes unreadable | Prove it is unreachable for old data first |
