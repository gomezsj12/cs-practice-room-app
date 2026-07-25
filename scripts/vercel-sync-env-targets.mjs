/**
 * One-off: copy app env values from `vercel env pull` output into Preview and
 * Development targets. Run from repo root after:
 *   vercel env pull .env.vercel.pull --environment=production --yes
 *
 * Bearer/signing secrets use `vercel env add … --sensitive` on **Preview** only;
 * Vercel disallows Sensitive on the **Development** target.
 *
 * Does not commit secrets; `.env*` is gitignored.
 */
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { spawnSync, execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const pullPath = join(root, ".env.vercel.pull");

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

const allowed = new Set([
  "ADMIN_EMAIL",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "AUTH_SECRET",
  "ENABLE_TEMP_HOLDS",
  "FILLOUT_URL",
  "GOOGLE_CLIENT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
  "GOOGLE_PROJECT_ID",
  "JAM_CALENDAR_ID",
  "NEXT_PUBLIC_FILLOUT_URL",
  "NEXT_PUBLIC_TELEGRAM_GROUP_URL",
  "NOTION_DATA_SOURCE_ID",
  "NOTION_FILLOUT_MASTER_DATA_SOURCE_ID",
  "NOTION_PEOPLE_DB_ID",
  "NOTION_PROFILE_LOG_DB_ID",
  "NOTION_TOKEN",
  "NOTION_WWU_QUARTERS_DATA_SOURCE_ID",
  "CRON_SECRET",
  "PRACTICE_CALENDAR_ID",
  "ROOM_TIME_ZONE",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_SUPPORT_ADMIN_CHAT_ID",
  "TELEGRAM_WEBHOOK_SECRET",
]);

/** Same keys as `vercel-mark-env-sensitive.mjs`: Vercel Sensitive (dashboard-masked). */
const vercelSensitiveKeys = new Set([
  "AUTH_GOOGLE_SECRET",
  "AUTH_SECRET",
  "CRON_SECRET",
  "GOOGLE_PRIVATE_KEY",
  "NOTION_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
]);

/** Multi-environment row already includes preview + development */
const skipKeys = new Set(["NOTION_WEBHOOK_VERIFICATION_TOKEN"]);

/**
 * Production canonical URL breaks OAuth on preview/dev if copied verbatim.
 * Rely on `trustHost` + request host unless you set branch-specific URLs in the dashboard.
 */
const skipForNonProduction = new Set(["AUTH_URL"]);

function addToTarget(key, value, target) {
  /** Vercel does not allow Sensitive on the `development` target; preview/production only. */
  const sensitive =
    target !== "development" && vercelSensitiveKeys.has(key) ? " --sensitive" : "";
  if (target === "preview") {
    const tmp = join(tmpdir(), `vercel-env-${randomBytes(8).toString("hex")}.txt`);
    writeFileSync(tmp, value, "utf8");
    const tmpForSh = tmp.replace(/\\/g, "/");
    try {
      execSync(
        `vercel env add ${shellQuote(key)} preview${sensitive} --yes --force "" < ${shellQuote(tmpForSh)}`,
        {
          cwd: root,
          shell: true,
          stdio: "inherit",
          maxBuffer: 20 * 1024 * 1024,
          env: process.env,
        },
      );
    } catch {
      console.error(key, "preview", "FAILED");
      try {
        unlinkSync(tmp);
      } catch {
        /* ignore */
      }
      return 1;
    }
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    console.log("ok", key, "->", "preview");
    return 0;
  }

  const useSensitive = target !== "development" && vercelSensitiveKeys.has(key);
  const addArgs = useSensitive
    ? ["env", "add", key, target, "--sensitive", "--yes", "--force"]
    : ["env", "add", key, target, "--yes", "--force"];
  const r = spawnSync("vercel", addArgs, {
    shell: true,
    input: value,
    encoding: "utf8",
    cwd: root,
    maxBuffer: 20 * 1024 * 1024,
    env: process.env,
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (r.status !== 0) {
    console.error(key, target, "FAILED", r.error || r.stderr || r.stdout);
    return r.status;
  }
  console.log("ok", key, "->", target);
  return 0;
}

function shellQuote(p) {
  if (!/[^\w@%+=:,./-]/i.test(p)) {
    return p;
  }
  return `'${String(p).replace(/'/g, `'\\''`)}'`;
}

const env = parseQuotedEnvFile(readFileSync(pullPath, "utf8"));
let code = 0;

const arg = process.argv[2];
const targets =
  arg === "development"
    ? ["development"]
    : arg === "preview"
      ? ["preview"]
      : ["preview", "development"];

for (const target of targets) {
  for (const key of allowed) {
    if (skipKeys.has(key) || skipForNonProduction.has(key)) continue;
    const value = env[key];
    if (value === undefined) {
      console.error("missing in pull file:", key);
      code = 1;
      continue;
    }
    const c = addToTarget(key, value, target);
    if (c !== 0) code = c;
  }
}

process.exit(code);
