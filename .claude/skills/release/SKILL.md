---
name: release
description: >-
  Cut a new release of the ai-usagebar GNOME Shell extension: bump the version,
  write the CHANGELOG entry, commit, tag, and push. Use this whenever the user
  asks to "release", "cut a release", "ship a new version", "publish", "bump the
  version", "tag a release", "do a 1.x release", or otherwise prepare a versioned
  release of this extension, even if they don't name every step. The skill
  always asks first whether it's a major, minor, or patch bump, then drives the
  whole release end to end and confirms before pushing anything to the remote.
---

# Release a new ai-usagebar version

This extension's release touches **two version fields, a changelog, a commit, and
an annotated tag**, then pushes both the commit and the tag. The tag push
triggers `.github/workflows/release.yml`, which re-runs the CI gates, packs the
zip, and publishes the GitHub release, the only distribution channel (the
extension is not on extensions.gnome.org). That workflow fails if the tag does
not match `version-name` in `metadata.json`, so follow the steps in order and
confirm the numbers before anything irreversible.

The push at the end is the only hard-to-undo step; everything before it is local
and safe to redo. Treat the work before the push as freely revisable, and stop
for an explicit OK at the push gate.

## Step 0: Preflight (never release a broken or dirty tree)

Run these and stop if any fails; a release should snapshot a known-good state:

1. **Right branch, clean tree, synced with remote.** Confirm you're on `main`
   with `git status`. If there are uncommitted changes, surface them and ask
   whether to commit, stash, or abort; don't bundle stray edits into the release
   commit. Run `git fetch` and make sure `main` isn't behind `origin/main`.
2. **CI gates pass locally.** These mirror the gates in `release.yml`; a tag
   that fails any of them is pushed but never gets a release:
   ```bash
   make test && make lint && make eslint && make validate && make i18n-check && make pack
   ```
   `make eslint` needs `npm ci` once; `make pack` leaves a gitignored zip behind.
   If any fails, report the failure and stop. Don't tag over red.

## Step 1: Ask the bump type (always, even if the user hinted one)

Ask the user whether this is a **major**, **minor**, or **patch** release, and
show what each does from the *current* `version-name` so there's no ambiguity
(read it from `metadata.json` first). For example, from `1.0.1`:

- **patch** → `1.0.2`: bug fixes only, no new features or behavior changes
- **minor** → `1.1.0`: new features, backwards-compatible
- **major** → `2.0.0`: breaking changes (e.g. dropped vendor, schema change,
  changed defaults users relied on)

If the user already said e.g. "ship a patch", confirm the resulting number rather
than re-asking from scratch. Recommend a level based on what's actually in the
unreleased commits (see Step 3) if they're unsure; that's the honest signal.

## Step 2: Bump the version

Use the bundled helper; it computes the new semver, increments the GNOME integer
(`version` field, always +1, kept monotonic by convention), and keeps
`metadata.json`'s formatting intact:

```bash
python3 .claude/skills/release/scripts/bump.py <major|minor|patch>          # dry run, review numbers
python3 .claude/skills/release/scripts/bump.py <major|minor|patch> --write   # apply
```

Leave `package.json` alone; its version is unused for the extension. Do **not**
hand-edit `metadata.json`; the script avoids fat-fingering the integer or the
JSON shape.

## Step 3: Draft the CHANGELOG entry

The changelog follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Draft the new section from the commits since the last release, then let the user
edit it; the commit log is the raw material, not the final prose.

1. Find the range and read the commits:
   ```bash
   git describe --tags --abbrev=0          # last release tag, e.g. v1.0.1
   git log <last-tag>..HEAD --pretty='%s%n%b'
   ```
2. Group them into Keep-a-Changelog sections, ordered **Added, Changed,
   Deprecated, Removed, Fixed, Security** (include only the non-empty ones). Use
   conventional-commit prefixes as a guide, not gospel; write for users, not for
   git:
   - `feat:` → **Added** (or **Changed** if it alters existing behavior)
   - `fix:` → **Fixed**
   - `refactor:` / `chore:` / `style:` / `test:` → usually omit; these are
     invisible to users. Include only if user-visible.
   - removals → **Removed**; security fixes → **Security**
3. Rewrite each line as a user-facing sentence (what changed for *them*), not the
   raw commit subject. Match the existing entries' voice: present-tense,
   descriptive, wrapped at a sensible width.
4. Insert the new section into `CHANGELOG.md` **directly below the preamble and
   above the previous version**, dated with today's real date:
   ```bash
   date +%F      # use this exact value; don't assume the date
   ```
   Heading format must match exactly: `## [<version-name>] - <YYYY-MM-DD>`;
   `release.yml` copies everything under that heading into the GitHub release
   body.
5. **Show the drafted entry to the user and ask them to confirm or edit it**
   before moving on. This is the one part that needs human judgment.

## Step 4: Commit

Stage only the release artifacts and commit with the repo's convention:

```bash
git add metadata.json CHANGELOG.md
git commit -m "chore(release): v<version-name>"
```

End the commit body with the standard co-author trailer if this project uses one
(check recent history). Don't include unrelated files.

## Step 5: Annotated tag

Tags here are **annotated** and named `v<version-name>`, matching `v1.0.0` /
`v1.0.1` (message style: `Release <version-name>`):

```bash
git tag -a v<version-name> -m "Release <version-name>"
```

Use `-a` (annotated), not a lightweight tag; annotated tags carry the author,
date, and message that release tooling and `git describe` expect.

## Step 6: Confirm, then push (the only irreversible step)

Show the user a summary before pushing:

- version-name: old → new, and the GNOME integer old → new
- the CHANGELOG section that will ship
- the commit subject and the tag name
- the exact commands you're about to run

Then **wait for an explicit go-ahead**. Once they confirm:

```bash
git push origin main
git push origin v<version-name>
```

A pushed tag is hard to retract cleanly (it may already be fetched by CI or
others), which is why this gate exists. If the user wants to back out *before*
this step, it's all local: `git tag -d`, `git reset --soft HEAD~1`, and re-run
the script; say so if they hesitate.

## Step 7: Confirm the GitHub release

The tag push starts the `Release` workflow, which creates the GitHub release
with the CHANGELOG section as its body plus the zip and its SHA256. Don't run
`gh release create` by hand; the workflow owns the release. Check that it
finished:

```bash
gh run list --workflow=release.yml --limit 1
gh release view v<version-name>
```

If the run failed, report the failing step. After a fix lands on `main`, the
tag has to move to the fixed commit before the workflow is re-run (`gh workflow
run release.yml -f ref=v<version-name>`); ask the user before moving a pushed
tag.

## Quick reference: the whole flow

```
preflight (branch/clean/synced + make test lint eslint validate i18n-check pack)
  → ask major/minor/patch
  → bump.py --write           (version-name + GNOME integer)
  → draft CHANGELOG, user confirms
  → git add metadata.json CHANGELOG.md && commit "chore(release): vX.Y.Z"
  → git tag -a vX.Y.Z -m "Release X.Y.Z"
  → SHOW SUMMARY, wait for OK
  → git push origin main && git push origin vX.Y.Z
  → check the Release workflow run + gh release view vX.Y.Z
```
