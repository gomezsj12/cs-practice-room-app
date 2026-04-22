/**
 * Mark documented bearer/signing secrets as **Sensitive** in the linked Vercel
 * project (Vercel API `type: "sensitive"`), without changing names or values.
 *
 * Re-applies each current value via `vercel env update` stdin so non-interactive
 * mode succeeds. Idempotent for rows already `sensitive`.
 *
 * Prerequisites: `vercel link` and CLI auth for the target project.
 *
 * Usage (repo root): `node scripts/vercel-mark-env-sensitive.mjs`
 */
import { execSync, spawnSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

/** Keys that must use Vercel **Sensitive** (masked in dashboard; signing/API secrets). */
const VERCEL_SENSITIVE_KEYS = new Set([
  "AUTH_GOOGLE_SECRET",
  "AUTH_SECRET",
  "CRON_SECRET",
  "GOOGLE_PRIVATE_KEY",
  "NOTION_TOKEN",
  "NOTION_TOKEN_CALENDAR",
  "NOTION_TOKEN_PROFILE",
  "NOTION_WEBHOOK_VERIFICATION_TOKEN",
  "NOTION_WEBHOOK_VERIFICATION_TOKEN_CALENDAR",
  "NOTION_WEBHOOK_VERIFICATION_TOKEN_PROFILE",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
]);

function parseQuotedEnvFile(content) {
  const out = {};
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let raw = line.slice(eq + 1).trim();
    if (raw.startsWith('"') && raw.endsWith('"')) {
      try {
        out[key] = JSON.parse(raw);
      } catch {
        continue;
      }
    } else {
      out[key] = raw;
    }
  }
  return out;
}

/** Resolve `vercel` on Windows agents where `execFileSync("vercel")` lacks PATH. */
const shellOpt = { shell: true, cwd: root, env: process.env, maxBuffer: 50 * 1024 * 1024 };

function loadEnvList() {
  const out = execSync("vercel env list --format json", {
    ...shellOpt,
    encoding: "utf8",
  });
  const i = out.indexOf("{");
  if (i < 0) throw new Error("vercel env list: no JSON in output");
  return JSON.parse(out.slice(i));
}

function pullEnvFile(environment) {
  const pullPath = join(
    tmpdir(),
    `vercel-sensitive-pull-${environment}-${randomBytes(8).toString("hex")}.env`,
  );
  execSync(`vercel env pull "${pullPath.replace(/\\/g, "/")}" --environment ${environment} --yes`, {
    ...shellOpt,
    stdio: "inherit",
  });
  try {
    return parseQuotedEnvFile(readFileSync(pullPath, "utf8"));
  } finally {
    try {
      unlinkSync(pullPath);
    } catch {
      /* ignore */
    }
  }
}

function updateSensitive(key, environment, value) {
  const r = spawnSync(
    "vercel",
    ["env", "update", key, environment, "--sensitive", "--yes"],
    {
      ...shellOpt,
      input: value,
      encoding: "utf8",
      stdio: ["pipe", "inherit", "inherit"],
    },
  );
  if (r.status !== 0) {
    console.error("FAILED", key, environment, r.stderr || r.stdout || r.error);
    return r.status ?? 1;
  }
  console.log("ok", key, "->", environment, "(sensitive)");
  return 0;
}

const data = loadEnvList();
const tasks = [];
let skippedCombinedBindings = 0;

for (const row of data.envs ?? []) {
  if (row.type === "sensitive") continue;
  if (!VERCEL_SENSITIVE_KEYS.has(row.key)) continue;
  const targets = row.target ?? [];
  if (targets.includes("development") && targets.length > 1) {
    skippedCombinedBindings += 1;
    console.warn(
      "skip (split in Vercel to mark Sensitive):",
      row.key,
      "— one binding includes `development` with other envs; Sensitive is not allowed on development.",
    );
    continue;
  }
  for (const env of targets) {
    if (env === "development") continue;
    tasks.push({ key: row.key, env });
  }
}

if (tasks.length === 0) {
  if (skippedCombinedBindings > 0) {
    console.log(
      "Done: no further updates. Split combined bindings in the Vercel dashboard if you want those keys Sensitive on preview/production.",
    );
  } else {
    console.log("Nothing to do: all listed secrets are already type sensitive.");
  }
  process.exit(0);
}

const byEnv = new Map();
for (const t of tasks) {
  if (!byEnv.has(t.env)) byEnv.set(t.env, []);
  byEnv.get(t.env).push(t);
}

let code = 0;
for (const [environment, items] of byEnv) {
  const parsed = pullEnvFile(environment);
  const seen = new Set();
  for (const { key, env } of items) {
    const dedupe = `${key}\0${env}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const value = parsed[key];
    if (value === undefined) {
      console.error("missing in pull file:", key, env);
      code = 1;
      continue;
    }
    const c = updateSensitive(key, env, value);
    if (c !== 0) code = c;
  }
}

process.exit(code);
