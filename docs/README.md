# Documentation

## Documentation files

| File | Purpose |
| --- | --- |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Tech stack, file map, data flow, environment variables, system design, and notes for working on the project. |
| [change-log.md](./change-log.md) | Full project history: pre-Cursor jam reservation app commits + CS Practice Room commits, with attribution and anti-regression table. **Gitignored** locally; enable [`.githooks/README.md`](../.githooks/README.md) so `post-commit` appends Part 2 rows. |
| [error-log.md](./error-log.md) | Error history with root causes, fixes applied, and prevention notes. Add new entries when bugs are fixed. |
| [ui-lookbook.md](./ui-lookbook.md) | Visual documentation of every UI page, state, and interaction. Desktop + mobile screenshots in `screenshots/`. |
| [CODE_REVIEW.md](./CODE_REVIEW.md) | Code review process, checklists, and anti-patterns. Start here if you are a code reviewer. |
| [user-guide.md](./user-guide.md) | End-user guide covering all four app pages with annotated screenshots in `guide-screenshots/`. |
| [admin-guide.md](./admin-guide.md) | Staff/admin guide covering admin-only features and Telegram integration. |
| [BUILD_PHASES.md](./BUILD_PHASES.md) | Original build plan for forking the jam scheduler into the portal app (historical reference). |
| [BROWSER_VERIFICATION.md](./BROWSER_VERIFICATION.md) | Browser testing procedures using Playwright and Cursor MCP tools. |

## How documentation stays current

Cursor agents follow the documentation protocol in `.cursor/rules/documentation-protocol.mdc`:

- **After commits** → `post-commit` updates local `change-log.md` (or append manually if hooks are off)
- **After error fixes** → update `error-log.md`
- **After UI changes** → update `ui-lookbook.md` + component comments
- **After architecture changes** → update `ARCHITECTURE.md` + file-level JSDoc
- **After any code change** → update in-code JSDoc and inline comments if the change affects documented behavior

## For code reviewers

Read [CODE_REVIEW.md](./CODE_REVIEW.md) first. It contains the phased review process, verification checklists, anti-patterns to watch for, and records of past review sessions.

## Legacy note

The former root-level `CODEBASE.md` has been replaced by `docs/ARCHITECTURE.md`.
