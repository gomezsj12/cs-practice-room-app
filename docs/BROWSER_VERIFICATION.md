# Browser Verification

Use one of these browser checks before handing over larger changes:

- `Playwright` for repeatable repo-local browser tests
- `Cursor browser MCP` for a quick live sanity check in a real browser tab

## When To Use Which

Use `Playwright` when:

- you want a repeatable smoke test
- you changed visible UI, routing, loading states, or form behavior
- Cursor browser tools are unavailable or unreliable in the current session

Use `Cursor browser MCP` when:

- you want a quick visual check in a live browser
- you want to inspect page snapshots, console messages, or network requests
- you want to confirm the app still behaves correctly after a larger change

Best practice: for bigger UI or behavior changes, run a Playwright check and also do a quick Cursor browser sanity pass when the MCP is available.

## Playwright Commands

Run the default smoke suite:

```bash
npm run test:e2e
```

Run headed Chromium locally:

```bash
npm run test:e2e:headed
```

Open Playwright UI mode:

```bash
npm run test:e2e:ui
```

Notes:

- `playwright.config.ts` starts `npm run dev` automatically
- the config reuses an existing local server when possible
- current smoke coverage lives in `e2e/home.spec.ts`

## Adding More Playwright Coverage

Add new specs in `e2e/` when a change affects:

- page navigation
- auth states
- support inbox flows
- booking or jam interactions
- regressions found during manual testing

Prefer stable assertions:

- check headings, links, buttons, and visible text that should persist
- avoid fragile assertions against short-lived loading states unless the test is specifically about loading behavior

## Cursor Browser MCP Workflow

Use this sequence when doing a live browser verification inside Cursor:

1. Start the app with `npm run dev`
2. Open or inspect tabs with `browser_tabs`
3. Navigate with `browser_navigate`
4. Inspect the page with `browser_snapshot`
5. If needed, inspect `browser_console_messages` and `browser_network_requests`
6. Unlock the browser when finished if it was locked for interaction
7. Stop the dev server when the check is done

Recommended checks after a substantial change:

1. Confirm the page loads and the title is correct
2. Confirm the primary heading or success state is visible
3. Confirm the main action buttons or links are present
4. Check console messages for unexpected runtime errors
5. Check network requests if the feature depends on API calls

## Cursor MCP Notes

- The browser MCP is usable from the parent Cursor agent session in this repo
- In this workspace, the local MCP cache may not show all browser tool descriptor files even though the tools still work
- If a subagent cannot access the browser tools, use the parent agent or fall back to Playwright
- If a browser tab is already on a `chrome-error://` page, navigate again after the dev server is running

## Hand-off Standard

Before handing over a substantial change, include:

- what browser check was run
- what page or flow was verified
- whether console or network inspection showed issues
- any gaps that still need local human testing
