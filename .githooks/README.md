# Git hooks (optional)

## Change log (`docs/change-log.md`)

`docs/change-log.md` is **gitignored** — each clone keeps its own running Part 2 history.

After you enable hooks, **`post-commit`** runs `scripts/append-change-log-row.mjs`, which appends a Part 2 table row for `HEAD` using the commit subject and short hash.

**Enable once per clone** (repo-local, not global):

```bash
git config core.hooksPath .githooks
```

To skip the hook for one commit: `git commit --no-verify` (the change log will not auto-append for that commit).

Override the attribution column: `CHANGE_LOG_ATTRIBUTION="Cursor agent" git commit …`

## New machine without `change-log.md`

Copy the file from another workstation, or recover the last tracked version from git history:

```bash
git show d8488ed:docs/change-log.md > docs/change-log.md
```

(Use any commit hash from before `docs/change-log.md` was removed from the index, or ask the repo owner for a copy.)
