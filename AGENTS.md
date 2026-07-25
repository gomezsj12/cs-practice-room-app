<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes: APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Testing (agent preference)

- **Bias toward small, custom tests** for localized behavior (pure helpers, API request/response shapes, Notion payload builders, etc.) using whatever fits the repo once added (e.g. Vitest, Node `node:test`, or a **narrow** Playwright file that targets one flow).
- **Do not treat `npm run test:e2e` as the default check** for a small change: the full suite is slow, environment-sensitive (multi-browser, screenshots), and **does not assert specifics** unless a spec is written narrowly for that behavior.
- After adding focused tests, still run **`npm run build`** (and fix **`eslint`** issues in files you touch). Use the full e2e suite when the change is broad UI/navigation or when explicitly requested.
