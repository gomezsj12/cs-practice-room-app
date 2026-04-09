# Documentation

## Documentation files

| File | Purpose |
| --- | --- |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Tech stack, file map, data flow, environment variables, system design, and notes for working on the project. |
| [change-log.md](./change-log.md) | Full project history: pre-Cursor jam reservation app commits + CS Practice Room commits, with attribution and anti-regression table. |
| [error-log.md](./error-log.md) | Error history with root causes, fixes applied, and prevention notes. Add new entries when bugs are fixed. |
| [ui-lookbook.md](./ui-lookbook.md) | Visual documentation of every UI page, state, and interaction. Desktop + mobile screenshots with full-page scrolling. |
| [code-audit.md](./code-audit.md) | Code redundancy and efficiency findings with risk levels and implementation status. |
| [CODE_REVIEW.md](./CODE_REVIEW.md) | Code review process, checklists, anti-patterns, and session records. Start here if you are a code reviewer. |
| [BUILD_PHASES.md](./BUILD_PHASES.md) | Original build plan for forking the jam scheduler into the portal app (historical reference). |
| [BROWSER_VERIFICATION.md](./BROWSER_VERIFICATION.md) | Browser testing procedures using Playwright and Cursor MCP tools. |

## How documentation stays current

Cursor agents follow the documentation protocol in `.cursor/rules/documentation-protocol.mdc`:

- **After commits** → update `change-log.md`
- **After error fixes** → update `error-log.md`
- **After UI changes** → update `ui-lookbook.md` + component comments
- **After architecture changes** → update `ARCHITECTURE.md` + file-level JSDoc
- **After any code change** → update in-code JSDoc and inline comments if the change affects documented behavior

## For code reviewers

Read [CODE_REVIEW.md](./CODE_REVIEW.md) first. It contains the phased review process, verification checklists, anti-patterns to watch for, and records of past review sessions.

## Legacy note

The former root-level `CODEBASE.md` has been replaced by `docs/ARCHITECTURE.md`.
