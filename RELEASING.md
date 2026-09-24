# Releasing

Push a tag. That is the whole process.

```bash
npm version patch          # or minor / major
git push origin main --follow-tags
```

`.github/workflows/release.yml` then:

1. Installs Node 22 and upgrades npm, and **asserts both version floors** (see below).
2. Runs `npm test`.
3. **Refuses if the tag and `package.json` disagree**, so a release cannot ship a version
   different from the one it claims.
4. Publishes.
5. Waits for the registry to actually serve the version, then prints the provenance
   attestation.

## There is no npm token

Authentication is npm **trusted publishing** (OIDC). The job proves it is this workflow in this
repo, and npm mints a short-lived credential for it. There is no `NPM_TOKEN` secret and nothing
in the workflow reads one.

This is deliberate: a publish token is a long-lived secret that works from anywhere, and the
one this package started with was disclosed. A credential that does not exist cannot leak.

If publishing ever fails with an auth error, the thing to fix is the trusted publisher
configuration on npmjs.com — not this file. It lives at **the package page → Settings →
Trusted Publisher** (the *package's* settings, not your account settings, which is why it is
easy to miss):

| Field | Value |
| --- | --- |
| Publisher | GitHub Actions |
| Organization or user | `Advance-Labs` |
| Repository | `human-machine-swapper` |
| Workflow filename | `release.yml` |
| Environment name | *(blank)* |

## Two packages, one repo

The tag picks the target:

| Tag | Publishes |
| --- | --- |
| `v1.2.0` | `human-machine-swapper` (repo root) |
| `create-v1.0.0` | `create-llms-txt` (`create-llms-txt/`) |

Each package needs **its own** trusted publisher entry on npmjs.com, both pointing at this
repo and `release.yml`.

## Trusted publishing cannot do a FIRST publish

Confirmed by trying it, because npm's docs do not say. Tagging `create-v1.0.0` for a package
that did not exist yet failed with:

```
npm error 404 Not Found - PUT https://registry.npmjs.org/create-llms-txt
```

There is no package for npm to match a trusted publisher against, and with no token in the
workflow there is no other credential. So the sequence for any NEW package is:

1. `npm login` in a real terminal, then `npm publish` from that package's directory, once.
2. Configure its trusted publisher on npmjs.com.
3. Every release after that is a tag, with no credential anywhere.

Do not paste a publish token into a chat window to shortcut step 1. That is how this
project's first token ended up disclosed and needing revocation.

## Trusted publishing needs Node ≥ 22.14.0 and npm ≥ 11.5.1

Node 20 fails **both** — it ships npm 10, which has never heard of OIDC. The failure surfaces
as a generic auth error mentioning neither version, so the workflow checks both by name and
fails with the real reason. **Do not drop `node-version` back to 20.**

## A green run does not mean it is published

npm answers before the registry serves the version: *"Your package is being processed and may
take a few minutes to become available."*

`1.0.1` still read as `1.0.0` for about a minute after a green run, and `1.0.2` took 11 poll
iterations. The workflow's last step waits for this, so a green run now does mean the version
is fetchable — but if you are checking by hand, poll the registry and **never re-run a release
on a stale read**:

```bash
npm view human-machine-swapper version
```

`npmjs.com/package/...` returns **403 to curl** — that is bot protection, not a missing
package. Use `registry.npmjs.org`.

## Verifying a release

```bash
npm audit signatures
curl -s "https://registry.npmjs.org/-/npm/v1/attestations/human-machine-swapper@<version>"
```

The attestation names the repository, workflow path, ref and commit. Check the commit matches
the tag you pushed. Provenance is a stronger claim than an integrity hash: a hash says the
bytes did not change in transit, the attestation says where they came from.

## The source lives in two places

`src/human-machine-swapper.js` here, and `web/public/hms/human-machine-swapper.js` in the
`advance-labs` repo, which serves it at `advancelabs.dev/hms/`. **Nothing enforces that they
match.** They are synced by hand today, so a change to one is a change to both.

The fix is for advance-labs to consume this package from npm and copy it in at build. Until
then, this is the trap most likely to bite.
