# Cursor / agent settings (this repo)

This file documents expectations for AI agents and for humans working in Cursor. **`settings.json` in this folder** holds editor/plugin JSON; **behavior rules** for agents live here and in `.cursor/rules/` (`*.mdc`).

## Git commits (required)

**Do not create git commits until the project owner has tested the changes on localhost and explicitly asked you to commit.**

Typical flow:

1. Implement or fix on a branch / working tree as needed.
2. **Run `npm run dev`** in the project terminal when you are done with that batch of changes (see **Local dev server** below), so localhost is ready.
3. **Prompt the project owner for feedback** — ask them to try the app and tell you what works or what still feels wrong before you move on or commit.
4. Wait for them to confirm local testing.
5. Only then **`git add` / `git commit`** when they ask (or when they say the change is approved to commit).

Same idea for **`git push`**: only when they ask, unless they have said otherwise for a specific task.

## Local dev server after changes

**After completing code changes for the current task**, start the app with **`npm run dev`** in the terminal for this repo (from the project root). That way the project owner can open the local URL and test right away.

- Follow [`.cursor/rules/dev-server-cleanup.mdc`](./rules/dev-server-cleanup.mdc): if a dev server is already running for this repo, don't start a second one; stop the old process first if you need a clean restart.
- If the change is documentation-only or cannot affect runtime, say so and **skip** starting the server.

## Ask for feedback

When you finish a change that should be verified in the browser, **explicitly prompt the owner for feedback** — for example, what to click or look for, then invite them to reply with what they see or any issues. Do not assume silence means success.

## Documentation protocol

Follow [`.cursor/rules/documentation-protocol.mdc`](./rules/documentation-protocol.mdc) after all substantive work.

**MOST IMPORTANT — change-log:** You MUST update `docs/change-log.md` with a new row every time you create a git commit. Include it in the same commit. This is a hard requirement — see [`.cursor/rules/change-log.mdc`](./rules/change-log.mdc).

Other documentation updates:
- **After error fixes**: Update `docs/error-log.md`
- **After UI changes**: Update `docs/ui-lookbook.md` + component comments
- **After architecture changes**: Update `docs/ARCHITECTURE.md` + file-level JSDoc
- **After any code change**: Update in-code JSDoc and inline comments if behavior changed

See `docs/README.md` for the full list of documentation files and their purposes.

## Related files

- [`settings.json`](./settings.json) — plugin config and short reminders.
- [`rules/collaboration.mdc`](./rules/collaboration.mdc) — plain-language collaboration style.
- [`rules/change-log.mdc`](./rules/change-log.mdc) — when to update `docs/change-log.md` after a commit.
- [`rules/documentation-protocol.mdc`](./rules/documentation-protocol.mdc) — full documentation update protocol.
- [`rules/browser-verification.mdc`](./rules/browser-verification.mdc) — browser verification before hand-off.
- [`rules/dev-server-cleanup.mdc`](./rules/dev-server-cleanup.mdc) — dev server management.
